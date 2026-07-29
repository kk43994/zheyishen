import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const readBytes = (path) => readFile(resolve(process.cwd(), path));
const [game, types, checkpoint, canon, plan, wiki, pixelRuntime, atlasManifestText, atlasPng] = await Promise.all([
  read('src/game.ts'),
  read('src/types.ts'),
  read('src/run-checkpoint.ts'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
  read('src/xiao-zhang-pixel.ts'),
  read('src/assets/characters/xiao-zhang.json'),
  readBytes('src/assets/characters/xiao-zhang.png'),
]);

const method = (source, startToken, endToken) => {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  return start >= 0 && end > start ? source.slice(start, end) : '';
};

const choice = method(game, 'private resolveXiaoZhangChoice(', 'private updateXiaoZhangAlly(');
const ally = method(game, 'private updateXiaoZhangAlly(', 'private spawnCoinDrop(');
const oneSeat = method(game, 'private resolveOneSeat(', '/** 固定掉落展示');
const attacks = method(game, 'private resolveBossStrike(', 'private bossLunge(');
const boxDefeat = method(game, 'private openDefeatItemReward(', 'private resolveOneSeat(');
const errors = [];

const requireToken = (source, token, message) => {
  if (!source.includes(token)) errors.push(message);
};

const rejectToken = (source, token, message) => {
  if (source.includes(token)) errors.push(message);
};

if (!choice) errors.push('找不到小张选择结算方法');
requireToken(choice, 'this.hero.coins < 10', '帮助选择没有阻止零钱不足的误扣');
requireToken(choice, 'this.hero.coins -= 10', '帮助小张没有真实扣除 10 零钱');
requireToken(choice, 'this.stats.coinsSpent += 10', '帮助花费没有进入统计');
requireToken(choice, "this.xiaoZhangDecision = 'declined'", '拒绝选择没有持久状态');
requireToken(choice, "this.xiaoZhangDecision = 'helped'", '帮助选择没有持久状态');
// 无限世界化之后不再有首屏边界，旧的「夹到 W/H 之内 + 贴脸回退」两条断言已经失效：
// 固定半径投放本身就同时保证了可达（相机跟随，任何方向都能走到）与不贴脸（恒为 168 > 96）。
requireToken(game, 'const spawnX = this.heroX + Math.cos(angle) * 168', '小张落点没有按固定半径投在主角周围');
requireToken(game, 'const spawnY = this.heroY + Math.sin(angle) * 168', '小张落点没有按固定半径投在主角周围');
rejectToken(game, 'let spawnX = this.clamp(this.heroX', '小张落点又被夹回首屏坐标（无限世界里会落到不可达处）');

if (!ally) errors.push('找不到小张友军更新方法');
for (const [token, message] of [
  ['176 * dt', '友军缺少独立跟随速度'],
  ['> 270', '友军缺少攻击距离限制'],
  ['ally.fireCooldown = 0.92', '友军缺少固定射击间隔'],
  ["this.projectileVisualForForm('paper', 'paper', 1)", '友军没有使用固定纸团弹道'],
  ['damage: 4.5', '友军伤害不再是独立固定值'],
  ['generation: 0', '友军弹道可能错误继承玩家的衍生链'],
  ["priority: 'secondary'", '友军弹道没有进入次级视觉预算'],
]) requireToken(ally, token, message);
if (ally.includes('this.items') || ally.includes('resolveProjectileForm')) {
  errors.push('友军弹道错误继承了玩家道具构筑');
}

if (!oneSeat) errors.push('找不到《岗位只有一个》结算方法');
for (const [token, message] of [
  ['this.praiseOneSeatUsed = true', '岗位幸存者没有一次性触发锁'],
  ['this.helpedXiaoZhang && !this.xiaoZhangBetrayed', '岗位身份没有读取帮助与背刺状态'],
  ["name: '小张 · 背刺'", '缺少小张幸存者身份'],
  ["name: '无名任务 · 背刺'", '清空任务后缺少无名幸存者保底'],
  ['survivor.backstabber = true', '幸存者没有转成背刺敌人'],
  ['this.xiaoZhangBetrayed = true', '小张背刺没有写入跨章状态'],
]) requireToken(oneSeat, token, message);

requireToken(game, "enemy.attackKind = 'backstab'", '背刺没有进入通用前摇派发');
requireToken(game, "backstab: { windup: 0.62, reach: 126, band: 18", '背刺缺少独立窄线预警规格');
requireToken(game, 'const backstabAngles = [', '背刺在场边缺少可见落点回退');
requireToken(attacks, "case 'backstab'", '背刺没有独立攻击结算');
requireToken(attacks, 'reach: 126, band: 18, dmg: 7', '背刺结算与预警范围不一致');
requireToken(game, 'this.praiseMoveIndex = 4', '岗位分配没有在二阶段转场后保底排入下一招');
requireToken(game, 'enemy.mechTimer = 4.2', '岗位分配保底仍可能被高伤构筑跳过');
requireToken(game, '(enemy.phase ?? 1) < 2 && enemy.hp - amount <= enemy.maxHp * 0.5', '超大单发仍可跳过领导二阶段');
requireToken(game, '(enemy.phase ?? 1) === 2 && !this.praiseOneSeatUsed && enemy.hp - amount <= 0', '岗位结算前仍可直接击杀领导');

requireToken(game, "stage.eliteType === 'whose-box' && this.helpedXiaoZhang && this.xiaoZhangBetrayed", '工牌纸箱没有同时校验帮助和背刺');
requireToken(boxDefeat, "this.acquireItem('nameless-tie')", '小张纸箱没有保底留下领带');
requireToken(types, 'backstabber?: boolean;', '敌人类型缺少背刺者标记');
requireToken(types, 'xiaoZhangBox?: boolean;', '敌人类型缺少小张纸箱标记');

requireToken(game, "import { PixelXiaoZhangRenderer", '运行时没有导入小张独立图集渲染器');
requireToken(game, "this.pixelXiaoZhang.draw(ctx, x, y, resolvedAction", '代码回退前没有优先消费小张图集');
requireToken(game, "shooting ? 'shoot' : 'follow'", '友军没有按射击冷却切换跟随／射击动作');
requireToken(game, "action ?? (hostile ? 'backstab' : 'idle')", '岗位幸存者没有切换背刺动作');
requireToken(pixelRuntime, "export type XiaoZhangPixelAction = 'idle' | 'follow' | 'shoot' | 'backstab'", '小张图集缺少四行动作合同');
requireToken(pixelRuntime, "new URL('./assets/characters/xiao-zhang.png'", '小张渲染器没有引用正式图集');
requireToken(pixelRuntime, 'the production art gate must block startup.', '小张图集失败没有遵守正式美术阻断策略');

let atlasManifest;
try {
  atlasManifest = JSON.parse(atlasManifestText);
} catch (error) {
  errors.push(`小张图集清单不是有效 JSON: ${error.message}`);
}
if (atlasManifest) {
  if (atlasManifest.model !== 'gpt-image-2') errors.push('小张图集清单没有记录 gpt-image-2 来源');
  if (atlasManifest.frame?.width !== 64 || atlasManifest.frame?.height !== 64) errors.push('小张图集不是 64x64 细粒度帧');
  if (atlasManifest.columns !== 4) errors.push('小张图集不是四列动画');
  for (const [row, action] of ['idle', 'follow', 'shoot', 'backstab'].entries()) {
    if (atlasManifest.actions?.[action]?.row !== row || atlasManifest.actions?.[action]?.frames !== 4) {
      errors.push(`小张 ${action} 动作没有四帧独立行`);
    }
  }
}
const pngSignature = atlasPng.subarray(0, 8).toString('hex');
if (pngSignature !== '89504e470d0a1a0a') errors.push('小张图集不是有效 PNG');
if (atlasPng.length < 24 || atlasPng.readUInt32BE(16) !== 256 || atlasPng.readUInt32BE(20) !== 256) {
  errors.push('小张图集尺寸必须是 256x256（四动作 x 四帧）');
}

for (const token of ['helpedXiaoZhang: boolean;', 'xiaoZhangBetrayed: boolean;', "xiaoZhangDecision: 'none' | 'helped' | 'declined';"]) {
  requireToken(checkpoint, token, `断点状态缺少 ${token}`);
}
requireToken(checkpoint, "input.helpedXiaoZhang === true", '旧断点没有向新选择字段兼容迁移');

for (const [source, label] of [[canon, '正典'], [plan, '升级计划'], [wiki, '百科']]) {
  requireToken(source, '一起入职的小张', `${label}没有记录小张传承线`);
  requireToken(source, '没有商标的领带', `${label}没有记录纸箱的固定回声掉落`);
  requireToken(source, 'Image2', `${label}没有区分运行时绘制与 Image2 正式资源`);
  requireToken(source, '独立 Image2 64×64 四行动作图集已接入', `${label}没有同步小张正式图集状态`);
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  storyline: '青年帮助选择 -> 不可受击纸团友军 -> 岗位幸存者背刺 -> 中年工牌纸箱与领带',
  checks: 68,
  artStatus: '独立 Image2 64×64 四行动作图集已接入；等待、跟随、投纸、背刺均由运行时消费，正式入口由完整美术闸门保护',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
