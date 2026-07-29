import {
  buildFateCandidateItemCatalog,
  validateFreeFateResponse,
  validateFateEvent,
} from './fate';
import { parseFirstAIJson } from './ai-json';
import { validateOriginProfile, type OriginWheels } from './origins';
import { recordTelemetry } from './telemetry';
import type {
  FateDirection,
  FateEvent,
  FateReward,
  FateResponse,
  FateSettlement,
  ItemId,
  LifeSnapshot,
  OriginKind,
  OriginProfile,
} from './types';

export type AIGenerationState = 'idle' | 'requesting' | 'gpt' | 'fallback' | 'error';
export type AIDiagnosticStatus =
  | 'idle'
  | 'calling'
  | 'streaming'
  | 'returned'
  | 'validated'
  | 'rejected'
  | 'unavailable'
  | 'timeout'
  | 'failed'
  | 'invalid_json'
  | 'empty_response'
  | 'aborted';

export interface AIDiagnostic {
  kind: keyof typeof AI_SYSTEM_PROMPTS | '';
  transport: 'platform' | 'dev' | 'none';
  status: AIDiagnosticStatus;
  detail: string;
  updatedAt: number;
}

let latestAIDiagnostic: AIDiagnostic = {
  kind: '',
  transport: 'none',
  status: 'idle',
  detail: '等待发起',
  updatedAt: Date.now(),
};

function publishAIDiagnostic(
  kind: keyof typeof AI_SYSTEM_PROMPTS,
  transport: AIDiagnostic['transport'],
  status: AIDiagnosticStatus,
  detail: string,
): void {
  latestAIDiagnostic = {
    kind,
    transport,
    status,
    // 平台报错里最关键的信息（上游 URL 之后的真实原因、错误码）常常排在很后面，
    // 96 字会正好砍在 URL 中间把原因吃掉。诊断只在失败页显示，放宽到 400 字。
    detail: detail.replace(/\s+/g, ' ').slice(0, 400),
    updatedAt: Date.now(),
  };
}

export function readAIDiagnostic(): AIDiagnostic {
  return { ...latestAIDiagnostic };
}

interface AIEnvelope {
  ok?: boolean;
  data?: unknown;
  model?: string;
  error?: string;
}

/**
 * 互动空间全链路统一模型；命运请求在战斗后台预生成。
 *
 * 2026-07-29 改用 lite：抖音互动中心那把令牌只能访问 pro / lite 两个模型
 * （1-6-flash、1-5-pro、2-0-flash 等一律 404，2-1-pro 是 403），所以可选项只有两个。
 * 本地合成测量给出的方向是矛盾的——简单提示词下 lite 更慢（43.0s vs pro 14.3s），
 * 长提示词下 lite 更快（37.8s vs pro 52.6s）——单次采样不足为据，改由真机验收裁决。
 * 两者都是推理模型，真正的加速杠杆仍是 thinking:{type:'disabled'}（pro 上实测
 * 52.6s → 13.0s），但平台是否透传该参数尚未验证。
 */
const PLATFORM_AI_MODELS = {
  origin: 'doubao-seed-2-0-lite-260428',
  default: 'doubao-seed-2-0-lite-260428',
} as const;

// doubao Seed 2.0 Pro 默认开深度思考，实测同一段 origin 提示词：思考开 52.6s、关掉 13.0s。
// 我们已经在请求里带上 thinking:{type:'disabled'}，但平台是否透传未知，上限按最慢路径留。
const ORIGIN_AI_TIMEOUT_MS = 100_000;

// 同一把抖音令牌实测（思考开、非流式）：fate 17.8s、fate-options 23.4s、fate-free 24.7s、
// fate-review 19.6s、fate-result 10.1s。原来的 10~20s 上限全部卡在采样值上下，必然抖动失败。
const FATE_AI_TIMEOUT_MS = 60_000;

/**
 * 人生总结在收灯人出现的那一刻就开始后台预生成，玩家走完终局时通常已经就绪，
 * 所以等待窗可以给得宽——它不占用任何前台时间（项目「无感加载」红线）。
 */
const LIFE_SUMMARY_TIMEOUT_MS = 90_000;

function platformModelFor(kind: keyof typeof AI_SYSTEM_PROMPTS): string {
  return kind === 'origin' ? PLATFORM_AI_MODELS.origin : PLATFORM_AI_MODELS.default;
}

/** 出生失败页要把实际请求的模型 ID 打给玩家看，用于区分平台故障与模型未开通。 */
/**
 * 这一局的人生封卷。在收灯人出现时由 game.ts 提前发起，结果缓存到结局页再显示。
 * 拿不到就返回 null——结局页有自己的固定文案兜底，绝不能因为总结没写出来就卡住。
 */
export async function generateLifeSummary(payload: unknown, signal?: AbortSignal): Promise<string | null> {
  try {
    const raw = await requestAI('life-summary', payload, LIFE_SUMMARY_TIMEOUT_MS, signal);
    if (!isRecord(raw) || typeof raw.text !== 'string') return null;
    const text = raw.text.trim().replace(/\s+/g, ' ');
    if (text.length < 60 || text.length > 260) return null;
    return text;
  } catch (error) {
    console.info('[AI] 人生封卷未生成', error instanceof Error ? error.message : error);
    return null;
  }
}

export function platformOriginModel(): string {
  return PLATFORM_AI_MODELS.origin;
}

/** 与 vite.config.ts 中的系统提示词保持一致；生产环境（tt 路径）在客户端拼装。 */
import { AI_SYSTEM_PROMPTS } from './ai-prompts';

interface TicAIChatOptions {
  type: 'text';
  model: string;
  stream: boolean;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  // 方舟层面 thinking:{type:'disabled'} 实测把 origin 从 52.6s 压到 13.0s。平台文档没把它
  // 写进 tt.callAIChatCompletion 的入参表（只说 temperature 按白名单透传），所以它很可能
  // 在平台侧被丢弃——那样也只是无效，不会更糟；真透传下去就直接绕开了超时。
  thinking?: { type: 'disabled' | 'enabled' | 'auto' };
  onSSE?: (event: { eventName: string; data: string }) => void;
  success?: (res: { errMsg: string; data: string }) => void;
  fail: (err: { errMsg: string; errorCode?: number; errorType?: string }) => void;
  complete?: () => void;
}

declare global {
  interface Window {
    tt?: { callAIChatCompletion?: (options: TicAIChatOptions) => void };
  }
}

function extractPlatformSSEText(data: string): string {
  const normalized = data.trim().replace(/^data:\s*/i, '');
  if (!normalized || normalized === '[DONE]') return '';
  try {
    const chunk = JSON.parse(normalized) as unknown;
    if (typeof chunk === 'string') return chunk;
    if (!chunk || typeof chunk !== 'object') return '';
    const record = chunk as Record<string, any>;
    const content = record.choices?.[0]?.delta?.content
      ?? record.choices?.[0]?.message?.content
      ?? record.delta?.content
      ?? record.content;
    return typeof content === 'string' ? content : '';
  } catch {
    // 平台也允许直接把文本片段放进 data；JSON 事件与纯文本两种格式都兼容。
    return normalized;
  }
}

/** 思考阶段 choices[].delta.content 为空，思考内容在 reasoning_content；只用于进度显示。 */
function extractPlatformSSEReasoning(data: string): string {
  const normalized = data.trim().replace(/^data:\s*/i, '');
  if (!normalized || normalized === '[DONE]') return '';
  try {
    const chunk = JSON.parse(normalized) as Record<string, any>;
    if (!chunk || typeof chunk !== 'object') return '';
    const thought = chunk.choices?.[0]?.delta?.reasoning_content
      ?? chunk.choices?.[0]?.message?.reasoning_content
      ?? chunk.delta?.reasoning_content;
    return typeof thought === 'string' ? thought : '';
  } catch {
    return '';
  }
}

function callPlatformAI(
  kind: keyof typeof AI_SYSTEM_PROMPTS,
  payload: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const model = platformModelFor(kind);
    // 出生档案必须拿到一个完整 JSON 才能进入游戏，但这不代表要用非流式：
    // doubao 默认深度思考，origin 提示词实测要跑 50 秒以上，stream:false 等于让平台网关
    // 憋 50 秒不吐一个字节，网关先断，回来的是笼统的 `platform server error`（errorType F，
    // 平台自己承认是框架内部错误）。平台文档专门写了「推理模型流式输出时思考内容在
    // reasoning_content」，说明推理模型就该走流式。完整性由收尾时机保证：只在 done/[DONE]
    // 或 complete 之后才交给 parseFirstAIJson，半截内容会被 JSON 解析挡下并走可见的报错页。
    const useStream = true;
    if (signal?.aborted) {
      publishAIDiagnostic(kind, 'platform', 'aborted', '请求在发出前已取消');
      reject(new DOMException('ai_aborted', 'AbortError'));
      return;
    }
    const api = window.tt?.callAIChatCompletion;
    if (!api) {
      publishAIDiagnostic(kind, 'platform', 'unavailable', '没有发现 tt.callAIChatCompletion');
      reject(new Error('tt.callAIChatCompletion unavailable'));
      return;
    }
    publishAIDiagnostic(kind, 'platform', 'calling', `已发出 · ${model}`);
    let settled = false;
    let streamedText = '';
    let reasonedChars = 0;
    const finish = (): void => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      finish();
      publishAIDiagnostic(kind, 'platform', 'aborted', '请求已取消');
      reject(new DOMException('ai_aborted', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        finish();
        publishAIDiagnostic(kind, 'platform', 'timeout', `${Math.round(timeoutMs / 1000)}秒未收到平台回调`);
        reject(new Error('platform_ai_timeout'));
      }
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    // text 来自平台回调，必须当作不可信输入：settled 与 finish() 已经把安全超时拆掉了，
    // 这之后任何同步抛错都会让 Promise 永远不结算——出生没有兜底，玩家会永久停在
    // 「AI 正在生成本局人生剧本」上，既没有报错也没有重试入口。所以先验类型再动它。
    const resolveText = (text: unknown): void => {
      if (settled) return;
      settled = true;
      finish();
      if (typeof text !== 'string' || !text.trim()) {
        const shape = text === undefined ? '缺少 data 字段'
          : text === null ? 'data 为空'
            : typeof text !== 'string' ? `data 不是字符串（${typeof text}）` : 'data 是空字符串';
        publishAIDiagnostic(kind, 'platform', 'empty_response', `平台已回调，但${shape}`);
        reject(new Error('platform_ai_empty_response'));
        return;
      }
      publishAIDiagnostic(kind, 'platform', 'returned', `平台已回调 · ${text.length}字`);
      try {
        resolve(parseFirstAIJson(text));
      } catch {
        publishAIDiagnostic(kind, 'platform', 'invalid_json', '平台已回调，但返回内容不是有效JSON');
        reject(new Error('platform_ai_invalid_json'));
      }
    };
    api({
      type: 'text',
      model,
      stream: useStream,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPTS[kind] },
        { role: 'user', content: `输入JSON：${JSON.stringify(payload)}` },
      ],
      temperature: kind === 'fate-review' ? 0.1
        : kind === 'fate' ? 0.55
          : kind === 'fate-options' ? 0.45
            : kind === 'fate-free' ? 0.55
            : 0.9,
      maxTokens: kind === 'fate' ? 700
          : kind === 'fate-options' ? 1000
          : kind === 'fate-free' ? 760
            : kind === 'fate-review' ? 220 : 900,
      ...(useStream ? {
        onSSE: (event: { eventName: string; data: string }) => {
          if (settled) return;
          const chunk = extractPlatformSSEText(event.data);
          if (chunk) {
            streamedText += chunk;
            publishAIDiagnostic(kind, 'platform', 'streaming', `正在接收 · ${streamedText.length}字`);
          } else {
            // 思考阶段 content 恒为空、只有 reasoning_content，这段能长达 40 秒。
            // 不把它显示出来，玩家看到的就是一个几十秒不动的屏幕，会误判成卡死。
            const thought = extractPlatformSSEReasoning(event.data);
            if (thought) {
              reasonedChars += thought.length;
              publishAIDiagnostic(kind, 'platform', 'streaming', `正在构思 · ${reasonedChars}字`);
            }
          }
          if (event.eventName === 'done' || event.data.trim() === '[DONE]') resolveText(streamedText);
        },
        // 流式下平台若同时回调 success 并带完整文本，以它为准；拿不到再退回累积的分片。
        success: (res?: { errMsg?: string; data?: unknown }) => {
          const whole = res?.data;
          resolveText(typeof whole === 'string' && whole.trim() ? whole : streamedText);
        },
        complete: () => {
          if (!settled) resolveText(streamedText);
        },
      } : {
        // 宿主可能回调一个没有 data 的对象、甚至不传参；这里绝不能解引用出异常，
        // 否则超时已拆、Promise 永不结算，玩家看到的就是「一直在生成」而不是错误页。
        success: (res?: { errMsg?: string; data?: unknown }) => resolveText(res?.data),
      }),
      fail: (err?: { errMsg?: string; errorCode?: number | string; errorType?: string }) => {
        if (settled) return;
        settled = true;
        finish();
        const code = err?.errorCode === undefined ? '' : ` · ${err.errorCode}`;
        const type = err?.errorType ? ` · ${err.errorType}` : '';
        publishAIDiagnostic(kind, 'platform', 'failed', `${err?.errMsg || '平台调用失败'}${code}${type}`);
        reject(new Error(err?.errMsg || 'platform_ai_failed'));
      },
    });
  });
}

async function performAIRequest(
  path: 'origin' | 'fate' | 'fate-options' | 'fate-free' | 'fate-review' | 'fate-result' | 'life-summary',
  payload: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  // 生产（抖音互动空间）：平台 AI 服务，零网络请求；开发/线上 demo：vite 代理直连方舟。
  // 此分支在 production 构建中被常量折叠整体剔除，平台上传包内不含 fetch 调用（平台审核红线）；
  // 线上演示站用 `vite build --mode demo` 构建以保留代理路径。
  if (window.tt?.callAIChatCompletion) {
    return callPlatformAI(path, payload, timeoutMs, signal);
  }
  if (import.meta.env.DEV || import.meta.env.MODE === 'demo') {
    publishAIDiagnostic(path, 'dev', 'calling', `开发代理已发出 · ${platformModelFor(path)}`);
    const controller = new AbortController();
    const abortFromParent = (): void => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', abortFromParent, { once: true });
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await window.fetch(`/api/ai/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const envelope = await response.json().catch(() => ({})) as AIEnvelope;
      if (!response.ok || envelope.ok === false) throw new Error(envelope.error || `AI HTTP ${response.status}`);
      publishAIDiagnostic(path, 'dev', 'returned', '开发代理已返回');
      return envelope.data ?? envelope;
    } catch (error) {
      publishAIDiagnostic(
        path,
        'dev',
        controller.signal.aborted ? 'timeout' : 'failed',
        error instanceof Error ? error.message : '开发代理调用失败',
      );
      throw error;
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromParent);
    }
  }
  throw new Error('ai_unavailable');
}

function classifyAIError(error: unknown, signal?: AbortSignal): string {
  if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return 'aborted';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('invalid_json')) return 'invalid_json';
  if (message.includes('unavailable') || message.includes('not configured')) return 'unavailable';
  if (message.includes('http') || message.includes('upstream_')) return 'upstream';
  return 'failed';
}

async function requestAI(
  path: 'origin' | 'fate' | 'fate-options' | 'fate-free' | 'fate-review' | 'fate-result' | 'life-summary',
  payload: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const started = performance.now();
  try {
    const result = await performAIRequest(path, payload, timeoutMs, signal);
    recordTelemetry('ai_request', {
      kind: path,
      model: platformModelFor(path),
      status: 'ok',
      latencyMs: Math.round(performance.now() - started),
    });
    return result;
  } catch (error) {
    recordTelemetry('ai_request', {
      kind: path,
      model: platformModelFor(path),
      status: classifyAIError(error, signal),
      latencyMs: Math.round(performance.now() - started),
    });
    throw error;
  }
}

export async function generateAIOrigin(
  runSeed: number,
  kind: OriginKind,
  requestNonce: string,
  wheels: OriginWheels,
  signal?: AbortSignal,
): Promise<OriginProfile | null> {
  try {
    const raw = await requestAI('origin', { runSeed, kind, requestNonce, wheels }, ORIGIN_AI_TIMEOUT_MS, signal);
    const normalized = isRecord(raw) && typeof raw.story === 'string'
      ? { ...raw, story: raw.story.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean) }
      : raw;
    const profile = validateOriginProfile(normalized, kind);
    publishAIDiagnostic(
      'origin',
      window.tt?.callAIChatCompletion ? 'platform' : 'dev',
      profile ? 'validated' : 'rejected',
      profile ? '平台返回的档案已通过校验' : '平台已经返回，但档案规则校验未通过',
    );
    return profile;
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return null;
    console.info('[AI] 出生档案生成失败', error instanceof Error ? error.message : error);
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const AI_POISON_KEYS = ['greed', 'anger', 'delusion', 'pride', 'doubt'] as const;

function trimAIText(value: unknown, max: number): unknown {
  return typeof value === 'string' ? value.trim().slice(0, max) : value;
}

function normalizeAIPoison(value: unknown): unknown {
  if (!Array.isArray(value)) return value ?? {};
  const poison: Record<string, number> = {};
  for (const key of value) {
    if (typeof key === 'string' && AI_POISON_KEYS.includes(key as typeof AI_POISON_KEYS[number])) poison[key] = 1;
  }
  return poison;
}

function normalizeAIResponse(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    label: trimAIText(value.label, 14),
    hint: trimAIText(value.hint, 36),
    result: trimAIText(value.result, 90),
    poison: normalizeAIPoison(value.poison),
  };
}

type AIFateCore = Pick<FateEvent, 'id' | 'title' | 'fact' | 'scene' | 'profile'>;

function normalizeAIFateCore(value: unknown, snapshot: LifeSnapshot): unknown {
  if (!isRecord(value)) return value;
  const rawId = typeof value.id === 'string' ? value.id.trim().slice(0, 48) : '';
  const id = /^[a-z0-9_-]{3,48}$/i.test(rawId)
    ? rawId
    : `ai_fate_${snapshot.runSeed.toString(36)}_${snapshot.chapterIndex}`;
  const title = typeof value.title === 'string' && value.title.trim().length >= 2
    ? value.title.trim().slice(0, 16)
    : '';
  const fact = typeof value.fact === 'string' && value.fact.trim().length >= 8
    ? value.fact.trim().slice(0, 120)
    : '';
  const scene = isRecord(value.scene) ? value.scene : {};
  const sceneTime = typeof scene.time === 'string' && scene.time.trim().length >= 2
    ? scene.time.trim().slice(0, 18)
    : '';
  const scenePlace = typeof scene.place === 'string' && scene.place.trim().length >= 2
    ? scene.place.trim().slice(0, 24)
    : '';
  const scenePeople = typeof scene.people === 'string' && scene.people.trim().length >= 2
    ? scene.people.trim().slice(0, 28)
    : '';
  return {
    ...value,
    id,
    title,
    fact,
    scene: { time: sceneTime, place: scenePlace, people: scenePeople },
  };
}

function validateAIFateCore(value: unknown, snapshot: LifeSnapshot): AIFateCore | null {
	if (!isRecord(value)) return null;
	const checked = validateFateEvent({
		...value,
		memoryId: `remember_${String(value.id ?? 'event')}`.slice(0, 48),
		memoryText: deriveFateMemory(String(value.fact ?? '')),
		unavoidable: { kind: 'none', amount: 0, item: null },
		swallow: {
			label: '先不回应', hint: '把眼前这件事先收进自己', effect: 'guard', poison: {},
			result: '他没有立刻回应，现场暂时没有人再说话。',
		},
		exhale: {
			label: '当场问清', hint: '留在原地把这件事问清楚', effect: 'focus', poison: {},
			result: '他留在原地，把眼前的事重新问了一遍。',
		},
	}, snapshot);
	return checked ? {
		id: checked.id,
		title: checked.title,
		fact: checked.fact,
		scene: checked.scene,
		profile: checked.profile,
	} : null;
}

function normalizeAIFateOptions(value: unknown, core: AIFateCore): unknown {
	if (!isRecord(value)) return value;
	return {
		...value,
		...core,
		memoryId: `remember_${core.id}`.slice(0, 48),
		memoryText: deriveFateMemory(core.fact),
		swallow: normalizeAIResponse(value.swallow),
		exhale: normalizeAIResponse(value.exhale),
		source: 'gpt',
	};
}

function isGroundedFateFact(fact: string, scene?: FateEvent['scene']): boolean {
	const groundedText = scene
		? `${scene.time}；${scene.place}；${scene.people}；${fact}`
		: fact;
	const clauseCount = (fact.match(/[，。！？；]/g) ?? []).length;
	const impossible = /(魔法|灵异|鬼魂|幽灵|诅咒|穿越|异世界|超能力)/;
	const inanimateActor = /(情书|信封|衣服|雨衣|照片|相框|橡皮|纽扣|钥匙|药丸|工牌|书包|课桌|纸条|道具).{0,8}(说话|开口|呼吸|叫人|哭|笑|盯着|决定|答应|拒绝|知道|记得|认出|害怕|生气|自己动)/;
	const forcedCoincidence = /(严丝合缝|恰好补上|正好补上|突然认出.{0,10}(花纹|气味|划痕|缺口)|原来竟是.{0,12}(那张|那封|那件))/;
	const concreteTime = /(周[一二三四五六日天]|星期|早上|上午|中午|下午|傍晚|晚上|夜里|凌晨|清晨|放学|下班|开学|午休|课间|饭前|饭后|复诊|当天|那天|月底|发薪|工作日|周末|今天|第二天|\d{1,2}[点时])/;
	const concretePlace = /(小学|初中|中学|高中|教室|学校|家里|家中|客厅|卧室|厨房|公司|办公室|医院|车站|地铁|站台|公交|宿舍|出租屋|小区|社区|街口|街边|路上|楼下|楼道|楼梯|食堂|餐馆|饭店|商场|商店|店里|便利店|快递柜|银行|派出所|网吧|工地|诊室|病房|会议室|门口|走廊|饭桌)/;
	return concreteTime.test(groundedText)
		&& concretePlace.test(groundedText)
		&& fact.includes('他')
		&& clauseCount >= 3
		&& !impossible.test(fact)
		&& !inanimateActor.test(fact)
		&& !forcedCoincidence.test(fact);
}

function isGroundedFateNarrative(event: FateEvent): boolean {
	const fullText = [event.fact, event.swallow.label, event.swallow.hint, event.swallow.result,
		event.exhale.label, event.exhale.hint, event.exhale.result].join('；');
	const impossible = /(魔法|灵异|鬼魂|幽灵|诅咒|穿越|异世界|超能力)/;
	const inanimateActor = /(情书|信封|衣服|雨衣|照片|相框|橡皮|纽扣|钥匙|药丸|工牌|书包|课桌|纸条|道具).{0,8}(说话|开口|呼吸|叫人|哭|笑|盯着|决定|答应|拒绝|知道|记得|认出|害怕|生气|自己动)/;
	const chargedAlready = /(?:已经|已|整整).{0,8}(?:扣费|扣款|扣了)|(?:扣费|扣款)(?:成功|完成)/;
	const paysAgain = /(?:把钱付了|再次?付款|又付|再付|交钱|补交|重新缴费)/;
	const forcedLastOne = /最后一(?:台|个|份).{0,10}(?:刚好|正好|恰好).{0,8}(?:被|让)/;
	return isGroundedFateFact(event.fact, event.scene)
		&& !impossible.test(fullText)
		&& !inanimateActor.test(fullText)
		&& !(chargedAlready.test(event.fact) && paysAgain.test(`${event.swallow.result}；${event.exhale.result}`))
		&& !forcedLastOne.test(fullText);
}

function reviewFreeFateContinuity(
  event: FateEvent,
  playerText: string,
  response: FateResponse,
): FateRealityReview {
  if (playerText.length >= 4 && response.result.includes(playerText)) {
    return { valid: false, reason: 'result重复了玩家原话，结果卡会单独展示这句话' };
  }
  if (/(这句话留在了现场|事情没有因此改写|表达了自己的想法|现场陷入了沉默)$/.test(response.result)) {
    return { valid: false, reason: 'result使用了万能收尾，没有写现场人物的直接反应' };
  }
  const positionPattern = /([\u4e00-\u9fa5]{1,6}?)(站|坐|守|待)在([^，。；]{1,16}?(?:前|旁|边|里|内|外|上|下|口|间|后))/g;
  for (const match of event.fact.matchAll(positionPattern)) {
    const actor = match[1] ?? '';
    const verb = match[2] ?? '';
    const place = match[3] ?? '';
    if (!actor || actor.endsWith('他') || !verb || !place) continue;
    const escapedPlace = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const heroMovedIntoOtherPosition = new RegExp(
      `(?:${verb}在${escapedPlace}的他|他[^，。；]{0,10}${verb}在${escapedPlace})`,
    );
    if (heroMovedIntoOtherPosition.test(response.result)) {
      return { valid: false, reason: `原文是${actor}${verb}在${place}，不能把这个位置改写成主角的位置` };
    }
  }
  return { valid: true, reason: '通过' };
}

interface FateRealityReview {
	valid: boolean;
	reason: string;
}

async function reviewFateReality(
  snapshot: LifeSnapshot,
  event: FateEvent,
  sourceEvent?: FateEvent,
  signal?: AbortSignal,
): Promise<FateRealityReview | null> {
	try {
		const raw = await requestAI('fate-review', { snapshot, event, ...(sourceEvent ? { sourceEvent } : {}) }, FATE_AI_TIMEOUT_MS, signal);
		if (!isRecord(raw) || typeof raw.valid !== 'boolean') return null;
		const reason = typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 120) : '未说明原因';
		if (!raw.valid) console.info('[AI] 命运事件未通过现实审稿', reason);
		return { valid: raw.valid, reason };
	} catch (error) {
		console.info('[AI] 现实审稿暂不可用', error instanceof Error ? error.message : error);
		return null;
	}
}

function deriveFateMemory(fact: string): string {
	const firstSentence = fact.split(/[。！？；]/, 1)[0]?.trim() || fact.trim();
	const memory = firstSentence.length >= 8 ? firstSentence : fact.trim();
	return memory.length <= 80 ? memory : `${memory.slice(0, 79)}…`;
}

export async function generateAIFate(snapshot: LifeSnapshot, signal?: AbortSignal): Promise<FateEvent | null> {
	// Fate is prefetched while the chapter is still running, so use that idle
	// time to rewrite rejected drafts instead of showing a logically weak event.
	const previousRejections: string[] = [];
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		if (signal?.aborted) return null;
		try {
			const rawCore = await requestAI('fate', {
				snapshot,
				candidateItems: buildFateCandidateItemCatalog(snapshot),
				previousRejections,
			}, FATE_AI_TIMEOUT_MS, signal);
			const core = validateAIFateCore(normalizeAIFateCore(rawCore, snapshot), snapshot);
			if (!core || !isGroundedFateFact(core.fact, core.scene)) {
				previousRejections.push('事件核心没有写清现实中的时间、地点、人物、动作与直接结果');
				console.info(`[AI] 命运事件核心未通过，正在重写 ${attempt}/3`);
				continue;
			}
			const rawOptions = await requestAI('fate-options', {
				snapshot,
				event: core,
			}, FATE_AI_TIMEOUT_MS, signal);
			const candidate = validateFateEvent(
				normalizeAIFateOptions(rawOptions, core),
				snapshot,
				{ requireResidue: true },
			);
			const event = candidate ? { ...candidate, memoryText: deriveFateMemory(candidate.fact) } : null;
			if (event && isGroundedFateNarrative(event)) {
				const review = await reviewFateReality(snapshot, event, undefined, signal);
				if (review?.valid !== false) {
					return event;
				}
				previousRejections.push(review.reason);
			} else {
				previousRejections.push('场景、正文或两个回应没有通过基础写实与格式规则');
			}
			console.info(`[AI] 命运事件格式或现实逻辑未通过，正在重写 ${attempt}/3`);
		} catch (error) {
			if (signal?.aborted) return null;
			console.info(
				`[AI] 命运事件请求失败 ${attempt}/3`,
				error instanceof Error ? error.message : error,
			);
		}
	}
	console.info('[AI] 命运事件三次生成均未通过，回退到写实本地事件');
  return null;
}

export async function generateAIFreeFate(payload: {
  event: FateEvent;
  direction: FateDirection;
  playerText: string;
  snapshot: LifeSnapshot;
}, signal?: AbortSignal): Promise<FateResponse | null> {
  let previousRejection = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      // 等待窗与命运链路统一：这里曾写死 16 秒，而实测 fate-free 在 doubao 上要 24.7 秒，
      // 等于每一次亲口回应都必然超时、再靠外层重试硬扛出一分多钟。
      const raw = await requestAI('fate-free', {
        event: {
          id: payload.event.id,
          title: payload.event.title,
          scene: payload.event.scene,
          fact: payload.event.fact,
          profile: payload.event.profile,
        },
        direction: payload.direction,
        playerText: payload.playerText,
        snapshot: payload.snapshot,
        previousRejection,
      }, FATE_AI_TIMEOUT_MS, signal);
      const source = isRecord(raw) && isRecord(raw.response) ? raw.response : raw;
      const response = validateFreeFateResponse(
        normalizeAIResponse(source),
        payload.snapshot,
        payload.event.profile,
        payload.event.fact,
      );
      if (response) {
        const continuity = reviewFreeFateContinuity(payload.event, payload.playerText, response);
        if (!continuity.valid) {
          previousRejection = continuity.reason;
          console.info(`[AI] 亲口回应现场连续性未通过 ${attempt}/2`, continuity.reason);
          continue;
        }
        const candidateEvent = { ...payload.event, [payload.direction]: response };
        const review = await reviewFateReality(payload.snapshot, candidateEvent);
        // 本地格式、白名单与现场连续性已是硬门。二次 AI 审稿明确指出
        // 现实硬伤时才退稿；审稿超时/无返回不应否决一份已合格的 AI 回执。
        if (review?.valid !== false) return response;
        previousRejection = review.reason;
      } else {
        previousRejection = '上一稿没有通过剧情证据或格式校验，请换一种更直接、可验证的现场结果';
      }
      console.info(`[AI] 亲口回应未通过剧情结算校验 ${attempt}/2`);
    } catch (error) {
      console.info(
        `[AI] 亲口回应请求失败 ${attempt}/2`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return null;
}

export async function generateAIFateResult(payload: {
  event: { id: string; title: string; fact: string };
  direction: FateDirection;
  playerText?: string;
  response: {
    label: string;
    effect: string;
    result: string;
    settlement?: FateSettlement;
    gainItemId?: ItemId;
    removeItemId?: ItemId;
    reward?: FateReward;
  };
  snapshot: LifeSnapshot;
}): Promise<string | null> {
  try {
    const raw = await requestAI('fate-result', payload, FATE_AI_TIMEOUT_MS);
    if (!isRecord(raw) || typeof raw.text !== 'string') return null;
    const text = raw.text.trim().replace(/\s+/g, ' ');
    if (text.length < 8 || text.length > 90) return null;
    return text;
  } catch (error) {
    console.info('[AI] 命运回响未生成', error instanceof Error ? error.message : error);
    return null;
  }
}
