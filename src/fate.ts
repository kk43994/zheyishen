import { FATE_ITEM_IDS, getItem, ITEM_IDS } from './relics';
import { validateFateAge } from './life-stage';
import type {
  FateDirection,
  FateEvent,
  FateFactEffect,
  FateProfile,
  FateReward,
  FateResidueCarrier,
  FateResidueIntensity,
  FateResidueMotif,
  FateResponse,
  FateResponseEffect,
  FateScene,
  FateSettlement,
  FateSettlementPrimary,
  FateStatKey,
  ItemId,
  LifeSnapshot,
  PoisonKey,
  PoisonVector,
} from './types';

interface LocalFateBlueprint extends Omit<FateEvent, 'source' | 'scene'> {
  ages: string[];
}

export const FATE_RESPONSE_EFFECTS: FateResponseEffect[] = [
  'none',
  'store_volleys',
  'returning_breath',
  'guard',
  'focus',
  'scatter',
  'haste',
  'heavy_breath',
  'delay_pain',
  'release_pain',
  'gain_coins',
  'heal',
  'trade_max_hp',
];

export const FATE_PROFILES: FateProfile[] = ['微光', '交换', '诱惑', '反噬', '荒诞', '沉默'];
export const POISON_KEYS: PoisonKey[] = ['greed', 'anger', 'delusion', 'pride', 'doubt'];

interface FateMechanicRecipe {
  id: string;
  carrier: FateResidueCarrier[];
  motif: FateResidueMotif[];
  intensity: FateResidueIntensity;
  primary: FateSettlementPrimary;
  effect: FateResponseEffect;
  stats?: Partial<Record<FateStatKey, number>>;
  hint: string;
}

export interface FateCandidateItemCatalogEntry {
  id: ItemId;
  name: string;
  summary: string;
  acquisition: string;
}

const FATE_RECIPE_CARRIERS: FateResidueCarrier[] = ['item', 'body', 'habit', 'resource', 'worn_item', 'memory', 'none'];
const FATE_RECIPE_MOTIFS: FateResidueMotif[] = [
  'guard', 'focus', 'scatter', 'haste', 'weight', 'reach', 'echo', 'store',
  'return', 'release', 'debt', 'wound', 'recovery', 'possession', 'loss',
];
const FATE_RECIPE_INTENSITIES: FateResidueIntensity[] = ['normal', 'wild', 'rule_break'];

const FATE_EFFECT_HINTS: Record<Exclude<FateResponseEffect, 'none'>, string> = {
  store_volleys: '下一战储存攻击',
  returning_breath: '弹体开始折返',
  guard: '下一战开局获得护盾',
  focus: '弹体开始追踪',
  scatter: '弹体增加，单发稍弱',
  haste: '攻击间隔缩短',
  heavy_breath: '伤害提高，弹速降低',
  delay_pain: '下一次受伤延后',
  release_pain: '生命越低，伤害越高',
  gain_coins: '获得零钱',
  heal: '恢复生命',
  trade_max_hp: '最大生命换取强力攻击',
};

const FATE_MECHANIC_RECIPES: FateMechanicRecipe[] = [
  {
    id: 'memory_only', carrier: ['memory', 'none'], motif: ['echo', 'release', 'loss'],
    intensity: 'normal', primary: 'memory', effect: 'none', hint: '只留下记忆',
  },
  {
    id: 'guarded_breath', carrier: ['body', 'habit', 'worn_item'], motif: ['guard'],
    intensity: 'normal', primary: 'effect', effect: 'guard', hint: '下一战开局获得护盾',
  },
  {
    id: 'focused_breath', carrier: ['body', 'habit', 'worn_item'], motif: ['focus', 'reach'],
    intensity: 'normal', primary: 'effect', effect: 'focus', hint: '弹体开始追踪',
  },
  {
    id: 'scattered_breath', carrier: ['body', 'habit', 'worn_item'], motif: ['scatter'],
    intensity: 'normal', primary: 'effect', effect: 'scatter', hint: '弹体增加，单发稍弱',
  },
  {
    id: 'hurried_breath', carrier: ['body', 'habit'], motif: ['haste'],
    intensity: 'normal', primary: 'effect', effect: 'haste', hint: '攻击间隔缩短',
  },
  {
    id: 'heavy_breath', carrier: ['body', 'habit', 'worn_item'], motif: ['weight'],
    intensity: 'normal', primary: 'effect', effect: 'heavy_breath', hint: '伤害提高，弹速降低',
  },
  {
    id: 'stored_breath', carrier: ['habit', 'worn_item'], motif: ['store'],
    intensity: 'normal', primary: 'effect', effect: 'store_volleys', hint: '下一战储存攻击',
  },
  {
    id: 'returning_breath', carrier: ['habit', 'worn_item'], motif: ['return', 'echo'],
    intensity: 'normal', primary: 'effect', effect: 'returning_breath', hint: '弹体开始折返',
  },
  {
    id: 'delayed_wound', carrier: ['body', 'habit'], motif: ['wound', 'debt'],
    intensity: 'normal', primary: 'effect', effect: 'delay_pain', hint: '下一次受伤延后',
  },
  {
    id: 'released_wound', carrier: ['body', 'habit'], motif: ['release', 'wound'],
    intensity: 'normal', primary: 'effect', effect: 'release_pain', hint: '生命越低，伤害越高',
  },
  {
    id: 'recovered_breath', carrier: ['body', 'resource'], motif: ['recovery'],
    intensity: 'normal', primary: 'resource', effect: 'heal', hint: '恢复生命',
  },
  {
    id: 'returned_change', carrier: ['resource'], motif: ['recovery', 'possession'],
    intensity: 'normal', primary: 'resource', effect: 'gain_coins', hint: '获得零钱',
  },
  {
    id: 'body_on_credit', carrier: ['body', 'resource'], motif: ['debt', 'loss'],
    intensity: 'wild', primary: 'effect', effect: 'trade_max_hp', hint: '最大生命换取强力攻击',
  },
  {
    id: 'one_giant_breath', carrier: ['body', 'habit', 'worn_item'], motif: ['weight'],
    intensity: 'wild', primary: 'stats', effect: 'heavy_breath',
    stats: { damage: 100, fireRate: -45, width: 80, projSpeed: -35 },
    hint: '伤害翻倍，弹体巨大，但攻击极慢',
  },
  {
    id: 'needle_breath', carrier: ['body', 'habit', 'worn_item'], motif: ['focus', 'reach'],
    intensity: 'wild', primary: 'stats', effect: 'focus',
    stats: { damage: 60, range: 45, width: -55 },
    hint: '伤害与射程暴涨，弹体收成细线',
  },
  {
    id: 'swarm_breath', carrier: ['body', 'habit', 'worn_item'], motif: ['scatter', 'haste'],
    intensity: 'wild', primary: 'stats', effect: 'scatter',
    stats: { damage: -50, fireRate: 55, width: -35 },
    hint: '攻击密如雨点，但每一发都很轻',
  },
  {
    id: 'rooted_wall', carrier: ['body', 'habit', 'worn_item'], motif: ['guard', 'weight'],
    intensity: 'wild', primary: 'stats', effect: 'guard',
    stats: { damage: 55, width: 60, moveSpeed: -45 },
    hint: '像墙一样沉重，攻击变宽，脚步几乎钉住',
  },
  {
    id: 'returning_debt', carrier: ['habit', 'worn_item'], motif: ['return', 'debt'],
    intensity: 'rule_break', primary: 'effect', effect: 'returning_breath',
    stats: { range: 70, projSpeed: -40 },
    hint: '每一发都远远离开，再慢慢折回来',
  },
  {
    id: 'held_then_burst', carrier: ['habit', 'worn_item'], motif: ['store', 'release'],
    intensity: 'rule_break', primary: 'effect', effect: 'store_volleys',
    stats: { damage: 45, fireRate: -25 },
    hint: '先把攻击存住，再一次吐出来',
  },
];

const PROFILE_RECIPE_INTENSITIES: Record<FateProfile, FateResidueIntensity[]> = {
  微光: ['normal'],
  交换: ['normal', 'wild'],
  诱惑: ['wild', 'rule_break'],
  反噬: ['normal', 'wild', 'rule_break'],
  荒诞: ['wild', 'rule_break'],
  沉默: ['normal'],
};

function fateItemAcquisitionHint(id: ItemId): string {
  const item = getItem(id);
  const accountState = item.slot === 'shadow'
    || /(会员|朋友圈|已读|账号|报告|验证|聊天|连续记录|头像|链接)/.test(item.name);
  return accountState
    ? '归属状态：result必须写明开通、续费、绑定、保存、收到或记入账号'
    : '实物转移：result必须写明递给、交给、收下、带走、穿戴或放进口袋';
}

export function buildFateCandidateItemCatalog(snapshot: LifeSnapshot): FateCandidateItemCatalogEntry[] {
  return snapshot.fateItemCandidates.map((id) => {
    const item = getItem(id);
    return {
      id,
      name: item.name,
      summary: item.summary,
      acquisition: fateItemAcquisitionHint(id),
    };
  });
}

export function buildFateMechanicBudget(snapshot: LifeSnapshot, profile: FateProfile, fact?: string): unknown {
  const allowed = new Set(PROFILE_RECIPE_INTENSITIES[profile]);
  const recipes = FATE_MECHANIC_RECIPES
    .filter((recipe) => recipe.id === 'memory_only' || allowed.has(recipe.intensity))
    .map((recipe) => ({
      recipeId: recipe.id,
      carrier: recipe.carrier,
      motif: recipe.motif,
      intensity: recipe.intensity,
      outcome: recipe.hint,
    }));
  const itemRecipes = buildFateCandidateItemCatalog(snapshot)
    .filter((item) => !fact || fact.includes(item.name))
    .map((item) => {
      return {
        recipeId: `keep_item:${item.id}`,
        carrier: ['item'],
        motif: ['possession'],
        intensity: 'normal',
        outcome: `获得道具「${item.name}」`,
        candidateItemId: item.id,
        itemName: item.name,
        itemSummary: item.summary,
        acquisition: item.acquisition,
      };
    });
  return {
    rule: '每个回应只能选择一个recipeId；evidence必须逐字出现在该回应result中',
    evidenceRules: {
      habit: 'evidence本身必须含“以后/从此/每次/反复/一直/练成/习惯/继续/总是”之一',
      body: 'evidence必须点名主角的身体部位或呼吸/气息/疼痛；result必须含以后/从此/一直/仍/留下/变得/练成/再也/开始之一，明确这是持续变化',
      worn_item: 'evidence必须写明snapshot现有穿戴物发生裂、断、折、磨、缝、穿戴或继续保留',
      resource: 'evidence必须点名钱款、硬币、费用、抵扣、余额、治疗、受伤或生命账目',
      item: '必须遵守该候选的acquisition，且fact和result都出现完整itemName',
      memory: '没有以上直接残留时必须选择memory_only',
    },
    recipes: [...recipes, ...itemRecipes],
  };
}

export function buildFreeFateMechanicBudget(
  snapshot: LifeSnapshot,
  profile: FateProfile,
  fact: string,
  playerText: string,
): unknown {
  const budget = buildFateMechanicBudget(snapshot, profile, fact) as {
    rule: string;
    evidenceRules: Record<string, string>;
    recipes: Array<{
      recipeId: string;
      carrier: FateResidueCarrier[];
      motif: FateResidueMotif[];
      intensity: FateResidueIntensity;
      outcome: string;
      candidateItemId?: ItemId;
    }>;
  };
  const recentRecipes = new Set(snapshot.recentFateRecipes?.slice(-3) ?? []);
  const recipes = budget.recipes.filter((recipe) => {
    if (recipe.recipeId === 'memory_only' || recipe.recipeId.startsWith('keep_item:')) return true;
    return !recentRecipes.has(recipe.recipeId);
  });
  const mechanicalRecipes = recipes.filter((recipe) => recipe.recipeId !== 'memory_only');
  let varietyHash = snapshot.runSeed >>> 0;
  for (const char of `${fact}；${playerText}`) {
    varietyHash = Math.imul(varietyHash ^ char.charCodeAt(0), 0x45d9f3b) >>> 0;
  }
  const preferredRecipeId = mechanicalRecipes.length
    ? mechanicalRecipes[varietyHash % mechanicalRecipes.length]!.recipeId
    : 'memory_only';
  return {
    ...budget,
    rule: `${budget.rule}；亲口回应只能从本次实际开放的recipes中选择，最近已兑现配方不会再次开放`,
    contextRule: `属性、战斗机制、道具和记忆都可以兑现。属性或机制必须由同一现场的具体动作产生身体变化、穿戴物变化或明确持续习惯；道具必须已在fact现场并发生归属转移。接不上因果就选memory_only。玩家原话是「${playerText.slice(0, 24)}」`,
    preferredRecipeId,
    recentRecipes: [...recentRecipes],
    recipes,
  };
}

const noFact = (): FateFactEffect => ({ kind: 'none', amount: 0, item: null });

const LOCAL_FATES: LocalFateBlueprint[] = [
  {
    ages: ['少年'], id: 'wrong-answer-read', title: '红叉比名字大', profile: '反噬',
    fact: '小学数学课上，老师站在教室讲台前念出他的错误答案，全班笑了几声，他只好盯着练习本上的红叉。',
    memoryId: 'answer_read_aloud', memoryText: '错误答案被当众念过',
    unavoidable: { kind: 'damage', amount: 4, item: null },
    swallow: response('把答案擦掉', '下一场开局储存攻击', 'store_volleys', { doubt: 1 }, '他把那一行擦到纸面起毛，下课时掌心还沾着一层橡皮屑。'),
    exhale: response('把本子合上', '攻击永久获得折返', 'returning_breath', { anger: 1 }, '他把练习本合上推回桌角，老师停了两秒，转身继续讲下一题。'),
  },
  {
    ages: ['童年'], id: 'uniform-too-small', title: '袖口又短了一截', profile: '交换',
    fact: '一个冬天的早晨，他在家中穿衣镜前套上去年的旧毛衣，袖口已经露出一截手腕，家里人把毛衣下摆重新往下抻了抻。',
    memoryId: 'wore_small_clothes', memoryText: '穿过一件太小的衣服',
    unavoidable: { kind: 'lose_max_hp', amount: 2, item: null },
    swallow: response('把肚子收进去', '攻击变重，射速降低', 'heavy_breath', { greed: 1 }, '他吸着气扣好纽扣，走到楼下才敢慢慢呼出来。'),
    exhale: response('剪开袖口', '弹体分散并增加数量', 'scatter', { pride: 1 }, '家里人沿着袖口拆开两厘米缝线，他终于能把手腕伸直。'),
  },
  {
    ages: ['少年'], id: 'everyone-laughed', title: '他们都笑了', profile: '荒诞',
    fact: '一次课间，他在学校教室里被几名同学围着笑，直到有人指向他被剪坏的刘海，他才知道他们在笑什么。',
    memoryId: 'laughed_with_them', memoryText: '在不知道原因时跟着笑过',
    unavoidable: noFact(),
    swallow: response('也跟着笑', '以后每战首次受伤延后', 'delay_pain', { delusion: 1 }, '他跟着笑了两声，坐回座位后才用课本挡住额头。'),
    exhale: response('问哪里好笑', '攻击间隔永久缩短', 'haste', { pride: 1 }, '他问完以后，围着的同学安静了一会儿，有人低头回了自己的座位。'),
  },
  {
    ages: ['少年'], id: 'letter-read-out', title: '信被念了出来', profile: '反噬',
    fact: '午休快结束时，一名同学在教室最后一排捡到他没送出的信，当着周围同学念了开头两行。',
    memoryId: 'letter_read_out', memoryText: '一封信被别人读过',
    unavoidable: { kind: 'damage', amount: 5, item: null },
    swallow: response('说不是写给我的', '获得护盾', 'guard', { delusion: 1, doubt: 1 }, '他低头说信不是自己的，念信的人把纸压在桌角，没有继续往下读。'),
    exhale: response('把信拿回来', '攻击获得追踪', 'focus', { anger: 1 }, '他伸手拿回信折进课本，周围的人看了几秒，预备铃正好响了。'),
  },
  {
    ages: ['少年'], id: 'hair-must-be-black', title: '明天染回去', profile: '交换',
    fact: '周一早上，他在学校门口被值日老师拦下；老师指着他新染的头发，要求第二天改回黑色。',
    memoryId: 'hair_ordered_back', memoryText: '被要求把头发变回正确颜色',
    unavoidable: { kind: 'lose_coins', amount: 1, item: null },
    swallow: response('今晚染回去', '恢复少量生命', 'heal', { doubt: 1 }, '他放学买了最便宜的黑色染膏，晚上把洗手池冲了三遍。'),
    exhale: response('先这样进去', '攻击间隔永久缩短', 'haste', { pride: 1 }, '他答应明天处理，值日老师记下班级和姓名，才让他进校门。'),
  },
  {
    ages: ['青年'], id: 'landlord-changed-lock', title: '钥匙打不开了', profile: '反噬',
    fact: '下班后的晚上，他在出租屋门外发现钥匙打不开，房东在电话里承认下午换了锁，他的行李还在屋里。',
    memoryId: 'locked_out', memoryText: '被关在自己租住的门外',
    unavoidable: { kind: 'lose_coins', amount: 2, item: null },
    swallow: response('在楼道等一晚', '获得护盾', 'guard', { doubt: 1 }, '他靠着行李箱坐到凌晨，声控灯灭了又亮，房东一直没有回来。'),
    exhale: response('继续打电话', '攻击永久获得折返', 'returning_breath', { anger: 1 }, '他连续打了七通电话，最后房东让中介送来一把新钥匙。'),
  },
  {
    ages: ['青年', '成年'], id: 'contract-missing-page', title: '合同少了一页', profile: '诱惑',
    fact: '入职签约当天，他在公司会议室翻到合同页码从二跳到四，递合同的人仍催他先在最后一页签名。',
    memoryId: 'signed_missing_page', memoryText: '见过一份少了一页的合同',
    unavoidable: noFact(),
    swallow: response('先签了再说', '用最大生命换强力攻击', 'trade_max_hp', { greed: 1, doubt: 1 }, '他在末页签下名字，后来收到的扫描件里依然没有第三页。'),
    exhale: response('把第三页找来', '攻击集中追踪', 'focus', { pride: 1 }, '他把合同推回去，递合同的人沉默着去打印机旁重新装订。'),
  },
  {
    ages: ['成年'], id: 'father-fell', title: '电话那头摔了一跤', profile: '交换',
    fact: '一个工作日下午，他在公司走廊接到医院电话，护士说父亲在家摔倒后已经办完住院，家属需要尽快过去。',
    memoryId: 'father_fell', memoryText: '父亲住过一次医院',
    unavoidable: { kind: 'damage', amount: 6, item: null },
    swallow: response('说我马上过去', '下一场开局储存攻击', 'store_volleys', { delusion: 1 }, '他请完假跑进电梯，门合上时才发现电脑还亮在工位上。'),
    exhale: response('问为什么不早说', '伤害折返并提高', 'returning_breath', { anger: 1 }, '他先在电话里追问了两句，挂断后还是叫车去了医院。'),
  },
  {
    ages: ['成年'], id: 'child-did-not-return', title: '今晚不回来了', profile: '沉默',
    fact: '晚饭已经凉时，他坐在家里的饭桌旁收到孩子的消息：“今晚不回来了。”桌上仍多摆着一副碗筷。',
    memoryId: 'child_not_home', memoryText: '等过一顿没有回来吃的饭',
    unavoidable: noFact(),
    swallow: response('把饭留在锅里', '恢复生命', 'heal', { delusion: 1 }, '他把菜重新盖好放进冰箱，直到睡前也没有再收到消息。'),
    exhale: response('回一句你忙吧', '获得少量零钱', 'gain_coins', { pride: 1 }, '他回完消息收起多余的碗筷，一个人把已经凉掉的饭吃完。'),
  },
  {
    ages: ['中年'], id: 'name-on-list', title: '名单上有你的名字', profile: '反噬',
    fact: '部门会议结束后，主管在办公室投影上公布裁员名单，他的名字排在第三行，同事散会时都绕开了他的工位。',
    memoryId: 'lost_job', memoryText: '名字出现在裁员名单上',
    unavoidable: { kind: 'lose_coins', amount: 3, item: null },
    swallow: response('先别告诉家里', '以后每战首次受伤延后', 'delay_pain', { doubt: 1 }, '他把工位用品装进纸箱放到车里，回家前先把离职通知折进了包底。'),
    exhale: response('问清楚补偿', '获得零钱', 'gain_coins', { greed: 1 }, '他当场让主管和人事说明补偿标准，并把答复记进手机备忘录。'),
  },
  {
    ages: ['中年', '晚年'], id: 'report-arrow-up', title: '报告多了一行', profile: '反噬',
    fact: '体检复诊当天，他在医院诊室把报告递给医生，报告上一项指标标着向上箭头，医生让他先坐下。',
    memoryId: 'report_arrow', memoryText: '看见过体检报告上的向上箭头',
    unavoidable: { kind: 'lose_max_hp', amount: 4, item: null },
    swallow: response('把报告折起来', '以后每战首次受伤延后', 'delay_pain', { doubt: 1 }, '他听完医嘱把报告折进外套口袋，回家后没有把它拿出来。'),
    exhale: response('给家里打电话', '生命越低，攻击越强', 'release_pain', {}, '他走出诊室给家里打电话，照着报告把复查日期念了一遍。'),
  },
  {
    ages: ['晚年'], id: 'photo-one-less', title: '照片少了一个人', profile: '沉默',
    fact: '一个睡不着的夜里，他在家里翻到去年生日的合照，照片里没有住院的老伴；女儿电话里说那天老伴没能出院。',
    memoryId: 'photo_missing_one', memoryText: '反复数过一张少了人的照片',
    unavoidable: { kind: 'damage', amount: 7, item: null },
    swallow: response('把照片放进内袋', '下一场开局储存攻击', 'store_volleys', { delusion: 1 }, '他把照片放进睡衣内袋，关灯后又隔着布料摸了一次照片边角。'),
    exhale: response('给女儿回电话', '攻击集中追踪', 'focus', {}, '他给女儿回拨电话，说下次去医院时想再拍一张全家福。'),
  },
  {
    ages: ['童年', '少年', '青年', '成年', '中年', '晚年'], id: 'two-small-coins', title: '口袋里多了两枚', profile: '微光',
    fact: '傍晚回家路上，他在便利店门口被店员叫住；店员把刚才漏找的两枚硬币放进他手里。',
    memoryId: 'found_two_coins', memoryText: '在口袋里发现过两枚硬币',
    unavoidable: { kind: 'gain_coins', amount: 2, item: null },
    swallow: response('放进口袋', '额外获得1枚零钱', 'gain_coins', { greed: 1 }, '他道谢后把硬币放进口袋，走到路口又伸手确认了一次。'),
    exhale: response('买颗糖分掉', '恢复生命', 'heal', {}, '他转身用硬币买了两颗糖，留一颗给自己，另一颗递给门口等人的孩子。'),
  },
];

const LOCAL_FATE_SCENES: Record<string, FateScene> = {
  'wrong-answer-read': { time: '小学的一节课上', place: '教室讲台前', people: '他、老师和全班同学' },
  'uniform-too-small': { time: '一个冬天的早晨', place: '家中穿衣镜前', people: '他和家里人' },
  'everyone-laughed': { time: '一次课间', place: '学校教室里', people: '他和周围的同学' },
  'letter-read-out': { time: '午休快结束时', place: '教室最后一排', people: '他和传信的同学' },
  'hair-must-be-black': { time: '周一上学时', place: '学校门口', people: '他和值日老师' },
  'landlord-changed-lock': { time: '下班后的晚上', place: '出租屋门外', people: '他、房东和电话那头的人' },
  'contract-missing-page': { time: '入职签约当天', place: '公司会议室', people: '他和递合同的人' },
  'father-fell': { time: '一个工作日下午', place: '公司走廊', people: '他和医院护士' },
  'child-did-not-return': { time: '晚饭已经凉时', place: '家里的饭桌旁', people: '他和没有回家的孩子' },
  'name-on-list': { time: '部门会议结束后', place: '没有关灯的办公室', people: '他、主管和同事' },
  'report-arrow-up': { time: '体检复诊当天', place: '医院诊室', people: '他和医生' },
  'photo-one-less': { time: '一个睡不着的夜里', place: '家中旧相册前', people: '他和电话里的女儿' },
  'two-small-coins': { time: '傍晚回家路上', place: '便利店门口', people: '他和便利店员' },
};

export function generateLocalFateEvent(snapshot: LifeSnapshot, random: () => number): FateEvent {
  const recent = new Set(snapshot.recentEvents);
  let candidates = LOCAL_FATES.filter((event) => event.ages.includes(snapshot.age) && !recent.has(event.id));
  if (!candidates.length) candidates = LOCAL_FATES.filter((event) => event.ages.includes(snapshot.age));
  if (!candidates.length) candidates = LOCAL_FATES;
  const picked = candidates[Math.floor(random() * candidates.length)] ?? LOCAL_FATES[0]!;
  const { ages: _ages, ...event } = picked;
  return cloneEvent({
    ...event,
    scene: LOCAL_FATE_SCENES[event.id] ?? defaultFateScene(snapshot),
    source: 'local',
  });
}

export interface FateValidationOptions {
  /** 读取已结算回执/当前命运牌时，允许命运中获得的道具已在玩家物品栏。 */
  allowAlreadyOwnedFateItem?: boolean;
  /** 新生成的 AI 回应必须携带可编译的剧情残留；旧存档和人工本地牌可走兼容字段。 */
  requireResidue?: boolean;
}

export function validateFateEvent(
  value: unknown,
  snapshot: LifeSnapshot,
  options: FateValidationOptions = {},
): FateEvent | null {
  if (!isRecord(value)) return null;
  const id = readSlug(value.id, 3, 48);
  const title = readText(value.title, 2, 16);
  const fact = readText(value.fact, 8, 120);
  const scene = validateScene(value.scene);
  const profile = typeof value.profile === 'string' && FATE_PROFILES.includes(value.profile as FateProfile)
    ? value.profile as FateProfile : null;
  const memoryId = readSlug(value.memoryId, 3, 48);
  const memoryText = readText(value.memoryText, 4, 80);
  const unavoidable = validateFactEffect(value.unavoidable, snapshot, options);
  if (!id || !title || !fact || !scene || !profile || !memoryId || !memoryText || !unavoidable) return null;
  const swallow = validateResponse(value.swallow, snapshot, profile, options, fact);
  const exhale = validateResponse(value.exhale, snapshot, profile, options, fact);
  if (!swallow || !exhale) return null;
  if (swallow.label === exhale.label || snapshot.recentEvents.includes(id)) return null;
  const source: FateEvent['source'] = value.source === 'local' ? 'local' : 'gpt';
  const event = { id, title, fact, scene, profile, memoryId, memoryText, unavoidable, swallow, exhale, source };
  return validateFateAge(event, snapshot).valid ? event : null;
}

function defaultFateScene(snapshot: LifeSnapshot): FateScene {
  const times = ['熄灯后的晚上', '一个上学日上午', '一个工作日傍晚', '一天晚饭前后', '一个加班的夜里', '一次复诊后的下午'];
  const places = ['家中卧室', '学校教室', '车站与出租屋之间', '家里的饭桌旁', '办公室', '病房走廊'];
  const people = ['他和家里人', '他、同学和老师', '他、同龄人和办事的人', '他和家人', '他、同事和主管', '他、家人和医护人员'];
  const index = Math.min(places.length - 1, Math.max(0, snapshot.chapterIndex));
  return {
    time: times[index] ?? `${snapshot.age}的一天`,
    place: places[index] ?? '这一段人生里',
    people: people[index] ?? '他和家里人',
  };
}

function validateScene(value: unknown): FateScene | null {
  if (!isRecord(value)) return null;
  const time = readText(value.time, 2, 18);
  const place = readText(value.place, 2, 24);
  const people = readText(value.people, 2, 28);
  const listedObject = people?.split(/[、，,和与]/).some((entry) =>
    /(?:柜机|屏幕|手机|电话|信封|情书|衣服|雨衣|照片|相框|纽扣|钥匙|药丸|工牌|书包|课桌|充电宝)$/.test(entry.trim()),
  );
  return time && place && people && people.includes('他') && !listedObject
    ? { time, place, people }
    : null;
}

function response(
  label: string,
  hint: string,
  effect: FateResponseEffect,
  poison: Partial<PoisonVector>,
  result: string,
): FateResponse {
  return { label, hint, effect, poison, result };
}

const FATE_STAT_KEYS: FateStatKey[] = ['damage', 'fireRate', 'range', 'width', 'moveSpeed', 'projSpeed'];

function validateStats(value: unknown): Partial<Record<FateStatKey, number>> | undefined {
  if (!isRecord(value)) return undefined;
  const stats: Partial<Record<FateStatKey, number>> = {};
  let total = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (!FATE_STAT_KEYS.includes(key as FateStatKey)) continue;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw === 0) continue;
    const clamped = Math.max(-15, Math.min(15, raw));
    stats[key as FateStatKey] = clamped;
    total += Math.abs(clamped);
  }
  const keys = Object.keys(stats);
  if (!keys.length || keys.length > 3 || total > 30) return undefined;
  return stats;
}

function statsRewardHint(stats: Partial<Record<FateStatKey, number>>): string {
  const labels: Record<FateStatKey, string> = {
    damage: '伤害',
    fireRate: '射速',
    range: '射程',
    width: '弹宽',
    moveSpeed: '移速',
    projSpeed: '弹速',
  };
  return (Object.entries(stats) as Array<[FateStatKey, number]>)
    .map(([key, amount]) => `${labels[key]}${amount > 0 ? '+' : ''}${amount}%`)
    .join(' · ');
}

function resultMentionsItem(result: string, itemId: ItemId): boolean {
  const name = getItem(itemId).name.trim();
  if (result.includes(name)) return true;
  const parts = name.split('的');
  const afterDe = parts[parts.length - 1]?.trim() ?? '';
  const suffix = name.length >= 4 ? name.slice(-2) : '';
  return [afterDe, suffix].some((token) => token.length >= 2 && result.includes(token));
}

function resultTransfersItemToHero(result: string, itemId: ItemId): boolean {
  if (!resultMentionsItem(result, itemId)) return false;
  const item = getItem(itemId);
  const accountState = item.slot === 'shadow'
    || /(会员|朋友圈|已读|账号|报告|验证|聊天|连续记录|头像|链接)/.test(item.name);
  if (accountState) {
    return /他(?:当场|随后|已经|终于|亲手)?(?:开通|续费|绑定|保存|收到|领取|记入|写入|加入.{0,4}账号)/.test(result)
      || /(?:他的|为他|给他).{0,10}(?:账号|会员|记录|页面)?.{0,6}(?:开通|续费|绑定|保存|记入|写入)(?:成功|完成|了|到)/.test(result);
  }
  return /(?:递给|递回|交给|交回|塞给|给了)他|他.{0,12}(?:收下|带走|拿走|收到|领取|装进|放进.{0,4}口袋|披上|戴上|穿上)/.test(result);
}

function resultRemovesItemFromHero(result: string, itemId: ItemId): boolean {
  return resultMentionsItem(result, itemId)
    && /他.{0,12}(?:递出|递还|交出|交还|交给|归还|退还|丢掉|扔掉|放弃|摘下|脱下|删除|解绑|注销)|(?:从他.{0,8}(?:手里|身上|口袋|账号).{0,8}(?:拿走|收走|删除))/.test(result);
}

function validateFreeReward(
  value: unknown,
  snapshot: LifeSnapshot,
  result: string,
): {
  reward: FateReward;
  hint: string;
  effect: FateResponseEffect;
  stats?: Partial<Record<FateStatKey, number>>;
  gainItemId?: ItemId;
  removeItemId?: ItemId;
  settlement: FateSettlement;
} | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;
  const evidence = result.slice(0, 60).trim();
  if (evidence.length < 4) return null;
  const baseSettlement = {
    version: 2 as const,
    evidence,
    intensity: 'normal' as const,
  };
  if (value.kind === 'none') {
    return {
      reward: { kind: 'none' },
      hint: '只留下记忆',
      effect: 'none',
      settlement: {
        ...baseSettlement,
        carrier: 'memory',
        motif: 'echo',
        recipeId: 'ai_reward:none',
        primary: 'memory',
      },
    };
  }
  if (value.kind === 'stats') {
    const stats = validateStats(value.stats);
    if (!stats) return null;
    return {
      reward: { kind: 'stats', stats },
      hint: statsRewardHint(stats),
      effect: 'none',
      stats,
      settlement: {
        ...baseSettlement,
        carrier: 'body',
        motif: 'echo',
        recipeId: `ai_reward:stats:${Object.keys(stats).sort().join('+')}`,
        primary: 'stats',
      },
    };
  }
  if (value.kind === 'effect') {
    const effect = typeof value.effect === 'string'
      && value.effect !== 'none'
      && FATE_RESPONSE_EFFECTS.includes(value.effect as FateResponseEffect)
      ? value.effect as Exclude<FateResponseEffect, 'none'>
      : null;
    if (!effect) return null;
    return {
      reward: { kind: 'effect', effect },
      hint: FATE_EFFECT_HINTS[effect],
      effect,
      settlement: {
        ...baseSettlement,
        carrier: 'memory',
        motif: 'echo',
        recipeId: `ai_reward:effect:${effect}`,
        primary: 'effect',
      },
    };
  }
  if (value.kind === 'gain_item') {
    const itemId = typeof value.itemId === 'string'
      && FATE_ITEM_IDS.includes(value.itemId as ItemId)
      && snapshot.fateItemCandidates.includes(value.itemId as ItemId)
      && !snapshot.items.some((item) => item.id === value.itemId)
      ? value.itemId as ItemId
      : null;
    // 奖励元数据不能覆盖现场事实：没有明确交给主角就降级为 none。
    if (!itemId || !resultTransfersItemToHero(result, itemId)) return null;
    return {
      reward: { kind: 'gain_item', itemId },
      hint: `获得道具「${getItem(itemId).name}」`,
      effect: 'none',
      gainItemId: itemId,
      settlement: {
        ...baseSettlement,
        carrier: 'item',
        motif: 'possession',
        recipeId: `ai_reward:gain_item:${itemId}`,
        primary: 'item',
        candidateItemId: itemId,
      },
    };
  }
  if (value.kind === 'remove_item') {
    const itemId = typeof value.itemId === 'string'
      && snapshot.items.some((item) => item.id === value.itemId)
      ? value.itemId as ItemId
      : null;
    if (!itemId || !resultRemovesItemFromHero(result, itemId)) return null;
    return {
      reward: { kind: 'remove_item', itemId },
      hint: `失去道具「${getItem(itemId).name}」`,
      effect: 'none',
      removeItemId: itemId,
      settlement: {
        ...baseSettlement,
        carrier: 'item',
        motif: 'loss',
        recipeId: `ai_reward:remove_item:${itemId}`,
        primary: 'item',
        candidateItemId: itemId,
      },
    };
  }
  return null;
}

function carrierHasConcreteEvidence(
  carrier: FateResidueCarrier,
  evidence: string,
  result: string,
  snapshot: LifeSnapshot,
  candidateItemId?: ItemId,
): boolean {
  if (carrier === 'memory' || carrier === 'none') return true;
  if (carrier === 'item') {
    if (!candidateItemId) return false;
    return resultTransfersItemToHero(result, candidateItemId);
  }
  if (carrier === 'resource') {
    return /(钱|零钱|硬币|金额|费用|付费|逾期费|退款|退回|找回|抵扣|余额|扣款|付款|账|治疗|休息|受伤|伤口|生命|医药费|住院)/.test(evidence);
  }
  if (carrier === 'worn_item') {
    return snapshot.items.some((item) => result.includes(item.name))
      && /(裂|断|折|磨|缝|戴|穿|系|贴|仍|继续|留下)/.test(evidence);
  }
  if (carrier === 'habit') return /(以后|从此|每次|反复|一直|练|习惯|继续|总是)/.test(evidence);
  if (carrier === 'body') {
    return /(呼吸|气息|喉|肺|眼|手|脚|腿|背|身体|伤|疼|血|步子|声音)/.test(evidence)
      && /(以后|从此|一直|仍|留下|变得|练成|再也|开始)/.test(result);
  }
  return false;
}

function validateSettlement(
  value: unknown,
  result: string,
  snapshot: LifeSnapshot,
  profile: FateProfile,
  options: FateValidationOptions,
  fact: string,
): {
  settlement: FateSettlement;
  effect: FateResponseEffect;
  stats?: Partial<Record<FateStatKey, number>>;
  gainItemId?: ItemId;
  hint: string;
} | null {
  if (!isRecord(value)) return null;
  const evidence = readText(value.evidence, 4, 60);
  const recipeId = typeof value.recipeId === 'string' && /^[a-z0-9_:-]{3,80}$/i.test(value.recipeId)
    ? value.recipeId
    : null;
  const carrier = typeof value.carrier === 'string' && FATE_RECIPE_CARRIERS.includes(value.carrier as FateResidueCarrier)
    ? value.carrier as FateResidueCarrier
    : null;
  const motif = typeof value.motif === 'string' && FATE_RECIPE_MOTIFS.includes(value.motif as FateResidueMotif)
    ? value.motif as FateResidueMotif
    : null;
  const intensity = typeof value.intensity === 'string' && FATE_RECIPE_INTENSITIES.includes(value.intensity as FateResidueIntensity)
    ? value.intensity as FateResidueIntensity
    : null;
  if (!evidence || !recipeId || !carrier || !motif || !intensity || !result.includes(evidence)) return null;
  const abstractMaterialEvidence = carrier !== 'memory' && carrier !== 'none'
    && /(勇敢|懦弱|难过|开心|选择面对|心里变|仿佛|似乎|明白了)/.test(evidence);

  if (recipeId.startsWith('keep_item:')) {
    const itemId = recipeId.slice('keep_item:'.length);
    const candidateItemId = typeof value.candidateItemId === 'string' ? value.candidateItemId : itemId;
    if (carrier !== 'item' || motif !== 'possession' || intensity !== 'normal'
      || !ITEM_IDS.includes(candidateItemId as ItemId)) return null;
    const typedItemId = candidateItemId as ItemId;
    const itemName = getItem(typedItemId).name;
    if (itemId !== typedItemId
      || !snapshot.fateItemCandidates.includes(typedItemId)
      || !fact.includes(itemName)
      || (!options.allowAlreadyOwnedFateItem && snapshot.items.some((item) => item.id === typedItemId))
      || !carrierHasConcreteEvidence(carrier, evidence, result, snapshot, typedItemId)) return null;
    return {
      settlement: {
        version: 2, evidence, carrier, motif, intensity, recipeId,
        primary: 'item', candidateItemId: typedItemId,
      },
      effect: 'none',
      gainItemId: typedItemId,
      hint: `获得道具「${getItem(typedItemId).name}」`,
    };
  }

  const recipe = FATE_MECHANIC_RECIPES.find((entry) => entry.id === recipeId);
  if (!recipe
    || recipe.intensity !== intensity
    || !recipe.carrier.includes(carrier)
    || !recipe.motif.includes(motif)
    || (recipe.id !== 'memory_only' && !PROFILE_RECIPE_INTENSITIES[profile].includes(intensity))) return null;
  if (recipe.id !== 'memory_only'
    && (abstractMaterialEvidence || !carrierHasConcreteEvidence(carrier, evidence, result, snapshot))) {
    return {
      settlement: {
        version: 2,
        evidence,
        carrier: 'memory',
        motif: 'echo',
        intensity: 'normal',
        recipeId: 'memory_only',
        primary: 'memory',
      },
      effect: 'none',
      hint: '只留下记忆',
    };
  }
  return {
    settlement: {
      version: 2, evidence, carrier, motif, intensity, recipeId, primary: recipe.primary,
    },
    effect: recipe.effect,
    stats: recipe.stats ? { ...recipe.stats } : undefined,
    hint: recipe.hint,
  };
}

function validateResponse(
  value: unknown,
  snapshot?: LifeSnapshot,
  profile?: FateProfile,
  options: FateValidationOptions = {},
  fact = '',
): FateResponse | null {
  if (!isRecord(value)) return null;
  const label = readText(value.label, 2, 14);
  const result = readText(value.result, 6, 90);
  const poison = validatePoison(value.poison);
  if (!label || !result || !poison) return null;

  const freeReward = snapshot ? validateFreeReward(value.reward, snapshot, result) : null;
  if (freeReward) {
    return {
      label,
      hint: freeReward.hint,
      effect: freeReward.effect,
      result,
      poison,
      stats: freeReward.stats,
      gainItemId: freeReward.gainItemId,
      removeItemId: freeReward.removeItemId,
      reward: freeReward.reward,
      settlement: freeReward.settlement,
    };
  }
  // AI 的现场文字与奖励元数据分开验收：奖励 kind、数值或道具 ID 写错时，
  // 只把这一项降成 none，不能连同已经合格的剧情和两个选择一起丢回本地保底。
  if (snapshot && Object.prototype.hasOwnProperty.call(value, 'reward')) {
    const noReward = validateFreeReward({ kind: 'none' }, snapshot, result);
    if (!noReward) return null;
    return {
      label,
      hint: noReward.hint,
      effect: noReward.effect,
      result,
      poison,
      reward: noReward.reward,
      settlement: noReward.settlement,
    };
  }

  const rawSettlement = value.residue ?? value.settlement;
  const compiled = snapshot && profile
    ? validateSettlement(rawSettlement, result, snapshot, profile, options, fact)
    : null;
  if (compiled) {
    return {
      label,
      hint: compiled.hint,
      effect: compiled.effect,
      result,
      poison,
      stats: compiled.stats,
      gainItemId: compiled.gainItemId,
      settlement: compiled.settlement,
    };
  }
  if (options.requireResidue) return null;

  const hint = readText(value.hint, 3, 36);
  const effect = typeof value.effect === 'string' && FATE_RESPONSE_EFFECTS.includes(value.effect as FateResponseEffect)
    ? value.effect as FateResponseEffect : null;
  const stats = validateStats(value.stats);
  const gainItemId = snapshot
    && typeof value.gainItemId === 'string'
    && FATE_ITEM_IDS.includes(value.gainItemId as ItemId)
    && snapshot.fateItemCandidates.includes(value.gainItemId as ItemId)
    && (options.allowAlreadyOwnedFateItem || !snapshot.items.some((item) => item.id === value.gainItemId))
    ? value.gainItemId as ItemId
    : undefined;
  if (!hint || !effect) return null;
  return { label, hint, effect, result, poison, stats, gainItemId };
}

export function validateFreeFateResponse(
  value: unknown,
  snapshot: LifeSnapshot,
  profile: FateProfile,
  fact: string,
): FateResponse | null {
  if (!isRecord(value)) return null;
  const source = isRecord(value.response) ? value.response : value;
  const compiled = validateResponse(
    source,
    snapshot,
    profile,
    { requireResidue: true },
    fact,
  );
  if (compiled) return compiled;

  // “亲口说”的首要承诺是让玩家自己的话得到一张真实回执。模型若把
  // residue 配方、枚举或证据写错，不能因此丢掉已经合格的现场文字；
  // 这里仅保留 AI 生成的 label/result/poison，并安全降级为无数值的记忆。
  if (!isRecord(source)) return null;
  const label = readText(source.label, 2, 14);
  const result = readText(source.result, 6, 90);
  const poison = validatePoison(source.poison);
  if (!label || !result || !poison) return null;
  const evidence = result.slice(0, 60).trim();
  if (evidence.length < 4) return null;
  return {
    label,
    hint: '只留下记忆',
    effect: 'none',
    result,
    poison,
    reward: { kind: 'none' },
    settlement: {
      version: 2,
      evidence,
      carrier: 'memory',
      motif: 'echo',
      intensity: 'normal',
      recipeId: 'memory_only',
      primary: 'memory',
    },
  };
}

function validatePoison(value: unknown): Partial<PoisonVector> | null {
  if (!isRecord(value)) return null;
  const result: Partial<PoisonVector> = {};
  for (const [key, amount] of Object.entries(value)) {
    if (!POISON_KEYS.includes(key as PoisonKey) || typeof amount !== 'number' || !Number.isInteger(amount) || amount < -1 || amount > 2) return null;
    if (amount !== 0) result[key as PoisonKey] = amount;
  }
  return Object.keys(result).length <= 2 ? result : null;
}

function validateFactEffect(
  value: unknown,
  snapshot: LifeSnapshot,
  options: FateValidationOptions,
): FateFactEffect | null {
  if (!isRecord(value) || typeof value.kind !== 'string' || typeof value.amount !== 'number' || !Number.isInteger(value.amount)) return null;
  const item = value.item === null ? null : typeof value.item === 'string' && ITEM_IDS.includes(value.item as ItemId) ? value.item as ItemId : undefined;
  if (item === undefined) return null;
  if (value.kind === 'none' && value.amount === 0 && item === null) return { kind: 'none', amount: 0, item: null };
  if (value.kind === 'damage' && between(value.amount, 1, 12) && item === null) return { kind: 'damage', amount: value.amount, item: null };
  if (value.kind === 'lose_coins' && between(value.amount, 1, 5) && item === null) return { kind: 'lose_coins', amount: value.amount, item: null };
  if (value.kind === 'gain_coins' && between(value.amount, 1, 5) && item === null) return { kind: 'gain_coins', amount: value.amount, item: null };
  if (value.kind === 'lose_max_hp' && between(value.amount, 1, 6) && item === null) return { kind: 'lose_max_hp', amount: value.amount, item: null };
  if (value.kind === 'gain_item' && value.amount === 0 && item !== null
    && FATE_ITEM_IDS.includes(item)
    && snapshot.fateItemCandidates.includes(item)
    && (options.allowAlreadyOwnedFateItem || !snapshot.items.some((entry) => entry.id === item))) {
    return { kind: 'gain_item', amount: 0, item };
  }
  return null;
}

function cloneEvent(event: FateEvent): FateEvent {
  const cloneResponse = (value: FateResponse): FateResponse => ({
    ...value,
    poison: { ...value.poison },
    stats: value.stats ? { ...value.stats } : undefined,
    reward: value.reward?.kind === 'stats'
      ? { ...value.reward, stats: { ...value.reward.stats } }
      : value.reward ? { ...value.reward } : undefined,
    settlement: value.settlement ? { ...value.settlement } : undefined,
  });
  return {
    ...event,
    scene: { ...event.scene },
    unavoidable: { ...event.unavoidable },
    swallow: cloneResponse(event.swallow),
    exhale: cloneResponse(event.exhale),
  };
}

function between(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length >= min && text.length <= max ? text : null;
}

function readSlug(value: unknown, min: number, max: number): string | null {
  const text = readText(value, min, max);
  return text && /^[a-z0-9_-]+$/i.test(text) ? text : null;
}
