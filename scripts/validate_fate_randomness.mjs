import { readFile } from 'node:fs/promises';

const game = await readFile('src/game.ts', 'utf8');
const errors = [];

const auditStart = game.indexOf("const auditScreen = auditParams.get('audit-screen');");
const auditEnd = game.indexOf("this.encounterIndex = 2;", auditStart);
const auditSeedBlock = auditStart >= 0 && auditEnd >= 0
  ? game.slice(auditStart, auditEnd)
  : '';

if (!auditSeedBlock.includes("auditScreen === 'fate' || auditScreen === 'ai-fate'")) {
  errors.push('命运卡审阅入口没有独立随机种子分支');
}
if (!auditSeedBlock.includes("auditParams.get('audit-seed')")) {
  errors.push('命运卡审阅入口缺少可复现 audit-seed 参数');
}
if (!auditSeedBlock.includes('globalThis.crypto?.getRandomValues(entropy)')) {
  errors.push('命运卡审阅入口没有使用每次刷新生成的新熵');
}
if (!auditSeedBlock.includes('this.rngState = this.runSeed')) {
  errors.push('新命运种子没有同步到运行时随机状态');
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  policy: '命运卡审阅默认每次刷新换种子；只有显式 audit-seed 才复现固定结果',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
