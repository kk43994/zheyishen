import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const paths = {
  raw: 'output/imagegen/zhe-yi-shen-boss-skills-v1/raw/closet-dark-extra-skills-v1.png',
  atlas: 'src/assets/enemies/boss-skills-v1/closet-dark-extra-skills.png',
  base: 'src/assets/enemies/closet-dark-hd.png',
  prompt: 'scripts/image2/boss-skills-v1/prompts/closet-dark-extra-skills.txt',
};
const requiredAssets = [paths.atlas, paths.base];

const [game, types, renderer, sourceText, runtimeText, canon, plan, wiki, packageJson, packageScript, prompt, ...assetStats] = await Promise.all([
  read('src/game.ts'),
  read('src/types.ts'),
  read('src/boss-skill-pixel.ts'),
  read('scripts/image2/boss-skills-v1/manifest.json'),
  read('src/assets/enemies/boss-skills-v1/manifest.json'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
  read('package.json'),
  read('scripts/package.sh'),
  read(paths.prompt),
  ...requiredAssets.map((path) => stat(resolve(process.cwd(), path))),
]);
const source = JSON.parse(sourceText);
const runtime = JSON.parse(runtimeText);
const errors = [];
let checks = 0;
const requireToken = (text, token, message) => {
  checks += 1;
  if (!text.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ['const CLOSET_ATTACK_INTERVAL = 3.8;', '衣柜一阶段循环间隔不是 3.8 秒'],
  ['const CLOSET_PHASE_TWO_INTERVAL = 3.25;', '衣柜二阶段循环间隔不是 3.25 秒'],
  ['const CLOSET_SHADOW_WINDUP = 0.85;', '影子压来前摇不是 0.85 秒'],
  ['const CLOSET_HANDS_WINDUP = 0.95;', '里面还有手前摇不是 0.95 秒'],
  ['const CLOSET_HANDS_RADIUS = 132;', '影手锁点半径不是 132px'],
  ['const CLOSET_HANDS_SAFE_INNER_RADIUS = 30;', '影手中心危险半径不是 30px'],
  ['const CLOSET_HANDS_SAFE_HALF_ANGLE = 0.48;', '影手缺口半角不是 0.48rad'],
  ['const CLOSET_SLAM_WINDUP = 0.8;', '门要关了前摇不是 0.8 秒'],
  ['const CLOSET_SLAM_HALF_WIDTH = 42;', '闭门判定半宽不是 42px'],
  ['const CLOSET_SLAM_HALF_HEIGHT = 96;', '闭门判定半高不是 96px'],
  ['const move = this.closetMoveIndex % 4;', '衣柜没有固定四招循环'],
  ['this.closetMoveIndex += 1;', '衣柜出招后没有推进循环'],
  ["enemy.attackKind = 'shadow';", '影子压来没有进入前摇派发'],
  ["enemy.attackKind = 'closet-hands';", '里面还有手没有进入前摇派发'],
  ["enemy.attackKind = 'closet-slam';", '门要关了没有进入前摇派发'],
  ["this.playBossAnimation(enemy, 'closet-shadow', 1.3)", '影子压来动作没有覆盖真实结算帧'],
  ["this.playBossAnimation(enemy, 'closet-hands'", '里面还有手没有专用动作'],
  ["this.playBossAnimation(enemy, 'closet-slam'", '门要关了没有专用动作'],
  ["case 'closet-hands':", '里面还有手没有独立结算分支'],
  ["case 'closet-slam':", '门要关了没有独立结算分支'],
  ['distance <= CLOSET_HANDS_RADIUS + 12 && !insideSafeWedge', '影手命中没有共用半径与缺口'],
  ['dx <= CLOSET_SLAM_HALF_WIDTH + 10 && dy <= CLOSET_SLAM_HALF_HEIGHT + 10', '闭门命中没有共用门框几何'],
  ["this.hurtHero(5, `${enemy.name} · 里面还有手`)", '影手伤害不是 5'],
  ["this.hurtHero(6, `${enemy.name} · 门要关了`)", '闭门伤害不是 6'],
  ['this.heroX += pushDirection * 32', '闭门命中没有按世界坐标横推 32px'],
  ['private renderClosetHandsTelegraph(enemy: EnemyUnit): void', '缺少影手专用预警渲染'],
  ['private renderClosetSlamTelegraph(enemy: EnemyUnit): void', '缺少闭门专用预警渲染'],
  ['for (let hand = 0; hand < 12; hand += 1)', '影手视觉不是十二向'],
  ["boss.attackKind === 'shadow' && boss.attackAngle !== undefined", '衣柜背景影锥仍会污染局部招式'],
  ["action === 'childhood-boss-hazards'", '缺少童年 Boss 确定性审阅入口'],
  ["variant === 'hands-hit'", '缺少影手命中原子场景'],
  ["variant === 'hands-dodge'", '缺少影手缺口闪避场景'],
  ["variant === 'slam-hit'", '缺少闭门命中原子场景'],
  ["variant === 'slam-dodge'", '缺少闭门横移闪避场景'],
  ["variant === 'stack-art'", '缺少十二怪夸张叠场'],
  ['bossMechanics: {', '开发状态缺少 Boss 机制总表'],
  ['closet: {', '开发状态没有暴露衣柜招式'],
] ) requireToken(game, token, message);

checks += 1;
const closetSlamBlock = game.slice(game.indexOf("case 'closet-slam':"), game.indexOf("case 'sleeve':"));
if ((closetSlamBlock.match(/count:\s*6/g) ?? []).length < 2
  || !/count:\s*4/.test(closetSlamBlock)
  || !closetSlamBlock.includes("shape: 'streak'")) {
  errors.push('闭门缺少两束克制木屑与中线碎点');
}

for (const [token, message] of [
  ['attackTargetX?: number;', '敌人状态缺少 Boss 锁点 X'],
  ['attackTargetY?: number;', '敌人状态缺少 Boss 锁点 Y'],
  ['attackSafeAngle?: number;', '敌人状态缺少影手安全角'],
] ) requireToken(types, token, message);

for (const [token, message] of [
  ["| 'closet-shadow' | 'closet-split' | 'closet-hands' | 'closet-slam'", 'Boss 技能类型没有两招追加动作'],
  ["'closet-dark-extra-skills': { frame: 48, rows: 2, display: 128,", '追加图集规格没有接入渲染器'],
  ["'closet-hands': { asset: 'closet-dark-extra-skills', row: 0 }", '影手没有映射追加图集第一行'],
  ["'closet-slam': { asset: 'closet-dark-extra-skills', row: 1 }", '闭门没有映射追加图集第二行'],
] ) requireToken(renderer, token, message);

checks += 8;
const extraSource = source.assets.find((asset) => asset.id === 'closet-dark-extra-skills');
if (!extraSource) errors.push('Image2 源清单缺少衣柜追加图集');
if (extraSource?.reference !== 'closet-dark-hd.png') errors.push('衣柜追加图集没有使用正式衣柜身份参考');
if (extraSource?.frame !== 48 || extraSource?.display !== 128) errors.push('衣柜追加图集帧尺寸或显示尺寸漂移');
if (extraSource?.skills?.map((skill) => skill.id).join(',') !== 'closet-hands,closet-slam') errors.push('衣柜追加图集两行顺序漂移');
if (Object.keys(runtime.assets).length !== 16) errors.push(`Boss 技能图集应为 16 张，实际 ${Object.keys(runtime.assets).length}`);
if (Object.keys(runtime.assets).filter((id) => !id.endsWith('-extra-skills')).length !== 15) errors.push('追加图集被错误计为新的 Boss 阶段形态');
if (Object.keys(runtime.skills).length !== 41) errors.push(`Boss 技能动作应为 41 招，实际 ${Object.keys(runtime.skills).length}`);
if (runtime.skills['closet-hands']?.row !== 0 || runtime.skills['closet-slam']?.row !== 1) errors.push('正式技能清单的衣柜追加行漂移');

for (const [token, message] of [
  ['twin wooden doors slamming inward', 'Image2 提示词没有锁定双门夹击姿态'],
  ['ten exaggerated long shadow hands', 'Image2 提示词没有锁定夸张影手姿态'],
  ['exact haunted antique wardrobe identity', 'Image2 提示词没有锁定同一衣柜身份'],
  ['perfectly flat solid #00ff00 chroma key', 'Image2 提示词没有锁定纯绿幕'],
  ['no shadows, floor, scenery, labels, borders, grid lines', 'Image2 提示词没有禁止背景线和网格'],
] ) requireToken(prompt, token, message);

for (const [sourceDoc, label] of [[canon, '正典'], [plan, '升级计划']]) {
  requireToken(sourceDoc, '《里面还有手》', `${label}缺少影手招式`);
  requireToken(sourceDoc, '《门要关了》', `${label}缺少闭门招式`);
  requireToken(sourceDoc, '半径 132px', `${label}缺少影手锁点半径`);
  requireToken(sourceDoc, '中心 30px', `${label}缺少影手中心危险区`);
  requireToken(sourceDoc, '0.48rad', `${label}缺少影手安全缺口角`);
  requireToken(sourceDoc, '42px 半宽、96px 半高', `${label}缺少闭门真实判定`);
  requireToken(sourceDoc, '3.25 秒', `${label}缺少半血加速节奏`);
  requireToken(sourceDoc, '不得扩成无端点移动网格、四周装饰线或全局滤镜', `${label}缺少夸张特效禁线边界`);
}

for (const [token, message] of [
  ['《影子压来》·《里面还有手》·《门要关了》·《缝里看你》；《衣柜裂开》为半血转阶段（非主动招式）', '百科缺少衣柜四招与半血转阶段说明'],
  ['0.95 秒十二向影手锁定半径 132px', '百科没有记录影手数值'],
  ['±0.48rad 扇形缺口', '百科没有记录影手缺口'],
  ['半宽 42px、半高 96px', '百科没有记录闭门尺寸'],
  ['3.25 秒但不扩大判定', '百科没有记录半血节奏与范围约束'],
  ['《里面还有手》 · 4 帧', '百科逐帧画廊缺少影手动作'],
  ['《门要关了》 · 4 帧', '百科逐帧画廊缺少闭门动作'],
] ) requireToken(wiki, token, message);

requireToken(packageJson, '"validate:childhood-boss"', 'package.json 缺少童年 Boss 专项门禁');
requireToken(packageScript, 'npm run validate:childhood-boss', '正式打包没有执行童年 Boss 专项门禁');
requireToken(packageScript, 'npm run validate:boss-skills', '正式打包没有执行 Boss 技能图集门禁');

const handsRenderStart = game.indexOf('private renderClosetHandsTelegraph(enemy: EnemyUnit): void');
const handsRenderEnd = game.indexOf('private renderClosetSlamTelegraph(enemy: EnemyUnit): void', handsRenderStart);
const slamRenderEnd = game.indexOf('private renderBossTelegraph(enemy: EnemyUnit): void', handsRenderEnd);
const closetRender = handsRenderStart >= 0 && handsRenderEnd > handsRenderStart && slamRenderEnd > handsRenderEnd
  ? game.slice(handsRenderStart, slamRenderEnd)
  : '';
checks += 3;
if (!closetRender) errors.push('衣柜两招局部渲染方法边界丢失');
if (closetRender.includes('createPattern(')) errors.push('衣柜局部特效退化成重复网格纹理');
if (closetRender.includes('ctx.filter')) errors.push('衣柜局部特效使用了全局滤镜');

const pngDimensions = async (path) => {
  const buffer = await readFile(resolve(process.cwd(), path));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};
const [rawDimensions, atlasDimensions] = await Promise.all([
  pngDimensions(paths.raw).catch(() => null),
  pngDimensions(paths.atlas),
]);
checks += assetStats.length + 2;
assetStats.forEach((entry, index) => {
  if (entry.size <= 0) errors.push(`衣柜资源为空：${requiredAssets[index]}`);
});
// output/ is local pipeline evidence rather than a release dependency. Validate it when present,
// while keeping package builds reproducible from tracked formal assets alone.
if (rawDimensions && (rawDimensions.width !== 1254 || rawDimensions.height !== 1254)) {
  errors.push(`Image2 原图尺寸漂移：${rawDimensions.width}x${rawDimensions.height}`);
}
if (atlasDimensions.width !== 192 || atlasDimensions.height !== 96) errors.push(`正式追加图集尺寸漂移：${atlasDimensions.width}x${atlasDimensions.height}`);

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  cycle: 'shadow 0.85s -> hands 0.95s -> slam 0.8s; 3.8s / phase-two 3.25s',
  collision: 'hands r132, center30, safe +/-0.48rad, damage5; slam 42x96 half-size, damage6, push32',
  art: '15 stage forms / 16 skill atlases / 41 actions / 164 frames',
  assets: { rawEvidence: rawDimensions ?? 'not present (optional)', atlas: atlasDimensions },
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
