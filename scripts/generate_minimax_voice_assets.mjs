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
const revisionArg = process.argv.find((argument) => argument.startsWith('--revision='));
const requestedRevision = revisionArg ? Number.parseInt(revisionArg.slice('--revision='.length), 10) : undefined;
if (requestedRevision !== undefined && (!Number.isInteger(requestedRevision) || requestedRevision < 0)) {
  throw new Error(`invalid asset revision: ${revisionArg}`);
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

// Casting table mirrors VOICE_DELIVERY's voice direction in voice-script.ts.
// Every named woman gets her own timbre; institutional voices (broadcast,
// door system, bank hotline) intentionally share the news-anchor register.
const systemVoiceByRole = {
  teacher: 'female-chengshu',
  classmate: 'clever_boy',
  announcer: 'Chinese (Mandarin)_News_Anchor',
  recruiter: 'Chinese (Mandarin)_Gentle_Senior',
  landlord: 'Chinese (Mandarin)_Mature_Woman',
  office: 'Chinese (Mandarin)_News_Anchor',
  manager: 'Chinese (Mandarin)_Reliable_Executive',
  bank: 'Chinese (Mandarin)_News_Anchor',
  coworker: 'Chinese (Mandarin)_Southern_Young_Man',
  security: 'Chinese (Mandarin)_Gentleman',
  'room-keeper': 'Chinese (Mandarin)_Humorous_Elder',
  caregiver: 'Chinese (Mandarin)_Warm_Bestie',
  family: 'female-tianmei',
  nurse: 'female-yujie',
  doctor: 'female-chengshu-jingpin',
  pharmacist: 'Chinese (Mandarin)_Sweet_Lady',
  neighbor: 'Chinese (Mandarin)_Kind-hearted_Antie',
  // —— 2026-07-28 扩充批（性别再平衡：新增配角以男声为主）——
  boss: 'ttv-voice-2026072819561426-prAlwK1P', // 设计音色 manager-warm-hollow（热络空心领导）
  xiaozhang: 'Chinese (Mandarin)_Pure-hearted_Boy',
  shopkeeper: 'ttv-voice-2026072900232726-IjGrwGUK', // 设计音色 shopkeeper-elder（沙哑小卖部大爷）
  passerby: 'Chinese (Mandarin)_Unrestrained_Young_Man',
  cashier: 'male-qn-daxuesheng',
  meeting: 'male-qn-jingying',
  courier: 'Chinese (Mandarin)_Gentle_Youth',
  bedside: 'ttv-voice-2026072900233926-alwGTIdH', // 设计音色 bedside-elder（气短病房老头）
};

// A role can contain several acoustically different real-world speakers.
// Per-cue overrides keep those speakers distinct without widening the runtime
// role union, which exists for narrative behavior rather than casting.
const systemVoiceByCue = {
  'phone-hospital-not-call': 'female-yujie-jingpin',
  'hospital-family-needed': 'female-yujie-jingpin',
  'clinic-next-number': 'female-yujie-jingpin',
  'hospital-family-late': 'female-yujie-jingpin',
  'office-meeting-continues': 'female-chengshu-jingpin',
  'clinic-blood-pressure': 'Chinese (Mandarin)_Radio_Host',
  'coworker-cardboard-box': 'Chinese (Mandarin)_Straightforward_Boy',
  'security-return-card': 'Chinese (Mandarin)_Male_Announcer',
  'pharmacist-after-meals': 'Chinese (Mandarin)_Gentleman',
  'pharmacist-self-pay': 'Chinese (Mandarin)_Gentleman',
  // 用户钦点：主角听见自己说出旧句的那一刻，用抒情男声
  'hero-became-him': 'Chinese (Mandarin)_Lyrical_Voice',
  'coworker-flower-water': 'Chinese (Mandarin)_Straightforward_Boy',
  'clinic-fifty-six': 'female-yujie-jingpin',
};

function voiceFor(cue) {
  if (systemVoiceByCue[cue.id]) return systemVoiceByCue[cue.id];
  if (cue.role === 'narrator' || cue.role === 'lamp-keeper') return narratorVoice || 'Chinese (Mandarin)_Southern_Young_Man';
  if (cue.role === 'father') return fatherVoice || 'Chinese (Mandarin)_Reliable_Executive';
  if (cue.role === 'hero') return cue.stage === 0 ? 'clever_boy' : 'Chinese (Mandarin)_Sincere_Adult';
  if (cue.role === 'wife') return wifeVoice || 'Chinese (Mandarin)_Wise_Women';
  if (cue.role === 'mother') return motherVoice || 'Chinese (Mandarin)_Kind-hearted_Elder';
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
  let generated;
  for (let attempt = 0; ; attempt += 1) {
    try {
      generated = await callTts(cue);
      break;
    } catch (error) {
      if (attempt >= 5 || !/rate limit/i.test(String(error?.message))) throw error;
      const waitSeconds = 15 * (attempt + 1);
      console.info(`[voice] ${id} rate limited; retrying in ${waitSeconds}s`);
      await new Promise((resolveWait) => setTimeout(resolveWait, waitSeconds * 1000));
    }
  }
  await writeFile(path, generated.bytes);
  manifestById.set(id, {
    id, file: cue.file, role: cue.role, voiceId: voiceFor(cue), model: MODEL,
    provider: 'MiniMax', durationMs: generated.durationMs, bytes: generated.bytes.length, draft,
    assetRevision: requestedRevision ?? manifestById.get(id)?.assetRevision ?? 0,
    generatedAt: new Date().toISOString(),
    delivery: cue.delivery,
  });
  await writeManifest();
}

console.info(`[voice] completed ${onlyIds ? onlyIds.size : VOICE_CUE_IDS.length} requested assets`);
