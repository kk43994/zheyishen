import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, checkpoint, voiceScript, voiceManifestText, voiceQaText, canon, plan, wiki] = await Promise.all([
  read('src/game.ts'),
  read('src/run-checkpoint.ts'),
  read('src/voice-script.ts'),
  read('public/assets/audio/voice/manifest.json'),
  read('public/assets/audio/voice/qa-report.json'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
]);

const errors = [];
let checks = 0;
const requireToken = (source, token, message) => {
  checks += 1;
  if (!source.includes(token)) errors.push(message);
};
const rejectToken = (source, token, message) => {
  checks += 1;
  if (source.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ['const previousLife = this.ledgerEntries[0]', '没有从最近一世读取候选物证'],
  ['[...new Set(previousLife.items)]', '上一世重复物证没有去重'],
  ['!this.items.includes(id) && !STORY_ITEM_IDS.includes(id)', '当前已有物证或固定传承物没有排除'],
  ['previousCandidates[Math.floor(this.random() * previousCandidates.length)]', '上一世物证没有走本局可复现 RNG 随机抽取'],
  ['const regular = this.shuffle(roomPool.filter((id) => id !== inherited)).slice(0, inherited ? 2 : 3)', '普通留灯间池没有为上一世物证让出一格并去重'],
  ['this.specialRoomOffers = inherited ? [inherited, ...regular] : regular', '上一世物证没有固定插入留灯间第一格'],
  ['this.specialRoomPreviousLifeItem = inherited', '没有记录当前房间的上一世物证'],
  ['const fromPreviousLife = id === this.specialRoomPreviousLifeItem', '拿取流程没有识别上一世物证'],
  ['this.acquireItem(id);', '上一世物证没有走正常拾取机制'],
  ['`上一世留下：《${getItem(id).name}》`', '上一世物证没有进入本局记忆'],
  ["this.playVoiceOnce('light-room-left-this', false)", '拿取后没有播放独立看守人录音，或仍叠加重复语音字幕'],
  ['else this.voiceCaption = undefined', '无独立语音条的剧情 cue 没有清掉上一条残留字幕'],
  ["this.caption = '看守人：「有人把它留在这儿了。」'", '离开留灯间后缺少可读叙事字幕'],
  ['this.captionTime = 4.2', '上一世字幕停留时间不足'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ["'上一世的'", '留灯间物证卡缺少上一世标记'],
  ["'上一世留下'", '试穿预览缺少上一世标记'],
  ["'看守人：有人把它留在这儿了。'", '留灯间顶部缺少准确看守人文本'],
  ["auditParams.get('audit-previous') === '1'", '缺少上一世留物冻结审阅入口'],
  ['previousLifeItem: this.specialRoomPreviousLifeItem ?? null', '审阅状态没有暴露上一世物证'],
  ['voiceHistory: [...this.voiceCuesSeen]', '审阅状态没有暴露实际播放过的声音 ID'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['specialRoomPreviousLifeItem?: ItemId', '断点合同缺少上一世物证字段'],
  ['specialRoomPreviousLifeItem: typeof value.specialRoomPreviousLifeItem', '断点读取没有校验上一世物证'],
] ) requireToken(checkpoint, token, message);
for (const [token, message] of [
  ['specialRoomPreviousLifeItem: this.specialRoomPreviousLifeItem', '断点写入遗漏上一世物证'],
  ['this.specialRoomPreviousLifeItem = checkpoint.specialRoomPreviousLifeItem', '断点恢复遗漏上一世物证'],
] ) requireToken(game, token, message);

rejectToken(game, 'this.specialRoomOffers = [inherited, ...regular,', '上一世物证错误扩成第四格');
rejectToken(game, 'this.items.push(this.specialRoomPreviousLifeItem', '上一世物证被强制穿戴，玩家失去选择');
rejectToken(game, "this.say('有人把它留在这儿了。')", '独立录音接入后仍保留重复短提示');
for (const [token, message] of [
  ["| 'light-room-left-this'", '声音类型没有声明上一世看守人 cue'],
  ["'light-room-left-this': { scene: '留灯间', speaker: '看守人' }", '声音合同缺少留灯间声源'],
  ["'light-room-left-this': cue('light-room-left-this', 5, 'room-keeper', '有人把它留在这儿了。'", '声音合同缺少准确看守人台词'],
  ["trigger('special_room_take', '拿走标有“上一世的”普通物证'", '看守人录音没有绑定准确拿取条件'],
]) requireToken(voiceScript, token, message);

const voiceManifest = JSON.parse(voiceManifestText);
const voiceQa = JSON.parse(voiceQaText);
const voiceEntry = voiceManifest.find((entry) => entry.id === 'light-room-left-this');
const qaEntry = voiceQa.find((entry) => entry.id === 'light-room-left-this');
checks += 5;
if (voiceEntry?.file !== 'assets/audio/voice/light-room-left-this.mp3') errors.push('看守人音频清单缺少正式 MP3');
if (voiceEntry?.provider !== 'Kokoro' || voiceEntry?.voiceId !== 'zm_025') errors.push('看守人录音没有沿用留灯间既有音色');
if (voiceEntry?.bytes < 512 || voiceEntry?.durationMs < 400) errors.push('看守人录音文件数据无效');
if (qaEntry?.pronunciationErrorRate !== 0 || qaEntry?.status !== 'pass') errors.push('看守人录音未通过发音 QA');
if (qaEntry?.expected !== '有人把它留在这儿了') errors.push('看守人录音 QA 正典文本不一致');
for (const [source, label] of [[canon, '正典'], [plan, '升级计划'], [wiki, '百科']]) {
  requireToken(source, '上一世的', `${label}没有记录上一世物证标记`);
  requireToken(source, '固定传承物', `${label}没有记录固定掉落防抢跑边界`);
  requireToken(source, '有人把它留在这儿了。', `${label}没有记录准确看守人文本`);
  requireToken(source, 'light-room-left-this', `${label}没有同步看守人独立录音状态`);
}
rejectToken(canon, '| 30 | 新增机制 | 上一世身上', '正典仍把上一世留物标成未完成');
rejectToken(plan, '| 30 | 新增机制 | 上一世身上', '升级计划仍把上一世留物标成未完成');

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  flow: 'latest ledger -> random ordinary item -> light-room slot 1 -> optional normal pickup -> current memory',
  fixedStoryItems: 'excluded to preserve current-run chapter inheritance',
  audio: 'light-room-left-this: Kokoro zm_025; pronunciation QA pass',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
