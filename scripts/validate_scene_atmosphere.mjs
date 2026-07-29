import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const game = await readFile(resolve(process.cwd(), 'src/game.ts'), 'utf8');
const enemyPixel = await readFile(resolve(process.cwd(), 'src/enemy-pixel.ts'), 'utf8');
const start = game.indexOf('private renderStageAtmosphere(');
const end = game.indexOf('private drawBossArenaCross(', start);
const source = start >= 0 && end > start ? game.slice(start, end) : '';
const bossStart = game.indexOf('private renderBossArena(');
const bossEnd = game.indexOf('private renderAtmosphereSurprise(', bossStart);
const bossSource = bossStart >= 0 && bossEnd > bossStart ? game.slice(bossStart, bossEnd) : '';
const floorStart = game.indexOf('private renderStageClutterFloor(');
const floorEnd = game.indexOf('private renderLifePropClusters(', floorStart);
const floorSource = floorStart >= 0 && floorEnd > floorStart ? game.slice(floorStart, floorEnd) : '';
const propStart = game.indexOf('private renderLifePropClusters(');
const propEnd = game.indexOf('private drawEmergingLifeProp(', propStart);
const propSource = propStart >= 0 && propEnd > propStart ? game.slice(propStart, propEnd) : '';
const worldStart = game.indexOf('private renderWorld(');
const worldEnd = game.indexOf('private renderStageClutterFloor(', worldStart);
const worldSource = worldStart >= 0 && worldEnd > worldStart ? game.slice(worldStart, worldEnd) : '';
const telegraphStart = game.indexOf('private renderBossTelegraph(');
const telegraphEnd = game.indexOf('private drawEnemy(', telegraphStart);
const telegraphSource = telegraphStart >= 0 && telegraphEnd > telegraphStart ? game.slice(telegraphStart, telegraphEnd) : '';
const lungeStart = game.indexOf('private bossLunge(');
const lungeEnd = game.indexOf('private showFatherAttackNameOnce(', lungeStart);
const lungeSource = lungeStart >= 0 && lungeEnd > lungeStart ? game.slice(lungeStart, lungeEnd) : '';
const strikeStart = game.indexOf('private resolveBossStrike(');
const strikeEnd = game.indexOf('private bossLunge(', strikeStart);
const strikeSource = strikeStart >= 0 && strikeEnd > strikeStart ? game.slice(strikeStart, strikeEnd) : '';
const projectileStart = game.indexOf('private renderProjectiles(');
const projectileEnd = game.indexOf('private renderComboReveal(', projectileStart);
const projectileSource = projectileStart >= 0 && projectileEnd > projectileStart ? game.slice(projectileStart, projectileEnd) : '';
const burstStart = game.indexOf('private renderBursts(');
const burstEnd = game.indexOf('private renderPoisonStrip(', burstStart);
const burstSource = burstStart >= 0 && burstEnd > burstStart ? game.slice(burstStart, burstEnd) : '';
const stressStart = game.indexOf('private setupCombatStressAudit(');
const stressEnd = game.indexOf('private setupProjectileFormAudit(', stressStart);
const stressSource = stressStart >= 0 && stressEnd > stressStart ? game.slice(stressStart, stressEnd) : '';
const transitionStart = game.indexOf('private renderScreenTransition(');
const transitionEnd = game.indexOf('private render(): void', transitionStart);
const transitionSource = transitionStart >= 0 && transitionEnd > transitionStart ? game.slice(transitionStart, transitionEnd) : '';
const errors = [];

for (const token of [
  '`${Math.ceil(this.hero.hp)} / ${Math.ceil(this.hero.maxHp)}`',
  '`${Math.ceil(activeBoss.hp)} / ${Math.ceil(activeBoss.maxHp)}`',
]) {
  if (!game.includes(token)) errors.push(`health display must use one rounding rule for current and maximum values: ${token}`);
}

if (!source) errors.push('renderStageAtmosphere method not found');
for (const token of [
  'shadowSway',
  'fillRect(22, 438, 316, 2)',
  'fillRect(40, 104, 280, 2)',
  'fillRect(18, 438, 324, 2)',
  'fillRect(14, 536, 332, 1)',
]) {
  if (source.includes(token)) errors.push(`moving grid residue remains: ${token}`);
}
if (!source.includes('loose paper scraps replace notebook rules')) {
  errors.push('school atmosphere is missing the discrete-scrap implementation');
}
if (!source.includes('scattered form scraps imply paperwork without rows')) {
  errors.push('office atmosphere is missing the discrete-scrap implementation');
}
if (!game.includes('this.renderStageClutterFloor(next, blend);\n')
  || game.indexOf('this.renderStageClutterFloor(next, blend);') > game.indexOf('this.renderStageAtmosphere(stage, next, blend);')) {
  errors.push('stage background must render after base floor and before stage atmosphere');
}
if (!game.includes('this.renderStageAtmosphere(stage, next, blend);\n    this.renderBossArena();')) {
  errors.push('boss arena must render after stage atmosphere and before world-space entities');
}
if (!floorSource) {
  errors.push('renderStageClutterFloor method not found');
} else {
  for (const token of [
    'stageClutterFloors.frame(this.encounterIndex)',
    'stageClutterFloors.frame(this.encounterIndex + 1)',
    'ctx.globalAlpha = 1 - transition',
    'ctx.globalAlpha = transition',
  ]) {
    if (!floorSource.includes(token)) errors.push(`stage background crossfade missing: ${token}`);
  }
  if (floorSource.includes('ctx.filter') || floorSource.includes('createPattern(')) {
    errors.push('stage backgrounds must be six real images, not filters or repeated patterns');
  }
}
if (!propSource) {
  errors.push('renderLifePropClusters method not found');
} else {
  if (!propSource.includes('const cell = 180;')) errors.push('life prop clusters have regressed to a dense repeating grid');
  if (!propSource.includes('const clusterCount = 2 +')) errors.push('life prop clusters must stay sparse and irregular');
}
if (!worldSource) {
  errors.push('renderWorld method not found');
} else {
  const layerOrder = [
    'this.renderProjectiles();',
    'this.renderBursts();',
    'this.renderEnemyThreatTelegraphs();',
    'this.renderEnemies();',
    'this.drawHero(',
  ].map((token) => worldSource.indexOf(token));
  if (layerOrder.some((position) => position < 0)
    || layerOrder.some((position, index) => index > 0 && position <= layerOrder[index - 1])) {
    errors.push('friendly VFX, danger telegraphs, enemies and hero are not layered in readability order');
  }
}
if (!telegraphSource) {
  errors.push('renderBossTelegraph method not found');
} else {
  for (const token of ['edge: \'#df4d70\'', 'const chevronSpan = Math.min(band * 0.6, 11)', 'distance += 42']) {
    if (!telegraphSource.includes(token)) errors.push(`directional warning readability token missing: ${token}`);
  }
  for (const token of [
    'let start = s.start ?? enemy.radius * 0.5;',
    'const warningLength = Math.max(0, reach - start);',
    'ctx.fillRect(start, -band, warningLength, band * 2);',
    'ctx.fillRect(start, -2, warningLength * charge, 4);',
  ]) {
    if (!telegraphSource.includes(token)) errors.push(`directional warning geometry contract missing: ${token}`);
  }
  if (telegraphSource.includes('ctx.fillRect(distance, -band, 3, band * 2)')) {
    errors.push('directional warning has regressed to full-height repeating grid bars');
  }
  for (const token of [
    "enemy.attackKind === 'collector-drag'",
    'ctx.arc(enemy.x, enemy.y, COLLECTOR_DRAG_RADIUS, 0, Math.PI * 2);',
    "COLLECTOR_DRAG_RADIUS,\n          '#d94b61'",
    'COLLECTOR_DRAG_RADIUS - dragCharge * (COLLECTOR_DRAG_RADIUS - enemy.radius - 18)',
    'start: BUS_DASH_SWEEP_START',
    'reach: BUS_DASH_SWEEP_REACH',
    'band: BUS_BODY_HALF_WIDTH',
    'let start = s.start ?? enemy.radius * 0.5;',
  ]) {
    if (!telegraphSource.includes(token)) errors.push(`collector drag radial warning contract missing: ${token}`);
  }
}
if (!game.includes('const COLLECTOR_DRAG_RADIUS = 280;')) {
  errors.push('collector drag radius must remain a named shared geometry constant');
}
for (const token of [
  'const PRAISE_SLAM_RADIUS = 230;',
  'ctx.arc(0, 0, PRAISE_SLAM_RADIUS, 0, Math.PI * 2);',
  "PRAISE_SLAM_RADIUS,\n          '#d94b61'",
  'PRAISE_SLAM_RADIUS - slamCharge * 40',
]) {
  if (!game.includes(token)) errors.push(`praise slam fixed-boundary warning contract missing: ${token}`);
}
for (const token of [
  'private fatherChargeGeometry(enemy: EnemyUnit, angle: number)',
  'start: -FATHER_CHARGE_HIT_OVERHANG',
  'reach: travel + (blockedByCoat ? 0 : FATHER_CHARGE_HIT_OVERHANG)',
  'band: FATHER_CHARGE_HALF_WIDTH',
  'const charge = this.fatherChargeGeometry(enemy, chargeAngle);',
  'heroAlong > charge.start && heroAlong < charge.reach && heroPerp < charge.band',
  'const chargeGeometry = this.fatherChargeGeometry(enemy, enemy.attackAngle);',
]) {
  if (!game.includes(token)) errors.push(`father charge shared geometry contract missing: ${token}`);
}
if (game.includes('if (!hitCoat && heroAlong')) {
  errors.push('father charge still makes the full pre-coat path harmless whenever the coat blocks later');
}
for (const token of [
  'const BUS_DASH_SPEED = 340;',
  'const BUS_DASH_DURATION = 1.1;',
  'const BUS_DASH_SWEEP_START = -BUS_BODY_HALF_LENGTH;',
  'const BUS_DASH_SWEEP_REACH = BUS_DASH_SPEED * BUS_DASH_DURATION + BUS_BODY_HALF_LENGTH;',
  'enemy.mechTimer >= BUS_DASH_DURATION',
  'Math.cos(dashAngle) * BUS_DASH_SPEED * dt',
  'Math.sin(dashAngle) * BUS_DASH_SPEED * dt',
]) {
  if (!game.includes(token)) errors.push(`last bus swept-body geometry contract missing: ${token}`);
}
for (const token of [
  'const COAT_SLEEVE_REACH = 165;',
  'const COAT_SLEEVE_HALF_WIDTH = 26;',
  'const COAT_DOUBLE_SLEEVE_HALF_WIDTH = 46;',
  "enemy.attackKind = doubleSleeve ? 'double-sleeve' : 'sleeve';",
  "case 'double-sleeve':",
  'reach: COAT_SLEEVE_REACH, band: COAT_DOUBLE_SLEEVE_HALF_WIDTH, dmg: 6',
  "'double-sleeve': { windup: 0.8, reach: COAT_SLEEVE_REACH, band: COAT_DOUBLE_SLEEVE_HALF_WIDTH",
]) {
  if (!game.includes(token)) errors.push(`coat-rack double-sleeve gameplay contract missing: ${token}`);
}
for (const token of [
  'const LANTERN_PREVIOUS_LIFE_ROSTER:',
  "['cry-moth', 'fear', 'hunger-shadow']",
  "['red-mark', 'others-paper', 'sign-here']",
  "['id-scanner', 'task-simple', 'task-revise']",
  "['missed-call', 'desk-lamp', 'reheated-pot']",
  "['meeting-door', 'checkup-report', 'debt']",
  'const waveIndex = enemy.lanternWaveIndex ?? 0;',
  'enemy.lanternWaveIndex = waveIndex + 1;',
  "if (enemy.type !== 'revolving-lantern') coins += this.redPacketDrop(enemy);",
  'this.lanternHandoff = { startX: enemy.x, startY: enemy.y, startedAt: this.battleTime };',
  'private lanternHandoffPose()',
  'this.pixelEnemies.drawHandoff(this.ctx, {',
  'const targetX = this.darkCX - 54;',
  'const targetY = this.darkCY - 70;',
]) {
  if (!game.includes(token)) errors.push(`revolving-lantern lifecycle contract missing: ${token}`);
}

// 走马灯死亡分支守的是两条不变量，不再锁某一行字面量：
// ①它按设计不掉道具、不开奖励页，所以必须在奖励流程之前 early return；
// ②但精英记账要落下，否则本章进度里它等于没被打过（断点续局会以为精英还在）。
const lanternDeathAnchor = game.indexOf("if (enemy.type !== 'revolving-lantern') coins += this.redPacketDrop(enemy);");
const lanternDeathSection = lanternDeathAnchor >= 0 ? game.slice(lanternDeathAnchor, lanternDeathAnchor + 1200) : '';
const lanternReturnAt = lanternDeathSection.indexOf("if (enemy.type === 'revolving-lantern')");
const lanternRewardAt = lanternDeathSection.indexOf('this.openDefeatItemReward(');
if (lanternReturnAt < 0) {
  errors.push('走马灯死亡分支不见了：它不掉道具、不开奖励页的出口没有了');
} else {
  const lanternBranch = lanternDeathSection.slice(lanternReturnAt, lanternRewardAt > lanternReturnAt ? lanternRewardAt : undefined);
  if (!/\breturn;/.test(lanternBranch)) errors.push('走马灯死亡分支必须在奖励流程之前 return');
  if (!lanternBranch.includes('this.stageEliteDefeated = true;')) errors.push('走马灯打灭后没有记账为本章精英已解决');
}
if (game.includes("'last-bus-dash': { windup: 0.8, reach: 390, band: 28")) {
  errors.push('last bus warning has regressed to the shorter and narrower pre-body lane');
}
if (!strikeSource) {
  errors.push('resolveBossStrike method not found');
} else {
  if (!strikeSource.includes('pullDistance < COLLECTOR_DRAG_RADIUS')) {
    errors.push('collector drag resolution does not share the telegraph radius');
  }
  if (!strikeSource.includes('slamDist < PRAISE_SLAM_RADIUS')
    || !strikeSource.includes('slamDist / PRAISE_SLAM_RADIUS')) {
    errors.push('praise slam resolution does not share the fixed telegraph radius');
  }
}
if (!lungeSource) {
  errors.push('bossLunge method not found');
} else {
  for (const token of [
    'const strikeX = enemy.x;',
    'const strikeY = enemy.y;',
    'const relX = this.heroX - strikeX;',
    'const relY = this.heroY - strikeY;',
    'const start = enemy.radius * 0.5;',
    'along > start && along < opts.reach && perp < opts.band',
    'enemy.x = strikeX + dirX * opts.lunge;',
    'enemy.y = strikeY + dirY * opts.lunge;',
  ]) {
    if (!lungeSource.includes(token)) errors.push(`boss strike geometry contract missing: ${token}`);
  }
  if (lungeSource.includes('const relX = this.heroX - enemy.x;')) {
    errors.push('boss strike hit band is still shifted by the post-lunge position');
  }
}
if (!projectileSource.includes("projectile.poolPriority === 'secondary'")
  || !projectileSource.includes('protectedOrbit')
  || !projectileSource.includes('visualBudget.trailStride')
  || !projectileSource.includes('!secondary && visualBudget.coreLift')
  || !game.includes('renderedProjectiles: this.projectiles.length')
  || !game.includes('coreProjectileLift: visualBudget.coreLift')) {
  errors.push('secondary projectile rendering is missing its high-load visual budget');
}
if (!burstSource.includes("burst.kind === 'word' || burst.kind === 'syn'")
  || !burstSource.includes('this.bursts.length >= 120')) {
  errors.push('ordinary burst rendering is missing its high-load visual budget or important-effect exemption');
}
if (!stressSource) {
  errors.push('saturated combat audit setup is missing');
} else {
  for (const token of [
    'MAX_ALIVE_ENEMIES',
    "? 'closet-dark'",
    "enemy.attackKind = 'shadow'",
    'MAX_PROJECTILES + 60',
    'MAX_PENDING_SHOTS + 35',
    'MAX_BURSTS + 35',
  ]) {
    if (!stressSource.includes(token)) errors.push(`saturated combat audit does not exercise ${token}`);
  }
}
for (const token of [
  'private setupProjectileComboStressAudit()',
  "if (action === 'projectile-combo-stress') this.setupProjectileComboStressAudit()",
  "'five-ha', 'marble', 'ai-chat', 'year-report', 'missing-photo', 'pregnancy-test'",
  'this.spawnOrbitRing();',
  'this.fireBaseVolley();',
]) {
  if (!game.includes(token)) errors.push(`real projectile composition stress contract missing: ${token}`);
}
for (const token of [
  'private setupLanternHordeStressAudit()',
  'LANTERN_HORDE_CAP - 1',
  'shadow.lanternSummon = true',
  "if (action === 'lantern-stress') this.setupLanternHordeStressAudit()",
  'if (!enemy.lanternSummon)',
]) {
  if (!game.includes(token)) errors.push(`lantern horde stress/readability contract missing: ${token}`);
}
for (const token of [
  '!enemy.lanternSummon',
  'enemy.lanternSummon ? 0.68 : 1',
  'if (screenLift)',
  'target.globalAlpha = 0.12 * opacity',
]) {
  if (!enemyPixel.includes(token)) errors.push(`lantern shadow single-pass contract missing: ${token}`);
}
if (!bossSource) {
  errors.push('renderBossArena method not found');
} else {
  for (const bossType of [
    'closet-dark',
    'uniform-answer',
    'last-bus',
    'silent-father',
    'debt-collector',
    'lamp-keeper',
  ]) {
    if (!bossSource.includes(`boss.type === '${bossType}'`)) {
      errors.push(`boss arena missing runtime branch: ${bossType}`);
    }
  }
  for (const stateToken of ['windupTimer', 'mechTimer', 'billTimer', 'darkR']) {
    if (!bossSource.includes(stateToken)) errors.push(`boss arena is not bound to runtime state: ${stateToken}`);
  }
  if (bossSource.includes('strokeRect(0, 0') || bossSource.includes('strokeRect(4, 4')) {
    errors.push('boss arena contains a continuous screen-edge frame');
  }
}
if (game.includes('this.ctx.strokeRect(4, 4, W - 8, H - 8);')) {
  errors.push('low-health warning still draws a continuous edge frame');
}
if (!game.includes('private renderLowHealthWarning()') || !game.includes('const span = 18 - step * 4;')) {
  errors.push('low-health warning is missing the discrete corner implementation');
}
if (!game.includes('this.darknessStartedAt = this.battleTime;')
  || !game.includes('(this.battleTime - this.darknessStartedAt) / DARKNESS_SHRINK')) {
  errors.push('final darkness must begin a full shrink countdown after the stage elite is defeated');
}
if (game.includes('(this.battleTime - DARKNESS_START) / DARKNESS_SHRINK')) {
  errors.push('final darkness still skips ahead when the stage elite survives past its scheduled start');
}
if (!transitionSource) {
  errors.push('renderScreenTransition method not found');
} else {
  for (const token of [
    'W / 2 - travel',
    'W / 2 + travel',
    'const edgeX = W - travel',
    'const topHeight =',
    'const bottomY =',
  ]) {
    if (transitionSource.includes(token)) errors.push(`screen transition restores a moving long edge: ${token}`);
  }
  if (!transitionSource.includes('ctx.globalAlpha = 1 - progress')
    || !transitionSource.includes('ctx.drawImage(this.transitionFrame, 0, 0, W, H)')) {
    errors.push('ordinary screen transitions must use a spatially uniform whole-frame crossfade');
  }
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  policy: 'battle atmosphere uses isolated marks and state-bound boss arenas; no long moving grid or edge bands',
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
