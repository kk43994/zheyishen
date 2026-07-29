import { ITEM_IDS } from './relics';
import type { ItemId } from './types';

export const LIFE_LEDGER_STORAGE_KEY = 'zys-ledger-v1';
export const LIFE_LEDGER_LIMIT = 30;

export interface LifeLedgerEntry {
  runSeed: number;
  nickname: string;
  title: string;
  reachedStage: number;
  reachedAge: string;
  endedBy: string;
  items: ItemId[];
  lastEcho: string;
  won: boolean;
  /**
   * 这一世是否杀死了收灯人。收灯人的职责就是收走你这一身；杀了他，
   * 东西没被收走，下一局开局直接带一件传下来——这是隐藏结局的特殊加成。
   * 旧存档没有这个字段，按 false 处理。
   */
  keeperSlain: boolean;
  recordedAt: number;
}

function cleanText(value: unknown, fallback: string, maxLength = 120): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function parseEntry(value: unknown): LifeLedgerEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Record<keyof LifeLedgerEntry, unknown>>;
  if (typeof raw.runSeed !== 'number' || !Number.isFinite(raw.runSeed)) return null;
  const reachedStage = typeof raw.reachedStage === 'number' && Number.isFinite(raw.reachedStage)
    ? Math.max(0, Math.min(5, Math.floor(raw.reachedStage)))
    : 0;
  const items = Array.isArray(raw.items)
    ? raw.items.filter((id): id is ItemId => typeof id === 'string' && ITEM_IDS.includes(id as ItemId)).slice(0, 77)
    : [];
  return {
    runSeed: raw.runSeed >>> 0,
    nickname: cleanText(raw.nickname, '没有留下外号的人', 32),
    title: cleanText(raw.title, '没有留下名字的人', 48),
    reachedStage,
    reachedAge: cleanText(raw.reachedAge, '童年', 12),
    endedBy: cleanText(raw.endedBy, '没能走到下一页', 48),
    items,
    lastEcho: cleanText(raw.lastEcho, '没有留下最后一句。', 180),
    won: raw.won === true,
    keeperSlain: raw.keeperSlain === true,
    recordedAt: typeof raw.recordedAt === 'number' && Number.isFinite(raw.recordedAt) ? raw.recordedAt : 0,
  };
}

export function readLifeLedger(): LifeLedgerEntry[] {
  try {
    const raw = window.localStorage.getItem(LIFE_LEDGER_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseEntry).filter((entry): entry is LifeLedgerEntry => Boolean(entry)).slice(0, LIFE_LEDGER_LIMIT);
  } catch {
    return [];
  }
}

export function appendLifeLedger(entry: LifeLedgerEntry): LifeLedgerEntry[] {
  const next = [entry, ...readLifeLedger()].slice(0, LIFE_LEDGER_LIMIT);
  try {
    window.localStorage.setItem(LIFE_LEDGER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Embedded browsers may disable storage; ending the run must still work.
  }
  return next;
}
