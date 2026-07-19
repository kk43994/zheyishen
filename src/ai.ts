import { validateFateEvent, validateFreeFateResponse } from './fate';
import { validateOriginProfile } from './origins';
import type { FateDirection, FateEvent, FateResponse, LifeSnapshot, OriginKind, OriginProfile } from './types';

export type AIGenerationState = 'idle' | 'requesting' | 'gpt' | 'fallback' | 'error';

interface AIEnvelope {
  ok?: boolean;
  data?: unknown;
  model?: string;
  error?: string;
}

async function requestAI(path: 'origin' | 'fate' | 'fate-result' | 'fate-free', payload: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`/api/ai/${path}`, {
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

export async function generateAIOrigin(runSeed: number, kind: OriginKind, requestNonce: string): Promise<OriginProfile | null> {
  try {
    const raw = await requestAI('origin', { runSeed, kind, requestNonce }, 48000);
    const normalized = isRecord(raw) && typeof raw.story === 'string'
      ? { ...raw, story: raw.story.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean) }
      : raw;
    return validateOriginProfile(normalized);
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
