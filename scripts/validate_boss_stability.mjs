import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, checkpoint] = await Promise.all([
  read('src/game.ts'),
  read('src/run-checkpoint.ts'),
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
  ['enemy.x = this.heroX + Math.cos(relocateAngle) * 170;', '催收换门仍未使用世界坐标'],
  ['this.heroX += (pullX / pullDistance) * 54;', '催收拖拽仍未使用世界坐标'],
  ['this.heroY += (pullY / pullDistance) * 54;', '催收纵向拖拽仍未使用世界坐标'],
  ['this.heroX += pushDirection * 32;', '衣柜闭门横推仍未使用世界坐标'],
  ['x: this.heroX + Math.cos(backstabAngle) * 82', '岗位背刺仍未相对主角落位'],
  ['const storyLimit = phaseTwo ? PHONE_STORY_STEPS.length : 6;', '电话第七通仍可能在一阶段被消耗'],
  ['if (!resume) this.hero.block = this.fateBuild.openingBlock;', '恢复断点仍会覆盖已有护盾'],
  ['boss: this.captureBossCheckpoint()', '战斗断点没有保存 Boss 稳定进度'],
  ['this.restoreBossCheckpoint(checkpoint.boss);', '断点恢复没有重建 Boss 稳定进度'],
  ["screen !== 'storyDrop'", '固定掉落画面没有进入断点写入范围'],
  ["auditScreen === 'checkpoint'", '缺少 Boss 与固定掉落断点的浏览器回归入口'],
  ["checkpointVariant === 'story-drop'", '缺少固定掉落断点回归变体'],
  ['if (import.meta.env.DEV) this.installTestHooks();', '生产环境仍会安装游戏测试钩子'],
  ['if (!import.meta.env.DEV) return;', '测试钩子正文缺少生产裁剪边界'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ["| 'storyDrop' |", '断点画面合同缺少固定掉落'],
  ['export interface CheckpointBossState', '断点合同缺少 Boss 稳定快照'],
  ['boss?: CheckpointBossState;', '对局断点没有可选 Boss 快照'],
  ['boss: checkpointBossState(value.boss)', 'Boss 快照读取没有经过边界校验'],
] ) requireToken(checkpoint, token, message);

for (const [token, message] of [
  ['this.clamp(this.heroX + Math.cos(relocateAngle) * 170', '催收换门又被夹回首屏坐标'],
  ['this.clamp(this.heroX + (pullX / pullDistance) * 54', '催收拖拽又被夹回首屏坐标'],
  ['this.clamp(this.heroX + pushDirection * 32', '衣柜横推又被夹回首屏坐标'],
] ) rejectToken(game, token, message);

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  coordinates: 'camera-following infinite world; boss displacement remains relative',
  phone: 'phase one stories 1-6; phase two unlocks story 7',
  checkpoint: 'block + boss stable progress + mandatory story drop',
  production: 'test globals removed by DEV dead-code elimination',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
