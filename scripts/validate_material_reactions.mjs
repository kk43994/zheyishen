import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), 'utf8');

const [types, game, statusJson, statusSourcesJson, hitJson] = await Promise.all([
  read('src/types.ts'),
  read('src/game.ts'),
  read('src/assets/vfx/status.json'),
  read('src/assets/vfx/status.sources.json'),
  read('src/assets/vfx/hits.json'),
]);
const status = JSON.parse(statusJson);
const statusSources = JSON.parse(statusSourcesJson);
const hits = JSON.parse(hitJson);

const errors = [];
const requireSource = (source, pattern, message) => {
  if (!pattern.test(source)) errors.push(message);
};

for (const field of ['wetTimer', 'rawTimer', 'rawStacks', 'heavyTimer', 'heavyStacks', 'controlFatigue']) {
  requireSource(types, new RegExp(`\\b${field}\\?:`), `EnemyUnit is missing ${field}`);
}
for (const method of ['applyProjectileMaterialReactions', 'hardControlDuration', 'settleReadDebt']) {
  requireSource(game, new RegExp(`private ${method}\\(`), `runtime is missing ${method}`);
}
requireSource(game, /hardControlled\s*=.*freezeTimer.*paralyzeTimer/, 'paralyze/freeze do not share the hard-control movement gate');
requireSource(game, /enemy\.attackCooldown\s*-=\s*dt\s*\*\s*heavyPace/, 'heavy does not slow enemy attack cadence');
requireSource(game, /damage \*= 1\.4;[\s\S]{0,120}noteSynergy\('压碎'\)/, 'heavy x ice crush reaction is missing');
requireSource(game, /noteSynergy\('水是导电的'\)/, 'wet x signal area reaction is missing');
requireSource(game, /settleReadDebt\(enemy, '提前清算'\)/, 'debt x explosion settlement is missing');
for (const audit of ['conduct', 'crush', 'raw', 'settle']) {
  requireSource(game, new RegExp(`kind === '${audit}'`), `developer material audit is missing ${audit}`);
}

const requiredStatuses = ['freeze', 'paralyze', 'read', 'loop', 'wet', 'raw', 'heavy'];
for (const name of requiredStatuses) {
  if (status.index?.[name] === undefined) errors.push(`status atlas is missing ${name}`);
}
if (status.cols !== 4 || status.rows !== 2 || status.cell !== 12) {
  errors.push(`status atlas layout is ${status.cols}x${status.rows}@${status.cell}, expected 4x2@12`);
}
if (!String(status.generator ?? '').includes('Image2')) errors.push('status atlas generator is not Image2-aware');
if (statusSources.sourceStatus !== 'image2-edit-recorded') errors.push('status Image2 source provenance is not recorded');
if (statusSources.referenceJob?.model !== 'gpt-image-2') errors.push('status reference job does not use gpt-image-2');
if ((statusSources.referenceJob?.references?.length ?? 0) < 3) errors.push('status Image2 job lacks semantic references');

const requiredHitMaterials = ['mist', 'water', 'crit', 'paper', 'wood', 'stone', 'metal', 'ice', 'signal', 'key', 'glass'];
for (const material of requiredHitMaterials) {
  if (!hits.materials?.includes(material)) errors.push(`hit atlas is missing ${material}`);
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  enemyStatuses: requiredStatuses,
  statusAtlas: `${status.cols}x${status.rows}@${status.cell}`,
  statusSource: statusSources.sourceStatus ?? null,
  hitMaterials: hits.materials?.length ?? 0,
  reactions: ['wet-signal', 'heavy-ice', 'raw-followup', 'debt-explosion'],
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
