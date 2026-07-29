import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(process.cwd());
const read = (file) => readFile(resolve(root, file), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(await read('docs/wiki-runtime-status-v1.js'), context, {
  filename: 'docs/wiki-runtime-status-v1.js',
});
const report = context.window.WIKI_RUNTIME_STATUS_V1;
const game = await read('src/game.ts');
const lifeStages = await read('src/life-stage.ts');
const wiki = await read('docs/这一身百科.html');
const bossCanon = await read('docs/六章Boss编排与传承线-v1.md');
const plan = await read('docs/升级计划最新.md');
const ui = await read('docs/wiki-runtime-ui-v1.js');
const shell = await read('docs/wiki-shell-v1.js');
const uiCss = await read('docs/wiki-runtime-v1.css');
const iconManifest = JSON.parse(await read('src/assets/items/icons.json'));
const errors = [];
const manifestationDir = resolve(root, 'docs/item-manifestations-v1');
const enemyPortraitDir = resolve(root, 'docs/enemy-portraits-v1');
let manifestationFiles = [];
try {
  manifestationFiles = (await readdir(manifestationDir)).filter((file) => file.endsWith('.png'));
} catch {
  errors.push('wiki protagonist manifestation directory is missing');
}
const enemyPortraitIds = [
  'fear', 'red-mark', 'whisper', 'clockwork', 'debt', 'uniform-answer',
  'silent-father', 'lamp-keeper', 'closet-clothes', 'wall-ranking',
  'window-desk', 'father-silence', 'whose-box', 'iv-stand', 'closet-dark',
  'last-bus', 'debt-collector', 'cry-moth', 'hunger-shadow', 'missed-bus',
  'missed-call', 'silence', 'badge-thief', 'forgetter', 'empty-chair',
  'coat-rack', 'others-paper', 'sign-here', 'id-scanner',
  'task-simple', 'task-revise', 'task-deadline', 'task-sync',
  'wet-shoes', 'desk-lamp', 'reheated-pot', 'meeting-door', 'checkup-report',
  'queue-screen', 'others-family', 'revolving-lantern', 'praise-chair', 'ringing-phone',
];
const enemyPhasePortraitIds = [
  'praise-chair-p1', 'praise-chair-p2', 'ringing-phone-p1', 'ringing-phone-p2',
];
let enemyPortraitFiles = [];
try {
  enemyPortraitFiles = (await readdir(enemyPortraitDir)).filter((file) => file.endsWith('.png'));
} catch {
  errors.push('wiki enemy portrait directory is missing');
}

if (report?.items?.length !== 77) errors.push(`wiki runtime item count must be 77, got ${report?.items?.length}`);
if (new Set(report?.items?.map((item) => item.id)).size !== 77) errors.push('wiki runtime item ids must be unique');
const qualityVItems = (report?.items ?? []).filter((item) => item.quality === 5);
if (qualityVItems.length !== 5) errors.push(`wiki runtime quality-V item count must be 5, got ${qualityVItems.length}`);
for (const id of ['admission-notice', 'iphone-17-pro-max', 'fathers-chart']) {
  if (!qualityVItems.some((item) => item.id === id)) errors.push(`wiki runtime quality-V inheritance item is missing: ${id}`);
}
if (!report?.items?.every((item, index) => item.index === index + 1)) {
  errors.push('wiki runtime item indexes must be contiguous from 1 through 77');
}
if (Object.keys(iconManifest.index ?? {}).length !== 77) {
  errors.push(`wiki item icon atlas must contain 77 entries, got ${Object.keys(iconManifest.index ?? {}).length}`);
}
const itemArchiveStart = wiki.indexOf('<div class="stage-h" id="wiki-item-archive">');
const itemArchiveEnd = wiki.indexOf('<!-- 怪物图鉴 -->', itemArchiveStart);
const itemArchiveSection = itemArchiveStart >= 0 && itemArchiveEnd > itemArchiveStart
  ? wiki.slice(itemArchiveStart, itemArchiveEnd)
  : '';
if (!itemArchiveSection) errors.push('wiki narrative appearance archive is missing');
const expectedArchiveCards = (report?.items ?? []).length;
if ((itemArchiveSection.match(/class="item"/g) ?? []).length !== expectedArchiveCards) {
  errors.push(`wiki narrative appearance archive must contain ${expectedArchiveCards} cards`);
}
if ((itemArchiveSection.match(/class="archive-item-icon"/g) ?? []).length !== expectedArchiveCards) {
  errors.push(`wiki narrative appearance archive must contain ${expectedArchiveCards} canonical icons`);
}
if (itemArchiveSection.includes('<svg')) {
  errors.push('wiki narrative appearance archive still contains legacy SVG icons');
}
for (const item of report?.items ?? []) {
  if (iconManifest.index?.[item.id] !== item.index - 1) {
    errors.push(`wiki item icon atlas index mismatch: ${item.id}`);
  }
  const atlasIndex = item.index - 1;
  const col = atlasIndex % 8;
  const row = Math.floor(atlasIndex / 8);
  const archiveCardPattern = new RegExp(
    `<div class="item" data-item-id="${item.id}" data-item-index="${item.index}">`
      + `(?:(?!<div class="item").)*?style="--icon-col:${col};--icon-row:${row}"`,
    's',
  );
  if (!archiveCardPattern.test(itemArchiveSection)) {
    errors.push(`wiki narrative appearance archive icon mismatch: ${item.id}`);
  }
  const manifestationFile = `${String(item.index).padStart(2, '0')}-${item.id}.png`;
  if (!manifestationFiles.includes(manifestationFile)) {
    errors.push(`wiki protagonist manifestation is missing: ${manifestationFile}`);
    continue;
  }
  const png = await readFile(resolve(manifestationDir, manifestationFile));
  const isPng = png.length >= 24 && png.subarray(1, 4).toString('ascii') === 'PNG';
  if (!isPng) {
    errors.push(`wiki protagonist manifestation is not a PNG: ${manifestationFile}`);
    continue;
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== 480 || height !== 250) {
    errors.push(`wiki protagonist manifestation must be 480x250: ${manifestationFile} is ${width}x${height}`);
  }
}
if (manifestationFiles.length !== 77) {
  errors.push(`wiki protagonist manifestation count must be 77, got ${manifestationFiles.length}`);
}
for (const id of [...enemyPortraitIds, ...enemyPhasePortraitIds]) {
  const portraitFile = `${id}.png`;
  if (!enemyPortraitFiles.includes(portraitFile)) {
    errors.push(`wiki enemy portrait is missing: ${portraitFile}`);
    continue;
  }
  const png = await readFile(resolve(enemyPortraitDir, portraitFile));
  const isPng = png.length >= 24 && png.subarray(1, 4).toString('ascii') === 'PNG';
  if (!isPng) {
    errors.push(`wiki enemy portrait is not a PNG: ${portraitFile}`);
    continue;
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== 64 || height !== 64) {
    errors.push(`wiki enemy portrait must be 64x64: ${portraitFile} is ${width}x${height}`);
  }
}
const expectedEnemyPortraitCount = enemyPortraitIds.length + enemyPhasePortraitIds.length;
if (enemyPortraitFiles.length !== expectedEnemyPortraitCount) {
  errors.push(`wiki enemy portrait count must be ${expectedEnemyPortraitCount}, got ${enemyPortraitFiles.length}`);
}

const beastStart = wiki.indexOf('<section class="entry" id="beasts">');
// 卡片目录到本卷的美术块为止；美术块之后是敌怪图集与 Boss 逐帧，不算目录。
const beastEnd = wiki.indexOf('<!-- ART-BLOCKS:beasts-START -->', beastStart);
const beastSection = beastStart >= 0 && beastEnd > beastStart ? wiki.slice(beastStart, beastEnd) : '';
if (!beastSection) errors.push('wiki beast catalog section is missing');
if ((beastSection.match(/class="item beast"/g) ?? []).length !== enemyPortraitIds.length) {
  errors.push(`wiki beast catalog must contain ${enemyPortraitIds.length} cards`);
}
if ((beastSection.match(/class="enemy-portrait"/g) ?? []).length !== enemyPortraitIds.length + 6) {
  errors.push(`wiki beast catalog must contain ${enemyPortraitIds.length} card portraits and 6 current-roster references`);
}
if ((beastSection.match(/class="enemy-phase-portrait"/g) ?? []).length !== enemyPhasePortraitIds.length) {
  errors.push('wiki beast catalog must contain four canonical boss phase portraits');
}
if (!beastSection.includes('<div class="tbl-wrap"><table>')) {
  errors.push('wiki beast stage roster must stay inside a mobile horizontal-scroll wrapper');
}
if (beastSection.includes('src="data:image') || beastSection.includes('<svg')) {
  errors.push('wiki beast catalog still contains legacy embedded or SVG art');
}
for (const id of enemyPortraitIds) {
  if (!beastSection.includes(`enemy-portraits-v1/${id}.png`)) {
    errors.push(`wiki beast catalog is not linked to portrait: ${id}`);
  }
}
for (const id of enemyPhasePortraitIds) {
  if (!beastSection.includes(`enemy-portraits-v1/${id}.png`)) {
    errors.push(`wiki beast catalog is not linked to boss phase portrait: ${id}`);
  }
}
for (const staleCopy of ['临时复用', '待独立管线图', '当前明确标记为占位', '暂复用空椅']) {
  if (beastSection.includes(staleCopy)) errors.push(`wiki beast catalog still describes promoted art as a proxy: ${staleCopy}`);
}
if (report?.summary?.runtimeEvidence !== 77) errors.push(`runtime evidence must cover 77 items, got ${report?.summary?.runtimeEvidence}`);
if (report?.summary?.runtimeReviewed !== 34) errors.push(`reviewed runtime mechanics must cover 34 items, got ${report?.summary?.runtimeReviewed}`);
const expectedArtReady = 77;
if (report?.summary?.artReady !== expectedArtReady) errors.push(`runtime art must cover ${expectedArtReady} items, got ${report?.summary?.artReady}`);
if (report?.summary?.projectileItems !== 35) errors.push(`projectile item count must be 35, got ${report?.summary?.projectileItems}`);
if (report?.summary?.projectileAudits !== 35) errors.push(`projectile audit count must be 35, got ${report?.summary?.projectileAudits}`);
if (report?.summary?.combos !== 12) errors.push(`combo count must be 12, got ${report?.summary?.combos}`);
if (report?.summary?.stages !== 6) errors.push(`runtime stage count must be 6, got ${report?.summary?.stages}`);
if (report?.priorities?.find((row) => row.level === 'P0')?.count !== 0) errors.push('P0 runtime gaps must be zero');

const stageElites = [
  ['coat-rack', '立在墙角的衣架', 'coat-rack'],
  ['uniform-answer', '统一答案', 'uniform-answer'],
  ['last-bus', '错过的那一班', 'last-bus'],
  ['wet-shoes', '还没干的那双鞋', 'wet-shoes'],
  ['whose-box', '不知道是谁的纸箱', 'whose-box'],
  ['revolving-lantern', '走马灯', 'revolving-lantern'],
];
for (const [id, name, portrait] of stageElites) {
  if (!lifeStages.includes(`eliteType: '${id}'`)) errors.push(`life-stage canon is missing elite: ${id}`);
  if (!beastSection.includes(`enemy-portraits-v1/${portrait}.png`) || !beastSection.includes(name)) {
    errors.push(`wiki is missing stage elite: ${id}`);
  }
}
for (const source of [bossCanon, plan]) {
  for (const staleBusRule of [
    '打不完它就开走了',
    '本关剩余时间全程减速、掉钱',
    '它不打你，它只是不等你',
  ]) {
    if (source.includes(staleBusRule)) errors.push(`boss canon still contains the removed last-bus rule: ${staleBusRule}`);
  }
  for (const currentBusRule of [
    '冲刺后 2.5 秒进入疲惫窗口',
    '半车长 46、半车宽 30',
    '一次冲刺最多命中一次、造成 10 点伤害',
  ]) {
    if (!source.includes(currentBusRule)) errors.push(`boss canon is missing the current last-bus rule: ${currentBusRule}`);
  }
  for (const staleCoatRule of [
    '袖子伸出锥形暗影，站锥内掉血',
    '站在锥里持续掉血',
    '锥形暗影，前摇 0.8s',
  ]) {
    if (source.includes(staleCoatRule)) errors.push(`boss canon still contains the removed coat-rack rule: ${staleCoatRule}`);
  }
  for (const currentCoatRule of [
    '锁定 165px 袖影车道',
    '半血后双袖',
    '半宽 46',
  ]) {
    if (!source.includes(currentCoatRule)) errors.push(`boss canon is missing the current coat-rack rule: ${currentCoatRule}`);
  }
  if (source.includes('过程没写》：前摇 0.8s')) {
    errors.push('boss canon still describes the retired uniform-process timing: 0.8s');
  }
  for (const currentUniformRule of [
    '第一枚红叉前摇 0.9s',
    '后续每枚错开 0.1s',
  ]) {
    if (!source.includes(currentUniformRule)) errors.push(`boss canon is missing the current uniform-process timing: ${currentUniformRule}`);
  }
  for (const currentWetShoesRule of [
    '连续静止满 1.2 秒',
    '同一次连续停步只计一档',
    '每档速度 +4，上限 96',
  ]) {
    if (!source.includes(currentWetShoesRule)) errors.push(`boss canon is missing the current wet-shoes rule: ${currentWetShoesRule}`);
  }
}
for (const bossName of ['没人相信的怪物', '沉默的父亲', '你很优秀', '响个不停', '上门催收', '收灯人']) {
  if (!beastSection.includes(bossName)) errors.push(`wiki is missing current chapter boss: ${bossName}`);
}
if (!beastSection.includes('不可伤 · 接触12 · 归还进度')) {
  errors.push('wiki still presents the lamp keeper as an ordinary HP boss');
}
if (beastSection.includes('生命430+ · 伤害12')) {
  errors.push('wiki still exposes the lamp keeper internal compatibility HP as a kill objective');
}

const requiredGameProofs = [
  "this.hasItem('summer-run')",
  'SUMMER_SLIDE_DURATION',
  'this.summerSlideTimer = SUMMER_SLIDE_DURATION;',
  "this.hasItem('snow-screen') && !this.snowUsed",
  'private renderSnowInterference()',
  'this.renderSnowInterference();',
  'const BUS_BODY_HALF_LENGTH = 46;',
  'const BUS_BODY_HALF_WIDTH = 30;',
  'const BUS_DASH_SPEED = 340;',
  'const BUS_DASH_DURATION = 1.1;',
  'const COAT_SLEEVE_REACH = 165;',
  'const COAT_SLEEVE_HALF_WIDTH = 26;',
  'const COAT_DOUBLE_SLEEVE_HALF_WIDTH = 46;',
  "enemy.attackKind = doubleSleeve ? 'double-sleeve' : 'sleeve';",
  "case 'double-sleeve':",
  "telegraphVariant === 'uniform-answer-process'",
  "telegraphVariant === 'uniform-answer-pass'",
  'this.heroTrail = Array.from({ length: 24 }',
  'dangerBands: this.dangerBands.map((band) => ({',
  'const WET_SHOES_STOP_THRESHOLD = 1.2;',
  'const WET_SHOES_SPEED_STEP = 4;',
  'const WET_SHOES_MAX_SPEED = 96;',
  'if (this.heroMoving) enemy.wetShoesStopCharged = false;',
  '&& this.standStillTime >= WET_SHOES_STOP_THRESHOLD',
  'enemy.wetShoesStopCharged = true;',
  'const LANTERN_PREVIOUS_LIFE_ROSTER:',
  'const waveIndex = enemy.lanternWaveIndex ?? 0;',
  'enemy.lanternWaveIndex = waveIndex + 1;',
  "if (enemy.type !== 'revolving-lantern') coins += this.redPacketDrop(enemy);",
  "if (enemy.type === 'revolving-lantern') return;",
  'lanternSummon: Boolean(enemy.lanternSummon),',
  'lanternWaveIndex: enemy.lanternWaveIndex ?? null,',
  'this.lanternHandoff = { startX: enemy.x, startY: enemy.y, startedAt: this.battleTime };',
  'private lanternHandoffPose()',
  'this.pixelEnemies.drawHandoff(this.ctx, {',
  'this.lanternHandoff = undefined;',
  'const LAMP_STRIP_TO_RELEASE_DELAY = 3.8;',
  'const LAMP_RELEASE_CONFIRM_DELAY = 13.85;',
  "if (enemy.type === 'lamp-keeper') {",
  'private beginLampRelease(enemy: EnemyUnit)',
  'this.lampFinalStripTimer = LAMP_STRIP_TO_RELEASE_DELAY;',
  "keeper?.bossAnim === 'keeper-strip'",
  'this.projectiles = [];',
  'private releaseFinalBreath(): void',
  'private renderLampReleasePrompt(): void',
  "'放下这一口气'",
  "keeper?.bossAnim === 'keeper-dim'",
  'keeper.bossAnimTimer = Math.max(0.001,',
  "if (activeBoss.type === 'lamp-keeper') {",
  'const returned = Math.max(0, total - this.items.length);',
  "ctx.fillText(total > 0 ? `已还 ${returned} / ${total}` : '手里空了', 190, 39);",
  "this.startRun(0x20260718, true);",
  "if (enemy.type === 'last-bus') amount *= (enemy.phase ?? 0) === 3 ? 1.7 : 0.75;",
];
for (const token of requiredGameProofs) {
  if (!game.includes(token)) errors.push(`missing gameplay proof: ${token}`);
}
for (const token of [
  'wiki-runtime-v1.css',
  'id="mechanics"',
  'id="wiki-item-archive"',
  'wiki-runtime-status-v1.js',
  'wiki-runtime-ui-v1.js',
  'id="rpc-icon"',
  'id="rpc-summary"',
  'id="rpc-overlay"',
  'aria-hidden="true"',
  'item-manifestations-v1/',
  '主角实机体现',
  'enemy-portraits-v1/',
  'archive-item-icon',
]) {
  if (!wiki.includes(token)) errors.push(`wiki shell is missing: ${token}`);
}
if (wiki.includes('效果待按母表替换')) errors.push('wiki still labels its 77 visible item cards as stale');
for (const token of [
  'wiki-mechanic-search',
  'wiki-mechanic-source',
  'wiki-mechanic-role',
  'wiki-mechanic-layer',
  'syncArchiveCards',
  'buildItemCatalog',
  'item-catalog-card',
  '__wikiItemCatalogCount',
  '__wikiOpenRelic',
  "archiveHeading.hidden = true",
  'data-runtime-synced',
  '__wikiSyncedItemCards',
  "qualityNames = ['', '杂物', '旧物', '心结', '遗物', '这一身']",
  "qualityMarks = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']",
  '[1, 2, 3, 4, 5]',
  "title.textContent = report.items.length + '件 · 道具图鉴'",
  "count.textContent = report.items.length + ' 件 · 全部实装'",
]) {
  if (!ui.includes(token)) errors.push(`wiki runtime UI is missing: ${token}`);
}
for (const staleCopy of ['七十四件 · 道具图鉴', '74 件 · 全部实装']) {
  if (ui.includes(staleCopy)) errors.push(`wiki runtime UI still contains stale item count: ${staleCopy}`);
}
for (const token of [
  "document.querySelectorAll('#beasts .item.beast').forEach",
  "card.setAttribute('data-beast-detail', '1')",
  'openBeastDetail',
  'beast-detail-dialog',
]) {
  if (!shell.includes(token)) errors.push(`wiki beast detail interaction is missing: ${token}`);
}
for (const token of [
  '.item-catalog-grid',
  '.item-catalog-card',
  '../src/assets/items/icons.png',
  'repeat(2, minmax(0, 1fr))',
  '.rpc-head-main',
  '.rpc-manifestation-image',
  '.enemy-portrait',
  '.beast-detail-dialog',
  '.beast-detail-card.item.beast .enemy-phase-strip',
  '.archive-item-icon',
  '.wall-chip.wq5',
  '.wall-tile.q5::after',
  '.wall-tip.wtq5::before',
]) {
  if (!uiCss.includes(token)) errors.push(`wiki runtime CSS is missing: ${token}`);
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  summary: report?.summary,
  priorityCounts: Object.fromEntries(report?.priorities?.map((row) => [row.level, row.count]) ?? []),
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
