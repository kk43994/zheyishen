import fs from 'node:fs';
import path from 'node:path';

const main = fs.readFileSync('src/main.ts', 'utf8');
const preload = fs.readFileSync('src/art-preload.ts', 'utf8');
const runtime = fs.readFileSync('src/art-runtime.ts', 'utf8');
const game = fs.readFileSync('src/game.ts', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const style = fs.readFileSync('src/style.css', 'utf8');
const platformAudio = fs.readFileSync('src/audio-platform.ts', 'utf8');
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

rejectToken(main, "import { ZheYiShenGame } from './game'", '游戏模块仍会在美术闸门前静态启动');
// 2026-07-30：从「全量硬门禁」改回「首屏门禁 + 后台按章补装订」。互动空间里
// 六章一次性等完（148 张 / 4.2MB）把全部代价堆在第一屏，玩家进不去。
// 这里守的不变量不是「等多少张」，而是：①进游戏前童年章必须齐；②后续章节
// 一定有人在后台补；③每章开打前有硬闸门复核；④永不降级、失败即阻断。
requireToken(main, 'await preloadProductionArt', '没有在启动游戏前等待首屏与童年章正式美术');
requireToken(main, 'preloadRemainingProductionArt(', '进游戏后没有在后台补装订后续章节');
requireToken(main, 'endArtBootPhase()', '装帧页收起后没有把关键解码队列降回战斗档');
requireToken(main, "const gameModulePromise = import('./game')", '游戏模块没有与首屏图片并行准备');
requireToken(main, 'await gameModulePromise', '首屏正式美术完成后没有等待游戏模块');
requireToken(main, 'requestAnimationFrame(() => requestAnimationFrame', '没有保留两帧给运行时图集建立首屏缓存');
requireToken(main, 'if (loading) loading.hidden = true', '完整美术完成后没有关闭装帧页');
requireToken(main, '程序化降级动画已取消', '资源失败页没有明确取消程序化降级动画');
requireToken(main, "auditParams.get('audit-art-fail') === '1'", '缺少美术失败阻断审阅入口');

// 后台补装订必须发生在装帧页收起之后，不能挤占首屏门禁的带宽。
const bootGateAt = main.indexOf('await preloadProductionArt');
const remainingAt = main.indexOf('preloadRemainingProductionArt(');
checks += 1;
if (!(bootGateAt >= 0 && remainingAt > bootGateAt)) {
  errors.push('后台补装订排在首屏门禁之前，会和首屏抢解码通道');
}

const moduleRequestAt = main.indexOf("const gameModulePromise = import('./game')");
const preloadAt = main.indexOf('await preloadProductionArt');
const importAt = main.indexOf('await gameModulePromise');
const hideAt = main.indexOf('if (loading) loading.hidden = true');
checks += 1;
if (!(moduleRequestAt >= 0 && preloadAt > moduleRequestAt && importAt > preloadAt
  && hideAt > importAt)) {
  errors.push('启动顺序不是“模块与首屏美术并行准备 -> 首屏门禁 -> 游戏模块 -> 首帧缓存 -> 隐藏装帧页”');
}

requireToken(preload, "'./assets/**/*.png'", '美术闸门没有覆盖运行时 PNG 目录');
requireToken(preload, "'./assets/**/*.webp'", '美术闸门没有覆盖运行时 WebP 目录');
requireToken(preload, "import artWeights from './art-loading-weights.json'", '进度条没有按 PNG 解码像素量加权');
requireToken(preload, "priority: ArtLoadPriority", '分阶段加载没有接入统一优先级');
requireToken(preload, 'preloadAllProductionArt', '没有暴露全部正式美术硬门禁');
requireToken(preload, "loadEntries(ART_ENTRIES, 'critical', 'all'", '全部正式美术没有在启动前使用关键队列解码');
requireToken(preload, "loadEntries(bootEntries, 'critical', 'boot'", '首屏与童年正式美术没有走关键解码队列');
requireToken(preload, "loadEntries(BACKGROUND_ENTRIES, 'background', 'background'", '后续正式美术没有走后台单通道队列');
requireToken(preload, 'function backgroundRank', '后台补装订没有按人生顺序排队（字母序会让暮年先装、少年最后到）');
requireToken(preload, "path.includes('/assets/rooms/')", '三间房没有进首屏门禁，童年章会画出程序化替代门');
requireToken(preload, 'STAGE_TOKENS', '没有按章节声明美术预热边界');
requireToken(preload, 'isBootArt', '没有单独声明首屏与童年关键美术');
requireToken(preload, 'warmProductionArtForStage', '没有暴露下一章美术预热入口');
requireToken(preload, 'throw new ProductionArtError', '美术失败仍可能放行游戏');
requireToken(runtime, "const image = new Image()", '统一美术运行时没有创建唯一图片对象');
// 并发数本身不是不变量——启动阶段没有帧要保护，压到三路只是白等。守的是
// 「进游戏后关键队列必须降档 + 后台永远单通道」。
requireToken(runtime, 'PLAY_CRITICAL_CONCURRENCY = 3', '进游戏后关键美术解码并发没有降回三路');
requireToken(runtime, 'BOOT_CRITICAL_CONCURRENCY', '启动阶段没有单独的解码并发档位');
requireToken(runtime, 'function criticalConcurrency', '关键队列并发没有按启动/战斗分档');
requireToken(runtime, 'export function endArtBootPhase', '没有提供退出启动档的入口');
requireToken(runtime, 'if (!bootPhase || occupiedDeferredLane) await nextPaint()', '启动阶段仍在逐张白等一帧');
requireToken(runtime, 'MAX_DEFERRED_CONCURRENCY = 1', '后台美术没有限制为单通道解码');
requireToken(runtime, 'pausedByGameplay && gameplayActive', '后台补装订没有在战斗中让路');
requireToken(runtime, "await task.image.decode()", '只等文件读取，没有等待图片完成解码');
requireToken(runtime, 'backgroundPausedUntil', '战斗掉帧时不会暂停非关键美术预热');
requireToken(runtime, 'let gameplayActive = false', '美术运行时没有记录战斗活动状态');
requireToken(runtime, 'recordArtPerformance(', '图片下载与解码没有进入本地性能监控');
requireToken(game, "setArtGameplayActive(this.state === 'battle'", '主循环没有在战斗移动期间冻结后台图片解码');
requireToken(game, 'reportArtFrameDuration(frameDuration)', '主循环没有向美术预热器反馈帧压力');
requireToken(game, 'warmProductionArtForStage(this.encounterIndex + 1)', '章节开始时没有提高下一章美术优先级');
requireToken(game, 'productionArtStageReady(nextStageIndex)', '章节过场结束前没有再次确认下一章正式美术');
requireToken(game, 'this.transitionTimer = 0.35', '低速解码时没有把玩家安全留在章节过场');

requireToken(html, 'data-art-progress', '装帧页没有进度条');
requireToken(html, '不使用降级动画', '装帧页没有明确不使用降级画面');
// 装帧页说的必须是实际执行的策略：等眼前这一页，后面后台补。
requireToken(html, '后面的人生在后台接着装', '装帧页没有说明后续章节是后台补装订');
// 音频硬闸门：人声/环境/配乐要在放人进去之前缓冲完（开场漫画现场解码就是「一进去很卡」的来源）。
requireToken(main, 'await game.warmupAudio(', '进场前没有等待音频预热');
requireToken(platformAudio, 'async warmup(', '平台音频实现缺少预热入口');
requireToken(style, '.loading-card', '装帧页缺少正式视觉样式');

function listRuntimeImages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listRuntimeImages(fullPath);
    return entry.isFile() && (entry.name.endsWith('.png') || entry.name.endsWith('.webp')) ? [fullPath] : [];
  });
}

const gatedAssets = listRuntimeImages('src/assets').filter((file) => (
  !path.basename(file).startsWith('preview-')
  && (
    !file.includes(path.join('src', 'assets', 'canonical-v1'))
    || file === path.join('src', 'assets', 'canonical-v1', 'enemies', 'uniform-answer.png')
    || file === path.join('src', 'assets', 'canonical-v1', 'enemies', 'hunger-shadow.png')
  )
));
checks += 1;
if (gatedAssets.length < 120) errors.push(`美术闸门覆盖数量异常：${gatedAssets.length}`);

const sourceFilesWithImageCreation = fs.readdirSync('src')
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => fs.readFileSync(path.join('src', file), 'utf8').includes('new Image()'));
checks += 1;
if (sourceFilesWithImageCreation.join(',') !== 'art-runtime.ts') {
  errors.push(`仍有模块绕过统一美术队列创建图片：${sourceFilesWithImageCreation.join(',')}`);
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  gatedAssets: gatedAssets.length,
  policy: 'boot art (title/dossier/hero/vfx/icons/rooms + chapter 0) must download and decode before the game starts; later chapters stream in life order on one background lane and are re-gated at each chapter transition; failure blocks instead of degrading',
  errors,
}, null, 2));
if (errors.length) process.exit(1);
