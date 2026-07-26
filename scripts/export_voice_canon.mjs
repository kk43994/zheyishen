import { stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadVoiceContract } from './load_voice_contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const { VOICE_CUES, VOICE_CUE_IDS, validateVoiceScript } = await loadVoiceContract(ROOT);
validateVoiceScript();

const stageLabels = ['童年', '少年', '青年', '成年', '中年', '暮年'];
const roleLabels = {
  narrator: '暮年主角旁白', father: '父亲', hero: '主角', caregiver: '照料者', teacher: '老师',
  classmate: '同学', announcer: '系统广播', recruiter: '招聘者', landlord: '房东', family: '家里人',
  nurse: '护士', office: '门禁/会议', manager: '经理', bank: '银行客服', doctor: '医生', coworker: '同事',
  security: '保安', pharmacist: '药师', neighbor: '邻居', 'room-keeper': '房间看守', 'lamp-keeper': '收灯人',
};

function cleanSpeech(text) {
  return text
    .replace(/<#[\d.]+#>/g, ' ')
    .replace(/\((?:inhale|exhale|breath|clear-throat)\)/g, '')
    .replace(/\s+/g, '')
    .trim();
}

const rows = [];
for (const id of VOICE_CUE_IDS) {
  const cue = VOICE_CUES[id];
  const assetPath = resolve(ROOT, 'public', cue.file);
  const asset = await stat(assetPath).catch(() => null);
  rows.push({
    id,
    stage: cue.stage === 'ending' ? '结局' : stageLabels[cue.stage],
    role: roleLabels[cue.role] || cue.role,
    scene: cue.context.scene,
    speaker: cue.context.speaker,
    text: cleanSpeech(cue.text),
    performance: cue.performance,
    trigger: cue.trigger.condition,
    event: cue.trigger.event,
    purpose: cue.purpose,
    required: cue.trigger.required,
    priority: cue.trigger.priority,
    treatment: cue.treatment,
    file: cue.file,
    asset: asset?.isFile() && asset.size >= 512 ? '已生成' : '待生成',
  });
}

const output = `window.VOICE_CANON_V1 = ${JSON.stringify(rows, null, 2)};\n`;
await writeFile(resolve(ROOT, 'docs/voice-canon-v1.js'), output, 'utf8');
console.info(`[voice] exported ${rows.length} encyclopedia rows`);
