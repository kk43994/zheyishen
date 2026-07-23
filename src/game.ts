import { generateAIFate, generateAIFateResult, generateAIFreeFate, generateAIOrigin, type AIGenerationState } from './ai';
import { LifeFeedback } from './audio';
import {
  PixelEnemyRenderer,
  resolveEnemyPixelAsset,
  type EnemyPixelAssetKey,
} from './enemy-pixel';
import { generateLocalFateEvent, POISON_KEYS, validateFateEvent } from './fate';
import type { HeroFacing } from './hero-morph';
import { PixelHeroRenderer } from './hero-pixel';
import { DEFAULT_APPEARANCE, commitOriginWheels, getOriginModifiers, getOriginTrait, rollOriginWheels } from './origins';
import { FATE_ITEM_IDS, getItem, ITEM_IDS } from './relics';
import { comboArtAtlas } from './combo-art';
import { itemIconAtlas } from './item-icons';
import { projectileAtlas, hitFrame, saveFrame, synergyAtlas, statusAtlas, poisonAtlas, joystickAtlas, type HitMaterial, type SaveKind } from './vfx-sprites';
import { sceneArt } from './scene-art';
import { overlayPanelTexture, uiTextures } from './ui-textures';
import { POISON_LABELS } from './types';
import { PROP_VARIANTS, worldEntityAtlas, worldPlinthAtlas, worldPropAtlas, type WorldPlinthKind } from './world-props';
import {
  applyPixelDiscipline,
  drawArchiveFrame,
  drawCutCornerPanel,
  drawDeterministicWear,
  drawLifeChapterTrack,
  drawPaperFold,
  drawRedStamp,
  drawResponseMarker,
  drawStatusIcon,
  drawStitchDivider,
  UI_ARCHIVE_FONT_STACK,
  UI_FONT_STACK,
  UI_PALETTE,
} from './ui-theme';
import type {
  AppearanceDNA,
  AttackVector,
  BurstEffect,
  EnemyType,
  EnemyUnit,
  FateDirection,
  FateEvent,
  FateReceipt,
  FateResponse,
  FateStatKey,
  PoisonKey,
  ItemId,
  LifeSnapshot,
  OriginModifiers,
  OriginKind,
  OriginProfile,
  PoisonVector,
  Projectile,
  ProjectileMechanicFlag,
  ProjectileStyle,
  ProjectileVisual,
  RunStats,
  ScreenState,
  ShopOffer,
  SpecialRoomKind,
} from './types';

const W = 360;
const H = 640;
const FIXED_STEP = 1 / 60;
const HERO_SCREEN_X = 180;
const HERO_SCREEN_Y = 310;
const HERO_WORLD_SCALE = 1;
const HERO_BASE_SPEED = 132;
const MAX_ALIVE_ENEMIES = 18;
const MAX_PROJECTILES = 280;
const MAX_PENDING_SHOTS = 140;
const MAX_BURSTS = 140;
const MAX_COIN_DROPS = 70;
const MAX_ENEMY_DEATHS = 60;
const HURT_IFRAME = 0.75;
const HERO_ATTACK_ANIMATION_DURATION = 0.22;
const JOYSTICK_INPUT_RADIUS = 46;
const JOYSTICK_KNOB_TRAVEL = 24;
const JOYSTICK_SAFE_X = 42;
const JOYSTICK_SAFE_TOP = 104;
const JOYSTICK_SAFE_BOTTOM = 548;
const TITLE_BACKGROUND_URL = new URL('./assets/ui/title-life-night.png', import.meta.url).href;
const TITLE_START_RECT = { x: 72, y: 470, width: 216, height: 58 } as const;
const RESULT_RESTART_RECT = { x: 70, y: 505, width: 220, height: 58 } as const;
const RESULT_TAB_RECT = { x: 20, y: 98, width: 320, height: 28 } as const;
const PAUSE_BUTTON_RECT = { x: 326, y: 6, width: 28, height: 39 } as const;
const PAUSE_BUTTON_HIT_RECT = { x: 310, y: 0, width: 50, height: 52 } as const;
const PAUSE_CONTINUE_RECT = { x: 130, y: 530, width: 204, height: 44 } as const;
const PAUSE_END_RECT = { x: 152, y: 584, width: 160, height: 26 } as const;
const PAUSE_TAB_RECT = { x: 130, y: 86, width: 204, height: 30 } as const;
const PAUSE_SETTING_VOLUME_RECT = { x: 142, y: 160, width: 180, height: 38 } as const;
const PAUSE_SETTING_HAPTICS_RECT = { x: 142, y: 212, width: 180, height: 38 } as const;
const PAUSE_SETTING_MOTION_RECT = { x: 142, y: 264, width: 180, height: 38 } as const;
const PAUSE_SETTING_CONTRAST_RECT = { x: 142, y: 316, width: 180, height: 38 } as const;
const FATE_FREE_CANCEL_RECT = { x: 105, y: 568, width: 150, height: 30 } as const;
const FATE_FREE_CANCEL_DELAY = 4;
const SPECIAL_OFFER_RECTS = [
  { x: 14, y: 126, width: 104, height: 214 },
  { x: 128, y: 126, width: 104, height: 214 },
  { x: 242, y: 126, width: 104, height: 214 },
] as const;
const SPECIAL_LEAVE_RECT = { x: 104, y: 554, width: 152, height: 48 } as const;
const SPECIAL_HOLD_MS = 600;
type PauseTab = 'body' | 'origin' | 'fates' | 'settings';
const PAUSE_TABS: readonly PauseTab[] = ['body', 'origin', 'fates', 'settings'];
type ResultTab = 'seal' | 'items' | 'fates' | 'stats';
const RESULT_TABS: readonly ResultTab[] = ['seal', 'items', 'fates', 'stats'];
type RewardDestination = 'start' | 'advance' | 'battle';
type ShopFeedbackKind = 'purchase' | 'deny' | 'reroll';

interface ShopFeedbackState {
  kind: ShopFeedbackKind;
  index: number;
  timer: number;
  total: number;
  price?: number;
}

function pointInRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function pointInPaddedRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
  paddingX: number,
  paddingY: number,
): boolean {
  return pointInRect(point, {
    x: rect.x - paddingX,
    y: rect.y - paddingY,
    width: rect.width + paddingX * 2,
    height: rect.height + paddingY * 2,
  });
}

// 出生的一口气必须是虚弱的：低伤、短程、细弱——所有强度都由这一生揉出来
const BASE_VECTOR: AttackVector = {
  damage: 6.2,
  fireInterval: 0.72,
  range: 232,
  width: 4.6,
  projectileSpeed: 280,
  projectileCount: 1,
  spread: 0.15,
  pierce: 0,
  lifetime: 2.4,
  knockback: 7,
  critChance: 0.05,
  returning: false,
  homing: 0,
  splitChance: 0,
  explosion: 0,
  bloodOnHit: 0,
};

function attackVectorFlags(vector: AttackVector): ProjectileMechanicFlag[] {
  const flags: ProjectileMechanicFlag[] = [];
  if (vector.pierce > 0) flags.push('pierce');
  if (vector.returning) flags.push('returning');
  if (vector.homing > 0) flags.push('homing');
  if (vector.splitChance > 0) flags.push('split');
  if (vector.explosion > 0) flags.push('area');
  return flags;
}

function projectileFlags(projectile: Projectile): ProjectileMechanicFlag[] {
  const flags: ProjectileMechanicFlag[] = [];
  if (projectile.pierceMax > 0) flags.push('pierce');
  if (projectile.returning) flags.push('returning');
  if (projectile.homing > 0) flags.push('homing');
  if (projectile.splitChance > 0) flags.push('split');
  if (projectile.explosion > 0) flags.push('area');
  if (projectile.orbit) flags.push('orbit');
  if (projectile.shrink) flags.push('shrink');
  if (projectile.generation > 0) flags.push('echo');
  return flags;
}

// 组合彩蛋正典（与百科组合名鉴一致）；artKey 对应 combo-art 图集
interface ComboDef {
  name: string;
  artKey: string;
  items: readonly ItemId[];
  line: string;
}

const COMBO_DEFS: readonly ComboDef[] = [
  { name: '那天雨太大，我没有听见', artKey: 'rain-letter', items: ['front-desk-letter', 'fathers-raincoat'], line: '信纸被浸湿，变慢、变重、穿透' },
  { name: '被退回的信', artKey: 'returned-letter', items: ['red-workbook', 'front-desk-letter'], line: '未命中的信被红笔批改后折返，二次命中更疼' },
  { name: '大人说这都是为你好', artKey: 'for-your-own-good', items: ['stone-schoolbag', 'slow-watch'], line: '冻结解除后，一口气一次性压穿敌群' },
  { name: '被当成风格的求救', artKey: 'cry-for-help-as-style', items: ['eyebrow-razor', 'od-pill'], line: '受伤时涌出点赞与爱心，不提供任何治疗' },
  { name: '我只在有用时被看见', artKey: 'seen-only-when-useful', items: ['first-salary', 'nameless-tie', 'revoked-badge'], line: '刚证明过有用的两秒里，他格外锋利' },
  { name: '那年他觉得自己很酷', artKey: 'thought-he-was-cool', items: ['bleach-powder', 'fathers-raincoat'], line: '掉色的雨滴标记敌人，被标记者受伤更多' },
  { name: '这一次有人接了', artKey: 'someone-answered', items: ['eyebrow-razor', 'od-pill', 'unsent-phone'], line: '攒下的假点赞在吐出时化为真实护盾' },
  { name: '后来我也成了他', artKey: 'became-him', items: ['baby-tooth', 'fathers-raincoat'], line: '乳牙碎的那一刻，雨衣自动罩住孩子' },
  { name: '等大家有空', artKey: 'when-everyone-is-free', items: ['missing-photo', 'empty-frame'], line: '空相框复制合照的弹道，每次复制更褪色' },
  { name: '这点重量不算什么', artKey: 'this-weight-is-nothing', items: ['broken-spine', 'stone-schoolbag'], line: '弹道停留越久越重，压得越深' },
  { name: '能屈能伸', artKey: 'bend-and-stretch', items: ['broken-spine', 'nameless-tie', 'revoked-badge'], line: '弯腰的程度化为暴击，暴击时他说「收到」' },
  { name: '他当年也是这样站着的', artKey: 'stood-the-same-way', items: ['broken-spine', 'fathers-raincoat'], line: '身后浮现同样弯腰的轮廓，雨下得更密' },
];

// 延迟出膛的子弹（五连发的后几哈、AI 的复读回声）
interface PendingShot {
  delay: number;
  angle: number;
  damage: number;
  speed: number;
  radius: number;
  range: number;
  life: number;
  pierce: number;
  homing: number;
  returning: boolean;
  splitChance: number;
  splitDepth?: number;
  explosion: number;
  color: string;
  style: ProjectileStyle;
  critical: boolean;
  knockback: number;
  generation: number;
  priority?: 'core' | 'secondary';
  shrink?: boolean;
}

interface ProjectileMechanicInheritance {
  pierceScale?: number;
  pierceAdd?: number;
  pierceFloor?: number;
  homingScale?: number;
  homingFloor?: number;
  splitScale?: number;
  explosionScale?: number;
  returning?: boolean;
  splitDepth?: number;
}

type InheritedProjectileMechanics = Pick<
  Projectile,
  'pierce' | 'returning' | 'homing' | 'splitChance' | 'splitDepth' | 'explosion'
>;

interface StageSpec {
  chapter: string;
  title: string;
  subtitle: string;
  situation: readonly [string, string];
  duration: number;
  pool: EnemyType[];
  spawnEvery: number;
  bossAt?: number;
  bossType?: EnemyType;
  stallAt?: number;
  doorAt?: number;
  rewardAt?: number;
  end: 'advance' | 'fate' | 'final';
  enterLine: string;
  groundTop: string;
  groundBottom: string;
  propColor: string;
}

interface EnemyDeathVisual {
  asset: EnemyPixelAssetKey;
  x: number;
  y: number;
  radius: number;
  life: number;
  duration: number;
  faceLeft: boolean;
}

const STAGES: StageSpec[] = [
  {
    chapter: '童年 · 床底王国', title: '没人相信的怪物', subtitle: '恐惧第一次有了形状',
    situation: ['熄灯以后，他听见床底也在呼吸。', '大人说，那里什么都没有。'],
    duration: 60, pool: ['cry-moth', 'fear', 'hunger-shadow'], spawnEvery: 2.5, rewardAt: 15, bossAt: 34, bossType: 'closet-dark', end: 'advance',
    enterLine: '他只好先学会害怕，再学会一个人睡。',
    groundTop: '#695d6f', groundBottom: '#403a48', propColor: '#8d7d98',
  },
  {
    chapter: '少年 · 千眼教室', title: '统一答案', subtitle: '所有目光都在批改你',
    situation: ['考试、排名、同学议论。', '每张卷子都像在替所有人决定他是谁。'],
    duration: 70, pool: ['red-mark', 'whisper'], spawnEvery: 2.3, rewardAt: 18,
    bossAt: 44, bossType: 'uniform-answer', end: 'fate',
    enterLine: '他把理想写进作文。老师用红笔写：偏题，38 分。',
    groundTop: '#71818a', groundBottom: '#46545d', propColor: '#92a4ac',
  },
  {
    chapter: '青年 · 齿轮车站', title: '错过的那一班', subtitle: '每个人都像比你早一步',
    situation: ['毕业、求职、租房。', '别人陆续上车，他还在原地证明自己够格。'],
    duration: 75, pool: ['clockwork', 'whisper', 'red-mark'], spawnEvery: 1.9, stallAt: 14, rewardAt: 30, bossAt: 49, bossType: 'last-bus', end: 'advance',
    enterLine: '毕业证卷在行李箱底。他先学会了说「随时到岗」。',
    groundTop: '#8a7658', groundBottom: '#574936', propColor: '#9e865f',
  },
  {
    chapter: '成年 · 屋檐下的家', title: '沉默的父亲', subtitle: '盔甲里面也是一个害怕的男孩',
    situation: ['一间租来的房，一张总也坐不齐的饭桌。', '他开始替别人扛住生活。'],
    duration: 80, pool: ['missed-call', 'whisper', 'silence', 'debt'], spawnEvery: 1.75,
    bossAt: 54, bossType: 'silent-father', doorAt: 24, end: 'fate',
    enterLine: '他管那间屋子叫家。房东管它叫房源。',
    groundTop: '#718475', groundBottom: '#46594b', propColor: '#88a08f',
  },
  {
    chapter: '中年 · 没有关灯的办公室', title: '名字还在表格里', subtitle: '门已经打不开了',
    situation: ['工资、体检和账单同时到期。', '工位比家更熟悉他的名字。'],
    duration: 75, pool: ['debt', 'clockwork', 'badge-thief', 'whisper'], spawnEvery: 1.55, stallAt: 13, doorAt: 26, bossAt: 49, bossType: 'debt-collector', end: 'fate',
    enterLine: '体检单比工资单先到。',
    groundTop: '#7c8993', groundBottom: '#4d5962', propColor: '#98a5ad',
  },
  {
    chapter: '暮年 · 白发荒原', title: '收灯人', subtitle: '它不凶，也不坏，它只是准时',
    situation: ['病房走廊越来越长。', '忘记的人和被忘记的人，一起等着最后一盏灯。'],
    duration: 95, pool: ['forgetter', 'whisper', 'debt', 'empty-chair'], spawnEvery: 1.8, end: 'final',
    enterLine: '工牌收走那天，他愣了一下，才想起来自己姓什么。',
    groundTop: '#85888b', groundBottom: '#555b61', propColor: '#9da3a5',
  },
];

const STAGE_TRANSITION_DURATION = 4.2;
const CHAPTER_BRIDGES = [
  '床边灯亮过头，成了教室的日光灯',
  '红叉卷成车票，落进站台的风里',
  '车票塞进口袋，钥匙打开一扇家门',
  '饭桌上的账单，滑进了工位表格',
  '日光灯逐盏熄灭，只剩路口一盏灯',
] as const;

// Props share one 40x44 atlas contract, but their rendered footprint reflects
// the object: a bed rail or bench should not read like a paper scrap.
const PROP_STAGE_SCALES = [
  [1.35, 1.0, 0.74, 0.76],
  [1.3, 0.9, 0.78, 0.9],
  [1.45, 0.86, 1.18, 1.0],
  [1.4, 1.15, 0.9, 1.08],
  [1.35, 1.08, 0.9, 0.96],
  [1.45, 1.18, 1.12, 1.0],
] as const;
const PROP_CLUSTER_OFFSETS = [
  [-42, -28],
  [40, -22],
  [-28, 44],
  [44, 38],
] as const;

const DARKNESS_START = 62;
const DARKNESS_SHRINK = 22;
const FINAL_FATE_AT = 52;

type DistortionStat = '伤害' | '射速' | '射程' | '弹宽' | '弹速';

interface HeroState {
  hp: number;
  maxHp: number;
  block: number;
  coins: number;
}

type FateDestination = 'advance' | 'battle' | 'shop';

interface FateBuildState {
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

const EMPTY_POISONS: PoisonVector = { greed: 0, anger: 0, delusion: 0, pride: 0, doubt: 0 };
const AGE_LABELS = ['童年', '少年', '青年', '成年', '中年', '晚年'] as const;

const EMPTY_FATE_BUILD: FateBuildState = {
  damageMul: 1,
  intervalMul: 1,
  rangeMul: 1,
  widthMul: 1,
  speedMul: 1,
  countAdd: 0,
  homingAdd: 0,
  returning: false,
  openingBlock: 0,
  storedVolleys: 0,
  delayFirstHit: false,
  missingHpDamage: 0,
  moveSpeedMul: 1,
};

export class ZheYiShenGame {
  private ctx: CanvasRenderingContext2D;
  private pixelHero = new PixelHeroRenderer();
  private pixelEnemies = new PixelEnemyRenderer();
  private feedback = new LifeFeedback();
  private worldProps = worldPropAtlas;
  private titleBackground = new Image();
  private state: ScreenState = 'title';
  private hero: HeroState = { hp: 80, maxHp: 80, block: 0, coins: 4 };
  private items: ItemId[] = [];
  private origin?: OriginProfile;
  private requestedOriginKind: OriginKind = 'ordinary';
  private originModifiers: OriginModifiers = getOriginModifiers([]);
  private originElapsed = 0;
  private originAttempt = 0;
  private aiOriginState: AIGenerationState = 'idle';
  private aiFateState: AIGenerationState = 'idle';
  private fateGenerationId = 0;
  private prefetchedFate?: { encounterIndex: number; promise: Promise<FateEvent | null> };
  private poisons: PoisonVector = { ...EMPTY_POISONS };
  private memories: string[] = [];
  private fateReceipts: FateReceipt[] = [];
  private currentFate?: FateEvent;
  private fateDestination: FateDestination = 'advance';
  private fateDragging = false;
  private fatePointerId = -1;
  private fateDragStartX = 0;
  private fateDragX = 0;
  private fateResultDirection?: FateDirection;
  private fateResultTimer = 0;
  private fateBuild: FateBuildState = { ...EMPTY_FATE_BUILD };
  private fateDelayReady = false;
  private firstFateDamageReduction = 0;
  private enemies: EnemyUnit[] = [];
  private enemyDeaths: EnemyDeathVisual[] = [];
  private projectiles: Projectile[] = [];
  private bursts: BurstEffect[] = [];
  private itemRewardChoices: ItemId[] = [];
  private itemRewardFocus = 0;
  private shopOffers: ShopOffer[] = [];
  private shopFocus = 0;
  private shopFeedback?: ShopFeedbackState;
  private specialRoomKind: SpecialRoomKind = 'light';
  private specialRoomOffers: ItemId[] = [];
  private specialRoomTaken = new Set<ItemId>();
  private specialRoomFocus = 0;
  private specialRoomLeaveFocused = false;
  private specialRoomPointerId = -1;
  private specialRoomHoldIndex = -1;
  private specialRoomHoldStarted = 0;
  private strainTendency = 0;
  private lightTendency = 0;
  private initialItemReward = false;
  private rewardTitle = '';
  private rewardAcquire?: { id: ItemId; index: number; timer: number; total: number; destination: RewardDestination };
  private encounterIndex = 0;
  private battleTime = 0;
  private shotTimer = 0;
  private holdTimer = 0;
  private heldVolleys = 0;
  private watchCooldown = 7;
  private watchFreeze = 0;
  private phoneCharges = 0;
  private decadeCooldown = 10;
  private breathlessTimer = 0;
  private painlessDamage = 0;
  private painlessTimer = 0;
  private raincoatReady = false;
  private toothReady = false;
  private volleyCount = 0;
  private odBoost?: DistortionStat;
  private odPenalty?: DistortionStat;
  private toast = '';
  private toastTime = 0;
  private flash = 0;
  private resultWon = false;
  private resultTab: ResultTab = 'seal';
  private resultStartedAt = 0;
  private entityId = 1;
  private runSeed = 0;
  private rngState = 0x20260718;
  private runSerial = 0;
  private coinKillProgress = 0;
  private stats: RunStats = { fateChoices: 0, swallowed: 0, exhaled: 0, volleys: 0, kills: 0, damage: 0, itemsTaken: 0, coinsSpent: 0 };
  private lastTime = 0;
  private accumulator = 0;
  private visualTime = 0;
  private devSnapshotAt = 0;
  private renderGameState?: () => string;
  private auditTimeScale = 1;
  private auditEndurance = false;
  private auditAutoMove = false;
  private auditDamageTaken = 0;
  private heroX = 0;
  private heroY = 0;
  private heroMoving = false;
  private heroFacing: HeroFacing = 'front';
  private heroAttackFacing: HeroFacing = 'front';
  private heroAttackTimer = 0;
  private moveKeys = new Set<string>();
  private joyPointerId = -1;
  private joyBaseX = 0;
  private joyBaseY = 0;
  private joyStartX = 0;
  private joyStartY = 0;
  private joyDX = 0;
  private joyDY = 0;
  private spawnTimer = 1;
  private spawnPause = 0;
  private eliteSpawned = false;
  private eliteAlertName = '';
  private eliteAlertTime = 0;
  private stageWaitingForElite = false;
  private stallSpawnedAt = -1;
  private worldStall?: { x: number; y: number };
  private stallCooldown = 0;
  private rewardSpawnedAt = -1;
  private worldReward?: { x: number; y: number; ttl: number; choices: ItemId[] };
  private doorTriedThisStage = false;
  private doorUsed = false;
  private worldDoor?: { kind: SpecialRoomKind; x: number; y: number; ttl: number };
  private caption = '';
  private captionTime = 0;
  private transitionTimer = 0;
  private darkActive = false;
  private darkR = 9999;
  private darkCX = 0;
  private darkCY = 0;
  private lampSpawned = false;
  private finalFateTriggered = false;
  private hurtCooldown = 0;
  private screenShake = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private highContrastHud = false;
  private paused = false;
  private pauseTab: PauseTab = 'body';
  private pausePointerId = -1;
  private pauseEndHoldStarted = 0;
  private rewardReturn: 'battle' | 'advance' = 'advance';
  private originBadgeExpanded = false;
  private comboSeen = new Set<string>();
  private comboReveal?: { name: string; artKey: string; line: string; timer: number; total: number };
  private comboRevealQueue: ComboDef[] = [];
  private pendingShots: PendingShot[] = [];
  private sinceVolley = 0;
  private lastVolleyAngles: number[] = [];
  private lastRhythmMark = -1;
  private rhythmBrokenWindow = -1;
  private lastStandoffMark = 0;
  private deathSaves = 0;
  /** 免死演出：乳牙碎/遗照闪/雪花屏/关服，触发时播放专属帧序列 */
  private saveEffect: { kind: 'tooth' | 'photo' | 'static' | 'shutdown'; timer: number; duration: number } | null = null;
  private ktvTimer = 0;
  private synergySeen = new Set<string>();
  private watchReleaseTimer = 0;
  private heartCount = 0;
  private answeredUsedStage = false;
  private usefulTimer = 0;
  private lastSighMark = 0;
  private fateFreeWaiting = false;
  private fateFreeWaitElapsed = 0;
  private fateFreeRequestId = 0;
  private fateAnim = 0;
  private fateExitTimer = 0;
  private fateResultMinTimer = 0;
  private fatePlayerText = '';
  private freeInputWrap?: HTMLDivElement;
  private standStillTime = 0;
  private flashCooldown = 0;
  private snowUsed = false;
  private coinDrops: Array<{ id: number; x: number; y: number; value: number; life: number }> = [];
  // ―― 道具机制状态（第三批 39 件）――
  // voiceCharges: 撤回语音层数 / ruCharges: “在吗”层数 / noHitTime: 无伤计时（已读·矿泉水）
  // borrowedStat: 卡册本阶段借用的属性 / grace*: 遗照临终狂暴 / pillTimer: 第三颗药周期
  // billTimer: 催收账单倒计时 / stunTimer: 代喝眩晕 / pillowPenalty: 枕套起身惩罚
  private voiceCharges = 0;
  private ruCharges = 0;
  private noHitTime = 0;
  private borrowedStat?: DistortionStat;
  private graceUsed = false;
  private graceTimer = 0;
  private eyeTimer = 0;
  private enemyHasteTimer = 0;
  private pillTimer = 0;
  private oneMoreBuff = false;
  private divorceUsedStage = false;
  private hairUsedStage = false;
  private goodnightTick = 30;
  private sockTick = 45;
  private sockBoostTimer = 0;
  private heroSlowTimer = 0;
  private noBuyStacks = 0;
  private tauntTimer = 8;
  private billTimer = 0;
  private takeoutTick = 2;
  private stunTimer = 0;
  private pillowPenalty = 0;
  private boughtThisShop = false;
  private petGone = false;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('当前设备不支持 Canvas 2D');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.titleBackground.src = TITLE_BACKGROUND_URL;
    this.installInput();
    this.installTestHooks();
    requestAnimationFrame((time) => this.frame(time));
  }

  private installInput(): void {
    const point = (event: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * W,
        y: ((event.clientY - rect.top) / rect.height) * H,
      };
    };

    this.canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.feedback.unlock();
      const p = point(event);
      if (this.paused) {
        this.handlePausePointerDown(p, event.pointerId);
        return;
      }
      if ((this.state === 'battle' || this.state === 'fateEvent') && pointInRect(p, PAUSE_BUTTON_HIT_RECT)) {
        this.setPaused(true);
        return;
      }
      if (this.state === 'title') {
        if (pointInRect(p, TITLE_START_RECT)) this.startRun();
        return;
      }
      if (this.state === 'result') {
        if (pointInPaddedRect(p, RESULT_TAB_RECT, 0, 8)) {
          const index = this.clamp(Math.floor((p.x - RESULT_TAB_RECT.x) / (RESULT_TAB_RECT.width / 4)), 0, 3);
          this.resultTab = RESULT_TABS[index]!;
        } else if (pointInRect(p, RESULT_RESTART_RECT)) this.startRun();
        return;
      }
      if (this.state === 'origin') {
        if (this.aiOriginState === 'error') this.retryOrigin();
        else if (this.aiOriginState === 'gpt') {
          if (this.originStoryComplete()) this.openInitialItemReward();
          else this.originElapsed = this.originStoryDuration();
        }
        return;
      }
      if (this.state === 'battle') {
        if (p.x < 74 && p.y > H - 112 && p.y < H - 64) {
          this.originBadgeExpanded = !this.originBadgeExpanded;
          return;
        }
        this.originBadgeExpanded = false;
        if (event.pointerType === 'mouse') return;
        if (this.joyPointerId !== -1) return;
        this.joyPointerId = event.pointerId;
        this.joyStartX = p.x;
        this.joyStartY = p.y;
        this.joyBaseX = this.clamp(p.x, JOYSTICK_SAFE_X, W - JOYSTICK_SAFE_X);
        this.joyBaseY = this.clamp(p.y, JOYSTICK_SAFE_TOP, JOYSTICK_SAFE_BOTTOM);
        this.joyDX = 0;
        this.joyDY = 0;
        this.canvas.setPointerCapture?.(event.pointerId);
        return;
      }
      if (this.state === 'fateEvent') {
        if (this.fateResultDirection) {
          if (this.fateExitTimer <= 0 && this.fateResultMinTimer <= 0) this.completeFateDestination();
          return;
        }
        if (this.fateFreeWaiting) {
          if (this.fateFreeWaitElapsed >= FATE_FREE_CANCEL_DELAY && pointInRect(p, FATE_FREE_CANCEL_RECT)) {
            this.cancelFreeResponseWait();
          }
          return;
        }
        if (!this.currentFate || this.fateAnim < 0.75 || this.fatePointerId !== -1) return;
        if (p.y > 560 && p.y < 602 && p.x > 96 && p.x < 264) {
          this.openFreeInput();
          return;
        }
        this.fateDragging = true;
        this.fatePointerId = event.pointerId;
        this.fateDragStartX = p.x;
        this.fateDragX = 0;
        this.canvas.setPointerCapture?.(event.pointerId);
        return;
      }
      if (this.state === 'itemReward' && p.y >= 88 && p.y < 544) {
        this.itemRewardFocus = this.clamp(Math.floor((p.y - 88) / 152), 0, 2);
        this.chooseItemReward(this.itemRewardFocus);
        return;
      }
      if (this.state === 'shop') {
        if (p.y >= 88 && p.y < 544) {
          this.shopFocus = this.clamp(Math.floor((p.y - 88) / 152), 0, 2);
          this.buyShopOffer(this.shopFocus);
        } else if (p.y >= 550 && p.x < 175) {
          this.shopFocus = 3;
          this.rerollShop();
        } else if (p.y >= 550) {
          this.shopFocus = 4;
          this.leaveShop();
        }
        return;
      }
      if (this.state === 'specialRoom') {
        const offerIndex = this.specialOfferIndexAt(p);
        if (offerIndex >= 0) {
          this.specialRoomFocus = offerIndex;
          this.specialRoomLeaveFocused = false;
          const id = this.specialRoomOffers[offerIndex];
          if (id && !this.specialRoomTaken.has(id)) {
            this.specialRoomPointerId = event.pointerId;
            this.specialRoomHoldIndex = offerIndex;
            this.specialRoomHoldStarted = performance.now();
            this.canvas.setPointerCapture?.(event.pointerId);
          }
        } else if (pointInRect(p, SPECIAL_LEAVE_RECT)) {
          this.specialRoomLeaveFocused = true;
          this.leaveSpecialRoom();
        }
      }
    });

    this.canvas.addEventListener('pointermove', (event) => {
      const p = point(event);
      if (this.state === 'itemReward' && p.y >= 88 && p.y < 544) {
        this.itemRewardFocus = this.clamp(Math.floor((p.y - 88) / 152), 0, 2);
      }
      if (this.state === 'shop') {
        if (p.y >= 88 && p.y < 544) this.shopFocus = this.clamp(Math.floor((p.y - 88) / 152), 0, 2);
        else if (p.y >= 550 && p.y <= 608) this.shopFocus = p.x < 180 ? 3 : 4;
      }
      if (this.state === 'specialRoom' && this.specialRoomPointerId === -1) {
        const offerIndex = this.specialOfferIndexAt(p);
        if (offerIndex >= 0) {
          this.specialRoomFocus = offerIndex;
          this.specialRoomLeaveFocused = false;
        } else if (pointInRect(p, SPECIAL_LEAVE_RECT)) this.specialRoomLeaveFocused = true;
      }
      if (this.state === 'specialRoom' && event.pointerId === this.specialRoomPointerId) {
        if (this.specialOfferIndexAt(p) !== this.specialRoomHoldIndex) this.resetSpecialRoomHold();
        return;
      }
      if (this.state === 'battle' && event.pointerId === this.joyPointerId) {
        this.updateJoystickInput(p.x, p.y);
        return;
      }
      if (this.state !== 'fateEvent' || !this.fateDragging || this.fateResultDirection
        || event.pointerId !== this.fatePointerId) return;
      this.fateDragX = this.clamp(p.x - this.fateDragStartX, -150, 150);
    });

    const finishFateDrag = (event: PointerEvent) => {
      if (event.pointerId === this.specialRoomPointerId) {
        this.finishSpecialRoomHold(point(event));
        return;
      }
      if (this.paused && event.pointerId === this.pausePointerId) {
        this.finishPauseEndHold(point(event));
        return;
      }
      if (event.pointerId === this.joyPointerId) {
        this.joyPointerId = -1;
        this.joyStartX = 0;
        this.joyStartY = 0;
        this.joyDX = 0;
        this.joyDY = 0;
        if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture?.(event.pointerId);
        return;
      }
      if (this.state !== 'fateEvent' || !this.fateDragging || this.fateResultDirection
        || event.pointerId !== this.fatePointerId) return;
      this.fateDragging = false;
      this.fatePointerId = -1;
      if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture?.(event.pointerId);
      if (this.fateDragX <= -96) this.resolveFate('swallow');
      else if (this.fateDragX >= 96) this.resolveFate('exhale');
      else this.fateDragX = 0;
    };
    this.canvas.addEventListener('pointerup', finishFateDrag);
    this.canvas.addEventListener('pointercancel', (event) => {
      if (event.pointerId === this.specialRoomPointerId) {
        this.resetSpecialRoomHold();
        return;
      }
      if (event.pointerId === this.pausePointerId) {
        this.resetPauseHold();
        return;
      }
      if (event.pointerId === this.joyPointerId) {
        this.resetMovementInput();
        return;
      }
      if (event.pointerId === this.fatePointerId) this.resetFateInput();
    });
    this.canvas.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === this.specialRoomPointerId) this.resetSpecialRoomHold();
      if (event.pointerId === this.pausePointerId) this.resetPauseHold();
      if (event.pointerId === this.joyPointerId) {
        this.joyPointerId = -1;
        this.joyStartX = 0;
        this.joyStartY = 0;
        this.joyDX = 0;
        this.joyDY = 0;
      }
      if (event.pointerId === this.fatePointerId) {
        this.fateDragging = false;
        this.fatePointerId = -1;
        this.fateDragX = 0;
      }
    });

    window.addEventListener('keydown', (event) => {
      this.feedback.unlock();
      const lower = event.key.toLowerCase();
      if (event.key === 'Escape' && (this.state === 'battle' || this.state === 'fateEvent')) {
        if (this.fateFreeWaiting) {
          if (this.fateFreeWaitElapsed >= FATE_FREE_CANCEL_DELAY) this.cancelFreeResponseWait();
        } else this.setPaused(!this.paused);
        event.preventDefault();
        return;
      }
      if (this.paused) {
        const pauseIndex = Number(event.key) - 1;
        if (pauseIndex >= 0 && pauseIndex < PAUSE_TABS.length) this.pauseTab = PAUSE_TABS[pauseIndex]!;
        if (event.key === 'Enter' || event.key === ' ') this.setPaused(false);
        event.preventDefault();
        return;
      }
      const movementKey = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(lower);
      if (this.state === 'battle' && movementKey) {
        this.moveKeys.add(lower);
        event.preventDefault();
      }
      if (this.state === 'result') {
        const resultIndex = Number(event.key) - 1;
        if (resultIndex >= 0 && resultIndex < RESULT_TABS.length) this.resultTab = RESULT_TABS[resultIndex]!;
        else if (event.key === 'Enter' || event.key === ' ') this.startRun();
        return;
      }
      if (this.state === 'title' && (event.key === 'Enter' || event.key === ' ')) {
        this.startRun();
        return;
      }
      if (this.state === 'origin' && (event.key === 'Enter' || event.key === ' ')) {
        if (this.aiOriginState === 'error') this.retryOrigin();
        else if (this.aiOriginState === 'gpt') {
          if (this.originStoryComplete()) this.openInitialItemReward();
          else this.originElapsed = this.originStoryDuration();
        }
        return;
      }
      if (this.state === 'fateEvent' && this.fateResultDirection) {
        if ((event.key === 'Enter' || event.key === ' ') && this.fateExitTimer <= 0 && this.fateResultMinTimer <= 0) this.completeFateDestination();
        return;
      }
      if (this.state === 'fateEvent' && !this.fateResultDirection) {
        if (event.repeat) return;
        if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') this.resolveFate('swallow');
        if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') this.resolveFate('exhale');
        return;
      }
      const digit = Number(event.key);
      if (this.state === 'itemReward') {
        if (digit >= 1 && digit <= 3) this.itemRewardFocus = digit - 1;
        else if (event.key === 'ArrowUp') this.itemRewardFocus = (this.itemRewardFocus + 2) % 3;
        else if (event.key === 'ArrowDown') this.itemRewardFocus = (this.itemRewardFocus + 1) % 3;
        if ((digit >= 1 && digit <= 3) || event.key === 'Enter' || event.key === ' ') {
          this.chooseItemReward(this.itemRewardFocus);
        }
        event.preventDefault();
        return;
      }
      if (this.state === 'shop') {
        if (digit >= 1 && digit <= 3) this.shopFocus = digit - 1;
        else if (event.key === 'ArrowUp') this.shopFocus = (this.shopFocus + 4) % 5;
        else if (event.key === 'ArrowDown') this.shopFocus = (this.shopFocus + 1) % 5;
        else if (event.key === 'r' || event.key === 'R') this.shopFocus = 3;
        if (digit >= 1 && digit <= 3) this.buyShopOffer(this.shopFocus);
        else if (event.key === 'r' || event.key === 'R') this.rerollShop();
        else if (event.key === 'Enter' || event.key === ' ') {
          if (this.shopFocus <= 2) this.buyShopOffer(this.shopFocus);
          else if (this.shopFocus === 3) this.rerollShop();
          else this.leaveShop();
        }
        event.preventDefault();
        return;
      }
      if (this.state === 'specialRoom') {
        if (digit >= 1 && digit <= 3) {
          this.specialRoomFocus = digit - 1;
          this.specialRoomLeaveFocused = false;
          this.takeSpecialOffer(this.specialRoomFocus);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          const delta = event.key === 'ArrowLeft' ? 2 : 1;
          this.specialRoomFocus = (this.specialRoomFocus + delta) % 3;
          this.specialRoomLeaveFocused = false;
        } else if (event.key === 'ArrowDown') this.specialRoomLeaveFocused = true;
        else if (event.key === 'ArrowUp') this.specialRoomLeaveFocused = false;
        else if (event.key === 'Enter' || event.key === ' ') {
          if (this.specialRoomLeaveFocused) this.leaveSpecialRoom();
          else this.takeSpecialOffer(this.specialRoomFocus);
        }
        event.preventDefault();
      }
    });

    window.addEventListener('keyup', (event) => {
      this.moveKeys.delete(event.key.toLowerCase());
    });

    window.addEventListener('blur', () => {
      this.resetMovementInput();
      this.resetFateInput();
      this.resetSpecialRoomHold();
    });

    document.addEventListener('visibilitychange', () => {
      this.lastTime = 0;
      if (document.hidden) {
        this.resetMovementInput();
        this.resetFateInput();
        this.resetSpecialRoomHold();
        if (this.state === 'battle' || this.state === 'fateEvent') this.setPaused(true);
      }
    });
  }

  private setPaused(value: boolean): void {
    if (value && this.state !== 'battle' && this.state !== 'fateEvent') return;
    this.paused = value;
    this.accumulator = 0;
    this.lastTime = 0;
    this.resetPauseHold();
    if (value) {
      this.resetMovementInput();
      this.resetFateInput();
    }
  }

  private handlePausePointerDown(point: { x: number; y: number }, pointerId: number): void {
    if (pointInRect(point, PAUSE_CONTINUE_RECT)) {
      this.setPaused(false);
      return;
    }
    if (pointInPaddedRect(point, PAUSE_TAB_RECT, 0, 7)) {
      const index = this.clamp(Math.floor((point.x - PAUSE_TAB_RECT.x) / (PAUSE_TAB_RECT.width / 4)), 0, 3);
      this.pauseTab = PAUSE_TABS[index]!;
      return;
    }
    if (this.pauseTab === 'settings') {
      if (pointInPaddedRect(point, PAUSE_SETTING_VOLUME_RECT, 0, 3)) {
        const trackStart = PAUSE_SETTING_VOLUME_RECT.x + 78;
        const trackWidth = PAUSE_SETTING_VOLUME_RECT.width - 92;
        if (point.x < trackStart - 12) {
          this.feedback.setVolume(this.feedback.getVolume() > 0 ? 0 : 0.42);
        } else {
          this.feedback.setVolume(this.clamp((point.x - trackStart) / trackWidth, 0, 1));
        }
        this.feedback.play('page');
        return;
      }
      if (pointInPaddedRect(point, PAUSE_SETTING_HAPTICS_RECT, 0, 3)) {
        this.feedback.setHaptics(!this.feedback.hapticsEnabled());
        return;
      }
      if (pointInPaddedRect(point, PAUSE_SETTING_MOTION_RECT, 0, 3)) {
        this.reducedMotion = !this.reducedMotion;
        return;
      }
      if (pointInPaddedRect(point, PAUSE_SETTING_CONTRAST_RECT, 0, 3)) {
        this.highContrastHud = !this.highContrastHud;
        return;
      }
    }
    if (pointInPaddedRect(point, PAUSE_END_RECT, 0, 9)) {
      this.pausePointerId = pointerId;
      this.pauseEndHoldStarted = performance.now();
      this.canvas.setPointerCapture?.(pointerId);
    }
  }

  private finishPauseEndHold(point: { x: number; y: number }): void {
    const pointerId = this.pausePointerId;
    const completed = pointInPaddedRect(point, PAUSE_END_RECT, 0, 9)
      && this.pauseEndHoldStarted > 0
      && performance.now() - this.pauseEndHoldStarted >= 1000;
    this.resetPauseHold();
    if (pointerId !== -1 && this.canvas.hasPointerCapture?.(pointerId)) this.canvas.releasePointerCapture?.(pointerId);
    if (completed) {
      this.paused = false;
      this.endRun(false);
    }
  }

  private resetPauseHold(): void {
    this.pausePointerId = -1;
    this.pauseEndHoldStarted = 0;
  }

  private specialOfferIndexAt(point: { x: number; y: number }): number {
    return SPECIAL_OFFER_RECTS.findIndex((rect) => pointInRect(point, rect));
  }

  private finishSpecialRoomHold(point: { x: number; y: number }): void {
    const pointerId = this.specialRoomPointerId;
    const index = this.specialRoomHoldIndex;
    const completed = index >= 0
      && this.specialOfferIndexAt(point) === index
      && this.specialRoomHoldStarted > 0
      && performance.now() - this.specialRoomHoldStarted >= SPECIAL_HOLD_MS;
    this.resetSpecialRoomHold();
    if (pointerId !== -1 && this.canvas.hasPointerCapture?.(pointerId)) this.canvas.releasePointerCapture?.(pointerId);
    if (completed) this.takeSpecialOffer(index);
  }

  private resetSpecialRoomHold(): void {
    this.specialRoomPointerId = -1;
    this.specialRoomHoldIndex = -1;
    this.specialRoomHoldStarted = 0;
  }

  private resetMovementInput(): void {
    this.moveKeys.clear();
    this.heroMoving = false;
    const pointerId = this.joyPointerId;
    this.joyPointerId = -1;
    this.joyStartX = 0;
    this.joyStartY = 0;
    this.joyDX = 0;
    this.joyDY = 0;
    if (pointerId !== -1 && this.canvas.hasPointerCapture?.(pointerId)) {
      this.canvas.releasePointerCapture?.(pointerId);
    }
  }

  private updateJoystickInput(pointerX: number, pointerY: number): void {
    const rawX = pointerX - this.joyStartX;
    const rawY = pointerY - this.joyStartY;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > JOYSTICK_INPUT_RADIUS ? JOYSTICK_INPUT_RADIUS / distance : 1;
    this.joyDX = rawX * scale;
    this.joyDY = rawY * scale;
  }

  private resetFateInput(): void {
    const pointerId = this.fatePointerId;
    this.fateDragging = false;
    this.fatePointerId = -1;
    this.fateDragStartX = 0;
    this.fateDragX = 0;
    if (pointerId !== -1 && this.canvas.hasPointerCapture?.(pointerId)) {
      this.canvas.releasePointerCapture?.(pointerId);
    }
  }

  private startRun(fixedSeed?: number): void {
    this.feedback.play('page');
    this.resetMovementInput();
    this.resetFateInput();
    this.runSerial += 1;
    this.paused = false;
    this.pauseTab = 'body';
    this.resultTab = 'seal';
    this.resetPauseHold();
    this.resetSpecialRoomHold();
    this.pixelHero.clear();
    this.runSeed = fixedSeed ?? ((Date.now() ^ Math.imul(this.runSerial, 0x9e3779b1)) >>> 0);
    this.rngState = this.runSeed;
    this.origin = undefined;
    this.requestedOriginKind = this.pickOriginKind();
    this.originModifiers = getOriginModifiers([]);
    this.originElapsed = 0;
    this.originAttempt = 0;
    this.aiOriginState = 'requesting';
    this.aiFateState = 'idle';
    this.prefetchedFate = undefined;
    this.state = 'origin';
    const startingHp = 80;
    this.hero = {
      hp: startingHp,
      maxHp: startingHp,
      block: 0,
      coins: 4,
    };
    this.items = [];
    this.enemies = [];
    this.enemyDeaths = [];
    this.projectiles = [];
    this.bursts = [];
    this.shopOffers = [];
    this.shopFeedback = undefined;
    this.specialRoomOffers = [];
    this.specialRoomTaken.clear();
    this.specialRoomFocus = 0;
    this.poisons = { ...EMPTY_POISONS };
    this.memories = [];
    this.fateReceipts = [];
    this.currentFate = undefined;
    this.fateDestination = 'advance';
    this.fateResultDirection = undefined;
    this.fateResultTimer = 0;
    this.fateBuild = { ...EMPTY_FATE_BUILD };
    this.fateDelayReady = false;
    this.firstFateDamageReduction = 0;
    this.strainTendency = 0;
    this.lightTendency = 0;
    this.encounterIndex = 0;
    this.entityId = 1;
    this.phoneCharges = 0;
    this.decadeCooldown = 10;
    this.breathlessTimer = 0;
    this.painlessDamage = 0;
    this.painlessTimer = 0;
    this.initialItemReward = false;
    this.rewardTitle = '';
    this.rewardAcquire = undefined;
    this.itemRewardChoices = [];
    this.coinKillProgress = 0;
    this.stats = { fateChoices: 0, swallowed: 0, exhaled: 0, volleys: 0, kills: 0, damage: 0, itemsTaken: 0, coinsSpent: 0 };
    this.auditDamageTaken = 0;
    this.toast = '';
    this.toastTime = 0;
    this.heroX = 0;
    this.heroY = 0;
    this.heroFacing = 'front';
    this.heroAttackFacing = 'front';
    this.heroAttackTimer = 0;
    this.spawnTimer = 1;
    this.spawnPause = 0;
    this.eliteSpawned = false;
    this.eliteAlertName = '';
    this.eliteAlertTime = 0;
    this.stageWaitingForElite = false;
    this.stallSpawnedAt = -1;
    this.worldStall = undefined;
    this.stallCooldown = 0;
    this.rewardSpawnedAt = -1;
    this.worldReward = undefined;
    this.doorTriedThisStage = false;
    this.doorUsed = false;
    this.worldDoor = undefined;
    this.caption = '';
    this.captionTime = 0;
    this.transitionTimer = 0;
    this.darkActive = false;
    this.darkR = 9999;
    this.lampSpawned = false;
    this.finalFateTriggered = false;
    this.hurtCooldown = 0;
    this.screenShake = 0;
    this.rewardReturn = 'advance';
    this.originBadgeExpanded = false;
    this.comboSeen.clear();
    this.standStillTime = 0;
    this.flashCooldown = 0;
    this.snowUsed = false;
    this.coinDrops = [];
    this.voiceCharges = 0;
    this.ruCharges = 0;
    this.noHitTime = 0;
    this.borrowedStat = undefined;
    this.graceUsed = false;
    this.graceTimer = 0;
    this.eyeTimer = 0;
    this.enemyHasteTimer = 0;
    this.pillTimer = 0;
    this.oneMoreBuff = false;
    this.divorceUsedStage = false;
    this.hairUsedStage = false;
    this.comboReveal = undefined;
    this.comboRevealQueue = [];
    this.pendingShots = [];
    this.sinceVolley = 0;
    this.lastVolleyAngles = [];
    this.lastRhythmMark = -1;
    this.rhythmBrokenWindow = -1;
    this.lastStandoffMark = 0;
    this.deathSaves = 0;
    this.ktvTimer = 0;
    this.synergySeen.clear();
    this.watchReleaseTimer = 0;
    this.heartCount = 0;
    this.answeredUsedStage = false;
    this.usefulTimer = 0;
    this.lastSighMark = 0;
    this.goodnightTick = 30;
    this.sockTick = 45;
    this.sockBoostTimer = 0;
    this.heroSlowTimer = 0;
    this.noBuyStacks = 0;
    this.tauntTimer = 8;
    this.billTimer = 0;
    this.takeoutTick = 2;
    this.stunTimer = 0;
    this.pillowPenalty = 0;
    this.boughtThisShop = false;
    this.petGone = false;
    void this.hydrateOrigin(this.runSerial, this.requestedOriginKind);
  }

  private pickOriginKind(): OriginKind {
    const roll = this.random();
    if (roll < 0.25) return 'ordinary';
    if (roll < 0.7) return 'mixed';
    if (roll < 0.85) return 'favored';
    return 'harsh';
  }

  private async hydrateOrigin(runSerial: number, kind: OriginKind): Promise<void> {
    const wheels = rollOriginWheels(() => this.random());
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (this.runSerial !== runSerial || this.state !== 'origin') return;
      this.originAttempt = attempt;
      const nonce = `${runSerial}-${attempt}-${Date.now().toString(36)}`;
      const generated = await generateAIOrigin(this.runSeed, kind, nonce, wheels);
      if (this.runSerial !== runSerial || this.state !== 'origin') return;
      if (generated) {
        commitOriginWheels(wheels);
        this.applyGeneratedOrigin(generated);
        return;
      }
    }
    this.aiOriginState = 'error';
    this.originElapsed = 0;
  }

  private applyGeneratedOrigin(generated: OriginProfile): void {
    this.origin = generated;
    this.originAttempt = 0;
    this.originModifiers = getOriginModifiers(generated.traits);
    const startingHp = 80 + this.originModifiers.maxHpAdd;
    this.hero.hp = startingHp;
    this.hero.maxHp = startingHp;
    this.hero.coins = this.clamp(4 + this.originModifiers.coinsAdd, 0, 6);
    if (import.meta.env.DEV && this.auditEndurance) {
      this.hero.hp = 999;
      this.hero.maxHp = 999;
      this.hero.coins = 30;
    }
    this.firstFateDamageReduction = this.originModifiers.firstFateDamageReduction;
    this.memories = [`出生底色：${generated.title}${generated.nickname ? ` · 外号《${generated.nickname}》` : ''}`];
    this.originElapsed = 0;
    this.aiOriginState = 'gpt';
  }

  private retryOrigin(): void {
    if (this.state !== 'origin' || this.aiOriginState !== 'error') return;
    this.aiOriginState = 'requesting';
    this.originElapsed = 0;
    void this.hydrateOrigin(this.runSerial, this.requestedOriginKind);
  }

  private openInitialItemReward(): void {
    if (this.state !== 'origin' || this.aiOriginState !== 'gpt' || !this.origin) return;
    this.resetMovementInput();
    this.resetFateInput();
    this.initialItemReward = true;
    this.rewardTitle = '离开家门时，他只带走了一件东西';
    this.itemRewardChoices = this.pickItemChoices(true);
    this.itemRewardFocus = 0;
    this.state = 'itemReward';
  }

  private originStoryDuration(): number {
    if (!this.origin) return 8;
    const characters = this.origin.story.join('').length;
    return this.clamp(characters / 30, 4, 9);
  }

  private originStoryComplete(): boolean {
    return this.aiOriginState === 'gpt' && Boolean(this.origin) && this.originElapsed >= this.originStoryDuration();
  }

  private startStage(): void {
    const stage = STAGES[this.encounterIndex];
    if (!stage) {
      this.endRun(true);
      return;
    }
    this.resetMovementInput();
    this.resetFateInput();
    this.state = 'battle';
    this.hero.block = this.fateBuild.openingBlock;
    this.projectiles = [];
    this.bursts = [];
    this.enemies = [];
    this.enemyDeaths = [];
    this.battleTime = 0;
    this.spawnTimer = 0.8;
    this.spawnPause = 0;
    this.eliteSpawned = false;
    this.eliteAlertName = '';
    this.eliteAlertTime = 0;
    this.stageWaitingForElite = false;
    this.transitionTimer = 0;
    this.worldStall = undefined;
    this.stallCooldown = 0;
    this.worldReward = undefined;
    this.doorTriedThisStage = false;
    this.worldDoor = undefined;
    this.shotTimer = 0.35;
    this.holdTimer = 0;
    this.heldVolleys = 0;
    this.watchCooldown = 7;
    this.watchFreeze = 0;
    this.decadeCooldown = 10;
    this.breathlessTimer = 0;
    this.painlessDamage = 0;
    this.painlessTimer = 0;
    this.hurtCooldown = 0;
    this.heroAttackTimer = 0;
    this.screenShake = 0;
    this.finalFateTriggered = false;
    this.fateDelayReady = this.fateBuild.delayFirstHit;
    if (this.fateBuild.storedVolleys > 0) {
      this.holdTimer = 0.7;
      this.heldVolleys = this.fateBuild.storedVolleys;
      this.fateBuild.storedVolleys = 0;
    }
    this.standStillTime = 0;
    this.flashCooldown = 0;
    this.snowUsed = false;
    this.coinDrops = [];
    this.hairUsedStage = false;
    this.divorceUsedStage = false;
    this.answeredUsedStage = false;
    this.takeoutTick = 2;
    this.billTimer = 0;
    this.borrowedStat = undefined;
    if (this.hasItem('card-binder')) {
      const borrowables: DistortionStat[] = ['伤害', '射速', '射程'];
      this.borrowedStat = borrowables[Math.floor(this.random() * borrowables.length)];
      this.say(`翻出一张旧卡 · ${this.borrowedStat}+12%`);
    }
    let stageFees = 0;
    if (this.hasItem('gym-card')) stageFees += 1;
    if (this.hasItem('auto-renew')) stageFees += 1;
    if (this.hasItem('shared-powerbank')) stageFees += 1;
    if (stageFees > 0 && this.hero.coins > 0) {
      this.hero.coins = Math.max(0, this.hero.coins - stageFees);
      this.say(`自动扣费 · -${stageFees}零钱`);
    }
    if (this.hasItem('drank-for-boss')) this.stunTimer = 1.2;
    if (this.hasItem('year-report')) this.loseHealth(2);
    this.raincoatReady = this.hasItem('fathers-raincoat');
    this.toothReady = this.hasItem('baby-tooth');
    this.volleyCount = 0;
    this.rollOdDistortion();
    if (this.hasItem('white-bottle')) this.loseHealth(2);
    if (stage.end === 'fate' || stage.end === 'final') this.prepareFate();
    this.caption = stage.enterLine;
    this.captionTime = 5.5;
    this.say(stage.chapter);
  }

  private beginStageTransition(): void {
    if (this.transitionTimer > 0) return;
    this.oneMoreBuff = this.hasItem('one-more-game') && this.hero.hp >= this.hero.maxHp;
    if (this.hasItem('loan-contract')) {
      if (this.hero.coins >= 2) this.hero.coins -= 2;
      else this.loseHealth(4);
      this.say('网贷扣款日');
    }
    if (this.livingStageElite()) return;
    this.transitionTimer = STAGE_TRANSITION_DURATION;
    this.feedback.play('page', 1.1);
    this.projectiles = [];
    for (const enemy of this.enemies) {
      if (!enemy.dead) {
        enemy.dead = true;
        this.burst('ring', enemy.x, enemy.y, enemy.radius * 2, '#5a5750');
      }
    }
    // The transition card carries the concrete situation. The next stage's
    // inner monologue appears only after the card clears, so mobile players
    // never have to read two narrative layers at once.
    this.caption = '';
    this.captionTime = 0;
  }

  private stageEndReward(): void {
    const stage = STAGES[this.encounterIndex];
    if (!stage || stage.end === 'final') return;
    this.healHero(6);
    if (stage.end === 'fate') {
      this.openFate('advance');
    } else this.advanceStage();
  }

  private livingStageElite(): EnemyUnit | undefined {
    return this.enemies.find((enemy) => !enemy.dead && (enemy.elite || (enemy.boss && enemy.type !== 'lamp-keeper')));
  }

  private advanceStage(): void {
    this.encounterIndex += 1;
    this.startStage();
  }

  private updateHeroMovement(dt: number): void {
    if (this.stunTimer > 0) {
      this.heroMoving = false;
      return;
    }
    let dx = 0;
    let dy = 0;
    if (this.joyPointerId !== -1 && (Math.abs(this.joyDX) > 5 || Math.abs(this.joyDY) > 5)) {
      dx = this.joyDX;
      dy = this.joyDY;
    } else {
      if (this.moveKeys.has('a') || this.moveKeys.has('arrowleft')) dx -= 1;
      if (this.moveKeys.has('d') || this.moveKeys.has('arrowright')) dx += 1;
      if (this.moveKeys.has('w') || this.moveKeys.has('arrowup')) dy -= 1;
      if (this.moveKeys.has('s') || this.moveKeys.has('arrowdown')) dy += 1;
    }
    if (import.meta.env.DEV && this.auditAutoMove && dx === 0 && dy === 0) {
      const orbit = this.battleTime * 0.72 + Math.sin(this.battleTime * 0.13) * 0.8;
      dx = Math.cos(orbit);
      dy = Math.sin(orbit);
    }
    const length = Math.hypot(dx, dy);
    this.heroMoving = length > 0;
    if (!this.heroMoving) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.heroFacing = dx < 0 ? 'left' : 'right';
    } else {
      this.heroFacing = dy < 0 ? 'back' : 'front';
    }
    const speed = this.computeMoveSpeed();
    this.heroX += (dx / length) * speed * dt;
    this.heroY += (dy / length) * speed * dt;
    if (this.darkActive) {
      const distC = Math.hypot(this.heroX - this.darkCX, this.heroY - this.darkCY);
      const maxR = Math.max(30, this.darkR - 18);
      if (distC > maxR) {
        this.heroX = this.darkCX + ((this.heroX - this.darkCX) / distC) * maxR;
        this.heroY = this.darkCY + ((this.heroY - this.darkCY) / distC) * maxR;
      }
    }
  }

  private computeMoveSpeed(): number {
    let speed = HERO_BASE_SPEED;
    if (this.hasItem('stone-schoolbag')) speed *= 0.8;
    if (this.hasItem('fathers-raincoat')) speed *= 0.92;
    if (this.hasItem('broken-spine')) speed *= 0.88;
    if (this.hasItem('small-uniform')) speed *= 1.06;
    if (this.hasItem('bleach-powder')) speed *= 1.05;
    if (this.hasItem('held-pee')) speed *= 0.92;
    if (this.hasItem('gym-card')) speed *= 1.08;
    if (this.hasItem('summer-run')) speed *= 1.12;
    if (this.hasItem('sock-cigs') && this.sockBoostTimer > 0) speed *= 1.25;
    if (this.heroSlowTimer > 0) speed *= 0.75;
    if (this.hasItem('class-break')) {
      if (this.battleTime < 10) speed *= 1.35;
      else if (this.battleTime < 13) speed *= 0.85;
    }
    speed *= 1 - Math.min(0.2, this.items.length * 0.012);
    speed *= this.fateBuild.moveSpeedMul;
    return this.clamp(speed, 62, 178);
  }

  private closeFreeInput(): void {
    this.freeInputWrap?.remove();
    this.freeInputWrap = undefined;
    this.fateFreeWaiting = false;
    this.fateFreeWaitElapsed = 0;
    this.fateFreeRequestId += 1;
  }

  private cancelFreeResponseWait(): void {
    if (!this.fateFreeWaiting || this.fateFreeWaitElapsed < FATE_FREE_CANCEL_DELAY) return;
    this.fateFreeWaiting = false;
    this.fateFreeWaitElapsed = 0;
    this.fateFreeRequestId += 1;
    this.fatePlayerText = '';
    this.say('那句话没等到回声 · 仍可咽下或吐出');
  }

  private openFreeInput(): void {
    if (this.freeInputWrap || this.fateFreeWaiting || !this.currentFate) return;
    if (this.hasItem('name-sold')) {
      this.say('名字卖掉了 · 开不了口');
      return;
    }
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,5,8,.74);z-index:50;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#14141a;border:1px solid #77727b;padding:18px;width:280px;font-family:sans-serif;';
    const title = document.createElement('div');
    title.textContent = '他张了张嘴——你替他说：';
    title.style.cssText = 'color:#e8e1d3;font-size:13px;margin-bottom:10px;';
    const input = document.createElement('input');
    input.maxLength = 24;
    input.placeholder = '写下他的回应（24字内）';
    input.style.cssText = 'width:100%;box-sizing:border-box;background:#0c0d11;border:1px solid #55525b;color:#e8e1d3;padding:8px;font-size:13px;outline:none;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:12px;';
    const cancel = document.createElement('button');
    cancel.textContent = '算了';
    cancel.style.cssText = 'flex:1;background:#2c2c33;border:none;color:#a7a3ab;padding:9px;font-size:13px;';
    const ok = document.createElement('button');
    ok.textContent = '说出口';
    ok.style.cssText = 'flex:1;background:#8d4a58;border:none;color:#f0e9dc;padding:9px;font-size:13px;';
    row.append(cancel, ok);
    box.append(title, input, row);
    wrap.append(box);
    document.body.append(wrap);
    this.freeInputWrap = wrap;
    input.focus();
    cancel.onclick = () => this.closeFreeInput();
    ok.onclick = () => {
      const text = input.value.trim();
      if (!text) return;
      wrap.remove();
      this.freeInputWrap = undefined;
      this.submitFreeResponse(text);
    };
    input.onkeydown = (keyEvent) => {
      keyEvent.stopPropagation();
      if (keyEvent.key === 'Enter') ok.click();
    };
  }

  private submitFreeResponse(text: string): void {
    const event = this.currentFate;
    if (!event || this.fateResultDirection) return;
    this.fateFreeWaiting = true;
    this.fateFreeWaitElapsed = 0;
    const requestId = ++this.fateFreeRequestId;
    const serial = this.runSerial;
    void generateAIFreeFate({
      event: { id: event.id, title: event.title, fact: event.fact },
      playerText: text,
      snapshot: this.buildLifeSnapshot(),
    }).then((outcome) => {
      if (requestId !== this.fateFreeRequestId || this.runSerial !== serial || this.state !== 'fateEvent'
        || this.fateResultDirection || this.currentFate !== event || !this.fateFreeWaiting) return;
      this.fateFreeWaiting = false;
      this.fateFreeWaitElapsed = 0;
      if (!outcome) {
        this.say('话在喉咙里转了一圈，没说出口');
        return;
      }
      this.memories.push(`他亲口说：「${text}」`);
      this.fatePlayerText = text;
      if (this.hasItem('ai-chat') && outcome.response.stats) {
        const halved: typeof outcome.response.stats = {};
        for (const [statKey, statValue] of Object.entries(outcome.response.stats) as Array<[FateStatKey, number]>) {
          const cut = Math.trunc(statValue / 2);
          if (cut !== 0) halved[statKey] = cut;
        }
        outcome.response = { ...outcome.response, stats: Object.keys(halved).length ? halved : undefined };
      }
      this.resolveFate(outcome.direction, outcome.response);
    });
  }

  private applyFateStats(stats?: Partial<Record<FateStatKey, number>>): void {
    if (!stats) return;
    const pct = (delta: number) => 1 + delta / 100;
    if (stats.damage) this.fateBuild.damageMul *= pct(stats.damage);
    if (stats.fireRate) this.fateBuild.intervalMul /= pct(stats.fireRate);
    if (stats.range) this.fateBuild.rangeMul *= pct(stats.range);
    if (stats.width) this.fateBuild.widthMul *= pct(stats.width);
    if (stats.projSpeed) this.fateBuild.speedMul *= pct(stats.projSpeed);
    if (stats.moveSpeed) this.fateBuild.moveSpeedMul *= pct(stats.moveSpeed);
  }

  private fateStatsLine(stats?: Partial<Record<FateStatKey, number>>): string {
    if (!stats) return '';
    const labels: Record<FateStatKey, string> = {
      damage: '伤害', fireRate: '射速', range: '射程', width: '弹宽', moveSpeed: '移速', projSpeed: '弹速',
    };
    return (Object.entries(stats) as Array<[FateStatKey, number]>)
      .map(([key, delta]) => `${labels[key]}${delta > 0 ? '+' : ''}${delta}%`)
      .join(' · ');
  }

  private fateResponseMechanics(response: FateResponse): string {
    const effects: Record<FateResponse['effect'], string> = {
      store_volleys: '下一战储存攻击',
      returning_breath: '弹体折返',
      guard: '下一战开局护盾',
      focus: '弹体追踪',
      scatter: '弹体+1 · 单发稍弱',
      haste: '射速提高',
      heavy_breath: '伤害提高 · 弹速降低',
      delay_pain: '下次受伤延后',
      release_pain: '血越少伤害越高',
      gain_coins: '获得零钱',
      heal: '恢复生命',
      trade_max_hp: '最大生命-5 · 伤害提高',
    };
    return [effects[response.effect], this.fateStatsLine(response.stats)].filter(Boolean).join(' · ');
  }

  private fateFactLine(event: FateEvent): string {
    const effect = event.unavoidable;
    if (effect.kind === 'none') return '事情已经发生，没有数值能把它撤回。';
    if (effect.kind === 'damage') return `已落账 · 生命 -${effect.amount}`;
    if (effect.kind === 'lose_coins') return `已落账 · 零钱 -${effect.amount}`;
    if (effect.kind === 'gain_coins') return `已落账 · 零钱 +${effect.amount}`;
    if (effect.kind === 'lose_max_hp') return `已落账 · 最大生命 -${effect.amount}`;
    if (effect.kind === 'gain_item' && effect.item) return `已穿上 · ${getItem(effect.item).name}`;
    return '事情已经发生。';
  }

  private updateStageDirector(dt: number): void {
    const stage = STAGES[this.encounterIndex];
    if (!stage) return;
    const isFinal = stage.end === 'final';
    if (this.spawnPause > 0) this.spawnPause = Math.max(0, this.spawnPause - dt);

    const alive = this.enemies.filter((enemy) => !enemy.dead).length;
    const maxAlive = this.encounterIndex === 0 ? 10 : this.encounterIndex === 1 ? 12 : MAX_ALIVE_ENEMIES;
    const bossAlive = this.enemies.some((enemy) => !enemy.dead && enemy.boss && enemy.type !== 'lamp-keeper');
    const stillSpawning = (isFinal
      ? this.battleTime < DARKNESS_START + DARKNESS_SHRINK - 4
      : this.battleTime < stage.duration - 4) && !bossAlive;
    if (stillSpawning && alive < maxAlive && this.spawnPause <= 0) {
      this.spawnTimer -= dt;
      const pressure = Math.max(0.62, 1 - (this.battleTime / stage.duration) * 0.4);
      while (this.spawnTimer <= 0) {
        this.spawnTimer += stage.spawnEvery * pressure * (this.darkActive ? 2.2 : 1);
        const type = stage.pool[Math.floor(this.random() * stage.pool.length)]!;
        this.spawnSeekingEnemy(type);
      }
    }

    // 一关一 Boss：到点出场，怪潮暂停3秒；Boss 不死阶段不结算（livingStageElite 把关）
    if (!this.eliteSpawned && stage.bossAt !== undefined && stage.bossType && this.battleTime >= stage.bossAt) {
      this.eliteSpawned = true;
      this.spawnPause = 3;
      const bossLines: Partial<Record<EnemyType, string>> = {
        'closet-dark': '衣柜背后的黑，终于自己走了出来',
        'uniform-answer': '排名贴上墙，所有人的目光一起转了过来。',
        'last-bus': '录用短信晚了十分钟。末班车已经关门。',
        'silent-father': '雨声先到，父亲后到',
        'debt-collector': '门被敲响了。它有你的地址',
      };
      const bossSpawn = this.createSeekingEnemy(stage.bossType, this.heroX, this.heroY - 240);
      this.enemies.push(bossSpawn);
      this.eliteAlertName = bossSpawn.name;
      this.eliteAlertTime = 2.4;
      this.feedback.play('boss');
      this.feedback.vibrate([18, 42, 24]);
      this.caption = bossLines[stage.bossType] ?? stage.title;
      this.captionTime = 4.5;
    }

    if (stage.stallAt !== undefined && this.stallSpawnedAt !== this.encounterIndex && this.battleTime >= stage.stallAt) {
      this.stallSpawnedAt = this.encounterIndex;
      const angle = this.random() * Math.PI * 2;
      this.worldStall = { x: this.heroX + Math.cos(angle) * 210, y: this.heroY + Math.sin(angle) * 210 };
      this.say('前面有个亮着灯的摊位');
    }

    if (stage.rewardAt !== undefined && this.rewardSpawnedAt !== this.encounterIndex && this.battleTime >= stage.rewardAt) {
      this.rewardSpawnedAt = this.encounterIndex;
      const choices = this.pickItemChoices(false);
      if (choices.length > 0) {
        const angle = this.random() * Math.PI * 2;
        this.worldReward = {
          x: this.heroX + Math.cos(angle) * 175,
          y: this.heroY + Math.sin(angle) * 175,
          ttl: 34,
          choices,
        };
        this.say('路边亮起一座人生物证台');
      }
    }

    if (stage.doorAt !== undefined && !this.doorTriedThisStage && !this.doorUsed && this.battleTime >= stage.doorAt) {
      this.doorTriedThisStage = true;
      const kind = this.pickSpecialKind();
      const angle = this.random() * Math.PI * 2;
      this.worldDoor = { kind, x: this.heroX + Math.cos(angle) * 190, y: this.heroY + Math.sin(angle) * 190, ttl: 36 };
      this.say(kind === 'light' ? '远处亮起一盏暖黄的窗灯' : '一道帘子后面闪着冷白的灯');
    }
    if (this.worldReward) {
      this.worldReward.ttl -= dt;
      if (this.worldReward.ttl <= 0) {
        this.worldReward = undefined;
        this.say('物证台慢慢沉回了地面');
      } else if (Math.hypot(this.heroX - this.worldReward.x, this.heroY - this.worldReward.y) < 36) {
        this.openWorldReward();
        return;
      }
    }
    if (this.worldDoor) {
      this.worldDoor.ttl -= dt;
      if (this.worldDoor.ttl <= 0) {
        this.worldDoor = undefined;
        this.say('门沉回了黑暗里');
      } else if (Math.hypot(this.heroX - this.worldDoor.x, this.heroY - this.worldDoor.y) < 38) {
        this.openSpecialRoom(this.worldDoor.kind);
        return;
      }
    }
    if (this.worldStall && this.stallCooldown <= 0
      && Math.hypot(this.heroX - this.worldStall.x, this.heroY - this.worldStall.y) < 36) {
      this.worldStall = undefined;
      this.resetMovementInput();
      this.setupShop();
      this.state = 'shop';
      return;
    }

    if (isFinal) {
      if (!this.finalFateTriggered && this.battleTime >= FINAL_FATE_AT) {
        this.finalFateTriggered = true;
        this.openFate('battle');
        return;
      }
      if (!this.darkActive && this.battleTime >= DARKNESS_START) {
        this.darkActive = true;
        this.darkCX = this.heroX;
        this.darkCY = this.heroY;
        this.darkR = 330;
        this.say('四周的黑暗开始往里收');
      }
      if (this.darkActive && !this.lampSpawned) {
        const t = this.clamp((this.battleTime - DARKNESS_START) / DARKNESS_SHRINK, 0, 1);
        this.darkR = 330 - t * (330 - 96);
        if (t >= 1) {
          this.lampSpawned = true;
          this.eliteAlertName = '收灯人';
          this.eliteAlertTime = 2.8;
          this.feedback.play('boss', 1.2);
          this.feedback.vibrate([22, 48, 30]);
          this.enemies.push(this.createSeekingEnemy('lamp-keeper', this.darkCX, this.darkCY - 130));
          this.caption = '「到点了。」';
          this.captionTime = 4.5;
        }
      }
    } else if (this.battleTime >= stage.duration) {
      const elite = this.livingStageElite();
      if (elite) {
        if (!this.stageWaitingForElite) {
          this.stageWaitingForElite = true;
          this.caption = `${elite.name}还没有结束。`;
          this.captionTime = 4.2;
          this.say('这件事不能靠跑过去');
        }
      } else this.beginStageTransition();
    }
  }

  private spawnCoinDrop(x: number, y: number, value: number): void {
    if (value <= 0) return;
    if (this.coinDrops.length >= MAX_COIN_DROPS) this.coinDrops.shift();
    const jitterAngle = this.random() * Math.PI * 2;
    const jitterDist = this.random() * 10;
    this.coinDrops.push({
      id: this.entityId++,
      x: x + Math.cos(jitterAngle) * jitterDist,
      y: y + Math.sin(jitterAngle) * jitterDist,
      value,
      life: 30,
    });
  }

  private updateCoinDrops(dt: number): void {
    if (!this.coinDrops.length) return;
    const magnet = 62 + this.poisons.greed * 6;
    for (const drop of this.coinDrops) {
      drop.life -= dt;
      const dx = this.heroX - drop.x;
      const dy = this.heroY - drop.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < magnet) {
        const pull = 150 + (magnet - dist) * 4;
        drop.x += (dx / dist) * pull * dt;
        drop.y += (dy / dist) * pull * dt;
      }
      if (dist < 16) {
        drop.life = 0;
        this.hero.coins += drop.value;
        this.feedback.play('coin', drop.value > 1 ? 1.15 : 0.8);
        this.burst('word', this.heroX, this.heroY - 34, 20, '#d5b45d', `+${drop.value}`);
      }
    }
    this.coinDrops = this.coinDrops.filter((drop) => drop.life > 0);
  }

  private spawnSeekingEnemy(type: EnemyType, opts?: { elite?: boolean; name?: string }): void {
    const angle = this.random() * Math.PI * 2;
    const dist = 250 + this.random() * 90;
    let x = this.heroX + Math.cos(angle) * dist;
    let y = this.heroY + Math.sin(angle) * dist;
    if (this.darkActive) {
      const dc = Math.hypot(x - this.darkCX, y - this.darkCY) || 1;
      const maxR = Math.max(60, this.darkR - 12);
      if (dc > maxR) {
        x = this.darkCX + ((x - this.darkCX) / dc) * maxR;
        y = this.darkCY + ((y - this.darkCY) / dc) * maxR;
      }
    }
    this.enemies.push(this.createSeekingEnemy(type, x, y, opts));
  }

  private frame(time: number): void {
    if (!this.lastTime) this.lastTime = time;
    const delta = Math.min(0.05, (time - this.lastTime) / 1000) * this.auditTimeScale;
    this.lastTime = time;
    this.accumulator += delta;
    while (this.accumulator >= FIXED_STEP) {
      this.update(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }
    this.render();
    requestAnimationFrame((next) => this.frame(next));
  }

  private update(dt: number): void {
    if (this.paused) return;
    this.visualTime += dt;
    if (this.toastTime > 0) this.toastTime -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt);
    if (this.eliteAlertTime > 0) this.eliteAlertTime = Math.max(0, this.eliteAlertTime - dt);
    this.bursts.forEach((burst) => (burst.life -= dt));
    this.bursts = this.bursts.filter((burst) => burst.life > 0);
    if (this.saveEffect) {
      this.saveEffect.timer -= dt;
      if (this.saveEffect.timer <= 0) this.saveEffect = null;
    }
    this.enemyDeaths.forEach((death) => (death.life -= dt));
    this.enemyDeaths = this.enemyDeaths.filter((death) => death.life > 0);
    if (this.enemies.some((enemy) => enemy.dead)) {
      this.enemies = this.enemies.filter((enemy) => !enemy.dead);
    }
    this.enemies.forEach((enemy) => {
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.age += dt;
    });
    if (this.state === 'origin') {
      if (this.aiOriginState === 'gpt') {
        this.originElapsed = Math.min(this.originStoryDuration(), this.originElapsed + dt);
      } else {
        this.originElapsed += dt;
      }
      return;
    }
    if (this.state === 'fateEvent') {
      if (this.currentFate && !this.fateResultDirection && !this.fateFreeWaiting) this.fateAnim += dt;
      if (this.fateFreeWaiting) this.fateFreeWaitElapsed += dt;
      if (this.fateResultDirection) {
        if (this.fateExitTimer > 0) this.fateExitTimer -= dt;
        else if (this.fateResultMinTimer > 0) this.fateResultMinTimer -= dt;
        return;
      }
    }
    if (this.state === 'itemReward' && this.rewardAcquire) {
      this.rewardAcquire.timer = Math.max(0, this.rewardAcquire.timer - dt);
      if (this.rewardAcquire.timer <= 0) this.completeRewardAcquire();
      return;
    }
    if (this.state === 'shop' && this.shopFeedback) {
      this.shopFeedback.timer = Math.max(0, this.shopFeedback.timer - dt);
      if (this.shopFeedback.timer <= 0) this.shopFeedback = undefined;
    }
    if (this.state !== 'battle') return;
    if (this.captionTime > 0) this.captionTime -= dt;
    if (this.comboReveal) {
      this.comboReveal.timer -= dt;
      if (this.comboReveal.timer <= 0) this.comboReveal = undefined;
      else if (this.comboReveal.total - this.comboReveal.timer < 0.4) return;
    }
    if (!this.comboReveal && this.comboRevealQueue.length > 0) {
      const def = this.comboRevealQueue.shift()!;
      this.comboReveal = { name: def.name, artKey: def.artKey, line: def.line, timer: 2.25, total: 2.25 };
    }
    if (this.watchReleaseTimer > 0) this.watchReleaseTimer -= dt;
    if (this.usefulTimer > 0) this.usefulTimer -= dt;
    this.sinceVolley += dt;
    // 延迟出膛：五连发的后几哈、AI 的复读回声
    if (this.pendingShots.length > 0) {
      const due: PendingShot[] = [];
      this.pendingShots = this.pendingShots.filter((shot) => {
        shot.delay -= dt;
        if (shot.delay <= 0) { due.push(shot); return false; }
        return true;
      });
      for (const shot of due) {
        this.spawnProjectile({
          x: this.heroX, y: this.heroY - 14, angle: shot.angle, damage: shot.damage,
          speed: shot.speed, radius: shot.radius, range: shot.range, life: shot.life,
          pierce: shot.pierce, returning: shot.returning, homing: shot.homing, splitChance: shot.splitChance,
          splitDepth: shot.splitDepth, explosion: shot.explosion, generation: shot.generation, color: shot.color, style: shot.style,
          critical: shot.critical, knockback: shot.knockback, shrink: shot.shrink,
        });
      }
    }
    // 《KTV里没人听的那首歌》：每6秒攒满一口，向四周吼出一圈声浪
    if (this.hasItem('ktv-song')) {
      this.ktvTimer += dt;
      if (this.ktvTimer >= 6) {
        this.ktvTimer = 0;
        const roar = this.computeAttackVector();
        const roarMechanics = this.inheritProjectileMechanics(roar, {
          pierceAdd: 1,
          homingScale: 0.6,
          splitScale: 0.45,
          explosionScale: 0.6,
        });
        for (let index = 0; index < 10; index += 1) {
          const angle = (index / 10) * Math.PI * 2;
          this.spawnProjectile({
            x: this.heroX, y: this.heroY - 12, angle, damage: roar.damage * 0.9,
            speed: roar.projectileSpeed * 0.8, radius: Math.max(3, roar.width * 0.9),
            range: 150, life: 1.2, ...roarMechanics, generation: 0, style: 'sound',
            critical: false, knockback: roar.knockback * 1.4, color: '#8fa8bd',
          });
        }
        this.burst('ring', this.heroX, this.heroY - 16, 90, '#8fa8bd');
        this.burst('word', this.heroX, this.heroY - 58, 30, '#8fa8bd', '吼');
        this.sigh(2.2);
      }
    }
    // 《相亲桌上没拆的矿泉水》：对峙满8秒，对面先绷不住
    if (this.hasItem('mineral-water')) {
      const standoffMark = Math.floor(this.noHitTime / 8);
      if (standoffMark > this.lastStandoffMark) {
        this.lastStandoffMark = standoffMark;
        const rival = this.nearestEnemy(this.heroX, this.heroY);
        if (rival) {
          this.damageEnemy(rival, this.computeAttackVector().damage * 4, '#7e97a0');
          rival.slowTimer = Math.max(rival.slowTimer ?? 0, 1.5);
          this.burst('word', rival.x, rival.y - 26, 30, '#7e97a0', '先拧开的输了');
        }
      } else if (standoffMark === 0) {
        this.lastStandoffMark = 0;
      }
    }
    // 站立叹气：每静立满 6 秒，深深叹一口气
    if (Math.floor(this.standStillTime / 6) > this.lastSighMark) {
      this.lastSighMark = Math.floor(this.standStillTime / 6);
      this.sigh(1.7);
    }
    if (this.standStillTime === 0) this.lastSighMark = 0;
    if (this.stallCooldown > 0) this.stallCooldown -= dt;
    if (this.hurtCooldown > 0) this.hurtCooldown -= dt;
    if (this.heroAttackTimer > 0) this.heroAttackTimer = Math.max(0, this.heroAttackTimer - dt);
    if (this.transitionTimer > 0) {
      this.transitionTimer -= dt;
      this.updateHeroMovement(dt);
      if (this.transitionTimer <= 0) this.stageEndReward();
      return;
    }

    this.battleTime += dt;
    this.updateHeroMovement(dt);
    this.updateStageDirector(dt);
    if (this.state !== 'battle') return;
    // ―― 道具每帧结算：静止/躺平、账单、闭眼、外卖回血、慢性损耗、嘲讽 ――
    const wasLying = this.standStillTime >= 2;
    this.standStillTime = this.heroMoving ? 0 : Math.min(8, this.standStillTime + dt);
    if (wasLying && this.heroMoving && this.hasItem('unwashed-pillow')) this.pillowPenalty = 1;
    if (this.pillowPenalty > 0) this.pillowPenalty -= dt;
    if (this.flashCooldown > 0) this.flashCooldown -= dt;
    if (this.stunTimer > 0) this.stunTimer -= dt;
    if (this.graceTimer > 0) { this.graceTimer -= dt; this.hurtCooldown = Math.max(this.hurtCooldown, 0.1); }
    if (this.enemyHasteTimer > 0) this.enemyHasteTimer -= dt;
    if (this.heroSlowTimer > 0) this.heroSlowTimer -= dt;
    if (this.sockBoostTimer > 0) this.sockBoostTimer -= dt;
    this.noHitTime += dt;
    if (this.billTimer > 0) {
      this.billTimer -= dt;
      if (this.billTimer <= 0) {
        if (this.hero.coins >= 2) {
          this.hero.coins -= 2;
          this.say('账单已划扣 · -2零钱');
        } else {
          this.hurtCooldown = 0;
          this.hurtHero(8);
          this.say('没钱 · 拿身体抵');
        }
      }
    }
    if (this.hasItem('third-pill')) this.pillTimer += dt;
    if (this.hasItem('eye-exercise')) {
      this.eyeTimer += dt;
      if (this.eyeTimer >= 12) {
        this.eyeTimer = 0;
        this.hurtCooldown = Math.max(this.hurtCooldown, 0.5);
        this.enemyHasteTimer = 1.5;
        this.burst('word', this.heroX, this.heroY - 50, 40, '#9db8c8', '闭眼');
      }
    }
    if (this.hasItem('takeout-3am') && this.hero.hp < this.hero.maxHp * 0.4) {
      this.takeoutTick -= dt;
      if (this.takeoutTick <= 0) {
        this.takeoutTick = 2;
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 1);
      }
    }
    if (this.hasItem('hair-in-takeout') && !this.hairUsedStage && this.hero.hp < this.hero.maxHp * 0.3) {
      this.hairUsedStage = true;
      this.healHero(8);
      this.burst('word', this.heroX, this.heroY - 46, 30, '#c9c2b5', '将就吃了');
    }
    if (this.hasItem('goodnight-2h')) {
      this.goodnightTick -= dt;
      if (this.goodnightTick <= 0) { this.goodnightTick = 30; this.changeMaxHp(-1); }
    }
    if (this.hasItem('sock-cigs')) {
      this.sockTick -= dt;
      if (this.sockTick <= 0) { this.sockTick = 45; this.changeMaxHp(-1); }
    }
    if (this.hasItem('ruma-msg') && this.ruCharges > 0 && this.hero.hp < this.hero.maxHp * 0.35) {
      this.hero.block = Math.min(24, this.hero.block + this.ruCharges * 5);
      this.burst('word', this.heroX, this.heroY - 56, 50, '#9fd0b8', '在吗');
      this.ruCharges = 0;
    }
    if (this.hasItem('abstract-lv10')) {
      this.tauntTimer -= dt;
      if (this.tauntTimer <= 0) {
        this.tauntTimer = 8;
        const taunted = this.nearestEnemy(this.heroX, this.heroY);
        if (taunted && !taunted.boss) {
          taunted.dashTimer = 2.5;
          taunted.flash = 0.2;
          this.burst('word', taunted.x, taunted.y - 20, 24, '#c9a8d8', '6');
        }
      }
    }
    if (this.hasItem('spent-decade')) {
      this.decadeCooldown -= dt;
      if (this.decadeCooldown <= 0) {
        this.decadeCooldown += 10;
        for (let index = 0; index < 5; index += 1) this.fireBaseVolley(index * 0.035 - 0.07);
        this.breathlessTimer = 2;
        this.burst('word', this.heroX, this.heroY - 52, 44, '#c3c0b8', '十年后再还');
      }
    }
    if (this.breathlessTimer > 0) this.breathlessTimer -= dt;

    if (this.painlessTimer > 0) {
      this.painlessTimer -= dt;
      if (this.painlessTimer <= 0 && this.painlessDamage > 0) {
        const payment = Math.ceil(this.painlessDamage);
        this.painlessDamage = 0;
        this.applyHeroDamage(payment);
        this.say(`痛觉回来 · 结算 ${payment}`);
      }
    }

    if (this.hasItem('slow-watch')) {
      this.watchCooldown -= dt;
      if (this.watchCooldown <= 0) {
        this.watchCooldown += 7;
        this.watchFreeze = 1.05;
        this.burst('word', this.heroX, this.heroY - 60, 54, '#9dc2c8', '慢七分钟');
      }
      if (this.watchFreeze > 0) {
        const before = this.watchFreeze;
        this.watchFreeze -= dt;
        if (before > 0 && this.watchFreeze <= 0) {
          this.projectiles.forEach((projectile) => {
            projectile.vx *= 1.45;
            projectile.vy *= 1.45;
          });
          this.burst('ring', this.heroX, this.heroY - 40, 140, '#9dc2c8');
          // 《大人说这都是为你好》：冻结解除后 1.5 秒，一口气压穿敌群
          if (this.hasCombo('大人说这都是为你好')) this.watchReleaseTimer = 1.5;
        }
      }
    }

    if (this.holdTimer > 0) {
      const before = this.holdTimer;
      this.holdTimer -= dt;
      if (before > 0 && this.holdTimer <= 0) {
        const volleys = this.heldVolleys;
        this.heldVolleys = 0;
        for (let index = 0; index < volleys; index += 1) this.fireBaseVolley(index * 0.05 - 0.08);
        this.say(`忍住之后 · ${volleys}轮齐发`);
      }
    } else if (this.breathlessTimer <= 0) {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) {
        if (this.hasLivingEnemies()) {
          this.fireBaseVolley();
          this.shotTimer = Math.max(0.05, this.shotTimer + this.computeAttackVector().fireInterval);
        } else {
          this.shotTimer = 0;
        }
      }
    }

    this.updateEnemies(dt);
    this.updateCoinDrops(dt);
    if (this.watchFreeze <= 0) this.updateProjectiles(dt);

    if (this.hero.hp <= 0) {
      this.endRun(false);
    }
  }

  private computeAttackVector(): AttackVector {
    const vector: AttackVector = { ...BASE_VECTOR };
    vector.damage *= this.originModifiers.damageMul * this.fateBuild.damageMul;
    vector.fireInterval *= this.originModifiers.fireIntervalMul * this.fateBuild.intervalMul;
    vector.range *= this.originModifiers.rangeMul * this.fateBuild.rangeMul;
    vector.width *= this.fateBuild.widthMul;
    vector.projectileSpeed *= this.fateBuild.speedMul;
    vector.projectileCount += this.fateBuild.countAdd;
    vector.homing += this.fateBuild.homingAdd;
    vector.returning ||= this.fateBuild.returning;

    const greedPower = Math.min(0.28, this.poisons.greed * this.hero.coins * 0.004);
    vector.damage *= 1 + greedPower;
    vector.width *= 1 + this.poisons.greed * 0.018;
    vector.projectileSpeed *= Math.max(0.78, 1 - this.poisons.greed * 0.01);
    vector.damage *= 1 + this.poisons.anger * 0.025;
    vector.range *= Math.max(0.72, 1 - this.poisons.anger * 0.015);
    vector.homing += this.poisons.delusion * 0.012;
    vector.splitChance += this.poisons.delusion * 0.012;
    vector.critChance += this.poisons.pride * 0.018;
    vector.width *= 1 + this.poisons.pride * 0.012;
    vector.splitChance += this.poisons.doubt * 0.016;
    vector.spread += this.poisons.doubt * 0.009;
    vector.fireInterval *= 1 + this.poisons.doubt * 0.012;
    if (this.fateBuild.missingHpDamage > 0) {
      const missingRatio = 1 - this.hero.hp / Math.max(1, this.hero.maxHp);
      vector.damage *= 1 + missingRatio * this.fateBuild.missingHpDamage;
    }
    if (this.hasItem('wooden-sword')) {
      vector.damage *= 1.45;
      vector.width *= 1.3;
      vector.range *= 0.65;
    }
    if (this.hasItem('red-workbook')) {
      vector.damage *= 0.88;
      vector.returning = true;
    }
    if (this.hasItem('stone-schoolbag')) {
      vector.damage *= 1.4;
      vector.projectileSpeed *= 0.55;
      vector.pierce += 2;
      vector.lifetime *= 1.45;
    }
    if (this.hasItem('bleach-powder')) {
      vector.fireInterval *= 0.78;
      vector.critChance += 0.08;
    }
    if (this.hasItem('eyebrow-razor')) {
      vector.damage *= 1.18;
      vector.critChance += 0.25;
      vector.width *= 0.45;
    }
    if (this.hasItem('front-desk-letter')) {
      vector.damage *= 0.92;
      vector.homing += 0.15;
      vector.spread += 0.12;
    }
    if (this.hasItem('cracked-glasses')) {
      vector.range *= 1.55;
      vector.critChance += 0.14;
      vector.width *= 0.65;
    }
    if (this.hasItem('small-uniform')) {
      vector.fireInterval *= 0.78;
      vector.width *= 0.85;
    }
    if (this.hasItem('only-key')) {
      vector.range *= 0.88;
      vector.explosion += 10;
    }
    if (this.hasItem('first-salary')) vector.damage *= 1 + Math.floor(this.hero.coins / 5) * 0.06;
    if (this.hasItem('nameless-tie')) {
      vector.damage *= 1.18;
      vector.critChance += 0.18;
    }
    if (this.hasItem('fathers-raincoat')) vector.fireInterval *= 1.18;
    if (this.hasItem('unsent-phone')) vector.fireInterval *= 1 + this.phoneCharges * 0.03;
    if (this.hasItem('baby-tooth')) vector.damage *= 0.9;
    if (this.hasItem('revoked-badge')) vector.damage *= 1 + this.items.length * 0.05;
    if (this.hasItem('slow-watch')) vector.projectileSpeed *= 0.85;
    if (this.hasItem('missing-photo') && this.hero.hp < this.hero.maxHp * 0.5) vector.fireInterval *= 1.15;
    if (this.hasItem('white-bottle')) {
      vector.fireInterval *= 0.7;
      vector.damage *= 0.9;
    }
    if (this.hasItem('empty-frame')) {
      vector.explosion += 12;
      vector.lifetime *= 0.75;
    }
    if (this.hasItem('broken-spine')) {
      const negatives = this.negativeItemCount();
      vector.damage *= 1 + negatives * 0.12;
      vector.pierce += Math.floor(negatives / 3);
      vector.knockback += negatives * 1.8;
    }
    if (this.hasItem('painless-night') && this.painlessDamage > 0) {
      vector.damage *= 1 + Math.min(1.5, this.painlessDamage * 0.035);
      vector.width *= 1 + Math.min(0.8, this.painlessDamage * 0.018);
    }
    if (this.hasItem('held-pee')) vector.damage *= 1 + Math.min(0.6, this.standStillTime * 0.075);
    if (this.hasItem('class-break') && this.battleTime < 10) vector.fireInterval *= 0.8;
    if (this.hasItem('last-page')) {
      const stageDuration = STAGES[this.encounterIndex]?.duration ?? 90;
      if (this.battleTime > stageDuration - 10) vector.damage *= 2;
      else if (this.battleTime < 30) vector.damage *= 0.9;
    }
    // ―― 第三批道具的数值层（顺序：先乘算修正，最后 checkup-arrows 双向放大）――
    if (this.hasItem('always-crying')) vector.range *= 0.88;
    if (this.hasItem('typing-indicator')) vector.fireInterval *= 1.04;
    if (this.hasItem('shop-freezer')) vector.fireInterval *= 1.05;
    if (this.hasItem('retracted-voice')) vector.fireInterval *= 1 + this.voiceCharges * 0.02;
    if (this.hasItem('auto-renew') && this.battleTime < 15) vector.damage *= 1.1;
    if (this.hasItem('bargain-link')) vector.damage *= 1 + this.items.filter((owned) => getItem(owned).quality <= 2).length * 0.03;
    if (this.hasItem('group-dad')) vector.damage *= 0.9;
    if (this.hasItem('loan-contract')) vector.damage *= 1.25;
    if (this.hasItem('momo-avatar')) {
      const nearMomo = this.nearestEnemy(this.heroX, this.heroY);
      const momoDist = nearMomo ? Math.hypot(nearMomo.x - this.heroX, nearMomo.y - this.heroY) : 999;
      if (momoDist > 150) vector.critChance += 0.25;
      else if (momoDist < 80) vector.damage *= 0.92;
    }
    if (this.hasItem('one-more-game')) {
      if (this.oneMoreBuff) vector.damage *= 1.1;
      if (this.battleTime < 1) vector.fireInterval *= 2;
    }
    if (this.hasItem('shared-powerbank')) vector.fireInterval *= 0.88;
    if (this.hasItem('goodnight-2h') && this.hero.hp < this.hero.maxHp * 0.5) vector.fireInterval *= 0.85;
    if (this.hasItem('unwashed-pillow') && this.pillowPenalty > 0) vector.fireInterval *= 1.2;
    if (this.hasItem('friend-verify')) vector.damage *= 1 + this.noBuyStacks * 0.06;
    if (this.hasItem('old-door-lock')) {
      vector.returning = true;
      vector.range *= 0.9;
    }
    if (this.hasItem('held-elevator')) vector.projectileSpeed *= 0.92;
    if (this.borrowedStat === '伤害') vector.damage *= 1.12;
    if (this.borrowedStat === '射速') vector.fireInterval *= 0.89;
    if (this.borrowedStat === '射程') vector.range *= 1.12;
    if (this.hasItem('third-pill')) {
      const pillPhase = this.pillTimer % 20;
      if (pillPhase < 8) { vector.damage *= 1.6; vector.fireInterval *= 0.71; }
      else if (pillPhase < 11) { vector.damage *= 0.6; vector.fireInterval *= 1.4; vector.range *= 0.7; }
    }
    if (this.graceTimer > 0) vector.damage *= 1.5;
    if (this.hasItem('checkup-arrows')) {
      const amplify = (value: number, base: number) => (value >= base ? value * 1.08 : value * 0.92);
      vector.damage = amplify(vector.damage, BASE_VECTOR.damage);
      vector.range = amplify(vector.range, BASE_VECTOR.range);
      vector.width = amplify(vector.width, BASE_VECTOR.width);
      vector.projectileSpeed = amplify(vector.projectileSpeed, BASE_VECTOR.projectileSpeed);
      vector.fireInterval = vector.fireInterval <= BASE_VECTOR.fireInterval ? vector.fireInterval * 0.92 : vector.fireInterval * 1.08;
    }

    if (this.hasItem('front-desk-letter') && this.hasItem('fathers-raincoat')) {
      vector.projectileSpeed *= 0.7;
      vector.damage *= 1.2;
      vector.pierce += 1;
    }
    if (this.hasItem('stone-schoolbag') && this.hasItem('slow-watch')) {
      vector.lifetime *= 1.45;
      vector.damage *= 1.12;
    }
    if (this.watchReleaseTimer > 0 && this.hasCombo('大人说这都是为你好')) {
      vector.pierce += 2;
      vector.damage *= 1.25;
    }
    if (this.hasCombo('能屈能伸')) vector.critChance += this.negativeItemCount() * 0.03;
    if (this.usefulTimer > 0 && this.hasCombo('我只在有用时被看见')) vector.damage *= 1.15;

    // 《KTV里没人听的那首歌》：常规攻击让位给那一声吼
    if (this.hasItem('ktv-song')) vector.damage *= 0.85;
    // 《冬天呵在玻璃上的字》：一口气呵成宽雾锥
    if (this.hasItem('breath-on-glass')) {
      vector.width *= 2.2;
      vector.pierce += 2;
      vector.range *= 0.55;
    }
    this.applyOdDistortion(vector);
    // 《把名字卖掉的合同》：制式化——零散射、永不暴击、零波动，基础+30%
    if (this.hasItem('name-sold')) {
      vector.damage *= 1.3;
      vector.critChance = 0;
      vector.spread = 0.03;
    }
    vector.damage = this.clamp(vector.damage, 1, 90);
    vector.fireInterval = this.clamp(vector.fireInterval, 0.12, 2.2);
    vector.range = this.clamp(vector.range, 65, 430);
    vector.width = this.clamp(vector.width, 1.8, 32);
    vector.projectileSpeed = this.clamp(vector.projectileSpeed, 45, 600);
    vector.projectileCount = Math.round(this.clamp(vector.projectileCount, 1, 10));
    vector.spread = this.clamp(vector.spread, 0.03, 1.1);
    vector.pierce = Math.round(this.clamp(vector.pierce, 0, 8));
    vector.lifetime = this.clamp(vector.lifetime, 0.7, 9);
    vector.critChance = this.clamp(vector.critChance, 0, 0.85);
    vector.homing = this.clamp(vector.homing, 0, 0.5);
    vector.splitChance = this.clamp(vector.splitChance, 0, 1);
    vector.explosion = this.clamp(vector.explosion, 0, 90);
    return vector;
  }

  private negativeItemCount(): number {
    return this.items.filter((id) => !getItem(id).negative.includes('没有负面')).length;
  }

  private computeProjectileVisual(
    extraMaterial?: ProjectileVisual['materials'][number],
    generation = 0,
  ): ProjectileVisual {
    const visual: ProjectileVisual = {
      form: 'breath', trail: generation > 0 ? 'echo' : 'mist', echoed: generation > 0,
      coreColor: '#E8E1D3', materialTint: '#E8E1D3', edgeColor: '#AAA196',
      trailColor: '#8f887f', impactColor: '#e8e1d3', opacity: 1,
      length: 1.55, softness: 1, sharpness: 0, weight: 0, wetness: 0,
      distortion: 0, segments: 1, materials: ['breath'],
    };
    if (this.hasItem('front-desk-letter')) {
      visual.materials.push('paper');
      visual.materialTint = '#e2d3bd';
      visual.edgeColor = '#81766d';
      visual.length += 0.8;
      visual.softness *= 0.55;
    }
    if (this.hasItem('fathers-raincoat')) {
      visual.wetness += 0.55;
      visual.materialTint = this.hasItem('front-desk-letter') ? '#95b0ad' : '#a9c5c5';
      visual.trailColor = '#6f9da3';
    }
    if (this.hasItem('stone-schoolbag')) {
      visual.weight += 1;
      visual.materialTint = this.mixHex(visual.materialTint, '#665f58', 0.28);
      visual.length *= 0.9;
    }
    if (this.hasItem('bleach-powder')) {
      visual.coreColor = '#efe56f';
      visual.materialTint = this.mixHex(visual.materialTint, '#d7c84f', 0.42);
      visual.trailColor = '#c5b941';
    }
    if (this.hasItem('eyebrow-razor')) {
      visual.materials.push('metal');
      visual.sharpness += 1;
      visual.softness *= 0.18;
      visual.length += 1.8;
      visual.edgeColor = '#d7dfe0';
    }
    if (this.hasItem('od-pill')) {
      visual.distortion += 0.75;
      visual.coreColor = '#e89ac8';
      visual.trailColor = '#73c3c1';
    }
    if (this.hasItem('red-workbook')) visual.edgeColor = '#b74450';
    if (this.hasItem('broken-spine')) {
      visual.materials.push('bone');
      visual.segments = Math.max(3, 2 + this.negativeItemCount());
      visual.length += 1.2;
      visual.softness *= 0.25;
      visual.materialTint = '#d8d0bb';
      visual.edgeColor = '#843842';
    }
    // ―― 第三批道具的弹道表现：现实影射到子弹的材质与颜色 ――
    if (this.hasItem('always-crying')) {
      if (!visual.materials.includes('water')) visual.materials.push('water');
      visual.wetness += 0.4;
      visual.trailColor = '#9fc2d8';
    }
    if (this.hasItem('shop-freezer')) {
      visual.edgeColor = '#bfe0e8';
      visual.trailColor = '#8fb8c8';
    }
    if (this.hasItem('marble')) {
      if (!visual.materials.includes('metal')) visual.materials.push('metal');
      visual.coreColor = '#cfe4ea';
      visual.softness *= 0.6;
    }
    if (this.hasItem('old-door-lock')) visual.edgeColor = '#c9a45f';
    if (this.hasItem('third-pill')) {
      visual.distortion += 0.6;
      visual.materialTint = this.mixHex(visual.materialTint, '#96789c', 0.3);
    }
    if (this.hasItem('name-sold')) {
      visual.coreColor = this.mixHex(visual.coreColor, '#8a8a8a', 0.5);
      visual.opacity *= 0.9;
    }
    if (this.hasItem('momo-avatar')) visual.edgeColor = '#e8a8c8';
    if (this.hasItem('retracted-voice') && !visual.materials.includes('signal')) visual.materials.push('signal');
    if (this.hasItem('flash-escape')) visual.trailColor = '#b9a8d6';
    if (this.hasItem('year-report')) visual.trailColor = this.mixHex(visual.trailColor, '#4a4a68', 0.4);
    if (extraMaterial && !visual.materials.includes(extraMaterial)) visual.materials.push(extraMaterial);
    if (extraMaterial === 'water') {
      visual.wetness = 1;
      visual.materialTint = '#82b4bb';
      visual.trailColor = '#6097a0';
    }
    if (extraMaterial === 'signal') {
      visual.materialTint = '#82c5bc';
      visual.trailColor = '#5e9f98';
    }
    // 和《以撒》的 TearVariant 一样，最终只选择一个主形态；其余道具留在参数与 flags 中。
    if (extraMaterial === 'water') visual.form = 'rain';
    else if (extraMaterial === 'signal') visual.form = 'sound';
    else if (this.hasItem('breath-on-glass')) visual.form = 'cone';
    else if (this.hasItem('broken-spine')) visual.form = 'bone';
    else if (this.hasItem('front-desk-letter')) visual.form = 'paper';
    else if (this.hasItem('only-key')) visual.form = 'key';
    else if (this.hasItem('always-crying')) visual.form = 'tear';

    if (!visual.echoed) {
      if (visual.materials.includes('signal')) visual.trail = 'signal';
      else if (visual.wetness >= 0.35) visual.trail = 'drip';
      else if (visual.sharpness >= 0.7) visual.trail = 'streak';
    }
    return visual;
  }

  private rollOdDistortion(): void {
    this.odBoost = undefined;
    this.odPenalty = undefined;
    if (!this.hasItem('od-pill')) return;
    const stats: DistortionStat[] = ['伤害', '射速', '射程', '弹宽', '弹速'];
    this.odBoost = stats[Math.floor(this.random() * stats.length)];
    const remaining = stats.filter((stat) => stat !== this.odBoost);
    this.odPenalty = remaining[Math.floor(this.random() * remaining.length)];
    this.say(`药效失真 · ${this.odBoost}↑ ${this.odPenalty}↓`);
  }

  private applyOdDistortion(vector: AttackVector): void {
    const apply = (stat: DistortionStat | undefined, boost: boolean) => {
      if (!stat) return;
      if (stat === '伤害') vector.damage *= boost ? 1.6 : 0.55;
      if (stat === '射速') vector.fireInterval *= boost ? 0.58 : 1.65;
      if (stat === '射程') vector.range *= boost ? 1.6 : 0.55;
      if (stat === '弹宽') vector.width *= boost ? 1.8 : 0.5;
      if (stat === '弹速') vector.projectileSpeed *= boost ? 1.65 : 0.55;
    };
    apply(this.odBoost, true);
    apply(this.odPenalty, false);
  }

  private fireBaseVolley(angleNudge = 0): void {
    const target = this.nearestEnemy(this.heroX, this.heroY);
    if (!target) return;
    const vector = this.computeAttackVector();
    this.volleyCount += 1;
    this.stats.volleys += 1;
    let count = vector.projectileCount;
    if (this.hasItem('loose-button') && this.volleyCount % 3 === 0) count += 1;
    const photoVolley = this.hasItem('missing-photo') && this.volleyCount % 4 === 0;
    if (photoVolley) count += 2;
    const baseAngle = Math.atan2(target.y - this.heroY, target.x - this.heroX) + angleNudge;
    this.heroAttackFacing = this.facingFromAngle(baseAngle);
    this.heroAttackTimer = HERO_ATTACK_ANIMATION_DURATION;
    this.feedback.play('breath', this.clamp(vector.width / BASE_VECTOR.width, 0.55, 1.35));
    const style = this.baseProjectileStyle();
    const volleyAngles: number[] = [];
    // 《连续签到1847天》：每个整10秒的第一发准时暴击；受伤打断当期作废
    let rhythmCrit = false;
    if (this.hasItem('streak-1847')) {
      const rhythmWindow = Math.floor(this.battleTime / 10);
      if (rhythmWindow > this.lastRhythmMark && rhythmWindow !== this.rhythmBrokenWindow) {
        this.lastRhythmMark = rhythmWindow;
        rhythmCrit = true;
      }
    }
    // 《对方正在输入…》：停火够久，下一发是憋了很久的那句话
    const charged = this.hasItem('typing-indicator') && this.sinceVolley >= vector.fireInterval + 1.2;
    this.sinceVolley = 0;
    const fiveHa = this.hasItem('five-ha');
    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0 : (index - (count - 1) / 2) * vector.spread;
      const angle = baseAngle + offset;
      volleyAngles.push(angle);
      if (fiveHa) {
        // 《五个哈》：一次笑出五连发，一发比一发轻——少一个都显得没礼貌
        const shares = [0.3, 0.26, 0.22, 0.18, 0.14];
        shares.forEach((share, ha) => {
          this.pushPendingShot({
            delay: ha * 0.07, angle: angle + (ha - 2) * 0.018,
            damage: vector.damage * share * 1.1, speed: vector.projectileSpeed,
            radius: Math.max(2, vector.width * 0.72), range: vector.range, life: vector.lifetime,
            pierce: vector.pierce, homing: vector.homing,
            returning: vector.returning, splitChance: vector.splitChance, explosion: vector.explosion,
            color: this.projectileColor(style), style,
            critical: this.random() < vector.critChance, knockback: vector.knockback * 0.5, generation: 0,
          });
        });
        continue;
      }
      const isCharged = charged && index === 0;
      const critical = (rhythmCrit && index === 0)
        || this.random() < vector.critChance + (isCharged ? 0.35 : 0);
      const criticalMultiplier = this.hasItem('eyebrow-razor') ? 2.25 : 1.8;
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 14, angle,
        damage: vector.damage * (critical ? criticalMultiplier : 1) * (isCharged ? 2.2 : 1),
        speed: vector.projectileSpeed * (isCharged ? 0.85 : 1),
        radius: vector.width * (isCharged ? 2.2 : 1), range: vector.range, life: vector.lifetime,
        pierce: vector.pierce + (isCharged ? 3 : 0),
        returning: vector.returning, homing: vector.homing, splitChance: vector.splitChance,
        explosion: vector.explosion, generation: 0, style, critical, knockback: vector.knockback,
        color: critical ? '#fff1a8' : this.projectileColor(style),
        shrink: isCharged,
      });
      if (isCharged) this.burst('word', this.heroX, this.heroY - 46, 26, '#9fb6c8', '嗯');
      if (rhythmCrit && index === 0) this.burst('word', this.heroX, this.heroY - 40, 22, '#d9b768', '准时');
    }
    // 《和AI聊到凌晨》：它复读你的每一口气
    if (this.hasItem('ai-chat')) {
      for (const angle of volleyAngles) {
        this.pushPendingShot({
          delay: 0.4, angle, damage: vector.damage * 0.35, speed: vector.projectileSpeed,
          radius: Math.max(2, vector.width * 0.8), range: vector.range, life: vector.lifetime,
          pierce: 0, homing: vector.homing, returning: vector.returning,
          splitChance: vector.splitChance * 0.5, explosion: vector.explosion * 0.35,
          color: '#6f93a3', style,
          critical: false, knockback: vector.knockback * 0.4, generation: 1,
        });
      }
    }
    // 《年度听歌报告》：每第4轮把上一轮弹道原样重放一遍
    if (this.hasItem('year-report') && this.volleyCount % 4 === 0 && this.lastVolleyAngles.length > 0) {
      const replayMechanics = this.inheritProjectileMechanics(vector);
      for (const angle of this.lastVolleyAngles) {
        this.spawnProjectile({
          x: this.heroX, y: this.heroY - 14, angle, damage: vector.damage * 0.6,
          speed: vector.projectileSpeed, radius: vector.width, range: vector.range,
          life: vector.lifetime, ...replayMechanics, generation: 1, style,
          critical: false, knockback: vector.knockback * 0.6, color: '#8c81a0',
        });
      }
      this.burst('word', this.heroX, this.heroY - 52, 30, '#8c81a0', '循环播放');
    }
    this.lastVolleyAngles = volleyAngles;
    // 《等大家有空》：空相框复制合照的弹道，复制越多越褪色
    if (photoVolley && this.hasCombo('等大家有空')) {
      const copyMechanics = this.inheritProjectileMechanics(vector, {
        splitScale: 0.7,
        explosionScale: 0.8,
      });
      for (let copy = 0; copy < 2; copy += 1) {
        this.spawnProjectile({
          x: this.heroX, y: this.heroY - 14, angle: baseAngle + (copy === 0 ? -0.4 : 0.4),
          damage: vector.damage * (copy === 0 ? 0.8 : 0.65), speed: vector.projectileSpeed,
          radius: vector.width, range: vector.range, life: vector.lifetime, ...copyMechanics,
          generation: 1, style, critical: false, knockback: vector.knockback,
          color: copy === 0 ? '#b6aa94' : '#8f887c',
        });
      }
    }
    this.sigh(1);
    if (this.hasItem('pregnancy-test') && this.volleyCount % 3 === 0) {
      const followerMechanics = this.inheritProjectileMechanics(vector, {
        homingFloor: 0.1,
        splitScale: 0.5,
        explosionScale: 0.45,
      });
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 8, angle: baseAngle, damage: vector.damage * 0.8,
        speed: vector.projectileSpeed * 0.9, radius: Math.max(2.5, vector.width * 0.7),
        range: vector.range, life: vector.lifetime, ...followerMechanics,
        generation: 1, color: '#cdb8cf', style, critical: false, knockback: vector.knockback * 0.6,
      });
    }
    this.burst('ring', this.heroX, this.heroY - 14, 16 + count * 2, this.projectileColor(style));
  }

  private facingFromAngle(angle: number): HeroFacing {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'back' : 'front';
  }

  private spawnProjectile(options: {
    x: number; y: number; angle: number; damage: number; speed: number; radius: number; range: number; life: number;
    pierce: number; returning: boolean; homing: number; splitChance: number; splitDepth?: number; explosion: number;
    generation: number; color: string; style: ProjectileStyle; critical: boolean; knockback?: number; visual?: ProjectileVisual;
    shrink?: boolean; orbit?: { angle: number; total: number; elapsed: number }; priority?: 'core' | 'secondary';
  }): void {
    const material = options.style === 'rain' ? 'water' : options.style === 'sound' ? 'signal' : undefined;
    this.pushProjectile({
      id: this.entityId++, x: options.x, y: options.y,
      vx: Math.cos(options.angle) * options.speed, vy: Math.sin(options.angle) * options.speed,
      radius: options.radius, damage: options.damage, knockback: options.knockback ?? 0, life: options.life, maxLife: options.life,
      distance: 0, maxDistance: options.range, pierce: options.pierce, pierceMax: options.pierce,
      returning: options.returning, reversals: 0, homing: options.homing, splitChance: options.splitChance,
      splitDepth: options.splitDepth ?? 0, explosion: options.explosion, generation: options.generation, color: options.color,
      poolPriority: options.priority ?? (options.generation === 0 ? 'core' : 'secondary'),
      style: options.style, visual: options.visual ?? this.computeProjectileVisual(material, options.generation),
      critical: options.critical, hitIds: [],
      shrink: options.shrink, orbit: options.orbit,
    });
  }

  private inheritProjectileMechanics(
    vector: AttackVector,
    options: ProjectileMechanicInheritance = {},
  ): InheritedProjectileMechanics {
    const pierce = Math.round(vector.pierce * (options.pierceScale ?? 1)) + (options.pierceAdd ?? 0);
    return {
      pierce: Math.max(options.pierceFloor ?? 0, pierce),
      returning: options.returning ?? vector.returning,
      homing: Math.max(options.homingFloor ?? 0, vector.homing * (options.homingScale ?? 1)),
      splitChance: this.clamp(vector.splitChance * (options.splitScale ?? 1), 0, 1),
      splitDepth: options.splitDepth ?? 0,
      explosion: this.clamp(vector.explosion * (options.explosionScale ?? 1), 0, 90),
    };
  }

  private pushPendingShot(shot: PendingShot): void {
    const priority = shot.priority ?? (shot.generation === 0 ? 'core' : 'secondary');
    const queued = { ...shot, priority };
    if (this.pendingShots.length < MAX_PENDING_SHOTS) {
      this.pendingShots.push(queued);
      return;
    }
    const secondaryIndex = this.pendingShots.findIndex((pending) => pending.priority === 'secondary');
    if (priority === 'secondary' && secondaryIndex < 0) return;
    this.pendingShots.splice(secondaryIndex >= 0 ? secondaryIndex : 0, 1);
    this.pendingShots.push(queued);
  }

  private pushProjectile(projectile: Projectile): void {
    if (this.projectiles.length < MAX_PROJECTILES) {
      this.projectiles.push(projectile);
      return;
    }
    const secondaryIndex = this.projectiles.findIndex((active) => active.poolPriority === 'secondary');
    if (projectile.poolPriority === 'secondary' && secondaryIndex < 0) return;
    this.projectiles.splice(secondaryIndex >= 0 ? secondaryIndex : 0, 1);
    this.projectiles.push(projectile);
  }

  /** 《朋友圈仅三天可见》：三枚当前弹体绕身三圈后向外释放 */
  private spawnOrbitRing(): void {
    const vector = this.computeAttackVector();
    const orbitMechanics = this.inheritProjectileMechanics(vector, {
      pierceFloor: 99,
      homingScale: 0.65,
      splitScale: 0.35,
      explosionScale: 0.6,
    });
    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2;
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 8, angle,
        damage: Math.max(3, vector.damage * 0.8), speed: vector.projectileSpeed * 0.72,
        radius: Math.max(3, vector.width * 0.9), range: Math.min(180, vector.range * 0.75),
        life: 2.6 + Math.max(1, vector.lifetime * 0.7), ...orbitMechanics,
        generation: 1, style: 'plain', critical: false, knockback: 5,
        color: '#9a94a6', orbit: { angle, total: 2.6, elapsed: 0 },
      });
    }
  }

  private releaseRain(): void {
    const vector = this.computeAttackVector();
    const rainMechanics = this.inheritProjectileMechanics(vector, {
      pierceFloor: 1,
      homingFloor: 0.04,
      splitScale: 0.5,
      explosionScale: 0.5,
    });
    // 《他当年也是这样站着的》：两代人的雨下得更密；《那年他觉得自己很酷》：雨滴掉色
    const drops = this.hasCombo('他当年也是这样站着的') ? 14 : 9;
    const dropColor = this.hasCombo('那年他觉得自己很酷') ? '#cbb757' : '#7eb5bd';
    for (let index = 0; index < drops; index += 1) {
      const angle = (index / drops) * Math.PI * 2;
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 12, angle, damage: Math.max(3, vector.damage * 0.55),
        speed: 165, radius: 3.5, range: 230, life: 2.2, ...rainMechanics,
        generation: 1, color: dropColor, style: 'rain', critical: false, knockback: 4,
      });
    }
    if (this.hasItem('unsent-phone')) {
      this.areaDamage(3 + this.phoneCharges * 2, '#7eb5bd');
      this.burst('word', this.heroX, this.heroY - 60, 40, '#7eb5bd', '没听见');
    }
  }

  private updateProjectiles(dt: number): void {
    const spawned: Projectile[] = [];
    for (const projectile of this.projectiles) {
      if (projectile.life <= 0) continue;
      if (projectile.orbit) {
        // 环绕阶段保留独立弹道；三圈走完后向外释放，让追踪、回返与范围爆炸继续生效。
        projectile.orbit.elapsed += dt;
        const sweep = projectile.orbit.angle + (projectile.orbit.elapsed / projectile.orbit.total) * Math.PI * 6;
        projectile.x = this.heroX + Math.cos(sweep) * 42;
        projectile.y = this.heroY - 8 + Math.sin(sweep) * 42;
        projectile.life -= dt;
        for (const enemy of this.enemies) {
          if (enemy.dead || projectile.hitIds.includes(enemy.id)) continue;
          if (Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) < enemy.radius + projectile.radius + 2) {
            projectile.hitIds.push(enemy.id);
            this.damageEnemy(enemy, projectile.damage, projectile.color, this.hitMaterialOf(projectile));
            this.trySplitProjectile(projectile, sweep + Math.PI / 2, spawned);
          }
        }
        if (projectile.orbit.elapsed < projectile.orbit.total) continue;
        const releaseSpeed = Math.hypot(projectile.vx, projectile.vy);
        const releaseAngle = Math.atan2(projectile.y - (this.heroY - 8), projectile.x - this.heroX);
        projectile.vx = Math.cos(releaseAngle) * releaseSpeed;
        projectile.vy = Math.sin(releaseAngle) * releaseSpeed;
        projectile.distance = 0;
        projectile.hitIds = [];
        projectile.orbit = undefined;
      }
      if (projectile.shrink) {
        // 蓄力弹：飞行中不断缩小，命中时只剩"嗯"那么大
        projectile.radius = Math.max(2.2, projectile.radius * (1 - dt * 1.1));
      }
      if (projectile.homing > 0) {
        const target = this.nearestEnemy(projectile.x, projectile.y);
        if (target) {
          const speed = Math.hypot(projectile.vx, projectile.vy);
          const desired = Math.atan2(target.y - projectile.y, target.x - projectile.x);
          const current = Math.atan2(projectile.vy, projectile.vx);
          const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
          const angle = current + difference * Math.min(1, projectile.homing * 55 * dt);
          projectile.vx = Math.cos(angle) * speed;
          projectile.vy = Math.sin(angle) * speed;
        }
      }
      const dx = projectile.vx * dt;
      const dy = projectile.vy * dt;
      projectile.x += dx;
      projectile.y += dy;
      projectile.distance += Math.hypot(dx, dy);
      projectile.life -= dt;

      for (const enemy of this.enemies) {
        if (enemy.dead || projectile.hitIds.includes(enemy.id)) continue;
        if (Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y) > projectile.radius + enemy.radius) continue;
        projectile.hitIds.push(enemy.id);
        let hitDamage = projectile.damage * (projectile.reversals > 0 && this.hasItem('old-door-lock') ? 1.3 : 1);
        // 《这点重量不算什么》：弹道停留越久越重
        if (this.hasCombo('这点重量不算什么')) {
          hitDamage *= 1 + Math.min(0.6, (projectile.maxLife - projectile.life) * 0.22);
        }
        // 《被退回的信》：折返后的信更疼
        if (projectile.reversals > 0 && this.hasCombo('被退回的信')) hitDamage *= 1.25;
        // 协同：锋利×骨节——旧伤口上再来一刀
        if (this.hasItem('eyebrow-razor') && this.hasItem('broken-spine') && enemy.hp < enemy.maxHp) {
          hitDamage *= 1.18;
          this.noteSynergy('旧伤口上再来一刀');
          this.burst('syn', enemy.x, enemy.y, 22, '#8a7f78', undefined, 'crack');
        }
        // 协同：水×信号——声波过水会麻
        if (projectile.style === 'sound'
          && (this.hasItem('fathers-raincoat') || this.hasItem('always-crying'))
          && this.random() < 0.12) {
          enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, 0.6);
          enemy.paralyzeTimer = Math.max(enemy.paralyzeTimer ?? 0, 0.6);
          this.noteSynergy('水是导电的');
          this.burst('syn', enemy.x, enemy.y - 8, 24, '#a9ccd8', undefined, 'arc');
        }
        if ((this.hasItem('ktv-song') && projectile.style === 'sound')
          || (this.hasItem('year-report') && projectile.generation > 0)) {
          enemy.loopTimer = Math.max(enemy.loopTimer ?? 0, 0.9);
        }
        if (this.hasItem('read-3am')) {
          // 《凌晨三点的已读》：命中不立即结算，5秒后连本带利一次爆出
          enemy.readDamage = (enemy.readDamage ?? 0) + hitDamage * 1.3;
          if (enemy.readTimer === undefined || enemy.readTimer <= 0) {
            enemy.readTimer = 5;
            this.burst('word', enemy.x, enemy.y - 22, 18, '#9fb6c8', '已读');
          }
          enemy.flash = Math.max(enemy.flash, 0.08);
        } else {
          this.damageEnemy(enemy, hitDamage, projectile.color, this.hitMaterialOf(projectile));
        }
        if (projectile.critical && this.hasCombo('能屈能伸')) {
          this.burst('word', enemy.x, enemy.y - 24, 22, '#d9b768', '收到');
        }
        // 《那年他觉得自己很酷》：掉色雨滴标记敌人
        if (projectile.style === 'rain' && this.hasCombo('那年他觉得自己很酷')) enemy.marked = 4;
        if (this.hasItem('shop-freezer')) {
          // 协同：湿×冰——湿了的更容易冻住
          const wet = this.hasItem('fathers-raincoat') || this.hasItem('always-crying');
          if (this.random() < (wet ? 0.35 : 0.2)) {
            enemy.slowTimer = wet ? 1.8 : 1.2;
            if (wet) {
              this.noteSynergy('湿了的更容易冻住');
              this.burst('syn', enemy.x, enemy.y + enemy.radius * 0.4, 26, '#bcd8e8', undefined, 'ice');
            }
          }
        }
        const speedNow = Math.hypot(projectile.vx, projectile.vy) || 1;
        const kbFactor = enemy.type === 'forgetter' ? 0 : enemy.boss ? 0.25 : 1;
        enemy.x += (projectile.vx / speedNow) * projectile.knockback * kbFactor;
        enemy.y += (projectile.vy / speedNow) * projectile.knockback * kbFactor;
        if (this.hasItem('marble') && projectile.generation === 0 && this.random() < 0.25) {
          const next = this.enemies
            .filter((other) => !other.dead && other.id !== enemy.id && !projectile.hitIds.includes(other.id))
            .sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y))[0];
          if (next) {
            const bounceAngle = Math.atan2(next.y - enemy.y, next.x - enemy.x);
            spawned.push(this.makeChildProjectile(projectile, bounceAngle));
          }
        }
        this.trySplitProjectile(projectile, Math.atan2(projectile.vy, projectile.vx), spawned);
        projectile.pierce -= 1;
        if (projectile.pierce < 0) {
          projectile.life = 0;
          this.explodeProjectile(projectile);
          break;
        }
      }

      if (projectile.life > 0 && projectile.distance >= projectile.maxDistance) {
        if (projectile.returning && projectile.reversals < 1) {
          projectile.vx *= -1;
          projectile.vy *= -1;
          projectile.distance = 0;
          projectile.reversals += 1;
          projectile.hitIds = [];
          projectile.pierce = projectile.pierceMax;
          if (this.hasItem('red-workbook')) {
            projectile.damage *= 1.4;
            projectile.radius *= 1.08;
            projectile.color = '#c94d55';
            // 《被退回的信》：批改后的信认得回去的路
            if (this.hasCombo('被退回的信')) projectile.homing = Math.max(projectile.homing, 0.22);
          }
          // 协同：追踪×折返——回家的路上还惦记着
          if (this.hasItem('front-desk-letter') && this.hasItem('old-door-lock')) {
            projectile.homing = Math.max(projectile.homing, 0.25);
            this.noteSynergy('回家的路上还惦记着');
          }
        } else {
          if (this.hasItem('held-elevator') && projectile.generation === 0 && this.random() < 0.3) {
            const waitTarget = this.nearestEnemy(projectile.x, projectile.y);
            if (waitTarget) {
              spawned.push(this.makeChildProjectile(projectile, Math.atan2(waitTarget.y - projectile.y, waitTarget.x - projectile.x)));
              this.burst('word', projectile.x, projectile.y, 20, '#9aa8b5', '按住了');
            }
          }
          projectile.life = 0;
          this.explodeProjectile(projectile);
        }
      } else if (projectile.life <= 0) this.explodeProjectile(projectile);
    }
    this.projectiles = this.projectiles.filter((projectile) => (
      projectile.life > 0
      && Math.abs(projectile.x - this.heroX) < 340
      && Math.abs(projectile.y - this.heroY) < 430
    ));
    for (const projectile of spawned) this.pushProjectile(projectile);
  }

  private trySplitProjectile(projectile: Projectile, angle: number, spawned: Projectile[]): void {
    if (projectile.splitDepth > 0 || projectile.splitChance <= 0 || this.random() >= projectile.splitChance) return;
    projectile.splitChance = 0;
    for (const offset of [-0.45, 0.45]) spawned.push(this.makeChildProjectile(projectile, angle + offset));
  }

  private makeChildProjectile(parent: Projectile, angle: number): Projectile {
    const speed = Math.hypot(parent.vx, parent.vy) * 0.82;
    const dadBoost = this.hasItem('group-dad') ? 1.4 : 1;
    const inheritedPierce = Math.max(0, Math.floor(parent.pierceMax * 0.5));
    return {
      ...parent,
      id: this.entityId++, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: Math.max(2, parent.radius * 0.65), damage: parent.damage * 0.45 * dadBoost,
      life: parent.maxLife * 0.65, maxLife: parent.maxLife * 0.65,
      distance: 0, maxDistance: parent.maxDistance * 0.65,
      pierce: inheritedPierce, pierceMax: inheritedPierce,
      returning: parent.returning, reversals: 0,
      // 子弹继承其他 flags 与削弱后的范围爆炸，只关闭递归分裂，避免指数级弹幕。
      splitChance: 0, splitDepth: parent.splitDepth + 1, explosion: parent.explosion * 0.55,
      generation: parent.generation + 1, hitIds: [], orbit: undefined,
      poolPriority: 'secondary',
      visual: {
        ...parent.visual,
        trail: 'echo',
        echoed: true,
        opacity: parent.visual.opacity * 0.84,
        materials: [...parent.visual.materials],
      },
    };
  }

  private explodeProjectile(projectile: Projectile): void {
    if (projectile.explosion <= 0) return;
    // 协同：重×爆炸——压过的地方塌得更大
    const heavyBlast = this.hasItem('stone-schoolbag') && (this.hasItem('only-key') || this.hasItem('empty-frame'));
    if (heavyBlast) {
      this.noteSynergy('压过的地方塌得更大');
      this.burst('syn', projectile.x, projectile.y, 34, '#9a8a70', undefined, 'collapse');
    }
    const radius = (45 + projectile.explosion * 1.5) * (heavyBlast ? 1.4 : 1);
    const damage = projectile.explosion;
    projectile.explosion = 0;
    for (const enemy of this.enemies) {
      if (!enemy.dead && Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y) < radius + enemy.radius) {
        this.damageEnemy(enemy, damage, '#d3a85d');
      }
    }
    this.burst(this.hasItem('only-key') ? 'door' : 'ring', projectile.x, projectile.y, radius, '#d3a85d');
  }

  private updateEnemies(dt: number): void {
    const speedMultiplier = this.hasItem('bleach-powder') ? 1.15 : 1;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = this.heroX - enemy.x;
      const dy = this.heroY - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (enemy.slowTimer !== undefined && enemy.slowTimer > 0) enemy.slowTimer -= dt;
      if (enemy.paralyzeTimer !== undefined && enemy.paralyzeTimer > 0) enemy.paralyzeTimer -= dt;
      if (enemy.loopTimer !== undefined && enemy.loopTimer > 0) enemy.loopTimer -= dt;
      if (enemy.marked !== undefined && enemy.marked > 0) enemy.marked -= dt;
      if (enemy.readTimer !== undefined && enemy.readTimer > 0) {
        enemy.readTimer -= dt;
        if (enemy.readTimer <= 0 && (enemy.readDamage ?? 0) > 0) {
          const settled = enemy.readDamage ?? 0;
          enemy.readDamage = 0;
          this.damageEnemy(enemy, settled, '#9fb6c8');
          this.burst('word', enemy.x, enemy.y - 26, 24, '#9fb6c8', `迟到的 -${Math.ceil(settled)}`);
        }
      }
      if (enemy.dashTimer !== undefined && enemy.dashTimer > 0) enemy.dashTimer -= dt;
      if (enemy.phaseFlashTimer !== undefined && enemy.phaseFlashTimer > 0) enemy.phaseFlashTimer -= dt;
      enemy.mechTimer = (enemy.mechTimer ?? 0) + dt;

      // —— 小怪特性 ——
      if (enemy.type === 'empty-chair') {
        continue; // 静止，不动不打，只是站在你的弹道优先级里
      }
      if (enemy.type === 'silence' && dist < 90) this.heroSlowTimer = Math.max(this.heroSlowTimer, 0.3);
      if (enemy.type === 'missed-call') {
        enemy.auraCooldown = (enemy.auraCooldown ?? 1.2) - dt;
        if (dist < 70 && enemy.auraCooldown <= 0) {
          enemy.auraCooldown = 1.2;
          this.hurtHero(1);
          this.burst('ring', enemy.x, enemy.y, 70, '#7fa8b5');
        }
      }
      if (enemy.type === 'hunger-shadow' && enemy.mechTimer >= 3) {
        enemy.mechTimer = 0;
        enemy.dashTimer = 0.5;
      }

      // —— Boss 机制 ——
      if (enemy.type === 'closet-dark' && enemy.hp <= enemy.maxHp * 0.5 && (enemy.phase ?? 0) !== 2) {
        enemy.phase = 2;
        enemy.phaseFlashTimer = 1.1;
        for (let splitIndex = 0; splitIndex < 2; splitIndex += 1) {
          const splitAngle = this.random() * Math.PI * 2;
          const child = this.createSeekingEnemy('fear', enemy.x + Math.cos(splitAngle) * 40, enemy.y + Math.sin(splitAngle) * 40);
          child.hp = 20; child.maxHp = 20;
          this.enemies.push(child);
        }
        this.burst('ring', enemy.x, enemy.y, 90, '#5a5065');
        this.say('黑分裂了 · 它不止一个');
      }
      // Boss 机制的伤害修正：统一答案的小题护盾 / 父亲盔甲减伤上限 / 末班车仅疲惫期真伤 / 嘲讽易伤
    if (enemy.type === 'uniform-answer' && enemy.mechTimer >= 8) {
        enemy.mechTimer = 0;
        for (let markIndex = 0; markIndex < 3; markIndex += 1) {
          const child = this.createSeekingEnemy('red-mark', enemy.x - 40 + markIndex * 40, enemy.y + 34);
          child.hp = 12; child.maxHp = 12;
          this.enemies.push(child);
        }
        this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 30, '#c46672', '统一作答');
      }
      if (enemy.type === 'silent-father' && enemy.hp <= enemy.maxHp * 0.5 && (enemy.phase ?? 1) !== 2) {
        enemy.phase = 2;
        enemy.phaseFlashTimer = 1.2;
        this.burst('ring', enemy.x, enemy.y, 110, '#bda34f');
        this.caption = '盔甲裂开了。里面也是一个害怕的小孩。';
        this.captionTime = 3.5;
      }
      if (enemy.type === 'debt-collector' && enemy.mechTimer >= 7) {
        enemy.mechTimer = 0;
        if (this.billTimer <= 0) {
          this.billTimer = 3.5;
          this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 34, '#d5885f', '账单寄到了');
          this.say('3.5秒内结清 · 2零钱或8生命');
        }
      }
      if (enemy.type === 'lamp-keeper' && enemy.mechTimer >= 10) {
        enemy.mechTimer = 0;
        this.darkR = Math.max(70, this.darkR - 10);
        for (let dimIndex = 0; dimIndex < 2; dimIndex += 1) {
          const dimAngle = this.random() * Math.PI * 2;
          const shade = this.createSeekingEnemy('forgetter', this.darkCX + Math.cos(dimAngle) * (this.darkR - 20), this.darkCY + Math.sin(dimAngle) * (this.darkR - 20));
          shade.hp = 30; shade.maxHp = 30;
          this.enemies.push(shade);
        }
        this.say('又一盏灯灭了');
      }
      if (enemy.type === 'last-bus') {
        const phase = enemy.phase ?? 0;
        if (phase === 0 && enemy.mechTimer >= 3) { enemy.phase = 1; enemy.mechTimer = 0; enemy.flash = 0.8; }
        else if (phase === 1 && enemy.mechTimer >= 0.8) {
          enemy.phase = 2; enemy.mechTimer = 0;
          enemy.angle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
        } else if (phase === 2 && enemy.mechTimer >= 1.1) { enemy.phase = 3; enemy.mechTimer = 0; }
        else if (phase === 3 && enemy.mechTimer >= 2.5) { enemy.phase = 0; enemy.mechTimer = 0; }
        if (phase === 1) { continue; }
        if (phase === 2) {
          enemy.x += Math.cos(enemy.angle ?? 0) * 340 * dt;
          enemy.y += Math.sin(enemy.angle ?? 0) * 340 * dt;
          if (dist < enemy.radius + 15) {
            enemy.attackCooldown -= dt;
            if (enemy.attackCooldown <= 0 && this.hurtHero(enemy.damage)) enemy.attackCooldown = 1.2;
          }
          continue;
        }
      }
      if (enemy.elite && !enemy.boss && dist > 430) {
        enemy.x = this.heroX - (dx / dist) * 260;
        enemy.y = this.heroY - (dy / dist) * 260;
        enemy.attackCooldown = Math.max(enemy.attackCooldown, 0.65);
        this.burst('ring', enemy.x, enemy.y, enemy.radius * 2.2, '#b54f5d');
        continue;
      }
      if (!enemy.elite && !enemy.boss && dist > 540) {
        const angle = this.random() * Math.PI * 2;
        enemy.x = this.heroX + Math.cos(angle) * 300;
        enemy.y = this.heroY + Math.sin(angle) * 300;
        continue;
      }
      const reach = enemy.radius + 15;
      let moveMult = speedMultiplier;
      if (this.enemyHasteTimer > 0) moveMult *= 1.1;
      if ((enemy.slowTimer ?? 0) > 0) moveMult *= 0.5;
      if ((enemy.dashTimer ?? 0) > 0) moveMult *= enemy.type === 'hunger-shadow' ? 3 : 1.35;
      if (enemy.type === 'silent-father' && (enemy.phase ?? 1) === 2) moveMult *= 1.5;
      if (enemy.type === 'last-bus') moveMult *= (enemy.phase ?? 0) === 3 ? 0.3 : 0.6;
      if (dist > reach) {
        enemy.x += (dx / dist) * enemy.speed * moveMult * dt;
        enemy.y += (dy / dist) * enemy.speed * moveMult * dt;
      } else {
        enemy.attackCooldown -= dt;
        if (enemy.attackCooldown <= 0 && this.hurtHero(enemy.damage)) {
          enemy.attackCooldown = enemy.boss ? 2.2 : enemy.elite ? 1.9 : 1.35;
          enemy.x -= (dx / dist) * 28;
          enemy.y -= (dy / dist) * 28;
          this.burst('ring', this.heroX, this.heroY - 20, 40, '#bd5360');
          if (enemy.type === 'badge-thief' && this.hero.coins > 0) {
            this.hero.coins -= 1;
            this.burst('word', this.heroX, this.heroY - 40, 24, '#d5885f', '-1零钱');
          }
        }
      }
    }
    for (let i = 0; i < this.enemies.length; i += 1) {
      const a = this.enemies[i]!;
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j += 1) {
        const b = this.enemies[j]!;
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = (a.radius + b.radius) * 0.72;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < minDist) {
          const push = ((minDist - d) / d) * 0.5;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
  }

  private createSeekingEnemy(type: EnemyType, x: number, y: number, opts?: { elite?: boolean; name?: string }): EnemyUnit {
    const specs: Record<EnemyType, { name: string; hp: number; speed: number; radius: number; damage: number; elite?: boolean; boss?: boolean }> = {
      fear: { name: '床下的呼吸', hp: 13, speed: 44, radius: 14, damage: 4 },
      'red-mark': { name: '红叉', hp: 21, speed: 36, radius: 15, damage: 4 },
      whisper: { name: '他们都在说', hp: 15, speed: 54, radius: 13, damage: 3 },
      clockwork: { name: '打卡齿轮', hp: 38, speed: 32, radius: 18, damage: 6 },
      debt: { name: '下个月账单', hp: 48, speed: 28, radius: 20, damage: 7 },
      'silent-father': { name: '沉默的父亲', hp: 300, speed: 24, radius: 30, damage: 9, boss: true },
      'cry-moth': { name: '哭蛾', hp: 8, speed: 48, radius: 10, damage: 2 },
      'hunger-shadow': { name: '空奶瓶', hp: 10, speed: 34, radius: 12, damage: 3 },
      'missed-bus': { name: '错过的车', hp: 60, speed: 150, radius: 16, damage: 9 },
      'missed-call': { name: '未接来电', hp: 30, speed: 30, radius: 14, damage: 1 },
      silence: { name: '没人说话', hp: 34, speed: 22, radius: 16, damage: 3 },
      'badge-thief': { name: '打包的纸箱', hp: 30, speed: 40, radius: 14, damage: 4 },
      forgetter: { name: '忘记名字的人', hp: 90, speed: 12, radius: 18, damage: 8 },
      'empty-chair': { name: '空椅子', hp: 70, speed: 0, radius: 14, damage: 0 },
      'closet-dark': { name: '没人相信的怪物', hp: 150, speed: 30, radius: 26, damage: 6, boss: true },
      'uniform-answer': { name: '统一答案', hp: 200, speed: 22, radius: 26, damage: 6, boss: true },
      'last-bus': { name: '末班车', hp: 260, speed: 26, radius: 28, damage: 10, boss: true },
      'debt-collector': { name: '上门催收', hp: 340, speed: 24, radius: 26, damage: 8, boss: true },
      'lamp-keeper': { name: '收灯人', hp: 430, speed: 20, radius: 40, damage: 12, boss: true },
    };
    const spec = specs[type];
    const grow = 1 + this.encounterIndex * 0.3 + this.battleTime * 0.0022;
    const madeElite = Boolean(opts?.elite && !spec.elite && !spec.boss);
    const elite = Boolean(spec.elite || opts?.elite);
    const hp = spec.hp * grow * (madeElite ? 2.7 : 1);
    return {
      id: this.entityId++, type, name: opts?.name ?? spec.name, x, y,
      radius: spec.radius * (madeElite ? 1.7 : 1),
      hp, maxHp: hp, speed: spec.speed * (elite || spec.boss ? 0.82 : 1),
      damage: spec.damage + (madeElite ? 1 : 0),
      attackCooldown: spec.boss ? 0.9 : elite ? 0.65 : 0.32, elite, boss: Boolean(spec.boss),
      dead: false, flash: 0, age: this.random() * 3,
    };
  }

  private damageEnemy(enemy: EnemyUnit, amount: number, color: string, material?: string): void {
    if (enemy.dead || amount <= 0) return;
    if ((enemy.marked ?? 0) > 0) amount *= 1.12;
    if (enemy.type === 'uniform-answer'
      && this.enemies.some((minion) => !minion.dead && minion.type === 'red-mark' && !minion.boss)) {
      amount *= 0.5;
    }
    if (enemy.type === 'silent-father' && (enemy.phase ?? 1) < 2) amount = Math.min(amount, 4);
    if (enemy.type === 'last-bus') amount *= (enemy.phase ?? 0) === 3 ? 1.7 : 0.75;
    if ((enemy.dashTimer ?? 0) > 0 && !enemy.boss && enemy.type !== 'hunger-shadow') amount *= 1.2;
    enemy.hp -= amount;
    enemy.flash = 0.12;
    this.stats.damage += amount;
    this.burst('hit', enemy.x, enemy.y, 18 + Math.min(24, amount), color, undefined, material);
    this.feedback.play('hit', enemy.boss ? 1.2 : enemy.elite ? 1 : 0.7);
    if (enemy.hp > 0) return;
    enemy.dead = true;
    if (this.hasCombo('我只在有用时被看见')) this.usefulTimer = 2.5;
    if (this.enemyDeaths.length >= MAX_ENEMY_DEATHS) this.enemyDeaths.shift();
    this.enemyDeaths.push({
      asset: resolveEnemyPixelAsset(enemy),
      x: enemy.x,
      y: enemy.y,
      radius: enemy.radius,
      life: 0.28,
      duration: 0.28,
      faceLeft: this.heroX < enemy.x,
    });
    this.stats.kills += 1;
    let coins = enemy.elite ? 4 : enemy.boss ? 6 : 0;
    if (!enemy.elite && !enemy.boss) {
      this.coinKillProgress += 1;
      if (this.coinKillProgress >= 5) {
        this.coinKillProgress -= 5;
        coins = 1;
      }
    }
    if (this.hasItem('red-packet') && this.random() < 0.15) {
      coins += 1;
      this.burst('word', enemy.x, enemy.y - 14, 26, '#d5885f', '+0.87');
    }
    if (enemy.boss) this.hero.coins += coins;
    else this.spawnCoinDrop(enemy.x, enemy.y, coins);
    this.burst('ring', enemy.x, enemy.y, enemy.radius * 2.3, '#d1b36b');
    if (enemy.boss) {
      if (enemy.type === 'lamp-keeper') {
        this.endRun(true);
        return;
      }
      this.say(`${enemy.name} · 落幕`);
    }
    if ((enemy.elite || (enemy.boss && enemy.type !== 'lamp-keeper')) && this.state === 'battle') {
      this.resetMovementInput();
      this.initialItemReward = false;
      this.rewardReturn = 'battle';
      this.rewardTitle = enemy.type === 'silent-father' ? '雨衣留下了。话还是没说。' : '困难没有消失，只是留在了身上';
      const bossPool = ITEM_IDS.filter((id) => !this.items.includes(id));
      const choices = enemy.boss ? this.shuffle([...bossPool]).slice(0, 3) : this.pickItemChoices(false);
      this.itemRewardChoices = enemy.type === 'silent-father' && !this.hasItem('fathers-raincoat')
        ? (['fathers-raincoat', ...choices.filter((id) => id !== 'fathers-raincoat')] as ItemId[]).slice(0, 3)
        : choices;
      this.itemRewardFocus = 0;
      this.state = 'itemReward';
    }
  }

  private areaDamage(amount: number, color: string): void {
    for (const enemy of this.enemies) if (!enemy.dead) this.damageEnemy(enemy, amount, color);
  }

  private hurtHero(amount: number): boolean {
    if (amount <= 0 || this.hurtCooldown > 0) return false;
    this.hurtCooldown = HURT_IFRAME;
    if (this.hasItem('drank-for-boss') && this.random() < 0.25) {
      const reflectTarget = this.nearestEnemy(this.heroX, this.heroY);
      if (reflectTarget) this.damageEnemy(reflectTarget, amount, '#c98a5a');
    }
    // 《连续签到1847天》：受伤打断当期打卡节律
    if (this.hasItem('streak-1847')) this.rhythmBrokenWindow = Math.floor(this.battleTime / 10) + 1;
    if (this.hasItem('flash-escape') && this.flashCooldown <= 0) {
      this.flashCooldown = 9;
      const reversed = this.random() < 0.1;
      const threat = this.nearestEnemy(this.heroX, this.heroY);
      const angle = threat
        ? Math.atan2(this.heroY - threat.y, this.heroX - threat.x) + (reversed ? Math.PI : 0)
        : this.random() * Math.PI * 2;
      this.heroX += Math.cos(angle) * 92;
      this.heroY += Math.sin(angle) * 92;
      this.burst('word', this.heroX, this.heroY - 46, 40, '#b9a8d6', reversed ? '闪错方向了' : '闪现');
      return true;
    }
    if (this.hasItem('painless-night')) {
      this.painlessDamage += amount;
      this.painlessTimer = Math.max(this.painlessTimer, 8);
      this.burst('word', this.heroX, this.heroY - 46, 34, '#858b96', '不疼');
      return true;
    }
    if (this.raincoatReady) {
      this.raincoatReady = false;
      this.releaseRain();
      this.say('父亲的雨衣 · 挡住第一次');
      return true;
    }
    this.applyHeroDamage(amount);
    if (this.hasItem('fathers-raincoat')) this.releaseRain();
    return true;
  }

  private applyHeroDamage(amount: number): void {
    const absorbed = Math.min(this.hero.block, amount);
    this.hero.block -= absorbed;
    this.noHitTime = 0;
    let remaining = amount - absorbed;
    if (this.hasItem('divorce-draft') && !this.divorceUsedStage && remaining > 0) {
      this.divorceUsedStage = true;
      remaining = Math.ceil(remaining / 2);
      this.burst('word', this.heroX, this.heroY - 52, 34, '#a8a0b5', '先拖着');
    }
    if (this.hasItem('unwashed-pillow') && this.standStillTime >= 2 && remaining > 0) {
      remaining = Math.ceil(remaining * 0.5);
    }
    if (this.hasItem('sock-cigs')) this.sockBoostTimer = 2;
    if (this.hasItem('always-crying') && remaining > 0) {
      const vector = this.computeAttackVector();
      const tearDamage = Math.max(3, vector.damage * 0.4);
      const tearMechanics = this.inheritProjectileMechanics(vector, {
        pierceFloor: 3,
        homingFloor: 0.08,
        splitScale: 0.5,
        explosionScale: 0.35,
      });
      for (let tearIndex = 0; tearIndex < 3; tearIndex += 1) {
        this.spawnProjectile({
          x: this.heroX, y: this.heroY - 10, angle: this.random() * Math.PI * 2,
          damage: tearDamage, speed: 200, radius: 3, range: 180, life: 1.6, ...tearMechanics,
          generation: 1, color: '#9fc2d8', style: 'rain', critical: false, knockback: 2,
        });
      }
    }
    if (remaining > 0) {
      if (this.fateDelayReady) {
        this.fateDelayReady = false;
        this.painlessDamage += remaining;
        this.painlessTimer = Math.max(this.painlessTimer, 4);
        this.burst('word', this.heroX, this.heroY - 46, 34, '#858b96', '晚点再疼');
        return;
      }
      this.feedback.play('hurt', this.clamp(remaining / 8, 0.6, 1.35));
      this.feedback.vibrate([14, 26, 18]);
      if (import.meta.env.DEV && this.auditEndurance) {
        this.auditDamageTaken += remaining;
        this.hero.hp = this.hero.maxHp;
      } else this.hero.hp -= remaining;
      this.flash = 0.24;
      this.screenShake = 0.22;
      this.burst('word', this.heroX, this.heroY - 58, 28, '#ef7181', `-${Math.ceil(remaining)}`);
      if (this.hasItem('eyebrow-razor') && this.hasItem('od-pill')) {
        for (let index = 0; index < 6; index += 1) {
          this.pushBurst({
            id: this.entityId++, kind: 'word', x: this.heroX - 55 + this.random() * 110, y: this.heroY - 60 + this.random() * 90,
            radius: 18, life: 1.1, duration: 1.1, color: '#ef8fbd', text: index % 2 ? '♡' : '+1',
          });
        }
        // 《这一次有人接了》：假点赞被人真的收着
        if (this.hasCombo('这一次有人接了')) this.heartCount = Math.min(12, this.heartCount + 3);
      }
    }
    if (this.hero.hp <= 0 && this.hasItem('server-shutdown') && !this.petGone && this.deathSaves < 3) {
      this.petGone = true;
      this.deathSaves += 1;
      this.hero.hp = 1;
      this.hurtCooldown = Math.max(this.hurtCooldown, 1.2);
      this.burst('word', this.heroX, this.heroY - 60, 60, '#9fd0b8', '它替你挡下了');
      this.say('关服那天 · 它没等到告别');
      this.saveEffect = { kind: 'shutdown', timer: 0.8, duration: 0.8 };
    }
    if (this.hero.hp <= 0 && this.hasItem('funeral-photo') && !this.graceUsed && this.deathSaves < 3) {
      this.graceUsed = true;
      this.deathSaves += 1;
      this.graceTimer = 5;
      this.hero.hp = 1;
      this.hurtCooldown = 5;
      this.burst('ring', this.heroX, this.heroY - 20, 90, '#d8cfae');
      this.say('遗照上的笑 · 再撑五秒');
      this.saveEffect = { kind: 'photo', timer: 0.7, duration: 0.7 };
    }
    if (this.hero.hp <= 0 && this.hasItem('snow-screen') && !this.snowUsed && this.deathSaves < 3) {
      this.snowUsed = true;
      this.deathSaves += 1;
      this.hero.hp = 1;
      this.flash = 0.5;
      this.burst('word', this.heroX, this.heroY - 58, 70, '#c8d2d8', '雪花');
      this.say('雪花屏 · 这次伤害没有发生');
      this.saveEffect = { kind: 'static', timer: 0.6, duration: 0.6 };
    }
    if (this.hero.hp <= 0 && this.toothReady && this.deathSaves < 3) {
      this.toothReady = false;
      this.deathSaves += 1;
      this.hero.hp = 1;
      this.areaDamage(24, '#efe5c8');
      this.burst('word', this.heroX, this.heroY - 58, 90, '#efe5c8', '爸爸');
      this.say('女儿的乳牙 · 再留下来一次');
      this.saveEffect = { kind: 'tooth', timer: 0.7, duration: 0.7 };
      // 《后来我也成了他》：乳牙碎的那一刻，雨衣自动罩住孩子
      if (this.hasCombo('后来我也成了他')) {
        this.releaseRain();
        this.hurtCooldown = Math.max(this.hurtCooldown, 1.5);
        this.burst('word', this.heroX, this.heroY - 76, 60, '#c4a23f', '这次换我来挡');
      }
    }
  }

  private loseHealth(amount: number): void {
    this.feedback.play('hurt', this.clamp(amount / 8, 0.55, 1.2));
    this.feedback.vibrate(16);
    if (import.meta.env.DEV && this.auditEndurance) {
      this.auditDamageTaken += amount;
      this.hero.hp = this.hero.maxHp;
      this.flash = 0.1;
      return;
    }
    this.hero.hp = Math.max(1, this.hero.hp - amount);
    this.flash = 0.1;
  }

  private healHero(amount: number): void {
    if (this.hasItem('painless-night')) return;
    let multiplier = (this.hasItem('eyebrow-razor') ? 0.5 : 1) * this.originModifiers.healingMul;
    if (this.hasItem('five-ha')) multiplier *= 0.85;
    if (this.hasItem('hair-in-takeout')) multiplier *= 0.9;
    if (this.hasItem('takeout-3am')) multiplier *= 0.85;
    if (this.hasItem('three-day-visible')) multiplier *= 0.95;
    if (this.hasItem('divorce-draft')) multiplier *= 0.85;
    if (this.hasItem('friend-verify')) multiplier *= 0.9;
    if (this.hasItem('ruma-msg')) multiplier *= Math.max(0.7, 1 - this.ruCharges * 0.03);
    if (this.hasItem('funeral-photo') && this.graceUsed) multiplier *= 0.8;
    if (this.hasItem('server-shutdown') && this.petGone) multiplier *= 0.85;
    multiplier *= Math.max(0.55, 1 - this.poisons.pride * 0.025);
    if (this.hasItem('broken-spine')) multiplier *= 0.7;
    const actual = Math.ceil(amount * multiplier);
    const beforeHp = this.hero.hp;
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + actual);
    if (this.hasItem('moms-bowl')) {
      const overflow = actual - (this.hero.hp - beforeHp);
      if (overflow > 0) {
        const warmth = Math.max(0.4, 1 - this.encounterIndex * 0.1);
        this.hero.block = Math.min(24, this.hero.block + Math.ceil(overflow * warmth));
      }
    }
  }

  private buildLifeSnapshot(): LifeSnapshot {
    const stage = STAGES[this.encounterIndex];
    return {
      runSeed: this.runSeed,
      chapterIndex: this.encounterIndex,
      chapter: stage?.chapter ?? '这一生',
      age: AGE_LABELS[this.encounterIndex] ?? '晚年',
      hp: Math.round(this.hero.hp),
      maxHp: this.hero.maxHp,
      coins: this.hero.coins,
      items: this.items.map((id) => {
        const item = getItem(id);
        return { id, name: item.name, summary: item.summary, positive: item.positive, negative: item.negative };
      }),
      attack: this.computeAttackVector(),
      poisons: { ...this.poisons },
      memories: this.memories.slice(-10),
      recentEvents: this.fateReceipts.slice(-4).map((receipt) => receipt.event.id),
      fateItemCandidates: this.pickFateItemCandidates(),
      swallowCount: this.stats.swallowed,
      exhaleCount: this.stats.exhaled,
    };
  }

  private pickFateItemCandidates(): ItemId[] {
    if (this.fateReceipts.some((receipt) => receipt.event.unavoidable.kind === 'gain_item')) return [];
    const available = FATE_ITEM_IDS.filter((id) => !this.items.includes(id));
    if (!available.length) return [];
    const start = ((this.runSeed ^ Math.imul(this.encounterIndex + 1, 0x45d9f3b)) >>> 0) % available.length;
    return Array.from({ length: Math.min(3, available.length) }, (_, index) => available[(start + index) % available.length]!);
  }

  private openFate(destination: FateDestination): void {
    this.feedback.play('page', 0.9);
    this.resetMovementInput();
    this.resetFateInput();
    this.fateDestination = destination;
    const snapshot = this.buildLifeSnapshot();
    const fallback = generateLocalFateEvent(snapshot, () => this.random());
    const prefetched = this.prefetchedFate?.encounterIndex === this.encounterIndex ? this.prefetchedFate.promise : null;
    this.prefetchedFate = undefined;
    const generationId = ++this.fateGenerationId;
    this.currentFate = undefined;
    this.aiFateState = 'requesting';
    this.fateResultDirection = undefined;
    this.fateResultTimer = 0;
    this.closeFreeInput();
    this.fateAnim = 0;
    this.fateExitTimer = 0;
    this.fateResultMinTimer = 0;
    this.fatePlayerText = '';
    this.state = 'fateEvent';
    void (async () => {
      const generated = await (prefetched ?? generateAIFate(snapshot));
      if (generationId !== this.fateGenerationId || this.state !== 'fateEvent' || this.fateResultDirection) return;
      let currentGenerated = generated ? validateFateEvent(generated, snapshot) : null;
      if (generated && prefetched && !currentGenerated) currentGenerated = await generateAIFate(snapshot);
      if (generationId !== this.fateGenerationId || this.state !== 'fateEvent' || this.fateResultDirection) return;
      this.currentFate = currentGenerated ?? fallback;
      this.aiFateState = currentGenerated ? 'gpt' : 'fallback';
      this.applyFateFact(this.currentFate);
    })();
  }

  private prepareFate(): void {
    const snapshot = this.buildLifeSnapshot();
    const encounterIndex = this.encounterIndex;
    this.aiFateState = 'requesting';
    const promise = generateAIFate(snapshot);
    this.prefetchedFate = { encounterIndex, promise };
    void promise.then((event) => {
      if (this.prefetchedFate?.encounterIndex !== encounterIndex) return;
      this.aiFateState = event ? 'gpt' : 'fallback';
    });
  }

  private applyFateFact(event: FateEvent): void {
    if (!this.memories.includes(event.memoryText)) this.memories.push(event.memoryText);
    const effect = event.unavoidable;
    if (effect.kind === 'damage') {
      const reduction = Math.min(effect.amount, this.firstFateDamageReduction);
      this.firstFateDamageReduction = Math.max(0, this.firstFateDamageReduction - reduction);
      this.loseHealth(Math.max(0, effect.amount - reduction));
    } else if (effect.kind === 'lose_coins') {
      this.hero.coins = Math.max(0, this.hero.coins - effect.amount);
    } else if (effect.kind === 'gain_coins') {
      this.hero.coins += effect.amount;
    } else if (effect.kind === 'lose_max_hp') {
      this.changeMaxHp(-effect.amount);
    } else if (effect.kind === 'gain_item' && effect.item) {
      this.acquireItem(effect.item);
    }
  }

  private resolveFate(direction: FateDirection, custom?: FateResponse): void {
    const event = this.currentFate;
    if (this.state !== 'fateEvent' || !event || this.fateResultDirection) return;
    if (this.fateFreeWaiting && !custom) return;
    if (!custom && this.fateAnim < 0.75) return;
    const response = custom ?? event[direction];
    this.feedback.play(direction === 'swallow' ? 'swallow' : 'exhale', 1.1);
    this.feedback.vibrate(direction === 'swallow' ? 24 : [10, 24, 10]);
    const power = direction === 'swallow' ? this.originModifiers.swallowPowerMul * (this.hasItem('abstract-lv10') ? 0.9 : 1) : 1;
    this.applyFateResponseEffect(response.effect, power);
    this.adjustPoisons(response.poison);
    this.applyFateStats(response.stats);
    if (this.hasItem('ai-chat')) this.healHero(4);
    this.memories.push(`《${event.title}》他${custom ? '亲口回应' : '选择'}了「${response.label}」`);
    if (this.memories.length > 14) this.memories = this.memories.slice(-14);
    if (custom) this.currentFate = { ...event, [direction]: custom };
    this.stats.fateChoices += 1;
    if (direction === 'swallow') {
      this.stats.swallowed += 1;
      if (this.hasItem('unsent-phone')) this.phoneCharges = Math.min(6, this.phoneCharges + 1);
      if (this.hasItem('retracted-voice')) this.voiceCharges = Math.min(8, this.voiceCharges + 1);
      if (this.hasItem('ruma-msg')) this.ruCharges = Math.min(6, this.ruCharges + 1);
    } else {
      this.stats.exhaled += 1;
      if (this.hasItem('unsent-phone') && this.phoneCharges > 0) {
        this.fateBuild.storedVolleys = Math.min(8, this.fateBuild.storedVolleys + this.phoneCharges);
        this.phoneCharges = 0;
        // 《这一次有人接了》：攒下的假点赞化为真实护盾，并清一次药效失真
        if (this.hasCombo('这一次有人接了') && this.heartCount > 0) {
          this.hero.block = Math.min(24, this.hero.block + this.heartCount);
          this.heartCount = 0;
          if (!this.answeredUsedStage && this.odPenalty) {
            this.answeredUsedStage = true;
            this.odPenalty = undefined;
            this.say('这一次有人接了 · 失真被清空');
          }
          this.burst('word', this.heroX, this.heroY - 64, 50, '#8fc4b0', '有人接了');
        }
      }
      if (this.hasItem('retracted-voice') && this.voiceCharges > 0) {
        this.areaDamage(this.voiceCharges * 6, '#9a8fc0');
        this.burst('word', this.heroX, this.heroY - 60, 60, '#9a8fc0', '当时没说的');
        this.voiceCharges = 0;
      }
    }
    this.fateReceipts.push({ event, direction, result: response.result });
    this.resetFateInput();
    this.fateResultDirection = direction;
    this.fateExitTimer = 0.35;
    this.fateResultMinTimer = 1.1;
    this.fateDragX = direction === 'swallow' ? -150 : 150;
    this.burst('word', this.heroX, this.heroY - 58, 72, direction === 'swallow' ? '#7d91a5' : '#b65d67', direction === 'swallow' ? '咽下' : '吐出');
    if (event.source === 'gpt') {
      const serial = this.runSerial;
      const receiptIndex = this.fateReceipts.length - 1;
      void generateAIFateResult({
        event: { id: event.id, title: event.title, fact: event.fact },
        direction,
        response: { label: response.label, effect: response.effect, result: response.result },
        snapshot: this.buildLifeSnapshot(),
      }).then((text) => {
        const receipt = this.fateReceipts[receiptIndex];
        if (!text || this.runSerial !== serial || !receipt || receipt.event.id !== event.id || receipt.direction !== direction) return;
        if (this.fateReceipts.length - 1 === receiptIndex && this.state === 'battle') {
          this.caption = text;
          this.captionTime = 7;
        }
        this.memories.push(text);
        if (this.memories.length > 14) this.memories = this.memories.slice(-14);
      });
    }
  }

  private applyFateResponseEffect(effect: FateEvent['swallow']['effect'], power: number): void {
    if (effect === 'store_volleys') this.fateBuild.storedVolleys = Math.min(8, this.fateBuild.storedVolleys + Math.max(2, Math.round(2 * power)));
    if (effect === 'returning_breath') {
      this.fateBuild.returning = true;
      this.fateBuild.damageMul *= 1.03;
    }
    if (effect === 'guard') this.fateBuild.openingBlock = Math.min(24, this.fateBuild.openingBlock + Math.round(5 * power));
    if (effect === 'focus') {
      this.fateBuild.homingAdd = Math.min(0.22, this.fateBuild.homingAdd + 0.055 * power);
      this.fateBuild.widthMul *= 0.97;
    }
    if (effect === 'scatter') {
      this.fateBuild.countAdd = Math.min(3, this.fateBuild.countAdd + 1);
      this.fateBuild.damageMul *= 0.94;
    }
    if (effect === 'haste') this.fateBuild.intervalMul *= Math.max(0.88, 1 - 0.07 * power);
    if (effect === 'heavy_breath') {
      this.fateBuild.damageMul *= 1 + 0.1 * power;
      this.fateBuild.speedMul *= Math.max(0.82, 1 - 0.08 * power);
    }
    if (effect === 'delay_pain') this.fateBuild.delayFirstHit = true;
    if (effect === 'release_pain') this.fateBuild.missingHpDamage = Math.min(0.8, this.fateBuild.missingHpDamage + 0.28 * power);
    if (effect === 'gain_coins') this.hero.coins += Math.max(2, Math.round(2 * power));
    if (effect === 'heal') this.healHero(8 * power);
    if (effect === 'trade_max_hp') {
      this.changeMaxHp(-5);
      this.fateBuild.damageMul *= 1.13;
    }
  }

  private adjustPoisons(delta: Partial<PoisonVector>): void {
    for (const key of POISON_KEYS) {
      const amount = delta[key] ?? 0;
      this.poisons[key] = Math.round(this.clamp(this.poisons[key] + amount, 0, 12));
    }
  }

  private completeFateDestination(): void {
    const destination = this.fateDestination;
    this.resetFateInput();
    this.closeFreeInput();
    this.currentFate = undefined;
    this.aiFateState = 'idle';
    this.fateResultDirection = undefined;
    this.fateDragX = 0;
    if (destination === 'shop') {
      this.resetMovementInput();
      this.setupShop();
      this.state = 'shop';
    } else if (destination === 'battle') {
      this.resetMovementInput();
      this.state = 'battle';
    } else this.advanceStage();
  }

  private openWorldReward(): void {
    const reward = this.worldReward;
    if (!reward || this.state !== 'battle') return;
    this.worldReward = undefined;
    this.resetMovementInput();
    this.initialItemReward = false;
    this.rewardReturn = 'battle';
    this.rewardTitle = '路边留下的东西，也会穿进这一身';
    this.itemRewardChoices = reward.choices;
    this.itemRewardFocus = 0;
    this.state = 'itemReward';
    this.feedback.play('page', 0.92);
  }

  private pickItemChoices(initial: boolean): ItemId[] {
    const available = ITEM_IDS.filter((id) => {
      if (this.items.includes(id)) return false;
      if (getItem(id).quality === 4) return false;
      return !initial || getItem(id).quality <= 2;
    });
    return this.shuffle(available).slice(0, 3);
  }

  private chooseItemReward(index: number): void {
    const id = this.itemRewardChoices[index];
    if (!id || this.state !== 'itemReward' || this.rewardAcquire) return;
    const destination: RewardDestination = this.initialItemReward ? 'start' : this.rewardReturn;
    this.acquireItem(id);
    const total = this.reducedMotion ? 0.34 : 0.85;
    this.rewardAcquire = { id, index, timer: total, total, destination };
  }

  private completeRewardAcquire(): void {
    const acquisition = this.rewardAcquire;
    if (!acquisition || this.state !== 'itemReward') return;
    this.rewardAcquire = undefined;
    if (acquisition.destination === 'start') {
      this.initialItemReward = false;
      this.startStage();
    } else if (acquisition.destination === 'advance') {
      this.advanceStage();
    } else {
      this.resetMovementInput();
      this.state = 'battle';
    }
  }

  private acquireItem(id: ItemId): void {
    if (this.items.includes(id)) return;
    this.items.push(id);
    this.feedback.play('wear', getItem(id).quality >= 4 ? 1.25 : 0.9);
    this.feedback.vibrate(12);
    this.stats.itemsTaken += 1;
    if (id === 'small-uniform') this.changeMaxHp(-6);
    if (id === 'nameless-tie') this.changeMaxHp(-10);
    if (id === 'eyebrow-razor') this.changeMaxHp(-8);
    if (id === 'broken-spine') this.changeMaxHp(-12);
    if (['eyebrow-razor', 'od-pill', 'white-bottle', 'broken-spine', 'spent-decade', 'painless-night'].includes(id)) this.strainTendency += 2;
    if (['fathers-raincoat', 'baby-tooth', 'missing-photo'].includes(id)) this.lightTendency += 2;
    // 《朋友圈仅三天可见》：拾取任何道具后，3 枚当前弹体绕身三圈后向外释放
    if (this.hasItem('three-day-visible')) this.spawnOrbitRing();
    this.say(`穿戴 · ${getItem(id).name}`);
    for (const combo of this.activeComboNames()) {
      if (!this.comboSeen.has(combo)) {
        this.comboSeen.add(combo);
        const def = COMBO_DEFS.find((entry) => entry.name === combo);
        if (def) {
          // 奥义演出：插画浮现（战斗不暂停）；同时成多套则排队依次浮现
          this.comboRevealQueue.push(def);
        } else {
          this.caption = `集齐了 ·《${combo}》`;
          this.captionTime = 5.5;
        }
        this.burst('ring', this.heroX, this.heroY - 30, 120, '#d9b768');
        this.burst('word', this.heroX, this.heroY - 66, 60, '#d9b768', '成套了');
      }
    }
  }

  private changeMaxHp(delta: number): void {
    this.hero.maxHp = Math.max(20, this.hero.maxHp + delta);
    this.hero.hp = Math.min(this.hero.hp, this.hero.maxHp);
  }

  private setupShop(resetPurchase = true): void {
    if (resetPurchase) this.boughtThisShop = false;
    this.shopFeedback = undefined;
    const candidates = this.shuffle(ITEM_IDS.filter((id) => !this.items.includes(id) && getItem(id).quality < 4));
    this.shopOffers = candidates.slice(0, 3).map((item) => ({ item, price: this.itemPrice(item), sold: false }));
    this.shopFocus = 0;
  }

  private itemPrice(id: ItemId): number {
    let multiplier = this.hasItem('revoked-badge') ? 1.2 : 1;
    if (this.hasItem('bargain-link')) multiplier *= 1.1;
    if (this.hasItem('pregnancy-test')) multiplier *= 1.35;
    return Math.ceil(getItem(id).price * multiplier);
  }

  private buyShopOffer(index: number): void {
    const offer = this.shopOffers[index];
    if (!offer || offer.sold || this.state !== 'shop' || this.shopFeedback?.kind === 'purchase' || this.shopFeedback?.kind === 'reroll') return;
    if (this.hero.coins < offer.price) {
      this.say('零钱不够');
      this.feedback.play('deny');
      this.feedback.vibrate(8);
      const total = this.reducedMotion ? 0.18 : 0.42;
      this.shopFeedback = { kind: 'deny', index, timer: total, total, price: offer.price };
      return;
    }
    this.hero.coins -= offer.price;
    this.feedback.play('coin', 1.1);
    this.stats.coinsSpent += offer.price;
    offer.sold = true;
    this.boughtThisShop = true;
    this.acquireItem(offer.item);
    const total = this.reducedMotion ? 0.28 : 0.72;
    this.shopFeedback = { kind: 'purchase', index, timer: total, total, price: offer.price };
  }

  private rerollShop(): void {
    if (this.state !== 'shop' || this.shopFeedback?.kind === 'purchase' || this.shopFeedback?.kind === 'reroll') return;
    if (this.hero.coins < 2) {
      this.say('刷新需要2枚零钱');
      this.feedback.play('deny');
      const total = this.reducedMotion ? 0.18 : 0.42;
      this.shopFeedback = { kind: 'deny', index: -1, timer: total, total, price: 2 };
      return;
    }
    this.hero.coins -= 2;
    this.feedback.play('page');
    this.stats.coinsSpent += 2;
    this.setupShop(false);
    const total = this.reducedMotion ? 0.2 : 0.46;
    this.shopFeedback = { kind: 'reroll', index: -1, timer: total, total, price: 2 };
  }

  private leaveShop(): void {
    if (this.state !== 'shop' || this.shopFeedback?.kind === 'purchase' || this.shopFeedback?.kind === 'reroll') return;
    if (this.hasItem('friend-verify') && !this.boughtThisShop) {
      this.noBuyStacks += 1;
      this.say(`一个人也行 · 伤害+${this.noBuyStacks * 6}%`);
    }
    this.resetMovementInput();
    this.stallCooldown = 2.5;
    this.state = 'battle';
  }

  private pickSpecialKind(): SpecialRoomKind {
    const backWeight = this.clamp(0.5 + (this.strainTendency - this.lightTendency) * 0.08, 0.2, 0.8);
    return this.random() < backWeight ? 'back' : 'light';
  }

  private openSpecialRoom(kind?: SpecialRoomKind): void {
    this.resetMovementInput();
    this.resetSpecialRoomHold();
    this.specialRoomKind = kind ?? this.pickSpecialKind();
    // Ⅳ 级遗物的两条获取线：留灯间=被爱过的证据；里屋=透支自己
    const backPool: ItemId[] = ['broken-spine', 'spent-decade', 'painless-night', 'third-pill', 'loan-contract', 'name-sold', 'ktv-song'];
    const lightPool: ItemId[] = ['fathers-raincoat', 'baby-tooth', 'missing-photo', 'moms-bowl', 'ruma-msg', 'held-elevator', 'old-door-lock', 'breath-on-glass'];
    const roomPool = (this.specialRoomKind === 'back' ? backPool : lightPool).filter((id) => !this.items.includes(id));
    this.specialRoomOffers = this.shuffle(roomPool).slice(0, 3);
    this.specialRoomTaken.clear();
    this.specialRoomFocus = 0;
    this.specialRoomLeaveFocused = false;
    this.state = 'specialRoom';
  }

  private takeSpecialOffer(index: number): void {
    if (this.state !== 'specialRoom') return;
    const id = this.specialRoomOffers[index];
    if (!id || this.specialRoomTaken.has(id)) return;
    if (this.specialRoomKind === 'light') {
      this.acquireItem(id);
      this.lightTendency += 3;
      this.finishSpecialRoom();
      return;
    }
    if (this.hero.maxHp - 12 < 20) {
      this.say('已经没有足够的一口气');
      this.feedback.play('deny');
      return;
    }
    if (id !== 'broken-spine') this.changeMaxHp(-12);
    this.strainTendency += 3;
    this.acquireItem(id);
    this.specialRoomTaken.add(id);
    const nextAvailable = this.specialRoomOffers.findIndex((offer) => !this.specialRoomTaken.has(offer));
    if (nextAvailable >= 0) this.specialRoomFocus = nextAvailable;
  }

  private leaveSpecialRoom(): void {
    if (this.state !== 'specialRoom') return;
    if (this.specialRoomKind === 'back' && this.specialRoomTaken.size === 0) this.lightTendency += 2;
    this.finishSpecialRoom();
  }

  private finishSpecialRoom(): void {
    this.resetMovementInput();
    this.resetSpecialRoomHold();
    this.worldDoor = undefined;
    this.doorUsed = true;
    this.state = 'battle';
  }

  private endRun(won: boolean): void {
    this.resetMovementInput();
    this.resetFateInput();
    this.closeFreeInput();
    this.paused = false;
    this.resetPauseHold();
    this.resultWon = won;
    this.resultTab = 'seal';
    this.resultStartedAt = performance.now();
    this.feedback.play(won ? 'page' : 'swallow', won ? 1.2 : 0.9);
    if (!won) this.feedback.vibrate([26, 54, 26]);
    this.state = 'result';
    this.projectiles = [];
    this.toast = '';
    this.toastTime = 0;
  }

  private nearestEnemy(x: number, y: number): EnemyUnit | undefined {
    let nearest: EnemyUnit | undefined;
    let nearestDistanceSq = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < nearestDistanceSq) {
        nearest = enemy;
        nearestDistanceSq = distanceSq;
      }
    }
    return nearest;
  }

  private hasLivingEnemies(): boolean {
    return this.enemies.some((enemy) => !enemy.dead);
  }

  private hasItem(id: ItemId): boolean {
    return this.items.includes(id);
  }

  private baseProjectileStyle(): ProjectileStyle {
    if (this.hasItem('front-desk-letter')) return 'paper';
    if (this.hasItem('only-key')) return 'key';
    return 'plain';
  }

  private hitMaterialOf(projectile: Projectile): HitMaterial {
    if (projectile.critical) return 'crit';
    if (projectile.style === 'rain') return 'water';
    if (projectile.style === 'paper') return 'paper';
    return 'mist';
  }

  private projectileColor(style: ProjectileStyle): string {
    if (style === 'paper') return this.hasItem('fathers-raincoat') ? '#8eb3b5' : '#e7ddc8';
    if (style === 'rain') return '#78b0ba';
    if (style === 'sound') return '#83c6bd';
    if (style === 'key') return '#d1ab5f';
    return '#e5ded0';
  }

  private activeComboNames(): string[] {
    return COMBO_DEFS
      .filter((combo) => combo.items.every((id) => this.hasItem(id)))
      .map((combo) => combo.name);
  }

  private hasCombo(name: string): boolean {
    const combo = COMBO_DEFS.find((entry) => entry.name === name);
    return Boolean(combo && combo.items.every((id) => this.hasItem(id)));
  }

  /** 形变协同首次触发时的低声记账：同一局每句只说一次。 */
  private noteSynergy(line: string): void {
    if (this.synergySeen.has(line)) return;
    this.synergySeen.add(line);
    this.say(`成双 · ${line}`);
  }

  /** 叹气：从嘴边呼出一小团白气。攻击即吐气，静立久了会深叹。 */
  private sigh(scale: number): void {
    const facing = this.heroAttackFacing;
    const mouthX = this.heroX + (facing === 'left' ? -5 : facing === 'right' ? 5 : 0);
    const mouthY = this.heroY - 17;
    const drift = facing === 'left' ? 'L' : facing === 'right' ? 'R' : facing === 'back' ? 'B' : 'F';
    for (let index = 0; index < 2; index += 1) {
      this.pushBurst({
        id: this.entityId++, kind: 'sigh', x: mouthX, y: mouthY - index * 2,
        radius: (2.4 + index * 1.6) * scale, life: 0.55 + index * 0.2, duration: 0.55 + index * 0.2,
        color: '#dfe6e2', text: drift,
      });
    }
  }

  private burst(kind: BurstEffect['kind'], x: number, y: number, radius: number, color: string, text?: string, material?: string): void {
    this.pushBurst({ id: this.entityId++, kind, x, y, radius, life: 0.36, duration: 0.36, color, text, material });
  }

  private pushBurst(effect: BurstEffect): void {
    if (this.bursts.length < MAX_BURSTS) {
      this.bursts.push(effect);
      return;
    }
    const important = effect.kind === 'word' || effect.kind === 'syn';
    const disposableIndex = this.bursts.findIndex((burst) => burst.kind !== 'word' && burst.kind !== 'syn');
    if (!important && disposableIndex < 0) return;
    this.bursts.splice(disposableIndex >= 0 ? disposableIndex : 0, 1);
    this.bursts.push(effect);
  }

  private say(message: string): void {
    this.toast = message;
    this.toastTime = 1.45;
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#111116';
    ctx.fillRect(0, 0, W, H);
    this.renderBackground();
    if (this.state === 'title') this.renderTitle();
    else if (this.state === 'origin') this.renderOrigin();
    else if (this.state === 'battle') this.renderBattle();
    else if (this.state === 'itemReward') this.renderItemReward();
    else if (this.state === 'shop') this.renderShop();
    else if (this.state === 'specialRoom') this.renderSpecialRoom();
    else if (this.state === 'fateEvent') this.renderFateEvent();
    else this.renderResult();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(174,35,55,${Math.min(0.32, this.flash * 1.25)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.state === 'battle' && !this.paused) this.renderLowHealthWarning();
    if (!this.paused && (this.state === 'battle' || this.state === 'fateEvent')) this.renderPauseButton();
    if (this.paused) this.renderPauseOverlay();
    if (import.meta.env.DEV) {
      const now = performance.now();
      if (now - this.devSnapshotAt >= 200 && this.renderGameState) {
        this.canvas.dataset.gameState = this.renderGameState();
        this.devSnapshotAt = now;
      }
    }
  }

  private renderLowHealthWarning(): void {
    const ratio = this.hero.hp / Math.max(1, this.hero.maxHp);
    if (ratio >= 0.3) return;
    const pulse = 0.16 + (Math.sin(this.battleTime * 6) + 1) * 0.08;
    this.ctx.save();
    this.ctx.strokeStyle = `rgba(190,45,65,${pulse})`;
    this.ctx.lineWidth = 8;
    this.ctx.strokeRect(4, 4, W - 8, H - 8);
    this.ctx.restore();
  }

  private renderWorld(): void {
    const ctx = this.ctx;
    const stage = STAGES[this.encounterIndex] ?? STAGES[STAGES.length - 1]!;
    const next = STAGES[this.encounterIndex + 1];
    const tailBlend = this.clamp((this.battleTime - (stage.duration - 15)) / 15, 0, 1);
    const tailEase = tailBlend * tailBlend * (3 - 2 * tailBlend);
    const transitionProgress = this.clamp(1 - this.transitionTimer / STAGE_TRANSITION_DURATION, 0, 1);
    const transitionEase = transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
    // The formal chapter card must continue the environmental fade instead of
    // resetting it and briefly flashing the old floor back into view.
    const blend = next ? Math.max(tailEase, this.transitionTimer > 0 ? transitionEase : 0) : 0;
    const top = next ? this.mixHex(stage.groundTop, next.groundTop, blend) : stage.groundTop;
    const bottom = next ? this.mixHex(stage.groundBottom, next.groundBottom, blend) : stage.groundBottom;
    // The battlefield is an archive scan, not a smooth digital gradient. Flat
    // bands keep the scene readable at native pixel scale and make age changes
    // feel like a page being replaced.
    this.fillSteppedVertical(top, bottom, 12);
    // 循环地面贴图的接缝会随世界坐标移动，读成半透明网格。
    // 地表细节改由稀疏章节印记与实体摆设承担，底色保持稳定。
    this.renderStageAtmosphere(stage, next, blend);

    const shakeAmount = !this.reducedMotion && this.screenShake > 0 ? Math.ceil(this.screenShake * 16) : 0;
    const shakeX = shakeAmount ? Math.round(Math.sin(this.battleTime * 113) * shakeAmount) : 0;
    const shakeY = shakeAmount ? Math.round(Math.cos(this.battleTime * 97) * shakeAmount) : 0;
    ctx.save();
    ctx.translate(HERO_SCREEN_X - this.heroX + shakeX, HERO_SCREEN_Y - this.heroY + shakeY);
    this.renderGroundDecals(stage, next, blend);
    this.renderProps(stage, next, blend);
    this.renderCoinDrops();
    this.renderWorldEntities();
    this.renderHeroGrounding();
    this.renderEnemies();
    this.renderProjectiles();
    const heroMotion = this.hurtCooldown > 0
      ? 'hurt'
      : this.heroAttackTimer > 0
        ? 'attack'
        : this.heroMoving
          ? 'walk'
          : 'idle';
    const heroFacing = heroMotion === 'attack' ? this.heroAttackFacing : this.heroFacing;
    const heroActionFrame = heroMotion === 'hurt'
      ? (this.hurtCooldown > HURT_IFRAME * 0.55 ? 0 : 1)
      : heroMotion === 'attack'
        ? (this.heroAttackTimer > HERO_ATTACK_ANIMATION_DURATION * 0.5 ? 0 : 1)
        : undefined;
    this.drawHero(this.heroX, this.heroY, HERO_WORLD_SCALE, this.items, heroFacing, heroMotion, heroActionFrame);
    this.renderBursts();
    ctx.restore();
  }

  private renderStageAtmosphere(stage: StageSpec, next: StageSpec | undefined, blend: number): void {
    const ctx = this.ctx;
    const t = this.reducedMotion ? 0 : this.battleTime;
    const seed = this.runSeed >>> 0;
    const stageIndex = this.encounterIndex;
    applyPixelDiscipline(ctx);
    ctx.save();
    ctx.globalAlpha = 1;

    const shadowSway = Math.round(Math.sin(t * 0.22 + stageIndex * 0.9) * 18);
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#08080c';
    ctx.fillRect(-78 + shadowSway, 96, 92, 456);
    ctx.fillRect(344 - shadowSway, 96, 74, 456);
    ctx.globalAlpha = 0.025;
    ctx.fillStyle = stage.propColor;
    ctx.fillRect(64 + Math.round(Math.sin(t * 0.13) * 22), 104, 18, 432);
    ctx.fillRect(286 + Math.round(Math.cos(t * 0.11) * 17), 104, 10, 432);
    ctx.globalAlpha = 1;

    if (stageIndex === 0) {
      // Childhood: the room is too large. Dust drifts, and the floor under the
      // bed occasionally remembers two eyes.
      ctx.fillStyle = 'rgba(125,105,137,.18)';
      ctx.fillRect(22, 438, 316, 2);
      ctx.fillStyle = 'rgba(220,207,180,.42)';
      for (let index = 0; index < 18; index += 1) {
        const hash = this.cellHash(index - 4, stageIndex + 11);
        const x = (hash % 344) + 8;
        const y = 112 + ((hash >>> 9) % 360);
        const drift = Math.floor((t * (3 + (hash % 4)) + index * 19) % 18);
        if ((hash + Math.floor(t * 2)) % 5 < 3) ctx.fillRect(x, y + drift, 1 + (hash % 2), 1);
      }
    } else if (stageIndex === 1) {
      // School: sparse notebook rules and a red correction mark that never
      // quite lands. Broken strokes avoid turning the whole floor into a grid.
      ctx.fillStyle = 'rgba(174,190,198,.13)';
      for (let y = 132; y < 448; y += 52) {
        ctx.fillRect(34, y, 72, 1);
        ctx.fillRect(126, y, 92, 1);
        ctx.fillRect(246, y, 76, 1);
      }
      ctx.fillStyle = 'rgba(159,53,72,.22)';
      const markX = 48 + Math.floor(((t * 16) % 260) / 4) * 4;
      const markY = 146 + ((Math.floor(t / 4) % 4) * 52);
      ctx.fillRect(markX, markY, 14, 2);
      ctx.fillRect(markX + 6, markY - 6, 2, 14);
    } else if (stageIndex === 2) {
      // Youth: a static platform edge grounds the station. Only the timetable
      // light moves; rail sleepers previously looked like a scrolling grid.
      ctx.fillStyle = 'rgba(210,180,105,.2)';
      ctx.fillRect(18, 456, 324, 2);
      ctx.fillRect(18, 468, 324, 1);
      ctx.fillStyle = 'rgba(185,166,125,.12)';
      for (let x = 30; x < 330; x += 58) {
        ctx.fillRect(x, 462, 22, 1);
        ctx.fillRect(x + 9, 466, 4, 1);
      }
      const sweep = ((t * 42 + (seed % 140)) % 420) - 40;
      ctx.fillStyle = 'rgba(231,211,149,.22)';
      ctx.fillRect(Math.round(sweep), 184, 2, 46);
      ctx.fillRect(Math.round(sweep + 12), 184, 1, 24);
    } else if (stageIndex === 3) {
      // Adulthood: rain is a regular office clock. One warm window fades in and
      // out, but never becomes a safe place to stand.
      ctx.fillStyle = 'rgba(153,188,175,.18)';
      for (let index = 0; index < 26; index += 1) {
        const hash = this.cellHash(index + 7, stageIndex + 19);
        const x = (hash % 360) - 8;
        const y = 102 + ((hash >>> 8) % 410);
        const fall = Math.floor((t * (18 + (hash % 11)) + index * 13) % 42);
        ctx.fillRect(x, y + fall, 1, 5 + (hash % 4));
      }
      const windowPulse = 0.08 + Math.max(0, Math.sin(t * 0.9 + 1.4)) * 0.12;
      ctx.fillStyle = `rgba(211,183,102,${windowPulse.toFixed(3)})`;
      ctx.fillRect(282, 134, 34, 22);
      ctx.fillStyle = 'rgba(20,24,23,.5)';
      ctx.fillRect(297, 134, 2, 22);
      ctx.fillRect(282, 144, 34, 2);
    } else if (stageIndex === 4) {
      // Middle age: scattered form rows imply paperwork without covering the
      // battlefield in a literal spreadsheet grid.
      ctx.fillStyle = 'rgba(173,188,198,.09)';
      for (let y = 142; y < 438; y += 64) {
        ctx.fillRect(28, y, 76, 1);
        ctx.fillRect(122, y + 12, 58, 1);
        ctx.fillRect(238, y + 4, 86, 1);
      }
      const flicker = 0.06 + Math.max(0, Math.sin(t * 7.5)) * 0.08;
      ctx.fillStyle = `rgba(205,216,211,${flicker.toFixed(3)})`;
      ctx.fillRect(40, 104, 280, 2);
      ctx.fillStyle = 'rgba(187,72,88,.32)';
      const notice = Math.floor(t / 5) % 3;
      ctx.fillRect(292 + notice * 8, 120 + notice * 24, 3, 3);
    } else {
      // Old age: the archive loses ink. Ash/snow moves slowly and a distant
      // lamp appears only during the short surprise pulse below.
      ctx.fillStyle = 'rgba(201,204,196,.28)';
      for (let index = 0; index < 22; index += 1) {
        const hash = this.cellHash(index + 31, stageIndex + 29);
        const x = (hash % 344) + 8;
        const y = 108 + ((hash >>> 10) % 390);
        const drift = Math.floor((t * (5 + (hash % 3)) + index * 23) % 30);
        ctx.fillRect(x, y + drift, 1 + (hash % 2), 1 + (hash % 2));
      }
      ctx.fillStyle = 'rgba(220,214,192,.14)';
      ctx.fillRect(18, 438, 324, 2);
    }

    if (!this.reducedMotion) this.renderAtmosphereSurprise(stageIndex, t, seed);
    if (next && blend > 0.01) {
      ctx.globalAlpha = Math.min(0.35, blend * 0.35);
      ctx.fillStyle = next.propColor;
      ctx.fillRect(14, 536, 332, 1);
    }
    ctx.restore();
  }

  private renderAtmosphereSurprise(stageIndex: number, time: number, seed: number): void {
    const ctx = this.ctx;
    const period = 17 + stageIndex * 2;
    const phase = ((time + (seed % period)) % period + period) % period;
    const center = 11.5 + (stageIndex % 2) * 1.5;
    const distance = Math.abs(phase - center);
    const pulse = distance < 0.85 ? 1 - distance / 0.85 : 0;
    if (pulse <= 0) return;
    ctx.save();
    ctx.globalAlpha = pulse * 0.85;
    ctx.imageSmoothingEnabled = false;
    if (stageIndex === 0) {
      ctx.fillStyle = '#d8d0c1';
      ctx.fillRect(78, 214, 3, 3); ctx.fillRect(86, 214, 3, 3);
      ctx.fillRect(78, 226, 3, 2); ctx.fillRect(86, 226, 3, 2);
    } else if (stageIndex === 1) {
      ctx.fillStyle = '#b84d5b';
      ctx.fillRect(252, 188, 22, 2); ctx.fillRect(262, 178, 2, 22);
    } else if (stageIndex === 2) {
      ctx.fillStyle = '#f0d68a';
      ctx.fillRect(42, 258, 34, 3); ctx.fillRect(52, 254, 14, 2);
    } else if (stageIndex === 3) {
      ctx.fillStyle = '#d8b95f';
      ctx.fillRect(288, 182, 22, 2); ctx.fillRect(298, 172, 2, 22);
    } else if (stageIndex === 4) {
      ctx.fillStyle = '#d26a73';
      ctx.fillRect(302, 266, 4, 4); ctx.fillRect(312, 266, 4, 4);
      ctx.fillStyle = '#d8d0c1'; ctx.fillRect(306, 258, 6, 2);
    } else {
      ctx.fillStyle = '#d8d0c1';
      ctx.fillRect(64, 236, 2, 20); ctx.fillRect(60, 236, 10, 2);
      ctx.fillStyle = '#d8b95f'; ctx.fillRect(61, 231, 8, 3);
    }
    ctx.restore();
  }

  private renderGroundDecals(stage: StageSpec, next: StageSpec | undefined, blend: number): void {
    const ctx = this.ctx;
    const cell = 136;
    const minX = Math.floor((this.heroX - 260) / cell);
    const maxX = Math.floor((this.heroX + 260) / cell);
    const minY = Math.floor((this.heroY - 340) / cell);
    const maxY = Math.floor((this.heroY + 360) / cell);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const hash = this.cellHash(cx + 47, cy - 31);
        if (hash % 5 > 2) continue;
        const x = cx * cell + 18 + ((hash >>> 3) % (cell - 36));
        const y = cy * cell + 20 + ((hash >>> 11) % (cell - 40));
        const showNext = Boolean(next) && ((hash >>> 19) % 100) / 100 < blend;
        const stageIndex = showNext ? this.encounterIndex + 1 : this.encounterIndex;
        const color = showNext && next ? next.propColor : stage.propColor;
        this.drawGroundDecal(stageIndex, hash % 4, x, y, color, hash);
      }
    }
    ctx.restore();
  }

  private drawGroundDecal(
    stageIndex: number,
    variant: number,
    x: number,
    y: number,
    color: string,
    hash: number,
  ): void {
    const ctx = this.ctx;
    const flip = hash % 2 === 0 ? 1 : -1;
    ctx.globalAlpha = 0.16 + ((hash >>> 7) % 8) / 100;
    ctx.fillStyle = color;
    if (stageIndex === 0) {
      if (variant < 2) {
        ctx.fillRect(x - 12, y, 24, 1);
        ctx.fillRect(x - 7, y + 4, 13, 1);
        ctx.fillRect(x + 9 * flip, y - 3, 1, 3);
      } else {
        ctx.fillRect(x - 5, y - 2, 3, 2);
        ctx.fillRect(x + 3, y + 3, 2, 2);
        ctx.fillRect(x + 10 * flip, y - 5, 1, 1);
      }
    } else if (stageIndex === 1) {
      ctx.fillRect(x - 13, y, 21, 1);
      ctx.fillRect(x - 7, y + 4, 15, 1);
      if (variant >= 2) {
        ctx.fillStyle = '#a13d4c';
        ctx.fillRect(x + 9 * flip, y - 7, 2, 15);
        ctx.fillRect(x + 3 * flip, y - 1, 14, 2);
      }
    } else if (stageIndex === 2) {
      // 站台只留磨损与短划痕。纵横刻线会随镜头移动，被误读成调试网格。
      ctx.fillRect(x - 15, y, 30, 2);
      ctx.fillRect(x - 8, y + 5, 17, 1);
      ctx.fillRect(x + 11 * flip, y - 4, 6, 2);
      if (variant === 3) {
        ctx.fillRect(x - 3, y - 7, 5, 2);
        ctx.fillRect(x + 5, y + 8, 2, 2);
      }
    } else if (stageIndex === 3) {
      ctx.globalAlpha *= 0.8;
      ctx.fillRect(x - 17, y, 34, 2);
      ctx.fillRect(x - 11, y + 3, 22, 1);
      ctx.fillRect(x - 4, y - 3, 8, 1);
      if (variant >= 2) {
        ctx.fillRect(x + 13 * flip, y - 12, 1, 8);
        ctx.fillRect(x + 16 * flip, y - 8, 1, 5);
      }
    } else if (stageIndex === 4) {
      ctx.fillRect(x - 14, y - 9, 24, 16);
      ctx.globalAlpha *= 0.75;
      ctx.fillStyle = '#17171c';
      ctx.fillRect(x - 10, y - 5, 16, 1);
      ctx.fillRect(x - 10, y - 1, 12, 1);
      ctx.fillRect(x - 10, y + 3, 15, 1);
      if (variant === 3) ctx.fillRect(x + 14 * flip, y - 4, 12, 2);
    } else {
      ctx.fillRect(x - 18, y, 13, 1);
      ctx.fillRect(x - 5, y, 1, 8);
      ctx.fillRect(x - 5, y + 7, 11, 1);
      ctx.fillRect(x + 6, y + 7, 1, 7);
      ctx.fillRect(x + 6, y + 13, 10, 1);
      if (variant >= 2) {
        ctx.fillRect(x - 12, y - 8, 2, 2);
        ctx.fillRect(x + 13, y - 4, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  private renderHeroGrounding(): void {
    const ctx = this.ctx;
    const compression = this.heroMoving ? 3 : 0;
    const hurtShift = this.hurtCooldown > 0 ? 2 : 0;
    const shadowY = Math.round(this.heroY + 2 + hurtShift);
    const shadowWidth = 34 - compression * 2;
    ctx.save();
    ctx.globalAlpha = this.hurtCooldown > 0 ? 0.34 : 0.54;
    ctx.fillStyle = '#09090c';
    ctx.fillRect(Math.round(this.heroX - shadowWidth / 2), shadowY, shadowWidth, 3);
    ctx.fillRect(Math.round(this.heroX - 10), shadowY + 3, 20, 2);
    ctx.globalAlpha = this.heroMoving ? 0.34 : 0.24;
    ctx.fillStyle = STAGES[this.encounterIndex]?.propColor ?? UI_PALETTE.raincoatYellow;
    ctx.fillRect(Math.round(this.heroX - 21 - compression), shadowY + 1, 6, 1);
    ctx.fillRect(Math.round(this.heroX + 15 + compression), shadowY + 1, 6, 1);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.fillRect(Math.round(this.heroX - 17), shadowY - 2, 34, 1);
    ctx.restore();
  }

  private renderProps(stage: StageSpec, next: StageSpec | undefined, blend: number): void {
    const ctx = this.ctx;
    const cell = 84;
    const minX = Math.floor((this.heroX - 230) / cell);
    const maxX = Math.floor((this.heroX + 230) / cell);
    const minY = Math.floor((this.heroY - 300) / cell);
    const maxY = Math.floor((this.heroY + 340) / cell);
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const h = this.cellHash(cx, cy);
        this.ctx.globalAlpha = 0.22;
        this.ctx.fillStyle = stage.propColor;
        this.ctx.fillRect(cx * cell + ((h % 71) / 71) * cell, cy * cell + (((h >> 4) % 71) / 71) * cell, 2, 2);
        this.ctx.globalAlpha = 1;
        const clusterX = Math.floor(cx / 2);
        const clusterY = Math.floor(cy / 2);
        const slotX = cx - clusterX * 2;
        const slotY = cy - clusterY * 2;
        const slot = slotY * 2 + slotX;
        const clusterHash = this.cellHash(clusterX + 911, clusterY - 733);
        const clusterCount = 2 + (clusterHash % 2);
        if (slot >= clusterCount) continue;
        const [offsetX, offsetY] = PROP_CLUSTER_OFFSETS[slot]!;
        const jitterX = ((clusterHash >>> (slot * 4 + 3)) % 15) - 7;
        const jitterY = ((clusterHash >>> (slot * 4 + 9)) % 13) - 6;
        const px = clusterX * cell * 2 + cell + offsetX + jitterX;
        const py = clusterY * cell * 2 + cell + offsetY + jitterY;
        const variant = (slot + ((clusterHash >>> 5) % PROP_VARIANTS)) % PROP_VARIANTS;
        const currentIndex = this.encounterIndex;
        const nextIndex = Math.min(STAGES.length - 1, currentIndex + 1);
        const currentScale = PROP_STAGE_SCALES[currentIndex]?.[variant] ?? 1;
        const nextScale = PROP_STAGE_SCALES[nextIndex]?.[variant] ?? 1;
        const sizeClass = Math.max(currentScale, nextScale);
        const transitionWindow = sizeClass >= 1.25 ? 0.16 : sizeClass >= 1 ? 0.12 : 0.08;
        const switchAt = 0.12 + (((h >>> 9) % 100) / 100) * 0.76;
        const localBlend = next
          ? this.clamp((blend - (switchAt - transitionWindow / 2)) / transitionWindow, 0, 1)
          : 0;
        const emergence = localBlend * localBlend * (3 - 2 * localBlend);
        const currentSprite = this.worldProps.slice(currentIndex, variant);
        const nextSprite = next ? this.worldProps.slice(nextIndex, variant) : null;

        // A small floor trace arrives before the object and remains while the
        // old object dissolves, so the new prop feels rooted rather than pasted.
        ctx.globalAlpha = 0.18 + emergence * 0.16;
        ctx.fillStyle = 'rgba(5,5,8,.72)';
        const shadowWidth = Math.round(20 + sizeClass * 10);
        ctx.fillRect(Math.round(px - shadowWidth / 2), Math.round(py - 2), shadowWidth, 3);

        if (currentSprite) {
          this.drawEmergingWorldProp(currentSprite, px, py, currentScale, 0.88 * (1 - emergence), 1);
        } else if (emergence < 1) {
          ctx.globalAlpha = 0.6 * (1 - emergence);
          this.drawProp(currentIndex, variant % 3, px, py, stage.propColor);
        }
        if (next && nextSprite && emergence > 0) {
          this.drawEmergingWorldProp(nextSprite, px, py, nextScale, 0.88 * emergence, emergence);
          if (emergence < 0.88) {
            ctx.globalAlpha = 0.22 * (1 - emergence);
            ctx.fillStyle = next.propColor;
            const row = Math.max(1, Math.round(sizeClass * 2));
            ctx.fillRect(Math.round(px - 6 - row), Math.round(py - 3 - row), row, 1);
            ctx.fillRect(Math.round(px + 4), Math.round(py - 1 - row * 2), row + 1, 1);
          }
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawEmergingWorldProp(
    sprite: HTMLCanvasElement,
    x: number,
    groundY: number,
    scale: number,
    alpha: number,
    reveal: number,
  ): void {
    if (alpha <= 0 || reveal <= 0) return;
    const ctx = this.ctx;
    const width = Math.max(1, Math.round(sprite.width * scale));
    const height = Math.max(1, Math.round(sprite.height * scale));
    const revealSteps = Math.max(1, Math.round(this.clamp(reveal, 0, 1) * 8));
    const visibleHeight = Math.max(1, Math.round((height * revealSteps) / 8));
    const left = Math.round(x - width / 2);
    const top = Math.round(groundY - height + (1 - revealSteps / 8) * 3);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.rect(left, top + height - visibleHeight, width, visibleHeight);
    ctx.clip();
    ctx.drawImage(sprite, left, top, width, height);
    ctx.restore();
  }

  private cellHash(cx: number, cy: number): number {
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) ^ this.runSeed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  private drawProp(stageIndex: number, variant: number, x: number, y: number, color: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    if (stageIndex <= 0) {
      if (variant === 0) {
        ctx.fillRect(x - 3, y - 26, 6, 26);
        ctx.beginPath(); ctx.arc(x, y - 30, 5, 0, Math.PI * 2); ctx.fill();
      } else if (variant === 1) {
        ctx.fillRect(x - 8, y - 8, 8, 8); ctx.fillRect(x, y - 8, 8, 8); ctx.fillRect(x - 4, y - 16, 8, 8);
      } else {
        ctx.beginPath(); ctx.arc(x, y - 12, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 4); ctx.stroke();
      }
    } else if (stageIndex === 1) {
      if (variant === 0) {
        ctx.fillRect(x - 12, y - 10, 24, 4); ctx.fillRect(x - 10, y - 6, 3, 10); ctx.fillRect(x + 7, y - 6, 3, 10);
      } else if (variant === 1) {
        ctx.strokeRect(x - 7, y - 24, 14, 24);
        ctx.beginPath(); ctx.moveTo(x - 7, y - 12); ctx.lineTo(x + 7, y - 12); ctx.stroke();
      } else {
        ctx.strokeRect(x - 6, y - 9, 12, 15);
      }
    } else if (stageIndex === 2) {
      if (variant === 0) {
        ctx.fillRect(x - 10, y - 18, 4, 18); ctx.fillRect(x + 6, y - 18, 4, 18); ctx.fillRect(x - 8, y - 14, 14, 3);
      } else if (variant === 1) {
        ctx.fillRect(x - 13, y - 8, 26, 3); ctx.fillRect(x - 11, y - 5, 3, 6); ctx.fillRect(x + 8, y - 5, 3, 6);
      } else {
        ctx.strokeRect(x - 7, y - 14, 14, 14);
        ctx.beginPath(); ctx.moveTo(x - 3, y - 14); ctx.lineTo(x - 3, y - 18); ctx.lineTo(x + 3, y - 18); ctx.lineTo(x + 3, y - 14); ctx.stroke();
      }
    } else if (stageIndex === 3) {
      if (variant === 0) {
        ctx.strokeRect(x - 8, y - 26, 16, 26);
      } else if (variant === 1) {
        ctx.beginPath(); ctx.ellipse(x, y - 8, 13, 5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillRect(x - 2, y - 6, 4, 8);
      } else {
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x, y - 18); ctx.lineTo(x + 4, y); ctx.stroke();
      }
    } else if (stageIndex === 4) {
      if (variant === 0) {
        ctx.strokeRect(x - 13, y - 15, 26, 15);
        ctx.beginPath(); ctx.moveTo(x, y - 15); ctx.lineTo(x, y); ctx.stroke();
      } else if (variant === 1) {
        ctx.fillRect(x - 9, y - 10, 18, 10); ctx.fillRect(x - 5, y - 13, 10, 3);
      } else {
        ctx.strokeRect(x - 7, y - 5, 14, 5); ctx.strokeRect(x - 6, y - 10, 12, 5); ctx.strokeRect(x - 5, y - 15, 10, 5);
      }
    } else {
      if (variant === 0) {
        ctx.beginPath();
        ctx.moveTo(x - 12, y); ctx.lineTo(x - 12, y - 14);
        ctx.moveTo(x + 12, y); ctx.lineTo(x + 12, y - 14);
        ctx.moveTo(x - 12, y - 12); ctx.lineTo(x + 12, y - 12);
        ctx.stroke();
      } else if (variant === 1) {
        ctx.strokeRect(x - 6, y - 8, 12, 8);
        ctx.beginPath(); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x - 6, y - 18); ctx.lineTo(x + 6, y - 18); ctx.stroke();
      } else {
        ctx.fillRect(x - 1.5, y - 24, 3, 24);
        ctx.beginPath(); ctx.arc(x, y - 27, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  private renderCoinDrops(): void {
    const ctx = this.ctx;
    for (const drop of this.coinDrops) {
      if (drop.life < 5 && Math.floor(drop.life * 6) % 2 === 0) continue;
      const radius = drop.value > 1 ? 5 : 3.5;
      ctx.fillStyle = '#d5b45d';
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8d6f3a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private renderWorldEntities(): void {
    const ctx = this.ctx;
    if (this.worldReward) {
      const { x, y, ttl, choices } = this.worldReward;
      const pulse = this.reducedMotion ? 0 : Math.floor(this.visualTime * 4) % 4;
      ctx.fillStyle = 'rgba(216,185,95,.14)';
      ctx.beginPath(); ctx.arc(x, y - 7, 42 + pulse, 0, Math.PI * 2); ctx.fill();
      const plinth = worldPlinthAtlas.slice('reward');
      if (plinth) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(plinth, Math.round(x - 24), Math.round(y - 16));
      } else {
        ctx.fillStyle = '#4b4032'; ctx.fillRect(x - 24, y - 4, 48, 9);
        ctx.fillStyle = '#2c2929'; ctx.fillRect(x - 19, y + 5, 38, 10);
      }
      const preview = choices[0];
      if (preview) this.drawItemSymbol(preview, x, y - 34 - pulse, 18);
      ctx.globalAlpha = 0.25 + pulse * 0.06;
      ctx.fillStyle = '#e0c46f';
      ctx.fillRect(Math.round(x - 1), Math.round(y - 68), 2, 26);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e5c96f'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('人生物证', x, y + 25);
      const ratio = this.clamp(ttl / 34, 0, 1);
      ctx.strokeStyle = '#d8b95f';
      ctx.beginPath(); ctx.arc(x, y - 9, 31, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2); ctx.stroke();
    }
    if (this.worldStall) {
      const { x, y } = this.worldStall;
      ctx.fillStyle = 'rgba(213,180,95,.12)';
      ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
      const stallSprite = worldEntityAtlas.slice('stall');
      if (stallSprite) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(stallSprite, Math.round(x - stallSprite.width / 2), Math.round(y + 8 - stallSprite.height));
      } else {
        ctx.fillStyle = '#2b2620'; ctx.fillRect(x - 20, y - 18, 40, 22);
        ctx.fillStyle = '#8d6f3a'; ctx.fillRect(x - 24, y - 26, 48, 8);
        ctx.fillStyle = '#d5b45f'; ctx.beginPath(); ctx.arc(x, y - 34, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#c9c3b8'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('摊位', x, y + 18);
    }
    if (this.worldDoor) {
      const { x, y, kind, ttl } = this.worldDoor;
      const warm = kind === 'light';
      ctx.fillStyle = warm ? 'rgba(216,185,95,.16)' : 'rgba(200,214,220,.12)';
      ctx.beginPath(); ctx.arc(x, y, 44 + Math.sin(ttl * 4) * 4, 0, Math.PI * 2); ctx.fill();
      const doorSprite = worldEntityAtlas.slice(warm ? 'door-light' : 'door-dark');
      if (doorSprite) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(doorSprite, Math.round(x - doorSprite.width / 2), Math.round(y + 8 - doorSprite.height));
      } else {
        ctx.fillStyle = warm ? '#3a3222' : '#23262b';
        ctx.fillRect(x - 14, y - 34, 28, 40);
        ctx.strokeStyle = warm ? '#d8b95f' : '#aeb9bf';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 14, y - 34, 28, 40);
        if (warm) {
          ctx.fillStyle = '#e8cd7e'; ctx.fillRect(x - 7, y - 24, 14, 12);
        } else {
          ctx.fillStyle = '#c8d4d8'; ctx.fillRect(x - 10, y - 30, 20, 4);
        }
      }
      ctx.fillStyle = warm ? '#e5c96f' : '#c3ccd1'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(warm ? '留灯间' : '里屋', x, y + 20);
      const ratio = this.clamp(ttl / 36, 0, 1);
      ctx.strokeStyle = warm ? '#d8b95f' : '#9fb3ba';
      ctx.beginPath(); ctx.arc(x, y - 12, 30, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2); ctx.stroke();
    }
  }

  private renderDarkness(): void {
    if (!this.darkActive) return;
    const ctx = this.ctx;
    const sx = HERO_SCREEN_X + (this.darkCX - this.heroX);
    const sy = HERO_SCREEN_Y + (this.darkCY - this.heroY);
    // Concentric stepped octagons make the final darkness feel like a pixel
    // iris closing, rather than a soft radial filter.
    const maxRadius = Math.max(24, Math.round(this.darkR));
    for (let step = 0; step < 7; step += 1) {
      const innerRadius = Math.round(maxRadius * (0.12 + step * 0.115));
      const alpha = Math.min(0.17, 0.045 + step * 0.022);
      ctx.fillStyle = `rgba(5,5,8,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      this.addPixelOctagonPath(ctx, sx, sy, innerRadius);
      ctx.fill('evenodd');
    }
    // 黑暗收拢的圆心是一盏路灯：收灯人正是在它底下出现
    const lamp = worldEntityAtlas.slice('lamp');
    if (lamp && this.darkR < 320) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(lamp, Math.round(sx - lamp.width / 2), Math.round(sy + 26 - lamp.height));
    }
  }

  private renderCaption(): void {
    if (this.captionTime <= 0 || !this.caption) return;
    const ctx = this.ctx;
    const alpha = this.clamp(this.captionTime > 6 ? (7 - this.captionTime) * 2 : this.captionTime / 1.2, 0, 1);
    const twoLines = this.caption.length > 17;
    const panelY = 96;
    const panelHeight = twoLines ? 35 : 25;
    ctx.save();
    ctx.globalAlpha = alpha * 0.82;
    drawCutCornerPanel(ctx, 38, panelY, W - 76, panelHeight, 'rgba(8,8,12,.68)', '#51494d', 2, 1);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.fillRect(44, panelY + 4, 18, 2);
    ctx.fillStyle = '#e8e1d3';
    ctx.textAlign = 'center';
    ctx.font = `bold 10px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(this.caption, 180, panelY + 17, W - 96, 14, 2);
    ctx.restore();
  }

  /** 免死演出：乳牙/遗照在主角头顶播帧；雪花屏全屏噪点闪；关服全屏收拢 */
  private renderSaveEffect(): void {
    const effect = this.saveEffect;
    if (!effect) return;
    const ctx = this.ctx;
    const progress = this.clamp(1 - effect.timer / effect.duration, 0, 0.999);
    ctx.save();
    if (effect.kind === 'static') {
      const pattern = uiTextures.pattern(ctx, 'static');
      const flicker = this.reducedMotion ? 0.62 : 0.58 + Math.sin(this.visualTime * 18) * 0.12;
      ctx.globalAlpha = (1 - progress) * flicker;
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = '#c8c8c8';
        for (let index = 0; index < 260; index += 1) {
          ctx.fillRect((index * 97 + Math.floor(this.visualTime * 900)) % W, (index * 53) % H, 2, 2);
        }
      }
    } else if (effect.kind === 'shutdown') {
      const frame = saveFrame('shutdown', progress);
      ctx.globalAlpha = 1 - progress * 0.4;
      ctx.fillStyle = '#040406';
      ctx.fillRect(0, 0, W, H);
      if (frame) {
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 1;
        ctx.drawImage(frame, 40, 180, 280, 280);
      }
    } else {
      const frame = saveFrame(effect.kind as SaveKind, progress);
      if (frame) {
        const size = 76;
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 1 - progress * progress;
        ctx.drawImage(frame, HERO_SCREEN_X - size / 2, HERO_SCREEN_Y - 66 - size / 2, size, size);
      }
    }
    ctx.restore();
  }

  private renderJoystick(): void {
    if (this.joyPointerId === -1) return;
    const ctx = this.ctx;
    const inputDistance = Math.hypot(this.joyDX, this.joyDY);
    const knobScale = inputDistance > JOYSTICK_KNOB_TRAVEL ? JOYSTICK_KNOB_TRAVEL / inputDistance : 1;
    const knobX = this.joyBaseX + this.joyDX * knobScale;
    const knobY = this.joyBaseY + this.joyDY * knobScale;
    ctx.save();
    // 摇杆皮肤：磨旧的石环与石钮；贴图未就绪走程序圆圈
    const base = joystickAtlas.slice(0);
    const cap = joystickAtlas.slice(1);
    if (base && cap) {
      ctx.globalAlpha = 0.5;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(base, this.joyBaseX - 38, this.joyBaseY - 38, 76, 76);
      ctx.globalAlpha = 0.75;
      ctx.drawImage(cap, knobX - 14, knobY - 14, 28, 28);
    } else {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#c9c3b6';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.joyBaseX, this.joyBaseY, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e8e1d3';
      ctx.beginPath(); ctx.arc(knobX, knobY, 12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private renderEdgeHint(x?: number, y?: number, color = '#ffffff'): void {
    if (x === undefined || y === undefined) return;
    const sx = HERO_SCREEN_X + (x - this.heroX);
    const sy = HERO_SCREEN_Y + (y - this.heroY);
    if (sx > 10 && sx < W - 10 && sy > 60 && sy < 566) return;
    const cx = this.clamp(sx, 16, W - 16);
    const cy = this.clamp(sy, 64, 560);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, 5 + Math.sin(this.battleTime * 5) * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private renderNearestThreatHint(): void {
    let nearest: EnemyUnit | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    let hasVisibleThreat = false;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.elite || enemy.boss) continue;
      const sx = HERO_SCREEN_X + (enemy.x - this.heroX);
      const sy = HERO_SCREEN_Y + (enemy.y - this.heroY);
      if (sx > 10 && sx < W - 10 && sy > 60 && sy < 566) {
        hasVisibleThreat = true;
        break;
      }
      const distance = Math.hypot(enemy.x - this.heroX, enemy.y - this.heroY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    }
    if (!hasVisibleThreat && nearest) this.renderEdgeHint(nearest.x, nearest.y, UI_PALETTE.oldRed);
  }

  private fillSteppedVertical(top: string, bottom: string, steps = 12): void {
    const ctx = this.ctx;
    const count = Math.max(2, Math.round(steps));
    for (let index = 0; index < count; index += 1) {
      const y0 = Math.floor((H * index) / count);
      const y1 = Math.floor((H * (index + 1)) / count);
      ctx.fillStyle = this.mixHex(top, bottom, index / Math.max(1, count - 1));
      ctx.fillRect(0, y0, W, y1 - y0);
    }
  }

  private addPixelOctagonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    const r = Math.max(4, Math.round(radius));
    const cut = Math.max(2, Math.round(r * 0.42));
    ctx.moveTo(Math.round(cx - r + cut), Math.round(cy - r));
    ctx.lineTo(Math.round(cx + r - cut), Math.round(cy - r));
    ctx.lineTo(Math.round(cx + r), Math.round(cy - r + cut));
    ctx.lineTo(Math.round(cx + r), Math.round(cy + r - cut));
    ctx.lineTo(Math.round(cx + r - cut), Math.round(cy + r));
    ctx.lineTo(Math.round(cx - r + cut), Math.round(cy + r));
    ctx.lineTo(Math.round(cx - r), Math.round(cy + r - cut));
    ctx.lineTo(Math.round(cx - r), Math.round(cy - r + cut));
    ctx.closePath();
  }

  private renderBackground(): void {
    const age = this.encounterIndex / Math.max(1, STAGES.length - 1);
    const top = age < 0.35 ? '#211a22' : age < 0.72 ? '#1d1b20' : '#1b1e22';
    this.fillSteppedVertical(top, '#0d0e12', 10);
    this.ctx.globalAlpha = 0.18;
    drawDeterministicWear(this.ctx, 0, 0, W, H, 41 + this.encounterIndex, 3, '#5a5450', 1);
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = 'rgba(6,7,10,.42)';
    this.ctx.fillRect(0, 438, W, H - 438);
  }

  private renderTitle(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    if (this.titleBackground.complete && this.titleBackground.naturalWidth > 0) {
      ctx.drawImage(this.titleBackground, 0, 0, W, H);
    } else {
      ctx.fillStyle = UI_PALETTE.night;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = 'rgba(7,7,10,.24)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('第 0001 号人生档案 · 尚未填写', 180, 30);

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.font = `bold 40px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('生', 225, 98);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 40px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('这一身', 180, 98);
    ctx.fillStyle = UI_PALETTE.paper;
    ctx.font = `11px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('这一生，最后都穿成了这一身。', 180, 128);
    drawStitchDivider(ctx, 74, 145, 212, 'horizontal', '#5b554f', 5, 4);

    this.drawHero(180, 345, 1.38, []);
    drawStatusIcon(ctx, 213, 305, 'breath-power', 1, UI_PALETTE.breath);
    drawLifeChapterTrack(ctx, 62, 420, 236, 8, 0, '降生|童年|少年|青年|成年|中年|老年|死亡', 0);

    drawCutCornerPanel(
      ctx, TITLE_START_RECT.x, TITLE_START_RECT.y, TITLE_START_RECT.width, TITLE_START_RECT.height,
      'rgba(12,12,17,.92)', UI_PALETTE.raincoatYellow, 3, 2,
    );
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 18px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('开始这一生', 180, 505);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('封皮尚未翻开', 180, 567);
  }

  private renderOrigin(): void {
    if (this.aiOriginState === 'requesting' || this.aiOriginState === 'idle' || !this.origin) {
      if (this.aiOriginState === 'error') this.renderOriginError();
      else this.renderOriginLoading();
      return;
    }
    const ctx = this.ctx;
    const origin = this.origin;
    const duration = this.originStoryDuration();
    const progress = this.clamp(this.originElapsed / duration, 0, 1);
    const storyText = origin.story.join('\n');
    const visibleCount = Math.floor(storyText.length * progress);
    const visible = storyText.slice(0, visibleCount);
    const traits = origin.traits.map((id) => getOriginTrait(id));

    applyPixelDiscipline(ctx);
    ctx.fillStyle = UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);
    drawArchiveFrame(ctx, 14, 14, 332, 612, UI_PALETTE.paper, UI_PALETTE.ink, UI_PALETTE.oldRed);
    drawPaperFold(ctx, 319, 17, 24, UI_PALETTE.paper, '#b8ad99', UI_PALETTE.ink);
    ctx.globalAlpha = 0.18;
    drawDeterministicWear(ctx, 20, 20, 320, 596, 701, 7, '#8f8577', 1);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 15px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('出生档案', 30, 47);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#5e574d';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`第 ${this.runSeed.toString(16).toUpperCase().padStart(8, '0')} 号`, 323, 46);
    drawStitchDivider(ctx, 29, 59, 302, 'horizontal', '#877d6e', 5, 3);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#514b43';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('外号', 30, 82);
    ctx.fillStyle = UI_PALETTE.ink;
    const identity = origin.nickname ? `《${origin.nickname}》` : origin.title;
    let identitySize = 23;
    do {
      ctx.font = `bold ${identitySize}px ${UI_ARCHIVE_FONT_STACK}`;
      if (ctx.measureText(identity).width <= 190) break;
      identitySize -= 1;
    } while (identitySize > 16);
    ctx.fillText(this.fitText(identity, 190), 30, 113);
    ctx.fillStyle = '#4d473f';
    ctx.font = `9px ${UI_FONT_STACK}`;
    this.wrapText(origin.nicknameReason || '正式名字还没留下，别人先替他叫出了声。', 30, 136, 190, 14, 3);

    ctx.save();
    ctx.globalAlpha = this.clamp((progress - 0.06) / 0.34, 0.08, 1);
    this.drawHero(274, 205, 1.22, []);
    ctx.restore();
    if (progress > 0.4) drawRedStamp(ctx, 257, 74, 56, 52, this.originBadgeGlyph(), 17, UI_PALETTE.oldRed);

    drawStitchDivider(ctx, 29, 237, 302, 'horizontal', '#877d6e', 5, 3);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.textAlign = 'left';
    ctx.fillText('外号的来处', 30, 258);
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `11px ${UI_ARCHIVE_FONT_STACK}`;
    const paragraphCount = storyText.split('\n').filter(Boolean).length;
    const paragraphLines = paragraphCount >= 4 ? 2 : 3;
    const paragraphStep = paragraphLines * 13 + 5;
    let lineY = 279;
    for (const paragraph of visible.split('\n').slice(0, 4)) {
      if (!paragraph) continue;
      this.wrapText(paragraph, 30, lineY, 296, 13, paragraphLines);
      lineY += paragraphStep;
    }

    drawStitchDivider(ctx, 29, 435, 302, 'horizontal', '#877d6e', 5, 3);
    ctx.fillStyle = '#514b43';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('故事留下的底色', 30, 456);
    const revealTraits = progress > 0.7;
    ctx.globalAlpha = revealTraits ? 1 : 0.22;
    if (!traits.length) {
      ctx.fillStyle = UI_PALETTE.ink;
      ctx.font = `bold 10px ${UI_FONT_STACK}`;
      ctx.fillText('出生那天，一切都是 1.00。', 30, 482);
    } else {
      traits.slice(0, 2).forEach((trait, index) => {
        const y = 480 + index * 48;
        const reason = origin.traitReasons?.[index] || trait.reason;
        ctx.fillStyle = trait.tone === 'positive' ? '#4f7565' : trait.tone === 'negative' ? UI_PALETTE.oldRed : '#725e3e';
        ctx.font = `bold 9px ${UI_FONT_STACK}`;
        ctx.fillText(`${trait.name} · ${trait.description}`, 30, y);
        ctx.fillStyle = '#5d574e';
      ctx.font = `9px ${UI_FONT_STACK}`;
      this.wrapText(reason, 30, y + 16, 294, 12, 2);
      });
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 11px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(this.originStoryComplete() ? '带着这副底色出门' : '故事仍在纸上落字', 180, 594);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.fillRect(128, 603, 104, 2);
  }

  private renderOriginLoading(): void {
    const ctx = this.ctx;
    const t = this.originElapsed;
    const fields = [
      ['出生时刻', '还没有人记住'],
      ['出生地点', '纸背后传来推车声'],
      ['家庭', '有人把门轻轻带上'],
      ['身体', '轮廓还没有长完整'],
      ['最早记忆', '第一件小事仍压在纸下'],
    ] as const;
    const activeLine = Math.min(fields.length - 1, Math.floor(t / 1.35));

    applyPixelDiscipline(ctx);
    ctx.fillStyle = UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 15px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('出生登记处', 30, 47);
    ctx.textAlign = 'right';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(this.originAttempt > 1 ? '重新登记中' : '档案仍在路上', 330, 46);
    drawLifeChapterTrack(ctx, 30, 69, 300, 8, 0, '降生|童年|少年|青年|成年|中年|老年|死亡', 0);

    fields.forEach(([label, value], index) => {
      const y = 118 + index * 58;
      const revealed = index <= activeLine;
      ctx.textAlign = 'left';
      ctx.fillStyle = revealed ? '#817a70' : '#444148';
      ctx.font = `8px ${UI_FONT_STACK}`;
      ctx.fillText(label, 30, y);
      ctx.fillStyle = revealed ? (index === activeLine ? UI_PALETTE.paperLight : UI_PALETTE.paperDim) : '#343238';
      ctx.font = index === activeLine ? `bold 10px ${UI_ARCHIVE_FONT_STACK}` : `9px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText(revealed ? value : '· · · · · · · ·', 95, y);
      drawStitchDivider(ctx, 30, y + 18, 300, 'horizontal', revealed ? '#4e4a4d' : '#2a292e', 4, 4);
    });

    const scaffoldTop = 424;
    ctx.fillStyle = '#24242a';
    for (let gy = 0; gy < 7; gy += 1) {
      for (let gx = 0; gx < 5; gx += 1) {
        if ((gx + gy * 3) % 4 !== Math.floor(t * 2) % 4) continue;
        ctx.fillRect(144 + gx * 18, scaffoldTop + gy * 14, 2, 2);
      }
    }
    ctx.strokeStyle = UI_PALETTE.hospitalBlueGrayDark;
    ctx.lineWidth = 1;
    ctx.strokeRect(143.5, scaffoldTop - 4.5, 74, 96);
    ctx.fillStyle = UI_PALETTE.hospitalBlueGray;
    const scanY = scaffoldTop + (Math.floor(t * 18) % 88);
    ctx.fillRect(145, scanY, 70, 1);

    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paper;
    ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('这一行出现时，等待已经成为他的童年。', 180, 550);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(this.originAttempt > 1 ? '上一页没赶上，登记处正在重写' : '登记的人还没把这一页递回来', 180, 582);
    drawRedStamp(
      ctx, 134, 598, 92, 28, '无法选择', 29,
      UI_PALETTE.oldRed, UI_PALETTE.paperLight, UI_PALETTE.night,
    );
  }

  private renderOriginError(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(7,8,12,.9)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#817b75'; ctx.font = '9px sans-serif'; ctx.fillText('出生 · 第一件无法选择的事', 180, 35);
    ctx.beginPath();
    ctx.arc(180, 208, 52, 0, Math.PI * 2);
    ctx.strokeStyle = '#75404a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#d8d0c3'; ctx.font = 'bold 19px sans-serif'; ctx.fillText('这一生还没有写下来', 180, 302);
    ctx.fillStyle = '#8f8a83'; ctx.font = '10px sans-serif'; ctx.fillText('没有使用兜底人物，也不会带着假故事开局。', 180, 336);
    this.panel(73, 395, 214, 70, '#a94559');
    ctx.fillStyle = '#f4eee2'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('点击重新生成', 180, 437);
    ctx.fillStyle = '#6f6c71'; ctx.font = '9px sans-serif'; ctx.fillText('Enter / 空格也可重试', 180, 501);
  }

  private renderFateEvent(): void {
    const event = this.currentFate;
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    ctx.fillStyle = UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);

    if (!event) {
      drawArchiveFrame(ctx, 34, 88, 292, 428, UI_PALETTE.paper, UI_PALETTE.ink, UI_PALETTE.oldRed);
      drawPaperFold(ctx, 301, 91, 22, UI_PALETTE.paper, '#b8ad99', UI_PALETTE.ink);
      ctx.globalAlpha = 0.16;
      drawDeterministicWear(ctx, 40, 94, 280, 416, 808, 7, '#897f71', 1);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.fillStyle = UI_PALETTE.ink;
      ctx.font = `bold 18px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('有件事正在发生', 180, 158);
      drawStitchDivider(ctx, 66, 184, 228, 'horizontal', '#82786a', 5, 4);
      ctx.fillStyle = '#6e675c';
      ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('事实还压在纸背后。', 180, 242);
      ctx.fillText('它出现时，就已经无法重写。', 180, 273);
      drawRedStamp(ctx, 137, 418, 86, 34, '尚未落字', 53, UI_PALETTE.oldRed);
      return;
    }

    const dealT = this.clamp(this.fateAnim / 0.55, 0, 1);
    const dealEase = 1 - Math.pow(1 - dealT, 3);
    const optionAlpha = this.clamp((this.fateAnim - 0.62) / 0.35, 0, 1);
    const armed = this.fateAnim >= 0.75;
    const dragRatio = this.clamp(this.fateDragX / 150, -1, 1);
    const committed = Math.abs(this.fateDragX) >= 96;
    const exiting = Boolean(this.fateResultDirection) && this.fateExitTimer > 0;
    const exitT = exiting ? 1 - this.fateExitTimer / 0.35 : 0;
    const inResult = Boolean(this.fateResultDirection) && this.fateExitTimer <= 0;

    if (inResult) {
      this.renderFateResultCard(event);
      return;
    }

    if (!this.fateResultDirection) {
      const leftAlpha = Math.max(0.1, -dragRatio) * optionAlpha;
      const rightAlpha = Math.max(0.1, dragRatio) * optionAlpha;
      ctx.fillStyle = `rgba(83,103,113,${leftAlpha * 0.36})`;
      ctx.fillRect(0, 0, W / 2, H);
      ctx.fillStyle = `rgba(126,53,63,${rightAlpha * 0.34})`;
      ctx.fillRect(W / 2, 0, W / 2, H);
    }

    const exitSign = this.fateResultDirection === 'swallow' ? -1 : 1;
    const cardX = 180 + this.fateDragX + (exiting ? exitSign * exitT * 430 : 0);
    const cardY = 292 - (1 - dealEase) * 320;
    const rotation = dragRatio * 0.075 + (1 - dealEase) * -0.14 + (exiting ? exitSign * exitT * 0.5 : 0);
    const cardAlpha = exiting ? 1 - exitT : 1;

    ctx.save();
    ctx.globalAlpha = cardAlpha;
    ctx.translate(cardX, cardY);
    ctx.rotate(rotation);
    const cardAccent = committed
      ? (dragRatio > 0 ? UI_PALETTE.oldRed : UI_PALETTE.hospitalBlueGray)
      : UI_PALETTE.oldRed;
    drawArchiveFrame(ctx, -144, -210, 288, 406, UI_PALETTE.paper, UI_PALETTE.ink, cardAccent);
    uiTextures.drawPanelFrame(ctx, -144, -210, 288, 406, 0.3);
    drawPaperFold(ctx, 118, -207, 22, UI_PALETTE.paper, '#b8ad99', UI_PALETTE.ink);
    ctx.globalAlpha = cardAlpha * 0.16;
    drawDeterministicWear(ctx, -137, -203, 274, 392, 301 + this.encounterIndex, 7, '#897f71', 1);
    ctx.globalAlpha = cardAlpha;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b6358';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`${AGE_LABELS[this.encounterIndex] ?? '这一生'} · 第 ${this.stats.fateChoices + 1} 次命运`, -96, -184);
    sceneArt.drawFateProfile(ctx, event.profile, -132, -200, 28, 0.9);
    drawRedStamp(ctx, 46, -198, 82, 24, '事实已落账', 19 + this.encounterIndex, UI_PALETTE.oldRed);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 18px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(event.title, 0, -137, 226, 22, 2);
    ctx.fillStyle = '#3f3a34';
    ctx.font = `11px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(event.fact, 0, -74, 232, 18, 7);
    drawStitchDivider(ctx, -112, 58, 224, 'horizontal', '#81786b', 5, 4);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(this.fateFactLine(event), 0, 82);

    if (this.fateFreeWaiting) {
      ctx.fillStyle = UI_PALETTE.ink;
      ctx.font = `bold 11px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('这句话已经说出口。', 0, 122);
      ctx.fillStyle = '#6b6358';
      ctx.font = `9px ${UI_FONT_STACK}`;
      ctx.fillText('现实正在决定它留下什么', 0, 143);
    } else {
      ctx.fillStyle = '#5e574e';
      ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('无论怎么回应，这一行都不会被擦掉。', 0, 126);
      if (committed) {
        ctx.fillStyle = dragRatio > 0 ? UI_PALETTE.oldRed : UI_PALETTE.hospitalBlueGray;
        ctx.font = `bold 11px ${UI_FONT_STACK}`;
        ctx.fillText(dragRatio > 0 ? '松手 · 吐出' : '松手 · 咽下', 0, 174);
      }
    }
    ctx.restore();

    if (!this.fateResultDirection && !this.fateFreeWaiting) {
      ctx.save();
      ctx.globalAlpha = optionAlpha;
      drawResponseMarker(
        ctx, 8, 510, 168, 'swallow', `咽下 · ${event.swallow.label}`,
        this.fateResponseMechanics(event.swallow),
      );
      drawResponseMarker(
        ctx, 184, 510, 168, 'exhale', `吐出 · ${event.exhale.label}`,
        this.fateResponseMechanics(event.exhale),
      );
      ctx.restore();
    }

    if (this.fateFreeWaiting && this.fateFreeWaitElapsed >= FATE_FREE_CANCEL_DELAY) {
      drawCutCornerPanel(
        ctx,
        FATE_FREE_CANCEL_RECT.x,
        FATE_FREE_CANCEL_RECT.y,
        FATE_FREE_CANCEL_RECT.width,
        FATE_FREE_CANCEL_RECT.height,
        UI_PALETTE.nightRaised,
        UI_PALETTE.paperDim,
        2,
        1,
      );
      uiTextures.drawButtonFrame(
        ctx,
        FATE_FREE_CANCEL_RECT.x,
        FATE_FREE_CANCEL_RECT.y,
        FATE_FREE_CANCEL_RECT.width,
        FATE_FREE_CANCEL_RECT.height,
        0.5,
      );
      ctx.textAlign = 'center';
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.font = `bold 9px ${UI_FONT_STACK}`;
      ctx.fillText('不等回声了', 180, FATE_FREE_CANCEL_RECT.y + 19);
    }

    if (!this.fateResultDirection && !this.fateFreeWaiting && armed) {
      ctx.save();
      ctx.globalAlpha = optionAlpha;
      drawCutCornerPanel(ctx, 105, 568, 150, 30, UI_PALETTE.nightRaised, UI_PALETTE.raincoatYellow, 2, 1);
      uiTextures.drawButtonFrame(ctx, 105, 568, 150, 30, 0.66);
      ctx.textAlign = 'center';
      ctx.fillStyle = UI_PALETTE.raincoatYellow;
      ctx.font = `bold 9px ${UI_FONT_STACK}`;
      ctx.fillText('✎ 亲口说', 180, 587);
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('事情不可重抽', 180, 625);
  }

  private renderFateResultCard(event: FateEvent): void {
    const ctx = this.ctx;
    const direction = this.fateResultDirection;
    if (!direction) return;
    const response = event[direction];
    const accent = direction === 'swallow' ? UI_PALETTE.hospitalBlueGray : UI_PALETTE.oldRed;
    const fadeIn = this.clamp((1.1 - this.fateResultMinTimer) / 0.3, 0, 1);
    applyPixelDiscipline(ctx);
    ctx.fillStyle = UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);
    drawLifeChapterTrack(ctx, 30, 72, 300, 8, this.encounterIndex + 1, '降生|童年|少年|青年|成年|中年|老年|死亡', 0);
    ctx.save();
    ctx.globalAlpha = fadeIn;
    drawArchiveFrame(ctx, 20, 184, 320, 258, UI_PALETTE.paper, UI_PALETTE.ink, accent);
    uiTextures.drawPanelFrame(ctx, 20, 184, 320, 258, 0.28);
    uiTextures.drawPaperEdge(ctx, 'receipt', 30, 425, 300, 17, 0.62);
    ctx.globalAlpha = fadeIn * 0.15;
    drawDeterministicWear(ctx, 27, 191, 306, 240, 930 + this.stats.fateChoices, 7, '#897f71', 1);
    ctx.globalAlpha = fadeIn;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b6358';
    ctx.font = `9px ${UI_FONT_STACK}`;
    sceneArt.drawFateProfile(ctx, event.profile, 31, 198, 28, 0.88);
    ctx.fillText(
      this.fitText(`${AGE_LABELS[this.encounterIndex] ?? '这一生'} · ${event.title}`, 164),
      66,
      214,
    );
    drawRedStamp(
      ctx, 246, 198, 80, 24,
      direction === 'swallow' ? '已经咽下' : '已经吐出',
      74, accent,
    );
    drawStitchDivider(ctx, 36, 233, 288, 'horizontal', '#81786b', 5, 4);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 16px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(`「${response.label}」`, 180, 265, 266, 19, 2);
    let cursorY = this.fatePlayerText ? 296 : 318;
    if (this.fatePlayerText) {
      ctx.fillStyle = '#715c35';
      ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
      this.wrapText(`你说：「${this.fatePlayerText}」`, 180, cursorY, 270, 14, 2);
      cursorY += 30;
    }
    ctx.fillStyle = '#3f3a34';
    ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(response.result, 180, cursorY, 276, 16, 4);
    drawStitchDivider(ctx, 56, 393, 248, 'horizontal', '#81786b', 5, 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#725e3e';
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText('留下', 48, 416);
    ctx.fillStyle = '#514b43';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(this.fitText(this.fateResponseMechanics(response), 230), 88, 416);
    ctx.restore();

    if (this.fateResultMinTimer <= 0) {
      drawCutCornerPanel(ctx, 90, 470, 180, 44, UI_PALETTE.nightRaised, accent, 2, 1);
      uiTextures.drawButtonFrame(ctx, 90, 470, 180, 44, 0.68);
      ctx.textAlign = 'center';
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('收好回执，继续走', 180, 497);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('回执正在落字', 180, 496);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('回应会留进身体，也会改变下一口气', 180, 602);
  }

  private renderBattle(): void {
    this.renderWorld();
    this.renderDarkness();
    this.renderVignette();
    this.renderJoystick();
    this.renderBattleOverlay();
    this.renderComboReveal();
    this.renderOriginBadge();
    this.renderHud();
    this.renderEdgeHint(this.worldDoor?.x, this.worldDoor?.y, this.worldDoor?.kind === 'light' ? '#e5c96f' : '#c3ccd1');
    this.renderEdgeHint(this.worldStall?.x, this.worldStall?.y, '#d5b45f');
    this.renderEdgeHint(this.worldReward?.x, this.worldReward?.y, '#e5c96f');
    for (const enemy of this.enemies) {
      if (!enemy.dead && (enemy.elite || enemy.boss)) this.renderEdgeHint(enemy.x, enemy.y, '#df5a69');
    }
    this.renderNearestThreatHint();
    this.renderCaption();
    this.renderEliteAlert();
    this.renderSaveEffect();
    this.renderChapterTransition();
    if (this.toastTime > 0 && this.toast) {
      const toastAlpha = this.clamp(this.toastTime / 0.32, 0, 1);
      this.ctx.save();
      this.ctx.globalAlpha = toastAlpha;
      drawCutCornerPanel(this.ctx, 68, 72, 224, 22, 'rgba(10,10,15,.74)', '#64545a', 2, 1);
      this.ctx.fillStyle = UI_PALETTE.raincoatYellow;
      this.ctx.fillRect(74, 76, 14, 2);
      this.ctx.fillStyle = '#e7e0d3';
      this.ctx.textAlign = 'center';
      this.ctx.font = `bold 9px ${UI_FONT_STACK}`;
      this.ctx.fillText(this.toast, 180, 87);
      this.ctx.restore();
    }
  }

  private renderEliteAlert(): void {
    if (this.eliteAlertTime <= 0 || !this.eliteAlertName) return;
    const ctx = this.ctx;
    const alpha = this.clamp(this.eliteAlertTime / 0.45, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(28,10,15,.9)';
    ctx.fillRect(48, 94, 264, 32);
    ctx.strokeStyle = '#b84255';
    ctx.strokeRect(49, 95, 262, 30);
    ctx.fillStyle = '#f0d8d9';
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`精英逼近 · ${this.eliteAlertName}`, 180, 115);
    ctx.restore();
  }

  private renderChapterTransition(): void {
    if (this.transitionTimer <= 0) return;
    const nextIndex = this.encounterIndex + 1;
    const next = STAGES[nextIndex];
    if (!next) return;
    const ctx = this.ctx;
    const progress = this.clamp(1 - this.transitionTimer / STAGE_TRANSITION_DURATION, 0, 1);
    const alpha = Math.min(1, progress / 0.16, (1 - progress) / 0.16);
    const wipe = this.clamp(progress / 0.72, 0, 1);
    const bridge = CHAPTER_BRIDGES[this.encounterIndex] ?? '旧的一页还没翻完，新的一页已经落下';
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    // Keep the world and the player visible. The next chapter grows through
    // the current one; this is a change of age, not a cut to a horror card.
    ctx.fillStyle = 'rgba(232,225,211,.055)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(17,17,22,.66)';
    ctx.fillRect(0, 216, W, 210);
    ctx.fillStyle = 'rgba(216,208,193,.08)';
    ctx.fillRect(0, 216, Math.round(W * wipe), 210);
    sceneArt.drawChapterStrip(ctx, nextIndex, 64, 228, 232, 174, 0.34);
    ctx.fillStyle = 'rgba(17,17,22,.22)';
    ctx.fillRect(64, 228, 232, 174);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.fillRect(0, 215, Math.round(W * wipe), 1);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.fillRect(W - Math.round(W * wipe), 426, Math.round(W * wipe), 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(`第 ${nextIndex + 1} 章 · 发生在他身上的事`, 180, 247);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 19px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(next.chapter, 180, 279);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.fillRect(118, 291, 124, 2);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `bold 10px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(next.title, 180, 311);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `10px ${UI_FONT_STACK}`;
    next.situation.forEach((line, lineIndex) => {
      ctx.fillText(this.fitText(line, 286), 180, 331 + lineIndex * 15);
    });
    ctx.fillStyle = 'rgba(201,183,124,.42)';
    ctx.fillRect(128, 366, 104, 1);
    ctx.fillStyle = '#c9b77c';
    ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(`这一章 · ${next.subtitle}`, 180, 385);
    ctx.fillStyle = '#c9b77c';
    ctx.globalAlpha *= 0.72;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(bridge, 180, 416);
    ctx.restore();
  }

  private originBadgeGlyph(): string {
    const source = this.origin?.nickname || this.origin?.title || '人';
    const skip = new Set(['小', '子', '儿', '老', '阿', '大', '的', '头', '哥', '弟', '妹', '姐', '《', '》']);
    for (const ch of source) if (!skip.has(ch)) return ch;
    return source[0] || '人';
  }

  private renderOriginBadge(): void {
    if (!this.origin) return;
    const ctx = this.ctx;
    const y = H - 102;
    const kindColor = this.origin.kind === 'harsh' ? '#9d4353' : this.origin.kind === 'favored' ? '#bda45d' : '#6e757d';
    ctx.fillStyle = 'rgba(14,14,19,.85)';
    ctx.fillRect(8, y, 32, 32);
    ctx.strokeStyle = kindColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(8.5, y + 0.5, 31, 31);
    ctx.fillStyle = '#e8e1d3';
    ctx.font = 'bold 16px serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.originBadgeGlyph(), 24, y + 22);
    const traits = this.origin.traits.map((id) => getOriginTrait(id));
    traits.forEach((trait, index) => {
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = trait.tone === 'positive' ? '#8fc0a5' : trait.tone === 'negative' ? '#d3707c' : '#b7b1a6';
      ctx.fillText(trait.tone === 'positive' ? '↑' : trait.tone === 'negative' ? '↓' : '·', 49 + index * 13, y + 22);
    });
    if (this.odBoost && this.odPenalty) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#d89cc2';
      ctx.font = '8px sans-serif';
      ctx.fillText(`失真 ${this.odBoost}↑ ${this.odPenalty}↓`, 8, y - 6);
    }
    if (this.originBadgeExpanded) {
      const panelHeight = 74 + (traits.length ? traits.length * 34 : 16);
      const panelY = y - panelHeight - 8;
      ctx.fillStyle = 'rgba(12,12,17,.95)';
      ctx.fillRect(8, panelY, 268, panelHeight);
      ctx.strokeStyle = kindColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(8.5, panelY + 0.5, 267, panelHeight - 1);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e2dbcf';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(`${this.origin.title}${this.origin.nickname ? ` ·《${this.origin.nickname}》` : ''}`, 16, panelY + 17);
      ctx.fillStyle = '#9a958d';
      ctx.font = '8px sans-serif';
      if (this.origin.nicknameReason) this.wrapText(this.origin.nicknameReason, 16, panelY + 32, 248, 11, 2);
      if (traits.length) {
        traits.forEach((trait, index) => {
          const rowY = panelY + 60 + index * 34;
          ctx.fillStyle = trait.tone === 'positive' ? '#8fc0a5' : trait.tone === 'negative' ? '#d3707c' : '#c4b98a';
          ctx.font = 'bold 8px sans-serif';
          ctx.fillText(`${trait.name} · ${trait.description}`, 16, rowY);
          ctx.fillStyle = '#9a958d';
          ctx.font = '8px sans-serif';
          const reason = this.origin?.traitReasons?.[index] || trait.reason;
          this.wrapText(reason, 16, rowY + 12, 248, 11, 2);
        });
      } else {
        ctx.fillStyle = '#77747a';
        ctx.fillText('普通人出身：出生那天一切是 1。之后的账，都是活出来的。', 16, panelY + 58);
      }
      const vectorNow = this.computeAttackVector();
      const normNow = (value: number, base: number) => (value / base).toFixed(2);
      ctx.fillStyle = '#c4b98a';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText(
        `现在：伤害${normNow(vectorNow.damage, BASE_VECTOR.damage)} · 射速${normNow(1 / vectorNow.fireInterval, 1 / BASE_VECTOR.fireInterval)} · 射程${normNow(vectorNow.range, BASE_VECTOR.range)} · 移速${(this.computeMoveSpeed() / HERO_BASE_SPEED).toFixed(2)}`,
        16, panelY + panelHeight - 12,
      );
    }
  }

  private renderVignette(): void {
    if (this.darkActive) return;
    const ctx = this.ctx;
    // Keep the edge falloff stepped so the scene stays in the same pixel
    // language as the sprites and archive UI.
    for (let band = 0; band < 4; band += 1) {
      const inset = band * 8;
      const alpha = 0.045 + band * 0.035;
      ctx.fillStyle = `rgba(8,8,12,${alpha.toFixed(3)})`;
      ctx.fillRect(inset, inset, W - inset * 2, 2);
      ctx.fillRect(inset, H - inset - 2, W - inset * 2, 2);
      ctx.fillRect(inset, inset, 2, H - inset * 2);
      ctx.fillRect(W - inset - 2, inset, 2, H - inset * 2);
    }
  }

  private renderBattleOverlay(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    const vector = this.computeAttackVector();
    const norm = (value: number, base: number) => (value / base).toFixed(2);
    drawCutCornerPanel(ctx, 54, 594, 246, 40, 'rgba(18,18,24,.9)', '#4d494d', 2, 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 9px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('《一口气》', 64, 608);
    drawStatusIcon(ctx, 113, 600, 'breath-power', 1, UI_PALETTE.breath);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.font = `bold 10px ${UI_FONT_STACK}`;
    ctx.fillText(`劲 ${norm(vector.damage, BASE_VECTOR.damage)}`, 127, 608);
    ctx.fillStyle = UI_PALETTE.hospitalBlueGray;
    ctx.fillText(`速 ${norm(1 / vector.fireInterval, 1 / BASE_VECTOR.fireInterval)}`, 187, 608);
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.fillText(`程 ${norm(vector.range, BASE_VECTOR.range)}`, 247, 608);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    const traits = [
      vector.pierce ? `穿${vector.pierce}` : '',
      vector.returning ? '回返' : '',
      vector.homing > 0.05 ? '追踪' : '',
      vector.splitChance > 0 ? `分裂${Math.round(vector.splitChance * 100)}%` : '',
      vector.explosion > 0 ? `范围${Math.round(vector.explosion)}` : '',
    ].filter(Boolean).join(' · ');
    ctx.fillText(traits || '月白核心仍在里面', 64, 627);

    ctx.textAlign = 'right';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(this.items.length ? `物证 ${this.items.length}` : '尚无物证', 350, 573);
    const visibleItems = this.items.slice(-6);
    visibleItems.forEach((id, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      this.drawItemSymbol(id, 314 + column * 18, 582 + row * 16, 6);
    });
  }

  private renderHud(): void {
    const ctx = this.ctx;
    const stage = STAGES[this.encounterIndex];
    const remain = stage ? Math.max(0, stage.duration - this.battleTime) : 0;
    applyPixelDiscipline(ctx);
    const hudFill = this.highContrastHud ? 'rgba(8,8,11,.98)' : 'rgba(16,16,21,.88)';
    const hudStroke = this.highContrastHud ? '#aaa297' : '#4a4649';
    drawCutCornerPanel(ctx, 6, 6, 126, 39, hudFill, hudStroke, 2, 1);
    drawStatusIcon(ctx, 12, 12, 'life', 1, UI_PALETTE.oldRed);
    this.bar(26, 11, 96, 7, this.hero.hp / this.hero.maxHp, UI_PALETTE.oldRed);
    this.bar(26, 22, 96, 3, this.hero.block / 24, UI_PALETTE.raincoatYellow);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 10px ${UI_FONT_STACK}`;
    ctx.fillText(`${Math.ceil(this.hero.hp)} / ${Math.round(this.hero.maxHp)}`, 26, 38);

    drawCutCornerPanel(ctx, 136, 6, 108, 39, hudFill, hudStroke, 2, 1);
    ctx.textAlign = 'center';
    const activeBoss = this.enemies.find((enemy) => !enemy.dead && enemy.boss);
    if (activeBoss) {
      ctx.font = `bold 10px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.fillText(this.fitText(activeBoss.name, 92), 190, 17);
      this.bar(147, 23, 86, 5, activeBoss.hp / activeBoss.maxHp, UI_PALETTE.oldRed);
      ctx.font = `9px ${UI_FONT_STACK}`;
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.fillText(`${Math.ceil(activeBoss.hp)} / ${Math.round(activeBoss.maxHp)}`, 190, 39);
    } else {
      ctx.font = `bold 10px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.fillText(AGE_LABELS[this.encounterIndex] || '', 190, 20);
      ctx.font = `9px ${UI_FONT_STACK}`;
      ctx.fillStyle = UI_PALETTE.paperDim;
      const combo = this.activeComboNames()[0];
      const mid = stage?.end === 'final' && this.darkActive
        ? '「到点了。」'
        : combo
          ? `《${combo}》`
          : `${stage?.title || ''} · ${Math.ceil(remain)}`;
      ctx.fillText(this.fitText(mid, 92), 190, 36);
    }

    // Pause owns the far-right 28px. Keep the resource panel separate so the
    // two controls do not visually merge on a narrow phone screen.
    drawCutCornerPanel(ctx, 248, 6, 74, 39, hudFill, hudStroke, 2, 1);
    drawStatusIcon(ctx, 257, 13, 'coins', 1, UI_PALETTE.raincoatYellow);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('零钱', 274, 18);
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.font = `bold 11px ${UI_FONT_STACK}`;
    ctx.fillText(String(this.hero.coins), 274, 36);

    drawLifeChapterTrack(ctx, 18, 52, 324, STAGES.length, this.encounterIndex, AGE_LABELS.join('|'), 0);
  }

  private renderPauseButton(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    ctx.save();
    ctx.fillStyle = 'rgba(10,10,14,.72)';
    ctx.fillRect(PAUSE_BUTTON_RECT.x + 1, PAUSE_BUTTON_RECT.y + 1, PAUSE_BUTTON_RECT.width - 2, PAUSE_BUTTON_RECT.height - 2);
    ctx.strokeStyle = this.highContrastHud ? UI_PALETTE.paperDim : '#5b565b';
    ctx.strokeRect(PAUSE_BUTTON_RECT.x + 1.5, PAUSE_BUTTON_RECT.y + 1.5, PAUSE_BUTTON_RECT.width - 3, PAUSE_BUTTON_RECT.height - 3);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.fillRect(PAUSE_BUTTON_RECT.x + 9, PAUSE_BUTTON_RECT.y + 12, 3, 14);
    ctx.fillRect(PAUSE_BUTTON_RECT.x + 16, PAUSE_BUTTON_RECT.y + 12, 3, 14);
    ctx.restore();
  }

  private renderPauseOverlay(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    ctx.save();
    ctx.fillStyle = 'rgba(5,5,8,.68)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(13,13,18,.97)';
    ctx.fillRect(118, 18, 242, 604);
    ctx.fillStyle = '#252229';
    ctx.fillRect(118, 18, 2, 604);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.fillRect(123, 18, 1, 604);
    uiTextures.drawArchiveDecoration(ctx, 'clip', 324, 24, 25, 0.52, 0.08);

    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 17px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('档案暂存', 136, 47);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText('世界夹在这一页，时间没有往前走。', 136, 67);
    drawStitchDivider(ctx, 132, 76, 204, 'horizontal', '#4d494d', 4, 3);

    const tabLabels = ['这一身', '出生', '命运', '设置'];
    tabLabels.forEach((label, index) => {
      const x = PAUSE_TAB_RECT.x + index * 51;
      const active = this.pauseTab === PAUSE_TABS[index];
      ctx.fillStyle = active ? '#2e2930' : '#18171c';
      ctx.fillRect(x, PAUSE_TAB_RECT.y, 49, PAUSE_TAB_RECT.height);
      ctx.fillStyle = active ? UI_PALETTE.oldRed : '#454147';
      ctx.fillRect(x, PAUSE_TAB_RECT.y + PAUSE_TAB_RECT.height - 2, 49, 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = active ? UI_PALETTE.paperLight : UI_PALETTE.paperDim;
      ctx.font = `bold 9px ${UI_FONT_STACK}`;
      ctx.fillText(label, x + 24, PAUSE_TAB_RECT.y + 19);
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(132, 126, 204, 390);
    ctx.clip();
    if (this.pauseTab === 'body') this.renderPauseBody();
    else if (this.pauseTab === 'origin') this.renderPauseOrigin();
    else if (this.pauseTab === 'fates') this.renderPauseFates();
    else this.renderPauseSettings();
    ctx.restore();

    drawCutCornerPanel(
      ctx, PAUSE_CONTINUE_RECT.x, PAUSE_CONTINUE_RECT.y, PAUSE_CONTINUE_RECT.width, PAUSE_CONTINUE_RECT.height,
      UI_PALETTE.nightRaised, UI_PALETTE.hospitalBlueGray, 2, 1,
    );
    uiTextures.drawButtonFrame(
      ctx, PAUSE_CONTINUE_RECT.x, PAUSE_CONTINUE_RECT.y, PAUSE_CONTINUE_RECT.width, PAUSE_CONTINUE_RECT.height, 0.68,
    );
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('继续往前走', 232, 557);

    const holdProgress = this.pauseEndHoldStarted > 0
      ? this.clamp((performance.now() - this.pauseEndHoldStarted) / 1000, 0, 1)
      : 0;
    ctx.fillStyle = '#17151a';
    ctx.fillRect(PAUSE_END_RECT.x, PAUSE_END_RECT.y, PAUSE_END_RECT.width, PAUSE_END_RECT.height);
    ctx.fillStyle = 'rgba(159,53,72,.42)';
    ctx.fillRect(PAUSE_END_RECT.x, PAUSE_END_RECT.y, Math.round(PAUSE_END_RECT.width * holdProgress), PAUSE_END_RECT.height);
    ctx.strokeStyle = '#5f3039';
    ctx.strokeRect(PAUSE_END_RECT.x + 0.5, PAUSE_END_RECT.y + 0.5, PAUSE_END_RECT.width - 1, PAUSE_END_RECT.height - 1);
    ctx.fillStyle = '#b6aca4';
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText('按住封存为未完', 232, 601);
    ctx.restore();
  }

  private renderPauseBody(): void {
    const ctx = this.ctx;
    const vector = this.computeAttackVector();
    const norm = (value: number, base: number) => (value / base).toFixed(2);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(`身上物证 · ${this.items.length}`, 138, 142);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(`劲 ${norm(vector.damage, BASE_VECTOR.damage)}`, 138, 164);
    ctx.fillText(`速 ${norm(1 / vector.fireInterval, 1 / BASE_VECTOR.fireInterval)}`, 205, 164);
    ctx.fillText(`程 ${norm(vector.range, BASE_VECTOR.range)}`, 270, 164);
    drawStitchDivider(ctx, 138, 178, 188, 'horizontal', '#4d494d', 4, 3);
    const visible = this.items.slice(-8).reverse();
    if (!visible.length) {
      ctx.fillStyle = '#77727a';
      ctx.font = `8px ${UI_ARCHIVE_FONT_STACK}`;
      this.wrapText('还没有什么穿在身上。', 138, 205, 188, 12, 2);
      return;
    }
    visible.forEach((id, index) => {
      const item = getItem(id);
      const y = 204 + index * 37;
      this.drawItemSymbol(id, 150, y + 8, 7);
      ctx.fillStyle = UI_PALETTE.paper;
      ctx.font = `bold 8px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText(item.name, 166, y + 7);
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `8px ${UI_FONT_STACK}`;
      this.wrapText(item.positive, 166, y + 18, 160, 10, 2);
    });
  }

  private renderPauseOrigin(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'left';
    if (!this.origin) {
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `8px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('出生档案还没有递回来。', 138, 148);
      return;
    }
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(this.origin.nickname ? `《${this.origin.nickname}》` : this.origin.title, 138, 148, 188, 15, 2);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    this.wrapText(this.origin.nicknameReason || this.origin.title, 138, 181, 188, 11, 3);
    drawStitchDivider(ctx, 138, 222, 188, 'horizontal', '#4d494d', 4, 3);
    let y = 244;
    for (const paragraph of this.origin.story) {
      ctx.fillStyle = '#c7c0b4';
      ctx.font = `8px ${UI_ARCHIVE_FONT_STACK}`;
      this.wrapText(paragraph, 138, y, 188, 12, 4);
      y += 58;
    }
    const traits = this.origin.traits.map((id) => getOriginTrait(id));
    drawStitchDivider(ctx, 138, y, 188, 'horizontal', '#4d494d', 4, 3);
    y += 21;
    if (!traits.length) {
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.fillText('出生那天，一切都是 1。', 138, y);
    } else {
      traits.forEach((trait, index) => {
        ctx.fillStyle = trait.tone === 'positive' ? UI_PALETTE.raincoatYellow : trait.tone === 'negative' ? UI_PALETTE.oldRed : UI_PALETTE.paperDim;
        ctx.font = `bold 8px ${UI_FONT_STACK}`;
        ctx.fillText(`${trait.name} · ${trait.description}`, 138, y + index * 20);
      });
    }
  }

  private renderPauseFates(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(`命运回执 · ${this.fateReceipts.length}`, 138, 142);
    const receipts = this.fateReceipts.slice(-4).reverse();
    if (!receipts.length) {
      ctx.fillStyle = '#77727a';
      ctx.font = `8px ${UI_ARCHIVE_FONT_STACK}`;
      this.wrapText('还没有哪件事盖进这一页。', 138, 174, 188, 12, 2);
      return;
    }
    receipts.forEach((receipt, index) => {
      const y = 168 + index * 78;
      ctx.fillStyle = receipt.direction === 'swallow' ? UI_PALETTE.hospitalBlueGray : UI_PALETTE.oldRed;
      ctx.fillRect(138, y - 11, 3, 58);
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.font = `bold 9px ${UI_ARCHIVE_FONT_STACK}`;
      this.wrapText(receipt.event.title, 150, y, 176, 12, 2);
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `8px ${UI_FONT_STACK}`;
      this.wrapText(receipt.result, 150, y + 27, 176, 10, 3);
    });
  }

  private renderPauseSettings(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText('声音与显示', 142, 144);
    this.renderPauseVolume();
    this.renderPauseToggle(PAUSE_SETTING_HAPTICS_RECT, '振动', this.feedback.hapticsEnabled());
    this.renderPauseToggle(PAUSE_SETTING_MOTION_RECT, '减少动态', this.reducedMotion);
    this.renderPauseToggle(PAUSE_SETTING_CONTRAST_RECT, '高对比 HUD', this.highContrastHud);
    drawStitchDivider(ctx, 142, 376, 180, 'horizontal', '#4d494d', 4, 3);
    ctx.fillStyle = '#8d8783';
    ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText('声音像纸页和呼吸，不替他解释这一生。', 142, 402, 180, 12, 3);
  }

  private renderPauseVolume(): void {
    const ctx = this.ctx;
    const rect = PAUSE_SETTING_VOLUME_RECT;
    const volume = this.feedback.getVolume();
    const trackX = rect.x + 78;
    const trackY = rect.y + 18;
    const trackWidth = rect.width - 92;
    ctx.fillStyle = '#19181d';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = volume > 0 ? UI_PALETTE.raincoatYellow : '#48444a';
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(volume > 0 ? '声音' : '静音', rect.x + 12, rect.y + 24);
    ctx.fillStyle = '#4a4649';
    ctx.fillRect(trackX, trackY, trackWidth, 3);
    ctx.fillStyle = volume > 0 ? UI_PALETTE.raincoatYellow : '#555159';
    ctx.fillRect(trackX, trackY, Math.max(volume > 0 ? 2 : 0, Math.round(trackWidth * volume)), 3);
    ctx.fillStyle = volume > 0 ? UI_PALETTE.paperLight : '#858087';
    ctx.fillRect(Math.round(trackX + trackWidth * volume) - 3, trackY - 4, 6, 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(`${Math.round(volume * 100)}%`, rect.x + rect.width - 10, rect.y + 34);
  }

  private renderPauseToggle(rect: { x: number; y: number; width: number; height: number }, label: string, active: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#19181d';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = active ? UI_PALETTE.hospitalBlueGray : '#48444a';
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(label, rect.x + 12, rect.y + 24);
    ctx.fillStyle = active ? UI_PALETTE.hospitalBlueGray : '#555159';
    ctx.fillRect(rect.x + rect.width - 42, rect.y + 12, 28, 14);
    ctx.fillStyle = active ? UI_PALETTE.paperLight : '#858087';
    ctx.fillRect(rect.x + rect.width - (active ? 26 : 39), rect.y + 14, 10, 10);
  }

  private renderEnemies(): void {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      this.renderBossTelegraph(enemy);
      this.drawEnemy(enemy);
      const marked = enemy.elite || enemy.boss;
      if (marked || enemy.hp < enemy.maxHp) {
        const barWidth = marked ? 50 : 26;
        this.bar(enemy.x - barWidth / 2, enemy.y + enemy.radius + 7, barWidth, marked ? 5 : 3, enemy.hp / enemy.maxHp, marked ? '#d64e5e' : '#9d3d4b');
      }
      if (enemy.elite && !enemy.boss) {
        this.ctx.fillStyle = '#c9c3b9';
        this.ctx.font = 'bold 8px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(enemy.name, enemy.x, enemy.y + enemy.radius + 22);
      }
      // 状态标记：冻结/挂账（已读）小图标浮在头顶
      if (statusAtlas.ready) {
        const marks: string[] = [];
        if ((enemy.slowTimer ?? 0) > 0) marks.push('freeze');
        if ((enemy.paralyzeTimer ?? 0) > 0) marks.push('paralyze');
        if ((enemy.readTimer ?? 0) > 0) marks.push('read');
        if ((enemy.loopTimer ?? 0) > 0) marks.push('loop');
        marks.forEach((mark, order) => {
          const icon = statusAtlas.named(mark);
          if (!icon) return;
          this.ctx.save();
          this.ctx.globalAlpha = 0.9;
          this.ctx.imageSmoothingEnabled = false;
          this.ctx.drawImage(icon, enemy.x - 6 + (order - (marks.length - 1) / 2) * 14, enemy.y - enemy.radius - 20, 12, 12);
          this.ctx.restore();
        });
      }
    }
    for (const death of this.enemyDeaths) {
      this.pixelEnemies.drawDeath(this.ctx, {
        asset: death.asset,
        x: death.x,
        y: death.y,
        radius: death.radius,
        progress: 1 - death.life / death.duration,
        faceLeft: death.faceLeft,
      });
    }
  }

  private drawPixelWarningRing(
    x: number,
    y: number,
    radius: number,
    color: string,
    alpha: number,
    completion = 1,
    segments = 28,
  ): void {
    const ctx = this.ctx;
    const count = Math.max(1, Math.floor(segments * this.clamp(completion, 0, 1)));
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    for (let index = 0; index < count; index += 1) {
      const angle = -Math.PI / 2 + (index / segments) * Math.PI * 2;
      const size = index % 4 === 0 ? 4 : 3;
      ctx.fillRect(
        Math.round(x + Math.cos(angle) * radius - size / 2),
        Math.round(y + Math.sin(angle) * radius - size / 2),
        size,
        size,
      );
    }
    ctx.restore();
  }

  private drawPixelWarningRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    alpha: number,
  ): void {
    const ctx = this.ctx;
    const sx = Math.round(x);
    const sy = Math.round(y);
    const sw = Math.max(12, Math.round(width));
    const sh = Math.max(12, Math.round(height));
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * 0.12;
    ctx.fillRect(sx + 3, sy + 3, sw - 6, sh - 6);
    ctx.globalAlpha = alpha;
    for (let dx = 0; dx < sw; dx += 10) {
      const dash = Math.min(6, sw - dx);
      ctx.fillRect(sx + dx, sy, dash, 2);
      ctx.fillRect(sx + dx, sy + sh - 2, dash, 2);
    }
    for (let dy = 0; dy < sh; dy += 10) {
      const dash = Math.min(6, sh - dy);
      ctx.fillRect(sx, sy + dy, 2, dash);
      ctx.fillRect(sx + sw - 2, sy + dy, 2, dash);
    }
    ctx.globalAlpha = Math.min(1, alpha + 0.18);
    ctx.fillRect(sx, sy, 7, 3);
    ctx.fillRect(sx, sy, 3, 7);
    ctx.fillRect(sx + sw - 7, sy, 7, 3);
    ctx.fillRect(sx + sw - 3, sy, 3, 7);
    ctx.fillRect(sx, sy + sh - 3, 7, 3);
    ctx.fillRect(sx, sy + sh - 7, 3, 7);
    ctx.fillRect(sx + sw - 7, sy + sh - 3, 7, 3);
    ctx.fillRect(sx + sw - 3, sy + sh - 7, 3, 7);
    ctx.restore();
  }

  private renderBossTelegraph(enemy: EnemyUnit): void {
    if (!enemy.boss) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if ((enemy.phaseFlashTimer ?? 0) > 0) {
      const duration = enemy.type === 'silent-father' ? 1.2 : 1.1;
      const progress = 1 - this.clamp((enemy.phaseFlashTimer ?? 0) / duration, 0, 1);
      const radius = enemy.radius + 14 + progress * 72;
      const color = enemy.type === 'silent-father' ? '#d2b35f' : '#74647e';
      this.drawPixelWarningRing(enemy.x, enemy.y, radius, color, 1 - progress, 1, 32);
      ctx.fillStyle = color;
      ctx.globalAlpha = (1 - progress) * 0.7;
      for (let index = 0; index < 7; index += 1) {
        const angle = (index / 7) * Math.PI * 2 + progress * 0.35;
        for (let step = 0; step < 4; step += 1) {
          const distance = enemy.radius + 8 + step * Math.max(6, (radius - enemy.radius - 8) / 4);
          ctx.fillRect(
            Math.round(enemy.x + Math.cos(angle) * distance - 1),
            Math.round(enemy.y + Math.sin(angle) * distance - 1),
            3,
            3,
          );
        }
      }
    }

    if (enemy.type === 'uniform-answer' && (enemy.mechTimer ?? 0) > 6.4) {
      const progress = this.clamp(((enemy.mechTimer ?? 0) - 6.4) / 1.6, 0, 1);
      const alpha = 0.38 + progress * 0.5;
      for (let index = 0; index < 3; index += 1) {
        const x = enemy.x - 40 + index * 40;
        const y = enemy.y + 34;
        const size = 18 + progress * 8;
        this.drawPixelWarningRect(x - size, y - size, size * 2, size * 2, '#d05063', alpha);
        ctx.fillStyle = '#d05063';
        ctx.globalAlpha = alpha * 0.72;
        for (let offset = -8; offset <= 8; offset += 4) {
          ctx.fillRect(Math.round(x + offset - 1), Math.round(y + offset - 1), 3, 3);
          ctx.fillRect(Math.round(x - offset - 1), Math.round(y + offset - 1), 3, 3);
        }
      }
    }

    if (enemy.type === 'last-bus' && (enemy.phase ?? 0) === 1) {
      const progress = this.clamp((enemy.mechTimer ?? 0) / 0.8, 0, 1);
      const angle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.2 + progress * 0.58;
      ctx.fillStyle = '#b74958';
      for (let distance = 12; distance < 390; distance += 18) {
        ctx.fillRect(distance, -28, 11, 3);
        ctx.fillRect(distance, 25, 11, 3);
      }
      for (let distance = 42; distance < 390; distance += 46) {
        ctx.fillRect(distance, -5, 18, 10);
      }
      ctx.globalAlpha = 0.08 + progress * 0.1;
      ctx.fillRect(12, -25, 390, 50);
      ctx.restore();
      return;
    }

    if (enemy.type === 'debt-collector' && (enemy.mechTimer ?? 0) > 5.5) {
      const progress = this.clamp(((enemy.mechTimer ?? 0) - 5.5) / 1.5, 0, 1);
      const alpha = 0.34 + progress * 0.52;
      const width = 74 + progress * 12;
      const height = 42 + progress * 8;
      this.drawPixelWarningRect(
        this.heroX - width / 2,
        this.heroY - height / 2,
        width,
        height,
        '#d4865e',
        alpha,
      );
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillStyle = '#d4865e';
      ctx.fillRect(this.heroX - width / 2 + 8, this.heroY - 3, width - 16, 2);
      ctx.fillRect(this.heroX - width / 2 + 8, this.heroY + 7, width * 0.56, 2);
      const segments = 10;
      for (let index = 1; index < segments; index += 2) {
        const ratio = index / segments;
        ctx.fillRect(
          enemy.x + (this.heroX - enemy.x) * ratio - 2,
          enemy.y + (this.heroY - enemy.y) * ratio - 1,
          4,
          2,
        );
      }
    }

    if (enemy.type === 'lamp-keeper' && (enemy.mechTimer ?? 0) > 8.2) {
      const progress = this.clamp(((enemy.mechTimer ?? 0) - 8.2) / 1.8, 0, 1);
      const radius = Math.max(70, this.darkR - progress * 10);
      this.drawPixelWarningRing(
        this.darkCX,
        this.darkCY,
        radius,
        '#d5bd73',
        0.24 + progress * 0.52,
        1,
        36,
      );
      ctx.fillStyle = '#d5bd73';
      for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        const tickRadius = radius - 4 - (index % 2) * 4;
        ctx.fillRect(
          Math.round(this.darkCX + Math.cos(angle) * tickRadius - 2),
          Math.round(this.darkCY + Math.sin(angle) * tickRadius - 2),
          4,
          4,
        );
      }
    }

    ctx.restore();
  }

  private drawEnemy(enemy: EnemyUnit): void {
    const ctx = this.ctx;
    const r = enemy.radius;
    const contactDistance = Math.hypot(this.heroX - enemy.x, this.heroY - enemy.y);
    const warningWindow = enemy.boss ? 0.9 : enemy.elite ? 0.65 : 0.32;
    const attacking = contactDistance <= enemy.radius + 17 && enemy.attackCooldown <= warningWindow;
    const attackProgress = attacking
      ? 1 - this.clamp(enemy.attackCooldown / warningWindow, 0, 1)
      : 0;
    // Dark canonical sprites need a quiet landing mark on the floor. Four
    // square corners read as a pixel halo and keep silhouettes legible without
    // adding a smooth glow.
    const haloColor = enemy.boss ? 'rgba(214,177,91,.20)' : enemy.elite ? 'rgba(194,86,99,.16)' : 'rgba(190,188,174,.09)';
    ctx.save();
    ctx.fillStyle = haloColor;
    const hx = Math.round(enemy.x - r - 4);
    const hy = Math.round(enemy.y - r - 4);
    const hw = Math.round(r * 2 + 8);
    ctx.fillRect(hx, hy, 3, 2);
    ctx.fillRect(hx + hw - 3, hy, 3, 2);
    ctx.fillRect(hx, hy + hw - 2, 3, 2);
    ctx.fillRect(hx + hw - 3, hy + hw - 2, 3, 2);
    ctx.fillStyle = 'rgba(5,5,8,.34)';
    ctx.fillRect(Math.round(enemy.x - r - 3), Math.round(enemy.y + r - 1), Math.round(r * 2 + 6), 3);
    ctx.restore();
    const pixelDrawn = this.pixelEnemies.draw(
      ctx,
      enemy,
      attacking,
      attackProgress,
      this.heroX < enemy.x,
    );
    ctx.save();
    ctx.translate(enemy.x, enemy.y + (pixelDrawn ? 0 : Math.sin(enemy.age * 3) * 2));
    if (enemy.elite || enemy.boss) {
      this.drawPixelWarningRing(
        0,
        0,
        r + 8 + Math.sin(enemy.age * 4) * 2,
        enemy.boss ? '#d0b264' : '#c5485b',
        0.45 + (Math.sin(enemy.age * 5) + 1) * 0.18,
        1,
        enemy.boss ? 28 : 20,
      );
    }
    if (attacking) {
      this.drawPixelWarningRing(
        0,
        0,
        r + 4,
        '#ea5365',
        0.35 + attackProgress * 0.55,
        attackProgress,
        20,
      );
    }
    if (pixelDrawn) {
      ctx.restore();
      return;
    }
    if (enemy.flash > 0) ctx.globalAlpha = 0.5;
    if (enemy.type === 'fear') {
      ctx.fillStyle = '#15141b';
      ctx.beginPath();
      ctx.ellipse(0, 3, r, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8d0c1';
      ctx.beginPath(); ctx.arc(-5, -3, 2, 0, Math.PI * 2); ctx.arc(5, -3, 2, 0, Math.PI * 2); ctx.fill();
    } else if (enemy.type === 'red-mark') {
      ctx.fillStyle = '#d8d2c5';
      ctx.fillRect(-r * 0.72, -r, r * 1.44, r * 2);
      ctx.strokeStyle = '#a63649';
      ctx.lineWidth = Math.max(3, r * 0.16);
      const cross = r * 0.48;
      ctx.beginPath(); ctx.moveTo(-cross, -cross); ctx.lineTo(cross, cross); ctx.moveTo(cross, -cross); ctx.lineTo(-cross, cross); ctx.stroke();
    } else if (enemy.type === 'whisper') {
      ctx.fillStyle = '#6e526c';
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.76, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#15141b';
      ctx.beginPath(); ctx.ellipse(0, 2, r * 0.62, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6e526c'; ctx.beginPath(); ctx.moveTo(4, r * 0.6); ctx.lineTo(10, r); ctx.lineTo(-2, r * 0.65); ctx.fill();
    } else if (enemy.type === 'clockwork') {
      ctx.strokeStyle = '#a58b62';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke();
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * r * 0.68, Math.sin(angle) * r * 0.68); ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r); ctx.stroke();
      }
      ctx.fillStyle = '#c8b078'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    } else if (enemy.type === 'debt') {
      ctx.fillStyle = '#d7d0c2';
      ctx.fillRect(-r * 0.75, -r, r * 1.5, r * 1.9);
      ctx.strokeStyle = '#90525e'; ctx.lineWidth = 2;
      for (let y = -r * 0.65; y < r * 0.65; y += 7) { ctx.beginPath(); ctx.moveTo(-r * 0.5, y); ctx.lineTo(r * 0.5, y); ctx.stroke(); }
      ctx.fillStyle = '#9d394a'; ctx.font = `bold ${r * 0.7}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('¥', 0, 6);
    } else if (enemy.type === 'silent-father') {
      ctx.fillStyle = '#777044';
      ctx.beginPath(); ctx.moveTo(-r * 0.9, r); ctx.lineTo(-r * 0.65, -r * 0.25); ctx.quadraticCurveTo(0, -r, r * 0.65, -r * 0.25); ctx.lineTo(r * 0.9, r); ctx.fill();
      ctx.fillStyle = '#242329'; ctx.beginPath(); ctx.arc(0, -r * 0.58, r * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#bda34f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -r * 0.6, r * 0.65, Math.PI, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = '#15151b';
      ctx.beginPath(); ctx.moveTo(-r, r); ctx.quadraticCurveTo(-r * 0.55, -r * 1.2, 0, -r); ctx.quadraticCurveTo(r * 0.55, -r * 1.2, r, r); ctx.fill();
      ctx.strokeStyle = '#d0b264'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -r * 0.15, r * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#d0b264'; ctx.beginPath(); ctx.arc(0, -r * 0.15, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawHero(
    x: number,
    y: number,
    scale: number,
    equipped: ItemId[],
    facing: HeroFacing = 'front',
    motion: 'idle' | 'walk' | 'attack' | 'hurt' = 'idle',
    actionFrame?: 0 | 1,
  ): void {
    const appearance = this.state === 'title' ? DEFAULT_APPEARANCE : (this.origin?.appearance ?? DEFAULT_APPEARANCE);
    const resultAge = this.resultWon ? 5 : this.encounterIndex;
    const ageStep = Math.max(0, Math.min(5, this.state === 'result' ? resultAge : this.encounterIndex)) as 0 | 1 | 2 | 3 | 4 | 5;
    const frame = actionFrame ?? (this.reducedMotion ? 0 : Math.floor(this.visualTime * 6) % 4) as 0 | 1 | 2 | 3;
    // 《他当年也是这样站着的》：身后浮现同样弯腰的父亲轮廓
    if (this.state === 'battle' && this.hasCombo('他当年也是这样站着的')) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = this.reducedMotion ? 0.2 : 0.18 + Math.sin(this.visualTime * 1.4) * 0.04;
      ctx.fillStyle = '#1b1a20';
      const fx = x - 8;
      const fy = y - 2;
      ctx.beginPath();
      ctx.ellipse(fx, fy - 34 * scale, 8 * scale, 9 * scale, 0.35, 0, Math.PI * 2);
      ctx.ellipse(fx - 2, fy - 16 * scale, 10 * scale, 18 * scale, 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.pixelHero.draw(this.ctx, x, y, scale, {
      appearance,
      ageStep,
      items: equipped,
      facing,
      motion,
      frame,
    });
  }

  private drawHeroVectorReference(x: number, y: number, scale: number, equipped: ItemId[]): void {
    const ctx = this.ctx;
    const owns = (id: ItemId) => equipped.includes(id);
    const dna: AppearanceDNA = this.state === 'title' ? DEFAULT_APPEARANCE : (this.origin?.appearance ?? DEFAULT_APPEARANCE);
    const age = this.state === 'result' && this.resultWon ? 1 : this.clamp(this.encounterIndex / (STAGES.length - 1), 0, 1);
    const skinColors: Record<AppearanceDNA['skinTone'], string> = {
      paper: '#c7b9a6', warm: '#b9ab98', cool: '#afa9a4', brown: '#9b7d68', deep: '#765b50',
    };
    const hairColors: Record<AppearanceDNA['hairColor'], string> = { ink: '#242328', brown: '#493b36', soft_black: '#333136' };
    const outfitColors: Record<AppearanceDNA['outfit'], string> = {
      undershirt: '#8a8178', old_sweater: '#68666a', uniform_liner: '#596974', plain_shirt: '#77716c',
    };
    const buildWidth = { slim: 0.84, average: 1, sturdy: 1.18, soft: 1.08 }[dna.bodyBuild];
    const faceRatio = {
      round: [1, 1], long: [0.9, 1.15], square: [1.08, 0.98], narrow: [0.82, 1.08],
    }[dna.faceShape] as [number, number];
    const postureLean = { upright: -1, guarded: 2, alert: -2, slight_slouch: 5 }[dna.posture];
    const burden = (owns('stone-schoolbag') ? 7 : 0) + (owns('fathers-raincoat') ? 3 : 0) + age * 5 + postureLean;
    const headX = x + burden * scale * 0.42;
    const headY = y - (51 - age * 5 - Math.max(0, postureLean) * 0.35) * scale;
    const headRX = (14 - age * 1.5) * faceRatio[0] * scale;
    const headRY = (14 - age * 1.5) * faceRatio[1] * scale;
    const shoulder = 18 * buildWidth * scale;
    const limbWidth = (dna.bodyBuild === 'slim' ? 5.8 : dna.bodyBuild === 'sturdy' ? 8.1 : 7) * scale;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 26 * scale, 29 * scale, 7 * scale, 0, 0, Math.PI * 2); ctx.fill();
    if (owns('empty-frame')) {
      ctx.strokeStyle = '#72533b'; ctx.lineWidth = 4 * scale; ctx.strokeRect(x - 27 * scale, y - 49 * scale, 54 * scale, 65 * scale);
    }
    if (owns('wooden-sword')) {
      ctx.strokeStyle = '#8e6844'; ctx.lineWidth = 5 * scale; ctx.beginPath(); ctx.moveTo(x - 22 * scale, y + 18 * scale); ctx.lineTo(x + 17 * scale, y - 52 * scale); ctx.stroke();
      ctx.lineWidth = 3 * scale; ctx.beginPath(); ctx.moveTo(x + 7 * scale, y - 38 * scale); ctx.lineTo(x + 23 * scale, y - 29 * scale); ctx.stroke();
    }
    if (owns('stone-schoolbag')) {
      ctx.fillStyle = '#625c56'; ctx.strokeStyle = '#93877a'; ctx.lineWidth = 2 * scale;
      ctx.beginPath(); ctx.roundRect(x - 30 * scale, y - 39 * scale, 34 * scale, 48 * scale, 7 * scale); ctx.fill(); ctx.stroke();
      for (let index = 0; index < 4; index += 1) { ctx.fillStyle = '#85807a'; ctx.beginPath(); ctx.arc(x - 21 * scale + index * 7 * scale, y - 28 * scale, 4 * scale, 0, Math.PI * 2); ctx.fill(); }
    }
    if (owns('red-workbook')) {
      ctx.fillStyle = '#d0c5b1'; ctx.fillRect(x + 13 * scale, y - 36 * scale, 22 * scale, 31 * scale);
      ctx.strokeStyle = '#a23b48'; ctx.lineWidth = 2 * scale;
      ctx.beginPath(); ctx.moveTo(x + 17 * scale, y - 28 * scale); ctx.lineTo(x + 30 * scale, y - 13 * scale); ctx.moveTo(x + 30 * scale, y - 28 * scale); ctx.lineTo(x + 17 * scale, y - 13 * scale); ctx.stroke();
    }

    ctx.strokeStyle = skinColors[dna.skinTone];
    ctx.lineWidth = limbWidth;
    ctx.beginPath(); ctx.moveTo(x - shoulder * 0.5, y - 17 * scale); ctx.lineTo(x - 13 * scale, y + 18 * scale); ctx.moveTo(x + shoulder * 0.5, y - 17 * scale); ctx.lineTo(x + 14 * scale, y + 18 * scale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 7 * scale, y + 12 * scale); ctx.lineTo(x - 10 * scale, y + 36 * scale); ctx.moveTo(x + 7 * scale, y + 12 * scale); ctx.lineTo(x + 10 * scale, y + 36 * scale); ctx.stroke();
    ctx.fillStyle = owns('small-uniform') ? '#526979' : outfitColors[dna.outfit];
    ctx.beginPath(); ctx.roundRect(x - shoulder, y - 34 * scale, shoulder * 2, 49 * scale, (dna.bodyBuild === 'sturdy' ? 5 : 8) * scale); ctx.fill();
    if (dna.outfit === 'undershirt') { ctx.strokeStyle = '#b6aa9a'; ctx.lineWidth = 1.2 * scale; ctx.beginPath(); ctx.arc(x, y - 31 * scale, 7 * scale, 0, Math.PI); ctx.stroke(); }
    if (dna.outfit === 'old_sweater') { ctx.strokeStyle = '#4e4d52'; ctx.lineWidth = 1 * scale; for (let row = 0; row < 3; row += 1) { ctx.beginPath(); ctx.moveTo(x - shoulder * 0.75, y - 20 * scale + row * 10 * scale); ctx.lineTo(x + shoulder * 0.75, y - 20 * scale + row * 10 * scale); ctx.stroke(); } }
    if (dna.outfit === 'uniform_liner') { ctx.strokeStyle = '#9ba4a8'; ctx.lineWidth = 1 * scale; ctx.beginPath(); ctx.moveTo(x, y - 32 * scale); ctx.lineTo(x, y + 10 * scale); ctx.stroke(); }

    if (owns('fathers-raincoat')) {
      ctx.fillStyle = '#a88d32';
      ctx.beginPath();
      ctx.moveTo(x - 27 * scale, y + 18 * scale);
      ctx.lineTo(x - 22 * scale, y - 34 * scale);
      ctx.quadraticCurveTo(x, y - 47 * scale, x + 24 * scale, y - 31 * scale);
      ctx.lineTo(x + 29 * scale, y + 20 * scale);
      ctx.lineTo(x + 7 * scale, y + 11 * scale);
      ctx.lineTo(x - 7 * scale, y + 11 * scale);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d1b453'; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.moveTo(x, y - 35 * scale); ctx.lineTo(x, y + 10 * scale); ctx.stroke();
    }

    ctx.fillStyle = skinColors[dna.skinTone];
    ctx.beginPath(); ctx.ellipse(headX, headY, headRX, headRY, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#25242a'; ctx.lineWidth = 1.5 * scale;
    const eyeY = headY - 1 * scale;
    const eyeGap = dna.eyeShape === 'wide' ? 5.8 : dna.eyeShape === 'narrow' ? 4.4 : 5;
    ctx.beginPath();
    if (dna.eyeShape === 'wide') {
      ctx.arc(headX - eyeGap * scale, eyeY, 1.65 * scale, 0, Math.PI * 2); ctx.arc(headX + eyeGap * scale, eyeY, 1.65 * scale, 0, Math.PI * 2);
    } else {
      const tilt = dna.eyeShape === 'downcast' ? 1.2 * scale : dna.eyeShape === 'uneven' ? 1.5 * scale : 0;
      ctx.moveTo(headX - (eyeGap + 1.6) * scale, eyeY - tilt); ctx.lineTo(headX - (eyeGap - 1.6) * scale, eyeY + tilt);
      ctx.moveTo(headX + (eyeGap - 1.6) * scale, eyeY + (dna.eyeShape === 'uneven' ? -tilt : tilt)); ctx.lineTo(headX + (eyeGap + 1.6) * scale, eyeY - (dna.eyeShape === 'uneven' ? -tilt : tilt));
    }
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(headX - 4 * scale, headY + 7 * scale); ctx.lineTo(headX + 4 * scale, headY + 7 * scale); ctx.stroke();

    const hairColor = owns('bleach-powder') ? '#d7c84f' : this.mixHex(hairColors[dna.hairColor], '#d2cfc5', Math.max(0, age - 0.55) * 1.45);
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    if (dna.hairStyle === 'buzz') {
      ctx.ellipse(headX, headY - 4 * scale, headRX * 0.98, headRY * 0.78, 0, Math.PI, Math.PI * 2);
    } else if (dna.hairStyle === 'side_part') {
      ctx.moveTo(headX - headRX, headY - 2 * scale); ctx.quadraticCurveTo(headX - 2 * scale, headY - headRY * 1.18, headX + headRX, headY - 2 * scale); ctx.lineTo(headX + headRX * 0.25, headY - 6 * scale); ctx.quadraticCurveTo(headX - 4 * scale, headY - headRY * 0.5, headX - headRX, headY - 2 * scale);
    } else if (dna.hairStyle === 'curly') {
      for (let index = 0; index < 6; index += 1) ctx.arc(headX - headRX * 0.72 + index * headRX * 0.29, headY - headRY * 0.76, headRX * 0.32, Math.PI, Math.PI * 2);
    } else if (dna.hairStyle === 'messy') {
      ctx.moveTo(headX - headRX, headY - 2 * scale); ctx.lineTo(headX - headRX * 0.65, headY - headRY); ctx.lineTo(headX - headRX * 0.2, headY - headRY * 0.7); ctx.lineTo(headX + headRX * 0.15, headY - headRY * 1.18); ctx.lineTo(headX + headRX * 0.48, headY - headRY * 0.72); ctx.lineTo(headX + headRX, headY - 2 * scale);
    } else {
      ctx.ellipse(headX, headY - 4 * scale, headRX, headRY, 0, Math.PI, Math.PI * 2); ctx.lineTo(headX + headRX, headY - 2 * scale); ctx.quadraticCurveTo(headX, headY - headRY * 1.05, headX - headRX, headY - 2 * scale);
    }
    ctx.closePath(); ctx.fill();
    if (dna.feature === 'cheek_mole') { ctx.fillStyle = '#51443f'; ctx.beginPath(); ctx.arc(headX + 7 * scale, headY + 4 * scale, 0.9 * scale, 0, Math.PI * 2); ctx.fill(); }
    if (dna.feature === 'freckles') { ctx.fillStyle = '#80675a'; for (let index = 0; index < 5; index += 1) { ctx.beginPath(); ctx.arc(headX - 6 * scale + index * 3 * scale, headY + 3 * scale + (index % 2) * scale, 0.55 * scale, 0, Math.PI * 2); ctx.fill(); } }
    if (dna.feature === 'brow_gap' || dna.feature === 'uneven_brows') {
      ctx.strokeStyle = '#393238'; ctx.lineWidth = 1.2 * scale; ctx.beginPath();
      ctx.moveTo(headX - 8 * scale, headY - 5 * scale); ctx.lineTo(headX - (dna.feature === 'brow_gap' ? 6 : 3) * scale, headY - 6 * scale);
      ctx.moveTo(headX + 3 * scale, headY - (dna.feature === 'uneven_brows' ? 7 : 6) * scale); ctx.lineTo(headX + 8 * scale, headY - 5 * scale); ctx.stroke();
    }
    if (owns('bleach-powder')) {
      ctx.fillStyle = '#efe267';
      for (let index = 0; index < 4; index += 1) ctx.fillRect(headX - 10 * scale + index * 6 * scale, headY - 15 * scale, 3 * scale, 7 * scale);
    }
    if (owns('cracked-glasses')) {
      ctx.strokeStyle = '#a8c0c2'; ctx.lineWidth = 1.4 * scale;
      ctx.beginPath(); ctx.arc(headX - 5.5 * scale, headY, 4.8 * scale, 0, Math.PI * 2); ctx.arc(headX + 5.5 * scale, headY, 4.8 * scale, 0, Math.PI * 2); ctx.moveTo(headX - 1 * scale, headY); ctx.lineTo(headX + 1 * scale, headY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(headX + 3 * scale, headY - 4 * scale); ctx.lineTo(headX + 8 * scale, headY + 4 * scale); ctx.stroke();
    }
    if (owns('od-pill')) {
      ctx.fillStyle = '#d783b7'; ctx.beginPath(); ctx.arc(headX - 5 * scale, headY, 1.8 * scale, 0, Math.PI * 2); ctx.arc(headX + 5 * scale, headY, 1.8 * scale, 0, Math.PI * 2); ctx.fill();
    }

    if (owns('nameless-tie')) {
      ctx.fillStyle = '#7f2939'; ctx.beginPath(); ctx.moveTo(x, y - 29 * scale); ctx.lineTo(x + 5 * scale, y - 7 * scale); ctx.lineTo(x, y + 5 * scale); ctx.lineTo(x - 5 * scale, y - 7 * scale); ctx.closePath(); ctx.fill();
    }
    if (owns('baby-tooth')) {
      ctx.strokeStyle = '#dbcda9'; ctx.lineWidth = 1 * scale; ctx.beginPath(); ctx.arc(x, y - 28 * scale, 11 * scale, 0, Math.PI); ctx.stroke();
      ctx.fillStyle = '#eee7d1'; ctx.beginPath(); ctx.moveTo(x - 3 * scale, y - 17 * scale); ctx.lineTo(x + 3 * scale, y - 17 * scale); ctx.lineTo(x, y - 9 * scale); ctx.closePath(); ctx.fill();
    }
    if (owns('front-desk-letter')) this.drawEnvelope(x - 9 * scale, y - 17 * scale, 17 * scale, 11 * scale, owns('fathers-raincoat') ? '#a9c1bf' : '#e4d7c3');
    if (owns('loose-button')) { ctx.fillStyle = '#d2c7b6'; ctx.beginPath(); ctx.arc(x + 8 * scale, y - 11 * scale, 3 * scale, 0, Math.PI * 2); ctx.fill(); }
    if (owns('revoked-badge')) { ctx.fillStyle = '#708199'; ctx.fillRect(x + 7 * scale, y - 26 * scale, 13 * scale, 9 * scale); }
    if (owns('missing-photo')) { ctx.fillStyle = '#d6ccb9'; ctx.strokeStyle = '#786955'; ctx.lineWidth = 1 * scale; ctx.fillRect(x - 18 * scale, y - 24 * scale, 11 * scale, 14 * scale); ctx.strokeRect(x - 18 * scale, y - 24 * scale, 11 * scale, 14 * scale); }
    if (owns('unsent-phone')) { ctx.fillStyle = '#46605f'; ctx.fillRect(x - 20 * scale, y + 2 * scale, 8 * scale, 15 * scale); ctx.fillStyle = '#7fd0c4'; ctx.fillRect(x - 19 * scale, y + 4 * scale, 6 * scale, 7 * scale); }
    if (owns('slow-watch')) { ctx.strokeStyle = '#87adb4'; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(x + 15 * scale, y + 6 * scale, 4 * scale, 0, Math.PI * 2); ctx.stroke(); }
    if (owns('first-salary')) this.drawEnvelope(x + 11 * scale, y + 7 * scale, 14 * scale, 9 * scale, '#b99065');
    if (owns('only-key')) { ctx.strokeStyle = '#d0a855'; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.arc(x + 19 * scale, y + 8 * scale, 4 * scale, 0, Math.PI * 2); ctx.moveTo(x + 19 * scale, y + 12 * scale); ctx.lineTo(x + 19 * scale, y + 25 * scale); ctx.lineTo(x + 24 * scale, y + 25 * scale); ctx.stroke(); }
    if (owns('white-bottle') || owns('od-pill')) { ctx.fillStyle = owns('od-pill') ? '#d493bb' : '#d7dfdc'; ctx.fillRect(x - 24 * scale, y + 6 * scale, 8 * scale, 14 * scale); }
    if (owns('eyebrow-razor')) {
      ctx.strokeStyle = '#9d414d'; ctx.lineWidth = 1 * scale;
      for (let index = 0; index < 6; index += 1) { ctx.beginPath(); ctx.moveTo(x - 18 * scale, y - 4 * scale + index * 3 * scale); ctx.lineTo(x - 11 * scale, y - 1 * scale + index * 3 * scale); ctx.stroke(); }
      ctx.fillStyle = '#c9d1d2'; ctx.fillRect(x - 22 * scale, y + 13 * scale, 12 * scale, 2 * scale);
    }
    ctx.restore();
  }

  private renderProjectiles(): void {
    const ctx = this.ctx;
    for (const projectile of this.projectiles) {
      ctx.save();
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      // 凝实度：出生的一口气是虚弱的雾，人生把它揉硬
      const firmness = this.clamp(
        (projectile.damage / BASE_VECTOR.damage - 1) * 0.55
        + projectile.visual.weight * 0.25 + projectile.visual.sharpness * 0.3,
        0, 1,
      );
      const lifeFade = Math.min(1, projectile.life * 2);
      const visual = projectile.visual;
      const distortion = this.reducedMotion ? 0 : Math.sin(projectile.id * 2.17 + projectile.life * 17) * visual.distortion;
      ctx.translate(0, Math.round(distortion * 2));

      // 一颗弹只允许一种尾迹；flags 叠加机制，不叠加完整弹体贴图。
      ctx.fillStyle = visual.trailColor;
      ctx.strokeStyle = visual.trailColor;
      if (visual.trail === 'drip') {
        ctx.globalAlpha = lifeFade * 0.42;
        ctx.fillRect(Math.round(-projectile.radius * 3.8), -1, Math.max(2, Math.round(projectile.radius)), 2);
        ctx.fillRect(Math.round(-projectile.radius * 2.2), 2, 2, 2);
      } else if (visual.trail === 'signal') {
        ctx.globalAlpha = lifeFade * 0.38;
        for (let step = 1; step <= 3; step += 1) ctx.fillRect(Math.round(-projectile.radius * (step + 1.2)), step % 2 ? -2 : 1, 2, 2);
      } else if (visual.trail === 'streak') {
        ctx.globalAlpha = lifeFade * 0.46;
        ctx.fillRect(Math.round(-projectile.radius * 4.6), 0, Math.max(3, Math.round(projectile.radius * 3.1)), 1);
      } else if (visual.trail === 'echo') {
        ctx.globalAlpha = lifeFade * 0.3;
        ctx.fillRect(Math.round(-projectile.radius * 4), -1, 3, 3);
        ctx.fillRect(Math.round(-projectile.radius * 2.7), 0, 2, 2);
      } else {
        ctx.globalAlpha = lifeFade * 0.24;
        ctx.beginPath();
        ctx.ellipse(-projectile.radius * 2.8, 0, projectile.radius * 1.2, Math.max(1, projectile.radius * 0.45), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = lifeFade * visual.opacity;
      ctx.fillStyle = visual.materialTint;
      ctx.strokeStyle = visual.edgeColor;
      // TearVariant 等价层：每颗弹只从图集中选择一个最终 form。
      if (projectileAtlas.ready) {
        const spriteName = visual.form === 'breath'
          ? `breath${Math.min(3, Math.floor(firmness * 4))}`
          : visual.form;
        const tint = projectile.critical ? '#fff1a8' : visual.materialTint;
        const sprite = projectileAtlas.tintedNamed(spriteName, tint, visual.form === 'breath' ? 0.28 : 0.42);
        if (sprite) {
          const baseSize = projectile.radius * (visual.form === 'breath' ? 3.4 : 3.1);
          const widthScale = this.clamp(0.78 + visual.length * 0.2 + visual.sharpness * 0.12, 0.85, 1.9);
          const heightScale = this.clamp(1 + visual.weight * 0.12 - visual.sharpness * 0.1, 0.72, 1.45);
          const wobble = visual.form === 'breath'
            ? Math.sin(projectile.life * 9 + projectile.id * 1.7) * (1 - firmness) * 0.16
            : 0;
          const drawWidth = baseSize * widthScale * (1 + wobble);
          const drawHeight = baseSize * heightScale;
          ctx.globalAlpha = lifeFade * visual.opacity * (visual.form === 'breath' ? 0.5 + firmness * 0.5 : 1);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(sprite, -drawWidth / 2, -drawHeight / 2 + wobble * 5, drawWidth, drawHeight);
          if (projectile.critical) {
            ctx.globalAlpha = 0.68;
            ctx.strokeStyle = '#fff8c5';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(0, 0, baseSize * 0.5, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.restore();
          continue;
        }
      }
      if (visual.form === 'paper') {
        ctx.fillRect(-projectile.radius * 1.5, -projectile.radius * 0.72, projectile.radius * 3, projectile.radius * 1.44);
        ctx.strokeStyle = '#7f7770'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-projectile.radius * 1.4, -projectile.radius * 0.65); ctx.lineTo(0, 0); ctx.lineTo(projectile.radius * 1.4, -projectile.radius * 0.65); ctx.stroke();
      } else if (visual.form === 'rain' || visual.form === 'tear') {
        ctx.beginPath(); ctx.ellipse(0, 0, projectile.radius * 0.65, projectile.radius * 2.1, 0, 0, Math.PI * 2); ctx.fill();
      } else if (visual.form === 'sound') {
        ctx.beginPath(); ctx.arc(0, 0, projectile.radius * 1.5, 0, Math.PI * 2); ctx.stroke();
      } else if (visual.form === 'key') {
        ctx.lineWidth = Math.max(1, projectile.radius * 0.35); ctx.beginPath(); ctx.arc(-projectile.radius, 0, projectile.radius * 0.7, 0, Math.PI * 2); ctx.moveTo(-projectile.radius * 0.3, 0); ctx.lineTo(projectile.radius * 1.8, 0); ctx.lineTo(projectile.radius * 1.8, projectile.radius); ctx.stroke();
      } else if (visual.form === 'bone') {
        ctx.lineWidth = Math.max(2, projectile.radius * 0.8); ctx.beginPath(); ctx.moveTo(-projectile.radius * 1.7, 0); ctx.lineTo(projectile.radius * 1.7, 0); ctx.stroke();
      } else if (visual.form === 'cone') {
        ctx.beginPath(); ctx.moveTo(-projectile.radius * 1.4, -projectile.radius); ctx.lineTo(projectile.radius * 2.1, 0); ctx.lineTo(-projectile.radius * 1.4, projectile.radius); ctx.closePath(); ctx.fill();
      } else {
        // 《一口气》：一小团月白色气息。虚弱时是散雾，被人生揉硬后才凝成弹
        const wobble = Math.sin(projectile.life * 9 + projectile.id * 1.7) * (1 - firmness) * 0.22;
        const puffR = projectile.radius * (1 + wobble);
        const alpha = lifeFade * (0.42 + firmness * 0.55);
        ctx.globalAlpha = alpha * 0.35;
        ctx.beginPath(); ctx.ellipse(-puffR * 2.6, wobble * 4, puffR * (0.55 + 0.2 * firmness), puffR * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha * 0.6;
        ctx.beginPath(); ctx.ellipse(-puffR * 1.3, -wobble * 4, puffR * (0.75 + 0.25 * firmness), puffR * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.ellipse(0, 0, puffR * (1.25 + firmness * 0.45), puffR * (0.85 + firmness * 0.15), 0, 0, Math.PI * 2); ctx.fill();
        if (firmness > 0.45) {
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillStyle = '#f4efe2';
          ctx.beginPath(); ctx.ellipse(puffR * 0.3, 0, puffR * 0.55, puffR * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (projectile.critical) { ctx.globalAlpha = 0.7; ctx.strokeStyle = '#fff8c5'; ctx.lineWidth = 1.2; ctx.stroke(); }
      ctx.restore();
    }
  }

  /** 奥义演出：先短暂停顿确认组合，再把记忆闪回压在战场上沿。 */
  private renderComboReveal(): void {
    const reveal = this.comboReveal;
    if (!reveal) return;
    const art = comboArtAtlas.slice(reveal.artKey);
    if (!art) {
      this.caption = `集齐了 ·《${reveal.name}》`;
      this.captionTime = Math.max(this.captionTime, 2.5);
      this.comboReveal = undefined;
      return;
    }
    const elapsed = reveal.total - reveal.timer;
    const fadeIn = this.clamp(elapsed / 0.28, 0, 1);
    const fadeOut = this.clamp(reveal.timer / 0.45, 0, 1);
    const alpha = Math.min(fadeIn, fadeOut);
    const rise = (1 - fadeIn) * 14;
    const ctx = this.ctx;
    const artW = 240;
    const artH = 135;
    const x = Math.round((W - artW) / 2);
    const y = Math.round(112 + rise);
    ctx.save();
    applyPixelDiscipline(ctx);
    ctx.globalAlpha = alpha * 0.62;
    ctx.fillStyle = '#07080b';
    ctx.fillRect(0, y - 32, W, artH + 86);
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, x, y, artW, artH);
    ctx.strokeStyle = UI_PALETTE.paperShadow;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 1, artW + 2, artH + 2);
    ctx.strokeStyle = UI_PALETTE.oldRed;
    ctx.strokeRect(x - 4, y - 4, artW + 8, artH + 8);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText('这一身 · 成套了', W / 2, y - 12);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 15px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(`《${reveal.name}》`, W / 2, y + artH + 26);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(reveal.line, W / 2, y + artH + 44);
    ctx.restore();
  }

  private renderBursts(): void {
    const ctx = this.ctx;
    for (const burst of this.bursts) {
      const progress = 1 - burst.life / burst.duration;
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = burst.color;
      ctx.fillStyle = burst.color;
      if (burst.kind === 'word') {
        ctx.textAlign = 'center'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(burst.text || '', burst.x, burst.y - progress * 22);
      } else if (burst.kind === 'sigh') {
        const driftX = burst.text === 'L' ? -1 : burst.text === 'R' ? 1 : 0;
        const driftY = burst.text === 'B' ? -0.6 : burst.text === 'F' ? 0.3 : -0.35;
        ctx.globalAlpha = (1 - progress) * 0.5;
        ctx.beginPath();
        ctx.arc(
          burst.x + driftX * progress * 9,
          burst.y + driftY * progress * 9 - progress * 5,
          Math.max(1, burst.radius * (0.6 + progress * 0.9)),
          0, Math.PI * 2,
        );
        ctx.fill();
      } else if (burst.kind === 'door') {
        ctx.lineWidth = 3; ctx.strokeRect(burst.x - burst.radius * 0.26, burst.y - burst.radius * progress * 0.5, burst.radius * 0.52, burst.radius * progress);
      } else if (burst.kind === 'syn' && burst.material) {
        // 成双协同：覆盖贴图冒出再散去
        const sprite = synergyAtlas.named(burst.material);
        if (sprite) {
          const size = burst.radius * (0.9 + progress * 0.7);
          ctx.globalAlpha = progress < 0.25 ? progress / 0.25 : 1 - (progress - 0.25) / 0.75;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(sprite, burst.x - size / 2, burst.y - size / 2, size, size);
        }
      } else if (burst.kind === 'hit' && burst.material) {
        // 贴图命中：材质 4 帧序列，随进度放大淡出；帧未加载走程序圆圈
        const frame = hitFrame(burst.material as HitMaterial, progress);
        if (frame) {
          const size = Math.max(12, burst.radius * (0.8 + progress * 0.6));
          ctx.globalAlpha = 1 - progress * progress;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(frame, burst.x - size / 2, burst.y - size / 2, size, size);
        } else {
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(burst.x, burst.y, Math.max(2, burst.radius * progress), 0, Math.PI * 2); ctx.stroke();
        }
      } else {
        ctx.lineWidth = burst.kind === 'hit' ? 2 : 3;
        ctx.beginPath(); ctx.arc(burst.x, burst.y, Math.max(2, burst.radius * progress), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  private renderPoisonStrip(y: number): void {
    const ctx = this.ctx;
    for (let index = 0; index < POISON_KEYS.length; index += 1) {
      const key = POISON_KEYS[index]!;
      const x = 18 + index * 68;
      const value = this.poisons[key];
      ctx.fillStyle = '#24242b'; ctx.fillRect(x, y, 52, 24);
      ctx.fillStyle = value > 0 ? '#be6974' : '#66656b'; ctx.fillRect(x, y + 21, 52 * (value / 12), 3);
      // 五毒图腾：贪=攥紧的硬币 嗔=火柴 痴=扑灯蛾 慢=歪纸冠 疑=打结的绳
      const totem = poisonAtlas.named(key);
      if (totem) {
        ctx.save();
        ctx.globalAlpha = value > 0 ? 0.95 : 0.4;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(totem, x + 2, y + 3, 16, 16);
        ctx.restore();
      }
      ctx.textAlign = 'center'; ctx.fillStyle = value > 0 ? '#d8c8c5' : '#77757a'; ctx.font = 'bold 9px sans-serif';
      ctx.fillText(`${POISON_LABELS[key]} ${value}`, x + (totem ? 33 : 26), y + 15);
    }
  }

  private renderItemReward(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    const deskPattern = uiTextures.pattern(ctx, 'desk');
    ctx.fillStyle = deskPattern ?? UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,8,12,.76)';
    ctx.fillRect(0, 0, W, H);
    uiTextures.drawArchiveDecoration(ctx, 'tape', 4, 8, 64, 0.72, -0.08);
    uiTextures.drawArchiveDecoration(ctx, 'clip', 320, 12, 28, 0.78, 0.12);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 15px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(this.rewardTitle, 20, 35, 320, 18, 2);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(this.initialItemReward ? '出门物证 · 只能带走一件' : '困难缩成物件，留在了这一身上', 20, 72);
    drawStitchDivider(ctx, 20, 82, 320, 'horizontal', '#4d494d', 5, 4);
    for (let index = 0; index < 3; index += 1) {
      const id = this.itemRewardChoices[index];
      if (!id) continue;
      ctx.save();
      if (this.rewardAcquire && this.rewardAcquire.index !== index) ctx.globalAlpha = 0.18;
      this.drawItemRecord(id, index, 'reward');
      ctx.restore();
    }
    this.renderRewardAcquireEffect();
    ctx.textAlign = 'center';
    ctx.fillStyle = this.rewardAcquire ? UI_PALETTE.raincoatYellow : UI_PALETTE.paperDim;
    ctx.font = `${this.rewardAcquire ? 'bold ' : ''}9px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(this.rewardAcquire ? '物证已订进这一身。' : '每一件道具，都是他活过的证据。', 180, 620);
  }

  private renderRewardAcquireEffect(): void {
    const acquisition = this.rewardAcquire;
    if (!acquisition) return;
    const ctx = this.ctx;
    const y = 88 + acquisition.index * 152;
    const progress = this.clamp(1 - acquisition.timer / acquisition.total, 0, 1);
    const stepped = this.reducedMotion ? 1 : Math.min(1, Math.floor(progress * 5) / 5);
    const iconY = y + 31 + (y + 101 - (y + 31)) * stepped;
    const iconScale = 15 - stepped * 7;
    ctx.save();
    ctx.strokeStyle = this.mixHex(getItem(acquisition.id).color, UI_PALETTE.oldRed, 0.35);
    ctx.lineWidth = 2;
    ctx.strokeRect(18, y + 6, 324, 132);
    ctx.globalAlpha = 0.45 + progress * 0.55;
    drawStitchDivider(ctx, 58, y + 44, 32, 'vertical', '#766e67', 4, 3);
    this.drawItemSymbol(acquisition.id, 58, iconY, iconScale);
    if (progress >= 0.52) {
      ctx.globalAlpha = this.clamp((progress - 0.52) / 0.18, 0, 1);
      drawRedStamp(
        ctx, 263, y + 105, 66, 22, '已归档', 403 + acquisition.index,
        UI_PALETTE.oldRed, UI_PALETTE.paperLight, UI_PALETTE.nightRaised,
      );
    }
    ctx.restore();
  }

  private renderShop(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    const pawnDrawn = sceneArt.drawRoom(ctx, 'pawn');
    if (!pawnDrawn) {
      ctx.fillStyle = '#111013';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(190,158,112,.24)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(8,7,10,.42)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 18px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('没有招牌的当铺', 20, 38);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('有些东西，要拿另一些东西来换。', 20, 62);
    drawStatusIcon(ctx, 282, 25, 'coins', 1, UI_PALETTE.raincoatYellow);
    ctx.textAlign = 'right';
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.font = `bold 12px ${UI_FONT_STACK}`;
    ctx.fillText(String(this.hero.coins), 340, 37);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText('零钱', 340, 53);
    drawStitchDivider(ctx, 20, 78, 320, 'horizontal', '#4d494d', 5, 4);
    for (let index = 0; index < 3; index += 1) {
      const offer = this.shopOffers[index];
      if (!offer) continue;
      this.drawItemRecord(offer.item, index, 'shop', offer);
    }
    this.renderShopCashBox();
    this.renderShopFeedback();
    const rerollShake = this.shopDenyOffset(-1);
    const rerollFocused = this.shopFocus === 3;
    ctx.save();
    ctx.translate(rerollShake, 0);
    drawCutCornerPanel(
      ctx, 18, 558, 150, 42, UI_PALETTE.nightRaised,
      rerollFocused ? UI_PALETTE.raincoatYellow : this.hero.coins >= 2 ? UI_PALETTE.hospitalBlueGray : '#454249', 2, 1,
    );
    uiTextures.drawButtonFrame(ctx, 18, 558, 150, 42, this.hero.coins >= 2 ? 0.72 : 0.34);
    ctx.textAlign = 'center';
    ctx.fillStyle = this.hero.coins >= 2 ? UI_PALETTE.paperLight : '#6f6a70';
    ctx.font = `bold 10px ${UI_FONT_STACK}`;
    ctx.fillText('↻  换一批 · 2', 93, 583);
    if (rerollFocused) this.drawFocusCorners(18, 558, 150, 42, UI_PALETTE.raincoatYellow);
    ctx.restore();
    const leaveFocused = this.shopFocus === 4;
    drawCutCornerPanel(
      ctx, 192, 558, 150, 42, UI_PALETTE.nightRaised,
      leaveFocused ? UI_PALETTE.oldRed : '#5c5554', 2, 1,
    );
    uiTextures.drawButtonFrame(ctx, 192, 558, 150, 42, 0.7);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.fillText('▯  推门离开', 267, 583);
    if (leaveFocused) this.drawFocusCorners(192, 558, 150, 42, UI_PALETTE.oldRed);
  }

  private drawItemRecord(id: ItemId, index: number, mode: 'reward' | 'shop', offer?: ShopOffer): void {
    const ctx = this.ctx;
    const item = getItem(id);
    const y = 88 + index * 152;
    const sold = Boolean(offer?.sold);
    const activePurchase = mode === 'shop'
      && this.shopFeedback?.kind === 'purchase'
      && this.shopFeedback.index === index;
    const displaySold = sold && !activePurchase;
    const focused = mode === 'reward' ? this.itemRewardFocus === index : this.shopFocus === index;
    let reveal = 1;
    if (mode === 'shop' && this.shopFeedback?.kind === 'reroll') {
      const progress = this.clamp(1 - this.shopFeedback.timer / this.shopFeedback.total, 0, 1);
      reveal = this.clamp((progress - index * 0.12) / 0.64, 0, 1);
      if (!this.reducedMotion) reveal = Math.floor(reveal * 4) / 4;
    }
    ctx.save();
    if (mode === 'shop' && reveal < 1) ctx.translate(0, Math.round((1 - reveal) * -4));
    ctx.globalAlpha = (displaySold ? 0.28 : 1) * (0.15 + reveal * 0.85);
    ctx.fillStyle = mode === 'reward' ? '#18171c' : 'rgba(16,12,13,.88)';
    ctx.fillRect(16, y + 4, 328, 136);
    ctx.fillStyle = item.color;
    ctx.fillRect(16, y + 4, 3, 136);
    drawStitchDivider(ctx, 24, y + 139, 312, 'horizontal', '#454147', 4, 4);
    if (mode === 'reward') {
      uiTextures.drawRecordFrame(ctx, item.quality, 16, y + 4, 328, 136, displaySold ? 0.3 : 0.8);
    } else {
      ctx.fillStyle = '#4a352b';
      ctx.fillRect(20, y + 132, 320, 5);
      ctx.fillStyle = '#2b211d';
      ctx.fillRect(20, y + 137, 320, 3);
      ctx.strokeStyle = '#6e594b';
      ctx.strokeRect(24.5, y + 11.5, 66, 116);
    }

    const previewItems = this.items.includes(id) ? this.items : [...this.items, id];
    const itemIsMoving = mode === 'reward' && this.rewardAcquire?.index === index;
    if (!itemIsMoving) {
      this.drawItemSymbol(id, 58, y + 31 + (this.reducedMotion ? 0 : Math.sin(this.visualTime * 2.2 + index) * 1.5), 15);
    }
    this.drawHero(58, y + 126, 0.62, previewItems);
    ctx.textAlign = 'center';
    ctx.fillStyle = mode === 'reward' ? '#756e68' : '#8b786a';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(displaySold ? '空' : '试穿', 58, y + 82);
    ctx.textAlign = 'left';
    ctx.fillStyle = item.color;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(`${'ⅠⅡⅢⅣ'[item.quality - 1]} · ${item.qualityName}`, 96, y + 18);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 13px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(item.name, 96, y + 39, 210, 14, 2);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(item.flavor, 96, y + 67, 228, 12, 2);
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText('得到', 96, y + 95);
    ctx.fillStyle = UI_PALETTE.paper;
    ctx.font = `10px ${UI_FONT_STACK}`;
    this.wrapText(item.positive, 128, y + 95, 196, 11, 2);
    ctx.fillStyle = UI_PALETTE.hospitalBlueGray;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText('留下', 96, y + 121);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `10px ${UI_FONT_STACK}`;
    this.wrapText(item.negative, 128, y + 121, 196, 11, 2);
    if (mode === 'shop' && offer && !activePurchase) {
      const tagX = 296 + this.shopDenyOffset(index);
      this.drawShopPriceTag(tagX, y + 8, displaySold ? '已撕' : `${offer.price}枚`, displaySold);
    }
    if (focused && !this.rewardAcquire) {
      this.drawFocusCorners(
        16, y + 4, 328, 136,
        mode === 'reward' ? UI_PALETTE.raincoatYellow : UI_PALETTE.oldRed,
      );
    }
    ctx.restore();
  }

  private drawFocusCorners(x: number, y: number, width: number, height: number, color: string): void {
    const ctx = this.ctx;
    const length = 12;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), length, 2);
    ctx.fillRect(Math.round(x), Math.round(y), 2, length);
    ctx.fillRect(Math.round(x + width - length), Math.round(y + height - 2), length, 2);
    ctx.fillRect(Math.round(x + width - 2), Math.round(y + height - length), 2, length);
  }

  private shopDenyOffset(index: number): number {
    const feedback = this.shopFeedback;
    if (!feedback || feedback.kind !== 'deny' || feedback.index !== index || this.reducedMotion) return 0;
    const elapsed = feedback.total - feedback.timer;
    return Math.floor(elapsed / 0.055) % 2 === 0 ? -1 : 1;
  }

  private drawShopPriceTag(x: number, y: number, label: string, torn = false): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = torn ? UI_PALETTE.inkSoft : UI_PALETTE.paper;
    ctx.fillRect(Math.round(x), Math.round(y), 38, 22);
    ctx.strokeStyle = UI_PALETTE.paperShadow;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, 37, 21);
    if (torn) {
      ctx.fillStyle = UI_PALETTE.ink;
      ctx.fillRect(Math.round(x) + 18, Math.round(y), 2, 4);
      ctx.fillRect(Math.round(x) + 17, Math.round(y) + 4, 2, 4);
      ctx.fillRect(Math.round(x) + 19, Math.round(y) + 8, 2, 5);
      ctx.fillRect(Math.round(x) + 18, Math.round(y) + 13, 2, 5);
      ctx.fillRect(Math.round(x) + 20, Math.round(y) + 18, 2, 4);
    }
    ctx.fillStyle = torn ? UI_PALETTE.paperShadow : UI_PALETTE.ink;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(label, Math.round(x) + 34, Math.round(y) + 15);
    ctx.restore();
  }

  private renderShopCashBox(): void {
    const ctx = this.ctx;
    const feedback = this.shopFeedback;
    const active = feedback?.kind === 'purchase' || feedback?.kind === 'deny';
    const progress = active && feedback ? this.clamp(1 - feedback.timer / feedback.total, 0, 1) : 0;
    const denyShake = feedback?.kind === 'deny' && !this.reducedMotion
      ? (Math.floor(progress * 8) % 2 === 0 ? -1 : 1)
      : 0;
    const receivePulse = feedback?.kind === 'purchase' && progress > 0.58 && progress < 0.9 ? 1 : 0;
    const x = 276 + denyShake;
    const y = 534 - receivePulse;
    ctx.save();
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.fillRect(x, y, 60, 20 + receivePulse);
    ctx.strokeStyle = active ? '#78604A' : UI_PALETTE.inkSoft;
    ctx.strokeRect(x + 0.5, y + 0.5, 59, 19 + receivePulse);
    ctx.fillStyle = '#30282A';
    ctx.fillRect(x + 5, y + 4, 50, 12);
    ctx.fillStyle = '#08080B';
    ctx.fillRect(x + 15, y + 6, 30, 3);
    ctx.fillStyle = '#604536';
    ctx.fillRect(x + 17, y + 6, 26, 1);
    ctx.fillStyle = UI_PALETTE.paperShadow;
    ctx.fillRect(x + 3, y + 17, 54, 1);
    if (feedback?.kind === 'deny' && progress > 0.28) {
      ctx.fillStyle = UI_PALETTE.oldRed;
      ctx.fillRect(x + 27, y + 11, 6, 1);
    }
    ctx.restore();
  }

  private renderShopFeedback(): void {
    const feedback = this.shopFeedback;
    if (!feedback || feedback.kind !== 'purchase') return;
    const ctx = this.ctx;
    const progress = this.clamp(1 - feedback.timer / feedback.total, 0, 1);
    const rowY = 88 + feedback.index * 152;
    const tagProgress = this.clamp((progress - 0.08) / 0.72, 0, 1);
    const tagStep = this.reducedMotion ? tagProgress : Math.floor(tagProgress * 6) / 6;
    const tagX = 296 + Math.round(9 * tagStep);
    const tagY = rowY + 8 + Math.round((526 - rowY) * tagStep);
    ctx.save();
    ctx.globalAlpha = this.clamp(1 - Math.max(0, tagProgress - 0.78) / 0.22, 0, 1);
    this.drawShopPriceTag(tagX, tagY, `${feedback.price ?? 0}枚`, tagProgress > 0.26);
    ctx.restore();

    for (let index = 0; index < 3; index += 1) {
      const coinProgress = this.clamp((progress - index * 0.1) / 0.7, 0, 1);
      if (coinProgress <= 0 || coinProgress >= 1) continue;
      const stepped = this.reducedMotion ? coinProgress : Math.floor(coinProgress * 7) / 7;
      const x = Math.round(318 + (306 - 318) * stepped + Math.sin(stepped * Math.PI) * (index - 1) * 5);
      const y = Math.round(32 + (541 - 32) * stepped - Math.sin(stepped * Math.PI) * (34 + index * 4));
      ctx.fillStyle = '#30282A';
      ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = UI_PALETTE.raincoatYellow;
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.fillRect(x, y - 1, 1, 1);
    }
  }

  private renderSpecialRoom(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    const roomDrawn = sceneArt.drawRoom(ctx, this.specialRoomKind === 'light' ? 'lamp' : 'inner');
    if (roomDrawn) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = this.specialRoomKind === 'light'
        ? 'rgba(225,197,132,.38)'
        : 'rgba(164,181,190,.30)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.fillStyle = this.specialRoomKind === 'light' ? 'rgba(56,38,14,.03)' : 'rgba(12,16,21,.06)';
      ctx.fillRect(0, 0, W, H);
    } else if (this.specialRoomKind === 'light') {
      ctx.fillStyle = 'rgba(55,45,26,.74)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#d8b95f';
      ctx.beginPath(); ctx.arc(180, 72, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(242,217,145,.14)'; ctx.beginPath(); ctx.moveTo(180, 68); ctx.lineTo(40, 540); ctx.lineTo(320, 540); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(8,9,12,.91)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#d8d9d5'; ctx.fillRect(151, 26, 58, 8);
      ctx.fillStyle = 'rgba(190,200,205,.08)'; ctx.fillRect(88, 34, 184, 500);
      ctx.strokeStyle = '#632c37'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(70, 0); ctx.lineTo(92, H); ctx.moveTo(290, 0); ctx.lineTo(268, H); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(7,7,10,.76)';
    ctx.fillRect(14, 15, 332, 76);
    ctx.fillStyle = this.specialRoomKind === 'light' ? UI_PALETTE.raincoatYellow : UI_PALETTE.hospitalBlueGray;
    ctx.fillRect(14, 15, 3, 76);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 18px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(this.specialRoomKind === 'light' ? '留灯间' : '里屋', 28, 45);
    ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillStyle = this.specialRoomKind === 'light' ? '#c9b77c' : '#aeb7bb';
    ctx.fillText(
      this.specialRoomKind === 'light' ? '桌上没有价签。只能带走一件。' : '不收零钱。镜子只认还剩多少口气。',
      28,
      70,
    );
    drawStitchDivider(ctx, 25, 87, 310, 'horizontal', '#534b48', 5, 4);

    for (let index = 0; index < 3; index += 1) {
      const id = this.specialRoomOffers[index];
      if (!id) continue;
      this.drawSpecialRoomOffer(id, index);
    }
    this.drawSpecialRoomPreview();

    drawCutCornerPanel(
      ctx, SPECIAL_LEAVE_RECT.x, SPECIAL_LEAVE_RECT.y, SPECIAL_LEAVE_RECT.width, SPECIAL_LEAVE_RECT.height,
      'rgba(16,15,19,.92)', this.specialRoomLeaveFocused
        ? (this.specialRoomKind === 'light' ? UI_PALETTE.raincoatYellow : UI_PALETTE.oldRed)
        : (this.specialRoomKind === 'light' ? UI_PALETTE.raincoatShadow : '#62404a'), 2, 1,
    );
    uiTextures.drawButtonFrame(ctx, SPECIAL_LEAVE_RECT.x, SPECIAL_LEAVE_RECT.y, SPECIAL_LEAVE_RECT.width, SPECIAL_LEAVE_RECT.height, 0.64);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 11px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(this.specialRoomKind === 'light' ? '轻轻把门带上' : '掀帘出去', 180, 583);
    if (this.specialRoomLeaveFocused) {
      this.drawFocusCorners(
        SPECIAL_LEAVE_RECT.x, SPECIAL_LEAVE_RECT.y, SPECIAL_LEAVE_RECT.width, SPECIAL_LEAVE_RECT.height,
        this.specialRoomKind === 'light' ? UI_PALETTE.raincoatYellow : UI_PALETTE.oldRed,
      );
    }
    ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillStyle = this.specialRoomKind === 'light' ? '#9f9272' : '#77777e';
    ctx.fillText(
      this.specialRoomKind === 'light' ? '另外两件东西，会继续留在灯下。' : '镜子比他先老了一步。',
      180,
      620,
    );
  }

  private drawSpecialRoomOffer(id: ItemId, index: number): void {
    const ctx = this.ctx;
    const item = getItem(id);
    const rect = SPECIAL_OFFER_RECTS[index]!;
    const centerX = rect.x + rect.width / 2;
    const focused = this.specialRoomFocus === index;
    const taken = this.specialRoomTaken.has(id);
    const canAfford = this.specialRoomKind === 'light' || id === 'broken-spine' || this.hero.maxHp - 12 >= 20;
    const holding = this.specialRoomPointerId !== -1 && this.specialRoomHoldIndex === index;
    const holdProgress = holding
      ? this.clamp((performance.now() - this.specialRoomHoldStarted) / SPECIAL_HOLD_MS, 0, 1)
      : 0;

    ctx.save();
    if (this.specialRoomKind === 'light') {
      ctx.fillStyle = focused ? 'rgba(198,164,74,.10)' : 'rgba(198,164,74,.035)';
      ctx.fillRect(rect.x + 8, rect.y, rect.width - 16, 128);
    } else {
      ctx.strokeStyle = focused ? UI_PALETTE.oldRed : '#50484b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, rect.y + 4);
      ctx.lineTo(centerX, rect.y + 49);
      ctx.lineTo(centerX - 4, rect.y + 55);
      ctx.stroke();
    }

    if (focused) {
      const accent = this.specialRoomKind === 'light' ? UI_PALETTE.raincoatYellow : UI_PALETTE.oldRed;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
      ctx.fillStyle = accent;
      ctx.fillRect(rect.x, rect.y, 12, 2);
      ctx.fillRect(rect.x, rect.y, 2, 12);
      ctx.fillRect(rect.x + rect.width - 12, rect.y + rect.height - 2, 12, 2);
      ctx.fillRect(rect.x + rect.width - 2, rect.y + rect.height - 12, 2, 12);
    }

    ctx.globalAlpha = taken ? 0.2 : canAfford ? 1 : 0.38;
    const itemY = rect.y + 74 + (this.reducedMotion || taken ? 0 : Math.sin(this.visualTime * 2 + index * 1.1) * 2);
    this.drawItemPedestal(centerX, rect.y + 126, item.quality, false, taken);
    if (!taken) this.drawItemSymbol(id, centerX, itemY, 30);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = taken ? '#6c6869' : item.color;
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    ctx.fillText(`${'ⅠⅡⅢⅣ'[item.quality - 1]} · ${item.qualityName}`, centerX, rect.y + 149);
    ctx.fillStyle = taken ? '#777276' : UI_PALETTE.paperLight;
    ctx.font = `bold 11px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(taken ? '空下来的位置' : item.name, centerX, rect.y + 169, rect.width - 14, 13, 2);

    const status = taken ? '已经穿上' : !canAfford ? '已经付不起' : holding ? '别松手' : focused ? '按住带走' : `${index + 1}`;
    ctx.fillStyle = taken ? '#6d696d' : !canAfford ? UI_PALETTE.warning : focused
      ? (this.specialRoomKind === 'light' ? UI_PALETTE.raincoatYellow : '#c57980')
      : UI_PALETTE.paperDim;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(status, centerX, rect.y + 203);
    if (holding) {
      ctx.fillStyle = '#29262a';
      ctx.fillRect(rect.x + 8, rect.y + rect.height - 7, rect.width - 16, 3);
      ctx.fillStyle = this.specialRoomKind === 'light' ? UI_PALETTE.raincoatYellow : UI_PALETTE.oldRed;
      ctx.fillRect(rect.x + 8, rect.y + rect.height - 7, Math.round((rect.width - 16) * holdProgress), 3);
    }
    ctx.restore();
  }

  private drawSpecialRoomPreview(): void {
    const ctx = this.ctx;
    const id = this.specialRoomOffers[this.specialRoomFocus];
    if (!id) return;
    const item = getItem(id);
    const taken = this.specialRoomTaken.has(id);
    const previewItems = taken ? this.items : [...this.items, id];
    const paper = this.specialRoomKind === 'light';
    drawCutCornerPanel(
      ctx, 20, 354, 320, 174,
      paper ? 'rgba(216,208,193,.94)' : 'rgba(15,15,19,.9)',
      paper ? UI_PALETTE.paperShadow : '#5c4c52', 3, 1,
    );
    if (paper) overlayPanelTexture(ctx, UI_PALETTE.paper, 20, 354, 320, 174, [UI_PALETTE.paper], []);

    ctx.save();
    ctx.strokeStyle = paper ? '#7c705d' : '#6a5b60';
    ctx.lineWidth = 1;
    ctx.strokeRect(34.5, 367.5, 74, 132);
    ctx.fillStyle = paper ? 'rgba(67,58,47,.12)' : 'rgba(160,175,180,.05)';
    ctx.fillRect(38, 371, 67, 125);
    this.drawHero(71, 482, 0.72, previewItems);
    if (!paper) {
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#d9dde0';
      ctx.fillRect(43, 386, 2, 76);
      ctx.fillRect(96, 396, 1, 54);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    const ink = paper ? UI_PALETTE.ink : UI_PALETTE.paperLight;
    const dim = paper ? '#625a50' : UI_PALETTE.paperDim;
    ctx.textAlign = 'left';
    ctx.fillStyle = paper ? UI_PALETTE.oldRed : UI_PALETTE.hospitalBlueGray;
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    ctx.fillText(paper ? '灯下预留' : '镜中预演', 124, 377);
    ctx.fillStyle = ink;
    ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(item.name, 124, 397, 194, 14, 2);
    ctx.fillStyle = dim;
    ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(item.flavor, 124, 427, 194, 11, 2);
    ctx.fillStyle = paper ? '#725e3e' : UI_PALETTE.raincoatYellow;
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    ctx.fillText('得到', 124, 457);
    ctx.fillStyle = ink;
    ctx.font = `9px ${UI_FONT_STACK}`;
    this.wrapText(item.positive, 154, 457, 164, 11, 2);
    ctx.fillStyle = paper ? UI_PALETTE.hospitalBlueGrayDark : '#a9868d';
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    ctx.fillText(this.specialRoomKind === 'light' ? '留下' : '交换', 124, 490);
    ctx.fillStyle = dim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    const cost = this.specialRoomKind === 'light'
      ? item.negative
      : id === 'broken-spine' ? '代价已经长在物件里面' : `最大生命 -12 · ${item.negative}`;
    this.wrapText(cost, 154, 490, 164, 11, 2);
  }

  private drawItemPedestal(x: number, y: number, quality: number, shop: boolean, sold: boolean): void {
    const ctx = this.ctx;
    const backRoom = this.state === 'specialRoom' && this.specialRoomKind === 'back';
    const lightRoom = this.state === 'specialRoom' && this.specialRoomKind === 'light';
    const plinthKind: WorldPlinthKind = lightRoom ? 'light' : backRoom ? 'inner' : shop ? 'shop' : 'reward';
    const plinth = worldPlinthAtlas.slice(plinthKind);
    const top = sold ? '#4a494d' : lightRoom ? '#9d8244' : backRoom ? '#68747a' : shop ? '#654a37' : '#5a5552';
    const front = sold ? '#313237' : lightRoom ? '#695b37' : backRoom ? '#3c464c' : shop ? '#403126' : '#393537';
    const accent = sold ? '#626167' : quality >= 4 ? '#c7aa58' : quality >= 3 ? '#9f5262' : '#777779';
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = sold ? 0.32 : 1;
    if (plinth) ctx.drawImage(plinth, Math.round(x - 24), Math.round(y - 16));
    else {
      ctx.fillStyle = 'rgba(5,5,8,.58)';
      ctx.fillRect(Math.round(x - 28), Math.round(y + 8), 56, 4);
      ctx.fillStyle = front;
      ctx.fillRect(Math.round(x - 20), Math.round(y), 40, 12);
      ctx.fillRect(Math.round(x - 16), Math.round(y + 12), 32, 4);
      ctx.fillStyle = top;
      ctx.fillRect(Math.round(x - 24), Math.round(y - 4), 48, 7);
      ctx.fillRect(Math.round(x - 18), Math.round(y - 7), 36, 3);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.fillRect(Math.round(x - 12), Math.round(y - 4), 24, 2);
    if (!sold) {
      const phase = Math.floor(this.visualTime * 4) % 4;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.42;
      ctx.fillRect(Math.round(x - 18 + phase * 2), Math.round(y - 23 - phase), 2, 4);
      ctx.fillRect(Math.round(x + 16 - phase * 2), Math.round(y - 31 + phase), 2, 3);
      ctx.fillRect(Math.round(x - 7), Math.round(y - 17 - ((phase + 2) % 4)), 2, 2);
    }
    ctx.restore();
  }

  private renderResult(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    if (!sceneArt.drawEnding(ctx, this.resultWon ? 'lampman' : 'table', 0.78)) {
      ctx.fillStyle = UI_PALETTE.night;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = 'rgba(7,7,10,.7)';
    ctx.fillRect(0, 0, W, H);
    uiTextures.drawArchiveDecoration(ctx, 'postmark', 298, 10, 48, 0.38, -0.08);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6f6960';
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(`第 ${this.runSeed.toString(16).toUpperCase().padStart(8, '0')} 号人生档案 · 已封卷`, 20, 28);

    ctx.fillStyle = 'rgba(8,8,11,.68)';
    ctx.fillRect(16, 36, 190, 50);
    ctx.font = `bold 30px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.fillText('这一', 22, 74);
    const finalCharacterX = 92;
    if (this.resultWon) {
      const rawMorph = this.reducedMotion ? 1 : this.clamp((performance.now() - this.resultStartedAt - 450) / 900, 0, 1);
      const morph = Math.floor(rawMorph * 5) / 5;
      ctx.save();
      ctx.globalAlpha = 1 - morph;
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.fillText('身', finalCharacterX, 74);
      ctx.globalAlpha = morph;
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.fillText('生', finalCharacterX, 74);
      ctx.restore();
      if (morph >= 1) {
        drawRedStamp(
          ctx, 240, 43, 88, 34, '已封卷', 107,
          UI_PALETTE.oldRed, UI_PALETTE.paperLight, UI_PALETTE.night,
        );
      }
    } else {
      ctx.fillText('身', finalCharacterX, 74);
      drawRedStamp(
        ctx, 242, 43, 86, 34, '写到这里', 101,
        UI_PALETTE.oldRed, UI_PALETTE.paperLight, UI_PALETTE.night,
      );
    }
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.fillRect(20, 89, 320, 2);

    const resultTabLabels = ['封卷', '穿过的', '咽与吐', '留下的'];
    resultTabLabels.forEach((label, index) => {
      const x = RESULT_TAB_RECT.x + index * 80;
      const active = this.resultTab === RESULT_TABS[index];
      ctx.fillStyle = active ? 'rgba(216,208,193,.15)' : 'rgba(27,26,32,.72)';
      ctx.fillRect(x, RESULT_TAB_RECT.y, 78, RESULT_TAB_RECT.height);
      ctx.fillStyle = active ? UI_PALETTE.oldRed : '#514d53';
      ctx.fillRect(x, RESULT_TAB_RECT.y + RESULT_TAB_RECT.height - 2, 78, 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = active ? UI_PALETTE.paperLight : UI_PALETTE.paperDim;
      ctx.font = `bold 9px ${UI_FONT_STACK}`;
      ctx.fillText(label, x + 39, RESULT_TAB_RECT.y + 18);
    });

    if (this.resultTab === 'seal') this.renderResultSeal();
    else if (this.resultTab === 'items') this.renderResultItems();
    else if (this.resultTab === 'fates') this.renderResultFates();
    else this.renderResultStats();

    drawCutCornerPanel(
      ctx, RESULT_RESTART_RECT.x, RESULT_RESTART_RECT.y, RESULT_RESTART_RECT.width, RESULT_RESTART_RECT.height,
      UI_PALETTE.nightRaised, UI_PALETTE.oldRed, 3, 2,
    );
    uiTextures.drawButtonFrame(
      ctx, RESULT_RESTART_RECT.x, RESULT_RESTART_RECT.y, RESULT_RESTART_RECT.width, RESULT_RESTART_RECT.height, 0.76,
    );
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 16px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('再活一次', 180, 540);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(
      this.resultWon ? '他没有赢，只是终于松了这一口气。' : '他没有走完，但已经走过的都算数。',
      180, 600,
    );
  }

  private renderResultSeal(): void {
    const ctx = this.ctx;

    ctx.fillStyle = UI_PALETTE.paper;
    ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
    const identity = this.origin?.nickname ? `《${this.origin.nickname}》` : this.origin?.title || '没有留下名字的人';
    ctx.textAlign = 'left';
    ctx.fillText(identity, 190, 150);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`${AGE_LABELS[Math.min(this.encounterIndex, AGE_LABELS.length - 1)]} · ${this.items.length} 件物证`, 190, 169);

    ctx.fillStyle = '#403c40';
    ctx.fillRect(42, 176, 2, 250);
    for (let index = 0; index < AGE_LABELS.length; index += 1) {
      const y = 181 + index * 35;
      const reached = index <= this.encounterIndex;
      ctx.fillStyle = reached ? (index === this.encounterIndex ? UI_PALETTE.oldRed : UI_PALETTE.paper) : '#4b484e';
      ctx.fillRect(38, y, 10, 10);
      ctx.textAlign = 'left';
      ctx.fillStyle = reached ? UI_PALETTE.paperDim : '#56535a';
      ctx.font = `9px ${UI_FONT_STACK}`;
      ctx.fillText(AGE_LABELS[index]!, 58, y + 8);
    }

    this.drawHero(270, 315, 1.38, this.items);
    ctx.strokeStyle = '#4e494c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(206, 360);
    ctx.lineTo(330, 360);
    ctx.stroke();
    const combos = this.activeComboNames();
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.font = `bold 9px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(combos.length ? `《${combos[0]}》` : '尚未命名的一生', 270, 383, 126, 13, 2);

    const poisonMeanings: Record<PoisonKey, string> = {
      greed: '用占有抵抗失去', anger: '把受过的伤还回去', delusion: '用幻想维持关系',
      pride: '用体面确认价值', doubt: '用犹豫推迟结论',
    };
    const deepest = (Object.entries(this.poisons) as Array<[PoisonKey, number]>)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 2);
    drawStitchDivider(ctx, 20, 431, 320, 'horizontal', '#4d494d', 5, 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('这一身最深的两道痕 · 到这里才第一次落字', 20, 449);
    if ((deepest[0]?.[1] ?? 0) <= 0) {
      ctx.fillStyle = UI_PALETTE.paper;
      ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('没有哪一道执念，压过了其余几道。', 20, 478);
      return;
    }
    deepest.forEach(([key, value], index) => {
      const x = 20 + index * 160;
      ctx.fillStyle = UI_PALETTE.oldRed;
      ctx.font = `bold 14px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText(`${POISON_LABELS[key]} ${value}`, x, 470);
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `9px ${UI_FONT_STACK}`;
      ctx.fillText(this.fitText(poisonMeanings[key], 148), x, 484);
      ctx.fillStyle = '#7e7470';
      ctx.fillText(this.fitText(this.poisonFormationLine(key), 148), x, 497);
    });
  }

  private poisonFormationLine(key: PoisonKey): string {
    const related = this.fateReceipts.filter((receipt) => (receipt.event[receipt.direction].poison[key] ?? 0) > 0);
    if (!related.length) return '它从物件、沉默和日常里慢慢长深。';
    const swallowed = related.filter((receipt) => receipt.direction === 'swallow').length;
    if (swallowed === related.length) return `${related.length} 次咽下，把它留在了身体里。`;
    if (swallowed === 0) return `${related.length} 次吐出，让它有了清楚的形状。`;
    return `${related.length} 次回应，一起把它养深。`;
  }

  private renderResultItems(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`穿过的物证 · ${this.items.length}`, 20, 148);
    const visible = this.items.slice(-8);
    if (!visible.length) {
      ctx.fillStyle = UI_PALETTE.paper;
      ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('这一身没有来得及穿上什么。', 20, 198);
      return;
    }
    visible.forEach((id, index) => {
      const item = getItem(id);
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 20 + column * 162;
      const y = 166 + row * 78;
      this.drawItemSymbol(id, x + 18, y + 21, 14);
      ctx.fillStyle = item.color;
      ctx.font = `bold 9px ${UI_FONT_STACK}`;
      ctx.fillText(`${'ⅠⅡⅢⅣ'[item.quality - 1]} · ${item.qualityName}`, x + 42, y + 10);
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.font = `bold 10px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText(this.fitText(item.name, 112), x + 42, y + 28);
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `9px ${UI_FONT_STACK}`;
      this.wrapText(item.positive, x + 42, y + 44, 112, 11, 2);
      drawStitchDivider(ctx, x, y + 68, 150, 'horizontal', '#454147', 4, 4);
    });
    if (this.items.length > visible.length) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#777178';
      ctx.font = `9px ${UI_FONT_STACK}`;
      ctx.fillText(`更早还有 ${this.items.length - visible.length} 件`, 340, 486);
    }
  }

  private renderResultFates(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`咽下与吐出 · ${this.fateReceipts.length} 张回执`, 20, 148);
    const receipts = this.fateReceipts.slice(-4).reverse();
    if (!receipts.length) {
      ctx.fillStyle = UI_PALETTE.paper;
      ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('还没有哪件事来得及要求他回应。', 20, 198);
      return;
    }
    receipts.forEach((receipt, index) => {
      const y = 163 + index * 80;
      const response = receipt.event[receipt.direction];
      ctx.fillStyle = receipt.direction === 'swallow' ? UI_PALETTE.hospitalBlueGray : UI_PALETTE.oldRed;
      ctx.fillRect(20, y, 3, 66);
      ctx.font = `bold 9px ${UI_FONT_STACK}`;
      ctx.fillText(receipt.direction === 'swallow' ? '咽下' : '吐出', 32, y + 11);
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.font = `bold 10px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText(this.fitText(receipt.event.title, 212), 78, y + 11);
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `9px ${UI_FONT_STACK}`;
      ctx.fillText(this.fitText(`「${response.label}」`, 286), 32, y + 29);
      this.wrapText(receipt.result, 32, y + 45, 294, 11, 2);
      drawStitchDivider(ctx, 26, y + 70, 308, 'horizontal', '#454147', 4, 4);
    });
  }

  private renderResultStats(): void {
    const ctx = this.ctx;
    const vector = this.computeAttackVector();
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('最后留下的数字 · 不参与善恶评级', 20, 148);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 10px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('最后一口气', 20, 178);
    const vectorRows = [
      ['劲', (vector.damage / BASE_VECTOR.damage).toFixed(2)],
      ['速', (BASE_VECTOR.fireInterval / vector.fireInterval).toFixed(2)],
      ['程', (vector.range / BASE_VECTOR.range).toFixed(2)],
    ] as const;
    vectorRows.forEach(([label, value], index) => {
      const x = 20 + index * 108;
      ctx.fillStyle = UI_PALETTE.oldRed;
      ctx.font = `bold 16px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText(label, x, 211);
      ctx.fillStyle = UI_PALETTE.paper;
      ctx.font = `bold 12px ${UI_FONT_STACK}`;
      ctx.fillText(value, x + 25, 210);
    });
    drawStitchDivider(ctx, 20, 230, 320, 'horizontal', '#4d494d', 5, 4);
    const rows: Array<[string, string]> = [
      ['击倒', String(this.stats.kills)],
      ['造成伤害', String(Math.round(this.stats.damage))],
      ['吐出的气', String(this.stats.volleys)],
      ['穿过的物证', String(this.stats.itemsTaken)],
      ['花掉的零钱', String(this.stats.coinsSpent)],
      ['命运回执', String(this.stats.fateChoices)],
      ['咽下', String(this.stats.swallowed)],
      ['吐出', String(this.stats.exhaled)],
    ];
    rows.forEach(([label, value], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 20 + column * 164;
      const y = 264 + row * 52;
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `9px ${UI_FONT_STACK}`;
      ctx.fillText(label, x, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.font = `bold 13px ${UI_FONT_STACK}`;
      ctx.fillText(value, x + 142, y);
      ctx.textAlign = 'left';
      drawStitchDivider(ctx, x, y + 13, 142, 'horizontal', '#403d43', 4, 4);
    });
    ctx.fillStyle = '#777178';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`留下 ${this.memories.length} 条记忆 · 走到 ${AGE_LABELS[Math.min(this.encounterIndex, AGE_LABELS.length - 1)]}`, 20, 478);
  }

  private drawItemSymbol(id: ItemId, x: number, y: number, size: number): void {
    const ctx = this.ctx;
    const item = getItem(id);
    if (size >= 10) {
      const sprite = itemIconAtlas.slice(id);
      if (sprite) {
        const box = size * 2;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, Math.round(x - box / 2), Math.round(y - box / 2), box, box);
        ctx.restore();
        return;
      }
    }
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = item.color; ctx.fillStyle = item.color; ctx.lineWidth = Math.max(1.2, size * 0.09); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (id === 'loose-button') {
      ctx.beginPath(); ctx.arc(0, 0, size * 0.65, 0, Math.PI * 2); ctx.stroke();
      const holes: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (const [dx, dy] of holes) { ctx.beginPath(); ctx.arc(dx * size * 0.18, dy * size * 0.18, size * 0.06, 0, Math.PI * 2); ctx.fill(); }
    } else if (id === 'wooden-sword') {
      ctx.beginPath(); ctx.moveTo(-size * 0.55, size * 0.65); ctx.lineTo(size * 0.42, -size * 0.62); ctx.moveTo(-size * 0.35, size * 0.15); ctx.lineTo(size * 0.1, size * 0.5); ctx.stroke();
    } else if (id === 'red-workbook') {
      ctx.strokeRect(-size * 0.55, -size * 0.68, size * 1.1, size * 1.36); ctx.beginPath(); ctx.moveTo(-size * 0.32, -size * 0.32); ctx.lineTo(size * 0.32, size * 0.32); ctx.moveTo(size * 0.32, -size * 0.32); ctx.lineTo(-size * 0.32, size * 0.32); ctx.stroke();
    } else if (id === 'stone-schoolbag') {
      ctx.beginPath(); ctx.roundRect(-size * 0.62, -size * 0.48, size * 1.24, size * 1.1, size * 0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -size * 0.46, size * 0.35, Math.PI, Math.PI * 2); ctx.stroke();
    } else if (id === 'bleach-powder') {
      ctx.beginPath(); ctx.arc(-size * 0.2, size * 0.1, size * 0.38, 0, Math.PI * 2); ctx.arc(size * 0.25, -size * 0.08, size * 0.5, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'eyebrow-razor') {
      ctx.strokeRect(-size * 0.65, -size * 0.18, size * 1.3, size * 0.36); ctx.beginPath(); ctx.moveTo(-size * 0.45, 0); ctx.lineTo(size * 0.45, 0); ctx.stroke();
    } else if (id === 'od-pill') {
      ctx.save(); ctx.rotate(-0.6); ctx.beginPath(); ctx.roundRect(-size * 0.7, -size * 0.3, size * 1.4, size * 0.6, size * 0.3); ctx.fill(); ctx.fillStyle = '#eee1ea'; ctx.fillRect(0, -size * 0.3, size * 0.7, size * 0.6); ctx.restore();
    } else if (id === 'front-desk-letter' || id === 'first-salary') {
      this.drawEnvelope(-size * 0.72, -size * 0.45, size * 1.44, size * 0.9, item.color);
    } else if (id === 'cracked-glasses') {
      ctx.beginPath(); ctx.arc(-size * 0.38, 0, size * 0.38, 0, Math.PI * 2); ctx.arc(size * 0.38, 0, size * 0.38, 0, Math.PI * 2); ctx.moveTo(-size * 0.02, 0); ctx.lineTo(size * 0.02, 0); ctx.moveTo(size * 0.2, -size * 0.3); ctx.lineTo(size * 0.55, size * 0.3); ctx.stroke();
    } else if (id === 'small-uniform' || id === 'fathers-raincoat') {
      ctx.beginPath(); ctx.moveTo(-size * 0.25, -size * 0.68); ctx.lineTo(-size * 0.72, -size * 0.25); ctx.lineTo(-size * 0.48, size * 0.68); ctx.lineTo(size * 0.48, size * 0.68); ctx.lineTo(size * 0.72, -size * 0.25); ctx.lineTo(size * 0.25, -size * 0.68); ctx.closePath(); ctx.stroke();
      if (id === 'fathers-raincoat') { ctx.beginPath(); ctx.arc(0, -size * 0.55, size * 0.42, Math.PI, Math.PI * 2); ctx.stroke(); }
    } else if (id === 'only-key') {
      ctx.beginPath(); ctx.arc(-size * 0.3, -size * 0.25, size * 0.34, 0, Math.PI * 2); ctx.moveTo(-size * 0.08, 0); ctx.lineTo(size * 0.58, size * 0.64); ctx.lineTo(size * 0.72, size * 0.5); ctx.moveTo(size * 0.36, size * 0.42); ctx.lineTo(size * 0.5, size * 0.28); ctx.stroke();
    } else if (id === 'nameless-tie') {
      ctx.beginPath(); ctx.moveTo(0, -size * 0.68); ctx.lineTo(size * 0.27, -size * 0.35); ctx.lineTo(size * 0.14, size * 0.55); ctx.lineTo(0, size * 0.75); ctx.lineTo(-size * 0.14, size * 0.55); ctx.lineTo(-size * 0.27, -size * 0.35); ctx.closePath(); ctx.fill();
    } else if (id === 'unsent-phone') {
      ctx.beginPath(); ctx.roundRect(-size * 0.42, -size * 0.7, size * 0.84, size * 1.4, size * 0.12); ctx.stroke(); ctx.beginPath(); ctx.arc(0, size * 0.52, size * 0.05, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'baby-tooth') {
      ctx.beginPath(); ctx.moveTo(-size * 0.45, -size * 0.58); ctx.quadraticCurveTo(0, -size * 0.82, size * 0.45, -size * 0.58); ctx.lineTo(size * 0.25, size * 0.66); ctx.lineTo(0, size * 0.32); ctx.lineTo(-size * 0.25, size * 0.66); ctx.closePath(); ctx.fill();
    } else if (id === 'revoked-badge') {
      ctx.strokeRect(-size * 0.62, -size * 0.48, size * 1.24, size * 0.96); ctx.beginPath(); ctx.moveTo(-size * 0.4, size * 0.15); ctx.lineTo(size * 0.4, size * 0.15); ctx.stroke();
    } else if (id === 'slow-watch') {
      ctx.beginPath(); ctx.arc(0, 0, size * 0.57, 0, Math.PI * 2); ctx.moveTo(0, 0); ctx.lineTo(0, -size * 0.36); ctx.moveTo(0, 0); ctx.lineTo(size * 0.3, size * 0.18); ctx.stroke();
    } else if (id === 'missing-photo' || id === 'empty-frame') {
      ctx.strokeRect(-size * 0.62, -size * 0.72, size * 1.24, size * 1.44); if (id === 'missing-photo') { ctx.beginPath(); ctx.arc(-size * 0.2, -size * 0.2, size * 0.18, 0, Math.PI * 2); ctx.moveTo(-size * 0.5, size * 0.5); ctx.lineTo(-size * 0.2, size * 0.08); ctx.lineTo(size * 0.1, size * 0.5); ctx.stroke(); }
    } else if (id === 'white-bottle') {
      ctx.beginPath(); ctx.roundRect(-size * 0.42, -size * 0.55, size * 0.84, size * 1.15, size * 0.12); ctx.stroke(); ctx.strokeRect(-size * 0.25, -size * 0.72, size * 0.5, size * 0.2);
    } else {
      ctx.font = `bold ${Math.round(size * 1.15)}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText(item.glyph, 0, size * 0.4);
    }
    ctx.restore();
  }

  private drawEnvelope(x: number, y: number, width: number, height: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color; ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#786f67'; ctx.lineWidth = Math.max(0.6, width * 0.04);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width / 2, y + height * 0.58); ctx.lineTo(x + width, y); ctx.stroke();
  }

  private overlay(): void {
    this.ctx.fillStyle = 'rgba(7,8,11,.86)';
    this.ctx.fillRect(0, 0, W, H);
  }

  private panel(x: number, y: number, width: number, height: number, border: string): void {
    this.ctx.fillStyle = 'rgba(18,18,24,.96)';
    this.ctx.fillRect(x, y, width, height);
    this.ctx.strokeStyle = border;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  }

  private bar(x: number, y: number, width: number, height: number, ratio: number, color: string): void {
    this.ctx.fillStyle = '#292a31'; this.ctx.fillRect(x, y, width, height);
    this.ctx.fillStyle = color; this.ctx.fillRect(x, y, Math.max(0, width * this.clamp(ratio, 0, 1)), height);
  }

  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
    const ctx = this.ctx;
    if (maxLines <= 0) return;
    const lines: string[] = [];
    let line = '';
    let truncated = false;
    for (const character of text) {
      const next = line + character;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = character;
        if (lines.length >= maxLines) {
          truncated = true;
          break;
        }
      } else line = next;
    }
    if (!truncated && line && lines.length < maxLines) lines.push(line);
    if (truncated && lines.length) lines[lines.length - 1] = this.fitText(`${lines[lines.length - 1]}…`, maxWidth);
    lines.forEach((entry, lineIndex) => ctx.fillText(entry, x, y + lineIndex * lineHeight));
  }

  private fitText(text: string, maxWidth: number): string {
    const ctx = this.ctx;
    if (ctx.measureText(text).width <= maxWidth) return text;
    const characters = [...text];
    while (characters.length > 1 && ctx.measureText(`${characters.join('')}…`).width > maxWidth) characters.pop();
    return `${characters.join('')}…`;
  }

  private shuffle<T>(items: T[]): T[] {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.random() * (index + 1));
      const current = items[index];
      const swap = items[swapIndex];
      if (current !== undefined && swap !== undefined) {
        items[index] = swap;
        items[swapIndex] = current;
      }
    }
    return items;
  }

  private random(): number {
    let value = this.rngState += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private mixHex(first: string, second: string, ratio: number): string {
    const amount = this.clamp(ratio, 0, 1);
    const channels = (value: string) => {
      const hex = value.replace('#', '').padEnd(6, '0').slice(0, 6);
      return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
    };
    const from = channels(first);
    const to = channels(second);
    return `#${from.map((channel, index) => (
      Math.round(channel! + (to[index]! - channel!) * amount).toString(16).padStart(2, '0')
    )).join('')}`;
  }

  private setupProjectileAudit(): void {
    if (this.state === 'title') this.startRun(0x20260718);
    this.initialItemReward = false;
    this.hero.maxHp = 999;
    this.hero.hp = 999;
    this.encounterIndex = 2;
    this.startStage();
    this.items = [
      'front-desk-letter', 'red-workbook', 'stone-schoolbag', 'only-key', 'broken-spine',
      'fathers-raincoat', 'three-day-visible', 'always-crying',
    ];
    this.poisons.delusion = 8;
    this.poisons.doubt = 8;
    this.shotTimer = 999;
    this.spawnPause = 999;
    this.enemies = [];
    const target = this.createSeekingEnemy('debt', this.heroX + 160, this.heroY - 14);
    target.speed = 0;
    target.attackCooldown = 99;
    target.maxHp = 9999;
    target.hp = 9999;
    this.enemies.push(target);
    this.projectiles = [];
    this.spawnProjectile({
      x: this.heroX, y: this.heroY - 14, angle: 0,
      damage: 24, speed: 8, radius: 9, range: 300, life: 40,
      pierce: 2, returning: true, homing: 0.28, splitChance: 1,
      explosion: 22, generation: 0, color: '#d8d0bb', style: 'paper',
      critical: false, knockback: 8,
    });
    const parent = this.projectiles[0];
    if (parent) {
      this.pushProjectile(this.makeChildProjectile(parent, -0.42));
      this.pushProjectile(this.makeChildProjectile(parent, 0.42));
    }
    this.releaseRain();
    this.spawnOrbitRing();
  }

  private installTestHooks(): void {
    const host = window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
      zhe_yi_shen_test?: (action: 'start' | 'reveal-origin' | 'clear' | 'choose-first' | 'swallow' | 'exhale' | 'open-fate' | 'special' | 'leave-special' | 'shop' | 'buy-first' | 'reroll-shop' | 'combo' | 'boss' | 'battle' | 'projectile-audit' | 'father' | 'father-phase2' | 'telegraph' | 'win' | 'equip' | 'pause', payload?: unknown) => void;
    };
    const renderGameState = () => JSON.stringify({
      coordinateSystem: 'origin top-left; +x right; +y down; logical 360x640',
      state: this.state,
      paused: this.paused,
      pauseTab: this.pauseTab,
      resultTab: this.resultTab,
      seed: this.runSeed,
      encounter: this.encounterIndex,
      encounterName: STAGES[this.encounterIndex]?.title || '完成',
      battleTime: Number(this.battleTime.toFixed(2)),
      heroPos: { x: Math.round(this.heroX), y: Math.round(this.heroY) },
      transitionTimer: Number(this.transitionTimer.toFixed(2)),
      worldDoor: this.worldDoor ? { kind: this.worldDoor.kind, x: Math.round(this.worldDoor.x), y: Math.round(this.worldDoor.y), ttl: Number(this.worldDoor.ttl.toFixed(1)) } : null,
      worldStall: this.worldStall ? { x: Math.round(this.worldStall.x), y: Math.round(this.worldStall.y) } : null,
      worldReward: this.worldReward ? {
        x: Math.round(this.worldReward.x), y: Math.round(this.worldReward.y),
        ttl: Number(this.worldReward.ttl.toFixed(1)), choices: this.worldReward.choices,
      } : null,
      darkness: this.darkActive ? Math.round(this.darkR) : null,
      hero: { hp: Math.round(this.hero.hp), maxHp: this.hero.maxHp, block: this.hero.block, coins: this.hero.coins },
      vector: this.computeAttackVector(),
      vectorFlags: attackVectorFlags(this.computeAttackVector()),
      origin: this.aiOriginState === 'gpt' ? this.origin : null,
      originProgress: this.aiOriginState === 'gpt'
        ? Number((this.originElapsed / this.originStoryDuration()).toFixed(2))
        : 0,
      ai: { origin: this.aiOriginState, originAttempt: this.originAttempt, fate: this.aiFateState },
      poisons: this.poisons,
      memories: this.memories,
      currentFate: this.currentFate,
      fateDestination: this.fateDestination,
      fateDragX: Math.round(this.fateDragX),
      fateResultDirection: this.fateResultDirection ?? null,
      fateFreeWait: {
        waiting: this.fateFreeWaiting,
        elapsed: Number(this.fateFreeWaitElapsed.toFixed(2)),
        cancelAvailable: this.fateFreeWaitElapsed >= FATE_FREE_CANCEL_DELAY,
      },
      fateBuild: this.fateBuild,
      fateReceipts: this.fateReceipts.map((receipt) => ({ id: receipt.event.id, direction: receipt.direction, result: receipt.result })),
      items: this.items,
      combos: this.activeComboNames(),
      odDistortion: this.odBoost ? { boost: this.odBoost, penalty: this.odPenalty } : null,
      enemies: this.enemies.filter((enemy) => !enemy.dead).map((enemy) => ({ type: enemy.type, hp: Math.round(enemy.hp), x: Math.round(enemy.x), y: Math.round(enemy.y) })),
      combatPools: {
        enemies: this.enemies.length,
        projectiles: this.projectiles.length,
        pendingShots: this.pendingShots.length,
        bursts: this.bursts.length,
        enemyDeaths: this.enemyDeaths.length,
        coinDrops: this.coinDrops.length,
        limits: {
          projectiles: MAX_PROJECTILES,
          pendingShots: MAX_PENDING_SHOTS,
          bursts: MAX_BURSTS,
          enemyDeaths: MAX_ENEMY_DEATHS,
          coinDrops: MAX_COIN_DROPS,
        },
      },
      joystick: {
        active: this.joyPointerId !== -1,
        base: { x: Math.round(this.joyBaseX), y: Math.round(this.joyBaseY) },
        input: { x: Math.round(this.joyDX), y: Math.round(this.joyDY) },
        inputRadius: JOYSTICK_INPUT_RADIUS,
        knobTravel: JOYSTICK_KNOB_TRAVEL,
      },
      projectiles: this.projectiles.length,
      projectileSamples: this.projectiles.slice(0, 24).map((projectile) => ({
        style: projectile.style,
        form: projectile.visual.form,
        trail: projectile.visual.trail,
        flags: projectileFlags(projectile),
        damage: Number(projectile.damage.toFixed(1)),
        radius: Number(projectile.radius.toFixed(1)),
        homing: Number(projectile.homing.toFixed(2)),
        splitChance: Number(projectile.splitChance.toFixed(2)),
        splitDepth: projectile.splitDepth,
        areaDamage: Number(projectile.explosion.toFixed(1)),
        generation: projectile.generation,
        orbit: Boolean(projectile.orbit),
      })),
      itemChoices: this.itemRewardChoices,
      shop: this.shopOffers,
      shopFeedback: this.shopFeedback
        ? {
            kind: this.shopFeedback.kind,
            index: this.shopFeedback.index,
            timer: Number(this.shopFeedback.timer.toFixed(2)),
            total: this.shopFeedback.total,
          }
        : null,
      specialRoom: {
        kind: this.specialRoomKind,
        offers: this.specialRoomOffers,
        taken: [...this.specialRoomTaken],
        focus: this.specialRoomFocus,
      },
      stats: this.stats,
      audit: import.meta.env.DEV ? {
        timeScale: this.auditTimeScale,
        endurance: this.auditEndurance,
        autoMove: this.auditAutoMove,
        damageTaken: Math.round(this.auditDamageTaken),
      } : undefined,
    });
    host.render_game_to_text = renderGameState;
    this.renderGameState = renderGameState;
    host.advanceTime = (ms: number) => {
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      for (let index = 0; index < steps; index += 1) this.update(FIXED_STEP);
      this.render();
    };
    if (import.meta.env.DEV) {
      const auditParams = new URLSearchParams(window.location.search);
      const requestedAuditSpeed = Number.parseFloat(auditParams.get('audit-speed') ?? '');
      if (Number.isFinite(requestedAuditSpeed)) this.auditTimeScale = this.clamp(requestedAuditSpeed, 1, 12);
      this.auditEndurance = auditParams.get('audit-endurance') === '1';
      this.auditAutoMove = auditParams.get('audit-auto-move') === '1';
      const auditRoom = auditParams.get('audit-room');
      if (auditRoom === 'light' || auditRoom === 'back') {
        this.runSeed = 0x20260722;
        this.rngState = this.runSeed;
        this.hero.maxHp = 80;
        this.hero.hp = 80;
        this.openSpecialRoom(auditRoom);
      } else {
        const auditResult = auditParams.get('audit-result');
        if (auditResult === 'won' || auditResult === 'lost') {
          this.runSeed = 0x20260722;
          this.rngState = this.runSeed;
          this.encounterIndex = auditResult === 'won' ? STAGES.length - 1 : 2;
          this.items = ['front-desk-letter', 'fathers-raincoat', 'broken-spine', 'only-key', 'moms-bowl', 'held-elevator'];
          this.poisons = { greed: 3, anger: 1, delusion: 5, pride: 2, doubt: 4 };
          this.memories = ['有人把门留了一条缝', '他有一次真的说了不', '雨停以后，他还是把伞收好了'];
          this.stats = {
            fateChoices: 3, swallowed: 2, exhaled: 1, volleys: 318,
            kills: 147, damage: 4821, itemsTaken: this.items.length, coinsSpent: 11,
          };
          for (let index = 0; index < 3; index += 1) {
            const event = generateLocalFateEvent(this.buildLifeSnapshot(), () => this.random());
            const direction: FateDirection = index === 1 ? 'exhale' : 'swallow';
            this.fateReceipts.push({ event, direction, result: event[direction].result });
          }
          this.endRun(auditResult === 'won');
          this.resultStartedAt = performance.now() - 1800;
          const resultTab = auditParams.get('tab');
          if (RESULT_TABS.includes(resultTab as ResultTab)) this.resultTab = resultTab as ResultTab;
        } else {
          const auditScreen = auditParams.get('audit-screen');
          if (auditScreen === 'reward' || auditScreen === 'shop' || auditScreen === 'boss' || auditScreen === 'fate' || auditScreen === 'ai-fate' || auditScreen === 'projectile') {
            this.runSeed = 0x20260722;
            this.rngState = this.runSeed;
            this.encounterIndex = 2;
            const auditAge = Number.parseInt(auditParams.get('audit-age') ?? '', 10);
            if (Number.isFinite(auditAge)) {
              this.encounterIndex = Math.max(0, Math.min(STAGES.length - 1, auditAge));
            }
            this.hero.maxHp = 96;
            this.hero.hp = 72;
            this.hero.coins = 12;
            const auditCoins = Number.parseInt(auditParams.get('coins') ?? '', 10);
            if (Number.isFinite(auditCoins)) this.hero.coins = Math.max(0, Math.min(99, auditCoins));
            this.items = ['front-desk-letter', 'eyebrow-razor'];
            if (auditScreen === 'projectile') {
              this.setupProjectileAudit();
            } else if (auditScreen === 'reward') {
              this.rewardTitle = '这一段路，缩成了三件东西';
              this.initialItemReward = false;
              this.itemRewardChoices = ['fathers-raincoat', 'broken-spine', 'moms-bowl'];
              this.state = 'itemReward';
            } else if (auditScreen === 'shop') {
              this.shopOffers = [
                { item: 'wooden-sword', price: 3, sold: false },
                { item: 'only-key', price: 5, sold: false },
                { item: 'unsent-phone', price: 4, sold: false },
              ];
              this.state = 'shop';
            } else if (auditScreen === 'boss') {
              this.initialItemReward = false;
              this.hero.maxHp = 999;
              this.hero.hp = 999;
              this.encounterIndex = 1;
              this.startStage();
              this.enemies = [];
              const boss = this.createSeekingEnemy('uniform-answer', this.heroX, this.heroY - 108);
              boss.speed = 0;
              boss.attackCooldown = 99;
              this.enemies.push(boss);
              this.eliteAlertName = '';
              this.eliteAlertTime = 0;
            } else if (auditScreen === 'fate') {
              this.currentFate = generateLocalFateEvent(this.buildLifeSnapshot(), () => this.random());
              this.aiFateState = 'fallback';
              this.fateDestination = 'advance';
              this.fateAnim = 1;
              this.fateResultDirection = undefined;
              this.state = 'fateEvent';
            } else {
              this.enemies = [];
              this.state = 'battle';
              this.openFate('advance');
            }
          }
        }
      }
      if (auditParams.get('audit-joystick') === 'edge' && this.state === 'battle') {
        this.joyPointerId = 999;
        this.joyStartX = 10;
        this.joyStartY = 630;
        this.joyBaseX = this.clamp(this.joyStartX, JOYSTICK_SAFE_X, W - JOYSTICK_SAFE_X);
        this.joyBaseY = this.clamp(this.joyStartY, JOYSTICK_SAFE_TOP, JOYSTICK_SAFE_BOTTOM);
        this.updateJoystickInput(128, 524);
      }
      if (auditParams.get('audit-free-wait') === 'ready' && this.state === 'fateEvent') {
        this.fateFreeWaiting = true;
        this.fateFreeWaitElapsed = FATE_FREE_CANCEL_DELAY;
        this.fateFreeRequestId += 1;
      }
      host.zhe_yi_shen_test = (action, payload?: unknown) => {
        if (action === 'equip' && Array.isArray(payload)) {
          this.items = payload.filter((id): id is ItemId => typeof id === 'string' && ITEM_IDS.includes(id as ItemId));
          this.render();
          return;
        }
        if (action === 'pause' && (this.state === 'battle' || this.state === 'fateEvent')) {
          this.setPaused(!this.paused);
          this.render();
          return;
        }
        if (action === 'start') this.startRun(0x20260718);
        if (action === 'reveal-origin' && this.state === 'origin' && this.aiOriginState === 'gpt') {
          this.originElapsed = this.originStoryDuration();
        }
        if (action === 'choose-first') {
          if (this.state === 'itemReward') this.chooseItemReward(0);
        }
        if (action === 'swallow') this.resolveFate('swallow');
        if (action === 'exhale') this.resolveFate('exhale');
        if (action === 'open-fate' && this.state === 'battle') this.openFate('advance');
        if (action === 'clear') {
          this.enemies.forEach((enemy) => { if (!enemy.dead && !enemy.elite && !enemy.boss) this.damageEnemy(enemy, enemy.hp + 1, '#fff'); });
          if (this.state === 'battle' && STAGES[this.encounterIndex]?.end !== 'final') this.beginStageTransition();
        }
        if (action === 'shop') {
          if (this.state === 'title') this.startRun(0x20260718);
          this.setupShop();
          this.state = 'shop';
        }
        if (action === 'special') {
          const kind = payload === 'light' || payload === 'back' ? payload : undefined;
          this.openSpecialRoom(kind);
        }
        if (action === 'leave-special') this.leaveSpecialRoom();
        if (action === 'buy-first') this.buyShopOffer(0);
        if (action === 'reroll-shop') this.rerollShop();
        if (action === 'combo') {
          this.startRun(0x20260718);
          this.initialItemReward = false;
          this.encounterIndex = 4;
          this.startStage();
          for (const comboId of ['front-desk-letter', 'fathers-raincoat', 'eyebrow-razor', 'od-pill'] as ItemId[]) {
            this.acquireItem(comboId);
          }
          this.hero.maxHp = 500;
          this.hero.hp = 500;
        }
        if (action === 'battle') {
          // 视觉审查用：跳进第 1 阶段战斗，血量拉满，不依赖 AI 出生
          if (this.state === 'title') this.startRun(0x20260718);
          this.initialItemReward = false;
          this.hero.maxHp = 999;
          this.hero.hp = 999;
          this.encounterIndex = 0;
          this.startStage();
        }
        if (action === 'projectile-audit') {
          this.setupProjectileAudit();
        }
        if (action === 'father') {
          if (this.state === 'title') this.startRun(0x20260718);
          this.initialItemReward = false;
          this.hero.maxHp = 999;
          this.hero.hp = 999;
          this.encounterIndex = 3;
          this.startStage();
          this.battleTime = (STAGES[this.encounterIndex]?.bossAt ?? 0) - 0.1;
          this.update(FIXED_STEP * 7);
        }
        if (action === 'father-phase2') {
          const father = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'silent-father');
          if (father) {
            father.hp = father.maxHp * 0.49;
            father.phase = 2;
          }
        }
        if (action === 'telegraph' && typeof payload === 'string') {
          const bossStages: Partial<Record<EnemyType, number>> = {
            'uniform-answer': 1,
            'last-bus': 2,
            'silent-father': 3,
            'debt-collector': 4,
            'lamp-keeper': 5,
          };
          const type = payload as EnemyType;
          const stageIndex = bossStages[type];
          if (stageIndex !== undefined) {
            if (this.state === 'title') this.startRun(0x20260718);
            this.initialItemReward = false;
            this.hero.maxHp = 999;
            this.hero.hp = 999;
            this.encounterIndex = stageIndex;
            this.startStage();
            this.enemies = [];
            const enemy = this.createSeekingEnemy(type, this.heroX, this.heroY - 128);
            if (type === 'uniform-answer') enemy.mechTimer = 7.35;
            if (type === 'last-bus') { enemy.phase = 1; enemy.mechTimer = 0.58; }
            if (type === 'silent-father') { enemy.phase = 2; enemy.phaseFlashTimer = 0.8; }
            if (type === 'debt-collector') enemy.mechTimer = 6.4;
            if (type === 'lamp-keeper') enemy.mechTimer = 9.2;
            this.enemies.push(enemy);
          }
        }
        if (action === 'boss') {
          if (this.state === 'title') this.startRun(0x20260718);
          this.initialItemReward = false;
          this.hero.hp = Math.max(this.hero.hp, this.hero.maxHp);
          this.encounterIndex = STAGES.length - 1;
          this.startStage();
          this.battleTime = DARKNESS_START - 2;
        }
        if (action === 'win') {
          this.endRun(true);
        }
        this.render();
      };
      if (auditParams.has('audit-screen')) {
        const previousMirror = document.querySelector('#game-state-audit');
        previousMirror?.remove();
        const stateMirror = document.createElement('pre');
        stateMirror.id = 'game-state-audit';
        stateMirror.hidden = true;
        document.body.appendChild(stateMirror);
        const refreshStateMirror = () => { stateMirror.textContent = renderGameState(); };
        refreshStateMirror();
        window.setInterval(refreshStateMirror, 250);
      }
    }
  }
}
