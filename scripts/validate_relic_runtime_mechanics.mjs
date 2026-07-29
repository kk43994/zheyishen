import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REVIEWED_RELIC_RUNTIME } from './relic-runtime-reviewed.mjs';

const root = resolve(process.cwd());
const game = await readFile(resolve(root, 'src/game.ts'), 'utf8');
const types = await readFile(resolve(root, 'src/types.ts'), 'utf8');
const checkpoint = await readFile(resolve(root, 'src/run-checkpoint.ts'), 'utf8');
const relics = await readFile(resolve(root, 'src/relics.ts'), 'utf8');
const spec = await readFile(resolve(root, 'docs/relic-production-spec-b-v1.js'), 'utf8');
const projectileDesign = await readFile(resolve(root, 'src/projectile-item-signatures.ts'), 'utf8');
const projectileManifest = await readFile(resolve(root, 'src/assets/vfx/projectiles.json'), 'utf8');
const projectileProvenance = await readFile(resolve(root, 'src/assets/vfx/projectiles.sources.json'), 'utf8');
const runtimeEvidence = [game, projectileDesign, projectileManifest, projectileProvenance].join('\n');
const errors = [];

const proofs = {
  'Image2 blunt wooden slash and shorter-range tradeoff': [
    'vector.range *= 0.65;',
    "form: 'slash', formPriority: 80",
    'runtime-scale review kept the 3:1 horizontal blunt slash',
  ],
  'literal brass key plus endpoint keyhole opening without collision double-trigger': [
    "form: 'key', formPriority: 88",
    'const doorLightExtent = Math.max(5, Math.round(burst.radius * 0.42 * splitProgress));',
    'if (projectile.hitTerminated) continue;',
  ],
  'five readable ha glyphs yielding to inherited projectile carriers': [
    "form: 'laugh', formPriority: 10",
    "'five-shot-rule-uses-marble-carrier': { items: ['five-ha', 'marble'], form: 'marble'",
    '"laugh": 23',
    'Bare breath reads 哈哈哈哈哈',
  ],
  'literal glass marble and one same-projectile ricochet': [
    "carrier: 'literal-object', presentation: 'always', hitMaterial: 'glass', form: 'marble'",
    '(projectile.ricochetDepth ?? 0) < 1',
    'projectile.ricochetDepth = (projectile.ricochetDepth ?? 0) + 1;',
  ],
  'summer-run inertia': [
    'SUMMER_SLIDE_DURATION = 0.18',
    'this.summerSlideTimer = SUMMER_SLIDE_DURATION;',
    'this.heroMoving = this.heroInputMoving || this.summerSlideTimer > 0;',
  ],
  'snow-screen intermittent static': [
    "this.hasItem('snow-screen') && !this.snowUsed",
    'this.snowFlickerTimer = 0.055;',
    'private renderSnowInterference()',
  ],
  'gym-card movement layers': [
    'this.gymMomentum = Math.min(4, this.gymMomentum + dt * warmupRate);',
    'this.gymMomentum = Math.max(0, this.gymMomentum - dt * 2.5);',
    "speed *= 1 + this.gymMomentum * 0.02;",
  ],
  'shared-powerbank rent loop': [
    'this.powerbankCharge += rented;',
    'this.powerbankRentalSeconds >= 8',
    'this.powerbankBurstTimer = Math.min(3, 0.45 + this.powerbankCharge * 0.42);',
    "this.powerbankBurstTimer > 0) vector.fireInterval *= 0.65;",
  ],
  'divorce-draft deferred settlement': [
    'this.divorceDeferredDamage += Math.max(0, remaining - immediate);',
    'if (this.divorceDeferredDamage > 0)',
    "this.applyHeroDamage(deferred, '离婚协议的补扣');",
  ],
  'drank-for-boss layer release': [
    'this.drankLayers = Math.min(3, this.drankLayers + 1);',
    'this.drankStoredDamage += remaining;',
    "this.areaDamage(reflected, '#c98a5a');",
  ],
  'mineral-water bottle-cap progress': [
    "this.hasItem('mineral-water')",
    'const progress = (this.noHitTime % 8) / 8;',
    'const filled = Math.floor(progress * 8);',
  ],
  'last-page deadline feedback': [
    'private lastPageDeadlineActive()',
    "this.hasItem('last-page') && this.lastPageDeadlineActive()",
    "visual.impactColor = '#c75864';",
  ],
  'eye-exercise closed then haste': [
    'this.eyeClosedTimer = 0.5;',
    'this.enemyHasteTimer = 1.5;',
    'if (this.eyeClosedTimer > 0)',
  ],
  'abstract-lv10 isolated vulnerability': [
    'taunted.tauntVulnerableTimer = 2.5;',
    'if ((enemy.tauntVulnerableTimer ?? 0) > 0) amount *= 1.2;',
    "this.ctx.fillText('+20%'",
  ],
  'one-more-game transition choice': [
    'private resolveOneMoreGame(continuePlaying: boolean)',
    'this.oneMoreStacks = Math.min(5, this.oneMoreStacks + 1);',
    'this.stageEndReward(true);',
    "this.oneMoreOpeningTimer <= 0",
    'vector.damage *= 1 + this.oneMoreStacks * 0.1;',
    'private renderOneMoreGamePrompt()',
  ],
  'flash-escape displacement feedback': [
    "this.hasItem('flash-escape') && this.flashCooldown <= 0",
    'const fromX = this.heroX;',
    "this.burst('ring', fromX, fromY - 10, 30, '#706783');",
    "this.feedback.play('breath', reversed ? 0.72 : 1.08);",
  ],
  'red-packet coin drop feedback': [
    'private redPacketDrop(enemy: EnemyUnit, force = false)',
    "this.feedback.play('coin', 0.86);",
    'this.spawnCoinDrop(target.x, target.y, bonus);',
  ],
  'takeout-3am warm recovery feedback': [
    "this.hasItem('takeout-3am') && this.hero.hp < this.hero.maxHp * 0.4",
    'this.takeoutWarmTimer = 0.42;',
    "this.burst('ring', this.heroX, this.heroY - 12, 22, '#c9a66b');",
  ],
  'auto-renew paid opening aura': [
    'const paid = Math.min(stageFees, this.hero.coins);',
    'this.autoRenewGlowTimer = 1.6;',
    "'已为您自动续费'",
    "this.hasItem('auto-renew') && this.battleTime < 15",
  ],
  'checkup-arrows locked amplification': [
    "if (this.hasItem('checkup-arrows'))",
    'value >= base ? value * 1.08 : value * 0.92',
    'this.checkupPulseTimer = 1.4;',
    "'↑↓ 指标定住了'",
  ],
  'hair-in-takeout nausea recovery': [
    "this.hasItem('hair-in-takeout') && !this.hairUsedStage",
    'this.nauseaTimer = 0.72;',
    "`干呕 · +${Math.ceil(this.hero.hp - beforeHp)}`",
  ],
  'funeral-photo final smile': [
    // 免死判定走 ownsItem（封存 3 秒不该关掉保命），hasItem 也接受。
    /this\.(hasItem|ownsItem)\('funeral-photo'\) && !this\.graceUsed/,
    'this.graceTimer = 5;',
    'this.flash = 0;',
    "this.saveEffect = { kind: 'photo', timer: 0.7, duration: 0.7 };",
    "if (effect.kind === 'photo') ctx.filter = 'grayscale(1) contrast(1.12)';",
    'if (this.graceTimer > 0)',
  ],
  'goodnight-2h low-health overdrive': [
    "this.hasItem('goodnight-2h') && this.hero.hp < this.hero.maxHp * 0.5",
    'this.goodnightPulseTimer = 0.65;',
    "'最大生命 -1'",
  ],
  'server-shutdown permanent departure': [
    /this\.(hasItem|ownsItem)\('server-shutdown'\) && !this\.petGone/,
    "this.saveEffect = { kind: 'shutdown', timer: 0.8, duration: 0.8 };",
    "this.items.filter((id) => id !== 'server-shutdown')",
    "this.hasItem('server-shutdown') && this.petGone",
  ],
  'loan-contract stage settlement': [
    'private settleLoanContract()',
    'const paid = Math.min(2, this.hero.coins);',
    'this.hero.coins -= paid;',
    'this.loseHealth(4);',
    "`\u8fd8\u6b3e -${paid}\u96f6\u94b1 -4\u751f\u547d`",
  ],
  'unwashed-pillow stationary shelter': [
    "this.hasItem('unwashed-pillow') && this.standStillTime >= 2 && remaining > 0",
    'remaining = Math.ceil(remaining * 0.5);',
    'this.pillowPenalty = 1;',
    "vector.fireInterval *= 1.2;",
    "'\u8eba\u5e73'",
  ],
  'sock-cigs injury sprint and health debt': [
    "this.hasItem('sock-cigs') && remaining > 0",
    'this.sockBoostTimer = 2;',
    'speed *= 1.25;',
    'this.sockTick = 45;',
    "'\u70df\u503a \u00b7 \u6700\u5927\u751f\u547d -1'",
  ],
  'momo-avatar distance stance': [
    "this.hasItem('momo-avatar')",
    "distance < 80 ? 'threatened' : distance > 150 ? 'safe' : 'neutral'",
    'vector.critChance += 0.25;',
    'vector.damage *= 0.92;',
    "'\u6002\u4e86'",
  ],
  'streak-1847 stage rhythm': [
    'this.lastRhythmMark = 0;',
    'const rhythmWindow = Math.floor(this.battleTime / 10);',
    'rhythmWindow > this.lastRhythmMark && rhythmWindow !== this.rhythmBrokenWindow',
    "'\u51c6\u65f6\u6253\u5361'",
    "'\u672c\u8f6e\u65ad\u7b7e'",
  ],
  'moms-bowl warm shield retaliation': [
    'private releaseBowlSteam()',
    'for (let index = 0; index < 8; index += 1)',
    "this.projectileVisualForForm('breath', 'water', 1)",
    'this.bowlWarmthBlock = Math.min(this.hero.block, this.bowlWarmthBlock + gained);',
    'if (warmthBefore > 0 && this.bowlWarmthBlock === 0 && warmthAbsorbed > 0) this.releaseBowlSteam();',
    "'饭还热'",
  ],
  'typing-indicator three-beat radial attack': [
    'TYPING_INDICATOR_DOT_INTERVAL = 0.5',
    'TYPING_INDICATOR_DOT_COUNT = 3',
    'TYPING_INDICATOR_SPREAD_COUNT = 12',
    'private currentTypingIndicatorDots()',
    'private updateTypingIndicator(dt: number)',
    'private fireTypingIndicatorSpread()',
    "if (!this.hasItem('typing-indicator'))",
    'const shotCount = TYPING_INDICATOR_SPREAD_COUNT;',
    'index / shotCount * Math.PI * 2',
  ],
  'painless-night delayed damage ledger': [
    "this.hasItem('painless-night')",
    'this.painlessDamage += amount;',
    'this.painlessTimer = Math.max(this.painlessTimer, 8);',
    'vector.damage *= 1 + Math.min(1.5, this.painlessDamage * 0.035);',
    "if (this.hasItem('painless-night')) return;",
    "this.applyHeroDamage(payment, '不疼的那个晚上');",
    'this.painlessTimer / 8',
  ],
  'third-pill rage crash cycle': [
    "const nextPhase = phase < 8 ? 'rage' : phase < 11 ? 'crash' : 'neutral';",
    "nextPhase === 'rage' ? '狂暴' : nextPhase === 'crash' ? '崩落' : '药效退去'",
    'vector.damage *= 1.6; vector.fireInterval *= 0.71;',
    'vector.damage *= 0.6; vector.fireInterval *= 1.4; vector.range *= 0.7;',
    "this.hasItem('third-pill')",
  ],
  'white-bottle opening dose': [
    "!resume && this.hasItem('white-bottle')",
    'this.whiteBottlePulseTimer = 0.55;',
    "'吞药 · -2'",
    'vector.fireInterval *= 0.7;',
    'vector.damage *= 0.9;',
  ],
  'baby-tooth immediate death save': [
    "if (id === 'baby-tooth') this.toothReady = true;",
    "this.toothReady = this.hasItem('baby-tooth');",
    'this.hero.hp <= 0 && this.toothReady && this.deathSaves < 3',
    "this.saveEffect = { kind: 'tooth', timer: 0.7, duration: 0.7 };",
    "if (this.hasItem('baby-tooth')) vector.damage *= 0.9;",
  ],
  'development damage audit hook': [
    "action === 'hurt' && this.state === 'battle'",
    'this.hurtHero(this.clamp(payload, 1, 99));',
  ],
  'development relic audit hook': [
    'private setupRelicMechanicAudit(id: ItemId)',
    "action === 'relic-audit'",
  ],
};
for (const [label, tokens] of Object.entries(proofs)) {
  // token 可以是字面量，也可以是正则——保命判定这类「换个等价写法就误报」的地方
  // 用正则守不变量，不锁某一行怎么写。
  for (const token of tokens) {
    const present = token instanceof RegExp ? token.test(runtimeEvidence) : runtimeEvidence.includes(token);
    if (!present) errors.push(`${label} is missing: ${token}`);
  }
}
for (const [id, label] of Object.entries(REVIEWED_RELIC_RUNTIME)) {
  if (!proofs[label]) errors.push(`${id} claims a runtime review without a matching proof group: ${label}`);
}

if (game.includes("if (this.hasItem('shared-powerbank')) stageFees += 1;")) {
  errors.push('shared-powerbank still uses the obsolete flat stage fee');
}
if (game.includes("if (this.hasItem('gym-card')) speed *= 1.08;")) {
  errors.push('gym-card still uses the obsolete flat movement bonus');
}
if (game.includes("if ((enemy.dashTimer ?? 0) > 0 && !enemy.boss && enemy.type !== 'hunger-shadow') amount *= 1.2;")) {
  errors.push('abstract-lv10 vulnerability still leaks through the generic enemy dash timer');
}
if (!types.includes('tauntVulnerableTimer?: number;')) {
  errors.push('EnemyUnit is missing the isolated taunt vulnerability state');
}
if (!checkpoint.includes('oneMoreStacks: number;') || !checkpoint.includes('oneMoreStacks: integer(input.oneMoreStacks, 0, 0, 5)')) {
  errors.push('one-more-game stacks are not persisted safely');
}
const transitionSource = game.slice(
  game.indexOf('private beginStageTransition()'),
  game.indexOf('private startStageTransition()'),
);
if (transitionSource.indexOf('if (this.livingStageElite()) return;') > transitionSource.indexOf('this.settleLoanContract();')) {
  errors.push('loan-contract can charge repeatedly while a stage elite is still alive');
}
for (const token of [
  '另一半阶段末补扣',
  '每累计租电8秒扣1零钱',
  '3层释放累计范围反伤',
  '最近非Boss敌人：受伤+20%',
  '伤害+10%一层（最多5层）',
  '每层令下阶段开场停火0.5秒',
  '头顶每0.5秒出现1个点',
  '第3点触发12向大范围散射',
]) {
  if (!relics.includes(token)) errors.push(`relic summary is missing: ${token}`);
}
for (const token of [
  '另一半阶段末补扣；治疗-15%',
  '每累计租电8秒扣1零钱',
  '3层释放累计范围反伤',
  '最近非Boss敌人：受伤+20%',
  '跳过6点回复并获得伤害+10%一层',
  '每层令下阶段开场停火0.5秒',
  '每0.5秒在头顶增加1个句号',
  '第3个句号出现时释放12向全屏散射',
]) {
  if (!spec.includes(token)) errors.push(`production contract is missing: ${token}`);
}

console.log(JSON.stringify({ valid: errors.length === 0, mechanics: Object.keys(proofs), errors }, null, 2));
if (errors.length) process.exitCode = 1;
