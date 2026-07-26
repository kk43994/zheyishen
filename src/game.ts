import { generateAIFate, generateAIFateResult, generateAIFreeFate, generateAIOrigin, type AIGenerationState } from './ai';
import { LifeFeedback } from './audio-runtime';
import {
  PixelEnemyRenderer,
  resolveEnemyPixelAsset,
  type EnemyPixelAssetKey,
} from './enemy-pixel';
import {
  PixelBossSkillRenderer,
  bossSkillLoops,
  isBossSkillId,
  type BossSkillId,
} from './boss-skill-pixel';
import { generateLocalFateEvent, POISON_KEYS, validateFateEvent } from './fate';
import type { HeroFacing } from './hero-morph';
import { PixelHeroRenderer } from './hero-pixel';
import { PixelXiaoZhangRenderer, type XiaoZhangPixelAction } from './xiao-zhang-pixel';
import {
  LIFE_AGES,
  LIFE_STAGE_CANON,
  assertStageNarrativeRoster,
  isFateItemAgeAppropriate,
} from './life-stage';
import { DEFAULT_APPEARANCE, commitOriginWheels, getOriginModifiers, getOriginTrait, rollOriginWheels } from './origins';
import { FATE_ITEM_IDS, getItem, ITEM_IDS, STORY_ITEM_IDS } from './relics';
import { appendLifeLedger, readLifeLedger, type LifeLedgerEntry } from './run-ledger';
import { clearRunCheckpoint, readRunCheckpoint, writeRunCheckpoint, type RunCheckpoint } from './run-checkpoint';
import {
  createDangerBand,
  dangerBandHits,
  renderDangerBand,
  updateDangerBands,
  type DangerBand,
} from './danger-bands';
import { comboArtAtlas } from './combo-art';
import { itemIconAtlas } from './item-icons';
import { planFiveShotBurst, resolveProjectileTrail, selectBaseProjectileForm } from './projectile-item-signatures';
import { projectileAtlas, hitFrame, saveFrame, synergyAtlas, statusAtlas, poisonAtlas, joystickAtlas, type HitMaterial, type SaveKind } from './vfx-sprites';
import { sceneArt } from './scene-art';
import { overlayPanelTexture, uiTextures } from './ui-textures';
import { POISON_LABELS } from './types';
import { STAGE_VOICE_PRELOADS, VOICE_CUES, type VoiceCueId, type VoiceTreatment } from './voice-script';
import {
  PROP_VARIANTS,
  stageClutterFloors,
  worldEntityAtlas,
  worldPlinthAtlas,
  worldPropAtlas,
  type WorldPlinthKind,
} from './world-props';
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
  ProjectileForm,
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
/** 末班车冲撞判定：贴图 last-bus-hd 按 128px 绘制，车身是横向长条，用圆判定会漏。 */
/**
 * 父亲战《雨里的校门口》：雨向全场固定（斜向右下），不随父亲朝向旋转。
 * 干地=父亲背风侧一块随他移动的无雨区——要躲雨，唯一的办法是站到正在打你的人身后。
 */
const RAIN_DIR_X = Math.cos(1.15);
const RAIN_DIR_Y = Math.sin(1.15);
const RAIN_DRY_LENGTH = 150;
const RAIN_DRY_HALF_WIDTH = 44;
/** 走马灯怪潮的性能兜底：雪球是设计，但敌人分离是 O(n²)，到顶只停止新增、不删已有。 */
const LANTERN_HORDE_CAP = 100;
/** 走马灯只回放进入暮年前的五章；转速只改变频率和批量，不得改变人生顺序。 */
const LANTERN_PREVIOUS_LIFE_ROSTER: readonly (readonly EnemyType[])[] = [
  ['cry-moth', 'fear', 'hunger-shadow'],
  ['red-mark', 'others-paper', 'sign-here'],
  ['id-scanner', 'task-simple', 'task-revise'],
  ['missed-call', 'desk-lamp', 'reheated-pot'],
  ['meeting-door', 'checkup-report', 'debt'],
];
/** 第五档「这一身」：每章大 Boss 固定掉落（暮年不掉，开始还）。docs/六章Boss编排与传承线-v1.md §10-11。 */
const STORY_DROPS: ReadonlyArray<ItemId | undefined> = ['admission-notice', 'fathers-raincoat', 'iphone-17-pro-max', 'fathers-chart', 'revoked-badge', undefined];
const STORY_DROP_MEANINGS: ReadonlyArray<string> = ['别人替你决定的第一件事', '雨衣留下了。话还是没说。', '你自己买的——用被赶走那天的钱', '别人的病，你扛', '名字还在，门已经打不开了', ''];
const IPHONE_MESSAGE_INTERVAL = 15;
const IPHONE_MESSAGE_INTERRUPT = 0.4;
const PHONE_STORY_STEPS = ['wife', 'silent', 'hospital', 'mother', 'father-outgoing', 'father', 'coworker'] as const;
type PhoneStoryStep = typeof PHONE_STORY_STEPS[number];
const PHONE_STORY_TEXT: Record<PhoneStoryStep, string> = {
  wife: '我把你那份放冰箱了。明天热一下还能吃。',
  silent: '……',
  hospital: '他一直说，不用叫你。',
  mother: '你爸，没让我给你打这个电话。',
  'father-outgoing': '您拨打的用户暂时无法接通，请稍后再拨。',
  father: '没什么事。你忙吧。',
  coworker: '群里@你了。你没看到吧。',
};
const PHONE_STORY_SPEAKER: Record<PhoneStoryStep, string> = {
  wife: '老婆', silent: '陌生号码', hospital: '医院', mother: '妈妈',
  'father-outgoing': '打给爸', father: '爸回拨', coworker: '同事',
};
const PHONE_STORY_VOICE: Partial<Record<PhoneStoryStep, VoiceCueId>> = {
  wife: 'phone-wife-fridge',
  hospital: 'phone-hospital-not-call',
  mother: 'phone-mother-didnt-ask',
  'father-outgoing': 'phone-cannot-connect',
  father: 'father-adult-phone',
  coworker: 'phone-coworker-group',
};
const PHONE_REPEAT_CALLERS = ['wife', 'mother', 'coworker', 'hospital'] as const;
const PHONE_CALLERS = [...PHONE_STORY_STEPS] as const;
type PhoneCaller = typeof PHONE_CALLERS[number];
/** 收灯人的影子上限：它没有“打掉源头清场”的出路，不封顶会形成无解雪球。 */
const LAMP_SHADE_CAP = 6;
const LAMP_CYCLE_INTERVAL = 8.5;
const LAMP_STRIP_TO_RELEASE_DELAY = 1.4;
const LAMP_RELEASE_CONFIRM_DELAY = 1.5;
const BUS_BODY_HALF_LENGTH = 46;
const BUS_BODY_HALF_WIDTH = 30;
const BUS_DASH_SPEED = 340;
const BUS_DASH_DURATION = 1.1;
const BUS_DASH_SWEEP_START = -BUS_BODY_HALF_LENGTH;
const BUS_DASH_SWEEP_REACH = BUS_DASH_SPEED * BUS_DASH_DURATION + BUS_BODY_HALF_LENGTH;
const FATHER_CHARGE_DISTANCE = 132;
const FATHER_CHARGE_HIT_OVERHANG = 14;
const FATHER_CHARGE_HALF_WIDTH = 26;
const FATHER_COAT_BLOCK_HALF_WIDTH = 34;
const FATHER_CHARGE_MIN_DISTANCE = 20;
const FATHER_TANTRUM_RING_HALF_WIDTH = 20;
const FATHER_COAT_SHELTER_RADIUS = 44;
const PRAISE_SLAM_RADIUS = 230;
const COAT_SLEEVE_REACH = 165;
const COAT_SLEEVE_HALF_WIDTH = 26;
const COAT_DOUBLE_SLEEVE_HALF_WIDTH = 46;
const WET_SHOES_STOP_THRESHOLD = 1.2;
const WET_SHOES_SPEED_STEP = 4;
const WET_SHOES_MAX_SPEED = 96;
/** 《上门》是以催收人自身为圆心的拖行，不是朝玩家方向挥出的一条车道。 */
const COLLECTOR_DRAG_RADIUS = 280;
const HERO_SCREEN_X = 180;
const HERO_SCREEN_Y = 310;
// 主角稍微收小一点：把体量感让给怪物——大多数"困难"都该比一个人高。
const HERO_WORLD_SCALE = 0.88;
const HERO_BASE_SPEED = 132;
const SUMMER_SLIDE_DURATION = 0.18;
const SUMMER_SLIDE_SPEED = 96;
const MAX_ALIVE_ENEMIES = 18;
const MAX_PROJECTILES = 280;
const MAX_PENDING_SHOTS = 140;
const MAX_BURSTS = 140;
const MAX_COIN_DROPS = 70;
const MAX_ENEMY_DEATHS = 60;
const HURT_IFRAME = 0.75;
const HERO_ATTACK_ANIMATION_DURATION = 0.22;
const TYPING_INDICATOR_DOT_INTERVAL = 0.5;
const TYPING_INDICATOR_DOT_COUNT = 3;
const TYPING_INDICATOR_SPREAD_COUNT = 12;
const TYPING_INDICATOR_THIRD_DOT_HOLD = 0.5;
const JOYSTICK_INPUT_RADIUS = 46;
const JOYSTICK_KNOB_TRAVEL = 24;
const JOYSTICK_SAFE_X = 42;
const JOYSTICK_SAFE_TOP = 104;
const JOYSTICK_SAFE_BOTTOM = 548;
const TITLE_COVER_URL = new URL('./assets/ui/title-life-clutter.png', import.meta.url).href;
const TITLE_START_RECT = { x: 72, y: 470, width: 216, height: 58 } as const;
const TITLE_AUDIO_RECT = { x: 290, y: 16, width: 54, height: 30 } as const;
const ORIGIN_CONTINUE_RECT = { x: 64, y: 570, width: 232, height: 42 } as const;
const ORIGIN_RETRY_RECT = { x: 64, y: 558, width: 232, height: 42 } as const;
const ORIGIN_LEDGER_RECT = { x: 222, y: 532, width: 106, height: 25 } as const;
const LEDGER_OLDER_RECT = { x: 22, y: 566, width: 88, height: 38 } as const;
const LEDGER_CLOSE_RECT = { x: 120, y: 566, width: 120, height: 38 } as const;
const LEDGER_NEWER_RECT = { x: 250, y: 566, width: 88, height: 38 } as const;
const ORIGIN_LONG_WAIT_SECONDS = 30;
const AUDIO_PROMPT_ENABLE_RECT = { x: 38, y: 356, width: 136, height: 48 } as const;
const AUDIO_PROMPT_MUTE_RECT = { x: 186, y: 356, width: 136, height: 48 } as const;
const ONE_MORE_CONTINUE_RECT = { x: 30, y: 394, width: 142, height: 58 } as const;
const ONE_MORE_SLEEP_RECT = { x: 188, y: 394, width: 142, height: 58 } as const;
const LAMP_RELEASE_RECT = { x: 72, y: 394, width: 216, height: 58 } as const;
const XIAO_ZHANG_HELP_RECT = { x: 34, y: 394, width: 138, height: 54 } as const;
const XIAO_ZHANG_DECLINE_RECT = { x: 188, y: 394, width: 138, height: 54 } as const;
const RESULT_RESTART_RECT = { x: 70, y: 505, width: 220, height: 58 } as const;
const RESULT_TAB_RECT = { x: 20, y: 98, width: 320, height: 28 } as const;
const PAUSE_BUTTON_RECT = { x: 326, y: 6, width: 28, height: 39 } as const;
const PAUSE_BUTTON_HIT_RECT = { x: 310, y: 0, width: 50, height: 52 } as const;
const PAUSE_CONTINUE_RECT = { x: 130, y: 530, width: 204, height: 44 } as const;
const PAUSE_END_RECT = { x: 152, y: 584, width: 160, height: 26 } as const;
const PAUSE_TAB_RECT = { x: 130, y: 86, width: 204, height: 30 } as const;
const PAUSE_SETTING_VOLUME_RECT = { x: 142, y: 154, width: 180, height: 34 } as const;
const PAUSE_SETTING_AMBIENCE_RECT = { x: 142, y: 196, width: 180, height: 34 } as const;
const PAUSE_SETTING_VOICE_RECT = { x: 142, y: 238, width: 180, height: 34 } as const;
const PAUSE_SETTING_EFFECTS_RECT = { x: 142, y: 280, width: 180, height: 34 } as const;
const PAUSE_SETTING_HAPTICS_RECT = { x: 142, y: 328, width: 180, height: 38 } as const;
const PAUSE_SETTING_MOTION_RECT = { x: 142, y: 370, width: 180, height: 38 } as const;
const PAUSE_SETTING_CONTRAST_RECT = { x: 142, y: 412, width: 180, height: 38 } as const;
const FATE_FREE_CANCEL_RECT = { x: 105, y: 568, width: 150, height: 30 } as const;
const FATE_RESULT_CONTINUE_RECT = { x: 90, y: 470, width: 180, height: 44 } as const;
const ORIGIN_BADGE_RECT = { x: 8, y: H - 104, width: 122, height: 38 } as const;
const ORIGIN_BADGE_HIT_RECT = { x: 4, y: H - 112, width: 132, height: 54 } as const;
const FATE_FREE_CANCEL_DELAY = 4;
const SPECIAL_OFFER_RECTS = [
  { x: 14, y: 126, width: 104, height: 214 },
  { x: 128, y: 126, width: 104, height: 214 },
  { x: 242, y: 126, width: 104, height: 214 },
] as const;
const SPECIAL_LEAVE_RECT = { x: 104, y: 554, width: 152, height: 48 } as const;
const SPECIAL_HOLD_MS = 600;
/**
 * 语音字幕面板（320×62）是每帧最后画的，会盖住它下面的一切，所以落点按画面分开定：
 * 面板底边 y+62 必须停在该画面最靠上的可点控件之上——里屋「掀帘出去」554、
 * 当铺按钮行 558、命运「亲口说」568、战斗「物证」栏 573。战斗另外抬高到摇杆
 * 常驻的拇指区之上。缺省 486 对任何底部按钮行都是安全的。
 */
const VOICE_CAPTION_Y: Partial<Record<ScreenState, number>> = {
  battle: 442,
  fateEvent: 486,
  shop: 486,
  specialRoom: 486,
  itemReward: 486,
  origin: 492,
  result: 430,
};
type PauseTab = 'body' | 'origin' | 'fates' | 'settings';
const PAUSE_TABS: readonly PauseTab[] = ['body', 'origin', 'fates', 'settings'];
type ResultTab = 'seal' | 'items' | 'fates' | 'stats';
const RESULT_TABS: readonly ResultTab[] = ['seal', 'items', 'fates', 'stats'];
type RewardDestination = 'start' | 'advance' | 'battle';
type ScreenTransitionKind = 'first-breath' | 'page' | 'door' | 'lights-out';

interface ScreenTransitionState {
  from: ScreenState;
  to: ScreenState;
  kind: ScreenTransitionKind;
  startedAt: number;
  duration: number;
}

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
  projectileSpeed: 230,
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
  if (projectile.generation > 0) flags.push('echo');
  return flags;
}

const PROJECTILE_FORM_LABELS: Record<ProjectileForm, string> = {
  breath: '月白气团', paper: '折纸气', rain: '雨滴', sound: '声浪', key: '旧钥匙',
  bone: '骨节', tear: '眼泪', cone: '雾锥', echo: '回声', slash: '钝木气刃',
  razor: '银白薄刃', marble: '玻璃弹珠', ice: '霜壳', serial: '制式弹', typing: '句点',
  card: '卡片', button: '纽扣芯', workbook: '练习册', lens: '裂镜光', frame: '空相框',
  receipt: '小票', link: '助力链', stamp: '印章', pill: '药片', photo: '相片',
  stone: '压实气团', laugh: '哈字',
};

const PROJECTILE_TRAIL_LABELS: Record<ProjectileVisual['trail'], string> = {
  mist: '散雾', streak: '锋线', drip: '水痕', signal: '信号', echo: '回声', heavy: '重屑',
  ricochet: '折射', frost: '霜花', serial: '刻度', 'return-mark': '返记', curve: '弯折',
  'key-dust': '钥匙尘', clock: '停表', glitch: '错位', fade: '褪色', afterimage: '残影',
  chain: '链环', child: '跟随', pause: '停驻', home: '归家线', splinter: '木屑',
};

const PROJECTILE_MATERIAL_LABELS: Record<ProjectileVisual['materials'][number], string> = {
  breath: '气', paper: '纸', water: '水', bone: '骨', signal: '信号', metal: '金属',
  wood: '木', stone: '石', ice: '霜', key: '黄铜', glass: '玻璃',
};

const PROJECTILE_FLAG_LABELS: Record<ProjectileMechanicFlag, string> = {
  pierce: '穿透', returning: '回返', homing: '追踪', split: '分裂', area: '范围',
  orbit: '环绕', echo: '继承回声',
};

const PROJECTILE_FORM_DISPLAY_SIZE: Partial<Record<ProjectileForm, readonly [number, number, number, number]>> = {
  paper: [13, 2.2, 17, 28], rain: [11, 2.4, 15, 26], sound: [13, 2.4, 18, 30],
  key: [15, 3, 20, 31], tear: [11, 2.4, 15, 25], cone: [16, 2.6, 21, 34],
  slash: [18, 2.5, 23, 35], razor: [15, 2.3, 19, 28], marble: [14, 2.8, 18, 27],
  ice: [14, 2.5, 19, 30], serial: [14, 2.3, 18, 27], typing: [16, 2.5, 21, 36],
  button: [13, 2.2, 17, 25], link: [14, 2.3, 18, 28], stamp: [15, 2.3, 19, 29],
  stone: [14, 2.5, 19, 31], lens: [15, 2.4, 19, 30], laugh: [9, 3.8, 15, 23],
};

const INHERITED_PROJECTILE_ITEM_IDS: readonly ItemId[] = [
  'loose-button', 'fathers-raincoat', 'missing-photo', 'always-crying', 'three-day-visible',
  'retracted-voice', 'bargain-link', 'pregnancy-test', 'year-report', 'ai-chat', 'ktv-song',
];

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

// 延迟出膛的子弹（五连发的后四发、AI 的复读回声）
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
  ricochetDepth?: number;
  explosion: number;
  color: string;
  style: ProjectileStyle;
  critical: boolean;
  knockback: number;
  generation: number;
  priority?: 'core' | 'secondary';
  visualForm?: ProjectileForm;
  visualTone?: 'echo' | 'replay';
  visual?: ProjectileVisual;
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
  eliteAt: number;
  eliteType: EnemyType;
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
  boss: boolean;
  life: number;
  duration: number;
  faceLeft: boolean;
}

interface LanternHandoffState {
  startX: number;
  startY: number;
  startedAt: number;
}

const STAGES: StageSpec[] = [
  {
    chapter: '童年 · 床底王国', title: '没人相信的怪物', subtitle: '恐惧第一次有了形状',
    situation: ['下雨那天父亲把雨衣披给他，只说了一句「走吧」。', '熄灯以后，他听见床底也在呼吸；大人说，那里什么都没有。'],
    duration: 60, pool: ['cry-moth', 'fear', 'hunger-shadow'], spawnEvery: 2.5, rewardAt: 15,
    eliteAt: 19, eliteType: 'coat-rack', bossAt: 34, bossType: 'closet-dark', end: 'advance',
    enterLine: '他只好先学会害怕，再学会一个人睡。',
    groundTop: '#695d6f', groundBottom: '#403a48', propColor: '#8d7d98',
  },
  {
    chapter: '少年 · 千眼教室', title: '统一答案', subtitle: '所有目光都在批改你',
    situation: ['考试、排名、同学议论。', '每张卷子都像在替所有人决定他是谁。'],
    duration: 70, pool: ['red-mark', 'whisper', 'others-paper', 'sign-here'], spawnEvery: 2.3, rewardAt: 18,
    eliteAt: 25, eliteType: 'uniform-answer', bossAt: 44, bossType: 'silent-father', end: 'fate',
    enterLine: '他把理想写进作文。老师写「偏题，38 分」；父亲只说「站好，都是为你好」。',
    groundTop: '#71818a', groundBottom: '#46545d', propColor: '#92a4ac',
  },
  {
    chapter: '青年 · 齿轮车站', title: '错过的那一班', subtitle: '每个人都像比你早一步',
    situation: ['毕业、求职、租房。', '别人陆续上车，他还在原地证明自己够格。'],
    duration: 75, pool: ['id-scanner', 'missed-bus', 'task-simple', 'task-revise', 'task-deadline', 'task-sync'], spawnEvery: 1.9, stallAt: 14, rewardAt: 30,
    eliteAt: 23, eliteType: 'last-bus', bossAt: 49, bossType: 'praise-chair', end: 'advance',
    enterLine: '毕业证卷在行李箱底。他先学会了说「随时到岗」。',
    groundTop: '#8a7658', groundBottom: '#574936', propColor: '#9e865f',
  },
  {
    chapter: '成年 · 屋檐下的家', title: '响个不停', subtitle: '每一通都说只占一分钟',
    situation: ['医院来电话时，他正在把凉饭重新热一遍。', '父亲说「没事」；他也对家里说「工作不忙」。'],
    duration: 80, pool: ['missed-call', 'debt', 'silence', 'desk-lamp', 'reheated-pot'], spawnEvery: 1.75,
    eliteAt: 0, eliteType: 'wet-shoes', bossAt: 54, bossType: 'ringing-phone', doorAt: 24, end: 'fate',
    enterLine: '他刚说完「都是为你好」，才发现这句话自己听过。',
    groundTop: '#718475', groundBottom: '#46594b', propColor: '#88a08f',
  },
  {
    chapter: '中年 · 没有关灯的办公室', title: '名字还在表格里', subtitle: '门已经打不开了',
    situation: ['工资、体检和账单同时到期。', '工位比家更熟悉他的名字。'],
    duration: 75, pool: ['debt', 'badge-thief', 'whisper', 'meeting-door', 'checkup-report'], spawnEvery: 1.55, stallAt: 13, doorAt: 26,
    eliteAt: 29, eliteType: 'whose-box', bossAt: 49, bossType: 'debt-collector', end: 'fate',
    enterLine: '体检单比工资单先到。',
    groundTop: '#7c8993', groundBottom: '#4d5962', propColor: '#98a5ad',
  },
  {
    chapter: '暮年 · 白发荒原', title: '收灯人', subtitle: '它不凶，也不坏，它只是准时',
    situation: ['病房走廊越来越长。', '忘记的人和被忘记的人，一起等着最后一盏灯。'],
    duration: 95, pool: ['forgetter', 'empty-chair', 'debt', 'queue-screen', 'others-family', 'iv-stand'], spawnEvery: 1.8, stallAt: 18,
    eliteAt: 32, eliteType: 'revolving-lantern', end: 'final',
    enterLine: '工牌收走那天，他愣了一下，才想起来自己姓什么。',
    groundTop: '#85888b', groundBottom: '#555b61', propColor: '#9da3a5',
  },
];

assertStageNarrativeRoster(STAGES);

const STAGE_TRANSITION_DURATION = 4.2;
const CHAPTER_BRIDGES = [
  '床边灯亮过头，成了教室的日光灯',
  '红叉卷成车票，落进站台的风里',
  '车票塞进口袋，钥匙打开一扇家门',
  '饭桌上的账单，滑进了工位表格',
  '日光灯逐盏熄灭，只剩路口一盏灯',
] as const;

// The 40x44 atlas carries objects of very different physical sizes. Runtime
// scale preserves that hierarchy while sparse clusters prevent a repeating map grid.
const PROP_STAGE_SCALES = [
  [1.35, 1.0, 0.74, 0.76],
  [1.3, 0.9, 0.78, 0.9],
  [1.45, 0.86, 1.18, 1.0],
  [1.4, 1.15, 0.9, 1.08],
  [1.35, 1.08, 0.9, 0.96],
  [1.45, 1.18, 1.12, 1.0],
] as const;
const LIFE_PROP_OFFSETS = [
  [-48, -24],
  [44, -12],
  [-18, 48],
] as const;

const DARKNESS_START = 52;
const DARKNESS_SHRINK = 36;
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
const AGE_LABELS = LIFE_AGES;
const BINDER_PROJECTILE_TRIGGER_IDS = new Set<ItemId>([
  'loose-button', 'wooden-sword', 'red-workbook', 'stone-schoolbag', 'cracked-glasses',
  'only-key', 'held-pee', 'five-ha',
  'marble', 'three-day-visible', 'read-3am', 'streak-1847', 'shop-freezer',
]);

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
  private pixelBossSkills = new PixelBossSkillRenderer();
  private pixelXiaoZhang = new PixelXiaoZhangRenderer();
  private feedback = new LifeFeedback();
  private worldProps = worldPropAtlas;
  private titleCover = new Image();
  private state: ScreenState = 'title';
  private audioPromptOpen = false;
  private audioPromptStartedAt = 0;
  private hero: HeroState = { hp: 80, maxHp: 80, block: 0, coins: 4 };
  private items: ItemId[] = [];
  private origin?: OriginProfile;
  private requestedOriginKind: OriginKind = 'ordinary';
  private originModifiers: OriginModifiers = getOriginModifiers([]);
  private originElapsed = 0;
  private originAttempt = 0;
  private originRequestId = 0;
  private ledgerEntries: LifeLedgerEntry[] = readLifeLedger();
  private originLedgerOpen = false;
  private ledgerPage = 0;
  private ledgerRecordedForCurrentRun = false;
  private lastDamageSource = '';
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
  private lanternHandoff?: LanternHandoffState;
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
  private specialRoomPreviousLifeItem?: ItemId;
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
  private lastCheckpointKey = '';
  private coinKillProgress = 0;
  private stats: RunStats = { fateChoices: 0, swallowed: 0, exhaled: 0, volleys: 0, kills: 0, damage: 0, itemsTaken: 0, coinsSpent: 0 };
  private voiceCuesSeen = new Set<VoiceCueId>();
  private voiceEnemyKills: Partial<Record<EnemyType, number>> = {};
  private scheduledVoices: Array<{ id: VoiceCueId; playAt: number }> = [];
  private voiceCaption?: { id: VoiceCueId; time: number; duration: number; treatment: VoiceTreatment };
  private memoryRecall?: { text: string; time: number; duration: number };
  private lampGuardHintShown = false;
  private lastTime = 0;
  private accumulator = 0;
  private visualTime = 0;
  private devSnapshotAt = 0;
  private renderGameState?: () => string;
  private auditTimeScale = 1;
  private auditEndurance = false;
  private auditAutoMove = false;
  private auditBossArtActive = false;
  private auditDamageTaken = 0;
  private heroX = 0;
  private heroY = 0;
  private heroMoving = false;
  private heroInputMoving = false;
  private summerSlideTimer = 0;
  private summerSlideDX = 0;
  private summerSlideDY = 0;
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
  private stageEliteSpawned = false;
  private eliteSpawned = false;
  /** 少年章《统一答案》倒下的 battleTime；放学后的三段声音以它为锚点。 */
  private schoolEliteDefeatedAt = 0;
  /** 第五档固定掉落：正在展示的剧情道具，以及展示完要接回的 Boss 三选一。 */
  private storyDropId?: ItemId;
  private storyDropTimer = 0;
  private pendingDefeatReward?: EnemyType;
  /** 累计永久损失的最大生命：病历本「每损失10点，伤害+8%」的依据。 */
  private permanentHpLost = 0;
  private phoneMsgTimer = 0;
  private phoneMsgInterrupt = 0;
  private eliteAlertName = '';
  private eliteAlertTime = 0;
  private eliteAlertKind: 'elite' | 'boss' = 'elite';
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
  private darknessStartedAt = 0;
  private darkCX = 0;
  private darkCY = 0;
  private lampSpawned = false;
  private lampChoice?: {
    indices: [number, number];
    items: [ItemId, ItemId];
    x: [number, number];
    y: number;
    timer: number;
    total: number;
  };
  private lampItemsToReturnTotal = 0;
  private lampFinalStripTimer = 0;
  private lampReleaseReady = false;
  private lampReleaseTimer = 0;
  private finalFateTriggered = false;
  private hurtCooldown = 0;
  private screenShake = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private titleStartedAt = performance.now();
  private lastRenderedState?: ScreenState;
  private transitionFrame: HTMLCanvasElement;
  private screenTransition?: ScreenTransitionState;
  private pointerX = -1;
  private pointerY = -1;
  private pointerDown = false;
  private pointerInside = false;
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
  private typingIndicatorTimer = 0;
  private typingIndicatorBurstFlash = 0;
  private typingIndicatorBurstCount = 0;
  private lastVolleyRecipe: PendingShot[] = [];
  private lastRhythmMark = 0;
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
  /** 世界坐标危险带（统一答案的判分线／卷子推进）。 */
  private dangerBands: DangerBand[] = [];
  /**
   * 主角最近三秒走过的路（每 0.125s 采一点，最多 24 点）。
   * 《过程没写》按这条路重放伤害——"过程"反过来成了扣分的依据。
   */
  private heroTrail: Array<{ x: number; y: number }> = [];
  private heroTrailTimer = 0;
  /** 已经浮过的记忆，一条只浮一次。 */
  private recalledMemories = new Set<string>();
  private memoryRecallHandledThisStand = false;
  private fateFreeWaiting = false;
  private fateFreeWaitElapsed = 0;
  private fateFreeRequestId = 0;
  private fateAnim = 0;
  private fateExitTimer = 0;
  private fateResultMinTimer = 0;
  private fatePlayerText = '';
  private freeInputWrap?: HTMLDivElement;
  private standStillTime = 0;
  private heldPeeCharge = 0;
  private buttonRecordedDamage = 0;
  private schoolbagBurdenTime = 0;
  private razorScars = 0;
  private binderCards: ItemId[] = [];
  private lastDistanceCritBonus = 0;
  private flashCooldown = 0;
  private takeoutWarmTimer = 0;
  private nauseaTimer = 0;
  private goodnightPulseTimer = 0;
  private whiteBottlePulseTimer = 0;
  private autoRenewGlowTimer = 0;
  private checkupPulseTimer = 0;
  private momoPulseTimer = 0;
  private momoRangeState: 'safe' | 'neutral' | 'threatened' = 'neutral';
  private snowUsed = false;
  private snowFlickerTimer = 0;
  private snowFlickerCooldown = 8;
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
  private eyeClosedTimer = 0;
  private enemyHasteTimer = 0;
  private pillTimer = 0;
  private pillPulseTimer = 0;
  private pillPhaseState: 'rage' | 'crash' | 'neutral' = 'neutral';
  private bowlWarmthBlock = 0;
  private oneMorePrompt = false;
  private oneMoreFocus: 0 | 1 = 0;
  private oneMoreStacks = 0;
  private oneMoreOpeningTimer = 0;
  // —— 青年到中年的传承线《一起入职的小张》——
  private helpedXiaoZhang = false;
  private xiaoZhangBetrayed = false;
  private xiaoZhangDecision: 'none' | 'helped' | 'declined' = 'none';
  private xiaoZhangSpawned = false;
  private xiaoZhangWorld?: { x: number; y: number };
  private xiaoZhangAlly?: { x: number; y: number; fireCooldown: number; faceLeft: boolean };
  private xiaoZhangPrompt = false;
  private xiaoZhangFocus: 0 | 1 = 0;
  // 《谁的纸箱·清点》只暂停效果，不从背包删物件；出关统一恢复。
  private stageDisabledItems = new Set<ItemId>();
  private boxSavedItem?: ItemId;
  private divorceUsedStage = false;
  private divorceDeferredDamage = 0;
  private gymMomentum = 0;
  private gymShownLayer = 0;
  private powerbankCharge = 0;
  private powerbankBurstTimer = 0;
  private powerbankRentalSeconds = 0;
  private powerbankLocked = false;
  private drankLayers = 0;
  private drankStoredDamage = 0;
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
  // —— 青年《你很优秀》：他夸你，加成是真的 ——
  /** 好话叠层：伤害/攻速/移速百分比。一阶段只涨不减；二阶段翻脸后不再给。 */
  private praiseDamage = 0;
  private praiseFire = 0;
  private praiseMove = 0;
  private praiseSpawnCount = 0;
  private praiseMoveIndex = 0;
  private praiseOneSeatUsed = false;
  private praiseConsult?: { x: number; y: number; timer: number; total: number; extraTasks: number };
  private praisePaperZones: Array<{ x: number; y: number; life: number; total: number }> = [];
  private praisePaperDropTimer = 0;
  // —— 成年《响个不停》 ——
  private phoneRinging = false;
  private phoneRingWindow = 0;
  private phoneAnswer = 0;
  private phoneMissed = 0;
  private phoneCalls: Array<{ x: number; y: number }> = [];
  private phoneAnswerTarget = -1;
  private phoneRelief = 0;
  /** 下一通固定剧情编号：0-5 一阶段，6 二阶段，7 表示七通战斗来电已结束。 */
  private phoneStoryIndex = 0;
  private phoneActiveStoryIndex = -1;
  private phonePostAnswerTimer = 0;
  private phoneTranscript?: { speaker: string; text: string; timer: number };
  private lastPhoneCaller?: PhoneCaller;
  // —— 少年《沉默的父亲》：雨、干地、落下的雨衣 ——
  private rainActive = false;
  /** 雨势 0.4–1.0 周期起伏；>0.8 触发《外面冷》且壳更硬（减伤上限 4→3）。 */
  private rainIntensity = 0.6;
  private rainClock = 0;
  private rainTick = 0;
  private heroInRain = false;
  /** 《外面冷》：父亲停止追击、转身迎雨的时长；期间干地扩大，是输出窗口。 */
  private fatherBraceTimer = 0;
  private fatherCycleIndex = 0;
  /** 五个会显示的攻击名只在首次出现时显示；《外面冷》按设计保持无名。 */
  private fatherAttackNamesSeen = new Set<string>();
  private fatherSecondPhaseLineShown = false;
  /** 二阶段落下的雨衣：场地软掩体——挡泪滴、截雨圈、让冲撞提前停。 */
  private fallenCoatX?: number;
  private fallenCoatY?: number;
  /** 《我没有哭》的泪滴弹；不追踪，雨衣可挡。 */
  private tearDrops: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];
  /** 《都怪你》的三圈跺脚雨圈；到点结算，雨衣附近是安全角。 */
  private tantrumRings: Array<{ x: number; y: number; radius: number; at: number; damage: number }> = [];
  private pillowPenalty = 0;
  private boughtThisShop = false;
  private petGone = false;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('当前设备不支持 Canvas 2D');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.transitionFrame = document.createElement('canvas');
    this.transitionFrame.width = W;
    this.transitionFrame.height = H;
    this.titleCover.decoding = 'async';
    this.titleCover.src = TITLE_COVER_URL;
    this.installInput();
    this.installTestHooks();
    // 断点恢复：无审计参数时，启动即尝试恢复上一局（豆抖平台可能中途断连）。
    // 恢复沿用存档里已 AI 生成的出生，不是新造出生，不触碰"每局 AI 出生"红线。
    const bootParams = new URLSearchParams(window.location.search);
    if (bootParams.has('audio-prompt')) this.audioPromptOpen = true;
    if (!bootParams.has('audit') && !bootParams.has('audit-screen')) {
      this.tryResumeFromCheckpoint();
    }
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
      this.pointerX = p.x;
      this.pointerY = p.y;
      this.pointerDown = true;
      this.pointerInside = true;
      if (this.paused) {
        this.handlePausePointerDown(p, event.pointerId);
        return;
      }
      if ((this.state === 'battle' || this.state === 'fateEvent') && pointInRect(p, PAUSE_BUTTON_HIT_RECT)) {
        this.setPaused(true);
        return;
      }
      if (this.state === 'title') {
        if (this.audioPromptOpen) {
          if (pointInRect(p, AUDIO_PROMPT_ENABLE_RECT)) {
            this.feedback.setAudioEnabled(true);
            this.audioPromptOpen = false;
            this.feedback.play('page');
            this.startRun();
          } else if (pointInRect(p, AUDIO_PROMPT_MUTE_RECT)) {
            this.feedback.setAudioEnabled(false);
            this.audioPromptOpen = false;
            this.startRun();
          }
          return;
        }
        if (pointInRect(p, TITLE_AUDIO_RECT)) {
          this.feedback.setAudioEnabled(!this.feedback.audioEnabled());
          if (this.feedback.audioEnabled()) this.feedback.play('page');
        } else if (pointInRect(p, TITLE_START_RECT)) {
          if (this.feedback.hasAudioChoice()) this.startRun();
          else {
            this.audioPromptOpen = true;
            this.audioPromptStartedAt = performance.now();
          }
        }
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
        if (this.originLedgerOpen) {
          if (pointInRect(p, LEDGER_OLDER_RECT) && this.ledgerPage < this.ledgerEntries.length - 1) {
            this.ledgerPage += 1;
            this.feedback.play('page');
          } else if (pointInRect(p, LEDGER_NEWER_RECT) && this.ledgerPage > 0) {
            this.ledgerPage -= 1;
            this.feedback.play('page');
          } else if (pointInRect(p, LEDGER_CLOSE_RECT)) {
            this.originLedgerOpen = false;
            this.feedback.play('page');
          }
          return;
        }
        if (pointInRect(p, ORIGIN_LEDGER_RECT)) {
          if (this.ledgerEntries.length) {
            this.ledgerPage = 0;
            this.originLedgerOpen = true;
            this.feedback.play('page');
          }
          return;
        }
        if (this.aiOriginState === 'error' || this.originLongWaitReady()) this.retryOrigin();
        else if (this.aiOriginState === 'gpt') {
          if (this.originStoryComplete()) this.openInitialItemReward();
          else this.originElapsed = this.originStoryDuration();
        }
        return;
      }
      if (this.state === 'battle') {
        if (this.lampFinalStripTimer > 0) return;
        if (this.lampReleaseReady) {
          if (this.lampReleaseTimer <= 0 && pointInRect(p, LAMP_RELEASE_RECT)) this.releaseFinalBreath();
          return;
        }
        if (this.xiaoZhangPrompt) {
          if (pointInRect(p, XIAO_ZHANG_HELP_RECT)) this.resolveXiaoZhangChoice(true);
          else if (pointInRect(p, XIAO_ZHANG_DECLINE_RECT)) this.resolveXiaoZhangChoice(false);
          return;
        }
        if (this.oneMorePrompt) {
          if (pointInRect(p, ONE_MORE_CONTINUE_RECT)) this.resolveOneMoreGame(true);
          else if (pointInRect(p, ONE_MORE_SLEEP_RECT)) this.resolveOneMoreGame(false);
          return;
        }
        if (pointInRect(p, ORIGIN_BADGE_HIT_RECT)) {
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
      if (this.state === 'storyDrop') {
        if (this.storyDropTimer >= 0.55) this.finishStoryDrop();
        return;
      }
      if (this.state === 'itemReward' && p.y >= this.rewardRowsTop() && p.y < this.rewardRowsTop() + this.itemRewardChoices.length * this.rewardRowStride()) {
        this.itemRewardFocus = this.clamp(Math.floor((p.y - this.rewardRowsTop()) / this.rewardRowStride()), 0, this.itemRewardChoices.length - 1);
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
      this.pointerX = p.x;
      this.pointerY = p.y;
      this.pointerInside = true;
      if (this.state === 'battle' && this.xiaoZhangPrompt) {
        if (pointInRect(p, XIAO_ZHANG_HELP_RECT)) this.xiaoZhangFocus = 0;
        else if (pointInRect(p, XIAO_ZHANG_DECLINE_RECT)) this.xiaoZhangFocus = 1;
        return;
      }
      if (this.state === 'battle' && this.oneMorePrompt) {
        if (pointInRect(p, ONE_MORE_CONTINUE_RECT)) this.oneMoreFocus = 0;
        else if (pointInRect(p, ONE_MORE_SLEEP_RECT)) this.oneMoreFocus = 1;
        return;
      }
      if (this.state === 'itemReward' && p.y >= this.rewardRowsTop() && p.y < this.rewardRowsTop() + this.itemRewardChoices.length * this.rewardRowStride()) {
        this.itemRewardFocus = this.clamp(Math.floor((p.y - this.rewardRowsTop()) / this.rewardRowStride()), 0, this.itemRewardChoices.length - 1);
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
      this.pointerDown = false;
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
      this.pointerDown = false;
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
    this.canvas.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      this.pointerDown = false;
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
      if (this.state === 'origin' && this.originLedgerOpen) {
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowUp') && this.ledgerPage < this.ledgerEntries.length - 1) {
          this.ledgerPage += 1;
          this.feedback.play('page');
        } else if ((event.key === 'ArrowRight' || event.key === 'ArrowDown') && this.ledgerPage > 0) {
          this.ledgerPage -= 1;
          this.feedback.play('page');
        } else if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
          this.originLedgerOpen = false;
          this.feedback.play('page');
        }
        event.preventDefault();
        return;
      }
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
      if (this.state === 'battle' && this.lampReleaseReady) {
        if ((event.key === 'Enter' || event.key === ' ') && this.lampReleaseTimer <= 0) {
          this.releaseFinalBreath();
        }
        event.preventDefault();
        return;
      }
      if (this.state === 'battle' && this.lampFinalStripTimer > 0) {
        event.preventDefault();
        return;
      }
      if (this.state === 'battle' && this.xiaoZhangPrompt) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          this.xiaoZhangFocus = this.xiaoZhangFocus === 0 ? 1 : 0;
        } else if (event.key === '1') this.xiaoZhangFocus = 0;
        else if (event.key === '2') this.xiaoZhangFocus = 1;
        else if (event.key === 'Enter' || event.key === ' ') this.resolveXiaoZhangChoice(this.xiaoZhangFocus === 0);
        event.preventDefault();
        return;
      }
      if (this.state === 'battle' && this.oneMorePrompt) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          this.oneMoreFocus = this.oneMoreFocus === 0 ? 1 : 0;
        } else if (event.key === '1') this.oneMoreFocus = 0;
        else if (event.key === '2') this.oneMoreFocus = 1;
        else if (event.key === 'Enter' || event.key === ' ') this.resolveOneMoreGame(this.oneMoreFocus === 0);
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
        if (this.audioPromptOpen) {
          this.feedback.setAudioEnabled(true);
          this.audioPromptOpen = false;
          this.feedback.play('page');
          this.startRun();
        } else if (this.feedback.hasAudioChoice()) this.startRun();
        else {
          this.audioPromptOpen = true;
          this.audioPromptStartedAt = performance.now();
        }
        return;
      }
      if (this.state === 'origin' && (event.key === 'Enter' || event.key === ' ')) {
        if (this.aiOriginState === 'error' || this.originLongWaitReady()) this.retryOrigin();
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
      if (this.state === 'storyDrop') {
        if ((event.key === 'Enter' || event.key === ' ') && this.storyDropTimer >= 0.55) this.finishStoryDrop();
        event.preventDefault();
        return;
      }
      const digit = Number(event.key);
      if (this.state === 'itemReward') {
        const count = Math.max(1, this.itemRewardChoices.length);
        if (digit >= 1 && digit <= count) this.itemRewardFocus = digit - 1;
        else if (event.key === 'ArrowUp') this.itemRewardFocus = (this.itemRewardFocus + count - 1) % count;
        else if (event.key === 'ArrowDown') this.itemRewardFocus = (this.itemRewardFocus + 1) % count;
        if ((digit >= 1 && digit <= count) || event.key === 'Enter' || event.key === ' ') {
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
      this.feedback.stopVoice();
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
      this.feedback.stopVoice();
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
      const volumeTarget = [
        { rect: PAUSE_SETTING_VOLUME_RECT, channel: undefined },
        { rect: PAUSE_SETTING_AMBIENCE_RECT, channel: 'ambience' as const },
        { rect: PAUSE_SETTING_VOICE_RECT, channel: 'voice' as const },
        { rect: PAUSE_SETTING_EFFECTS_RECT, channel: 'effects' as const },
      ].find((entry) => pointInPaddedRect(point, entry.rect, 0, 5));
      if (volumeTarget) {
        const { rect, channel } = volumeTarget;
        const trackStart = rect.x + 78;
        const trackWidth = rect.width - 92;
        if (point.x < trackStart - 12) {
          if (channel) {
            this.feedback.setMixVolume(channel, this.feedback.getMixVolume(channel) > 0 ? 0 : 1);
          } else this.feedback.setVolume(this.feedback.getVolume() > 0 ? 0 : 0.42);
        } else {
          const next = this.clamp((point.x - trackStart) / trackWidth, 0, 1);
          if (channel) this.feedback.setMixVolume(channel, next);
          else this.feedback.setVolume(next);
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
      this.lastDamageSource = '自己合上了档案';
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
    this.heroInputMoving = false;
    this.summerSlideTimer = 0;
    this.summerSlideDX = 0;
    this.summerSlideDY = 0;
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

  /**
   * 断点恢复：把当前对局快照成 RunCheckpoint。返回类型强制包含全部字段，
   * 漏字段会在编译期报错。仅在稳定的"画面间"时刻可存档（战斗/命运/奖励/商店/特殊房）；
   * title/result/origin 与命运牌异步未就绪时返回 null。
   */
  private captureCheckpoint(): RunCheckpoint | null {
    if (!this.origin) return null;
    const screen = this.state;
    if (screen !== 'battle' && screen !== 'fateEvent' && screen !== 'itemReward'
      && screen !== 'shop' && screen !== 'specialRoom') return null;
    // 命运牌是异步生成的：正文未落定（或正在播放结果动画）时不存，避免恢复出空事件。
    if (screen === 'fateEvent' && (!this.currentFate || this.fateResultDirection)) return null;
    return {
      version: 1,
      savedAt: Date.now(),
      screen,
      runSeed: this.runSeed,
      rngState: this.rngState,
      encounterIndex: this.encounterIndex,
      requestedOriginKind: this.requestedOriginKind,
      origin: this.origin,
      hero: { hp: this.hero.hp, maxHp: this.hero.maxHp, block: this.hero.block, coins: this.hero.coins },
      items: [...this.items],
      poisons: { ...this.poisons },
      memories: [...this.memories],
      recalledMemories: [...this.recalledMemories],
      fateReceipts: this.fateReceipts.map((receipt) => ({ ...receipt })),
      stats: { ...this.stats },
      fateBuild: { ...this.fateBuild },
      persistent: {
        firstFateDamageReduction: this.firstFateDamageReduction,
        strainTendency: this.strainTendency,
        lightTendency: this.lightTendency,
        phoneCharges: this.phoneCharges,
        voiceCharges: this.voiceCharges,
        ruCharges: this.ruCharges,
        noBuyStacks: this.noBuyStacks,
        deathSaves: this.deathSaves,
        heartCount: this.heartCount,
        petGone: this.petGone,
        graceUsed: this.graceUsed,
        coinKillProgress: this.coinKillProgress,
        oneMoreStacks: this.oneMoreStacks,
        helpedXiaoZhang: this.helpedXiaoZhang,
        xiaoZhangBetrayed: this.xiaoZhangBetrayed,
        xiaoZhangDecision: this.xiaoZhangDecision,
        comboSeen: [...this.comboSeen],
        synergySeen: [...this.synergySeen],
      },
      battleTime: this.battleTime,
      permanentHpLost: this.permanentHpLost,
      currentFate: this.currentFate,
      fateDestination: this.fateDestination,
      fateResultDirection: this.fateResultDirection,
      initialItemReward: this.initialItemReward,
      rewardTitle: this.rewardTitle,
      rewardReturn: this.rewardReturn,
      itemRewardChoices: [...this.itemRewardChoices],
      itemRewardFocus: this.itemRewardFocus,
      rewardAcquire: this.rewardAcquire ? { ...this.rewardAcquire } : undefined,
      shopOffers: this.shopOffers.map((offer) => ({ ...offer })),
      shopFocus: this.shopFocus,
      boughtThisShop: this.boughtThisShop,
      specialRoomKind: this.specialRoomKind,
      specialRoomOffers: [...this.specialRoomOffers],
      specialRoomTaken: [...this.specialRoomTaken],
      specialRoomFocus: this.specialRoomFocus,
      specialRoomPreviousLifeItem: this.specialRoomPreviousLifeItem,
    };
  }

  /** 每帧调用：仅当可存档且状态签名变化时写盘，避免每帧 localStorage 写入。 */
  private maybePersistCheckpoint(): void {
    const checkpoint = this.captureCheckpoint();
    if (!checkpoint) return;
    const key = [
      checkpoint.screen,
      checkpoint.encounterIndex,
      checkpoint.items.length,
      Math.round(checkpoint.hero.hp),
      checkpoint.hero.coins,
      checkpoint.currentFate?.title ?? '',
      checkpoint.itemRewardChoices.join(','),
      checkpoint.shopOffers.map((offer) => `${offer.item}:${offer.sold ? 1 : 0}`).join(','),
      checkpoint.specialRoomOffers.join(','),
      checkpoint.specialRoomTaken.length,
      checkpoint.recalledMemories.join(','),
      checkpoint.persistent.xiaoZhangDecision,
      checkpoint.persistent.xiaoZhangBetrayed ? 1 : 0,
    ].join('|');
    if (key === this.lastCheckpointKey) return;
    if (writeRunCheckpoint(checkpoint)) this.lastCheckpointKey = key;
  }

  /** 把快照写回对局字段，并按画面重建场景。任何异常由调用方兜底清档回标题。 */
  private applyCheckpoint(checkpoint: RunCheckpoint): void {
    this.runSerial += 1;
    this.fateGenerationId += 1; // 作废任何在飞的命运异步请求
    this.runSeed = checkpoint.runSeed;
    this.rngState = checkpoint.rngState;
    this.encounterIndex = checkpoint.encounterIndex;
    this.requestedOriginKind = checkpoint.requestedOriginKind;
    this.origin = checkpoint.origin;
    this.originModifiers = getOriginModifiers(checkpoint.origin.traits);
    this.originAttempt = 0;
    this.originElapsed = this.originStoryDuration();
    this.ledgerEntries = readLifeLedger();
    this.originLedgerOpen = false;
    this.ledgerPage = 0;
    this.ledgerRecordedForCurrentRun = false;
    this.lastDamageSource = '';
    this.aiOriginState = 'gpt';
    this.hero = {
      hp: checkpoint.hero.hp,
      maxHp: checkpoint.hero.maxHp,
      block: checkpoint.hero.block,
      coins: checkpoint.hero.coins,
    };
    this.items = [...checkpoint.items];
    this.poisons = { ...checkpoint.poisons };
    this.memories = [...checkpoint.memories];
    this.recalledMemories = new Set(checkpoint.recalledMemories);
    this.memoryRecall = undefined;
    this.memoryRecallHandledThisStand = false;
    this.fateReceipts = checkpoint.fateReceipts.map((receipt) => ({ ...receipt }));
    this.stats = { ...checkpoint.stats };
    this.fateBuild = { ...checkpoint.fateBuild };
    this.firstFateDamageReduction = checkpoint.persistent.firstFateDamageReduction;
    this.strainTendency = checkpoint.persistent.strainTendency;
    this.lightTendency = checkpoint.persistent.lightTendency;
    this.phoneCharges = checkpoint.persistent.phoneCharges;
    this.voiceCharges = checkpoint.persistent.voiceCharges;
    this.ruCharges = checkpoint.persistent.ruCharges;
    this.noBuyStacks = checkpoint.persistent.noBuyStacks;
    this.deathSaves = checkpoint.persistent.deathSaves;
    this.heartCount = checkpoint.persistent.heartCount;
    this.petGone = checkpoint.persistent.petGone;
    this.graceUsed = checkpoint.persistent.graceUsed;
    this.coinKillProgress = checkpoint.persistent.coinKillProgress;
    this.oneMoreStacks = checkpoint.persistent.oneMoreStacks;
    this.helpedXiaoZhang = checkpoint.persistent.helpedXiaoZhang;
    this.xiaoZhangBetrayed = checkpoint.persistent.xiaoZhangBetrayed;
    this.xiaoZhangDecision = checkpoint.persistent.xiaoZhangDecision;
    this.comboSeen = new Set(checkpoint.persistent.comboSeen);
    this.synergySeen = new Set(checkpoint.persistent.synergySeen);
    this.battleTime = checkpoint.battleTime;
    this.permanentHpLost = checkpoint.permanentHpLost;
    this.initialItemReward = checkpoint.initialItemReward;
    this.rewardTitle = checkpoint.rewardTitle;
    this.rewardReturn = checkpoint.rewardReturn;
    this.itemRewardChoices = [...checkpoint.itemRewardChoices];
    this.itemRewardFocus = checkpoint.itemRewardFocus;
    this.rewardAcquire = undefined; // 恢复到拾取动画之前，交互重新开始
    this.shopOffers = checkpoint.shopOffers.map((offer) => ({ ...offer }));
    this.shopFocus = checkpoint.shopFocus;
    this.boughtThisShop = checkpoint.boughtThisShop;
    this.specialRoomKind = checkpoint.specialRoomKind;
    this.specialRoomOffers = [...checkpoint.specialRoomOffers];
    this.specialRoomTaken = new Set(checkpoint.specialRoomTaken);
    this.specialRoomFocus = checkpoint.specialRoomFocus;
    this.specialRoomPreviousLifeItem = checkpoint.specialRoomPreviousLifeItem;
    this.fateDestination = checkpoint.fateDestination;
    this.currentFate = checkpoint.currentFate;
    // 清空一切瞬态战场对象
    this.enemies = [];
    this.enemyDeaths = [];
    this.lanternHandoff = undefined;
    this.projectiles = [];
    this.bursts = [];
    this.pendingShots = [];
    this.coinDrops = [];
    this.prefetchedFate = undefined;
    this.paused = false;
    this.resetMovementInput();
    this.resetFateInput();
    this.closeFreeInput();
    switch (checkpoint.screen) {
      case 'battle':
        this.startStage(true); // 重建敌人/计时，跳过一次性入场经济
        break;
      case 'fateEvent':
        this.aiFateState = this.currentFate ? 'gpt' : 'fallback';
        this.fateResultDirection = undefined;
        this.fateResultTimer = 0;
        this.fateAnim = 0;
        this.fateExitTimer = 0;
        this.fateResultMinTimer = 0;
        this.fatePlayerText = '';
        this.state = 'fateEvent';
        break;
      case 'itemReward':
      case 'shop':
      case 'specialRoom':
        this.state = checkpoint.screen;
        break;
    }
  }

  /** 启动时尝试恢复上一局；快照非法或恢复抛错则清档回到标题。 */
  private tryResumeFromCheckpoint(): boolean {
    let checkpoint: RunCheckpoint | null = null;
    try {
      checkpoint = readRunCheckpoint();
    } catch {
      checkpoint = null;
    }
    if (!checkpoint) return false;
    try {
      this.applyCheckpoint(checkpoint);
      this.lastCheckpointKey = '';
      return true;
    } catch {
      clearRunCheckpoint();
      this.state = 'title';
      return false;
    }
  }

  private startRun(fixedSeed?: number, auditBypassOrigin = false): void {
    clearRunCheckpoint();
    this.lastCheckpointKey = '';
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
    this.ledgerEntries = readLifeLedger();
    this.originLedgerOpen = false;
    this.ledgerPage = 0;
    this.ledgerRecordedForCurrentRun = false;
    this.lastDamageSource = '';
    const originRequestId = ++this.originRequestId;
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
    this.lanternHandoff = undefined;
    this.projectiles = [];
    this.bursts = [];
    this.shopOffers = [];
    this.shopFeedback = undefined;
    this.specialRoomOffers = [];
    this.specialRoomTaken.clear();
    this.specialRoomFocus = 0;
    this.specialRoomPreviousLifeItem = undefined;
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
    this.permanentHpLost = 0;
    this.phoneMsgTimer = 0;
    this.phoneMsgInterrupt = 0;
    this.storyDropId = undefined;
    this.storyDropTimer = 0;
    this.pendingDefeatReward = undefined;
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
    this.voiceCuesSeen.clear();
    this.voiceEnemyKills = {};
    this.scheduledVoices = [];
    this.voiceCaption = undefined;
    this.lampGuardHintShown = false;
    this.feedback.stopVoice();
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
    this.stageEliteSpawned = false;
    this.eliteSpawned = false;
    this.schoolEliteDefeatedAt = 0;
    this.eliteAlertName = '';
    this.eliteAlertTime = 0;
    this.eliteAlertKind = 'elite';
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
    this.memoryRecall = undefined;
    this.transitionTimer = 0;
    this.darkActive = false;
    this.darkR = 9999;
    this.darknessStartedAt = 0;
    this.lampSpawned = false;
    this.lampChoice = undefined;
    this.lampItemsToReturnTotal = 0;
    this.lampFinalStripTimer = 0;
    this.lampReleaseReady = false;
    this.lampReleaseTimer = 0;
    this.finalFateTriggered = false;
    this.hurtCooldown = 0;
    this.screenShake = 0;
    this.rewardReturn = 'advance';
    this.originBadgeExpanded = false;
    this.comboSeen.clear();
    this.standStillTime = 0;
    this.heldPeeCharge = 0;
    this.buttonRecordedDamage = 0;
    this.schoolbagBurdenTime = 0;
    this.razorScars = 0;
    this.binderCards = [];
    this.lastDistanceCritBonus = 0;
    this.flashCooldown = 0;
    this.takeoutWarmTimer = 0;
    this.nauseaTimer = 0;
    this.goodnightPulseTimer = 0;
    this.whiteBottlePulseTimer = 0;
    this.autoRenewGlowTimer = 0;
    this.momoPulseTimer = 0;
    this.momoRangeState = 'neutral';
    this.checkupPulseTimer = 0;
    this.snowUsed = false;
    this.snowFlickerTimer = 0;
    this.snowFlickerCooldown = this.hasItem('snow-screen') ? 7 + this.random() * 9 : 8;
    this.coinDrops = [];
    this.voiceCharges = 0;
    this.ruCharges = 0;
    this.noHitTime = 0;
    this.borrowedStat = undefined;
    this.graceUsed = false;
    this.graceTimer = 0;
    this.eyeTimer = 0;
    this.eyeClosedTimer = 0;
    this.enemyHasteTimer = 0;
    this.pillTimer = 0;
    this.pillPulseTimer = 0;
    this.pillPhaseState = 'neutral';
    this.bowlWarmthBlock = 0;
    this.oneMorePrompt = false;
    this.oneMoreFocus = 0;
    this.oneMoreStacks = 0;
    this.oneMoreOpeningTimer = 0;
    this.helpedXiaoZhang = false;
    this.xiaoZhangBetrayed = false;
    this.xiaoZhangDecision = 'none';
    this.xiaoZhangSpawned = false;
    this.xiaoZhangWorld = undefined;
    this.xiaoZhangAlly = undefined;
    this.xiaoZhangPrompt = false;
    this.xiaoZhangFocus = 0;
    this.stageDisabledItems.clear();
    this.boxSavedItem = undefined;
    this.divorceUsedStage = false;
    this.divorceDeferredDamage = 0;
    this.gymMomentum = 0;
    this.gymShownLayer = 0;
    this.powerbankCharge = 0;
    this.powerbankBurstTimer = 0;
    this.powerbankRentalSeconds = 0;
    this.powerbankLocked = false;
    this.drankLayers = 0;
    this.drankStoredDamage = 0;
    this.hairUsedStage = false;
    this.comboReveal = undefined;
    this.comboRevealQueue = [];
    this.pendingShots = [];
    this.typingIndicatorTimer = 0;
    this.typingIndicatorBurstFlash = 0;
    this.typingIndicatorBurstCount = 0;
    this.lastVolleyRecipe = [];
    this.lastRhythmMark = 0;
    this.rhythmBrokenWindow = -1;
    this.lastStandoffMark = 0;
    this.deathSaves = 0;
    this.saveEffect = null;
    this.ktvTimer = 0;
    this.synergySeen.clear();
    this.watchReleaseTimer = 0;
    this.heartCount = 0;
    this.answeredUsedStage = false;
    this.usefulTimer = 0;
    this.lastSighMark = 0;
    this.recalledMemories.clear();
    this.memoryRecallHandledThisStand = false;
    this.goodnightTick = 30;
    this.sockTick = 45;
    this.sockBoostTimer = 0;
    this.heroSlowTimer = 0;
    this.noBuyStacks = 0;
    this.tauntTimer = 8;
    this.billTimer = 0;
    this.praiseDamage = 0;
    this.praiseFire = 0;
    this.praiseMove = 0;
    this.praiseSpawnCount = 0;
    this.praiseMoveIndex = 0;
    this.praiseOneSeatUsed = false;
    this.praiseConsult = undefined;
    this.praisePaperZones = [];
    this.praisePaperDropTimer = 0;
    this.phoneRinging = false;
    this.phoneRingWindow = 0;
    this.phoneAnswer = 0;
    this.phoneMissed = 0;
    this.phoneCalls = [];
    this.phoneAnswerTarget = -1;
    this.phoneRelief = 0;
    this.phoneStoryIndex = 0;
    this.phoneActiveStoryIndex = -1;
    this.phonePostAnswerTimer = 0;
    this.phoneTranscript = undefined;
    this.lastPhoneCaller = undefined;
    this.rainActive = false;
    this.rainIntensity = 0.6;
    this.rainClock = 0;
    this.rainTick = 0;
    this.heroInRain = false;
    this.fatherBraceTimer = 0;
    this.fatherCycleIndex = 0;
    this.fatherAttackNamesSeen.clear();
    this.fatherSecondPhaseLineShown = false;
    this.fallenCoatX = undefined;
    this.fallenCoatY = undefined;
    this.tearDrops = [];
    this.tantrumRings = [];
    this.takeoutTick = 2;
    this.stunTimer = 0;
    this.pillowPenalty = 0;
    this.boughtThisShop = false;
    this.petGone = false;
    if (auditBypassOrigin && import.meta.env.DEV) {
      this.origin = {
        title: '弹体审查员',
        nickname: '试射员',
        story: ['这里只用于开发环境的弹体审查。'],
        kind: 'ordinary',
        traits: [],
        appearance: { ...DEFAULT_APPEARANCE },
        source: 'local',
      };
      this.aiOriginState = 'gpt';
      this.originElapsed = this.originStoryDuration();
      return;
    }
    void this.hydrateOrigin(this.runSerial, this.requestedOriginKind, originRequestId);
  }

  private pickOriginKind(): OriginKind {
    const roll = this.random();
    if (roll < 0.25) return 'ordinary';
    if (roll < 0.7) return 'mixed';
    if (roll < 0.85) return 'favored';
    return 'harsh';
  }

  private async hydrateOrigin(runSerial: number, kind: OriginKind, requestId: number): Promise<void> {
    const wheels = rollOriginWheels(() => this.random());
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (this.runSerial !== runSerial || this.originRequestId !== requestId || this.state !== 'origin') return;
      this.originAttempt = attempt;
      const nonce = `${runSerial}-${attempt}-${Date.now().toString(36)}`;
      const generated = await generateAIOrigin(this.runSeed, kind, nonce, wheels);
      if (this.runSerial !== runSerial || this.originRequestId !== requestId || this.state !== 'origin') return;
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
    if (this.state !== 'origin'
      || (this.aiOriginState !== 'error' && !this.originLongWaitReady())) return;
    const requestId = ++this.originRequestId;
    this.aiOriginState = 'requesting';
    this.originElapsed = 0;
    this.originAttempt = 0;
    void this.hydrateOrigin(this.runSerial, this.requestedOriginKind, requestId);
  }

  private originLongWaitReady(): boolean {
    return this.aiOriginState === 'requesting' && this.originElapsed >= ORIGIN_LONG_WAIT_SECONDS;
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

  private playVoiceOnce(id: VoiceCueId, showVoiceCaption = true): void {
    if (this.voiceCuesSeen.has(id)) return;
    this.voiceCuesSeen.add(id);
    const cue = VOICE_CUES[id];
    const treatment = this.voiceTreatmentFor(id);
    this.feedback.playVoice(id, treatment);
    const textLength = cue.text
      .replace(/<#[\d.]+#>/g, '')
      .replace(/\([a-z-]+\)/g, '')
      .replace(/\s+/g, '').length;
    const duration = this.clamp(2.6 + textLength / 7, 3.2, 7.6);
    if (showVoiceCaption) this.voiceCaption = { id, time: duration, duration, treatment };
    else this.voiceCaption = undefined;
  }

  private voiceTreatmentFor(id: VoiceCueId): VoiceTreatment {
    const treatment = VOICE_CUES[id].treatment;
    if (treatment !== 'memory') return treatment;
    const responseBalance = this.stats.exhaled - this.stats.swallowed;
    if (responseBalance >= 2) return 'exhaled';
    if (responseBalance <= -2) return 'swallowed';
    return treatment;
  }

  private scheduleVoice(id: VoiceCueId, delaySeconds: number): void {
    if (this.voiceCuesSeen.has(id) || this.scheduledVoices.some((entry) => entry.id === id)) return;
    this.scheduledVoices.push({ id, playAt: this.visualTime + delaySeconds });
  }

  private flushScheduledVoices(): void {
    if (!this.scheduledVoices.length) return;
    const ready = this.scheduledVoices.filter((entry) => entry.playAt <= this.visualTime);
    this.scheduledVoices = this.scheduledVoices.filter((entry) => entry.playAt > this.visualTime);
    for (const entry of ready) this.playVoiceOnce(entry.id);
  }

  private updateVoiceTriggers(): void {
    const time = this.battleTime;
    const hpRatio = this.hero.hp / Math.max(1, this.hero.maxHp);
    const alive = this.enemies.filter((enemy) => !enemy.dead).length;
    const nearestEnemyDistance = this.enemies.reduce((nearest, enemy) => {
      if (enemy.dead) return nearest;
      return Math.min(nearest, Math.hypot(enemy.x - this.heroX, enemy.y - this.heroY));
    }, Infinity);
    if (this.encounterIndex === 0) {
      // 童年还没上学：校门口与同学的两条已按正典移到少年章。
      if (time >= 18) this.playVoiceOnce('caregiver-lights-out');
      if (time >= 22 && this.standStillTime >= 3 && nearestEnemyDistance > 140) this.playVoiceOnce('child-under-bed');
    } else if (this.encounterIndex === 1) {
      if (alive >= 6) this.playVoiceOnce('teacher-last-row');
      if (hpRatio <= 0.7) this.playVoiceOnce('classmate-score-whisper');
      // 放学那场戏排在统一答案之后。上一条仍占字幕主位时，下一条继续等。
      if (this.schoolEliteDefeatedAt > 0 && !this.voiceCaption) {
        if (!this.voiceCuesSeen.has('classmate-family-late') && time >= this.schoolEliteDefeatedAt + 3) {
          this.playVoiceOnce('classmate-family-late');
        } else if (time >= this.schoolEliteDefeatedAt + 9) {
          this.playVoiceOnce('school-gate-closing');
        }
      }
    } else if (this.encounterIndex === 2) {
      if (time >= 4) this.playVoiceOnce('recruiter-arrival-time');
    } else if (this.encounterIndex === 3) {
      if (time >= 18) this.playVoiceOnce('family-dinner-cold');
      if (time >= 26) this.playVoiceOnce('hospital-family-needed');
    } else if (this.encounterIndex === 4) {
      if (time >= 14) this.playVoiceOnce('manager-tonight-hard');
      if (hpRatio <= 0.5) this.playVoiceOnce('clinic-blood-pressure');
    } else if (this.encounterIndex === 5) {
      if (time >= 5) this.playVoiceOnce('clinic-next-number');
      if (this.standStillTime >= 5 && nearestEnemyDistance > 140) this.playVoiceOnce('neighbor-corridor-light');
      if (hpRatio <= 0.35) this.playVoiceOnce('hospital-family-late');
    }
  }

  private startStage(resume = false): void {
    const stage = STAGES[this.encounterIndex];
    if (!stage) {
      this.endRun(true);
      return;
    }
    this.resetMovementInput();
    this.resetFateInput();
    this.state = 'battle';
    this.stageDisabledItems.clear();
    this.boxSavedItem = undefined;
    this.hero.block = this.fateBuild.openingBlock;
    this.bowlWarmthBlock = 0;
    this.projectiles = [];
    this.bursts = [];
    this.enemies = [];
    this.enemyDeaths = [];
    this.lanternHandoff = undefined;
    this.battleTime = 0;
    this.spawnTimer = 0.8;
    this.spawnPause = 0;
    this.stageEliteSpawned = false;
    this.eliteSpawned = false;
    this.schoolEliteDefeatedAt = 0;
    this.eliteAlertName = '';
    this.eliteAlertTime = 0;
    this.eliteAlertKind = 'elite';
    this.stageWaitingForElite = false;
    this.transitionTimer = 0;
    this.worldStall = undefined;
    this.stallCooldown = 0;
    this.worldReward = undefined;
    this.doorTriedThisStage = false;
    this.worldDoor = undefined;
    this.shotTimer = 0.35;
    this.typingIndicatorTimer = 0;
    this.typingIndicatorBurstFlash = 0;
    this.typingIndicatorBurstCount = 0;
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
    this.darkActive = false;
    this.darkR = 9999;
    this.darknessStartedAt = 0;
    this.lampSpawned = false;
    this.lampChoice = undefined;
    this.lampItemsToReturnTotal = 0;
    this.lampFinalStripTimer = 0;
    this.lampReleaseReady = false;
    this.lampReleaseTimer = 0;
    this.praiseConsult = undefined;
    this.praisePaperZones = [];
    this.praisePaperDropTimer = 0;
    this.praiseOneSeatUsed = false;
    this.phoneRinging = false;
    this.phoneRingWindow = 0;
    this.phoneAnswer = 0;
    this.phoneMissed = 0;
    this.phoneCalls = [];
    this.phoneAnswerTarget = -1;
    this.phoneRelief = 0;
    this.phoneStoryIndex = 0;
    this.phoneActiveStoryIndex = -1;
    this.phonePostAnswerTimer = 0;
    this.phoneTranscript = undefined;
    this.lastPhoneCaller = undefined;
    this.finalFateTriggered = false;
    this.fateDelayReady = this.fateBuild.delayFirstHit;
    if (this.fateBuild.storedVolleys > 0) {
      this.holdTimer = 0.7;
      this.heldVolleys = this.fateBuild.storedVolleys;
      this.fateBuild.storedVolleys = 0;
    }
    this.standStillTime = 0;
    this.memoryRecall = undefined;
    this.memoryRecallHandledThisStand = false;
    this.heldPeeCharge = 0;
    this.flashCooldown = 0;
    this.takeoutWarmTimer = 0;
    this.nauseaTimer = 0;
    this.goodnightPulseTimer = 0;
    this.whiteBottlePulseTimer = 0;
    this.autoRenewGlowTimer = 0;
    this.momoPulseTimer = 0;
    this.momoRangeState = 'neutral';
    this.snowUsed = false;
    this.snowFlickerTimer = 0;
    this.snowFlickerCooldown = this.hasItem('snow-screen') ? 7 + this.random() * 9 : 8;
    this.coinDrops = [];
    this.dangerBands = [];
    this.heroTrail = [];
    this.heroTrailTimer = 0;
    this.hairUsedStage = false;
    this.divorceUsedStage = false;
    this.divorceDeferredDamage = 0;
    this.gymMomentum = this.hasItem('gym-card') && this.hasItem('class-break') ? 4 : 0;
    this.gymShownLayer = Math.floor(this.gymMomentum);
    this.powerbankCharge = 0;
    this.powerbankBurstTimer = 0;
    this.powerbankRentalSeconds = 0;
    this.powerbankLocked = false;
    this.answeredUsedStage = false;
    this.oneMorePrompt = false;
    this.oneMoreFocus = 0;
    this.oneMoreOpeningTimer = !resume && this.hasItem('one-more-game')
      ? Math.max(0, this.oneMoreStacks * 0.5 - (this.hasItem('class-break') ? 0.75 : 0))
      : 0;
    this.xiaoZhangPrompt = false;
    this.xiaoZhangFocus = 0;
    this.xiaoZhangWorld = undefined;
    this.xiaoZhangAlly = undefined;
    this.xiaoZhangSpawned = false;
    if (this.encounterIndex === 2) {
      if (this.helpedXiaoZhang && !this.xiaoZhangBetrayed) {
        this.xiaoZhangSpawned = true;
        this.xiaoZhangAlly = {
          x: this.heroX - 34,
          y: this.heroY + 18,
          fireCooldown: 0.45,
          faceLeft: false,
        };
      } else if (this.xiaoZhangDecision === 'declined') {
        this.xiaoZhangSpawned = true;
        this.xiaoZhangWorld = { x: this.heroX + 154, y: this.heroY - 46 };
      }
    }
    this.noHitTime = 0;
    this.lastRhythmMark = 0;
    this.rhythmBrokenWindow = -1;
    this.lastStandoffMark = 0;
    this.eyeTimer = 0;
    this.eyeClosedTimer = 0;
    this.enemyHasteTimer = 0;
    this.tauntTimer = 8;
    this.takeoutTick = 2;
    this.billTimer = 0;
    this.voiceEnemyKills = {};
    this.feedback.setAmbience(this.encounterIndex);
    this.feedback.preloadVoices(STAGE_VOICE_PRELOADS[this.encounterIndex] ?? []);
    this.borrowedStat = undefined;
    this.syncBinderCardsFromInventory();
    // 一次性入场经济：扣费、进场掉血、翻卡加成只在首次进入本阶段结算。
    // 断点恢复时存档已是"结算之后"的血量/零钱，重跑会二次扣血扣钱，故 resume 跳过。
    if (!resume) {
      if (this.hasItem('card-binder')) {
        const borrowables: DistortionStat[] = ['伤害', '射速', '射程'];
        this.borrowedStat = borrowables[Math.floor(this.random() * borrowables.length)];
        this.say(`翻出一张旧卡 · ${this.borrowedStat}+12%`);
      }
      let stageFees = 0;
      if (this.hasItem('gym-card')) stageFees += 1;
      if (this.hasItem('auto-renew')) stageFees += 1;
      if (stageFees > 0) {
        const paid = Math.min(stageFees, this.hero.coins);
        this.hero.coins -= paid;
        if (paid > 0) this.feedback.play('coin', 0.62);
        this.say(paid === stageFees ? `自动扣费 · -${paid}零钱` : `自动扣费 · -${paid}/${stageFees}零钱`);
      }
      if (this.hasItem('auto-renew')) {
        this.autoRenewGlowTimer = 1.6;
        this.burst('word', this.heroX, this.heroY - 50, 40, '#d3bd72', '已为您自动续费');
      }
      if (this.hasItem('drank-for-boss')) {
        this.stunTimer = 1.2;
        this.burst('word', this.heroX, this.heroY - 44, 28, '#b97a55', '脚下发飘');
      }
      if (this.hasItem('year-report')) this.loseHealth(2);
    }
    this.raincoatReady = this.hasItem('fathers-raincoat');
    this.toothReady = this.hasItem('baby-tooth');
    this.saveEffect = null;
    this.volleyCount = 0;
    this.rollOdDistortion();
    if (!resume && this.hasItem('white-bottle')) {
      this.loseHealth(2);
      this.flash = 0;
      this.whiteBottlePulseTimer = 0.55;
      this.burst('word', this.heroX, this.heroY - 62, 32, '#dce6e2', '吞药 · -2');
    }
    if (!resume && (stage.end === 'fate' || stage.end === 'final')) this.prepareFate();
    this.caption = stage.enterLine;
    this.captionTime = 5.5;
    if (this.oneMoreOpeningTimer > 0) {
      this.burst('word', this.heroX, this.heroY - 48, 30, '#78889a', `熬夜 ${this.oneMoreStacks}层`);
    }
    this.say(stage.chapter);
    if (!resume) {
      const entranceCues: Partial<Record<number, VoiceCueId>> = {
        0: 'narrator-start-breath', 1: 'school-bell-start', 3: 'hero-became-him',
      };
      const entrance = entranceCues[this.encounterIndex];
      if (entrance) this.playVoiceOnce(entrance);
    }
  }

  private beginStageTransition(): void {
    if (this.transitionTimer > 0 || this.oneMorePrompt) return;
    // 先确认 Boss/精英确实结束，再做任何阶段账单；此前这段顺序会让
    // 超时仍存活的 Boss 每帧重复触发网贷扣款。
    if (this.livingStageElite()) return;
    this.settleLoanContract();
    if (this.divorceDeferredDamage > 0) {
      const deferred = Math.ceil(this.divorceDeferredDamage);
      this.divorceDeferredDamage = 0;
      if (this.hasItem('painless-night')) {
        this.painlessDamage += deferred;
        this.painlessTimer = Math.max(this.painlessTimer, 8);
        this.say(`离婚协议 · ${deferred}点继续拖欠`);
      } else {
        this.applyHeroDamage(deferred, '离婚协议的补扣');
        this.say(`离婚协议 · 阶段末补扣 ${deferred}`);
      }
    }
    if (this.hasItem('one-more-game') && this.encounterIndex < STAGES.length - 1) {
      this.resetMovementInput();
      this.oneMorePrompt = true;
      this.oneMoreFocus = 0;
      this.feedback.play('page', 0.85);
      return;
    }
    this.startStageTransition();
  }

  private settleLoanContract(): void {
    if (!this.hasItem('loan-contract')) return;
    const paid = Math.min(2, this.hero.coins);
    this.hero.coins -= paid;
    if (paid > 0) this.feedback.play('coin', 0.72);
    if (paid < 2) {
      this.loseHealth(4);
      this.burst('word', this.heroX, this.heroY - 52, 42, '#b45e62', `还款 -${paid}零钱 -4生命`);
      this.say('网贷扣款日 · 拿身体补债');
    } else {
      this.burst('word', this.heroX, this.heroY - 52, 34, '#b29068', '还款 -2零钱');
      this.say('网贷扣款日 · 已划扣');
    }
  }

  private startStageTransition(): void {
    this.transitionTimer = STAGE_TRANSITION_DURATION;
    this.feedback.play('page', 1.1);
    const transitionCues: Partial<Record<number, VoiceCueId>> = {
      1: 'school-bell-end',
      2: 'interview-thank-you',
      4: 'security-return-card',
    };
    const transitionVoice = transitionCues[this.encounterIndex];
    if (transitionVoice) this.playVoiceOnce(transitionVoice);
    this.clearFinishedStage();
  }

  private clearFinishedStage(): void {
    this.projectiles = [];
    this.stageDisabledItems.clear();
    this.boxSavedItem = undefined;
    this.xiaoZhangPrompt = false;
    this.xiaoZhangWorld = undefined;
    this.xiaoZhangAlly = undefined;
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

  private resolveOneMoreGame(continuePlaying: boolean): void {
    if (!this.oneMorePrompt) return;
    this.oneMorePrompt = false;
    if (continuePlaying) {
      this.oneMoreStacks = Math.min(5, this.oneMoreStacks + 1);
      this.clearFinishedStage();
      this.feedback.play('page', 1.16);
      this.stageEndReward(true);
      return;
    }
    this.oneMoreStacks = 0;
    this.oneMoreOpeningTimer = 0;
    this.startStageTransition();
  }

  private stageEndReward(skipRest = false): void {
    const stage = STAGES[this.encounterIndex];
    if (!stage || stage.end === 'final') return;
    if (!skipRest) this.healHero(6);
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
      this.heroInputMoving = false;
      this.summerSlideTimer = 0;
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
    const hadInput = this.heroInputMoving;
    this.heroInputMoving = length > 0;
    const summerRun = this.hasItem('summer-run');
    if (this.heroInputMoving) {
      this.summerSlideDX = dx / length;
      this.summerSlideDY = dy / length;
      this.summerSlideTimer = 0;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.heroFacing = dx < 0 ? 'left' : 'right';
      } else {
        this.heroFacing = dy < 0 ? 'back' : 'front';
      }
      const speed = this.computeMoveSpeed();
      this.heroX += this.summerSlideDX * speed * dt;
      this.heroY += this.summerSlideDY * speed * dt;
    } else {
      if (summerRun && hadInput) this.summerSlideTimer = SUMMER_SLIDE_DURATION;
      if (!summerRun) this.summerSlideTimer = 0;
      if (this.summerSlideTimer > 0) {
        const ease = this.summerSlideTimer / SUMMER_SLIDE_DURATION;
        this.heroX += this.summerSlideDX * SUMMER_SLIDE_SPEED * ease * dt;
        this.heroY += this.summerSlideDY * SUMMER_SLIDE_SPEED * ease * dt;
        this.summerSlideTimer = Math.max(0, this.summerSlideTimer - dt);
      }
    }
    this.heroMoving = this.heroInputMoving || this.summerSlideTimer > 0;
    if (!this.heroMoving) return;
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
    if (this.hasItem('gym-card')) speed *= 1 + this.gymMomentum * 0.02;
    if (this.hasItem('summer-run')) speed *= 1.12;
    if (this.hasItem('sock-cigs') && this.sockBoostTimer > 0) speed *= 1.25;
    if (this.heroSlowTimer > 0) speed *= 0.75;
    if (this.hasItem('class-break')) {
      if (this.battleTime < 10) speed *= 1.35;
      else if (this.battleTime < 13) speed *= 0.85;
    }
    speed *= 1 - Math.min(0.2, this.items.length * 0.012);
    speed *= this.fateBuild.moveSpeedMul;
    speed *= 1 + this.praiseMove;
    if (this.rainActive && this.heroInRain) speed *= 0.85; // 站在雨里，脚步发沉
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
    if (this.hasItem('name-sold') && !this.hasItem('revoked-badge')) {
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
    this.updateVoiceTriggers();
    const isFinal = stage.end === 'final';
    if (this.spawnPause > 0) this.spawnPause = Math.max(0, this.spawnPause - dt);

    if (this.encounterIndex === 2 && !this.xiaoZhangSpawned && this.battleTime >= 9.5) {
      const angle = this.random() * Math.PI * 2;
      let spawnX = this.clamp(this.heroX + Math.cos(angle) * 168, 36, W - 36);
      let spawnY = this.clamp(this.heroY + Math.sin(angle) * 168, 118, H - 82);
      // 靠场边时径向落点会被裁到玩家脚下，甚至落到不可达区域；改投到对角安全区。
      if (Math.hypot(spawnX - this.heroX, spawnY - this.heroY) < 96) {
        spawnX = this.heroX < W / 2 ? W - 44 : 44;
        spawnY = this.heroY < (118 + H - 82) / 2 ? H - 90 : 126;
      }
      this.xiaoZhangSpawned = true;
      this.xiaoZhangWorld = { x: spawnX, y: spawnY };
      this.say('一起入职的小张还站在工位边');
    }
    if (this.xiaoZhangWorld && this.xiaoZhangDecision === 'none'
      && Math.hypot(this.heroX - this.xiaoZhangWorld.x, this.heroY - this.xiaoZhangWorld.y) < 34) {
      this.resetMovementInput();
      this.xiaoZhangPrompt = true;
      this.xiaoZhangFocus = this.hero.coins >= 10 ? 0 : 1;
      this.feedback.play('page', 0.82);
      return;
    }

    const alive = this.enemies.filter((enemy) => !enemy.dead).length;
    const maxAlive = this.encounterIndex === 0 ? 10 : this.encounterIndex === 1 ? 12 : MAX_ALIVE_ENEMIES;
    const majorThreatAlive = this.enemies.some((enemy) => !enemy.dead && (enemy.elite || (enemy.boss && enemy.type !== 'lamp-keeper')));
    const stillSpawning = (isFinal
      ? this.battleTime < DARKNESS_START + DARKNESS_SHRINK - 4
      : this.battleTime < stage.duration - 4) && !majorThreatAlive;
    if (stillSpawning && alive < maxAlive && this.spawnPause <= 0) {
      this.spawnTimer -= dt;
      const pressure = Math.max(0.62, 1 - (this.battleTime / stage.duration) * 0.4);
      while (this.spawnTimer <= 0) {
        this.spawnTimer += stage.spawnEvery * pressure * (this.darkActive ? 2.2 : 1);
        const type = stage.pool[Math.floor(this.random() * stage.pool.length)]!;
        this.spawnSeekingEnemy(type);
      }
    }

    if (!this.stageEliteSpawned && this.battleTime >= stage.eliteAt) {
      this.stageEliteSpawned = true;
      this.spawnPause = 2.4;
      const eliteLines: Partial<Record<EnemyType, string>> = {
        'coat-rack': '墙角那件外套，袖子先垂了下来。',
        'uniform-answer': '卷子发下来了。答案只有一个。',
        'last-bus': '车进站了。它不等人。',
        'wet-shoes': '玄关那双鞋还是潮的。它跟上来了。',
        'whose-box': '纸箱封好了，没人记得它原来放在谁的工位下。',
        'revolving-lantern': '灯转起来了。上面的马，跑的还是那几匹。',
      };
      const spawn = this.createSeekingEnemy(stage.eliteType, this.heroX, this.heroY - 190);
      // 统一答案和末班车沿用旧的大 Boss 敌人模板，但章节编排已将它们降为小 Boss。
      // 在生成边界改写身份，避免提前触发章节固定掉落与正式 Boss 结算。
      spawn.boss = false;
      spawn.elite = true;
      if (stage.eliteType === 'whose-box' && this.helpedXiaoZhang && this.xiaoZhangBetrayed) {
        spawn.name = '谁的纸箱 · 小张';
        spawn.xiaoZhangBox = true;
      }
      this.enemies.push(spawn);
      this.eliteAlertKind = 'elite';
      this.eliteAlertName = spawn.name;
      this.eliteAlertTime = 2.2;
      this.feedback.play('boss', 0.82);
      this.feedback.vibrate([14, 34, 18]);
      this.caption = spawn.xiaoZhangBox
        ? '纸箱侧面露出一角工牌。照片里是小张。'
        : (eliteLines[stage.eliteType] ?? '一件生活里的东西，自己走了出来。');
      this.captionTime = 4;
    }

    // 一关一 Boss：前置精英清掉后才出场；Boss 不死阶段不结算。
    const minorEliteAlive = this.enemies.some((enemy) => !enemy.dead && enemy.elite && !enemy.boss);
    if (!minorEliteAlive && !this.eliteSpawned && stage.bossAt !== undefined && stage.bossType && this.battleTime >= stage.bossAt) {
      this.eliteSpawned = true;
      this.spawnPause = 3;
      const bossLines: Partial<Record<EnemyType, string>> = {
        'closet-dark': '衣柜背后的黑，终于自己走了出来',
        'uniform-answer': '排名贴上墙，所有人的目光一起转了过来。',
        'last-bus': '录用短信晚了十分钟。末班车已经关门。',
        'silent-father': '雨声先到，父亲后到。他还站着。',
        'debt-collector': '门被敲响了。它有你的地址',
      };
      const bossSpawn = this.createSeekingEnemy(stage.bossType, this.heroX, this.heroY - 240);
      this.enemies.push(bossSpawn);
      if (stage.bossType === 'silent-father') this.rainActive = true; // 雨声先到
      this.eliteAlertKind = 'boss';
      this.eliteAlertName = bossSpawn.name;
      this.eliteAlertTime = 2.4;
      this.feedback.play('boss');
      this.feedback.vibrate([18, 42, 24]);
      this.screenShake = Math.max(this.screenShake, 0.3);
      this.burst('ring', bossSpawn.x, bossSpawn.y, 120, '#d0b264');
      this.burst('ring', bossSpawn.x, bossSpawn.y, 190, '#d0b264');
      this.caption = bossLines[stage.bossType] ?? stage.title;
      this.captionTime = 4.5;
      const bossVoiceCues: Partial<Record<EnemyType, VoiceCueId>> = {
        'closet-dark': 'caregiver-no-monster',
        'uniform-answer': 'teacher-answer-format',
        'last-bus': 'last-bus-arrival',
        'debt-collector': 'bank-payment-due',
      };
      const voiceCue = bossVoiceCues[stage.bossType];
      if (voiceCue) this.playVoiceOnce(voiceCue);
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
      // 入学通知书：不能再跳过奖励——物证台不再熄灭，必须选走一件
      if (!this.hasItem('admission-notice')) this.worldReward.ttl -= dt;
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
      if (!minorEliteAlive && !this.darkActive && this.battleTime >= DARKNESS_START) {
        this.darkActive = true;
        this.darknessStartedAt = this.battleTime;
        this.darkCX = this.heroX;
        this.darkCY = this.heroY;
        this.darkR = 330;
        this.say('四周的黑暗开始往里收');
      }
      if (this.darkActive && !this.lampSpawned) {
        const t = this.clamp((this.battleTime - this.darknessStartedAt) / DARKNESS_SHRINK, 0, 1);
        // 匀速收拢会让黑暗从第一秒起就全速逼近，而且半径越小、同样的速度占视野比例越大——
        // 该慢的地方反而最快。用 smoothstep 让两端都轻：刚开始几乎察觉不到，收到最后放缓。
        const closing = t * t * (3 - 2 * t);
        this.darkR = 330 - closing * (330 - 96);
        if (t >= 1) {
          this.lampSpawned = true;
          this.eliteAlertKind = 'boss';
          this.eliteAlertName = '收灯人';
          this.eliteAlertTime = 2.8;
          this.feedback.play('boss', 1.2);
          this.feedback.vibrate([22, 48, 30]);
          this.lanternHandoff = undefined;
          this.lampItemsToReturnTotal = this.items.length;
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
          // 父亲战严格遵守设计书的少台词规则；血条本身已经足够说明战斗未结束。
          if (elite.type !== 'silent-father') {
            this.caption = `${elite.name}还没有结束。`;
            this.captionTime = 4.2;
            this.say('这件事不能靠跑过去');
          }
        }
      } else this.beginStageTransition();
    }
  }

  private resolveXiaoZhangChoice(help: boolean): void {
    if (!this.xiaoZhangPrompt || this.xiaoZhangDecision !== 'none') return;
    if (help && this.hero.coins < 10) {
      this.xiaoZhangFocus = 1;
      this.say('零钱不够十块。小张还站在那里。');
      this.feedback.play('hurt', 0.45);
      return;
    }
    this.xiaoZhangPrompt = false;
    if (!help) {
      this.xiaoZhangDecision = 'declined';
      this.caption = '「没事，你先忙。」他留在原地，继续低头弄那一点没做完的。';
      this.captionTime = 4.4;
      this.memories.push('青年：没有替一起入职的小张垫那十块零钱');
      this.feedback.play('page', 0.7);
      return;
    }
    const start = this.xiaoZhangWorld ?? { x: this.heroX - 34, y: this.heroY + 18 };
    this.hero.coins -= 10;
    this.stats.coinsSpent += 10;
    this.helpedXiaoZhang = true;
    this.xiaoZhangDecision = 'helped';
    this.xiaoZhangWorld = undefined;
    this.xiaoZhangAlly = { x: start.x, y: start.y, fireCooldown: 0.2, faceLeft: false };
    this.memories.push('青年：花十块零钱帮了一起入职的小张');
    this.burst('word', start.x, start.y - 38, 28, '#c6b37b', '我来搭把手');
    this.caption = '小张把工牌按回胸口，跟了上来。';
    this.captionTime = 3.8;
    this.feedback.play('coin', 0.82);
  }

  private updateXiaoZhangAlly(dt: number): void {
    const ally = this.xiaoZhangAlly;
    if (!ally || this.encounterIndex !== 2 || this.xiaoZhangBetrayed) return;
    const offsets: Record<HeroFacing, { x: number; y: number }> = {
      front: { x: -34, y: -30 },
      back: { x: 34, y: 30 },
      left: { x: 34, y: 18 },
      right: { x: -34, y: 18 },
    };
    const offset = offsets[this.heroFacing];
    const followX = this.heroX + offset.x;
    const followY = this.heroY + offset.y;
    const dx = followX - ally.x;
    const dy = followY - ally.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 250) {
      ally.x = followX;
      ally.y = followY;
    } else if (distance > 4) {
      const step = Math.min(distance, 176 * dt);
      ally.x += (dx / distance) * step;
      ally.y += (dy / distance) * step;
    }
    ally.fireCooldown -= dt;
    const target = this.nearestEnemy(ally.x, ally.y);
    if (!target || Math.hypot(target.x - ally.x, target.y - ally.y) > 270 || ally.fireCooldown > 0) return;
    const angle = Math.atan2(target.y - ally.y, target.x - ally.x);
    ally.faceLeft = Math.cos(angle) < 0;
    ally.fireCooldown = 0.92;
    const visual = this.projectileVisualForForm('paper', 'paper', 1);
    visual.form = 'paper';
    visual.carrierForm = 'paper';
    visual.trail = 'streak';
    visual.coreColor = '#f0e5c9';
    visual.materialTint = '#d8c9a4';
    visual.edgeColor = '#6d6558';
    visual.trailColor = '#a99467';
    visual.impactColor = '#c6b37b';
    visual.materials = ['paper'];
    this.spawnProjectile({
      x: ally.x,
      y: ally.y - 18,
      angle,
      damage: 4.5,
      speed: 270,
      radius: 3.2,
      range: 270,
      life: 1.15,
      pierce: 0,
      returning: false,
      homing: 0.08,
      splitChance: 0,
      explosion: 0,
      generation: 0,
      color: '#d8c9a4',
      style: 'paper',
      critical: false,
      knockback: 3,
      visual,
      priority: 'secondary',
    });
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

  private updateTrailHazards(dt: number): void {
    this.heroTrailTimer -= dt;
    if (this.heroTrailTimer <= 0) {
      this.heroTrailTimer = 0.125;
      this.heroTrail.push({ x: this.heroX, y: this.heroY });
      if (this.heroTrail.length > 24) this.heroTrail.shift();
    }
    this.updateFatherWeather(dt);
    if (this.dangerBands.length) {
      this.dangerBands = updateDangerBands(this.dangerBands, dt);
      for (const band of this.dangerBands) {
        if (dangerBandHits(band, this.heroX, this.heroY)) {
          band.hit = true;
          this.hurtHero(band.damage, '统一答案');
        }
      }
    }
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
    if (this.auditBossArtActive) return;
    this.maybePersistCheckpoint();
    this.visualTime += dt;
    this.flushScheduledVoices();
    if (this.voiceCaption) {
      this.voiceCaption.time = Math.max(0, this.voiceCaption.time - dt);
      if (this.voiceCaption.time <= 0) this.voiceCaption = undefined;
    }
    if (this.memoryRecall) {
      this.memoryRecall.time = Math.max(0, this.memoryRecall.time - dt);
      if (this.memoryRecall.time <= 0) this.memoryRecall = undefined;
    }
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
        if (this.originStoryComplete()) this.playVoiceOnce('narrator-opening');
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
    if (this.state === 'storyDrop') {
      this.storyDropTimer += dt;
      return;
    }
    if (this.state === 'shop' && this.shopFeedback) {
      this.shopFeedback.timer = Math.max(0, this.shopFeedback.timer - dt);
      if (this.shopFeedback.timer <= 0) this.shopFeedback = undefined;
    }
    if (this.state !== 'battle') return;
    if (this.xiaoZhangPrompt || this.oneMorePrompt) return;
    if (this.lampFinalStripTimer > 0) {
      this.lampFinalStripTimer = Math.max(0, this.lampFinalStripTimer - dt);
      const keeper = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'lamp-keeper');
      if (keeper?.bossAnim === 'keeper-strip' && (keeper.bossAnimTimer ?? 0) > 0.001) {
        // 最后一件离身后的回忆动作仍播放，但世界、弹道与伤害全部冻结。
        keeper.bossAnimTimer = Math.max(0.001, (keeper.bossAnimTimer ?? 0) - dt);
      }
      if (this.lampFinalStripTimer <= 0 && keeper) this.beginLampRelease(keeper);
      return;
    }
    if (this.lampReleaseReady) {
      this.lampReleaseTimer = Math.max(0, this.lampReleaseTimer - dt);
      const keeper = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'lamp-keeper');
      if (keeper?.bossAnim === 'keeper-dim' && (keeper.bossAnimTimer ?? 0) > 0.001) {
        // 终局只冻结战斗，不冻结《吹灯》本身。走完四帧后保留末帧，等待玩家主动松手。
        keeper.bossAnimTimer = Math.max(0.001, (keeper.bossAnimTimer ?? 0) - dt);
      }
      return;
    }
    if (this.phonePostAnswerTimer > 0) this.phonePostAnswerTimer = Math.max(0, this.phonePostAnswerTimer - dt);
    if (this.phoneTranscript) {
      this.phoneTranscript.timer = Math.max(0, this.phoneTranscript.timer - dt);
      if (this.phoneTranscript.timer <= 0) this.phoneTranscript = undefined;
    }
    if (this.captionTime > 0) this.captionTime -= dt;
    if (this.comboReveal) {
      this.comboReveal.timer -= dt;
      if (this.comboReveal.timer <= 0) this.comboReveal = undefined;
      else if (this.comboReveal.total - this.comboReveal.timer < 0.4) return;
    }
    if (this.hasItem('snow-screen') && !this.snowUsed) {
      this.snowFlickerTimer = Math.max(0, this.snowFlickerTimer - dt);
      this.snowFlickerCooldown -= dt;
      if (this.snowFlickerCooldown <= 0) {
        this.snowFlickerTimer = 0.055;
        this.snowFlickerCooldown = 8 + this.random() * 10;
      }
    } else {
      this.snowFlickerTimer = 0;
    }
    if (!this.comboReveal && this.comboRevealQueue.length > 0) {
      const def = this.comboRevealQueue.shift()!;
      this.comboReveal = { name: def.name, artKey: def.artKey, line: def.line, timer: 2.25, total: 2.25 };
    }
    if (this.watchReleaseTimer > 0) this.watchReleaseTimer -= dt;
    if (this.usefulTimer > 0) this.usefulTimer -= dt;
    if (this.typingIndicatorBurstFlash > 0) {
      this.typingIndicatorBurstFlash = Math.max(0, this.typingIndicatorBurstFlash - dt);
    }
    // 延迟出膛：五连发的后四发、AI 的复读回声
    if (this.pendingShots.length > 0) {
      const due: PendingShot[] = [];
      this.pendingShots = this.pendingShots.filter((shot) => {
        shot.delay -= dt;
        if (shot.delay <= 0) { due.push(shot); return false; }
        return true;
      });
      for (const shot of due) {
        this.spawnPlannedShot(shot);
      }
    }
    this.updateTypingIndicator(dt);
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
            speed: roar.projectileSpeed * 0.8,
            radius: Math.max(3, roar.width * 0.9),
            range: 150, life: 1.2, ...roarMechanics, generation: 1, style: 'sound',
            critical: false, knockback: roar.knockback * 1.4, color: '#8fa8bd',
            visual: this.projectileVisualForForm('sound', 'signal', 1),
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
    if (this.hasItem('stone-schoolbag')) this.schoolbagBurdenTime = Math.min(180, this.schoolbagBurdenTime + dt);
    this.updatePraisePaperZones(dt);
    this.updateHeroMovement(dt);
    this.updateStageDirector(dt);
    if (this.state !== 'battle') return;
    if (this.xiaoZhangPrompt) return;
    this.updateXiaoZhangAlly(dt);
    // ―― 道具每帧结算：静止/躺平、账单、闭眼、外卖回血、慢性损耗、嘲讽 ――
    const wasLying = this.standStillTime >= 2;
    this.standStillTime = this.heroMoving ? 0 : Math.min(8, this.standStillTime + dt);
    if (this.heroMoving) {
      this.lastSighMark = 0;
      this.memoryRecallHandledThisStand = false;
    } else if (this.standStillTime >= 6) {
      if (this.lastSighMark === 0) {
        this.lastSighMark = 1;
        this.sigh(1.7);
      }
      // 敌人太近或重要字幕正在播放时先等；条件安全后仍可在这次停步中想起一次。
      if (!this.memoryRecallHandledThisStand && this.recallOneMemory()) {
        this.memoryRecallHandledThisStand = true;
      }
    }
    this.heldPeeCharge = this.hasProjectileTrigger('held-pee')
      ? (this.heroMoving ? 0 : Math.min(8, this.heldPeeCharge + dt))
      : 0;
    if (wasLying && this.heroMoving && this.hasItem('unwashed-pillow')) {
      this.pillowPenalty = 1;
      this.burst('word', this.heroX, this.heroY - 62, 24, '#8e8690', '起身发沉');
      this.feedback.play('breath', 0.55);
    }
    if (!wasLying && this.standStillTime >= 2 && this.hasItem('unwashed-pillow')) {
      this.burst('word', this.heroX, this.heroY - 62, 24, '#9b9271', '躺平');
    }
    if (this.pillowPenalty > 0) this.pillowPenalty = Math.max(0, this.pillowPenalty - dt);
    if (this.hasItem('momo-avatar')) {
      const nearest = this.nearestEnemy(this.heroX, this.heroY);
      const distance = nearest ? Math.hypot(nearest.x - this.heroX, nearest.y - this.heroY) : Infinity;
      const nextState = distance < 80 ? 'threatened' : distance > 150 ? 'safe' : 'neutral';
      if (nextState !== this.momoRangeState) {
        if (nextState === 'threatened') {
          this.momoPulseTimer = 0.55;
          this.burst('word', this.heroX, this.heroY - 62, 24, '#cf789f', '怂了');
        } else if (nextState === 'safe' && this.momoRangeState === 'threatened') {
          this.momoPulseTimer = 0.4;
          this.burst('word', this.heroX, this.heroY - 62, 24, '#e1a3c1', '又匿名了');
        }
        this.momoRangeState = nextState;
      }
    } else this.momoRangeState = 'neutral';
    if (this.hasItem('gym-card')) {
      const beforeLayer = Math.floor(this.gymMomentum);
      const warmupRate = this.hasItem('summer-run') ? 1.4 : 1;
      if (this.hasItem('class-break') && this.battleTime < 10) this.gymMomentum = 4;
      else if (this.heroMoving) this.gymMomentum = Math.min(4, this.gymMomentum + dt * warmupRate);
      else this.gymMomentum = Math.max(0, this.gymMomentum - dt * 2.5);
      const layer = Math.floor(this.gymMomentum);
      if (layer > beforeLayer && layer > this.gymShownLayer) {
        this.gymShownLayer = layer;
        this.burst('word', this.heroX, this.heroY - 46, 22, '#83a99e', `到店 ${layer}`);
      }
      if (layer < this.gymShownLayer) this.gymShownLayer = layer;
    } else {
      this.gymMomentum = 0;
      this.gymShownLayer = 0;
    }
    if (this.hasItem('shared-powerbank')) {
      this.powerbankBurstTimer = Math.max(0, this.powerbankBurstTimer - dt);
      const attackGap = !this.hasLivingEnemies() || this.breathlessTimer > 0
        || this.holdTimer > 0 || this.oneMoreOpeningTimer > 0;
      if (attackGap && !this.powerbankLocked && this.powerbankCharge < 6) {
        const rented = Math.min(dt, 6 - this.powerbankCharge);
        this.powerbankCharge += rented;
        this.powerbankRentalSeconds += rented;
        if (this.powerbankRentalSeconds >= 8) {
          this.powerbankRentalSeconds -= 8;
          if (this.hero.coins > 0) {
            this.hero.coins -= 1;
            this.burst('word', this.heroX, this.heroY - 44, 24, '#77a9b2', '租电 -1');
          } else {
            this.powerbankLocked = true;
            this.powerbankCharge = 0;
            this.say('共享充电宝 · 余额不足');
          }
        }
      } else if (!attackGap && this.powerbankCharge >= 0.6 && this.powerbankBurstTimer <= 0) {
        this.powerbankBurstTimer = Math.min(3, 0.45 + this.powerbankCharge * 0.42);
        this.powerbankCharge = 0;
        this.burst('word', this.heroX, this.heroY - 48, 28, '#79b8c2', '租来的电');
      }
    } else {
      this.powerbankCharge = 0;
      this.powerbankBurstTimer = 0;
      this.powerbankRentalSeconds = 0;
      this.powerbankLocked = false;
    }
    if (this.flashCooldown > 0) this.flashCooldown -= dt;
    if (this.takeoutWarmTimer > 0) this.takeoutWarmTimer = Math.max(0, this.takeoutWarmTimer - dt);
    if (this.nauseaTimer > 0) this.nauseaTimer = Math.max(0, this.nauseaTimer - dt);
    if (this.goodnightPulseTimer > 0) this.goodnightPulseTimer = Math.max(0, this.goodnightPulseTimer - dt);
    if (this.whiteBottlePulseTimer > 0) this.whiteBottlePulseTimer = Math.max(0, this.whiteBottlePulseTimer - dt);
    if (this.autoRenewGlowTimer > 0) this.autoRenewGlowTimer = Math.max(0, this.autoRenewGlowTimer - dt);
    if (this.checkupPulseTimer > 0) this.checkupPulseTimer = Math.max(0, this.checkupPulseTimer - dt);
    if (this.momoPulseTimer > 0) this.momoPulseTimer = Math.max(0, this.momoPulseTimer - dt);
    if (this.stunTimer > 0) this.stunTimer -= dt;
    if (this.graceTimer > 0) { this.graceTimer -= dt; this.hurtCooldown = Math.max(this.hurtCooldown, 0.1); }
    if (this.oneMoreOpeningTimer > 0) this.oneMoreOpeningTimer = Math.max(0, this.oneMoreOpeningTimer - dt);
    if (this.eyeClosedTimer > 0) {
      this.eyeClosedTimer = Math.max(0, this.eyeClosedTimer - dt);
      if (this.eyeClosedTimer === 0) {
        this.enemyHasteTimer = 1.5;
        this.burst('word', this.heroX, this.heroY - 50, 30, '#c8797f', '睁眼');
      }
    }
    else if (this.enemyHasteTimer > 0) this.enemyHasteTimer = Math.max(0, this.enemyHasteTimer - dt);
    if (this.heroSlowTimer > 0) this.heroSlowTimer -= dt;
    if (this.sockBoostTimer > 0) this.sockBoostTimer = Math.max(0, this.sockBoostTimer - dt);
    this.noHitTime += dt;
    if (this.billTimer > 0) {
      this.billTimer -= dt;
      if (this.billTimer <= 0) {
        if (this.hero.coins >= 2) {
          this.hero.coins -= 2;
          this.say('账单已划扣 · -2零钱');
        } else {
          this.hurtCooldown = 0;
          this.hurtHero(8, '下个月账单');
          this.say('没钱 · 拿身体抵');
        }
      }
    }
    if (this.hasItem('third-pill')) {
      this.pillTimer += dt;
      const phase = this.pillTimer % 20;
      const nextPhase = phase < 8 ? 'rage' : phase < 11 ? 'crash' : 'neutral';
      if (nextPhase !== this.pillPhaseState) {
        this.pillPhaseState = nextPhase;
        this.pillPulseTimer = 0.65;
        this.screenShake = Math.max(this.screenShake, nextPhase === 'neutral' ? 0.08 : 0.16);
        const phaseText = nextPhase === 'rage' ? '狂暴' : nextPhase === 'crash' ? '崩落' : '药效退去';
        const phaseColor = nextPhase === 'rage' ? '#c66c83' : nextPhase === 'crash' ? '#7197a1' : '#8a828d';
        this.burst('word', this.heroX, this.heroY - 68, 32, phaseColor, phaseText);
      }
    } else {
      this.pillPhaseState = 'neutral';
      this.pillPulseTimer = 0;
    }
    if (this.pillPulseTimer > 0) this.pillPulseTimer = Math.max(0, this.pillPulseTimer - dt);
    if (this.hasItem('eye-exercise')) {
      this.eyeTimer += dt;
      if (this.eyeTimer >= 12) {
        this.eyeTimer = 0;
        this.eyeClosedTimer = 0.5;
        this.hurtCooldown = Math.max(this.hurtCooldown, 0.5);
        this.burst('word', this.heroX, this.heroY - 50, 40, '#9db8c8', '闭眼');
      }
    }
    if (this.hasItem('takeout-3am') && this.hero.hp < this.hero.maxHp * 0.4) {
      this.takeoutTick -= dt;
      if (this.takeoutTick <= 0) {
        this.takeoutTick = 2;
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 1);
        this.takeoutWarmTimer = 0.42;
        this.burst('ring', this.heroX, this.heroY - 12, 22, '#c9a66b');
      }
    }
    if (this.hasItem('hair-in-takeout') && !this.hairUsedStage && this.hero.hp < this.hero.maxHp * 0.3) {
      this.hairUsedStage = true;
      const beforeHp = this.hero.hp;
      this.healHero(8);
      this.nauseaTimer = 0.72;
      this.burst('word', this.heroX, this.heroY - 46, 30, '#a8b277', `干呕 · +${Math.ceil(this.hero.hp - beforeHp)}`);
    }
    if (this.hasItem('goodnight-2h')) {
      this.goodnightTick -= dt;
      if (this.goodnightTick <= 0) {
        this.goodnightTick = 30;
        this.changeMaxHp(-1);
        this.goodnightPulseTimer = 0.65;
        this.burst('word', this.heroX, this.heroY - 48, 28, '#8199b2', '最大生命 -1');
      }
    }
    if (this.hasItem('sock-cigs')) {
      this.sockTick -= dt;
      if (this.sockTick <= 0) {
        this.sockTick = 45;
        this.changeMaxHp(-1);
        this.burst('word', this.heroX, this.heroY - 48, 28, '#8c8072', '烟债 · 最大生命 -1');
      }
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
          taunted.tauntVulnerableTimer = 2.5;
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
      this.painlessTimer = Math.max(0, this.painlessTimer - dt);
      if (this.painlessTimer <= 0 && this.painlessDamage > 0) {
        const payment = Math.ceil(this.painlessDamage);
        this.painlessDamage = 0;
        this.burst('word', this.heroX, this.heroY - 78, 36, '#b5adbd', '痛觉回来');
        this.applyHeroDamage(payment, '不疼的那个晚上');
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

    // iPhone 17 Pro Max：每 15 秒弹一次消息，攻击中断 0.4 秒——领导发消息的方式跟着你走了
    if (this.hasItem('iphone-17-pro-max')) {
      this.phoneMsgTimer -= dt;
      if (this.phoneMsgTimer <= 0) {
        this.phoneMsgTimer = IPHONE_MESSAGE_INTERVAL;
        this.phoneMsgInterrupt = IPHONE_MESSAGE_INTERRUPT;
        this.burst('word', this.heroX, this.heroY - 58, 30, '#9fb4c8', '新消息 · 手停了一下');
        this.feedback.play('page', 0.5);
        this.feedback.vibrate(10);
      }
    }
    if (this.phoneMsgInterrupt > 0) this.phoneMsgInterrupt -= dt;

    if (this.holdTimer > 0) {
      const before = this.holdTimer;
      this.holdTimer -= dt;
      if (before > 0 && this.holdTimer <= 0) {
        const volleys = this.heldVolleys;
        this.heldVolleys = 0;
        for (let index = 0; index < volleys; index += 1) {
          if (this.hasItem('typing-indicator')) this.fireTypingIndicatorSpread();
          else this.fireBaseVolley(index * 0.05 - 0.08);
        }
        this.say(`忍住之后 · ${volleys}轮齐发`);
      }
    } else if (this.breathlessTimer <= 0 && this.oneMoreOpeningTimer <= 0 && this.phoneMsgInterrupt <= 0) {
      if (!this.hasItem('typing-indicator')) {
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
    }

    this.updateEnemies(dt);
    this.updateCoinDrops(dt);
    this.updateTrailHazards(dt);
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
    // 《你很优秀》的好话加成：他夸你，你是真的变强了
    vector.damage *= 1 + this.praiseDamage;
    vector.fireInterval /= 1 + this.praiseFire;
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
    if (this.hasProjectileTrigger('wooden-sword')) {
      vector.damage *= 1.45;
      vector.width *= 1.3;
      vector.range *= 0.65;
    }
    if (this.hasItem('red-workbook')) {
      vector.damage *= 0.88;
      vector.returning = true;
    }
    if (this.hasProjectileTrigger('red-workbook')) vector.returning = true;
    if (this.hasProjectileTrigger('stone-schoolbag')) {
      const burden = Math.min(1, this.schoolbagBurdenTime / 90);
      vector.damage *= 1.4;
      vector.projectileSpeed *= 0.55;
      vector.pierce += 2;
      vector.lifetime *= 1.45;
      vector.width *= 1 + burden * 0.18;
      vector.knockback += burden * 10;
    }
    if (this.hasItem('bleach-powder')) {
      vector.fireInterval *= 0.78;
      vector.critChance += 0.08;
    }
    if (this.hasItem('eyebrow-razor')) {
      const scars = Math.min(6, this.razorScars);
      vector.damage *= 1.18;
      vector.critChance += 0.25 + scars * 0.015;
      vector.width *= 0.45 * Math.max(0.72, 1 - scars * 0.04);
    }
    if (this.hasItem('front-desk-letter')) {
      vector.damage *= 0.92;
      vector.homing += 0.15;
      vector.spread += 0.12;
    }
    if (this.hasProjectileTrigger('cracked-glasses')) {
      vector.range *= 1.55;
      vector.critChance += 0.14;
      vector.width *= 0.65;
    }
    if (this.hasItem('small-uniform')) {
      vector.fireInterval *= 0.78;
      vector.width *= 0.85;
    }
    if (this.hasItem('only-key')) vector.range *= 0.88;
    if (this.hasProjectileTrigger('only-key')) vector.explosion += 10;
    if (this.hasItem('first-salary')) vector.damage *= 1 + Math.floor(this.hero.coins / 5) * 0.06;
    if (this.hasItem('nameless-tie')) {
      vector.damage *= 1.18;
      vector.critChance += 0.18;
    }
    if (this.hasItem('fathers-raincoat')) vector.fireInterval *= 1.18;
    if (this.hasItem('unsent-phone')) vector.fireInterval *= 1 + this.phoneCharges * 0.03;
    if (this.hasItem('baby-tooth')) vector.damage *= 0.9;
    if (this.hasItem('revoked-badge')) vector.damage *= 1 + this.items.length * 0.05;
    // 「离职金买的。爽歪歪。」新机就是快，一点不掺假
    if (this.hasItem('iphone-17-pro-max')) { vector.damage *= 1.3; vector.fireInterval /= 1.1; }
    // 病历本：你透支得越多，你越强
    if (this.hasItem('fathers-chart')) vector.damage *= 1 + Math.floor(this.permanentHpLost / 10) * 0.08;
    if (this.hasItem('slow-watch')) vector.projectileSpeed *= 0.85;
    if (this.hasItem('missing-photo') && this.hero.hp < this.hero.maxHp * 0.5) vector.fireInterval *= 1.15;
    if (this.hasItem('white-bottle')) {
      vector.fireInterval *= 0.7;
      vector.damage *= 0.9;
    }
    if (this.hasItem('empty-frame')) vector.lifetime *= 0.75;
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
    if (this.hasProjectileTrigger('held-pee')) vector.damage *= 1 + Math.min(0.6, this.heldPeeCharge * 0.075);
    if (this.hasItem('class-break') && this.battleTime < 10) vector.fireInterval *= 0.8;
    if (this.hasItem('last-page')) {
      if (this.lastPageDeadlineActive()) vector.damage *= 2;
      else if (this.battleTime < 30) vector.damage *= 0.9;
    }
    // ―― 第三批道具的数值层（顺序：先乘算修正，最后 checkup-arrows 双向放大）――
    if (this.hasItem('always-crying')) vector.range *= 0.88;
    if (this.hasItem('shop-freezer')) vector.fireInterval *= 1.05;
    if (this.hasItem('retracted-voice')) vector.fireInterval *= 1 + this.voiceCharges * 0.02;
    if (this.hasItem('auto-renew') && this.battleTime < 15) vector.damage *= 1.1;
    if (this.hasItem('bargain-link')) vector.damage *= 1 + this.items.filter((owned) => getItem(owned).quality <= 2).length * 0.03;
    if (this.hasItem('group-dad')) vector.damage *= 0.9;
    if (this.hasItem('loan-contract')) vector.damage *= 1.25;
    if (this.hasItem('momo-avatar')) {
      const nearMomo = this.nearestEnemy(this.heroX, this.heroY);
      const momoDist = nearMomo ? Math.hypot(nearMomo.x - this.heroX, nearMomo.y - this.heroY) : 999;
      if (this.momoCriticalWindowActive()) vector.critChance += 0.25;
      else if (momoDist < 80) vector.damage *= 0.92;
    }
    if (this.hasItem('one-more-game')) {
      vector.damage *= 1 + this.oneMoreStacks * 0.1;
    }
    if (this.hasItem('shared-powerbank') && this.powerbankBurstTimer > 0) vector.fireInterval *= 0.65;
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
      if (!this.momoCriticalWindowActive()) vector.critChance = 0;
      vector.spread = 0;
    }
    vector.damage = this.clamp(vector.damage, 1, 90);
    vector.fireInterval = this.clamp(vector.fireInterval, 0.12, 2.2);
    vector.range = this.clamp(vector.range, 65, 430);
    vector.width = this.clamp(vector.width, 1.8, 32);
    vector.projectileSpeed = this.clamp(vector.projectileSpeed, 45, 600);
    vector.projectileCount = Math.round(this.clamp(vector.projectileCount, 1, 10));
    vector.spread = this.clamp(vector.spread, 0, 1.1);
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

  private lastPageDeadlineActive(): boolean {
    const duration = STAGES[this.encounterIndex]?.duration ?? 90;
    return this.state === 'battle' && this.battleTime >= duration - 10;
  }

  private computeProjectileVisual(
    extraMaterial?: ProjectileVisual['materials'][number],
    generation = 0,
  ): ProjectileVisual {
    const visual: ProjectileVisual = {
      form: 'breath', carrierForm: 'breath', trail: generation > 0 ? 'echo' : 'mist', echoed: generation > 0,
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
    if (this.hasItem('fathers-raincoat') && this.hasItem('front-desk-letter')) {
      if (!visual.materials.includes('water')) visual.materials.push('water');
      visual.wetness += 0.55;
      visual.materialTint = '#95b0ad';
      visual.trailColor = '#6f9da3';
    }
    if (this.hasProjectileTrigger('stone-schoolbag')) {
      if (!visual.materials.includes('stone')) visual.materials.push('stone');
      const burden = Math.min(1, this.schoolbagBurdenTime / 90);
      visual.weight += 1 + burden * 1.2;
      visual.materialTint = this.mixHex(visual.materialTint, '#665f58', 0.28);
      visual.length *= 0.9 - burden * 0.08;
    }
    if (this.hasProjectileTrigger('wooden-sword')) {
      if (!visual.materials.includes('wood')) visual.materials.push('wood');
      visual.coreColor = this.mixHex(visual.coreColor, '#c79454', 0.72);
      visual.materialTint = this.mixHex(visual.materialTint, '#9a6535', 0.78);
      visual.edgeColor = '#54351f';
      visual.trailColor = '#8b5b33';
      visual.impactColor = '#b47b40';
      visual.length += 0.55;
    }
    if (this.hasItem('bleach-powder')) {
      visual.coreColor = '#efe56f';
      visual.materialTint = this.mixHex(visual.materialTint, '#d7c84f', 0.42);
      visual.trailColor = '#c5b941';
    }
    if (this.hasItem('eyebrow-razor')) {
      const scars = Math.min(6, this.razorScars);
      visual.materials.push('metal');
      visual.sharpness += 1 + scars * 0.12;
      visual.softness *= 0.18;
      visual.length += 1.8 + scars * 0.12;
      visual.edgeColor = '#d7dfe0';
    }
    if (this.hasItem('od-pill')) {
      visual.distortion += 0.75;
      visual.coreColor = '#e89ac8';
      visual.trailColor = '#73c3c1';
    }
    if (this.hasProjectileTrigger('cracked-glasses')) {
      if (!visual.materials.includes('glass')) visual.materials.push('glass');
      visual.materialTint = this.mixHex(visual.materialTint, '#a6d5de', 0.52);
      visual.edgeColor = '#e4f2f2';
      visual.length += 0.5;
    }
    if (this.hasProjectileTrigger('only-key')) {
      if (!visual.materials.includes('key')) visual.materials.push('key');
      visual.materialTint = this.mixHex(visual.materialTint, '#d1ab5f', 0.72);
      visual.edgeColor = '#725f3b';
    }
    if (this.hasProjectileTrigger('held-pee') && this.heldPeeCharge > 0) {
      const pressure = this.heldPeeCharge / 8;
      visual.weight += pressure;
      visual.materialTint = this.mixHex(visual.materialTint, '#b39a4e', pressure * 0.42);
      visual.trailColor = '#8c783d';
    }
    if (this.hasItem('broken-spine')) {
      visual.materials.push('bone');
      visual.segments = Math.max(3, 2 + this.negativeItemCount());
      visual.length += 1.2;
      visual.softness *= 0.25;
      visual.materialTint = '#d8d0bb';
      visual.edgeColor = '#843842';
    }
    // ―― 第三批道具的弹道表现：现实影射到子弹的材质与颜色 ――
    if (this.hasProjectileTrigger('shop-freezer')) {
      if (!visual.materials.includes('ice')) visual.materials.push('ice');
      visual.materialTint = this.mixHex(visual.materialTint, '#bfe0e8', 0.65);
      visual.edgeColor = '#bfe0e8';
      visual.trailColor = '#8fb8c8';
    }
    if (this.hasProjectileTrigger('breath-on-glass')) {
      if (!visual.materials.includes('water')) visual.materials.push('water');
      visual.materialTint = this.mixHex(visual.materialTint, '#d7e3df', 0.38);
      visual.trailColor = '#a9c5c3';
    }
    if (this.hasProjectileTrigger('marble')) {
      if (!visual.materials.includes('glass')) visual.materials.push('glass');
      visual.coreColor = '#cfe4ea';
      visual.softness *= 0.6;
    }
    if (this.hasItem('old-door-lock')) visual.trailColor = '#a98f61';
    if (this.hasItem('third-pill')) {
      visual.distortion += 0.6;
      visual.materialTint = this.mixHex(visual.materialTint, '#96789c', 0.3);
    }
    if (this.hasItem('name-sold')) {
      if (!visual.materials.includes('metal')) visual.materials.push('metal');
      visual.coreColor = this.mixHex(visual.coreColor, '#8a8a8a', 0.5);
      visual.opacity *= 0.9;
    }
    if (this.hasItem('momo-avatar')) visual.edgeColor = '#e8a8c8';
    if (this.hasItem('flash-escape')) visual.trailColor = '#b9a8d6';
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
    if (this.hasItem('last-page') && this.lastPageDeadlineActive()) {
      visual.coreColor = this.mixHex(visual.coreColor, '#f0c5c2', 0.5);
      visual.materialTint = this.mixHex(visual.materialTint, '#b34f58', 0.55);
      visual.edgeColor = this.mixHex(visual.edgeColor, '#742f39', 0.72);
      visual.trailColor = this.mixHex(visual.trailColor, '#9e3f4b', 0.62);
      visual.impactColor = '#c75864';
    }
    // 和 TearVariant 一样只选一个主资源；其余道具继续叠参数、尾迹与命中特效。
    const signatureItems = this.hasItem('card-binder')
      ? [...this.items, ...this.binderCards]
      : this.items;
    visual.form = selectBaseProjectileForm(signatureItems, visual.form);
    visual.carrierForm = visual.form;
    if (extraMaterial === 'water') visual.form = 'rain';
    else if (extraMaterial === 'signal') visual.form = 'sound';

    if (!visual.echoed) {
      const resolvedTrail = resolveProjectileTrail(signatureItems, visual.trail);
      visual.trail = resolvedTrail.trail;
      if (visual.materials.includes('signal') && resolvedTrail.priority < 95) visual.trail = 'signal';
      else if (visual.wetness >= 0.35 && resolvedTrail.priority < 90) visual.trail = 'drip';
      else if (visual.sharpness >= 0.7 && resolvedTrail.priority < 60) visual.trail = 'streak';
    }
    return visual;
  }

  private projectileVisualForForm(
    form: ProjectileForm,
    material?: ProjectileVisual['materials'][number],
    generation = 0,
  ): ProjectileVisual {
    const visual = { ...this.computeProjectileVisual(material, generation), form };
    if (form === 'rain' || form === 'tear') visual.trail = 'drip';
    else if (form === 'sound' || form === 'link') visual.trail = 'signal';
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

  private currentTypingIndicatorDots(): 0 | 1 | 2 | 3 {
    if (!this.hasItem('typing-indicator') || !this.hasLivingEnemies()) return 0;
    if (this.typingIndicatorBurstFlash > 0) return 3;
    return Math.min(
      TYPING_INDICATOR_DOT_COUNT - 1,
      Math.floor((this.typingIndicatorTimer + 1e-6) / TYPING_INDICATOR_DOT_INTERVAL),
    ) as 0 | 1 | 2;
  }

  private updateTypingIndicator(dt: number): void {
    if (!this.hasItem('typing-indicator') || !this.hasLivingEnemies()) {
      this.typingIndicatorTimer = 0;
      this.typingIndicatorBurstFlash = 0;
      return;
    }
    if (
      this.holdTimer > 0
      || this.breathlessTimer > 0
      || this.oneMoreOpeningTimer > 0
      || this.transitionTimer > 0
      || this.phoneMsgInterrupt > 0
    ) return;
    this.typingIndicatorTimer += dt;
    const cycle = TYPING_INDICATOR_DOT_INTERVAL * TYPING_INDICATOR_DOT_COUNT;
    while (this.typingIndicatorTimer >= cycle) {
      this.typingIndicatorTimer -= cycle;
      this.typingIndicatorBurstFlash = TYPING_INDICATOR_THIRD_DOT_HOLD;
      this.fireTypingIndicatorSpread();
    }
  }

  private fireTypingIndicatorSpread(): void {
    const vector = this.computeAttackVector();
    const style = this.baseProjectileStyle();
    const shotCount = TYPING_INDICATOR_SPREAD_COUNT;
    const angleOffset = (this.typingIndicatorBurstCount % 2) * Math.PI / shotCount;
    const mechanics = this.inheritProjectileMechanics(vector);
    const criticalAllowed = !this.hasItem('name-sold') || this.momoCriticalWindowActive();
    const criticalMultiplier = this.hasItem('eyebrow-razor') ? 2.25 : 1.8;
    const visual = this.computeProjectileVisual(undefined, 0);
    this.typingIndicatorBurstCount += 1;
    this.volleyCount += 1;
    this.stats.volleys += 1;
    const nearest = this.nearestEnemy(this.heroX, this.heroY);
    if (nearest) {
      this.heroAttackFacing = this.facingFromAngle(Math.atan2(nearest.y - this.heroY, nearest.x - this.heroX));
    }
    this.heroAttackTimer = HERO_ATTACK_ANIMATION_DURATION;
    this.feedback.play('breath', 1.18);
    this.feedback.vibrate(12);
    for (let index = 0; index < shotCount; index += 1) {
      const angle = angleOffset + index / shotCount * Math.PI * 2;
      const critical = criticalAllowed && this.random() < vector.critChance;
      this.spawnProjectile({
        x: this.heroX,
        y: this.heroY - 14,
        angle,
        damage: vector.damage * 0.46 * (critical ? criticalMultiplier : 1),
        speed: vector.projectileSpeed * 0.9,
        radius: Math.max(2.5, vector.width * 0.86),
        range: Math.max(300, vector.range * 1.25),
        life: Math.max(2, vector.lifetime),
        ...mechanics,
        generation: 0,
        color: critical ? '#fff1a8' : this.projectileColor(style),
        style,
        critical,
        knockback: vector.knockback * 0.75,
        visual: this.cloneProjectileVisual(visual),
      });
    }
    this.burst('ring', this.heroX, this.heroY - 14, 150, '#ded7ca');
    this.screenShake = Math.max(this.screenShake, 2.5);
    this.sigh(1.8);
  }

  private fireBaseVolley(angleNudge = 0): void {
    const target = this.nearestEnemy(this.heroX, this.heroY);
    if (!target) return;
    const vector = this.computeAttackVector();
    this.volleyCount += 1;
    this.stats.volleys += 1;
    const baseCount = vector.projectileCount;
    let count = baseCount;
    const buttonVolley = this.hasProjectileTrigger('loose-button') && this.volleyCount % 3 === 0;
    if (buttonVolley) count += 1;
    const photoVolley = this.hasItem('missing-photo') && this.volleyCount % 4 === 0;
    if (photoVolley) count += 2;
    const baseAngle = Math.atan2(target.y - this.heroY, target.x - this.heroX) + angleNudge;
    const targetDistance = Math.hypot(target.x - this.heroX, target.y - this.heroY);
    const distanceCritBonus = this.hasProjectileTrigger('cracked-glasses')
      ? this.clamp((targetDistance - 80) / 240, 0, 0.18)
      : 0;
    this.lastDistanceCritBonus = distanceCritBonus;
    this.heroAttackFacing = this.facingFromAngle(baseAngle);
    this.heroAttackTimer = HERO_ATTACK_ANIMATION_DURATION;
    this.feedback.play('breath', this.clamp(vector.width / BASE_VECTOR.width, 0.55, 1.35));
    const style = this.baseProjectileStyle();
    const currentVolleyRecipe: PendingShot[] = [];
    // 《连续签到1847天》：每个整10秒的第一发准时暴击；受伤打断当期作废
    let rhythmCrit = false;
    if (this.hasProjectileTrigger('streak-1847')) {
      const rhythmWindow = Math.floor(this.battleTime / 10);
      if (rhythmWindow > this.lastRhythmMark && rhythmWindow !== this.rhythmBrokenWindow) {
        this.lastRhythmMark = rhythmWindow;
        rhythmCrit = true;
        this.burst('word', this.heroX, this.heroY - 62, 24, '#d4b45f', '准时打卡');
        this.burst('ring', this.heroX, this.heroY - 16, 30, '#d4b45f');
      }
    }
    const fiveHa = this.hasProjectileTrigger('five-ha');
    const criticalAllowed = !this.hasItem('name-sold') || this.momoCriticalWindowActive();
    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0 : (index - (count - 1) / 2) * vector.spread;
      const angle = baseAngle + offset;
      const specialKind: 'button' | 'photo' | undefined = buttonVolley && index === baseCount
        ? 'button'
        : photoVolley && index >= count - 2
          ? 'photo'
          : undefined;
      const inheritedDamage = specialKind === 'button'
        ? (this.buttonRecordedDamage > 0 ? this.buttonRecordedDamage : vector.damage)
        : specialKind === 'photo'
          ? vector.damage * 1.35
          : vector.damage;
      const shotGeneration = specialKind ? 1 : 0;
      const criticalMultiplier = this.hasItem('eyebrow-razor') ? 2.25 : 1.8;
      if (fiveHa) {
        // 《五个哈》：一次笑出五连发，一发比一发轻——少一个都显得没礼貌
        // “名字卖掉了”优先处理与五连递减直接冲突的部分：仍然五发，但全部制式一致。
        const standardized = this.hasItem('name-sold');
        const burstCritical = criticalAllowed && ((rhythmCrit && index === 0)
          || this.random() < vector.critChance + distanceCritBonus);
        planFiveShotBurst(standardized).forEach((shot) => {
          const visualForm = specialKind === 'button' ? 'button' : undefined;
          const plannedShot: PendingShot = {
            delay: shot.delay, angle: angle + shot.angleOffset,
            damage: inheritedDamage * shot.damageShare * 1.1 * (burstCritical ? criticalMultiplier : 1),
            speed: vector.projectileSpeed,
            radius: Math.max(1.5, vector.width * 0.72 * shot.sizeScale),
            range: vector.range, life: vector.lifetime,
            pierce: vector.pierce, homing: vector.homing,
            returning: vector.returning, splitChance: vector.splitChance, explosion: vector.explosion,
            color: this.projectileColor(style), style,
            critical: burstCritical,
            knockback: vector.knockback * 0.5, generation: shotGeneration,
            visualForm,
            visual: visualForm
              ? this.projectileVisualForForm(visualForm, undefined, shotGeneration)
              : this.computeProjectileVisual(undefined, shotGeneration),
          };
          currentVolleyRecipe.push({ ...plannedShot });
          this.schedulePlannedShot(plannedShot);
        });
        continue;
      }
      const critical = criticalAllowed && ((rhythmCrit && index === 0)
        || this.random() < vector.critChance + distanceCritBonus);
      const plannedShot: PendingShot = {
        delay: 0, angle,
        damage: inheritedDamage * (critical ? criticalMultiplier : 1),
        speed: vector.projectileSpeed,
        radius: vector.width, range: vector.range, life: vector.lifetime,
        pierce: vector.pierce,
        returning: vector.returning, homing: vector.homing, splitChance: vector.splitChance,
        explosion: vector.explosion, generation: shotGeneration, style, critical, knockback: vector.knockback,
        color: critical ? '#fff1a8' : this.projectileColor(style),
        visualForm: specialKind === 'button' ? 'button' : undefined,
        visual: specialKind === 'button'
            ? this.projectileVisualForForm('button', undefined, shotGeneration)
            : this.computeProjectileVisual(undefined, shotGeneration),
      };
      currentVolleyRecipe.push({ ...plannedShot });
      this.spawnPlannedShot(plannedShot);
    }
    if (buttonVolley) this.buttonRecordedDamage = 0;
    if (this.hasProjectileTrigger('held-pee') && this.heldPeeCharge > 0) {
      this.heldPeeCharge = 0;
      this.burst('word', this.heroX, this.heroY - 42, 18, '#b39a4e', '泄压');
    }
    // 《和AI聊到凌晨》：它复读你的每一口气
    if (this.hasItem('ai-chat')) {
      for (const shot of currentVolleyRecipe) {
        this.pushPendingShot({
          ...shot,
          delay: 0.4 + shot.delay,
          damage: shot.damage * 0.35,
          radius: Math.max(2, shot.radius * 0.8),
          splitChance: shot.splitChance * 0.5,
          explosion: shot.explosion * 0.35,
          color: '#6f93a3', critical: false,
          knockback: shot.knockback * 0.4, generation: 1,
          priority: 'secondary', visualTone: 'echo',
        });
      }
    }
    // 《年度听歌报告》：每第4轮把上一轮弹道原样重放一遍
    if (this.hasItem('year-report') && this.volleyCount % 4 === 0 && this.lastVolleyRecipe.length > 0) {
      for (const shot of this.lastVolleyRecipe) {
        this.schedulePlannedShot({
          ...shot,
          damage: shot.damage * 0.6,
          explosion: shot.explosion * 0.6,
          generation: 1,
          critical: false,
          knockback: shot.knockback * 0.6,
          color: '#8c81a0',
          priority: 'secondary',
          visualTone: 'replay',
        });
      }
      this.burst('word', this.heroX, this.heroY - 52, 30, '#8c81a0', '循环播放');
    }
    this.lastVolleyRecipe = currentVolleyRecipe.map((shot) => ({
      ...shot,
      visual: shot.visual ? this.cloneProjectileVisual(shot.visual) : undefined,
    }));
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
    const pregnancySource = currentVolleyRecipe[0];
    if (this.hasItem('pregnancy-test') && this.volleyCount % 3 === 0 && pregnancySource) {
      const source = pregnancySource;
      const followerVisual = source.visual ? this.cloneProjectileVisual(source.visual) : undefined;
      if (followerVisual) {
        followerVisual.trail = 'child';
        followerVisual.echoed = true;
        followerVisual.opacity *= 0.84;
      }
      this.spawnPlannedShot({
        ...source,
        delay: 0,
        damage: source.damage * 0.8,
        speed: source.speed * 0.9,
        radius: Math.max(2.5, source.radius * 0.7),
        pierce: source.pierce,
        homing: Math.max(0.1, source.homing),
        splitChance: source.splitChance * 0.5,
        explosion: source.explosion * 0.45,
        generation: 1,
        color: '#cdb8cf',
        critical: false,
        knockback: source.knockback * 0.6,
        priority: 'secondary',
        visual: followerVisual,
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
    pierce: number; returning: boolean; homing: number; splitChance: number; splitDepth?: number;
    ricochetDepth?: number; explosion: number;
    generation: number; color: string; style: ProjectileStyle; critical: boolean; knockback?: number; visual?: ProjectileVisual;
    orbit?: { angle: number; total: number; elapsed: number }; priority?: 'core' | 'secondary';
  }): void {
    const material = options.style === 'rain' ? 'water' : options.style === 'sound' ? 'signal' : undefined;
    const inheritedDadBoost = options.generation > 0 && this.hasItem('group-dad') ? 1.4 : 1;
    const baseVisual = options.visual ?? this.computeProjectileVisual(material, options.generation);
    const visual = inheritedDadBoost > 1
      ? { ...baseVisual, edgeColor: '#d8b66d', weight: baseVisual.weight + 0.35, materials: [...baseVisual.materials] }
      : baseVisual;
    this.pushProjectile({
      id: this.entityId++, x: options.x, y: options.y,
      vx: Math.cos(options.angle) * options.speed, vy: Math.sin(options.angle) * options.speed,
      radius: options.radius, damage: options.damage * inheritedDadBoost, knockback: options.knockback ?? 0, life: options.life, maxLife: options.life,
      distance: 0, maxDistance: options.range, pierce: options.pierce, pierceMax: options.pierce,
      returning: options.returning, reversals: 0, homing: options.homing, splitChance: options.splitChance,
      splitDepth: options.splitDepth ?? 0, ricochetDepth: options.ricochetDepth ?? 0,
      explosion: options.explosion, generation: options.generation, color: options.color,
      poolPriority: options.priority ?? (options.generation === 0 ? 'core' : 'secondary'),
      style: options.style, visual,
      critical: options.critical, hitIds: [],
      orbit: options.orbit,
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
    const queued = {
      ...shot,
      priority,
      visual: shot.visual ? this.cloneProjectileVisual(shot.visual) : undefined,
    };
    if (this.pendingShots.length < MAX_PENDING_SHOTS) {
      this.pendingShots.push(queued);
      return;
    }
    const secondaryIndex = this.pendingShots.findIndex((pending) => pending.priority === 'secondary');
    if (priority === 'secondary' && secondaryIndex < 0) return;
    this.pendingShots.splice(secondaryIndex >= 0 ? secondaryIndex : 0, 1);
    this.pendingShots.push(queued);
  }

  private schedulePlannedShot(shot: PendingShot): void {
    if (shot.delay > 0) this.pushPendingShot(shot);
    else this.spawnPlannedShot(shot);
  }

  private spawnPlannedShot(shot: PendingShot): void {
    let visual = shot.visual
      ? this.cloneProjectileVisual(shot.visual)
      : shot.visualForm
        ? this.projectileVisualForForm(shot.visualForm, undefined, shot.generation)
        : shot.visualTone
          ? this.computeProjectileVisual(undefined, shot.generation)
          : undefined;
    if (visual && shot.visualTone === 'echo') {
      visual.echoed = true;
      visual.trail = 'echo';
      visual.opacity *= 0.72;
      visual.trailColor = this.mixHex(visual.trailColor, '#6f93a3', 0.58);
    } else if (visual && shot.visualTone === 'replay') {
      visual.echoed = true;
      visual.trail = 'echo';
      visual.opacity *= 0.78;
      visual.trailColor = this.mixHex(visual.trailColor, '#4a4a68', 0.55);
      visual.materialTint = this.mixHex(visual.materialTint, '#8c81a0', 0.32);
    }
    this.spawnProjectile({
      x: this.heroX, y: this.heroY - 14, angle: shot.angle, damage: shot.damage,
      speed: shot.speed, radius: shot.radius, range: shot.range, life: shot.life,
      pierce: shot.pierce, returning: shot.returning, homing: shot.homing, splitChance: shot.splitChance,
      splitDepth: shot.splitDepth, ricochetDepth: shot.ricochetDepth,
      explosion: shot.explosion, generation: shot.generation,
      color: shot.color, style: shot.style, critical: shot.critical, knockback: shot.knockback,
      priority: shot.priority, visual,
    });
  }

  private cloneProjectileVisual(visual: ProjectileVisual): ProjectileVisual {
    return { ...visual, materials: [...visual.materials] };
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
      const orbitVisual = this.computeProjectileVisual(undefined, 1);
      orbitVisual.trail = 'fade';
      orbitVisual.opacity *= 0.88 - index * 0.1;
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 8, angle,
        damage: Math.max(3, vector.damage * 0.8), speed: vector.projectileSpeed * 0.72,
        radius: Math.max(3, vector.width * 0.9), range: Math.min(180, vector.range * 0.75),
        life: 2.6 + Math.max(1, vector.lifetime * 0.7), ...orbitMechanics,
        generation: 1, style: 'plain', critical: false, knockback: 5,
        color: '#9a94a6', orbit: { angle, total: 2.6, elapsed: 0 }, visual: orbitVisual,
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

  private releaseBowlSteam(): void {
    const vector = this.computeAttackVector();
    const steamVisual = this.projectileVisualForForm('breath', 'water', 1);
    steamVisual.echoed = false;
    steamVisual.trail = 'mist';
    steamVisual.opacity *= 0.82;
    const steamMechanics = this.inheritProjectileMechanics(vector, {
      pierceFloor: 1,
      homingFloor: 0.03,
      splitScale: 0.45,
      explosionScale: 0.5,
    });
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 12, angle,
        damage: Math.max(3, vector.damage * 0.42), speed: 150,
        radius: Math.max(3.5, vector.width * 0.85), range: Math.min(170, vector.range * 0.72),
        life: Math.max(1.1, vector.lifetime * 0.62), ...steamMechanics,
        generation: 1, color: '#d9c79f', style: 'rain', critical: false,
        knockback: Math.max(3, vector.knockback * 0.65),
        visual: this.cloneProjectileVisual(steamVisual),
      });
    }
    this.burst('ring', this.heroX, this.heroY - 12, 52, '#d9c79f');
    this.burst('word', this.heroX, this.heroY - 84, 30, '#d9c79f', '饭还热');
    this.feedback.play('breath', 1.05);
  }

  private releaseRetractedVoice(): void {
    if (!this.hasItem('retracted-voice') || this.voiceCharges <= 0) return;
    const charges = this.voiceCharges;
    const vector = this.computeAttackVector();
    const target = this.nearestEnemy(this.heroX, this.heroY);
    const baseAngle = target ? Math.atan2(target.y - this.heroY, target.x - this.heroX) : -Math.PI / 2;
    const voiceMechanics = this.inheritProjectileMechanics(vector, {
      pierceAdd: 1,
      homingFloor: 0.05,
      splitScale: 0.45,
      explosionScale: 0.5,
    });
    for (let layer = 0; layer < charges; layer += 1) {
      const offset = (layer - (charges - 1) / 2) * 0.16;
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 14, angle: baseAngle + offset,
        damage: 6, speed: vector.projectileSpeed * 0.88,
        radius: Math.max(3, vector.width * 0.9), range: vector.range * 0.82,
        life: vector.lifetime, ...voiceMechanics, generation: 1, style: 'sound',
        critical: false, knockback: vector.knockback, color: '#9a8fc0',
        visual: this.projectileVisualForForm('sound', 'signal', 1),
      });
    }
    this.burst('word', this.heroX, this.heroY - 60, 60, '#9a8fc0', '当时没说的');
    this.voiceCharges = 0;
  }

  private updateProjectiles(dt: number): void {
    const spawned: Projectile[] = [];
    projectileLoop: for (const projectile of this.projectiles) {
      if (projectile.life <= 0) continue;
      if ((projectile.verifyCooldown ?? 0) > 0) projectile.verifyCooldown = Math.max(0, (projectile.verifyCooldown ?? 0) - dt);
      if ((projectile.elevatorWait ?? 0) > 0) {
        projectile.elevatorWait = Math.max(0, (projectile.elevatorWait ?? 0) - dt);
        projectile.life = Math.max(projectile.life, 0.35);
        if ((projectile.elevatorWait ?? 0) > 0) continue;
        const waitTarget = this.nearestEnemy(projectile.x, projectile.y);
        if (!waitTarget) {
          projectile.life = 0;
          continue;
        }
        const speed = projectile.elevatorSpeed ?? Math.max(90, Math.hypot(projectile.vx, projectile.vy));
        const waitAngle = Math.atan2(waitTarget.y - projectile.y, waitTarget.x - projectile.x);
        projectile.vx = Math.cos(waitAngle) * speed;
        projectile.vy = Math.sin(waitAngle) * speed;
        projectile.distance = 0;
        projectile.maxDistance = Math.max(80, projectile.maxDistance * 0.65);
        projectile.life = Math.max(projectile.life, projectile.maxLife * 0.55);
        projectile.hitIds = [];
        projectile.pierce = projectile.pierceMax;
        projectile.elevatorRelaunched = true;
        projectile.visual.trail = 'home';
        this.burst('word', projectile.x, projectile.y, 18, '#9aa8b5', '请进');
      }
      if (projectile.homePhase === 'returning') {
        const homeDx = this.heroX - projectile.x;
        const homeDy = (this.heroY - 14) - projectile.y;
        const homeDistance = Math.hypot(homeDx, homeDy);
        if (homeDistance <= Math.max(14, projectile.radius + 8)) {
          const homeTarget = this.nearestEnemy(this.heroX, this.heroY);
          if (!homeTarget) {
            projectile.vx = 0;
            projectile.vy = 0;
            projectile.life = Math.max(projectile.life, 0.25);
            continue;
          }
          const relaunchSpeed = Math.max(90, Math.hypot(projectile.vx, projectile.vy)) * 1.12;
          const relaunchAngle = Math.atan2(homeTarget.y - this.heroY, homeTarget.x - this.heroX);
          projectile.x = this.heroX;
          projectile.y = this.heroY - 14;
          projectile.damage *= 1.3;
          projectile.radius *= 1.08;
          projectile.distance = 0;
          projectile.hitIds = [];
          projectile.pierce = projectile.pierceMax;
          projectile.homePhase = 'relaunched';
          projectile.color = '#d1ab5f';
          projectile.visual.trail = 'home';
          if (this.hasItem('held-elevator') && !projectile.elevatorRelaunched) {
            projectile.vx = 0;
            projectile.vy = 0;
            projectile.elevatorSpeed = relaunchSpeed;
            projectile.elevatorWait = 0.36;
            projectile.life = Math.max(projectile.life, 0.72);
            this.burst('word', projectile.x, projectile.y - 16, 20, '#c9a45f', '门口等一下');
            continue;
          }
          projectile.vx = Math.cos(relaunchAngle) * relaunchSpeed;
          projectile.vy = Math.sin(relaunchAngle) * relaunchSpeed;
          projectile.life = Math.max(projectile.life, projectile.maxLife * 0.7);
          this.burst('word', projectile.x, projectile.y - 16, 20, '#c9a45f', '重新出发');
        } else {
          const returnSpeed = Math.max(90, Math.hypot(projectile.vx, projectile.vy));
          projectile.vx = (homeDx / homeDistance) * returnSpeed;
          projectile.vy = (homeDy / homeDistance) * returnSpeed;
          const returnDx = projectile.vx * dt;
          const returnDy = projectile.vy * dt;
          projectile.x += returnDx;
          projectile.y += returnDy;
          projectile.life = Math.max(0.05, projectile.life - dt);
          continue;
        }
      }
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
        if ((projectile.verifyCooldown ?? 0) > 0) continue;
        if (Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y) > projectile.radius + enemy.radius) continue;
        projectile.hitIds.push(enemy.id);
        if (this.hasItem('friend-verify') && !projectile.verifyPassed) {
          projectile.verifyPassed = true;
          projectile.verifyCooldown = 0.24;
          projectile.vx *= -1;
          projectile.vy *= -1;
          projectile.distance = 0;
          projectile.hitIds = [];
          projectile.homing = Math.max(projectile.homing, 0.28);
          projectile.visual.form = 'stamp';
          projectile.visual.trail = 'return-mark';
          projectile.color = '#b74450';
          this.burst('word', enemy.x, enemy.y - 24, 22, '#b74450', '验证失败');
          continue projectileLoop;
        }
        let hitDamage = projectile.damage;
        // 《这点重量不算什么》：弹道停留越久越重
        if (this.hasCombo('这点重量不算什么')) {
          hitDamage *= 1 + Math.min(0.6, (projectile.maxLife - projectile.life) * 0.22);
        }
        // 《被退回的信》：折返后的信更疼
        if (projectile.reversals > 0 && this.hasCombo('被退回的信')) hitDamage *= 1.25;
        hitDamage = this.applyProjectileMaterialReactions(enemy, projectile, hitDamage);
        if ((this.hasItem('ktv-song') && projectile.style === 'sound')
          || (this.hasItem('year-report') && projectile.generation > 0)) {
          enemy.loopTimer = Math.max(enemy.loopTimer ?? 0, 0.9);
        }
        if (projectile.nonlethal) hitDamage = Math.min(hitDamage, Math.max(0, enemy.hp - 1));
        if (this.hasProjectileTrigger('read-3am') && !projectile.nonlethal) {
          // 《凌晨三点的已读》：命中不立即结算，5秒后连本带利一次爆出
          const heavyDebt = (enemy.heavyTimer ?? 0) > 0 ? Math.min(3, enemy.heavyStacks ?? 1) : 0;
          enemy.readDamage = (enemy.readDamage ?? 0) + hitDamage * 1.3 * (1 + heavyDebt * 0.12);
          if (enemy.readTimer === undefined || enemy.readTimer <= 0) {
            enemy.readTimer = 5;
            this.burst('word', enemy.x, enemy.y - 22, 18, '#9fb6c8', '已读');
          }
          enemy.flash = Math.max(enemy.flash, 0.08);
        } else {
          if (hitDamage > 0) this.damageEnemy(enemy, hitDamage, projectile.color, this.hitMaterialOf(projectile));
        }
        if (projectile.critical && this.hasCombo('能屈能伸')) {
          this.burst('word', enemy.x, enemy.y - 24, 22, '#d9b768', '收到');
        }
        if (projectile.critical
          && this.hasProjectileTrigger('cracked-glasses')
          && projectile.distance >= projectile.maxDistance * 0.45) {
          this.burst('ring', enemy.x, enemy.y, 24, '#dff4f5');
        }
        // 《那年他觉得自己很酷》：掉色雨滴标记敌人
        if (projectile.style === 'rain' && this.hasCombo('那年他觉得自己很酷')) enemy.marked = 4;
        const speedNow = Math.hypot(projectile.vx, projectile.vy) || 1;
        const kbFactor = enemy.type === 'forgetter' ? 0 : enemy.boss ? 0.25 : 1;
        enemy.x += (projectile.vx / speedNow) * projectile.knockback * kbFactor;
        enemy.y += (projectile.vy / speedNow) * projectile.knockback * kbFactor;
        let ricocheted = false;
        if (this.hasProjectileTrigger('marble')
          && (projectile.ricochetDepth ?? 0) < 1
          && (projectile.auditForceRicochet || this.random() < 0.25)) {
          projectile.auditForceRicochet = false;
          const next = this.enemies
            .filter((other) => !other.dead && other.id !== enemy.id && !projectile.hitIds.includes(other.id))
            .sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y))[0];
          if (next) {
            const bounceAngle = Math.atan2(next.y - enemy.y, next.x - enemy.x);
            const bounceSpeed = Math.hypot(projectile.vx, projectile.vy);
            projectile.vx = Math.cos(bounceAngle) * bounceSpeed;
            projectile.vy = Math.sin(bounceAngle) * bounceSpeed;
            projectile.distance = 0;
            projectile.ricochetDepth = (projectile.ricochetDepth ?? 0) + 1;
            projectile.visual.trail = 'ricochet';
            ricocheted = true;
            this.burst('ring', enemy.x, enemy.y, 18, '#cfe4ea');
          }
        }
        if (this.hasItem('bargain-link')
          && !projectile.bargainBranched
          && (projectile.bargainBranchDepth ?? 0) < 2) {
          projectile.bargainBranched = true;
          const heading = Math.atan2(projectile.vy, projectile.vx);
          for (const offset of [-0.5, 0.5]) {
            const helper = this.makeChildProjectile(projectile, heading + offset);
            helper.damage = projectile.damage * 0.32 * (this.hasItem('group-dad') ? 1.4 : 1);
            helper.radius = Math.max(2, projectile.radius * 0.58);
            helper.nonlethal = true;
            helper.bargainBranchDepth = (projectile.bargainBranchDepth ?? 0) + 1;
            helper.bargainBranched = false;
            helper.explosion = 0;
            helper.splitChance = 0;
            helper.visual.form = 'link';
            helper.visual.trail = 'chain';
            helper.visual.opacity *= 0.82;
            spawned.push(helper);
          }
          this.burst('word', enemy.x, enemy.y - 20, 18, '#c95a62', '还差一刀');
        }
        this.trySplitProjectile(projectile, Math.atan2(projectile.vy, projectile.vx), spawned);
        if (!ricocheted) {
          projectile.pierce -= 1;
          if (projectile.pierce < 0) {
            projectile.life = 0;
            projectile.hitTerminated = true;
            break;
          }
        }
      }

      if (projectile.hitTerminated) continue;
      const outOfBounds = Math.abs(projectile.x - this.heroX) >= 340 || Math.abs(projectile.y - this.heroY) >= 430;
      if (projectile.distance >= projectile.maxDistance || projectile.life <= 0 || outOfBounds) {
        if (this.hasItem('old-door-lock') && projectile.homePhase === undefined) {
          projectile.homePhase = 'returning';
          projectile.reversals = 1;
          projectile.distance = 0;
          projectile.life = Math.max(projectile.life, projectile.maxLife);
          projectile.hitIds = [];
          projectile.pierce = projectile.pierceMax;
          projectile.visual.trail = 'home';
          if (this.hasProjectileTrigger('red-workbook')) {
            projectile.damage *= 1.4;
            projectile.radius *= 1.08;
            projectile.color = '#c94d55';
            projectile.visual.trail = 'return-mark';
            this.burst('word', projectile.x, projectile.y - 12, 18, '#c94d55', '×');
          } else {
            this.burst('door', projectile.x, projectile.y, 28, '#c9a45f');
          }
        } else if (projectile.returning && projectile.reversals < 1 && projectile.hitIds.length === 0) {
          projectile.vx *= -1;
          projectile.vy *= -1;
          projectile.distance = 0;
          projectile.reversals += 1;
          projectile.hitIds = [];
          projectile.pierce = projectile.pierceMax;
          if (this.hasProjectileTrigger('red-workbook')) {
            projectile.damage *= 1.4;
            projectile.radius *= 1.08;
            projectile.color = '#c94d55';
            projectile.visual.trail = 'return-mark';
            this.burst('word', projectile.x, projectile.y - 12, 18, '#c94d55', '×');
            // 《被退回的信》：批改后的信认得回去的路
            if (this.hasCombo('被退回的信')) projectile.homing = Math.max(projectile.homing, 0.22);
          }
          // 协同：追踪×折返——回家的路上还惦记着
          if (this.hasItem('front-desk-letter') && this.hasItem('old-door-lock')) {
            projectile.homing = Math.max(projectile.homing, 0.25);
            this.noteSynergy('回家的路上还惦记着');
          }
        } else {
          if (this.hasItem('held-elevator')
            && !projectile.elevatorRelaunched
            && this.random() < 0.3) {
            projectile.elevatorSpeed = Math.max(90, Math.hypot(projectile.vx, projectile.vy));
            projectile.elevatorWait = 0.36;
            projectile.vx = 0;
            projectile.vy = 0;
            projectile.distance = 0;
            projectile.life = Math.max(projectile.life, 0.72);
            projectile.visual.trail = 'pause';
            this.burst('word', projectile.x, projectile.y, 20, '#9aa8b5', '按住了');
          } else {
            projectile.life = 0;
            this.explodeProjectile(projectile);
          }
        }
      }
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
      verifyPassed: parent.verifyPassed,
      verifyCooldown: 0,
      homePhase: undefined,
      elevatorWait: undefined,
      elevatorSpeed: undefined,
      elevatorRelaunched: undefined,
      hitTerminated: false,
      auditForceFreeze: false,
      auditForceParalyze: false,
      auditForceRicochet: false,
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
    const heavyBlast = this.hasProjectileTrigger('stone-schoolbag')
      && (this.hasProjectileTrigger('only-key') || this.hasItem('empty-frame'));
    if (heavyBlast) {
      this.noteSynergy('压过的地方塌得更大');
      this.burst('syn', projectile.x, projectile.y, 34, '#9a8a70', undefined, 'collapse');
    }
    const frameScale = this.hasItem('empty-frame') ? 1.65 : 1;
    const radius = (45 + projectile.explosion * 1.5) * (heavyBlast ? 1.4 : 1) * frameScale;
    const damage = projectile.explosion;
    projectile.explosion = 0;
    for (const enemy of this.enemies) {
      if (!enemy.dead && Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y) < radius + enemy.radius) {
        if ((enemy.readDamage ?? 0) > 0) {
          this.settleReadDebt(enemy, '提前清算');
          this.noteSynergy('一次性清算');
        }
        if (!enemy.dead) this.damageEnemy(enemy, damage, '#d3a85d', this.hitMaterialOf(projectile));
      }
    }
    if (this.hasItem('empty-frame')) this.burst('frame', projectile.x, projectile.y, radius, '#b68b4e');
    this.burst(this.hasProjectileTrigger('only-key') ? 'door' : 'ring', projectile.x, projectile.y, radius, '#d3a85d');
  }

  private updateEnemies(dt: number): void {
    const speedMultiplier = this.hasItem('bleach-powder') ? 1.15 : 1;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = this.heroX - enemy.x;
      const dy = this.heroY - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (enemy.slowTimer !== undefined && enemy.slowTimer > 0) enemy.slowTimer -= dt;
      if (enemy.freezeTimer !== undefined && enemy.freezeTimer > 0) enemy.freezeTimer -= dt;
      if (enemy.paralyzeTimer !== undefined && enemy.paralyzeTimer > 0) enemy.paralyzeTimer -= dt;
      if (enemy.wetTimer !== undefined && enemy.wetTimer > 0) enemy.wetTimer -= dt;
      if (enemy.rawTimer !== undefined && enemy.rawTimer > 0) enemy.rawTimer -= dt;
      if (enemy.heavyTimer !== undefined && enemy.heavyTimer > 0) enemy.heavyTimer -= dt;
      if (enemy.controlFatigue !== undefined && enemy.controlFatigue > 0) {
        enemy.controlFatigue = Math.max(0, enemy.controlFatigue - dt * 0.18);
      }
      if (enemy.loopTimer !== undefined && enemy.loopTimer > 0) enemy.loopTimer -= dt;
      if (enemy.marked !== undefined && enemy.marked > 0) enemy.marked -= dt;
      if (enemy.readTimer !== undefined && enemy.readTimer > 0) {
        enemy.readTimer -= dt;
        if (enemy.readTimer <= 0 && (enemy.readDamage ?? 0) > 0) {
          this.settleReadDebt(enemy);
        }
      }
      if (enemy.dashTimer !== undefined && enemy.dashTimer > 0) enemy.dashTimer -= dt;
      if (enemy.tauntVulnerableTimer !== undefined && enemy.tauntVulnerableTimer > 0) {
        enemy.tauntVulnerableTimer = Math.max(0, enemy.tauntVulnerableTimer - dt);
      }
      if (enemy.phaseFlashTimer !== undefined && enemy.phaseFlashTimer > 0) enemy.phaseFlashTimer -= dt;
      if (enemy.bossAnimTimer !== undefined && enemy.bossAnimTimer > 0) {
        enemy.bossAnimTimer = Math.max(0, enemy.bossAnimTimer - dt);
        if (enemy.bossAnimTimer <= 0) {
          enemy.bossAnim = undefined;
          enemy.bossAnimDuration = undefined;
          enemy.bossAnimLoop = undefined;
        }
      }
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
          this.hurtHero(1, enemy.name);
          this.burst('ring', enemy.x, enemy.y, 70, '#7fa8b5');
        }
      }
      if (enemy.type === 'hunger-shadow' && enemy.mechTimer >= 3) {
        enemy.mechTimer = 0;
        enemy.dashTimer = 0.5;
      }
      // 《辛苦下周一前》：倒计时到点没打死，它自己消失并扣你零钱——deadline 过了
      if (enemy.type === 'task-deadline' && (enemy.mechTimer ?? 0) >= 8) {
        enemy.dead = true;
        if (this.hero.coins > 0) {
          this.hero.coins -= 1;
          this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 26, '#b58558', '过期了 · -1零钱');
        } else {
          this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 26, '#b58558', '过期了');
        }
        continue;
      }
      // 《对齐一下》：不打你，把场上其他活拉到一起同步行动——开会
      if (enemy.type === 'task-sync' && (enemy.mechTimer ?? 0) >= 4) {
        enemy.mechTimer = 0;
        for (const other of this.enemies) {
          if (other.dead || other === enemy || other.boss || other.elite) continue;
          const pull = Math.hypot(other.x - enemy.x, other.y - enemy.y);
          if (pull > 30 && pull < 260) {
            other.x += (enemy.x - other.x) * 0.3;
            other.y += (enemy.y - other.y) * 0.3;
          }
        }
        this.burst('ring', enemy.x, enemy.y, 120, '#6f8f8a');
        this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 24, '#6f8f8a', '对齐一下');
      }

      // —— 青年大 Boss《你很优秀》——
      if (enemy.type === 'praise-chair') {
        const chairP2 = (enemy.phase ?? 1) === 2;
        if (chairP2) this.praiseConsult = undefined;
        else this.updatePraiseConsult(enemy, dt);
        if (!chairP2 && enemy.hp <= enemy.maxHp * 0.5) {
          // 转阶段：他拍了一下桌子，站起来，椅子长在背上，那些裂口全是嘴
          enemy.phase = 2;
          enemy.phaseFlashTimer = 1.2;
          enemy.radius = 58; // 体型飙升：全游戏最大的怪
          enemy.speed = 30;
          this.praisePaperZones = [];
          this.praisePaperDropTimer = 0;
          this.screenShake = Math.max(this.screenShake, 0.4);
          this.feedback.vibrate([60, 40, 90]);
          this.burst('ring', enemy.x, enemy.y, 140, '#c9a24a');
          this.burst('ring', enemy.x, enemy.y, 220, '#c9a24a');
          // 拍桌结算后立刻进入岗位分配，避免高伤构筑在这条跨章因果出现前秒掉 Boss。
          enemy.mechTimer = 4.2;
          this.praiseMoveIndex = 4;
          enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
          enemy.windupTimer = 0.8;
          enemy.attackKind = 'slam';
          this.playBossAnimation(enemy, 'praise-p2-slam', 1.05);
          this.caption = '他站起来了。椅背上那些裂口，全都张开了。';
          this.captionTime = 3.6;
          this.say('离职！');
          this.feedback.play('boss', 1.15);
        } else if (!chairP2 && (enemy.mechTimer ?? 0) >= Math.max(2.6, 5.2 - this.praiseSpawnCount * 0.22)) {
          // 一阶段：他一次都不出手。只是夸你（加成是真的），然后再给你一件活。
          enemy.mechTimer = 0;
          this.praiseSpawnCount += 1;
          const praiseKind = this.praiseSpawnCount % 3;
          this.playBossAnimation(
            enemy,
            this.praiseSpawnCount % 2 === 0 ? 'praise-p1-delegate' : 'praise-p1-praise',
            0.9,
          );
          if (praiseKind === 0) { this.praiseDamage = Math.min(0.96, this.praiseDamage + 0.08); this.burst('word', this.heroX, this.heroY - 60, 30, '#c9a24a', '「这个只有你能做」伤害+8%'); }
          else if (praiseKind === 1) { this.praiseFire = Math.min(0.96, this.praiseFire + 0.08); this.burst('word', this.heroX, this.heroY - 60, 30, '#c9a24a', '「我看好你」攻速+8%'); }
          else { this.praiseMove = Math.min(0.6, this.praiseMove + 0.05); this.burst('word', this.heroX, this.heroY - 60, 30, '#c9a24a', '「辛苦一下」移速+5%'); }
          this.feedback.play('coin', 0.5);
          const taskAlive = this.enemies.filter((unit) => !unit.dead && unit.type.startsWith('task-')).length;
          const batchSize = 1 + Math.floor(this.praiseSpawnCount / 4);
          this.spawnPraiseTasks(enemy, Math.min(batchSize, Math.max(0, 10 - taskAlive)));
          if (this.praiseSpawnCount % 4 === 0 && !this.praiseConsult) this.beginPraiseConsult(enemy, batchSize);
        } else if (chairP2 && (enemy.windupTimer ?? 0) <= 0 && (enemy.mechTimer ?? 0) >= 4.2) {
          // 二阶段轮换：拍桌子 → 下班前给我 → 优化 → 离职！ → 岗位只有一个！
          enemy.mechTimer = 0;
          const chairMove = this.praiseMoveIndex % 5;
          this.praiseMoveIndex += 1;
          const tasks = this.enemies.filter((unit) => !unit.dead && unit.type.startsWith('task-'));
          if (chairMove === 0) {
            enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
            enemy.windupTimer = 0.8;
            enemy.attackKind = 'slam';
            this.playBossAnimation(enemy, 'praise-p2-slam', 1.05);
            this.feedback.play('boss', 1);
          } else if (chairMove === 1) {
            enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
            enemy.windupTimer = 0.7;
            enemy.attackKind = 'paper';
            this.playBossAnimation(enemy, 'praise-p2-paper', 0.95);
          } else if (chairMove === 2 && tasks.length > 0) {
            // 《优化》：指向一只活吃掉，自己回血——你得抢在他之前打掉那只
            const eaten = tasks[0]!;
            this.playBossAnimation(enemy, 'praise-p2-optimize', 0.9);
            eaten.dead = true;
            const healed = Math.min(enemy.maxHp - enemy.hp, enemy.maxHp * 0.07);
            enemy.hp += healed;
            this.burst('ring', eaten.x, eaten.y, 60, '#c9a24a');
            this.burst('word', enemy.x, enemy.y - enemy.radius - 12, 30, '#c9a24a', `优化 +${Math.ceil(healed)}`);
          } else if (chairMove === 3 && tasks.length > 0) {
            // 《离职！》：积压的活全部同时爆炸，威力＝剩余小怪数
            let hits = 0;
            this.playBossAnimation(enemy, 'praise-p2-dismiss', 1.05);
            for (const task of tasks) {
              task.dead = true;
              this.burst('ring', task.x, task.y, 84, '#c66c5a');
              if (Math.hypot(task.x - this.heroX, task.y - this.heroY) < 96) hits += 1;
            }
            this.screenShake = Math.max(this.screenShake, 0.24);
            this.feedback.vibrate([40, 60, 40]);
            if (hits > 0) this.hurtHero(Math.min(18, 3 + hits * 3 + tasks.length), enemy.name);
            this.burst('word', enemy.x, enemy.y - enemy.radius - 12, 34, '#c66c5a', '离职！');
            this.say('你没做完的活，一起炸了');
          } else if (chairMove === 4 && !this.praiseOneSeatUsed) {
            this.resolveOneSeat(enemy, tasks);
          } else {
            // 没有可用的活：补一件
            this.enemies.push(this.createSeekingEnemy('task-simple', enemy.x, enemy.y + 40));
          }
        }
        // 一阶段不让你靠近：你走近，他连人带桌往后挪
        if (!chairP2 && dist < 175) {
          const safeDist = Math.max(1, dist);
          const paperX = enemy.x;
          const paperY = enemy.y + enemy.radius * 0.45;
          enemy.x -= (dx / safeDist) * 46 * dt;
          enemy.y -= (dy / safeDist) * 46 * dt;
          if (this.praisePaperDropTimer <= 0) {
            this.dropPraisePaperZone(paperX, paperY);
            this.praisePaperDropTimer = 0.65;
            this.playBossAnimation(enemy, 'praise-p1-retreat', 0.55);
          }
        }
      }

      // —— 成年大 Boss《响个不停》——
      if (enemy.type === 'ringing-phone') {
        const phoneP2 = (enemy.phase ?? 1) === 2;
        if (!phoneP2 && enemy.hp <= enemy.maxHp * 0.5 && this.phoneStoryIndex >= 6) {
          enemy.phase = 2;
          enemy.phaseFlashTimer = 1.1;
          enemy.speed = 34;
          this.phoneRinging = false;
          this.phoneCalls = [];
          this.phoneAnswerTarget = -1;
          enemy.mechTimer = 0;
          this.caption = '所有没接的，这一刻一起打了回来。';
          this.captionTime = 3.4;
          this.say('全部一起响');
          this.feedback.vibrate([120, 80, 120, 80, 120]);
        }
        if (!this.phoneRinging) {
          const ringEvery = Math.max(phoneP2 ? 3 : 4, (phoneP2 ? 6 : 8) - this.phoneStrengthTier());
          if ((enemy.mechTimer ?? 0) >= ringEvery) {
            enemy.mechTimer = 0;
            this.beginPhoneRing(enemy, phoneP2);
          }
        } else {
          const nearestCall = phoneP2 && this.phoneCalls.length > 0 ? this.nearestPhoneCallIndex() : 0;
          const targetIndex = this.phoneAnswerTarget >= 0 ? this.phoneAnswerTarget : nearestCall;
          const target = phoneP2 ? this.phoneCalls[targetIndex] : { x: enemy.x, y: enemy.y };
          const phoneDistance = target ? Math.hypot(this.heroX - target.x, this.heroY - target.y) : dist;
          // 来电窗口只限制是否赶到；开始接听后暂停倒计时，完整保留 3 秒输出窗口。
          const ringWindowAdvancing = this.phoneAnswer <= 0;
          if (ringWindowAdvancing) this.phoneRingWindow -= dt;
          // 铃声节奏：越接近超时，光和震动越急
          if (ringWindowAdvancing
            && Math.floor(this.phoneRingWindow * 2) !== Math.floor((this.phoneRingWindow + dt) * 2)) {
            const ringPoints = phoneP2 ? this.phoneCalls : [{ x: enemy.x, y: enemy.y }];
            for (const call of ringPoints) this.burst('ring', call.x, call.y, 60 + (5 - this.phoneRingWindow) * 10, '#cfe4ea');
            if (this.phoneRingWindow < 2) this.feedback.vibrate([120, 180, 120, 180, 120]);
            else if (this.phoneRingWindow < 3) this.feedback.vibrate([180, 400, 180, 400]);
          }
          if (target && phoneDistance < 74) {
            // 接听中：定身 3 秒，可攻击不可移动——他一边接电话，手上的活没停
            if (this.phoneAnswer <= 0) {
              this.phoneAnswerTarget = targetIndex;
              enemy.x = target.x;
              enemy.y = target.y;
              this.playBossAnimation(enemy, phoneP2 ? 'phone-p2-answer' : 'phone-p1-answer', 3);
            }
            this.phoneAnswer += dt;
            this.stunTimer = Math.max(this.stunTimer, 0.14);
            if (this.phoneAnswer >= 3) {
              this.finishPhoneAnswer(enemy, phoneP2, targetIndex);
            }
          } else {
            this.phoneAnswer = Math.max(0, this.phoneAnswer - dt * 2);
            if (this.phoneAnswer <= 0) this.phoneAnswerTarget = -1;
          }
          if (this.phoneRinging && this.phoneRingWindow <= 0) {
            // 没接：那件事没处理，现在它自己找过来了
            this.phoneRinging = false;
            enemy.mechTimer = 0;
            const missedCalls = phoneP2 && this.phoneCalls.length > 0 ? this.phoneCalls : [{ x: enemy.x, y: enemy.y }];
            this.resolvePhoneMisses(enemy, missedCalls, true);
            this.advancePhoneStory();
            this.phoneCalls = [];
            this.phoneAnswerTarget = -1;
          }
        }
      }

      // —— 六章小 Boss ——
      // 童年《立在墙角的衣架》·《里面有人吗》：半血前单袖窄车道，半血后双袖展开为宽车道。
      if (enemy.type === 'coat-rack' && (enemy.windupTimer ?? 0) <= 0 && (enemy.mechTimer ?? 0) >= 4.2) {
        enemy.mechTimer = 0;
        enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
        enemy.windupTimer = 0.8;
        const doubleSleeve = enemy.hp <= enemy.maxHp * 0.5;
        enemy.attackKind = doubleSleeve ? 'double-sleeve' : 'sleeve';
        this.playBossAnimation(
          enemy,
          doubleSleeve ? 'coat-double-sleeve' : 'coat-sleeve',
          1.05,
        );
        this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 25, '#9f3548', '里面有人吗');
      }
      // 成年《还没干的那双鞋》：开场即在场，你每停一次它快一档，一直到本章结束。
      if (enemy.type === 'wet-shoes') {
        if (this.heroMoving) enemy.wetShoesStopCharged = false;
        if (!enemy.wetShoesStopCharged
          && this.standStillTime >= WET_SHOES_STOP_THRESHOLD
          && (enemy.mechTimer ?? 0) >= WET_SHOES_STOP_THRESHOLD) {
          enemy.wetShoesStopCharged = true;
          enemy.mechTimer = 0;
          const speedBefore = enemy.speed;
          enemy.speed = Math.min(enemy.speed + WET_SHOES_SPEED_STEP, WET_SHOES_MAX_SPEED);
          this.playBossAnimation(enemy, 'wet-shoes-hurry', 0.8);
          this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 20, '#6e8c96', '又跟近了');
          if (speedBefore <= 18) this.playVoiceOnce('self-stand-straight');
          else if (speedBefore <= 22) this.playVoiceOnce('self-for-your-good');
        }
      }
      // 中年《谁的纸箱·清点》：先点名一件物证，8 秒内没打掉纸箱才让它本关失效。
      if (enemy.type === 'whose-box') {
        if (enemy.countedItem && (enemy.countedItemTimer ?? 0) > 0) {
          enemy.countedItemTimer = Math.max(0, (enemy.countedItemTimer ?? 0) - dt);
          if (enemy.countedItemTimer <= 0) {
            const item = enemy.countedItem;
            this.stageDisabledItems.add(item);
            if (item === 'fathers-raincoat') this.raincoatReady = false;
            if (item === 'baby-tooth') this.toothReady = false;
            enemy.countedItem = undefined;
            enemy.countedItemTimer = undefined;
            enemy.mechTimer = 0;
            this.caption = `《${getItem(item).name}》被贴上封条，本章失效。`;
            this.captionTime = 4.2;
            this.burst('word', this.heroX, this.heroY - 54, 32, '#b94b5d', '本关失效');
            this.feedback.play('hurt', 0.72);
            this.feedback.vibrate([24, 42, 24]);
          }
        } else if (!enemy.countedItem && (enemy.windupTimer ?? 0) <= 0 && (enemy.mechTimer ?? 0) >= 5.6) {
          const candidates = this.items.filter((item) => !this.stageDisabledItems.has(item));
          if (candidates.length > 0) {
            const item = candidates[Math.floor(this.random() * candidates.length)]!;
            enemy.countedItem = item;
            enemy.countedItemTimer = 0;
            enemy.mechTimer = 0;
            enemy.windupTimer = 0.7;
            enemy.attackKind = 'box-count';
            this.playBossAnimation(enemy, 'box-count', 1.05);
            this.burst('word', enemy.x, enemy.y - enemy.radius - 12, 28, '#b94b5d', '清点');
            this.feedback.play('page', 0.72);
          } else {
            enemy.mechTimer = 0;
          }
        }
      }
      // 暮年《走马灯》：不攻击，只转；影子扫到的方向按年龄顺序走出前五章小怪。
      if (enemy.type === 'revolving-lantern') {
        const tier = enemy.hp > enemy.maxHp * 0.66 ? 0 : enemy.hp > enemy.maxHp * 0.33 ? 1 : 2;
        const interval = [4, 3, 2][tier]!;
        const batch = [2, 3, 4][tier]!;
        if ((enemy.mechTimer ?? 0) >= interval) {
          enemy.mechTimer = 0;
          this.playBossAnimation(enemy, tier === 0 ? 'lantern-summon' : 'lantern-summon-fast', 1.1);
          // 影子扫过的角度：怪只从当前扫到的方向走出来
          const sweep = enemy.age * (1.1 + tier * 0.5);
          const waveIndex = enemy.lanternWaveIndex ?? 0;
          const ageIndex = waveIndex % LANTERN_PREVIOUS_LIFE_ROSTER.length;
          const ageBand = LANTERN_PREVIOUS_LIFE_ROSTER[ageIndex]!;
          enemy.lanternWaveIndex = waveIndex + 1;
          this.burst('word', enemy.x, enemy.y - enemy.radius - 14, 26, '#e2b76a', LIFE_AGES[ageIndex]!);
          // 雪球是设计：不设软上限，只留性能兜底
          for (let i = 0; i < batch && this.enemies.length < LANTERN_HORDE_CAP; i += 1) {
            const type = ageBand[i % ageBand.length]!;
            const a = sweep + (i - batch / 2) * 0.22;
            const spawned = this.createSeekingEnemy(type, enemy.x + Math.cos(a) * 46, enemy.y + Math.sin(a) * 46);
            spawned.lanternSummon = true;
            this.enemies.push(spawned);
          }
        }
      }
      if (enemy.type === 'iv-stand' && enemy.mechTimer >= 5.8) {
        enemy.mechTimer = 0;
        const healed = Math.min(enemy.maxHp - enemy.hp, enemy.maxHp * 0.08);
        if (healed > 0) {
          enemy.hp += healed;
          this.burst('ring', enemy.x, enemy.y, 54, '#779887');
          this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 22, '#d8d0c1', `续滴 +${Math.ceil(healed)}`);
        }
      }

      if (enemy.backstabber && (enemy.windupTimer ?? 0) <= 0 && (enemy.mechTimer ?? 0) >= 3.2) {
        enemy.mechTimer = 0;
        const facingAngle = this.heroFacing === 'right'
          ? 0
          : this.heroFacing === 'left'
            ? Math.PI
            : this.heroFacing === 'front'
              ? Math.PI / 2
              : -Math.PI / 2;
        const backstabAngles = [
          facingAngle + Math.PI,
          facingAngle + Math.PI * 0.75,
          facingAngle - Math.PI * 0.75,
          facingAngle + Math.PI / 2,
          facingAngle - Math.PI / 2,
        ];
        const backstabPosition = backstabAngles
          .map((angle) => ({ x: this.heroX + Math.cos(angle) * 82, y: this.heroY + Math.sin(angle) * 82 }))
          .find((point) => point.x >= 24 && point.x <= W - 24 && point.y >= 112 && point.y <= H - 76)
          ?? {
            x: this.clamp(this.heroX - Math.cos(facingAngle) * 82, 24, W - 24),
            y: this.clamp(this.heroY - Math.sin(facingAngle) * 82, 112, H - 76),
          };
        enemy.x = backstabPosition.x;
        enemy.y = backstabPosition.y;
        enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
        enemy.windupTimer = 0.62;
        enemy.attackKind = 'backstab';
        this.burst('word', enemy.x, enemy.y - enemy.radius - 12, 26, '#a54858', '背刺');
      }

      // —— Boss 机制 ——
      if (enemy.type === 'closet-dark' && enemy.hp <= enemy.maxHp * 0.5 && (enemy.phase ?? 0) !== 2) {
        enemy.phase = 2;
        enemy.phaseFlashTimer = 1.1;
        this.playBossAnimation(enemy, 'closet-split', 1.1);
        for (let splitIndex = 0; splitIndex < 2; splitIndex += 1) {
          const splitAngle = this.random() * Math.PI * 2;
          const child = this.createSeekingEnemy('fear', enemy.x + Math.cos(splitAngle) * 40, enemy.y + Math.sin(splitAngle) * 40);
          child.hp = 20; child.maxHp = 20;
          this.enemies.push(child);
        }
        this.burst('ring', enemy.x, enemy.y, 90, '#5a5065');
        this.say('黑分裂了 · 它不止一个');
      }
      // Boss 机制的伤害修正：父亲盔甲减伤上限 / 末班车常态抗性与疲惫易伤 / 嘲讽易伤
      // 《统一答案》（少年小 Boss）：三招全部是位置考验，一只怪都不召。
      // 原来"每 8s 召 3 只红叉"已撤销——8 个 Boss 里 5 个在召唤，重复；
      // 红叉仍是本章普通小怪，只是 Boss 不再手动生。
      if (enemy.type === 'uniform-answer' && (enemy.windupTimer ?? 0) <= 0 && (enemy.mechTimer ?? 0) >= 6.5) {
        enemy.mechTimer = 0;
        enemy.windupTimer = 1.1; // 出题时站定，让玩家看清楚是哪一招
        const move = (enemy.phase ?? 0) % 3;
        enemy.phase = ((enemy.phase ?? 0) + 1) % 3;
        this.playBossAnimation(
          enemy,
          move === 0 ? 'uniform-standard' : move === 1 ? 'uniform-process' : 'uniform-pass',
          1.3,
        );
        this.feedback.play('boss', 0.8);
        if (move === 0) {
          // 《标准答案》：横刷三条判分线，只有一条颜色略浅是"对"的。
          // 永远不选中间那条——主角施法瞬间就站在中间，站着不动就算"对"太便宜了。
          const correct = this.random() < 0.5 ? 0 : 2;
          for (let row = 0; row < 3; row += 1) {
            this.dangerBands.push(createDangerBand({
              y: this.heroY - 78 + row * 78,
              height: 44,
              centerX: this.heroX,
              warn: 1,
              active: 0.7,
              damage: 7,
              safe: row === correct,
              color: row === correct ? '#e2dcc9' : '#c46672',
            }));
          }
          this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 30, '#c46672', '标准答案');
          this.say('这题只有一个答案。');
        } else if (move === 1) {
          // 《过程没写》：沿着你最近三秒走过的路重放一遍伤害
          const trail = this.heroTrail.slice(-24).filter((_, index) => index % 2 === 0);
          // 伤害沿着你走过的路按顺序重放——最早的脚印最先炸，一路追到你现在站的地方。
          trail.forEach((point, index) => {
            this.dangerBands.push(createDangerBand({
              y: point.y,
              height: 18,
              centerX: point.x,
              halfWidth: 9,
              warn: 0.9 + index * 0.1,
              active: 0.45,
              damage: 4,
              color: '#b3566a',
              visual: 'stamp',
            }));
          });
          this.say('过程没写。只能给结果分。');
          this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 30, '#b3566a', '过程没写');
          this.playVoiceOnce('teacher-answer-format');
        } else {
          // 《卷子往后传》：一整排推过来，排里留一个缺口
          const gap = Math.round((this.random() - 0.5) * 220);
          for (const side of [-1, 1]) {
            this.dangerBands.push(createDangerBand({
              y: this.heroY - 150,
              height: 34,
              centerX: this.heroX + gap + side * 250,
              halfWidth: 210,
              warn: 0.9,
              active: 2.6,
              damage: 6,
              vy: 118,
              color: '#c46672',
            }));
          }
          this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 30, '#c46672', '卷子往后传');
          this.playVoiceOnce('teacher-paper-back');
        }
      }
      if (enemy.type === 'silent-father' && enemy.hp <= enemy.maxHp * 0.5 && (enemy.phase ?? 1) !== 2) {
        // 《雨衣倒下去》：不用爆炸、金环、红光——肩膀先塌，雨衣落地，画面中央不再有成年人。
        enemy.phase = 2;
        enemy.phaseFlashTimer = 1.2;
        enemy.windupTimer = 1.05; // 塌落瞬间打断旧招，并按设计书停住普通更新约一秒
        enemy.attackKind = undefined;
        enemy.mechTimer = 0;
        enemy.radius = 18;      // 体量骤降：巨人缩回一个哭不上气的男孩
        this.fallenCoatX = enemy.x;
        this.fallenCoatY = enemy.y;
        this.fatherBraceTimer = 0;
        this.fatherCycleIndex = 0;
        this.fatherSecondPhaseLineShown = false;
        this.caption = '雨衣倒下去，里面有人哭得喘不上气。';
        this.captionTime = 3.6;
      }
      // 章节 Boss 与小 Boss 共用前摇派发；精英衣架也需要在归零时真正结算招式。
      if ((enemy.boss || enemy.elite || enemy.backstabber) && (enemy.windupTimer ?? 0) > 0) {
        enemy.windupTimer = (enemy.windupTimer ?? 0) - dt;
        if ((enemy.windupTimer ?? 0) <= 0) {
          enemy.windupTimer = 0;
          this.resolveBossStrike(enemy);
        }
      }
      // 沉默的父亲：一阶段是记忆里的大人（进去/站好），二阶段是雨衣里哭不上气的男孩。
      if (enemy.type === 'silent-father' && (enemy.windupTimer ?? 0) <= 0 && this.fatherBraceTimer <= 0) {
        const fatherP2 = (enemy.phase ?? 1) === 2;
        if (fatherP2 && !this.fatherSecondPhaseLineShown && this.captionTime <= 0 && !this.voiceCaption) {
          this.fatherSecondPhaseLineShown = true;
          this.caption = '他说没有哭，手背却一直在擦脸。';
          this.captionTime = 3.4;
          enemy.mechTimer = 2.2; // 1.2 秒后开始第一招，让短句先落下来但不拖慢整场
        }
        if (!fatherP2 && (enemy.mechTimer ?? 0) >= 4.4) {
          enemy.mechTimer = 0;
          const move = this.fatherCycleIndex % 2;
          this.fatherCycleIndex += 1;
          enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
          enemy.windupTimer = move === 0 ? 0.6 : 0.95;
          enemy.attackKind = move === 0 ? 'stomp' : 'stand';
          this.playBossAnimation(enemy, move === 0 ? 'father-stomp' : 'father-stand', enemy.windupTimer + 0.2);
          this.feedback.play('boss', 1.05);
          this.showFatherAttackNameOnce(move === 0 ? '进去。' : '站好。');
        } else if (fatherP2 && this.fatherSecondPhaseLineShown && (enemy.mechTimer ?? 0) >= 3.4) {
          enemy.mechTimer = 0;
          // 每次发脾气前，装作不经意把雨衣往你这边踢一点（不配字幕）
          if (this.fallenCoatX !== undefined && this.fallenCoatY !== undefined) {
            const coatDist = Math.hypot(this.heroX - this.fallenCoatX, this.heroY - this.fallenCoatY) || 1;
            this.fallenCoatX += ((this.heroX - this.fallenCoatX) / coatDist) * 9;
            this.fallenCoatY += ((this.heroY - this.fallenCoatY) / coatDist) * 9;
          }
          const move = this.fatherCycleIndex % 3;
          this.fatherCycleIndex += 1;
          if (move === 0) {
            // 《不许看》：捂脸两段冲撞——撞到落下的雨衣会提前停并摔坐
            enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
            enemy.windupTimer = 0.45;
            enemy.attackKind = 'charge';
            this.playBossAnimation(enemy, 'father-charge', 0.65);
            this.showFatherAttackNameOnce('不许看');
          } else if (move === 1) {
            // 《都怪你》：原地跺脚，三圈由小到大的地面雨圈；雨衣处缺一个口
            enemy.windupTimer = 1.9; // 跺脚期间站定
            this.playBossAnimation(enemy, 'father-tantrum', 1.9);
            for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
              this.tantrumRings.push({
                x: enemy.x, y: enemy.y,
                radius: 62 + ringIndex * 52,
                at: this.battleTime + 0.55 * (ringIndex + 1),
                damage: 3 + ringIndex,
              });
            }
            this.showFatherAttackNameOnce('都怪你');
          } else {
            // 《我没有哭》：擦着脸乱挥，眼泪甩成一排短弹道；收招后蹲下喘气＝输出窗口
            const baseAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
            for (let tearIndex = 0; tearIndex < 7; tearIndex += 1) {
              const spread = baseAngle + (tearIndex - 3) * 0.16;
              this.tearDrops.push({
                x: enemy.x, y: enemy.y - 6,
                vx: Math.cos(spread) * 150, vy: Math.sin(spread) * 150,
                life: 1.7,
              });
            }
            enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, 1.3);
            this.playBossAnimation(enemy, 'father-tears', 1.3);
            this.showFatherAttackNameOnce('我没有哭');
          }
        }
      }
      // 没人相信的怪物《影子压来》：影子先沿你方向拉长，再整片压过来，本体几乎不动
      if (enemy.type === 'closet-dark' && (enemy.windupTimer ?? 0) <= 0 && (enemy.mechTimer ?? 0) >= 3.8) {
        enemy.mechTimer = 0;
        enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
        enemy.windupTimer = 0.85;
        enemy.attackKind = 'shadow';
        this.playBossAnimation(enemy, 'closet-shadow', 1.05);
        this.feedback.play('boss', 0.85);
        this.say('别看。');
      }
      if (enemy.type === 'debt-collector' && enemy.mechTimer >= 7 && (enemy.windupTimer ?? 0) <= 0) {
        enemy.mechTimer = 0;
        const collectorMove = (enemy.phase ?? 0) % 2;
        enemy.phase = collectorMove + 1;
        if (collectorMove === 0) {
          if (this.billTimer <= 0) {
            this.billTimer = 3.5;
            this.playBossAnimation(enemy, 'collector-bill', 1.05);
            this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 34, '#d5885f', '账单寄到了');
            this.say('3.5秒内结清 · 2零钱或8生命');
          }
        } else {
          enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
          enemy.windupTimer = 0.85;
          enemy.attackKind = 'collector-drag';
          this.playBossAnimation(enemy, 'collector-drag', 1.1);
          this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 30, '#b97858', '上门');
        }
      }
      if (enemy.type === 'lamp-keeper' && this.lampChoice && !this.lampReleaseReady) {
        this.updateLampChoice(enemy, dt);
      }
      if (enemy.type === 'lamp-keeper' && !this.lampChoice && !this.lampReleaseReady
        && enemy.mechTimer >= LAMP_CYCLE_INTERVAL - 1.8
        && enemy.mechTimer < LAMP_CYCLE_INTERVAL - 1.8 + dt) {
        this.playBossAnimation(enemy, 'keeper-name', 1.8);
      }
      if (enemy.type === 'lamp-keeper' && !this.lampChoice && !this.lampReleaseReady
        && enemy.mechTimer >= LAMP_CYCLE_INTERVAL) {
        enemy.mechTimer = 0;
        this.beginLampChoice(enemy);
      }
      if (enemy.type === 'last-bus') {
        const phase = enemy.phase ?? 0;
        if (phase === 0 && enemy.mechTimer >= 3) {
          enemy.phase = 1; enemy.mechTimer = 0; enemy.flash = 0.8;
          enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
          enemy.windupTimer = 0.8;
          enemy.attackKind = 'last-bus-dash';
          this.playBossAnimation(enemy, 'bus-depart', 1.25);
          this.say('列车进站。请退到黄色安全线以内。');
          this.playVoiceOnce('station-yellow-line');
        }
        else if (phase === 2 && enemy.mechTimer >= BUS_DASH_DURATION) {
          enemy.phase = 3;
          enemy.mechTimer = 0;
          continue; // 不再拿旧 phase 多冲一帧；预警终点就是实际行程终点。
        }
        else if (phase === 3 && enemy.mechTimer >= 2.5) { enemy.phase = 0; enemy.mechTimer = 0; }
        if (phase === 1) { continue; }
        if (phase === 2) {
          const dashAngle = enemy.angle ?? 0;
          enemy.x += Math.cos(dashAngle) * BUS_DASH_SPEED * dt;
          enemy.y += Math.sin(dashAngle) * BUS_DASH_SPEED * dt;
          // 末班车贴图是 128px 的横向车身（last-bus-hd），用半径 28 的圆判定会留下
          // 二十多像素的死区——玩家看见车从身上开过去却毫发无伤。改成沿行进轴的胶囊，
          // 覆盖真实车身；且冲撞是接触即判定、一次冲刺只打一次，不再要求"持续接触"。
          const alongAxis = (this.heroX - enemy.x) * Math.cos(dashAngle) + (this.heroY - enemy.y) * Math.sin(dashAngle);
          const clampedAlong = this.clamp(alongAxis, -BUS_BODY_HALF_LENGTH, BUS_BODY_HALF_LENGTH);
          const nearestX = enemy.x + Math.cos(dashAngle) * clampedAlong;
          const nearestY = enemy.y + Math.sin(dashAngle) * clampedAlong;
          const bodyDistance = Math.hypot(this.heroX - nearestX, this.heroY - nearestY);
          if (bodyDistance < BUS_BODY_HALF_WIDTH && !enemy.dashHit) {
            enemy.dashHit = true;
            this.hurtHero(enemy.damage, enemy.name);
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
      if ((enemy.wetTimer ?? 0) > 0) moveMult *= 0.95;
      const heavyStacks = (enemy.heavyTimer ?? 0) > 0 ? Math.min(3, enemy.heavyStacks ?? 1) : 0;
      const heavyPace = Math.max(0.58, 1 - heavyStacks * 0.12);
      moveMult *= heavyPace;
      const hardControlled = (enemy.freezeTimer ?? 0) > 0 || (enemy.paralyzeTimer ?? 0) > 0;
      if (hardControlled) moveMult = 0;
      if ((enemy.dashTimer ?? 0) > 0) {
        const stageEliteDash = enemy.type === 'coat-rack';
        moveMult *= enemy.type === 'hunger-shadow' ? 3 : stageEliteDash ? 2.15 : 1.35;
      }
      if (enemy.type === 'silent-father' && (enemy.phase ?? 1) === 2) moveMult *= 1.5;
      if (enemy.type === 'silent-father' && this.fatherBraceTimer > 0) moveMult = 0; // 《外面冷》：转身迎雨，不追
      if ((enemy.windupTimer ?? 0) > 0) moveMult = 0; // 招式前摇：站定，脚下生根
      if (enemy.type === 'last-bus') moveMult *= (enemy.phase ?? 0) === 3 ? 0.3 : 0.6;
      if (enemy.type === 'ringing-phone' && this.phoneRinging) moveMult = 0; // 来电位置锁定，等你走过去
      if (enemy.type === 'lamp-keeper' && this.lampChoice) moveMult = 0; // 《点名》期间站定，不能遮住二选一
      if (enemy.type === 'task-sync') moveMult *= 0.55;
      if (dist > reach) {
        enemy.x += (dx / dist) * enemy.speed * moveMult * dt;
        enemy.y += (dy / dist) * enemy.speed * moveMult * dt;
      } else {
        if (hardControlled) continue;
        enemy.attackCooldown -= dt * heavyPace;
        if (enemy.attackCooldown <= 0 && this.hurtHero(enemy.damage, enemy.name)) {
          enemy.attackCooldown = enemy.boss ? 2.2 : enemy.elite ? 1.9 : 1.35;
          enemy.x -= (dx / dist) * 28;
          enemy.y -= (dy / dist) * 28;
          this.burst('ring', this.heroX, this.heroY - 20, 40, '#bd5360');
          if (enemy.type === 'badge-thief' && !this.voiceCuesSeen.has('office-badge-denied')) {
            this.playVoiceOnce('office-badge-denied');
            this.scheduleVoice('office-meeting-continues', 1.2);
          }
          if ((enemy.type === 'badge-thief' || enemy.type === 'whose-box') && this.hero.coins > 0) {
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
      'silent-father': { name: '沉默的父亲', hp: 300, speed: 24, radius: 34, damage: 9, boss: true },
      'cry-moth': { name: '哭蛾', hp: 8, speed: 48, radius: 10, damage: 2 },
      'hunger-shadow': { name: '空奶瓶', hp: 10, speed: 34, radius: 12, damage: 3 },
      'missed-bus': { name: '错过的车', hp: 60, speed: 150, radius: 16, damage: 9 },
      'missed-call': { name: '未接来电', hp: 30, speed: 30, radius: 14, damage: 1 },
      silence: { name: '没人说话', hp: 34, speed: 22, radius: 16, damage: 3 },
      'badge-thief': { name: '打包的纸箱', hp: 30, speed: 40, radius: 14, damage: 4 },
      forgetter: { name: '忘记名字的人', hp: 90, speed: 12, radius: 18, damage: 8 },
      'empty-chair': { name: '空椅子', hp: 70, speed: 0, radius: 14, damage: 0 },
      'closet-dark': { name: '没人相信的怪物', hp: 150, speed: 30, radius: 26, damage: 6, boss: true },
      'uniform-answer': { name: '统一答案', hp: 200, speed: 22, radius: 26, damage: 6, elite: true },
      'last-bus': { name: '末班车', hp: 260, speed: 26, radius: 28, damage: 10, elite: true },
      'debt-collector': { name: '上门催收', hp: 340, speed: 24, radius: 26, damage: 8, boss: true },
      'lamp-keeper': { name: '收灯人', hp: 430, speed: 20, radius: 40, damage: 12, boss: true },
      // —— 小 Boss（精英通道）——
      'coat-rack': { name: '立在墙角的衣架', hp: 58, speed: 30, radius: 26, damage: 4, elite: true },
      'whose-box': { name: '谁的纸箱', hp: 142, speed: 24, radius: 24, damage: 8, elite: true },
      'wet-shoes': { name: '还没干的那双鞋', hp: 150, speed: 18, radius: 22, damage: 7, elite: true },
      'revolving-lantern': { name: '走马灯', hp: 210, speed: 0, radius: 34, damage: 0, elite: true },
      // —— 大 Boss ——
      'praise-chair': { name: '你很优秀', hp: 320, speed: 14, radius: 30, damage: 7, boss: true },
      'ringing-phone': { name: '响个不停', hp: 380, speed: 22, radius: 30, damage: 8, boss: true },
      // —— 少年小怪 ——
      'others-paper': { name: '别人的那张', hp: 20, speed: 0, radius: 16, damage: 0 },
      'sign-here': { name: '要签字的那一栏', hp: 24, speed: 46, radius: 12, damage: 3 },
      // —— 青年小怪 ——
      'id-scanner': { name: '识别中', hp: 40, speed: 26, radius: 20, damage: 5 },
      'task-simple': { name: '这个很简单', hp: 8, speed: 52, radius: 11, damage: 3 },
      'task-revise': { name: '再改一版', hp: 26, speed: 38, radius: 13, damage: 4 },
      'task-deadline': { name: '辛苦下周一前', hp: 30, speed: 34, radius: 13, damage: 4 },
      'task-sync': { name: '对齐一下', hp: 34, speed: 22, radius: 14, damage: 0 },
      // —— 成年小怪 ——
      'desk-lamp': { name: '没关的台灯', hp: 46, speed: 0, radius: 19, damage: 0 },
      'reheated-pot': { name: '热过两遍的那锅', hp: 52, speed: 0, radius: 20, damage: 0 },
      // —— 中年小怪 ——
      'meeting-door': { name: '会议室的门', hp: 60, speed: 0, radius: 26, damage: 0 },
      'checkup-report': { name: '去年的体检报告', hp: 38, speed: 40, radius: 14, damage: 0 },
      // —— 暮年小怪 ——
      'queue-screen': { name: '叫号屏', hp: 44, speed: 16, radius: 19, damage: 4 },
      'others-family': { name: '别人的家属', hp: 50, speed: 30, radius: 18, damage: 0 },
      'iv-stand': { name: '输液架', hp: 90, speed: 14, radius: 16, damage: 6 },
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
    if (enemy.type === 'lamp-keeper') {
      enemy.flash = 0.08;
      if (!this.lampGuardHintShown) {
        this.lampGuardHintShown = true;
        this.say('他没有接这一口气，只看着你身上的东西。');
        this.burst('ring', enemy.x, enemy.y, enemy.radius * 2.1, '#b9ad91');
      }
      return;
    }
    if ((enemy.marked ?? 0) > 0) amount *= 1.12;
    if ((enemy.rawTimer ?? 0) > 0) amount *= 1 + Math.min(3, enemy.rawStacks ?? 1) * 0.06;
    // 一阶段盔甲减伤上限：雨越大，壳越硬（生活把他压成"男人"）
    if (enemy.type === 'silent-father' && (enemy.phase ?? 1) < 2) {
      amount = Math.min(amount, this.rainIntensity > 0.8 ? 3 : 4);
    }
    if (enemy.type === 'last-bus') amount *= (enemy.phase ?? 0) === 3 ? 1.7 : 0.75;
    // 走马灯：站进影子正在扫出怪的那一侧，打灯伤害翻倍——想快点结束，就得站在出怪的方向上
    if (enemy.type === 'revolving-lantern') {
      const tier = enemy.hp > enemy.maxHp * 0.66 ? 0 : enemy.hp > enemy.maxHp * 0.33 ? 1 : 2;
      const sweep = enemy.age * (1.1 + tier * 0.5);
      const heroAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
      let diff = Math.abs(heroAngle - sweep) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.55) {
        amount *= 2;
        if (this.random() < 0.2) this.burst('word', this.heroX, this.heroY - 52, 22, '#e2b76a', '影子里 ×2');
      }
    }
    // 响个不停：真正接听时才可受伤。铃响但没走近，仍然只是一次来电。
    if (enemy.type === 'ringing-phone'
      && ((!this.phoneRinging || this.phoneAnswer <= 0) && this.phonePostAnswerTimer <= 0)) {
      enemy.flash = 0.06;
      if (this.random() < 0.1) this.burst('word', enemy.x, enemy.y - enemy.radius - 12, 22, '#43525a', '现在没空');
      return;
    }
    if (enemy.type === 'ringing-phone') {
      const storyFloor = (enemy.phase ?? 1) < 2 && this.phoneStoryIndex < 6
        ? enemy.maxHp * 0.5
        : (enemy.phase ?? 1) === 2 && this.phoneStoryIndex < 7
          ? 1
          : 0;
      if (storyFloor > 0 && enemy.hp - amount < storyFloor) amount = Math.max(0, enemy.hp - storyFloor);
    }
    if (enemy.type === 'praise-chair') {
      if ((enemy.phase ?? 1) < 2 && enemy.hp - amount <= enemy.maxHp * 0.5) {
        amount = Math.max(0, enemy.hp - enemy.maxHp * 0.5);
      } else if ((enemy.phase ?? 1) === 2 && !this.praiseOneSeatUsed && enemy.hp - amount <= 0) {
        amount = Math.max(0, enemy.hp - 1);
      }
    }
    if ((enemy.tauntVulnerableTimer ?? 0) > 0) amount *= 1.2;
    let shouldRelocateCollector = false;
    enemy.hp -= amount;
    enemy.flash = 0.12;
    if (enemy.type === 'debt-collector' && enemy.hp > 0) {
      enemy.relocateDamage = (enemy.relocateDamage ?? 0) + amount;
      if (enemy.relocateDamage >= enemy.maxHp * 0.14) {
        enemy.relocateDamage = 0;
        enemy.mechTimer = 0;
        shouldRelocateCollector = true;
      }
    }
    this.stats.damage += amount;
    this.burst('hit', enemy.x, enemy.y, 18 + Math.min(24, amount), color, undefined, material);
    this.feedback.play('hit', enemy.boss ? 1.2 : enemy.elite ? 1 : 0.7);
    if (shouldRelocateCollector) this.relocateDebtCollector(enemy);
    if (enemy.hp > 0) {
      if (enemy.boss) this.bossVoice(enemy);
      return;
    }
    if (enemy.type === 'whose-box' && enemy.countedItem && !this.stageDisabledItems.has(enemy.countedItem)) {
      this.boxSavedItem = enemy.countedItem;
      enemy.countedItem = undefined;
      enemy.countedItemTimer = undefined;
      this.burst('word', this.heroX, this.heroY - 54, 32, '#d7bd73', '保住了');
      this.feedback.play('page', 0.82);
    }
    // 《再改一版》：打死后原地复活一次，第二次才真死
    if (enemy.type === 'task-revise' && (enemy.phase ?? 0) === 0) {
      enemy.phase = 1;
      enemy.hp = enemy.maxHp * 0.6;
      enemy.flash = 0.4;
      this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 24, '#a2849c', '再改一版');
      return;
    }
    enemy.dead = true;
    if (enemy.type === 'uniform-answer' && this.schoolEliteDefeatedAt <= 0) this.schoolEliteDefeatedAt = this.battleTime;
    // 《这个很简单》：说好很简单的活，死的时候分裂成两件（只分裂一代）
    if (enemy.type === 'task-simple' && (enemy.phase ?? 0) === 0 && this.enemies.length < LANTERN_HORDE_CAP) {
      for (const side of [-1, 1]) {
        const child = this.createSeekingEnemy('task-simple', enemy.x + side * 20, enemy.y - 8);
        child.phase = 1;
        child.hp = 6; child.maxHp = 6;
        child.lanternSummon = enemy.lanternSummon;
        this.enemies.push(child);
      }
      this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 24, '#7f96a8', '又变成两件');
    }
    // 走马灯灭了：它召出来的怪全部同时消失——影子没了。不掉道具，直接接收灯人。
    if (enemy.type === 'revolving-lantern') {
      let faded = 0;
      for (const unit of this.enemies) {
        if (!unit.dead && unit.lanternSummon) { unit.dead = true; faded += 1; }
      }
      this.burst('ring', enemy.x, enemy.y, 200, '#e2b76a');
      this.caption = faded > 0 ? '灯灭了。影子里走出来的，全都不见了。' : '灯灭了。';
      this.captionTime = 3.4;
      this.say('那盏灯，往黑处飘去了');
    }
    if (this.hasCombo('我只在有用时被看见')) this.usefulTimer = 2.5;
    if (enemy.type === 'revolving-lantern') {
      this.lanternHandoff = { startX: enemy.x, startY: enemy.y, startedAt: this.battleTime };
    } else if (!enemy.xiaoZhang) {
      if (this.enemyDeaths.length >= MAX_ENEMY_DEATHS) this.enemyDeaths.shift();
      this.enemyDeaths.push({
        asset: resolveEnemyPixelAsset(enemy),
        x: enemy.x,
        y: enemy.y,
        radius: enemy.radius,
        boss: enemy.boss,
        life: 0.28,
        duration: 0.28,
        faceLeft: this.heroX < enemy.x,
      });
    } else {
      this.burst('word', enemy.x, enemy.y - 32, 28, '#8a5560', '工牌落地');
    }
    this.stats.kills += 1;
    this.voiceEnemyKills[enemy.type] = (this.voiceEnemyKills[enemy.type] ?? 0) + 1;
    const typeKills = this.voiceEnemyKills[enemy.type] ?? 0;
    if (enemy.type === 'badge-thief') {
      if (typeKills === 4) this.playVoiceOnce('coworker-cardboard-box');
    }
    const defeatVoice: Partial<Record<EnemyType, VoiceCueId>> = {
      'uniform-answer': 'father-for-your-good',
      'last-bus': 'last-bus-departed',
    };
    const voiceCue = defeatVoice[enemy.type];
    if (voiceCue) this.playVoiceOnce(voiceCue);
    // 暮年从这里开始只还不给：走马灯连金币、红包和奖励页都不产生。
    let coins = enemy.type === 'revolving-lantern' ? 0 : enemy.elite ? 4 : enemy.boss ? 6 : 0;
    if (!enemy.elite && !enemy.boss) {
      this.coinKillProgress += 1;
      if (this.coinKillProgress >= 5) {
        this.coinKillProgress -= 5;
        coins = 1;
      }
    }
    if (enemy.type !== 'revolving-lantern') coins += this.redPacketDrop(enemy);
    if (enemy.boss) this.hero.coins += coins;
    else this.spawnCoinDrop(enemy.x, enemy.y, coins);
    this.burst('ring', enemy.x, enemy.y, enemy.radius * 2.3, '#d1b36b');
    if (enemy.type === 'revolving-lantern') return;
    if (enemy.boss && enemy.type === 'ringing-phone') {
      this.phoneStoryIndex = 8;
      this.phoneActiveStoryIndex = -1;
      this.phoneTranscript = undefined;
      this.memories.push('成年：最后一通打给家里，他说“没事。不忙。”');
      this.playVoiceOnce('hero-not-busy');
    }
    if ((enemy.elite || enemy.boss) && this.state === 'battle') {
      this.resetMovementInput();
      // 第五档「这一身」：打完每章大 Boss 先固定掉落（不进三选一、不可拒绝），再开正常奖励
      if (enemy.boss && this.maybeStartStoryDrop(enemy.type)) return;
      this.openDefeatItemReward(enemy.type, Boolean(enemy.boss));
    }
  }

  private openDefeatItemReward(enemyType: EnemyType, boss: boolean): void {
    this.resetMovementInput();
    this.initialItemReward = false;
    this.rewardReturn = 'battle';
    const xiaoZhangBox = enemyType === 'whose-box' && this.helpedXiaoZhang && this.xiaoZhangBetrayed;
    const bossRewardTitles: Partial<Record<EnemyType, string>> = {
      'closet-dark': '衣柜里，只剩去年的外套。',
      'uniform-answer': '红榜还贴在空走廊里。',
      'last-bus': '站牌还亮着“下一班”。',
      'silent-father': '雨衣留下了。话还是没说。',
      'debt-collector': '账结清了。日光灯还亮着。',
    };
    const eliteRewardTitles: Partial<Record<EnemyType, string>> = {
      'uniform-answer': '红榜还贴在空走廊里。',
      'last-bus': '站牌还亮着“下一班”。',
      'whose-box': xiaoZhangBox
        ? '工牌照片里是小张。箱底压着一条没有商标的领带。'
        : '箱子打开，里面只有一只旧工牌。',
      'iv-stand': '药袋空了。护士把夹子合上。',
    };
    this.rewardTitle = boss
      ? (bossRewardTitles[enemyType] ?? '困难没有消失，只是留在了身上')
      : (eliteRewardTitles[enemyType] ?? '困难没有消失，只是留在了身上');
    if (enemyType === 'whose-box' && this.boxSavedItem) {
      this.rewardTitle = `《${getItem(this.boxSavedItem).name}》保住了。${this.rewardTitle}`;
      this.boxSavedItem = undefined;
    }
    if (xiaoZhangBox && !this.hasItem('nameless-tie')) {
      this.acquireItem('nameless-tie');
      this.memories.push('中年：在纸箱里认出了小张的工牌和领带');
      this.burst('word', this.heroX, this.heroY - 56, 36, '#b9a45f', '小张留下的领带');
    }
    const bossPool = ITEM_IDS.filter((id) => !this.items.includes(id) && !STORY_ITEM_IDS.includes(id));
    this.itemRewardChoices = boss
      ? this.shuffle([...bossPool]).slice(0, this.rewardChoiceCount())
      : this.pickItemChoices(false);
    this.itemRewardFocus = 0;
    this.state = 'itemReward';
  }

  private resolveOneSeat(chair: EnemyUnit, tasks: EnemyUnit[]): void {
    this.praiseOneSeatUsed = true;
    this.playBossAnimation(chair, 'praise-p2-one-seat', 1.05);
    const xiaoSurvives = this.helpedXiaoZhang && !this.xiaoZhangBetrayed;
    let survivor: EnemyUnit;
    if (xiaoSurvives) {
      const ally = this.xiaoZhangAlly;
      survivor = this.createSeekingEnemy(
        'task-simple',
        ally?.x ?? this.heroX - 72,
        ally?.y ?? this.heroY + 12,
        { name: '小张 · 背刺' },
      );
      survivor.xiaoZhang = true;
      this.xiaoZhangAlly = undefined;
      this.xiaoZhangBetrayed = true;
      this.memories.push('青年：小张从岗位混战里爬出来，先捅了你');
      this.caption = '你花钱帮过的人从那堆活里爬出来。他先看了一眼岗位，再看你。';
      this.captionTime = 4.8;
    } else {
      survivor = tasks.length > 0
        ? tasks.reduce((best, unit) => (unit.hp > best.hp ? unit : best))
        : this.createSeekingEnemy('task-simple', chair.x, chair.y + chair.radius + 24, { name: '无名任务 · 背刺' });
      survivor.name = '无名任务 · 背刺';
    }
    for (const task of tasks) {
      if (task === survivor) continue;
      task.dead = true;
      this.burst('hit', task.x, task.y, 22, '#8a5560');
    }
    if (!this.enemies.includes(survivor)) this.enemies.push(survivor);
    survivor.backstabber = true;
    survivor.phase = 1; // 不触发《这个很简单》的死亡分裂，幸存者只有一个
    survivor.maxHp = Math.max(64, survivor.maxHp + 46);
    survivor.hp = survivor.maxHp;
    survivor.speed = 62;
    survivor.damage = 7;
    survivor.radius = Math.max(survivor.radius + 3, survivor.xiaoZhang ? 17 : 14);
    survivor.mechTimer = 0;
    survivor.attackCooldown = 1.2;
    survivor.flash = 0.5;
    this.burst('word', survivor.x, survivor.y - survivor.radius - 12, 32, '#8a5560', '岗位只有一个！');
    this.say(xiaoSurvives ? '小张活下来了。他把背后留给岗位，把刺留给你。' : '活下来的那只，转过来了');
  }

  /** 固定掉落展示：拾取即穿戴，玩家只能「点一下，继续走」。 */
  private maybeStartStoryDrop(bossType: EnemyType): boolean {
    const dropId = STORY_DROPS[this.encounterIndex];
    if (!dropId || this.items.includes(dropId)) return false;
    this.pendingDefeatReward = bossType;
    this.storyDropId = dropId;
    this.storyDropTimer = 0;
    this.itemRewardFocus = 1;
    this.acquireItem(dropId);
    this.state = 'storyDrop';
    this.feedback.play('page', 1.1);
    this.feedback.vibrate([30, 40, 30]);
    return true;
  }

  private finishStoryDrop(): void {
    if (this.state !== 'storyDrop') return;
    const bossType = this.pendingDefeatReward;
    this.storyDropId = undefined;
    this.pendingDefeatReward = undefined;
    this.resetMovementInput();
    this.state = 'battle';
    if (bossType) this.openDefeatItemReward(bossType, true);
  }

  /** 入学通知书：每章奖励三选一变四选一。 */
  private rewardChoiceCount(): number {
    return this.hasItem('admission-notice') ? 4 : 3;
  }

  /** 四选一时行距收紧、起点上移，四张 136 高的卡正好落在 78–634。 */
  private rewardRowStride(): number {
    return this.itemRewardChoices.length >= 4 ? 139 : 152;
  }

  private rewardRowsTop(): number {
    return this.itemRewardChoices.length >= 4 ? 78 : 88;
  }

  private redPacketDrop(enemy: EnemyUnit, force = false): number {
    if (!this.hasItem('red-packet') || (!force && this.random() >= 0.15)) return 0;
    this.feedback.play('coin', 0.86);
    this.burst('word', enemy.x, enemy.y - 14, 26, '#d5885f', '+0.87');
    return 1;
  }

  private areaDamage(amount: number, color: string): void {
    for (const enemy of this.enemies) if (!enemy.dead) this.damageEnemy(enemy, amount, color);
  }

  private playBossAnimation(enemy: EnemyUnit, id: BossSkillId, duration: number, loop = bossSkillLoops(id)): void {
    enemy.bossAnim = id;
    enemy.bossAnimTimer = Math.max(0.08, duration);
    enemy.bossAnimDuration = Math.max(0.08, duration);
    enemy.bossAnimLoop = loop;
    enemy.bossAnimFrame = undefined;
  }

  private bossAnimationFrame(enemy: EnemyUnit): { id: BossSkillId; frame: number } | undefined {
    if (!isBossSkillId(enemy.bossAnim) || (enemy.bossAnimTimer ?? 0) <= 0) return undefined;
    if (enemy.bossAnimFrame !== undefined) {
      return { id: enemy.bossAnim, frame: Math.max(0, Math.min(3, Math.trunc(enemy.bossAnimFrame))) };
    }
    if (enemy.bossAnimLoop) return { id: enemy.bossAnim, frame: Math.floor(enemy.age * 8) % 4 };
    const duration = Math.max(0.08, enemy.bossAnimDuration ?? 0.08);
    const progress = 1 - this.clamp((enemy.bossAnimTimer ?? 0) / duration, 0, 1);
    return { id: enemy.bossAnim, frame: Math.min(3, Math.floor(progress * 4)) };
  }

  private updatePraisePaperZones(dt: number): void {
    this.praisePaperDropTimer = Math.max(0, this.praisePaperDropTimer - dt);
    const chair = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'praise-chair');
    if (!chair || (chair.phase ?? 1) === 2) {
      this.praisePaperZones = [];
      return;
    }
    this.praisePaperZones = this.praisePaperZones
      .map((zone) => ({ ...zone, life: zone.life - dt }))
      .filter((zone) => zone.life > 0);
    if (this.praisePaperZones.some((zone) => Math.hypot(this.heroX - zone.x, this.heroY - zone.y) < 34)) {
      this.heroSlowTimer = Math.max(this.heroSlowTimer, 0.18);
    }
  }

  private dropPraisePaperZone(x: number, y: number): void {
    const last = this.praisePaperZones[this.praisePaperZones.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) < 28) return;
    this.praisePaperZones.push({ x, y, life: 8, total: 8 });
    if (this.praisePaperZones.length > 6) this.praisePaperZones.shift();
  }

  private spawnPraiseTasks(enemy: EnemyUnit, count: number): void {
    const pool: EnemyType[] = ['task-simple', 'task-revise', 'task-deadline', 'task-sync'];
    const alive = this.enemies.filter((unit) => !unit.dead && unit.type.startsWith('task-')).length;
    for (let taskIndex = 0; taskIndex < count && alive + taskIndex < 10; taskIndex += 1) {
      const kind = pool[Math.floor(this.random() * pool.length)]!;
      const spawnAngle = this.random() * Math.PI * 2;
      this.enemies.push(this.createSeekingEnemy(
        kind,
        enemy.x + Math.cos(spawnAngle) * 52,
        enemy.y + Math.sin(spawnAngle) * 52,
      ));
    }
  }

  private beginPraiseConsult(enemy: EnemyUnit, extraTasks: number): void {
    const angle = this.random() * Math.PI * 2;
    this.praiseConsult = {
      x: this.heroX + Math.cos(angle) * 94,
      y: this.heroY + Math.sin(angle) * 94,
      timer: 5,
      total: 5,
      extraTasks,
    };
    this.playBossAnimation(enemy, 'praise-p1-consult', 1.05);
    this.say('你怎么看？');
  }

  private updatePraiseConsult(enemy: EnemyUnit, dt: number): void {
    const consult = this.praiseConsult;
    if (!consult) return;
    consult.timer = Math.max(0, consult.timer - dt);
    if (consult.timer <= 0) {
      this.praiseConsult = undefined;
      return;
    }
    if (Math.hypot(this.heroX - consult.x, this.heroY - consult.y) >= 28) return;
    this.praiseDamage = Math.min(0.96, Math.max(0.08, this.praiseDamage * 2));
    this.praiseFire = Math.min(0.96, Math.max(0.08, this.praiseFire * 2));
    this.praiseMove = Math.min(0.6, Math.max(0.05, this.praiseMove * 2));
    this.spawnPraiseTasks(enemy, consult.extraTasks);
    this.playBossAnimation(enemy, 'praise-p1-delegate', 1.05);
    this.burst('ring', consult.x, consult.y, 62, '#b84954');
    this.burst('word', consult.x, consult.y - 32, 30, '#c9a24a', '加成翻倍 · 活也翻倍');
    this.say('很好，就按你说的办。');
    this.praiseConsult = undefined;
  }

  private beginPhoneRing(enemy: EnemyUnit, phaseTwo: boolean): void {
    this.phoneRinging = true;
    this.phoneRingWindow = phaseTwo ? 4 : 5;
    this.phoneAnswer = 0;
    this.phoneAnswerTarget = -1;
    this.phonePostAnswerTimer = 0;
    this.phoneActiveStoryIndex = this.phoneStoryIndex < PHONE_STORY_STEPS.length ? this.phoneStoryIndex : -1;
    if (phaseTwo) {
      const count = Math.min(4, 3 + Math.floor(this.phoneMissed / 10));
      const startAngle = this.random() * Math.PI * 2;
      this.phoneCalls = Array.from({ length: count }, (_, index) => {
        const angle = startAngle + (index / count) * Math.PI * 2;
        const radius = 180 + (index % 2) * 40;
        return this.phoneFieldPoint(angle, radius);
      });
      enemy.x = this.phoneCalls[0]!.x;
      enemy.y = this.phoneCalls[0]!.y;
    } else {
      // 一阶段也必须是一部落在场地里的电话，而不是等追人的 Boss 贴脸后原地响。
      // 180-280 的距离环与正典一致：玩家看得见目标，但必须穿过战场去接。
      const angle = this.random() * Math.PI * 2;
      const radius = 180 + this.random() * 100;
      const call = this.phoneFieldPoint(angle, radius);
      this.phoneCalls = [call];
      enemy.x = call.x;
      enemy.y = call.y;
    }
    this.playBossAnimation(enemy, phaseTwo ? 'phone-p2-ring' : 'phone-p1-ring', this.phoneRingWindow, true);
    this.feedback.vibrate([180, 700, 180, 700]);
    this.feedback.play('boss', 0.65);
    const burstPoints = this.phoneCalls;
    for (const call of burstPoints) this.burst('ring', call.x, call.y, 90, '#cfe4ea');
    this.say(phaseTwo ? '全部一起响了' : '电话响了');
  }

  private phoneFieldPoint(angle: number, radius: number): { x: number; y: number } {
    // 竖屏的有效战场在上下两块 HUD 之间。保持真实环距不变，只压缩纵向分量，
    // 再把剩余距离补到水平方向，避免大号电话精灵钻进底栏。
    const yOffset = this.clamp(Math.sin(angle) * radius, -144, 144);
    const xDirection = Math.cos(angle) < 0 ? -1 : 1;
    const xOffset = xDirection * Math.sqrt(Math.max(0, radius * radius - yOffset * yOffset));
    return { x: this.heroX + xOffset, y: this.heroY + yOffset };
  }

  private nearestPhoneCallIndex(): number {
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.phoneCalls.length; index += 1) {
      const call = this.phoneCalls[index]!;
      const distance = Math.hypot(this.heroX - call.x, this.heroY - call.y);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private phoneStrengthTier(): number {
    return Math.max(0, Math.floor(this.phoneMissed / 5) - this.phoneRelief);
  }

  private updatePhoneStrength(enemy: EnemyUnit): void {
    const tier = this.phoneStrengthTier();
    enemy.damage = 8 + tier * 2;
    enemy.speed = Math.min(58, 22 + tier * 6);
  }

  private applyPhoneCaller(enemy: EnemyUnit, caller: PhoneCaller): void {
    this.lastPhoneCaller = caller;
    this.showPhoneTranscript(caller);
    const voiceCue = PHONE_STORY_VOICE[caller];
    if (voiceCue) this.playVoiceOnce(voiceCue);
    if (caller === 'wife') {
      this.loseHealth(3);
      this.healHero(5);
      this.burst('word', this.heroX, this.heroY - 60, 32, '#9ab08c', '老婆 · -3生命 +5恢复');
    } else if (caller === 'silent') {
      this.loseHealth(3);
      this.burst('word', this.heroX, this.heroY - 60, 32, '#778088', '陌生号码 · -3生命');
    } else if (caller === 'hospital') {
      this.loseHealth(7);
      this.phoneRelief += 1;
      this.updatePhoneStrength(enemy);
      this.burst('word', this.heroX, this.heroY - 60, 32, '#7e97a0', '医院 · -7生命 · 强度-1档');
    } else if (caller === 'mother') {
      this.loseHealth(3);
      this.hero.coins += 2;
      this.feedback.play('coin', 0.7);
      this.burst('word', this.heroX, this.heroY - 60, 32, '#c8b078', '妈妈 · -3生命 +2零钱');
    } else if (caller === 'father-outgoing') {
      this.burst('word', this.heroX, this.heroY - 60, 32, '#87949a', '打给爸 · 无法接通');
    } else if (caller === 'father') {
      this.loseHealth(3);
      this.burst('word', this.heroX, this.heroY - 60, 32, '#9a927f', '爸回拨 · -3生命');
    } else if (caller === 'coworker') {
      this.loseHealth(7);
      this.hero.coins += 2;
      this.feedback.play('coin', 0.7);
      this.burst('word', this.heroX, this.heroY - 60, 32, '#8a8a94', '同事 · -7生命 +2零钱');
    }
  }

  private showPhoneTranscript(caller: PhoneStoryStep, timer = 4.2): void {
    this.phoneTranscript = {
      speaker: PHONE_STORY_SPEAKER[caller],
      text: PHONE_STORY_TEXT[caller],
      timer,
    };
  }

  private advancePhoneStory(): void {
    if (this.phoneActiveStoryIndex < 0) return;
    this.phoneStoryIndex = Math.max(this.phoneStoryIndex, this.phoneActiveStoryIndex + 1);
    this.phoneActiveStoryIndex = -1;
  }

  private resolvePhoneMisses(
    enemy: EnemyUnit,
    missedCalls: Array<{ x: number; y: number }>,
    animate: boolean,
  ): void {
    if (missedCalls.length <= 0) return;
    this.phoneMissed += missedCalls.length;
    if (animate) this.playBossAnimation(enemy, (enemy.phase ?? 1) === 2 ? 'phone-p2-missed' : 'phone-p1-missed', 0.85);
    this.feedback.vibrate([400]);
    for (const call of missedCalls) {
      const ghost = this.createSeekingEnemy('missed-call', call.x, call.y + 30);
      this.enemies.push(ghost);
      this.burst('ring', call.x, call.y, 54, '#a24754');
    }
    this.updatePhoneStrength(enemy);
    this.burst('word', enemy.x, enemy.y - enemy.radius - 12, 30, '#43525a', `未接来电 ${this.phoneMissed}`);
    if (this.phoneMissed % 5 === 0) this.say('它变强了。你欠的回应在堆着');
  }

  private finishPhoneAnswer(enemy: EnemyUnit, phaseTwo: boolean, answeredIndex: number): void {
    this.phoneRinging = false;
    enemy.mechTimer = 0;
    const storyCaller = this.phoneActiveStoryIndex >= 0
      ? PHONE_STORY_STEPS[this.phoneActiveStoryIndex]
      : undefined;
    const caller = storyCaller ?? PHONE_REPEAT_CALLERS[Math.floor(this.random() * PHONE_REPEAT_CALLERS.length)]!;
    this.applyPhoneCaller(enemy, caller);
    this.advancePhoneStory();
    if (phaseTwo) {
      const unanswered = this.phoneCalls.filter((_, index) => index !== answeredIndex);
      this.resolvePhoneMisses(enemy, unanswered, false);
    }
    this.phonePostAnswerTimer = 0.65;
    this.phoneCalls = [];
    this.phoneAnswerTarget = -1;
  }

  private beginLampChoice(enemy: EnemyUnit): void {
    this.lampItemsToReturnTotal = Math.max(this.lampItemsToReturnTotal, this.items.length);
    const ordered = this.items
      .map((_, index) => index)
      .sort((left, right) => {
        const leftRaincoat = this.items[left] === 'fathers-raincoat' ? 1 : 0;
        const rightRaincoat = this.items[right] === 'fathers-raincoat' ? 1 : 0;
        return leftRaincoat - rightRaincoat || right - left;
      });
    if (ordered.length === 0) {
      this.beginLampRelease(enemy);
      return;
    }
    if (ordered.length === 1) {
      this.finishLampCycle(enemy, ordered[0]!);
      return;
    }
    if (ordered.length === 2) {
      const raincoatIndex = ordered.find((index) => this.items[index] === 'fathers-raincoat');
      if (raincoatIndex !== undefined) {
        const otherIndex = ordered.find((index) => index !== raincoatIndex)!;
        this.burst('word', enemy.x, enemy.y - enemy.radius - 12, 30, '#d8c27d', '雨衣最后还');
        this.say('这件，要留到最后。');
        this.finishLampCycle(enemy, otherIndex);
        return;
      }
    }
    const leftIndex = ordered[0]!;
    const rightIndex = ordered[1]!;
    enemy.x = this.darkCX;
    enemy.y = this.darkCY - 108;
    const spread = Math.max(56, Math.min(84, this.darkR * 0.48));
    this.lampChoice = {
      indices: [leftIndex, rightIndex],
      items: [this.items[leftIndex]!, this.items[rightIndex]!],
      x: [this.darkCX - spread, this.darkCX + spread],
      y: this.darkCY + 22,
      timer: 3,
      total: 3,
    };
    this.playBossAnimation(enemy, 'keeper-name', 3);
    this.burst('word', enemy.x, enemy.y - enemy.radius - 12, 30, '#cbb98f', '保一件');
    this.say('这两件，留哪一件。');
  }

  private updateLampChoice(enemy: EnemyUnit, dt: number): void {
    const choice = this.lampChoice;
    if (!choice) return;
    choice.timer = Math.max(0, choice.timer - dt);
    const leftDistance = Math.hypot(this.heroX - choice.x[0], this.heroY - choice.y);
    const rightDistance = Math.hypot(this.heroX - choice.x[1], this.heroY - choice.y);
    let keepSlot: 0 | 1 | undefined;
    if (leftDistance < 34 || rightDistance < 34) keepSlot = leftDistance <= rightDistance ? 0 : 1;
    else if (choice.timer <= 0) keepSlot = leftDistance <= rightDistance ? 0 : 1;
    if (keepSlot === undefined) return;
    const stripSlot: 0 | 1 = keepSlot === 0 ? 1 : 0;
    const stripAt = choice.indices[stripSlot];
    const kept = getItem(choice.items[keepSlot]);
    this.burst('word', choice.x[keepSlot], choice.y - 30, 26, '#d8c27d', `留下 ${kept.name}`);
    this.lampChoice = undefined;
    this.finishLampCycle(enemy, stripAt);
  }

  private finishLampCycle(enemy: EnemyUnit, stripAt: number): void {
    this.darkR = Math.max(70, this.darkR - 10);
    const strippedId = this.items[stripAt];
    if (strippedId === undefined) return;
    this.playBossAnimation(enemy, 'keeper-strip', 1.3);
    this.items = this.items.filter((_, itemIndex) => itemIndex !== stripAt);
    const stripped = getItem(strippedId);
    this.caption = stripped.flavor || `${stripped.name}，放下了。`;
    this.captionTime = 3.2;
    this.burst('word', this.heroX, this.heroY - 46, 26, '#cbb98f', stripped.name);
    this.feedback.play('page', 0.9);
    this.say('这一件，先还回去。');
    this.playVoiceOnce('lamp-one-returned');
    if (this.items.length === 0) {
      this.lampFinalStripTimer = LAMP_STRIP_TO_RELEASE_DELAY;
      this.resetMovementInput();
      return;
    }
    const shadesAlive = this.enemies.filter((unit) => !unit.dead && unit.type === 'forgetter').length;
    for (let dimIndex = 0; dimIndex < 2 && shadesAlive + dimIndex < LAMP_SHADE_CAP; dimIndex += 1) {
      const dimAngle = this.random() * Math.PI * 2;
      const shade = this.createSeekingEnemy(
        'forgetter',
        this.darkCX + Math.cos(dimAngle) * (this.darkR - 20),
        this.darkCY + Math.sin(dimAngle) * (this.darkR - 20),
      );
      shade.hp = 30;
      shade.maxHp = 30;
      this.enemies.push(shade);
    }
  }

  private beginLampRelease(enemy: EnemyUnit): void {
    if (this.lampReleaseReady) return;
    this.lampFinalStripTimer = 0;
    this.lampChoice = undefined;
    this.lampReleaseReady = true;
    this.lampReleaseTimer = LAMP_RELEASE_CONFIRM_DELAY;
    this.darkR = 70;
    enemy.x = this.darkCX;
    enemy.y = this.darkCY - 108;
    this.playBossAnimation(enemy, 'keeper-dim', LAMP_RELEASE_CONFIRM_DELAY);
    for (const unit of this.enemies) {
      if (unit.id !== enemy.id) unit.dead = true;
    }
    this.projectiles = [];
    this.pendingShots = [];
    this.tearDrops = [];
    this.tantrumRings = [];
    this.resetMovementInput();
    this.caption = '手里空了，只剩最初那一口气。';
    this.captionTime = 4.2;
    this.say('又一盏灯灭了。');
    this.playVoiceOnce('lamp-pockets-empty');
    this.scheduleVoice('narrator-final-breath', LAMP_STRIP_TO_RELEASE_DELAY);
  }

  private releaseFinalBreath(): void {
    if (this.state !== 'battle' || !this.lampReleaseReady || this.lampReleaseTimer > 0) return;
    this.lampReleaseReady = false;
    this.resetMovementInput();
    this.burst('ring', this.heroX, this.heroY, 70, '#d5bd73');
    this.feedback.vibrate([18, 42, 18]);
    this.endRun(true);
  }

  private relocateDebtCollector(enemy: EnemyUnit): void {
    this.playBossAnimation(enemy, 'collector-relocate', 0.9);
    const relocateAngle = this.random() * Math.PI * 2;
    enemy.x = this.clamp(this.heroX + Math.cos(relocateAngle) * 170, 44, W - 44);
    enemy.y = this.clamp(this.heroY + Math.sin(relocateAngle) * 170, 110, H - 92);
    this.burst('ring', enemy.x, enemy.y, 68, '#75605a');
    this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 30, '#9b7968', '换个门');
  }

  private fatherChargeGeometry(enemy: EnemyUnit, angle: number): {
    travel: number;
    start: number;
    reach: number;
    band: number;
    blockedByCoat: boolean;
  } {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    let travel = FATHER_CHARGE_DISTANCE;
    let blockedByCoat = false;
    if (this.fallenCoatX !== undefined && this.fallenCoatY !== undefined) {
      const toCoatX = this.fallenCoatX - enemy.x;
      const toCoatY = this.fallenCoatY - enemy.y;
      const along = toCoatX * dirX + toCoatY * dirY;
      if (along > 0 && along < travel) {
        const perp = Math.abs(toCoatX * dirY - toCoatY * dirX);
        if (perp < FATHER_COAT_BLOCK_HALF_WIDTH) {
          travel = Math.max(FATHER_CHARGE_MIN_DISTANCE, along - FATHER_CHARGE_HIT_OVERHANG);
          blockedByCoat = true;
        }
      }
    }
    return {
      travel,
      start: -FATHER_CHARGE_HIT_OVERHANG,
      // 被雨衣截停时，危险带只到男孩的停点；雨衣之后是明确安全区。
      reach: travel + (blockedByCoat ? 0 : FATHER_CHARGE_HIT_OVERHANG),
      band: FATHER_CHARGE_HALF_WIDTH,
      blockedByCoat,
    };
  }

  /** 通用 boss 定向招式派发：各 boss 前摇归零时按 attackKind 结算。 */
  private resolveBossStrike(enemy: EnemyUnit): void {
    switch (enemy.attackKind) {
      case 'last-bus-dash':
        enemy.phase = 2;
        enemy.mechTimer = 0;
        enemy.dashHit = false;
        enemy.angle = enemy.attackAngle ?? Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
        this.playVoiceOnce('station-doors-closing');
        break;
      case 'stand': // 第一阶段《站好》：继承来的规训，长距重压、强击退、减速
        this.bossLunge(enemy, { reach: 210, band: 26, dmg: enemy.damage, knock: 34, slow: 0.7, color: '#9c8f6a', word: '站好', lunge: 120 });
        break;
      case 'stomp': // 父亲《进去》：像把孩子赶回屋里——大扇形近战，强击退
        this.bossLunge(enemy, { reach: 150, band: 26, dmg: 6, knock: 30, slow: 0.35, color: '#c9b98f', word: '进去', lunge: 96 });
        break;
      case 'charge':
      case 'charge2': { // 男孩《不许看》：捂脸两段冲撞；撞到落下的雨衣会提前停并摔坐
        const chargeAngle = enemy.attackAngle ?? Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
        const chargeDirX = Math.cos(chargeAngle);
        const chargeDirY = Math.sin(chargeAngle);
        const charge = this.fatherChargeGeometry(enemy, chargeAngle);
        // 冲撞路径上打到主角
        const relX = this.heroX - enemy.x;
        const relY = this.heroY - enemy.y;
        const heroAlong = relX * chargeDirX + relY * chargeDirY;
        const heroPerp = Math.abs(relX * chargeDirY - relY * chargeDirX);
        enemy.x += chargeDirX * charge.travel;
        enemy.y += chargeDirY * charge.travel;
        this.burst('ring', enemy.x, enemy.y, 46, '#6c7b8a');
        if (heroAlong > charge.start && heroAlong < charge.reach && heroPerp < charge.band) {
          this.hurtHero(enemy.damage, enemy.name);
          this.heroSlowTimer = Math.max(this.heroSlowTimer, 0.4);
        }
        if (charge.blockedByCoat) {
          // 摔坐在雨衣前——他自己踢过来的那件挡住了他
          enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, 0.9);
          this.burst('word', enemy.x, enemy.y - enemy.radius - 10, 24, '#8a97a4', '绊了一下');
        } else if (enemy.attackKind === 'charge') {
          // 第二段：重新找方向，但转向受限（沿用当前角 ±0.5 内）
          const retarget = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
          let delta = retarget - chargeAngle;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          enemy.attackAngle = chargeAngle + this.clamp(delta, -0.5, 0.5);
          enemy.windupTimer = 0.4;
          enemy.attackKind = 'charge2';
          this.playBossAnimation(enemy, 'father-charge', 0.55);
          return; // 保留 attackKind，进入第二段
        }
        break;
      }
      case 'shadow': // 床底怪《影子压来》：巨影压过来，本体几乎不动
        this.bossLunge(enemy, { reach: 240, band: 34, dmg: enemy.damage, knock: 22, slow: 0.3, color: '#48434f', word: '别看', lunge: 36 });
        break;
      case 'sleeve': // 单袖：窄车道，给新手留下明确的横移出口
        this.bossLunge(enemy, { reach: COAT_SLEEVE_REACH, band: COAT_SLEEVE_HALF_WIDTH, dmg: 5, knock: 10, slow: 0.5, color: '#9f3548', word: '是袖子', lunge: 0 });
        break;
      case 'double-sleeve': // 半血双袖：扩大横向覆盖，但仍只结算一次，避免重叠判定造成隐性双伤
        this.bossLunge(enemy, { reach: COAT_SLEEVE_REACH, band: COAT_DOUBLE_SLEEVE_HALF_WIDTH, dmg: 6, knock: 10, slow: 0.5, color: '#b83f55', word: '两只袖子', lunge: 0 });
        break;
      case 'paper': // 领导《这个下班前给我》：一叠文件甩过来
        this.bossLunge(enemy, { reach: 190, band: 30, dmg: 6, knock: 14, slow: 0.4, color: '#8a8a94', word: '下班前给我', lunge: 0 });
        break;
      case 'backstab': // 岗位幸存者《背刺》：先绕到视线后方，再沿短窄预警线刺入
        this.bossLunge(enemy, { reach: 126, band: 18, dmg: 7, knock: 14, slow: 0.35, color: '#8a3d4c', word: '背刺', lunge: 94 });
        break;
      case 'box-count': { // 《清点》：动作结束才盖章，给玩家完整 8 秒击杀窗口
        const item = enemy.countedItem;
        if (item) {
          enemy.countedItemTimer = 8;
          this.caption = `纸箱正在清点《${getItem(item).name}》：8 秒内打掉它。`;
          this.captionTime = 3.6;
          this.burst('word', this.heroX, this.heroY - 54, 30, '#d7bd73', '8秒内保住');
          this.feedback.vibrate([18, 36, 18]);
        }
        break;
      }
      case 'slam': { // 领导《拍桌子》：从脚下扩散的圆环冲击波，越近伤害越高
        const slamDist = Math.hypot(this.heroX - enemy.x, this.heroY - enemy.y);
        this.burst('ring', enemy.x, enemy.y, 120, '#c9a24a');
        this.burst('ring', enemy.x, enemy.y, 220, '#c9a24a');
        this.feedback.vibrate([30, 40, 50]);
        this.screenShake = Math.max(this.screenShake, 0.3);
        if (slamDist < PRAISE_SLAM_RADIUS) {
          this.hurtHero(Math.max(3, Math.round(9 * (1 - slamDist / PRAISE_SLAM_RADIUS))), enemy.name);
          this.heroSlowTimer = Math.max(this.heroSlowTimer, 0.5);
        }
        break;
      }
      case 'collector-drag': {
        const pullX = enemy.x - this.heroX;
        const pullY = enemy.y - this.heroY;
        const pullDistance = Math.hypot(pullX, pullY) || 1;
        this.burst('ring', enemy.x, enemy.y, Math.min(220, pullDistance), '#b97858');
        if (pullDistance < COLLECTOR_DRAG_RADIUS) {
          this.heroX = this.clamp(this.heroX + (pullX / pullDistance) * 54, 18, W - 18);
          this.heroY = this.clamp(this.heroY + (pullY / pullDistance) * 54, 92, H - 64);
          if (this.hero.coins > 0) {
            this.hero.coins -= 1;
            this.burst('word', this.heroX, this.heroY - 46, 24, '#d5885f', '-1零钱');
          } else {
            this.hurtHero(5, enemy.name);
          }
        }
        break;
      }
      default:
        break;
    }
    enemy.attackKind = undefined;
  }

  /** 沿前摇锁定方向压过去：命中带状区结算伤害/击退/减速，本体顺势前冲。 */
  private bossLunge(
    enemy: EnemyUnit,
    opts: { reach: number; band: number; dmg: number; knock: number; slow: number; color: string; word: string; lunge: number },
  ): void {
    const angle = enemy.attackAngle ?? Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const strikeX = enemy.x;
    const strikeY = enemy.y;
    const relX = this.heroX - strikeX;
    const relY = this.heroY - strikeY;
    const along = relX * dirX + relY * dirY;
    const perp = Math.abs(relX * dirY - relY * dirX);
    const start = enemy.radius * 0.5;
    this.burst('ring', strikeX + dirX * opts.reach * 0.5, strikeY + dirY * opts.reach * 0.5, opts.reach * 0.6, opts.color);
    // screenShake 的单位是秒，振幅 = ceil(值 * 16) px（见 render 的 shakeAmount）。
    // 挥空只给一记落地的闷响；真打到才配得上比"挨打 0.22"更重的一下。
    this.screenShake = Math.max(this.screenShake, 0.06);
    if (along > start && along < opts.reach && perp < opts.band) {
      if (this.hurtHero(opts.dmg, enemy.name)) {
        this.screenShake = Math.max(this.screenShake, opts.knock >= 30 ? 0.34 : 0.26);
        this.heroSlowTimer = Math.max(this.heroSlowTimer, opts.slow);
        if (opts.knock > 0) {
          this.heroX += dirX * opts.knock;
          this.heroY += dirY * opts.knock;
        }
        this.burst('word', this.heroX, this.heroY - 40, 26, opts.color, opts.word);
      }
    }
    enemy.x = strikeX + dirX * opts.lunge;
    enemy.y = strikeY + dirY * opts.lunge;
  }

  private showFatherAttackNameOnce(name: string): void {
    if (this.fatherAttackNamesSeen.has(name) || this.captionTime > 0 || this.voiceCaption) return;
    this.fatherAttackNamesSeen.add(name);
    this.say(name);
  }

  /** Boss 血量心声：约 2/3、1/3 血量各触发一句，一句一生只说一次。 */
  private bossVoice(enemy: EnemyUnit): void {
    const ratio = enemy.hp / Math.max(1, enemy.maxHp);
    const stage = enemy.voiceStage ?? 0;
    const lines: Partial<Record<EnemyType, [string, string]>> = {
      'closet-dark': ['妈妈说没有怪物，台灯却亮了一夜。', '白天再看，床底只有一只旧袜子。'],
      'uniform-answer': ['红榜贴了三张。你的名字压在折痕里。', '答案发下来。你写的那句被红笔圈住。'],
      'last-bus': ['站牌写着22:40。你的表是22:41。', '追到下一站，车尾灯刚好拐弯。'],
      'debt-collector': ['它有你的地址，也有你妈的。', '电话调成静音，还是响了十九次。'],
      'lamp-keeper': ['他没看你，只看你手里的灯。', '每关一盏，你的口袋就轻一点。'],
    };
    const pair = lines[enemy.type];
    if (!pair) return;
    if (stage < 1 && ratio <= 0.66) {
      enemy.voiceStage = 1;
      this.say(pair[0]);
    } else if (stage < 2 && ratio <= 0.33) {
      enemy.voiceStage = 2;
      this.say(pair[1]);
    }
  }

  private hurtHero(amount: number, source?: string): boolean {
    if (amount <= 0 || this.hurtCooldown > 0) return false;
    this.hurtCooldown = HURT_IFRAME;
    // 《连续签到1847天》：受伤打断当期打卡节律
    if (this.hasProjectileTrigger('streak-1847')) {
      const brokenWindow = Math.floor(this.battleTime / 10) + 1;
      if (this.rhythmBrokenWindow !== brokenWindow) {
        this.rhythmBrokenWindow = brokenWindow;
        this.burst('word', this.heroX, this.heroY - 62, 24, '#8a756d', '本轮断签');
      }
    }
    if (this.hasItem('flash-escape') && this.flashCooldown <= 0) {
      this.flashCooldown = 9;
      const fromX = this.heroX;
      const fromY = this.heroY;
      const reversed = this.random() < 0.1;
      const threat = this.nearestEnemy(this.heroX, this.heroY);
      const angle = threat
        ? Math.atan2(this.heroY - threat.y, this.heroX - threat.x) + (reversed ? Math.PI : 0)
        : this.random() * Math.PI * 2;
      this.heroX += Math.cos(angle) * 92;
      this.heroY += Math.sin(angle) * 92;
      this.burst('ring', fromX, fromY - 10, 30, '#706783');
      this.burst('ring', this.heroX, this.heroY - 10, 22, '#b9a8d6');
      this.burst('word', this.heroX, this.heroY - 46, 40, '#b9a8d6', reversed ? '闪错方向了' : '闪现');
      this.feedback.play('breath', reversed ? 0.72 : 1.08);
      this.feedback.vibrate(reversed ? [20, 28, 12] : 8);
      return true;
    }
    if (this.hasItem('painless-night')) {
      this.painlessDamage += amount;
      this.painlessTimer = Math.max(this.painlessTimer, 8);
      this.burst('word', this.heroX, this.heroY - 62, 34, '#858b96', `不疼 · 欠${Math.ceil(this.painlessDamage)}`);
      return true;
    }
    if (this.raincoatReady) {
      this.raincoatReady = false;
      this.releaseRain();
      this.say('父亲的雨衣 · 挡住第一次');
      return true;
    }
    this.applyHeroDamage(amount, source);
    return true;
  }

  private applyHeroDamage(amount: number, source?: string): void {
    const absorbed = Math.min(this.hero.block, amount);
    this.hero.block -= absorbed;
    const warmthBefore = this.bowlWarmthBlock;
    const warmthAbsorbed = Math.min(warmthBefore, absorbed);
    this.bowlWarmthBlock = Math.max(0, warmthBefore - warmthAbsorbed);
    if (warmthBefore > 0 && this.bowlWarmthBlock === 0 && warmthAbsorbed > 0) this.releaseBowlSteam();
    this.noHitTime = 0;
    let remaining = amount - absorbed;
    if (this.hasItem('divorce-draft') && !this.divorceUsedStage && remaining > 0) {
      this.divorceUsedStage = true;
      const immediate = Math.ceil(remaining / 2);
      this.divorceDeferredDamage += Math.max(0, remaining - immediate);
      remaining = immediate;
      this.burst('word', this.heroX, this.heroY - 52, 34, '#a8a0b5', `待结算 ${Math.ceil(this.divorceDeferredDamage)}`);
    }
    if (this.hasItem('unwashed-pillow') && this.standStillTime >= 2 && remaining > 0) {
      remaining = Math.ceil(remaining * 0.5);
    }
    if (this.hasItem('sock-cigs') && remaining > 0) {
      this.sockBoostTimer = 2;
      this.burst('word', this.heroX, this.heroY - 64, 24, '#a99a87', '烟提神');
    }
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
          visual: this.projectileVisualForForm('tear', 'water', 1),
        });
      }
    }
    if (this.hasItem('eyebrow-razor') && remaining > 0) {
      this.razorScars = Math.min(6, this.razorScars + 1);
      this.burst('word', this.heroX - 12, this.heroY - 38, 15, '#c77b84', `浅痕 ${this.razorScars}`);
    }
    if (this.hasProjectileTrigger('loose-button') && remaining > 0) {
      this.buttonRecordedDamage = remaining;
      this.burst('word', this.heroX, this.heroY - 42, 18, '#d2c7b6', '纽扣记住了');
    }
    if (this.hasItem('drank-for-boss') && remaining > 0 && this.random() < 0.25) {
      this.drankLayers = Math.min(3, this.drankLayers + 1);
      this.drankStoredDamage += remaining;
      if (this.drankLayers >= 3) {
        const reflected = Math.max(1, Math.ceil(this.drankStoredDamage));
        this.areaDamage(reflected, '#c98a5a');
        this.burst('ring', this.heroX, this.heroY - 10, 110, '#c98a5a');
        this.burst('word', this.heroX, this.heroY - 58, 36, '#d9a06a', `替回去 ${reflected}`);
        this.drankLayers = 0;
        this.drankStoredDamage = 0;
      } else {
        this.burst('word', this.heroX, this.heroY - 48, 24, '#c98a5a', `代喝 ${this.drankLayers}/3`);
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
      if (source) this.lastDamageSource = source;
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
      this.flash = 0;
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
    if (this.hasItem('fathers-chart')) multiplier *= 0.6;
    const actual = Math.ceil(amount * multiplier);
    const beforeHp = this.hero.hp;
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + actual);
    if (this.hasItem('moms-bowl')) {
      const overflow = actual - (this.hero.hp - beforeHp);
      if (overflow > 0) {
        const warmth = Math.max(0.4, 1 - this.encounterIndex * 0.1);
        const beforeBlock = this.hero.block;
        this.hero.block = Math.min(24, this.hero.block + Math.ceil(overflow * warmth));
        const gained = this.hero.block - beforeBlock;
        if (gained > 0) {
          this.bowlWarmthBlock = Math.min(this.hero.block, this.bowlWarmthBlock + gained);
          this.burst('ring', this.heroX, this.heroY - 12, 28, '#d9c79f');
          this.burst('word', this.heroX, this.heroY - 62, 28, '#d9c79f', `热饭成盾 +${gained}`);
        }
      }
    }
  }

  private buildLifeSnapshot(): LifeSnapshot {
    const stage = STAGES[this.encounterIndex];
    const stageCanon = LIFE_STAGE_CANON[this.encounterIndex] ?? LIFE_STAGE_CANON[LIFE_STAGE_CANON.length - 1]!;
    return {
      runSeed: this.runSeed,
      chapterIndex: this.encounterIndex,
      chapter: stage?.chapter ?? '这一生',
      age: AGE_LABELS[this.encounterIndex] ?? '晚年',
      stageFocus: stageCanon.focus,
      stageBossMeaning: stageCanon.bossMeaning,
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
    const available = FATE_ITEM_IDS.filter((id) => !this.items.includes(id) && isFateItemAgeAppropriate(id, this.encounterIndex));
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
      this.releaseRetractedVoice();
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
      if (STORY_ITEM_IDS.includes(id)) return false; // 传承线只走固定掉落
      if (getItem(id).quality >= 4) return false;
      return !initial || getItem(id).quality <= 2;
    });
    return this.shuffle(available).slice(0, initial ? 3 : this.rewardChoiceCount());
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
    if (id === 'card-binder') this.syncBinderCardsFromInventory();
    else this.recordBinderCard(id);
    this.feedback.play('wear', getItem(id).quality >= 4 ? 1.25 : 0.9);
    this.feedback.vibrate(12);
    this.stats.itemsTaken += 1;
    if (id === 'small-uniform') this.changeMaxHp(-6);
    if (id === 'nameless-tie') this.changeMaxHp(-10);
    if (id === 'eyebrow-razor') this.changeMaxHp(-8);
    if (id === 'eyebrow-razor') this.razorScars = Math.max(1, this.razorScars);
    if (id === 'broken-spine') this.changeMaxHp(-12);
    if (id === 'baby-tooth') this.toothReady = true;
    if (['eyebrow-razor', 'od-pill', 'white-bottle', 'broken-spine', 'spent-decade', 'painless-night'].includes(id)) this.strainTendency += 2;
    if (['fathers-raincoat', 'baby-tooth', 'missing-photo'].includes(id)) this.lightTendency += 2;
    if (id === 'checkup-arrows') {
      this.checkupPulseTimer = 1.4;
      this.screenShake = Math.max(this.screenShake, 0.12);
      this.burst('word', this.heroX, this.heroY - 54, 42, '#b85b5f', '↑↓ 指标定住了');
    }
    // 《朋友圈仅三天可见》：拾取任何道具后，3 枚当前弹体绕身三圈后向外释放
    if (this.hasProjectileTrigger('three-day-visible')) this.spawnOrbitRing();
    this.say(`穿戴 · ${getItem(id).name}`);
    if (id === 'fathers-raincoat') this.playVoiceOnce('father-childhood-walk');
    if (id === 'iphone-17-pro-max') {
      // 「爽歪歪」和「零钱清零」印在同一张卡上，就是那个笑点
      if (this.hero.coins > 0) this.burst('word', this.heroX, this.heroY - 66, 40, '#c8b078', `零钱清零 · -${this.hero.coins}`);
      this.hero.coins = 0;
      this.phoneMsgTimer = IPHONE_MESSAGE_INTERVAL;
    }
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
    const before = this.hero.maxHp;
    this.hero.maxHp = Math.max(20, this.hero.maxHp + delta);
    // 病历本：只记真实生效的永久损失（触底 20 的部分不算）
    if (delta < 0) this.permanentHpLost += before - this.hero.maxHp;
    this.hero.hp = Math.min(this.hero.hp, this.hero.maxHp);
  }

  private setupShop(resetPurchase = true): void {
    if (resetPurchase) this.boughtThisShop = false;
    this.shopFeedback = undefined;
    const candidates = this.shuffle(ITEM_IDS.filter((id) => !this.items.includes(id) && getItem(id).quality < 4));
    this.shopOffers = candidates.slice(0, 3).map((item) => ({ item, price: this.itemPrice(item), sold: false }));
    this.shopFocus = 0;
    if (resetPurchase) {
      if (this.encounterIndex === 2) this.playVoiceOnce('landlord-rent-deposit');
      else if (this.encounterIndex === 5) this.playVoiceOnce('pharmacist-after-meals');
    }
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
    // 父亲的雨衣不在池内：它是少年章击败沉默的父亲后的固定掉落，
    // 提前从留灯间拿到会把"他捡起那件雨衣穿上"那一刻的分量抢跑。
    const lightPool: ItemId[] = ['baby-tooth', 'missing-photo', 'moms-bowl', 'ruma-msg', 'held-elevator', 'old-door-lock', 'breath-on-glass'];
    const roomPool = (this.specialRoomKind === 'back' ? backPool : lightPool).filter((id) => !this.items.includes(id));
    this.specialRoomPreviousLifeItem = undefined;
    if (this.specialRoomKind === 'light') {
      const previousLife = this.ledgerEntries[0];
      // 五件固定传承物必须在当前人生自己的章节落下；上一世只能留下普通物证，
      // 否则雨衣、病历本和旧工牌会抢跑它们本局的叙事时刻。
      const previousCandidates = previousLife
        ? [...new Set(previousLife.items)].filter((id) => !this.items.includes(id) && !STORY_ITEM_IDS.includes(id))
        : [];
      const inherited = previousCandidates.length
        ? previousCandidates[Math.floor(this.random() * previousCandidates.length)]
        : undefined;
      this.specialRoomPreviousLifeItem = inherited;
      const regular = this.shuffle(roomPool.filter((id) => id !== inherited)).slice(0, inherited ? 2 : 3);
      this.specialRoomOffers = inherited ? [inherited, ...regular] : regular;
    } else {
      this.specialRoomOffers = this.shuffle(roomPool).slice(0, 3);
    }
    this.specialRoomTaken.clear();
    this.specialRoomFocus = 0;
    this.specialRoomLeaveFocused = false;
    this.state = 'specialRoom';
    this.playVoiceOnce(this.specialRoomKind === 'light' ? 'light-room-keeper' : 'back-room-keeper');
  }

  private takeSpecialOffer(index: number): void {
    if (this.state !== 'specialRoom') return;
    const id = this.specialRoomOffers[index];
    if (!id || this.specialRoomTaken.has(id)) return;
    if (this.specialRoomKind === 'light') {
      const fromPreviousLife = id === this.specialRoomPreviousLifeItem;
      this.acquireItem(id);
      if (fromPreviousLife) {
        const memory = `上一世留下：《${getItem(id).name}》`;
        if (!this.memories.includes(memory)) this.memories.push(memory);
        this.playVoiceOnce('light-room-left-this', false);
        this.caption = '看守人：「有人把它留在这儿了。」';
        this.captionTime = 4.2;
      }
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

  private recordRunInLedger(won: boolean): void {
    if (this.ledgerRecordedForCurrentRun || !this.origin) return;
    const reachedStage = Math.max(0, Math.min(AGE_LABELS.length - 1, this.encounterIndex));
    const lastEcho = this.fateReceipts[this.fateReceipts.length - 1]?.result
      || this.memories[this.memories.length - 1]
      || (won ? '这一口气终于松开了。' : '没有留下最后一句。');
    const nearby = this.nearestEnemy(this.heroX, this.heroY);
    const entry: LifeLedgerEntry = {
      runSeed: this.runSeed >>> 0,
      nickname: this.origin.nickname || this.origin.title,
      title: this.origin.title,
      reachedStage,
      reachedAge: AGE_LABELS[reachedStage]!,
      endedBy: won ? '放下了' : this.lastDamageSource || nearby?.name || '没能走到下一页',
      items: [...this.items],
      lastEcho,
      won,
      recordedAt: Date.now(),
    };
    this.ledgerEntries = appendLifeLedger(entry);
    this.ledgerRecordedForCurrentRun = true;
  }

  private endRun(won: boolean): void {
    this.recordRunInLedger(won);
    this.resetMovementInput();
    this.resetFateInput();
    this.closeFreeInput();
    this.paused = false;
    this.resetPauseHold();
    this.resultWon = won;
    this.resultTab = 'seal';
    this.resultStartedAt = performance.now();
    this.feedback.setAmbience(undefined);
    if (won) this.playVoiceOnce('narrator-final-breath');
    else this.feedback.stopVoice();
    this.feedback.play(won ? 'page' : 'swallow', won ? 1.2 : 0.9);
    if (!won) this.feedback.vibrate([26, 54, 26]);
    this.state = 'result';
    this.projectiles = [];
    this.toast = '';
    this.toastTime = 0;
    // 本局已结束，清掉断点以免下次启动误恢复到已完结的对局。
    clearRunCheckpoint();
    this.lastCheckpointKey = '';
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

  private momoCriticalWindowActive(): boolean {
    if (!this.hasItem('momo-avatar')) return false;
    const target = this.nearestEnemy(this.heroX, this.heroY);
    return !target || Math.hypot(target.x - this.heroX, target.y - this.heroY) > 150;
  }

  private hasItem(id: ItemId): boolean {
    return this.items.includes(id) && !this.stageDisabledItems.has(id);
  }

  private hasProjectileTrigger(id: ItemId): boolean {
    return this.hasItem(id)
      || (this.hasItem('card-binder')
        && BINDER_PROJECTILE_TRIGGER_IDS.has(id)
        && this.binderCards.includes(id));
  }

  private syncBinderCardsFromInventory(): void {
    if (!this.hasItem('card-binder') || this.binderCards.length > 0) return;
    this.binderCards = this.items
      .filter((id) => id !== 'card-binder' && getItem(id).quality <= 2)
      .slice(-3);
  }

  private recordBinderCard(id: ItemId): void {
    if (!this.hasItem('card-binder') || id === 'card-binder' || getItem(id).quality > 2 || this.binderCards.includes(id)) return;
    const evicted = this.binderCards.length >= 3 ? this.binderCards.shift() : undefined;
    this.binderCards.push(id);
    if (evicted) this.burst('word', this.heroX, this.heroY - 58, 24, '#8d79ac', `${getItem(evicted).name}褪色`);
    this.burst('word', this.heroX, this.heroY - 42, 20, '#b7a4cf', `入册 · ${getItem(id).name}`);
  }

  private baseProjectileStyle(): ProjectileStyle {
    if (this.hasProjectileTrigger('only-key')) return 'key';
    if (this.hasItem('front-desk-letter')) return 'paper';
    return 'plain';
  }

  private projectileMaterialOf(projectile: Projectile): HitMaterial {
    const materialForForm = (form: ProjectileForm): HitMaterial | undefined => {
      if (form === 'slash') return 'wood';
      if (form === 'stone') return 'stone';
      if (form === 'razor' || form === 'serial') return 'metal';
      if (form === 'ice') return 'ice';
      if (form === 'key') return 'key';
      if (form === 'lens' || form === 'marble') return 'glass';
      if (form === 'paper') return 'paper';
      if (form === 'rain' || form === 'tear' || form === 'cone') return 'water';
      if (form === 'sound' || form === 'link') return 'signal';
      if (form === 'breath' || form === 'laugh') return 'mist';
      return undefined;
    };
    const displayedMaterial = materialForForm(projectile.visual.form);
    if (displayedMaterial) return displayedMaterial;
    if (projectile.style === 'rain') return 'water';
    if (projectile.style === 'sound') return 'signal';
    if (projectile.style === 'key') return 'key';
    if (projectile.style === 'paper') return 'paper';
    return materialForForm(projectile.visual.carrierForm) ?? 'mist';
  }

  private hitMaterialOf(projectile: Projectile): HitMaterial {
    return projectile.critical ? 'crit' : this.projectileMaterialOf(projectile);
  }

  private hardControlDuration(enemy: EnemyUnit, baseDuration: number): number {
    const resistance = enemy.boss ? 0.5 : enemy.elite ? 0.72 : 1;
    const fatigue = Math.min(5, enemy.controlFatigue ?? 0);
    enemy.controlFatigue = Math.min(5, fatigue + 1);
    return baseDuration * resistance / (1 + fatigue * 0.16);
  }

  private applyProjectileMaterialReactions(enemy: EnemyUnit, projectile: Projectile, damage: number): number {
    const primary = this.projectileMaterialOf(projectile);
    const visual = projectile.visual;
    const wasWet = (enemy.wetTimer ?? 0) > 0;
    const heavyStacksBefore = (enemy.heavyTimer ?? 0) > 0 ? Math.min(3, enemy.heavyStacks ?? 1) : 0;
    const carriesWater = primary === 'water' || visual.wetness >= 0.35 || visual.materials.includes('water');
    const carriesSignal = primary === 'signal' || visual.materials.includes('signal');
    const carriesIce = primary === 'ice' || this.hasProjectileTrigger('shop-freezer');
    const carriesHeavy = primary === 'stone' || visual.weight >= 0.8;

    if (carriesWater) {
      const wasDry = (enemy.wetTimer ?? 0) <= 0;
      enemy.wetTimer = Math.max(enemy.wetTimer ?? 0, 4);
      if (wasDry) this.burst('ring', enemy.x, enemy.y, enemy.radius + 10, '#78aeb7');
    }

    if (carriesHeavy) {
      const wasLight = (enemy.heavyTimer ?? 0) <= 0;
      enemy.heavyTimer = Math.max(enemy.heavyTimer ?? 0, 5);
      enemy.heavyStacks = Math.min(3, (wasLight ? 0 : enemy.heavyStacks ?? 0) + 1);
      if (wasLight) this.burst('word', enemy.x, enemy.y - enemy.radius - 8, 15, '#8f877d', '沉');
    }

    const inflictsRaw = visual.materials.includes('bone')
      || (visual.form === 'razor' && projectile.critical)
      || (this.hasProjectileTrigger('red-workbook') && projectile.reversals > 0);
    if (inflictsRaw) {
      const wasClosed = (enemy.rawTimer ?? 0) <= 0;
      enemy.rawTimer = Math.max(enemy.rawTimer ?? 0, 6);
      enemy.rawStacks = Math.min(3, (wasClosed ? 0 : enemy.rawStacks ?? 0) + 1);
      if (wasClosed) this.burst('syn', enemy.x, enemy.y, 20, '#9a5b61', undefined, 'crack');
      if (this.hasItem('eyebrow-razor') && this.hasItem('broken-spine')) this.noteSynergy('旧伤口上再来一刀');
    }

    if (carriesIce) {
      const wetReaction = wasWet || carriesWater;
      const freezeChance = wetReaction ? 0.35 : 0.2;
      if (projectile.auditForceFreeze || this.random() < freezeChance) {
        projectile.auditForceFreeze = false;
        const freezeDuration = this.hardControlDuration(enemy, wetReaction ? 1.8 : 1.2);
        enemy.freezeTimer = Math.max(enemy.freezeTimer ?? 0, freezeDuration);
        this.burst('word', enemy.x, enemy.y - enemy.radius - 8, 16, '#bfe0e8', '冻住');
        if (wetReaction) {
          this.noteSynergy('湿了的更容易冻住');
          this.burst('syn', enemy.x, enemy.y + enemy.radius * 0.4, 26, '#bcd8e8', undefined, 'ice');
        }
        if (heavyStacksBefore > 0 || carriesHeavy) {
          damage *= 1.4;
          this.noteSynergy('压碎');
          this.burst('syn', enemy.x, enemy.y, 30, '#aab7bd', undefined, 'collapse');
        }
      }
    }

    if (carriesSignal) {
      const wetReaction = wasWet || carriesWater;
      const paralyzeChance = wetReaction ? 0.3 : 0.12;
      if (projectile.auditForceParalyze || this.random() < paralyzeChance) {
        projectile.auditForceParalyze = false;
        const duration = this.hardControlDuration(enemy, wetReaction ? 0.72 : 0.5);
        enemy.paralyzeTimer = Math.max(enemy.paralyzeTimer ?? 0, duration);
        if (wetReaction) {
          for (const rival of this.enemies) {
            if (rival.dead || rival.id === enemy.id || Math.hypot(rival.x - enemy.x, rival.y - enemy.y) > 92) continue;
            rival.paralyzeTimer = Math.max(rival.paralyzeTimer ?? 0, this.hardControlDuration(rival, duration * 0.75));
          }
          this.noteSynergy('水是导电的');
          this.burst('syn', enemy.x, enemy.y - 8, 28, '#a9ccd8', undefined, 'arc');
        }
      }
    }

    return damage;
  }

  private settleReadDebt(enemy: EnemyUnit, label = '迟到的'): void {
    const stored = enemy.readDamage ?? 0;
    if (stored <= 0) return;
    enemy.readDamage = 0;
    enemy.readTimer = 0;
    this.damageEnemy(enemy, stored, '#9fb6c8', 'signal');
    this.burst('word', enemy.x, enemy.y - 26, 24, '#9fb6c8', `${label} -${Math.ceil(stored)}`);
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

  /** 父亲战的天气层：落下的雨衣、跺脚雨圈预警、泪滴、斜扫全场的雨。世界坐标下调用。 */
  private fatherTantrumCoatGap(ring: { x: number; y: number; radius: number }): {
    angle: number;
    halfAngle: number;
  } | undefined {
    if (this.fallenCoatX === undefined || this.fallenCoatY === undefined) return undefined;
    const relX = this.fallenCoatX - ring.x;
    const relY = this.fallenCoatY - ring.y;
    const distance = Math.hypot(relX, relY);
    if (distance <= 0
      || distance >= ring.radius + FATHER_COAT_SHELTER_RADIUS
      || distance <= Math.abs(ring.radius - FATHER_COAT_SHELTER_RADIUS)) return undefined;
    const cosine = this.clamp(
      (distance * distance + ring.radius * ring.radius - FATHER_COAT_SHELTER_RADIUS * FATHER_COAT_SHELTER_RADIUS)
        / (2 * distance * ring.radius),
      -1,
      1,
    );
    return { angle: Math.atan2(relY, relX), halfAngle: Math.acos(cosine) };
  }

  private renderFatherWeather(ctx: CanvasRenderingContext2D): void {
    // 落下的雨衣：不消失，也不再变成怪物——旧橄榄黄绿，外侧朝雨，内面朝你
    if (this.fallenCoatX !== undefined && this.fallenCoatY !== undefined) {
      const cx = this.fallenCoatX;
      const cy = this.fallenCoatY;
      ctx.save();
      ctx.fillStyle = '#6f6a3c';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 3, 22, 11, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7d7847';
      ctx.beginPath();
      ctx.ellipse(cx - 4, cy - 1, 14, 7, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4d4a2c';
      ctx.fillRect(Math.round(cx - 2), Math.round(cy - 6), 5, 3); // 扣子那一排还系着一颗
      ctx.restore();
    }
    // 跺脚雨圈：到点前画预警虚圈
    for (const ring of this.tantrumRings) {
      const lead = ring.at - this.battleTime;
      if (lead <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.46 + (1 - Math.min(1, lead)) * 0.42;
      ctx.strokeStyle = '#d94b61';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      const coatGap = this.fatherTantrumCoatGap(ring);
      if (coatGap) {
        ctx.arc(
          ring.x,
          ring.y,
          ring.radius,
          coatGap.angle + coatGap.halfAngle,
          coatGap.angle + Math.PI * 2 - coatGap.halfAngle,
        );
      } else {
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.globalAlpha = Math.min(1, ctx.globalAlpha + 0.1);
      ctx.strokeStyle = '#9db4c4';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 9]);
      ctx.lineDashOffset = -2;
      ctx.stroke();
      if (coatGap) {
        ctx.setLineDash([]);
        ctx.fillStyle = '#8c8851';
        ctx.globalAlpha = Math.min(1, ctx.globalAlpha + 0.18);
        for (const side of [-1, 1]) {
          const markerAngle = coatGap.angle + coatGap.halfAngle * side;
          ctx.fillRect(
            Math.round(ring.x + Math.cos(markerAngle) * ring.radius - 2),
            Math.round(ring.y + Math.sin(markerAngle) * ring.radius - 2),
            4,
            4,
          );
        }
      }
      ctx.restore();
    }
    // 泪滴
    if (this.tearDrops.length) {
      ctx.save();
      ctx.fillStyle = '#9db4c4';
      for (const drop of this.tearDrops) {
        ctx.fillRect(Math.round(drop.x) - 1, Math.round(drop.y) - 2, 3, 5);
      }
      ctx.restore();
    }
    // 雨幕：固定方向斜扫全场；干地里不画雨——地面自然缺一块，不画发光安全圈
    if (this.rainActive && !this.reducedMotion) {
      const perpX = -RAIN_DIR_Y;
      const perpY = RAIN_DIR_X;
      const count = Math.floor(24 + this.rainIntensity * 34);
      ctx.save();
      ctx.strokeStyle = '#8fa3b0';
      ctx.globalAlpha = 0.2 + this.rainIntensity * 0.24;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let index = 0; index < count; index += 1) {
        const offset = ((index * 97) % 520) - 260;
        const travel = (this.visualTime * 310 + index * 53) % 700 - 350;
        const px = this.heroX + perpX * offset + RAIN_DIR_X * travel;
        const py = this.heroY + perpY * offset + RAIN_DIR_Y * travel;
        if (this.isDryPoint(px, py)) continue;
        ctx.moveTo(px, py);
        ctx.lineTo(px + RAIN_DIR_X * 11, py + RAIN_DIR_Y * 11);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 世界坐标点是否在干地里：一阶段父亲的背风侧，或二阶段落下的雨衣旁。 */
  private isDryPoint(x: number, y: number): boolean {
    if (this.fallenCoatX !== undefined && this.fallenCoatY !== undefined) {
      if (Math.hypot(x - this.fallenCoatX, y - this.fallenCoatY) < 46) return true;
    }
    const father = this.enemies.find((unit) => !unit.dead && unit.type === 'silent-father');
    if (father && (father.phase ?? 1) < 2) {
      // 干地不随父亲朝向旋转，只看固定雨向的背风侧
      const relX = x - father.x;
      const relY = y - father.y;
      const along = relX * RAIN_DIR_X + relY * RAIN_DIR_Y;
      const perp = Math.abs(relX * RAIN_DIR_Y - relY * RAIN_DIR_X);
      const widen = this.fatherBraceTimer > 0 ? 1.7 : 1;
      if (along > 6 && along < RAIN_DRY_LENGTH * widen && perp < RAIN_DRY_HALF_WIDTH * widen) return true;
    }
    return false;
  }

  /** 父亲战天气与二阶段弹幕：雨势起伏、《外面冷》、淋雨伤害、泪滴、跺脚雨圈。 */
  private updateFatherWeather(dt: number): void {
    if (this.rainActive) {
      this.rainClock += dt;
      const prevIntensity = this.rainIntensity;
      this.rainIntensity = 0.7 + Math.sin(this.rainClock / 2.2) * 0.3;
      const father = this.enemies.find((unit) => !unit.dead && unit.type === 'silent-father');
      if (!father) {
        // 父亲倒下，雨声渐停
        this.rainActive = false;
      } else {
        // 雨幕加重的瞬间触发《外面冷》：他停止追击，转身迎雨，干地扩大。不显示名字。
        if (prevIntensity <= 0.8 && this.rainIntensity > 0.8 && (father.phase ?? 1) < 2) {
          this.fatherBraceTimer = 3.4;
          father.windupTimer = 0;
          father.attackKind = undefined;
          this.playBossAnimation(father, 'father-brace', 3.4);
        }
        if (this.fatherBraceTimer > 0) this.fatherBraceTimer -= dt;
        this.heroInRain = !this.isDryPoint(this.heroX, this.heroY);
        this.rainTick += dt;
        if (this.rainTick >= 1.8) {
          this.rainTick = 0;
          if (this.heroInRain) {
            this.loseHealth(Math.max(1, Math.round(this.rainIntensity * 1.6)));
            this.burst('word', this.heroX, this.heroY - 54, 20, '#7f95a6', '淋着');
          }
        }
      }
    } else {
      this.heroInRain = false;
    }
    // 泪滴：不追踪；雨衣可挡
    if (this.tearDrops.length) {
      const kept: typeof this.tearDrops = [];
      for (const drop of this.tearDrops) {
        drop.x += drop.vx * dt;
        drop.y += drop.vy * dt;
        drop.life -= dt;
        if (drop.life <= 0) continue;
        if (this.fallenCoatX !== undefined && this.fallenCoatY !== undefined
          && Math.hypot(drop.x - this.fallenCoatX, drop.y - this.fallenCoatY) < 30) {
          // 落下的雨衣替你挡住了他的眼泪
          this.burst('hit', drop.x, drop.y, 8, '#9db4c4');
          continue;
        }
        if (Math.hypot(drop.x - this.heroX, drop.y - this.heroY) < 13) {
          this.hurtHero(3, '沉默的父亲');
          continue;
        }
        kept.push(drop);
      }
      this.tearDrops = kept;
    }
    // 跺脚雨圈：到点结算；雨衣附近是安全角
    if (this.tantrumRings.length) {
      const pending: typeof this.tantrumRings = [];
      for (const ring of this.tantrumRings) {
        if (this.battleTime < ring.at) { pending.push(ring); continue; }
        this.burst('ring', ring.x, ring.y, ring.radius, '#6f8296');
        this.feedback.vibrate([20]);
        const heroDist = Math.hypot(this.heroX - ring.x, this.heroY - ring.y);
        const sheltered = this.fallenCoatX !== undefined && this.fallenCoatY !== undefined
          && Math.hypot(this.heroX - this.fallenCoatX, this.heroY - this.fallenCoatY) < FATHER_COAT_SHELTER_RADIUS;
        if (!sheltered && Math.abs(heroDist - ring.radius) < FATHER_TANTRUM_RING_HALF_WIDTH) {
          this.hurtHero(ring.damage, '沉默的父亲');
        }
      }
      this.tantrumRings = pending;
    }
  }

  /**
   * 站住不动才想得起来的事：命运牌留下的记忆平时被战斗盖过去，
   * 只有停下来那几秒会自己浮上来。一条只浮一次。
   * 成年章鞋在追、电话在叫，玩家几乎停不下来——那一章的沉默是机制自然导致的，不用补。
   */
  private recallOneMemory(): boolean {
    if (this.state !== 'battle' || this.paused) return false;
    const nearest = this.nearestEnemy(this.heroX, this.heroY);
    if (nearest && Math.hypot(nearest.x - this.heroX, nearest.y - this.heroY) <= 140) return false;
    if (this.voiceCaption || this.captionTime > 0 || this.phoneRinging || this.phoneAnswer > 0
      || this.phoneTranscript || this.comboReveal || this.eliteAlertTime > 0
      || this.transitionTimer > 0 || this.lampChoice) return false;
    const fresh = this.memories.filter((line) => !this.recalledMemories.has(line));
    if (!fresh.length) return true;
    const line = fresh[Math.floor(this.random() * fresh.length)]!;
    this.recalledMemories.add(line);
    this.memoryRecall = { text: line, time: 4.6, duration: 4.6 };
    return true;
  }

  private say(message: string): void {
    this.toast = message;
    this.toastTime = 1.45;
  }

  private screenTransitionKind(from: ScreenState, to: ScreenState): ScreenTransitionKind {
    if (from === 'title' && to === 'origin') return 'first-breath';
    if (to === 'result') return 'lights-out';
    if (from === 'shop' || to === 'shop' || from === 'specialRoom' || to === 'specialRoom') return 'door';
    return 'page';
  }

  private beginScreenTransitionIfNeeded(): void {
    if (!this.lastRenderedState) {
      this.lastRenderedState = this.state;
      return;
    }
    if (this.lastRenderedState === this.state) return;
    const capture = this.transitionFrame.getContext('2d', { alpha: false });
    if (capture) {
      capture.imageSmoothingEnabled = false;
      capture.clearRect(0, 0, W, H);
      capture.drawImage(this.canvas, 0, 0, W, H);
    }
    const kind = this.screenTransitionKind(this.lastRenderedState, this.state);
    this.screenTransition = {
      from: this.lastRenderedState,
      to: this.state,
      kind,
      startedAt: performance.now(),
      duration: this.reducedMotion ? 90 : kind === 'lights-out' ? 760 : kind === 'first-breath' ? 680 : 520,
    };
    this.lastRenderedState = this.state;
  }

  private renderScreenTransition(): void {
    const transition = this.screenTransition;
    if (!transition) return;
    const raw = this.clamp((performance.now() - transition.startedAt) / transition.duration, 0, 1);
    const progress = raw * raw * (3 - 2 * raw);
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (transition.kind === 'lights-out') {
      // The old shutter transition created two long moving vertical edges. Use
      // one spatially uniform blackout so the ending still lands without
      // reintroducing the battlefield grid/edge language.
      if (progress < 0.5) {
        ctx.drawImage(this.transitionFrame, 0, 0, W, H);
        ctx.globalAlpha = progress / 0.5;
        ctx.fillStyle = '#090a0d';
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.globalAlpha = (1 - progress) / 0.5;
        ctx.fillStyle = '#090a0d';
        ctx.fillRect(0, 0, W, H);
      }
    } else {
      // Crossfade the whole recorded frame. Door seams, page edges and split
      // reveals all read as the same moving grid lines on a narrow phone.
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(this.transitionFrame, 0, 0, W, H);
      ctx.globalAlpha = Math.sin(progress * Math.PI)
        * (transition.kind === 'first-breath' ? 0.16 : transition.kind === 'door' ? 0.12 : 0.08);
      ctx.fillStyle = transition.kind === 'first-breath' ? '#e8e1d3' : '#090a0d';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    if (raw >= 1) this.screenTransition = undefined;
  }

  private render(): void {
    const ctx = this.ctx;
    this.beginScreenTransitionIfNeeded();
    ctx.fillStyle = '#111116';
    ctx.fillRect(0, 0, W, H);
    this.renderBackground();
    if (this.state === 'title') this.renderTitle();
    else if (this.state === 'origin') this.renderOrigin();
    else if (this.state === 'battle') this.renderBattle();
    else if (this.state === 'itemReward') this.renderItemReward();
    else if (this.state === 'storyDrop') this.renderStoryDrop();
    else if (this.state === 'shop') this.renderShop();
    else if (this.state === 'specialRoom') this.renderSpecialRoom();
    else if (this.state === 'fateEvent') this.renderFateEvent();
    else this.renderResult();
    this.renderVoiceCaption();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(174,35,55,${Math.min(0.32, this.flash * 1.25)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.state === 'battle' && !this.paused) this.renderLowHealthWarning();
    if (!this.paused && (this.state === 'battle' || this.state === 'fateEvent')) this.renderPauseButton();
    if (this.paused) this.renderPauseOverlay();
    if (this.state === 'title' && this.audioPromptOpen) this.renderAudioPrompt();
    this.renderScreenTransition();
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
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = `rgba(190,45,65,${pulse})`;
    for (let step = 0; step < 3; step += 1) {
      const inset = 5 + step * 4;
      const span = 18 - step * 4;
      ctx.fillRect(inset, inset, span, 3);
      ctx.fillRect(inset, inset, 3, span);
      ctx.fillRect(W - inset - span, inset, span, 3);
      ctx.fillRect(W - inset - 3, inset, 3, span);
      ctx.fillRect(inset, H - inset - 3, span, 3);
      ctx.fillRect(inset, H - inset - span, 3, span);
      ctx.fillRect(W - inset - span, H - inset - 3, span, 3);
      ctx.fillRect(W - inset - 3, H - inset - span, 3, span);
    }
    ctx.restore();
  }

  private renderVoiceCaption(): void {
    const active = this.voiceCaption;
    if (!active || this.paused || this.phoneTranscript) return;
    const cue = VOICE_CUES[active.id];
    const cleanText = cue.text
      .replace(/<#[\d.]+#>/g, ' ')
      .replace(/\([a-z-]+\)/g, '')
      .replace(/\s+/g, '')
      .trim();
    const elapsed = active.duration - active.time;
    const alpha = this.clamp(Math.min(elapsed / 0.2, active.time / 0.35), 0, 1);
    const y = VOICE_CAPTION_Y[this.state] ?? 486;
    const accent = active.treatment === 'swallowed'
      ? '#777084'
      : active.treatment === 'exhaled'
        ? UI_PALETTE.raincoatYellow
        : UI_PALETTE.hospitalBlueGray;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 无底框：字直接落在画面上，不再挖出一块黑板挡住战场和按钮。
    // 说话人一行压到很轻，正文才是被听见的那句。
    ctx.textAlign = 'center';
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    ctx.globalAlpha = alpha * 0.72;
    this.drawOutlinedText(`${cue.context.scene} · ${cue.context.speaker}`, 180, y + 16, accent);
    ctx.globalAlpha = alpha;
    ctx.font = `bold 11px ${UI_ARCHIVE_FONT_STACK}`;
    this.drawOutlinedWrapText(`“${cleanText}”`, 180, y + 37, 298, 15, 2, UI_PALETTE.paperLight);
    ctx.restore();
  }

  private renderMemoryRecall(): void {
    const active = this.memoryRecall;
    if (!active || this.paused) return;
    const elapsed = active.duration - active.time;
    const alpha = this.clamp(Math.min(elapsed / 0.28, active.time / 0.5), 0, 1);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    this.drawOutlinedText('想起', 180, 382, UI_PALETTE.oldRed);
    ctx.font = `bold 11px ${UI_ARCHIVE_FONT_STACK}`;
    this.drawOutlinedWrapText(`“${active.text}”`, 180, 405, 294, 15, 3, UI_PALETTE.paperLight);
    ctx.restore();
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
    // The battlefield is a worn memory, not a smooth digital gradient. Flat
    // bands keep the scene readable at native pixel scale and make age changes
    // feel embedded in the same continuous world.
    this.fillSteppedVertical(top, bottom, 12);
    this.renderStageClutterFloor(next, blend);
    // 六张背景各自是一幅完整场所，不平铺、不移动，也不靠滤镜伪造
    // 章节差异。世界坐标层只保留稀疏、可生长的小型物件。
    this.renderStageAtmosphere(stage, next, blend);
    this.renderBossArena();

    const shakeAmount = !this.reducedMotion && this.screenShake > 0 ? Math.ceil(this.screenShake * 16) : 0;
    const shakeX = shakeAmount ? Math.round(Math.sin(this.battleTime * 113) * shakeAmount) : 0;
    const shakeY = shakeAmount ? Math.round(Math.cos(this.battleTime * 97) * shakeAmount) : 0;
    ctx.save();
    ctx.translate(HERO_SCREEN_X - this.heroX + shakeX, HERO_SCREEN_Y - this.heroY + shakeY);
    this.renderLifePropClusters(stage, next, blend);
    this.renderCoinDrops();
    this.renderWorldEntities();
    this.renderHeroGrounding();
    for (const band of this.dangerBands) renderDangerBand(ctx, band);
    this.renderFatherWeather(ctx);
    this.renderProjectiles();
    this.renderBursts();
    this.renderEnemyThreatTelegraphs();
    this.renderEnemies();
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
    const shutdownTriggerActive = this.saveEffect?.kind === 'shutdown';
    const visibleEquipment = this.petGone && !shutdownTriggerActive
      ? this.items.filter((id) => id !== 'server-shutdown')
      : this.items;
    this.drawHero(this.heroX, this.heroY, HERO_WORLD_SCALE, visibleEquipment, heroFacing, heroMotion, heroActionFrame);
    ctx.restore();
  }

  private renderStageClutterFloor(next: StageSpec | undefined, blend: number): void {
    const currentFrame = stageClutterFloors.frame(this.encounterIndex);
    const nextFrame = next ? stageClutterFloors.frame(this.encounterIndex + 1) : null;
    if (!currentFrame && !nextFrame) return;
    const ctx = this.ctx;
    const transition = nextFrame ? this.clamp(blend, 0, 1) : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (currentFrame && transition < 1) {
      ctx.globalAlpha = 1 - transition;
      ctx.drawImage(currentFrame, 0, 0, W, H);
    }
    if (nextFrame && transition > 0) {
      ctx.globalAlpha = transition;
      ctx.drawImage(nextFrame, 0, 0, W, H);
    }
    ctx.restore();
  }

  private renderLifePropClusters(stage: StageSpec, next: StageSpec | undefined, blend: number): void {
    const ctx = this.ctx;
    const cell = 180;
    const minX = Math.floor((this.heroX - 320) / cell);
    const maxX = Math.floor((this.heroX + 320) / cell);
    const minY = Math.floor((this.heroY - 390) / cell);
    const maxY = Math.floor((this.heroY + 390) / cell);
    const currentIndex = this.encounterIndex;
    const nextIndex = Math.min(STAGES.length - 1, currentIndex + 1);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const clusterHash = this.cellHash(cx + 911, cy - 733);
        if (clusterHash % 100 >= 55) continue;
        const clusterX = cx * cell + cell / 2 + ((clusterHash >>> 5) % 71) - 35;
        const clusterY = cy * cell + cell / 2 + ((clusterHash >>> 13) % 69) - 34;
        const clusterCount = 2 + ((clusterHash >>> 21) % 2);

        for (let slot = 0; slot < clusterCount; slot += 1) {
          const [offsetX, offsetY] = LIFE_PROP_OFFSETS[slot]!;
          const slotHash = this.cellHash(cx * 7 + slot + 37, cy * 11 - slot - 19);
          const px = clusterX + offsetX + ((slotHash >>> 4) % 19) - 9;
          const py = clusterY + offsetY + ((slotHash >>> 10) % 17) - 8;
          const heroDistance = Math.hypot(px - this.heroX, py - this.heroY);
          const clearance = this.clamp((heroDistance - 64) / 52, 0, 1);
          if (clearance <= 0) continue;

          const variant = (slot + ((clusterHash >>> 3) % PROP_VARIANTS)) % PROP_VARIANTS;
          const currentScale = PROP_STAGE_SCALES[currentIndex]?.[variant] ?? 1;
          const nextScale = PROP_STAGE_SCALES[nextIndex]?.[variant] ?? 1;
          const switchAt = 0.08 + ((slotHash >>> 17) % 100) / 100 * 0.76;
          const localBlend = next
            ? this.clamp((blend - switchAt) / Math.max(0.12, 1 - switchAt), 0, 1)
            : 0;
          const emergence = localBlend * localBlend * (3 - 2 * localBlend);
          const currentSprite = this.worldProps.slice(currentIndex, variant);
          const nextSprite = next ? this.worldProps.slice(nextIndex, variant) : null;
          const shadowScale = Math.max(currentScale, nextScale);

          ctx.globalAlpha = (0.16 + emergence * 0.08) * clearance;
          ctx.fillStyle = '#07070a';
          const shadowWidth = Math.round(18 + shadowScale * 13);
          ctx.fillRect(Math.round(px - shadowWidth / 2), Math.round(py - 2), shadowWidth, 3);

          if (currentSprite && emergence < 1) {
            this.drawEmergingLifeProp(
              currentSprite,
              px,
              py,
              currentScale,
              0.86 * (1 - emergence) * clearance,
              1,
            );
          }
          if (nextSprite && emergence > 0) {
            this.drawEmergingLifeProp(
              nextSprite,
              px,
              py,
              nextScale,
              0.9 * emergence * clearance,
              emergence,
            );
            if (emergence < 0.86) {
              ctx.globalAlpha = 0.2 * (1 - emergence) * clearance;
              ctx.fillStyle = next?.propColor ?? stage.propColor;
              ctx.fillRect(Math.round(px - 8), Math.round(py - 3), 3, 1);
              ctx.fillRect(Math.round(px + 5), Math.round(py - 6), 2, 1);
            }
          }
        }
      }
    }
    ctx.restore();
  }

  private drawEmergingLifeProp(
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

  private renderStageAtmosphere(stage: StageSpec, next: StageSpec | undefined, blend: number): void {
    const ctx = this.ctx;
    const t = this.reducedMotion ? 0 : this.battleTime;
    const seed = this.runSeed >>> 0;
    const stageIndex = this.encounterIndex;
    applyPixelDiscipline(ctx);
    ctx.save();
    ctx.globalAlpha = 1;

    if (stageIndex === 0) {
      // Childhood: the room is too large. Dust drifts, and the floor under the
      // bed occasionally remembers two eyes.
      ctx.fillStyle = 'rgba(220,207,180,.42)';
      for (let index = 0; index < 18; index += 1) {
        const hash = this.cellHash(index - 4, stageIndex + 11);
        const x = (hash % 344) + 8;
        const y = 112 + ((hash >>> 9) % 360);
        const drift = Math.floor((t * (3 + (hash % 4)) + index * 19) % 18);
        if ((hash + Math.floor(t * 2)) % 5 < 3) ctx.fillRect(x, y + drift, 1 + (hash % 2), 1);
      }
    } else if (stageIndex === 1) {
      // School: loose paper scraps replace notebook rules; even broken rows
      // still read as a moving grid when the player scans the battlefield.
      ctx.fillStyle = 'rgba(174,190,198,.13)';
      for (let index = 0; index < 12; index += 1) {
        const hash = this.cellHash(index + 17, stageIndex + 31);
        const x = 24 + (hash % 312);
        const y = 124 + ((hash >>> 8) % 344);
        ctx.fillRect(x, y, 4 + (hash % 11), 2 + ((hash >>> 6) % 3));
      }
      ctx.fillStyle = 'rgba(159,53,72,.22)';
      const markX = 48 + Math.floor(((t * 16) % 260) / 4) * 4;
      const markY = 146 + ((Math.floor(t / 4) % 4) * 52);
      ctx.fillRect(markX, markY, 14, 2);
      ctx.fillRect(markX + 6, markY - 6, 2, 14);
    } else if (stageIndex === 2) {
      // 青年关不再绘制站台边线、枕木或扫描光柱；这些直线组合会被
      // 读成覆盖战场并持续移动的网格。
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
      // Middle age: scattered form scraps imply paperwork without rows,
      // columns or fluorescent bars spanning the arena.
      ctx.fillStyle = 'rgba(173,188,198,.09)';
      for (let index = 0; index < 14; index += 1) {
        const hash = this.cellHash(index + 43, stageIndex + 37);
        const x = 20 + (hash % 320);
        const y = 122 + ((hash >>> 9) % 356);
        ctx.fillRect(x, y, 3 + (hash % 10), 2 + ((hash >>> 7) % 4));
      }
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
    }

    if (!this.reducedMotion) this.renderAtmosphereSurprise(stageIndex, t, seed);
    if (next && blend > 0.01) {
      ctx.globalAlpha = Math.min(0.35, blend * 0.35);
      ctx.fillStyle = next.propColor;
      for (let index = 0; index < 12; index += 1) {
        const hash = this.cellHash(index + 71, stageIndex + 53);
        ctx.fillRect(18 + (hash % 324), 500 + ((hash >>> 8) % 42), 2 + (hash % 3), 2 + ((hash >>> 6) % 3));
      }
    }
    ctx.restore();
  }

  private drawBossArenaCross(x: number, y: number, size: number, color: string, alpha: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(Math.round(-size / 2), -2, Math.round(size), 4);
    ctx.fillRect(-2, Math.round(-size / 2), 4, Math.round(size));
    ctx.restore();
  }

  private drawBossArenaPaper(
    x: number,
    y: number,
    width: number,
    height: number,
    alpha: number,
    angle = 0,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#c8c1b1';
    ctx.fillRect(Math.round(-width / 2), Math.round(-height / 2), Math.round(width), Math.round(height));
    ctx.fillStyle = '#67646a';
    ctx.fillRect(Math.round(-width * 0.28), Math.round(-height * 0.12), Math.round(width * 0.38), 2);
    ctx.fillRect(Math.round(-width * 0.28), Math.round(height * 0.08), Math.round(width * 0.22), 2);
    ctx.restore();
  }

  /**
   * Boss 存活时接管整个战场的屏幕空间层。只画环境语义和真实招式状态，
   * 不画虚假碰撞区，也不使用会随镜头移动的网格、边框或地砖。
   */
  private renderBossArena(): void {
    const boss = this.enemies.find((enemy) => !enemy.dead && (enemy.boss || enemy.elite));
    if (!boss) return;

    const ctx = this.ctx;
    const time = this.reducedMotion ? 0 : this.visualTime;
    const bossX = HERO_SCREEN_X + (boss.x - this.heroX);
    const bossY = HERO_SCREEN_Y + (boss.y - this.heroY);
    const hpLoss = 1 - this.clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    ctx.save();
    applyPixelDiscipline(ctx);
    ctx.imageSmoothingEnabled = false;

    if (boss.type === 'closet-dark') {
      const phaseTwo = (boss.phase ?? 1) === 2 || boss.hp <= boss.maxHp * 0.5;
      const charge = (boss.windupTimer ?? 0) > 0
        ? 1 - this.clamp((boss.windupTimer ?? 0) / 0.85, 0, 1)
        : 0;
      ctx.fillStyle = `rgba(7,6,11,${(0.12 + hpLoss * 0.08).toFixed(3)})`;
      ctx.fillRect(0, 72, W, 474);

      // 衣柜只留一个宽大的不对称剪影，不画门板网格。
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = '#121016';
      ctx.fillRect(24, 104, 82, 122);
      ctx.fillStyle = '#26212a';
      ctx.fillRect(31, 111, 62, 104);
      ctx.fillStyle = '#0b0a0e';
      ctx.fillRect(62, 112, 31, 103);
      ctx.fillStyle = '#817769';
      ctx.fillRect(84, 162, 4, 4);

      if ((boss.windupTimer ?? 0) > 0 && boss.attackAngle !== undefined) {
        ctx.save();
        ctx.translate(bossX, bossY);
        ctx.rotate(boss.attackAngle);
        ctx.globalAlpha = 0.09 + charge * 0.18;
        ctx.fillStyle = '#050508';
        ctx.beginPath();
        ctx.moveTo(10, -18);
        ctx.lineTo(390, -62 - charge * 22);
        ctx.lineTo(390, 62 + charge * 22);
        ctx.lineTo(10, 18);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      if (phaseTwo) {
        ctx.fillStyle = '#c7bfae';
        ctx.globalAlpha = 0.32 + Math.sin(time * 2.1) * 0.06;
        for (const [x, y] of [[140, 154], [286, 250], [88, 430], [278, 466]] as const) {
          ctx.fillRect(x, y, 4, 3);
          ctx.fillRect(x + 10, y, 4, 3);
        }
      }
    } else if (boss.type === 'uniform-answer') {
      const examCharge = this.clamp(((boss.mechTimer ?? 0) - 6.4) / 1.6, 0, 1);
      ctx.fillStyle = `rgba(203,197,183,${(0.045 + examCharge * 0.035).toFixed(3)})`;
      ctx.fillRect(0, 72, W, 474);
      const papers = [
        [54, 144, 54, 34, -0.08], [302, 166, 48, 30, 0.07],
        [74, 332, 62, 38, 0.05], [296, 386, 58, 36, -0.06], [176, 488, 68, 36, 0.03],
      ] as const;
      papers.forEach(([x, y, width, height, angle], index) => {
        this.drawBossArenaPaper(x, y, width, height, 0.09 + (index % 2) * 0.025, angle);
      });
      const crossAlpha = 0.2 + examCharge * 0.46;
      this.drawBossArenaCross(76, 226, 28 + examCharge * 8, '#ad3f51', crossAlpha);
      this.drawBossArenaCross(286, 306, 24 + examCharge * 10, '#ad3f51', crossAlpha * 0.9);
      this.drawBossArenaCross(118, 454, 20 + examCharge * 8, '#ad3f51', crossAlpha * 0.74);
      ctx.fillStyle = '#a93d4f';
      ctx.globalAlpha = 0.08 + examCharge * 0.16;
      ctx.fillRect(126, 91, 108, 10);
      ctx.fillRect(146, 105, 68, 5);
    } else if (boss.type === 'last-bus') {
      const phase = boss.phase ?? 0;
      const arrival = phase === 1 ? this.clamp((boss.mechTimer ?? 0) / 0.8, 0, 1) : phase === 2 ? 1 : 0;
      ctx.fillStyle = `rgba(8,14,17,${(0.07 + arrival * 0.11).toFixed(3)})`;
      ctx.fillRect(0, 72, W, 474);

      // 站牌和黄色提示块都是断开的固定地标，不拼成站台网格。
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#17191b';
      ctx.fillRect(116, 88, 128, 27);
      const signalColors = phase === 1 || phase === 2
        ? ['#a94150', '#a94150', '#d3b65f']
        : ['#50494c', '#6d654d', '#d3b65f'];
      signalColors.forEach((color, index) => {
        ctx.fillStyle = color;
        ctx.globalAlpha = index === 2 ? 0.52 : 0.3 + arrival * 0.44;
        ctx.fillRect(141 + index * 34, 97, 8, 8);
      });
      const platformMarks = [[28, 438], [82, 432], [141, 442], [205, 434], [268, 441], [319, 430]] as const;
      ctx.fillStyle = '#d1b45d';
      ctx.globalAlpha = 0.2 + arrival * 0.26;
      for (const [x, y] of platformMarks) {
        ctx.fillRect(x, y, 17, 5);
        ctx.fillRect(x + 5, y + 8, 9, 3);
      }
      if (arrival > 0) {
        ctx.fillStyle = '#a23e4e';
        ctx.globalAlpha = 0.12 + arrival * 0.26;
        for (const [x, y] of [[18, 142], [332, 176], [24, 334], [326, 362], [46, 508], [306, 514]] as const) {
          ctx.fillRect(x, y, 10, 10);
          ctx.fillRect(x + 3, y + 3, 4, 4);
        }
      }
    } else if (boss.type === 'silent-father') {
      const phaseTwo = (boss.phase ?? 1) === 2;
      ctx.fillStyle = `rgba(22,31,31,${(0.045 + (phaseTwo ? 0.035 : 0)).toFixed(3)})`;
      ctx.fillRect(0, 72, W, 474);

      // 家里只有一扇门、一盏灯和一张没有人坐的饭桌。
      ctx.globalAlpha = phaseTwo ? 0.24 : 0.32;
      ctx.fillStyle = '#171b1a';
      ctx.fillRect(276, 104, 50, 116);
      ctx.fillStyle = '#30352f';
      ctx.fillRect(283, 112, 36, 101);
      ctx.fillStyle = '#cfb266';
      ctx.globalAlpha = phaseTwo ? 0.12 : 0.24;
      ctx.fillRect(293, 130, 16, 12);
      ctx.fillStyle = '#171918';
      ctx.globalAlpha = 0.28;
      ctx.fillRect(42, 432, 112, 12);
      ctx.fillRect(52, 444, 8, 42);
      ctx.fillRect(136, 444, 8, 42);

      if (phaseTwo) {
        ctx.fillStyle = '#d6c07b';
        ctx.globalAlpha = 0.25;
        for (const [x, y, width, height] of [
          [288, 120, 5, 2], [310, 124, 7, 2], [284, 144, 6, 3], [312, 148, 5, 3],
        ] as const) ctx.fillRect(x, y, width, height);
        ctx.fillStyle = '#a9c4bd';
        ctx.globalAlpha = 0.18;
        for (let index = 0; index < 14; index += 1) {
          const hash = this.cellHash(index + 109, 73);
          const x = hash % W;
          const y = 92 + ((hash >>> 8) % 410);
          ctx.fillRect(x, y, 1, 7 + (hash % 5));
        }
      }
    } else if (boss.type === 'debt-collector') {
      const billActive = this.billTimer > 0;
      const urgency = billActive ? 1 - this.clamp(this.billTimer / 3.5, 0, 1) : 0;
      const collectionCharge = this.clamp(((boss.mechTimer ?? 0) - 5.5) / 1.5, 0, 1);
      const pressure = Math.max(urgency, collectionCharge * 0.72);
      ctx.fillStyle = `rgba(28,31,34,${(0.05 + pressure * 0.075).toFixed(3)})`;
      ctx.fillRect(0, 72, W, 474);
      const inset = Math.round(pressure * 18);
      const statements = [
        [46 + inset, 142, 70, 42, -0.08], [314 - inset, 190, 66, 40, 0.07],
        [50 + inset, 410, 72, 44, 0.06], [308 - inset, 468, 68, 42, -0.06],
      ] as const;
      statements.forEach(([x, y, width, height, angle]) => {
        this.drawBossArenaPaper(x, y, width, height, 0.11 + pressure * 0.08, angle);
      });
      const stampAlpha = 0.22 + pressure * 0.52;
      this.drawBossArenaCross(60 + inset, 144, 20, '#b34b4f', stampAlpha);
      this.drawBossArenaCross(301 - inset, 194, 18, '#b34b4f', stampAlpha * 0.9);
      this.drawBossArenaCross(62 + inset, 412, 22, '#b34b4f', stampAlpha * 0.8);
      this.drawBossArenaCross(297 - inset, 470, 19, '#b34b4f', stampAlpha * 0.86);
    } else if (boss.type === 'lamp-keeper') {
      const centerX = this.darkActive ? HERO_SCREEN_X + (this.darkCX - this.heroX) : HERO_SCREEN_X;
      const centerY = this.darkActive ? HERO_SCREEN_Y + (this.darkCY - this.heroY) : HERO_SCREEN_Y;
      const lightRadius = this.darkActive ? Math.max(70, Math.min(132, this.darkR)) : 112;
      ctx.fillStyle = 'rgba(5,6,8,.16)';
      ctx.fillRect(0, 72, W, 474);
      ctx.fillStyle = 'rgba(205,181,108,.075)';
      ctx.beginPath();
      this.addPixelOctagonPath(ctx, centerX, centerY, lightRadius);
      ctx.fill();
      ctx.fillStyle = '#c9c8bd';
      ctx.globalAlpha = 0.18;
      for (let index = 0; index < 18; index += 1) {
        const hash = this.cellHash(index + 151, 91);
        const x = 12 + (hash % 336);
        const y = 94 + ((hash >>> 8) % 418);
        const drift = this.reducedMotion ? 0 : Math.floor((time * 3 + index * 7) % 10);
        ctx.fillRect(x, y + drift, 1 + (hash % 2), 1 + (hash % 2));
      }
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

  private cellHash(cx: number, cy: number): number {
    let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) ^ this.runSeed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
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

  private renderLampChoice(): void {
    const choice = this.lampChoice;
    if (!choice) return;
    const ctx = this.ctx;
    const progress = this.clamp(choice.timer / choice.total, 0, 1);
    const pulse = this.reducedMotion ? 0 : Math.sin(this.visualTime * 7) * 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `8px ${UI_FONT_STACK}`;
    for (const slot of [0, 1] as const) {
      const x = choice.x[slot];
      const y = choice.y;
      ctx.fillStyle = 'rgba(207,184,111,.14)';
      ctx.beginPath();
      ctx.arc(x, y, 28 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d3bc72';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
      this.drawItemSymbol(choice.items[slot], x, y - 2, 15);
      const label = getItem(choice.items[slot]).name.slice(0, 7);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#17161a';
      ctx.strokeText(label, x, y + 35);
      ctx.fillStyle = '#eee5cf';
      ctx.fillText(label, x, y + 35);
    }
    ctx.restore();
  }

  private renderPraiseConsult(): void {
    const consult = this.praiseConsult;
    if (!consult) return;
    const ctx = this.ctx;
    const progress = this.clamp(consult.timer / consult.total, 0, 1);
    const pulse = this.reducedMotion ? 0 : Math.sin(this.visualTime * 7) * 2;
    ctx.save();
    ctx.translate(Math.round(consult.x), Math.round(consult.y));
    ctx.fillStyle = 'rgba(179,61,73,.08)';
    ctx.strokeStyle = '#b84954';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-20 - pulse, -20 - pulse, 40 + pulse * 2, 40 + pulse * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#d7bd72';
    ctx.beginPath();
    ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#b84954';
    ctx.font = `bold 20px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('？', 0, 1);
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#17161a';
    ctx.strokeText('你怎么看', 0, 38);
    ctx.fillStyle = '#eee5cf';
    ctx.fillText('你怎么看', 0, 38);
    ctx.restore();
  }

  private renderPraisePaperZones(): void {
    const ctx = this.ctx;
    for (const zone of this.praisePaperZones) {
      const fade = this.clamp(zone.life / Math.min(2, zone.total), 0, 1);
      const skew = ((Math.abs(Math.floor(zone.x + zone.y)) % 5) - 2) * 0.035;
      ctx.save();
      ctx.globalAlpha = 0.35 + fade * 0.45;
      ctx.translate(Math.round(zone.x), Math.round(zone.y));
      ctx.rotate(skew);
      ctx.fillStyle = '#d7d0bd';
      ctx.strokeStyle = '#655d52';
      ctx.lineWidth = 1;
      ctx.fillRect(-17, -10, 34, 20);
      ctx.strokeRect(-17, -10, 34, 20);
      ctx.fillStyle = '#b84954';
      ctx.fillRect(-12, -5, 18, 2);
      ctx.fillStyle = '#82796b';
      ctx.fillRect(-12, 0, 24, 1);
      ctx.fillRect(-12, 4, 20, 1);
      ctx.restore();
    }
  }

  private renderPhoneCalls(): void {
    if (!this.phoneRinging || this.phoneCalls.length === 0) return;
    const phone = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'ringing-phone');
    if (!phone) return;
    const frame = Math.floor(this.visualTime * 8) % 4;
    const frequency = this.phoneRingWindow < 2 ? 12 : this.phoneRingWindow < 3 ? 8 : 5;
    const pulse = this.reducedMotion ? 0.5 : (Math.sin(this.visualTime * frequency) + 1) * 0.5;
    for (const call of this.phoneCalls) {
      this.drawPixelWarningRing(call.x, call.y, 36 + pulse * 7, '#cfe4ea', 0.34 + pulse * 0.44, 1, 24);
      this.drawPixelWarningRing(call.x, call.y, 48 + pulse * 5, '#6f9099', 0.18 + pulse * 0.24, 1, 28);
      if ((phone.phase ?? 1) !== 2 || Math.hypot(call.x - phone.x, call.y - phone.y) < 4) continue;
      const proxy: EnemyUnit = { ...phone, x: call.x, y: call.y };
      this.pixelBossSkills.draw(this.ctx, proxy, 'phone-p1-ring', frame, this.heroX < call.x, 0.68);
    }
  }

  private renderPhoneTranscript(): void {
    const transcript = this.phoneTranscript;
    if (!transcript) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = this.clamp(transcript.timer / 0.28, 0, 1);
    drawCutCornerPanel(ctx, 34, 98, W - 68, 52, 'rgba(10,12,16,.88)', '#667d83', 2, 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9fb8bd';
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    ctx.fillText(transcript.speaker, 46, 113);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.textAlign = 'center';
    ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(`「${transcript.text}」`, 180, 130, 260, 13, 2);
    ctx.restore();
  }

  private drawXiaoZhangFigure(
    x: number,
    y: number,
    faceLeft: boolean,
    hostile = false,
    attackProgress = 0,
    action?: XiaoZhangPixelAction,
    display = 56,
  ): void {
    const ctx = this.ctx;
    const resolvedAction = action ?? (hostile ? 'backstab' : 'idle');
    const atlasFrame = resolvedAction === 'idle'
      ? Math.floor(this.visualTime * 3) % 4
      : resolvedAction === 'follow'
        ? Math.floor(this.visualTime * 7) % 4
        : Math.min(3, Math.floor(this.clamp(attackProgress, 0, 0.999) * 4));
    if (this.pixelXiaoZhang.draw(ctx, x, y, resolvedAction, atlasFrame, faceLeft, display)) return;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (faceLeft) ctx.scale(-1, 1);
    const lean = hostile ? Math.round(attackProgress * 4) : 0;
    ctx.fillStyle = 'rgba(8,8,10,.32)';
    ctx.fillRect(-13, 2, 28, 3);
    if (hostile) {
      ctx.fillStyle = '#7f3342';
      for (const [spikeY, spikeLength] of [[-27, 13], [-20, 17], [-13, 12]] as const) {
        ctx.beginPath();
        ctx.moveTo(-7, spikeY - 4);
        ctx.lineTo(-7 - spikeLength, spikeY);
        ctx.lineTo(-7, spikeY + 4);
        ctx.fill();
      }
    }
    ctx.translate(lean, 0);
    ctx.fillStyle = '#2e343a';
    ctx.fillRect(-8, -12, 6, 13);
    ctx.fillRect(3, -12, 6, 13);
    ctx.fillStyle = '#15171b';
    ctx.fillRect(-10, -2, 9, 4);
    ctx.fillRect(2, -2, 10, 4);
    ctx.fillStyle = '#d4d0c4';
    ctx.fillRect(-10, -31, 20, 20);
    ctx.fillStyle = '#8e9698';
    ctx.fillRect(-13, -29, 4, 13);
    ctx.fillRect(10, -29, 4, 13);
    ctx.fillStyle = hostile ? '#8b3847' : '#b9a45f';
    ctx.fillRect(-1, -31, 2, 14);
    ctx.fillStyle = '#ece2ce';
    ctx.fillRect(-7, -43, 14, 13);
    ctx.fillStyle = '#29272a';
    ctx.fillRect(-8, -45, 15, 5);
    ctx.fillRect(-8, -41, 4, 7);
    ctx.fillStyle = '#4b3d35';
    ctx.fillRect(3, -38, 2, 2);
    // 同一张偏黄工牌贯穿友军、背叛者与中年纸箱。
    ctx.strokeStyle = '#8a7548';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -29);
    ctx.lineTo(5, -23);
    ctx.stroke();
    ctx.fillStyle = '#d8c06f';
    ctx.fillRect(2, -24, 7, 6);
    ctx.fillStyle = '#6e5b36';
    ctx.fillRect(4, -22, 3, 1);
    if (hostile) {
      ctx.fillStyle = '#8b3847';
      ctx.fillRect(10, -25, 9 + Math.round(attackProgress * 5), 4);
      ctx.fillStyle = '#d7d1c3';
      ctx.fillRect(18 + Math.round(attackProgress * 5), -26, 5, 2);
    } else {
      ctx.fillStyle = '#d8c9a4';
      ctx.fillRect(11, -24, 8, 6);
      ctx.fillStyle = '#756a57';
      ctx.fillRect(13, -22, 4, 1);
    }
    ctx.restore();
  }

  private drawXiaoZhangBadgeLocal(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#b59b59';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, -17);
    ctx.lineTo(0, -6);
    ctx.lineTo(7, -17);
    ctx.stroke();
    ctx.fillStyle = '#d9c47a';
    ctx.fillRect(-8, -7, 16, 11);
    ctx.fillStyle = '#675a3e';
    ctx.fillRect(-5, -4, 10, 2);
    ctx.fillRect(-5, 0, 6, 1);
    ctx.restore();
  }

  private renderWorldEntities(): void {
    const ctx = this.ctx;
    this.renderPraisePaperZones();
    this.renderPhoneCalls();
    this.renderPraiseConsult();
    this.renderLampChoice();
    if (this.xiaoZhangWorld) {
      const { x, y } = this.xiaoZhangWorld;
      const waiting = this.xiaoZhangDecision === 'none';
      const pulse = this.reducedMotion ? 0 : Math.sin(this.visualTime * 4) * 2;
      ctx.save();
      ctx.fillStyle = waiting ? 'rgba(205,181,106,.13)' : 'rgba(115,110,102,.09)';
      ctx.beginPath();
      ctx.arc(x, y - 18, 30 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      this.drawXiaoZhangFigure(x, y, this.heroX < x, false, 0, 'idle');
      ctx.fillStyle = waiting ? '#e1d2a4' : '#9a9489';
      ctx.font = `bold 8px ${UI_FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.fillText(waiting ? '一起入职的小张' : '小张还站在那里', x, y + 17);
    }
    if (this.xiaoZhangAlly) {
      const ally = this.xiaoZhangAlly;
      const shooting = ally.fireCooldown > 0.64 && ally.fireCooldown <= 0.92;
      const shootingProgress = shooting ? this.clamp((0.92 - ally.fireCooldown) / 0.28, 0, 1) : 0;
      this.drawXiaoZhangFigure(
        ally.x,
        ally.y,
        ally.faceLeft,
        false,
        shootingProgress,
        shooting ? 'shoot' : 'follow',
      );
      ctx.fillStyle = '#d7c98f';
      ctx.font = `bold 8px ${UI_FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.fillText('小张 · 搭把手', ally.x, ally.y + 15);
    }
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
    ctx.fillStyle = 'rgba(5,5,8,.68)';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    this.addPixelOctagonPath(ctx, sx, sy, maxRadius);
    ctx.fill('evenodd');
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
    const panelY = this.eliteAlertTime > 0 ? 132 : 96;
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
      // The replacement companion performs the save beside the hero.
    } else {
      const frame = saveFrame(effect.kind as SaveKind, progress);
      if (frame) {
        const size = 76;
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 1 - progress * progress;
        if (effect.kind === 'photo') ctx.filter = 'grayscale(1) contrast(1.12)';
        ctx.drawImage(frame, HERO_SCREEN_X - size / 2, HERO_SCREEN_Y - 66 - size / 2, size, size);
      }
    }
    ctx.restore();
  }

  /** 《雪花屏》的常驻代价：低频闪过一帧散点噪声，不使用扫描线或网格。 */
  private renderSnowInterference(): void {
    if (this.snowFlickerTimer <= 0) return;
    const ctx = this.ctx;
    const phase = Math.floor((this.battleTime + this.visualTime) * 1000);
    ctx.save();
    ctx.globalAlpha = this.reducedMotion ? 0.1 : 0.16;
    for (let index = 0; index < 52; index += 1) {
      const x = (phase * 17 + index * 97) % W;
      const y = (phase * 7 + index * 53) % H;
      const size = 1 + ((phase + index * 11) % 3);
      ctx.fillStyle = index % 4 === 0 ? '#17171b' : '#eee9df';
      ctx.fillRect(x, y, size, size);
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

  private renderEdgeHint(x?: number, y?: number, color = '#ffffff', pulseFrequency = 5): void {
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
    ctx.beginPath(); ctx.arc(cx, cy, 5 + Math.sin(this.battleTime * pulseFrequency) * 1.5, 0, Math.PI * 2); ctx.fill();
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

  private actionState(rect: { x: number; y: number; width: number; height: number }): { hovered: boolean; pressed: boolean; offset: number } {
    const hovered = this.pointerInside && pointInRect({ x: this.pointerX, y: this.pointerY }, rect);
    const pressed = hovered && this.pointerDown;
    return { hovered, pressed, offset: pressed ? 1 : 0 };
  }

  private drawBreathActionButton(
    rect: { x: number; y: number; width: number; height: number },
    label: string,
    _accent: string,
    enabled = true,
    focused = false,
  ): void {
    const ctx = this.ctx;
    const interaction = this.actionState(rect);
    const active = interaction.hovered || focused;
    const offset = interaction.offset;
    ctx.save();
    ctx.translate(0, offset);
    const ink = enabled ? (active ? '#b92f49' : UI_PALETTE.oldRed) : '#55484c';
    let fontSize = rect.height >= 52 ? 14 : rect.height >= 38 ? 11 : 9;
    do {
      ctx.font = `bold ${fontSize}px ${UI_ARCHIVE_FONT_STACK}`;
      if (ctx.measureText(label).width <= rect.width - 22) break;
      fontSize -= 1;
    } while (fontSize > 8);
    const seed = 300 + Math.round(rect.x * 3 + rect.y * 5 + rect.width);
    const state = !enabled ? 'disabled' : interaction.pressed ? 'pressed' : active ? 'hover' : 'normal';
    const frameDrawn = uiTextures.drawStampButtonFrame(ctx, rect.x, rect.y, rect.width, rect.height, state);
    if (!frameDrawn) {
      drawRedStamp(ctx, rect.x, rect.y, rect.width, rect.height, '', seed, ink, ink, 'rgba(0,0,0,0)', fontSize);
    }
    ctx.fillStyle = ink;
    ctx.font = `bold ${fontSize}px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.textBaseline = 'alphabetic';
    if (active && enabled) this.drawFocusCorners(rect.x, rect.y, rect.width, rect.height, '#d66a7c');
    ctx.restore();
  }

  private renderTitleLifePath(intro: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#121318';
    ctx.fillRect(0, 0, W, H);
    if (this.titleCover.complete && this.titleCover.naturalWidth === W && this.titleCover.naturalHeight === H) {
      ctx.save();
      ctx.globalAlpha = this.clamp(intro / 0.55, 0, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.titleCover, 0, 0, W, H);
      ctx.restore();
    } else {
      this.fillSteppedVertical('#312a2b', '#17191d', 10);
    }
    ctx.fillStyle = 'rgba(7,8,10,.28)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(7,8,10,.32)';
    ctx.fillRect(0, 0, W, 142);
    ctx.fillStyle = 'rgba(7,8,10,.22)';
    ctx.fillRect(46, 446, 268, 178);
    ctx.globalAlpha = 0.08;
    drawDeterministicWear(ctx, 0, 0, W, H, 20260724, 4, '#c9c1b2', 1);
    ctx.globalAlpha = 1;
  }

  private renderTitle(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    const elapsed = Math.max(0, (performance.now() - this.titleStartedAt) / 1000);
    const intro = this.reducedMotion ? 1 : this.clamp(elapsed / 1.7, 0, 1);
    this.renderTitleLifePath(intro);

    ctx.textAlign = 'center';
    ctx.globalAlpha = this.clamp((intro - 0.02) / 0.28, 0, 1);
    ctx.fillStyle = UI_PALETTE.paper;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('从第一口气，到最后一盏灯。', 180, 32);

    ctx.save();
    ctx.globalAlpha = this.clamp((intro - 0.2) / 0.3, 0, 1);
    ctx.translate(0, Math.round((1 - intro) * 6));
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(5,6,8,.76)';
    ctx.font = `bold 42px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('这一身', 182, 94);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 42px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('这一身', 180, 92);
    ctx.fillStyle = UI_PALETTE.paper;
    ctx.font = `11px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('这一生，最后都穿成了这一身。', 180, 122);
    ctx.restore();

    const heroReveal = this.clamp((intro - 0.38) / 0.34, 0, 1);
    ctx.globalAlpha = heroReveal;
    const heroY = 340 + Math.round((1 - heroReveal) * 9);
    this.drawHero(180, heroY, 1.48, []);
    const breathPulse = this.reducedMotion ? 0.5 : (Math.sin(this.visualTime * 2.2) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = 0.38 + breathPulse * 0.42;
    ctx.strokeStyle = UI_PALETTE.breath;
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.addPixelOctagonPath(ctx, 211, heroY - 39, 4 + Math.round(breathPulse * 2));
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = this.clamp((intro - 0.58) / 0.28, 0, 1);
    drawLifeChapterTrack(ctx, 62, 418, 236, 8, 0, '降生|童年|少年|青年|成年|中年|老年|死亡', 0);

    ctx.globalAlpha = this.clamp((intro - 0.7) / 0.25, 0, 1);
    this.drawBreathActionButton(TITLE_START_RECT, '开始呼吸', UI_PALETTE.hospitalBlueGray);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('从第一口气开始', 180, 563);

    ctx.globalAlpha = 1;
    this.drawBreathActionButton(
      TITLE_AUDIO_RECT,
      this.feedback.audioEnabled() ? '声音开' : '声音关',
      this.feedback.audioEnabled() ? UI_PALETTE.hospitalBlueGray : '#57585d',
    );
  }

  private renderAudioPrompt(): void {
    const ctx = this.ctx;
    const elapsed = Math.max(0, (performance.now() - this.audioPromptStartedAt) / 1000);
    const appear = this.reducedMotion ? 1 : this.clamp(elapsed / 0.24, 0, 1);
    const eased = 1 - (1 - appear) * (1 - appear);
    ctx.fillStyle = `rgba(5,5,8,${(0.82 * eased).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(0, Math.round((1 - eased) * 12));
    ctx.globalAlpha = eased;
    drawCutCornerPanel(ctx, 24, 188, 312, 248, '#17181d', UI_PALETTE.hospitalBlueGray, 4, 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 18px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('要听见这一生吗', 180, 232);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `11px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText('广播、电话和没说完的话，会在对应的人生现场出现。推荐开启，才能听全叙事线索。', 180, 266, 264, 17, 3);
    ctx.fillStyle = '#8f8990';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('只播放预置音频，不使用麦克风', 180, 326);

    this.drawBreathActionButton(AUDIO_PROMPT_ENABLE_RECT, '听见这一生', UI_PALETTE.hospitalBlueGray);
    this.drawBreathActionButton(AUDIO_PROMPT_MUTE_RECT, '安静地开始', '#606168');
    ctx.textAlign = 'center';
    const recommendX = AUDIO_PROMPT_ENABLE_RECT.x + AUDIO_PROMPT_ENABLE_RECT.width / 2;
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.fillRect(recommendX - 27, AUDIO_PROMPT_ENABLE_RECT.y - 19, 54, 14);
    ctx.fillStyle = UI_PALETTE.night;
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    ctx.fillText('推荐开启', recommendX, AUDIO_PROMPT_ENABLE_RECT.y - 9);
    ctx.restore();
  }

  private renderOrigin(): void {
    if (this.aiOriginState === 'requesting' || this.aiOriginState === 'idle' || !this.origin) {
      if (this.aiOriginState === 'error') this.renderOriginError();
      else this.renderOriginLoading();
      return;
    }
    if (this.originLedgerOpen && this.ledgerEntries.length) {
      this.renderOriginLedger();
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
    drawArchiveFrame(ctx, 10, 10, 340, 620, UI_PALETTE.paper, UI_PALETTE.ink, UI_PALETTE.oldRed);
    drawPaperFold(ctx, 319, 17, 24, UI_PALETTE.paper, '#b8ad99', UI_PALETTE.ink);
    ctx.globalAlpha = 0.18;
    drawDeterministicWear(ctx, 20, 20, 320, 596, 701, 7, '#8f8577', 1);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 15px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('出生登记处 · 已落档', 30, 47);
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

    drawStitchDivider(ctx, 29, 425, 302, 'horizontal', '#877d6e', 5, 3);
    ctx.fillStyle = '#514b43';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('故事留下的底色', 30, 446);
    const revealTraits = progress > 0.7;
    ctx.globalAlpha = revealTraits ? 1 : 0.22;
    if (!traits.length) {
      ctx.fillStyle = UI_PALETTE.ink;
      ctx.font = `bold 10px ${UI_FONT_STACK}`;
      ctx.fillText('出生那天，一切都是 1.00。', 30, 482);
    } else {
      traits.slice(0, 2).forEach((trait, index) => {
        const y = 469 + index * 42;
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

    this.drawBreathActionButton(
      ORIGIN_LEDGER_RECT,
      this.ledgerEntries.length ? `往前翻 · ${this.ledgerEntries.length}` : '前页空白',
      UI_PALETTE.oldRed,
      this.ledgerEntries.length > 0,
    );
    ctx.textAlign = 'center';
    this.drawBreathActionButton(
      ORIGIN_CONTINUE_RECT,
      this.originStoryComplete() ? '带着这副底色出门' : '点一下，让档案写完',
      UI_PALETTE.oldRed,
    );
  }

  private renderOriginLedger(): void {
    const entry = this.ledgerEntries[this.ledgerPage];
    if (!entry) {
      this.originLedgerOpen = false;
      return;
    }
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    ctx.fillStyle = UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);
    drawArchiveFrame(ctx, 10, 10, 340, 620, '#c8bfad', UI_PALETTE.ink, UI_PALETTE.oldRed);
    drawPaperFold(ctx, 17, 17, 24, '#c8bfad', '#a99f8d', UI_PALETTE.ink);
    ctx.globalAlpha = 0.2;
    drawDeterministicWear(ctx, 20, 20, 320, 596, 810 + entry.runSeed, 6, '#71695f', 1);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 15px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('《这一身》名册', 30, 47);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#5e574d';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`旧页 ${this.ledgerPage + 1} / ${this.ledgerEntries.length}`, 323, 46);
    drawStitchDivider(ctx, 29, 59, 302, 'horizontal', '#877d6e', 5, 3);

    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(entry.won ? '已封卷 · 放下了' : '写到这里', 30, 82);
    ctx.fillStyle = UI_PALETTE.ink;
    const identity = `《${entry.nickname}》`;
    let identitySize = 23;
    do {
      ctx.font = `bold ${identitySize}px ${UI_ARCHIVE_FONT_STACK}`;
      if (ctx.measureText(identity).width <= 292) break;
      identitySize -= 1;
    } while (identitySize > 15);
    ctx.fillText(this.fitText(identity, 292), 30, 115);
    ctx.fillStyle = '#5e574d';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`第 ${entry.runSeed.toString(16).toUpperCase().padStart(8, '0')} 号`, 30, 138);
    ctx.fillText(this.fitText(entry.title, 184), 142, 138);

    drawStitchDivider(ctx, 29, 155, 302, 'horizontal', '#877d6e', 5, 3);
    ctx.fillStyle = '#514b43';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('活到', 30, 179);
    ctx.fillText('死在谁手里', 30, 223);
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 13px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(entry.reachedAge, 88, 179);
    ctx.fillStyle = entry.won ? '#4f7565' : UI_PALETTE.oldRed;
    ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(this.fitText(entry.endedBy, 236), 88, 223);

    ctx.strokeStyle = '#756d62';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 259);
    ctx.lineTo(330, 259);
    ctx.stroke();
    for (let index = 0; index < AGE_LABELS.length; index += 1) {
      const x = 35 + index * 58;
      const reached = index <= entry.reachedStage;
      ctx.fillStyle = reached ? (index === entry.reachedStage ? UI_PALETTE.oldRed : UI_PALETTE.ink) : '#918879';
      ctx.fillRect(x, 255, 9, 9);
      ctx.textAlign = 'center';
      ctx.fillStyle = reached ? '#4d473f' : '#948b7c';
      ctx.font = `8px ${UI_FONT_STACK}`;
      ctx.fillText(AGE_LABELS[index]!, x + 4, 278);
    }

    drawStitchDivider(ctx, 29, 296, 302, 'horizontal', '#877d6e', 5, 3);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#514b43';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`最后那身 · ${entry.items.length} 件`, 30, 317);
    const visibleItems = entry.items.slice(-8);
    if (!visibleItems.length) {
      ctx.fillStyle = '#625b51';
      ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('什么也没来得及穿上。', 30, 351);
    } else {
      visibleItems.forEach((id, index) => {
        const column = index % 4;
        const row = Math.floor(index / 4);
        const x = 37 + column * 79;
        const y = 339 + row * 50;
        this.drawItemSymbol(id, x + 10, y + 8, 10);
        ctx.fillStyle = '#4f4941';
        ctx.font = `8px ${UI_FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.fillText(this.fitText(getItem(id).name, 68), x + 10, y + 31);
      });
    }

    drawStitchDivider(ctx, 29, 432, 302, 'horizontal', '#877d6e', 5, 3);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText('最后一句', 30, 453);
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `11px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(`「${entry.lastEcho}」`, 30, 477, 298, 15, 3);
    ctx.fillStyle = '#6d655b';
    ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText('只读 · 不参与下一次出生', 180, 548);

    this.drawBreathActionButton(LEDGER_OLDER_RECT, '更早', UI_PALETTE.oldRed, this.ledgerPage < this.ledgerEntries.length - 1);
    this.drawBreathActionButton(LEDGER_CLOSE_RECT, '合上旧页', UI_PALETTE.oldRed);
    this.drawBreathActionButton(LEDGER_NEWER_RECT, '更新', UI_PALETTE.oldRed, this.ledgerPage > 0);
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
    drawArchiveFrame(ctx, 10, 10, 340, 620, UI_PALETTE.paper, UI_PALETTE.ink, UI_PALETTE.oldRed);
    drawPaperFold(ctx, 319, 13, 28, UI_PALETTE.paper, '#b8ad99', UI_PALETTE.ink);
    ctx.globalAlpha = 0.14;
    drawDeterministicWear(ctx, 18, 18, 324, 604, 700 + this.originAttempt, 7, '#8f8577', 1);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 15px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('出生登记处', 30, 47);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#5e574d';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(this.originAttempt > 1 ? '重新登记中' : `第 ${this.runSeed.toString(16).toUpperCase().padStart(8, '0')} 号`, 330, 46);
    drawLifeChapterTrack(ctx, 30, 69, 300, 8, 0, '降生|童年|少年|青年|成年|中年|老年|死亡', 0);

    fields.forEach(([label, value], index) => {
      const y = 115 + index * 52;
      const revealed = index <= activeLine;
      ctx.textAlign = 'left';
      ctx.fillStyle = revealed ? '#625b51' : '#aaa08f';
      ctx.font = `8px ${UI_FONT_STACK}`;
      ctx.fillText(label, 30, y);
      ctx.fillStyle = revealed ? (index === activeLine ? UI_PALETTE.oldRed : UI_PALETTE.ink) : '#aaa08f';
      ctx.font = index === activeLine ? `bold 10px ${UI_ARCHIVE_FONT_STACK}` : `9px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText(revealed ? value : '· · · · · · · ·', 95, y);
      drawStitchDivider(ctx, 30, y + 16, 300, 'horizontal', revealed ? '#877d6e' : '#b8ad99', 4, 4);
    });

    const pulse = this.reducedMotion ? 0.5 : (Math.sin(t * 2.2) + 1) / 2;
    const breathOffsets = [[-15, 2, 11], [0, -4, 15], [16, 3, 10], [-3, 10, 9]] as const;
    ctx.save();
    ctx.globalAlpha = 0.32 + pulse * 0.34;
    ctx.fillStyle = UI_PALETTE.hospitalBlueGray;
    for (const [dx, dy, radius] of breathOffsets) {
      ctx.beginPath();
      this.addPixelOctagonPath(ctx, 180 + dx, 430 + dy, radius + Math.round(pulse * 2));
      ctx.fill();
    }
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.fillRect(177, 423, 5, 5);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.font = `bold 11px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('第一口气，正在变成一个人。', 180, 481);
    ctx.fillStyle = '#625b51';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(this.originAttempt > 1 ? '上一页没赶上，登记处正在重写' : '家庭、地方和外号都由这一局生成', 180, 513);
    ctx.fillText('没有完成登记，就不会拿假故事开局', 180, 532);
    if (this.originLongWaitReady()) {
      this.drawBreathActionButton(ORIGIN_RETRY_RECT, '把这一页重新摊开', UI_PALETTE.oldRed);
    } else {
      ctx.fillStyle = UI_PALETTE.oldRed;
      ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('登记的人还没把这一页递回来', 180, 580);
    }
  }

  private renderOriginError(): void {
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    ctx.fillStyle = UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);
    drawArchiveFrame(ctx, 10, 10, 340, 620, UI_PALETTE.paper, UI_PALETTE.ink, UI_PALETTE.oldRed);
    ctx.globalAlpha = 0.15;
    drawDeterministicWear(ctx, 18, 18, 324, 604, 799, 7, '#8f8577', 1);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#625b51'; ctx.font = `9px ${UI_FONT_STACK}`; ctx.fillText('出生 · 第一件无法选择的事', 180, 46);
    drawRedStamp(ctx, 133, 132, 94, 70, '未落档', 79, UI_PALETTE.oldRed, UI_PALETTE.paper, UI_PALETTE.ink);
    ctx.fillStyle = UI_PALETTE.ink; ctx.font = `bold 19px ${UI_ARCHIVE_FONT_STACK}`; ctx.fillText('这一生还没有写下来', 180, 284);
    ctx.fillStyle = '#625b51'; ctx.font = `10px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText('没有使用兜底人物，也不会带着假故事开局。', 180, 322, 260, 16, 2);
    this.drawBreathActionButton({ x: 73, y: 395, width: 214, height: 70 }, '重新等他出生', UI_PALETTE.hospitalBlueGray);
    ctx.fillStyle = '#766f64'; ctx.font = `9px ${UI_FONT_STACK}`; ctx.fillText('Enter / 空格也可重试', 180, 501);
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
      this.drawBreathActionButton(FATE_FREE_CANCEL_RECT, '不等回声了', '#666870');
    }

    if (!this.fateResultDirection && !this.fateFreeWaiting && armed) {
      const freeResponseLocked = this.hasItem('name-sold') && !this.hasItem('revoked-badge');
      ctx.save();
      ctx.globalAlpha = optionAlpha;
      this.drawBreathActionButton(
        FATE_FREE_CANCEL_RECT,
        freeResponseLocked ? '名字已交出' : '亲口说',
        UI_PALETTE.raincoatYellow,
        !freeResponseLocked,
      );
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
      this.drawBreathActionButton(FATE_RESULT_CONTINUE_RECT, '收好回执，继续走', accent);
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
    this.renderRelicMechanicFeedback();
    this.renderJoystick();
    this.renderBattleOverlay();
    this.renderComboReveal();
    this.renderOriginBadge();
    this.renderHud();
    this.renderEdgeHint(this.worldDoor?.x, this.worldDoor?.y, this.worldDoor?.kind === 'light' ? '#e5c96f' : '#c3ccd1');
    this.renderEdgeHint(this.worldStall?.x, this.worldStall?.y, '#d5b45f');
    this.renderEdgeHint(this.worldReward?.x, this.worldReward?.y, '#e5c96f');
    this.renderEdgeHint(this.xiaoZhangWorld?.x, this.xiaoZhangWorld?.y, '#d6bd72', 4);
    for (const enemy of this.enemies) {
      const dedicatedPhoneHint = enemy.type === 'ringing-phone' && this.phoneRinging;
      if (!enemy.dead && (enemy.elite || enemy.boss) && !dedicatedPhoneHint) {
        this.renderEdgeHint(enemy.x, enemy.y, '#df5a69');
      }
    }
    const phoneHintFrequency = this.phoneRingWindow < 2 ? 12 : this.phoneRingWindow < 3 ? 8 : 5;
    for (const call of this.phoneCalls) this.renderEdgeHint(call.x, call.y, '#cfe4ea', phoneHintFrequency);
    this.renderNearestThreatHint();
    this.renderCaption();
    this.renderMemoryRecall();
    this.renderPhoneTranscript();
    this.renderEliteAlert();
    this.renderSaveEffect();
    this.renderSnowInterference();
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
    this.renderXiaoZhangPrompt();
    this.renderOneMoreGamePrompt();
    this.renderLampReleasePrompt();
  }

  private renderXiaoZhangPrompt(): void {
    if (!this.xiaoZhangPrompt) return;
    const ctx = this.ctx;
    const canHelp = this.hero.coins >= 10;
    ctx.save();
    ctx.fillStyle = 'rgba(6,7,9,.82)';
    ctx.fillRect(0, 0, W, H);
    drawCutCornerPanel(ctx, 18, 160, 324, 318, '#d4c6a9', '#8b3847', 6, 2);
    ctx.globalAlpha = 0.12;
    drawDeterministicWear(ctx, 28, 172, 304, 292, 2718, 7, '#695f50', 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#8b3847';
    ctx.fillRect(34, 180, 28, 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3a342d';
    ctx.font = `bold 20px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('一起入职的小张', 180, 224);
    this.drawXiaoZhangFigure(180, 308, false, false, 0, 'idle', 72);
    ctx.fillStyle = '#5b5348';
    ctx.font = `11px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('「你先忙，我这边还有点没弄完。」', 180, 330);
    ctx.fillStyle = '#746a59';
    ctx.font = `bold 10px ${UI_FONT_STACK}`;
    ctx.fillText('花 10 零钱帮他一把？', 180, 362);
    ctx.fillStyle = canHelp ? '#695c44' : '#9b3f4d';
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`手里有 ${this.hero.coins} 零钱${canHelp ? '' : ' · 不够'}`, 180, 381);
    this.drawBreathActionButton(
      XIAO_ZHANG_HELP_RECT,
      '帮',
      UI_PALETTE.oldRed,
      canHelp,
      this.xiaoZhangFocus === 0,
    );
    this.drawBreathActionButton(
      XIAO_ZHANG_DECLINE_RECT,
      '算了',
      UI_PALETTE.oldRed,
      true,
      this.xiaoZhangFocus === 1,
    );
    ctx.restore();
  }

  private renderOneMoreGamePrompt(): void {
    if (!this.oneMorePrompt) return;
    const ctx = this.ctx;
    ctx.save();
    applyPixelDiscipline(ctx);
    ctx.fillStyle = 'rgba(5,6,10,.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#15161c';
    ctx.fillRect(18, 176, 324, 304);
    ctx.fillStyle = '#343844';
    ctx.fillRect(18, 176, 324, 2);
    ctx.fillStyle = '#66778a';
    ctx.fillRect(30, 190, 24, 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('凌晨三点 · 这一章已经结束', 180, 222);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 22px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('再来一把就睡', 180, 264);
    ctx.fillStyle = '#91a4b8';
    ctx.font = `bold 11px ${UI_FONT_STACK}`;
    ctx.fillText(`现在熬夜 ${this.oneMoreStacks} 层`, 180, 295);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('继续：跳过回复，伤害叠层；下一章更晚开口', 180, 326);
    ctx.fillText('睡下：恢复 6 点生命，清空熬夜层', 180, 345);
    this.drawBreathActionButton(
      ONE_MORE_CONTINUE_RECT,
      '再来一把',
      '#687f98',
      true,
      this.oneMoreFocus === 0,
    );
    this.drawBreathActionButton(
      ONE_MORE_SLEEP_RECT,
      '真睡了',
      '#666870',
      true,
      this.oneMoreFocus === 1,
    );
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText('伤害最多叠 5 层 · 每层令开场停火 0.5 秒', 180, 470);
    ctx.restore();
  }

  private renderLampReleasePrompt(): void {
    if (!this.lampReleaseReady) return;
    const ctx = this.ctx;
    const canRelease = this.lampReleaseTimer <= 0;
    ctx.save();
    ctx.fillStyle = 'rgba(5,5,8,.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('收灯人没有倒下。', 180, 226);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 22px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('手里空了', 180, 274);
    ctx.fillStyle = '#c7bca5';
    ctx.font = `11px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('这一口气，也可以放下了。', 180, 316);
    this.drawBreathActionButton(
      LAMP_RELEASE_RECT,
      '放下这一口气',
      UI_PALETTE.oldRed,
      canRelease,
      canRelease,
    );
    ctx.restore();
  }

  private renderRelicMechanicFeedback(): void {
    const ctx = this.ctx;
    ctx.save();
    applyPixelDiscipline(ctx);
    if (this.whiteBottlePulseTimer > 0) {
      ctx.globalAlpha = 0.12 + (this.whiteBottlePulseTimer / 0.55) * 0.16;
      ctx.fillStyle = '#e7efeb';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.hasItem('third-pill')) {
      const phaseColor = this.pillPhaseState === 'rage'
        ? '#b34764'
        : this.pillPhaseState === 'crash' ? '#527b86' : '#655f69';
      ctx.globalAlpha = this.pillPhaseState === 'neutral' ? 0.035 : 0.07 + this.pillPulseTimer * 0.1;
      ctx.fillStyle = phaseColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = this.pillPhaseState === 'neutral' ? 0.32 : 0.72;
      for (let index = 0; index < 8; index += 1) {
        const jitter = this.reducedMotion ? 0 : Math.round(Math.sin(this.visualTime * 15 + index * 2.3) * 3);
        ctx.fillRect(HERO_SCREEN_X - 25 + ((index * 11) % 50) + jitter, HERO_SCREEN_Y - 48 + (index % 3) * 23, 2, 3);
      }
      ctx.globalAlpha = 1;
    }
    if (this.hasItem('painless-night') && this.painlessDamage > 0) {
      const timeRatio = this.clamp(this.painlessTimer / 8, 0, 1);
      const filled = Math.ceil(timeRatio * 8);
      ctx.fillStyle = 'rgba(31,32,42,.52)';
      ctx.fillRect(HERO_SCREEN_X - 18, HERO_SCREEN_Y + 5, 37, 8);
      for (let index = 0; index < 8; index += 1) {
        ctx.fillStyle = index < filled ? '#858b96' : '#433f49';
        ctx.fillRect(HERO_SCREEN_X - 15 + index * 4, HERO_SCREEN_Y + 8, 3, 3);
      }
      ctx.globalAlpha = 0.28 + this.clamp(this.painlessDamage / 30, 0, 0.4);
      ctx.fillStyle = '#686d7d';
      for (let index = 0; index < 6; index += 1) {
        ctx.fillRect(HERO_SCREEN_X - 24 + index * 9, HERO_SCREEN_Y - 8 + (index % 2) * 4, 4, 3);
      }
      ctx.globalAlpha = 1;
    }
    if (this.hasItem('moms-bowl') && this.bowlWarmthBlock > 0) {
      const warmth = this.clamp(this.bowlWarmthBlock / 12, 0.2, 1);
      ctx.globalAlpha = 0.38 + warmth * 0.42;
      ctx.fillStyle = '#d9c79f';
      for (let index = 0; index < 7; index += 1) {
        const rise = (Math.floor(this.visualTime * 10) + index * 5) % 22;
        ctx.fillRect(HERO_SCREEN_X - 18 + ((index * 7) % 35), HERO_SCREEN_Y + 4 - rise, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (this.hasItem('unwashed-pillow')) {
      const progress = this.clamp(this.standStillTime / 2, 0, 1);
      const filled = Math.floor(progress * 4);
      ctx.fillStyle = progress >= 1 ? 'rgba(118,111,114,.42)' : 'rgba(55,51,58,.62)';
      ctx.fillRect(HERO_SCREEN_X - 18, HERO_SCREEN_Y + 4, 37, 7);
      for (let index = 0; index < 4; index += 1) {
        ctx.fillStyle = index < filled ? '#a39a82' : '#554e55';
        ctx.fillRect(HERO_SCREEN_X - 14 + index * 8, HERO_SCREEN_Y + 6, 5, 3);
      }
      if (this.pillowPenalty > 0) {
        ctx.fillStyle = '#817780';
        for (let index = 0; index < 6; index += 1) {
          ctx.fillRect(HERO_SCREEN_X - 20 + index * 8, HERO_SCREEN_Y - 4 + (index % 2) * 3, 3, 2);
        }
      }
    }
    if (this.hasItem('sock-cigs') && this.sockBoostTimer > 0) {
      const strength = this.clamp(this.sockBoostTimer / 2, 0, 1);
      ctx.globalAlpha = 0.35 + strength * 0.45;
      for (let index = 0; index < 8; index += 1) {
        ctx.fillStyle = index % 3 === 0 ? '#c2b29b' : '#746e70';
        const x = HERO_SCREEN_X - 18 + ((index * 9) % 36);
        const y = HERO_SCREEN_Y + 5 - ((index * 7 + Math.floor((1 - strength) * 18)) % 34);
        ctx.fillRect(x, y, 2 + (index % 2), 2);
      }
      ctx.globalAlpha = 1;
    }
    if (this.hasProjectileTrigger('streak-1847')) {
      const progress = (this.battleTime % 10) / 10;
      const filled = Math.floor(progress * 10);
      const upcomingWindow = Math.floor(this.battleTime / 10) + 1;
      const broken = upcomingWindow === this.rhythmBrokenWindow;
      for (let index = 0; index < 10; index += 1) {
        ctx.fillStyle = index < filled ? (broken ? '#786a6a' : '#c0a652') : '#4c474c';
        ctx.fillRect(HERO_SCREEN_X - 15 + index * 3, HERO_SCREEN_Y - 57, 2, 3);
      }
    }
    if (this.hasItem('auto-renew') && this.battleTime < 15) {
      const pulse = this.reducedMotion ? 0.52 : 0.42 + Math.sin(this.visualTime * 5) * 0.1;
      ctx.globalAlpha = Math.max(pulse, this.autoRenewGlowTimer > 0 ? 0.72 : 0);
      ctx.fillStyle = '#d3bd72';
      for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        const radius = 27 + (index % 2) * 3;
        ctx.fillRect(
          Math.round(HERO_SCREEN_X + Math.cos(angle) * radius),
          Math.round(HERO_SCREEN_Y - 19 + Math.sin(angle) * radius),
          index % 3 === 0 ? 3 : 2,
          2,
        );
      }
      ctx.globalAlpha = 1;
    }
    if (this.hasItem('mineral-water')) {
      const progress = (this.noHitTime % 8) / 8;
      const filled = Math.floor(progress * 8);
      const capX = HERO_SCREEN_X + 22;
      const capY = HERO_SCREEN_Y - 30;
      const points: Array<readonly [number, number]> = [[-4, -4], [0, -5], [4, -4], [5, 0], [4, 4], [0, 5], [-4, 4], [-5, 0]];
      ctx.fillStyle = 'rgba(12,18,20,.76)';
      ctx.fillRect(capX - 6, capY - 6, 13, 13);
      points.forEach((point, index) => {
        ctx.fillStyle = index < filled ? '#9fc8c6' : '#465b5e';
        ctx.fillRect(capX + point[0] - 1, capY + point[1] - 1, 3, 3);
      });
      ctx.fillStyle = '#dce7e3';
      ctx.fillRect(capX - 2, capY - 2, 5, 5);
    }
    if (this.eyeClosedTimer > 0) {
      ctx.fillStyle = 'rgba(4,6,9,.2)';
      ctx.fillRect(0, 0, W, H);
      this.drawPixelWarningRing(HERO_SCREEN_X, HERO_SCREEN_Y - 18, 27, '#9db8c8', 0.68, 1, 20);
    }
    if (this.takeoutWarmTimer > 0) {
      const strength = this.clamp(this.takeoutWarmTimer / 0.42, 0, 1);
      ctx.globalAlpha = strength * 0.72;
      ctx.fillStyle = '#d4b878';
      for (let index = 0; index < 9; index += 1) {
        const x = HERO_SCREEN_X - 18 + ((index * 11) % 36);
        const y = HERO_SCREEN_Y - 18 - ((index * 7 + Math.floor((1 - strength) * 18)) % 34);
        ctx.fillRect(x, y, index % 3 === 0 ? 3 : 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (this.nauseaTimer > 0) {
      const strength = this.clamp(this.nauseaTimer / 0.72, 0, 1);
      ctx.fillStyle = `rgba(104,124,72,${strength * 0.12})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = strength * 0.78;
      ctx.fillStyle = '#91a565';
      for (let index = 0; index < 10; index += 1) {
        const x = HERO_SCREEN_X - 23 + ((index * 17) % 46);
        const y = HERO_SCREEN_Y - 44 + ((index * 9) % 28);
        ctx.fillRect(x, y, 2 + (index % 2), 2);
      }
      ctx.globalAlpha = 1;
    }
    if (this.hasItem('goodnight-2h') && this.hero.hp < this.hero.maxHp * 0.5) {
      const pulse = this.goodnightPulseTimer > 0
        ? 0.12 + this.goodnightPulseTimer * 0.1
        : 0.055;
      ctx.fillStyle = `rgba(65,88,121,${pulse})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#8098b2';
      for (let index = 0; index < 8; index += 1) {
        const x = HERO_SCREEN_X - 20 + ((index * 13) % 40);
        const y = HERO_SCREEN_Y - 51 + ((index * 5) % 18);
        ctx.fillRect(x, y, 2, 2);
      }
    }
    if (this.checkupPulseTimer > 0) {
      const strength = this.clamp(this.checkupPulseTimer / 1.4, 0, 1);
      ctx.globalAlpha = strength;
      ctx.textAlign = 'center';
      ctx.font = `bold 8px ${UI_FONT_STACK}`;
      ctx.fillStyle = '#bd5c62';
      ctx.fillText('↑', HERO_SCREEN_X - 25, HERO_SCREEN_Y - 40);
      ctx.fillText('↑', HERO_SCREEN_X + 24, HERO_SCREEN_Y - 31);
      ctx.fillStyle = '#71849b';
      ctx.fillText('↓', HERO_SCREEN_X, HERO_SCREEN_Y - 58);
      ctx.globalAlpha = 1;
    }
    if (this.graceTimer > 0) {
      ctx.fillStyle = 'rgba(196,192,184,.07)';
      ctx.fillRect(0, 0, W, H);
      const frameAlpha = this.reducedMotion ? 0.72 : 0.58 + Math.sin(this.visualTime * 8) * 0.14;
      ctx.globalAlpha = frameAlpha;
      ctx.fillStyle = '#d8cfae';
      const left = HERO_SCREEN_X - 25;
      const right = HERO_SCREEN_X + 24;
      const top = HERO_SCREEN_Y - 56;
      const bottom = HERO_SCREEN_Y + 12;
      for (const [x, y, width, height] of [
        [left, top, 8, 2], [left, top, 2, 8], [right - 6, top, 8, 2], [right, top, 2, 8],
        [left, bottom, 8, 2], [left, bottom - 6, 2, 8], [right - 6, bottom, 8, 2], [right, bottom - 6, 2, 8],
      ] as const) ctx.fillRect(x, y, width, height);
      ctx.globalAlpha = 1;
    }
    if (this.oneMoreOpeningTimer > 0) {
      ctx.fillStyle = 'rgba(58,70,88,.12)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#91a4b8';
      for (let index = 0; index < 8; index += 1) {
        const x = HERO_SCREEN_X - 24 + ((index * 13) % 48);
        const y = HERO_SCREEN_Y - 54 + ((index * 7) % 20);
        ctx.fillRect(x, y, 2 + (index % 2), 2);
      }
    }
    if (this.hasItem('last-page') && this.lastPageDeadlineActive()) {
      const duration = STAGES[this.encounterIndex]?.duration ?? 90;
      const pressure = this.clamp((this.battleTime - duration + 10) / 10, 0, 1);
      ctx.fillStyle = `rgba(92,28,39,${0.1 + pressure * 0.14})`;
      for (let step = 0; step < 4; step += 1) {
        const span = 26 - step * 5;
        const offset = step * 4;
        ctx.fillRect(0, offset, span, 4);
        ctx.fillRect(W - span, offset, span, 4);
        ctx.fillRect(0, H - offset - 4, span, 4);
        ctx.fillRect(W - span, H - offset - 4, span, 4);
      }
    }
    ctx.restore();
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
    const label = this.eliteAlertKind === 'boss' ? '章节首领' : '精英逼近';
    ctx.fillText(`${label} · ${this.eliteAlertName}`, 180, 115);
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
    const { x, y, width, height } = ORIGIN_BADGE_RECT;
    const nickname = this.origin.nickname || this.origin.title;
    const kindColor = this.origin.kind === 'harsh' ? '#9d4353' : this.origin.kind === 'favored' ? '#bda45d' : '#6e757d';
    const traits = this.origin.traits.map((id) => getOriginTrait(id));
    ctx.save();

    // The compact mark is a readable identity tag, not a mystery glyph.
    ctx.fillStyle = 'rgba(14,14,19,.82)';
    ctx.fillRect(x, y, width, height);
    const frameDrawn = uiTextures.drawStampButtonFrame(ctx, x, y, width, height, 'normal', 0.88);
    if (!frameDrawn) drawRedStamp(ctx, x, y, width, height, '', 691, UI_PALETTE.oldRed, UI_PALETTE.oldRed, 'rgba(0,0,0,0)');
    drawRedStamp(ctx, x + 5, y + 5, 27, 28, this.originBadgeGlyph(), 37, kindColor, UI_PALETTE.paperLight, 'rgba(14,14,19,.82)', 12);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText('出生外号', x + 39, y + 12);
    let nicknameSize = 11;
    do {
      ctx.font = `bold ${nicknameSize}px ${UI_ARCHIVE_FONT_STACK}`;
      if (ctx.measureText(nickname).width <= 70) break;
      nicknameSize -= 1;
    } while (nicknameSize > 8);
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.fillText(nickname, x + 39, y + 28);
    traits.forEach((trait, index) => {
      ctx.fillStyle = trait.tone === 'positive' ? '#8fc0a5' : trait.tone === 'negative' ? '#d3707c' : '#b7b1a6';
      ctx.fillRect(x + width - 6, y + 8 + index * 10, 2, 7);
    });
    if (this.odBoost && this.odPenalty) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#d89cc2';
      ctx.font = `8px ${UI_FONT_STACK}`;
      ctx.fillText(`失真 ${this.odBoost}↑ ${this.odPenalty}↓`, x, y - 6);
    }
    if (this.originBadgeExpanded) {
      const panelWidth = 152;
      const traitRows = Math.max(1, traits.length);
      const panelHeight = 181 + traitRows * 53;
      const panelY = y - panelHeight - 8;
      ctx.fillStyle = 'rgba(21,20,25,.94)';
      ctx.fillRect(x, panelY, panelWidth, panelHeight);
      ctx.strokeStyle = UI_PALETTE.oldRed;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);
      ctx.strokeStyle = 'rgba(159,53,72,.42)';
      ctx.strokeRect(x + 4.5, panelY + 4.5, panelWidth - 9, panelHeight - 9);
      ctx.fillStyle = kindColor;
      ctx.fillRect(x + 1, panelY + 1, 4, 35);
      ctx.textAlign = 'left';
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `8px ${UI_FONT_STACK}`;
      ctx.fillText('出生外号 · 人生档案', x + 11, panelY + 16);
      let expandedNameSize = 15;
      do {
        ctx.font = `bold ${expandedNameSize}px ${UI_ARCHIVE_FONT_STACK}`;
        if (ctx.measureText(`《${nickname}》`).width <= panelWidth - 22) break;
        expandedNameSize -= 1;
      } while (expandedNameSize > 10);
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.fillText(`《${nickname}》`, x + 11, panelY + 40);
      ctx.fillStyle = kindColor;
      ctx.font = `8px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText(this.fitText(this.origin.title, panelWidth - 22), x + 11, panelY + 55);
      drawStitchDivider(ctx, x + 11, panelY + 64, panelWidth - 22, 'horizontal', 'rgba(170,162,151,.44)', 5, 3);
      ctx.fillStyle = UI_PALETTE.oldRed;
      ctx.font = `bold 8px ${UI_FONT_STACK}`;
      ctx.fillText('外号来由', x + 11, panelY + 78);
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `8px ${UI_FONT_STACK}`;
      this.wrapText(this.origin.nicknameReason || '别人先这样叫出了声。', x + 11, panelY + 92, panelWidth - 22, 11, 3);
      if (traits.length) {
        traits.forEach((trait, index) => {
          const rowY = panelY + 132 + index * 53;
          ctx.fillStyle = trait.tone === 'positive' ? '#8fc0a5' : trait.tone === 'negative' ? '#d3707c' : '#c4b98a';
          ctx.font = `bold 8px ${UI_FONT_STACK}`;
          ctx.fillText(this.fitText(`${trait.name} · ${trait.description}`, panelWidth - 22), x + 11, rowY);
          ctx.fillStyle = UI_PALETTE.paperDim;
          ctx.font = `8px ${UI_FONT_STACK}`;
          const reason = this.origin?.traitReasons?.[index] || trait.reason;
          this.wrapText(reason, x + 11, rowY + 13, panelWidth - 22, 11, 3);
        });
      } else {
        ctx.fillStyle = UI_PALETTE.paperDim;
        ctx.font = `8px ${UI_FONT_STACK}`;
        this.wrapText('普通人出身：出生那天一切是 1。之后的账，都是活出来的。', x + 11, panelY + 132, panelWidth - 22, 11, 3);
      }
      const vectorNow = this.computeAttackVector();
      const normNow = (value: number, base: number) => (value / base).toFixed(2);
      drawStitchDivider(ctx, x + 11, panelY + panelHeight - 43, panelWidth - 22, 'horizontal', 'rgba(170,162,151,.44)', 5, 3);
      ctx.fillStyle = '#c4b98a';
      ctx.font = `bold 8px ${UI_FONT_STACK}`;
      ctx.fillText(`现在 · 伤害 ${normNow(vectorNow.damage, BASE_VECTOR.damage)}　射速 ${normNow(1 / vectorNow.fireInterval, 1 / BASE_VECTOR.fireInterval)}`, x + 11, panelY + panelHeight - 26);
      ctx.fillText(`　　 射程 ${normNow(vectorNow.range, BASE_VECTOR.range)}　移速 ${(this.computeMoveSpeed() / HERO_BASE_SPEED).toFixed(2)}`, x + 11, panelY + panelHeight - 12);
    }
    ctx.restore();
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
      const x = 314 + column * 18;
      const y = 582 + row * 16;
      ctx.save();
      if (this.stageDisabledItems.has(id)) ctx.globalAlpha = 0.24;
      this.drawItemSymbol(id, x, y, 6);
      ctx.restore();
      if (this.stageDisabledItems.has(id)) {
        ctx.strokeStyle = '#c64f60';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 5);
        ctx.lineTo(x + 5, y + 5);
        ctx.moveTo(x + 5, y - 5);
        ctx.lineTo(x - 5, y + 5);
        ctx.stroke();
      }
    });
    this.renderBoxCountStatus();
  }

  private renderBoxCountStatus(): void {
    const box = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'whose-box' && enemy.countedItem);
    const disabled = [...this.stageDisabledItems];
    if (!box?.countedItem && disabled.length === 0) return;
    const ctx = this.ctx;
    const item = box?.countedItem ?? disabled[disabled.length - 1]!;
    const timer = box?.countedItemTimer ?? 0;
    const counting = Boolean(box?.countedItem);
    const activeWindow = counting && timer > 0;
    const progress = activeWindow
      ? this.clamp(timer / 8, 0, 1)
      : counting
        ? this.clamp((box?.windupTimer ?? 0) / 0.7, 0, 1)
        : 0;
    const accent = counting ? '#d1b661' : '#b94b5d';
    const panelY = this.joyPointerId === -1 ? 536 : 492;
    drawCutCornerPanel(ctx, 58, panelY, 244, 32, 'rgba(15,14,18,.92)', accent, 2, 1);
    this.drawItemSymbol(item, 72, panelY + 16, 7);
    ctx.textAlign = 'left';
    ctx.fillStyle = counting ? UI_PALETTE.paperLight : '#d98b95';
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    const label = counting
      ? `${activeWindow ? `清点 ${timer.toFixed(1)}秒` : '正在清点'} · ${getItem(item).name}`
      : `本关失效 · ${getItem(item).name}${disabled.length > 1 ? ` 等${disabled.length}件` : ''}`;
    ctx.fillText(this.fitText(label, 200), 87, panelY + 14);
    ctx.fillStyle = '#3e393d';
    ctx.fillRect(87, panelY + 21, 198, 3);
    ctx.fillStyle = accent;
    ctx.fillRect(87, panelY + 21, Math.round(198 * progress), 3);
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
    ctx.fillText(`${Math.ceil(this.hero.hp)} / ${Math.ceil(this.hero.maxHp)}`, 26, 38);

    drawCutCornerPanel(ctx, 136, 6, 108, 39, hudFill, hudStroke, 2, 1);
    ctx.textAlign = 'center';
    const activeBoss = this.enemies.find((enemy) => !enemy.dead && (enemy.boss || enemy.elite));
    if (activeBoss) {
      ctx.font = `bold 10px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.fillText(this.fitText(activeBoss.name, 92), 190, 17);
      ctx.font = `9px ${UI_FONT_STACK}`;
      ctx.fillStyle = UI_PALETTE.paperDim;
      if (activeBoss.type === 'lamp-keeper') {
        const total = Math.max(this.lampItemsToReturnTotal, this.items.length);
        const returned = Math.max(0, total - this.items.length);
        const progress = total > 0 ? returned / total : this.lampReleaseReady ? 1 : 0;
        this.bar(147, 23, 86, 5, progress, UI_PALETTE.raincoatYellow);
        ctx.fillText(total > 0 ? `已还 ${returned} / ${total}` : '手里空了', 190, 39);
      } else {
        this.bar(147, 23, 86, 5, activeBoss.hp / activeBoss.maxHp, UI_PALETTE.oldRed);
        ctx.fillText(`${Math.ceil(activeBoss.hp)} / ${Math.ceil(activeBoss.maxHp)}`, 190, 39);
      }
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
    const interaction = this.actionState(PAUSE_BUTTON_HIT_RECT);
    ctx.translate(0, interaction.offset);
    const accent = this.highContrastHud || interaction.hovered ? UI_PALETTE.hospitalBlueGray : '#5b565b';
    drawCutCornerPanel(ctx, PAUSE_BUTTON_RECT.x, PAUSE_BUTTON_RECT.y, PAUSE_BUTTON_RECT.width, PAUSE_BUTTON_RECT.height, '#17181d', accent, 3, 1);
    ctx.fillStyle = accent;
    ctx.fillRect(PAUSE_BUTTON_RECT.x + 5, PAUSE_BUTTON_RECT.y + 7, 7, 1);
    ctx.fillRect(PAUSE_BUTTON_RECT.x + PAUSE_BUTTON_RECT.width - 12, PAUSE_BUTTON_RECT.y + PAUSE_BUTTON_RECT.height - 8, 7, 1);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.fillRect(PAUSE_BUTTON_RECT.x + 9, PAUSE_BUTTON_RECT.y + 12, 3, 14);
    ctx.fillRect(PAUSE_BUTTON_RECT.x + 16, PAUSE_BUTTON_RECT.y + 12, 3, 14);
    if (interaction.hovered) this.drawFocusCorners(PAUSE_BUTTON_RECT.x, PAUSE_BUTTON_RECT.y, PAUSE_BUTTON_RECT.width, PAUSE_BUTTON_RECT.height, UI_PALETTE.breath);
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

    this.drawBreathActionButton(PAUSE_CONTINUE_RECT, '继续往前走', UI_PALETTE.hospitalBlueGray);

    const holdProgress = this.pauseEndHoldStarted > 0
      ? this.clamp((performance.now() - this.pauseEndHoldStarted) / 1000, 0, 1)
      : 0;
    drawCutCornerPanel(
      ctx, PAUSE_END_RECT.x, PAUSE_END_RECT.y, PAUSE_END_RECT.width, PAUSE_END_RECT.height,
      '#17151a', '#5f3039', 2, 1,
    );
    ctx.fillStyle = 'rgba(159,53,72,.42)';
    ctx.fillRect(PAUSE_END_RECT.x + 2, PAUSE_END_RECT.y + 2, Math.round((PAUSE_END_RECT.width - 4) * holdProgress), PAUSE_END_RECT.height - 4);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.fillRect(PAUSE_END_RECT.x + 7, PAUSE_END_RECT.y + 6, 10, 1);
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
    this.renderPauseVolume(PAUSE_SETTING_VOLUME_RECT, '总声', this.feedback.getVolume());
    this.renderPauseVolume(PAUSE_SETTING_AMBIENCE_RECT, '环境', this.feedback.getMixVolume('ambience'));
    this.renderPauseVolume(PAUSE_SETTING_VOICE_RECT, '人声', this.feedback.getMixVolume('voice'));
    this.renderPauseVolume(PAUSE_SETTING_EFFECTS_RECT, '音效', this.feedback.getMixVolume('effects'));
    this.renderPauseToggle(PAUSE_SETTING_HAPTICS_RECT, '振动', this.feedback.hapticsEnabled());
    this.renderPauseToggle(PAUSE_SETTING_MOTION_RECT, '减少动态', this.reducedMotion);
    this.renderPauseToggle(PAUSE_SETTING_CONTRAST_RECT, '高对比 HUD', this.highContrastHud);
    drawStitchDivider(ctx, 142, 462, 180, 'horizontal', '#4d494d', 4, 3);
    ctx.fillStyle = '#8d8783';
    ctx.font = `8px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText('环境、人声与物件声，可以各自留在这一页。', 142, 484, 180, 11, 2);
  }

  private renderPauseVolume(
    rect: { x: number; y: number; width: number; height: number },
    label: string,
    volume: number,
  ): void {
    const ctx = this.ctx;
    const trackX = rect.x + 78;
    const trackY = rect.y + 15;
    const trackWidth = rect.width - 92;
    ctx.fillStyle = '#19181d';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = volume > 0 ? UI_PALETTE.raincoatYellow : '#48444a';
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(volume > 0 ? label : `${label}·静`, rect.x + 12, rect.y + 21);
    ctx.fillStyle = '#4a4649';
    ctx.fillRect(trackX, trackY, trackWidth, 3);
    ctx.fillStyle = volume > 0 ? UI_PALETTE.raincoatYellow : '#555159';
    ctx.fillRect(trackX, trackY, Math.max(volume > 0 ? 2 : 0, Math.round(trackWidth * volume)), 3);
    ctx.fillStyle = volume > 0 ? UI_PALETTE.paperLight : '#858087';
    ctx.fillRect(Math.round(trackX + trackWidth * volume) - 3, trackY - 4, 6, 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    ctx.fillText(`${Math.round(volume * 100)}%`, rect.x + rect.width - 10, rect.y + 30);
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
      if (!this.visibleInLampLight(enemy.x, enemy.y, enemy.radius + (enemy.boss ? 28 : 12))) continue;
      this.drawEnemy(enemy);
      const marked = enemy.elite || enemy.boss || Boolean(enemy.backstabber);
      if (marked || enemy.hp < enemy.maxHp) {
        const barWidth = marked ? 50 : 26;
        this.bar(enemy.x - barWidth / 2, enemy.y + enemy.radius + 7, barWidth, marked ? 5 : 3, enemy.hp / enemy.maxHp, marked ? '#d64e5e' : '#9d3d4b');
      }
      if ((enemy.elite && !enemy.boss) || enemy.backstabber) {
        this.ctx.fillStyle = '#c9c3b9';
        this.ctx.font = 'bold 8px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(enemy.name, enemy.x, enemy.y + enemy.radius + 22);
      }
      if ((enemy.tauntVulnerableTimer ?? 0) > 0) {
        this.ctx.fillStyle = '#d96a72';
        this.ctx.font = `bold 8px ${UI_FONT_STACK}`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('+20%', enemy.x, enemy.y - enemy.radius - 9);
      }
      // 状态标记：硬控、挂账与三种材质状态统一浮在头顶。
      if (statusAtlas.ready) {
        const marks: string[] = [];
        if ((enemy.slowTimer ?? 0) > 0 || (enemy.freezeTimer ?? 0) > 0) marks.push('freeze');
        if ((enemy.paralyzeTimer ?? 0) > 0) marks.push('paralyze');
        if ((enemy.readTimer ?? 0) > 0) marks.push('read');
        if ((enemy.loopTimer ?? 0) > 0) marks.push('loop');
        if ((enemy.wetTimer ?? 0) > 0) marks.push('wet');
        if ((enemy.rawTimer ?? 0) > 0) marks.push('raw');
        if ((enemy.heavyTimer ?? 0) > 0) marks.push('heavy');
        marks.forEach((mark, order) => {
          const icon = statusAtlas.named(mark);
          if (!icon) return;
          this.ctx.save();
          this.ctx.globalAlpha = 0.9;
          this.ctx.imageSmoothingEnabled = false;
          this.ctx.drawImage(icon, enemy.x - 6 + (order - (marks.length - 1) / 2) * 11, enemy.y - enemy.radius - 20, 12, 12);
          this.ctx.restore();
        });
      }
    }
    for (const death of this.enemyDeaths) {
      if (!this.visibleInLampLight(death.x, death.y, death.radius + 12)) continue;
      this.pixelEnemies.drawDeath(this.ctx, {
        asset: death.asset,
        x: death.x,
        y: death.y,
        radius: death.radius,
        boss: death.boss,
        progress: 1 - death.life / death.duration,
        faceLeft: death.faceLeft,
      });
    }
    const lanternHandoff = this.lanternHandoffPose();
    if (lanternHandoff && this.visibleInLampLight(lanternHandoff.x, lanternHandoff.y, 24)) {
      this.pixelEnemies.drawHandoff(this.ctx, {
        asset: 'revolving-lantern',
        x: lanternHandoff.x,
        y: lanternHandoff.y,
        radius: 34,
        scale: lanternHandoff.scale,
        time: this.battleTime,
      });
    }
  }

  private lanternHandoffPose(): { x: number; y: number; scale: number; darknessProgress: number } | undefined {
    const handoff = this.lanternHandoff;
    if (!handoff || this.lampSpawned) return undefined;
    const rise = this.clamp((this.battleTime - handoff.startedAt) / 1.6, 0, 1);
    const riseEase = rise * rise * (3 - 2 * rise);
    const hoverX = handoff.startX;
    const hoverY = handoff.startY - 52 * riseEase;
    const hoverScale = 1 - 0.45 * riseEase;
    if (!this.darkActive) {
      return { x: hoverX, y: hoverY, scale: hoverScale, darknessProgress: 0 };
    }
    const progress = this.clamp((this.battleTime - this.darknessStartedAt) / DARKNESS_SHRINK, 0, 1);
    const ease = progress * progress * (3 - 2 * progress);
    const targetX = this.darkCX - 54;
    const targetY = this.darkCY - 70;
    return {
      x: hoverX + (targetX - hoverX) * ease,
      y: hoverY + (targetY - hoverY) * ease,
      scale: hoverScale + (0.28 - hoverScale) * ease,
      darknessProgress: progress,
    };
  }

  private renderEnemyThreatTelegraphs(): void {
    for (const enemy of this.enemies) {
      if (!enemy.dead && this.visibleInLampLight(enemy.x, enemy.y, enemy.radius + 28)) this.renderBossTelegraph(enemy);
    }
  }

  private visibleInLampLight(x: number, y: number, margin = 0): boolean {
    if (!this.darkActive || this.darkR >= 320) return true;
    return Math.hypot(x - this.darkCX, y - this.darkCY) <= Math.max(70, this.darkR) + margin;
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
    if (!enemy.boss && !enemy.elite && !enemy.backstabber) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 通用 boss 定向招式前摇：材质色负责氛围，统一红边负责危险语义。
    if ((enemy.windupTimer ?? 0) > 0 && enemy.attackAngle !== undefined) {
      const spec: Record<string, {
        windup: number;
        start?: number;
        reach: number;
        band: number;
        fill: string;
        edge: string;
        core: string;
      }> = {
        stand: { windup: 0.95, reach: 210, band: 26, fill: '#9c8f6a', edge: '#d94b61', core: '#f2d7ad' },
        stomp: { windup: 0.6, reach: 150, band: 26, fill: '#c9b98f', edge: '#ef5364', core: '#fff0c4' },
        shadow: { windup: 0.85, reach: 240, band: 34, fill: '#48434f', edge: '#df4d70', core: '#edbdc9' },
        sleeve: { windup: 0.8, reach: COAT_SLEEVE_REACH, band: COAT_SLEEVE_HALF_WIDTH, fill: '#5a3a44', edge: '#9f3548', core: '#d8aab4' },
        'double-sleeve': { windup: 0.8, reach: COAT_SLEEVE_REACH, band: COAT_DOUBLE_SLEEVE_HALF_WIDTH, fill: '#633540', edge: '#b83f55', core: '#edbac5' },
        paper: { windup: 0.7, reach: 190, band: 30, fill: '#6a6a72', edge: '#b0b0ba', core: '#e8e8ee' },
        backstab: { windup: 0.62, reach: 126, band: 18, fill: '#532d36', edge: '#b74859', core: '#edc1c6' },
        charge: {
          windup: 0.45,
          start: -FATHER_CHARGE_HIT_OVERHANG,
          reach: FATHER_CHARGE_DISTANCE + FATHER_CHARGE_HIT_OVERHANG,
          band: FATHER_CHARGE_HALF_WIDTH,
          fill: '#4c5b6a', edge: '#d94b61', core: '#c6d4e0',
        },
        charge2: {
          windup: 0.4,
          start: -FATHER_CHARGE_HIT_OVERHANG,
          reach: FATHER_CHARGE_DISTANCE + FATHER_CHARGE_HIT_OVERHANG,
          band: FATHER_CHARGE_HALF_WIDTH,
          fill: '#4c5b6a', edge: '#d94b61', core: '#c6d4e0',
        },
        'last-bus-dash': {
          windup: 0.8,
          start: BUS_DASH_SWEEP_START,
          reach: BUS_DASH_SWEEP_REACH,
          band: BUS_BODY_HALF_WIDTH,
          fill: '#31343a',
          edge: '#b74958',
          core: '#d3b65f',
        },
      };
      // 《拍桌子》是径向的：画收拢的警戒圈，不画方向车道
      if (enemy.attackKind === 'slam') {
        const slamCharge = 1 - this.clamp((enemy.windupTimer ?? 0) / 0.8, 0, 1);
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.globalAlpha = 0.16 + slamCharge * 0.3;
        ctx.fillStyle = '#c9a24a';
        ctx.beginPath();
        ctx.arc(0, 0, PRAISE_SLAM_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        this.drawPixelWarningRing(
          enemy.x,
          enemy.y,
          PRAISE_SLAM_RADIUS,
          '#d94b61',
          0.72 + slamCharge * 0.24,
          1,
          44,
        );
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.globalAlpha = 0.5 + slamCharge * 0.45;
        ctx.strokeStyle = '#f0c976';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, PRAISE_SLAM_RADIUS - slamCharge * 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.restore();
        return;
      }
      // 《上门》也是径向的：实际结算会把圆域内的玩家拖向催收人并收走零钱。
      // 外圈始终标出精确结算边界，内圈随前摇向 Boss 收拢，表达“被拉进去”而不是直线挥击。
      if (enemy.attackKind === 'collector-drag') {
        const dragCharge = 1 - this.clamp((enemy.windupTimer ?? 0) / 0.85, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.07 + dragCharge * 0.09;
        ctx.fillStyle = '#b97858';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, COLLECTOR_DRAG_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        this.drawPixelWarningRing(
          enemy.x,
          enemy.y,
          COLLECTOR_DRAG_RADIUS,
          '#d94b61',
          0.72 + dragCharge * 0.24,
          1,
          48,
        );
        this.drawPixelWarningRing(
          enemy.x,
          enemy.y,
          COLLECTOR_DRAG_RADIUS - dragCharge * (COLLECTOR_DRAG_RADIUS - enemy.radius - 18),
          '#d7a070',
          0.5 + dragCharge * 0.35,
          1,
          36,
        );
        ctx.restore();
        return;
      }
      const s = spec[enemy.attackKind ?? 'stand'] ?? spec.stand!;
      const maxWindup = s.windup;
      const charge = 1 - this.clamp((enemy.windupTimer ?? 0) / maxWindup, 0, 1);
      let reach = s.reach;
      let band = s.band;
      let start = s.start ?? enemy.radius * 0.5;
      if (enemy.attackKind === 'charge' || enemy.attackKind === 'charge2') {
        const chargeGeometry = this.fatherChargeGeometry(enemy, enemy.attackAngle);
        start = chargeGeometry.start;
        reach = chargeGeometry.reach;
        band = chargeGeometry.band;
      }
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.attackAngle);
      ctx.globalAlpha = 0.14 + charge * 0.28;
      ctx.fillStyle = s.fill;
      const warningLength = Math.max(0, reach - start);
      ctx.fillRect(start, -band, warningLength, band * 2);

      // 分段边缘和箭头提供方向，不再用整排贯穿危险带的栅栏线。
      ctx.fillStyle = s.edge;
      ctx.globalAlpha = 0.58 + charge * 0.38;
      for (let distance = start; distance < reach; distance += 18) {
        const segment = Math.min(11, reach - distance);
        ctx.fillRect(distance, -band - 2, segment, 3);
        ctx.fillRect(distance, band - 1, segment, 3);
      }
      ctx.fillRect(reach - 3, -band - 2, 4, band * 2 + 4);

      ctx.fillStyle = s.core;
      ctx.globalAlpha = 0.42 + charge * 0.46;
      for (let distance = start + 28; distance < reach - 14; distance += 42) {
        ctx.fillRect(distance, -6, 3, 4);
        ctx.fillRect(distance + 3, -3, 3, 6);
        ctx.fillRect(distance, 3, 3, 4);
      }

      // 蓄满瞬间的锋线
      ctx.fillStyle = s.edge;
      ctx.globalAlpha = charge * charge * 0.8;
      ctx.fillRect(start, -2, warningLength * charge, 4);
      ctx.restore();
    }

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
    const eliteSkillWindup = Boolean((enemy.elite || enemy.backstabber) && (enemy.windupTimer ?? 0) > 0);
    const contactAttack = contactDistance <= enemy.radius + 17 && enemy.attackCooldown <= warningWindow;
    const attacking = eliteSkillWindup || contactAttack;
    const attackProgress = eliteSkillWindup
      ? 1 - this.clamp((enemy.windupTimer ?? 0) / 1.1, 0, 1)
      : contactAttack
        ? 1 - this.clamp(enemy.attackCooldown / warningWindow, 0, 1)
        : 0;
    // Dark canonical sprites need a quiet landing mark on the floor. Four
    // square corners read as a pixel halo and keep silhouettes legible without
    // adding a smooth glow.
    if (!enemy.lanternSummon) {
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
    }
    const faceLeft = this.heroX < enemy.x;
    const bossAnimation = this.bossAnimationFrame(enemy);
    const skillDrawn = bossAnimation
      ? this.pixelBossSkills.draw(ctx, enemy, bossAnimation.id, bossAnimation.frame, faceLeft)
      : false;
    let storyDrawn = false;
    if (!skillDrawn && enemy.xiaoZhang) {
      this.drawXiaoZhangFigure(enemy.x, enemy.y, faceLeft, true, attackProgress, 'backstab', 64);
      storyDrawn = true;
    }
    const pixelDrawn = skillDrawn || storyDrawn || this.pixelEnemies.draw(ctx, enemy, attacking, attackProgress, faceLeft);
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
    if (enemy.backstabber && !enemy.xiaoZhang) {
      ctx.fillStyle = '#7f3342';
      for (const [spikeY, spikeLength] of [[-10, 14], [0, 18], [10, 13]] as const) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.45, spikeY - 4);
        ctx.lineTo(-r * 0.45 - spikeLength, spikeY);
        ctx.lineTo(-r * 0.45, spikeY + 4);
        ctx.fill();
      }
    }
    if (enemy.xiaoZhangBox) this.drawXiaoZhangBadgeLocal();
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
    // 独立图集加载失败时的同语义应急形体；正常运行不会进入这些分支。
    } else if (enemy.type === 'wet-shoes') {            // 还没干的那双鞋
      ctx.fillStyle = '#3b2f2a';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.1, r * 0.5);
        ctx.lineTo(side * r * 0.1, -r * 0.1);
        ctx.quadraticCurveTo(side * r * 0.9, -r * 0.2, side * r * 0.95, r * 0.5);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(110,140,150,.45)';
      ctx.beginPath(); ctx.ellipse(0, r * 0.72, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    } else if (enemy.type === 'revolving-lantern') {    // 走马灯
      const spin = enemy.age * 2.2;
      ctx.fillStyle = '#c2894a';
      ctx.fillRect(-r * 0.8, -r * 0.85, r * 1.6, 4);
      ctx.fillRect(-r * 0.8, r * 0.7, r * 1.6, 4);
      ctx.fillStyle = 'rgba(226,183,106,.85)';
      ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.72, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a2b1c';
      for (let i = 0; i < 3; i += 1) {
        const a = spin + (i / 3) * Math.PI * 2;
        const hx = Math.cos(a) * r * 0.42;
        if (Math.sin(a) < 0) continue;
        ctx.fillRect(hx - 3, -r * 0.2, 6, 8);
        ctx.fillRect(hx - 5, -r * 0.24, 4, 4);
      }
    } else if (enemy.type === 'praise-chair') {         // 你很优秀（背对的老板椅）
      ctx.fillStyle = '#2b2a30';
      ctx.beginPath();
      ctx.moveTo(-r * 0.62, r); ctx.lineTo(-r * 0.72, -r * 0.55);
      ctx.quadraticCurveTo(0, -r * 1.05, r * 0.72, -r * 0.55);
      ctx.lineTo(r * 0.62, r); ctx.fill();
      ctx.fillStyle = '#43414a';
      ctx.fillRect(-r * 0.95, -r * 0.35, r * 0.24, r * 0.9);
      ctx.fillRect(r * 0.71, -r * 0.35, r * 0.24, r * 0.9);
      ctx.strokeStyle = '#15141b'; ctx.lineWidth = 2;
      for (const cy of [-r * 0.5, -r * 0.1, r * 0.3]) {
        ctx.beginPath(); ctx.moveTo(-r * 0.34, cy); ctx.lineTo(r * 0.34, cy); ctx.stroke();
      }
    } else if (enemy.type === 'ringing-phone') {        // 响个不停
      const lit = Math.sin(enemy.age * 8) > 0;
      ctx.fillStyle = '#16161c';
      ctx.beginPath(); ctx.roundRect(-r * 0.46, -r * 0.86, r * 0.92, r * 1.72, 5); ctx.fill();
      ctx.fillStyle = lit ? '#cfe4ea' : '#43525a';
      ctx.beginPath(); ctx.roundRect(-r * 0.36, -r * 0.74, r * 0.72, r * 1.48, 3); ctx.fill();
      if (lit) {
        ctx.strokeStyle = 'rgba(207,228,234,.55)'; ctx.lineWidth = 2;
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.arc(side * r * 0.62, 0, r * 0.3, -0.7, 0.7); ctx.stroke();
        }
      }
    } else if (enemy.type === 'others-paper') {         // 别人的那张
      ctx.fillStyle = '#ded8ca';
      ctx.fillRect(-r * 0.66, -r * 0.86, r * 1.32, r * 1.72);
      ctx.strokeStyle = '#a63649'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(r * 0.14, -r * 0.34, r * 0.32, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#8b8577';
      for (const ly of [r * 0.16, r * 0.42, r * 0.66]) ctx.fillRect(-r * 0.5, ly, r * 0.9, 2);
    } else if (enemy.type === 'sign-here') {            // 要签字的那一栏
      ctx.fillStyle = '#ded8ca';
      ctx.fillRect(-r * 0.9, -r * 0.34, r * 1.8, r * 0.72);
      ctx.fillStyle = '#8b8577'; ctx.fillRect(-r * 0.72, -r * 0.16, r * 0.5, 2);
      ctx.strokeStyle = '#15141b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.72, r * 0.16); ctx.lineTo(r * 0.74, r * 0.16); ctx.stroke();
    } else if (enemy.type === 'id-scanner') {           // 识别中
      ctx.fillStyle = '#23262b';
      ctx.beginPath(); ctx.roundRect(-r * 0.62, -r * 0.8, r * 1.24, r * 1.6, 3); ctx.fill();
      const scan = (Math.sin(enemy.age * 3) * 0.5 + 0.5) * r * 1.1 - r * 0.55;
      ctx.strokeStyle = '#6f9a72'; ctx.lineWidth = 2;
      ctx.strokeRect(-r * 0.4, -r * 0.56, r * 0.8, r * 0.8);
      ctx.strokeStyle = 'rgba(126,206,140,.8)';
      ctx.beginPath(); ctx.moveTo(-r * 0.5, scan); ctx.lineTo(r * 0.5, scan); ctx.stroke();
    } else if (enemy.type === 'task-simple' || enemy.type === 'task-revise'
      || enemy.type === 'task-deadline' || enemy.type === 'task-sync') {   // 任务四只：未读消息气泡
      const tint = enemy.type === 'task-simple' ? '#7f96a8'
        : enemy.type === 'task-revise' ? '#a2849c'
        : enemy.type === 'task-deadline' ? '#b58558' : '#6f8f8a';
      ctx.fillStyle = tint;
      ctx.beginPath(); ctx.roundRect(-r * 0.86, -r * 0.66, r * 1.72, r * 1.12, 6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.44); ctx.lineTo(-r * 0.02, r * 0.86); ctx.lineTo(r * 0.24, r * 0.44); ctx.fill();
      ctx.fillStyle = 'rgba(20,20,26,.72)';
      if (enemy.type === 'task-simple') {
        ctx.fillRect(-r * 0.5, -r * 0.2, r * 1.0, 3);
      } else if (enemy.type === 'task-revise') {
        ctx.strokeStyle = 'rgba(20,20,26,.72)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -r * 0.08, r * 0.34, 0.5, Math.PI * 1.7); ctx.stroke();
      } else if (enemy.type === 'task-deadline') {
        ctx.beginPath(); ctx.arc(0, -r * 0.08, r * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = tint; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -r * 0.08); ctx.lineTo(0, -r * 0.3); ctx.moveTo(0, -r * 0.08); ctx.lineTo(r * 0.16, -r * 0.02); ctx.stroke();
      } else {
        for (const ly of [-r * 0.26, -r * 0.04, r * 0.18]) ctx.fillRect(-r * 0.46, ly, r * 0.92, 3);
      }
    } else if (enemy.type === 'desk-lamp') {            // 没关的台灯
      ctx.fillStyle = '#4a4a52';
      ctx.fillRect(-r * 0.5, r * 0.6, r * 1.0, 5);
      ctx.fillRect(-3, -r * 0.2, 6, r * 0.85);
      ctx.fillStyle = '#8a8a94';
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.2); ctx.lineTo(-r * 0.3, -r * 0.75); ctx.lineTo(r * 0.3, -r * 0.75); ctx.lineTo(r * 0.6, -r * 0.2); ctx.fill();
      ctx.fillStyle = 'rgba(232,205,132,.34)';
      ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.16); ctx.lineTo(r * 0.55, -r * 0.16); ctx.lineTo(r * 1.05, r * 0.62); ctx.lineTo(-r * 1.05, r * 0.62); ctx.fill();
    } else if (enemy.type === 'reheated-pot') {         // 热过两遍的那锅
      ctx.fillStyle = '#3f4348';
      ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.72, 0, Math.PI); ctx.fill();
      ctx.fillRect(-r * 0.72, -r * 0.06, r * 1.44, 5);
      ctx.fillStyle = '#5a5f66';
      ctx.beginPath(); ctx.ellipse(0, -r * 0.12, r * 0.6, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(200,200,206,.3)'; ctx.lineWidth = 2;
      for (const sx of [-r * 0.28, r * 0.24]) {
        ctx.beginPath(); ctx.moveTo(sx, -r * 0.3); ctx.quadraticCurveTo(sx + 5, -r * 0.6, sx, -r * 0.88); ctx.stroke();
      }
    } else if (enemy.type === 'meeting-door') {         // 会议室的门
      ctx.fillStyle = '#4a3a30';
      ctx.fillRect(-r * 0.62, -r * 0.95, r * 1.24, r * 1.9);
      ctx.fillStyle = 'rgba(232,220,180,.5)';
      ctx.fillRect(r * 0.58, -r * 0.95, 4, r * 1.9);
      ctx.fillStyle = '#c8b078';
      ctx.beginPath(); ctx.arc(r * 0.36, r * 0.1, 3, 0, Math.PI * 2); ctx.fill();
    } else if (enemy.type === 'checkup-report') {       // 去年的体检报告
      ctx.fillStyle = '#ded8ca';
      ctx.fillRect(-r * 0.62, -r * 0.86, r * 1.24, r * 1.72);
      ctx.strokeStyle = '#b8434f'; ctx.lineWidth = 3;
      for (const ax of [-r * 0.22, r * 0.2]) {
        ctx.beginPath();
        ctx.moveTo(ax, r * 0.42); ctx.lineTo(ax, -r * 0.3);
        ctx.moveTo(ax - 5, -r * 0.16); ctx.lineTo(ax, -r * 0.34); ctx.lineTo(ax + 5, -r * 0.16);
        ctx.stroke();
      }
    } else if (enemy.type === 'queue-screen') {         // 叫号屏
      ctx.fillStyle = '#1b2126';
      ctx.beginPath(); ctx.roundRect(-r * 0.86, -r * 0.6, r * 1.72, r * 1.2, 3); ctx.fill();
      ctx.fillStyle = '#c8563f';
      const digits = 2 + (Math.floor(enemy.age * 1.4) % 3);
      for (let i = 0; i < digits; i += 1) {
        ctx.fillRect(-r * 0.56 + i * r * 0.4, -r * 0.26, r * 0.22, r * 0.52);
      }
    } else if (enemy.type === 'others-family') {        // 别人的家属
      ctx.fillStyle = '#4b4a55';
      ctx.beginPath(); ctx.ellipse(0, -r * 0.5, r * 0.3, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r * 0.44, r * 0.9); ctx.lineTo(-r * 0.3, -r * 0.16); ctx.lineTo(r * 0.3, -r * 0.16); ctx.lineTo(r * 0.44, r * 0.9); ctx.fill();
      ctx.fillStyle = '#9a7a4a';
      ctx.fillRect(r * 0.36, r * 0.1, r * 0.5, r * 0.42);
      ctx.strokeStyle = '#9a7a4a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r * 0.61, r * 0.1, r * 0.2, Math.PI, Math.PI * 2); ctx.stroke();
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
    const autoRenewPhase = equipped.includes('auto-renew') && this.state === 'battle' && this.battleTime < 15
      ? (['stub', 'two', 'three', 'four'] as const)[Math.min(3, Math.floor(this.battleTime / 3.75))]!
      : 'neutral';
    const shutdownProgress = this.saveEffect?.kind === 'shutdown'
      ? this.clamp(1 - this.saveEffect.timer / this.saveEffect.duration, 0, 0.999)
      : -1;
    const serverShutdownPhase = shutdownProgress >= 0
      ? (['appear', 'leap', 'guard', 'disconnect'] as const)[Math.min(3, Math.floor(shutdownProgress * 4))]!
      : 'standby';
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
      thirdPillPhase: equipped.includes('third-pill') ? this.pillPhaseState : undefined,
      autoRenewPhase,
      slowWatchFreeze: equipped.includes('slow-watch') && this.watchFreeze > 0,
      momoHeadpieceState: equipped.includes('momo-avatar') && this.momoRangeState === 'threatened'
        ? 'threatened'
        : 'safe',
      eyeExerciseActive: equipped.includes('eye-exercise') && this.eyeClosedTimer > 0,
      typingIndicatorDots: equipped.includes('typing-indicator') && this.state === 'battle'
        ? this.currentTypingIndicatorDots()
        : 0,
      serverShutdownPhase: equipped.includes('server-shutdown') ? serverShutdownPhase : undefined,
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

  private projectileVisualBudget(): {
    secondaryCount: number;
    trailStride: number;
    coreLift: boolean;
  } {
    const secondaryCount = this.projectiles.filter((projectile) => projectile.poolPriority === 'secondary').length;
    return {
      secondaryCount,
      trailStride: secondaryCount >= 192 ? 6 : secondaryCount >= 128 ? 5 : secondaryCount >= 80 ? 4 : secondaryCount >= 48 ? 3 : secondaryCount >= 24 ? 2 : 1,
      coreLift: secondaryCount >= 48,
    };
  }

  private renderProjectiles(): void {
    const ctx = this.ctx;
    const visualBudget = this.projectileVisualBudget();
    for (const projectile of this.projectiles) {
      const secondary = projectile.poolPriority === 'secondary';
      const protectedOrbit = Boolean(projectile.orbit);
      if (!this.visibleInLampLight(projectile.x, projectile.y, projectile.radius + 6)) continue;
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

      // 一颗弹只允许一种尾迹；高负载只抽样重复尾迹，所有弹体本身仍完整绘制并参与碰撞。
      const drawTrail = !secondary || protectedOrbit || projectile.id % visualBudget.trailStride === 0;
      ctx.fillStyle = visual.trailColor;
      ctx.strokeStyle = visual.trailColor;
      if (!drawTrail) {
        // Body rendering continues below.
      } else if (visual.trail === 'drip') {
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
      } else if (visual.trail === 'heavy') {
        ctx.globalAlpha = lifeFade * 0.48;
        for (let step = 1; step <= 3; step += 1) {
          const size = Math.max(2, 5 - step);
          ctx.fillRect(Math.round(-projectile.radius * (step + 1.2)), step * 2 - 3, size, size);
        }
      } else if (visual.trail === 'ricochet') {
        ctx.globalAlpha = lifeFade * 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-projectile.radius * 4.6, -3);
        ctx.lineTo(-projectile.radius * 3.2, 2);
        ctx.lineTo(-projectile.radius * 1.8, -2);
        ctx.lineTo(-projectile.radius * 0.9, 0);
        ctx.stroke();
      } else if (visual.trail === 'frost') {
        ctx.globalAlpha = lifeFade * 0.58;
        for (let step = 1; step <= 3; step += 1) {
          const x = Math.round(-projectile.radius * (step + 1.1));
          const y = step % 2 ? -2 : 2;
          ctx.fillRect(x - 2, y, 5, 1);
          ctx.fillRect(x, y - 2, 1, 5);
        }
      } else if (visual.trail === 'serial') {
        ctx.globalAlpha = lifeFade * 0.44;
        for (let step = 1; step <= 4; step += 1) {
          ctx.fillRect(Math.round(-projectile.radius * (step + 0.8)), -2, 1, 5);
        }
      } else if (visual.trail === 'return-mark') {
        ctx.globalAlpha = lifeFade * 0.5;
        const x = Math.round(-projectile.radius * 2.8);
        ctx.fillRect(x - 2, -2, 5, 1);
        ctx.fillRect(x, -4, 1, 5);
      } else if (visual.trail === 'curve' || visual.trail === 'home') {
        ctx.globalAlpha = lifeFade * 0.42;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-projectile.radius * 2.2, visual.trail === 'home' ? 3 : 0, projectile.radius * 1.7, Math.PI * 0.9, Math.PI * 1.75);
        ctx.stroke();
      } else if (visual.trail === 'key-dust' || visual.trail === 'clock') {
        ctx.globalAlpha = lifeFade * 0.5;
        for (let step = 1; step <= 3; step += 1) {
          const x = Math.round(-projectile.radius * (step + 1));
          ctx.fillRect(x, step % 2 ? -2 : 2, step === 2 ? 2 : 1, step === 2 ? 2 : 1);
        }
      } else if (visual.trail === 'glitch') {
        ctx.globalAlpha = lifeFade * 0.46;
        ctx.fillRect(Math.round(-projectile.radius * 4), -3, Math.max(3, projectile.radius), 2);
        ctx.fillRect(Math.round(-projectile.radius * 2.7), 2, Math.max(2, projectile.radius * 0.7), 1);
      } else if (visual.trail === 'fade' || visual.trail === 'afterimage') {
        for (let step = 1; step <= 3; step += 1) {
          ctx.globalAlpha = lifeFade * (0.34 / step);
          ctx.beginPath();
          ctx.ellipse(-projectile.radius * (step + 1), 0, projectile.radius * 0.65, projectile.radius * 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (visual.trail === 'chain') {
        ctx.globalAlpha = lifeFade * 0.45;
        ctx.lineWidth = 1;
        for (let step = 1; step <= 3; step += 1) {
          ctx.beginPath();
          ctx.ellipse(-projectile.radius * (step + 0.8), 0, 3, 2, step % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (visual.trail === 'child' || visual.trail === 'pause') {
        ctx.globalAlpha = lifeFade * 0.46;
        const x = Math.round(-projectile.radius * 2.6);
        if (visual.trail === 'child') {
          ctx.beginPath(); ctx.arc(x, 0, Math.max(1.5, projectile.radius * 0.35), 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(x - 2, -3, 1, 6); ctx.fillRect(x + 2, -3, 1, 6);
        }
      } else if (visual.trail === 'splinter') {
        ctx.globalAlpha = lifeFade * 0.52;
        ctx.fillRect(Math.round(-projectile.radius * 2.1), -3, 3, 1);
        ctx.fillRect(Math.round(-projectile.radius * 2.8), 2, 2, 1);
        ctx.fillRect(Math.round(-projectile.radius * 3.5), -1, 1, 2);
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
        const tintStrength = visual.form === 'breath' ? 0.28 : visual.form === 'slash' ? 0.68 : 0.42;
        const sprite = projectileAtlas.tintedNamed(spriteName, tint, tintStrength);
        if (sprite) {
          // Collision radius stays mechanical; readable forms use their own
          // display curve so diminishing volleys remain distinct but legible.
          const displayCurve = PROJECTILE_FORM_DISPLAY_SIZE[visual.form];
          const baseSize = visual.form === 'breath'
            ? projectile.radius * 3.4
            : displayCurve
              ? this.clamp(displayCurve[0] + projectile.radius * displayCurve[1], displayCurve[2], displayCurve[3])
              : Math.max(projectile.radius * 3.1, 15);
          const formWidthScale = visual.form === 'slash' ? 1.18 : visual.form === 'razor' || visual.form === 'lens' ? 1.15 : 1;
          const formHeightScale = visual.form === 'slash' ? 1.12 : visual.form === 'razor' || visual.form === 'lens' ? 0.72 : 1;
          const widthScale = this.clamp(0.78 + visual.length * 0.2 + visual.sharpness * 0.12, 0.85, 1.9) * formWidthScale;
          const heightScale = this.clamp(1 + visual.weight * 0.12 - visual.sharpness * 0.1, 0.72, 1.45) * formHeightScale;
          const wobble = visual.form === 'breath'
            ? Math.sin(projectile.life * 9 + projectile.id * 1.7) * (1 - firmness) * 0.16
            : 0;
          const drawWidth = baseSize * widthScale * (1 + wobble);
          const drawHeight = baseSize * heightScale;
          // 堆叠越夸张，越要让母弹可追踪：核心弹加一层放大叠光，派生弹一颗也不裁。
          if (!secondary && visualBudget.coreLift) {
            const corePulse = this.reducedMotion ? 1.16 : 1.16 + Math.sin(projectile.life * 11 + projectile.id) * 0.035;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = lifeFade * (projectile.critical ? 0.34 : 0.22);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
              sprite,
              -drawWidth * corePulse / 2,
              -drawHeight * corePulse / 2 + wobble * 5,
              drawWidth * corePulse,
              drawHeight * corePulse,
            );
            ctx.restore();
          }
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
      if (!secondary && visualBudget.coreLift) {
        ctx.globalAlpha = lifeFade * 0.34;
        ctx.strokeStyle = projectile.critical ? '#fff8c5' : visual.edgeColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(6, projectile.radius * 1.9), 0, Math.PI * 2);
        ctx.stroke();
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
    const ordinaryStride = this.bursts.length >= 120
      ? 4
      : this.bursts.length >= 80
        ? 3
        : this.bursts.length >= 50
          ? 2
          : 1;
    for (const burst of this.bursts) {
      const important = burst.kind === 'word' || burst.kind === 'syn';
      if (!important && burst.id % ordinaryStride !== 0) continue;
      if (!this.visibleInLampLight(burst.x, burst.y, burst.radius + 8)) continue;
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
        // 钥匙终点分两拍：钥匙孔保持可认，开门光向两侧展开；不要画成会移动的闭合网格框。
        const keyholeRadius = Math.max(2, Math.round(burst.radius * 0.07));
        const keyholeStem = Math.max(3, Math.round(burst.radius * 0.14));
        ctx.save();
        ctx.fillStyle = '#2a2117';
        ctx.beginPath();
        ctx.arc(Math.round(burst.x), Math.round(burst.y - 2), keyholeRadius + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(Math.round(burst.x - 2), Math.round(burst.y - 1), 4, keyholeStem + 2);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(Math.round(burst.x), Math.round(burst.y - 2), keyholeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(
            Math.round(burst.x - 1),
            Math.round(burst.y),
            2,
            keyholeStem,
        );
        if (progress > 0.16) {
          const splitProgress = Math.min(1, (progress - 0.16) / 0.84);
          const doorLightExtent = Math.max(5, Math.round(burst.radius * 0.42 * splitProgress));
          const doorLightHalfHeight = Math.max(3, Math.round(burst.radius * (0.06 + splitProgress * 0.2)));
          ctx.save();
          ctx.globalAlpha *= 0.72;
          ctx.beginPath();
          ctx.moveTo(Math.round(burst.x - keyholeRadius - 1), Math.round(burst.y));
          ctx.lineTo(Math.round(burst.x - doorLightExtent), Math.round(burst.y - doorLightHalfHeight));
          ctx.lineTo(Math.round(burst.x - doorLightExtent), Math.round(burst.y + doorLightHalfHeight));
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(Math.round(burst.x + keyholeRadius + 1), Math.round(burst.y));
          ctx.lineTo(Math.round(burst.x + doorLightExtent), Math.round(burst.y - doorLightHalfHeight));
          ctx.lineTo(Math.round(burst.x + doorLightExtent), Math.round(burst.y + doorLightHalfHeight));
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      } else if (burst.kind === 'frame') {
        const width = burst.radius * (0.45 + progress * 0.72);
        const height = width * 0.78;
        ctx.lineWidth = Math.max(1, 3 - progress * 1.5);
        ctx.strokeRect(burst.x - width / 2, burst.y - height / 2, width, height);
        ctx.globalAlpha *= 0.55;
        ctx.strokeRect(burst.x - width * 0.38, burst.y - height * 0.35, width * 0.76, height * 0.7);
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
    drawStatusIcon(ctx, 321, 22, 'breath-power', 1, UI_PALETTE.breath);
    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 15px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(this.rewardTitle, 20, 35, 320, 18, 2);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    if (this.itemRewardChoices.length < 4) {
      ctx.fillText(this.initialItemReward ? '出门物证 · 只能带走一件' : '困难缩成物件，留在了这一身上', 20, 72);
      drawStitchDivider(ctx, 20, 82, 320, 'horizontal', '#4d494d', 5, 4);
    } else {
      ctx.fillText('入学通知书生效 · 四选一 · 必须选走一件', 20, 62);
      drawStitchDivider(ctx, 20, 70, 320, 'horizontal', '#4d494d', 5, 4);
    }
    for (let index = 0; index < this.itemRewardChoices.length; index += 1) {
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
    if (this.itemRewardChoices.length < 4 || this.rewardAcquire) {
      ctx.fillText(this.rewardAcquire ? '物证已订进这一身。' : '每一件道具，都是他活过的证据。', 180, 620);
    }
  }

  private renderRewardAcquireEffect(): void {
    const acquisition = this.rewardAcquire;
    if (!acquisition) return;
    const ctx = this.ctx;
    const y = this.rewardRowsTop() + acquisition.index * this.rewardRowStride();
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

  /** 第五档「这一身」固定掉落：整屏只此一件，拾取已完成，玩家只能点一下继续走。 */
  private renderStoryDrop(): void {
    const id = this.storyDropId;
    if (!id) return;
    const ctx = this.ctx;
    applyPixelDiscipline(ctx);
    const deskPattern = uiTextures.pattern(ctx, 'desk');
    ctx.fillStyle = deskPattern ?? UI_PALETTE.night;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,8,12,.82)';
    ctx.fillRect(0, 0, W, H);
    const reveal = this.reducedMotion ? 1 : this.clamp(this.storyDropTimer / 0.45, 0, 1);
    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.breath;
    ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('这 一 身 · 第 五 档', 180, 108);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `10px ${UI_FONT_STACK}`;
    ctx.fillText(STORY_DROP_MEANINGS[this.encounterIndex] ?? '', 180, 132);
    drawStitchDivider(ctx, 60, 150, 240, 'horizontal', '#4d494d', 5, 4);
    if (this.encounterIndex === 3) {
      ctx.fillStyle = '#8b8171';
      ctx.font = `9px ${UI_FONT_STACK}`;
      ctx.fillText('最后一通 · 打给家里', 180, 176);
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.font = `bold 14px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('「没事。不忙。」', 180, 201);
    }
    ctx.restore();
    // 物证卡本体：复用奖励卡版式，居中一张（index 1 → y=240 一带）
    ctx.save();
    ctx.globalAlpha = reveal;
    this.drawItemRecord(id, 1, 'reward');
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText('不进三选一 · 不可拒绝 · 已经穿上了', 180, 420);
    if (this.storyDropTimer >= 0.55 && (this.reducedMotion || Math.sin(this.visualTime * 3) > -0.25)) {
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.fillText('他没得选 · 点一下，穿上继续走', 180, 560);
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
    this.drawBreathActionButton(
      { x: 18, y: 558, width: 150, height: 42 },
      '换一批 · 2', UI_PALETTE.hospitalBlueGray, this.hero.coins >= 2, rerollFocused,
    );
    ctx.restore();
    const leaveFocused = this.shopFocus === 4;
    this.drawBreathActionButton(
      { x: 192, y: 558, width: 150, height: 42 },
      '推门离开', '#666870', true, leaveFocused,
    );
  }

  private drawItemRecord(id: ItemId, index: number, mode: 'reward' | 'shop', offer?: ShopOffer): void {
    const ctx = this.ctx;
    const item = getItem(id);
    const y = (mode === 'reward' ? this.rewardRowsTop() : 88) + index * (mode === 'reward' ? this.rewardRowStride() : 152);
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
    const interaction = this.actionState({ x: 16, y: y + 4, width: 328, height: 136 });
    if (interaction.pressed && !displaySold) ctx.translate(0, 1);
    if (mode === 'shop' && reveal < 1) ctx.translate(0, Math.round((1 - reveal) * -4));
    ctx.globalAlpha = (displaySold ? 0.28 : 1) * (0.15 + reveal * 0.85);
    ctx.fillStyle = mode === 'reward'
      ? (focused ? 'rgba(32,34,39,.92)' : 'rgba(22,22,27,.82)')
      : 'rgba(16,12,13,.88)';
    ctx.fillRect(16, y + 4, 328, 136);
    ctx.fillStyle = mode === 'reward' ? UI_PALETTE.hospitalBlueGray : item.color;
    ctx.fillRect(16, y + 4, 3, 136);
    drawStitchDivider(ctx, 24, y + 139, 312, 'horizontal', '#454147', 4, 4);
    if (mode === 'reward') {
      drawStitchDivider(ctx, 91, y + 14, 112, 'vertical', '#403f44', 4, 4);
      ctx.fillStyle = focused ? 'rgba(232,225,211,.12)' : 'rgba(232,225,211,.055)';
      ctx.fillRect(20, y + 8, focused ? 46 : 24, 1);
      ctx.fillRect(focused ? 278 : 300, y + 135, focused ? 46 : 24, 1);
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
    ctx.fillText(`${'ⅠⅡⅢⅣⅤ'[item.quality - 1]} · ${item.qualityName}`, 96, y + 18);
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
        mode === 'reward' ? UI_PALETTE.breath : UI_PALETTE.hospitalBlueGray,
      );
    }
    ctx.restore();
  }

  private drawFocusCorners(x: number, y: number, width: number, height: number, color: string): void {
    const ctx = this.ctx;
    const phase = this.reducedMotion ? 0 : Math.floor(this.visualTime * 5) % 4;
    const length = 10 + phase;
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), length, 2);
    ctx.fillRect(Math.round(x), Math.round(y), 2, length);
    ctx.fillRect(Math.round(x + width - length), Math.round(y + height - 2), length, 2);
    ctx.fillRect(Math.round(x + width - 2), Math.round(y + height - length), 2, length);
    ctx.globalAlpha *= 0.42;
    ctx.fillRect(Math.round(x + 18 + phase * 3), Math.round(y), 8, 1);
    ctx.fillRect(Math.round(x + width - 26 - phase * 3), Math.round(y + height - 1), 8, 1);
    ctx.restore();
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
      this.specialRoomKind === 'light'
        ? (this.specialRoomPreviousLifeItem ? '看守人：有人把它留在这儿了。' : '桌上没有价签。只能带走一件。')
        : '不收零钱。镜子只认还剩多少口气。',
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

    this.drawBreathActionButton(
      SPECIAL_LEAVE_RECT,
      this.specialRoomKind === 'light' ? '轻轻把门带上' : '掀帘出去',
      this.specialRoomKind === 'light' ? UI_PALETTE.raincoatYellow : UI_PALETTE.hospitalBlueGray,
      true,
      this.specialRoomLeaveFocused,
    );
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
    const fromPreviousLife = this.specialRoomKind === 'light' && id === this.specialRoomPreviousLifeItem;
    const canAfford = this.specialRoomKind === 'light' || id === 'broken-spine' || this.hero.maxHp - 12 >= 20;
    const holding = this.specialRoomPointerId !== -1 && this.specialRoomHoldIndex === index;
    const holdProgress = holding
      ? this.clamp((performance.now() - this.specialRoomHoldStarted) / SPECIAL_HOLD_MS, 0, 1)
      : 0;

    ctx.save();
    const interaction = this.actionState(rect);
    if (interaction.pressed && !taken && canAfford) ctx.translate(0, 1);
    if (this.specialRoomKind === 'light') {
      ctx.fillStyle = focused ? 'rgba(198,164,74,.10)' : 'rgba(198,164,74,.035)';
      ctx.fillRect(rect.x + 8, rect.y, rect.width - 16, 128);
    } else {
      ctx.strokeStyle = focused ? UI_PALETTE.hospitalBlueGray : '#50484b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, rect.y + 4);
      ctx.lineTo(centerX, rect.y + 49);
      ctx.lineTo(centerX - 4, rect.y + 55);
      ctx.stroke();
    }

    if (focused) {
      const accent = this.specialRoomKind === 'light' ? UI_PALETTE.raincoatYellow : UI_PALETTE.hospitalBlueGray;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
      ctx.fillStyle = accent;
      ctx.fillRect(rect.x, rect.y, 12, 2);
      ctx.fillRect(rect.x, rect.y, 2, 12);
      ctx.fillRect(rect.x + rect.width - 12, rect.y + rect.height - 2, 12, 2);
      ctx.fillRect(rect.x + rect.width - 2, rect.y + rect.height - 12, 2, 12);
    }

    if (fromPreviousLife && !taken) {
      const tagX = centerX - 31;
      const tagY = rect.y + 9;
      ctx.strokeStyle = UI_PALETTE.oldRed;
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX + 0.5, tagY + 0.5, 61, 17);
      ctx.fillStyle = UI_PALETTE.oldRed;
      ctx.font = `bold 8px ${UI_ARCHIVE_FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.fillText('上一世的', centerX, tagY + 12);
    }

    ctx.globalAlpha = taken ? 0.2 : canAfford ? 1 : 0.38;
    const itemY = rect.y + 74 + (this.reducedMotion || taken ? 0 : Math.sin(this.visualTime * 2 + index * 1.1) * 2);
    this.drawItemPedestal(centerX, rect.y + 126, item.quality, false, taken);
    if (!taken) this.drawItemSymbol(id, centerX, itemY, 30);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = taken ? '#6c6869' : item.color;
    ctx.font = `bold 8px ${UI_FONT_STACK}`;
    ctx.fillText(`${'ⅠⅡⅢⅣⅤ'[item.quality - 1]} · ${item.qualityName}`, centerX, rect.y + 149);
    ctx.fillStyle = taken ? '#777276' : UI_PALETTE.paperLight;
    ctx.font = `bold 11px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(taken ? '空下来的位置' : item.name, centerX, rect.y + 169, rect.width - 14, 13, 2);

    const status = taken ? '已经穿上' : !canAfford ? '已经付不起' : holding ? '别松手' : focused ? '按住带走' : `${index + 1}`;
    ctx.fillStyle = taken ? '#6d696d' : !canAfford ? UI_PALETTE.warning : focused
      ? (this.specialRoomKind === 'light' ? UI_PALETTE.raincoatYellow : UI_PALETTE.hospitalBlueGray)
      : UI_PALETTE.paperDim;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(status, centerX, rect.y + 203);
    if (holding) {
      ctx.fillStyle = '#29262a';
      ctx.fillRect(rect.x + 8, rect.y + rect.height - 7, rect.width - 16, 3);
      ctx.fillStyle = this.specialRoomKind === 'light' ? UI_PALETTE.raincoatYellow : UI_PALETTE.hospitalBlueGray;
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
    const fromPreviousLife = paper && id === this.specialRoomPreviousLifeItem;
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
    ctx.fillText(paper ? (fromPreviousLife ? '上一世留下' : '灯下预留') : '镜中预演', 124, 377);
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

    this.drawBreathActionButton(RESULT_RESTART_RECT, '再活一次', UI_PALETTE.hospitalBlueGray);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText(
      this.resultWon ? '他没有赢，只是终于松了这一口气。' : '他没有走完，但已经走过的都算数。',
      180, 600,
    );
  }

  private renderResultSeal(): void {
    const ctx = this.ctx;
    const specimen = this.currentBreathSpecimen();

    ctx.fillStyle = UI_PALETTE.paper;
    ctx.font = `bold 12px ${UI_ARCHIVE_FONT_STACK}`;
    const identity = this.origin?.nickname ? `《${this.origin.nickname}》` : this.origin?.title || '没有留下名字的人';
    ctx.textAlign = 'left';
    ctx.fillText(identity, 20, 150);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.font = `9px ${UI_FONT_STACK}`;
    ctx.fillText(`${AGE_LABELS[Math.min(this.encounterIndex, AGE_LABELS.length - 1)]} · ${this.items.length} 件物证`, 20, 169);

    this.drawBreathSpecimen(20, 178, 320, 148, specimen.vector, specimen.visual, specimen.flags);
    drawLifeChapterTrack(
      ctx, 20, 348, 320, AGE_LABELS.length,
      Math.min(this.encounterIndex, AGE_LABELS.length - 1),
      AGE_LABELS.join('|'),
    );

    const combos = this.activeComboNames();
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_PALETTE.raincoatYellow;
    ctx.font = `bold 9px ${UI_ARCHIVE_FONT_STACK}`;
    this.wrapText(combos.length ? `《${combos[0]}》` : '尚未命名的一生', 180, 405, 300, 13, 2);

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

  private currentBreathSpecimen(): {
    vector: AttackVector;
    visual: ProjectileVisual;
    flags: ProjectileMechanicFlag[];
  } {
    const vector = this.computeAttackVector();
    const visual = this.computeProjectileVisual();
    const flags = attackVectorFlags(vector);
    if (this.hasProjectileTrigger('three-day-visible') && !flags.includes('orbit')) flags.push('orbit');
    if (
      INHERITED_PROJECTILE_ITEM_IDS.some((id) => this.hasProjectileTrigger(id))
      && !flags.includes('echo')
    ) flags.push('echo');
    return { vector, visual, flags };
  }

  private drawBreathSpecimen(
    x: number,
    y: number,
    width: number,
    height: number,
    vector: AttackVector,
    visual: ProjectileVisual,
    flags: ProjectileMechanicFlag[],
  ): void {
    const ctx = this.ctx;
    ctx.save();
    applyPixelDiscipline(ctx);
    ctx.fillStyle = 'rgba(9,9,12,.72)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = UI_PALETTE.oldRed;
    ctx.globalAlpha = 0.66;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.fillStyle = UI_PALETTE.paperLight;
    ctx.font = `bold 9px ${UI_ARCHIVE_FONT_STACK}`;
    ctx.fillText('你这一辈子，最后攒成了这么一团气。', x + 8, y + 17);
    ctx.fillStyle = UI_PALETTE.oldRed;
    ctx.fillRect(x + 8, y + 23, 42, 2);

    this.drawBreathSpecimenSprite(x + 72, y + 72, vector, visual);

    const textX = x + 124;
    ctx.fillStyle = UI_PALETTE.paper;
    ctx.font = `bold 9px ${UI_FONT_STACK}`;
    ctx.fillText(`形 · ${PROJECTILE_FORM_LABELS[visual.form]}`, textX, y + 42);
    ctx.fillStyle = UI_PALETTE.paperDim;
    ctx.fillText(`尾 · ${PROJECTILE_TRAIL_LABELS[visual.trail]}`, textX, y + 57);
    const materials = visual.materials.map((material) => PROJECTILE_MATERIAL_LABELS[material]);
    this.wrapText(`质 · ${materials.join(' / ')}`, textX, y + 72, 184, 11, 2);

    const flagLabels = flags.map((flag) => PROJECTILE_FLAG_LABELS[flag]);
    ctx.fillStyle = flagLabels.length ? UI_PALETTE.raincoatYellow : UI_PALETTE.paperDim;
    ctx.font = `8px ${UI_FONT_STACK}`;
    this.wrapText(
      flagLabels.length ? `性 · ${flagLabels.join(' · ')}` : '性 · 月白核心仍在里面',
      textX,
      y + 96,
      184,
      11,
      2,
    );

    const swatches: Array<[string, string]> = [
      ['芯', visual.coreColor], ['质', visual.materialTint], ['缘', visual.edgeColor],
    ];
    swatches.forEach(([label, color], index) => {
      const swatchX = x + 124 + index * 54;
      ctx.fillStyle = color;
      ctx.fillRect(swatchX, y + height - 20, 10, 10);
      ctx.strokeStyle = '#8d857a';
      ctx.strokeRect(swatchX + 0.5, y + height - 19.5, 9, 9);
      ctx.fillStyle = UI_PALETTE.paperDim;
      ctx.font = `8px ${UI_FONT_STACK}`;
      ctx.fillText(label, swatchX + 14, y + height - 11);
    });
    ctx.restore();
  }

  private drawBreathSpecimenSprite(
    x: number,
    y: number,
    vector: AttackVector,
    visual: ProjectileVisual,
  ): void {
    const ctx = this.ctx;
    const firmness = this.clamp(
      (vector.damage / BASE_VECTOR.damage - 1) * 0.55
      + visual.weight * 0.25 + visual.sharpness * 0.3,
      0,
      1,
    );
    const radius = this.clamp(vector.width, 3, 10);
    const trailLength = 43 + Math.min(18, visual.length * 5);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.fillStyle = visual.trailColor;
    ctx.strokeStyle = visual.trailColor;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    if (visual.trail === 'curve' || visual.trail === 'home') {
      ctx.beginPath();
      ctx.moveTo(-trailLength, 7);
      ctx.quadraticCurveTo(-trailLength * 0.55, visual.trail === 'home' ? -13 : 15, -12, 0);
      ctx.stroke();
    } else if (visual.trail === 'ricochet') {
      ctx.beginPath();
      ctx.moveTo(-trailLength, -7);
      ctx.lineTo(-trailLength * 0.68, 7);
      ctx.lineTo(-trailLength * 0.38, -5);
      ctx.lineTo(-12, 0);
      ctx.stroke();
    } else if (visual.trail === 'chain') {
      for (let index = 0; index < 4; index += 1) {
        ctx.beginPath();
        ctx.ellipse(-trailLength + index * 11, index % 2 ? 2 : -2, 6, 3, index % 2 ? 0.45 : -0.45, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      const trailStep = visual.trail === 'serial' ? 8 : 10;
      for (let offset = trailLength; offset > 10; offset -= trailStep) {
        const phase = Math.floor(offset / trailStep);
        const size = visual.trail === 'heavy' ? Math.max(2, 6 - phase % 4) : visual.trail === 'streak' ? 2 : 3;
        const py = visual.trail === 'drip' ? phase % 2 * 6 : visual.trail === 'glitch' ? (phase % 3 - 1) * 5 : phase % 2 ? -2 : 2;
        if (visual.trail === 'frost') {
          ctx.fillRect(-offset - 3, py, 7, 2);
          ctx.fillRect(-offset, py - 3, 2, 7);
        } else if (visual.trail === 'splinter') {
          ctx.fillRect(-offset - 3, py, 7, 1);
        } else {
          ctx.fillRect(-offset, py, size, size);
        }
      }
    }

    const spriteName = visual.form === 'breath'
      ? `breath${Math.min(3, Math.floor(firmness * 4))}`
      : visual.form;
    const tintStrength = visual.form === 'breath' ? 0.28 : visual.form === 'slash' ? 0.68 : 0.42;
    const sprite = projectileAtlas.tintedNamed(spriteName, visual.materialTint, tintStrength);
    const displayCurve = PROJECTILE_FORM_DISPLAY_SIZE[visual.form];
    const baseSize = visual.form === 'breath'
      ? radius * 3.4
      : displayCurve
        ? this.clamp(displayCurve[0] + radius * displayCurve[1], displayCurve[2], displayCurve[3])
        : Math.max(radius * 3.1, 15);
    const specimenSize = this.clamp(baseSize * 2.2, 38, 72);
    const formWidthScale = visual.form === 'slash' ? 1.18 : visual.form === 'razor' || visual.form === 'lens' ? 1.15 : 1;
    const formHeightScale = visual.form === 'slash' ? 1.12 : visual.form === 'razor' || visual.form === 'lens' ? 0.72 : 1;
    const widthScale = this.clamp(0.78 + visual.length * 0.2 + visual.sharpness * 0.12, 0.85, 1.9) * formWidthScale;
    const heightScale = this.clamp(1 + visual.weight * 0.12 - visual.sharpness * 0.1, 0.72, 1.45) * formHeightScale;
    const drawWidth = specimenSize * widthScale;
    const drawHeight = specimenSize * heightScale;
    if (sprite) {
      if (visual.distortion > 0.25) {
        ctx.globalAlpha = 0.22;
        ctx.drawImage(sprite, -drawWidth / 2 - 4, -drawHeight / 2 + 2, drawWidth, drawHeight);
        ctx.drawImage(sprite, -drawWidth / 2 + 4, -drawHeight / 2 - 2, drawWidth, drawHeight);
      }
      ctx.globalAlpha = visual.opacity;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    } else {
      ctx.globalAlpha = visual.opacity;
      ctx.fillStyle = visual.materialTint;
      ctx.strokeStyle = visual.edgeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, drawWidth / 2, drawHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
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
      ctx.fillText(`${'ⅠⅡⅢⅣⅤ'[item.quality - 1]} · ${item.qualityName}`, x + 42, y + 10);
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

  /** 按当前字体断行，超出 maxLines 的最后一行收成省略号。 */
  private wrapLines(text: string, maxWidth: number, maxLines: number): string[] {
    const ctx = this.ctx;
    if (maxLines <= 0) return [];
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
    return lines;
  }

  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
    const ctx = this.ctx;
    this.wrapLines(text, maxWidth, maxLines)
      .forEach((entry, lineIndex) => ctx.fillText(entry, x, y + lineIndex * lineHeight));
  }

  /**
   * 描边字：语音字幕不再有底框，靠一圈近黑描边把字从杂物地板里拎出来。
   * 用 strokeText 一次成型而不是叠 8 次 fillText——每帧只多一遍，且边缘更干净。
   */
  private drawOutlinedText(text: string, x: number, y: number, fill: string): void {
    const ctx = this.ctx;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(6,6,9,.86)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  private drawOutlinedWrapText(
    text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number, fill: string,
  ): void {
    this.wrapLines(text, maxWidth, maxLines)
      .forEach((entry, lineIndex) => this.drawOutlinedText(entry, x, y + lineIndex * lineHeight, fill));
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
    this.startRun(0x20260718, true);
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
    this.screenTransition = undefined;
    this.lastRenderedState = this.state;
  }

  private setupCombatStressAudit(): void {
    this.setupProjectileAudit();
    this.items = [
      'five-ha', 'marble', 'typing-indicator', 'ktv-song', 'breath-on-glass',
      'card-binder', 'only-key', 'stone-schoolbag', 'fathers-raincoat', 'ai-chat',
    ];
    this.battleTime = 36;
    this.enemies = [];
    const enemyTypes: EnemyType[] = ['clockwork', 'whisper', 'missed-bus'];
    for (let index = 0; index < MAX_ALIVE_ENEMIES; index += 1) {
      const angle = (index / MAX_ALIVE_ENEMIES) * Math.PI * 2;
      const distance = index === 0 ? 128 : 78 + (index % 3) * 48;
      const type: EnemyType = index === 0
        ? 'closet-dark'
        : enemyTypes[(index - 1) % enemyTypes.length]!;
      const enemy = this.createSeekingEnemy(
        type,
        this.heroX + Math.cos(angle) * distance,
        this.heroY + Math.sin(angle) * distance,
      );
      enemy.speed = 0;
      enemy.attackCooldown = 99;
      enemy.maxHp = 9999;
      enemy.hp = 9999;
      if (index === 0) {
        enemy.attackAngle = Math.PI;
        enemy.attackKind = 'shadow';
        enemy.windupTimer = 0.62;
      }
      this.enemies.push(enemy);
    }

    this.projectiles = [];
    const forms: ProjectileForm[] = [
      'breath', 'marble', 'key', 'slash', 'typing', 'sound', 'tear', 'card',
      'button', 'stone', 'laugh', 'echo',
    ];
    const styleForForm = (form: ProjectileForm): ProjectileStyle => {
      if (form === 'key') return 'key';
      if (form === 'sound' || form === 'typing') return 'sound';
      if (form === 'tear') return 'rain';
      if (form === 'card') return 'paper';
      return 'plain';
    };
    for (let index = 0; index < MAX_PROJECTILES + 60; index += 1) {
      const form = forms[index % forms.length]!;
      const angle = index * 2.399963;
      const distance = 18 + (index % 15) * 13;
      const priority = index % 10 === 0 ? 'core' : 'secondary';
      this.spawnProjectile({
        x: this.heroX + Math.cos(angle) * distance,
        y: this.heroY - 14 + Math.sin(angle) * distance,
        angle,
        damage: 1,
        speed: 0,
        radius: 4 + (index % 4),
        range: 999,
        life: 60,
        pierce: 0,
        returning: false,
        homing: 0,
        splitChance: 0,
        explosion: 0,
        generation: priority === 'core' ? 0 : 1,
        color: this.projectileColor(styleForForm(form)),
        style: styleForForm(form),
        critical: index % 17 === 0,
        knockback: 0,
        priority,
        visual: this.projectileVisualForForm(form, undefined, priority === 'core' ? 0 : 1),
      });
    }

    this.pendingShots = [];
    for (let index = 0; index < MAX_PENDING_SHOTS + 35; index += 1) {
      const form = forms[index % forms.length]!;
      const priority = index % 12 === 0 ? 'core' : 'secondary';
      this.pushPendingShot({
        delay: 60,
        angle: index * 0.17,
        damage: 1,
        speed: 120,
        radius: 5,
        range: 220,
        life: 3,
        pierce: 0,
        homing: 0,
        returning: false,
        splitChance: 0,
        explosion: 0,
        color: this.projectileColor(styleForForm(form)),
        style: styleForForm(form),
        critical: false,
        knockback: 0,
        generation: priority === 'core' ? 0 : 1,
        priority,
        visualForm: form,
      });
    }

    this.bursts = [];
    for (let index = 0; index < MAX_BURSTS + 35; index += 1) {
      const important = index % 19 === 0;
      const angle = index * 1.618;
      const distance = 24 + (index % 12) * 15;
      this.pushBurst({
        id: this.entityId++,
        kind: important ? 'syn' : index % 4 === 0 ? 'ring' : 'hit',
        x: this.heroX + Math.cos(angle) * distance,
        y: this.heroY - 14 + Math.sin(angle) * distance,
        radius: 8 + (index % 7) * 3,
        life: 60,
        duration: 60,
        color: important ? '#ef5364' : index % 3 === 0 ? '#8fd4da' : '#e4d6b3',
        text: important ? '协同' : undefined,
        material: important ? 'arc' : index % 2 === 0 ? 'paper' : 'mist',
      });
    }

    this.shotTimer = 999;
    this.spawnPause = 999;
    this.auditBossArtActive = true;
    this.screenTransition = undefined;
    this.lastRenderedState = this.state;
    this.render();
  }

  private setupProjectileComboStressAudit(): void {
    this.startRun(0x20260726, true);
    this.initialItemReward = false;
    this.hero.maxHp = 999;
    this.hero.hp = 999;
    this.encounterIndex = 2;
    this.startStage();
    this.items = [
      'five-ha', 'marble', 'ai-chat', 'year-report', 'missing-photo', 'pregnancy-test',
      'bargain-link', 'group-dad', 'only-key', 'empty-frame', 'slow-watch',
      'held-elevator', 'old-door-lock', 'red-workbook', 'spent-decade', 'ktv-song',
      'three-day-visible',
    ];
    this.poisons = { ...EMPTY_POISONS, delusion: 8, doubt: 8 };
    this.battleTime = 9.5;
    this.stageEliteSpawned = true;
    this.eliteSpawned = true;
    this.spawnPause = 999;
    this.comboReveal = undefined;
    this.comboRevealQueue = [];
    this.screenTransition = undefined;
    this.enemies = [];
    const enemyTypes: EnemyType[] = ['clockwork', 'whisper', 'missed-bus', 'debt'];
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * Math.PI * 2;
      const distance = 112 + (index % 2) * 66;
      const enemy = this.createSeekingEnemy(
        enemyTypes[index % enemyTypes.length]!,
        this.heroX + Math.cos(angle) * distance,
        this.heroY - 14 + Math.sin(angle) * distance,
      );
      enemy.speed = 0;
      enemy.attackCooldown = 99;
      enemy.maxHp = 9999;
      enemy.hp = 9999;
      this.enemies.push(enemy);
    }
    this.projectiles = [];
    this.pendingShots = [];
    this.bursts = [];
    this.coinDrops = [];
    this.decadeCooldown = 0.9;
    this.ktvTimer = 5.4;
    this.watchCooldown = 2;
    this.shotTimer = 0;
    this.spawnOrbitRing();
    this.fireBaseVolley();
    this.lastRenderedState = this.state;
    this.render();
  }

  private setupLanternHordeStressAudit(): void {
    if (this.state === 'title') this.startRun(0x20260718, true);
    this.initialItemReward = false;
    this.encounterIndex = STAGES.length - 1;
    this.hero.maxHp = 999;
    this.hero.hp = 999;
    this.startStage();
    this.items = ['admission-notice', 'fathers-raincoat', 'iphone-17-pro-max', 'fathers-chart', 'revoked-badge'];
    this.battleTime = FINAL_FATE_AT + 0.1;
    this.finalFateTriggered = true;
    this.stageEliteSpawned = true;
    this.spawnPause = 999;
    this.enemies = [];
    const lantern = this.createSeekingEnemy('revolving-lantern', this.heroX, this.heroY - 148);
    lantern.speed = 0;
    lantern.attackCooldown = 99;
    lantern.mechTimer = 0;
    this.enemies.push(lantern);
    for (let index = 0; index < LANTERN_HORDE_CAP - 1; index += 1) {
      const ageBand = LANTERN_PREVIOUS_LIFE_ROSTER[index % LANTERN_PREVIOUS_LIFE_ROSTER.length]!;
      const type = ageBand[index % ageBand.length]!;
      const angle = index * 2.399963;
      const distance = 62 + (index % 7) * 30;
      const shadow = this.createSeekingEnemy(
        type,
        this.heroX + Math.cos(angle) * distance,
        this.heroY - 34 + Math.sin(angle) * distance,
      );
      shadow.lanternSummon = true;
      shadow.age = index * 0.07;
      this.enemies.push(shadow);
    }
    this.shotTimer = 999;
    this.projectiles = [];
    this.pendingShots = [];
    this.bursts = [];
    this.coinDrops = [];
    this.worldDoor = undefined;
    this.worldStall = undefined;
    this.worldReward = undefined;
    this.caption = '走马灯压力审阅 · 99 个前世影子';
    this.captionTime = 99;
    this.screenTransition = undefined;
    this.lastRenderedState = this.state;
    this.render();
  }

  private setupProjectileFormAudit(
    ids: readonly ItemId[],
    state: { schoolbagBurdenTime?: number; razorScars?: number } = {},
  ): void {
    this.setupProjectileAudit();
    this.items = [...ids];
    this.schoolbagBurdenTime = state.schoolbagBurdenTime ?? 0;
    this.razorScars = state.razorScars ?? 0;
    this.poisons = { ...EMPTY_POISONS };
    this.projectiles = [];
    this.pendingShots = [];
    this.shotTimer = 999;
    this.spawnPause = 999;
    this.enemies = [];
    const target = this.createSeekingEnemy('debt', this.heroX + 150, this.heroY - 14);
    target.speed = 0;
    target.attackCooldown = 99;
    target.maxHp = 9999;
    target.hp = 9999;
    this.enemies.push(target);
    const vector = this.computeAttackVector();
    const style = this.baseProjectileStyle();
    for (const offset of [-0.14, 0, 0.14]) {
      this.spawnProjectile({
        x: this.heroX + 18, y: this.heroY - 14, angle: offset,
        damage: vector.damage, speed: 24, radius: Math.max(5, vector.width), range: 300, life: 30,
        pierce: vector.pierce, returning: vector.returning, homing: 0,
        splitChance: 0, explosion: vector.explosion, generation: 0,
        color: this.projectileColor(style), style, critical: false, knockback: vector.knockback,
      });
    }
    this.render();
  }

  private setupProjectileMechanicAudit(kind: string): void {
    const itemByKind: Readonly<Record<string, ItemId[]>> = {
      slash: ['wooden-sword'],
      typing: ['typing-indicator'],
      'typing-five': ['typing-indicator', 'five-ha'],
      'uniform-typing-five': ['name-sold', 'typing-indicator', 'five-ha'],
      home: ['old-door-lock'],
      elevator: ['held-elevator'],
      freezer: ['shop-freezer'],
      button: ['loose-button'],
      'button-carrier': ['loose-button', 'marble'],
      pressure: ['held-pee', 'five-ha'],
      binder: ['card-binder'],
      'binder-key': ['card-binder'],
      burden: ['stone-schoolbag'],
      scars: ['eyebrow-razor'],
      'od-distortion': ['od-pill'],
      'letter-homing': ['front-desk-letter'],
      glasses: ['cracked-glasses'],
      'key-endpoint': ['only-key'],
      'key-collision': ['only-key'],
      frame: ['only-key', 'empty-frame'],
      photo: ['missing-photo'],
      orbit: ['three-day-visible'],
      dad: ['group-dad', 'pregnancy-test'],
      bargain: ['bargain-link'],
      laugh: ['five-ha'],
      'laugh-marble': ['five-ha', 'marble'],
      'marble-inheritance': ['marble'],
      return: ['red-workbook'],
      watch: ['slow-watch'],
      decade: ['spent-decade'],
      rain: ['fathers-raincoat'],
      'raincoat-contract': ['fathers-raincoat'],
      tears: ['always-crying'],
      voice: ['retracted-voice'],
      replay: ['year-report', 'five-ha', 'marble'],
      echo: ['ai-chat', 'five-ha', 'marble'],
      verify: ['friend-verify'],
      read: ['read-3am'],
      ktv: ['ktv-song', 'typing-indicator'],
      'uniform-five': ['name-sold', 'five-ha'],
      conduct: ['ktv-song'],
      crush: ['stone-schoolbag', 'shop-freezer'],
      raw: ['eyebrow-razor', 'broken-spine'],
      settle: ['read-3am', 'only-key'],
      inheritance: ['fathers-raincoat', 'front-desk-letter', 'red-workbook', 'only-key'],
    };
    const ids = itemByKind[kind] ?? [];
    this.setupProjectileFormAudit(ids);
    this.projectiles = [];
    this.pendingShots = [];
    this.volleyCount = 0;
    this.typingIndicatorTimer = 0;
    this.typingIndicatorBurstFlash = 0;
    this.typingIndicatorBurstCount = 0;
    this.buttonRecordedDamage = 0;
    this.heldPeeCharge = 0;
    this.lastDistanceCritBonus = 0;
    // Mechanic audits default to a known non-critical first roll; individual
    // chance-based cases below explicitly force the branch they are proving.
    this.rngState = 1;
    this.odBoost = kind === 'od-distortion' ? '伤害' : undefined;
    this.odPenalty = kind === 'od-distortion' ? '射程' : undefined;
    const target = this.enemies[0];
    if (!target) return;
    const vector = this.computeAttackVector();
    const spawnMiss = (generation = 0) => this.spawnProjectile({
      x: this.heroX, y: this.heroY - 14, angle: -Math.PI / 2,
      damage: vector.damage, speed: 70, radius: Math.max(5, vector.width), range: 70, life: 5,
      pierce: vector.pierce, returning: vector.returning, homing: 0, splitChance: 0,
      explosion: vector.explosion, generation, color: this.projectileColor(this.baseProjectileStyle()),
      style: this.baseProjectileStyle(), critical: false, knockback: vector.knockback,
    });
    const spawnMaterialAuditShot = (
      form: ProjectileForm,
      material?: ProjectileVisual['materials'][number],
      generation = 0,
    ) => {
      this.spawnProjectile({
        x: this.heroX, y: this.heroY - 14, angle: 0,
        damage: 12, speed: 150, radius: 7, range: 240, life: 3,
        pierce: 0, returning: false, homing: 0, splitChance: 0, explosion: 0,
        generation, color: '#d8d0bb', style: form === 'sound' ? 'sound' : 'plain',
        critical: false, knockback: 0, visual: this.projectileVisualForForm(form, material, generation),
      });
      return this.projectiles[this.projectiles.length - 1];
    };
    if (kind === 'slash') {
      target.x = this.heroX + 300;
      target.y = this.heroY - 14;
      this.fireBaseVolley();
      this.shotTimer = 999;
    } else if (kind === 'typing' || kind === 'typing-five' || kind === 'uniform-typing-five') {
      target.x = this.heroX + 180;
      target.y = this.heroY - 14;
      this.typingIndicatorTimer = TYPING_INDICATOR_DOT_INTERVAL * TYPING_INDICATOR_DOT_COUNT;
      this.updateTypingIndicator(0);
      this.shotTimer = 999;
      for (let frame = 0; frame < 10; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'home') {
      spawnMiss(1);
      for (let frame = 0; frame < 136; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'elevator') {
      this.rngState = 7;
      spawnMiss(1);
      for (let frame = 0; frame < 64; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'freezer') {
      this.rngState = 7;
      this.spawnProjectile({
        x: this.heroX + 18, y: this.heroY - 14, angle: 0,
        damage: vector.damage, speed: 90, radius: Math.max(6, vector.width), range: 180, life: 4,
        pierce: 0, returning: false, homing: 0, splitChance: 0, explosion: 0,
        generation: 0, color: '#bfe0e8', style: 'plain', critical: false, knockback: 0,
      });
      const ice = this.projectiles[0];
      if (ice) ice.auditForceFreeze = true;
    } else if (kind === 'button' || kind === 'button-carrier') {
      this.buttonRecordedDamage = 13;
      this.volleyCount = 2;
      this.fireBaseVolley();
      this.shotTimer = 999;
    } else if (kind === 'pressure') {
      this.heldPeeCharge = 8;
      this.fireBaseVolley();
      this.shotTimer = 999;
      for (let frame = 0; frame < 18; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'binder') {
      this.binderCards = ['wooden-sword', 'stone-schoolbag', 'cracked-glasses'];
      this.borrowedStat = '伤害';
      this.fireBaseVolley();
      this.shotTimer = 999;
    } else if (kind === 'binder-key') {
      this.binderCards = ['only-key'];
      this.fireBaseVolley();
      this.shotTimer = 999;
    } else if (kind === 'burden') {
      this.setupProjectileFormAudit(ids, { schoolbagBurdenTime: 90 });
      this.shotTimer = 999;
    } else if (kind === 'scars') {
      this.setupProjectileFormAudit(ids, { razorScars: 6 });
      this.shotTimer = 999;
    } else if (kind === 'od-distortion' || kind === 'letter-homing') {
      this.fireBaseVolley();
      this.shotTimer = 999;
    } else if (kind === 'glasses') {
      target.x = this.heroX + 300;
      target.y = this.heroY;
      this.fireBaseVolley();
      this.shotTimer = 999;
    } else if (kind === 'key-endpoint') {
      spawnMiss();
      this.shotTimer = 999;
      for (let frame = 0; frame < 62; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'key-collision') {
      target.x = this.heroX + 54;
      target.y = this.heroY - 14;
      this.fireBaseVolley();
      this.shotTimer = 999;
      for (let frame = 0; frame < 20; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'frame') {
      spawnMiss();
      this.shotTimer = 999;
    } else if (kind === 'photo') {
      this.volleyCount = 3;
      this.fireBaseVolley();
      this.shotTimer = 999;
    } else if (kind === 'orbit') {
      this.spawnOrbitRing();
      this.shotTimer = 999;
    } else if (kind === 'dad') {
      this.volleyCount = 2;
      this.fireBaseVolley();
      this.shotTimer = 999;
    } else if (kind === 'bargain') {
      target.x = this.heroX + 54;
      target.y = this.heroY - 14;
      this.fireBaseVolley();
      this.shotTimer = 999;
      for (let frame = 0; frame < 20; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'laugh' || kind === 'laugh-marble') {
      target.x = this.heroX + 300;
      target.y = this.heroY - 14;
      this.fireBaseVolley();
      this.shotTimer = 999;
      // Release all five delayed shots so the audit captures the winning recipe.
      for (let frame = 0; frame < 18; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'marble-inheritance') {
      target.x = this.heroX + 54;
      target.y = this.heroY - 14;
      const rival = this.createSeekingEnemy('debt', this.heroX + 150, this.heroY - 14);
      rival.speed = 0;
      rival.attackCooldown = 99;
      rival.maxHp = 9999;
      rival.hp = 9999;
      this.enemies.push(rival);
      const shot = spawnMaterialAuditShot('marble', 'glass', 1);
      if (shot) shot.auditForceRicochet = true;
      for (let frame = 0; frame < 20; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'return') {
      spawnMiss(1);
      for (let frame = 0; frame < 74; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'watch') {
      spawnMiss();
      this.watchCooldown = 0;
      this.update(FIXED_STEP);
    } else if (kind === 'decade') {
      this.decadeCooldown = 0;
      this.update(FIXED_STEP);
    } else if (kind === 'rain') {
      this.releaseRain();
    } else if (kind === 'raincoat-contract') {
      this.projectiles = [];
      this.bursts = [];
      this.raincoatReady = true;
      this.hero.hp = 999;
      this.hurtCooldown = 0;
      this.hurtHero(4);
      this.hurtCooldown = 0;
      this.hurtHero(4);
    } else if (kind === 'inheritance') {
      this.releaseRain();
    } else if (kind === 'tears') {
      this.hurtCooldown = 0;
      this.hurtHero(4);
    } else if (kind === 'voice') {
      this.voiceCharges = 3;
      this.releaseRetractedVoice();
    } else if (kind === 'replay') {
      this.fireBaseVolley();
      this.projectiles = [];
      this.pendingShots = [];
      this.volleyCount = 3;
      this.fireBaseVolley();
      this.shotTimer = 999;
      for (let frame = 0; frame < 18; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'echo') {
      target.x = this.heroX + 300;
      target.y = this.heroY - 14;
      this.fireBaseVolley();
      this.shotTimer = 999;
      for (let frame = 0; frame < 44; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'verify') {
      spawnMaterialAuditShot('breath', undefined, 1);
      for (let frame = 0; frame < 54; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'read') {
      spawnMaterialAuditShot('breath');
      for (let frame = 0; frame < 72; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'ktv') {
      this.ktvTimer = 5.99;
      this.update(FIXED_STEP);
    } else if (kind === 'uniform-five') {
      this.fireBaseVolley();
      this.shotTimer = 999;
      for (let frame = 0; frame < 18; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'conduct') {
      target.wetTimer = 4;
      const rival = this.createSeekingEnemy('debt', target.x + 42, target.y + 16);
      rival.speed = 0;
      rival.maxHp = 9999;
      rival.hp = 9999;
      this.enemies.push(rival);
      const shot = spawnMaterialAuditShot('sound', 'signal');
      if (shot) shot.auditForceParalyze = true;
      for (let frame = 0; frame < 72; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'crush') {
      target.heavyTimer = 4;
      target.heavyStacks = 2;
      const shot = spawnMaterialAuditShot('ice');
      if (shot) shot.auditForceFreeze = true;
      for (let frame = 0; frame < 72; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'raw') {
      target.hp = target.maxHp - 12;
      spawnMaterialAuditShot('razor');
      for (let frame = 0; frame < 72; frame += 1) this.update(FIXED_STEP);
    } else if (kind === 'settle') {
      target.readDamage = 24;
      target.readTimer = 4;
      const shot = spawnMaterialAuditShot('key');
      if (shot) {
        shot.x = target.x;
        shot.y = target.y;
        shot.explosion = 12;
        this.explodeProjectile(shot);
        shot.life = 0;
        this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0);
      }
    }
    this.render();
  }

  private setupRelicMechanicAudit(id: ItemId): void {
    this.startRun(0x20260718, true);
    this.initialItemReward = false;
    this.hero.maxHp = 100;
    this.hero.hp = 100;
    this.hero.coins = 10;
    this.encounterIndex = 0;
    this.startStage();
    this.items = [];
    this.acquireItem(id);
    if (id === 'auto-renew') {
      this.hero.coins = 10;
      this.startStage();
    }
    this.shotTimer = 999;
    this.spawnPause = 999;
    this.enemies = [];
    this.projectiles = [];
    this.pendingShots = [];

    const target = this.createSeekingEnemy('debt', this.heroX + 76, this.heroY - 12);
    target.speed = 0;
    target.attackCooldown = 99;
    target.maxHp = 9999;
    target.hp = 9999;
    if (id === 'flash-escape') {
      this.enemies.push(target);
      this.hurtCooldown = 0;
      this.hurtHero(12);
    } else if (id === 'red-packet') {
      const bonus = this.redPacketDrop(target, true);
      this.spawnCoinDrop(target.x, target.y, bonus);
    } else if (id === 'takeout-3am') {
      this.hero.hp = 39;
      this.takeoutTick = 0;
      this.update(FIXED_STEP);
    } else if (id === 'hair-in-takeout') {
      this.hero.hp = 29;
      this.update(FIXED_STEP);
    } else if (id === 'goodnight-2h') {
      this.hero.hp = 49;
      this.goodnightTick = 0;
      this.update(FIXED_STEP);
    } else if (id === 'loan-contract') {
      this.hero.coins = 1;
      this.beginStageTransition();
    } else if (id === 'unwashed-pillow') {
      for (let frame = 0; frame < 124; frame += 1) this.update(FIXED_STEP);
      this.hurtCooldown = 0;
      this.hurtHero(12);
    } else if (id === 'sock-cigs') {
      this.sockTick = 0;
      this.hurtCooldown = 0;
      this.hurtHero(12);
      this.update(FIXED_STEP);
    } else if (id === 'momo-avatar') {
      this.enemies.push(target);
      this.update(FIXED_STEP);
    } else if (id === 'streak-1847') {
      target.x = this.heroX + 300;
      this.enemies.push(target);
      this.battleTime = 10;
      this.lastRhythmMark = 0;
      this.fireBaseVolley();
      this.shotTimer = 999;
    } else if (id === 'moms-bowl') {
      this.hero.hp = 95;
      this.healHero(10);
      this.hurtCooldown = 0;
      this.hurtHero(5);
    } else if (id === 'painless-night') {
      this.hurtCooldown = 0;
      this.hurtHero(12);
    } else if (id === 'third-pill') {
      this.pillTimer = 7.99;
      this.pillPhaseState = 'rage';
      this.update(0.03);
    } else if (id === 'white-bottle') {
      this.startStage();
      this.shotTimer = 999;
      this.spawnPause = 999;
      this.enemies = [];
      this.projectiles = [];
      this.pendingShots = [];
    } else if (id === 'baby-tooth') {
      this.hero.hp = 1;
      this.hurtCooldown = 0;
      this.hurtHero(99);
    } else if (id === 'funeral-photo' || id === 'server-shutdown') {
      this.hero.hp = 1;
      this.hurtCooldown = 0;
      this.hurtHero(99);
    }
    this.screenTransition = undefined;
    this.lastRenderedState = this.state;
    this.render();
  }

  private installTestHooks(): void {
    const host = window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
      zhe_yi_shen_test?: (action: 'start' | 'reveal-origin' | 'clear' | 'choose-first' | 'swallow' | 'exhale' | 'open-fate' | 'special' | 'leave-special' | 'shop' | 'buy-first' | 'reroll-shop' | 'combo' | 'boss' | 'battle' | 'stress-battle' | 'projectile-combo-stress' | 'lantern-stress' | 'origin-badge-audit' | 'projectile-audit' | 'projectile-form' | 'projectile-mechanic' | 'relic-audit' | 'memory-recall' | 'father' | 'father-phase2' | 'boss-art' | 'boss-skill-art' | 'elite-art' | 'enemy-art' | 'scene-art' | 'telegraph' | 'praise-consult' | 'praise-approach' | 'praise-paper-approach' | 'phone-split' | 'phone-approach' | 'phone-caller' | 'phone-missed' | 'xiao-zhang-prompt' | 'xiao-zhang-help' | 'xiao-zhang-one-seat' | 'xiao-zhang-box' | 'win' | 'equip' | 'hurt' | 'defeat-stage-elite' | 'defeat-boss' | 'one-more' | 'pause', payload?: unknown) => void;
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
      darknessElapsed: this.darkActive ? Number(Math.max(0, this.battleTime - this.darknessStartedAt).toFixed(2)) : null,
      hero: { hp: Math.round(this.hero.hp), maxHp: this.hero.maxHp, block: this.hero.block, coins: this.hero.coins },
      vector: this.computeAttackVector(),
      vectorFlags: attackVectorFlags(this.computeAttackVector()),
      breathSpecimen: this.state === 'result' ? (() => {
        const specimen = this.currentBreathSpecimen();
        return {
          form: specimen.visual.form,
          trail: specimen.visual.trail,
          materials: specimen.visual.materials,
          flags: specimen.flags,
          colors: {
            core: specimen.visual.coreColor,
            material: specimen.visual.materialTint,
            edge: specimen.visual.edgeColor,
          },
        };
      })() : null,
      origin: this.aiOriginState === 'gpt' ? this.origin : null,
      originProgress: this.aiOriginState === 'gpt'
        ? Number((this.originElapsed / this.originStoryDuration()).toFixed(2))
        : 0,
      ai: {
        origin: this.aiOriginState,
        originAttempt: this.originAttempt,
        originRequestId: this.originRequestId,
        originLongWait: this.originLongWaitReady(),
        fate: this.aiFateState,
      },
      audio: this.feedback.debugState(),
      voiceHistory: [...this.voiceCuesSeen],
      caption: this.captionTime > 0 ? { text: this.caption, remaining: Number(this.captionTime.toFixed(2)) } : null,
      toast: this.toastTime > 0 ? { text: this.toast, remaining: Number(this.toastTime.toFixed(2)) } : null,
      voice: this.voiceCaption ? {
        id: this.voiceCaption.id,
        scene: VOICE_CUES[this.voiceCaption.id].context.scene,
        speaker: VOICE_CUES[this.voiceCaption.id].context.speaker,
        treatment: this.voiceCaption.treatment,
        remaining: Number(this.voiceCaption.time.toFixed(2)),
      } : null,
      threatAlert: this.eliteAlertTime > 0 ? {
        kind: this.eliteAlertKind,
        name: this.eliteAlertName,
        remaining: Number(this.eliteAlertTime.toFixed(2)),
      } : null,
      poisons: this.poisons,
      memories: this.memories,
      memoryRecall: (() => {
        const nearest = this.nearestEnemy(this.heroX, this.heroY);
        return {
          active: this.memoryRecall?.text ?? null,
          remaining: Number((this.memoryRecall?.time ?? 0).toFixed(2)),
          standStillTime: Number(this.standStillTime.toFixed(2)),
          nearestEnemyDistance: nearest
            ? Number(Math.hypot(nearest.x - this.heroX, nearest.y - this.heroY).toFixed(1))
            : null,
          recalled: [...this.recalledMemories],
          handledThisStand: this.memoryRecallHandledThisStand,
        };
      })(),
      ledger: {
        open: this.originLedgerOpen,
        page: this.ledgerPage,
        count: this.ledgerEntries.length,
        entry: this.originLedgerOpen ? this.ledgerEntries[this.ledgerPage] ?? null : null,
      },
      xiaoZhang: {
        decision: this.xiaoZhangDecision,
        helped: this.helpedXiaoZhang,
        betrayed: this.xiaoZhangBetrayed,
        prompt: this.xiaoZhangPrompt,
        world: this.xiaoZhangWorld ? { x: Math.round(this.xiaoZhangWorld.x), y: Math.round(this.xiaoZhangWorld.y) } : null,
        ally: this.xiaoZhangAlly ? {
          x: Math.round(this.xiaoZhangAlly.x),
          y: Math.round(this.xiaoZhangAlly.y),
          fireCooldown: Number(this.xiaoZhangAlly.fireCooldown.toFixed(2)),
        } : null,
      },
      whoseBox: {
        disabledItems: [...this.stageDisabledItems],
        target: this.enemies.find((enemy) => !enemy.dead && enemy.type === 'whose-box')?.countedItem ?? null,
        timer: Number((this.enemies.find((enemy) => !enemy.dead && enemy.type === 'whose-box')?.countedItemTimer ?? 0).toFixed(2)),
      },
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
      bossMechanics: {
        lamp: {
          active: this.darkActive,
          radius: this.darkActive ? Number(this.darkR.toFixed(1)) : null,
          handoff: (() => {
            const pose = this.lanternHandoffPose();
            return pose ? {
              x: Math.round(pose.x),
              y: Math.round(pose.y),
              scale: Number(pose.scale.toFixed(2)),
              darknessProgress: Number(pose.darknessProgress.toFixed(2)),
            } : null;
          })(),
          choice: this.lampChoice ? {
            items: this.lampChoice.items,
            indices: this.lampChoice.indices,
            timer: Number(this.lampChoice.timer.toFixed(2)),
          } : null,
          release: {
            ready: this.lampReleaseReady,
            timer: Number(this.lampReleaseTimer.toFixed(2)),
            finalStripTimer: Number(this.lampFinalStripTimer.toFixed(2)),
            totalItems: this.lampItemsToReturnTotal,
            remainingItems: this.items.length,
          },
        },
        praiseConsult: this.praiseConsult ? {
          x: Math.round(this.praiseConsult.x),
          y: Math.round(this.praiseConsult.y),
          timer: Number(this.praiseConsult.timer.toFixed(2)),
          extraTasks: this.praiseConsult.extraTasks,
        } : null,
        praiseBonuses: {
          damage: Number(this.praiseDamage.toFixed(2)),
          fire: Number(this.praiseFire.toFixed(2)),
          move: Number(this.praiseMove.toFixed(2)),
        },
        praisePaperZones: {
          heroSlowed: this.heroSlowTimer > 0,
          zones: this.praisePaperZones.map((zone) => ({
            x: Math.round(zone.x),
            y: Math.round(zone.y),
            life: Number(zone.life.toFixed(2)),
          })),
        },
        phone: {
          ringing: this.phoneRinging,
          ringWindow: Number(this.phoneRingWindow.toFixed(2)),
          answer: Number(this.phoneAnswer.toFixed(2)),
          answerTarget: this.phoneAnswerTarget,
          missed: this.phoneMissed,
          relief: this.phoneRelief,
          strengthTier: this.phoneStrengthTier(),
          storyIndex: this.phoneStoryIndex,
          activeStoryIndex: this.phoneActiveStoryIndex,
          postAnswer: Number(this.phonePostAnswerTimer.toFixed(2)),
          transcript: this.phoneTranscript ? {
            speaker: this.phoneTranscript.speaker,
            text: this.phoneTranscript.text,
            timer: Number(this.phoneTranscript.timer.toFixed(2)),
          } : null,
          lastCaller: this.lastPhoneCaller ?? null,
          calls: this.phoneCalls.map((call) => ({ x: Math.round(call.x), y: Math.round(call.y) })),
        },
        father: {
          rain: this.rainActive,
          intensity: Number(this.rainIntensity.toFixed(2)),
          brace: Number(this.fatherBraceTimer.toFixed(2)),
          fallenCoat: this.fallenCoatX === undefined || this.fallenCoatY === undefined
            ? null
            : { x: Math.round(this.fallenCoatX), y: Math.round(this.fallenCoatY) },
          phaseLineShown: this.fatherSecondPhaseLineShown,
          attackNamesSeen: [...this.fatherAttackNamesSeen],
          schoolEliteDefeatedAt: Number(this.schoolEliteDefeatedAt.toFixed(2)),
        },
      },
      odDistortion: this.odBoost ? { boost: this.odBoost, penalty: this.odPenalty } : null,
      enemies: this.enemies.filter((enemy) => !enemy.dead).map((enemy) => ({
        type: enemy.type,
        name: enemy.name,
        hp: Math.round(enemy.hp),
        x: Math.round(enemy.x),
        y: Math.round(enemy.y),
        speed: Number(enemy.speed.toFixed(2)),
        elite: Boolean(enemy.elite),
        boss: Boolean(enemy.boss),
        phase: enemy.phase ?? 1,
        bossAnim: enemy.bossAnim ?? null,
        bossAnimResolvedFrame: this.bossAnimationFrame(enemy)?.frame ?? null,
        windup: Number((enemy.windupTimer ?? 0).toFixed(2)),
        attackKind: enemy.attackKind ?? null,
        wetShoesStopCharged: Boolean(enemy.wetShoesStopCharged),
        lanternSummon: Boolean(enemy.lanternSummon),
        lanternWaveIndex: enemy.lanternWaveIndex ?? null,
        backstabber: Boolean(enemy.backstabber),
        xiaoZhang: Boolean(enemy.xiaoZhang),
        xiaoZhangBox: Boolean(enemy.xiaoZhangBox),
        freezeTimer: Number((enemy.freezeTimer ?? 0).toFixed(2)),
        paralyzeTimer: Number((enemy.paralyzeTimer ?? 0).toFixed(2)),
        wetTimer: Number((enemy.wetTimer ?? 0).toFixed(2)),
        rawTimer: Number((enemy.rawTimer ?? 0).toFixed(2)),
        rawStacks: enemy.rawStacks ?? 0,
        heavyTimer: Number((enemy.heavyTimer ?? 0).toFixed(2)),
        heavyStacks: enemy.heavyStacks ?? 0,
        readDamage: Number((enemy.readDamage ?? 0).toFixed(1)),
        readTimer: Number((enemy.readTimer ?? 0).toFixed(2)),
        tauntVulnerableTimer: Number((enemy.tauntVulnerableTimer ?? 0).toFixed(2)),
      })),
      dangerBands: this.dangerBands.map((band) => ({
        x: Math.round(band.centerX),
        y: Math.round(band.y),
        halfWidth: band.halfWidth,
        height: band.height,
        warn: Number(band.warn.toFixed(2)),
        active: Number(band.active.toFixed(2)),
        damage: band.damage,
        safe: band.safe,
        vy: band.vy,
        visual: band.visual,
        hit: band.hit,
      })),
      projectileMechanics: {
        buttonRecordedDamage: Number(this.buttonRecordedDamage.toFixed(1)),
        heldPeeCharge: Number(this.heldPeeCharge.toFixed(2)),
        typingIndicator: {
          elapsed: Number(this.typingIndicatorTimer.toFixed(2)),
          dots: this.currentTypingIndicatorDots(),
          bursts: this.typingIndicatorBurstCount,
        },
        schoolbagBurdenTime: Number(this.schoolbagBurdenTime.toFixed(2)),
        razorScars: this.razorScars,
        binderCards: [...this.binderCards],
        borrowedStat: this.borrowedStat ?? null,
        distanceCritBonus: Number(this.lastDistanceCritBonus.toFixed(3)),
        watchFreeze: Number(this.watchFreeze.toFixed(2)),
        breathlessTimer: Number(this.breathlessTimer.toFixed(2)),
        decadeCooldown: Number(this.decadeCooldown.toFixed(2)),
        voiceCharges: this.voiceCharges,
        ktvTimer: Number(this.ktvTimer.toFixed(2)),
        raincoatReady: this.raincoatReady,
        gymMomentum: Number(this.gymMomentum.toFixed(2)),
        powerbank: {
          charge: Number(this.powerbankCharge.toFixed(2)),
          burst: Number(this.powerbankBurstTimer.toFixed(2)),
          rentalSeconds: Number(this.powerbankRentalSeconds.toFixed(2)),
          locked: this.powerbankLocked,
        },
        divorceDeferredDamage: Number(this.divorceDeferredDamage.toFixed(1)),
        drank: {
          layers: this.drankLayers,
          storedDamage: Number(this.drankStoredDamage.toFixed(1)),
        },
        relicSignals: {
          mineralWaterProgress: Number(((this.noHitTime % 8) / 8).toFixed(3)),
          eyeClosed: Number(this.eyeClosedTimer.toFixed(2)),
          enemyHaste: Number(this.enemyHasteTimer.toFixed(2)),
          lastPageDeadline: this.lastPageDeadlineActive(),
          tauntCooldown: Number(this.tauntTimer.toFixed(2)),
          flashCooldown: Number(this.flashCooldown.toFixed(2)),
          takeoutWarm: Number(this.takeoutWarmTimer.toFixed(2)),
          nausea: Number(this.nauseaTimer.toFixed(2)),
          goodnightPulse: Number(this.goodnightPulseTimer.toFixed(2)),
          autoRenewGlow: Number(this.autoRenewGlowTimer.toFixed(2)),
          checkupPulse: Number(this.checkupPulseTimer.toFixed(2)),
          hairUsedStage: this.hairUsedStage,
          graceTimer: Number(this.graceTimer.toFixed(2)),
          graceUsed: this.graceUsed,
          petGone: this.petGone,
          pillowReady: this.hasItem('unwashed-pillow') && this.standStillTime >= 2,
          pillowPenalty: Number(this.pillowPenalty.toFixed(2)),
          sockBoost: Number(this.sockBoostTimer.toFixed(2)),
          sockTick: Number(this.sockTick.toFixed(2)),
          momoRange: this.momoRangeState,
          rhythmMark: this.lastRhythmMark,
          rhythmBrokenWindow: this.rhythmBrokenWindow,
          whiteBottlePulse: Number(this.whiteBottlePulseTimer.toFixed(2)),
          bowlWarmthBlock: Number(this.bowlWarmthBlock.toFixed(1)),
          painlessDebt: Number(this.painlessDamage.toFixed(1)),
          painlessTimer: Number(this.painlessTimer.toFixed(2)),
          pillPhase: this.pillPhaseState,
          pillPulse: Number(this.pillPulseTimer.toFixed(2)),
          toothReady: this.toothReady,
          deathSaves: this.deathSaves,
          saveEffect: this.saveEffect?.kind ?? null,
        },
        oneMoreGame: {
          prompt: this.oneMorePrompt,
          focus: this.oneMoreFocus,
          stacks: this.oneMoreStacks,
          openingTimer: Number(this.oneMoreOpeningTimer.toFixed(2)),
        },
        summerSlide: {
          inputMoving: this.heroInputMoving,
          remaining: Number(this.summerSlideTimer.toFixed(3)),
          direction: {
            x: Number(this.summerSlideDX.toFixed(3)),
            y: Number(this.summerSlideDY.toFixed(3)),
          },
        },
        snowFlicker: {
          active: this.snowFlickerTimer > 0,
          remaining: Number(this.snowFlickerTimer.toFixed(3)),
          cooldown: Number(this.snowFlickerCooldown.toFixed(2)),
        },
      },
      combatPools: (() => {
        const visualBudget = this.projectileVisualBudget();
        return {
        enemies: this.enemies.length,
        projectiles: this.projectiles.length,
        coreProjectiles: this.projectiles.filter((projectile) => projectile.poolPriority === 'core').length,
        secondaryProjectiles: this.projectiles.filter((projectile) => projectile.poolPriority === 'secondary').length,
        renderedProjectiles: this.projectiles.length,
        secondaryTrailStride: visualBudget.trailStride,
        coreProjectileLift: visualBudget.coreLift,
        pendingShots: this.pendingShots.length,
        corePendingShots: this.pendingShots.filter((shot) => shot.priority === 'core').length,
        secondaryPendingShots: this.pendingShots.filter((shot) => shot.priority === 'secondary').length,
        bursts: this.bursts.length,
        importantBursts: this.bursts.filter((burst) => burst.kind === 'word' || burst.kind === 'syn').length,
        enemyDeaths: this.enemyDeaths.length,
        coinDrops: this.coinDrops.length,
        limits: {
          enemies: MAX_ALIVE_ENEMIES,
          projectiles: MAX_PROJECTILES,
          pendingShots: MAX_PENDING_SHOTS,
          bursts: MAX_BURSTS,
          enemyDeaths: MAX_ENEMY_DEATHS,
          coinDrops: MAX_COIN_DROPS,
        },
      };
      })(),
      burstSamples: this.bursts.slice(-12).map((burst) => ({
        kind: burst.kind,
        radius: Number(burst.radius.toFixed(1)),
        material: burst.material ?? null,
        text: burst.text ?? null,
      })),
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
        carrierForm: projectile.visual.carrierForm,
        trail: projectile.visual.trail,
        x: Number(projectile.x.toFixed(1)),
        y: Number(projectile.y.toFixed(1)),
        flags: projectileFlags(projectile),
        damage: Number(projectile.damage.toFixed(1)),
        radius: Number(projectile.radius.toFixed(1)),
        speed: Number(Math.hypot(projectile.vx, projectile.vy).toFixed(1)),
        heading: Number(Math.atan2(projectile.vy, projectile.vx).toFixed(3)),
        life: Number(projectile.life.toFixed(2)),
        reversals: projectile.reversals,
        homing: Number(projectile.homing.toFixed(2)),
        splitChance: Number(projectile.splitChance.toFixed(2)),
        splitDepth: projectile.splitDepth,
        ricochetDepth: projectile.ricochetDepth ?? 0,
        areaDamage: Number(projectile.explosion.toFixed(1)),
        generation: projectile.generation,
        orbit: Boolean(projectile.orbit),
        nonlethal: Boolean(projectile.nonlethal),
        bargainBranchDepth: projectile.bargainBranchDepth ?? 0,
        verifyPassed: Boolean(projectile.verifyPassed),
        homePhase: projectile.homePhase ?? null,
        elevatorWait: Number((projectile.elevatorWait ?? 0).toFixed(2)),
        elevatorRelaunched: Boolean(projectile.elevatorRelaunched),
        impactMaterial: this.hitMaterialOf(projectile),
        materials: [...projectile.visual.materials],
        visualWeight: Number(projectile.visual.weight.toFixed(2)),
        edgeColor: projectile.visual.edgeColor,
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
        previousLifeItem: this.specialRoomPreviousLifeItem ?? null,
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
        if (auditRoom === 'light' && auditParams.get('audit-previous') === '1') {
          this.ledgerEntries = [{
            runSeed: 0x19af21c4,
            nickname: '把饭热了三遍的人',
            title: '总说马上回家',
            reachedStage: 3,
            reachedAge: '成年',
            endedBy: '响个不停',
            items: ['only-key', 'front-desk-letter', 'fathers-raincoat'],
            lastEcho: '他亲口说：「没事。不忙。」',
            won: false,
            recordedAt: Date.now(),
          }];
        }
        this.openSpecialRoom(auditRoom);
      } else {
        const auditResult = auditParams.get('audit-result');
        if (auditResult === 'won' || auditResult === 'lost') {
          this.runSeed = 0x20260722;
          this.rngState = this.runSeed;
          this.encounterIndex = auditResult === 'won' ? STAGES.length - 1 : 2;
          this.items = [
            'front-desk-letter', 'fathers-raincoat', 'broken-spine', 'only-key',
            'moms-bowl', 'held-elevator', 'old-door-lock', 'three-day-visible',
          ];
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
          if (auditScreen === 'reward' || auditScreen === 'shop' || auditScreen === 'boss' || auditScreen === 'fate' || auditScreen === 'ai-fate' || auditScreen === 'projectile' || auditScreen === 'ledger' || auditScreen === 'memory-recall'
            || auditScreen === 'xiao-prompt' || auditScreen === 'xiao-ally' || auditScreen === 'xiao-seat' || auditScreen === 'xiao-box'
            || auditScreen === 'box-count' || auditScreen === 'box-countdown'
            || auditScreen === 'phone-field' || auditScreen === 'phone-answer' || auditScreen === 'phone-story' || auditScreen === 'phone-final'
            || auditScreen === 'lamp-dark' || auditScreen === 'lamp-choice') {
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
            if (auditScreen === 'memory-recall') {
              this.items = [];
              this.encounterIndex = 2;
              this.startStage();
              this.spawnPause = 999;
              this.enemies = [];
              const distantTask = this.createSeekingEnemy('task-simple', this.heroX, this.heroY - 212);
              distantTask.speed = 0;
              distantTask.attackCooldown = 99;
              this.enemies.push(distantTask);
              this.memories = [
                '有人把门留了一条缝。',
                '雨停以后，他还是把那把伞收好了。',
              ];
              this.recalledMemories = new Set(this.memories);
              this.standStillTime = 6.2;
              this.lastSighMark = 1;
              this.memoryRecallHandledThisStand = true;
              this.memoryRecall = { text: this.memories[1]!, time: 3.8, duration: 4.6 };
              this.caption = '';
              this.captionTime = 0;
              this.shotTimer = 999;
              this.auditBossArtActive = true;
            } else if (auditScreen === 'ledger') {
              this.origin = {
                title: '总替楼道里的人留门',
                nickname: '二楼最后关灯的人',
                nicknameReason: '夜里谁回来得晚，他都把声控灯多踩亮一会儿。',
                story: ['这一页是本轮新生，只用于确认旧名册不会参与生成。'],
                kind: 'mixed',
                traits: ['too_sensible', 'soft_hearted'],
                appearance: { ...DEFAULT_APPEARANCE },
                source: 'local',
              };
              this.originModifiers = getOriginModifiers(this.origin.traits);
              this.aiOriginState = 'gpt';
              this.originElapsed = this.originStoryDuration();
              this.ledgerEntries = [
                {
                  runSeed: 0x19af21c4, nickname: '把饭热了三遍的人', title: '总说马上回家',
                  reachedStage: 3, reachedAge: '成年', endedBy: '响个不停',
                  items: ['front-desk-letter', 'fathers-raincoat', 'iphone-17-pro-max', 'unsent-phone', 'moms-bowl'],
                  lastEcho: '他亲口说：「没事。不忙。」', won: false, recordedAt: Date.now(),
                },
                {
                  runSeed: 0x073a91ef, nickname: '永远坐靠门那桌', title: '替别人先看出口',
                  reachedStage: 5, reachedAge: '晚年', endedBy: '放下了',
                  items: ['wooden-sword', 'only-key', 'fathers-chart', 'revoked-badge', 'held-elevator', 'funeral-photo'],
                  lastEcho: '有人替他按住了那一趟电梯。', won: true, recordedAt: Date.now() - 1000,
                },
              ];
              const requestedLedgerPage = Number.parseInt(auditParams.get('ledger-page') ?? '0', 10);
              this.ledgerPage = this.clamp(Number.isFinite(requestedLedgerPage) ? requestedLedgerPage : 0, 0, this.ledgerEntries.length - 1);
              this.originLedgerOpen = true;
              this.state = 'origin';
              this.auditBossArtActive = true;
            } else if (auditScreen === 'projectile') {
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
              if (!Number.isFinite(auditAge)) this.encounterIndex = 1;
              this.startStage();
              this.enemies = [];
              // 按本章配置生成真正的大 Boss；audit-elite=1 时生成小 Boss
              const stageSpec = STAGES[this.encounterIndex]!;
              const auditType = auditParams.get('audit-elite') === '1'
                ? stageSpec.eliteType
                : (stageSpec.bossType ?? stageSpec.eliteType);
              const boss = this.createSeekingEnemy(auditType, this.heroX, this.heroY - 108);
              if (auditParams.get('audit-elite') === '1') {
                boss.boss = false;
                boss.elite = true;
              }
              boss.attackCooldown = 99;
              this.enemies.push(boss);
              this.stageEliteSpawned = true;
              this.eliteSpawned = true;
              this.shotTimer = 999;
              this.spawnPause = 999;
              this.projectiles = [];
              this.pendingShots = [];
              if (auditType === 'silent-father') this.rainActive = true;
              this.eliteAlertName = '';
              this.eliteAlertTime = 0;
            } else if (auditScreen === 'xiao-prompt') {
              this.items = [];
              this.encounterIndex = 2;
              this.startStage();
              this.spawnPause = 999;
              this.enemies = [];
              this.xiaoZhangSpawned = true;
              this.xiaoZhangWorld = { x: this.heroX, y: this.heroY - 72 };
              this.xiaoZhangPrompt = true;
              this.xiaoZhangFocus = this.hero.coins >= 10 ? 0 : 1;
            } else if (auditScreen === 'xiao-ally') {
              this.items = [];
              this.encounterIndex = 2;
              this.helpedXiaoZhang = true;
              this.xiaoZhangDecision = 'helped';
              this.startStage();
              this.spawnPause = 999;
              this.enemies = [];
              this.xiaoZhangAlly = { x: this.heroX - 78, y: this.heroY + 24, fireCooldown: 0, faceLeft: false };
              const target = this.createSeekingEnemy('task-revise', this.heroX - 80, this.heroY - 132);
              target.speed = 0;
              target.attackCooldown = 99;
              this.enemies.push(target);
              this.updateXiaoZhangAlly(1 / 60);
              const paper = this.projectiles[this.projectiles.length - 1];
              if (paper) {
                const speed = Math.hypot(paper.vx, paper.vy) || 1;
                paper.x += (paper.vx / speed) * 62;
                paper.y += (paper.vy / speed) * 62;
                paper.distance = 62;
              }
              this.caption = '小张不会替你挡伤害。他只把手上那张没做完的纸，折起来打出去。';
              this.captionTime = 99;
              this.shotTimer = 999;
              this.auditBossArtActive = true;
            } else if (auditScreen === 'xiao-seat') {
              this.items = [];
              this.encounterIndex = 2;
              this.helpedXiaoZhang = true;
              this.xiaoZhangDecision = 'helped';
              this.startStage();
              this.spawnPause = 999;
              this.enemies = [];
              this.xiaoZhangAlly = { x: this.heroX - 56, y: this.heroY + 20, fireCooldown: 99, faceLeft: false };
              const chair = this.createSeekingEnemy('praise-chair', this.heroX, this.heroY - 170);
              chair.phase = 2;
              chair.hp = chair.maxHp * 0.48;
              chair.radius = 58;
              const taskA = this.createSeekingEnemy('task-simple', this.heroX - 90, this.heroY - 68);
              const taskB = this.createSeekingEnemy('task-revise', this.heroX + 90, this.heroY - 68);
              this.enemies.push(chair, taskA, taskB);
              this.resolveOneSeat(chair, [taskA, taskB]);
              const survivor = this.enemies.find((enemy) => enemy.backstabber);
              if (survivor) {
                survivor.attackKind = 'backstab';
                survivor.attackAngle = Math.atan2(this.heroY - survivor.y, this.heroX - survivor.x);
                survivor.windupTimer = 0.31;
              }
              this.shotTimer = 999;
              this.auditBossArtActive = true;
            } else if (auditScreen === 'xiao-box') {
              this.items = [];
              this.encounterIndex = 4;
              this.helpedXiaoZhang = true;
              this.xiaoZhangDecision = 'helped';
              this.xiaoZhangBetrayed = true;
              this.startStage();
              this.stageEliteSpawned = true;
              this.spawnPause = 999;
              this.enemies = [];
              const box = this.createSeekingEnemy('whose-box', this.heroX, this.heroY - 104);
              box.name = '谁的纸箱 · 小张';
              box.xiaoZhangBox = true;
              box.speed = 0;
              box.attackCooldown = 99;
              this.enemies.push(box);
              this.shotTimer = 999;
              this.auditBossArtActive = true;
            } else if (auditScreen === 'box-count' || auditScreen === 'box-countdown') {
              this.items = ['front-desk-letter', 'fathers-raincoat', 'only-key', 'nameless-tie'];
              this.encounterIndex = 4;
              this.startStage();
              this.stageEliteSpawned = true;
              this.spawnPause = 999;
              this.enemies = [];
              this.stageDisabledItems.add('front-desk-letter');
              const box = this.createSeekingEnemy('whose-box', this.heroX, this.heroY - 112);
              box.speed = 0;
              box.attackCooldown = 99;
              box.countedItem = 'fathers-raincoat';
              box.countedItemTimer = auditScreen === 'box-countdown' ? 4.2 : 0;
              if (auditScreen === 'box-count') {
                box.windupTimer = 0.35;
                box.attackKind = 'box-count';
              }
              this.enemies.push(box);
              this.caption = auditScreen === 'box-countdown'
                ? '纸箱正在清点《父亲的雨衣》：打掉它，才能保住这一件。'
                : '纸箱掀开封条，开始清点你身上的东西。';
              this.captionTime = 99;
              this.shotTimer = 999;
              this.auditBossArtActive = true;
            } else if (auditScreen === 'phone-field' || auditScreen === 'phone-answer' || auditScreen === 'phone-story') {
              this.items = ['iphone-17-pro-max', 'unsent-phone', 'front-desk-letter'];
              this.encounterIndex = 3;
              this.startStage();
              this.spawnPause = 999;
              this.stageEliteSpawned = true;
              this.eliteSpawned = true;
              this.eliteAlertName = '';
              this.eliteAlertTime = 0;
              this.enemies = [];
              const phone = this.createSeekingEnemy('ringing-phone', this.heroX, this.heroY - 220);
              phone.phase = 1;
              phone.speed = 0;
              phone.attackCooldown = 99;
              this.enemies.push(phone);
              if (auditScreen === 'phone-story') {
                const requestedStep = Number.parseInt(auditParams.get('story-step') ?? '5', 10);
                this.phoneStoryIndex = this.clamp(Number.isFinite(requestedStep) ? requestedStep - 1 : 4, 0, 6);
                if (this.phoneStoryIndex >= 6) phone.phase = 2;
              }
              this.beginPhoneRing(phone, (phone.phase ?? 1) === 2);
              if (auditScreen === 'phone-field') {
                const call = this.phoneFieldPoint(-0.845, 181);
                this.phoneCalls = [call];
                phone.x = call.x;
                phone.y = call.y;
                this.bursts = [];
                this.burst('ring', call.x, call.y, 78, '#cfe4ea');
              }
              if (auditScreen === 'phone-answer' || auditScreen === 'phone-story') {
                const call = this.phoneCalls[0];
                if (call) {
                  this.heroX = call.x + (call.x < this.heroX ? 54 : -54);
                  this.heroY = call.y;
                  this.phoneAnswer = auditScreen === 'phone-story' ? 2.55 : 1.35;
                  this.phoneAnswerTarget = 0;
                  this.playBossAnimation(phone, 'phone-p1-answer', 3);
                }
              }
              if (auditScreen === 'phone-story') {
                this.showPhoneTranscript(PHONE_STORY_STEPS[this.phoneStoryIndex]!, 99);
              }
              this.caption = auditScreen === 'phone-story'
                ? ''
                : auditScreen === 'phone-answer'
                  ? '电话接通了。他停在原地，手上的活还在继续。'
                  : '那块屏幕在场地另一头亮起来。';
              this.captionTime = 99;
              this.shotTimer = 999;
              this.auditBossArtActive = true;
            } else if (auditScreen === 'phone-final') {
              this.encounterIndex = 3;
              this.items = ['iphone-17-pro-max', 'fathers-chart'];
              this.phoneStoryIndex = 8;
              this.storyDropId = 'fathers-chart';
              this.storyDropTimer = 1;
              this.state = 'storyDrop';
              this.auditBossArtActive = true;
            } else if (auditScreen === 'lamp-dark' || auditScreen === 'lamp-choice') {
              this.items = ['front-desk-letter', 'wooden-sword', 'only-key', 'fathers-raincoat'];
              this.encounterIndex = 5;
              this.startStage();
              this.spawnPause = 999;
              this.enemies = [];
              this.darkActive = true;
              this.lampSpawned = true;
              this.darknessStartedAt = this.battleTime;
              this.darkCX = this.heroX;
              this.darkCY = this.heroY - 8;
              this.darkR = 116;
              const keeper = this.createSeekingEnemy('lamp-keeper', this.darkCX, this.darkCY - 108);
              keeper.speed = 0;
              keeper.attackCooldown = 99;
              keeper.mechTimer = 0;
              const visibleShade = this.createSeekingEnemy('forgetter', this.darkCX + 82, this.darkCY + 18);
              visibleShade.speed = 0;
              const hiddenShade = this.createSeekingEnemy('forgetter', this.darkCX + 184, this.darkCY + 18);
              hiddenShade.speed = 0;
              this.enemies.push(keeper, visibleShade, hiddenShade);
              if (auditScreen === 'lamp-choice') this.beginLampChoice(keeper);
              this.caption = auditScreen === 'lamp-choice'
                ? '他点亮两件东西。走向哪一件，就留下哪一件。'
                : '灯照不到的地方，怪物仍在靠近，只是看不见。';
              this.captionTime = 99;
              this.shotTimer = 999;
              this.auditBossArtActive = true;
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
        if (action !== 'boss-art' && action !== 'boss-skill-art' && action !== 'elite-art' && action !== 'enemy-art' && action !== 'scene-art') this.auditBossArtActive = false;
        const bossSkillAudit = action === 'boss-skill-art' && typeof payload === 'string' ? payload.split(':') : undefined;
        if (action === 'projectile-mechanic' && typeof payload === 'string') {
          this.setupProjectileMechanicAudit(payload);
          return;
        }
        if (action === 'projectile-form' && Array.isArray(payload)) {
          const ids = payload.filter((id): id is ItemId => typeof id === 'string' && ITEM_IDS.includes(id as ItemId));
          this.setupProjectileFormAudit(ids);
          return;
        }
        if (action === 'relic-audit' && typeof payload === 'string' && ITEM_IDS.includes(payload as ItemId)) {
          this.setupRelicMechanicAudit(payload as ItemId);
          return;
        }
        if (action === 'memory-recall') {
          this.state = 'battle';
          this.encounterIndex = 2;
          this.spawnPause = 999;
          this.enemies = [];
          const auditDistance = typeof payload === 'number' && Number.isFinite(payload)
            ? Math.max(20, Math.min(320, payload))
            : 212;
          const distantTask = this.createSeekingEnemy('task-simple', this.heroX, this.heroY - auditDistance);
          distantTask.speed = 0;
          distantTask.attackCooldown = 99;
          this.enemies.push(distantTask);
          this.memories = ['雨停以后，他还是把那把伞收好了。'];
          this.recalledMemories.clear();
          this.memoryRecall = undefined;
          this.standStillTime = 5.95;
          this.lastSighMark = 0;
          this.memoryRecallHandledThisStand = false;
          this.heroMoving = false;
          this.heroInputMoving = false;
          this.caption = '';
          this.captionTime = 0;
          this.voiceCaption = undefined;
          this.phoneRinging = false;
          this.phoneAnswer = 0;
          this.phoneTranscript = undefined;
          this.shotTimer = 999;
          this.render();
          return;
        }
        if (action === 'praise-consult') {
          const chair = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'praise-chair' && (enemy.phase ?? 1) === 1);
          if (chair) this.beginPraiseConsult(chair, typeof payload === 'number' ? Math.max(1, Math.floor(payload)) : 2);
          this.render();
          return;
        }
        if (action === 'praise-approach') {
          if (this.praiseConsult) {
            this.heroX = this.praiseConsult.x;
            this.heroY = this.praiseConsult.y;
          }
          this.render();
          return;
        }
        if (action === 'praise-paper-approach') {
          const zone = this.praisePaperZones[0];
          if (zone) {
            this.heroX = zone.x;
            this.heroY = zone.y;
          }
          this.render();
          return;
        }
        if (action === 'phone-split') {
          const phone = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'ringing-phone' && (enemy.phase ?? 1) === 2);
          if (phone) this.beginPhoneRing(phone, true);
          this.render();
          return;
        }
        if (action === 'phone-approach') {
          const call = this.phoneCalls[this.nearestPhoneCallIndex()];
          if (call) {
            this.heroX = call.x;
            this.heroY = call.y;
          }
          this.render();
          return;
        }
        if (action === 'phone-caller' && typeof payload === 'string' && PHONE_CALLERS.includes(payload as PhoneCaller)) {
          const phone = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'ringing-phone');
          if (phone) this.applyPhoneCaller(phone, payload as PhoneCaller);
          this.render();
          return;
        }
        if (action === 'phone-missed' && typeof payload === 'number' && Number.isFinite(payload)) {
          const phone = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'ringing-phone');
          this.phoneMissed = Math.max(0, Math.floor(payload));
          if (phone) this.updatePhoneStrength(phone);
          this.render();
          return;
        }
        if (action === 'xiao-zhang-prompt') {
          this.startRun(0x20260718, true);
          this.initialItemReward = false;
          this.hero.maxHp = 999;
          this.hero.hp = 999;
          this.hero.coins = typeof payload === 'number' ? Math.max(0, Math.floor(payload)) : 20;
          this.encounterIndex = 2;
          this.startStage();
          this.spawnPause = 999;
          this.enemies = [];
          this.xiaoZhangSpawned = true;
          this.xiaoZhangWorld = { x: this.heroX, y: this.heroY - 72 };
          this.xiaoZhangPrompt = true;
          this.xiaoZhangFocus = this.hero.coins >= 10 ? 0 : 1;
          this.render();
          return;
        }
        if (action === 'xiao-zhang-help') {
          this.resolveXiaoZhangChoice(true);
          const ally = this.xiaoZhangAlly;
          if (ally && this.state === 'battle') {
            const target = this.createSeekingEnemy('task-simple', this.heroX + 112, this.heroY - 54);
            target.speed = 0;
            target.attackCooldown = 99;
            this.enemies = [target];
            ally.fireCooldown = 0;
            this.shotTimer = 999;
          }
          this.render();
          return;
        }
        if (action === 'xiao-zhang-one-seat') {
          this.startRun(0x20260718, true);
          this.initialItemReward = false;
          this.hero.maxHp = 999;
          this.hero.hp = 999;
          this.hero.coins = 20;
          this.encounterIndex = 2;
          this.helpedXiaoZhang = true;
          this.xiaoZhangDecision = 'helped';
          this.startStage();
          this.spawnPause = 999;
          this.enemies = [];
          this.xiaoZhangAlly = { x: this.heroX - 56, y: this.heroY + 20, fireCooldown: 99, faceLeft: false };
          const chair = this.createSeekingEnemy('praise-chair', this.heroX, this.heroY - 170);
          chair.phase = 2;
          chair.hp = chair.maxHp * 0.48;
          chair.radius = 58;
          const taskA = this.createSeekingEnemy('task-simple', this.heroX - 90, this.heroY - 68);
          const taskB = this.createSeekingEnemy('task-revise', this.heroX + 90, this.heroY - 68);
          this.enemies.push(chair, taskA, taskB);
          this.resolveOneSeat(chair, [taskA, taskB]);
          this.shotTimer = 999;
          this.render();
          return;
        }
        if (action === 'xiao-zhang-box') {
          this.startRun(0x20260718, true);
          this.initialItemReward = false;
          this.hero.maxHp = 999;
          this.hero.hp = 999;
          this.encounterIndex = 4;
          this.helpedXiaoZhang = true;
          this.xiaoZhangDecision = 'helped';
          this.xiaoZhangBetrayed = true;
          this.startStage();
          this.stageEliteSpawned = true;
          this.spawnPause = 999;
          this.enemies = [];
          const box = this.createSeekingEnemy('whose-box', this.heroX, this.heroY - 104);
          box.name = '谁的纸箱 · 小张';
          box.xiaoZhangBox = true;
          box.speed = 0;
          box.attackCooldown = 99;
          this.enemies.push(box);
          this.shotTimer = 999;
          this.auditBossArtActive = true;
          this.render();
          return;
        }
        if (action === 'equip' && Array.isArray(payload)) {
          // 走真实拾取路径：combo 检测与永久代价（maxHp 损失、零钱清零）都挂在 acquireItem 上，
          // 直接赋值 this.items 会静默漏掉这些副作用（老坑）。
          this.items = [];
          for (const id of payload) {
            if (typeof id === 'string' && ITEM_IDS.includes(id as ItemId)) this.acquireItem(id as ItemId);
          }
          this.render();
          return;
        }
        if (action === 'hurt' && this.state === 'battle' && typeof payload === 'number') {
          this.hurtCooldown = 0;
          this.hurtHero(this.clamp(payload, 1, 99));
          this.render();
          return;
        }
        if (action === 'defeat-stage-elite' && this.state === 'battle') {
          if (typeof payload === 'number' && Number.isFinite(payload)) {
            this.battleTime = Math.max(this.battleTime, payload);
            if (this.battleTime >= FINAL_FATE_AT) this.finalFateTriggered = true;
          }
          const elite = this.enemies.find((enemy) => !enemy.dead && enemy.elite && !enemy.boss);
          if (elite) this.damageEnemy(elite, elite.hp + 1, '#ffffff');
          this.render();
          return;
        }
        if (action === 'defeat-boss' && this.state === 'battle') {
          const bossUnit = this.enemies.find((enemy) => !enemy.dead && enemy.boss);
          if (bossUnit) {
            // 只给完整章节回归使用：先满足正式战斗里不可跳过的叙事门槛，
            // 再压血补刀。收灯人仍由 damageEnemy 的永久守卫拒绝击杀。
            if (bossUnit.type === 'praise-chair') {
              bossUnit.phase = 2;
              this.praiseOneSeatUsed = true;
            } else if (bossUnit.type === 'ringing-phone') {
              bossUnit.phase = 2;
              this.phoneStoryIndex = PHONE_STORY_STEPS.length;
              this.phoneRinging = true;
              this.phoneAnswer = 1;
              this.phonePostAnswerTimer = 0.65;
            }
            bossUnit.hp = Math.min(bossUnit.hp, 1);
            this.damageEnemy(bossUnit, 999, '#ffffff');
          }
          this.render();
          return;
        }
        if (action === 'one-more' && this.state === 'battle' && typeof payload === 'string') {
          if (payload === 'prompt') {
            this.enemies = [];
            this.beginStageTransition();
          } else if (payload === 'continue') this.resolveOneMoreGame(true);
          else if (payload === 'sleep') this.resolveOneMoreGame(false);
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
          if (this.state === 'title') this.startRun(0x20260718, true);
          this.initialItemReward = false;
          this.hero.maxHp = 999;
          this.hero.hp = 999;
          this.encounterIndex = 0;
          this.startStage();
        }
        if (action === 'stress-battle') this.setupCombatStressAudit();
        if (action === 'projectile-combo-stress') this.setupProjectileComboStressAudit();
        if (action === 'lantern-stress') this.setupLanternHordeStressAudit();
        if (action === 'origin-badge-audit') {
          this.setupCombatStressAudit();
          this.origin = {
            title: '总替院里广播找人',
            nickname: '二楼广播站站长',
            nicknameReason: '院里喇叭一响，他总能先认出要找的是谁，后来连大人都隔着窗户这样叫他。',
            story: ['仅用于开发环境检查七字外号、长缘由与双特质排版。'],
            kind: 'mixed',
            traits: ['too_sensible', 'soft_hearted'],
            traitReasons: [
              '什么事都先替别人想完，自己的那一口气总留到最后。',
              '谁在楼道里哭，他都会先把手里的东西放下。',
            ],
            appearance: { ...DEFAULT_APPEARANCE },
            source: 'local',
          };
          this.originBadgeExpanded = payload === 'expanded';
          this.render();
        }
        if (action === 'projectile-audit') {
          this.setupProjectileAudit();
        }
        if (action === 'father') {
          if (this.state === 'title') this.startRun(0x20260718);
          this.initialItemReward = false;
          this.hero.maxHp = 999;
          this.hero.hp = 999;
          this.encounterIndex = 1;
          this.startStage();
          this.stageEliteSpawned = true;
          this.rewardSpawnedAt = this.encounterIndex;
          this.worldReward = undefined;
          this.enemies = [];
          this.voiceCaption = undefined;
          this.feedback.stopVoice();
          this.battleTime = (STAGES[this.encounterIndex]?.bossAt ?? 0) - 0.1;
          this.update(FIXED_STEP * 7);
          const father = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'silent-father');
          if (father) {
            father.x = this.heroX + 96;
            father.y = this.heroY - 72;
          }
          this.shotTimer = 999;
          this.projectiles = [];
          this.pendingShots = [];
          this.toast = '';
          this.toastTime = 0;
          this.screenTransition = undefined;
          this.lastRenderedState = this.state;
        }
        if (action === 'father-phase2') {
          const father = this.enemies.find((enemy) => !enemy.dead && enemy.type === 'silent-father');
          if (father) {
            father.hp = father.maxHp * 0.505;
            father.windupTimer = 0;
            father.mechTimer = 0;
            this.damageEnemy(father, father.maxHp * 0.02, '#d8c18c');
            this.update(FIXED_STEP);
          }
        }
        if (action === 'scene-art' && typeof payload === 'string') {
          const [stageToken, blendToken] = payload.split(':');
          const requestedStage = Number(stageToken);
          const stageIndex = Number.isFinite(requestedStage)
            ? Math.max(0, Math.min(STAGES.length - 1, Math.floor(requestedStage)))
            : 0;
          const requestedBlend = Number(blendToken ?? 0);
          const sceneBlend = Number.isFinite(requestedBlend) ? this.clamp(requestedBlend, 0, 1) : 0;
          if (this.state === 'title') {
            this.runSeed = 0x20260718;
            this.rngState = this.runSeed;
          }
          this.initialItemReward = false;
          this.hero.maxHp = 999;
          this.hero.hp = 999;
          this.encounterIndex = stageIndex;
          this.startStage(true);
          const stage = STAGES[stageIndex]!;
          this.battleTime = stageIndex < STAGES.length - 1
            ? Math.max(0, stage.duration - 15 + sceneBlend * 15)
            : 0;
          this.transitionTimer = 0;
          this.enemies = [];
          this.projectiles = [];
          this.pendingShots = [];
          this.bursts = [];
          this.coinDrops = [];
          this.worldDoor = undefined;
          this.worldStall = undefined;
          this.worldReward = undefined;
          this.darkActive = false;
          this.darkR = 9999;
          this.caption = '';
          this.captionTime = 0;
          this.eliteAlertName = '';
          this.eliteAlertTime = 0;
          this.shotTimer = 999;
          this.auditBossArtActive = true;
        }
        if (action === 'elite-art' && typeof payload === 'string') {
          const eliteArtStages = {
            'closet-clothes': 0,
            'wall-ranking': 1,
            'window-desk': 2,
            'father-silence': 3,
            'whose-box': 4,
            'iv-stand': 5,
          } as const;
          const stageIndex = eliteArtStages[payload as keyof typeof eliteArtStages];
          if (stageIndex !== undefined) {
            if (this.state === 'title') {
              this.runSeed = 0x20260718;
              this.rngState = this.runSeed;
            }
            this.initialItemReward = false;
            this.hero.maxHp = 999;
            this.hero.hp = 999;
            this.encounterIndex = stageIndex;
            this.startStage(true);
            this.stageEliteSpawned = true;
            this.enemies = [];
            const enemy = this.createSeekingEnemy(payload as EnemyType, this.heroX, this.heroY - 104);
            enemy.speed = 0;
            enemy.attackCooldown = 99;
            this.enemies.push(enemy);
            this.shotTimer = 999;
            this.projectiles = [];
            this.pendingShots = [];
            this.bursts = [];
            this.coinDrops = [];
            this.darkActive = false;
            this.darkR = 9999;
            this.auditBossArtActive = true;
            this.caption = '';
            this.captionTime = 0;
            this.eliteAlertName = '';
            this.eliteAlertTime = 0;
          }
        }
        if (action === 'enemy-art' && typeof payload === 'string') {
          const enemyArtSpecs: Record<string, { type: EnemyType; stage: number; phase?: number }> = {
            'coat-rack': { type: 'coat-rack', stage: 0 },
            'others-paper': { type: 'others-paper', stage: 1 },
            'sign-here': { type: 'sign-here', stage: 1 },
            'id-scanner': { type: 'id-scanner', stage: 2 },
            'task-simple': { type: 'task-simple', stage: 2 },
            'task-revise': { type: 'task-revise', stage: 2 },
            'task-deadline': { type: 'task-deadline', stage: 2 },
            'task-sync': { type: 'task-sync', stage: 2 },
            'wet-shoes': { type: 'wet-shoes', stage: 3 },
            'desk-lamp': { type: 'desk-lamp', stage: 3 },
            'reheated-pot': { type: 'reheated-pot', stage: 3 },
            'meeting-door': { type: 'meeting-door', stage: 4 },
            'checkup-report': { type: 'checkup-report', stage: 4 },
            'queue-screen': { type: 'queue-screen', stage: 5 },
            'others-family': { type: 'others-family', stage: 5 },
            'revolving-lantern': { type: 'revolving-lantern', stage: 5 },
            'praise-chair-p1': { type: 'praise-chair', stage: 2, phase: 1 },
            'praise-chair-p2': { type: 'praise-chair', stage: 2, phase: 2 },
            'ringing-phone-p1': { type: 'ringing-phone', stage: 3, phase: 1 },
            'ringing-phone-p2': { type: 'ringing-phone', stage: 3, phase: 2 },
          };
          const spec = enemyArtSpecs[payload];
          if (spec) {
            if (this.state === 'title') {
              this.runSeed = 0x20260718;
              this.rngState = this.runSeed;
            }
            this.initialItemReward = false;
            this.hero.maxHp = 999;
            this.hero.hp = 999;
            this.encounterIndex = spec.stage;
            this.startStage(true);
            this.stageEliteSpawned = true;
            this.enemies = [];
            const enemy = this.createSeekingEnemy(spec.type, this.heroX, this.heroY - 116);
            enemy.speed = 0;
            enemy.attackCooldown = 99;
            enemy.phase = spec.phase ?? 1;
            if (enemy.phase === 2) enemy.hp = enemy.maxHp * 0.49;
            this.enemies.push(enemy);
            this.shotTimer = 999;
            this.projectiles = [];
            this.pendingShots = [];
            this.bursts = [];
            this.coinDrops = [];
            this.darkActive = false;
            this.darkR = 9999;
            this.auditBossArtActive = true;
            this.caption = '';
            this.captionTime = 0;
            this.eliteAlertName = '';
            this.eliteAlertTime = 0;
          }
        }
        if (action === 'boss-art' && typeof payload === 'string') {
          const bossArtStages = {
            'closet-dark': { type: 'closet-dark', stage: 0, phase: 1 },
            'uniform-answer': { type: 'uniform-answer', stage: 1, phase: 1 },
            'last-bus': { type: 'last-bus', stage: 2, phase: 1 },
            'silent-father': { type: 'silent-father', stage: 1, phase: 1 },
            'silent-father-p2': { type: 'silent-father', stage: 1, phase: 2 },
            'debt-collector': { type: 'debt-collector', stage: 4, phase: 1 },
            'lamp-keeper': { type: 'lamp-keeper', stage: 5, phase: 1 },
          } as const;
          const spec = bossArtStages[payload as keyof typeof bossArtStages];
          if (spec) {
            if (this.state === 'title') {
              this.runSeed = 0x20260718;
              this.rngState = this.runSeed;
            }
            this.initialItemReward = false;
            this.hero.maxHp = 999;
            this.hero.hp = 999;
            this.encounterIndex = spec.stage;
            this.startStage(true);
            this.darkActive = spec.type === 'lamp-keeper';
            this.lampSpawned = spec.type === 'lamp-keeper';
            this.darkCX = this.heroX;
            this.darkCY = this.heroY;
            this.darkR = spec.type === 'lamp-keeper' ? 104 : 9999;
            this.enemies = [];
            const enemy = this.createSeekingEnemy(spec.type, this.heroX, this.heroY - 104);
            enemy.speed = 0;
            enemy.attackCooldown = 99;
            enemy.phase = spec.phase;
            if (spec.phase === 2) enemy.hp = enemy.maxHp * 0.49;
            this.enemies.push(enemy);
            this.shotTimer = 999;
            this.projectiles = [];
            this.pendingShots = [];
            this.bursts = [];
            this.auditBossArtActive = true;
            this.eliteAlertName = '';
            this.eliteAlertTime = 0;
          }
        }
        if (bossSkillAudit && isBossSkillId(bossSkillAudit[0])) {
          const bossSkillId = bossSkillAudit[0];
          const fatherPhaseTwo = bossSkillId === 'father-charge' || bossSkillId === 'father-tantrum' || bossSkillId === 'father-tears';
          const spec: { type: EnemyType; stage: number; phase: number } = bossSkillId.startsWith('coat-')
            ? { type: 'coat-rack', stage: 0, phase: 1 }
            : bossSkillId.startsWith('uniform-')
              ? { type: 'uniform-answer', stage: 1, phase: 1 }
              : bossSkillId.startsWith('bus-')
                ? { type: 'last-bus', stage: 2, phase: 1 }
                : bossSkillId.startsWith('wet-shoes-')
                  ? { type: 'wet-shoes', stage: 3, phase: 1 }
                  : bossSkillId.startsWith('box-')
                    ? { type: 'whose-box', stage: 4, phase: 1 }
                    : bossSkillId.startsWith('lantern-')
                      ? { type: 'revolving-lantern', stage: 5, phase: 1 }
                      : bossSkillId.startsWith('closet-')
                        ? { type: 'closet-dark', stage: 0, phase: 1 }
                        : bossSkillId.startsWith('father-')
                          ? { type: 'silent-father', stage: 1, phase: fatherPhaseTwo ? 2 : 1 }
                          : bossSkillId.startsWith('praise-p1-')
                            ? { type: 'praise-chair', stage: 2, phase: 1 }
                            : bossSkillId.startsWith('praise-p2-')
                              ? { type: 'praise-chair', stage: 2, phase: 2 }
                              : bossSkillId.startsWith('phone-p1-')
                                ? { type: 'ringing-phone', stage: 3, phase: 1 }
                                : bossSkillId.startsWith('phone-p2-')
                                  ? { type: 'ringing-phone', stage: 3, phase: 2 }
                        : bossSkillId.startsWith('collector-')
                          ? { type: 'debt-collector', stage: 4, phase: 1 }
                          : { type: 'lamp-keeper', stage: 5, phase: 1 };
          if (this.state === 'title') {
            this.runSeed = 0x20260718;
            this.rngState = this.runSeed;
          }
          this.initialItemReward = false;
          this.hero.maxHp = 999;
          this.hero.hp = 999;
          this.encounterIndex = spec.stage;
          this.startStage(true);
          this.darkActive = spec.type === 'lamp-keeper';
          this.lampSpawned = spec.type === 'lamp-keeper';
          this.darkCX = this.heroX;
          this.darkCY = this.heroY;
          this.darkR = spec.type === 'lamp-keeper' ? 132 : 9999;
          this.enemies = [];
          const enemy = this.createSeekingEnemy(spec.type, this.heroX, this.heroY - 116);
          enemy.age = 0;
          enemy.speed = 0;
          enemy.attackCooldown = 99;
          enemy.mechTimer = -999;
          enemy.phase = spec.phase;
          if (spec.phase === 2) enemy.hp = enemy.maxHp * 0.49;
          this.playBossAnimation(enemy, bossSkillId, 30, true);
          const requestedFrame = Number(bossSkillAudit[1]);
          if (Number.isInteger(requestedFrame)) enemy.bossAnimFrame = this.clamp(requestedFrame, 0, 3);
          this.enemies.push(enemy);
          this.phoneRinging = false;
          this.shotTimer = 999;
          this.projectiles = [];
          this.pendingShots = [];
          this.bursts = [];
          this.coinDrops = [];
          this.auditBossArtActive = true;
          this.caption = '';
          this.captionTime = 0;
          this.eliteAlertName = '';
          this.eliteAlertTime = 0;
        }
        if (action === 'telegraph' && typeof payload === 'string') {
          const bossStages: Partial<Record<EnemyType, number>> = {
            'coat-rack': 0,
            'closet-dark': 0,
            'uniform-answer': 1,
            'last-bus': 2,
            'praise-chair': 2,
            'wet-shoes': 3,
            'silent-father': 1,
            'whose-box': 4,
            'debt-collector': 4,
            'revolving-lantern': 5,
            'lamp-keeper': 5,
          };
          const telegraphVariant = payload;
          const fatherTelegraphVariant = telegraphVariant === 'silent-father-coat'
            || telegraphVariant === 'silent-father-tantrum';
          const coatTelegraphVariant = telegraphVariant === 'coat-rack-double';
          const uniformTelegraphMove = telegraphVariant === 'uniform-answer-process'
            ? 1
            : telegraphVariant === 'uniform-answer-pass'
              ? 2
              : telegraphVariant === 'uniform-answer-standard'
                ? 0
                : undefined;
          const type = fatherTelegraphVariant
            ? 'silent-father'
            : coatTelegraphVariant
              ? 'coat-rack'
              : uniformTelegraphMove !== undefined
                ? 'uniform-answer'
                : payload as EnemyType;
          const stageIndex = bossStages[type];
          if (stageIndex !== undefined) {
            if (this.state === 'title') this.startRun(0x20260718, true);
            this.initialItemReward = false;
            this.hero.maxHp = 999;
            this.hero.hp = 999;
            this.encounterIndex = stageIndex;
            this.startStage();
            this.screenTransition = undefined;
            this.lastRenderedState = this.state;
            this.heroX = W / 2;
            this.heroY = HERO_SCREEN_Y;
            this.darkActive = type === 'lamp-keeper';
            this.lampSpawned = type === 'lamp-keeper';
            this.darkCX = this.heroX;
            this.darkCY = this.heroY;
            this.darkR = type === 'lamp-keeper' ? 104 : 9999;
            this.enemies = [];
            const enemy = this.createSeekingEnemy(type, this.heroX, this.heroY - 128);
            if (type === 'uniform-answer' || type === 'last-bus') {
              enemy.boss = false;
              enemy.elite = true;
            }
            if (type === 'coat-rack') {
              if (coatTelegraphVariant) enemy.hp = enemy.maxHp * 0.49;
              enemy.mechTimer = 4.25;
            }
            if (type === 'closet-dark') {
              enemy.attackAngle = Math.atan2(this.heroY - enemy.y, this.heroX - enemy.x);
              enemy.attackKind = 'shadow';
              enemy.windupTimer = 0.62;
            }
            if (type === 'uniform-answer') {
              if (uniformTelegraphMove !== undefined) enemy.phase = uniformTelegraphMove;
              if (uniformTelegraphMove === 1) {
                // 开发入口刚清空了真实轨迹；注入确定的三秒路径，才能审阅《过程没写》的完整重放。
                this.heroTrail = Array.from({ length: 24 }, (_, index) => {
                  // 正式招式会隔点抽样偶数下标，因此让 index 22 落回当前位置，index 23 仅作最新采样占位。
                  const progress = Math.min(index, 22) / 22;
                  return {
                    x: this.heroX - 90 + progress * 90,
                    y: this.heroY + Math.sin(progress * Math.PI * 2) * 46,
                  };
                });
              }
              enemy.mechTimer = 7.35;
            }
            if (type === 'last-bus') {
              enemy.phase = 0;
              enemy.mechTimer = 3.05;
            }
            if (type === 'praise-chair') {
              enemy.phase = 2;
              enemy.hp = enemy.maxHp * 0.49;
              enemy.radius = 58;
              this.praiseMoveIndex = 0;
              enemy.mechTimer = 3.9; // 审阅入口留 0.3 秒起跑缓冲，能稳定复核 230px 边界内外。
            }
            if (type === 'wet-shoes') {
              this.standStillTime = 1.25;
              enemy.mechTimer = 1.25;
            }
            if (type === 'whose-box') {
              if (this.items.length === 0) this.items = ['wooden-sword'];
              enemy.mechTimer = 5.65;
            }
            if (type === 'revolving-lantern') enemy.mechTimer = 4.05;
            if (type === 'silent-father') {
              enemy.phase = 2;
              enemy.phaseFlashTimer = 0.8;
              this.fatherSecondPhaseLineShown = true;
              this.fatherCycleIndex = telegraphVariant === 'silent-father-tantrum' ? 1 : 0;
              enemy.mechTimer = 3.45;
              if (fatherTelegraphVariant) {
                this.fallenCoatX = enemy.x;
                this.fallenCoatY = enemy.y + 82;
              } else {
                this.fallenCoatX = enemy.x + 92;
                this.fallenCoatY = enemy.y;
              }
            }
            if (type === 'debt-collector') {
              enemy.phase = 1; // 下一轮固定进入《上门》，不让审计入口先寄账单。
              enemy.mechTimer = 6.4;
            }
            if (type === 'lamp-keeper') enemy.mechTimer = 9.2;
            this.enemies.push(enemy);
            this.stageEliteSpawned = true;
            this.eliteSpawned = true;
            this.shotTimer = 999;
            this.spawnPause = 999;
            this.projectiles = [];
            this.pendingShots = [];
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
