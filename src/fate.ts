import { FATE_ITEM_IDS, ITEM_IDS } from './relics';
import type {
  FateDirection,
  FateEvent,
  FateFactEffect,
  FateProfile,
  FateResponse,
  FateResponseEffect,
  FateScene,
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

const noFact = (): FateFactEffect => ({ kind: 'none', amount: 0, item: null });

const LOCAL_FATES: LocalFateBlueprint[] = [
  {
    ages: ['童年'], id: 'wrong-answer-read', title: '红叉比名字大', profile: '反噬',
    fact: '小学数学课上，老师站在教室讲台前念出他的错误答案，全班笑了几声，他只好盯着练习本上的红叉。',
    memoryId: 'answer_read_aloud', memoryText: '错误答案被当众念过',
    unavoidable: { kind: 'damage', amount: 4, item: null },
    swallow: response('把答案擦掉', '下一场开局储存攻击', 'store_volleys', { doubt: 1 }, '他把那一行擦到纸面起毛，下课时掌心还沾着一层橡皮屑。'),
    exhale: response('把本子合上', '攻击永久获得折返', 'returning_breath', { anger: 1 }, '他把练习本合上推回桌角，老师停了两秒，转身继续讲下一题。'),
  },
  {
    ages: ['童年'], id: 'uniform-too-small', title: '袖口又短了一截', profile: '交换',
    fact: '开学前的早晨，他在家中穿衣镜前试旧校服，最下面的纽扣已经扣不上，家里人说再穿一年就换。',
    memoryId: 'wore_small_clothes', memoryText: '穿过一件太小的衣服',
    unavoidable: { kind: 'lose_max_hp', amount: 2, item: null },
    swallow: response('把肚子收进去', '攻击变重，射速降低', 'heavy_breath', { greed: 1 }, '他吸着气扣好纽扣，走到楼下才敢慢慢呼出来。'),
    exhale: response('剪开袖口', '弹体分散并增加数量', 'scatter', { pride: 1 }, '家里人沿着袖口拆开两厘米缝线，他终于能把手腕伸直。'),
  },
  {
    ages: ['童年', '少年'], id: 'everyone-laughed', title: '他们都笑了', profile: '荒诞',
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
  'uniform-too-small': { time: '开学前的早晨', place: '家中穿衣镜前', people: '他和家里人' },
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

export function validateFateEvent(value: unknown, snapshot: LifeSnapshot): FateEvent | null {
  if (!isRecord(value)) return null;
  const id = readSlug(value.id, 3, 48);
  const title = readText(value.title, 2, 16);
  const fact = readText(value.fact, 8, 90);
  const scene = validateScene(value.scene);
  const profile = typeof value.profile === 'string' && FATE_PROFILES.includes(value.profile as FateProfile)
    ? value.profile as FateProfile : null;
  const memoryId = readSlug(value.memoryId, 3, 48);
  const memoryText = readText(value.memoryText, 4, 60);
  const unavoidable = validateFactEffect(value.unavoidable, snapshot);
  const swallow = validateResponse(value.swallow);
  const exhale = validateResponse(value.exhale);
  if (!id || !title || !fact || !scene || !profile || !memoryId || !memoryText || !unavoidable || !swallow || !exhale) return null;
  if (swallow.label === exhale.label || snapshot.recentEvents.includes(id)) return null;
  return { id, title, fact, scene, profile, memoryId, memoryText, unavoidable, swallow, exhale, source: 'gpt' };
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
  return time && place && people ? { time, place, people } : null;
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

function validateResponse(value: unknown): FateResponse | null {
  if (!isRecord(value)) return null;
  const label = readText(value.label, 2, 14);
  const hint = readText(value.hint, 3, 36);
  const effect = typeof value.effect === 'string' && FATE_RESPONSE_EFFECTS.includes(value.effect as FateResponseEffect)
    ? value.effect as FateResponseEffect : null;
  const result = readText(value.result, 6, 90);
  const poison = validatePoison(value.poison);
  const stats = validateStats(value.stats);
  if (!label || !hint || !effect || !result || !poison) return null;
  return { label, hint, effect, result, poison, stats };
}

export function validateFreeFateResponse(value: unknown): { direction: FateDirection; response: FateResponse } | null {
  if (!isRecord(value)) return null;
  const direction = value.direction === 'swallow' || value.direction === 'exhale' ? value.direction : null;
  const response = validateResponse(isRecord(value.response) ? value.response : value);
  if (!direction || !response) return null;
  return { direction, response };
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

function validateFactEffect(value: unknown, snapshot: LifeSnapshot): FateFactEffect | null {
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
    && !snapshot.items.some((entry) => entry.id === item)) {
    return { kind: 'gain_item', amount: 0, item };
  }
  return null;
}

function cloneEvent(event: FateEvent): FateEvent {
  return {
    ...event,
    scene: { ...event.scene },
    unavoidable: { ...event.unavoidable },
    swallow: { ...event.swallow, poison: { ...event.swallow.poison } },
    exhale: { ...event.exhale, poison: { ...event.exhale.poison } },
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
