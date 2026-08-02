import fs from 'node:fs';

const game = fs.readFileSync('src/game.ts', 'utf8');
const ai = fs.readFileSync('src/ai.ts', 'utf8');
const checkpoint = fs.readFileSync('src/run-checkpoint.ts', 'utf8');
const onboarding = fs.readFileSync('src/onboarding.ts', 'utf8');
const telemetry = fs.readFileSync('src/telemetry.ts', 'utf8');
const performanceMonitor = fs.readFileSync('src/performance-monitor.ts', 'utf8');
const artRuntime = fs.readFileSync('src/art-runtime.ts', 'utf8');
const artPreload = fs.readFileSync('src/art-preload.ts', 'utf8');
const audioPlatform = fs.readFileSync('src/audio-platform.ts', 'utf8');
const main = fs.readFileSync('src/main.ts', 'utf8');
const releaseMetadata = fs.readFileSync('scripts/sync_release_metadata.mjs', 'utf8');
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

// 任意一帧的逻辑或绘制异常都不能杀死唯一的 RAF 链。尤其是 Canvas 在 save()
// 之后抛错时，必须同时清掉固定步长欠账并回收画笔栈，否则玩家看到的是画面永久
// 停住或每帧继续叠加旧 translate/rotate 的“假死”。这些合同有真浏览器故障注入
// 覆盖，这里再锁住关键恢复路径，避免日常重构无声删掉它。
requireToken(game, 'private frameErrorCount = 0;', '主循环缺少有界异常计数');
requireToken(game, "console.error('[frame]', error);", '主循环异常没有独立诊断标记');
requireToken(game, 'this.accumulator = 0;\n      // 抛在 ctx.save()', '异常帧没有清空固定步长欠账');
requireToken(game, 'for (let depth = 0; depth < 64; depth += 1) this.ctx.restore();', '异常帧没有回收 Canvas 保存栈');
requireToken(game, 'this.ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);', '异常帧没有恢复 Canvas 基础坐标系');
requireToken(game, 'requestAnimationFrame((next) => this.frame(next));', '异常后没有继续调度下一帧');
requireToken(game, 'const waitSerial = this.runSerial;\n        const waitEncounterIndex = this.encounterIndex;', '章节美术等待缺少对局与章节身份令牌');
requireToken(game, 'if (this.runSerial !== waitSerial || this.encounterIndex !== waitEncounterIndex) return;', '旧章节美术回调仍可能写入新局状态');
requireToken(game, 'this.resetStageArtWait();', '换局入口没有清理旧章节美术等待状态');
requireToken(artPreload, 'index === 0 || urgent ? \'critical\' : \'next\'', '章节硬闸门仍在用后台单通道串行解码');
requireToken(game, 'warmProductionArtForStage(nextStageIndex, true)', '章末美术硬闸门没有启用关键并发');
requireToken(game, 'const warmEncounterIndex = this.encounterIndex;', '延迟章节音频预热没有绑定发起时的章节身份');
requireToken(game, 'this.encounterIndex !== warmEncounterIndex', '旧章节的延迟回调仍会挤占当前章节音频预热线');

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
requireToken(game, 'this.resetMovementInput();\n    this.resetFateInput();\n    this.resetPauseHold();\n    this.devPanelDetail = undefined;', '打开开发图鉴前没有释放持续输入');
requireToken(game, 'if (!productionArtStageReady(index)) {', '生产开发面板仍会绕过目标章正式美术硬闸门');
requireToken(game, 'void warmProductionArtForStage(index, true)', '生产开发面板没有把目标章提升到关键三路解码');
requireToken(game, 'this.devPanelStageLoadGeneration !== generation', '关闭面板或重选章节后，迟到美术 Promise 仍会自行跳章');
requireToken(game, 'this.devPanelStageLoading === index ? \'关键美术解码中…\'', '开发面板装订期间没有可见存活反馈');
requireToken(game, 'this.feedback.stopVoice();\n    this.scheduledVoices = [];\n    this.closeDevPanel();', '开发面板跳章仍会把旧章旁白和延迟台词带进目标章');
requireToken(game, "this.canvas.addEventListener('pointerleave', (event) => {", '画布离开事件没有按 pointerId 清理持续输入');
requireToken(game, 'if (event.pointerId === this.joyPointerId) this.resetMovementInput();\n      if (event.pointerId === this.fatePointerId) this.resetFateInput();', '不支持 Pointer Capture 的 WebView 仍会留下摇杆或命运拖拽锁');
requireToken(game, "window.addEventListener('blur', () => {\n      this.resetMovementInput();\n      this.resetFateInput();\n      this.resetSpecialRoomHold();\n      this.resetPauseHold();", '短暂失焦没有释放全部持续输入');
requireToken(game, "if (this.autoPauseOnBlur && (this.state === 'battle' || this.state === 'fateEvent')) {\n          this.setPaused(true);\n        } else this.feedback.stopVoice();", '旁白仍可能在可见 blur 时被截断，或真正隐藏后继续播放');
requireToken(game, 'this.feedback.pauseVoice();\n    } else this.feedback.resumeVoice();', '游戏暂停仍会销毁旁白播放头，或解除暂停后不会续播');
requireToken(audioPlatform, 'private voiceSuspendedByGame = false;', '平台旁白没有区分暂停挂起与剧情取消');
requireToken(audioPlatform, 'if (player && !player.paused) player.pause();\n    this.refreshActiveVolumes();', '平台旁白暂停没有保留播放头并解除背景闪避');
requireToken(audioPlatform, 'if (this.activeVoice) this.resumeActiveVoice();\n    else this.playQueuedVoice();', '平台旁白解除暂停不会从原播放头续播，或坏播放器清理后不会继续候补');
requireToken(audioPlatform, 'player.onerror = () => {\n      // 首次装载错误仍交给下面两级 load/play 自愈', '平台旁白中途解码错误仍会永久占用主持权');
requireToken(audioPlatform, 'if (this.voicePlayers.get(id) === player) this.voicePlayers.delete(id);\n      this.releaseMediaPlayer(player);', '中途损坏的旁白元素没有从媒体池真正释放');
requireToken(audioPlatform, 'this.activeVoice && !this.activeVoice.paused && !this.voiceSuspendedByGame', '背景闪避没有绑定真正可闻的旁白状态');
requireToken(audioPlatform, 'let completed = false;\n        const onDone = (buffer: AudioBuffer): void => {\n          if (completed) return;', '现代 decodeAudioData 同时走回调和 Promise 时会重复扫描每段音效波形');
requireToken(audioPlatform, 'player.onerror = () => this.recoverAmbienceMediaError(player, stage);', '环境床中途损坏后不会释放并重建');
requireToken(audioPlatform, 'player.onerror = () => this.recoverMusicMediaError(player, track);', '主 BGM 中途损坏后不会释放并重建');
requireToken(audioPlatform, 'twin.onerror = () => this.recoverMusicMediaError(twin, track);', 'BGM 循环替补损坏后会永久退回有缝原生循环');
requireToken(audioPlatform, 'musicTwinRejectCount += 1;', 'BGM 循环替补 play 拒绝没有计数或退池自愈');
requireToken(audioPlatform, 'this.musicTwin !== twin) return;', 'BGM 循环替补拒播恢复缺少身份守卫');
requireToken(audioPlatform, 'if (!this.musicTwin && this.musicTwinArmTimer === null && !document.hidden)', '回前台后缺少 BGM 循环替补重建');
requireToken(audioPlatform, 'private releaseFadedMusicPlayer(player: HTMLAudioElement): void {', '淡出完毕的上一首 BGM 没有专用退池路径');
requireToken(audioPlatform, 'this.fadePlayer(previous, 0, 2.1, true, () => this.releaseFadedMusicPlayer(previous));', 'BGM 交叉淡化结束后仍会让旧曲带 src 占用解码器');
requireToken(audioPlatform, 'ambienceStartRetireCount += 1;', '环境床连续拒播后没有释放毒化元素');
requireToken(audioPlatform, 'musicStartRetireCount += 1;', 'BGM 连续拒播后没有释放毒化元素');
requireToken(audioPlatform, 'tensionStartRetireCount += 1;', '紧张层连续拒播后没有释放毒化元素');
requireToken(audioPlatform, 'this.musicPlayers.get(track) !== player) return;', '旧曲迟到拒播仍会污染当前曲目重试额度');
requireToken(audioPlatform, 'this.loopStartFailureGeneration.get(player) === generation', '共享 play Promise 的重复 catch 会重复消耗循环轨重试额度');
requireToken(audioPlatform, 'if (!this.sfxPools.get(sound)?.includes(player)) return;', '元素音效 play 拒绝后没有退掉毒化池');
requireToken(audioPlatform, 'if (this.ambienceEventPlayers.get(sound) !== player) return;', '环境点声 play 拒绝后没有退掉毒化元素');
requireToken(audioPlatform, 'player.onerror = () => this.recoverTensionMediaError(player);', '紧张层中途损坏后不会释放并重建');
requireToken(audioPlatform, 'const doomed = new Set<HTMLAudioElement>(this.musicPlayers.values());', 'BGM 错误恢复没有清理旧主、替补与交叉淡化引用');
requireToken(audioPlatform, 'if (cached && cached.every((player) => !player.error)) {', '元素兜底音效仍会永久复用已损坏的池');
requireToken(audioPlatform, 'this.releaseSfxPool(sound);\n      };', '元素兜底音效报错后没有整池释放');
requireToken(audioPlatform, 'if (this.ambienceEventPlayers.get(sound) !== eventPlayer) return;', '场景点声报错后没有校验并清理当前缓存');
requireToken(releaseMetadata, 'function inspectZipContents(zip) {', '发行元数据没有从最终 ZIP 中读取文件清单');
requireToken(releaseMetadata, 'const { fileCount, unpackedBytes } = inspectZipContents(zip);', '发行元数据仍可能使用临时构建目录而不是最终 ZIP');
rejectToken(releaseMetadata, "resolve(ROOT, 'dist')", '发行元数据仍把可被后续 build 覆盖的 dist 当作事实源');
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
  frameRecovery: 'single-frame faults cannot terminate RAF; fixed-step debt and Canvas state are reset',
  stageArtAsync: 'stale promises are isolated; blocked transitions promote missing art to three critical lanes',
  stageAudioAsync: 'delayed warmups are scoped to the run and encounter that scheduled them',
  devPanelInput: 'keyboard-exclusive; nested Escape unwind; stale pause and movement locks cleared; stage jumps wait for mandatory art',
  pointerFallback: 'pointerleave releases sustained controls when embedded WebViews lack Pointer Capture',
  blurLifecycle: 'visible blur releases held inputs without destroying voice; hidden pages stop voice or auto-pause',
  pauseVoiceLifecycle: 'pause preserves the active narration playhead; explicit stop still cancels it',
  voiceRuntimeFailure: 'mid-stream media errors release the poisoned player and advance the queue',
  sfxDecode: 'callback and Promise completion share one waveform-analysis pass',
  loopMediaFailure: 'ambience, music, loop twin and tension replace poisoned media elements',
  musicFadeLifecycle: 'obsolete tracks release src and Web Audio graphs after their crossfade completes',
  fallbackMediaFailure: 'element SFX and ambience-event pools evict poisoned decoders',
  releaseMetadata: 'zip central directory is authoritative; mutable dist builds cannot stale release evidence',
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
