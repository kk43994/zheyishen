import { validateFateEvent } from './fate';
import { FATE_ITEM_IDS, getItem, ITEM_IDS } from './relics';
import { validateOriginProfile } from './origins';
import type {
  FateDirection,
  FateEvent,
  FateReceipt,
  ItemId,
  LifeSnapshot,
  OriginKind,
  OriginProfile,
  PoisonVector,
  RunStats,
  ShopOffer,
  SpecialRoomKind,
} from './types';

const STORAGE_KEY = 'zys-run-checkpoint-v1';
const CHECKPOINT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export type CheckpointScreen = 'origin' | 'battle' | 'fateEvent' | 'itemReward' | 'shop' | 'specialRoom';
export type CheckpointRewardDestination = 'start' | 'advance' | 'battle';
export type CheckpointFateDestination = 'advance' | 'battle' | 'shop';

export interface CheckpointHero {
  hp: number;
  maxHp: number;
  block: number;
  coins: number;
}

export interface CheckpointFateBuild {
  damageMul: number;
  intervalMul: number;
  rangeMul: number;
  widthMul: number;
  speedMul: number;
  countAdd: number;
  homingAdd: number;
  returning: boolean;
  openingBlock: number;
  storedVolleys: number;
  delayFirstHit: boolean;
  missingHpDamage: number;
  moveSpeedMul: number;
}

export interface CheckpointRewardAcquire {
  id: ItemId;
  index: number;
  timer: number;
  total: number;
  destination: CheckpointRewardDestination;
}

export interface CheckpointPersistentState {
  firstFateDamageReduction: number;
  strainTendency: number;
  lightTendency: number;
  phoneCharges: number;
  voiceCharges: number;
  ruCharges: number;
  noBuyStacks: number;
  deathSaves: number;
  heartCount: number;
  petGone: boolean;
  graceUsed: boolean;
  coinKillProgress: number;
  comboSeen: string[];
  synergySeen: string[];
}

export interface RunCheckpoint {
  version: 1;
  savedAt: number;
  screen: CheckpointScreen;
  runSeed: number;
  rngState: number;
  encounterIndex: number;
  requestedOriginKind: OriginKind;
  origin: OriginProfile;
  hero: CheckpointHero;
  items: ItemId[];
  poisons: PoisonVector;
  memories: string[];
  fateReceipts: FateReceipt[];
  stats: RunStats;
  fateBuild: CheckpointFateBuild;
  persistent: CheckpointPersistentState;
  battleTime: number;
  currentFate?: FateEvent;
  fateDestination: CheckpointFateDestination;
  fateResultDirection?: FateDirection;
  initialItemReward: boolean;
  rewardTitle: string;
  rewardReturn: 'battle' | 'advance';
  itemRewardChoices: ItemId[];
  itemRewardFocus: number;
  rewardAcquire?: CheckpointRewardAcquire;
  shopOffers: ShopOffer[];
  shopFocus: number;
  boughtThisShop: boolean;
  specialRoomKind: SpecialRoomKind;
  specialRoomOffers: ItemId[];
  specialRoomTaken: ItemId[];
  specialRoomFocus: number;
}

const SCREENS: CheckpointScreen[] = ['origin', 'battle', 'fateEvent', 'itemReward', 'shop', 'specialRoom'];
const ORIGIN_KINDS: OriginKind[] = ['ordinary', 'mixed', 'favored', 'harsh'];
const FATE_DESTINATIONS: CheckpointFateDestination[] = ['advance', 'battle', 'shop'];
const REWARD_DESTINATIONS: CheckpointRewardDestination[] = ['start', 'advance', 'battle'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(finite(value, fallback, min, max));
}

function strings(value: unknown, maxEntries: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(-maxEntries);
}

function itemIds(value: unknown, maxEntries = ITEM_IDS.length): ItemId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is ItemId => (
    typeof entry === 'string' && ITEM_IDS.includes(entry as ItemId)
  )))].slice(0, maxEntries);
}

function poisonVector(value: unknown): PoisonVector {
  const input = isRecord(value) ? value : {};
  return {
    greed: integer(input.greed, 0, 0, 12),
    anger: integer(input.anger, 0, 0, 12),
    delusion: integer(input.delusion, 0, 0, 12),
    pride: integer(input.pride, 0, 0, 12),
    doubt: integer(input.doubt, 0, 0, 12),
  };
}

function runStats(value: unknown): RunStats {
  const input = isRecord(value) ? value : {};
  return {
    fateChoices: integer(input.fateChoices, 0, 0, 12),
    swallowed: integer(input.swallowed, 0, 0, 12),
    exhaled: integer(input.exhaled, 0, 0, 12),
    volleys: integer(input.volleys, 0, 0, 1_000_000),
    kills: integer(input.kills, 0, 0, 1_000_000),
    damage: finite(input.damage, 0, 0, 100_000_000),
    itemsTaken: integer(input.itemsTaken, 0, 0, ITEM_IDS.length),
    coinsSpent: integer(input.coinsSpent, 0, 0, 100_000),
  };
}

function fateBuild(value: unknown): CheckpointFateBuild {
  const input = isRecord(value) ? value : {};
  return {
    damageMul: finite(input.damageMul, 1, 0.1, 10),
    intervalMul: finite(input.intervalMul, 1, 0.1, 10),
    rangeMul: finite(input.rangeMul, 1, 0.1, 10),
    widthMul: finite(input.widthMul, 1, 0.1, 10),
    speedMul: finite(input.speedMul, 1, 0.1, 10),
    countAdd: integer(input.countAdd, 0, 0, 12),
    homingAdd: finite(input.homingAdd, 0, 0, 1),
    returning: input.returning === true,
    openingBlock: integer(input.openingBlock, 0, 0, 99),
    storedVolleys: integer(input.storedVolleys, 0, 0, 12),
    delayFirstHit: input.delayFirstHit === true,
    missingHpDamage: finite(input.missingHpDamage, 0, 0, 2),
    moveSpeedMul: finite(input.moveSpeedMul, 1, 0.1, 5),
  };
}

function shopOffers(value: unknown): ShopOffer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.item !== 'string' || !ITEM_IDS.includes(entry.item as ItemId)) return [];
    return [{
      item: entry.item as ItemId,
      price: integer(entry.price, 1, 1, 999),
      sold: entry.sold === true,
    }];
  }).slice(0, 3);
}

function rewardAcquire(value: unknown): CheckpointRewardAcquire | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !ITEM_IDS.includes(value.id as ItemId)) return undefined;
  const destination = typeof value.destination === 'string' && REWARD_DESTINATIONS.includes(value.destination as CheckpointRewardDestination)
    ? value.destination as CheckpointRewardDestination
    : null;
  if (!destination) return undefined;
  const total = finite(value.total, 0.85, 0.1, 2);
  return {
    id: value.id as ItemId,
    index: integer(value.index, 0, 0, 2),
    timer: finite(value.timer, total, 0, total),
    total,
    destination,
  };
}

function persistentState(value: unknown): CheckpointPersistentState {
  const input = isRecord(value) ? value : {};
  return {
    firstFateDamageReduction: finite(input.firstFateDamageReduction, 0, 0, 24),
    strainTendency: integer(input.strainTendency, 0, 0, 99),
    lightTendency: integer(input.lightTendency, 0, 0, 99),
    phoneCharges: integer(input.phoneCharges, 0, 0, 8),
    voiceCharges: integer(input.voiceCharges, 0, 0, 8),
    ruCharges: integer(input.ruCharges, 0, 0, 8),
    noBuyStacks: integer(input.noBuyStacks, 0, 0, 12),
    deathSaves: integer(input.deathSaves, 0, 0, 3),
    heartCount: integer(input.heartCount, 0, 0, 12),
    petGone: input.petGone === true,
    graceUsed: input.graceUsed === true,
    coinKillProgress: finite(input.coinKillProgress, 0, 0, 5),
    comboSeen: strings(input.comboSeen, 24, 48),
    synergySeen: strings(input.synergySeen, 32, 64),
  };
}

function validationSnapshot(
  runSeed: number,
  encounterIndex: number,
  hero: CheckpointHero,
  items: ItemId[],
  poisons: PoisonVector,
  memories: string[],
  stats: RunStats,
): LifeSnapshot {
  return {
    runSeed,
    chapterIndex: encounterIndex,
    chapter: '恢复中的人生阶段',
    age: ['童年', '少年', '青年', '成年', '中年', '晚年'][encounterIndex] ?? '晚年',
    hp: Math.round(hero.hp),
    maxHp: hero.maxHp,
    coins: hero.coins,
    items: items.map((id) => {
      const item = getItem(id);
      return { id, name: item.name, summary: item.summary, positive: item.positive, negative: item.negative };
    }),
    attack: {
      damage: 6.2, fireInterval: 0.72, range: 232, width: 4.6, projectileSpeed: 280,
      projectileCount: 1, spread: 0.15, pierce: 0, lifetime: 2.4, knockback: 7,
      critChance: 0.05, returning: false, homing: 0, splitChance: 0, explosion: 0, bloodOnHit: 0,
    },
    poisons,
    memories: memories.slice(-10),
    recentEvents: [],
    fateItemCandidates: [...FATE_ITEM_IDS],
    swallowCount: stats.swallowed,
    exhaleCount: stats.exhaled,
  };
}

function parseCheckpoint(value: unknown): RunCheckpoint | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const savedAt = finite(value.savedAt, 0, 0, Number.MAX_SAFE_INTEGER);
  if (savedAt <= 0 || Date.now() - savedAt > CHECKPOINT_MAX_AGE) return null;
  const screen = typeof value.screen === 'string' && SCREENS.includes(value.screen as CheckpointScreen)
    ? value.screen as CheckpointScreen
    : null;
  const requestedOriginKind = typeof value.requestedOriginKind === 'string' && ORIGIN_KINDS.includes(value.requestedOriginKind as OriginKind)
    ? value.requestedOriginKind as OriginKind
    : null;
  const origin = requestedOriginKind ? validateOriginProfile(value.origin, requestedOriginKind) : null;
  if (!screen || !requestedOriginKind || !origin) return null;

  const runSeed = integer(value.runSeed, 0, 1, 0xffffffff);
  const rngState = integer(value.rngState, runSeed, 0, 0xffffffff);
  const encounterIndex = integer(value.encounterIndex, 0, 0, 5);
  const heroValue = isRecord(value.hero) ? value.hero : {};
  const maxHp = finite(heroValue.maxHp, 80, 20, 9999);
  const hero: CheckpointHero = {
    hp: finite(heroValue.hp, maxHp, 0, maxHp),
    maxHp,
    block: finite(heroValue.block, 0, 0, 999),
    coins: integer(heroValue.coins, 0, 0, 9999),
  };
  const items = itemIds(value.items);
  const poisons = poisonVector(value.poisons);
  const memories = strings(value.memories, 20, 120);
  const stats = runStats(value.stats);
  const snapshot = validationSnapshot(runSeed, encounterIndex, hero, items, poisons, memories, stats);

  const receiptValues = Array.isArray(value.fateReceipts) ? value.fateReceipts.slice(-8) : [];
  const fateReceipts: FateReceipt[] = [];
  for (const entry of receiptValues) {
    if (!isRecord(entry)) return null;
    const event = validateFateEvent(entry.event, snapshot);
    const direction = entry.direction === 'swallow' || entry.direction === 'exhale' ? entry.direction : null;
    const result = typeof entry.result === 'string' ? entry.result.trim().slice(0, 120) : '';
    if (!event || !direction || !result) return null;
    fateReceipts.push({ event, direction, result });
  }
  const currentFate = value.currentFate === undefined ? undefined : validateFateEvent(value.currentFate, snapshot) ?? undefined;
  if (screen === 'fateEvent' && !currentFate) return null;

  const fateDestination = typeof value.fateDestination === 'string' && FATE_DESTINATIONS.includes(value.fateDestination as CheckpointFateDestination)
    ? value.fateDestination as CheckpointFateDestination
    : 'advance';
  const fateResultDirection = value.fateResultDirection === 'swallow' || value.fateResultDirection === 'exhale'
    ? value.fateResultDirection
    : undefined;
  const specialRoomKind: SpecialRoomKind = value.specialRoomKind === 'back' ? 'back' : 'light';
  const rewardReturn = value.rewardReturn === 'battle' ? 'battle' : 'advance';

  return {
    version: 1,
    savedAt,
    screen,
    runSeed,
    rngState,
    encounterIndex,
    requestedOriginKind,
    origin,
    hero,
    items,
    poisons,
    memories,
    fateReceipts,
    stats,
    fateBuild: fateBuild(value.fateBuild),
    persistent: persistentState(value.persistent),
    battleTime: finite(value.battleTime, 0, 0, 600),
    currentFate,
    fateDestination,
    fateResultDirection,
    initialItemReward: value.initialItemReward === true,
    rewardTitle: typeof value.rewardTitle === 'string' ? value.rewardTitle.trim().slice(0, 64) : '',
    rewardReturn,
    itemRewardChoices: itemIds(value.itemRewardChoices, 3),
    itemRewardFocus: integer(value.itemRewardFocus, 0, 0, 2),
    rewardAcquire: rewardAcquire(value.rewardAcquire),
    shopOffers: shopOffers(value.shopOffers),
    shopFocus: integer(value.shopFocus, 0, 0, 4),
    boughtThisShop: value.boughtThisShop === true,
    specialRoomKind,
    specialRoomOffers: itemIds(value.specialRoomOffers, 3),
    specialRoomTaken: itemIds(value.specialRoomTaken, 3),
    specialRoomFocus: integer(value.specialRoomFocus, 0, 0, 2),
  };
}

export function readRunCheckpoint(): RunCheckpoint | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseCheckpoint(JSON.parse(raw));
    if (!parsed) window.localStorage.removeItem(STORAGE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export function writeRunCheckpoint(checkpoint: RunCheckpoint): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checkpoint));
    return true;
  } catch {
    return false;
  }
}

export function clearRunCheckpoint(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Some embedded browsers disable storage; the run remains playable without resume.
  }
}
