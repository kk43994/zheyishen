import type { EnemyType, FateEvent, ItemId, LifeAge, LifeSnapshot } from './types';

export const LIFE_AGES = ['童年', '少年', '青年', '成年', '中年', '晚年'] as const satisfies readonly LifeAge[];

export interface LifeStageCanon {
  readonly age: LifeAge;
  readonly chapter: string;
  readonly focus: string;
  readonly bossType: EnemyType | null;
  readonly bossName: string;
  readonly bossMeaning: string;
  readonly eliteType: EnemyType;
  readonly eliteName: string;
  readonly eliteMeaning: string;
  readonly enemyPool: readonly EnemyType[];
}

/**
 * The single narrative timeline used by combat, AI snapshots and validation.
 * Internal enemy ids remain stable even when the authored display identity changes.
 */
export const LIFE_STAGE_CANON: readonly LifeStageCanon[] = [
  {
    age: '童年', chapter: '童年 · 床底王国', focus: '还没上学的年纪：家里、柜子与床底的黑、害怕与第一次独自承受；父亲只做不说的习惯在这里埋下前因。学校要到少年章才开始。',
    bossType: 'closet-dark', bossName: '没人相信的怪物', bossMeaning: '孩子确实害怕，但大人只证明床底什么都没有。',
    eliteType: 'coat-rack', eliteName: '立在墙角的衣架', eliteMeaning: '衣服还没穿上，尺寸已经先替身体作了决定。',
    enemyPool: ['cry-moth', 'fear', 'hunger-shadow'],
  },
  {
    age: '少年', chapter: '少年 · 千眼教室', focus: '小学到高中的学生时代：上学、课堂、排名、同伴目光、羞耻与身份模仿。学校只属于这一章。',
    bossType: 'silent-father', bossName: '沉默的父亲', bossMeaning: '他把受过的委屈变成命令；雨里那双湿鞋也是真的。',
    eliteType: 'uniform-answer', eliteName: '统一答案', eliteMeaning: '标准答案开始替所有人决定他是谁。',
    enemyPool: ['red-mark', 'whisper', 'others-paper', 'sign-here'],
  },
  {
    age: '青年', chapter: '青年 · 齿轮车站', focus: '毕业、求职、初入职场、租房、通勤与第一次独立生活。',
    bossType: 'praise-chair', bossName: '你很优秀', bossMeaning: '夸奖把更多工作留在他的椅背上，却没有留下位置。',
    eliteType: 'last-bus', eliteName: '末班车', eliteMeaning: '他总觉得别人比自己早一步上车。',
    enemyPool: ['id-scanner', 'missed-bus', 'task-simple', 'task-revise', 'task-deadline', 'task-sync'],
  },
  {
    age: '成年', chapter: '成年 · 屋檐下的家', focus: '工作、亲密关系、照护父母与建立自己的家；他开始发现自己继承了父亲的沉默。',
    bossType: 'ringing-phone', bossName: '响个不停', bossMeaning: '父亲说没事，工作说马上，家里说等你；电话没有给他喘气的空。',
    eliteType: 'wet-shoes', eliteName: '还没干的那双鞋', eliteMeaning: '他刚从雨里回来，下一件事已经在门口等。',
    enemyPool: ['missed-call', 'debt', 'silence', 'desk-lamp', 'reheated-pot'],
  },
  {
    age: '中年', chapter: '中年 · 没有关灯的办公室', focus: '职业压力、裁员风险、家庭责任、父母衰老、体检与账单。',
    bossType: 'debt-collector', bossName: '上门催收', bossMeaning: '过去推迟的账同时找到现在的地址。',
    eliteType: 'whose-box', eliteName: '谁的纸箱', eliteMeaning: '工位被收进纸箱以后，连名字都像贴错了人。',
    enemyPool: ['debt', 'badge-thief', 'whisper', 'meeting-door', 'checkup-report'],
  },
  {
    age: '晚年', chapter: '暮年 · 白发荒原', focus: '退休、疾病、照护、记忆、告别，以及最终放下这一口气。',
    bossType: 'lamp-keeper', bossName: '收灯人', bossMeaning: '它不是反派，只负责把走马灯一盏盏关掉。',
    eliteType: 'revolving-lantern', eliteName: '走马灯', eliteMeaning: '旧日的人和事重新亮起，越舍不得关，围上来的影子越多。',
    enemyPool: ['forgetter', 'empty-chair', 'debt', 'queue-screen', 'others-family', 'iv-stand'],
  },
] as const;

type NarrativeCheck = { valid: true } | { valid: false; reason: string };

const CURRENT_LIFE_FORBIDDEN: Record<LifeAge, ReadonlyArray<readonly [RegExp, string]>> = {
  童年: [
    [/(?:妻子|老婆|女儿|儿子|自己的孩子|老伴|结婚|离婚|相亲)/, '童年不能拥有成年后的伴侣或子女关系'],
    [/(?:上班|下班|工资|公司|办公室|主管|同事|裁员|房东|租房|网贷|体检|退休|养老金)/, '童年不能以成年人身份工作、租房或退休'],
    // 正典：童年是还没上学的年纪，学校整条线属于少年章。
    [/(?:上学|放学|上课|下课|学校|校门|教室|课桌|同学|同桌|老师|班主任|作业|考试|课本|书包|校服|铃声)/, '童年还没有上学，学校要到少年章才开始'],
  ],
  少年: [
    [/(?:妻子|老婆|女儿|儿子|自己的孩子|老伴|结婚|离婚|相亲)/, '少年不能拥有成年后的伴侣或子女关系'],
    [/(?:工资|公司|办公室|主管|同事|裁员|房东|租房|网贷|体检|退休|养老金)/, '少年不能以成年人身份工作、租房或退休'],
  ],
  青年: [
    [/(?:女儿|儿子|家长群|老伴|孙子|孙女|退休|养老金|遗照)/, '青年章节不提前进入育儿、退休或暮年关系'],
    [/(?:他的班主任|他的同桌|早自习|值日老师|老师.{0,8}(?:罚他|批评他)|他穿着校服上课)/, '青年不能重新成为中学生'],
  ],
  成年: [
    [/(?:他的班主任|他的同桌|早自习|值日老师|老师.{0,8}(?:罚他|批评他)|他穿着校服上课)/, '成年不能重新成为中学生'],
    [/(?:老伴|孙子|孙女|养老金|退休仪式|遗照)/, '成年章节不提前进入暮年身份'],
  ],
  中年: [
    [/(?:他的班主任|他的同桌|早自习|值日老师|老师.{0,8}(?:罚他|批评他)|他穿着校服上课)/, '中年不能重新成为中学生'],
    [/(?:他刚毕业|第一次找工作|大学宿舍|实习生入职|录用短信)/, '中年不能退回青年初入社会的身份'],
  ],
  晚年: [
    [/(?:他的班主任|他的同桌|早自习|值日老师|老师.{0,8}(?:罚他|批评他)|他穿着校服上课)/, '晚年不能重新成为中学生'],
    [/(?:他刚毕业|第一次找工作|大学宿舍|实习生入职|录用短信|主管让他加班)/, '晚年不能退回青年或在职中年的身份'],
  ],
};

/** Rejects current-scene age contradictions before a model reviewer can overlook them. */
export function validateFateAgeCore(
  event: Pick<FateEvent, 'fact' | 'scene'>,
  snapshot: Pick<LifeSnapshot, 'age' | 'chapterIndex'>,
): NarrativeCheck {
  const canon = LIFE_STAGE_CANON[snapshot.chapterIndex];
  if (!canon || canon.age !== snapshot.age) {
    return { valid: false, reason: `章节索引与年龄不一致：${snapshot.chapterIndex}/${snapshot.age}` };
  }
  const text = `${event.scene.time}；${event.scene.place}；${event.scene.people}；${event.fact}`;
  for (const [pattern, reason] of CURRENT_LIFE_FORBIDDEN[snapshot.age]) {
    if (pattern.test(text)) return { valid: false, reason };
  }
  const schoolPlace = /(?:小学|中学|高中|教室|学校|校门)/.test(event.scene.place);
  // 学校只属于少年章：童年还没上学，青年以后再进校门必须交代成年人身份。
  if (snapshot.chapterIndex === 0 && schoolPlace) {
    return { valid: false, reason: '童年还没有上学，事件不能发生在学校' };
  }
  if (snapshot.chapterIndex >= 2 && schoolPlace && !/(?:孩子|女儿|儿子|学生家长|接孩子)/.test(text)) {
    return { valid: false, reason: `${snapshot.age}事件发生在学校时，必须说明主角为何以成年人身份在那里` };
  }
  const workPlace = /(?:公司|办公室|工位|会议室|厂里|工地)/.test(event.scene.place);
  if (snapshot.chapterIndex <= 1 && workPlace && !/(?:父亲|母亲|家里人|参观|接人)/.test(text)) {
    return { valid: false, reason: `${snapshot.age}事件不能把主角写成在职成年人` };
  }
  return { valid: true };
}

export function validateFateAge(event: FateEvent, snapshot: LifeSnapshot): NarrativeCheck {
  const core = validateFateAgeCore(event, snapshot);
  if (!core.valid) return core;
  const responseText = `${event.swallow.label}；${event.swallow.result}；${event.exhale.label}；${event.exhale.result}`;
  for (const [pattern, reason] of CURRENT_LIFE_FORBIDDEN[snapshot.age]) {
    if (pattern.test(responseText)) return { valid: false, reason: `回应越过年龄：${reason}` };
  }
  return { valid: true };
}

const FATE_ITEM_MIN_STAGE: Partial<Record<ItemId, number>> = {
  'bleach-powder': 1,
  'five-ha': 1,
  'red-packet': 1,
  'abstract-lv10': 1,
  'summer-run': 1,
  'card-binder': 1,
  'only-key': 2,
  'first-salary': 2,
  'white-bottle': 2,
  'held-pee': 2,
  'three-day-visible': 2,
  'read-3am': 2,
  'takeout-3am': 2,
  'auto-renew': 2,
  'mineral-water': 2,
  'shared-powerbank': 2,
  'hair-in-takeout': 2,
  'unwashed-pillow': 2,
  'gym-card': 2,
  'streak-1847': 2,
  'goodnight-2h': 2,
  'one-more-game': 2,
};

export function isFateItemAgeAppropriate(id: ItemId, chapterIndex: number): boolean {
  return chapterIndex >= (FATE_ITEM_MIN_STAGE[id] ?? 0);
}

export function assertStageNarrativeRoster(
  stages: ReadonlyArray<{ chapter: string; pool: readonly EnemyType[]; bossType?: EnemyType; eliteType: EnemyType }>,
): void {
  if (stages.length !== LIFE_STAGE_CANON.length) {
    throw new Error(`stage canon mismatch: expected ${LIFE_STAGE_CANON.length}, got ${stages.length}`);
  }
  stages.forEach((stage, index) => {
    const canon = LIFE_STAGE_CANON[index]!;
    if (stage.chapter !== canon.chapter) throw new Error(`chapter mismatch at ${index}: ${stage.chapter}`);
    if ((stage.bossType ?? null) !== canon.bossType && canon.bossType !== 'lamp-keeper') {
      throw new Error(`boss age mismatch at ${canon.age}: ${stage.bossType ?? 'none'}`);
    }
    if (stage.eliteType !== canon.eliteType) {
      throw new Error(`elite age mismatch at ${canon.age}: ${stage.eliteType}`);
    }
    const unexpected = stage.pool.filter((enemy) => !canon.enemyPool.includes(enemy));
    if (unexpected.length) throw new Error(`enemy age mismatch at ${canon.age}: ${unexpected.join(',')}`);
  });
}
