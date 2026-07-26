import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { HERO_ITEM_CLAIMS } from '../src/hero-item-slots.ts';
import { ITEM_APPEARANCE_REGISTRY } from '../src/item-appearance.ts';
import {
  ITEM_BODY_CONSEQUENCES_V2,
  ITEM_VISUAL_MODULES_V2,
  type ItemVisualModule,
} from '../src/item-visual-contract-v2.ts';
import { ITEM_DEFINITIONS, ITEM_IDS } from '../src/relics.ts';
import type { ItemId } from '../src/types.ts';

const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'output/art-pipeline-v2');
const MOTIONS = ['idle', 'walk', 'attack', 'hurt'] as const;
const DIRECTIONS = ['front', 'back', 'left', 'right'] as const;

type ProductionTask = {
  kind: string;
  implementation: 'sprite' | 'procedural' | 'composer';
  output: string;
  directions: number;
  motions: readonly string[];
  status: 'planned';
};

function taskFor(id: ItemId, module: ItemVisualModule, anchor: string): ProductionTask {
  if (module === 'rigid') {
    return {
      kind: 'rigid-attachment', implementation: 'sprite',
      output: `review/items/${id}/prop-idle-4dir.png`, directions: 4, motions: ['idle'], status: 'planned',
    };
  }
  if (module === 'garment') {
    return {
      kind: 'fitted-garment', implementation: 'sprite',
      output: `review/items/${id}/garment-{motion}-4dir.png`, directions: 4, motions: MOTIONS, status: 'planned',
    };
  }
  if (module === 'mutation') {
    return {
      kind: 'body-mutation', implementation: 'procedural',
      output: `recipes/body/${id}.json`, directions: 4, motions: MOTIONS, status: 'planned',
    };
  }
  if (module === 'vfx') {
    const followsBody = !['shadow', 'feet'].includes(anchor);
    return {
      kind: 'trigger-vfx', implementation: 'sprite',
      output: `review/items/${id}/vfx-trigger.png`, directions: followsBody ? 4 : 1, motions: ['trigger'], status: 'planned',
    };
  }
  return {
    kind: 'projectile-recipe', implementation: 'composer',
    output: `recipes/projectiles/${id}.json`, directions: 1, motions: ['flight', 'hit'], status: 'planned',
  };
}

function expectedClaim(moduleSet: ReadonlySet<ItemVisualModule>): string[] {
  const claims: string[] = [];
  if (moduleSet.has('rigid')) claims.push('rigid');
  if (moduleSet.has('garment')) claims.push('fitted');
  if (moduleSet.has('mutation')) claims.push('mutation');
  if (moduleSet.has('vfx')) claims.push('effect');
  return claims;
}

const contractIds = Object.keys(ITEM_VISUAL_MODULES_V2) as ItemId[];
const errors: string[] = [];
if (ITEM_IDS.length !== 77) errors.push(`expected 77 item ids, got ${ITEM_IDS.length}`);
for (const id of ITEM_IDS) {
  if (!contractIds.includes(id)) errors.push(`missing visual contract: ${id}`);
}
for (const id of contractIds) {
  if (!ITEM_IDS.includes(id)) errors.push(`orphan visual contract: ${id}`);
}

const items = ITEM_IDS.map((id, index) => {
  const definition = ITEM_DEFINITIONS[id];
  const appearance = ITEM_APPEARANCE_REGISTRY[id];
  const modules = ITEM_VISUAL_MODULES_V2[id];
  const moduleSet = new Set<ItemVisualModule>(modules);
  const claim = HERO_ITEM_CLAIMS[id];
  const expectedClaims = expectedClaim(moduleSet);
  const hasBodyMutation = appearance.mutations.some((mutation) => mutation.kind !== 'prop');
  const claimCovered = expectedClaims.length === 0
    || expectedClaims.includes(claim.kind)
    || (claim.kind === 'rigid' && moduleSet.has('garment'))
    || (claim.kind === 'rigid' && moduleSet.has('mutation') && hasBodyMutation)
    || (claim.kind === 'mutation' && moduleSet.has('vfx'))
    || (claim.kind === 'effect' && moduleSet.has('vfx'));
  const tasks = modules.map((module) => taskFor(id, module, appearance.anchor));
  if (modules.length === 0) errors.push(`empty visual module list: ${id}`);
  if (tasks.length === 0) errors.push(`no production tasks: ${id}`);
  return {
    order: index + 1,
    id,
    name: definition.name,
    quality: definition.quality,
    qualityName: definition.qualityName,
    slot: definition.slot,
    summary: definition.summary,
    positive: definition.positive,
    negative: definition.negative,
    modules,
    bodyConsequences: ITEM_BODY_CONSEQUENCES_V2[id] ?? [],
    anchor: appearance.anchor,
    layer: appearance.layer,
    priority: appearance.priority,
    visualBudget: appearance.visualBudget,
    mutationKinds: [...new Set(appearance.mutations.map((mutation) => mutation.kind))],
    animation: appearance.animation,
    currentClaim: claim,
    expectedClaimKinds: expectedClaims,
    currentClaimCoversPrimaryAsset: claimCovered,
    tasks,
    designSource: 'docs/主角道具外观系统-v2.md',
  };
});

const moduleCounts = Object.fromEntries(
  (['rigid', 'garment', 'mutation', 'vfx', 'projectile'] as const).map((module) => [
    module,
    items.filter((item) => item.modules.includes(module)).length,
  ]),
);
const taskCounts = items
  .flatMap((item) => item.tasks)
  .reduce<Record<string, number>>((counts, task) => {
    counts[task.kind] = (counts[task.kind] ?? 0) + 1;
    return counts;
  }, {});
const claimGaps = items
  .filter((item) => !item.currentClaimCoversPrimaryAsset)
  .map((item) => ({
    id: item.id,
    name: item.name,
    current: item.currentClaim.kind,
    expected: item.expectedClaimKinds,
  }));

const manifest = {
  version: 2,
  status: 'review-only',
  runtimeAssetsModified: false,
  generatedFrom: [
    'src/relics.ts',
    'src/item-appearance.ts',
    'src/hero-item-slots.ts',
    'src/item-visual-contract-v2.ts',
  ],
  frame: { width: 40, height: 56, directions: DIRECTIONS, motions: MOTIONS },
  count: items.length,
  moduleCounts,
  taskCounts,
  items,
};
const qa = {
  valid: errors.length === 0,
  errors,
  itemCount: items.length,
  itemsWithBodyConsequences: items.filter((item) => item.bodyConsequences.length > 0).length,
  itemsWithClaimGaps: claimGaps.length,
  claimGaps,
  plannedTaskCount: items.reduce((total, item) => total + item.tasks.length, 0),
};

await mkdir(OUT, { recursive: true });
await writeFile(resolve(OUT, 'item-visual-manifest-v2.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(resolve(OUT, 'item-visual-qa-v2.json'), `${JSON.stringify(qa, null, 2)}\n`);

const queue = items.flatMap((item) => item.tasks.map((task) => ({
  itemId: item.id,
  itemName: item.name,
  quality: item.quality,
  anchor: item.anchor,
  bodyConsequences: item.bodyConsequences,
  ...task,
})));
await writeFile(resolve(OUT, 'item-visual-production-queue-v2.json'), `${JSON.stringify(queue, null, 2)}\n`);

if (!qa.valid) throw new Error(`item visual contract failed: ${errors.join('; ')}`);
console.log(JSON.stringify({
  output: OUT,
  itemCount: qa.itemCount,
  moduleCounts,
  plannedTaskCount: qa.plannedTaskCount,
  claimGaps: qa.itemsWithClaimGaps,
}, null, 2));
