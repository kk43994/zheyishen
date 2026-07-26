import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import {
  planFiveShotBurst,
  selectBaseProjectileForm,
  selectProjectileTrail,
} from '../src/projectile-item-signatures.ts';

const root = resolve(process.cwd());
const context = vm.createContext({ window: {} });
for (const file of ['docs/relic-production-spec-a-v1.js', 'docs/relic-production-spec-b-v1.js']) {
  vm.runInContext(await readFile(resolve(root, file), 'utf8'), context, { filename: file });
}
const specs = { ...context.window.RELIC_PRODUCTION_SPEC_A, ...context.window.RELIC_PRODUCTION_SPEC_B };
const expected = Object.entries(specs)
  .filter(([, spec]) => spec.production.includes('projectile'))
  .map(([id]) => id)
  .sort();

const runtimeSource = await readFile(resolve(root, 'src/projectile-item-signatures.ts'), 'utf8');
const gameSource = await readFile(resolve(root, 'src/game.ts'), 'utf8');
const objectBody = runtimeSource.match(/PROJECTILE_ITEM_SIGNATURES\s*=\s*\{([\s\S]*?)\n\} as const/)?.[1] ?? '';
const auditBody = runtimeSource.match(/PROJECTILE_AUDIT_CASES\s*=\s*\{([\s\S]*?)\n\} as const/)?.[1] ?? '';
const compositionBody = runtimeSource.match(/PROJECTILE_COMPOSITION_CASES\s*=\s*\{([\s\S]*?)\n\} as const/)?.[1] ?? '';
const actual = [...objectBody.matchAll(/^\s*'([^']+)':\s*\{/gm)].map((match) => match[1]).sort();
const auditEntries = [...auditBody.matchAll(/^\s*'([^']+)':\s*'([^']+)'/gm)]
  .map(([, id, audit]) => ({ id, audit }));
const auditIds = auditEntries.map(({ id }) => id).sort();
const signatureBlocks = [...objectBody.matchAll(/^\s*'([^']+)':\s*\{([\s\S]*?)^\s*\},?\s*$/gm)];
const compositionCases = [...compositionBody.matchAll(
  /^\s*'([^']+)':\s*\{\s*items:\s*\[([^\]]+)\],\s*form:\s*'([^']+)',\s*trail:\s*'([^']+)'\s*\}/gm,
)].map(([, name, rawItems, form, trail]) => ({
  name,
  items: [...rawItems.matchAll(/'([^']+)'/g)].map((match) => match[1]),
  form,
  trail,
}));
const missing = expected.filter((id) => !actual.includes(id));
const extra = actual.filter((id) => !expected.includes(id));

const manifest = JSON.parse(await readFile(resolve(root, 'src/assets/vfx/projectiles.json'), 'utf8'));
const provenance = JSON.parse(await readFile(resolve(root, 'src/assets/vfx/projectiles.sources.json'), 'utf8'));
const forms = [...objectBody.matchAll(/\bform:\s*'([^']+)'/g)].map((match) => match[1]);
const missingArt = [...new Set(forms)].filter((form) => manifest.index?.[form] === undefined);
const requiredAtlasForms = [
  'breath0', 'breath1', 'breath2', 'breath3', 'paper', 'rain', 'sound', 'key',
  'bone', 'tear', 'cone', 'echo', 'slash', 'razor', 'marble', 'ice', 'serial',
  'typing', 'button', 'link', 'stamp', 'stone', 'lens', 'laugh',
];
const missingAtlasForms = requiredAtlasForms.filter((form) => manifest.index?.[form] === undefined);
const sourceJobs = Object.values(provenance.referenceJobs ?? {});
const hitManifest = JSON.parse(await readFile(resolve(root, 'src/assets/vfx/hits.json'), 'utf8'));
const contractHtml = await readFile(resolve(root, 'docs/道具生产合同表.html'), 'utf8');
const contractDataText = contractHtml.match(/  const DATA = ([^\n]+);\n  const ROOMS/)?.[1];
const contractData = contractDataText ? JSON.parse(contractDataText) : [];
const htmlFiveHa = contractData.find((contract) => contract.id === 'five-ha');
const equipmentContracts = JSON.parse(await readFile(resolve(root, 'src/assets/items/equipment-art.json'), 'utf8'));
const equipmentFiveHa = equipmentContracts.items?.find((contract) => contract.id === 'five-ha');
const expectedHitMaterials = ['mist', 'water', 'crit', 'paper', 'wood', 'stone', 'metal', 'ice', 'signal', 'key', 'glass'];
const missingHitMaterials = expectedHitMaterials.filter((material) => !hitManifest.materials?.includes(material));
const requiredDesignFields = ['scope', 'recipe', 'carrier', 'presentation', 'hitMaterial', 'silhouette', 'motion', 'feedback', 'mechanic'];
const incompleteDesign = signatureBlocks.flatMap(([_, id, body]) => requiredDesignFields
  .filter((field) => !new RegExp(`\\b${field}:`).test(body))
  .map((field) => `projectile design contract ${id} is missing ${field}`));
const literalObjects = signatureBlocks
  .filter(([_, __, body]) => /carrier:\s*'literal-object'/.test(body))
  .map(([_, id]) => id)
  .sort();
const allowedLiteralObjects = ['marble', 'only-key'];
const invalidLiteralObjects = literalObjects.filter((id) => !allowedLiteralObjects.includes(id));
const missingAudits = expected.filter((id) => !auditIds.includes(id));
const extraAudits = auditIds.filter((id) => !expected.includes(id));
const missingAuditBranches = [...new Set(auditEntries.map(({ audit }) => audit))]
  .filter((audit) => audit !== 'form' && !new RegExp(`kind === '${audit}'`).test(gameSource));
const auditById = new Map(auditEntries.map(({ id, audit }) => [id, audit]));
const requiredMechanicAudits = {
  'loose-button': 'button-carrier',
  'od-pill': 'od-distortion',
  'front-desk-letter': 'letter-homing',
  'only-key': 'key-endpoint',
  'fathers-raincoat': 'raincoat-contract',
  'marble': 'marble-inheritance',
  'name-sold': 'uniform-five',
  'typing-indicator': 'typing',
  'year-report': 'replay',
  'ai-chat': 'echo',
  'card-binder': 'binder',
};
const invalidMechanicAudits = Object.entries(requiredMechanicAudits)
  .filter(([id, audit]) => auditById.get(id) !== audit)
  .map(([id, audit]) => `${id} must use the ${audit} mechanic audit`);
const runtimeProofs = [
  ['volley recipes snapshot the complete visual carrier', [
    'visual?: ProjectileVisual;',
    'visual: shot.visual ? this.cloneProjectileVisual(shot.visual) : undefined,',
    'private cloneProjectileVisual(visual: ProjectileVisual)',
  ]],
  ['AI echoes copy every shot in the current volley recipe', [
    'for (const shot of currentVolleyRecipe)',
    'delay: 0.4 + shot.delay',
    'damage: shot.damage * 0.35',
  ]],
  ['year report replays the previous complete volley recipe', [
    'for (const shot of this.lastVolleyRecipe)',
    'damage: shot.damage * 0.6',
    "visualTone: 'replay'",
  ]],
  ['pregnancy follower copies the current shot recipe', [
    'const pregnancySource = currentVolleyRecipe[0];',
    'damage: source.damage * 0.8',
    "followerVisual.trail = 'child'",
  ]],
  ['retracted voice emits one exact six-damage wave per stored layer', [
    'for (let layer = 0; layer < charges; layer += 1)',
    'damage: 6, speed:',
    'this.voiceCharges = 0;',
  ]],
  ['typing indicator replaces autofire with a three-beat radial spread', [
    'TYPING_INDICATOR_DOT_INTERVAL = 0.5',
    'TYPING_INDICATOR_DOT_COUNT = 3',
    'TYPING_INDICATOR_SPREAD_COUNT = 12',
    'private fireTypingIndicatorSpread()',
    "if (!this.hasItem('typing-indicator'))",
    'const shotCount = TYPING_INDICATOR_SPREAD_COUNT;',
    'index / shotCount * Math.PI * 2',
    'visual: this.cloneProjectileVisual(visual)',
  ]],
  ['derived projectile forms retain a separate material carrier', [
    'visual.carrierForm = visual.form;',
    'return materialForForm(projectile.visual.carrierForm) ??',
  ]],
  ['literal key style follows its carrier priority including binder copies', [
    "if (this.hasProjectileTrigger('only-key')) return 'key';",
    "if (this.hasItem('front-desk-letter')) return 'paper';",
  ]],
  ['key collision exhaustion stays distinct from endpoint explosion', [
    'projectile.hitTerminated = true;',
    'if (projectile.hitTerminated) continue;',
    "'key-collision': ['only-key']",
  ]],
  ['key endpoint keeps a keyhole while opening two light wedges', [
    'const doorLightExtent = Math.max(5, Math.round(burst.radius * 0.42 * splitProgress));',
    'const doorLightHalfHeight = Math.max(3, Math.round(burst.radius * (0.06 + splitProgress * 0.2)));',
    'ctx.arc(Math.round(burst.x), Math.round(burst.y - 2), keyholeRadius',
  ]],
  ['marble redirects the same inherited projectile exactly once', [
    '(projectile.ricochetDepth ?? 0) < 1',
    'projectile.vx = Math.cos(bounceAngle) * bounceSpeed;',
    'projectile.ricochetDepth = (projectile.ricochetDepth ?? 0) + 1;',
  ]],
  ['card binder can reproduce every low-tier base carrier', [
    "'loose-button', 'wooden-sword', 'red-workbook', 'stone-schoolbag', 'cracked-glasses'",
    "this.binderCards = ['wooden-sword', 'stone-schoolbag', 'cracked-glasses'];",
  ]],
  ['name-sold blocks all ordinary critical paths while revoked badge restores speech', [
    "const criticalAllowed = !this.hasItem('name-sold') || this.momoCriticalWindowActive();",
    "this.hasItem('name-sold') && !this.hasItem('revoked-badge')",
    "freeResponseLocked ? '名字已交出' : '亲口说'",
  ]],
  ['five-ha applies one ordered burst critical roll', [
    'const burstCritical = criticalAllowed',
    'critical: burstCritical,',
    'planFiveShotBurst(standardized).forEach((shot)',
  ]],
  ['readable projectile sprites scale independently from collision radius', [
    'const PROJECTILE_FORM_DISPLAY_SIZE:',
    'const displayCurve = PROJECTILE_FORM_DISPLAY_SIZE[visual.form]',
    'marble: [14, 2.8, 18, 27]',
    'key: [15, 3, 20, 31]',
    'laugh: [9, 3.8, 15, 23]',
  ]],
  ['button projectile uses the recorded damage rather than the current base damage', [
    'this.buttonRecordedDamage > 0 ? this.buttonRecordedDamage : vector.damage',
  ]],
  ['friend verification applies to inherited shots before damage', [
    "if (this.hasItem('friend-verify') && !projectile.verifyPassed)",
    "projectile.visual.form = 'stamp';",
    "'验证失败'",
  ]],
  ['real composition stress uses the actual projectile lineage and preserves core visibility', [
    'private setupProjectileComboStressAudit()',
    "if (action === 'projectile-combo-stress') this.setupProjectileComboStressAudit()",
    "'five-ha', 'marble', 'ai-chat', 'year-report', 'missing-photo', 'pregnancy-test'",
    'private projectileVisualBudget()',
    'projectile.poolPriority === \'core\'',
    'protectedOrbit',
    'visualBudget.trailStride',
    '!secondary && visualBudget.coreLift',
    'renderedProjectiles: this.projectiles.length',
    'coreProjectileLift: visualBudget.coreLift',
  ]],
];
const missingRuntimeProofs = runtimeProofs.flatMap(([label, tokens]) => (
  tokens.every((token) => gameSource.includes(token)) ? [] : [`missing runtime proof: ${label}`]
));
const signatureById = new Map(signatureBlocks.map(([, id, body]) => {
  const readString = (field) => body.match(new RegExp(`\\b${field}:\\s*'([^']+)'`))?.[1];
  const readNumber = (field) => Number(body.match(new RegExp(`\\b${field}:\\s*(\\d+)`))?.[1]);
  return [id, {
    scope: readString('scope'),
    form: readString('form'),
    formPriority: readNumber('formPriority'),
    trail: readString('trail'),
    trailPriority: readNumber('trailPriority'),
  }];
}));
const baseSignatures = [...signatureById.entries()]
  .filter(([, signature]) => signature.scope === 'base' || signature.scope === 'fallback');
const missingBasePriorities = baseSignatures.filter(([, signature]) => !Number.isFinite(signature.formPriority));
const duplicateBasePriorities = [...new Set(baseSignatures
  .filter(([id, signature], index, all) => all.some(([otherId, other]) => otherId !== id && other.formPriority === signature.formPriority))
  .map(([, signature]) => signature.formPriority))];
const invalidCompositions = compositionCases.flatMap((entry) => {
  const actualComposition = {
    form: selectBaseProjectileForm(entry.items, 'breath'),
    trail: selectProjectileTrail(entry.items, 'mist'),
  };
  return actualComposition.form === entry.form && actualComposition.trail === entry.trail
    ? []
    : [`projectile composition ${entry.name} expected ${entry.form}/${entry.trail} but resolved ${actualComposition.form}/${actualComposition.trail}`];
});
const diminishingFive = planFiveShotBurst(false);
const standardizedFive = planFiveShotBurst(true);
const strictlyDescending = (values) => values.every((value, index) => index === 0 || value < values[index - 1]);
const allEqual = (values) => values.every((value) => value === values[0]);
const hurtHeroBody = gameSource.match(/private hurtHero\([\s\S]*?\n  private applyHeroDamage/)?.[0] ?? '';
const hurtHeroRainReleases = [...hurtHeroBody.matchAll(/this\.releaseRain\(\)/g)].length;
const laughPriority = signatureById.get('five-ha')?.formPriority ?? -1;
const lowestNonLaughPriority = Math.min(...baseSignatures
  .filter(([id]) => id !== 'five-ha')
  .map(([, signature]) => signature.formPriority));
const errors = [
  ...missing.map((id) => `missing runtime projectile signature: ${id}`),
  ...extra.map((id) => `orphan runtime projectile signature: ${id}`),
  ...missingArt.map((form) => `missing projectile atlas frame: ${form}`),
  ...missingAtlasForms.map((form) => `missing required projectile atlas frame: ${form}`),
  ...missingHitMaterials.map((material) => `missing projectile hit material: ${material}`),
  ...incompleteDesign,
  ...invalidLiteralObjects.map((id) => `unapproved literal-object projectile: ${id}`),
  ...missingAudits.map((id) => `missing projectile dev audit: ${id}`),
  ...extraAudits.map((id) => `orphan projectile dev audit: ${id}`),
  ...missingAuditBranches.map((audit) => `missing projectile mechanic audit branch: ${audit}`),
  ...invalidMechanicAudits,
  ...missingRuntimeProofs,
  ...(!gameSource.includes("'laugh-marble': ['five-ha', 'marble']") || !gameSource.includes("kind === 'laugh-marble'")
    ? ['missing five-ha plus marble composition audit']
    : []),
  ...(!specs['five-ha']?.projectile?.includes('五份逐发缩小的当前弹体')
    || !specs['five-ha']?.stack?.includes('五颗弹珠')
    ? ['five-ha encyclopedia contract does not preserve the winning projectile recipe']
    : []),
  ...(htmlFiveHa?.projectile !== specs['five-ha']?.projectile
    ? ['five-ha browser contract is out of sync with the production spec']
    : []),
  ...(equipmentFiveHa?.projectile !== specs['five-ha']?.projectile
    ? ['five-ha equipment contract is out of sync with the production spec']
    : []),
  ...missingBasePriorities.map(([id]) => `base projectile form is missing a deterministic priority: ${id}`),
  ...duplicateBasePriorities.map((priority) => `duplicate base projectile form priority: ${priority}`),
  ...(compositionCases.length < 11 ? ['projectile composition contract is incomplete'] : []),
  ...invalidCompositions,
  ...(laughPriority >= lowestNonLaughPriority ? ['five-ha shot-count rule must yield to every explicit projectile replacement'] : []),
  ...(diminishingFive.length !== 5 ? ['five-ha runtime plan does not contain exactly five shots'] : []),
  ...(!strictlyDescending(diminishingFive.map((shot) => shot.damageShare))
    || !strictlyDescending(diminishingFive.map((shot) => shot.sizeScale))
    ? ['bare five-ha runtime plan must diminish in damage and size']
    : []),
  ...(!allEqual(standardizedFive.map((shot) => shot.damageShare))
    || !allEqual(standardizedFive.map((shot) => shot.sizeScale))
    || !standardizedFive.every((shot) => shot.angleOffset === 0)
    ? ['name-sold plus five-ha must keep five fully standardized shots']
    : []),
  ...(hurtHeroRainReleases !== 1 ? ['father raincoat must release rain only inside its first-hit guard branch'] : []),
  ...(!gameSource.includes('vector.spread = 0;') || !gameSource.includes('vector.spread = this.clamp(vector.spread, 0, 1.1);')
    ? ['name-sold runtime does not enforce true zero spread']
    : []),
  ...(gameSource.includes('collapseTypingProjectile') || gameSource.includes('sinceVolley')
    ? ['typing indicator still contains obsolete charged-shot collapse behavior']
    : []),
  ...(!String(manifest.generator ?? '').includes('Image2') ? ['projectile atlas generator is not Image2-aware'] : []),
  ...(manifest.deterministicOverlays?.laugh !== '哈' ? ['laugh projectile is missing the exact 哈 glyph overlay'] : []),
  ...(provenance.sourceStatus !== 'image2-edit-recorded' ? ['projectile Image2 source provenance is not recorded'] : []),
  ...(provenance.pipeline !== 'Image2 reference edit -> chroma key -> crop -> 28px quantization'
    ? ['projectile source pipeline does not match the production contract'] : []),
  ...(sourceJobs.length < 3 ? ['projectile Image2 reference jobs are incomplete'] : []),
  ...sourceJobs.filter((job) => job.model !== 'gpt-image-2' || !Array.isArray(job.references) || job.references.length < 3)
    .map((job) => `invalid Image2 reference job: ${job.prompt ?? 'unknown'}`),
];

console.log(JSON.stringify({
  valid: errors.length === 0,
  expectedCount: expected.length,
  runtimeCount: actual.length,
  designCount: signatureBlocks.length,
  auditCount: auditEntries.length,
  compositionCount: compositionCases.length,
  literalObjects,
  atlasForms: Object.keys(manifest.index ?? {}).length,
  image2ReferenceJobs: sourceJobs.length,
  laughOverlay: manifest.deterministicOverlays?.laugh ?? null,
  hitMaterials: hitManifest.materials?.length ?? 0,
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
