import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const manifestPath = resolve(ROOT, 'public/assets/audio/sound-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const platformAudioSource = await readFile(resolve(ROOT, 'src/audio-platform.ts'), 'utf8');
const bufferedAudioSource = await readFile(resolve(ROOT, 'src/audio.ts'), 'utf8');
const gameSource = await readFile(resolve(ROOT, 'src/game.ts'), 'utf8');
const entries = [
  ...Object.entries(manifest.sfx ?? {}).map(([id, value]) => [`sfx:${id}`, value]),
  ...Object.entries(manifest.ambience ?? {}).map(([id, value]) => [`ambience:${id}`, value]),
  ...Object.entries(manifest.music ?? {}).map(([id, value]) => [`music:${id}`, value]),
];

if (entries.length !== 28) throw new Error(`expected 28 sound assets, received ${entries.length}`);
for (const [name, source] of [['platform', platformAudioSource], ['buffered', bufferedAudioSource]]) {
  if (!source.includes("DEFAULT_AUDIO_MIGRATION_KEY = 'zhe-yi-shen:default-audio-v2'")) {
    throw new Error(`${name} audio runtime does not migrate the release default to enabled`);
  }
  if (!source.includes('private volume = readInitialVolume()')) {
    throw new Error(`${name} audio runtime does not initialize the enabled default`);
  }
  for (const token of [
    "export type AudioMixChannel = 'effects' | 'ambience' | 'music' | 'voice'",
    'setMusic(track?: number)',
    'setMusicTension(active: boolean)',
    "zhe-yi-shen:music-volume",
  ]) {
    if (!source.includes(token)) throw new Error(`${name} audio runtime missing music contract: ${token}`);
  }
}
if (gameSource.includes('audioPromptOpen') || gameSource.includes('安静地开始')) {
  throw new Error('title flow still blocks on the removed audio-choice prompt');
}
for (const token of [
  'this.feedback.setMusic(this.encounterIndex + 1)',
  'this.feedback.setMusicTension(true)',
  "this.feedback.getMixVolume('music')",
  "this.feedback.play('train', 0.9)",
  "this.feedback.play('monitor', 0.72)",
  "this.feedback.play('phone', phaseTwo ? 1.08 : 0.9)",
]) {
  if (!gameSource.includes(token)) throw new Error(`game music integration missing: ${token}`);
}

let totalBytes = 0;
let productionSfxBytes = 0;
let productionAmbienceBytes = 0;
let productionMusicBytes = 0;
for (const [id, entry] of entries) {
  const path = resolve(ROOT, 'public/assets/audio', entry.file);
  const info = await stat(path);
  const bytes = await readFile(path);
  const header = bytes.subarray(0, 12);
  const isWav = header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WAVE';
  if (!info.isFile() || info.size < 1024 || !isWav) throw new Error(`invalid sound asset: ${id}`);
  if (entry.origin === 'curated-field-recording') {
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (entry.sha256 !== actualHash) throw new Error(`sound checksum mismatch: ${id}`);
    if (entry.source?.license !== 'CC0-1.0' || !entry.source?.landing?.startsWith('https://freesound.org/')) {
      throw new Error(`invalid curated source license: ${id}`);
    }
  } else if (entry.origin !== 'project-authored-procedural') {
    throw new Error(`sound origin is not declared: ${id}`);
  }
  totalBytes += info.size;

  if (id.startsWith('sfx:')) {
    const productionFile = entry.file.replace(/\.wav$/i, '.mp3');
    const productionPath = resolve(ROOT, 'public/assets/audio', productionFile);
    const productionInfo = await stat(productionPath);
    const productionBytes = await readFile(productionPath);
    const hasId3Header = productionBytes.subarray(0, 3).toString('ascii') === 'ID3';
    if (!productionInfo.isFile() || productionInfo.size < 1024 || !hasId3Header) {
      throw new Error(`invalid production sfx: ${id}`);
    }
    if (!platformAudioSource.includes(`assets/audio/${productionFile}`)
      || !bufferedAudioSource.includes(`assets/audio/${productionFile}`)) {
      throw new Error(`production sfx is not wired into both audio runtimes: ${id}`);
    }
    productionSfxBytes += productionInfo.size;
  }
  if (id.startsWith('ambience:')) {
    const productionFile = entry.file.replace(/\.wav$/i, '.mp3');
    const productionPath = resolve(ROOT, 'public/assets/audio', productionFile);
    const productionInfo = await stat(productionPath);
    const productionBytes = await readFile(productionPath);
    const hasId3Header = productionBytes.subarray(0, 3).toString('ascii') === 'ID3';
    if (!productionInfo.isFile() || productionInfo.size < 4096 || !hasId3Header) {
      throw new Error(`invalid production ambience: ${id}`);
    }
    if (!platformAudioSource.includes(`assets/audio/${productionFile}`)) {
      throw new Error(`production ambience is not wired into platform runtime: ${id}`);
    }
    productionAmbienceBytes += productionInfo.size;
  }
  if (id.startsWith('music:')) {
    const productionFile = entry.file.replace(/\.wav$/i, '.mp3');
    const productionPath = resolve(ROOT, 'public/assets/audio', productionFile);
    const productionInfo = await stat(productionPath);
    const productionBytes = await readFile(productionPath);
    const hasId3Header = productionBytes.subarray(0, 3).toString('ascii') === 'ID3';
    if (!productionInfo.isFile() || productionInfo.size < 4096 || !hasId3Header) {
      throw new Error(`invalid production music: ${id}`);
    }
    if (!platformAudioSource.includes(`assets/audio/${productionFile}`)
      || !bufferedAudioSource.includes(`assets/audio/${productionFile}`)) {
      throw new Error(`production music is not wired into both audio runtimes: ${id}`);
    }
    productionMusicBytes += productionInfo.size;
  }
}

console.info(
  `[sound] sources ${entries.length}/28; ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; `
  + `production sfx ${(productionSfxBytes / 1024 / 1024).toFixed(2)} MiB; `
  + `production ambience ${(productionAmbienceBytes / 1024 / 1024).toFixed(2)} MiB; `
  + `production music ${(productionMusicBytes / 1024 / 1024).toFixed(2)} MiB`,
);
