import { generateAIFate, generateAIFateResult, generateAIFreeFate, generateAIOrigin, type AIGenerationState } from './ai';
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
import { POISON_LABELS } from './types';
import { PROP_VARIANTS, worldEntityAtlas, worldPropAtlas } from './world-props';
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
const HERO_BASE_SPEED = 132;
const MAX_ALIVE_ENEMIES = 18;
const HURT_IFRAME = 0.75;
const HERO_ATTACK_ANIMATION_DURATION = 0.22;
const TITLE_BACKGROUND_URL = new URL('./assets/ui/title-life-night.png', import.meta.url).href;

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
  color: string;
  style: ProjectileStyle;
  critical: boolean;
  knockback: number;
  generation: number;
  shrink?: boolean;
}

interface StageSpec {
  chapter: string;
  title: string;
  subtitle: string;
  duration: number;
  pool: EnemyType[];
  spawnEvery: number;
  bossAt?: number;
  bossType?: EnemyType;
  stallAt?: number;
  doorAt?: number;
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
    duration: 60, pool: ['cry-moth', 'fear', 'hunger-shadow'], spawnEvery: 2.5, bossAt: 34, bossType: 'closet-dark', end: 'advance',
    enterLine: '出生证明上按了手印。没人问他同不同意。',
    groundTop: '#2d2433', groundBottom: '#1c1722', propColor: '#5b4d64',
  },
  {
    chapter: '少年 · 千眼教室', title: '统一答案', subtitle: '所有目光都在批改你',
    duration: 70, pool: ['red-mark', 'whisper'], spawnEvery: 2.3,
    bossAt: 44, bossType: 'uniform-answer', end: 'fate',
    enterLine: '他的理想写在作文里。得了 38 分。',
    groundTop: '#29323b', groundBottom: '#1a2027', propColor: '#536572',
  },
  {
    chapter: '青年 · 齿轮车站', title: '错过的那一班', subtitle: '每个人都像比你早一步',
    duration: 75, pool: ['clockwork', 'whisper', 'red-mark'], spawnEvery: 1.9, stallAt: 14, bossAt: 49, bossType: 'last-bus', end: 'advance',
    enterLine: '老师说，社会会教他做人。社会确实教了。',
    groundTop: '#30291f', groundBottom: '#1d1914', propColor: '#746344',
  },
  {
    chapter: '成年 · 屋檐下的家', title: '沉默的父亲', subtitle: '盔甲里面也是一个害怕的男孩',
    duration: 80, pool: ['missed-call', 'whisper', 'silence', 'debt'], spawnEvery: 1.75,
    bossAt: 54, bossType: 'silent-father', doorAt: 24, end: 'fate',
    enterLine: '他管那间屋子叫家。房东管它叫房源。',
    groundTop: '#29382f', groundBottom: '#17231d', propColor: '#536f60',
  },
  {
    chapter: '中年 · 没有关灯的办公室', title: '名字还在表格里', subtitle: '门已经打不开了',
    duration: 75, pool: ['debt', 'clockwork', 'badge-thief', 'whisper'], spawnEvery: 1.55, stallAt: 13, doorAt: 26, bossAt: 49, bossType: 'debt-collector', end: 'fate',
    enterLine: '体检单比工资单先到。',
    groundTop: '#303740', groundBottom: '#1c2027', propColor: '#66727d',
  },
  {
    chapter: '暮年 · 白发荒原', title: '收灯人', subtitle: '它不凶，也不坏，它只是准时',
    duration: 95, pool: ['forgetter', 'whisper', 'debt', 'empty-chair'], spawnEvery: 1.8, end: 'final',
    enterLine: '工牌收走那天，他愣了一下，才想起来自己姓什么。',
    groundTop: '#2d313a', groundBottom: '#191c23', propColor: '#626a76',
  },
];

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
  private shopOffers: ShopOffer[] = [];
  private specialRoomKind: SpecialRoomKind = 'light';
  private specialRoomOffers: ItemId[] = [];
  private specialRoomTaken = new Set<ItemId>();
  private strainTendency = 0;
  private lightTendency = 0;
  private initialItemReward = false;
  private rewardTitle = '';
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
  private entityId = 1;
  private runSeed = 0;
  private rngState = 0x20260718;
  private runSerial = 0;
  private coinKillProgress = 0;
  private stats: RunStats = { fateChoices: 0, swallowed: 0, exhaled: 0, volleys: 0, kills: 0, damage: 0, itemsTaken: 0, coinsSpent: 0 };
  private lastTime = 0;
  private accumulator = 0;
  private visualTime = 0;
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
  private ktvTimer = 0;
  private synergySeen = new Set<string>();
  private watchReleaseTimer = 0;
  private heartCount = 0;
  private answeredUsedStage = false;
  private usefulTimer = 0;
  private lastSighMark = 0;
  private fateFreeWaiting = false;
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
      const p = point(event);
      if (this.state === 'title' || this.state === 'result') {
        if (p.y > 430 && p.y < 550) this.startRun();
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
        if (this.joyPointerId !== -1) return;
        this.joyPointerId = event.pointerId;
        this.joyBaseX = p.x;
        this.joyBaseY = p.y;
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
        if (!this.currentFate || this.fateAnim < 0.75 || this.fatePointerId !== -1 || this.fateFreeWaiting) return;
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
        this.chooseItemReward(Math.floor((p.y - 88) / 152));
        return;
      }
      if (this.state === 'shop') {
        if (p.y >= 88 && p.y < 544) this.buyShopOffer(Math.floor((p.y - 88) / 152));
        else if (p.y >= 550 && p.x < 175) this.rerollShop();
        else if (p.y >= 550) this.leaveShop();
        return;
      }
      if (this.state === 'specialRoom') {
        if (p.y >= 135 && p.y <= 505) this.takeSpecialOffer(Math.floor(p.x / 120));
        else if (p.y >= 550) this.leaveSpecialRoom();
      }
    });

    this.canvas.addEventListener('pointermove', (event) => {
      const p = point(event);
      if (this.state === 'battle' && event.pointerId === this.joyPointerId) {
        this.joyDX = this.clamp(p.x - this.joyBaseX, -46, 46);
        this.joyDY = this.clamp(p.y - this.joyBaseY, -46, 46);
        return;
      }
      if (this.state !== 'fateEvent' || !this.fateDragging || this.fateResultDirection
        || event.pointerId !== this.fatePointerId) return;
      this.fateDragX = this.clamp(p.x - this.fateDragStartX, -150, 150);
    });

    const finishFateDrag = (event: PointerEvent) => {
      if (event.pointerId === this.joyPointerId) {
        this.joyPointerId = -1;
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
      if (event.pointerId === this.joyPointerId) {
        this.resetMovementInput();
        return;
      }
      if (event.pointerId === this.fatePointerId) this.resetFateInput();
    });
    this.canvas.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === this.joyPointerId) {
        this.joyPointerId = -1;
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
      const lower = event.key.toLowerCase();
      const movementKey = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(lower);
      if (this.state === 'battle' && movementKey) {
        this.moveKeys.add(lower);
        event.preventDefault();
      }
      if ((this.state === 'title' || this.state === 'result') && (event.key === 'Enter' || event.key === ' ')) {
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
      if (this.state === 'itemReward' && digit >= 1 && digit <= 3) this.chooseItemReward(digit - 1);
      if (this.state === 'shop' && digit >= 1 && digit <= 3) this.buyShopOffer(digit - 1);
      if (this.state === 'shop' && (event.key === 'r' || event.key === 'R')) this.rerollShop();
      if (this.state === 'shop' && event.key === 'Enter') this.leaveShop();
      if (this.state === 'specialRoom' && digit >= 1 && digit <= 3) this.takeSpecialOffer(digit - 1);
      if (this.state === 'specialRoom' && event.key === 'Enter') this.leaveSpecialRoom();
    });

    window.addEventListener('keyup', (event) => {
      this.moveKeys.delete(event.key.toLowerCase());
    });

    window.addEventListener('blur', () => {
      this.resetMovementInput();
      this.resetFateInput();
    });

    document.addEventListener('visibilitychange', () => {
      this.lastTime = 0;
      if (document.hidden) {
        this.resetMovementInput();
        this.resetFateInput();
      }
    });
  }

  private resetMovementInput(): void {
    this.moveKeys.clear();
    this.heroMoving = false;
    const pointerId = this.joyPointerId;
    this.joyPointerId = -1;
    this.joyDX = 0;
    this.joyDY = 0;
    if (pointerId !== -1 && this.canvas.hasPointerCapture?.(pointerId)) {
      this.canvas.releasePointerCapture?.(pointerId);
    }
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
    this.resetMovementInput();
    this.resetFateInput();
    this.runSerial += 1;
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
    this.specialRoomOffers = [];
    this.specialRoomTaken.clear();
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
    this.itemRewardChoices = [];
    this.coinKillProgress = 0;
    this.stats = { fateChoices: 0, swallowed: 0, exhaled: 0, volleys: 0, kills: 0, damage: 0, itemsTaken: 0, coinsSpent: 0 };
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
    this.transitionTimer = 3.4;
    this.projectiles = [];
    for (const enemy of this.enemies) {
      if (!enemy.dead) {
        enemy.dead = true;
        this.burst('ring', enemy.x, enemy.y, enemy.radius * 2, '#5a5750');
      }
    }
    const next = STAGES[this.encounterIndex + 1];
    if (next) {
      this.caption = next.enterLine;
      this.captionTime = 4.5;
    }
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
    const serial = this.runSerial;
    void generateAIFreeFate({
      event: { id: event.id, title: event.title, fact: event.fact },
      playerText: text,
      snapshot: this.buildLifeSnapshot(),
    }).then((outcome) => {
      if (this.runSerial !== serial || this.state !== 'fateEvent' || this.fateResultDirection || this.currentFate !== event) return;
      this.fateFreeWaiting = false;
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
        'uniform-answer': '所有目光都在批改你',
        'last-bus': '末班车不等人。它撞人',
        'silent-father': '雨声先到，父亲后到',
        'debt-collector': '门被敲响了。它有你的地址',
      };
      const bossSpawn = this.createSeekingEnemy(stage.bossType, this.heroX, this.heroY - 240);
      this.enemies.push(bossSpawn);
      this.eliteAlertName = bossSpawn.name;
      this.eliteAlertTime = 2.4;
      this.caption = bossLines[stage.bossType] ?? stage.title;
      this.captionTime = 4.5;
    }

    if (stage.stallAt !== undefined && this.stallSpawnedAt !== this.encounterIndex && this.battleTime >= stage.stallAt) {
      this.stallSpawnedAt = this.encounterIndex;
      const angle = this.random() * Math.PI * 2;
      this.worldStall = { x: this.heroX + Math.cos(angle) * 210, y: this.heroY + Math.sin(angle) * 210 };
      this.say('前面有个亮着灯的摊位');
    }

    if (stage.doorAt !== undefined && !this.doorTriedThisStage && !this.doorUsed && this.battleTime >= stage.doorAt) {
      this.doorTriedThisStage = true;
      const guaranteed = this.encounterIndex >= 4;
      if (guaranteed || this.random() < 0.45) {
        const kind = this.pickSpecialKind();
        const angle = this.random() * Math.PI * 2;
        this.worldDoor = { kind, x: this.heroX + Math.cos(angle) * 240, y: this.heroY + Math.sin(angle) * 240, ttl: 22 };
        this.say(kind === 'light' ? '远处亮起一盏暖黄的窗灯' : '一道帘子后面闪着冷白的灯');
      }
    }
    if (this.worldDoor) {
      this.worldDoor.ttl -= dt;
      if (this.worldDoor.ttl <= 0) {
        this.worldDoor = undefined;
        this.say('门沉回了黑暗里');
      } else if (Math.hypot(this.heroX - this.worldDoor.x, this.heroY - this.worldDoor.y) < 34) {
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
    if (this.coinDrops.length > 70) this.coinDrops.shift();
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
    const delta = Math.min(0.05, (time - this.lastTime) / 1000);
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
    this.visualTime += dt;
    if (this.toastTime > 0) this.toastTime -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt);
    if (this.eliteAlertTime > 0) this.eliteAlertTime = Math.max(0, this.eliteAlertTime - dt);
    this.bursts.forEach((burst) => (burst.life -= dt));
    this.bursts = this.bursts.filter((burst) => burst.life > 0);
    this.enemyDeaths.forEach((death) => (death.life -= dt));
    this.enemyDeaths = this.enemyDeaths.filter((death) => death.life > 0);
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
      if (this.fateResultDirection) {
        if (this.fateExitTimer > 0) this.fateExitTimer -= dt;
        else if (this.fateResultMinTimer > 0) this.fateResultMinTimer -= dt;
        return;
      }
    }
    if (this.state !== 'battle') return;
    if (this.captionTime > 0) this.captionTime -= dt;
    if (this.comboReveal) {
      this.comboReveal.timer -= dt;
      if (this.comboReveal.timer <= 0) this.comboReveal = undefined;
    }
    if (!this.comboReveal && this.comboRevealQueue.length > 0) {
      const def = this.comboRevealQueue.shift()!;
      this.comboReveal = { name: def.name, artKey: def.artKey, line: def.line, timer: 3.4, total: 3.4 };
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
          pierce: shot.pierce, returning: false, homing: shot.homing, splitChance: 0,
          explosion: 0, generation: shot.generation, color: shot.color, style: shot.style,
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
        for (let index = 0; index < 10; index += 1) {
          const angle = (index / 10) * Math.PI * 2;
          this.spawnProjectile({
            x: this.heroX, y: this.heroY - 12, angle, damage: roar.damage * 0.9,
            speed: roar.projectileSpeed * 0.8, radius: Math.max(3, roar.width * 0.9),
            range: 150, life: 1.2, pierce: roar.pierce + 1, returning: false,
            homing: 0, splitChance: 0, explosion: 0, generation: 0, style: 'sound',
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
    return vector;
  }

  private negativeItemCount(): number {
    return this.items.filter((id) => !getItem(id).negative.includes('没有负面')).length;
  }

  private computeProjectileVisual(extraMaterial?: ProjectileVisual['materials'][number]): ProjectileVisual {
    const visual: ProjectileVisual = {
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
          this.pendingShots.push({
            delay: ha * 0.07, angle: angle + (ha - 2) * 0.018,
            damage: vector.damage * share * 1.1, speed: vector.projectileSpeed,
            radius: Math.max(2, vector.width * 0.72), range: vector.range, life: vector.lifetime,
            pierce: vector.pierce, homing: vector.homing,
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
        this.pendingShots.push({
          delay: 0.4, angle, damage: vector.damage * 0.35, speed: vector.projectileSpeed,
          radius: Math.max(2, vector.width * 0.8), range: vector.range, life: vector.lifetime,
          pierce: 0, homing: vector.homing, color: '#6f93a3', style,
          critical: false, knockback: vector.knockback * 0.4, generation: 1,
        });
      }
    }
    // 《年度听歌报告》：每第4轮把上一轮弹道原样重放一遍
    if (this.hasItem('year-report') && this.volleyCount % 4 === 0 && this.lastVolleyAngles.length > 0) {
      for (const angle of this.lastVolleyAngles) {
        this.spawnProjectile({
          x: this.heroX, y: this.heroY - 14, angle, damage: vector.damage * 0.6,
          speed: vector.projectileSpeed, radius: vector.width, range: vector.range,
          life: vector.lifetime, pierce: vector.pierce, returning: vector.returning,
          homing: vector.homing, splitChance: 0, explosion: 0, generation: 1, style,
          critical: false, knockback: vector.knockback * 0.6, color: '#8c81a0',
        });
      }
      this.burst('word', this.heroX, this.heroY - 52, 30, '#8c81a0', '循环播放');
    }
    this.lastVolleyAngles = volleyAngles;
    // 《等大家有空》：空相框复制合照的弹道，复制越多越褪色
    if (photoVolley && this.hasCombo('等大家有空')) {
      for (let copy = 0; copy < 2; copy += 1) {
        this.spawnProjectile({
          x: this.heroX, y: this.heroY - 14, angle: baseAngle + (copy === 0 ? -0.4 : 0.4),
          damage: vector.damage * (copy === 0 ? 0.8 : 0.65), speed: vector.projectileSpeed,
          radius: vector.width, range: vector.range, life: vector.lifetime, pierce: vector.pierce,
          returning: vector.returning, homing: vector.homing, splitChance: 0,
          explosion: vector.explosion, generation: 1, style, critical: false, knockback: vector.knockback,
          color: copy === 0 ? '#b6aa94' : '#8f887c',
        });
      }
    }
    this.sigh(1);
    if (this.hasItem('pregnancy-test') && this.volleyCount % 3 === 0) {
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 8, angle: baseAngle, damage: vector.damage * 0.8,
        speed: vector.projectileSpeed * 0.9, radius: Math.max(2.5, vector.width * 0.7),
        range: vector.range, life: vector.lifetime, pierce: vector.pierce,
        returning: vector.returning, homing: Math.max(0.1, vector.homing), splitChance: 0,
        explosion: 0, generation: 1, color: '#cdb8cf', style, critical: false, knockback: vector.knockback * 0.6,
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
    pierce: number; returning: boolean; homing: number; splitChance: number; explosion: number;
    generation: number; color: string; style: ProjectileStyle; critical: boolean; knockback?: number; visual?: ProjectileVisual;
    shrink?: boolean; orbit?: { angle: number; total: number; elapsed: number };
  }): void {
    const material = options.style === 'rain' ? 'water' : options.style === 'sound' ? 'signal' : undefined;
    this.projectiles.push({
      id: this.entityId++, x: options.x, y: options.y,
      vx: Math.cos(options.angle) * options.speed, vy: Math.sin(options.angle) * options.speed,
      radius: options.radius, damage: options.damage, knockback: options.knockback ?? 0, life: options.life, maxLife: options.life,
      distance: 0, maxDistance: options.range, pierce: options.pierce, pierceMax: options.pierce,
      returning: options.returning, reversals: 0, homing: options.homing, splitChance: options.splitChance,
      explosion: options.explosion, generation: options.generation, color: options.color,
      style: options.style, visual: options.visual ?? this.computeProjectileVisual(material),
      critical: options.critical, hitIds: [],
      shrink: options.shrink, orbit: options.orbit,
    });
  }

  /** 《朋友圈仅三天可见》：三枚环绕弹绕身三圈然后消失 */
  private spawnOrbitRing(): void {
    const vector = this.computeAttackVector();
    for (let index = 0; index < 3; index += 1) {
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 8, angle: (index / 3) * Math.PI * 2,
        damage: Math.max(3, vector.damage * 0.8), speed: 0, radius: Math.max(3, vector.width * 0.9),
        range: 99999, life: 2.6, pierce: 99, returning: false, homing: 0, splitChance: 0,
        explosion: 0, generation: 1, style: 'plain', critical: false, knockback: 5,
        color: '#9a94a6', orbit: { angle: (index / 3) * Math.PI * 2, total: 2.6, elapsed: 0 },
      });
    }
  }

  private releaseRain(): void {
    const vector = this.computeAttackVector();
    // 《他当年也是这样站着的》：两代人的雨下得更密；《那年他觉得自己很酷》：雨滴掉色
    const drops = this.hasCombo('他当年也是这样站着的') ? 14 : 9;
    const dropColor = this.hasCombo('那年他觉得自己很酷') ? '#cbb757' : '#7eb5bd';
    for (let index = 0; index < drops; index += 1) {
      const angle = (index / drops) * Math.PI * 2;
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 12, angle, damage: Math.max(3, vector.damage * 0.55),
        speed: 165, radius: 3.5, range: 230, life: 2.2, pierce: 1,
        returning: false, homing: 0.04, splitChance: 0, explosion: 0,
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
        // 环绕弹：绕身三圈，圈数走完即消散；命中判定内联
        projectile.orbit.elapsed += dt;
        const sweep = projectile.orbit.angle + (projectile.orbit.elapsed / projectile.orbit.total) * Math.PI * 6;
        projectile.x = this.heroX + Math.cos(sweep) * 42;
        projectile.y = this.heroY - 8 + Math.sin(sweep) * 42;
        projectile.life -= dt;
        for (const enemy of this.enemies) {
          if (enemy.dead || projectile.hitIds.includes(enemy.id)) continue;
          if (Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) < enemy.radius + projectile.radius + 2) {
            projectile.hitIds.push(enemy.id);
            this.damageEnemy(enemy, projectile.damage, projectile.color);
          }
        }
        continue;
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
        }
        // 协同：水×信号——声波过水会麻
        if (projectile.style === 'sound'
          && (this.hasItem('fathers-raincoat') || this.hasItem('always-crying'))
          && this.random() < 0.12) {
          enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, 0.6);
          this.noteSynergy('水是导电的');
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
          this.damageEnemy(enemy, hitDamage, projectile.color);
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
            if (wet) this.noteSynergy('湿了的更容易冻住');
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
        if (projectile.generation === 0 && this.random() < projectile.splitChance) {
          const angle = Math.atan2(projectile.vy, projectile.vx);
          for (const offset of [-0.45, 0.45]) spawned.push(this.makeChildProjectile(projectile, angle + offset));
        }
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
    this.projectiles.push(...spawned);
    this.projectiles = this.projectiles.filter((projectile) => (
      projectile.life > 0
      && Math.abs(projectile.x - this.heroX) < 340
      && Math.abs(projectile.y - this.heroY) < 430
    ));
  }

  private makeChildProjectile(parent: Projectile, angle: number): Projectile {
    const speed = Math.hypot(parent.vx, parent.vy) * 0.82;
    const dadBoost = this.hasItem('group-dad') ? 1.4 : 1;
    return {
      ...parent,
      id: this.entityId++, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: Math.max(2, parent.radius * 0.65), damage: parent.damage * 0.45 * dadBoost,
      life: parent.maxLife * 0.65, maxLife: parent.maxLife * 0.65,
      distance: 0, maxDistance: parent.maxDistance * 0.65, pierce: 0, pierceMax: 0,
      returning: false, reversals: 0, splitChance: 0, explosion: 0, generation: 1, hitIds: [],
    };
  }

  private explodeProjectile(projectile: Projectile): void {
    if (projectile.explosion <= 0) return;
    // 协同：重×爆炸——压过的地方塌得更大
    const heavyBlast = this.hasItem('stone-schoolbag') && (this.hasItem('only-key') || this.hasItem('empty-frame'));
    if (heavyBlast) this.noteSynergy('压过的地方塌得更大');
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

  private damageEnemy(enemy: EnemyUnit, amount: number, color: string): void {
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
    this.burst('hit', enemy.x, enemy.y, 18 + Math.min(24, amount), color);
    if (enemy.hp > 0) return;
    enemy.dead = true;
    if (this.hasCombo('我只在有用时被看见')) this.usefulTimer = 2.5;
    if (this.enemyDeaths.length >= 60) this.enemyDeaths.shift();
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
      const tearDamage = Math.max(3, this.computeAttackVector().damage * 0.4);
      for (let tearIndex = 0; tearIndex < 3; tearIndex += 1) {
        this.spawnProjectile({
          x: this.heroX, y: this.heroY - 10, angle: this.random() * Math.PI * 2,
          damage: tearDamage, speed: 200, radius: 3, range: 180, life: 1.6, pierce: 3,
          returning: false, homing: 0.08, splitChance: 0, explosion: 0,
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
      this.hero.hp -= remaining;
      this.flash = 0.24;
      this.screenShake = 0.22;
      this.burst('word', this.heroX, this.heroY - 58, 28, '#ef7181', `-${Math.ceil(remaining)}`);
      if (this.hasItem('eyebrow-razor') && this.hasItem('od-pill')) {
        for (let index = 0; index < 6; index += 1) {
          this.bursts.push({
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
    }
    if (this.hero.hp <= 0 && this.hasItem('funeral-photo') && !this.graceUsed && this.deathSaves < 3) {
      this.graceUsed = true;
      this.deathSaves += 1;
      this.graceTimer = 5;
      this.hero.hp = 1;
      this.hurtCooldown = 5;
      this.burst('ring', this.heroX, this.heroY - 20, 90, '#d8cfae');
      this.say('遗照上的笑 · 再撑五秒');
    }
    if (this.hero.hp <= 0 && this.hasItem('snow-screen') && !this.snowUsed && this.deathSaves < 3) {
      this.snowUsed = true;
      this.deathSaves += 1;
      this.hero.hp = 1;
      this.flash = 0.5;
      this.burst('word', this.heroX, this.heroY - 58, 70, '#c8d2d8', '雪花');
      this.say('雪花屏 · 这次伤害没有发生');
    }
    if (this.hero.hp <= 0 && this.toothReady && this.deathSaves < 3) {
      this.toothReady = false;
      this.deathSaves += 1;
      this.hero.hp = 1;
      this.areaDamage(24, '#efe5c8');
      this.burst('word', this.heroX, this.heroY - 58, 90, '#efe5c8', '爸爸');
      this.say('女儿的乳牙 · 再留下来一次');
      // 《后来我也成了他》：乳牙碎的那一刻，雨衣自动罩住孩子
      if (this.hasCombo('后来我也成了他')) {
        this.releaseRain();
        this.hurtCooldown = Math.max(this.hurtCooldown, 1.5);
        this.burst('word', this.heroX, this.heroY - 76, 60, '#c4a23f', '这次换我来挡');
      }
    }
  }

  private loseHealth(amount: number): void {
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
      void generateAIFateResult({
        event: { id: event.id, title: event.title, fact: event.fact },
        direction,
        response: { label: response.label, effect: response.effect, result: response.result },
        snapshot: this.buildLifeSnapshot(),
      }).then((text) => {
        if (!text || this.runSerial !== serial || this.state === 'result' || this.state === 'title') return;
        this.caption = text;
        this.captionTime = 7;
        this.memories.push(text);
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
    if (!id || this.state !== 'itemReward') return;
    this.acquireItem(id);
    if (this.initialItemReward) {
      this.initialItemReward = false;
      this.startStage();
    } else if (this.rewardReturn === 'advance') {
      this.advanceStage();
    } else {
      this.resetMovementInput();
      this.state = 'battle';
    }
  }

  private acquireItem(id: ItemId): void {
    if (this.items.includes(id)) return;
    this.items.push(id);
    this.stats.itemsTaken += 1;
    if (id === 'small-uniform') this.changeMaxHp(-6);
    if (id === 'nameless-tie') this.changeMaxHp(-10);
    if (id === 'eyebrow-razor') this.changeMaxHp(-8);
    if (id === 'broken-spine') this.changeMaxHp(-12);
    if (['eyebrow-razor', 'od-pill', 'white-bottle', 'broken-spine', 'spent-decade', 'painless-night'].includes(id)) this.strainTendency += 2;
    if (['fathers-raincoat', 'baby-tooth', 'missing-photo'].includes(id)) this.lightTendency += 2;
    // 《朋友圈仅三天可见》：拾取任何道具后，3 枚环绕弹绕身三圈然后消失
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

  private setupShop(): void {
    this.boughtThisShop = false;
    const candidates = this.shuffle(ITEM_IDS.filter((id) => !this.items.includes(id) && getItem(id).quality < 4));
    this.shopOffers = candidates.slice(0, 3).map((item) => ({ item, price: this.itemPrice(item), sold: false }));
  }

  private itemPrice(id: ItemId): number {
    let multiplier = this.hasItem('revoked-badge') ? 1.2 : 1;
    if (this.hasItem('bargain-link')) multiplier *= 1.1;
    if (this.hasItem('pregnancy-test')) multiplier *= 1.35;
    return Math.ceil(getItem(id).price * multiplier);
  }

  private buyShopOffer(index: number): void {
    const offer = this.shopOffers[index];
    if (!offer || offer.sold || this.state !== 'shop') return;
    if (this.hero.coins < offer.price) {
      this.say('零钱不够');
      return;
    }
    this.hero.coins -= offer.price;
    this.stats.coinsSpent += offer.price;
    offer.sold = true;
    this.boughtThisShop = true;
    this.acquireItem(offer.item);
  }

  private rerollShop(): void {
    if (this.state !== 'shop') return;
    if (this.hero.coins < 2) {
      this.say('刷新需要2枚零钱');
      return;
    }
    this.hero.coins -= 2;
    this.stats.coinsSpent += 2;
    this.setupShop();
  }

  private leaveShop(): void {
    if (this.state !== 'shop') return;
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
    this.specialRoomKind = kind ?? this.pickSpecialKind();
    // Ⅳ 级遗物的两条获取线：留灯间=被爱过的证据；里屋=透支自己
    const backPool: ItemId[] = ['broken-spine', 'spent-decade', 'painless-night', 'third-pill', 'loan-contract', 'name-sold', 'ktv-song'];
    const lightPool: ItemId[] = ['fathers-raincoat', 'baby-tooth', 'missing-photo', 'moms-bowl', 'ruma-msg', 'held-elevator', 'old-door-lock', 'breath-on-glass'];
    const roomPool = (this.specialRoomKind === 'back' ? backPool : lightPool).filter((id) => !this.items.includes(id));
    this.specialRoomOffers = this.shuffle(roomPool).slice(0, 3);
    this.specialRoomTaken.clear();
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
      return;
    }
    if (id !== 'broken-spine') this.changeMaxHp(-12);
    this.strainTendency += 3;
    this.acquireItem(id);
    this.specialRoomTaken.add(id);
  }

  private leaveSpecialRoom(): void {
    if (this.state !== 'specialRoom') return;
    if (this.specialRoomKind === 'back' && this.specialRoomTaken.size === 0) this.lightTendency += 2;
    this.finishSpecialRoom();
  }

  private finishSpecialRoom(): void {
    this.resetMovementInput();
    this.worldDoor = undefined;
    this.doorUsed = true;
    this.state = 'battle';
  }

  private endRun(won: boolean): void {
    this.resetMovementInput();
    this.resetFateInput();
    this.closeFreeInput();
    this.resultWon = won;
    this.state = 'result';
    this.projectiles = [];
    this.toast = '';
    this.toastTime = 0;
  }

  private nearestEnemy(x: number, y: number): EnemyUnit | undefined {
    return this.enemies
      .filter((enemy) => !enemy.dead)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
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
      this.bursts.push({
        id: this.entityId++, kind: 'sigh', x: mouthX, y: mouthY - index * 2,
        radius: (2.4 + index * 1.6) * scale, life: 0.55 + index * 0.2, duration: 0.55 + index * 0.2,
        color: '#dfe6e2', text: drift,
      });
    }
  }

  private burst(kind: BurstEffect['kind'], x: number, y: number, radius: number, color: string, text?: string): void {
    this.bursts.push({ id: this.entityId++, kind, x, y, radius, life: 0.36, duration: 0.36, color, text });
  }

  private say(message: string): void {
    this.toast = message;
    this.toastTime = 1.45;
  }

  private aiStateLabel(state: AIGenerationState): string {
    if (state === 'requesting') return 'AI生成中';
    if (state === 'gpt') return 'AI实时生成';
    if (state === 'fallback') return '本地保底';
    if (state === 'error') return '生成未完成';
    return '规则引擎';
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
    if (this.state === 'battle') this.renderLowHealthWarning();
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
    const blend = next ? (this.transitionTimer > 0 ? 1 - this.transitionTimer / 3.4 : tailBlend) : 0;
    const top = next ? this.mixHex(stage.groundTop, next.groundTop, blend) : stage.groundTop;
    const bottom = next ? this.mixHex(stage.groundBottom, next.groundBottom, blend) : stage.groundBottom;
    // The battlefield is an archive scan, not a smooth digital gradient. Flat
    // bands keep the scene readable at native pixel scale and make age changes
    // feel like a page being replaced.
    this.fillSteppedVertical(top, bottom, 12);
    this.renderStageAtmosphere(stage, next, blend);

    const shakeAmount = this.screenShake > 0 ? Math.ceil(this.screenShake * 16) : 0;
    const shakeX = shakeAmount ? Math.round(Math.sin(this.battleTime * 113) * shakeAmount) : 0;
    const shakeY = shakeAmount ? Math.round(Math.cos(this.battleTime * 97) * shakeAmount) : 0;
    ctx.save();
    ctx.translate(HERO_SCREEN_X - this.heroX + shakeX, HERO_SCREEN_Y - this.heroY + shakeY);
    this.renderProps(stage, next, blend);
    this.renderCoinDrops();
    this.renderWorldEntities();
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
    this.drawHero(this.heroX, this.heroY, 1, this.items, heroFacing, heroMotion, heroActionFrame);
    this.renderBursts();
    ctx.restore();
  }

  private renderStageAtmosphere(stage: StageSpec, next: StageSpec | undefined, blend: number): void {
    const ctx = this.ctx;
    const t = this.battleTime;
    const seed = this.runSeed >>> 0;
    const stageIndex = this.encounterIndex;
    const phase = (t * 0.7 + (seed % 97) / 97) % 1;
    applyPixelDiscipline(ctx);
    ctx.save();
    ctx.globalAlpha = 1;

    // A quiet registration grid gives the otherwise empty field a sense of
    // depth while staying below sprites and projectiles.
    ctx.fillStyle = 'rgba(216,208,193,.055)';
    for (let y = 108; y < 560; y += 54) ctx.fillRect(16, y, W - 32, 1);
    ctx.fillStyle = 'rgba(216,208,193,.035)';
    for (let x = 34; x < W; x += 62) ctx.fillRect(x, 106, 1, 430);

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
      // School: chalk lines and a red correction mark that never quite lands.
      ctx.fillStyle = 'rgba(174,190,198,.13)';
      for (let y = 126; y < 452; y += 34) ctx.fillRect(30, y, 300, 1);
      ctx.fillStyle = 'rgba(159,53,72,.22)';
      const markX = 48 + Math.floor(((t * 16) % 260) / 4) * 4;
      const markY = 146 + ((Math.floor(t / 4) % 4) * 52);
      ctx.fillRect(markX, markY, 14, 2);
      ctx.fillRect(markX + 6, markY - 6, 2, 14);
    } else if (stageIndex === 2) {
      // Youth: station rails recede toward the hero. A passing timetable light
      // is the first intentionally conspicuous motion in the run.
      ctx.fillStyle = 'rgba(210,180,105,.2)';
      ctx.fillRect(18, 456, 324, 2);
      ctx.fillRect(18, 468, 324, 1);
      ctx.fillStyle = 'rgba(185,166,125,.12)';
      for (let x = -40; x < 420; x += 58) {
        ctx.fillRect(Math.round(x + phase * 58), 455, 2, 82);
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
      // Middle age: the office becomes a spreadsheet. The fluorescent bar
      // flickers only at the edge of the frame so it never hides a hit cue.
      ctx.fillStyle = 'rgba(173,188,198,.09)';
      for (let x = 22; x < 340; x += 28) ctx.fillRect(x, 118, 1, 338);
      for (let y = 136; y < 456; y += 24) ctx.fillRect(22, y, 318, 1);
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

    this.renderAtmosphereSurprise(stageIndex, t, seed);
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
        if (h % 7 >= 3) continue;
        const px = cx * cell + ((h % 53) / 53) * (cell - 26) + 13;
        const py = cy * cell + (((h >> 6) % 53) / 53) * (cell - 26) + 13;
        const variant = (h >> 3) % PROP_VARIANTS;
        const showNext = Boolean(next) && ((h >> 9) % 100) / 100 < blend;
        const idx = showNext ? this.encounterIndex + 1 : this.encounterIndex;
        const color = showNext && next ? next.propColor : stage.propColor;
        const sprite = this.worldProps.slice(idx, variant);
        if (sprite) {
          // A one-pixel ground shadow separates dark props from the archive
          // bands without turning them into outlined stickers.
          ctx.globalAlpha = 0.34;
          ctx.fillStyle = 'rgba(5,5,8,.7)';
          ctx.fillRect(Math.round(px - 12), Math.round(py - 2), 24, 3);
          ctx.globalAlpha = 0.88;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(sprite, Math.round(px - sprite.width / 2), Math.round(py - sprite.height));
        } else {
          ctx.globalAlpha = 0.6;
          this.drawProp(idx, variant % 3, px, py, color);
        }
        ctx.globalAlpha = 1;
      }
    }
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
      const ratio = this.clamp(ttl / 22, 0, 1);
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
    ctx.font = `bold 9px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(this.caption, 180, panelY + 16, W - 96, 13, 2);
    ctx.restore();
  }

  private renderJoystick(): void {
    if (this.joyPointerId === -1) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#c9c3b6';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.joyBaseX, this.joyBaseY, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e8e1d3';
    ctx.beginPath(); ctx.arc(this.joyBaseX + this.joyDX, this.joyBaseY + this.joyDY, 12, 0, Math.PI * 2); ctx.fill();
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
    ctx.font = `8px ${UI_FONT_STACK}`;
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

    drawCutCornerPanel(ctx, 72, 470, 216, 58, 'rgba(12,12,17,.92)', UI_PALETTE.raincoatYellow, 3, 2);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 18px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('开始这一生', 180, 505);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
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
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText(`第 ${this.runSeed.toString(16).toUpperCase().padStart(8, '0')} 号`, 323, 46);
    drawStitchDivider(ctx, 29, 59, 302, 'horizontal', '#877d6e', 5, 3);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#6d655a';
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText('外号', 30, 82);
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 23px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(origin.nickname ? `《${origin.nickname}》` : origin.title, 30, 113);
    ctx.fillStyle = '#4d473f';
    ctx.font = `8px ${UI_FONT_STACK}`;
    this.wrapText(origin.nicknameReason || '正式名字还没留下，别人先替他叫出了声。', 30, 136, 190, 13, 3);

    ctx.save();
    ctx.globalAlpha = this.clamp((progress - 0.06) / 0.34, 0.08, 1);
    this.drawHero(274, 205, 1.22, []);
    ctx.restore();
    if (progress > 0.4) drawRedStamp(ctx, 257, 74, 56, 52, this.originBadgeGlyph(), 17, UI_PALETTE.oldRed);

    drawStitchDivider(ctx, 29, 237, 302, 'horizontal', '#877d6e', 5, 3);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    ctx.textAlign = 'left';
    ctx.fillText('外号的来处', 30, 258);
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
    let lineY = 279;
    for (const paragraph of visible.split('\n')) {
      if (!paragraph) continue;
      this.wrapText(paragraph, 30, lineY, 296, 15, 3);
      lineY += 47;
      if (lineY > 414) break;
    }

    drawStitchDivider(ctx, 29, 435, 302, 'horizontal', '#877d6e', 5, 3);
    ctx.fillStyle = '#6d655a';
    ctx.font = `7px ${UI_FONT_STACK}`;
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
        ctx.font = `7px ${UI_FONT_STACK}`;
        this.wrapText(reason, 30, y + 16, 294, 11, 2);
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
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText(this.originAttempt > 1 ? '重新登记中' : '档案仍在路上', 330, 46);
    drawLifeChapterTrack(ctx, 30, 69, 300, 8, 0, '降生|童年|少年|青年|成年|中年|老年|死亡', 0);

    fields.forEach(([label, value], index) => {
      const y = 118 + index * 58;
      const revealed = index <= activeLine;
      ctx.textAlign = 'left';
      ctx.fillStyle = revealed ? '#817a70' : '#444148';
      ctx.font = `7px ${UI_FONT_STACK}`;
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
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(this.originAttempt > 1 ? '上一页没赶上，登记处正在重写' : '登记的人还没把这一页递回来', 180, 582);
    drawRedStamp(ctx, 134, 598, 92, 28, '无法选择', 29, UI_PALETTE.oldRed);
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
    ctx.fillStyle = '#6f6c71'; ctx.font = '8px sans-serif'; ctx.fillText('Enter / 空格也可重试', 180, 501);
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
    drawPaperFold(ctx, 118, -207, 22, UI_PALETTE.paper, '#b8ad99', UI_PALETTE.ink);
    ctx.globalAlpha = cardAlpha * 0.16;
    drawDeterministicWear(ctx, -137, -203, 274, 392, 301 + this.encounterIndex, 7, '#897f71', 1);
    ctx.globalAlpha = cardAlpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6b6358';
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText(`${AGE_LABELS[this.encounterIndex] ?? '这一生'} · 第 ${this.stats.fateChoices + 1} 次命运`, 0, -184);
    drawRedStamp(ctx, 46, -173, 82, 28, '事实已落账', 19 + this.encounterIndex, UI_PALETTE.oldRed);
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 18px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(event.title, 0, -137, 226, 22, 2);
    ctx.fillStyle = '#3f3a34';
    ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(event.fact, 0, -74, 232, 17, 7);
    drawStitchDivider(ctx, -112, 58, 224, 'horizontal', '#81786b', 5, 4);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(this.fateFactLine(event), 0, 82);

    if (this.fateFreeWaiting) {
      ctx.fillStyle = UI_PALETTE.ink;
      ctx.font = `bold 11px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('这句话已经说出口。', 0, 122);
      ctx.fillStyle = '#6b6358';
      ctx.font = `8px ${UI_FONT_STACK}`;
      ctx.fillText('现实正在决定它留下什么', 0, 143);
    } else {
      ctx.fillStyle = '#5e574e';
      ctx.font = `8px ${UI_ARCHIVE_FONT_STACK}`;
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
        this.fateStatsLine(event.swallow.stats) || '让它进入身体',
      );
      drawResponseMarker(
        ctx, 184, 510, 168, 'exhale', `吐出 · ${event.exhale.label}`,
        this.fateStatsLine(event.exhale.stats) || '把回应送回世界',
      );
      ctx.restore();
    }

    if (!this.fateResultDirection && !this.fateFreeWaiting && armed) {
      ctx.save();
      ctx.globalAlpha = optionAlpha;
      drawCutCornerPanel(ctx, 105, 568, 150, 30, UI_PALETTE.nightRaised, UI_PALETTE.raincoatYellow, 2, 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = UI_PALETTE.raincoatYellow;
      ctx.font = `bold 9px ${UI_FONT_STACK}`;
      ctx.fillText('✎ 亲口说', 180, 587);
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText('事情不可重抽', 180, 625);
  }

  private renderFateResultCard(event: FateEvent): void {
    const ctx = this.ctx;
    const direction = this.fateResultDirection;
    if (!direction) return;
    const response = event[direction];
    const fadeIn = this.clamp((1.1 - this.fateResultMinTimer) / 0.3, 0, 1);
    applyPixelDiscipline(ctx);
    ctx.fillStyle = UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);
    drawLifeChapterTrack(ctx, 30, 72, 300, 8, this.encounterIndex + 1, '降生|童年|少年|青年|成年|中年|老年|死亡', 0);
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.translate(180, 310);
    drawArchiveFrame(
      ctx, -154, -180, 308, 342, UI_PALETTE.paper, UI_PALETTE.ink,
      direction === 'swallow' ? UI_PALETTE.hospitalBlueGray : UI_PALETTE.oldRed,
    );
    ctx.globalAlpha = fadeIn * 0.15;
    drawDeterministicWear(ctx, -147, -173, 294, 328, 930 + this.stats.fateChoices, 7, '#897f71', 1);
    ctx.globalAlpha = fadeIn;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6b6358';
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText(`${AGE_LABELS[this.encounterIndex] ?? '这一生'} · 命运回执`, 0, -151);
    drawRedStamp(
      ctx, 53, -137, 80, 28,
      direction === 'swallow' ? '已经咽下' : '已经吐出',
      74, direction === 'swallow' ? UI_PALETTE.hospitalBlueGray : UI_PALETTE.oldRed,
    );
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 16px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(`「${response.label}」`, 0, -96, 240, 19, 2);
    let cursorY = -48;
    if (this.fatePlayerText) {
      ctx.fillStyle = '#715c35';
      ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
      this.wrapText(`你说：「${this.fatePlayerText}」`, 0, cursorY, 236, 14, 2);
      cursorY += 36;
    }
    ctx.fillStyle = '#3f3a34';
    ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(response.result, 0, cursorY, 250, 17, 6);
    const resultStats = this.fateStatsLine(response.stats);
    if (resultStats) {
      drawStitchDivider(ctx, -116, 102, 232, 'horizontal', '#81786b', 5, 4);
      ctx.fillStyle = '#725e3e';
      ctx.font = `bold 9px ${UI_FONT_STACK}`;
      ctx.fillText(resultStats, 0, 128);
    }
    if (this.fateResultMinTimer <= 0) {
      ctx.fillStyle = UI_PALETTE.ink;
      ctx.font = `bold 10px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('收好回执，继续走', 0, 151);
    }
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText('回应会留进身体，也会改变下一口气', 180, 624);
  }

  private renderFateEventLegacy(): void {
    const event = this.currentFate;
    const ctx = this.ctx;
    if (!event) {
      ctx.fillStyle = 'rgba(7,8,11,.82)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.fillStyle = '#d7cfc2'; ctx.font = 'bold 18px sans-serif'; ctx.fillText('有件事正在发生', 180, 270);
      ctx.fillStyle = '#c2a85f'; ctx.font = '9px sans-serif'; ctx.fillText('AI正在根据这一身经历编排命运…', 180, 302);
      ctx.fillStyle = '#77747a'; ctx.font = '8px sans-serif'; ctx.fillText('超时会自动使用本地保底，不会卡住游戏', 180, 330);
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

    ctx.fillStyle = 'rgba(7,8,11,.6)';
    ctx.fillRect(0, 0, W, H);

    if (!this.fateResultDirection) {
      const leftAlpha = Math.max(0.1, -dragRatio) * optionAlpha;
      const rightAlpha = Math.max(0.1, dragRatio) * optionAlpha;
      ctx.fillStyle = `rgba(78,103,124,${leftAlpha * 0.55})`; ctx.fillRect(0, 0, W / 2, H);
      ctx.fillStyle = `rgba(142,58,72,${rightAlpha * 0.55})`; ctx.fillRect(W / 2, 0, W / 2, H);
      ctx.textAlign = 'center';
      ctx.font = committed && dragRatio < 0 ? 'bold 22px sans-serif' : 'bold 14px sans-serif';
      ctx.fillStyle = `rgba(205,222,228,${leftAlpha})`; ctx.fillText('咽下', 57, 320);
      ctx.font = committed && dragRatio > 0 ? 'bold 22px sans-serif' : 'bold 14px sans-serif';
      ctx.fillStyle = `rgba(244,202,196,${rightAlpha})`; ctx.fillText('吐出', 303, 320);
    }

    if (inResult) {
      this.renderFateResultCard(event);
      return;
    }

    const exitSign = this.fateResultDirection === 'swallow' ? -1 : 1;
    const cardX = 180 + this.fateDragX + (exiting ? exitSign * exitT * 430 : 0);
    const cardY = 302 - (1 - dealEase) * 320;
    const rotation = dragRatio * 0.075 + (1 - dealEase) * -0.14 + (exiting ? exitSign * exitT * 0.5 : 0);

    ctx.save();
    ctx.globalAlpha = exiting ? 1 - exitT : 1;
    ctx.translate(cardX, cardY);
    ctx.rotate(rotation);
    ctx.fillStyle = 'rgba(16,16,21,.98)'; ctx.fillRect(-142, -215, 284, 430);
    ctx.strokeStyle = committed
      ? (dragRatio > 0 ? '#c46672' : '#7d9db5')
      : event.profile === '微光' ? '#b7a45e' : event.profile === '反噬' ? '#a33f51' : '#77727b';
    ctx.lineWidth = committed ? 3 : 2;
    ctx.strokeRect(-140, -213, 280, 426);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#77727a'; ctx.font = '8px sans-serif'; ctx.fillText(`${AGE_LABELS[this.encounterIndex] ?? '这一生'} · ${event.profile} · ${this.aiStateLabel(this.aiFateState)}`, 0, -185);
    ctx.fillStyle = '#ede5d8'; ctx.font = 'bold 19px sans-serif'; this.wrapText(event.title, 0, -150, 230, 24, 2);
    ctx.fillStyle = '#bbb4aa'; ctx.font = '10px sans-serif'; this.wrapText(event.fact, 0, -90, 230, 17, 6);

    ctx.strokeStyle = '#3e3e46'; ctx.beginPath(); ctx.moveTo(-112, 30); ctx.lineTo(112, 30); ctx.stroke();
    if (this.fateFreeWaiting) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#c9c2b5'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('他在想怎么把这句话说出口…', 0, 100);
      ctx.fillStyle = '#8a8589'; ctx.font = '8px sans-serif';
      ctx.fillText('命运正在把它圆进现实里', 0, 124);
    } else {
      ctx.save();
      ctx.globalAlpha *= optionAlpha;
      ctx.textAlign = 'left'; ctx.fillStyle = '#9eb4c4'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(`← 咽下 · ${event.swallow.label}`, -116, 66);
      ctx.fillStyle = '#898f98'; ctx.font = '8px sans-serif'; this.wrapText(event.swallow.hint, -116, 85, 215, 13, 2);
      const swallowStats = this.fateStatsLine(event.swallow.stats);
      if (swallowStats) {
        ctx.fillStyle = '#9db8a4'; ctx.font = 'bold 8px sans-serif'; ctx.fillText(swallowStats, -116, 114);
      }
      ctx.textAlign = 'right'; ctx.fillStyle = '#d8878f'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(`${event.exhale.label} · 吐出 →`, 116, 132);
      ctx.fillStyle = '#9b898c'; ctx.font = '8px sans-serif'; this.wrapText(event.exhale.hint, 116, 151, 215, 13, 2);
      const exhaleStats = this.fateStatsLine(event.exhale.stats);
      if (exhaleStats) {
        ctx.fillStyle = '#cf9d9d'; ctx.font = 'bold 8px sans-serif'; ctx.fillText(exhaleStats, 116, 180);
      }
      ctx.restore();
      if (committed) {
        ctx.textAlign = 'center';
        ctx.fillStyle = dragRatio > 0 ? '#e8b8be' : '#bcd2e2';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(dragRatio > 0 ? '松手 · 吐出' : '松手 · 咽下', 0, 200);
      }
    }
    ctx.restore();

    if (!this.fateResultDirection && !this.fateFreeWaiting && armed) {
      ctx.save();
      ctx.globalAlpha = optionAlpha;
      ctx.fillStyle = 'rgba(20,20,26,.92)';
      ctx.fillRect(96, 521, 168, 24);
      ctx.strokeStyle = '#8d6f3a'; ctx.lineWidth = 1; ctx.strokeRect(96.5, 521.5, 167, 23);
      ctx.textAlign = 'center'; ctx.fillStyle = '#c9ad68'; ctx.font = 'bold 10px sans-serif';
      ctx.fillText('✎ 亲口回应命运', 180, 537);
      ctx.restore();
    }

    this.renderPoisonStrip(544);
    ctx.textAlign = 'center'; ctx.fillStyle = '#8a8688'; ctx.font = '8px sans-serif';
    ctx.fillText('事情不可重抽 · 把牌拖到底才作数', 180, 624);
  }

  private renderFateResultCardLegacy(event: FateEvent): void {
    const ctx = this.ctx;
    const direction = this.fateResultDirection;
    if (!direction) return;
    const response = event[direction];
    const fadeIn = this.clamp((1.1 - this.fateResultMinTimer) / 0.3, 0, 1);
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.translate(180, 302);
    ctx.fillStyle = 'rgba(16,16,21,.98)'; ctx.fillRect(-142, -215, 284, 430);
    ctx.strokeStyle = direction === 'swallow' ? '#7d9db5' : '#c46672';
    ctx.lineWidth = 2; ctx.strokeRect(-140, -213, 280, 426);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#77727a'; ctx.font = '8px sans-serif'; ctx.fillText(`${AGE_LABELS[this.encounterIndex] ?? '这一生'} · 命运已落账`, 0, -185);
    ctx.fillStyle = direction === 'swallow' ? '#9bb1c1' : '#d68b91';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(direction === 'swallow' ? '你咽下了它' : '你把它吐了出来', 0, -152);
    ctx.fillStyle = '#c4b98a'; ctx.font = 'bold 11px sans-serif';
    this.wrapText(`「${response.label}」`, 0, -124, 240, 15, 1);
    let cursorY = -92;
    if (this.fatePlayerText) {
      ctx.fillStyle = '#c9ad68'; ctx.font = '9px sans-serif';
      this.wrapText(`你说：「${this.fatePlayerText}」`, 0, cursorY, 236, 14, 2);
      cursorY += 36;
    }
    ctx.fillStyle = '#d6cfc3'; ctx.font = '11px sans-serif';
    this.wrapText(response.result, 0, cursorY, 236, 19, 7);
    const resultStats = this.fateStatsLine(response.stats);
    const poisonBits = (Object.entries(response.poison) as Array<[PoisonKey, number]>)
      .filter(([, amount]) => amount !== 0)
      .map(([key, amount]) => `${POISON_LABELS[key]}${amount > 0 ? '+' : ''}${amount}`)
      .join(' · ');
    let footY = 150;
    if (resultStats) {
      ctx.fillStyle = '#c4b98a'; ctx.font = 'bold 11px sans-serif';
      ctx.fillText(resultStats, 0, footY);
      footY += 22;
    }
    if (poisonBits) {
      ctx.fillStyle = '#be6974'; ctx.font = 'bold 10px sans-serif';
      ctx.fillText(poisonBits, 0, footY);
    }
    if (this.fateResultMinTimer <= 0) {
      ctx.fillStyle = 'rgba(232,225,211,.85)';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('点击继续', 0, 200);
    }
    ctx.restore();
    ctx.textAlign = 'center'; ctx.fillStyle = '#8a8688'; ctx.font = '8px sans-serif';
    ctx.fillText('回应会留进身体，也会改变下一口气', 180, 624);
  }

  private renderBattle(): void {
    this.renderWorld();
    this.renderDarkness();
    this.renderVignette();
    this.renderBattleOverlay();
    this.renderComboReveal();
    this.renderOriginBadge();
    this.renderHud();
    this.renderEdgeHint(this.worldDoor?.x, this.worldDoor?.y, this.worldDoor?.kind === 'light' ? '#e5c96f' : '#c3ccd1');
    this.renderEdgeHint(this.worldStall?.x, this.worldStall?.y, '#d5b45f');
    for (const enemy of this.enemies) {
      if (!enemy.dead && (enemy.elite || enemy.boss)) this.renderEdgeHint(enemy.x, enemy.y, '#df5a69');
    }
    this.renderCaption();
    this.renderEliteAlert();
    this.renderJoystick();
    if (this.toastTime > 0 && this.toast) {
      const toastAlpha = this.clamp(this.toastTime / 0.32, 0, 1);
      this.ctx.save();
      this.ctx.globalAlpha = toastAlpha;
      drawCutCornerPanel(this.ctx, 68, 72, 224, 22, 'rgba(10,10,15,.74)', '#64545a', 2, 1);
      this.ctx.fillStyle = UI_PALETTE.raincoatYellow;
      this.ctx.fillRect(74, 76, 14, 2);
      this.ctx.fillStyle = '#e7e0d3';
      this.ctx.textAlign = 'center';
      this.ctx.font = `bold 8px ${UI_FONT_STACK}`;
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
      ctx.font = '7px sans-serif';
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
    ctx.font = `bold 8px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('《一口气》', 64, 608);
    drawStatusIcon(ctx, 113, 600, 'breath-power', 1, UI_PALETTE.breath);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(`劲 ${norm(vector.damage, BASE_VECTOR.damage)}`, 127, 608);
    ctx.fillStyle = UI_PALETTE.hospitalBlueGray;
    ctx.fillText(`速 ${norm(1 / vector.fireInterval, 1 / BASE_VECTOR.fireInterval)}`, 187, 608);
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.fillText(`程 ${norm(vector.range, BASE_VECTOR.range)}`, 247, 608);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `7px ${UI_FONT_STACK}`;
    const traits = [
      vector.pierce ? `穿${vector.pierce}` : '',
      vector.returning ? '回返' : '',
      vector.homing > 0.05 ? '追踪' : '',
    ].filter(Boolean).join(' · ');
    ctx.fillText(traits || '月白核心仍在里面', 64, 627);

    ctx.textAlign = 'right';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `7px ${UI_FONT_STACK}`;
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
    drawCutCornerPanel(ctx, 6, 6, 126, 39, 'rgba(16,16,21,.88)', '#4a4649', 2, 1);
    drawStatusIcon(ctx, 12, 12, 'life', 1, UI_PALETTE.oldRed);
    this.bar(26, 11, 96, 7, this.hero.hp / this.hero.maxHp, UI_PALETTE.oldRed);
    this.bar(26, 22, 96, 3, this.hero.block / 24, UI_PALETTE.raincoatYellow);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(`${Math.ceil(this.hero.hp)}/${this.hero.maxHp}`, 26, 38);

    drawCutCornerPanel(ctx, 136, 6, 108, 39, 'rgba(16,16,21,.88)', '#4a4649', 2, 1);
    ctx.textAlign = 'center';
    ctx.font = `bold 9px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.fillText(AGE_LABELS[this.encounterIndex] || '', 190, 20);
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillStyle = UI_PALETTE.paperDim;
    const combo = this.activeComboNames()[0];
    const mid = stage?.end === 'final' && this.darkActive
      ? '「到点了。」'
      : combo
        ? `《${combo}》`
        : `${stage?.title || ''} · ${Math.ceil(remain)}`;
    ctx.fillText(mid, 190, 36);

    drawCutCornerPanel(ctx, 248, 6, 106, 39, 'rgba(16,16,21,.88)', '#4a4649', 2, 1);
    drawStatusIcon(ctx, 257, 13, 'coins', 1, UI_PALETTE.raincoatYellow);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText('零钱', 274, 18);
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.font = `bold 10px ${UI_FONT_STACK}`;
    ctx.fillText(String(this.hero.coins), 274, 36);
    ctx.textAlign = 'right';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText('档案', 344, 20);
    ctx.fillText(String(this.items.length).padStart(2, '0'), 344, 36);

    drawLifeChapterTrack(ctx, 18, 52, 324, STAGES.length, this.encounterIndex, AGE_LABELS.join('|'), 0);
  }

  private renderEnemies(): void {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      this.drawEnemy(enemy);
      const marked = enemy.elite || enemy.boss;
      if (marked || enemy.hp < enemy.maxHp) {
        const barWidth = marked ? 50 : 26;
        this.bar(enemy.x - barWidth / 2, enemy.y + enemy.radius + 7, barWidth, marked ? 5 : 3, enemy.hp / enemy.maxHp, marked ? '#d64e5e' : '#9d3d4b');
      }
      if (marked) {
        this.ctx.fillStyle = '#c9c3b9';
        this.ctx.font = 'bold 8px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(enemy.name, enemy.x, enemy.y + enemy.radius + 22);
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
      ctx.strokeStyle = enemy.boss ? '#d0b264' : '#c5485b';
      ctx.globalAlpha = 0.45 + (Math.sin(enemy.age * 5) + 1) * 0.18;
      ctx.lineWidth = enemy.boss ? 3 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 8 + Math.sin(enemy.age * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (attacking) {
      ctx.strokeStyle = `rgba(234,83,101,${0.35 + attackProgress * 0.55})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, -Math.PI / 2, -Math.PI / 2 + attackProgress * Math.PI * 2);
      ctx.stroke();
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
    const ageStep = Math.max(0, Math.min(5, this.state === 'result' ? 5 : this.encounterIndex)) as 0 | 1 | 2 | 3 | 4 | 5;
    const frame = actionFrame ?? (Math.floor(this.visualTime * 6) % 4) as 0 | 1 | 2 | 3;
    // 《他当年也是这样站着的》：身后浮现同样弯腰的父亲轮廓
    if (this.state === 'battle' && this.hasCombo('他当年也是这样站着的')) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.18 + Math.sin(this.visualTime * 1.4) * 0.04;
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
      if (projectile.style !== 'plain') {
        ctx.globalAlpha = lifeFade * 0.35;
        ctx.strokeStyle = projectile.color;
        ctx.lineWidth = Math.max(1, projectile.radius * 0.8);
        ctx.beginPath();
        ctx.moveTo(-projectile.radius * 4.2, 0);
        ctx.lineTo(-projectile.radius * 1.1, 0);
        ctx.stroke();
      }
      ctx.globalAlpha = lifeFade;
      ctx.fillStyle = projectile.color;
      ctx.strokeStyle = projectile.color;
      if (projectile.style === 'paper') {
        ctx.fillRect(-projectile.radius * 1.5, -projectile.radius * 0.72, projectile.radius * 3, projectile.radius * 1.44);
        ctx.strokeStyle = '#7f7770'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-projectile.radius * 1.4, -projectile.radius * 0.65); ctx.lineTo(0, 0); ctx.lineTo(projectile.radius * 1.4, -projectile.radius * 0.65); ctx.stroke();
      } else if (projectile.style === 'rain') {
        ctx.beginPath(); ctx.ellipse(0, 0, projectile.radius * 0.65, projectile.radius * 2.1, 0, 0, Math.PI * 2); ctx.fill();
      } else if (projectile.style === 'sound') {
        ctx.beginPath(); ctx.arc(0, 0, projectile.radius * 1.5, 0, Math.PI * 2); ctx.stroke();
      } else if (projectile.style === 'key') {
        ctx.lineWidth = Math.max(1, projectile.radius * 0.35); ctx.beginPath(); ctx.arc(-projectile.radius, 0, projectile.radius * 0.7, 0, Math.PI * 2); ctx.moveTo(-projectile.radius * 0.3, 0); ctx.lineTo(projectile.radius * 1.8, 0); ctx.lineTo(projectile.radius * 1.8, projectile.radius); ctx.stroke();
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

  /** 奥义演出：集齐组合时插画浮现。战斗不暂停；插画未加载则退回字幕。 */
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
    const fadeIn = this.clamp(elapsed / 0.45, 0, 1);
    const fadeOut = this.clamp(reveal.timer / 0.6, 0, 1);
    const alpha = Math.min(fadeIn, fadeOut);
    const rise = (1 - fadeIn) * 14;
    const ctx = this.ctx;
    const artW = 288;
    const artH = 162;
    const x = Math.round((W - artW) / 2);
    const y = Math.round(150 + rise);
    ctx.save();
    applyPixelDiscipline(ctx);
    ctx.globalAlpha = alpha * 0.62;
    ctx.fillStyle = '#07080b';
    ctx.fillRect(0, y - 46, W, artH + 118);
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
      ctx.textAlign = 'center'; ctx.fillStyle = value > 0 ? '#d8c8c5' : '#77757a'; ctx.font = 'bold 9px sans-serif';
      ctx.fillText(`${POISON_LABELS[key]} ${value}`, x + 26, y + 15);
    }
  }

  private renderItemReward(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    ctx.fillStyle = UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 15px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(this.rewardTitle, 20, 35, 320, 18, 2);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(this.initialItemReward ? '出门物证 · 只能带走一件' : '困难缩成物件，留在了这一身上', 20, 72);
    drawStitchDivider(ctx, 20, 82, 320, 'horizontal', '#4d494d', 5, 4);
    for (let index = 0; index < 3; index += 1) {
      const id = this.itemRewardChoices[index];
      if (!id) continue;
      this.drawItemRecord(id, index, 'reward');
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('每一件道具，都是他活过的证据。', 180, 620);
  }

  private renderShop(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    ctx.fillStyle = '#111013';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 18px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('没有招牌的当铺', 20, 38);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText('有些东西，要拿另一些东西来换。', 20, 62);
    drawStatusIcon(ctx, 282, 25, 'coins', 1, UI_PALETTE.raincoatYellow);
    ctx.textAlign = 'right';
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.font = `bold 12px ${UI_FONT_STACK}`;
    ctx.fillText(String(this.hero.coins), 340, 37);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText('零钱', 340, 53);
    drawStitchDivider(ctx, 20, 78, 320, 'horizontal', '#4d494d', 5, 4);
    for (let index = 0; index < 3; index += 1) {
      const offer = this.shopOffers[index];
      if (!offer) continue;
      this.drawItemRecord(offer.item, index, 'shop', offer);
    }
    drawCutCornerPanel(
      ctx, 18, 558, 150, 42, UI_PALETTE.nightRaised,
      this.hero.coins >= 2 ? UI_PALETTE.hospitalBlueGray : '#454249', 2, 1,
    );
    ctx.textAlign = 'center';
    ctx.fillStyle = this.hero.coins >= 2 ? UI_PALETTE.paperLight : '#6f6a70';
    ctx.font = `bold 10px ${UI_FONT_STACK}`;
    ctx.fillText('↻  换一批 · 2', 93, 583);
    drawCutCornerPanel(ctx, 192, 558, 150, 42, UI_PALETTE.nightRaised, '#5c5554', 2, 1);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.fillText('▯  推门离开', 267, 583);
  }

  private drawItemRecord(id: ItemId, index: number, mode: 'reward' | 'shop', offer?: ShopOffer): void {
    const ctx = this.ctx;
    const item = getItem(id);
    const y = 88 + index * 152;
    const sold = Boolean(offer?.sold);
    ctx.save();
    ctx.globalAlpha = sold ? 0.28 : 1;
    ctx.fillStyle = '#18171c';
    ctx.fillRect(16, y + 4, 328, 136);
    ctx.fillStyle = item.color;
    ctx.fillRect(16, y + 4, 3, 136);
    drawStitchDivider(ctx, 24, y + 139, 312, 'horizontal', '#454147', 4, 4);

    this.drawItemPedestal(58, y + 75, item.quality, mode === 'shop', sold);
    this.drawItemSymbol(id, 58, y + 38 + Math.sin(this.visualTime * 2.2 + index) * 2, 21);
    ctx.textAlign = 'left';
    ctx.fillStyle = item.color;
    ctx.font = `bold 7px ${UI_FONT_STACK}`;
    ctx.fillText(`${'ⅠⅡⅢⅣ'[item.quality - 1]} · ${item.qualityName}`, 96, y + 18);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(item.name, 96, y + 39, 210, 14, 2);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `7px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(item.flavor, 96, y + 67, 228, 11, 2);
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.font = `bold 7px ${UI_FONT_STACK}`;
    ctx.fillText('得到', 96, y + 95);
    ctx.fillStyle = UI_PALETTE.paper;
    ctx.font = `8px ${UI_FONT_STACK}`;
    this.wrapText(item.positive, 128, y + 95, 196, 10, 2);
    ctx.fillStyle = UI_PALETTE.hospitalBlueGray;
    ctx.font = `bold 7px ${UI_FONT_STACK}`;
    ctx.fillText('留下', 96, y + 121);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    this.wrapText(item.negative, 128, y + 121, 196, 10, 2);
    if (mode === 'shop' && offer) {
      ctx.textAlign = 'right';
      ctx.fillStyle = sold ? UI_PALETTE.paperDim : UI_PALETTE.raincoatYellow;
      ctx.font = `bold 9px ${UI_FONT_STACK}`;
      ctx.fillText(sold ? '价签已撕' : `${offer.price} 枚`, 334, y + 20);
    }
    ctx.restore();
  }

  private renderSpecialRoom(): void {
    const ctx = this.ctx;
    if (this.specialRoomKind === 'light') {
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
    ctx.textAlign = 'center';
    ctx.fillStyle = this.specialRoomKind === 'light' ? '#fff0bf' : '#e5e4de';
    ctx.font = 'bold 25px sans-serif';
    ctx.fillText(this.specialRoomKind === 'light' ? '留灯间' : '里屋', 180, 72);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = this.specialRoomKind === 'light' ? '#ead69b' : '#b6b8bc';
    ctx.fillText(this.specialRoomKind === 'light' ? '有人替你把灯留着，只能带走一件' : '拿一口气来换。只要付得起，可以多拿', 180, 98);
    for (let index = 0; index < 3; index += 1) {
      const id = this.specialRoomOffers[index];
      if (!id) continue;
      this.drawItemChoice(id, index, false);
      const x = 7 + index * 119;
      const taken = this.specialRoomTaken.has(id);
      ctx.fillStyle = taken ? '#77777d' : this.specialRoomKind === 'light' ? '#e5c96f' : '#d36b76';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(taken ? '已经拿走' : this.specialRoomKind === 'light' ? '只能选一件' : '一口气 · 12生命上限', x + 54, 501);
      if (taken) {
        ctx.fillStyle = 'rgba(8,8,11,.68)'; ctx.fillRect(x + 2, 118, 104, 400);
        ctx.fillStyle = '#c1bdb5'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('已经穿上', x + 54, 320);
      }
    }
    this.panel(104, 553, 152, 49, this.specialRoomKind === 'light' ? '#8f7b43' : '#67404a');
    ctx.fillStyle = '#d5d0c5'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('什么也不拿 · Enter', 180, 583);
    ctx.font = '8px sans-serif'; ctx.fillStyle = '#77777e';
    ctx.fillText(`空肺 ${this.strainTendency}  ·  窗灯 ${this.lightTendency}`, 180, 620);
  }

  private drawItemChoice(id: ItemId, index: number, shop: boolean, offer?: ShopOffer): void {
    const ctx = this.ctx;
    const item = getItem(id);
    const x = 7 + index * 119;
    const sold = Boolean(offer?.sold);
    this.panel(x, 116, 108, 406, sold ? '#3b3c42' : item.color);
    ctx.globalAlpha = sold ? 0.25 : 1;
    const itemY = 166 + Math.sin(this.visualTime * 2.2 + index * 0.9) * 3;
    this.drawItemPedestal(x + 54, 201, item.quality, shop, sold);
    this.drawItemSymbol(id, x + 54, itemY, 27);
    ctx.textAlign = 'center'; ctx.fillStyle = item.color; ctx.font = 'bold 9px sans-serif'; ctx.fillText(`${'ⅠⅡⅢⅣ'[item.quality - 1]} · ${item.qualityName}`, x + 54, 218);
    ctx.fillStyle = '#e8e1d4'; ctx.font = 'bold 11px sans-serif'; this.wrapText(item.name, x + 54, 243, 92, 14, 3);
    ctx.fillStyle = '#8d8984'; ctx.font = '8px sans-serif'; this.wrapText(item.flavor, x + 54, 292, 88, 12, 4);
    ctx.fillStyle = '#71b7a9'; ctx.font = '8px sans-serif'; this.wrapText(item.positive, x + 54, 353, 88, 12, 4);
    ctx.fillStyle = '#d36570'; this.wrapText(item.negative, x + 54, 416, 88, 12, 4);
    if (shop && offer) {
      ctx.fillStyle = sold ? '#77777c' : '#d5b45f'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(sold ? '已带走' : `${offer.price} 枚零钱`, x + 54, 496);
    }
    ctx.globalAlpha = 1;
  }

  private drawItemPedestal(x: number, y: number, quality: number, shop: boolean, sold: boolean): void {
    const ctx = this.ctx;
    const backRoom = this.state === 'specialRoom' && this.specialRoomKind === 'back';
    const lightRoom = this.state === 'specialRoom' && this.specialRoomKind === 'light';
    const top = sold ? '#4a494d' : lightRoom ? '#9d8244' : backRoom ? '#68747a' : shop ? '#654a37' : '#5a5552';
    const front = sold ? '#313237' : lightRoom ? '#695b37' : backRoom ? '#3c464c' : shop ? '#403126' : '#393537';
    const accent = sold ? '#626167' : quality >= 4 ? '#c7aa58' : quality >= 3 ? '#9f5262' : '#777779';
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(5,5,8,.58)';
    ctx.fillRect(Math.round(x - 28), Math.round(y + 8), 56, 4);
    ctx.fillStyle = front;
    ctx.fillRect(Math.round(x - 20), Math.round(y), 40, 12);
    ctx.fillRect(Math.round(x - 16), Math.round(y + 12), 32, 4);
    ctx.fillStyle = top;
    ctx.fillRect(Math.round(x - 24), Math.round(y - 4), 48, 7);
    ctx.fillRect(Math.round(x - 18), Math.round(y - 7), 36, 3);
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
    ctx.fillStyle = UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6f6960';
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText(`第 ${this.runSeed.toString(16).toUpperCase().padStart(8, '0')} 号人生档案 · 已封卷`, 20, 28);

    ctx.fillStyle = this.resultWon ? '#746f67' : UI_PALETTE.paperLight;
    ctx.font = `bold 30px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('这一身', 22, 74);
    if (this.resultWon) {
      ctx.fillStyle = UI_PALETTE.oldRed;
      ctx.font = `bold 18px ${UI_FONT_STACK}`;
      ctx.fillText('→', 137, 69);
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.font = `bold 30px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('这一生', 177, 74);
    } else {
      drawRedStamp(ctx, 242, 43, 86, 34, '写到这里', 101, UI_PALETTE.oldRed);
    }
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.fillRect(20, 89, 320, 2);

    ctx.fillStyle = UI_PALETTE.paper;
    ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
    const identity = this.origin?.nickname ? `《${this.origin.nickname}》` : this.origin?.title || '没有留下名字的人';
    ctx.fillText(identity, 190, 122);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(`${AGE_LABELS[Math.min(this.encounterIndex, AGE_LABELS.length - 1)]} · ${this.items.length} 件物证`, 190, 141);

    ctx.fillStyle = '#403c40';
    ctx.fillRect(42, 158, 2, 250);
    for (let index = 0; index < AGE_LABELS.length; index += 1) {
      const y = 166 + index * 46;
      const reached = index <= this.encounterIndex;
      ctx.fillStyle = reached ? (index === this.encounterIndex ? UI_PALETTE.oldRed : UI_PALETTE.paper) : '#4b484e';
      ctx.fillRect(38, y, 10, 10);
      ctx.textAlign = 'left';
      ctx.fillStyle = reached ? UI_PALETTE.paperDim : '#56535a';
      ctx.font = `8px ${UI_FONT_STACK}`;
      ctx.fillText(AGE_LABELS[index]!, 58, y + 8);
    }

    this.drawHero(270, 292, 1.45, this.items);
    ctx.strokeStyle = '#4e494c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(206, 339);
    ctx.lineTo(330, 339);
    ctx.stroke();
    const combos = this.activeComboNames();
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.font = `bold 9px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(combos.length ? `《${combos[0]}》` : '尚未命名的一生', 270, 363, 126, 13, 3);

    const poisonMeanings: Record<PoisonKey, string> = {
      greed: '用占有抵抗失去', anger: '把受过的伤还回去', delusion: '用幻想维持关系',
      pride: '用体面确认价值', doubt: '用犹豫推迟结论',
    };
    const deepest = (Object.entries(this.poisons) as Array<[PoisonKey, number]>)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 2);
    drawStitchDivider(ctx, 20, 432, 320, 'horizontal', '#4d494d', 5, 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `7px ${UI_FONT_STACK}`;
    ctx.fillText('这一身最深的两道痕', 20, 451);
    deepest.forEach(([key], index) => {
      const x = 20 + index * 160;
      ctx.fillStyle = UI_PALETTE.oldRed;
      ctx.font = `bold 16px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText(POISON_LABELS[key], x, 479);
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `8px ${UI_FONT_STACK}`;
      ctx.fillText(poisonMeanings[key], x + 24, 478);
    });

    drawCutCornerPanel(ctx, 70, 505, 220, 58, UI_PALETTE.nightRaised, UI_PALETTE.oldRed, 3, 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 16px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('再活一次', 180, 540);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(
      this.resultWon ? '他没有赢，只是终于松了这一口气。' : '事情写到这里，但不是同一个人的下一局。',
      180, 600,
    );
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
    let line = '';
    let lineIndex = 0;
    for (const character of text) {
      const next = line + character;
      if (ctx.measureText(next).width > maxWidth && line) {
        ctx.fillText(line, x, y + lineIndex * lineHeight);
        line = character;
        lineIndex += 1;
        if (lineIndex >= maxLines) return;
      } else line = next;
    }
    if (line && lineIndex < maxLines) ctx.fillText(line, x, y + lineIndex * lineHeight);
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

  private installTestHooks(): void {
    const host = window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
      zhe_yi_shen_test?: (action: 'start' | 'reveal-origin' | 'clear' | 'choose-first' | 'swallow' | 'exhale' | 'special' | 'leave-special' | 'shop' | 'buy-first' | 'combo' | 'boss' | 'battle' | 'father' | 'father-phase2' | 'win' | 'equip', payload?: unknown) => void;
    };
    host.render_game_to_text = () => JSON.stringify({
      coordinateSystem: 'origin top-left; +x right; +y down; logical 360x640',
      state: this.state,
      seed: this.runSeed,
      encounter: this.encounterIndex,
      encounterName: STAGES[this.encounterIndex]?.title || '完成',
      battleTime: Number(this.battleTime.toFixed(2)),
      heroPos: { x: Math.round(this.heroX), y: Math.round(this.heroY) },
      transitionTimer: Number(this.transitionTimer.toFixed(2)),
      worldDoor: this.worldDoor ? { kind: this.worldDoor.kind, x: Math.round(this.worldDoor.x), y: Math.round(this.worldDoor.y), ttl: Number(this.worldDoor.ttl.toFixed(1)) } : null,
      worldStall: this.worldStall ? { x: Math.round(this.worldStall.x), y: Math.round(this.worldStall.y) } : null,
      darkness: this.darkActive ? Math.round(this.darkR) : null,
      hero: { hp: Math.round(this.hero.hp), maxHp: this.hero.maxHp, block: this.hero.block, coins: this.hero.coins },
      vector: this.computeAttackVector(),
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
      fateBuild: this.fateBuild,
      fateReceipts: this.fateReceipts.map((receipt) => ({ id: receipt.event.id, direction: receipt.direction, result: receipt.result })),
      items: this.items,
      combos: this.activeComboNames(),
      odDistortion: this.odBoost ? { boost: this.odBoost, penalty: this.odPenalty } : null,
      enemies: this.enemies.filter((enemy) => !enemy.dead).map((enemy) => ({ type: enemy.type, hp: Math.round(enemy.hp), x: Math.round(enemy.x), y: Math.round(enemy.y) })),
      projectiles: this.projectiles.length,
      itemChoices: this.itemRewardChoices,
      shop: this.shopOffers,
      specialRoom: { kind: this.specialRoomKind, offers: this.specialRoomOffers, taken: [...this.specialRoomTaken] },
      stats: this.stats,
    });
    host.advanceTime = (ms: number) => {
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      for (let index = 0; index < steps; index += 1) this.update(FIXED_STEP);
      this.render();
    };
    if (import.meta.env.DEV) {
      host.zhe_yi_shen_test = (action, payload?: unknown) => {
        if (action === 'equip' && Array.isArray(payload)) {
          this.items = payload.filter((id): id is ItemId => typeof id === 'string' && ITEM_IDS.includes(id as ItemId));
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
        if (action === 'clear') {
          this.enemies.forEach((enemy) => { if (!enemy.dead && !enemy.elite && !enemy.boss) this.damageEnemy(enemy, enemy.hp + 1, '#fff'); });
          if (this.state === 'battle' && STAGES[this.encounterIndex]?.end !== 'final') this.beginStageTransition();
        }
        if (action === 'shop') {
          if (this.state === 'title') this.startRun(0x20260718);
          this.setupShop();
          this.state = 'shop';
        }
        if (action === 'special') this.openSpecialRoom();
        if (action === 'leave-special') this.leaveSpecialRoom();
        if (action === 'buy-first') this.buyShopOffer(0);
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
    }
  }
}
