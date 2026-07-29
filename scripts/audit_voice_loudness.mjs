import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, dirname, relative, resolve } from 'node:path';
import { loadVoiceContract } from './load_voice_contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST_PATH = resolve(ROOT, 'public/assets/audio/voice/manifest.json');
const REPORT_PATH = resolve(ROOT, 'tmp/voice-loudness-report.json');
const TARGET_INTEGRATED_LUFS = -18;
const TARGET_TRUE_PEAK_DBTP = -1.5;
const TARGET_LRA_LU = 7;
const WRITE = process.argv.includes('--write');
const CHECK = process.argv.includes('--check');
const NORMALIZE_TOLERANCE_LU = 0.7;

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${label}: ${result.stderr || result.stdout || `${command} failed`}`);
  }
  return result;
}

function loudnormFilter(measured) {
  const base = [
    `I=${TARGET_INTEGRATED_LUFS}`,
    `TP=${TARGET_TRUE_PEAK_DBTP}`,
    `LRA=${TARGET_LRA_LU}`,
  ];
  if (measured) {
    base.push(
      `measured_I=${measured.integratedLufs}`,
      `measured_LRA=${measured.loudnessRangeLu}`,
      `measured_TP=${measured.truePeakDbtp}`,
      `measured_thresh=${measured.thresholdLufs}`,
      `offset=${measured.targetOffsetLu}`,
      'linear=true',
    );
  }
  base.push('print_format=json');
  return `loudnorm=${base.join(':')}`;
}

function measure(file) {
  const result = run('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i', file,
    '-af', loudnormFilter(),
    '-f', 'null',
    '-',
  ], `loudness measurement failed for ${relative(ROOT, file)}`);
  const blocks = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
  const raw = blocks?.at(-1) ? JSON.parse(blocks.at(-1)) : null;
  if (!raw) throw new Error(`loudnorm result missing for ${relative(ROOT, file)}`);
  const metrics = {
    integratedLufs: Number(raw.input_i),
    truePeakDbtp: Number(raw.input_tp),
    loudnessRangeLu: Number(raw.input_lra),
    thresholdLufs: Number(raw.input_thresh),
    targetOffsetLu: Number(raw.target_offset),
  };
  if (Object.values(metrics).some((value) => !Number.isFinite(value))) {
    throw new Error(`invalid loudness result for ${relative(ROOT, file)}`);
  }
  return metrics;
}

function needsNormalization(metrics) {
  return Math.abs(metrics.integratedLufs - TARGET_INTEGRATED_LUFS) > NORMALIZE_TOLERANCE_LU
    || metrics.truePeakDbtp > -1;
}

async function mediaInfo(file) {
  const result = run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'json',
    file,
  ], `media probe failed for ${relative(ROOT, file)}`);
  const duration = Number(JSON.parse(result.stdout).format?.duration);
  const info = await stat(file);
  return {
    bytes: info.size,
    durationMs: Math.round(duration * 1000),
  };
}

async function normalize(file, measured, workDir) {
  const output = resolve(
    workDir,
    `${relative(ROOT, dirname(file)).replaceAll('/', '__')}__${basename(file)}`,
  );
  let gainDb = TARGET_INTEGRATED_LUFS - measured.integratedLufs;
  let normalized = measured;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    run('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', file,
      '-af',
      `volume=${gainDb.toFixed(3)}dB,`
        + 'alimiter=limit=0.78:attack=5:release=70:level=false:latency=true',
      '-ar', '32000',
      '-ac', '1',
      '-codec:a', 'libmp3lame',
      '-b:a', '64k',
      output,
    ], `loudness normalization failed for ${relative(ROOT, file)}`);
    normalized = measure(output);
    if (Math.abs(normalized.integratedLufs - TARGET_INTEGRATED_LUFS) <= NORMALIZE_TOLERANCE_LU
      && normalized.truePeakDbtp <= -1) {
      await rename(output, file);
      return normalized;
    }
    gainDb += TARGET_INTEGRATED_LUFS - normalized.integratedLufs;
  }
  throw new Error(
    `normalized loudness outside gate for ${relative(ROOT, file)}: `
    + `${normalized.integratedLufs} LUFS, ${normalized.truePeakDbtp} dBTP`,
  );
}

const { VOICE_CUES, VOICE_CUE_IDS, validateVoiceScript } = await loadVoiceContract(ROOT);
validateVoiceScript();
const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const manifestById = new Map(manifest.map((entry) => [entry.id, entry]));
const assetPaths = new Map();

for (const id of VOICE_CUE_IDS) {
  const cue = VOICE_CUES[id];
  const entry = manifestById.get(id);
  for (const file of [cue.file, cue.playbackFile, entry?.reviewFile].filter(Boolean)) {
    assetPaths.set(file, resolve(ROOT, 'public', file));
  }
}

const beforeByFile = new Map();
for (const [file, path] of assetPaths) beforeByFile.set(file, measure(path));

let backupDir = null;
let workDir = null;
const afterByFile = new Map(beforeByFile);
if (WRITE) {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  backupDir = resolve(ROOT, 'tmp', `voice-loudness-backup-${stamp}`);
  workDir = await mkdtemp(resolve(ROOT, 'tmp/voice-loudness-work-'));
  await mkdir(backupDir, { recursive: true });
  await copyFile(MANIFEST_PATH, resolve(backupDir, 'manifest.json'));

  try {
    for (const [file, path] of assetPaths) {
      const before = beforeByFile.get(file);
      if (!needsNormalization(before)) continue;
      const backup = resolve(backupDir, file);
      await mkdir(dirname(backup), { recursive: true });
      await copyFile(path, backup);
      afterByFile.set(file, await normalize(path, before, workDir));
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

const rows = [];
for (const id of VOICE_CUE_IDS) {
  const cue = VOICE_CUES[id];
  const entry = manifestById.get(id);
  const sourceFile = cue.file;
  const runtimeFile = cue.playbackFile ?? cue.file;
  const reviewFile = entry?.reviewFile ?? null;
  const sourceAfter = afterByFile.get(sourceFile);
  const runtimeAfter = afterByFile.get(runtimeFile);
  rows.push({
    id,
    text: cue.text,
    role: cue.role,
    treatment: cue.treatment,
    intensity: cue.delivery.intensity,
    cueVolume: cue.volume,
    source: {
      file: sourceFile,
      before: beforeByFile.get(sourceFile),
      after: sourceAfter,
    },
    runtime: {
      file: runtimeFile,
      before: beforeByFile.get(runtimeFile),
      after: runtimeAfter,
    },
    review: reviewFile ? {
      file: reviewFile,
      before: beforeByFile.get(reviewFile),
      after: afterByFile.get(reviewFile),
    } : null,
  });

  if (WRITE) {
    if (!entry) throw new Error(`manifest entry missing for ${id}`);
    const sourceInfo = await mediaInfo(resolve(ROOT, 'public', sourceFile));
    const next = {
      ...entry,
      bytes: sourceInfo.bytes,
      durationMs: sourceInfo.durationMs,
      loudness: {
        standard: 'EBU R128',
        targetIntegratedLufs: TARGET_INTEGRATED_LUFS,
        targetTruePeakDbtp: TARGET_TRUE_PEAK_DBTP,
        integratedLufs: sourceAfter.integratedLufs,
        truePeakDbtp: sourceAfter.truePeakDbtp,
      },
    };
    if (runtimeFile !== sourceFile) {
      next.runtimeLoudness = {
        file: runtimeFile,
        integratedLufs: runtimeAfter.integratedLufs,
        truePeakDbtp: runtimeAfter.truePeakDbtp,
      };
    }
    if (reviewFile) {
      const reviewAfter = afterByFile.get(reviewFile);
      const reviewInfo = await mediaInfo(resolve(ROOT, 'public', reviewFile));
      next.reviewBytes = reviewInfo.bytes;
      next.reviewDurationMs = reviewInfo.durationMs;
      next.reviewLoudness = {
        file: reviewFile,
        integratedLufs: reviewAfter.integratedLufs,
        truePeakDbtp: reviewAfter.truePeakDbtp,
      };
    }
    manifestById.set(id, next);
  }
}

const runtimeBefore = rows.map((row) => row.runtime.before.integratedLufs);
const runtimeAfter = rows.map((row) => row.runtime.after.integratedLufs);
const auditedBefore = [...beforeByFile.values()];
const auditedAfter = [...afterByFile.values()];
const report = {
  generatedAt: new Date().toISOString(),
  normalized: WRITE,
  backupDir: backupDir ? relative(ROOT, backupDir) : null,
  target: {
    integratedLufs: TARGET_INTEGRATED_LUFS,
    truePeakDbtp: TARGET_TRUE_PEAK_DBTP,
    toleranceLu: NORMALIZE_TOLERANCE_LU,
  },
  summary: {
    cues: rows.length,
    uniqueRuntimeAssets: new Set(rows.map((row) => row.runtime.file)).size,
    uniqueAuditedAssets: assetPaths.size,
    auditedAssets: {
      beforeOutsideGate: auditedBefore.filter(needsNormalization).length,
      afterOutsideGate: auditedAfter.filter(needsNormalization).length,
    },
    before: {
      minIntegratedLufs: Math.min(...runtimeBefore),
      maxIntegratedLufs: Math.max(...runtimeBefore),
      outsideGate: rows.filter((row) => needsNormalization(row.runtime.before)).length,
    },
    after: {
      minIntegratedLufs: Math.min(...runtimeAfter),
      maxIntegratedLufs: Math.max(...runtimeAfter),
      outsideGate: rows.filter((row) => needsNormalization(row.runtime.after)).length,
    },
  },
  cues: rows,
};

// --check 是 validate:voice:strict 的一环，必须只读：CI 上写报告会让工作区变脏，
// 本地也会让 qa-report.json 反复出现在 git status 里。只有审计/归一化模式才落盘。
if (!CHECK) {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (WRITE) {
  const orderedManifest = manifest.map((entry) => manifestById.get(entry.id) ?? entry);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(orderedManifest, null, 2)}\n`, 'utf8');
}

const quietest = [...rows]
  .sort((left, right) => left.runtime.before.integratedLufs - right.runtime.before.integratedLufs)
  .slice(0, 12);
console.info(
  `[voice-loudness] ${rows.length} cues / ${assetPaths.size} assets; `
  + `before ${report.summary.before.minIntegratedLufs.toFixed(1)}..`
  + `${report.summary.before.maxIntegratedLufs.toFixed(1)} LUFS; `
  + `${report.summary.before.outsideGate} runtime cues outside gate`,
);
for (const row of quietest) {
  console.info(
    `[voice-loudness] quiet ${row.id} `
    + `${row.runtime.before.integratedLufs.toFixed(1)} LUFS `
    + `${row.runtime.before.truePeakDbtp.toFixed(1)} dBTP`,
  );
}
if (WRITE) {
  console.info(
    `[voice-loudness] normalized to ${TARGET_INTEGRATED_LUFS} LUFS / `
    + `${TARGET_TRUE_PEAK_DBTP} dBTP; after `
    + `${report.summary.after.minIntegratedLufs.toFixed(1)}..`
    + `${report.summary.after.maxIntegratedLufs.toFixed(1)} LUFS; `
    + `backup ${report.backupDir}`,
  );
}
console.info(`[voice-loudness] report ${relative(ROOT, REPORT_PATH)}`);
if (CHECK && report.summary.auditedAssets.afterOutsideGate > 0) {
  throw new Error(
    `${report.summary.auditedAssets.afterOutsideGate} voice assets outside `
    + `${TARGET_INTEGRATED_LUFS}±${NORMALIZE_TOLERANCE_LU} LUFS gate`,
  );
}
