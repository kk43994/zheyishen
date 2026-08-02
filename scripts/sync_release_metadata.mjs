import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ZIP_PATH = resolve(ROOT, 'release/zhe-yi-shen-mvp.zip');
const PLATFORM_MAX_BYTES = 20 * 1024 * 1024;
const INTERNAL_BUDGET_MIB = 18;
const PLATFORM_MAX_MIB = 20;
const checkOnly = process.argv.includes('--check');

/**
 * 发布文档只能由最终 ZIP 的中央目录派生，不能读可被 `npm run build` 随时覆盖的
 * dist/。否则 package 之后再跑一次核心门禁，未优化 dist 就会把同一个 ZIP 误报成
 * “元数据过期”。当前包远小于 ZIP64 门槛；若未来触碰 ZIP64，明确失败而不是误算。
 */
function inspectZipContents(zip) {
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const searchStart = Math.max(0, zip.length - 22 - 0xffff);
  let eocd = -1;
  for (let offset = zip.length - 22; offset >= searchStart; offset -= 1) {
    if (zip.readUInt32LE(offset) === eocdSignature) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('release zip has no end-of-central-directory record');

  const entryCount = zip.readUInt16LE(eocd + 10);
  const centralBytes = zip.readUInt32LE(eocd + 12);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || centralBytes === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 release metadata is not supported');
  }

  let offset = centralOffset;
  let fileCount = 0;
  let unpackedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== centralSignature) {
      throw new Error(`release zip central directory is invalid at entry ${index}`);
    }
    const size = zip.readUInt32LE(offset + 24);
    const nameBytes = zip.readUInt16LE(offset + 28);
    const extraBytes = zip.readUInt16LE(offset + 30);
    const commentBytes = zip.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameBytes;
    if (nameEnd > zip.length) throw new Error(`release zip filename is truncated at entry ${index}`);
    const name = zip.subarray(nameStart, nameEnd).toString('utf8');
    if (!name.endsWith('/')) {
      fileCount += 1;
      unpackedBytes += size;
    }
    offset = nameEnd + extraBytes + commentBytes;
  }
  if (offset !== centralOffset + centralBytes) {
    throw new Error('release zip central directory length does not match its end record');
  }
  return { fileCount, unpackedBytes };
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
const { fileCount, unpackedBytes } = inspectZipContents(zip);
const reservedBytes = PLATFORM_MAX_BYTES - unpackedBytes;

const metadata = {
  zipBytes,
  sha256,
  unpackedBytes,
  fileCount,
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
        `- 玩家运行时文件：${fileCount} 个（zip 目录项不计）`, 'publish file count');
      next = replaceOne(next, /^\- 平台上限余量：.*$/m,
        `- 平台上限余量：${comma(reservedBytes)} 字节（${mib(reservedBytes)} MiB）`, 'publish reserve');
      next = replaceOne(next,
        /^\| \d+ MiB 内部预算与至少 \d+ MiB 预留 \| 通过（当前预留 .*） \|$/m,
        `| ${INTERNAL_BUDGET_MIB} MiB 内部预算与至少 2 MiB 预留 | 通过（当前预留 ${comma(reservedBytes)} 字节） |`,
        'publish budget row');
      return next;
    },
  },
  {
    path: 'docs/升级计划最新.md',
    transform(source) {
      let next = replaceOne(source,
        /当前 release zip [0-9.]+ MiB \/ 上限 \d+ MiB/,
        `当前 release zip ${mib(zipBytes)} MiB / 上限 ${PLATFORM_MAX_MIB} MiB`, 'plan art budget');
      next = replaceOne(next, /^\| release zip \| .*$/m,
        `| release zip | **${comma(zipBytes)} 字节（${mib(zipBytes)} MiB）** / 上限 ${PLATFORM_MAX_MIB} MiB | 当前正式包实测；运行时内容以发布验收文档与本行自动同步结果为准 |`,
        'plan zip row');
      next = replaceOne(next, /^\| 解压内容 \| .*$/m,
        `| 解压内容 | **${comma(unpackedBytes)} 字节（${mib(unpackedBytes)} MiB）** / 上限 ${PLATFORM_MAX_MIB} MiB | ${fileCount} 个运行时文件；剩余 ${comma(reservedBytes)} 字节（${mib(reservedBytes)} MiB） |`,
        'plan unpacked row');
      return next;
    },
  },
  {
    path: 'docs/六章Boss编排与传承线-v1.md',
    transform(source) {
      return replaceOne(source,
        /当前 release zip [0-9.]+ MiB \/ 上限 \d+ MiB/,
        `当前 release zip ${mib(zipBytes)} MiB / 上限 ${PLATFORM_MAX_MIB} MiB`, 'boss canon art budget');
    },
  },
  {
    path: 'docs/这一身_游戏开发计划书_V0.4.md',
    transform(source) {
      return replaceOne(source,
        /^\- 上传包根目录直接包含 `index\.html`，文件名全部使用 ASCII 安全字符；当前 zip 为 .*$/m,
        `- 上传包根目录直接包含 \`index.html\`，文件名全部使用 ASCII 安全字符；当前 zip 为 ${comma(zipBytes)} 字节（${mib(zipBytes)} MiB），解压内容为 ${comma(unpackedBytes)} 字节（${mib(unpackedBytes)} MiB），距离 ${PLATFORM_MAX_MIB} MiB 上限还有 ${comma(reservedBytes)} 字节。`,
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
