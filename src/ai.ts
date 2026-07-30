import {
  buildFateCandidateItemCatalog,
  validateFreeFateResponse,
  validateFateEvent,
} from './fate';
import { parseFirstAIJson } from './ai-json';
import { validateOriginProfile, type OriginWheels } from './origins';
import { getItem } from './relics';
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

/**
 * 真机验收探针：平台是否真的透传了 thinking:{type:'disabled'}。
 * chars = 本次平台流式请求里实际收到的 reasoning_content 总字数——
 * 0 就是思考已关（disabled 透传成功），>0 就是平台把参数丢了、模型在裸跑思考。
 * -1 表示还没有走完一次平台流式请求（dev 代理直连不经过这里，永远 -1）。
 */
let thinkingProbe: { kind: string; chars: number } = { kind: '', chars: -1 };

export function readThinkingProbe(): { kind: string; chars: number } {
  return { ...thinkingProbe };
}

/**
 * 探针的真机可视层：左下角一行 9px 小字，只在平台流式请求走完后出现。
 * 走 DOM 而不是 canvas，是因为渲染都在 game.ts、而那边可能正被并行会话编辑；
 * 这行字和标题页右下的构建号是同一性质——给上传后的真机验收看的，不属于游戏画面。
 */
function updateThinkingProbeBadge(kind: string, chars: number): void {
  try {
    let badge = document.getElementById('ai-thinking-probe');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'ai-thinking-probe';
      badge.style.cssText = 'position:fixed;left:6px;bottom:4px;z-index:40;'
        + 'font:9px/1.4 monospace;color:#8a8577;opacity:.75;pointer-events:none;';
      document.body.appendChild(badge);
    }
    badge.textContent = chars > 0
      ? `${kind} 思考${chars}字·平台未关思考`
      : `${kind} 思考0字·已关`;
    badge.style.color = chars > 0 ? '#c5827d' : '#8a8577';
  } catch {
    // 探针绝不允许影响游玩。
  }
}

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

function reportAIValidation(
  kind: keyof typeof AI_SYSTEM_PROMPTS,
  valid: boolean,
  detail: string,
): void {
  const transport: AIDiagnostic['transport'] = window.tt?.callAIChatCompletion
    ? 'platform'
    : import.meta.env.DEV || import.meta.env.MODE === 'demo' ? 'dev' : 'none';
  publishAIDiagnostic(kind, transport, valid ? 'validated' : 'rejected', detail);
  recordTelemetry('ai_validation', {
    kind,
    status: valid ? 'validated' : 'rejected',
    detail: detail.slice(0, 120),
  });
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
/** 普通命运牌生成、选项与审稿共用的总预算；快速退稿仍可进入下一轮。 */
const FATE_PIPELINE_TOTAL_TIMEOUT_MS = 150_000;
/** 亲口回应整条链路的总预算，避免“生成×审稿×内外重试”相乘成数分钟。 */
const FREE_FATE_TOTAL_TIMEOUT_MS = 75_000;

/** 人生封卷只在终局账本结算后生成；结局页有固定文案，不会被这段等待卡住。 */
const LIFE_SUMMARY_TIMEOUT_MS = 90_000;
/** 低于这一篇幅先软重写一次；首稿仍保留，重写失败也不会让结局变空白。 */
const LIFE_SUMMARY_SOFT_MIN_CHARS = 250;

function platformModelFor(kind: keyof typeof AI_SYSTEM_PROMPTS): string {
  return kind === 'origin' ? PLATFORM_AI_MODELS.origin : PLATFORM_AI_MODELS.default;
}

/** 出生失败页要把实际请求的模型 ID 打给玩家看，用于区分平台故障与模型未开通。 */
function mentionsItemName(text: string, name: string): boolean {
  const normalized = name.trim();
  if (!normalized) return false;
  if (text.includes(normalized)) return true;
  // 道具名常带叙事修饰（父亲的雨衣、校服上掉下来的纽扣），模型在自然句子里
  // 写“旧雨衣/那枚纽扣”仍是同一物证。只用至少两个字的核心名，避免单字误判。
  const parts = normalized.split('的');
  const afterDe = parts[parts.length - 1]?.trim() ?? '';
  const suffix = normalized.length >= 4 ? normalized.slice(-2) : '';
  return [afterDe, suffix].some((token) => token.length >= 2 && text.includes(token));
}

function usesSecondPersonForHero(text: string): boolean {
  return /(?:^|[，。；！？、\s])你(?:[把将向对给的]|开口|抬头|低头|伸手|转身|走|说|问|拿|放|收|递|看|听|站|坐)/u.test(text);
}

/** 这一局的人生封卷。拿不到就返回 null，结局页使用固定文案兜底。 */
export function validateLifeSummaryText(text: string, payload: unknown): boolean {
  // 260~340 是写作目标；校验只拦截明显截断或会溢出版面的结果。
  // 不把目标下限写成硬门，避免一篇 240 字的完整封卷因少十几个字让结局变空白。
  if (text.length < 90 || text.length > 380 || usesSecondPersonForHero(text)) return false;
  if (!isRecord(payload)) return text.includes('他');
  const nickname = typeof payload.nickname === 'string' ? payload.nickname.trim() : '';
  if (!text.includes('他') && (!nickname || !text.includes(nickname))) return false;
  // 外号是封卷与本局最稳定的身份锚点，保留这一条硬门。
  if (nickname && !text.includes(nickname)) return false;
  const itemNames = [
    ...(Array.isArray(payload.items) ? payload.items : []),
    ...(Array.isArray(payload.returnedItems) ? payload.returnedItems : []),
  ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  // 至少带回一件物证即可；精确复述全部长道具名属于质量目标，不应让结局空白。
  const requiredItemMentions = Math.min(1, new Set(itemNames).size);
  const mentionedItems = new Set(itemNames.filter((name) => mentionsItemName(text, name))).size;
  if (mentionedItems < requiredItemMentions) return false;
  if (payload.keeperSlain === true && !text.includes('收灯人')) return false;
  if (payload.keeperSlain !== true
    && /(?:杀死|杀了|手刃|击杀|打死|宰了|除掉).{0,8}收灯人|收灯人.{0,8}(?:被杀|死在|倒在他手里)/.test(text)) return false;
  if (payload.won === true && /(?:被|让).{0,10}(?:怪物|敌人|收灯人).{0,5}(?:杀死|打死)|死于/.test(text)) return false;
  if (payload.won === false && /主动放下最后一口气|杀死收灯人后活了下来/.test(text)) return false;
  return true;
}

function boundedLifeFact(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).replace(/[，、；：…—-]+$/u, '')}。`;
}

/**
 * 终局保底封卷。只重排已经结算的事实，不引入任何新人物或事件。
 * 火山引擎连续失败时仍让玩家看到完整的一页，同时在界面上如实标为“本地封卷”。
 */
export function buildLocalLifeSummary(payload: unknown): string {
  if (!isRecord(payload)) return '他把这一身走到了最后。留下的物证已经落账，最后一页也在这里合上。';
  const nickname = boundedLifeFact(payload.nickname, 24) || boundedLifeFact(payload.title, 30) || '没有留下名字的人';
  const nicknameReason = boundedLifeFact(payload.nicknameReason, 72);
  const originStory = Array.isArray(payload.originStory)
    ? payload.originStory.map((entry) => boundedLifeFact(entry, 76)).filter(Boolean)
    : [];
  const receipts = Array.isArray(payload.receipts) ? payload.receipts.filter(isRecord) : [];
  const memories = Array.isArray(payload.memories)
    ? payload.memories.map((entry) => boundedLifeFact(entry, 56)).filter(Boolean)
    : [];
  const items = Array.isArray(payload.items)
    ? payload.items.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const returnedItems = Array.isArray(payload.returnedItems)
    ? payload.returnedItems.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const reachedAge = boundedLifeFact(payload.reachedAge, 12);
  const endedBy = boundedLifeFact(payload.endedBy, 40);

  const intro = `他这一身最早被人叫作“${nickname}”${nicknameReason ? `：${nicknameReason}` : '。'}`
    .replace(/([。！？])。$/u, '$1');
  const candidates = [...originStory];
  for (const receipt of receipts.slice(0, 3)) {
    const fact = boundedLifeFact(receipt.fact, 68);
    const result = boundedLifeFact(receipt.result, 48);
    const label = boundedLifeFact(receipt.label, 24);
    const direction = receipt.direction === 'exhale' ? '吐出' : '咽下';
    const choice = label ? `他选择${direction}，说“${label}”。` : `他把这件事${direction}。`;
    candidates.push(`${fact}${choice}${result}`.replace(/([。！？])。/gu, '$1'));
  }
  candidates.push(...memories.slice(0, 2).map((memory) => `账本里还记着：${memory}`));
  if (items.length) candidates.push(`走到最后，他仍带着${items.slice(0, 3).join('、')}。`);
  if (returnedItems.length) candidates.push(`灯下实际交还的是${returnedItems.slice(0, 3).join('、')}。`);

  const ending = payload.won === true
    ? payload.keeperSlain === true
      ? '最后，他杀死收灯人后活了下来；物证已经落账，这一页在熄灭的灯下封卷。'
      : `最后，${endedBy || '他主动放下最后一口气'}；门在身后合上，这一页也随之封卷。`
    : `最后，他${reachedAge ? `在${reachedAge}` : ''}停下，${endedBy || '没能走到下一页'}；余下的物证留在这一页。`;
  const targetMax = 340;
  let text = intro;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const remaining = targetMax - ending.length - text.length;
    if (remaining <= 0) break;
    if (candidate.length <= remaining) {
      text += candidate;
    } else if (text.length + ending.length < 260 && remaining >= 18) {
      text += boundedLifeFact(candidate, remaining);
      break;
    }
  }
  text += ending;
  return text.slice(0, 380);
}

export async function generateLifeSummary(payload: unknown, signal?: AbortSignal): Promise<string | null> {
  const deadline = performance.now() + LIFE_SUMMARY_TIMEOUT_MS;
  let previousRejection = '';
  let usableCandidate = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted) return null;
    const remaining = Math.floor(deadline - performance.now());
    if (remaining < 1_000) break;
    const retryPayload = attempt > 0 && isRecord(payload)
      ? { ...payload, previousRejections: [previousRejection || '上次封卷没有形成可解析且符合事实的完整 JSON，请重新输出完整对象。'] }
      : payload;
    try {
      const raw = await requestAI('life-summary', retryPayload, Math.min(45_000, remaining), signal);
      if (!isRecord(raw) || typeof raw.text !== 'string') {
        previousRejection = '上次封卷缺少 text 字段。';
        continue;
      }
      const text = raw.text.trim().replace(/\s+/g, ' ');
      if (!validateLifeSummaryText(text, payload)) {
        previousRejection = '上次封卷没有通过长度、物证或终局事实校验。';
        continue;
      }
      // 篇幅是质量目标，不是可用性硬门：短首稿先留在手里，再请模型扩写一次。
      // 如果重写超时或变坏，循环结束后仍交付这份事实正确的首稿。
      if (attempt === 0 && text.length < LIFE_SUMMARY_SOFT_MIN_CHARS) {
        usableCandidate = text;
        previousRejection = `上次封卷只有${text.length}个字。事实正确，请保留全部事实并扩写到260至340个中文字。`;
        continue;
      }
      const selected = usableCandidate && usableCandidate.length > text.length ? usableCandidate : text;
      reportAIValidation('life-summary', true, attempt === 0
        ? '封卷已通过终局合同校验'
        : '封卷自动重写后通过终局合同校验');
      return selected;
    } catch (error) {
      if (signal?.aborted) return null;
      previousRejection = error instanceof Error
        ? `上次请求失败：${error.message}`
        : '上次请求失败。';
    }
  }
  if (usableCandidate) {
    reportAIValidation('life-summary', true, '封卷扩写未完成，已保留事实正确的首稿');
    return usableCandidate;
  }
  reportAIValidation('life-summary', false, previousRejection || '封卷在总时限内没有生成');
  return null;
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
  onSSE?: (event?: { eventName?: unknown; data?: unknown }) => void;
  success?: (res: { errMsg: string; data: string }) => void;
  fail: (err: {
    errMsg: string;
    errorCode?: number | string;
    errNo?: number;
    errCode?: unknown;
    errorType?: string;
  }) => void;
  complete?: () => void;
}

declare global {
  interface Window {
    tt?: { callAIChatCompletion?: (options: TicAIChatOptions) => void };
  }
}

function normalizePlatformSSEData(data: unknown): string {
  return typeof data === 'string' ? data.trim().replace(/^data:\s*/i, '') : '';
}

function extractPlatformSSEText(data: unknown): string {
  const normalized = normalizePlatformSSEData(data);
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
function extractPlatformSSEReasoning(data: unknown): string {
  const normalized = normalizePlatformSSEData(data);
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

export function callPlatformAI(
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
      // 思考探针在成功路径落账：0字=disabled 真的透传了；>0=平台丢参数、模型裸跑思考。
      thinkingProbe = { kind, chars: reasonedChars };
      updateThinkingProbeBadge(kind, reasonedChars);
      const thinkingNote = reasonedChars > 0 ? `思考${reasonedChars}字（平台未关思考）` : '思考0字（已关）';
      publishAIDiagnostic(kind, 'platform', 'returned', `平台已回调 · ${text.length}字 · ${thinkingNote}`);
      try {
        resolve(parseFirstAIJson(text));
      } catch {
        publishAIDiagnostic(kind, 'platform', 'invalid_json', '平台已回调，但返回内容不是有效JSON');
        reject(new Error('platform_ai_invalid_json'));
      }
    };
    const options: TicAIChatOptions = {
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
        onSSE: (event?: { eventName?: unknown; data?: unknown }) => {
          if (settled) return;
          const chunk = extractPlatformSSEText(event?.data);
          if (chunk) {
            streamedText += chunk;
            publishAIDiagnostic(kind, 'platform', 'streaming', `正在接收 · ${streamedText.length}字`);
          } else {
            // 思考阶段 content 恒为空、只有 reasoning_content，这段能长达 40 秒。
            // 不把它显示出来，玩家看到的就是一个几十秒不动的屏幕，会误判成卡死。
            const thought = extractPlatformSSEReasoning(event?.data);
            if (thought) {
              reasonedChars += thought.length;
              publishAIDiagnostic(kind, 'platform', 'streaming', `正在构思 · ${reasonedChars}字`);
            }
          }
          if (event?.eventName === 'done' || normalizePlatformSSEData(event?.data) === '[DONE]') {
            resolveText(streamedText);
          }
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
    };
    try {
      api(options);
    } catch (error) {
      if (settled) return;
      settled = true;
      finish();
      const message = error instanceof Error ? error.message : '平台方法同步抛出异常';
      publishAIDiagnostic(kind, 'platform', 'failed', message);
      reject(error instanceof Error ? error : new Error(message));
    }
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
      const parentAborted = signal?.aborted === true;
      publishAIDiagnostic(
        path,
        'dev',
        parentAborted ? 'aborted' : controller.signal.aborted ? 'timeout' : 'failed',
        error instanceof Error ? error.message : '开发代理调用失败',
      );
      throw error;
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromParent);
    }
  }
  publishAIDiagnostic(path, 'none', 'unavailable', '当前环境没有可用的 AI 通道');
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
    const profile = validateOriginProfile(raw, kind, { strictAI: true });
    reportAIValidation(
      'origin',
      Boolean(profile),
      profile ? '出生档案已通过严格合同校验' : '出生档案未通过严格合同校验',
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
		// 固定代价不再交给 Lite 模型输出。实测它会只返回这一块而漏掉两条回应；
		// 程序固定 none，让 AI 的有限结构预算全部用于玩家真正要点的两个选择。
		unavoidable: { kind: 'none', amount: 0, item: null },
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
  timeoutMs = FATE_AI_TIMEOUT_MS,
): Promise<FateRealityReview | null> {
	try {
		const raw = await requestAI(
			'fate-review',
			{ snapshot, event, ...(sourceEvent ? { sourceEvent } : {}) },
			timeoutMs,
			signal,
		);
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
	const deadline = performance.now() + FATE_PIPELINE_TOTAL_TIMEOUT_MS;
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		if (signal?.aborted) return null;
		const remainingForCore = Math.floor(deadline - performance.now());
		if (remainingForCore <= 0) break;
		try {
			const rawCore = await requestAI('fate', {
				snapshot,
				candidateItems: buildFateCandidateItemCatalog(snapshot),
				previousRejections,
			}, Math.min(FATE_AI_TIMEOUT_MS, remainingForCore), signal);
			const core = validateAIFateCore(normalizeAIFateCore(rawCore, snapshot), snapshot);
			if (!core || !isGroundedFateFact(core.fact, core.scene)) {
				previousRejections.push('事件核心没有写清现实中的时间、地点、人物、动作与直接结果');
				console.info(`[AI] 命运事件核心未通过，正在重写 ${attempt}/3`);
				continue;
			}
			// 核心事实已经合格时，选项偶发少字段不该把整件事实一起丢掉。
			// 在同一核心上单独给选项一次改写机会，既提高命中率，也少做一次更贵的事实生成。
			const optionRejections: string[] = [];
			for (let optionAttempt = 1; optionAttempt <= 2; optionAttempt += 1) {
				const remainingForOptions = Math.floor(deadline - performance.now());
				if (remainingForOptions <= 0) break;
				try {
					const rawOptions = await requestAI('fate-options', {
						snapshot,
						event: core,
						previousRejections: optionRejections,
					}, Math.min(FATE_AI_TIMEOUT_MS, remainingForOptions), signal);
					const candidate = validateFateEvent(
						normalizeAIFateOptions(rawOptions, core),
						snapshot,
						{ requireResidue: true },
					);
					const event = candidate ? { ...candidate, memoryText: deriveFateMemory(candidate.fact) } : null;
					if (event && isGroundedFateNarrative(event)) {
						const remainingForReview = Math.floor(deadline - performance.now());
						const review = remainingForReview > 0
							? await reviewFateReality(
								snapshot,
								event,
								undefined,
								signal,
								Math.min(FATE_AI_TIMEOUT_MS, remainingForReview),
							)
							: null;
						// 普通命运牌已有零等待本地保底，审稿没有给出明确通过时不应把
						// 未审完的 AI 内容放进正典。亲口回应另有“保住玩家原话”的可用性取舍。
						if (review?.valid === true) {
							reportAIValidation('fate-options', true, '命运牌已通过格式、写实与现实审稿');
							return event;
						}
						const reason = review?.reason ?? '现实审稿没有返回有效结论';
						optionRejections.push(reason);
						previousRejections.push(reason);
					} else {
						const reason = '顶层必须同时给出swallow、exhale，且两个回应必须通过基础写实与格式规则';
						optionRejections.push(reason);
						previousRejections.push(reason);
					}
				} catch (error) {
					if (signal?.aborted) return null;
					const reason = error instanceof Error ? error.message : '选项请求失败';
					optionRejections.push(reason);
					previousRejections.push(reason);
				}
				console.info(`[AI] 命运选项未通过，正在改写 ${optionAttempt}/2`);
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
	reportAIValidation('fate-options', false, '命运牌在总预算内未通过完整校验');
  return null;
}

export async function generateAIFreeFate(payload: {
  event: FateEvent;
  direction: FateDirection;
  playerText: string;
  snapshot: LifeSnapshot;
}, signal?: AbortSignal): Promise<FateResponse | null> {
  let previousRejection = '';
  const deadline = performance.now() + FREE_FATE_TOTAL_TIMEOUT_MS;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (signal?.aborted) return null;
    const remainingForDraft = Math.floor(deadline - performance.now());
    if (remainingForDraft <= 0) break;
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
      }, Math.min(FATE_AI_TIMEOUT_MS, remainingForDraft), signal);
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
        const remainingForReview = Math.floor(deadline - performance.now());
        const review = remainingForReview > 0
          ? await reviewFateReality(
            payload.snapshot,
            candidateEvent,
            undefined,
            signal,
            Math.min(FATE_AI_TIMEOUT_MS, remainingForReview),
          )
          : null;
        // 本地格式、白名单与现场连续性已是硬门。二次 AI 审稿明确指出
        // 现实硬伤时才退稿；审稿超时/无返回不应否决一份已合格的 AI 回执。
        if (review?.valid !== false) {
          reportAIValidation('fate-free', true, '亲口回应已通过格式与现场连续性校验');
          return response;
        }
        previousRejection = review.reason;
      } else {
        previousRejection = '上一稿没有通过剧情证据或格式校验，请换一种更直接、可验证的现场结果';
      }
      console.info(`[AI] 亲口回应未通过剧情结算校验 ${attempt}/2`);
    } catch (error) {
      if (signal?.aborted) return null;
      console.info(
        `[AI] 亲口回应请求失败 ${attempt}/2`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  reportAIValidation('fate-free', false, '亲口回应在总预算内未通过校验');
  return null;
}

export interface AIFateResultPayload {
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
}

export function validateAIFateResultText(text: string, payload: AIFateResultPayload): boolean {
  if (text.length < 12 || text.length > 90 || usesSecondPersonForHero(text)) return false;
  if (payload.playerText && payload.playerText.length >= 4 && text.includes(payload.playerText)) return false;
  if (/(魔法|灵异|鬼魂|幽灵|诅咒|穿越|异世界|超能力)/.test(text)) return false;
  const changedItemId = payload.response.gainItemId ?? payload.response.removeItemId;
  const changedItemName = changedItemId ? getItem(changedItemId).name : '';
  const sourceText = JSON.stringify({
    event: payload.event,
    response: payload.response,
    snapshot: payload.snapshot,
    changedItemName,
  });
  // 常见人物角色若不在输入事实中，不允许回响凭空叫进场。
  const roleWords = [
    '校长', '警察', '医生', '护士', '妻子', '丈夫', '女儿', '儿子', '母亲', '父亲',
    '老板', '主管', '同事', '老师', '同学', '班主任', '女生', '男生', '房东', '店员',
    '客服', '收灯人',
  ];
  if (roleWords.some((role) => text.includes(role) && !sourceText.includes(role))) return false;
  // 至少写出一个当场动作；纯感悟或“日子照常”不再冒充现场回响。
  if (!/(开口|抬头|低头|伸手|转身|停下|停住|停了|顿住|顿了|收回|收了|递给|递回|交给|交回|拿起|放下|放回|合上|推回|走开|离开|坐下|站起|点头|摇头|重讲|改口|叠好|笑声|安静|沉默)/.test(text)) return false;
  return !changedItemId || mentionsItemName(text, getItem(changedItemId).name);
}

export async function generateAIFateResult(payload: AIFateResultPayload): Promise<string | null> {
  try {
    const raw = await requestAI('fate-result', payload, FATE_AI_TIMEOUT_MS);
    if (!isRecord(raw) || typeof raw.text !== 'string') {
      reportAIValidation('fate-result', false, '命运回响缺少 text 字段');
      return null;
    }
    const text = raw.text.trim().replace(/\s+/g, ' ');
    if (!validateAIFateResultText(text, payload)) {
      reportAIValidation('fate-result', false, '命运回响未通过长度、现场或物证校验');
      return null;
    }
    reportAIValidation('fate-result', true, '命运回响已通过输出合同校验');
    return text;
  } catch (error) {
    console.info('[AI] 命运回响未生成', error instanceof Error ? error.message : error);
    return null;
  }
}
