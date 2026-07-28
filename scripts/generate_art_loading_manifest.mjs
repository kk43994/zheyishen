import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_ROOT = resolve(ROOT, 'src/assets');
const OUTPUT = resolve(ROOT, 'src/art-loading-weights.json');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return nested.flat();
}

function included(relativePath) {
  if (!relativePath.endsWith('.png')) return false;
  if (relativePath.includes('/preview-')) return false;
  if (!relativePath.startsWith('canonical-v1/')) return true;
  return relativePath === 'canonical-v1/enemies/uniform-answer.png'
    || relativePath === 'canonical-v1/enemies/hunger-shadow.png';
}

function pngPixels(buffer, path) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`invalid_png:${path}`);
  }
  return buffer.readUInt32BE(16) * buffer.readUInt32BE(20);
}

const files = (await walk(ASSET_ROOT))
  .map((path) => ({ path, relativePath: relative(ASSET_ROOT, path).replaceAll('\\', '/') }))
  .filter(({ relativePath }) => included(relativePath))
  .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

const weights = {};
for (const { path, relativePath } of files) {
  weights[`./assets/${relativePath}`] = pngPixels(await readFile(path), path);
}

await writeFile(OUTPUT, `${JSON.stringify(weights, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  valid: true,
  files: files.length,
  pixels: Object.values(weights).reduce((sum, value) => sum + value, 0),
  output: relative(ROOT, OUTPUT),
}, null, 2));
