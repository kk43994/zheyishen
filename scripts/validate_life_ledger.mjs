import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, ledger, canon, plan, wiki] = await Promise.all([
  read('src/game.ts'),
  read('src/run-ledger.ts'),
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
  ["LIFE_LEDGER_STORAGE_KEY = 'zys-ledger-v1'", '名册存储键漂移'],
  ['LIFE_LEDGER_LIMIT = 30', '名册没有最近30条硬上限'],
  ['ITEM_IDS.includes(id as ItemId)', '坏档案中的非法道具 ID 没有过滤'],
  ['parsed.map(parseEntry)', '名册读取没有逐条校验'],
  ['slice(0, LIFE_LEDGER_LIMIT)', '名册读取或写入没有裁到上限'],
  ['const next = [entry, ...readLifeLedger()]', '新封卷没有排在名册最前'],
  ['window.localStorage.setItem(LIFE_LEDGER_STORAGE_KEY', '名册没有写入约定存储键'],
  ['Embedded browsers may disable storage', '禁用 localStorage 时没有降级边界'],
] ) requireToken(ledger, token, message);

for (const [token, message] of [
  ['private recordRunInLedger(won: boolean)', '缺少统一结局写档函数'],
  ['if (this.ledgerRecordedForCurrentRun || !this.origin) return', '重复结算会重复写入同一人生'],
  ['runSeed: this.runSeed >>> 0', '名册编号没有使用真实 runSeed'],
  ['nickname: this.origin.nickname || this.origin.title', '名册没有保存外号'],
  ['reachedAge: AGE_LABELS[reachedStage]!', '名册没有保存活到的人生阶段'],
  ["endedBy: won ? '放下了' : this.lastDamageSource", '通关或死亡原因没有按正典写入'],
  ['items: [...this.items]', '名册没有保存最后那身道具 ID'],
  ['const lastEcho = this.fateReceipts[this.fateReceipts.length - 1]?.result', '名册没有优先保存末次命运回响'],
  ['this.recordRunInLedger(won);', '统一 endRun 入口没有调用名册写档'],
  ['private hurtHero(amount: number, source?: string)', '伤害路径没有携带来源'],
  ['if (source) this.lastDamageSource = source', '实际扣血时没有锁定伤害来源'],
  ['this.hurtHero(enemy.damage, enemy.name)', '敌人接触没有传真实显示名'],
  ["this.hurtHero(3, '沉默的父亲')", '父亲场地攻击没有传 Boss 名'],
  ["this.lastDamageSource = '自己合上了档案'", '主动结束没有独立死因'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ['ORIGIN_LEDGER_RECT', '出生登记处没有名册入口区域'],
  ['private renderOriginLedger(): void', '缺少名册旧页渲染'],
  ['`往前翻 · ${this.ledgerEntries.length}`', '入口没有显示可翻旧页数量'],
  ["ctx.fillText('活到'", '旧页没有活到字段'],
  ["ctx.fillText('死在谁手里'", '旧页没有死因字段'],
  ['`最后那身 · ${entry.items.length} 件`', '旧页没有最后物证'],
  ["ctx.fillText('最后一句'", '旧页没有末次回响'],
  ["ctx.fillText('只读 · 不参与下一次出生'", '名册没有明确只读红线'],
  ["this.drawBreathActionButton(LEDGER_OLDER_RECT, '更早'", '名册不能翻更早'],
  ["this.drawBreathActionButton(LEDGER_NEWER_RECT, '更新'", '名册不能翻更新'],
  ["auditScreen === 'ledger'", '缺少名册冻结审阅画面'],
  ['ledger-page', '审阅入口不能切换旧页'],
] ) requireToken(game, token, message);

rejectToken(game, 'generateAIOrigin(this.ledger', '名册数据被错误送入 AI 出生生成');
rejectToken(game, 'rollOriginWheels(this.ledger', '名册数据被错误送入出生轮盘');
for (const [source, label] of [[canon, '正典'], [plan, '升级计划'], [wiki, '百科']]) {
  requireToken(source, 'zys-ledger-v1', `${label}没有记录名册存储键`);
  requireToken(source, '最近 30 条', `${label}没有记录名册30条上限`);
  requireToken(source, '不参与', `${label}没有记录名册只读生成边界`);
}
rejectToken(canon, '| 28 | 新增机制 | 《这一身》名册', '正典仍把名册标成未完成');
rejectToken(plan, '| 28 | 新增机制 | 《这一身》名册', '升级计划仍把名册标成未完成');

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  storage: 'zys-ledger-v1 · newest first · last 30',
  fields: 'runSeed / nickname / reachedAge / endedBy / items / lastEcho',
  boundary: 'read-only history; never feeds origin generation',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
