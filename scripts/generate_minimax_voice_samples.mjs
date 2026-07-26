import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_DIR = resolve(ROOT, 'public/assets/audio/voice-concepts');
const MODEL = process.env.MINIMAX_SPEECH_MODEL || 'speech-2.8-hd';
let apiBaseUrl = process.env.MINIMAX_API_BASE_URL || '';

const OPENING_TEXT = '(inhale)他还没有名字。<#0.62#>第一口气进来以前，谁也不知道，<#0.38#>这一身会穿上什么。(exhale)';

const presetSamples = [
  {
    id: 'narrator-preset-plain', title: '旁白 A · 质朴男声', role: '老年主角候选',
    voiceId: 'Chinese (Mandarin)_Southern_Young_Man', speed: 0.86, pitch: -2, emotion: 'calm',
    text: OPENING_TEXT, note: '预设音色；生活感最好，但年龄感可能偏轻。',
  },
  {
    id: 'narrator-preset-radio', title: '旁白 B · 电台男声', role: '老年主角候选',
    voiceId: 'Chinese (Mandarin)_Radio_Host', speed: 0.84, pitch: -2, emotion: 'calm',
    text: OPENING_TEXT, note: '预设音色；叙事清晰，但需要警惕朗诵腔。',
  },
  {
    id: 'father-preset-steady', title: '父亲 A · 沉稳男声', role: '父亲候选',
    voiceId: 'Chinese (Mandarin)_Reliable_Executive', speed: 0.9, pitch: -2, emotion: 'calm',
    text: '(clear-throat)没什么事。<#0.68#>你忙吧。', note: '预设音色；用作自定义普通父亲的对照。',
  },
  {
    id: 'last-bus-arrival', title: '末班车 · 到站', role: '青年章环境广播',
    voiceId: 'Chinese (Mandarin)_News_Anchor', speed: 1, pitch: 0, emotion: 'calm',
    text: '开往城南方向的末班车已经到站。<#0.25#>请乘客有序上车。列车即将关门，请勿冲门。',
    note: '真实站内口径，Boss 登场前播放。',
  },
  {
    id: 'last-bus-departed', title: '末班车 · 已关门', role: '青年章环境广播',
    voiceId: 'Chinese (Mandarin)_News_Anchor', speed: 0.96, pitch: 0, emotion: 'calm',
    text: '本站今日运营已经结束。<#0.38#>未能上车的乘客，请等待明天。',
    note: 'Boss 冲锋后播放，余味来自真实措辞而非广播讲道理。',
  },
  {
    id: 'teacher-last-row', title: '老师 · 最后一排', role: '少年章现场台词',
    voiceId: 'female-chengshu', speed: 1.02, pitch: 0, emotion: 'calm',
    text: '(clear-throat)最后一排。<#0.32#>站起来。', note: '短、平、没有反派腔。',
  },
  {
    id: 'boy-family-not-here', title: '同学 · 你家里人呢', role: '童年章偶遇台词',
    voiceId: 'clever_boy', speed: 1.02, pitch: -1, emotion: 'calm',
    text: '你家里人，<#0.24#>还没来吗？', note: '只在校门口停留时偶发，不解释家庭状况。',
  },
];

const customDesigns = [
  {
    id: 'narrator-custom-ordinary', title: '旁白 C · 普通旧声', role: '老年主角候选',
    prompt: '一位五十八到六十五岁的中国普通男性，标准普通话，声线中低而不浑厚，带一点长期劳作和熬夜留下的疲惫，呼吸自然，语气克制、白描、没有播音腔，也没有英雄感、哭腔或恐怖感。像一个普通职员或工人在病房里慢慢回忆自己的一生，偶尔有很淡的自嘲，但不主动煽情。',
    previewText: '他还没有名字。第一口气进来以前，谁也不知道，这一身会穿上什么。',
    synthesisText: OPENING_TEXT, speed: 0.86, pitch: 0, emotion: 'calm',
    note: '自定义音色；推荐方向，旁白就是暮年的主角本人。',
  },
  {
    id: 'father-custom-ordinary', title: '父亲 B · 普通父亲', role: '父亲候选',
    prompt: '一位四十八到五十五岁的中国普通父亲，标准普通话，声音偏低、音量不大，话少，句尾常常收回去。不是领导、主播或严厉反派；他关心家人但不懂表达，疲惫藏在短停顿和换气里，语气嘴硬而克制，不哭、不吼、不煽情。',
    previewText: '没什么事。你忙吧。',
    synthesisText: '(clear-throat)没什么事。<#0.68#>你忙吧。', speed: 0.9, pitch: 0, emotion: 'calm',
    note: '自定义音色；童年“走吧”和成年电话必须使用同一音色。',
  },
];

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const separator = trimmed.indexOf('=');
    return separator < 1 ? [] : [[trimmed.slice(0, separator), trimmed.slice(separator + 1)]];
  }));
}

async function loadConfig() {
  const local = parseEnv(await readFile(resolve(ROOT, '.env.local'), 'utf8'));
  apiBaseUrl ||= local.MINIMAX_API_BASE_URL || 'https://api.minimaxi.com';
  const apiKey = process.env.MINIMAX_API_KEY || local.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('MINIMAX_API_KEY is not configured');
  return { apiKey };
}

async function callApi(apiKey, path, body, timeoutMs = 90_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`MiniMax ${response.status}: ${raw.slice(0, 300)}`);
    const result = JSON.parse(raw);
    if (result?.base_resp?.status_code !== 0) {
      throw new Error(`MiniMax rejected request: ${result?.base_resp?.status_msg || 'unknown error'}`);
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function synthesize(apiKey, sample, voiceId = sample.voiceId) {
  const result = await callApi(apiKey, '/v1/t2a_v2', {
    model: MODEL,
    text: sample.synthesisText || sample.text,
    stream: false,
    language_boost: 'Chinese',
    output_format: 'hex',
    voice_setting: {
      voice_id: voiceId,
      speed: sample.speed,
      vol: 1,
      pitch: sample.pitch,
      emotion: sample.emotion,
    },
    audio_setting: { sample_rate: 32000, bitrate: 64000, format: 'mp3', channel: 1 },
  });
  const audioHex = result?.data?.audio;
  if (typeof audioHex !== 'string' || !/^[\da-f]+$/i.test(audioHex)) throw new Error('missing hex audio');
  const audio = Buffer.from(audioHex, 'hex');
  const filename = `${sample.id}.mp3`;
  await writeFile(resolve(OUTPUT_DIR, filename), audio);
  return {
    id: sample.id, title: sample.title, role: sample.role, source: sample.prompt ? 'custom' : 'preset',
    voiceId, model: MODEL, text: sample.synthesisText || sample.text, note: sample.note,
    file: `../public/assets/audio/voice-concepts/${filename}`,
    durationMs: result?.extra_info?.audio_length ?? null, bytes: audio.byteLength,
  };
}

async function designVoice(apiKey, design) {
  const result = await callApi(apiKey, '/v1/voice_design', {
    prompt: design.prompt,
    preview_text: design.previewText,
    aigc_watermark: false,
  });
  if (typeof result?.voice_id !== 'string') throw new Error('voice design did not return voice_id');
  return result.voice_id;
}

await mkdir(OUTPUT_DIR, { recursive: true });
const { apiKey } = await loadConfig();
const manifest = [];

for (const sample of presetSamples) {
  console.info(`[voice] preset ${sample.id}`);
  manifest.push(await synthesize(apiKey, sample));
}
for (const design of customDesigns) {
  console.info(`[voice] design ${design.id}`);
  const voiceId = await designVoice(apiKey, design);
  manifest.push(await synthesize(apiKey, design, voiceId));
}

await writeFile(resolve(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.info(`[voice] completed ${manifest.length} samples`);
