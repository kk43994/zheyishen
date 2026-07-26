import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, canon, plan, wiki, packageJson, packageScript] = await Promise.all([
  read('src/game.ts'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
  read('package.json'),
  read('scripts/package.sh'),
]);

const errors = [];
let checks = 0;
const requireToken = (source, token, message) => {
  checks += 1;
  if (!source.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ['const CRY_MOTH_ORBIT_X = 84;', '哭蛾横向绕行半径不是 84px'],
  ['const CRY_MOTH_ORBIT_Y = 58;', '哭蛾纵向绕行半径不是 58px'],
  ['const CRY_MOTH_POWDER_CYCLE = 2.4;', '哭蛾鳞粉周期不是 2.4 秒'],
  ['const CRY_MOTH_POWDER_WINDUP = 0.55;', '哭蛾鳞粉预警不是 0.55 秒'],
  ['const CRY_MOTH_POWDER_RADIUS = 62;', '哭蛾鳞粉半径不是 62px'],
  ["this.hurtHero(1, `${enemy.name} · 鳞粉`)", '哭蛾鳞粉没有造成 1 点伤害'],
  ['this.heroSlowTimer = Math.max(this.heroSlowTimer, 0.22);', '哭蛾鳞粉没有附加 0.22 秒迟滞'],
  ["enemy.attackKind = 'moth-powder-warn';", '哭蛾缺少鳞粉预警阶段'],
] ) requireToken(game, token, message);

const updateEnemyStart = game.indexOf('private updateEnemies(dt: number): void');
const mothStart = game.indexOf("if (enemy.type === 'cry-moth') {", updateEnemyStart);
const mothEnd = game.indexOf("if (enemy.type === 'fear') {", mothStart);
const mothBranch = mothStart >= 0 && mothEnd > mothStart ? game.slice(mothStart, mothEnd) : '';
checks += 1;
if (!mothBranch || !mothBranch.includes('continue;') || !mothBranch.includes('const targetX = this.heroX')) {
  errors.push('哭蛾没有独立绕行，仍可能退回普通直追');
}

for (const [token, message] of [
  ['const FEAR_BREATH_CYCLE = 2.8;', '床下呼吸周期不是 2.8 秒'],
  ['const FEAR_BREATH_WINDUP = 0.72;', '床下呼吸吸气预警不是 0.72 秒'],
  ['const FEAR_BREATH_RADIUS = 88;', '床下呼吸脉冲半径不是 88px'],
  ["this.hurtHero(1, `${enemy.name} · 呼吸`)", '床下呼吸脉冲没有造成 1 点伤害'],
  ['this.heroSlowTimer = Math.max(this.heroSlowTimer, 0.26);', '床下呼吸脉冲没有附加 0.26 秒迟滞'],
  ["enemy.attackKind = 'fear-inhale';", '床下呼吸缺少吸气预警阶段'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['const HUNGER_SHADOW_DASH_CYCLE = 3;', '空奶瓶直扑周期不是 3 秒'],
  ['const HUNGER_SHADOW_DASH_WINDUP = 0.58;', '空奶瓶锁向预警不是 0.58 秒'],
  ['const HUNGER_SHADOW_DASH_DURATION = 0.48;', '空奶瓶直扑持续时间不是 0.48 秒'],
  ['const HUNGER_SHADOW_DASH_SPEED = 245;', '空奶瓶直扑速度不是 245'],
  ['const HUNGER_SHADOW_DASH_HALF_WIDTH = 18;', '空奶瓶直扑判定半宽不是 18px'],
  ['const nearestX = startX + segmentX * projection;', '空奶瓶没有用线段最近点做擦肩判定'],
  ["&& Math.hypot(this.heroX - nearestX, this.heroY - nearestY) <= HUNGER_SHADOW_DASH_HALF_WIDTH", '空奶瓶没有使用 18px 半宽判定命中'],
  ["enemy.attackKind = 'hunger-warn';", '空奶瓶缺少锁向预警阶段'],
  ["enemy.attackKind = 'hunger-dash';", '空奶瓶缺少固定方向直扑阶段'],
  ["variant === 'hunger-miss'", '确定性入口缺少空奶瓶擦肩未命中场景'],
] ) requireToken(game, token, message);

checks += 1;
if (game.includes("moveMult *= enemy.type === 'hunger-shadow' ? 3") || game.includes('enemy.dashTimer = 0.5;')) {
  errors.push('空奶瓶仍残留无锁向、无预警的旧版三倍追击');
}

for (const [token, message] of [
  ['this.renderChildhoodEnemyFields();', '童年机制特效没有进入世界渲染层'],
  ['private renderChildhoodEnemyFields(): void', '缺少童年三怪独立渲染方法'],
  ['for (let echo = 1; echo <= 6; echo += 1)', '哭蛾缺少六层绕行残影'],
  ['const dustCount = warning ? 20 : 8;', '哭蛾缺少高密度鳞粉点阵'],
  ['for (let breath = 0; breath < 3; breath += 1)', '床下呼吸缺少三层吸气波纹'],
  ['for (let step = 22; step <= 150; step += 18)', '空奶瓶缺少局部锁向箭头链'],
  ['for (let echo = 1; echo <= 8; echo += 1)', '空奶瓶缺少八层直扑残影'],
  ["ctx.fillText('鳞粉'", '哭蛾预警缺少可读鳞粉标签'],
  ["ctx.fillText('吸——'", '床下呼吸缺少可读吸气标签'],
  ["ctx.fillText('饿'", '空奶瓶缺少可读锁向标签'],
  ["action === 'childhood-hazards'", '缺少童年三怪确定性审阅入口'],
  ["variant === 'horde-art'", '缺少童年七怪夸张叠层审阅态'],
  ['childhood: {', '开发状态没有暴露童年三怪机制'],
] ) requireToken(game, token, message);

const renderStart = game.indexOf('private renderChildhoodEnemyFields(): void');
const renderEnd = game.indexOf('private renderAdulthoodEnemyFields(): void', renderStart);
const renderSource = renderStart >= 0 && renderEnd > renderStart ? game.slice(renderStart, renderEnd) : '';
checks += 1;
if (!renderSource || renderSource.includes('createPattern(') || renderSource.includes('ctx.filter')) {
  errors.push('童年机制表现缺失或退化成移动网格／全局滤镜');
}

for (const asset of [
  'src/assets/enemies/cry-moth.png',
  'src/assets/enemies/fear.png',
  'src/assets/enemies/hunger-shadow.png',
]) {
  checks += 1;
  try {
    await access(resolve(process.cwd(), asset));
  } catch {
    errors.push(`童年正式 Image2 敌人资源缺失: ${asset}`);
  }
}

for (const [token, message] of [
  ['**童年床底三敌合同（2026-07-26）**', '正典没有童年三敌运行时合同'],
  ['**84×58px** 椭圆轨道', '正典没有哭蛾精确绕行轨道'],
  ['每 **2.8 秒**吸气', '正典没有床下呼吸精确时序'],
  ['以 **245px/s** 沿锁定方向直扑 **0.48 秒**', '正典没有空奶瓶精确直扑速度与时长'],
  ['不使用移动网格、贯屏装饰线或全局滤镜', '正典没有锁定夸张非网格表现'],
] ) requireToken(canon, token, message);

for (const [token, message] of [
  ['### 29.8 童年床底原始压力机制审阅（2026-07-26）', '升级计划缺少本轮童年三怪自审记录'],
  ['mobile-horde-pressure.png', '升级计划没有童年七怪叠层截图证据'],
  ['空奶瓶擦肩', '升级计划没有空奶瓶未命中实测'],
] ) requireToken(plan, token, message);

for (const [token, message] of [
  ['84×58px椭圆轨道绕行', '百科没有哭蛾绕行轨道'],
  ['2.4秒撒一次62px催泪鳞粉', '百科没有哭蛾鳞粉精确时序'],
  ['每2.8秒吸气0.72秒', '百科没有床下呼吸精确时序'],
  ['每3秒锁定一次方向', '百科没有空奶瓶锁向周期'],
  ['以245px/s直扑0.48秒', '百科没有空奶瓶直扑精确速度与时长'],
] ) requireToken(wiki, token, message);

requireToken(packageJson, '"validate:childhood-enemies"', 'package.json 没有童年专项门禁');
requireToken(packageScript, 'npm run validate:childhood-enemies', '正式打包管线没有执行童年专项门禁');

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  cryMoth: '84x58 orbit; powder every 2.4s; 0.55s warning; 62px hit 1 + slow 0.22s',
  fear: 'approach/contact retained; inhale every 2.8s; 0.72s warning; 88px hit 1 + slow 0.26s',
  hungerShadow: 'lock every 3s; warn 0.58s; dash 245px/s for 0.48s; half width 18; one hit 3',
  art: 'stackable local rings, particles, arrows and echoes; no moving grid/filter',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
