import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const manifestPath = resolve(ROOT, 'public/assets/audio/sound-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const platformAudioSource = await readFile(resolve(ROOT, 'src/audio-platform.ts'), 'utf8');
const bufferedAudioSource = await readFile(resolve(ROOT, 'src/audio.ts'), 'utf8');
const ambienceProfileSource = await readFile(resolve(ROOT, 'src/audio-ambience.ts'), 'utf8');
const audioMixSource = await readFile(resolve(ROOT, 'src/audio-mix.ts'), 'utf8');
const gameSource = await readFile(resolve(ROOT, 'src/game.ts'), 'utf8');
const entries = [
  ...Object.entries(manifest.sfx ?? {}).map(([id, value]) => [`sfx:${id}`, value]),
  ...Object.entries(manifest.ambience ?? {}).map(([id, value]) => [`ambience:${id}`, value]),
  ...Object.entries(manifest.music ?? {}).map(([id, value]) => [`music:${id}`, value]),
];

if (entries.length !== 45) throw new Error(`expected 45 sound assets, received ${entries.length}`);
for (const [name, source] of [['platform', platformAudioSource], ['buffered', bufferedAudioSource]]) {
  if (!source.includes("DEFAULT_AUDIO_MIGRATION_KEY = 'zhe-yi-shen:default-audio-v2'")) {
    throw new Error(`${name} audio runtime does not migrate the release default to enabled`);
  }
  if (!source.includes("BALANCED_AUDIO_MIGRATION_KEY = 'zhe-yi-shen:balanced-audio-v3'")) {
    throw new Error(`${name} audio runtime does not migrate the legacy 42% master level`);
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
  for (const token of [
    "from './audio-ambience'",
    "from './audio-mix'",
    'ambienceProfile(stage)',
    'configureAmbienceFilter(',
    'ambienceAssetGain(',
    'musicAssetGain(',
    'sfxMixGain(',
    'playAmbienceEvent(sound: LifeSound',
  ]) {
    if (!source.includes(token)) throw new Error(`${name} audio runtime missing shared ambience profile: ${token}`);
  }
}

for (const token of [
  'export const DEFAULT_MASTER_VOLUME = 0.68',
  'export const LEGACY_MASTER_VOLUME = 0.42',
  'export const DEFAULT_MUSIC_VOLUME = 0.42',
  'export function upgradeLegacyMasterVolume(volume: number)',
  'export const VOICE_PLAYBACK_GAIN = 1.18',
  'export const VOICE_SFX_DUCK = 0.58',
  'export const VOICE_AMBIENCE_DUCK = 0.82',
  'export const VOICE_MUSIC_DUCK = 0.55',
  'export const VOICE_BEHIND_DOOR_LOW_PASS_HZ = 2400',
  'export const VOICE_BEHIND_DOOR_FILTER_Q = 0.35',
  'export const SFX_BUS_GAIN = 1',
  'export const AMBIENCE_BUS_GAIN = 1.35',
  'export const MUSIC_BUS_GAIN = 0.8',
  'export const TENSION_BUS_GAIN = 0.56',
  'export const TENSION_ASSET_GAIN = 1.75',
  'const MUSIC_ASSET_GAINS = [',
  'const AMBIENCE_ASSET_GAINS = [',
  'const SFX_MIX_GAINS:',
]) {
  if (!audioMixSource.includes(token)) throw new Error(`shared audio mix is incomplete: ${token}`);
}
const readMixConstant = (name) => Number(
  audioMixSource.match(new RegExp(`export const ${name} = ([0-9.]+);`))?.[1],
);
const defaultBgmToVoiceRatio = (
  readMixConstant('MUSIC_BUS_GAIN') * readMixConstant('DEFAULT_MUSIC_VOLUME')
) / (readMixConstant('VOICE_PLAYBACK_GAIN') * 0.84);
if (!Number.isFinite(defaultBgmToVoiceRatio) || Math.abs(defaultBgmToVoiceRatio - 1 / 3) > 0.02) {
  throw new Error(`default BGM/voice amplitude ratio must stay near 1:3, received ${defaultBgmToVoiceRatio}`);
}
for (const [name, source] of [['platform', platformAudioSource], ['buffered', bufferedAudioSource]]) {
  for (const token of ['VOICE_BEHIND_DOOR_LOW_PASS_HZ', 'VOICE_BEHIND_DOOR_FILTER_Q']) {
    if (!source.includes(token)) throw new Error(`${name} runtime missing shared behind-door voice filter: ${token}`);
  }
  if (source.includes('filter.frequency.value = 1050')) {
    throw new Error(`${name} runtime still uses the unintelligible legacy behind-door cutoff`);
  }
}
for (const token of [
  'private outputLimiter?: DynamicsCompressorNode',
  'if (document.visibilityState !== \'visible\' || !platformAudioUnlocked) return',
  'this.master.connect(this.outputLimiter)',
  'filter.connect(this.outputLimiter ?? context.destination)',
  'sfxEngine.elementFilter(player)',
]) {
  if (!platformAudioSource.includes(token)) throw new Error(`production mix limiter is incomplete: ${token}`);
}

const ambienceProfileCount = (ambienceProfileSource.match(/\blabel:\s*'/g) ?? []).length;
if (ambienceProfileCount !== 9) {
  throw new Error(`expected 9 chapter and scene ambience profiles, received ${ambienceProfileCount}`);
}
const ambienceRates = [...ambienceProfileSource.matchAll(/\bplaybackRate:\s*([0-9.]+)/g)]
  .map((match) => Number(match[1]));
const ambienceLevels = [...ambienceProfileSource.matchAll(/\blevel:\s*([0-9.]+)/g)]
  .map((match) => Number(match[1]));
if (ambienceRates.length !== 9 || ambienceRates.some((rate) => rate < 0.98 || rate > 1.02)) {
  throw new Error('ambience playback rates must stay within the restrained 0.98–1.02 range');
}
if (ambienceLevels.length !== 9 || ambienceLevels.some((level) => level < 0.6 || level > 1)) {
  throw new Error('ambience levels must stay within the restrained 0.60–1.00 range');
}

const ambienceGainBlock = audioMixSource.match(
  /const AMBIENCE_ASSET_GAINS = \[([\s\S]*?)\] as const;/,
)?.[1] ?? '';
const ambienceGains = [...ambienceGainBlock.matchAll(/^\s*([0-9.]+),/gm)]
  .map((match) => Number(match[1]));
const ambienceRawLufs = [-29.02, -32.41, -34.97, -37.03, -30.60, -36.13, -37.73, -37.65, -34.90];
const ambienceTargets = [-35, -31.3, -35, -35, -35, -35, -37, -37, -37];
const ambienceBusGain = Number(
  audioMixSource.match(/export const AMBIENCE_BUS_GAIN = ([0-9.]+);/)?.[1],
);
const defaultMasterVolume = Number(
  audioMixSource.match(/export const DEFAULT_MASTER_VOLUME = ([0-9.]+);/)?.[1],
);
if (ambienceGains.length !== 9 || !Number.isFinite(ambienceBusGain) || !Number.isFinite(defaultMasterVolume)) {
  throw new Error('ambience loudness calibration table is incomplete');
}
for (let index = 0; index < ambienceTargets.length; index += 1) {
  const effectiveGain = ambienceGains[index] * ambienceLevels[index] * ambienceBusGain * defaultMasterVolume;
  const outputLufs = ambienceRawLufs[index] + 20 * Math.log10(effectiveGain);
  if (Math.abs(outputLufs - ambienceTargets[index]) > 0.4) {
    throw new Error(
      `ambience ${index} output ${outputLufs.toFixed(1)} LUFS misses target ${ambienceTargets[index].toFixed(1)} LUFS`,
    );
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
  "this.feedback.play('shield'",
  "this.feedback.play('heal'",
  "this.feedback.play('dash'",
  "this.feedback.play('door'",
  "this.feedback.play('lamp'",
  "this.feedback.play('boss-warn'",
  "this.feedback.play('boss-release'",
  "this.feedback.play('boss-hit'",
  'this.feedback.playAmbienceEvent(event.sound, event.intensity)',
  'this.feedback.setMusic(8)',
  'this.feedback.setMusic(9)',
  'this.feedback.setAmbience(6)',
  "this.feedback.setAmbience(this.specialRoomKind === 'back' ? 7 : 8)",
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
  const isMp3 = header.subarray(0, 3).toString('ascii') === 'ID3';
  if (!info.isFile() || info.size < 1024 || (!isWav && !isMp3)) throw new Error(`invalid sound asset: ${id}`);
  if (entry.origin?.startsWith('curated-')) {
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (entry.sha256 !== actualHash) throw new Error(`sound checksum mismatch: ${id}`);
    for (const source of [entry.source, ...(entry.additionalSources ?? [])]) {
      const landing = source?.landing ?? '';
      const acceptedLanding = landing.startsWith('https://freesound.org/')
        || landing.startsWith('https://opengameart.org/')
        || landing.startsWith('https://kenney.nl/');
      if (source?.license !== 'CC0-1.0' || !acceptedLanding) {
        throw new Error(`invalid curated source license: ${id}`);
      }
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
  `[sound] sources ${entries.length}/45; ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; `
  + `production sfx ${(productionSfxBytes / 1024 / 1024).toFixed(2)} MiB; `
  + `production ambience ${(productionAmbienceBytes / 1024 / 1024).toFixed(2)} MiB; `
  + `production music ${(productionMusicBytes / 1024 / 1024).toFixed(2)} MiB`,
);
