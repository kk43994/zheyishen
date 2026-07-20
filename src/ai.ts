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

export async function generateAIFate(snapshot: LifeSnapshot): Promise<FateEvent | null> {
  try {
    const raw = await requestAI('fate', { snapshot }, 29000);
    return validateFateEvent(raw, snapshot);
  } catch (error) {
    console.info('[AI] 命运事件回退到本地', error instanceof Error ? error.message : error);
    return null;
  }
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
