import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const assetPaths = [
  'src/assets/enemies/last-bus.png',
  'src/assets/enemies/last-bus-hd.png',
  'src/assets/enemies/boss-skills-v1/last-bus-skills.png',
];
const [game, types, enemyPixel, canon, plan, wiki, packageJson, packageScript, ...assetStats] = await Promise.all([
  read('src/game.ts'),
  read('src/types.ts'),
  read('src/enemy-pixel.ts'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
  read('package.json'),
  read('scripts/package.sh'),
  ...assetPaths.map((path) => stat(resolve(process.cwd(), path))),
]);

const errors = [];
let checks = 0;
const requireToken = (source, token, message) => {
  checks += 1;
  if (!source.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ['const MISSED_BUS_REENTRY_DELAY = 1.8;', '错过的车画外等待不是 1.8 秒'],
  ['const MISSED_BUS_WINDUP = 0.62;', '错过的车预警不是 0.62 秒'],
  ['const MISSED_BUS_PASS_DURATION = 1.36;', '错过的车横穿时长不是 1.36 秒'],
  ['const MISSED_BUS_PASS_SPEED = 330;', '错过的车横穿速度不是 330px/s'],
  ['const MISSED_BUS_ENTRY_DISTANCE = 224;', '错过的车进场距离不是 224px'],
  ['const MISSED_BUS_BODY_HALF_LENGTH = 24;', '错过的车半车长不是 24px'],
  ['const MISSED_BUS_BODY_HALF_WIDTH = 22;', '错过的车车道半宽不是 22px'],
  ['const MISSED_BUS_LANE_HALF_SPAN = 240;', '错过的车可见车道长度未锁定'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ["if (enemy.type === 'missed-bus')", '错过的车没有独立更新分支'],
  ["enemy.attackKind === 'missed-bus-warn'", '错过的车没有预警状态'],
  ["enemy.attackKind = 'missed-bus-pass';", '预警结束没有进入横穿状态'],
  ['enemy.dashTimer = MISSED_BUS_PASS_DURATION;', '横穿状态没有共享持续时间'],
  ['enemy.dashTimer = (enemy.dashTimer ?? 0) + dt;', '冻结会错误吃掉剩余横穿路程'],
  ['enemy.dashTimer = (enemy.dashTimer ?? 0) + dt * (1 - slowPace);', '减速没有等比例延长横穿时长'],
  ['const travel = MISSED_BUS_PASS_SPEED * slowPace * dt;', '横穿移动没有共享速度'],
  ['along >= -MISSED_BUS_BODY_HALF_LENGTH', '碰撞没有覆盖车尾'],
  ['along <= travel + MISSED_BUS_BODY_HALF_LENGTH', '碰撞没有覆盖车头和本帧扫掠'],
  ['across <= MISSED_BUS_BODY_HALF_WIDTH', '碰撞没有共享车道半宽'],
  ['enemy.dashHit = true;', '横穿没有单次命中标记'],
  ["this.hurtHero(enemy.damage, `${enemy.name} · 横穿`)", '横穿没有实际造成伤害'],
  ['enemy.laneY = this.heroY;', '预警没有锁定主角当时所在车道'],
  ['const direction = (enemy.id + passIndex) % 2 === 0 ? 1 : -1;', '普通车没有左右交替进场'],
  ['enemy.x = this.heroX - direction * MISSED_BUS_ENTRY_DISTANCE;', '普通车没有从画外重新入场'],
  ['enemy.laneY = undefined;', '驶离后没有清除旧车道'],
  ['enemy.x = this.heroX + exitDirection * (MISSED_BUS_ENTRY_DISTANCE + 36);', '横穿结束没有回到当前镜头外'],
  ["if (enemy.type === 'last-bus')", '末班车小 Boss 独立状态机丢失'],
  ['const BUS_DASH_SPEED = 340;', '末班车冲锋速度被普通车覆盖'],
  ['const BUS_DASH_DURATION = 1.1;', '末班车冲锋时长被普通车覆盖'],
  ['(enemy.phase ?? 0) === 3 ? 1.7 : 0.75', '末班车疲惫易伤窗口丢失'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['this.renderYouthCommuteEnemyFields();', '青年车流表现没有接入世界渲染层'],
  ['private renderYouthCommuteEnemyFields(): void', '缺少青年车流独立渲染方法'],
  ['for (let echo = 10; echo >= 1; echo -= 1)', '普通车缺少十层车身残影'],
  ['for (let streak = 0; streak < 24; streak += 1)', '普通车缺少二十四条速度碎线'],
  ["echo % 3 === 0 ? '#b53e4b'", '车身残影缺少红色尾影层级'],
  ["ctx.fillText(`这班要走 · ${(enemy.windupTimer ?? 0).toFixed(1)}s`", '预警缺少车道倒计时'],
  ["ctx.fillText('错过的车'", '穿场缺少身份标签'],
  ["action === 'youth-commute-hazards'", '缺少青年车流确定性审阅入口'],
  ["variant === 'missed-hit'", '缺少车道内命中原子入口'],
  ["variant === 'missed-dodge'", '缺少离线闪避原子入口'],
  ["variant === 'missed-freeze'", '缺少冻结暂停路程原子入口'],
  ["variant === 'missed-slow'", '缺少减速延长路程原子入口'],
  ["variant === 'identity-compare-art'", '缺少普通车与小 Boss 同场身份对比'],
  ["variant === 'commute-horde-art'", '缺少七车冻结叠场'],
  ['youthCommute: {', '开发状态没有暴露青年车流机制'],
  ['missedBuses: this.enemies.filter', '开发状态没有暴露普通车阶段'],
  ['fatigueMultiplier: (enemy.phase ?? 0) === 3 ? 1.7 : 0.75', '开发状态没有暴露末班车疲惫倍率'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['laneY?: number;', '敌人状态缺少锁定车道'],
  ['lanePassIndex?: number;', '敌人状态缺少左右交替趟数'],
  ['dashHit?: boolean;', '敌人状态缺少单趟命中标记'],
] ) requireToken(types, token, message);

for (const [token, message] of [
  ["'missed-bus': 'last-bus'", '普通错过的车没有映射 64px 正式图集'],
  ["'last-bus': 'last-bus-hd'", '末班车小 Boss 没有映射高清图集'],
  ["'last-bus-hd': 144", '末班车小 Boss 显示尺寸不是 144px'],
  ["'last-bus': 64", '普通错过的车显示尺寸不是 64px'],
] ) requireToken(enemyPixel, token, message);

for (const [source, label] of [[canon, '正典'], [plan, '升级计划']]) {
  requireToken(source, '画外等待 **1.8 秒**', `${label}没有记录普通车画外循环`);
  requireToken(source, '预警 **0.62 秒**', `${label}没有记录普通车预警`);
  requireToken(source, '以 **330px/s** 横穿 **1.36 秒**', `${label}没有记录普通车横穿速度与时长`);
  requireToken(source, '**24px 半车长 × 22px 半车宽**', `${label}没有记录普通车真实车身判定`);
  requireToken(source, '普通《错过的车》使用 64px `last-bus`', `${label}没有锁定普通车图集和尺寸`);
  requireToken(source, '小 Boss《末班车》使用 144px `last-bus-hd`', `${label}没有锁定小 Boss 图集和尺寸`);
  requireToken(source, '十层车身残影、二十四条碎裂速度线', `${label}没有锁定夸张车流表现`);
  requireToken(source, '不得扩成无端点移动网格、四周装饰线或全局滤镜', `${label}没有锁定车流禁线边界`);
}

for (const [token, message] of [
  ['enemy-portraits-v1/id-scanner.png', '百科青年总览仍未换成识别中'],
  ['生命60 · 0.62秒预警 · 横穿9', '百科没有记录普通车数值'],
  ['画外等待1.8秒后锁定一条水平车道', '百科没有记录普通车循环'],
  ['以330px/s横穿1.36秒', '百科没有记录横穿速度与时长'],
  ['它是64px普通车流，不是144px小Boss「末班车」', '百科没有区分普通车与小 Boss'],
  ['青年Boss：预警→冲锋→疲惫循环；仅疲惫期受1.7倍伤', '百科末班车疲惫机制丢失'],
] ) requireToken(wiki, token, message);

requireToken(plan, '### 29.12 青年《错过的车》车流重构与身份纠错（2026-07-26）', '升级计划缺少本轮实机审阅记录');
requireToken(plan, '同车道生命 **999→990**', '升级计划没有记录命中原子结果');
requireToken(plan, '平均 **1.46ms**', '升级计划没有记录七车固定步进成本');
requireToken(packageJson, '"validate:youth-commute-enemies"', 'package.json 缺少青年车流门禁脚本');
requireToken(packageScript, 'npm run validate:youth-commute-enemies', '正式出包没有执行青年车流门禁');

checks += assetStats.length;
assetStats.forEach((asset, index) => {
  if (asset.size <= 0) errors.push(`车流正式资源为空：${assetPaths[index]}`);
});

const renderStart = game.indexOf('private renderYouthCommuteEnemyFields(): void');
const renderEnd = game.indexOf('private renderYouthTaskEnemyFields(): void', renderStart);
const renderSource = renderStart >= 0 && renderEnd > renderStart ? game.slice(renderStart, renderEnd) : '';
checks += 1;
if (!renderSource || renderSource.includes('createPattern(') || renderSource.includes('ctx.filter')) {
  errors.push('青年车流表现缺失或退化成重复网格/全局滤镜');
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  ordinaryBus: 'offscreen 1.8s -> warn 0.62s -> horizontal 330px/s x 1.36s -> 24x22 body -> hit 9 once',
  lastBus: 'free-angle warn 0.8s -> dash 340px/s x 1.1s -> fatigue 2.5s -> damage x1.7',
  visual: '10 body echoes + 24 speed shards + directional lane, stackable without grid/filter',
  assets: Object.fromEntries(assetPaths.map((path, index) => [path, assetStats[index].size])),
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
