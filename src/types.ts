export type ScreenState = 'title' | 'origin' | 'battle' | 'itemReward' | 'storyDrop' | 'shop' | 'specialRoom' | 'fateEvent' | 'result';
export type EncounterKind = 'normal' | 'elite' | 'boss';
export type RewardKind = 'fate' | 'item' | 'shop' | 'result';

export type FateDirection = 'swallow' | 'exhale';
export type FateProfile = '微光' | '交换' | '诱惑' | '反噬' | '荒诞' | '沉默';
export type PoisonKey = 'greed' | 'anger' | 'delusion' | 'pride' | 'doubt';
export type LifeAge = '童年' | '少年' | '青年' | '成年' | '中年' | '晚年';

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

export interface FateScene {
  time: string;
  place: string;
  people: string;
}

export interface FateEvent {
  id: string;
  title: string;
  fact: string;
  scene: FateScene;
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
  age: LifeAge;
  stageFocus: string;
  stageBossMeaning: string;
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
  | 'breath-on-glass'
  // —— 第五档 · 这一身（每章大 Boss 固定掉落）——
  | 'admission-notice'
  | 'iphone-17-pro-max'
  | 'fathers-chart';

export type ItemSlot = 'head' | 'face' | 'neck' | 'chest' | 'back' | 'hand' | 'waist' | 'shadow';

export interface ItemDefinition {
  id: ItemId;
  name: string;
  quality: 1 | 2 | 3 | 4 | 5;
  qualityName: '杂物' | '旧物' | '心结' | '遗物' | '这一身';
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
  | 'closet-dark' | 'uniform-answer' | 'last-bus' | 'debt-collector'
  // —— 小 Boss（精英通道）——
  | 'coat-rack'          // 童年：立在墙角的衣架
  | 'whose-box'          // 中年：谁的纸箱
  | 'wet-shoes'          // 成年：还没干的那双鞋（开场即在场）
  | 'revolving-lantern'  // 暮年：走马灯
  // —— 大 Boss ——
  | 'praise-chair'       // 青年：你很优秀
  | 'ringing-phone'      // 成年：响个不停
  // —— 各章新小怪 ——
  | 'others-paper'       // 少年：别人的那张
  | 'sign-here'          // 少年：要签字的那一栏
  | 'id-scanner'         // 青年：识别中（替换打卡齿轮）
  | 'task-simple'        // 青年：这个很简单
  | 'task-revise'        // 青年：再改一版
  | 'task-deadline'      // 青年：辛苦下周一前
  | 'task-sync'          // 青年：对齐一下
  | 'desk-lamp'          // 成年：没关的台灯
  | 'reheated-pot'       // 成年：热过两遍的那锅
  | 'meeting-door'       // 中年：会议室的门
  | 'checkup-report'     // 中年：去年的体检报告
  | 'queue-screen'       // 暮年：叫号屏
  | 'others-family'      // 暮年：别人的家属
  | 'iv-stand';          // 暮年：输液架（由小 Boss 降级为小怪）

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
  /** 《小卖部的冰柜》：完全冻结窗口；与普通减速分开结算。 */
  freezeTimer?: number;
  paralyzeTimer?: number;
  /** Water-bearing shots leave a short-lived wet state that feeds freeze and signal reactions. */
  wetTimer?: number;
  /** Reopened wounds amplify later hits; stacks are capped by the runtime material system. */
  rawTimer?: number;
  rawStacks?: number;
  /** Heavy projectiles slow both approach and attack cadence without hard-locking the enemy. */
  heavyTimer?: number;
  heavyStacks?: number;
  /** Repeated hard control is shortened on elites and bosses. */
  controlFatigue?: number;
  loopTimer?: number;
  dashTimer?: number;
  /** 《抽象话十级》：嘲讽期间的独立易伤窗口，不能复用怪物自身冲刺计时。 */
  tauntVulnerableTimer?: number;
  phaseFlashTimer?: number;
  /** 掉色雨滴标记（《那年他觉得自己很酷》）：剩余秒数，被标记的敌人受伤加成 */
  marked?: number;
  /** 《凌晨三点的已读》：挂账伤害与结算倒计时——迟到的回应一次性爆出 */
  readDamage?: number;
  readTimer?: number;
  auraCooldown?: number;
  phase?: number;
  mechTimer?: number;
  /** 青年任务怪生命周期动作：把分裂、返工、到期与同步事件接到各自正式攻击帧。 */
  taskActionTimer?: number;
  taskActionDuration?: number;
  /** 《热过两遍的那锅》：靠近且站定时累计的重新加热进度。 */
  potReheatProgress?: number;
  /** 《识别中》：横向扫描在前摇开始时锁定的世界 Y 坐标，以及本轮是否已经命中。 */
  scanTargetY?: number;
  scanHit?: boolean;
  /** 《错过的车》：本轮横穿锁定的车道，以及用于左右交替进场的累计趟数。 */
  laneY?: number;
  lanePassIndex?: number;
  /** 暮年叫号屏：是否正在叫到 42 号、当前显示号码与已换过几间。 */
  queueCalled?: boolean;
  queueNumber?: number;
  queueArrivals?: number;
  /** 暮年输液架：只由存活时间决定的十秒提速档。 */
  ivSpeedTier?: number;
  /** Boss 招式前摇：>0 时正在预警，归零瞬间结算命中。通用于各 boss 的定向招式。 */
  windupTimer?: number;
  /** 前摇锁定的招式方向（弧度）与招式类型标签，供渲染与结算共用。 */
  attackAngle?: number;
  attackKind?: string;
  attackTargetId?: number;
  /** 局部 Boss 招式在起手时锁定的世界坐标；预警与结算必须共用。 */
  attackTargetX?: number;
  attackTargetY?: number;
  /** 《里面还有手》唯一安全缺口的中心方向。 */
  attackSafeAngle?: number;
  /** 《换个门》：上门催收自上次换门后累计承受的伤害。 */
  relocateDamage?: number;
  /** 《换个门》演出起点；只参与旧门到新门的局部残影，不参与碰撞。 */
  relocateFromX?: number;
  relocateFromY?: number;
  /** Dedicated boss-skill sprite sequence; independent from contact attacks. */
  bossAnim?: string;
  bossAnimTimer?: number;
  bossAnimDuration?: number;
  bossAnimLoop?: boolean;
  /** Development audit only: freezes a dedicated Boss action on one atlas frame. */
  bossAnimFrame?: number;
  /** 末班车冲撞：本次冲刺是否已命中。冲撞是接触即判定，一次冲刺只打一次。 */
  dashHit?: boolean;
  /** 突进平滑：机制位置瞬移后渲染位置的残余偏移，每帧指数衰减归零 */
  renderLagX?: number;
  renderLagY?: number;
  /** 《灯影戏》：影子怪——半透纯黑剪影，被命中一次才现形 */
  shadowVeil?: boolean;
  /** 《晚点》：末班车假刹车（一场一次） */
  busFeint?: boolean;
  busFeintDone?: boolean;
  /** 湿鞋：当前这次连续停步是否已经加过一档；重新移动后才会复位。 */
  wetShoesStopCharged?: boolean;
  /** 走马灯召出来的：灯被打灭时这些同时消失（影子没了）。 */
  lanternSummon?: boolean;
  /** 走马灯专用人生波次；与通用 age 动画计时分离，严格按前五章循环。 */
  lanternWaveIndex?: number;
  /** 《岗位只有一个！》留下的幸存者；拥有独立《背刺》前摇与判定。 */
  backstabber?: boolean;
  /** 帮过的小张在青年 Boss 战中成为幸存者，用于保留可识别外形。 */
  xiaoZhang?: boolean;
  /** 中年《谁的纸箱》里属于小张的那只箱子，会露出同一张工牌。 */
  xiaoZhangBox?: boolean;
  /** 《谁的纸箱·清点》当前贴签目标与剩余保护窗口；物件留在背包，只暂停本章效果。 */
  countedItem?: ItemId;
  countedItemTimer?: number;
  /** Boss 血量心声已说到第几档（0/1/2）：约 2/3、1/3 血量各触发一句，一句只说一次。 */
  voiceStage?: number;
}

export type ProjectileStyle = 'plain' | 'paper' | 'rain' | 'sound' | 'key';
export type ProjectileForm =
  | 'breath' | 'paper' | 'rain' | 'sound' | 'key' | 'bone' | 'tear' | 'cone' | 'echo'
  | 'slash' | 'razor' | 'marble' | 'ice' | 'serial' | 'typing' | 'card' | 'button'
  | 'workbook' | 'lens' | 'frame' | 'receipt' | 'link' | 'stamp' | 'pill' | 'photo'
  | 'stone' | 'laugh';
export type ProjectileTrail =
  | 'mist' | 'streak' | 'drip' | 'signal' | 'echo' | 'heavy' | 'ricochet' | 'frost'
  | 'serial' | 'return-mark' | 'curve' | 'key-dust' | 'clock' | 'glitch' | 'fade'
  | 'afterimage' | 'chain' | 'child' | 'pause' | 'home' | 'splinter';
export type ProjectileMechanicFlag = 'pierce' | 'returning' | 'homing' | 'split' | 'area' | 'orbit' | 'echo';

export interface ProjectileVisual {
  form: ProjectileForm;
  /** 主轮廓优先级选出的载体；typing/button/stamp 等派生外形据此继承命中材质。 */
  carrierForm: ProjectileForm;
  trail: ProjectileTrail;
  echoed: boolean;
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
  materials: Array<
    'breath' | 'paper' | 'water' | 'bone' | 'signal' | 'metal'
    | 'wood' | 'stone' | 'ice' | 'key' | 'glass'
  >;
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
  /** 真正的分裂递归层级；与年度回放、雨滴等视觉代次分开计算。 */
  splitDepth: number;
  /** 弹珠折射次数与派生代次分离；每枚继承弹都可独立折射一次。 */
  ricochetDepth?: number;
  explosion: number;
  generation: number;
  /** 对象池淘汰优先级：核心攻击保留，复制/分裂出的衍生弹先回收。 */
  poolPriority?: 'core' | 'secondary';
  color: string;
  style: ProjectileStyle;
  /** 《朋友圈仅三天可见》环绕弹：绕身三圈后向外释放 */
  orbit?: { angle: number; total: number; elapsed: number };
  /** 砍价助力弹只能把目标压到 1 生命；branchDepth 限制助力代数。 */
  nonlethal?: boolean;
  bargainBranchDepth?: number;
  bargainBranched?: boolean;
  /** 朋友验证第一次命中不结算，短暂离开目标后再折回。 */
  verifyPassed?: boolean;
  verifyCooldown?: number;
  /** 《一直没有换的家门锁》：先回到主角根点，再重新发射。 */
  homePhase?: 'returning' | 'relaunched';
  /** 《有人替你按住的电梯》：终点悬停三拍后重新索敌。 */
  elevatorWait?: number;
  elevatorSpeed?: number;
  elevatorRelaunched?: boolean;
  /** 普通命中耗尽不会提前触发只属于生命耗尽/出界终点的爆炸。 */
  hitTerminated?: boolean;
  /** 仅开发审查场景使用：强制走一次冰冻反馈分支。 */
  auditForceFreeze?: boolean;
  /** 仅开发审查场景使用：强制走一次导电麻痹反馈分支。 */
  auditForceParalyze?: boolean;
  /** 仅开发审查场景使用：强制走一次弹珠折射分支。 */
  auditForceRicochet?: boolean;
  visual: ProjectileVisual;
  critical: boolean;
  hitIds: number[];
}

export interface BurstEffect {
  id: number;
  kind: 'ring' | 'hit' | 'word' | 'door' | 'frame' | 'sigh' | 'syn' | 'star' | 'split-spark';
  /** 命中材质选择 hits 行；syn 时为 ice/crack/collapse/arc。 */
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
