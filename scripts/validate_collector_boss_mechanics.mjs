import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const paths = {
  atlas: 'src/assets/enemies/boss-skills-v1/debt-collector-skills.png',
  identity: 'src/assets/enemies/debt-collector-hd.png',
};

const [game, types, renderer, manifestText, canon, plan, wiki, packageJson, packageScript, ...assetStats] = await Promise.all([
  read('src/game.ts'),
  read('src/types.ts'),
  read('src/boss-skill-pixel.ts'),
  read('src/assets/enemies/boss-skills-v1/manifest.json'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
  read('package.json'),
  read('scripts/package.sh'),
  ...Object.values(paths).map((path) => stat(resolve(process.cwd(), path))),
]);
const manifest = JSON.parse(manifestText);
const errors = [];
let checks = 0;
const requireToken = (text, token, message) => {
  checks += 1;
  if (!text.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ['const COLLECTOR_BILL_DURATION = 3.5;', '账单窗口不是 3.5 秒'],
  ['const COLLECTOR_BILL_COIN_COST = 2;', '账单零钱代价不是 2'],
  ['const COLLECTOR_BILL_HP_COST = 8;', '账单生命代价不是 8'],
  ['const COLLECTOR_DRAG_RADIUS = 280;', '上门圆域不是 280px'],
  ['const COLLECTOR_RELOCATE_DAMAGE_RATIO = 0.14;', '换门承伤阈值不是 14%'],
  ['this.billTimer = COLLECTOR_BILL_DURATION;', '寄账单没有使用具名窗口常量'],
  ['this.hero.coins >= COLLECTOR_BILL_COIN_COST', '账单没有按具名零钱代价结算'],
  ["this.hurtHero(COLLECTOR_BILL_HP_COST + this.collectorBillInterest, '下个月账单')", '账单没有按具名生命代价结算(含滞纳金)'],
  ["if (enemy.type === 'debt-collector') this.billTimer = 0;", '击败催收人后未取消尚未结算的账单'],
  ['enemy.hp > 0', '换门不能在 Boss 死亡后触发'],
  ['enemy.maxHp * COLLECTOR_RELOCATE_DAMAGE_RATIO', '换门没有使用最大生命比例阈值'],
  ['enemy.relocateFromX = enemy.x;', '换门没有记录旧门 X'],
  ['enemy.relocateFromY = enemy.y;', '换门没有记录旧门 Y'],
  ['private renderCollectorBillStorm(enemy: EnemyUnit): void', '缺少账单风暴专用渲染'],
  ['for (let receipt = 0; receipt < 12; receipt += 1)', '账单风暴不是十二张票据'],
  ['for (let stamp = 0; stamp < 8; stamp += 1)', '账单风暴缺少八枚催缴章'],
  ["ctx.fillText('2零钱'", '账单风暴没有显示真实零钱代价'],
  ["ctx.fillText('8生命'", '账单风暴没有显示真实生命代价'],
  ['private renderCollectorRelocation(enemy: EnemyUnit): void', '缺少换门专用渲染'],
  ['for (let door = 0; door < 6; door += 1)', '换门不是六层门影'],
  ['for (let tag = 0; tag < 14; tag += 1)', '换门缺少十四枚地址标签'],
  ['this.heroX + (pullX / pullDistance) * 54', '上门没有拖近 54px'],
  ['for (let link = 1; link <= 12; link += 1)', '上门结算缺少十二段票据链爆发'],
  ["action === 'collector-boss-hazards'", '缺少催收 Boss 确定性审阅入口'],
  ["variant === 'bill-coins'", '缺少账单扣钱原子场景'],
  ["variant === 'bill-life'", '缺少账单扣血原子场景'],
  ["variant === 'bill-kill'", '缺少击败 Boss 取消账单原子场景'],
  ["variant === 'drag-hit'", '缺少上门圈内原子场景'],
  ["variant === 'drag-dodge'", '缺少上门圈外原子场景'],
  ["variant === 'relocate-trigger'", '缺少承伤换门原子场景'],
  ["variant === 'stack-art'", '缺少十二怪催收叠场'],
  ['collector: {', '开发状态没有暴露催收机制'],
  ['dragRadius: COLLECTOR_DRAG_RADIUS', '开发状态没有暴露上门真实半径'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['relocateFromX?: number;', '敌人状态缺少换门旧位置 X'],
  ['relocateFromY?: number;', '敌人状态缺少换门旧位置 Y'],
] ) requireToken(types, token, message);

for (const [token, message] of [
  ["'debt-collector-skills': { frame: 48, rows: 3, display: 128,", '催收技能图集规格没有接入渲染器'],
  ["'collector-bill': { asset: 'debt-collector-skills', row: 0 }", '寄账单没有映射第一行'],
  ["'collector-drag': { asset: 'debt-collector-skills', row: 1 }", '上门拖拽没有映射第二行'],
  ["'collector-relocate': { asset: 'debt-collector-skills', row: 2 }", '换个门没有映射第三行'],
] ) requireToken(renderer, token, message);

checks += 5;
if (manifest.assets['debt-collector-skills']?.rows !== 3) errors.push('正式清单的催收图集不是三行');
if (manifest.skills['collector-bill']?.row !== 0) errors.push('正式清单寄账单行漂移');
if (manifest.skills['collector-drag']?.row !== 1) errors.push('正式清单上门拖拽行漂移');
if (manifest.skills['collector-relocate']?.row !== 2) errors.push('正式清单换个门行漂移');
if (Object.keys(manifest.skills).length !== 41) errors.push(`Boss 技能动作应保持 41 招，实际 ${Object.keys(manifest.skills).length}`);

for (const [sourceDoc, label] of [[canon, '正典'], [plan, '升级计划']]) {
  requireToken(sourceDoc, '3.5 秒', `${label}缺少账单窗口`);
  requireToken(sourceDoc, '2 零钱', `${label}缺少账单零钱代价`);
  requireToken(sourceDoc, '8 生命', `${label}缺少账单生命代价`);
  requireToken(sourceDoc, '280px', `${label}缺少上门圆域`);
  requireToken(sourceDoc, '54px', `${label}缺少上门拖行距离`);
  requireToken(sourceDoc, '14%', `${label}缺少换门承伤阈值`);
  requireToken(sourceDoc, '六层门影', `${label}缺少换门夸张表现合同`);
  requireToken(sourceDoc, '全局滤镜', `${label}缺少特效边界`);
}

for (const [token, message] of [
  ['每 7 秒寄账单，3.5 秒后扣 2 零钱或 8 生命', '百科缺少账单完整数值'],
  ['280px 圆域把人拖近 54px', '百科缺少上门真实几何'],
  ['最大生命 14%', '百科缺少换门承伤阈值'],
  ['十二张票据、票据链与六层门影', '百科缺少三招夸张表现'],
  ['《寄账单》 · 4 帧', '百科逐帧画廊缺少寄账单动作'],
  ['《上门拖拽》 · 4 帧', '百科逐帧画廊缺少上门动作'],
  ['《换个门》 · 4 帧', '百科逐帧画廊缺少换门动作'],
] ) requireToken(wiki, token, message);

requireToken(packageJson, '"validate:collector-boss"', 'package.json 缺少催收 Boss 专项门禁');
requireToken(packageScript, 'npm run validate:collector-boss', '正式打包没有执行催收 Boss 专项门禁');
requireToken(packageScript, 'npm run validate:boss-skills', '正式打包没有执行 Boss 技能图集门禁');

const billRenderStart = game.indexOf('private renderCollectorBillStorm(enemy: EnemyUnit): void');
const collectorRenderEnd = game.indexOf('private renderBossTelegraph(enemy: EnemyUnit): void', billRenderStart);
const collectorRender = billRenderStart >= 0 && collectorRenderEnd > billRenderStart
  ? game.slice(billRenderStart, collectorRenderEnd)
  : '';
checks += 3;
if (!collectorRender) errors.push('催收局部渲染方法边界丢失');
if (collectorRender.includes('createPattern(')) errors.push('催收局部特效退化成重复网格纹理');
if (collectorRender.includes('ctx.filter')) errors.push('催收局部特效使用了全局滤镜');

const pngDimensions = async (path) => {
  const buffer = await readFile(resolve(process.cwd(), path));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};
const [atlasDimensions, identityDimensions] = await Promise.all([
  pngDimensions(paths.atlas),
  pngDimensions(paths.identity),
]);
checks += assetStats.length + 2;
assetStats.forEach((entry, index) => {
  if (entry.size <= 0) errors.push(`催收正式资源为空：${Object.values(paths)[index]}`);
});
if (atlasDimensions.width !== 192 || atlasDimensions.height !== 144) errors.push(`催收技能图集尺寸漂移：${atlasDimensions.width}x${atlasDimensions.height}`);
if (identityDimensions.width !== 192 || identityDimensions.height !== 240) errors.push(`催收身份图集尺寸漂移：${identityDimensions.width}x${identityDimensions.height}`);

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  bill: '3.5s -> 2 coins or 8 hp; 12 receipts + 8 stamps',
  drag: '0.85s -> radius280 -> pull54 -> 1 coin or 5 hp; 12 settlement links',
  relocate: '14% max-hp damage -> 6 door echoes + 14 address tags; no path damage',
  assets: { atlas: atlasDimensions, identity: identityDimensions },
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
