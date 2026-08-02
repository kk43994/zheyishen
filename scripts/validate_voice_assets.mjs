import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { loadVoiceContract } from './load_voice_contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const allowMissing = process.argv.includes('--allow-missing');
const { VOICE_CUES, VOICE_CUE_IDS, validateVoiceScript } = await loadVoiceContract(ROOT);
const RESOLVED_ASR_IDS = new Set([
  'teacher-last-row',
  'landlord-rent-deposit',
  'family-dinner-cold',
]);

validateVoiceScript();
const gameSource = await readFile(resolve(ROOT, 'src/game.ts'), 'utf8');
const unreferenced = VOICE_CUE_IDS.filter((id) => !gameSource.includes(`'${id}'`));
if (unreferenced.length) throw new Error(`voice cues without runtime trigger: ${unreferenced.join(', ')}`);

const missing = [];
const invalid = [];
const resolvedAssetRegressions = [];
let totalBytes = 0;
let totalDuration = 0;
const manifest = JSON.parse(await readFile(resolve(ROOT, 'public/assets/audio/voice/manifest.json'), 'utf8').catch(() => '[]'));
const qaReport = JSON.parse(await readFile(resolve(ROOT, 'public/assets/audio/voice/qa-report.json'), 'utf8').catch(() => '[]'));
const manifestById = new Map(manifest.map((entry) => [entry.id, entry]));
const duplicateManifestIds = manifest.filter((entry, index) => manifest.findIndex((candidate) => candidate.id === entry.id) !== index);
if (duplicateManifestIds.length) throw new Error(`duplicate voice manifest ids: ${duplicateManifestIds.map((entry) => entry.id).join(', ')}`);
for (const id of VOICE_CUE_IDS) {
  const path = resolve(ROOT, 'public', VOICE_CUES[id].file);
  try {
    const info = await stat(path);
    const bytes = await readFile(path);
    const header = bytes.subarray(0, 3);
    const looksLikeMp3 = header.toString('ascii') === 'ID3' || (header[0] === 0xff && ((header[1] ?? 0) & 0xe0) === 0xe0);
    const probe = spawnSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', path,
    ], { encoding: 'utf8' });
    const media = probe.status === 0 ? JSON.parse(probe.stdout) : null;
    const stream = media?.streams?.[0];
    const duration = Number(media?.format?.duration);
    const validMedia = stream?.codec_name === 'mp3' && Number(stream.sample_rate) === 32000 && stream.channels === 1
      && Number.isFinite(duration) && duration >= 0.4 && duration <= 20;
    const entry = manifestById.get(id);
    const validManifest = entry?.file === VOICE_CUES[id].file
      && ['MiniMax', 'Kokoro'].includes(entry?.provider)
      && JSON.stringify(entry?.delivery) === JSON.stringify(VOICE_CUES[id].delivery);
    if (RESOLVED_ASR_IDS.has(id)) {
      const actualSha256 = createHash('sha256').update(bytes).digest('hex');
      const promotedAssetIsPinned = Number(entry?.assetRevision) >= 2
        && typeof entry?.promotedAt === 'string'
        && entry.promotedAt.length > 0
        && entry?.sha256 === actualSha256
        && Number(entry?.candidateQa?.pronunciationErrorRate) === 0;
      if (!promotedAssetIsPinned) resolvedAssetRegressions.push(id);
    }
    if (!info.isFile() || info.size < 512 || !looksLikeMp3 || !validMedia || !validManifest) invalid.push(id);
    else {
      totalBytes += info.size;
      totalDuration += duration;
    }
  } catch {
    missing.push(id);
  }
}

if (resolvedAssetRegressions.length) {
  throw new Error(`resolved ASR assets lost promoted metadata or hash pin: ${resolvedAssetRegressions.join(', ')}`);
}
if (invalid.length) throw new Error(`invalid voice assets: ${invalid.join(', ')}`);
if (missing.length && !allowMissing) throw new Error(`missing ${missing.length} voice assets: ${missing.join(', ')}`);
if (!allowMissing) {
  const qaById = new Map(qaReport.map((entry) => [entry.id, entry]));
  const missingQa = VOICE_CUE_IDS.filter((id) => !qaById.has(id));
  const failedQa = VOICE_CUE_IDS.filter((id) => !['pass', 'manual-review'].includes(qaById.get(id)?.status));
  const regressedResolvedQa = [...RESOLVED_ASR_IDS].filter((id) => {
    const entry = qaById.get(id);
    return entry?.status !== 'pass' || Number(entry?.pronunciationErrorRate) !== 0;
  });
  if (missingQa.length) throw new Error(`missing voice QA entries: ${missingQa.join(', ')}`);
  if (failedQa.length) throw new Error(`voice QA did not pass: ${failedQa.join(', ')}`);
  if (regressedResolvedQa.length) throw new Error(`resolved ASR cues regressed: ${regressedResolvedQa.join(', ')}`);
}

console.info(`[voice] contract ${VOICE_CUE_IDS.length} cues; runtime references ${VOICE_CUE_IDS.length - unreferenced.length}`);
console.info(`[voice] assets ${VOICE_CUE_IDS.length - missing.length}/${VOICE_CUE_IDS.length}; ${totalDuration.toFixed(1)} s; ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
if (!allowMissing) console.info(`[voice] pronunciation QA ${qaReport.filter((entry) => entry.status === 'pass').length} pass; ${qaReport.filter((entry) => entry.status === 'manual-review').length} manual review`);
if (missing.length) console.info(`[voice] generation pending for ${missing.length} files (--allow-missing)`);
