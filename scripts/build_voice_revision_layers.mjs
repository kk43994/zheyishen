import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadVoiceContract } from './load_voice_contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const VOICE_DIR = resolve(ROOT, 'public/assets/audio/voice');
const LAYER_DIR = resolve(ROOT, 'public/assets/audio/voice-layers');
const REVIEW_DIR = resolve(ROOT, 'public/assets/audio/voice-review');
const MANIFEST_PATH = resolve(VOICE_DIR, 'manifest.json');
const FATHER_SOURCE_ID = 'father-for-your-good';
const FATHER_SOURCE_PATH = resolve(VOICE_DIR, `${FATHER_SOURCE_ID}.mp3`);
const LAMP_MIX_VERSION = 'ethereal-v2';

const fatherLayers = [
  {
    id: 'hero-became-him',
    sourceStart: 2.17,
    sourceDuration: 1.75,
    delayMs: 260,
    volume: 0.18,
    purpose: '父亲旧句作为成年主角语言来源的远处回声',
  },
  {
    id: 'self-stand-straight',
    sourceStart: 0.1,
    sourceDuration: 1.15,
    delayMs: 150,
    volume: 0.21,
    purpose: '父亲训斥与主角内化短句轻微重合',
  },
  {
    id: 'self-for-your-good',
    sourceStart: 2.17,
    sourceDuration: 1.75,
    delayMs: 210,
    volume: 0.18,
    purpose: '父亲旧句在成年主角复述后方轻轻出现',
  },
];

const lampLayerIds = [
  'lamp-time-up',
  'lamp-return-due',
  'lamp-one-returned',
  'lamp-pockets-empty',
  'collector-not-yet',
];

function runFfmpeg(args, label) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${label}: ${result.stderr || 'ffmpeg failed'}`);
}

function mediaInfo(path) {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-of', 'json',
    path,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffprobe failed for ${path}: ${result.stderr}`);
  const format = JSON.parse(result.stdout).format;
  return {
    durationMs: Math.round(Number(format.duration) * 1000),
    bytes: Number(format.size),
  };
}

await mkdir(LAYER_DIR, { recursive: true });
await mkdir(REVIEW_DIR, { recursive: true });

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const manifestById = new Map(manifest.map((entry) => [entry.id, entry]));
const { VOICE_CUES } = await loadVoiceContract(ROOT);
const fatherSourceEntry = manifestById.get(FATHER_SOURCE_ID);
if (!fatherSourceEntry) throw new Error(`manifest entry missing for ${FATHER_SOURCE_ID}`);

for (const layer of fatherLayers) {
  console.info(`[voice-layer] ${layer.id} (reuse ${FATHER_SOURCE_ID})`);
  const fatherPath = resolve(LAYER_DIR, `${layer.id}-father.mp3`);
  runFfmpeg([
    '-ss', String(layer.sourceStart),
    '-t', String(layer.sourceDuration),
    '-i', FATHER_SOURCE_PATH,
    '-af', `afade=t=in:st=0:d=0.05,afade=t=out:st=${Math.max(0.1, layer.sourceDuration - 0.25)}:d=0.25`,
    '-ar', '32000',
    '-ac', '1',
    '-b:a', '64k',
    fatherPath,
  ], `failed to extract father layer for ${layer.id}`);
  const mainPath = resolve(VOICE_DIR, `${layer.id}.mp3`);
  const outputPath = resolve(REVIEW_DIR, `${layer.id}.mp3`);
  runFfmpeg([
    '-i', mainPath,
    '-i', fatherPath,
    '-filter_complex',
    `[0:a]volume=0.96[main];[1:a]adelay=${layer.delayMs}|${layer.delayMs},highpass=f=120,lowpass=f=1900,volume=${layer.volume}[memory];[main][memory]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.9[out]`,
    '-map', '[out]',
    '-ar', '32000',
    '-ac', '1',
    '-b:a', '64k',
    outputPath,
  ], `failed to mix ${layer.id}`);
  const info = mediaInfo(outputPath);
  const entry = manifestById.get(layer.id);
  if (!entry) throw new Error(`manifest entry missing for ${layer.id}`);
  manifestById.set(layer.id, {
    ...entry,
    delivery: VOICE_CUES[layer.id].delivery,
    reviewFile: `assets/audio/voice-review/${layer.id}.mp3`,
    reviewDurationMs: info.durationMs,
    reviewBytes: info.bytes,
    layers: [{
      file: `assets/audio/voice-layers/${layer.id}-father.mp3`,
      voiceId: fatherSourceEntry.voiceId,
      purpose: layer.purpose,
    }],
    postprocess: `成年主声 + 低频远置父亲记忆叠声（复用 ${FATHER_SOURCE_ID} 原声）`,
  });
}

for (const id of lampLayerIds) {
  const inputPath = resolve(VOICE_DIR, `${id}.mp3`);
  const reviewFile = `assets/audio/voice-review/${id}.${LAMP_MIX_VERSION}.mp3`;
  const outputPath = resolve(ROOT, 'public', reviewFile);
  runFfmpeg([
    '-i', inputPath,
    '-filter_complex',
    '[0:a]asplit=3[dry][near][far];'
      + '[dry]volume=0.84[d];'
      + '[near]adelay=90|90,highpass=f=110,lowpass=f=2900,volume=0.22[n];'
      + '[far]adelay=300|300,aecho=0.8:0.45:230:0.18,highpass=f=180,lowpass=f=1450,tremolo=f=0.3:d=0.22,volume=0.14[f];'
      + '[d][n][f]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0.9[out]',
    '-map', '[out]',
    '-ar', '32000',
    '-ac', '1',
    '-b:a', '64k',
    outputPath,
  ], `failed to mix ${id}`);
  const info = mediaInfo(outputPath);
  const entry = manifestById.get(id);
  if (!entry) throw new Error(`manifest entry missing for ${id}`);
  manifestById.set(id, {
    ...entry,
    assetRevision: Math.max(Number(entry.assetRevision ?? 0), 1),
    delivery: VOICE_CUES[id].delivery,
    reviewFile,
    reviewDurationMs: info.durationMs,
    reviewBytes: info.bytes,
    layers: [{
      file: entry.file,
      voiceId: entry.voiceId,
      purpose: '同一收灯人声线的近声、远声和轻微延迟层',
    }],
    postprocess: `近声先到 + 远声慢半拍 + 轻微空灵摆动（${LAMP_MIX_VERSION}，无恐怖长混响）`,
  });
}

const orderedManifest = manifest.map((entry) => manifestById.get(entry.id) ?? entry);
await writeFile(MANIFEST_PATH, `${JSON.stringify(orderedManifest, null, 2)}\n`, 'utf8');
console.info(`[voice-layer] built ${fatherLayers.length + lampLayerIds.length} composite review assets`);
