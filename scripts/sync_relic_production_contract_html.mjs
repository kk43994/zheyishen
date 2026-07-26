#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const sources = [
  resolve(root, 'docs/relic-production-spec-a-v1.js'),
  resolve(root, 'docs/relic-production-spec-b-v1.js'),
];
const output = resolve(root, 'docs/道具生产合同表.html');
const context = vm.createContext({ window: {} });

for (const source of sources) {
  vm.runInContext(await readFile(source, 'utf8'), context, { filename: source });
}

const specs = {
  ...context.window.RELIC_PRODUCTION_SPEC_A,
  ...context.window.RELIC_PRODUCTION_SPEC_B,
};
const data = Object.entries(specs).map(([id, contract]) => ({ id, ...contract }));
if (data.length !== 77) throw new Error(`expected 77 relic contracts, got ${data.length}`);

const html = await readFile(output, 'utf8');
const marker = /  const DATA = [^\n]*;\n  const ROOMS/;
if (!marker.test(html)) throw new Error('could not locate relic contract DATA block');
const next = html.replace(marker, `  const DATA = ${JSON.stringify(data)};\n  const ROOMS`);
await writeFile(output, next);
console.log(`synced ${data.length} relic contracts -> ${output}`);
