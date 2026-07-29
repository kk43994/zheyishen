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
  if (!relativePath.endsWith('.png') && !relativePath.endsWith('.webp')) return false;
  if (relativePath.includes('/preview-')) return false;
  if (!relativePath.startsWith('canonical-v1/')) return true;
  return relativePath === 'canonical-v1/enemies/uniform-answer.png'
    || relativePath === 'canonical-v1/enemies/hunger-shadow.png';
}

function imagePixels(buffer, path) {
  if (path.endsWith('.png')) {
    if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
      throw new Error(`invalid_png:${path}`);
    }
    return buffer.readUInt32BE(16) * buffer.readUInt32BE(20);
  }
  if (buffer.length < 30
    || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`invalid_webp:${path}`);
  }
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return width * height;
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return width * height;
  }
  if (chunk === 'VP8X') {
    const width = buffer.readUIntLE(24, 3) + 1;
    const height = buffer.readUIntLE(27, 3) + 1;
    return width * height;
  }
  throw new Error(`unsupported_webp:${path}`);
}

const files = (await walk(ASSET_ROOT))
  .map((path) => ({ path, relativePath: relative(ASSET_ROOT, path).replaceAll('\\', '/') }))
  .filter(({ relativePath }) => included(relativePath))
  .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

const weights = {};
for (const { path, relativePath } of files) {
  weights[`./assets/${relativePath}`] = imagePixels(await readFile(path), path);
}

await writeFile(OUTPUT, `${JSON.stringify(weights, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  valid: true,
  files: files.length,
  pixels: Object.values(weights).reduce((sum, value) => sum + value, 0),
  output: relative(ROOT, OUTPUT),
}, null, 2));
