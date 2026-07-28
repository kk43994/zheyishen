import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(ROOT, 'public/assets/audio/voice/manifest.json'), 'utf8'));
const revisionEntries = manifest.filter((entry) => Number(entry.assetRevision) > 0);
const files = revisionEntries.flatMap((entry) => [
  { id: entry.id, kind: 'main', file: entry.file },
  ...(entry.reviewFile ? [{ id: entry.id, kind: 'review', file: entry.reviewFile }] : []),
]);
const failures = [];

for (const item of files) {
  const path = resolve(ROOT, 'public', item.file);
  const info = await stat(path).catch(() => null);
  const probe = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels',
    '-of', 'json',
    path,
  ], { encoding: 'utf8' });
  const media = probe.status === 0 ? JSON.parse(probe.stdout) : null;
  const stream = media?.streams?.[0];
  const duration = Number(media?.format?.duration);
  const volume = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', path,
    '-af', 'volumedetect',
    '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const mean = Number(volume.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]);
  const peak = Number(volume.stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]);
  const valid = info?.isFile()
    && info.size >= 512
    && stream?.codec_name === 'mp3'
    && Number(stream.sample_rate) === 32000
    && stream.channels === 1
    && Number.isFinite(duration)
    && duration >= 0.4
    && duration <= 20
    && Number.isFinite(mean)
    && mean >= -38
    && Number.isFinite(peak)
    && peak <= 0;
  if (!valid) failures.push(`${item.id}:${item.kind}`);
  console.info(
    `[voice-revision] ${item.id}:${item.kind} ${duration.toFixed(2)}s mean ${mean.toFixed(1)}dB peak ${peak.toFixed(1)}dB`,
  );
}

if (revisionEntries.length !== 21) {
  failures.push(`revision-count:${revisionEntries.length}`);
}
if (files.filter((item) => item.kind === 'review').length !== 7) {
  failures.push(`review-composite-count:${files.filter((item) => item.kind === 'review').length}`);
}
if (failures.length) throw new Error(`invalid revised audio: ${failures.join(', ')}`);
console.info(`[voice-revision] validated ${revisionEntries.length} revised assets and 7 composite review files`);
