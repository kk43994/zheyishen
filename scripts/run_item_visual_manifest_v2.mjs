import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outfile = resolve(tmpdir(), 'zhe-yi-shen-item-visual-manifest-v2.mjs');
await build({
  entryPoints: [resolve('scripts/build_item_visual_manifest_v2.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'silent',
});
await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
