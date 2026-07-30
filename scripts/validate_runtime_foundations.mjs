import fs from 'node:fs';

const game = fs.readFileSync('src/game.ts', 'utf8');
const ai = fs.readFileSync('src/ai.ts', 'utf8');
const checkpoint = fs.readFileSync('src/run-checkpoint.ts', 'utf8');
const onboarding = fs.readFileSync('src/onboarding.ts', 'utf8');
const telemetry = fs.readFileSync('src/telemetry.ts', 'utf8');
const performanceMonitor = fs.readFileSync('src/performance-monitor.ts', 'utf8');
const artRuntime = fs.readFileSync('src/art-runtime.ts', 'utf8');
const main = fs.readFileSync('src/main.ts', 'utf8');
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

requireToken(performanceMonitor, "const PERFORMANCE_STORAGE_KEY = 'zys-performance-v1'", '缺少设备本地性能报告');
requireToken(performanceMonitor, "PerformanceObserver.supportedEntryTypes?.includes('longtask')", '没有监控主线程长任务');
requireToken(performanceMonitor, 'recordFramePerformance', '没有帧率与长帧采样');
requireToken(performanceMonitor, 'recordArtPerformance', '没有图片解码耗时采样');
requireToken(performanceMonitor, 'cornerTapCount >= 6', '扫码环境缺少隐藏的开发者监控入口');
requireToken(performanceMonitor, "copy.textContent = '查看 JSON'", '开发者不能查看完整性能报告');
requireToken(performanceMonitor, 'JSON.stringify(report, null, 2)', '性能报告缺少可读 JSON 视图');
rejectToken(performanceMonitor, 'fetch(', '本地性能监控不应发送网络请求');
rejectToken(performanceMonitor, 'navigator.clipboard', '互动空间性能监控不能访问敏感剪贴板能力');
rejectToken(performanceMonitor, 'document.execCommand', '互动空间性能监控不能使用废弃复制接口');
requireToken(artRuntime, 'recordArtPerformance(', '图片加载器没有上报性能样本');
requireToken(game, 'recordFramePerformance(frameDuration', '游戏主循环没有上报帧样本');
requireToken(main, "markPerformance('interactive_ready')", '没有记录首屏可交互时间');

requireToken(ai, 'signal?: AbortSignal', 'AI 请求没有取消信号');
requireToken(game, 'this.originAbortController?.abort()', '新局没有取消旧出生请求');
requireToken(game, 'controller.signal', '出生请求没有转发取消信号');
requireToken(game, 'for (let attempt = 1; attempt <= 1; attempt += 1)', '出生请求仍可能因长等待重复计费');
requireToken(game, "if (this.state !== 'origin' || this.aiOriginState !== 'error') return;", '重试入口没有限制在明确失败后');

requireToken(game, 'separateCircularBodies(this.enemies)', '敌群分离仍未使用空间桶');
// 背板必须对齐“CSS 显示宽度 × 设备 DPR”，否则 360px 背板被拉到 430px 等
// 非整数尺寸时，连 Canvas 文字也会被浏览器二次插值发糊。画质档仍负责像素预算上限。
requireToken(game, 'const physicalWidth = cssWidth * Math.max(1, window.devicePixelRatio || 1)', 'Canvas 背板没有对齐实际显示像素');
requireToken(game, 'const scale = width / W', 'Canvas 逻辑坐标没有映射到自适应清晰度背板');
requireToken(game, 'new ResizeObserver(() => this.applyRenderQuality())', '窗口尺寸改变后 Canvas 背板不会重新对齐');
requireToken(game, 'readStoredSettingNumber(SETTINGS_STORAGE.renderQuality, 3, [1, 2, 3])', '画质档位默认没有停在 3x 原生清晰度');
requireToken(game, 'const screenMargin = Math.max(96, margin)', '没有跳过完全位于屏幕外的无效 Canvas 绘制');
requireToken(game, 'const screenX = HERO_SCREEN_X + (x - this.heroX)', '屏幕裁剪没有把世界 X 坐标转换到相机坐标');
requireToken(game, 'const screenY = HERO_SCREEN_Y + (y - this.heroY)', '屏幕裁剪没有把世界 Y 坐标转换到相机坐标');
requireToken(game, "if (this.devPanelOpen) {\n        if (event.key === 'Escape')", '开发图鉴没有在暂停快捷键之前独占键盘输入');
requireToken(game, 'if (this.devPanelDetail) this.devPanelDetail = undefined;\n          else this.closeDevPanel();', '开发图鉴的 Esc 没有按「详情→图鉴→游戏」逐层退出');
requireToken(game, "if (this.state === 'battle' && this.paused) this.setPaused(false);", '关闭开发图鉴没有清理历史 Esc 穿透留下的暂停脏状态');
requireToken(game, 'this.resetMovementInput();\n    this.resetFateInput();\n    this.resetPauseHold();\n    this.devPanelDetail = undefined;\n    this.devPanelOpen = true;', '打开开发图鉴前没有释放持续输入');
requireToken(workflow, 'npm run validate:core', 'CI 没有执行核心门禁');

const result = {
  valid: errors.length === 0,
  checks,
  checkpoint: 'v1 -> v2 migration with invalid backup',
  onboarding: 'first 12 seconds; audit-safe',
  telemetry: 'device-local; bounded; no network sender',
  performanceMonitor: 'hidden six-tap panel; startup, image decode, frames, long tasks and optional JS heap; no network sender',
  aiRequests: 'abortable; no overlapping long-wait retry',
  renderScale: 'CSS size × device DPR backing, capped by 1x-3x quality setting',
  renderCulling: 'offscreen-only; visible art and simulation unchanged',
  devPanelInput: 'keyboard-exclusive; nested Escape unwind; stale pause and movement locks cleared',
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
