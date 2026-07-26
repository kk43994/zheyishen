import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, voice, canon, plan, wiki] = await Promise.all([
  read('src/game.ts'),
  read('src/voice-script.ts'),
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

requireToken(game, "const PHONE_STORY_STEPS = ['wife', 'silent', 'hospital', 'mother', 'father-outgoing', 'father', 'coworker']", '七通战斗来电顺序漂移');
for (const [line, message] of [
  ['我把你那份放冰箱了。明天热一下还能吃。', '缺少第1通老婆来电'],
  ["silent: '……'", '缺少第2通陌生静默来电'],
  ['他一直说，不用叫你。', '缺少第3通医院来电'],
  ['你爸，没让我给你打这个电话。', '缺少第4通妈妈来电'],
  ['您拨打的用户暂时无法接通，请稍后再拨。', '缺少第5通主动打给父亲'],
  ['没什么事。你忙吧。', '缺少第6通父亲回拨'],
  ['群里@你了。你没看到吧。', '缺少第7通同事来电'],
  ['「没事。不忙。」', '缺少第8通主角打给家里的收束'],
] ) requireToken(game, line, message);

for (const [token, message] of [
  ['this.phoneActiveStoryIndex = this.phoneStoryIndex < PHONE_STORY_STEPS.length', '响铃时没有锁定当前剧情通次'],
  ['private advancePhoneStory(): void', '缺少接挂共用的剧情推进函数'],
  ['this.advancePhoneStory();', '挂断或接听没有推进固定顺序'],
  ['const storyCaller = this.phoneActiveStoryIndex >= 0', '接听结算仍在随机抽剧情来电'],
  ['PHONE_REPEAT_CALLERS[Math.floor(this.random()', '七通结束后缺少可持续战斗的重复来电池'],
  ['enemy.hp <= enemy.maxHp * 0.5 && this.phoneStoryIndex >= 6', '未走完前六通仍可提前进入二阶段'],
  ['(enemy.phase ?? 1) < 2 && this.phoneStoryIndex < 6', '一阶段高伤没有半血剧情门槛'],
  ['(enemy.phase ?? 1) === 2 && this.phoneStoryIndex < 7', '第七通前高伤仍可直接击杀 Boss'],
  ['this.phonePostAnswerTimer = 0.65', '第七通结束后没有保留收尾输出窗口'],
  ['private showPhoneTranscript(caller: PhoneStoryStep, timer = 4.2)', '缺少长台词专用通话字幕状态'],
  ['this.showPhoneTranscript(caller);', '固定来电没有统一进入专用通话面板'],
  ['private renderPhoneTranscript(): void', '缺少可换行的通话字幕渲染层'],
  ['this.wrapText(`「${transcript.text}」`, 180, 130, 260, 13, 2)', '通话长句没有两行排版约束'],
  ['if (!active || this.paused || this.phoneTranscript) return;', '通话面板出现时仍会重复绘制普通语音字幕'],
  ['this.phoneStoryIndex = 8', '击败 Boss 后没有推进到第八通'],
  ['this.phoneTranscript = undefined;', '第七通字幕会残留到第八通掉落页'],
  ["this.memories.push('成年：最后一通打给家里，他说“没事。不忙。”')", '第八通没有进入本局记忆'],
  ["auditScreen === 'phone-story'", '缺少固定通次审阅画面'],
  ["auditScreen === 'phone-final'", '缺少第八通掉落页审阅画面'],
] ) requireToken(game, token, message);

for (const [cue, step] of [
  ['phone-wife-fridge', 'wife'],
  ['phone-hospital-not-call', 'hospital'],
  ['phone-mother-didnt-ask', 'mother'],
  ['phone-cannot-connect', "'father-outgoing'"],
  ['father-adult-phone', 'father'],
  ['phone-coworker-group', 'coworker'],
]) {
  requireToken(game, `${step}: '${cue}'`, `固定电话节点 ${step} 未绑定声音 ${cue}`);
  requireToken(voice, `'${cue}'`, `声音合同缺少 ${cue}`);
}
requireToken(game, "this.playVoiceOnce('hero-not-busy')", '第8通主角末句未在 Boss 击败时播放');
requireToken(voice, "'hero-not-busy'", '声音合同缺少第8通主角末句');
requireToken(voice, '响个不停固定第5通：他打给父亲', '无法接通音频仍未绑定固定第5通');
requireToken(voice, '响个不停固定第6通：父亲回拨', '父亲回拨音频仍未绑定固定第6通');
rejectToken(game, "silent: 'phone-", '第2通陌生号码不应绑定伪造语音');
rejectToken(game, 'this.say(PHONE_STORY_TEXT', '固定来电仍重复进入普通提示栏');
rejectToken(game, "if (typeKills === 1) this.playVoiceOnce('phone-cannot-connect')", '旧的未接怪击杀语音会打乱固定顺序');
rejectToken(game, "if (typeKills === 3)", '旧的第3只未接怪语音会打乱固定顺序');

for (const [source, label] of [[canon, '正典'], [plan, '升级计划'], [wiki, '百科']]) {
  requireToken(source, '八通电话', `${label}没有记录八通电话`);
  requireToken(source, '没事。不忙。', `${label}没有记录第八通收束`);
}
rejectToken(plan, '| 23 | 语音 | 成年八通电话的固定剧情编排', '升级计划仍把已接线的八通顺序标成未做');
rejectToken(plan, '老婆／妈妈／同事／医院短句与主角末句仍待', '升级计划仍把已完成的电话录音标成待补');
requireToken(wiki, '第 2 通保持真正静默，其余 7 个节点均有独立或逐字匹配的正式语音', '百科没有说明七声一静默的正式资产状态');

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  sequence: '老婆 -> 陌生静默 -> 医院 -> 妈妈 -> 打给爸 -> 爸回拨 -> 同事 -> 打给家里',
  audio: '第1/3/4/7/8通使用独立正式音频；第5/6通复用逐字匹配资产；第2通设计性静默',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
