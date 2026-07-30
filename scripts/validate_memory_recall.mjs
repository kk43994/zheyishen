import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, checkpoint, canon, plan, wiki, packageJson] = await Promise.all([
  read('src/game.ts'),
  read('src/run-checkpoint.ts'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
  read('package.json'),
]);

const errors = [];
let checks = 0;
const requireToken = (source, token, message) => {
  checks += 1;
  if (!source.includes(token)) errors.push(message);
};
const requirePattern = (source, pattern, message) => {
  checks += 1;
  if (!pattern.test(source)) errors.push(message);
};
const rejectToken = (source, token, message) => {
  checks += 1;
  if (source.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ['this.standStillTime >= 6', '回忆触发没有复用静立 6 秒阈值'],
  ['Math.hypot(nearest.x - this.heroX, nearest.y - this.heroY) <= 140', '回忆触发没有检查最近敌人 140 距离'],
  ['this.voiceCaption || this.captionTime > 0 || this.phoneRinging || this.phoneAnswer > 0', '回忆没有给语音、战斗说明和电话更高优先级'],
  ['this.memories.filter((line) => !this.recalledMemories.has(line))', '回忆没有排除本局已经浮现过的内容'],
  ['this.recalledMemories.add(line)', '浮现后没有把记忆记为已读'],
  ['this.memoryRecall = { text: line, time: 4.6, duration: 4.6 }', '回忆没有使用独立显示状态'],
  ["this.drawOutlinedText('想起'", '回忆缺少无底框描边标题'],
  ['this.renderMemoryRecall()', '战斗画面没有渲染独立回忆字幕'],
  ["auditScreen === 'memory-recall'", '缺少回忆冻结审阅入口'],
  ["if (action === 'memory-recall')", '缺少从 6 秒阈值前推进的真实触发钩子'],
  ['memoryRecall: (() => {', '审阅状态没有暴露站立回忆'],
] ) requireToken(game, token, message);
requirePattern(
  game,
  /this\.drawOutlinedWrapText\(\s*`“\$\{active\.text\}”`,\s*180,\s*405,\s*294,\s*this\.captionFontSize\(15\),\s*3,/,
  '回忆正文没有使用语音字幕同款描边换行',
);

for (const [token, message] of [
  ['recalledMemories: string[]', '断点合同缺少已浮现记忆'],
  ['strings(value.recalledMemories, 20, 120)', '断点读取没有校验已浮现记忆'],
  ['.filter((line) => memories.includes(line))', '断点没有排除不属于本局的伪造记忆'],
] ) requireToken(checkpoint, token, message);
for (const [token, message] of [
  ['recalledMemories: [...this.recalledMemories]', '断点写入遗漏已浮现记忆'],
  ['this.recalledMemories = new Set(checkpoint.recalledMemories)', '断点恢复遗漏已浮现记忆'],
  ["[...this.recalledMemories].join(',')", '断点签名没有在回忆浮现后触发落盘'],
] ) requireToken(game, token, message);

for (const [source, label] of [[canon, '正典'], [plan, '升级计划'], [wiki, '百科']]) {
  requireToken(source, '站住 6 秒', `${label}没有记录站立回忆阈值`);
  requireToken(source, '140', `${label}没有记录安全敌距`);
  requireToken(source, '一条只浮一次', `${label}没有记录单条记忆频率`);
}
requireToken(packageJson, 'validate:memory-recall', 'package scripts 缺少回忆独立校验');
rejectToken(game, 'this.caption = line;', '回忆仍在覆盖普通战斗说明字幕');
rejectToken(canon, '| 29 | 新增机制 | 站住 6 秒', '正典仍把站立回忆标成未完成');
rejectToken(plan, '| 29 | 新增机制 | 站住 6 秒', '升级计划仍把站立回忆标成未完成');

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  trigger: 'stand still 6s + nearest enemy beyond 140 + narrative channel available',
  frequency: 'each memory once per run, persisted through checkpoint',
  audit: '?audit=1&audit-screen=memory-recall',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
