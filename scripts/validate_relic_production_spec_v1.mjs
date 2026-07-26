import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(process.cwd());
// 「传承」＝第五档「这一身」：每章大 Boss 固定掉落，不进任何随机池。
const allowedSources = new Set(['回忆祭坛', '留灯间', '里屋', '传承']);
const allowedRoles = new Set([
  '纯属性', '弹体改造', '规则触发', '生存防御',
  '位移节奏', '经济资源', '命运交互', '召唤继承',
]);
const allowedProduction = new Set([
  'fitted', 'rigid', 'decal', 'morph', 'aura', 'event', 'projectile',
]);
// name 不参与"≥4字"长度校验：它单独走与 relics.ts 的相等校验。
// 否则《验孕棒》《五个哈》《雪花屏》等 3 字真名会与"必须等于原名"自相矛盾。
const requiredTextFields = [
  'numbers', 'rule', 'hero', 'projectile', 'feedback', 'stack',
];

const runtimeSource = await readFile(resolve(root, 'src/relics.ts'), 'utf8');
const runtimeItems = [...runtimeSource.matchAll(
  /\bid:\s*'([^']+)',\s*name:\s*'([^']+)',\s*quality:\s*(\d)/g,
)].map((match) => ({ id: match[1], name: match[2], quality: Number(match[3]) }));
const runtimeById = new Map(runtimeItems.map((item) => [item.id, item]));

const context = vm.createContext({ window: {} });
for (const file of ['docs/relic-production-spec-a-v1.js', 'docs/relic-production-spec-b-v1.js']) {
  const source = await readFile(resolve(root, file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}
const specs = {
  ...context.window.RELIC_PRODUCTION_SPEC_A,
  ...context.window.RELIC_PRODUCTION_SPEC_B,
};

const errors = [];
const warnings = [];
const specIds = Object.keys(specs);
if (runtimeItems.length !== 77) errors.push(`runtime item count must be 77, got ${runtimeItems.length}`);
if (specIds.length !== 77) errors.push(`production contract count must be 77, got ${specIds.length}`);

for (const item of runtimeItems) {
  const spec = specs[item.id];
  if (!spec) {
    errors.push(`missing contract: ${item.id} (${item.name})`);
    continue;
  }
  if (spec.name !== item.name) errors.push(`name mismatch ${item.id}: ${spec.name} !== ${item.name}`);
  if (!allowedSources.has(spec.source)) errors.push(`invalid source ${item.id}: ${spec.source}`);
  if (!Array.isArray(spec.roles) || spec.roles.length === 0) errors.push(`empty roles: ${item.id}`);
  for (const role of spec.roles ?? []) {
    if (!allowedRoles.has(role)) errors.push(`invalid role ${item.id}: ${role}`);
  }
  if (typeof spec.statOnly !== 'boolean') errors.push(`statOnly must be boolean: ${item.id}`);
  if (!Array.isArray(spec.production) || spec.production.length === 0) errors.push(`empty production list: ${item.id}`);
  for (const layer of spec.production ?? []) {
    if (!allowedProduction.has(layer)) errors.push(`invalid production layer ${item.id}: ${layer}`);
  }
  for (const field of requiredTextFields) {
    if (typeof spec[field] !== 'string' || spec[field].trim().length < 4) {
      errors.push(`missing or too-short ${field}: ${item.id}`);
    }
  }
  if (spec.statOnly && (spec.roles.length !== 1 || spec.roles[0] !== '纯属性')) {
    errors.push(`statOnly item has rule roles: ${item.id} -> ${spec.roles.join(',')}`);
  }
  if (spec.statOnly && /每|触发|冷却|阶段|命中|受伤|低于|高于|首次|概率|计时|积累|层/.test(spec.rule)) {
    warnings.push(`statOnly rule may contain hidden state: ${item.id}`);
  }
  if (spec.roles.some((role) => role === '弹体改造' || role === '召唤继承') && !spec.production.includes('projectile')) {
    errors.push(`projectile role without projectile production: ${item.id}`);
  }
  if (spec.production.includes('projectile') && /保持当前《一口气》配方/.test(spec.projectile)) {
    warnings.push(`projectile production may be unnecessary: ${item.id}`);
  }
}

for (const id of specIds) {
  if (!runtimeById.has(id)) errors.push(`orphan contract: ${id}`);
}

const sourceCounts = Object.fromEntries([...allowedSources].map((source) => [
  source,
  specIds.filter((id) => specs[id].source === source).length,
]));
const roleCounts = Object.fromEntries([...allowedRoles].map((role) => [
  role,
  specIds.filter((id) => specs[id].roles?.includes(role)).length,
]));
const productionCounts = Object.fromEntries([...allowedProduction].map((layer) => [
  layer,
  specIds.filter((id) => specs[id].production?.includes(layer)).length,
]));

const report = {
  valid: errors.length === 0,
  itemCount: specIds.length,
  sourceCounts,
  roleCounts,
  statOnlyCount: specIds.filter((id) => specs[id].statOnly).length,
  productionCounts,
  errors,
  warnings,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
