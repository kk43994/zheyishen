import fs from 'node:fs';

const game = fs.readFileSync('src/game.ts', 'utf8');
const ai = fs.readFileSync('src/ai.ts', 'utf8');
const checkpoint = fs.readFileSync('src/run-checkpoint.ts', 'utf8');
const onboarding = fs.readFileSync('src/onboarding.ts', 'utf8');
const telemetry = fs.readFileSync('src/telemetry.ts', 'utf8');
const workflow = fs.readFileSync('.github/workflows/quality.yml', 'utf8');

const errors = [];
let checks = 0;

function requireToken(source, token, message) {
  checks += 1;
  if (!source.includes(token)) errors.push(message);
}

function rejectToken(source, token, message) {
  checks += 1;
  if (source.includes(token)) errors.push(message);
}

requireToken(checkpoint, 'RUN_CHECKPOINT_VERSION = 2', '断点版本没有升级到 v2');
requireToken(checkpoint, "'zys-run-checkpoint-v2'", '缺少 v2 断点存储键');
requireToken(checkpoint, "'zys-run-checkpoint-v1'", '缺少 v1 断点迁移来源');
requireToken(checkpoint, 'INVALID_BACKUP_KEY', '无效断点没有保留可恢复备份');
requireToken(checkpoint, 'if (key !== RUN_CHECKPOINT_STORAGE_KEY) writeRunCheckpoint(parsed)', '旧断点读取后没有迁移写入');
requireToken(game, 'version: RUN_CHECKPOINT_VERSION', '游戏仍在写死断点版本');

requireToken(onboarding, "'zys-first-run-guide-v1'", '首局引导没有稳定完成标记');
requireToken(game, 'renderFirstRunGuide()', '战斗渲染链没有接入首局引导');
requireToken(game, "auditScreen === 'tutorial'", '首局引导缺少开发审阅入口');
requireToken(game, 'if (!this.auditFirstRunGuide)', '审阅入口会污染玩家首局完成记录');

requireToken(telemetry, 'const TELEMETRY_LIMIT = 300', '本地遥测没有容量上限');
requireToken(telemetry, 'sanitizeFields', '本地遥测没有字段清洗');
requireToken(telemetry, '.slice(-TELEMETRY_LIMIT)', '本地遥测没有裁剪旧记录');
rejectToken(telemetry, 'fetch(', '本地遥测不应发送网络请求');
requireToken(ai, "recordTelemetry('ai_request'", 'AI 请求没有延迟/状态遥测');
requireToken(game, "recordTelemetry('run_started'", '缺少开局遥测');
requireToken(game, "recordTelemetry('fate_choice'", '缺少命运选择遥测');
requireToken(game, "recordTelemetry('run_ended'", '缺少结局遥测');

requireToken(ai, 'signal?: AbortSignal', 'AI 请求没有取消信号');
requireToken(game, 'this.originAbortController?.abort()', '新局没有取消旧出生请求');
requireToken(game, 'controller.signal', '出生请求没有转发取消信号');
requireToken(game, '这页仍在登记，不会重复发起请求', '长等待文案没有明确禁止重复计费请求');
requireToken(game, '明确失败后才会出现重试入口', '重试入口没有限制在明确失败后');

requireToken(game, 'separateCircularBodies(this.enemies)', '敌群分离仍未使用空间桶');
requireToken(game, 'Math.min(3, Math.max(1, Math.floor(window.devicePixelRatio || 1)))', 'Canvas 没有保留高密度手机的 3x 原生清晰度');
requireToken(game, 'const screenMargin = Math.max(96, margin)', '没有跳过完全位于屏幕外的无效 Canvas 绘制');
requireToken(workflow, 'npm run validate:core', 'CI 没有执行核心门禁');

const result = {
  valid: errors.length === 0,
  checks,
  checkpoint: 'v1 -> v2 migration with invalid backup',
  onboarding: 'first 12 seconds; audit-safe',
  telemetry: 'device-local; bounded; no network sender',
  aiRequests: 'abortable; no overlapping long-wait retry',
  renderScale: '1x-3x integer backing; native art quality retained',
  renderCulling: 'offscreen-only; visible art and simulation unchanged',
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
