import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const [game, voice] = await Promise.all([
  readFile(resolve(ROOT, 'src/game.ts'), 'utf8'),
  readFile(resolve(ROOT, 'src/voice-script.ts'), 'utf8'),
]);
const errors = [];
let checks = 0;

const requireToken = (token, message) => {
  checks += 1;
  if (!game.includes(token)) errors.push(message);
};
const rejectToken = (token, message) => {
  checks += 1;
  if (game.includes(token)) errors.push(message);
};
const numericConstant = (name) => {
  const match = game.match(new RegExp(`const ${name} = ([\\d.]+);`));
  return match ? Number(match[1]) : Number.NaN;
};
const audioDuration = (id) => {
  const path = resolve(ROOT, 'public/assets/audio/voice', `${id}.mp3`);
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path,
  ], { encoding: 'utf8' });
  return probe.status === 0 ? Number(probe.stdout.trim()) : Number.NaN;
};

requireToken(
  "this.voiceCuesSeen.has('classmate-family-late')",
  '沉默的父亲仍可能在同学问话前出现',
);
requireToken(
  "this.voiceCuesSeen.has('school-gate-closing')",
  '沉默的父亲仍可能在校园广播前出现',
);
requireToken(
  "&& !this.voiceCaption",
  '沉默的父亲仍可能在上一句字幕与声音未落稳时出现',
);
requireToken(
  "(this.voiceEnemyKills['missed-call'] ?? 0) >= 3 || time >= 26",
  '医院来电没有同时绑定三只未接来电与26秒兜底',
);
requireToken(
  "0: 'caregiver-school-send'",
  '书包送别没有放在童年向少年过渡',
);
rejectToken(
  "if (time >= 8) this.playVoiceOnce('caregiver-school-send')",
  '还没上学的童年章仍提前出现书包送别',
);
checks += 1;
if (!voice.includes("trigger('stage_transition', '童年结束、进入少年学校前'")) {
  errors.push('书包送别的声音合同仍记录为童年章内触发');
}
requireToken(
  "time >= 22 && this.voiceCuesSeen.has('caregiver-lights-out') && !this.voiceCaption",
  '童年孩子发问没有等关灯台词完整结束',
);
requireToken(
  "this.voiceCuesSeen.has('child-under-bed') && !this.voiceCaption",
  '童年衣架仍可能抢在孩子发问结束前出现',
);
requireToken(
  "(!childhoodMainlineStarted || childhoodThreatIntroduced)",
  '童年受伤台词仍可能插进孩子发问与衣架登场之间',
);
checks += 1;
if (!voice.includes("trigger('stage_time', '童年第22秒、照料者关灯台词结束后', true, 2, false, 22)")) {
  errors.push('童年孩子发问仍是可能错过的隐藏触发');
}
rejectToken(
  "situation: ['下雨那天父亲把雨衣披给他",
  '童年章节摘要仍提前讲了少年放学雨衣事件',
);
requireToken(
  "situation: ['考试、排名、同学议论。', '放学下雨那天，父亲把雨衣披给他，只说「走吧」。']",
  '少年章节摘要没有接回放学雨衣事件',
);
checks += 2;
if (!voice.includes("'father-childhood-walk': cue('father-childhood-walk', 1, 'father'")) {
  errors.push('「走吧」配音合同仍错误归在童年');
}
if (!voice.includes("'father-childhood-walk': { scene: '少年放学时的雨里', speaker: '父亲' }")) {
  errors.push('「走吧」配音场景仍没有标明少年放学');
}
requireToken(
  "if (id === 'narrator-final-breath') return 9.65",
  '最后一口气字幕仍短于实际成品音频',
);
requireToken(
  "return this.clamp(3 + textLength / 5, 3.2, 10)",
  '普通人物字幕仍使用会提前消失的旧时长估算',
);
requireToken(
  "this.playVoiceRepeatable('lamp-one-returned')",
  '收灯人仍只在第一件归还时说话',
);
rejectToken(
  "this.playVoiceOnce('lamp-one-returned')",
  '收灯人归还台词仍被一次性去重',
);
requireToken(
  "this.scheduleVoice('narrator-final-breath', LAMP_POCKETS_EMPTY_TO_FINAL_BREATH_DELAY)",
  '最后一口气没有等「口袋空了」说完',
);

const returnDelay = numericConstant('LAMP_STRIP_TO_RELEASE_DELAY');
const pocketsDelay = numericConstant('LAMP_POCKETS_EMPTY_TO_FINAL_BREATH_DELAY');
const releaseDelay = numericConstant('LAMP_RELEASE_CONFIRM_DELAY');
const returnDuration = audioDuration('lamp-one-returned');
const pocketsDuration = audioDuration('lamp-pockets-empty');
const finalDuration = audioDuration('narrator-final-breath');

checks += 3;
if (!Number.isFinite(returnDelay) || !Number.isFinite(returnDuration) || returnDelay < returnDuration + 0.1) {
  errors.push('最后一件归还台词会被吹灯阶段截断');
}
if (!Number.isFinite(pocketsDelay) || !Number.isFinite(pocketsDuration) || pocketsDelay < pocketsDuration + 0.1) {
  errors.push('「口袋空了」会被最后一口气截断');
}
if (!Number.isFinite(releaseDelay) || !Number.isFinite(finalDuration)
  || releaseDelay < pocketsDelay + finalDuration + 0.1) {
  errors.push('放下最后一口气按钮会在旁白结束前启用');
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  schoolSequence: '父亲旧声 -> 同学 -> 校园广播 -> 雨声与父亲',
  endingSequence: '逐件归还 -> 口袋空了 -> 最后一口气 -> 玩家确认',
  timings: {
    returnDelay,
    returnDuration,
    pocketsDelay,
    pocketsDuration,
    releaseDelay,
    finalDuration,
  },
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
