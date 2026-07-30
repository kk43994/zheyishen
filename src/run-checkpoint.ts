import { validateFateEvent } from './fate';
import { LIFE_STAGE_CANON } from './life-stage';
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

export const RUN_CHECKPOINT_VERSION = 2 as const;
export const RUN_CHECKPOINT_STORAGE_KEY = 'zys-run-checkpoint-v2';
const LEGACY_STORAGE_KEYS = ['zys-run-checkpoint-v1'] as const;
const INVALID_BACKUP_KEY = 'zys-run-checkpoint-invalid-backup-v1';
const CHECKPOINT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export type CheckpointScreen = 'origin' | 'battle' | 'fateEvent' | 'itemReward' | 'storyDrop' | 'shop' | 'specialRoom';
export type CheckpointRewardDestination = 'start' | 'advance' | 'battle';
export type CheckpointFateDestination = 'advance' | 'battle' | 'shop';
export type CheckpointBossType = 'closet-dark' | 'silent-father' | 'praise-chair' | 'ringing-phone' | 'debt-collector';

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

export interface CheckpointPreparedFate {
  encounterIndex: number;
  event: FateEvent;
}

export interface CheckpointPendingFreeFate {
  encounterIndex: number;
  event: FateEvent;
  direction: FateDirection;
  playerText: string;
  fateItemCandidates: ItemId[];
}

/**
 * 只保存 Boss 战可公平重建的稳定进度；前摇、弹道和召唤物属于瞬态，
 * 恢复时统一清掉，避免把玩家放回无法躲避的结算帧。
 */
export interface CheckpointBossState {
  type: CheckpointBossType;
  hpRatio: number;
  offsetX: number;
  offsetY: number;
  phase: number;
  mechTimer: number;
  voiceStage: number;
  relocateDamage: number;
  phoneStoryIndex: number;
  phoneMissed: number;
  phoneRelief: number;
  praiseMoveIndex: number;
  praiseOneSeatUsed: boolean;
  closetMoveIndex: number;
  bingDebt: number;
  bingPenaltyTimer: number;
  fatherCycleIndex: number;
  fatherSecondPhaseLineShown: boolean;
  fatherCoatOffsetX?: number;
  fatherCoatOffsetY?: number;
  collectorBillInterest: number;
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
  oneMoreStacks: number;
  helpedXiaoZhang: boolean;
  xiaoZhangBetrayed: boolean;
  xiaoZhangDecision: 'none' | 'helped' | 'declined';
  comboSeen: string[];
  synergySeen: string[];
  /** 以下为 2026-07-29 断点审阅补齐的字段；旧档缺省走安全默认值。 */
  praiseDamage: number;
  praiseFire: number;
  praiseMove: number;
  praiseSpawnCount: number;
  razorScars: number;
  drankLayers: number;
  drankStoredDamage: number;
  xiaoZhangHelpedAt: number;
  schoolEliteDefeatedAt: number;
  stageEliteDefeated: boolean;
  stageBossDefeated: boolean;
  stallSpawnedAt: number;
  rewardSpawnedAt: number;
  doorUsed: boolean;
  finalFateTriggered: boolean;
  voiceCuesSeen: string[];
}

export interface RunCheckpoint {
  version: typeof RUN_CHECKPOINT_VERSION;
  savedAt: number;
  screen: CheckpointScreen;
  runSeed: number;
  rngState: number;
  encounterIndex: number;
  requestedOriginKind: OriginKind;
  origin: OriginProfile;
  hero: CheckpointHero;
  items: ItemId[];
  /** 终局收灯流程中已经实际归还的物证；旧档缺省为空。 */
  returnedItemIds: ItemId[];
  poisons: PoisonVector;
  memories: string[];
  /** 本局已经在战场上浮现过的记忆；旧档缺省为空。 */
  recalledMemories: string[];
  fateReceipts: FateReceipt[];
  stats: RunStats;
  fateBuild: CheckpointFateBuild;
  persistent: CheckpointPersistentState;
  battleTime: number;
  /** 累计永久损失的最大生命（病历本伤害加成的依据）。旧档缺省 0。 */
  permanentHpLost: number;
  currentFate?: FateEvent;
  /** 已完成校验、可以在触发帧同步消费的命运牌；不保存进行中的请求。 */
  preparedFate?: CheckpointPreparedFate;
  /** 玩家已经亲口说出、但 AI 回执尚未兑现的命运；恢复后会在后台重新请求。 */
  pendingFreeFate?: CheckpointPendingFreeFate;
  /** 活跃大 Boss 的稳定恢复点；旧档缺省为无。 */
  boss?: CheckpointBossState;
  fateDestination: CheckpointFateDestination;
  fateResultDirection?: FateDirection;
  /** 后台回执关闭后只回战斗，不得再次推进关卡。 */
  fateResultReturn?: 'destination' | 'battle';
  fatePlayerText?: string;
  fateDisplayEncounterIndex?: number;
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
  /** 最近一世插入留灯间的物证；旧存档缺省为空。 */
  specialRoomPreviousLifeItem?: ItemId;
}

const SCREENS: CheckpointScreen[] = ['origin', 'battle', 'fateEvent', 'itemReward', 'storyDrop', 'shop', 'specialRoom'];
const ORIGIN_KINDS: OriginKind[] = ['ordinary', 'mixed', 'favored', 'harsh'];
const FATE_DESTINATIONS: CheckpointFateDestination[] = ['advance', 'battle', 'shop'];
const REWARD_DESTINATIONS: CheckpointRewardDestination[] = ['start', 'advance', 'battle'];
// 《入学通知书》会把章中奖励从三选一扩成四选一；断点边界必须覆盖第 4 张卡。
const MAX_REWARD_CHOICES = 4;
const BOSS_TYPES: CheckpointBossType[] = ['closet-dark', 'silent-father', 'praise-chair', 'ringing-phone', 'debt-collector'];

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
    index: integer(value.index, 0, 0, MAX_REWARD_CHOICES - 1),
    timer: finite(value.timer, total, 0, total),
    total,
    destination,
  };
}

function checkpointBossState(value: unknown): CheckpointBossState | undefined {
  if (!isRecord(value) || typeof value.type !== 'string'
    || !BOSS_TYPES.includes(value.type as CheckpointBossType)) return undefined;
  const coatX = typeof value.fatherCoatOffsetX === 'number' && Number.isFinite(value.fatherCoatOffsetX)
    ? finite(value.fatherCoatOffsetX, 0, -480, 480)
    : undefined;
  const coatY = typeof value.fatherCoatOffsetY === 'number' && Number.isFinite(value.fatherCoatOffsetY)
    ? finite(value.fatherCoatOffsetY, 0, -480, 480)
    : undefined;
  return {
    type: value.type as CheckpointBossType,
    hpRatio: finite(value.hpRatio, 1, 0.01, 1),
    offsetX: finite(value.offsetX, 0, -480, 480),
    offsetY: finite(value.offsetY, -180, -480, 480),
    phase: integer(value.phase, 1, 1, 3),
    mechTimer: finite(value.mechTimer, 0, 0, 30),
    voiceStage: integer(value.voiceStage, 0, 0, 2),
    relocateDamage: finite(value.relocateDamage, 0, 0, 9999),
    phoneStoryIndex: integer(value.phoneStoryIndex, 0, 0, 7),
    phoneMissed: integer(value.phoneMissed, 0, 0, 999),
    phoneRelief: integer(value.phoneRelief, 0, 0, 99),
    praiseMoveIndex: integer(value.praiseMoveIndex, 0, 0, 999),
    praiseOneSeatUsed: value.praiseOneSeatUsed === true,
    closetMoveIndex: integer(value.closetMoveIndex, 0, 0, 999),
    bingDebt: integer(value.bingDebt, 0, 0, 99),
    bingPenaltyTimer: finite(value.bingPenaltyTimer, 0, 0, 600),
    fatherCycleIndex: integer(value.fatherCycleIndex, 0, 0, 999),
    fatherSecondPhaseLineShown: value.fatherSecondPhaseLineShown === true,
    fatherCoatOffsetX: coatX,
    fatherCoatOffsetY: coatY,
    collectorBillInterest: integer(value.collectorBillInterest, 0, 0, 99),
  };
}

function persistentState(value: unknown): CheckpointPersistentState {
  const input = isRecord(value) ? value : {};
  const xiaoZhangDecision = input.xiaoZhangDecision === 'helped' || input.xiaoZhangDecision === 'declined'
    ? input.xiaoZhangDecision
    : input.helpedXiaoZhang === true
      ? 'helped'
      : 'none';
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
    oneMoreStacks: integer(input.oneMoreStacks, 0, 0, 5),
    helpedXiaoZhang: xiaoZhangDecision === 'helped',
    xiaoZhangBetrayed: input.xiaoZhangBetrayed === true,
    xiaoZhangDecision,
    comboSeen: strings(input.comboSeen, 24, 48),
    synergySeen: strings(input.synergySeen, 32, 64),
    praiseDamage: finite(input.praiseDamage, 0, 0, 0.96),
    praiseFire: finite(input.praiseFire, 0, 0, 0.96),
    praiseMove: finite(input.praiseMove, 0, 0, 0.6),
    praiseSpawnCount: integer(input.praiseSpawnCount, 0, 0, 999),
    razorScars: integer(input.razorScars, 0, 0, 99),
    drankLayers: integer(input.drankLayers, 0, 0, 99),
    drankStoredDamage: finite(input.drankStoredDamage, 0, 0, 999),
    xiaoZhangHelpedAt: finite(input.xiaoZhangHelpedAt, 0, 0, 600),
    schoolEliteDefeatedAt: finite(input.schoolEliteDefeatedAt, 0, 0, 600),
    stageEliteDefeated: input.stageEliteDefeated === true,
    stageBossDefeated: input.stageBossDefeated === true,
    stallSpawnedAt: integer(input.stallSpawnedAt, -1, -1, 7),
    rewardSpawnedAt: integer(input.rewardSpawnedAt, -1, -1, 7),
    doorUsed: input.doorUsed === true,
    finalFateTriggered: input.finalFateTriggered === true,
    voiceCuesSeen: strings(input.voiceCuesSeen, 40, 128),
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
  const stage = LIFE_STAGE_CANON[encounterIndex] ?? LIFE_STAGE_CANON[LIFE_STAGE_CANON.length - 1]!;
  return {
    runSeed,
    chapterIndex: encounterIndex,
    chapter: '恢复中的人生阶段',
    age: stage.age,
    stageFocus: stage.focus,
    stageBossMeaning: stage.bossMeaning,
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
    recentFateRecipes: [],
    fateItemCandidates: [...FATE_ITEM_IDS],
    swallowCount: stats.swallowed,
    exhaleCount: stats.exhaled,
  };
}

export function parseRunCheckpoint(value: unknown): RunCheckpoint | null {
  if (!isRecord(value) || (value.version !== 1 && value.version !== RUN_CHECKPOINT_VERSION)) return null;
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
  const returnedItemIds = itemIds(value.returnedItemIds);
  const poisons = poisonVector(value.poisons);
  const memories = strings(value.memories, 20, 120);
  const recalledMemories = strings(value.recalledMemories, 20, 120)
    .filter((line) => memories.includes(line));
  const stats = runStats(value.stats);
  const snapshot = validationSnapshot(runSeed, encounterIndex, hero, items, poisons, memories, stats);
  const fateResultReturn = value.fateResultReturn === 'battle' ? 'battle' : 'destination';
  const fatePlayerText = typeof value.fatePlayerText === 'string'
    ? value.fatePlayerText.trim().replace(/\s+/g, ' ').slice(0, 24)
    : '';
  const fateDisplayEncounterIndex = value.fateDisplayEncounterIndex === undefined
    ? undefined
    : integer(value.fateDisplayEncounterIndex, encounterIndex, 0, 5);

  const receiptValues = Array.isArray(value.fateReceipts) ? value.fateReceipts.slice(-8) : [];
  const fateReceipts: FateReceipt[] = [];
  for (const entry of receiptValues) {
    if (!isRecord(entry)) return null;
    let event = validateFateEvent(entry.event, snapshot, { allowAlreadyOwnedFateItem: true });
    if (!event) {
      for (let historicalIndex = 0; historicalIndex < LIFE_STAGE_CANON.length; historicalIndex += 1) {
        const historicalSnapshot = validationSnapshot(
          runSeed,
          historicalIndex,
          hero,
          items,
          poisons,
          memories,
          stats,
        );
        event = validateFateEvent(entry.event, historicalSnapshot, { allowAlreadyOwnedFateItem: true });
        if (event) break;
      }
    }
    const direction = entry.direction === 'swallow' || entry.direction === 'exhale' ? entry.direction : null;
    const result = typeof entry.result === 'string' ? entry.result.trim().slice(0, 120) : '';
    const echo = typeof entry.echo === 'string' ? entry.echo.trim().slice(0, 90) : '';
    const playerText = typeof entry.playerText === 'string'
      ? entry.playerText.trim().replace(/\s+/g, ' ').slice(0, 24)
      : '';
    if (!event || !direction || !result) return null;
    fateReceipts.push({
      event,
      direction,
      result,
      echo: echo || undefined,
      playerText: playerText || undefined,
    });
  }
  const currentFateSnapshot = fateResultReturn === 'battle' && fateDisplayEncounterIndex !== undefined
    ? validationSnapshot(runSeed, fateDisplayEncounterIndex, hero, items, poisons, memories, stats)
    : snapshot;
  const currentFate = value.currentFate === undefined
    ? undefined
    : validateFateEvent(value.currentFate, currentFateSnapshot, { allowAlreadyOwnedFateItem: true }) ?? undefined;
  if (screen === 'fateEvent' && !currentFate) return null;
  let preparedFate: CheckpointPreparedFate | undefined;
  if (isRecord(value.preparedFate)) {
    const preparedEncounterIndex = integer(value.preparedFate.encounterIndex, encounterIndex, 0, 5);
    const preparedEvent = preparedEncounterIndex === encounterIndex
      ? validateFateEvent(value.preparedFate.event, snapshot)
      : null;
    if (preparedEvent) preparedFate = { encounterIndex: preparedEncounterIndex, event: preparedEvent };
  }
  let pendingFreeFate: CheckpointPendingFreeFate | undefined;
  if (isRecord(value.pendingFreeFate)) {
    const pendingEncounterIndex = integer(value.pendingFreeFate.encounterIndex, encounterIndex, 0, 5);
    const pendingSnapshot = validationSnapshot(runSeed, pendingEncounterIndex, hero, items, poisons, memories, stats);
    const pendingEvent = validateFateEvent(
      value.pendingFreeFate.event,
      pendingSnapshot,
      { allowAlreadyOwnedFateItem: true },
    );
    const pendingDirection = value.pendingFreeFate.direction === 'swallow'
      || value.pendingFreeFate.direction === 'exhale'
      ? value.pendingFreeFate.direction
      : null;
    const pendingPlayerText = typeof value.pendingFreeFate.playerText === 'string'
      ? value.pendingFreeFate.playerText.trim().replace(/\s+/g, ' ').slice(0, 24)
      : '';
    if (pendingEvent && pendingDirection && pendingPlayerText) {
      pendingFreeFate = {
        encounterIndex: pendingEncounterIndex,
        event: pendingEvent,
        direction: pendingDirection,
        playerText: pendingPlayerText,
        fateItemCandidates: itemIds(value.pendingFreeFate.fateItemCandidates, 3)
          .filter((id) => FATE_ITEM_IDS.includes(id)),
      };
    }
  }

  const fateDestination = typeof value.fateDestination === 'string' && FATE_DESTINATIONS.includes(value.fateDestination as CheckpointFateDestination)
    ? value.fateDestination as CheckpointFateDestination
    : 'advance';
  const fateResultDirection = value.fateResultDirection === 'swallow' || value.fateResultDirection === 'exhale'
    ? value.fateResultDirection
    : undefined;
  const specialRoomKind: SpecialRoomKind = value.specialRoomKind === 'back' ? 'back' : 'light';
  const rewardReturn = value.rewardReturn === 'battle' ? 'battle' : 'advance';

  return {
    version: RUN_CHECKPOINT_VERSION,
    savedAt,
    screen,
    runSeed,
    rngState,
    encounterIndex,
    requestedOriginKind,
    origin,
    hero,
    items,
    returnedItemIds,
    poisons,
    memories,
    recalledMemories,
    fateReceipts,
    stats,
    fateBuild: fateBuild(value.fateBuild),
    persistent: persistentState(value.persistent),
    battleTime: finite(value.battleTime, 0, 0, 600),
    permanentHpLost: finite(value.permanentHpLost, 0, 0, 999),
    currentFate,
    preparedFate,
    pendingFreeFate,
    boss: checkpointBossState(value.boss),
    fateDestination,
    fateResultDirection,
    fateResultReturn,
    fatePlayerText: fatePlayerText || undefined,
    fateDisplayEncounterIndex,
    initialItemReward: value.initialItemReward === true,
    rewardTitle: typeof value.rewardTitle === 'string' ? value.rewardTitle.trim().slice(0, 64) : '',
    rewardReturn,
    itemRewardChoices: itemIds(value.itemRewardChoices, MAX_REWARD_CHOICES),
    itemRewardFocus: integer(value.itemRewardFocus, 0, 0, MAX_REWARD_CHOICES - 1),
    rewardAcquire: rewardAcquire(value.rewardAcquire),
    shopOffers: shopOffers(value.shopOffers),
    shopFocus: integer(value.shopFocus, 0, 0, 4),
    boughtThisShop: value.boughtThisShop === true,
    specialRoomKind,
    specialRoomOffers: itemIds(value.specialRoomOffers, 3),
    specialRoomTaken: itemIds(value.specialRoomTaken, 3),
    specialRoomFocus: integer(value.specialRoomFocus, 0, 0, 2),
    specialRoomPreviousLifeItem: typeof value.specialRoomPreviousLifeItem === 'string'
      && ITEM_IDS.includes(value.specialRoomPreviousLifeItem as ItemId)
      ? value.specialRoomPreviousLifeItem as ItemId
      : undefined,
  };
}

export function readRunCheckpoint(): RunCheckpoint | null {
  for (const key of [RUN_CHECKPOINT_STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = parseRunCheckpoint(JSON.parse(raw));
      if (parsed) {
        if (key !== RUN_CHECKPOINT_STORAGE_KEY) writeRunCheckpoint(parsed);
        return parsed;
      }
      window.localStorage.setItem(INVALID_BACKUP_KEY, JSON.stringify({
        rejectedAt: Date.now(),
        sourceKey: key,
        raw: raw.slice(0, 256_000),
      }));
      window.localStorage.removeItem(key);
    } catch {
      // A malformed or inaccessible entry must not prevent checking the next
      // legacy key. The run remains playable even when storage is disabled.
    }
  }
  return null;
}

export function writeRunCheckpoint(checkpoint: RunCheckpoint): boolean {
  try {
    window.localStorage.setItem(RUN_CHECKPOINT_STORAGE_KEY, JSON.stringify({
      ...checkpoint,
      version: RUN_CHECKPOINT_VERSION,
    }));
    for (const key of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function clearRunCheckpoint(): void {
  try {
    window.localStorage.removeItem(RUN_CHECKPOINT_STORAGE_KEY);
    for (const key of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Some embedded browsers disable storage; the run remains playable without resume.
  }
}
