import { FATE_ITEM_IDS, ITEM_IDS } from './relics';
import type {
  FateDirection,
  FateEvent,
  FateFactEffect,
  FateProfile,
  FateResponse,
  FateResponseEffect,
  FateStatKey,
  ItemId,
  LifeSnapshot,
  PoisonKey,
  PoisonVector,
} from './types';

interface LocalFateBlueprint extends Omit<FateEvent, 'source'> {
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
    fact: '老师把你的错误答案念给全班听，笑声已经发生了。',
    memoryId: 'answer_read_aloud', memoryText: '错误答案被当众念过',
    unavoidable: { kind: 'damage', amount: 4, item: null },
    swallow: response('把答案擦掉', '下一场开局储存攻击', 'store_volleys', { doubt: 1 }, '纸被擦薄了，那道红叉却留在了手上。'),
    exhale: response('把本子推回去', '攻击永久获得折返', 'returning_breath', { anger: 1 }, '本子越过桌缝，像一句终于没有咽回去的话。'),
  },
  {
    ages: ['童年'], id: 'uniform-too-small', title: '袖口又短了一截', profile: '交换',
    fact: '家里说这件衣服还能再穿一年，纽扣已经扣不上了。',
    memoryId: 'wore_small_clothes', memoryText: '穿过一件太小的衣服',
    unavoidable: { kind: 'lose_max_hp', amount: 2, item: null },
    swallow: response('把肚子收进去', '攻击变重，射速降低', 'heavy_breath', { greed: 1 }, '你学会缩小自己，好让旧东西继续有用。'),
    exhale: response('剪开袖口', '弹体分散并增加数量', 'scatter', { pride: 1 }, '线头露了出来，手终于能够伸直。'),
  },
  {
    ages: ['童年', '少年'], id: 'everyone-laughed', title: '他们都笑了', profile: '荒诞',
    fact: '你还不知道哪里好笑，自己的嘴角已经被所有目光推了上去。',
    memoryId: 'laughed_with_them', memoryText: '在不知道原因时跟着笑过',
    unavoidable: noFact(),
    swallow: response('也跟着笑', '以后每战首次受伤延后', 'delay_pain', { delusion: 1 }, '笑声把疼痛包住，决定晚一点再还给你。'),
    exhale: response('问哪里好笑', '攻击间隔永久缩短', 'haste', { pride: 1 }, '笑声停了半拍。你第一次听见自己的声音。'),
  },
  {
    ages: ['少年'], id: 'letter-read-out', title: '信被念了出来', profile: '反噬',
    fact: '那封没有署名的信在教室后排传了一圈，每个人都替你认识了它。',
    memoryId: 'letter_read_out', memoryText: '一封信被别人读过',
    unavoidable: { kind: 'damage', amount: 5, item: null },
    swallow: response('说不是写给我的', '获得护盾', 'guard', { delusion: 1, doubt: 1 }, '你保住了表情，信上的字却开始往身体里渗。'),
    exhale: response('把信拿回来', '攻击获得追踪', 'focus', { anger: 1 }, '纸回到了手里，所有目光也跟了过来。'),
  },
  {
    ages: ['少年'], id: 'hair-must-be-black', title: '明天染回去', profile: '交换',
    fact: '校门口的人指着你的头发，说它不应该以这个颜色出现。',
    memoryId: 'hair_ordered_back', memoryText: '被要求把头发变回正确颜色',
    unavoidable: { kind: 'lose_coins', amount: 1, item: null },
    swallow: response('今晚洗掉', '恢复少量生命', 'heal', { doubt: 1 }, '水槽里留下颜色，你重新变得容易通过。'),
    exhale: response('就这样进去', '攻击间隔永久缩短', 'haste', { pride: 1 }, '那一点颜色先于名字走进了教室。'),
  },
  {
    ages: ['青年'], id: 'landlord-changed-lock', title: '钥匙打不开了', profile: '反噬',
    fact: '房东提前换了锁，你的东西还在门里面。',
    memoryId: 'locked_out', memoryText: '被关在自己租住的门外',
    unavoidable: { kind: 'lose_coins', amount: 2, item: null },
    swallow: response('在楼道坐一晚', '获得护盾', 'guard', { doubt: 1 }, '楼道灯灭了三次，你开始把门外也叫作住处。'),
    exhale: response('把电话打到底', '攻击永久获得折返', 'returning_breath', { anger: 1 }, '每一句没人接的话都沿原路撞了回去。'),
  },
  {
    ages: ['青年', '成年'], id: 'contract-missing-page', title: '合同少了一页', profile: '诱惑',
    fact: '需要签名的位置都在，写着代价的那一页不见了。',
    memoryId: 'signed_missing_page', memoryText: '见过一份少了一页的合同',
    unavoidable: noFact(),
    swallow: response('先签了再说', '用最大生命换强力攻击', 'trade_max_hp', { greed: 1, doubt: 1 }, '名字落下去的时候，未来先被借走了一点。'),
    exhale: response('让他把那页找来', '攻击集中追踪', 'focus', { pride: 1 }, '办公室安静下来，仿佛缺页本身是你的错。'),
  },
  {
    ages: ['成年'], id: 'father-fell', title: '电话那头摔了一跤', profile: '交换',
    fact: '父亲已经住进医院，电话打来时事情早已发生。',
    memoryId: 'father_fell', memoryText: '父亲住过一次医院',
    unavoidable: { kind: 'damage', amount: 6, item: null },
    swallow: response('说我马上回去', '下一场开局储存攻击', 'store_volleys', { delusion: 1 }, '你接过他没有说出口的重量，像接过一件旧雨衣。'),
    exhale: response('问为什么不早说', '伤害折返并提高', 'returning_breath', { anger: 1 }, '责怪先抵达病房，担心跟在它后面。'),
  },
  {
    ages: ['成年'], id: 'child-did-not-return', title: '今晚不回来了', profile: '沉默',
    fact: '孩子发来六个字，餐桌上已经多摆了一副碗筷。',
    memoryId: 'child_not_home', memoryText: '等过一顿没有回来吃的饭',
    unavoidable: noFact(),
    swallow: response('把饭留在锅里', '恢复生命', 'heal', { delusion: 1 }, '锅里的热气越来越少，灯一直没有关。'),
    exhale: response('回一句你忙吧', '获得少量零钱', 'gain_coins', { pride: 1 }, '体面地结束对话，也体面地吃完两个人的饭。'),
  },
  {
    ages: ['中年'], id: 'name-on-list', title: '名单上有你的名字', profile: '反噬',
    fact: '会议结束以后，所有人都绕开了你的工位。',
    memoryId: 'lost_job', memoryText: '名字出现在裁员名单上',
    unavoidable: { kind: 'lose_coins', amount: 3, item: null },
    swallow: response('先别告诉家里', '以后每战首次受伤延后', 'delay_pain', { doubt: 1 }, '你把纸箱放在车里，像它只是一次普通采购。'),
    exhale: response('问清楚补偿', '获得零钱', 'gain_coins', { greed: 1 }, '你把每一年换算成数字，发现数字比回忆容易开口。'),
  },
  {
    ages: ['中年', '晚年'], id: 'report-arrow-up', title: '报告多了一行', profile: '反噬',
    fact: '体检报告上的箭头已经向上，医生还没有开始解释。',
    memoryId: 'report_arrow', memoryText: '看见过体检报告上的向上箭头',
    unavoidable: { kind: 'lose_max_hp', amount: 4, item: null },
    swallow: response('把报告折起来', '以后每战首次受伤延后', 'delay_pain', { doubt: 1 }, '纸被折成口袋大小，箭头仍然朝着身体里面。'),
    exhale: response('把那个电话打出去', '生命越低，攻击越强', 'release_pain', {}, '电话接通以前，你先承认自己也会害怕。'),
  },
  {
    ages: ['晚年'], id: 'photo-one-less', title: '照片少了一个人', profile: '沉默',
    fact: '重新数到第三遍，照片里仍然少了一个人。',
    memoryId: 'photo_missing_one', memoryText: '反复数过一张少了人的照片',
    unavoidable: { kind: 'damage', amount: 7, item: null },
    swallow: response('把照片放回内袋', '下一场开局储存攻击', 'store_volleys', { delusion: 1 }, '照片贴近心口，像这样就还能听见另一次呼吸。'),
    exhale: response('把他的名字说出来', '攻击集中追踪', 'focus', {}, '名字离开嘴以后没有消失，只是在房间里多待了一会儿。'),
  },
  {
    ages: ['童年', '少年', '青年', '成年', '中年', '晚年'], id: 'two-small-coins', title: '口袋里多了两枚', profile: '微光',
    fact: '你不知道是谁放进去的，两枚硬币已经在口袋里互相碰了一路。',
    memoryId: 'found_two_coins', memoryText: '在口袋里发现过两枚硬币',
    unavoidable: { kind: 'gain_coins', amount: 2, item: null },
    swallow: response('先留着', '额外获得1枚零钱', 'gain_coins', { greed: 1 }, '你反复确认它们还在，直到掌心留下两个圆。'),
    exhale: response('买点东西分掉', '恢复生命', 'heal', {}, '硬币很快不见了，嘴里留下短暂的甜。'),
  },
];

export function generateLocalFateEvent(snapshot: LifeSnapshot, random: () => number): FateEvent {
  if (snapshot.items.length > 0 && random() < 0.28) return makeWornItemEvent(snapshot, random);
  const recent = new Set(snapshot.recentEvents);
  let candidates = LOCAL_FATES.filter((event) => event.ages.includes(snapshot.age) && !recent.has(event.id));
  if (!candidates.length) candidates = LOCAL_FATES.filter((event) => event.ages.includes(snapshot.age));
  if (!candidates.length) candidates = LOCAL_FATES;
  const picked = candidates[Math.floor(random() * candidates.length)] ?? LOCAL_FATES[0]!;
  const { ages: _ages, ...event } = picked;
  return cloneEvent({ ...event, source: 'local' });
}

export function validateFateEvent(value: unknown, snapshot: LifeSnapshot): FateEvent | null {
  if (!isRecord(value)) return null;
  const id = readSlug(value.id, 3, 48);
  const title = readText(value.title, 2, 16);
  const fact = readText(value.fact, 8, 90);
  const profile = typeof value.profile === 'string' && FATE_PROFILES.includes(value.profile as FateProfile)
    ? value.profile as FateProfile : null;
  const memoryId = readSlug(value.memoryId, 3, 48);
  const memoryText = readText(value.memoryText, 4, 60);
  const unavoidable = validateFactEffect(value.unavoidable, snapshot);
  const swallow = validateResponse(value.swallow);
  const exhale = validateResponse(value.exhale);
  if (!id || !title || !fact || !profile || !memoryId || !memoryText || !unavoidable || !swallow || !exhale) return null;
  if (swallow.label === exhale.label || snapshot.recentEvents.includes(id)) return null;
  return { id, title, fact, profile, memoryId, memoryText, unavoidable, swallow, exhale, source: 'gpt' };
}

function makeWornItemEvent(snapshot: LifeSnapshot, random: () => number): FateEvent {
  const item = snapshot.items[Math.floor(random() * snapshot.items.length)] ?? snapshot.items[0]!;
  const suffix = snapshot.chapterIndex.toString(36);
  return {
    id: `worn_${item.id}_${suffix}`,
    title: '它在半夜响了一声',
    fact: `穿在身上的《${item.name}》忽然发出声音。你已经记不起它上一次安静是什么时候。`,
    profile: '荒诞',
    memoryId: `heard_${item.id}_${suffix}`,
    memoryText: `听见《${item.name}》在半夜发出声音`,
    unavoidable: noFact(),
    swallow: response('把它按在胸口', '攻击变重并提高伤害', 'heavy_breath', { delusion: 1 }, `它安静下来，重量却顺着手掌留进了身体。`),
    exhale: response('让它继续响', '攻击分散并增加数量', 'scatter', { pride: 1 }, `声音被揉进《一口气》，每一枚弹体都带着它的回声。`),
    source: 'local',
  };
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
