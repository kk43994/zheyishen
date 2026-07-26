import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const assetPaths = [
  'src/assets/enemies/task-simple.png',
  'src/assets/enemies/task-revise.png',
  'src/assets/enemies/task-deadline.png',
  'src/assets/enemies/task-sync.png',
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
  ['const TASK_SIMPLE_CHILD_HP = 6;', '简单任务子任务生命不是 6'],
  ['const TASK_SIMPLE_SPLIT_ACTION_DURATION = 0.55;', '简单任务分裂动作时长缺失'],
  ['const TASK_REVISE_REVIVE_RATIO = 0.6;', '返工恢复比例不是 60%'],
  ['const TASK_REVISE_ACTION_DURATION = 0.65;', '返工动作时长缺失'],
  ['const TASK_DEADLINE_DURATION = 8;', '任务期限不是 8 秒'],
  ['const TASK_DEADLINE_WARNING_DURATION = 0.7;', '任务最后警告不是 0.7 秒'],
  ['const TASK_SYNC_INTERVAL = 4;', '同步周期不是 4 秒'],
  ['const TASK_SYNC_MIN_DISTANCE = 30;', '同步最小距离不是 30px'],
  ['const TASK_SYNC_RADIUS = 260;', '同步半径不是 260px'],
  ['const TASK_SYNC_PULL_RATIO = 0.3;', '同步拉近比例不是 30%'],
  ['const TASK_SYNC_ACTION_DURATION = 0.56;', '同步动作时长缺失'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ["child.attackKind = 'task-simple-split';", '分裂子任务没有触发正式攻击动作'],
  ['child.hp = TASK_SIMPLE_CHILD_HP;', '分裂子任务没有使用生命合同'],
  ["enemy.attackKind = 'task-revise-reopen';", '返工没有触发正式攻击动作'],
  ['enemy.hp = enemy.maxHp * TASK_REVISE_REVIVE_RATIO;', '返工没有恢复 60% 生命'],
  ["enemy.attackKind = 'task-deadline-expire';", '期限最后阶段没有触发红色到期动作'],
  ['(enemy.mechTimer ?? 0) >= TASK_DEADLINE_DURATION', '期限归零没有使用 8 秒合同'],
  ["enemy.attackKind = 'task-sync-pull';", '同步聚怪没有触发正式攻击动作'],
  ['pull > TASK_SYNC_MIN_DISTANCE && pull < TASK_SYNC_RADIUS', '同步聚怪没有共享 30–260px 几何'],
  ['other.x += (enemy.x - other.x) * TASK_SYNC_PULL_RATIO;', '同步聚怪没有按当前距离拉近 30%'],
  ['if (other.dead || other === enemy || other.boss || other.elite) continue;', '同步聚怪错误作用到 Boss 或精英'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['taskActionTimer?: number;', '敌人状态缺少任务动作计时'],
  ['taskActionDuration?: number;', '敌人状态缺少任务动作总时长'],
] ) requireToken(types, token, message);

for (const [token, message] of [
  ["const taskAction = enemy.type.startsWith('task-') && (enemy.taskActionTimer ?? 0) > 0;", '任务动作没有接入正式敌人图集'],
  ["const motion: EnemyPixelMotion = taskAction ? 'attack'", '正式攻击帧没有优先于受击／移动帧'],
  ["'task-simple': new URL('./assets/enemies/task-simple.png'", '简单任务正式图集未接入'],
  ["'task-revise': new URL('./assets/enemies/task-revise.png'", '返工任务正式图集未接入'],
  ["'task-deadline': new URL('./assets/enemies/task-deadline.png'", '期限任务正式图集未接入'],
  ["'task-sync': new URL('./assets/enemies/task-sync.png'", '同步任务正式图集未接入'],
] ) requireToken(enemyPixel, token, message);

for (const [token, message] of [
  ['this.renderYouthTaskEnemyFields();', '青年任务表现层没有进入世界渲染'],
  ['private renderYouthTaskEnemyFields(): void', '缺少青年任务独立表现层'],
  ['for (let shard = 0; shard < 10; shard += 1)', '简单任务缺少十枚分裂碎片'],
  ["ctx.fillText(revised ? 'final_v2' : 'final'", '返工任务缺少版本可读反馈'],
  ['for (let tick = 0; tick < 12; tick += 1)', '期限任务缺少十二格时钟'],
  ['for (let arrow = 0; arrow < 8; arrow += 1)', '期限任务缺少八向催促箭头'],
  ['for (let step = 18; step < distance - 12; step += 18)', '同步任务缺少逐目标离散消息链'],
  ["ctx.fillText(`对齐 ${nextIn.toFixed(1)}s · ${targets.length}`", '同步任务缺少下次同步与目标数反馈'],
  ["action === 'youth-task-hazards'", '缺少青年任务确定性审阅入口'],
  ["variant === 'simple-split-live'", '缺少简单任务真实分裂入口'],
  ["variant === 'revise-live' || variant === 'revise-art'", '缺少返工真实复活与冻结入口'],
  ["variant === 'deadline-live' || variant === 'deadline-art'", '缺少期限真实扣钱与冻结入口'],
  ["variant === 'sync-live' || variant === 'sync-art'", '缺少同步真实聚怪与冻结入口'],
  ["variant === 'task-horde-art'", '缺少任务怪夸张叠场入口'],
  ['youthTasks: {', '开发状态没有暴露青年任务机制'],
] ) requireToken(game, token, message);

for (const [source, label] of [[canon, '正典'], [plan, '升级计划']]) {
  requireToken(source, '两只实际生命各 **6** 的子任务', `${label}没有记录简单任务分裂生命`);
  requireToken(source, '原地恢复 **60%**，即基础值 15.6、青年章成长后实值 24.96', `${label}没有区分返工基础值与青年章实值`);
  requireToken(source, '最后 **0.7 秒**进入红色到期动作', `${label}没有记录期限动作窗口`);
  requireToken(source, '每 **4 秒**把 **30–260px** 内普通敌人', `${label}没有记录同步范围与周期`);
  requireToken(source, '拉近当前距离的 **30%**', `${label}没有记录同步拉近比例`);
  requireToken(source, '九怪叠场保留全部局部连锁', `${label}没有锁定夸张任务怪叠场`);
  requireToken(source, '不使用重复网格', `${label}没有锁定任务怪禁线合同`);
}

for (const [token, message] of [
  ['生命8 · 分裂2×6', '百科没有记录简单任务分裂生命'],
  ['生命26 · 返工15.6', '百科没有记录返工生命'],
  ['生命30 · 8秒期限 · −1零钱', '百科没有记录期限与扣款'],
  ['生命34 · 4秒同步 · 260px', '百科没有记录同步周期与范围'],
  ['把30–260px内普通敌人向中枢拉近当前距离的30%', '百科没有记录同步拉近比例'],
] ) requireToken(wiki, token, message);

requireToken(packageJson, '"validate:youth-task-enemies": "node scripts/validate_youth_task_enemy_mechanics.mjs"', 'package.json 缺少青年任务专项命令');
requireToken(packageScript, 'npm run validate:youth-task-enemies', '正式出包没有执行青年任务专项门禁');
requireToken(plan, '### 29.11 青年任务怪生命周期动画与连锁审阅（2026-07-26）', '升级计划缺少青年任务本轮实机审阅记录');
requireToken(plan, '平均 **16.62ms／60.17 FPS**', '升级计划没有记录青年九怪真实性能结果');

for (let index = 0; index < assetStats.length; index += 1) {
  checks += 1;
  if (assetStats[index].size <= 0) errors.push(`${assetPaths[index]} 正式 Image2 资源为空`);
}

const renderStart = game.indexOf('private renderYouthTaskEnemyFields(): void');
const renderEnd = game.indexOf('private renderMiddleAgeEnemyFields(): void', renderStart);
const renderSource = renderStart >= 0 && renderEnd > renderStart ? game.slice(renderStart, renderEnd) : '';
checks += 1;
if (!renderSource || renderSource.includes('createPattern(') || renderSource.includes('ctx.filter')) {
  errors.push('青年任务表现缺失或退化成重复网格／全局滤镜');
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  simple: 'hp 8 -> first death -> 2 children x hp 6 -> no resplit',
  revise: 'hp 26 -> first zero -> revive 60% (15.6) -> second zero dies',
  deadline: '8s -> last 0.7s attack animation -> expire -> -1 coin',
  sync: '4s -> 30..260px normal mobs -> pull current distance x30%',
  art: 'four approved Image2 attack rows + nine-enemy local effect stack; no repeated grid/filter',
  assets: Object.fromEntries(assetPaths.map((path, index) => [path, assetStats[index].size])),
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
