export type ScreenState = 'title' | 'origin' | 'battle' | 'itemReward' | 'shop' | 'specialRoom' | 'fateEvent' | 'result';
export type EncounterKind = 'normal' | 'elite' | 'boss';
export type RewardKind = 'fate' | 'item' | 'shop' | 'result';

export type FateDirection = 'swallow' | 'exhale';
export type FateProfile = '微光' | '交换' | '诱惑' | '反噬' | '荒诞' | '沉默';
export type PoisonKey = 'greed' | 'anger' | 'delusion' | 'pride' | 'doubt';

export interface PoisonVector {
  greed: number;
  anger: number;
  delusion: number;
  pride: number;
  doubt: number;
}

export const POISON_LABELS: Record<PoisonKey, '贪' | '嗔' | '痴' | '慢' | '疑'> = {
  greed: '贪',
  anger: '嗔',
  delusion: '痴',
  pride: '慢',
  doubt: '疑',
};

export type OriginKind = 'ordinary' | 'mixed' | 'favored' | 'harsh';
export type OriginTraitId =
  | 'long_breath'
  | 'quick_breath'
  | 'sharp_eyes'
  | 'heavy_hands'
  | 'lucky_pocket'
  | 'someone_left_food'
  | 'light_sleeper'
  | 'weak_lungs'
  | 'bad_eyesight'
  | 'empty_pockets'
  | 'too_sensible'
  | 'soft_hearted';

export type SkinTone = 'paper' | 'warm' | 'cool' | 'brown' | 'deep';
export type FaceShape = 'round' | 'long' | 'square' | 'narrow';
export type EyeShape = 'wide' | 'downcast' | 'narrow' | 'uneven';
export type HairStyle = 'soft_short' | 'buzz' | 'side_part' | 'curly' | 'messy';
export type HairColor = 'ink' | 'brown' | 'soft_black';
export type BodyStature = 'short' | 'average' | 'tall';
export type BodyBuild = 'slim' | 'average' | 'sturdy' | 'soft';
export type StartingPosture = 'upright' | 'guarded' | 'alert' | 'slight_slouch';
export type BaseOutfit = 'undershirt' | 'old_sweater' | 'uniform_liner' | 'plain_shirt';
export type SmallFeature = 'none' | 'cheek_mole' | 'freckles' | 'brow_gap' | 'uneven_brows';

export interface AppearanceDNA {
  skinTone: SkinTone;
  faceShape: FaceShape;
  eyeShape: EyeShape;
  hairStyle: HairStyle;
  hairColor: HairColor;
  stature: BodyStature;
  bodyBuild: BodyBuild;
  posture: StartingPosture;
  outfit: BaseOutfit;
  feature: SmallFeature;
}

export interface OriginProfile {
  title: string;
  nickname?: string;
  nicknameReason?: string;
  story: string[];
  kind: OriginKind;
  traits: OriginTraitId[];
  traitReasons?: string[];
  appearance: AppearanceDNA;
  source: 'local' | 'gpt';
}

export interface OriginModifiers {
  maxHpAdd: number;
  coinsAdd: number;
  damageMul: number;
  fireIntervalMul: number;
  rangeMul: number;
  healingMul: number;
  swallowPowerMul: number;
  firstFateDamageReduction: number;
}

export type FateResponseEffect =
  | 'store_volleys'
  | 'returning_breath'
  | 'guard'
  | 'focus'
  | 'scatter'
  | 'haste'
  | 'heavy_breath'
  | 'delay_pain'
  | 'release_pain'
  | 'gain_coins'
  | 'heal'
  | 'trade_max_hp';

export type FateFactEffectKind = 'none' | 'damage' | 'lose_coins' | 'gain_coins' | 'lose_max_hp' | 'gain_item';

export interface FateFactEffect {
  kind: FateFactEffectKind;
  amount: number;
  item: ItemId | null;
}

export type FateStatKey = 'damage' | 'fireRate' | 'range' | 'width' | 'moveSpeed' | 'projSpeed';

export interface FateResponse {
  label: string;
  hint: string;
  effect: FateResponseEffect;
  poison: Partial<PoisonVector>;
  stats?: Partial<Record<FateStatKey, number>>;
  result: string;
}

export interface FateEvent {
  id: string;
  title: string;
  fact: string;
  profile: FateProfile;
  memoryId: string;
  memoryText: string;
  unavoidable: FateFactEffect;
  swallow: FateResponse;
  exhale: FateResponse;
  source: 'local' | 'gpt';
}

export interface FateReceipt {
  event: FateEvent;
  direction: FateDirection;
  result: string;
}

export interface LifeSnapshotItem {
  id: ItemId;
  name: string;
  summary: string;
  positive: string;
  negative: string;
}

export interface LifeSnapshot {
  runSeed: number;
  chapterIndex: number;
  chapter: string;
  age: string;
  hp: number;
  maxHp: number;
  coins: number;
  items: LifeSnapshotItem[];
  attack: AttackVector;
  poisons: PoisonVector;
  memories: string[];
  recentEvents: string[];
  fateItemCandidates: ItemId[];
  swallowCount: number;
  exhaleCount: number;
}

export type ItemId =
  | 'loose-button'
  | 'wooden-sword'
  | 'red-workbook'
  | 'stone-schoolbag'
  | 'bleach-powder'
  | 'eyebrow-razor'
  | 'od-pill'
  | 'front-desk-letter'
  | 'cracked-glasses'
  | 'small-uniform'
  | 'only-key'
  | 'first-salary'
  | 'nameless-tie'
  | 'fathers-raincoat'
  | 'unsent-phone'
  | 'baby-tooth'
  | 'revoked-badge'
  | 'slow-watch'
  | 'missing-photo'
  | 'white-bottle'
  | 'empty-frame'
  | 'broken-spine'
  | 'spent-decade'
  | 'painless-night'
  | 'held-pee'
  | 'flash-escape'
  | 'class-break'
  | 'last-page'
  | 'five-ha'
  | 'red-packet'
  | 'snow-screen'
  | 'marble'
  | 'always-crying'
  | 'three-day-visible'
  | 'read-3am'
  | 'retracted-voice'
  | 'takeout-3am'
  | 'auto-renew'
  | 'bargain-link'
  | 'mineral-water'
  | 'group-dad'
  | 'divorce-draft'
  | 'checkup-arrows'
  | 'shared-powerbank'
  | 'third-pill'
  | 'loan-contract'
  | 'name-sold'
  | 'moms-bowl'
  | 'ruma-msg'
  | 'held-elevator'
  | 'old-door-lock'
  | 'drank-for-boss'
  | 'hair-in-takeout'
  | 'unwashed-pillow'
  | 'sock-cigs'
  | 'pregnancy-test'
  | 'gym-card'
  | 'funeral-photo'
  | 'typing-indicator'
  | 'year-report'
  | 'momo-avatar'
  | 'ai-chat'
  | 'streak-1847'
  | 'goodnight-2h'
  | 'friend-verify'
  | 'summer-run'
  | 'one-more-game'
  | 'eye-exercise'
  | 'card-binder'
  | 'abstract-lv10'
  | 'shop-freezer'
  | 'server-shutdown'
  | 'ktv-song'
  | 'breath-on-glass';

export type ItemSlot = 'head' | 'face' | 'neck' | 'chest' | 'back' | 'hand' | 'waist' | 'shadow';

export interface ItemDefinition {
  id: ItemId;
  name: string;
  quality: 1 | 2 | 3 | 4;
  qualityName: '杂物' | '旧物' | '心结' | '遗物';
  slot: ItemSlot;
  flavor: string;
  summary: string;
  positive: string;
  negative: string;
  price: number;
  color: string;
  glyph: string;
}

export interface AttackVector {
  damage: number;
  fireInterval: number;
  range: number;
  width: number;
  projectileSpeed: number;
  projectileCount: number;
  spread: number;
  pierce: number;
  lifetime: number;
  knockback: number;
  critChance: number;
  returning: boolean;
  homing: number;
  splitChance: number;
  explosion: number;
  bloodOnHit: number;
}

export type EnemyType = 'fear' | 'red-mark' | 'whisper' | 'clockwork' | 'debt' | 'silent-father' | 'lamp-keeper'
  | 'cry-moth' | 'hunger-shadow' | 'missed-bus' | 'missed-call' | 'silence' | 'badge-thief' | 'forgetter' | 'empty-chair'
  | 'closet-dark' | 'uniform-answer' | 'last-bus' | 'debt-collector';

export interface EnemyUnit {
  id: number;
  type: EnemyType;
  name: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackCooldown: number;
  elite: boolean;
  boss: boolean;
  dead: boolean;
  flash: number;
  age: number;
  angle?: number;
  slowTimer?: number;
  dashTimer?: number;
  /** 掉色雨滴标记（《那年他觉得自己很酷》）：剩余秒数，被标记的敌人受伤加成 */
  marked?: number;
  /** 《凌晨三点的已读》：挂账伤害与结算倒计时——迟到的回应一次性爆出 */
  readDamage?: number;
  readTimer?: number;
  auraCooldown?: number;
  phase?: number;
  mechTimer?: number;
}

export type ProjectileStyle = 'plain' | 'paper' | 'rain' | 'sound' | 'key';

export interface ProjectileVisual {
  coreColor: string;
  materialTint: string;
  edgeColor: string;
  trailColor: string;
  impactColor: string;
  opacity: number;
  length: number;
  softness: number;
  sharpness: number;
  weight: number;
  wetness: number;
  distortion: number;
  segments: number;
  materials: Array<'breath' | 'paper' | 'water' | 'bone' | 'signal' | 'metal'>;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  knockback: number;
  life: number;
  maxLife: number;
  distance: number;
  maxDistance: number;
  pierce: number;
  pierceMax: number;
  returning: boolean;
  reversals: number;
  homing: number;
  splitChance: number;
  explosion: number;
  generation: number;
  color: string;
  style: ProjectileStyle;
  /** 《对方正在输入…》蓄力弹：飞行中不断缩小，命中时只剩"嗯"那么大 */
  shrink?: boolean;
  /** 《朋友圈仅三天可见》环绕弹：绕身三圈后消失 */
  orbit?: { angle: number; total: number; elapsed: number };
  visual: ProjectileVisual;
  critical: boolean;
  hitIds: number[];
}

export interface BurstEffect {
  id: number;
  kind: 'ring' | 'hit' | 'word' | 'door' | 'sigh';
  /** 命中材质：mist/water/crit/paper，选择 hits.png 图集行；缺省走程序圆圈 */
  material?: string;
  x: number;
  y: number;
  radius: number;
  life: number;
  duration: number;
  color: string;
  text?: string;
}

export interface EncounterSpec {
  title: string;
  subtitle: string;
  chapter: string;
  kind: EncounterKind;
  reward: RewardKind;
  enemies: EnemyType[];
}

export interface ShopOffer {
  item: ItemId;
  price: number;
  sold: boolean;
}

export type SpecialRoomKind = 'light' | 'back';

export interface RunStats {
  fateChoices: number;
  swallowed: number;
  exhaled: number;
  volleys: number;
  kills: number;
  damage: number;
  itemsTaken: number;
  coinsSpent: number;
}

export interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

export interface AtlasJson {
  frames: Record<string, AtlasFrame>;
  meta: { image: string; size: { w: number; h: number } };
}

export interface SpriteFrameRef {
  image: HTMLImageElement;
  frame: AtlasFrame;
}
