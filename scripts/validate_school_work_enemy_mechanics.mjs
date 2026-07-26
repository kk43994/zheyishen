import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, types, canon, plan, wiki, redMarkAsset, whisperAsset] = await Promise.all([
  read('src/game.ts'),
  read('src/types.ts'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
  stat('src/assets/enemies/red-mark.png'),
  stat('src/assets/enemies/whisper.png'),
]);

const errors = [];
let checks = 0;
const requireToken = (source, token, message) => {
  checks += 1;
  if (!source.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ['const OTHERS_PAPER_AURA_RADIUS = 150;', '比较纸外圈不是 150px'],
  ['const OTHERS_PAPER_MID_RADIUS = 96;', '比较纸中圈不是 96px'],
  ['const OTHERS_PAPER_INNER_RADIUS = 56;', '比较纸内圈不是 56px'],
  ['const interval = inner ? 0.62 : middle ? 1 : 1.5;', '比较纸距离档没有改变伤害节拍'],
  ['const damage = inner ? 2 : 1;', '比较纸内圈不是每次 2 点'],
  ['this.hurtHero(damage, enemy.name)', '比较纸没有实际造成伤害'],
  ['const SIGN_HERE_SLOW_RADIUS = 48;', '签字栏减速半径不是 48px'],
  ["enemy.type === 'sign-here' && dist <= SIGN_HERE_SLOW_RADIUS", '签字栏贴身判定未接入敌人更新'],
  ['this.heroSlowTimer = Math.max(this.heroSlowTimer, 0.18);', '签字栏没有持续刷新减速'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['const RED_MARK_RETREAT_DURATION = 0.42;', '红叉后撤时间不是 0.42 秒'],
  ['const RED_MARK_RETREAT_SPEED = 128;', '红叉后撤速度不是 128px/s'],
  ['const RED_MARK_POUNCE_WINDUP = 0.32;', '红叉再扑预警不是 0.32 秒'],
  ['const RED_MARK_POUNCE_DURATION = 0.42;', '红叉再扑持续不是 0.42 秒'],
  ['const RED_MARK_POUNCE_SPEED = 220;', '红叉再扑速度不是 220px/s'],
  ['const RED_MARK_POUNCE_HALF_WIDTH = 18;', '红叉再扑半宽不是 18px'],
  ["enemy.attackKind === 'red-retreat'", '红叉没有命中后撤状态'],
  ["enemy.attackKind = 'red-pounce-warn';", '红叉后撤结束没有进入锁向预警'],
  ["enemy.attackKind = 'red-pounce';", '红叉预警结束没有进入再扑'],
  ['const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY || 1;', '红叉再扑没有使用运动线段判定'],
  ['Math.hypot(this.heroX - nearestX, this.heroY - nearestY) <= RED_MARK_POUNCE_HALF_WIDTH', '红叉再扑判定没有共享 18px 半宽'],
  ["enemy.attackKind = 'red-retreat';", '红叉首次接触没有触发后撤'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['const WHISPER_ORBIT_X = 54;', '耳语椭圆横轴不是 54px'],
  ['const WHISPER_ORBIT_Y = 34;', '耳语椭圆纵轴不是 34px'],
  ['const WHISPER_ORBIT_SPEED = 1.9;', '耳语环绕角速度不是 1.9rad/s'],
  ['const WHISPER_PRESSURE_RADIUS = 44;', '耳语消耗半径不是 44px'],
  ['const WHISPER_PRESSURE_INTERVAL = 1.5;', '耳语消耗节拍不是 1.5 秒'],
  ["if (enemy.type === 'whisper')", '耳语没有独立更新分支'],
  ['+ direction * WHISPER_ORBIT_SPEED * dt;', '耳语没有正反交错环绕'],
  ['enemy.speed * 1.85 * slowPace * dt', '耳语没有追上动态轨道的速度余量'],
  ['enemy.auraCooldown = WHISPER_PRESSURE_INTERVAL;', '耳语离圈没有重置完整节拍'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['const ID_SCANNER_CYCLE = 4.4;', '识别机周期不是 4.4 秒'],
  ['const ID_SCANNER_WINDUP = 0.9;', '识别机预警不是 0.9 秒'],
  ['const ID_SCANNER_ACTIVE = 0.48;', '识别机生效窗口不是 0.48 秒'],
  ['const ID_SCANNER_HALF_HEIGHT = 13;', '扫描带半高不是 13px'],
  ['const ID_SCANNER_LOCK_DURATION = 3;', '工号锁定不是 3 秒'],
  ['const ID_SCANNER_CONVERGE_MULTIPLIER = 1.65;', '怪群聚拢倍率不是 1.65'],
  ["enemy.attackKind = 'id-scan-warn';", '识别机没有进入扫描预警状态'],
  ["enemy.attackKind = 'id-scan-active';", '识别机没有进入有效扫描状态'],
  ['enemy.scanTargetY = this.heroY;', '扫描没有在前摇开始时锁定主角 Y 坐标'],
  ['Math.abs(this.heroY - targetY) <= ID_SCANNER_HALF_HEIGHT', '扫描命中没有使用锁定横带几何'],
  ['this.scannerLockTimer = Math.max(this.scannerLockTimer, ID_SCANNER_LOCK_DURATION);', '扫描命中没有刷新工号锁定'],
  ["enemy.type !== 'id-scanner' && !enemy.elite && !enemy.boss", '聚拢倍率错误作用到识别机、精英或 Boss'],
  ['moveMult *= ID_SCANNER_CONVERGE_MULTIPLIER;', '工号锁定没有加速普通怪聚拢'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['this.renderSchoolWorkEnemyFields();', '少年/青年小怪特效没有进入世界渲染层'],
  ['private renderSchoolWorkEnemyFields(): void', '缺少少年/青年小怪独立渲染方法'],
  ["const scores = ['98', '100', '99'];", '比较场缺少离散分数视觉'],
  ["ctx.fillText(distance <= OTHERS_PAPER_INNER_RADIUS ? '被比下去' : '比较中'", '比较场缺少主角状态反馈'],
  ["ctx.fillText('待签'", '签字栏缺少贴身签字反馈'],
  ['for (let mark = 0; mark < 10; mark += 1)', '红叉缺少十枚批改碎片'],
  ['const echoCount = pouncing ? 8 : 6;', '红叉缺少六层后撤／八层再扑残影'],
  ['for (let step = 20; step <= 116; step += 16)', '红叉缺少局部锁向箭头链'],
  ['for (let point = 0; point < 18; point += 1)', '耳语缺少 18 点椭圆轨道'],
  ['for (let echo = 1; echo <= 8; echo += 1)', '耳语缺少八层话尾残影'],
  ['for (let fragment = 0; fragment < 12; fragment += 1)', '耳语缺少十二枚话语碎片'],
  ['ctx.fillRect(enemy.x - span, targetY - ID_SCANNER_HALF_HEIGHT', '扫描生效画面没有共享锁定 Y 坐标'],
  ["ctx.fillText(`#017 · ${this.scannerLockTimer.toFixed(1)}s`", '工号锁定缺少倒计时'],
  ["action === 'school-work-hazards'", '缺少确定性少年/青年审阅入口'],
  ["variant === 'scanner-warn-art'", '扫描预警视觉审阅态没有冻结'],
  ["variant === 'scanner-dodge-art'", '扫描闪避视觉审阅态没有冻结'],
  ["variant === 'red-pounce-hit' ? 70 : 88", '缺少红叉再扑命中／擦肩确定性站位'],
  ["variant === 'school-legacy-horde' || variant === 'school-legacy-horde-art'", '缺少三红叉三耳语叠场入口'],
  ["variant === 'school-full-horde' || variant === 'school-full-horde-art'", '缺少少年八怪完整叠场入口'],
  ["this.heroSlowTimer = variant === 'school-full-horde-art' ? 0.18 : 0;", '少年完整冻结叠场没有暴露签字减速'],
  ['schoolWork: {', '开发状态没有暴露少年/青年机制'],
  ['redMarks: this.enemies.filter', '开发状态没有暴露红叉阶段'],
  ['whispers: this.enemies.filter', '开发状态没有暴露耳语环绕与节拍'],
] ) requireToken(game, token, message);

requireToken(types, 'scanTargetY?: number;', '敌人状态缺少扫描锁定 Y 坐标');
requireToken(types, 'scanHit?: boolean;', '敌人状态缺少扫描单次命中标记');

for (const [source, label] of [[canon, '正典'], [plan, '升级计划']]) {
  requireToken(source, '**150px** 比较场', `${label}没有记录比较场半径`);
  requireToken(source, '进入 **48px** 后持续把主角移动速度', `${label}没有记录签字减速范围`);
  requireToken(source, '每 **4.4 秒**锁定主角当时所在的世界 Y 坐标', `${label}没有记录扫描周期与锁定轴`);
  requireToken(source, '普通小怪向主角聚拢速度乘 **1.65**', `${label}没有记录聚拢倍率`);
  requireToken(source, '以 **128px/s** 后撤 **0.42 秒**', `${label}没有记录红叉后撤数值`);
  requireToken(source, '预警 **0.32 秒**，再以 **220px/s** 扑进 **0.42 秒**', `${label}没有记录红叉再扑数值`);
  requireToken(source, '**54×34px** 椭圆轨道', `${label}没有记录耳语椭圆轨道`);
  requireToken(source, '进入 **44px** 后每 **1.5 秒**造成 3 点', `${label}没有记录耳语消耗节拍`);
  requireToken(source, '三红叉、三耳语允许完整叠场', `${label}没有锁定夸张叠场合同`);
  requireToken(source, '不得扩成移动网格', `${label}没有锁定单横带表现合同`);
}
for (const [token, message] of [
  ['150／96／56px 比较场', '百科没有记录比较场三档半径'],
  ['48px 贴身拖慢', '百科没有记录签字减速半径'],
  ['4.4秒横向扫描', '百科没有记录识别机周期'],
  ['普通怪聚拢速度 ×1.65', '百科没有记录扫描命中效果'],
  ['生命21 · 接触4 · 再扑4', '百科没有记录红叉两段伤害'],
  ['以 128px/s 后撤 0.42 秒', '百科没有记录红叉后撤机制'],
  ['生命15 · 54×34px 环绕 · 消耗3', '百科没有记录耳语环绕形态'],
  ['进入 44px 后每 1.5 秒造成 3 点', '百科没有记录耳语消耗节拍'],
] ) requireToken(wiki, token, message);

requireToken(plan, '### 29.10 少年红叉与耳语游走机制审阅（2026-07-26）', '升级计划缺少少年旧怪本轮实机审阅记录');
requireToken(plan, '平均 **16.51ms／60.57 FPS**', '升级计划没有记录少年八怪真实性能结果');

checks += 2;
if (redMarkAsset.size <= 0) errors.push('红叉正式 Image2 资源为空');
if (whisperAsset.size <= 0) errors.push('耳语正式 Image2 资源为空');

const renderStart = game.indexOf('private renderSchoolWorkEnemyFields(): void');
const renderEnd = game.indexOf('private visibleInLampLight(', renderStart);
const renderSource = renderStart >= 0 && renderEnd > renderStart ? game.slice(renderStart, renderEnd) : '';
checks += 1;
if (!renderSource || renderSource.includes('createPattern(') || renderSource.includes('ctx.filter')) {
  errors.push('少年/青年机制表现缺失或退化成重复网格/滤镜');
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  paper: '150/96/56px -> 1.5/1/0.62s -> inner hit 2',
  sign: '48px -> hero speed 75%',
  scanner: '4.4s -> warn 0.9s -> active 0.48s x 13px half-height -> lock 3s -> mobs x1.65',
  redMark: 'contact 4 -> retreat 0.42s @128 -> warn 0.32s -> pounce 0.42s @220 x 18px half-width -> hit 4',
  whisper: '54x34 orbit @1.9rad/s -> 44px -> hit 3 every 1.5s',
  assets: { redMark: redMarkAsset.size, whisper: whisperAsset.size },
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
