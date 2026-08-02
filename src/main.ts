import './style.css';
import {
  preloadProductionArt,
  preloadRemainingProductionArt,
  ProductionArtError,
  productionArtCount,
  productionBootArtCount,
  type ArtProgress,
} from './art-preload';
import { endArtBootPhase } from './art-runtime';
import { installPerformanceMonitor, markPerformance } from './performance-monitor';
import { installMobileFullscreenIntent, installMobileViewportAdaptation } from './mobile-platform';

function loadingElement(): HTMLElement | null {
  return document.getElementById('loading');
}

function updateArtProgress(progress: ArtProgress): void {
  const loading = loadingElement();
  if (!loading) return;
  const bar = loading.querySelector<HTMLElement>('[data-art-progress]');
  const detail = loading.querySelector<HTMLElement>('[data-art-detail]');
  // 全部六章正式美术占可见装帧流程的 8%–88%；游戏模块和首帧缓存完成
  // 后再走到 100%。进度按 PNG 解码像素量加权，不被大量小图制造假快感。
  const displayed = 8 + Math.round(progress.percent * 0.8);
  if (bar) bar.style.width = `${displayed}%`;
  if (detail) detail.textContent = `${progress.label} · ${displayed}%`;
}

function updateInitProgress(percent: number, label: string): void {
  const loading = loadingElement();
  if (!loading) return;
  const bar = loading.querySelector<HTMLElement>('[data-art-progress]');
  const detail = loading.querySelector<HTMLElement>('[data-art-detail]');
  if (bar) bar.style.width = `${percent}%`;
  if (detail) detail.textContent = `${label} · ${percent}%`;
}

function showFallback(message: string): void {
  const loading = loadingElement();
  if (!loading) return;
  loading.hidden = false;
  loading.setAttribute('role', 'alert');
  loading.dataset.error = 'true';
  const copy = document.createElement('p');
  copy.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '重新翻开档案';
  retry.addEventListener('click', () => window.location.reload());
  loading.replaceChildren(copy, retry);
  retry.focus();
}

// 全屏兜底只属于预载阶段；游戏跑起来之后，普通逻辑异常不应被伪装成
// "资源校验失败"并盖掉整局（frame 循环里另有 try/catch 自愈）。
let gameStarted = false;
export function markGameStarted(): void {
  gameStarted = true;
}
window.addEventListener('error', (event) => {
  if (gameStarted) {
    console.error('[runtime]', event.error ?? event.message);
    return;
  }
  showFallback('美术或运行资源校验失败。程序化降级动画已取消，请重新装订。');
});
window.addEventListener('unhandledrejection', (event) => {
  if (gameStarted) {
    console.error('[runtime:promise]', event.reason);
    return;
  }
  showFallback('美术或运行资源校验失败。程序化降级动画已取消，请重新装订。');
});

installMobileViewportAdaptation();
installMobileFullscreenIntent();
installPerformanceMonitor();
markPerformance('bootstrap_started');

async function init(): Promise<void> {
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('缺少 Canvas 入口');
  // 游戏逻辑块与首屏图片来自同一个本地包，提前并行准备能避免扫码容器
  // 先等完图片、再串行解析 800KB+ 游戏模块。正式画面仍要等关键图片门禁。
  const gameModulePromise = import('./game');
  markPerformance('game_module_requested');
  markPerformance('boot_art_started', {
    boot: productionBootArtCount(),
    total: productionArtCount(),
  });
  // 只门禁「眼前这一页」：首屏 UI、主角、特效、图标、三间房，加童年一章。
  // 六章一次性等完是 149 张 / 4.2MB，把全部代价堆在第一屏，互动空间里玩家
  // 根本进不去。后续章节在装帧页收起之后走后台单通道按人生顺序补，每章开打前
  // 还有 productionArtStageReady 复核——永不降级，缺图就把玩家留在章节过场。
  await preloadProductionArt(updateArtProgress);
  markPerformance('boot_art_ready', { files: productionBootArtCount() });
  if (import.meta.env.DEV) {
    const auditParams = new URLSearchParams(window.location.search);
    if (auditParams.get('audit-art-fail') === '1') throw new ProductionArtError(1);
    const auditDelay = Number.parseInt(auditParams.get('audit-art-delay') ?? '0', 10);
    if (Number.isFinite(auditDelay) && auditDelay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(auditDelay, 10000)));
    }
  }
  updateInitProgress(88, '唤醒这一身');
  const { ZheYiShenGame } = await gameModulePromise;
  markPerformance('game_module_ready');
  const game = new ZheYiShenGame(canvas);
  markGameStarted();
  markPerformance('game_constructed');
  // 音频也要有硬闸门。美术早就在进场前全部装订完，人声却一直是「用到才加载」——
  // 开场漫画一边打字机推进、一边现场读包解码八句旁白，第一次进去就是卡，
  // 等它自己缓存完才顺。这里把开局那一段的人声/环境/配乐等到就绪再放人进去。
  updateInitProgress(90, '人声与配乐正在载入');
  await game.warmupAudio((done, total) => {
    updateInitProgress(90 + Math.round((done / Math.max(1, total)) * 7), `人声与配乐 ${done}/${total}`);
  });
  markPerformance('audio_ready');
  updateInitProgress(97, '准备第一口呼吸');
  // 游戏模块内的图集实例复用统一解码注册表；保留两帧给首轮 Canvas 缓存，
  // 确保童年正式美术已经接管画面。
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  markPerformance('first_frames_ready');
  updateInitProgress(100, '眼前这一页已装订');
  const loading = loadingElement();
  if (loading) loading.hidden = true;
  markPerformance('interactive_ready');
  // 装帧页收起之后才退出启动档：关键队列从启动并发降回战斗的三路，
  // 之后每一路解码都要和战斗抢主线程。
  endArtBootPhase();
  // 后续章节从这里开始后台补，单通道、按人生顺序、战斗中让路。
  // 必须排在门禁与装帧页之后——提前开就是和首屏抢同一条解码通道。
  void preloadRemainingProductionArt()
    .then(() => {
      markPerformance('background_art_done');
      // 美术补完、玩家还停在标题页：音频温启动自动接棒，不再指望玩家去点
      // 右上角那颗按钮。进了局它自己让路（startRun 里 stopAudioWarm）。
      game.autoStartAudioWarm();
    })
    .catch((error: unknown) => {
      // 后台补装订失败不该盖掉正在玩的一局；真正的硬闸门在每章开打前。
      console.error('后续章节美术后台装订失败；章节过场处的门禁会拦住玩家。', error);
    });
  markPerformance('background_art_started');
}

init().catch((error: unknown) => {
  console.error(error);
  markPerformance('bootstrap_failed', {
    message: error instanceof Error ? error.message : 'unknown',
  });
  showFallback(error instanceof ProductionArtError
    ? `有 ${error.failedCount} 份美术原件没有通过校验。程序化降级动画已取消，请重新装订。`
    : '这一生出了点意外。程序化降级动画已取消，请重新装订。');
});
