import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, types, canon, plan, wiki, packageJson] = await Promise.all([
  read('src/game.ts'),
  read('src/types.ts'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
  read('package.json'),
]);

const errors = [];
let checks = 0;
const requireToken = (source, token, message) => {
  checks += 1;
  if (!source.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ['const QUEUE_SCREEN_CALL_INTERVAL = 5.2;', '叫号屏叫号间隔不是 5.2 秒'],
  ['const QUEUE_SCREEN_ARRIVAL_RADIUS = 48;', '叫号屏抵达半径不是 48px'],
  ['const QUEUE_SCREEN_WRONG_WAY_MULTIPLIER = 0.58;', '叫号走反减速不是 ×0.58'],
  ["'queue-screen': { name: '叫号屏', hp: 44, speed: 0, radius: 19, damage: 0 }", '叫号屏恢复了追击或接触伤害'],
  ['this.relocateQueueScreen(enemy);', '叫号屏抵达后没有换门'],
  ['if (inputToward < QUEUE_SCREEN_WRONG_WAY_DOT)', '叫号屏没有判定背离方向'],
  ['this.queueWrongWaySlowTimer = Math.max(this.queueWrongWaySlowTimer, 0.18);', '叫号走反没有刷新减速'],
  ['speed *= QUEUE_SCREEN_WRONG_WAY_MULTIPLIER;', '叫号走反没有进入移速结算'],
] ) requireToken(game, token, message);

const queueStart = game.indexOf("if (enemy.type === 'queue-screen') {");
const queueEnd = game.indexOf("if (enemy.type === 'others-family') {", queueStart);
const queueBranch = queueStart >= 0 && queueEnd > queueStart ? game.slice(queueStart, queueEnd) : '';
checks += 1;
if (!queueBranch || !queueBranch.includes('continue;') || queueBranch.includes('hurtHero(')) {
  errors.push('叫号屏分支仍会按普通怪追击或接触扣血');
}

for (const [token, message] of [
  ['const OTHERS_FAMILY_SLOW_RADIUS = 66;', '家属经过域不是 66px'],
  ['const OTHERS_FAMILY_SLOW_MULTIPLIER = 0.72;', '家属经过减速不是 ×0.72'],
  ['enemy.x += Math.cos(enemy.attackAngle) * enemy.speed * pace * dt;', '家属没有沿固定角度掠过'],
  ['this.familySlowTimer = Math.max(this.familySlowTimer, 0.18);', '家属经过没有刷新减速'],
  ['this.restartFamilyPass(enemy);', '家属穿过后不会从场外重开'],
  ['speed *= OTHERS_FAMILY_SLOW_MULTIPLIER;', '家属经过没有进入移速结算'],
] ) requireToken(game, token, message);

const familyStart = game.indexOf("if (enemy.type === 'others-family') {");
const familyEnd = game.indexOf("if (enemy.type === 'missed-call') {", familyStart);
const familyBranch = familyStart >= 0 && familyEnd > familyStart ? game.slice(familyStart, familyEnd) : '';
checks += 1;
if (!familyBranch || !familyBranch.includes('continue;') || familyBranch.includes('hurtHero(')) {
  errors.push('别人的家属仍会直追或接触攻击');
}

for (const [token, message] of [
  ['const IV_STAND_SPEED_INTERVAL = 10;', '输液架升档间隔不是 10 秒'],
  ['const IV_STAND_BASE_SPEED = 14;', '输液架基础速度不是 14'],
  ['const IV_STAND_SPEED_STEP = 7;', '输液架每档速度增量不是 7'],
  ['const IV_STAND_STAGE_CAP = 2;', '输液架章节上限不是 2'],
  ["'iv-stand': { name: '输液架', hp: 90, speed: 14, radius: 16, damage: 6 }", '输液架基础属性与百科不一致'],
  ['enemy.speed = IV_STAND_BASE_SPEED + nextTier * IV_STAND_SPEED_STEP;', '输液架没有按纯时间更新速度'],
  ['this.encounterIndex === 5 && this.ivStandsSpawnedThisStage === 0 && this.battleTime >= 8', '暮年第 8 秒没有输液架保底'],
  ['this.ivStandsSpawnedThisStage >= IV_STAND_STAGE_CAP', '输液架随机池没有限制两只'],
  ["if (type === 'iv-stand' && this.encounterIndex === 5 && this.ivStandsSpawnedThisStage >= IV_STAND_STAGE_CAP) return;", '输液架生成入口没有限制两只'],
] ) requireToken(game, token, message);

const ivStart = game.indexOf("if (enemy.type === 'iv-stand') {", familyStart);
const ivEnd = game.indexOf('if (enemy.backstabber', ivStart);
const ivBranch = ivStart >= 0 && ivEnd > ivStart ? game.slice(ivStart, ivEnd) : '';
checks += 1;
if (!ivBranch || ivBranch.includes('heal') || ivBranch.includes('hp +=')) {
  errors.push('输液架仍保留自疗或缺少升档分支');
}

for (const [token, message] of [
  ['this.renderOldAgeEnemyFields();', '暮年机制特效没有进入世界渲染层'],
  ['private renderOldAgeEnemyFields(): void', '缺少暮年机制独立渲染方法'],
  ['经过 · 移速×0.72', '家属经过缺少夸张且明确的减速反馈'],
  ['十秒一档', '输液架高档位缺少时间压力反馈'],
  ["action === 'old-age-hazards'", '缺少确定性暮年审阅入口'],
  ["variant === 'iv-thirty-art'", '输液架缺少稳定冻结美术审阅态'],
  ['oldAge: {', '开发状态没有暴露暮年机制'],
  ['ivSpawnedThisStage: this.ivStandsSpawnedThisStage', '开发状态无法证明输液架数量上限'],
] ) requireToken(game, token, message);

const renderStart = game.indexOf('private renderOldAgeEnemyFields(): void');
const renderEnd = game.indexOf('private visibleInLampLight(', renderStart);
const renderSource = renderStart >= 0 && renderEnd > renderStart ? game.slice(renderStart, renderEnd) : '';
checks += 1;
if (!renderSource || renderSource.includes('createPattern(') || renderSource.includes('ctx.filter')) {
  errors.push('暮年机制表现缺失或退化成移动网格/全局滤镜');
}

for (const [token, message] of [
  ['queueCalled?: boolean;', '敌人类型缺少叫号状态'],
  ['queueArrivals?: number;', '敌人类型缺少换门次数'],
  ['ivSpeedTier?: number;', '敌人类型缺少输液架速度档位'],
] ) requireToken(types, token, message);

for (const asset of [
  'src/assets/enemies/queue-screen.png',
  'src/assets/enemies/others-family.png',
  'src/assets/enemies/iv-stand.png',
]) {
  checks += 1;
  try {
    await access(resolve(process.cwd(), asset));
  } catch {
    errors.push(`正式 Image2 敌人资源缺失: ${asset}`);
  }
}

for (const [token, message] of [
  ['**暮年走廊三敌合同（2026-07-26）**', '正典没有暮年三敌运行时合同'],
  ['每 **5.2 秒**亮起 42 号', '正典没有叫号精确时序'],
  ['进入 **66px** 经过域', '正典没有家属精确减速域'],
  ['全章最多 **2 只**', '正典没有输液架章节上限'],
  ['不使用移动网格、贯屏装饰线或全局滤镜', '正典没有锁定夸张非网格表现'],
] ) requireToken(canon, token, message);

for (const [token, message] of [
  ['### 29.6 暮年走廊时间压力机制审阅（2026-07-26）', '升级计划缺少本轮自审记录'],
  ['132 → 76.56（×0.58）', '升级计划没有叫号实机证据'],
  ['132 → 95.04（×0.72）', '升级计划没有家属实机证据'],
  ['14／21／35', '升级计划没有输液架三档实测'],
  ['mobile-horde-time-pressure.png', '升级计划没有暮年混战截图证据'],
] ) requireToken(plan, token, message);

for (const [token, message] of [
  ['42号亮起后走到48px内无伤换门', '百科没有叫号抵达定义'],
  ['主角移速 ×0.58', '百科没有叫号走反倍率'],
  ['进入66px经过域时主角移速 ×0.72', '百科没有家属经过倍率'],
  ['每10秒固定 +7', '百科没有输液架升档数值'],
  ['最多2只，不会自疗', '百科没有输液架数量与无自疗定义'],
] ) requireToken(wiki, token, message);
checks += 1;
if (wiki.includes('每5.8秒续滴，恢复8%最大生命')) errors.push('百科仍残留输液架自疗旧案');

requireToken(packageJson, '"validate:old-age-enemies"', 'package.json 没有暮年专项门禁');

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  queueScreen: '5.2s call -> 48px arrival -> relocate/no damage; wrong-way move x0.58',
  othersFamily: 'fixed pass -> 66px move x0.72 -> no attack -> restart outside',
  ivStand: 'speed 14 + 7 every 10s; guaranteed at 8s; max 2; contact damage 6; no heal',
  art: 'approved Image2 assets + stackable local rings/echoes/streaks; no moving grid/filter',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
