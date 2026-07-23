import { validateFateEvent, validateFreeFateResponse } from './fate';
import { validateOriginProfile, type OriginWheels } from './origins';
import type { FateDirection, FateEvent, FateResponse, LifeSnapshot, OriginKind, OriginProfile } from './types';

export type AIGenerationState = 'idle' | 'requesting' | 'gpt' | 'fallback' | 'error';

interface AIEnvelope {
  ok?: boolean;
  data?: unknown;
  model?: string;
  error?: string;
}

/** 抖音互动空间平台模型（火山方舟 doubao）——tt 路径与开发代理共用同款模型 */
const PLATFORM_AI_MODEL = 'doubao-seed-evolving';

/** 与 vite.config.ts 中的系统提示词保持一致；生产环境（tt 路径）在客户端拼装。 */
import { AI_SYSTEM_PROMPTS } from './ai-prompts';

interface TicAIChatOptions {
  type: 'text';
  model: string;
  stream: boolean;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  success: (res: { errMsg: string; data: string }) => void;
  fail: (err: { errMsg: string; errorCode?: number }) => void;
}

declare global {
  interface Window {
    tt?: { callAIChatCompletion?: (options: TicAIChatOptions) => void };
  }
}

function callPlatformAI(kind: keyof typeof AI_SYSTEM_PROMPTS, payload: unknown, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const api = window.tt?.callAIChatCompletion;
    if (!api) {
      reject(new Error('tt.callAIChatCompletion unavailable'));
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('platform_ai_timeout')); }
    }, timeoutMs);
    api({
      type: 'text',
      model: PLATFORM_AI_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPTS[kind] },
        { role: 'user', content: `输入JSON：${JSON.stringify(payload)}` },
      ],
      temperature: 0.9,
      maxTokens: 900,
      success: (res) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        try {
          const text = res.data.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
          resolve(JSON.parse(text));
        } catch {
          reject(new Error('platform_ai_invalid_json'));
        }
      },
      fail: (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(new Error(err.errMsg || 'platform_ai_failed'));
      },
    });
  });
}

async function requestAI(path: 'origin' | 'fate' | 'fate-result' | 'fate-free', payload: unknown, timeoutMs: number): Promise<unknown> {
  // 生产（抖音互动空间）：平台 AI 服务，零网络请求；开发/线上 demo：vite 代理直连方舟。
  // 此分支在 production 构建中被常量折叠整体剔除，平台上传包内不含 fetch 调用（平台审核红线）；
  // 线上演示站用 `vite build --mode demo` 构建以保留代理路径。
  if (window.tt?.callAIChatCompletion) {
    return callPlatformAI(path, payload, timeoutMs);
  }
  if (import.meta.env.DEV || import.meta.env.MODE === 'demo') {
    const controller = new AbortController();
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
      return envelope.data ?? envelope;
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw new Error('ai_unavailable');
}

export async function generateAIOrigin(runSeed: number, kind: OriginKind, requestNonce: string, wheels: OriginWheels): Promise<OriginProfile | null> {
  try {
    const raw = await requestAI('origin', { runSeed, kind, requestNonce, wheels }, 48000);
    const normalized = isRecord(raw) && typeof raw.story === 'string'
      ? { ...raw, story: raw.story.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean) }
      : raw;
    return validateOriginProfile(normalized, kind);
  } catch (error) {
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

function normalizeAIFate(value: unknown, snapshot: LifeSnapshot): unknown {
  if (!isRecord(value)) return value;
  const rawId = typeof value.id === 'string' ? value.id.trim().slice(0, 48) : '';
  const id = /^[a-z0-9_-]{3,48}$/i.test(rawId)
    ? rawId
    : `ai_fate_${snapshot.runSeed.toString(36)}_${snapshot.chapterIndex}`;
  const title = typeof value.title === 'string' && value.title.trim().length >= 2
    ? value.title.trim().slice(0, 16)
    : '没有预告的那天';
  const fact = typeof value.fact === 'string' && value.fact.trim().length >= 8
    ? value.fact.trim().slice(0, 90)
    : `${title}已经发生，所有人都像提前知道，只有他刚刚收到消息。`;
  const rawMemoryId = typeof value.memoryId === 'string' ? value.memoryId.trim().slice(0, 48) : '';
  const memoryId = /^[a-z0-9_-]{3,48}$/i.test(rawMemoryId) ? rawMemoryId : `remember_${id}`.slice(0, 48);
  const memoryText = typeof value.memoryText === 'string' && value.memoryText.trim().length >= 4
    ? value.memoryText.trim().slice(0, 60)
    : `记得${title}`;
  const scene = isRecord(value.scene) ? value.scene : {};
  const stageTimes = ['熄灯后的晚上', '一个上学日上午', '一个工作日傍晚', '一天晚饭前后', '一个加班的夜里', '一次复诊后的下午'];
  const stagePlaces = ['家中卧室', '学校教室', '车站与出租屋之间', '家里的饭桌旁', '办公室', '病房走廊'];
  const stagePeople = ['他和家里人', '他、同学和老师', '他、同龄人和办事的人', '他和家人', '他、同事和主管', '他、家人和医护人员'];
  const sceneIndex = Math.min(stagePlaces.length - 1, Math.max(0, snapshot.chapterIndex));
  const sceneTime = typeof scene.time === 'string' && scene.time.trim().length >= 2
    ? scene.time.trim().slice(0, 18)
    : (stageTimes[sceneIndex] ?? `${snapshot.age}的一天`);
  const scenePlace = typeof scene.place === 'string' && scene.place.trim().length >= 2
    ? scene.place.trim().slice(0, 24)
    : (stagePlaces[sceneIndex] ?? '这一段人生里');
  const scenePeople = typeof scene.people === 'string' && scene.people.trim().length >= 2
    ? scene.people.trim().slice(0, 28)
    : (stagePeople[sceneIndex] ?? '他和家里人');
  return {
    ...value,
    id,
    title,
    fact,
    memoryId,
    memoryText,
    scene: { time: sceneTime, place: scenePlace, people: scenePeople },
    swallow: normalizeAIResponse(value.swallow),
    exhale: normalizeAIResponse(value.exhale),
  };
}

function isGroundedFateNarrative(event: FateEvent): boolean {
  const fact = event.fact;
  const sentenceCount = (fact.match(/[。！？]/g) ?? []).length;
  const impossible = /(魔法|灵异|鬼魂|幽灵|诅咒|穿越|异世界|超能力|情书.{0,6}(说话|开口|呼吸|响|叫)|信封?.{0,6}(说话|开口|呼吸)|衣服.{0,6}(说话|开口|呼吸)|照片.{0,6}(说话|开口|呼吸|自己动))/;
  return fact.includes(event.scene.time)
    && fact.includes(event.scene.place)
    && fact.includes('他')
    && sentenceCount >= 2
    && !impossible.test(fact);
}

export async function generateAIFate(snapshot: LifeSnapshot): Promise<FateEvent | null> {
  // Fate is prefetched while the chapter is still running, so spend that
  // otherwise-idle time on one retry. A transient upstream error or one
  // schema-invalid completion should not silently turn an AI run local.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await requestAI('fate', { snapshot }, 29000);
      const event = validateFateEvent(normalizeAIFate(raw, snapshot), snapshot);
      if (event && isGroundedFateNarrative(event)) return event;
      console.info(`[AI] 命运事件格式或现实逻辑未通过，正在重写 ${attempt}/3`);
    } catch (error) {
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
  event: { id: string; title: string; fact: string };
  playerText: string;
  snapshot: LifeSnapshot;
}): Promise<{ direction: FateDirection; response: FateResponse } | null> {
  try {
    const raw = await requestAI('fate-free', payload, 25000);
    return validateFreeFateResponse(raw);
  } catch (error) {
    console.info('[AI] 亲口回应未生成', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function generateAIFateResult(payload: {
  event: { id: string; title: string; fact: string };
  direction: FateDirection;
  response: { label: string; effect: string; result: string };
  snapshot: LifeSnapshot;
}): Promise<string | null> {
  try {
    const raw = await requestAI('fate-result', payload, 20000);
    if (!isRecord(raw) || typeof raw.text !== 'string') return null;
    const text = raw.text.trim().replace(/\s+/g, ' ');
    if (text.length < 8 || text.length > 90) return null;
    return text;
  } catch (error) {
    console.info('[AI] 命运回响未生成', error instanceof Error ? error.message : error);
    return null;
  }
}
