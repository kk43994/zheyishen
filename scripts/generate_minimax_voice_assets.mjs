import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadVoiceContract } from './load_voice_contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_DIR = resolve(ROOT, 'public/assets/audio/voice');
const MANIFEST_PATH = resolve(OUTPUT_DIR, 'manifest.json');
const MODEL = process.env.MINIMAX_SPEECH_MODEL || 'speech-2.8-hd';
const force = process.argv.includes('--force');
const draft = process.argv.includes('--draft');
const onlyArg = process.argv.find((argument) => argument.startsWith('--only='));
const onlyIds = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null;

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
const narratorVoice = process.env.MINIMAX_NARRATOR_VOICE_ID || local.MINIMAX_NARRATOR_VOICE_ID;
const fatherVoice = process.env.MINIMAX_FATHER_VOICE_ID || local.MINIMAX_FATHER_VOICE_ID;
const wifeVoice = process.env.MINIMAX_WIFE_VOICE_ID || local.MINIMAX_WIFE_VOICE_ID;
const motherVoice = process.env.MINIMAX_MOTHER_VOICE_ID || local.MINIMAX_MOTHER_VOICE_ID;
if (!apiKey) throw new Error('MINIMAX_API_KEY is not configured');
if (!draft && (!narratorVoice || !fatherVoice)) {
  throw new Error('production generation requires MINIMAX_NARRATOR_VOICE_ID and MINIMAX_FATHER_VOICE_ID; use --draft only for auditions');
}

const { VOICE_CUES, VOICE_CUE_IDS, validateVoiceScript } = await loadVoiceContract(ROOT);
validateVoiceScript();

const feminineRoles = new Set(['caregiver', 'family', 'nurse', 'doctor', 'pharmacist', 'neighbor']);
const systemVoiceByRole = {
  teacher: 'female-chengshu',
  classmate: 'clever_boy',
  announcer: 'Chinese (Mandarin)_News_Anchor',
  recruiter: 'Chinese (Mandarin)_Reliable_Executive',
  landlord: 'Chinese (Mandarin)_Kind-hearted_Antie',
  office: 'Chinese (Mandarin)_News_Anchor',
  manager: 'Chinese (Mandarin)_Reliable_Executive',
  bank: 'Chinese (Mandarin)_News_Anchor',
  coworker: 'Chinese (Mandarin)_Southern_Young_Man',
  security: 'Chinese (Mandarin)_Southern_Young_Man',
  'room-keeper': 'Chinese (Mandarin)_Southern_Young_Man',
};

function voiceFor(cue) {
  if (cue.role === 'narrator' || cue.role === 'lamp-keeper') return narratorVoice || 'Chinese (Mandarin)_Southern_Young_Man';
  if (cue.role === 'father') return fatherVoice || 'Chinese (Mandarin)_Reliable_Executive';
  if (cue.role === 'hero') return cue.stage === 0 ? 'clever_boy' : 'Chinese (Mandarin)_Southern_Young_Man';
  if (cue.role === 'wife') {
    if (!wifeVoice) throw new Error('wife voice requires MINIMAX_WIFE_VOICE_ID; use the Kokoro production path when it is unavailable');
    return wifeVoice;
  }
  if (cue.role === 'mother') {
    if (!motherVoice) throw new Error('mother voice requires MINIMAX_MOTHER_VOICE_ID; use the Kokoro production path when it is unavailable');
    return motherVoice;
  }
  if (feminineRoles.has(cue.role)) return 'Chinese (Mandarin)_Kind-hearted_Antie';
  return systemVoiceByRole[cue.role] || 'Chinese (Mandarin)_Southern_Young_Man';
}

function voiceSetting(cue) {
  return {
    voice_id: voiceFor(cue),
    speed: cue.delivery.speed,
    vol: 1,
    pitch: cue.delivery.pitch,
    emotion: cue.delivery.emotion,
  };
}

async function callTts(cue) {
  const response = await fetch(`${apiBaseUrl}/v1/t2a_v2`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      text: cue.text,
      stream: false,
      language_boost: 'Chinese',
      output_format: 'hex',
      voice_setting: voiceSetting(cue),
      audio_setting: { sample_rate: 32000, bitrate: 64000, format: 'mp3', channel: 1 },
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`MiniMax HTTP ${response.status}: ${raw.slice(0, 240)}`);
  const result = JSON.parse(raw);
  if (result?.base_resp?.status_code !== 0) throw new Error(`MiniMax rejected ${cue.id}: ${result?.base_resp?.status_msg || 'unknown error'}`);
  const audioHex = result?.data?.audio;
  if (typeof audioHex !== 'string' || !/^[\da-f]+$/i.test(audioHex)) throw new Error(`MiniMax returned no audio for ${cue.id}`);
  return { bytes: Buffer.from(audioHex, 'hex'), durationMs: result?.extra_info?.audio_length ?? null };
}

await mkdir(OUTPUT_DIR, { recursive: true });
const previousManifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8').catch(() => '[]'));
const manifestById = new Map(previousManifest.map((entry) => [entry.id, entry]));
const writeManifest = async () => {
  const manifest = VOICE_CUE_IDS.flatMap((id) => manifestById.has(id) ? [manifestById.get(id)] : []);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
};
for (const id of VOICE_CUE_IDS) {
  if (onlyIds && !onlyIds.has(id)) continue;
  const cue = VOICE_CUES[id];
  const path = resolve(ROOT, 'public', cue.file);
  if (!force) {
    const existing = await stat(path).catch(() => null);
    if (existing?.isFile() && existing.size >= 512) {
      manifestById.set(id, { ...manifestById.get(id), id, file: cue.file, bytes: existing.size, skipped: true });
      await writeManifest();
      continue;
    }
  }
  console.info(`[voice] ${id} (${cue.role})`);
  const generated = await callTts(cue);
  await writeFile(path, generated.bytes);
  manifestById.set(id, {
    id, file: cue.file, role: cue.role, voiceId: voiceFor(cue), model: MODEL,
    provider: 'MiniMax', durationMs: generated.durationMs, bytes: generated.bytes.length, draft,
    delivery: cue.delivery,
  });
  await writeManifest();
}

console.info(`[voice] completed ${onlyIds ? onlyIds.size : VOICE_CUE_IDS.length} requested assets`);
