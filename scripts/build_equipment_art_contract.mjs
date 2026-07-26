#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCES = [
  resolve(ROOT, 'docs/relic-production-spec-a-v1.js'),
  resolve(ROOT, 'docs/relic-production-spec-b-v1.js'),
];
const OUTPUT = resolve(ROOT, 'src/assets/items/equipment-art.json');
const WIKI = resolve(ROOT, 'docs/这一身百科.html');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const source of SOURCES) {
  vm.runInContext(await readFile(source, 'utf8'), sandbox, { filename: source });
}

const combined = {
  ...sandbox.window.RELIC_PRODUCTION_SPEC_A,
  ...sandbox.window.RELIC_PRODUCTION_SPEC_B,
};

const normalizeName = (value) => value.replace(/\s+/g, '').replace(/[“”]/g, '"');
const cleanHtml = (value = '') => value
  .replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/&times;/g, '×')
  .replace(/&minus;/g, '−')
  .replace(/\s+/g, ' ')
  .trim();

const wikiHtml = await readFile(WIKI, 'utf8');
const itemArchiveStart = wikiHtml.indexOf('<div class="stage-h" id="wiki-item-archive">');
const itemArchiveEnd = wikiHtml.indexOf('<!-- 怪物图鉴 -->');
if (itemArchiveStart < 0 || itemArchiveEnd <= itemArchiveStart) {
  throw new Error('missing or invalid wiki item archive markers');
}
const itemSection = wikiHtml.slice(
  itemArchiveStart,
  itemArchiveEnd,
);
const wikiCanon = new Map(itemSection
  .split(/<div class="item"(?:\s[^>]*)?>/)
  .slice(1)
  .map((chunk) => {
    const name = cleanHtml(chunk.match(/<div class="nm">([\s\S]*?)<\/div>/)?.[1]);
    const look = cleanHtml(chunk.match(/<span class="look">([\s\S]*?)<\/span>/)?.[1]);
    const irony = cleanHtml(chunk.match(/<span class="iron">([\s\S]*?)<\/span>/)?.[1]);
    return [normalizeName(name), { look, irony }];
  })
  .filter(([name]) => name));

if (wikiCanon.size !== 77) throw new Error(`expected 77 wiki irony contracts, got ${wikiCanon.size}`);

const items = Object.entries(combined).map(([id, item], index) => ({
  ...(() => {
    const canon = wikiCanon.get(normalizeName(item.name));
    if (!canon?.irony) throw new Error(`missing wiki irony contract: ${id} / ${item.name}`);
    return { look: canon.look || item.hero, irony: canon.irony };
  })(),
  index,
  id,
  name: item.name,
  source: item.source,
  roles: item.roles,
  statOnly: item.statOnly,
  production: item.production,
  hero: item.hero,
  projectile: item.projectile,
  feedback: item.feedback,
}));

if (items.length !== 77) throw new Error(`expected 77 equipment contracts, got ${items.length}`);
await writeFile(OUTPUT, `${JSON.stringify({ version: 2, itemCount: items.length, items }, null, 2)}\n`);
console.log(`wrote ${items.length} equipment contracts -> ${OUTPUT}`);
