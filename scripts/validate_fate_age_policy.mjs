import { readFile } from 'node:fs/promises';
import { LIFE_STAGE_CANON, isFateItemAgeAppropriate, validateFateAge } from '../src/life-stage.ts';

const attack = {
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

function snapshot(chapterIndex) {
  const stage = LIFE_STAGE_CANON[chapterIndex];
  return {
    runSeed: 20260728,
    chapterIndex,
    chapter: stage.chapter,
    age: stage.age,
    stageFocus: stage.focus,
    stageBossMeaning: stage.bossMeaning,
    hp: 80,
    maxHp: 80,
    coins: 4,
    items: [],
    attack,
    poisons: { greed: 0, anger: 0, delusion: 0, pride: 0, doubt: 0 },
    memories: [],
    recentEvents: [],
    fateItemCandidates: [],
    swallowCount: 0,
    exhaleCount: 0,
  };
}

const errors = [];
const schoolEvent = {
  id: 'age_policy_school_event',
  title: '红叉比名字大',
  fact: '周一上午，他在小学数学课上被老师叫到讲台前念出错误答案，全班同学听完笑了几声，他把练习本重新合上。',
  scene: { time: '周一上午', place: '小学教室讲台前', people: '他、老师和全班同学' },
  profile: '反噬',
  memoryId: 'age_policy_school_memory',
  memoryText: '错误答案在数学课上被念出',
  unavoidable: { kind: 'none', amount: 0, item: null },
  swallow: { label: '先合上本子', hint: '只留下记忆', effect: 'none', poison: {}, result: '他把练习本合上，等老师继续讲下一道题。' },
  exhale: { label: '问清哪一步', hint: '只留下记忆', effect: 'none', poison: {}, result: '他指着算式问错在哪一步，老师重新看了一遍。' },
  source: 'local',
};
if (validateFateAge(schoolEvent, snapshot(0)).valid) {
  errors.push('童年学校事件没有被硬校验拒绝');
}
if (!validateFateAge(schoolEvent, snapshot(1)).valid) {
  errors.push('同一学校事件在少年章被错误拒绝');
}

const prompts = await readFile('src/ai-prompts.ts', 'utf8');
const fateSource = await readFile('src/fate.ts', 'utf8');
if (!prompts.includes('童年是还没上学的年纪')) errors.push('AI 提示词没有锁定童年未入学正典');
if (prompts.includes('童年写家庭与小学')) errors.push('AI 提示词仍把小学写进童年');
if (!fateSource.includes("ages: ['少年'], id: 'wrong-answer-read'")) errors.push('小学红叉本地事件没有迁移到少年章');
if (!fateSource.includes('return validateFateAge(event, snapshot).valid ? event : null;')) {
  errors.push('统一命运牌入口没有调用年龄硬校验');
}
if (/ages: \['童年'(?:, '少年')?\][\s\S]{0,180}(?:小学|中学|高中|教室|学校|校门|老师|同学|校服)/.test(fateSource)) {
  errors.push('童年本地保底仍含学校身份');
}
if (isFateItemAgeAppropriate('loose-button', 0)) {
  errors.push('童年候选道具仍会抽到校服纽扣');
}
if (!isFateItemAgeAppropriate('loose-button', 1)) {
  errors.push('少年章没有开放校服纽扣候选');
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks: 10,
  policy: '童年未入学；少年小学至高中；所有 AI/本地/读档命运牌共用年龄硬校验',
  errors: [...new Set(errors)],
}, null, 2));

if (errors.length) process.exitCode = 1;
