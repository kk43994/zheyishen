import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, canon, plan, wiki] = await Promise.all([
  read('src/game.ts'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
]);

const errors = [];
let checks = 0;
const requireToken = (source, token, message) => {
  checks += 1;
  if (!source.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ['const MEETING_DOOR_SLOW_RADIUS = 124;', '会议门停步域不是 124px'],
  ['const MEETING_DOOR_SLOW_MULTIPLIER = 0.68;', '会议门减速倍率不是 0.68'],
  ["enemy.type === 'meeting-door' && dist <= MEETING_DOOR_SLOW_RADIUS", '会议门距离判定未接入敌人更新'],
  ['this.meetingDoorSlowTimer = Math.max(this.meetingDoorSlowTimer, 0.18);', '会议门没有持续刷新减速'],
  ["if (enemy.type === 'meeting-door') continue;", '会议门仍会按普通怪追击或接触攻击'],
  ['suppressedSpeed *= MEETING_DOOR_SLOW_MULTIPLIER;', '封存期间会议门环境减速被错误取消'],
  ['speed *= MEETING_DOOR_SLOW_MULTIPLIER;', '普通状态下会议门减速没有进入移速结算'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['const CHECKUP_REPORT_BONUS_LOCK_DURATION = 3;', '体检报告封存时长不是 3 秒'],
  ['const CHECKUP_REPORT_CONTACT_PADDING = 8;', '体检报告接触域没有独立余量'],
  ['const CHECKUP_REPORT_RECONTACT_DELAY = 0.9;', '体检报告缺少重复接触间隔'],
  ["enemy.type === 'checkup-report' ? CHECKUP_REPORT_CONTACT_PADDING : 0", '体检报告接触域没有进入碰撞判定'],
  ["if (enemy.type === 'checkup-report')", '体检报告缺少无伤接触分支'],
  ['this.bonusSuppressionTimer = CHECKUP_REPORT_BONUS_LOCK_DURATION;', '体检报告没有启动加成封存'],
  ['enemy.attackCooldown = CHECKUP_REPORT_RECONTACT_DELAY;', '体检报告没有应用重复接触间隔'],
  ['if (this.bonusSuppressionTimer > 0) return { ...BASE_VECTOR };', '封存时攻击没有退回基础向量'],
  ['return this.bonusSuppressionTimer <= 0', '封存时装备和组合触发没有停用'],
  ['if (this.bonusSuppressionTimer > 0) this.bonusSuppressionTimer = Math.max(0, this.bonusSuppressionTimer - dt);', '封存倒计时不会自然恢复'],
] ) requireToken(game, token, message);

const reportBranchStart = game.indexOf("if (enemy.type === 'checkup-report') {");
const reportBranchEnd = game.indexOf('if (enemy.attackCooldown <= 0 && this.hurtHero', reportBranchStart);
const reportBranch = reportBranchStart >= 0 && reportBranchEnd > reportBranchStart
  ? game.slice(reportBranchStart, reportBranchEnd)
  : '';
checks += 1;
if (!reportBranch || reportBranch.includes('hurtHero(')) errors.push('体检报告接触分支仍会直接扣血');

for (const [token, message] of [
  ['this.renderMiddleAgeEnemyFields();', '中年小怪特效没有进入世界渲染层'],
  ['private renderMiddleAgeEnemyFields(): void', '缺少中年小怪独立渲染方法'],
  ["ctx.fillText('下一页'", '会议门缺少可辨识的现实声源'],
  ["ctx.fillText('再往下拆'", '会议门缺少第二条会议声源'],
  ["ctx.fillText(`加成封存 · ${this.bonusSuppressionTimer.toFixed(1)}s`", '体检报告封存缺少倒计时反馈'],
  ["ctx.fillText('×'", '体检报告封存缺少夸张红叉反馈'],
  ["action === 'middle-age-hazards'", '缺少确定性中年审阅入口'],
  ["variant === 'report-locked-art' || variant === 'horde-art'", '中年视觉审阅态没有冻结'],
  ['middleAge: {', '开发状态没有暴露中年机制'],
  ['bonusEffectsActive: this.items.filter((item) => this.hasItem(item))', '开发状态无法证明装备触发被封存'],
] ) requireToken(game, token, message);

const renderStart = game.indexOf('private renderMiddleAgeEnemyFields(): void');
const renderEnd = game.indexOf('private visibleInLampLight(', renderStart);
const renderSource = renderStart >= 0 && renderEnd > renderStart ? game.slice(renderStart, renderEnd) : '';
checks += 1;
if (!renderSource || renderSource.includes('createPattern(') || renderSource.includes('ctx.filter')) {
  errors.push('中年机制表现缺失或退化成移动网格/滤镜');
}

for (const asset of ['src/assets/enemies/meeting-door.png', 'src/assets/enemies/checkup-report.png']) {
  checks += 1;
  try {
    await access(resolve(process.cwd(), asset));
  } catch {
    errors.push(`正式敌人资源缺失: ${asset}`);
  }
}

for (const [source, label] of [[canon, '正典'], [plan, '升级计划']]) {
  requireToken(source, '**124px**', `${label}没有记录会议门精确半径`);
  requireToken(source, '**0.68**', `${label}没有记录会议门精确减速倍率`);
  requireToken(source, '攻击向量回落到基础', `${label}没有记录体检报告封存的数值定义`);
  requireToken(source, '不使用移动网格', `${label}没有锁定非网格叠场合同`);
}
for (const [token, message] of [
  ['124px 停步域', '百科没有记录会议门半径'],
  ['主角移速 ×0.68', '百科没有记录会议门减速倍率'],
  ['3秒加成封存', '百科没有记录体检报告时长'],
  ['37px 接触不扣血', '百科没有记录体检报告无伤接触域'],
  ['攻击退回基础《一口气》', '百科没有说明封存后的攻击状态'],
] ) requireToken(wiki, token, message);

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  meetingDoor: 'stationary/no damage -> 124px -> move x0.68',
  checkupReport: '37px/no damage -> base attack + item/combo triggers disabled for 3s -> 0.9s recontact delay',
  art: 'approved Image2 assets + stacked local fields; no moving grid/filter',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
