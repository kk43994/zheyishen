#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

const equipment = readJson('src/assets/items/equipment-art.json');
const sprites = readJson('src/assets/items/equipment-sprites.json');
const palettes = readJson('src/assets/items/source-palettes.json');
const slotSource = fs.readFileSync(path.join(ROOT, 'src/hero-item-slots.ts'), 'utf8');
const output = path.join(ROOT, 'src/assets/items/runtime-art-consumers.json');
const PROJECTILE_TRIGGER_ONLY = new Set(['breath-on-glass', 'three-day-visible', 'typing-indicator']);
const NON_PERSISTENT_HERO = new Set([...PROJECTILE_TRIGGER_ONLY, 'eye-exercise']);

const claimById = new Map();
for (const match of slotSource.matchAll(/^\s*(?:'([^']+)'|([a-z][\w-]*)):\s*\{\s*kind:\s*'(rigid|fitted|mutation|effect)'/gm)) {
  claimById.set(match[1] ?? match[2], match[3]);
}

const spriteById = new Map(sprites.items.map((item) => [item.id, item]));
const records = equipment.items.map((item) => {
  const claim = claimById.get(item.id);
  const palette = palettes.items[item.id];
  const sprite = spriteById.get(item.id);
  if (!claim) throw new Error(`${item.id}: no hero item claim`);
  if (!palette) throw new Error(`${item.id}: no Image2 source palette`);
  if (!sprite) throw new Error(`${item.id}: no Image2 sprite record`);

  const persistentHero = NON_PERSISTENT_HERO.has(item.id)
    ? false
    : !/(不上身|纯玩法道具|纯弹体行为)/.test(item.hero);
  let heroConsumer;
  if (PROJECTILE_TRIGGER_ONLY.has(item.id)) {
    heroConsumer = 'image2-projectile-trigger-preview';
  } else if (!persistentHero && item.production.length === 1 && item.production.includes('projectile')) {
    heroConsumer = 'image2-projectile-trigger-preview';
  } else if (!persistentHero && item.production.includes('event')) {
    heroConsumer = 'image2-event-composite';
  } else if (item.id === 'small-uniform') heroConsumer = 'image2-fitted-uniform-anatomy-atlas';
  else if (item.id === 'fathers-raincoat') heroConsumer = 'image2-fitted-raincoat-palette-atlas';
  else if (item.id === 'third-pill') heroConsumer = 'image2-state-overlay-atlas';
  else if (item.id === 'auto-renew') heroConsumer = 'image2-state-overlay-atlas';
  else if (item.id === 'shop-freezer') heroConsumer = 'image2-state-overlay-atlas';
  else if (item.id === 'pregnancy-test') heroConsumer = 'image2-state-overlay-atlas';
  else if (item.id === 'cracked-glasses') heroConsumer = 'image2-state-overlay-atlas';
  else if (item.id === 'divorce-draft') heroConsumer = 'image2-state-overlay-atlas';
  else if (item.id === 'goodnight-2h') heroConsumer = 'image2-state-overlay-atlas';
  else if (item.id === 'momo-avatar') heroConsumer = 'image2-state-overlay-atlas';
  else if (item.id === 'eye-exercise') heroConsumer = 'image2-state-overlay-atlas';
  else if (item.id === 'server-shutdown') heroConsumer = 'image2-state-overlay-atlas';
  else if (claim === 'rigid') heroConsumer = 'image2-rigid-four-direction-atlas';
  else if (claim === 'effect') heroConsumer = 'image2-palette-event-effect';
  else heroConsumer = 'image2-palette-body-mutation';

  const consumers = [heroConsumer];
  if (item.production.includes('projectile')) consumers.push('image2-projectile-atlas');
  if (item.production.includes('event')) consumers.push('image2-event-composite');
  if (item.production.includes('morph')) consumers.push('anatomy-part-morph');
  if (item.production.includes('decal')) consumers.push('anatomy-part-decal');
  if (item.production.includes('aura')) consumers.push('source-palette-aura');
  if (item.id === 'slow-watch') consumers.push('image2-state-overlay-atlas');
  if (item.id === 'broken-spine') consumers.push('image2-state-overlay-atlas');

  return {
    index: item.index,
    id: item.id,
    name: item.name,
    claim,
    production: item.production,
    persistentHero,
    heroConsumer,
    consumers: [...new Set(consumers)],
    source: palette.source,
    sourceSha256: palette.sourceSha256,
    sourcePalette: {
      ink: palette.ink,
      dominant: palette.dominant,
      accent: palette.accent,
      light: palette.light,
    },
    runtimeEntry: heroConsumer === 'image2-projectile-trigger-preview'
      ? 'src/game.ts#renderProjectiles'
      : heroConsumer === 'image2-event-composite'
        ? 'src/hero-item-mutations.ts#drawHeroItemMutationPass'
        : heroConsumer === 'image2-state-overlay-atlas'
          ? 'src/hero-pixel.ts#itemStateOverlayAtlas.slice'
        : claim === 'rigid'
      ? 'src/hero-item-pixel.ts#drawImage2Equipment'
      : claim === 'fitted'
        ? 'src/hero-pixel.ts#paintAtlasFrame'
        : 'src/hero-item-mutations.ts#drawHeroItemMutationPass',
    wikiHero: item.hero,
    wikiIrony: item.irony,
  };
});

if (records.length !== 77) throw new Error(`expected 77 consumers, got ${records.length}`);
if (records.some((record) => record.consumers.some((consumer) => consumer.includes('programmatic-only')))) {
  throw new Error('programmatic-only item art consumer is forbidden');
}

const summary = records.reduce((counts, record) => {
  counts[record.heroConsumer] = (counts[record.heroConsumer] ?? 0) + 1;
  return counts;
}, {});

fs.writeFileSync(output, `${JSON.stringify({
  version: 1,
  itemCount: records.length,
  sourceModel: sprites.model,
  sourceRoute: sprites.route,
  summary,
  items: records,
}, null, 2)}\n`);
console.log(JSON.stringify({ itemCount: records.length, summary }, null, 2));
