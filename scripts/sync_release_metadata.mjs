import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ZIP_PATH = resolve(ROOT, 'release/zhe-yi-shen-mvp.zip');
const DIST_PATH = resolve(ROOT, 'dist');
const PLATFORM_MAX_BYTES = 8 * 1024 * 1024;
const checkOnly = process.argv.includes('--check');

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function comma(bytes) {
  return new Intl.NumberFormat('en-US').format(bytes);
}

function mib(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function replaceOne(source, pattern, replacement, label) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
  if (matches?.length !== 1) {
    throw new Error(`${label}: expected exactly one metadata field, found ${matches?.length ?? 0}`);
  }
  return source.replace(pattern, replacement);
}

const zip = await readFile(ZIP_PATH);
const zipBytes = zip.byteLength;
const sha256 = createHash('sha256').update(zip).digest('hex');
const distFiles = await walk(DIST_PATH);
const unpackedBytes = (await Promise.all(distFiles.map(async (path) => (await stat(path)).size)))
  .reduce((sum, bytes) => sum + bytes, 0);
const reservedBytes = PLATFORM_MAX_BYTES - unpackedBytes;

const metadata = {
  zipBytes,
  sha256,
  unpackedBytes,
  fileCount: distFiles.length,
  reservedBytes,
};

const targets = [
  {
    path: 'docs/互动空间发布验收-v1.md',
    transform(source) {
      let next = replaceOne(source, /^\- zip 体积：.*$/m,
        `- zip 体积：${comma(zipBytes)} 字节（${mib(zipBytes)} MiB）`, 'publish zip size');
      next = replaceOne(next, /^\- SHA-256：.*$/m, `- SHA-256：\`${sha256}\``, 'publish sha256');
      next = replaceOne(next, /^\- 解压内容：.*$/m,
        `- 解压内容：${comma(unpackedBytes)} 字节（${mib(unpackedBytes)} MiB）`, 'publish unpacked size');
      next = replaceOne(next, /^\- 玩家运行时文件：.*$/m,
        `- 玩家运行时文件：${distFiles.length} 个（zip 目录项不计）`, 'publish file count');
      next = replaceOne(next, /^\- 平台上限余量：.*$/m,
        `- 平台上限余量：${comma(reservedBytes)} 字节（${mib(reservedBytes)} MiB）`, 'publish reserve');
      next = replaceOne(next,
        /^\| 7 MiB 内部预算与至少 1 MiB 预留 \| 通过（当前预留 .*） \|$/m,
        `| 7 MiB 内部预算与至少 1 MiB 预留 | 通过（当前预留 ${comma(reservedBytes)} 字节） |`,
        'publish budget row');
      return next;
    },
  },
  {
    path: 'docs/升级计划最新.md',
    transform(source) {
      let next = replaceOne(source,
        /当前 release zip [0-9.]+ MiB \/ 上限 8 MiB/,
        `当前 release zip ${mib(zipBytes)} MiB / 上限 8 MiB`, 'plan art budget');
      next = replaceOne(next, /^\| release zip \| .*$/m,
        `| release zip | **${comma(zipBytes)} 字节（${mib(zipBytes)} MiB）** / 上限 8 MiB | 当前正式包实测；运行时内容以发布验收文档与本行自动同步结果为准 |`,
        'plan zip row');
      next = replaceOne(next, /^\| 解压内容 \| .*$/m,
        `| 解压内容 | **${comma(unpackedBytes)} 字节（${mib(unpackedBytes)} MiB）** / 上限 8 MiB | ${distFiles.length} 个运行时文件；剩余 ${comma(reservedBytes)} 字节（${mib(reservedBytes)} MiB） |`,
        'plan unpacked row');
      return next;
    },
  },
  {
    path: 'docs/六章Boss编排与传承线-v1.md',
    transform(source) {
      return replaceOne(source,
        /当前 release zip [0-9.]+ MiB \/ 上限 8 MiB/,
        `当前 release zip ${mib(zipBytes)} MiB / 上限 8 MiB`, 'boss canon art budget');
    },
  },
  {
    path: 'docs/这一身_游戏开发计划书_V0.4.md',
    transform(source) {
      return replaceOne(source,
        /^\- 上传包根目录直接包含 `index\.html`，文件名全部使用 ASCII 安全字符；当前 zip 为 .*$/m,
        `- 上传包根目录直接包含 \`index.html\`，文件名全部使用 ASCII 安全字符；当前 zip 为 ${comma(zipBytes)} 字节（${mib(zipBytes)} MiB），解压内容为 ${comma(unpackedBytes)} 字节（${mib(unpackedBytes)} MiB），距离 8 MiB 上限还有 ${comma(reservedBytes)} 字节。`,
        'development plan release row');
    },
  },
];

const stale = [];
for (const target of targets) {
  const path = resolve(ROOT, target.path);
  const source = await readFile(path, 'utf8');
  const next = target.transform(source);
  if (next === source) continue;
  stale.push(target.path);
  if (!checkOnly) await writeFile(path, next);
}

if (checkOnly && stale.length) {
  throw new Error(`release metadata is stale: ${stale.join(', ')}`);
}

console.info(JSON.stringify({
  valid: true,
  mode: checkOnly ? 'check' : 'sync',
  updated: checkOnly ? [] : stale,
  ...metadata,
}, null, 2));
