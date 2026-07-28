import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// A-level casting tool: design a bespoke voice from a text prompt via MiniMax
// voice_design, save the preview clip, and record the returned voice_id so it
// can be pinned in .env.local or the casting table. Narrator and father were
// born this way; use this for any key character the system presets can't cover.
//
//   node scripts/design_voice.mjs --id=manager-a \
//     --prompt="中年男性领导，热络但公式化" --preview="这个只有你能做。我看好你。"
const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_DIR = resolve(ROOT, 'tmp/voice-designs');
const MANIFEST_PATH = resolve(OUTPUT_DIR, 'manifest.json');

function argValue(name) {
  const found = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : undefined;
}

const id = argValue('id');
const prompt = argValue('prompt');
const previewText = argValue('preview');
if (!id || !prompt || !previewText) {
  throw new Error('usage: node scripts/design_voice.mjs --id=<slug> --prompt=<音色描述> --preview=<试音台词>');
}

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const separator = trimmed.indexOf('=');
    return separator < 1 ? [] : [[trimmed.slice(0, separator), trimmed.slice(separator + 1)]];
  }));
}

const local = parseEnv(await readFile(resolve(ROOT, '.env.local'), 'utf8').catch(() => ''));
const apiKey = process.env.MINIMAX_API_KEY || local.MINIMAX_API_KEY;
const apiBaseUrl = process.env.MINIMAX_API_BASE_URL || local.MINIMAX_API_BASE_URL || 'https://api.minimaxi.com';
if (!apiKey) throw new Error('MINIMAX_API_KEY is not configured');

async function callApi(path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`MiniMax HTTP ${response.status}: ${raw.slice(0, 240)}`);
  const result = JSON.parse(raw);
  if (result?.base_resp && result.base_resp.status_code !== 0) {
    throw new Error(`MiniMax rejected: ${result.base_resp.status_msg || 'unknown error'}`);
  }
  return result;
}

const design = await callApi('/v1/voice_design', { prompt, preview_text: previewText, aigc_watermark: false });
const voiceId = design?.voice_id;
if (typeof voiceId !== 'string') throw new Error('voice design did not return voice_id');

await mkdir(OUTPUT_DIR, { recursive: true });
let previewFile = null;
const previewHex = design?.trial_audio;
if (typeof previewHex === 'string' && /^[\da-f]+$/i.test(previewHex)) {
  previewFile = `${id}.mp3`;
  await writeFile(resolve(OUTPUT_DIR, previewFile), Buffer.from(previewHex, 'hex'));
} else {
  const synthesis = await callApi('/v1/t2a_v2', {
    model: process.env.MINIMAX_SPEECH_MODEL || 'speech-2.8-hd',
    text: previewText,
    stream: false,
    language_boost: 'Chinese',
    output_format: 'hex',
    voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0, emotion: 'calm' },
    audio_setting: { sample_rate: 32000, bitrate: 64000, format: 'mp3', channel: 1 },
  });
  const audioHex = synthesis?.data?.audio;
  if (typeof audioHex === 'string' && /^[\da-f]+$/i.test(audioHex)) {
    previewFile = `${id}.mp3`;
    await writeFile(resolve(OUTPUT_DIR, previewFile), Buffer.from(audioHex, 'hex'));
  }
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8').catch(() => '[]'));
manifest.push({ id, voiceId, prompt, previewText, previewFile, designedAt: new Date().toISOString() });
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.info(`[voice-design] ${id} -> ${voiceId}${previewFile ? ` (preview: tmp/voice-designs/${previewFile})` : ' (no preview audio returned)'}`);
