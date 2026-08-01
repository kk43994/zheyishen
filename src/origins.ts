import type {
  AppearanceDNA,
  OriginKind,
  OriginModifiers,
  OriginProfile,
  OriginTraitId,
} from './types';

interface OriginTraitDefinition {
  id: OriginTraitId;
  name: string;
  description: string;
  reason: string;
  tone: 'positive' | 'negative' | 'mixed';
  modifiers: Partial<OriginModifiers>;
}

const NEUTRAL_MODIFIERS: OriginModifiers = {
  maxHpAdd: 0,
  coinsAdd: 0,
  damageMul: 1,
  fireIntervalMul: 1,
  rangeMul: 1,
  healingMul: 1,
  swallowPowerMul: 1,
  firstFateDamageReduction: 0,
};

export const DEFAULT_APPEARANCE: AppearanceDNA = {
  skinTone: 'warm',
  faceShape: 'round',
  eyeShape: 'downcast',
  hairStyle: 'soft_short',
  hairColor: 'ink',
  stature: 'average',
  bodyBuild: 'average',
  posture: 'guarded',
  outfit: 'old_sweater',
  feature: 'none',
};

export const ORIGIN_TRAITS: Record<OriginTraitId, OriginTraitDefinition> = {
  long_breath: {
    id: 'long_breath', name: '一口长气', tone: 'positive',
    description: '生命 +8。', reason: '小时候哭一整夜不带换气，肺是练出来的。',
    modifiers: { maxHpAdd: 8 },
  },
  quick_breath: {
    id: 'quick_breath', name: '跑得比钟快', tone: 'positive',
    description: '射速 ×1.09。', reason: '什么都赶在别人前头，手比脑子先动。',
    modifiers: { fireIntervalMul: 0.92 },
  },
  sharp_eyes: {
    id: 'sharp_eyes', name: '先看见门响', tone: 'positive',
    description: '射程 ×1.10。', reason: '门把手一动他先知道——看得远的人，气也送得远。',
    modifiers: { rangeMul: 1.1 },
  },
  heavy_hands: {
    id: 'heavy_hands', name: '手上有分量', tone: 'mixed',
    description: '伤害 ×1.09 · 射速 ×0.96。', reason: '帮家里搬过太多东西，出手沉，收手慢。',
    modifiers: { damageMul: 1.09, fireIntervalMul: 1.04 },
  },
  lucky_pocket: {
    id: 'lucky_pocket', name: '口袋里有两枚', tone: 'positive',
    description: '零钱 +2。', reason: '大人给的钢镚，他从来不马上花。',
    modifiers: { coinsAdd: 2 },
  },
  someone_left_food: {
    id: 'someone_left_food', name: '有人留饭', tone: 'positive',
    description: '生命 +5 · 首次命运伤害 −3。', reason: '锅里总有一只倒扣的碗——吃饱的孩子，扛得住第一次委屈。',
    modifiers: { maxHpAdd: 5, firstFateDamageReduction: 3 },
  },
  light_sleeper: {
    id: 'light_sleeper', name: '睡得很浅', tone: 'mixed',
    description: '射程 ×1.08 · 生命 −6。', reason: '睡客厅的人听得见所有门响——耳朵伸得远，觉从来没睡够。',
    modifiers: { rangeMul: 1.08, maxHpAdd: -6 },
  },
  weak_lungs: {
    id: 'weak_lungs', name: '肺里少半拍', tone: 'negative',
    description: '生命 −4 · 射速 ×0.91。', reason: '跑两步就要停一停，气总是接不上。',
    modifiers: { maxHpAdd: -4, fireIntervalMul: 1.1 },
  },
  bad_eyesight: {
    id: 'bad_eyesight', name: '很早就眯眼', tone: 'negative',
    description: '射程 ×0.88。', reason: '从小凑在电视跟前，一直看到雪花屏——黑板从第三排起就是糊的。',
    modifiers: { rangeMul: 0.88 },
  },
  empty_pockets: {
    id: 'empty_pockets', name: '口袋是空的', tone: 'negative',
    description: '零钱 −3。', reason: '要交的钱，总要等两天才敢开口要。',
    modifiers: { coinsAdd: -3 },
  },
  too_sensible: {
    id: 'too_sensible', name: '太懂事', tone: 'mixed',
    description: '咽下 ×1.12 · 治疗 ×0.85。', reason: '什么都往肚子里咽，咽成了本事；懂事的孩子不好意思喊疼。',
    modifiers: { swallowPowerMul: 1.12, healingMul: 0.85 },
  },
  soft_hearted: {
    id: 'soft_hearted', name: '心太软', tone: 'mixed',
    description: '治疗 ×1.12 · 伤害 ×0.94。', reason: '谁哭他都先递纸——安慰人是真的，下狠手是假的。',
    modifiers: { healingMul: 1.12, damageMul: 0.94 },
  },
};

// 仅作为写作与提示词风格样本保留；运行时没有读取、抽取或回退入口。
const ORIGIN_STYLE_EXAMPLES: OriginProfile[] = [
  {
    title: '普通人', kind: 'ordinary', traits: [], source: 'local',
    story: [
      '他出生在一间没有留下照片的房间。没有预言，没有遗产，也没有谁特别亏欠他。',
      '家里偶尔吵架，也偶尔在周末多买一只苹果。他和很多人一样，慢慢学会走路，也慢慢学会不哭出声。',
      '后来发生的事情，还没有来得及决定他。',
    ],
    appearance: { ...DEFAULT_APPEARANCE },
  },
  {
    title: '奶瓶拿得太久', nickname: '叼奶弟弟', kind: 'ordinary', traits: [], source: 'local',
    nicknameReason: '别的孩子拿奶瓶喝奶，他把空奶瓶叼成了护身符，走到哪里都不肯松口。',
    story: [
      '他出生时哭得不算响，护士把奶瓶塞过去，他立刻像接到一份长期合同。',
      '奶喝完以后，他仍把空瓶叼在嘴里。睡觉叼着，走路叼着，连摔倒时都先伸手护瓶；大人笑他比家里的门闩还牢。',
      '后来院里没人记得他的正式名字，见面只喊“叼奶弟弟”。他一边嫌难听，一边在听见时下意识回头。',
    ],
    appearance: { ...DEFAULT_APPEARANCE, eyeShape: 'wide', hairStyle: 'messy', stature: 'short', posture: 'guarded', feature: 'uneven_brows' },
  },
  {
    title: '总睡在客厅', kind: 'mixed', traits: ['light_sleeper'], source: 'local',
    story: [
      '他小时候没有自己的房间，沙发背后就是大人的世界。',
      '门锁转动以前，他已经能从脚步声里分清是谁回来了。睡得浅让他先看见危险，也让身体一直没有真正松开。',
      '很久以后，他仍会在安静时听见一扇并不存在的门。',
    ],
    appearance: {
      skinTone: 'cool', faceShape: 'narrow', eyeShape: 'wide', hairStyle: 'messy', hairColor: 'soft_black',
      stature: 'tall', bodyBuild: 'slim', posture: 'alert', outfit: 'old_sweater', feature: 'uneven_brows',
    },
  },
  {
    title: '有人一直留饭', kind: 'favored', traits: ['someone_left_food'], source: 'local',
    story: [
      '他家厨房的灯总比其他房间晚一点熄灭。',
      '无论放学多晚，锅里都有一只倒扣的碗。没有人说那叫爱，只提醒他吃完记得把锅泡上。',
      '所以他很早就知道，等待有时也会长出体温。',
    ],
    appearance: {
      skinTone: 'warm', faceShape: 'round', eyeShape: 'downcast', hairStyle: 'soft_short', hairColor: 'brown',
      stature: 'short', bodyBuild: 'soft', posture: 'guarded', outfit: 'plain_shirt', feature: 'cheek_mole',
    },
  },
  {
    title: '所有人都说懂事', kind: 'mixed', traits: ['too_sensible'], source: 'local',
    story: [
      '他得到的第一句夸奖，是没有给任何人添麻烦。',
      '家里忙的时候，他会自己把药片和水放到床头；大人说这孩子不用操心，却没人问他为什么从来不喊。',
      '懂事后来成了衣服，尺寸一年比一年小，他却一直没有脱。',
    ],
    appearance: {
      skinTone: 'paper', faceShape: 'long', eyeShape: 'downcast', hairStyle: 'side_part', hairColor: 'ink',
      stature: 'average', bodyBuild: 'slim', posture: 'slight_slouch', outfit: 'uniform_liner', feature: 'brow_gap',
    },
  },
  {
    title: '院子跑到天黑', kind: 'favored', traits: ['long_breath'], source: 'local',
    story: [
      '他小时候认识院子里每一块会绊脚的砖。',
      '大人喊吃饭以前，他能从水泥地的一头跑到另一头，胸口像装着一只不知道累的风箱。',
      '那时他还不知道，人的一口气也会被别的东西慢慢占满。',
    ],
    appearance: {
      skinTone: 'brown', faceShape: 'square', eyeShape: 'wide', hairStyle: 'buzz', hairColor: 'soft_black',
      stature: 'tall', bodyBuild: 'sturdy', posture: 'upright', outfit: 'undershirt', feature: 'freckles',
    },
  },
  {
    title: '借来的校服', kind: 'mixed', traits: ['heavy_hands', 'empty_pockets'], source: 'local',
    story: [
      '他的第一件校服洗得很干净，只是袖口已经有另一个人的折痕。',
      '口袋里从来没有多余的钱，但搬桌子的时候大家总会叫他的名字。有人说穷人的手会更有力，他没有觉得这是夸奖。',
      '他很早就学会，能拿得动和应该拿，并不是一回事。',
    ],
    appearance: {
      skinTone: 'deep', faceShape: 'square', eyeShape: 'narrow', hairStyle: 'buzz', hairColor: 'ink',
      stature: 'average', bodyBuild: 'sturdy', posture: 'guarded', outfit: 'uniform_liner', feature: 'none',
    },
  },
  {
    title: '总比别人喘得早', kind: 'harsh', traits: ['weak_lungs'], source: 'local',
    story: [
      '体育课跑到第二圈，他已经知道队伍不会等他。',
      '老师让他坚持一下，同学把终点线往前挪了一步。他点头，好像这样就能让肺里多出一点地方。',
      '从那以后，他对“再坚持一下”这句话比别人熟得更早。',
    ],
    appearance: {
      skinTone: 'cool', faceShape: 'narrow', eyeShape: 'uneven', hairStyle: 'soft_short', hairColor: 'soft_black',
      stature: 'tall', bodyBuild: 'slim', posture: 'slight_slouch', outfit: 'old_sweater', feature: 'cheek_mole',
    },
  },
  {
    title: '黑板总有些远', kind: 'harsh', traits: ['bad_eyesight'], source: 'local',
    story: [
      '他很早就发现，坐在最后一排的人会活在另一个模糊的世界。',
      '他抄错过日期，也把老师的笑看成过生气。没人知道他为什么总是慢半拍，他自己也没有解释。',
      '看不清的东西多了，人会开始怀疑是不是自己本来就不该看见。',
    ],
    appearance: {
      skinTone: 'warm', faceShape: 'long', eyeShape: 'narrow', hairStyle: 'side_part', hairColor: 'brown',
      stature: 'short', bodyBuild: 'average', posture: 'guarded', outfit: 'plain_shirt', feature: 'uneven_brows',
    },
  },
  {
    title: '口袋里有两枚', kind: 'favored', traits: ['lucky_pocket'], source: 'local',
    story: [
      '出门那天，外婆往他的口袋里塞了两枚硬币。',
      '她说不是给他花的，是让口袋别空着。硬币后来买过糖，也在害怕的时候被他攥出两道圆印。',
      '有些幸运很小，小到只够证明自己不是空手来的。',
    ],
    appearance: {
      skinTone: 'warm', faceShape: 'round', eyeShape: 'wide', hairStyle: 'curly', hairColor: 'brown',
      stature: 'average', bodyBuild: 'average', posture: 'upright', outfit: 'old_sweater', feature: 'freckles',
    },
  },
  {
    title: '很容易替人难过', kind: 'mixed', traits: ['soft_hearted', 'sharp_eyes'], source: 'local',
    story: [
      '他小时候会把摔坏的玩具摆回原位，像它们也会疼。',
      '他总能先看见别人脸上的变化，却很少知道自己正在生气。有人喜欢他的好脾气，也有人因此把更多东西放到他手上。',
      '心软让他看得更远，也让每一次挥手都慢了一点。',
    ],
    appearance: {
      skinTone: 'paper', faceShape: 'round', eyeShape: 'wide', hairStyle: 'curly', hairColor: 'soft_black',
      stature: 'short', bodyBuild: 'soft', posture: 'guarded', outfit: 'plain_shirt', feature: 'cheek_mole',
    },
  },
];

const ORIGIN_KINDS: OriginKind[] = ['ordinary', 'mixed', 'favored', 'harsh'];
const TRAIT_IDS = Object.keys(ORIGIN_TRAITS) as OriginTraitId[];

// 出生轮盘在代码里掷：模型每次请求无状态，让它"自己随机挑"必然塌缩到高频组合。
// 这里只产出约束（家庭底色×地域×基调×外号构词），人物内容仍然全部由 AI 生成，不违反"无兜底"红线。
export interface OriginWheels {
  family: string;
  region: string;
  tone: string;
  nicknameStyle: string;
}

const FAMILY_WHEEL = ['大富', '小康', '普通', '拮据', '贫困', '古怪营生'] as const;
const REGION_WHEEL = [
  '城市高层', '老小区', '县城', '镇上', '村里', '海边', '矿区', '牧区',
  '部队大院', '城中村', '国道边', '林场', '口岸边境', '景区旁', '厂区家属院',
] as const;
const TONE_WHEEL = ['灰色幽默', '狗血抓马', '青春伤感', '平淡白描', '荒诞'] as const;
const NICKNAME_STYLE_WHEEL = [
  '叠词人称',
  '小或老开头的特征称呼',
  '身体或穿戴特征称呼',
  '性格习惯称呼',
  '物件转喻的人称化称呼',
  '谐音人称',
  '小事故留下的人称',
  '口头禅留下的人称',
] as const;

const WHEEL_HISTORY_KEY = 'zys-origin-wheels-v1';

interface WheelHistory {
  family: string[];
  tone: string[];
  nicknameStyle: string[];
}

function readWheelHistory(): WheelHistory {
  try {
    const raw = window.localStorage.getItem(WHEEL_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isRecord(parsed)) {
        const readList = (value: unknown): string[] => (
          Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
        );
        return { family: readList(parsed.family), tone: readList(parsed.tone), nicknameStyle: readList(parsed.nicknameStyle) };
      }
    }
  } catch { /* 抖音容器可能禁 localStorage，退化为无历史 */ }
  return { family: [], tone: [], nicknameStyle: [] };
}

function pickAvoiding(pool: readonly string[], avoid: string[], random: () => number): string {
  const candidates = pool.filter((entry) => !avoid.includes(entry));
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(random() * source.length) % source.length] ?? source[0] ?? '';
}

export function rollOriginWheels(random: () => number): OriginWheels {
  const history = readWheelHistory();
  return {
    family: pickAvoiding(FAMILY_WHEEL, history.family.slice(-2), random),
    region: pickAvoiding(REGION_WHEEL, [], random),
    tone: pickAvoiding(TONE_WHEEL, history.tone.slice(-1), random),
    nicknameStyle: pickAvoiding(NICKNAME_STYLE_WHEEL, history.nicknameStyle.slice(-1), random),
  };
}

export function commitOriginWheels(wheels: OriginWheels): void {
  try {
    const history = readWheelHistory();
    history.family = [...history.family, wheels.family].slice(-3);
    history.tone = [...history.tone, wheels.tone].slice(-2);
    history.nicknameStyle = [...history.nicknameStyle, wheels.nicknameStyle].slice(-2);
    window.localStorage.setItem(WHEEL_HISTORY_KEY, JSON.stringify(history));
  } catch { /* 写不进就算了，防重复退化为纯随机 */ }
}

export function getOriginTrait(id: OriginTraitId): OriginTraitDefinition {
  return ORIGIN_TRAITS[id];
}

export function getOriginModifiers(traits: OriginTraitId[]): OriginModifiers {
  const result = { ...NEUTRAL_MODIFIERS };
  for (const traitId of traits) {
    const modifiers = ORIGIN_TRAITS[traitId].modifiers;
    result.maxHpAdd += modifiers.maxHpAdd ?? 0;
    result.coinsAdd += modifiers.coinsAdd ?? 0;
    result.damageMul *= modifiers.damageMul ?? 1;
    result.fireIntervalMul *= modifiers.fireIntervalMul ?? 1;
    result.rangeMul *= modifiers.rangeMul ?? 1;
    result.healingMul *= modifiers.healingMul ?? 1;
    result.swallowPowerMul *= modifiers.swallowPowerMul ?? 1;
    result.firstFateDamageReduction += modifiers.firstFateDamageReduction ?? 0;
  }
  return result;
}

const PERSON_NICKNAME_ENDING = /(?:少爷|小姐|太子|公主|先生|同学|站长|班长|组长|队长|哥哥|姐姐|弟弟|妹妹|哥|姐|弟|妹|叔|姨|爷|奶|娃|仔|崽|头|脸|眼|嘴|手|脚|腿|耳|鼻|辫|毛|鬼|王|匠|迷|精|包|球|墩|葫芦|喇叭|算盘|串儿|兜|宝)$/u;
const PERSON_NICKNAME_PREFIX = /^(?:小|老|大|胖|瘦|高|矮|红|白|黑|快|慢|闷|倔|馋|懒|急|笑|哭|铁|软|硬|长|短|歪|圆|尖|花)/u;
const PERSON_NICKNAME_DESCRIPTOR = /(?:半拍|不胖|不瘦|不高|不矮|不哭|不笑|不睡|不服|不认|不清|不闲|不住|不停|没影)$/u;
const BARE_ACTION_NICKNAME = /^(?:爱|总爱|老爱|只会|常|老|总)?(?:数|捡|背|看|吃|喝|拿|抱|扛|追|等|睡|哭|笑|喊|跑|爬|踢|揣|藏|收|抄|写|画|修|拆|搬|叠|拧|吹|听|摸|敲|抢|丢|忘|怕|咬|叼|攒|卖|买|送|骑|拉|推|守|晒|烧|煮|洗|擦|扫|挖|抓|养|喂)[\p{Script=Han}]{1,4}$/u;

export function isPersonLikeNickname(value: string): boolean {
  const nickname = value.trim();
  // 放宽到 2–9 字：外号是否顺口交给提示词，长一两个字不该让整份出生档案作废。
  if (nickname.length < 2 || nickname.length > 9 || !/^[\p{Script=Han}]+$/u.test(nickname)) return false;
  // 这里只拦截明显的“动作标题”。外号是否自然、是否像在叫人交给生成提示词，
  // 不再要求命中一小组固定前后缀而把整份出生档案判废。
  return !BARE_ACTION_NICKNAME.test(nickname) || PERSON_NICKNAME_ENDING.test(nickname);
}

export interface OriginValidationOptions {
  /** 新生成内容走完整合同；旧存档仍可按兼容模式读取。 */
  strictAI?: boolean;
}

export function validateOriginProfile(
  value: unknown,
  expectedKind?: OriginKind,
  options: OriginValidationOptions = {},
): OriginProfile | null {
  if (!isRecord(value)) return null;
  const strict = options.strictAI === true;
  // 文案长度属于展示质量，不该让一份已经能显示、能结算的出生档案整份作废。
  // 新生成内容同样使用有界裁剪；严格模式只硬拦结构与正典冲突。
  const title = readText(value.title, 2, 16);
  const nickname = readText(value.nickname, 2, 9);
  const nicknameReason = readText(value.nicknameReason, 6, 90);
  const returnedKind = typeof value.kind === 'string' && ORIGIN_KINDS.includes(value.kind as OriginKind)
    ? value.kind as OriginKind : null;
  // kind 是程序在请求前已经抽定的数值预算。模型回填错标签时以程序预算为准，
  // 后面的特质过滤仍会守住正负面预算，没必要为了一个重复字段卡死开局。
  const kind = expectedKind ?? returnedKind;
  const rawStory = Array.isArray(value.story) ? value.story : [];
  const story = rawStory.map((entry) => readText(entry, 8, 100))
    .filter((entry): entry is string => Boolean(entry));
  const rawTraits = Array.isArray(value.traits) ? value.traits : [];
  let traits = [...new Set(rawTraits.filter((entry): entry is OriginTraitId => (
    typeof entry === 'string' && TRAIT_IDS.includes(entry as OriginTraitId)
  )))];
  if (kind === 'ordinary') traits = [];
  if (kind === 'favored') traits = traits.filter((id) => ORIGIN_TRAITS[id].tone !== 'negative');
  if (kind === 'harsh') traits = traits.filter((id) => ORIGIN_TRAITS[id].tone !== 'positive');
  traits = traits.slice(0, 2);
  // 外观和属性说明不会改变合同安全边界；缺项时降级到标准出生外观。
  const validatedAppearance = validateAppearance(value.appearance);
  const appearance = validatedAppearance ?? { ...DEFAULT_APPEARANCE };
  const rawTraitReasons = Array.isArray(value.traitReasons) ? value.traitReasons : [];
  const traitReasons = Array.isArray(value.traitReasons)
    ? rawTraitReasons
      .map((entry) => readText(entry, 6, 60))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, traits.length)
    : undefined;
  const storyLength = story.join('').length;
  const storyText = story.join('；');
  const breaksFatherCanon = /(?:父亲|爸爸|他爸).{0,10}(?:去世|死了|死亡|下葬|遗像|不在人世)|(?:去世|死了|死亡).{0,10}(?:父亲|爸爸|他爸)/.test(storyText);
  const jumpsPastChildhood = /他(?:长大后|成年后|大学毕业后|结婚后|参加工作后|退休后)|他在(?:中年|晚年)/.test(storyText);
  const replacesHeroWithSecondPerson = storyText.includes('你') && !storyText.includes('他');
  const inventsFormalName = /(?:正式姓名|户口本|名字叫|名叫).{0,8}[\p{Script=Han}]{2,4}/u.test(storyText);
  if (strict && (
    !nickname
    || !nicknameReason
    // 段数与字数放宽（原来 3–4 段 / 96–260 字）：这类展示性门槛一卡就是整份重掷，
    // 开局要多等一整轮 AI。真正不能让步的是下面几条正典红线。
    || rawStory.length < 2
    || rawStory.length > 5
    || story.length !== rawStory.length
    || storyLength < 60
    || storyLength > 320
    || breaksFatherCanon
    || jumpsPastChildhood
    || replacesHeroWithSecondPerson
    || inventsFormalName
  )) return null;
  // 旧存档只守“能显示、能结算”的技术底线。
  if (!title || !kind || story.length < 1 || storyLength < 24) return null;
  return {
    title,
    ...(nickname && (strict || isPersonLikeNickname(nickname)) ? { nickname } : {}),
    ...(nicknameReason ? { nicknameReason } : {}),
    story,
    kind,
    traits,
    traitReasons,
    appearance,
    source: 'gpt',
  };
}

function validateAppearance(value: unknown): AppearanceDNA | null {
  if (!isRecord(value)) return null;
  const pick = <T extends string>(entry: unknown, allowed: readonly T[]): T | null => (
    typeof entry === 'string' && allowed.includes(entry as T) ? entry as T : null
  );
  const skinTone = pick(value.skinTone, ['paper', 'warm', 'cool', 'brown', 'deep'] as const);
  const faceShape = pick(value.faceShape, ['round', 'long', 'square', 'narrow'] as const);
  const eyeShape = pick(value.eyeShape, ['wide', 'downcast', 'narrow', 'uneven'] as const);
  const hairStyle = pick(value.hairStyle, ['soft_short', 'buzz', 'side_part', 'curly', 'messy'] as const);
  const hairColor = pick(value.hairColor, ['ink', 'brown', 'soft_black'] as const);
  const posture = pick(value.posture, ['upright', 'guarded', 'alert', 'slight_slouch'] as const);
  const outfit = pick(value.outfit, ['undershirt', 'old_sweater', 'uniform_liner', 'plain_shirt'] as const);
  const feature = pick(value.feature, ['none', 'cheek_mole', 'freckles', 'brow_gap', 'uneven_brows'] as const);
  if (!skinTone || !faceShape || !eyeShape || !hairStyle || !hairColor || !posture || !outfit || !feature) return null;
  return {
    skinTone,
    faceShape,
    eyeShape,
    hairStyle,
    hairColor,
    stature: 'average',
    bodyBuild: 'average',
    posture,
    outfit,
    feature,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length >= min ? text.slice(0, max) : null;
}
