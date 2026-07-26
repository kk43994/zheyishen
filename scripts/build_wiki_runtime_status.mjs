import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { REVIEWED_RELIC_RUNTIME } from './relic-runtime-reviewed.mjs';

const root = resolve(process.cwd());
const read = (file) => readFile(resolve(root, file), 'utf8');

const relicSource = await read('src/relics.ts');
const gameSource = await read('src/game.ts');
const projectileSource = await read('src/projectile-item-signatures.ts');
const equipment = JSON.parse(await read('src/assets/items/runtime-art-consumers.json'));
const equipmentById = new Map(equipment.items.map((item) => [item.id, item]));

const context = vm.createContext({ window: {} });
for (const file of ['docs/relic-production-spec-a-v1.js', 'docs/relic-production-spec-b-v1.js']) {
  vm.runInContext(await read(file), context, { filename: file });
}
const specs = {
  ...context.window.RELIC_PRODUCTION_SPEC_A,
  ...context.window.RELIC_PRODUCTION_SPEC_B,
};

const readText = (body, field) => body.match(new RegExp(`\\b${field}:\\s*'([^']*)'`))?.[1] ?? '';
const itemBlocks = [...relicSource.matchAll(
  /^  (?:'([^']+)'|([a-z][a-z0-9-]*)):\s*\{([\s\S]*?)^  \},$/gm,
)];
const projectileBody = projectileSource.match(
  /PROJECTILE_ITEM_SIGNATURES\s*=\s*\{([\s\S]*?)\n\} as const/,
)?.[1] ?? '';
const projectileIds = new Set(
  [...projectileBody.matchAll(/^\s*'([^']+)':\s*\{/gm)].map((match) => match[1]),
);
const projectileAuditBody = projectileSource.match(
  /PROJECTILE_AUDIT_CASES\s*=\s*\{([\s\S]*?)\n\} as const/,
)?.[1] ?? '';
const projectileAuditIds = new Set(
  [...projectileAuditBody.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1]),
);

const items = itemBlocks.map((match, index) => {
  const id = match[1] ?? match[2];
  const body = match[3];
  const spec = specs[id] ?? {};
  const art = equipmentById.get(id);
  const runtimeRefs = (gameSource.match(new RegExp(`['\"]${id}['\"]`, 'g')) ?? []).length;
  const projectile = projectileIds.has(id);
  const runtimeReview = REVIEWED_RELIC_RUNTIME[id];
  const priority = runtimeRefs === 0
    ? 'P0'
    : (runtimeReview ? (projectile ? 'P2' : 'P3')
      : (!spec.statOnly && runtimeRefs <= 2 ? 'P1' : (projectile ? 'P2' : 'P3')));
  return {
    index: index + 1,
    id,
    name: readText(body, 'name'),
    quality: Number(body.match(/\bquality:\s*(\d)/)?.[1] ?? 0),
    qualityName: readText(body, 'qualityName'),
    slot: readText(body, 'slot'),
    flavor: readText(body, 'flavor'),
    summary: readText(body, 'summary'),
    positive: readText(body, 'positive'),
    negative: readText(body, 'negative'),
    source: spec.source ?? '未登记',
    roles: spec.roles ?? [],
    production: spec.production ?? [],
    statOnly: Boolean(spec.statOnly),
    contract: {
      numbers: spec.numbers ?? '',
      rule: spec.rule ?? '',
      hero: spec.hero ?? '',
      projectile: spec.projectile ?? '',
      feedback: spec.feedback ?? '',
      stack: spec.stack ?? '',
    },
    runtime: {
      status: runtimeRefs > 0 ? '有运行时证据' : '未找到运行时分支',
      refs: runtimeRefs,
      reviewed: Boolean(runtimeReview),
      review: runtimeReview ?? '',
      artConsumers: art?.consumers ?? [],
      artReady: Boolean(art?.runtimeEntry && art?.consumers?.length),
      projectile,
      projectileAudit: projectileAuditIds.has(id),
    },
    priority,
  };
});

const roleCounts = {};
const sourceCounts = {};
const productionCounts = {};
for (const item of items) {
  sourceCounts[item.source] = (sourceCounts[item.source] ?? 0) + 1;
  for (const role of item.roles) roleCounts[role] = (roleCounts[role] ?? 0) + 1;
  for (const layer of item.production) productionCounts[layer] = (productionCounts[layer] ?? 0) + 1;
}
const comboBody = gameSource.match(/const COMBO_DEFS:[\s\S]*?= \[([\s\S]*?)\n\];/)?.[1] ?? '';
const comboCount = (comboBody.match(/\{ name:/g) ?? []).length;
const stageBody = gameSource.match(/const STAGES: StageSpec\[\] = \[([\s\S]*?)\n\];/)?.[1] ?? '';
const stageCount = (stageBody.match(/\n  \{\n\s+chapter:/g) ?? []).length;

const priorityOrder = ['P0', 'P1', 'P2', 'P3'];
const priorityLabels = {
  P0: ['阻断：合同存在但运行时无分支', '必须先补逻辑，不能用文案或美术冒充实装。'],
  P1: ['重点复核：尚无专项机制门禁', '先核对正负面是否都落地，再补触发反馈、状态审查与自动断言。'],
  P2: ['组合验证：会改变《一口气》', '逐项检查弹体优先级、继承、命中材质与多道具组合。'],
  P3: ['稳定性与平衡复核', '运行时分支较完整，继续校正数值、可读性和跨阶段结算。'],
};
const priorities = priorityOrder.map((level) => ({
  level,
  title: priorityLabels[level][0],
  rule: priorityLabels[level][1],
  count: items.filter((item) => item.priority === level).length,
  ids: items.filter((item) => item.priority === level).map((item) => item.id),
}));

const report = {
  version: 1,
  generatedFrom: [
    'src/relics.ts',
    'src/game.ts',
    'src/projectile-item-signatures.ts',
    'docs/relic-production-spec-a-v1.js',
    'docs/relic-production-spec-b-v1.js',
    'scripts/relic-runtime-reviewed.mjs',
    'src/assets/items/runtime-art-consumers.json',
  ],
  summary: {
    items: items.length,
    runtimeEvidence: items.filter((item) => item.runtime.refs > 0).length,
    runtimeReviewed: items.filter((item) => item.runtime.reviewed).length,
    artReady: items.filter((item) => item.runtime.artReady).length,
    projectileItems: items.filter((item) => item.runtime.projectile).length,
    projectileAudits: items.filter((item) => item.runtime.projectileAudit).length,
    combos: comboCount,
    stages: stageCount,
  },
  sourceCounts,
  roleCounts,
  productionCounts,
  priorities,
  items,
};

await writeFile(
  resolve(root, 'docs/wiki-runtime-status-v1.js'),
  `window.WIKI_RUNTIME_STATUS_V1 = ${JSON.stringify(report, null, 2)};\n`,
);
console.log(JSON.stringify(report.summary, null, 2));
