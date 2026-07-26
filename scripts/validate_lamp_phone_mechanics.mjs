import { readFile } from 'node:fs/promises';
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
const rejectToken = (source, token, message) => {
  checks += 1;
  if (source.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ['private phoneFieldPoint(angle: number, radius: number)', '缺少竖屏电话落点函数'],
  ['const radius = 180 + this.random() * 100', '一阶段来电没有遵守 180-280 距离环'],
  ['const yOffset = this.clamp(Math.sin(angle) * radius, -144, 144)', '电话实体可能钻进上下 HUD'],
  ['Math.sqrt(Math.max(0, radius * radius - yOffset * yOffset))', '压缩纵向落点后没有保持真实环距'],
  ['this.phoneCalls = [call]', '一阶段来电没有进入场上实体列表'],
  ['enemy.x = call.x', '一阶段 Boss 没有移到场上来电位置'],
  ['const count = Math.min(4, 3 + Math.floor(this.phoneMissed / 10))', '二阶段没有分裂为 3-4 通来电'],
  ['this.phoneAnswer >= 3', '接听窗口不是完整 3 秒'],
  ['this.stunTimer = Math.max(this.stunTimer, 0.14)', '接听中没有定身玩家'],
  ["this.createSeekingEnemy('missed-call', call.x, call.y + 30)", '未接电话没有从原位置生成追击怪'],
  ['Math.floor(this.phoneMissed / 5) - this.phoneRelief', '未接数没有每 5 个强化一档'],
  ['this.phoneCalls.filter((_, index) => index !== answeredIndex)', '二阶段未处理来电没有分别转成未接'],
  ['[180, 700, 180, 700]', '初始来电缺少慢档震动'],
  ['[180, 400, 180, 400]', '来电过半缺少中档震动'],
  ['[120, 180, 120, 180, 120]', '来电临近超时缺少急档震动'],
  ['this.feedback.vibrate([400])', '未接缺少闷响反馈'],
  ['const frequency = this.phoneRingWindow < 2 ? 12', '场上电话闪烁没有同步三档铃声节奏'],
  ["const dedicatedPhoneHint = enemy.type === 'ringing-phone' && this.phoneRinging", '响铃电话仍会叠加普通 Boss 红色边缘指示'],
  ['for (const call of this.phoneCalls) this.renderEdgeHint', '场外来电没有紧急边缘指示'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['private visibleInLampLight(x: number, y: number, margin = 0)', '缺少《灯下》可见性判定'],
  ['!this.visibleInLampLight(enemy.x, enemy.y, enemy.radius + (enemy.boss ? 28 : 12))', '圈外敌人仍会绘制'],
  ['this.visibleInLampLight(enemy.x, enemy.y, enemy.radius + 28)', '圈外攻击前摇仍会泄露位置'],
  ['!this.visibleInLampLight(projectile.x, projectile.y, projectile.radius + 6)', '圈外飞行物仍会绘制'],
  ['!this.visibleInLampLight(burst.x, burst.y, burst.radius + 8)', '圈外命中特效仍会泄露位置'],
  ["ctx.fillStyle = 'rgba(5,5,8,.68)'", '光圈外环境压暗不足或被移除'],
  ['private beginLampChoice(enemy: EnemyUnit)', '缺少《点名》二选一入口'],
  ['timer: 3,', '《点名》选择窗口不是 3 秒'],
  ['leftDistance < 34 || rightDistance < 34', '《点名》没有用走近物件完成选择'],
  ['const stripSlot: 0 | 1 = keepSlot === 0 ? 1 : 0', '保留一件后没有归还另一件'],
  ["this.items = this.items.filter((_, itemIndex) => itemIndex !== stripAt)", '被收走的道具没有真实离开构筑'],
  ["enemy.type === 'lamp-keeper' && this.lampChoice", '《点名》期间收灯人没有站定'],
  ['enemy.y = this.darkCY - 108', '《点名》没有给人物和选项留出构图空间'],
  ["ordered.find((index) => this.items[index] === 'fathers-raincoat')", '缺少父亲雨衣最后归还保底'],
  ['this.finishLampCycle(enemy, otherIndex)', '雨衣与最后一件并存时没有先归还另一件'],
  ['LAMP_SHADE_CAP', '收灯人召唤物缺少场上上限'],
  ["if (enemy.type === 'lamp-keeper') {", '收灯人不再永久不可伤'],
  ['private beginLampRelease(enemy: EnemyUnit)', '缺少最后一件离身后的主动收束阶段'],
  ['this.projectiles = [];', '《吹灯》没有清掉残余弹道'],
  ['this.lampReleaseReady = true;', '《吹灯》没有冻结并等待玩家确认'],
  ['this.lampFinalStripTimer = LAMP_STRIP_TO_RELEASE_DELAY;', '最后一件离身后仍会被残余攻击打断'],
  ["keeper?.bossAnim === 'keeper-strip'", '最后一件离身的四帧动作没有在冻结期继续播放'],
  ['if (this.lampFinalStripTimer <= 0 && keeper) this.beginLampRelease(keeper);', '最后归还动作没有可靠接入吹灯阶段'],
  ['private releaseFinalBreath(): void', '缺少玩家主动放下这一口气的结算入口'],
  ['private renderLampReleasePrompt(): void', '缺少红章式终局动作'],
  ["keeper?.bossAnim === 'keeper-dim'", '冻结终局时《吹灯》动画也被错误冻结'],
  ['keeper.bossAnimTimer = Math.max(0.001,', '《吹灯》没有走完并停在末帧'],
  ["if (activeBoss.type === 'lamp-keeper') {", '收灯人 HUD 仍被当作普通可击杀 Boss'],
  ['const returned = Math.max(0, total - this.items.length);', '收灯人 HUD 没有显示真实归还进度'],
] ) requireToken(game, token, message);

for (const screen of ['phone-field', 'phone-answer', 'lamp-dark', 'lamp-choice']) {
  requireToken(game, `auditScreen === '${screen}'`, `缺少 ${screen} 冻结审阅画面`);
}

for (const [source, label] of [[canon, '正典'], [plan, '升级计划'], [wiki, '百科']]) {
  requireToken(source, '180–280', `${label}没有记录电话场上实体距离`);
  requireToken(source, '3 秒', `${label}没有记录接听或点名的 3 秒决策`);
  requireToken(source, '雨衣', `${label}没有记录雨衣传承`);
}
rejectToken(canon, '| 13 | 新机制 | 电话实体系统', '正典仍把电话实体系统标成未做');
rejectToken(canon, '| 16 | 新机制 | 二选一保留机制', '正典仍把《点名》标成未做');
rejectToken(plan, '收灯人《灯下》《点名》、名册', '升级计划总待办仍包含已完成的收灯人机制');
rejectToken(plan, '成年电话的场上光点实体（现为 Boss 本体贴身接听版）', '升级计划仍声称电话只能贴身接听');

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  phone: '180-280 场上来电 -> 三档闪烁/震动 -> 走近定身接听 -> 未接追击与强化',
  lamp: '圈外敌弹不可见 -> 3 秒走近二选一 -> 真实归还一件 -> 雨衣最后归还 -> 主动放下且不能击杀',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
