import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, types, renderer, canon, plan, wiki] = await Promise.all([
  read('src/game.ts'),
  read('src/types.ts'),
  read('src/enemy-pixel.ts'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
]);

const errors = [];
const requireToken = (source, token, message) => {
  if (!source.includes(token)) errors.push(message);
};

requireToken(types, 'countedItem?: ItemId;', '敌人状态缺少清点目标');
requireToken(types, 'countedItemTimer?: number;', '敌人状态缺少清点倒计时');
requireToken(game, 'private stageDisabledItems = new Set<ItemId>();', '缺少本章失效标记集合');
requireToken(game, 'return this.items.includes(id) && !this.stageDisabledItems.has(id);', 'hasItem 没有统一停用被封物证');
if ((game.match(/this\.stageDisabledItems\.clear\(\);/g) ?? []).length < 3) {
  errors.push('新局、章节重建或出关没有完整恢复被封物证');
}

for (const [token, message] of [
  ["if (enemy.type === 'whose-box')", '谁的纸箱缺少独立技能循环'],
  ['enemy.windupTimer = 0.7', '《清点》前摇不是正典的 0.7 秒'],
  ["enemy.attackKind = 'box-count'", '《清点》没有进入通用前摇派发'],
  ["case 'box-count'", '《清点》前摇结束后没有独立结算'],
  ['enemy.countedItemTimer = 8', '玩家没有完整 8 秒击杀窗口'],
  ['enemy.countedItemTimer = Math.max(0', '清点倒计时没有逐帧推进'],
  ['this.stageDisabledItems.add(item)', '逾时没有让目标物证本章失效'],
  ["if (item === 'fathers-raincoat') this.raincoatReady = false", '雨衣一次性状态没有随物证失效'],
  ["if (item === 'baby-tooth') this.toothReady = false", '乳牙一次性状态没有随物证失效'],
  ["enemy.type === 'whose-box' && enemy.countedItem && !this.stageDisabledItems.has(enemy.countedItem)", '窗口内击杀没有保住被点名物证'],
  ['this.boxSavedItem = enemy.countedItem', '保住物证没有进入奖励反馈'],
  ['private renderBoxCountStatus(): void', '缺少清点 HUD 状态条'],
  ["const panelY = this.joyPointerId === -1 ? 536 : 492", '清点状态条没有避让触屏摇杆'],
  ["timer.toFixed(1)", '倒计时没有 0.1 秒精度反馈'],
  ['if (this.stageDisabledItems.has(id)) ctx.globalAlpha = 0.24', '失效物证没有保留并灰显'],
  ["ctx.strokeStyle = '#c64f60'", '失效物证缺少红叉识别'],
  ["auditScreen === 'box-count'", '缺少清点开盖动作审阅画面'],
  ["auditScreen === 'box-countdown'", '缺少清点倒计时审阅画面'],
]) requireToken(game, token, message);

requireToken(renderer, "'whose-box': 'whose-box'", '纸箱没有独立运行时图集映射');
requireToken(renderer, "'whose-box': 80", '纸箱运行时显示尺寸发生漂移');

for (const [source, label] of [[canon, '正典'], [plan, '升级计划'], [wiki, '百科']]) {
  requireToken(source, '0.7', `${label}没有记录清点前摇`);
  requireToken(source, '8 秒', `${label}没有记录完整击杀窗口`);
  requireToken(source, '出关', `${label}没有记录本章失效后的恢复规则`);
}
if (canon.includes('《清点》使道具本关失效的核心技能仍属待做')) errors.push('正典仍把已落地的《清点》标成待做');
if (plan.includes('、纸箱《清点》、')) errors.push('升级计划总待办仍包含已完成的《清点》');

console.log(JSON.stringify({
  valid: errors.length === 0,
  mechanic: '0.7秒开盖前摇 -> 随机点名 -> 8秒击杀窗口 -> 逾时本章失效 -> 出关恢复',
  checks: 32,
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
