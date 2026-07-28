import { readdir, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const target = resolve(ROOT, process.argv[2] ?? 'dist');
const PLATFORM_MAX_BYTES = 8 * 1024 * 1024;
const RELEASE_BUDGET_BYTES = 7 * 1024 * 1024;
const forbidden = [
  'item-art-review.html',
  'voice-review.html',
  'assets/icons.png',
  'assets/audio/sound-manifest.json',
  'assets/audio/voice/manifest.json',
  'assets/audio/voice/qa-report.json',
];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const files = await walk(target);
const records = await Promise.all(files.map(async (path) => ({
  path: relative(target, path).split('\\').join('/'),
  bytes: (await stat(path)).size,
})));
const totalBytes = records.reduce((sum, record) => sum + record.bytes, 0);
const forbiddenPresent = records
  .map((record) => record.path)
  .filter((path) => forbidden.includes(path)
    || path.startsWith('assets/audio/voice-concepts/')
    || path.startsWith('assets/audio/voice-review/')
    || /^assets\/audio\/ambience\/.*\.wav$/i.test(path));

if (forbiddenPresent.length) {
  throw new Error(`release contains review/source-only assets: ${forbiddenPresent.join(', ')}`);
}
if (totalBytes > RELEASE_BUDGET_BYTES) {
  throw new Error(
    `release unpacked size ${totalBytes} exceeds internal ${RELEASE_BUDGET_BYTES} byte budget`,
  );
}

console.info(JSON.stringify({
  valid: true,
  files: records.length,
  unpackedBytes: totalBytes,
  internalBudgetBytes: RELEASE_BUDGET_BYTES,
  platformMaxBytes: PLATFORM_MAX_BYTES,
  reservedBytes: PLATFORM_MAX_BYTES - totalBytes,
}, null, 2));
