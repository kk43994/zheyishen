import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadVoiceContract } from './load_voice_contract.mjs';

// Casting auditions: each contested role renders its real in-game line with the
// contract's delivery params across candidate system voices, so casting is
// decided by ear instead of by voice-id name.
const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_DIR = resolve(ROOT, 'tmp/voice-auditions');
const MODEL = process.env.MINIMAX_SPEECH_MODEL || 'speech-2.8-hd';

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

const { VOICE_CUES } = await loadVoiceContract(ROOT);

/** role -> { cueId (real line to audition with), candidates: [{voiceId, label}] } */
const AUDITIONS = {
  caregiver: { cueId: 'caregiver-no-monster', candidates: [
    { voiceId: 'Chinese (Mandarin)_Warm_Bestie', label: '温暖闺蜜' },
    { voiceId: 'Chinese (Mandarin)_Wise_Women', label: '阅历姐姐' },
    { voiceId: 'female-chengshu', label: '成熟女性' },
  ] },
  wife: { cueId: 'phone-wife-fridge', candidates: [
    { voiceId: 'Chinese (Mandarin)_Wise_Women', label: '阅历姐姐' },
    { voiceId: 'female-chengshu-jingpin', label: '成熟女性beta' },
    { voiceId: 'Chinese (Mandarin)_Gentle_Senior', label: '温柔学姐' },
  ] },
  mother: { cueId: 'phone-mother-didnt-ask', candidates: [
    { voiceId: 'Chinese (Mandarin)_Kind-hearted_Elder', label: '花甲奶奶' },
    { voiceId: 'Chinese (Mandarin)_Kind-hearted_Antie', label: '热心大婶' },
    { voiceId: 'Chinese (Mandarin)_Wise_Women', label: '阅历姐姐' },
  ] },
  family: { cueId: 'family-dinner-cold', candidates: [
    { voiceId: 'female-tianmei', label: '甜美女性' },
    { voiceId: 'Chinese (Mandarin)_Warm_Bestie', label: '温暖闺蜜' },
    { voiceId: 'Chinese (Mandarin)_Gentle_Senior', label: '温柔学姐' },
  ] },
  nurse: { cueId: 'phone-hospital-not-call', candidates: [
    { voiceId: 'female-yujie', label: '御姐' },
    { voiceId: 'Chinese (Mandarin)_Gentle_Senior', label: '温柔学姐' },
    { voiceId: 'Chinese (Mandarin)_News_Anchor', label: '新闻女声' },
  ] },
  doctor: { cueId: 'clinic-blood-pressure', candidates: [
    { voiceId: 'female-chengshu-jingpin', label: '成熟女性beta' },
    { voiceId: 'Chinese (Mandarin)_Mature_Woman', label: '傲娇御姐' },
    { voiceId: 'female-yujie-jingpin', label: '御姐beta' },
  ] },
  pharmacist: { cueId: 'pharmacist-after-meals', candidates: [
    { voiceId: 'Chinese (Mandarin)_Sweet_Lady', label: '甜美女声' },
    { voiceId: 'female-chengshu', label: '成熟女性' },
    { voiceId: 'Chinese (Mandarin)_Kind-hearted_Antie', label: '热心大婶' },
  ] },
  neighbor: { cueId: 'neighbor-corridor-light', candidates: [
    { voiceId: 'Chinese (Mandarin)_Kind-hearted_Antie', label: '热心大婶' },
    { voiceId: 'Chinese (Mandarin)_Kind-hearted_Elder', label: '花甲奶奶' },
  ] },
  landlord: { cueId: 'landlord-rent-deposit', candidates: [
    { voiceId: 'Chinese (Mandarin)_Mature_Woman', label: '傲娇御姐' },
    { voiceId: 'Chinese (Mandarin)_Kind-hearted_Antie', label: '热心大婶' },
    { voiceId: 'female-yujie', label: '御姐' },
  ] },
  recruiter: { cueId: 'recruiter-arrival-time', candidates: [
    { voiceId: 'Chinese (Mandarin)_Gentle_Senior', label: '温柔学姐' },
    { voiceId: 'Chinese (Mandarin)_News_Anchor', label: '新闻女声' },
  ] },
  teacher: { cueId: 'teacher-last-row', candidates: [
    { voiceId: 'female-chengshu', label: '成熟女性' },
    { voiceId: 'Chinese (Mandarin)_Wise_Women', label: '阅历姐姐' },
  ] },
  'room-keeper': { cueId: 'light-room-left-this', candidates: [
    { voiceId: 'Chinese (Mandarin)_Humorous_Elder', label: '搞笑大爷' },
    { voiceId: 'Chinese (Mandarin)_Radio_Host', label: '电台男主播' },
    { voiceId: 'Chinese (Mandarin)_Gentleman', label: '温润男声' },
  ] },
  hero: { cueId: 'hero-became-him', candidates: [
    { voiceId: 'Chinese (Mandarin)_Sincere_Adult', label: '真诚青年' },
    { voiceId: 'Chinese (Mandarin)_Gentle_Youth', label: '温润青年' },
    { voiceId: 'Chinese (Mandarin)_Lyrical_Voice', label: '抒情男声' },
  ] },
  security: { cueId: 'security-return-card', candidates: [
    { voiceId: 'Chinese (Mandarin)_Gentleman', label: '温润男声' },
    { voiceId: 'Chinese (Mandarin)_Male_Announcer', label: '播报男声' },
  ] },
  coworker: { cueId: 'phone-coworker-group', candidates: [
    { voiceId: 'Chinese (Mandarin)_Southern_Young_Man', label: '南方小哥' },
    { voiceId: 'Chinese (Mandarin)_Straightforward_Boy', label: '率真弟弟' },
  ] },
  classmate: { cueId: 'classmate-score-whisper', candidates: [
    { voiceId: 'clever_boy', label: '聪明男童' },
    { voiceId: 'Chinese (Mandarin)_Straightforward_Boy', label: '率真弟弟' },
    { voiceId: 'Chinese (Mandarin)_Pure-hearted_Boy', label: '清澈邻家弟弟' },
  ] },
};

async function callTts(cue, voiceId) {
  const response = await fetch(`${apiBaseUrl}/v1/t2a_v2`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      text: cue.text,
      stream: false,
      language_boost: 'Chinese',
      output_format: 'hex',
      voice_setting: {
        voice_id: voiceId,
        speed: cue.delivery.speed,
        vol: 1,
        pitch: cue.delivery.pitch,
        emotion: cue.delivery.emotion,
      },
      audio_setting: { sample_rate: 32000, bitrate: 64000, format: 'mp3', channel: 1 },
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`MiniMax HTTP ${response.status}: ${raw.slice(0, 240)}`);
  const result = JSON.parse(raw);
  if (result?.base_resp?.status_code !== 0) throw new Error(`MiniMax rejected: ${result?.base_resp?.status_msg || 'unknown error'}`);
  const audioHex = result?.data?.audio;
  if (typeof audioHex !== 'string' || !/^[\da-f]+$/i.test(audioHex)) throw new Error('MiniMax returned no audio');
  return Buffer.from(audioHex, 'hex');
}

async function callWithRetry(cue, voiceId) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await callTts(cue, voiceId);
    } catch (error) {
      if (attempt >= 5 || !/rate limit/i.test(String(error?.message))) throw error;
      const waitSeconds = 15 * (attempt + 1);
      console.info(`  rate limited; retrying in ${waitSeconds}s`);
      await new Promise((resolveWait) => setTimeout(resolveWait, waitSeconds * 1000));
    }
  }
}

await mkdir(OUTPUT_DIR, { recursive: true });
const rows = [];
for (const [role, spec] of Object.entries(AUDITIONS)) {
  const cue = VOICE_CUES[spec.cueId];
  if (!cue) throw new Error(`unknown cue for role ${role}: ${spec.cueId}`);
  for (const candidate of spec.candidates) {
    const safeVoice = candidate.voiceId.replace(/[^a-zA-Z0-9_-]+/g, '_');
    const filename = `${role}--${safeVoice}.mp3`;
    console.info(`[audition] ${role} × ${candidate.label}`);
    const bytes = await callWithRetry(cue, candidate.voiceId);
    await writeFile(resolve(OUTPUT_DIR, filename), bytes);
    rows.push({ role, cueId: spec.cueId, text: cue.text, direction: cue.delivery.voice, tone: cue.delivery.tone, voiceId: candidate.voiceId, label: candidate.label, file: filename });
  }
}

const grouped = rows.reduce((accumulator, row) => {
  (accumulator[row.role] ||= []).push(row);
  return accumulator;
}, {});
const sections = Object.entries(grouped).map(([role, entries]) => {
  const first = entries[0];
  const buttons = entries.map((entry) => `
      <div class="cand"><button onclick="document.getElementById('${entry.file}').play()">▶ ${entry.label}</button><code>${entry.voiceId}</code>
      <audio id="${entry.file}" src="${entry.file}" preload="none"></audio></div>`).join('');
  return `
  <section><h2>${role} <small>（契约：${first.direction} · ${first.tone}）</small></h2>
    <p class="line">「${first.text.replace(/<#[\d.]+#>|\([a-z-]+\)/g, '')}」</p>${buttons}
  </section>`;
}).join('\n');

await writeFile(resolve(OUTPUT_DIR, 'index.html'), `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>这一身 · 配音试音</title>
<style>
  body { font-family: system-ui; max-width: 720px; margin: 2rem auto; padding: 0 1rem; background: #16130f; color: #e8ddc8; }
  h2 { border-bottom: 1px solid #4a4237; padding-bottom: .3rem; } h2 small { font-weight: normal; font-size: .7em; color: #a3947c; }
  .line { color: #cbb894; } .cand { margin: .4rem 0; }
  button { font-size: 1rem; padding: .35rem .9rem; margin-right: .6rem; cursor: pointer; background: #2a241c; color: #e8ddc8; border: 1px solid #6b5d48; border-radius: 6px; }
  code { color: #8d7f68; font-size: .8em; }
</style></head><body><h1>配音试音（每条都用角色真实台词 + 契约参数）</h1>${sections}</body></html>`, 'utf8');
console.info(`[audition] ${rows.length} clips → tmp/voice-auditions/index.html`);
