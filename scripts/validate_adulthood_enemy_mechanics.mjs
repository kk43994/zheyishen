import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, types, canon, plan, wiki] = await Promise.all([
  read('src/game.ts'),
  read('src/types.ts'),
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
  ['const DESK_LAMP_AURA_RADIUS = 88;', '台灯灯光半径不是 88px'],
  ['const DESK_LAMP_DAMAGE_MULTIPLIER = 1.2;', '台灯缺少最终伤害 ×1.2'],
  ['const DESK_LAMP_BURN_INTERVAL = 1;', '台灯灼伤节拍不是每秒一次'],
  ['const DESK_LAMP_BURN_DAMAGE = 1;', '台灯每次灼伤不是 1 点'],
  ['if (this.heroInDeskLampAura()) vector.damage *= DESK_LAMP_DAMAGE_MULTIPLIER;', '台灯增伤没有接入最终攻击向量'],
  ["this.hurtHero(DESK_LAMP_BURN_DAMAGE, '没关的台灯')", '台灯没有实际灼伤玩家'],
  ['const REHEATED_POT_COOL_DURATION = 8;', '锅不是 8 秒凉透'],
  ['const REHEATED_POT_REHEAT_RADIUS = 54;', '锅的重热半径不是 54px'],
  ['const REHEATED_POT_REHEAT_DURATION = 1;', '锅的站定重热时间不是 1 秒'],
  ['const REHEATED_POT_COLD_INTERVAL = 2;', '凉透扣血节拍不是每 2 秒'],
  ['const REHEATED_POT_COLD_DAMAGE = 2;', '凉透伤害不是 2 点'],
  ['const canReheat = heat <= 0', '锅在没有凉透时仍会反复重热'],
  ['&& !this.heroMoving;', '重新加热没有要求玩家站定'],
  ['pot.mechTimer = 0;', '重热完成没有恢复满温度'],
  ['this.hurtHero(REHEATED_POT_COLD_DAMAGE, `${coldPot.name} · 凉透了`)', '凉锅没有实际造成全场伤害'],
  ['this.updateAdulthoodEnemyHazards(dt);', '成年双场机制没有进入敌人更新循环'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['const MISSED_CALL_AURA_RADIUS = 70;', '未接来电铃声场不是 70px'],
  ['const MISSED_CALL_PULSE_INTERVAL = 1.2;', '未接来电脉冲节拍不是 1.2 秒'],
  ['const MISSED_CALL_PULSE_DAMAGE = 1;', '未接来电脉冲伤害不是 1 点'],
  ['if (dist <= MISSED_CALL_AURA_RADIUS) {', '未接来电没有按命名半径判定入圈'],
  ['enemy.auraCooldown += MISSED_CALL_PULSE_INTERVAL;', '未接来电没有保持固定脉冲节拍'],
  ['enemy.auraCooldown = MISSED_CALL_PULSE_INTERVAL;', '未接来电出圈没有重置完整节拍'],
  ['this.hurtHero(MISSED_CALL_PULSE_DAMAGE, `${enemy.name} · 铃声`)', '未接来电铃声没有实际扣血'],
  ['const SILENCE_SLOW_RADIUS = 90;', '没人说话沉默场不是 90px'],
  ['const SILENCE_SLOW_MULTIPLIER = 0.75;', '没人说话减速不是 ×0.75'],
  ['this.silenceSlowTimer = Math.max(this.silenceSlowTimer, 0.18);', '进入沉默场没有刷新独立减速状态'],
  ['if (this.silenceSlowTimer > 0) speed *= SILENCE_SLOW_MULTIPLIER;', '沉默减速没有进入最终移速结算'],
  ['if (this.silenceSlowTimer > 0) this.silenceSlowTimer = Math.max(0, this.silenceSlowTimer - dt);', '沉默减速计时不会正常结束'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['this.renderAdulthoodEnemyFields();', '成年双场特效没有进入世界渲染层'],
  ['private renderAdulthoodEnemyFields(): void', '缺少成年双场独立渲染方法'],
  ['const lampLayers = [', '台灯缺少多层夸张光场'],
  ["active ? '#ef5d43' : '#d4ad58'", '台灯缺少危险红边'],
  ["ctx.fillText('×1.2'", '玩家站进灯圈后没有增伤锁定反馈'],
  ["ctx.fillText('凉'", '锅凉透后缺少持续可读标记'],
  ["this.burst('ring', pot.x, pot.y, 86, '#df6b42')", '重热完成缺少第二层热浪'],
  ['for (let ring = 0; ring < 3; ring += 1)', '未接来电缺少三重铃波'],
  ['for (let tick = 0; tick < 20; tick += 1)', '未接来电缺少 20 段局部震动刻度'],
  ["ctx.fillText(active ? '铃——' : '未接'", '未接来电缺少可读铃声状态'],
  ['for (let fragment = 0; fragment < 16; fragment += 1)', '没人说话缺少 16 组断句碎片'],
  ["ctx.fillText('……'", '没人说话缺少可读沉默标记'],
  ["ctx.fillText('没人说话 · 移速×0.75'", '玩家缺少沉默减速锁定反馈'],
  ["action === 'adult-hazards'", '缺少成年双场确定性审阅入口'],
  ["variant === 'call-near'", '缺少未接来电完整节拍审阅态'],
  ["variant === 'legacy-horde-art'", '缺少成年旧怪六怪叠层审阅态'],
  ["variant === 'full-horde'", '缺少成年十怪真实更新审阅态'],
  ["variant === 'full-horde-art'", '缺少成年十怪全压力审阅态'],
  ['enemyMechanics: {', '开发状态没有暴露小怪机制'],
  ['damageMultiplier: this.heroInDeskLampAura() ? DESK_LAMP_DAMAGE_MULTIPLIER : 1', '开发状态无法证明台灯增伤'],
  ['silenceSlowMultiplier: this.silenceSlowTimer > 0 ? SILENCE_SLOW_MULTIPLIER : 1', '开发状态无法证明沉默减速倍率'],
  ['missedCalls: this.enemies.filter', '开发状态没有暴露未接来电节拍'],
] ) requireToken(game, token, message);

requireToken(types, 'potReheatProgress?: number;', '敌人状态缺少锅的重热进度');
for (const [source, label] of [[canon, '正典'], [plan, '升级计划']]) {
  requireToken(source, '**88px** 灯下赶工区', `${label}没有记录台灯精确半径`);
  requireToken(source, '从热满到凉透用 **8 秒**', `${label}没有记录锅的凉透时间`);
  requireToken(source, '不用移动网格代替危险反馈', `${label}没有锁定非网格表现合同`);
  requireToken(source, '**成年旧怪合同（2026-07-26）**', `${label}没有成年旧怪精确合同`);
  requireToken(source, '进入 **70px** 铃声场后开始计时', `${label}没有未接来电精确半径`);
  requireToken(source, '每 **1.2 秒**脉冲 1 点', `${label}没有未接来电精确节拍`);
  requireToken(source, '进入 **90px** 沉默场后移动速度固定乘 **0.75**', `${label}没有沉默场精确减速`);
}
for (const [token, message] of [
  ['88px 灯下赶工区', '百科没有记录台灯半径'],
  ['最终攻击伤害 ×1.2', '百科没有记录台灯最终伤害倍率'],
  ['8秒凉透倒计时', '百科没有记录锅的凉透时间'],
  ['进入 54px 并站定 1 秒', '百科没有记录锅的重热操作'],
  ['进入70px后每1.2秒脉冲1点', '百科没有未接来电精确节拍'],
  ['进入90px后移速×0.75', '百科没有沉默场精确倍率'],
] ) requireToken(wiki, token, message);

for (const [token, message] of [
  ['### 29.9 成年旧怪铃声与沉默场审阅（2026-07-26）', '升级计划缺少本轮成年旧怪自审'],
  ['入圈 1.10 秒累计 0 点、1.25 秒累计 1 点', '升级计划没有未接来电时序实测'],
  ['132 → 99（×0.75）', '升级计划没有沉默减速实测'],
  ['mobile-full-adult-horde.png', '升级计划没有成年十怪叠场证据'],
  ['16.65ms／60.05 FPS', '升级计划没有成年十怪性能实测'],
] ) requireToken(plan, token, message);

for (const asset of [
  'src/assets/enemies/missed-call.png',
  'src/assets/enemies/silence.png',
]) {
  checks += 1;
  try {
    await access(resolve(process.cwd(), asset));
  } catch {
    errors.push(`成年旧怪正式 Image2 资源缺失: ${asset}`);
  }
}

const renderStart = game.indexOf('private renderAdulthoodEnemyFields(): void');
const renderEnd = game.indexOf('private renderSchoolWorkEnemyFields(): void', renderStart);
const renderSource = renderStart >= 0 && renderEnd > renderStart ? game.slice(renderStart, renderEnd) : '';
checks += 1;
if (renderSource.includes('createPattern(') || renderSource.includes('ctx.filter')) {
  errors.push('成年双场特效退化成重复网格或滤镜伪效果');
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  lamp: '88px -> final damage x1.2 -> 1 damage / second; overlapping visuals, non-stacking stats',
  pot: '8s cool -> 2 damage / 2s -> within 54px and still for 1s -> full heat',
  missedCall: '70px -> 1.2s readable pulse -> hit 1; leaving resets the full beat',
  silence: '90px -> hero move x0.75; overlapping fields do not multiply',
  art: 'approved Image2 assets + ten-enemy local field stack; no moving grid/filter',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
