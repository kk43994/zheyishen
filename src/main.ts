import './style.css';
import {
  preloadAllProductionArt,
  ProductionArtError,
  type ArtProgress,
} from './art-preload';

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'portrait') => Promise<void>;
};

function installMobileFullscreenIntent(): void {
  const mobileQuery = window.matchMedia('(max-width: 768px) and (pointer: coarse)');
  const root = document.documentElement;
  if (!mobileQuery.matches || typeof root.requestFullscreen !== 'function') return;

  let requestInFlight = false;
  const enterFullscreen = (): void => {
    if (document.fullscreenElement) {
      document.removeEventListener('pointerdown', enterFullscreen, true);
      return;
    }
    if (requestInFlight) return;
    requestInFlight = true;
    // Browsers only permit fullscreen from a real user gesture. Register in the
    // capture phase before art loading so the player's first touch can become
    // the fullscreen gesture without delaying or consuming game input.
    void root.requestFullscreen({ navigationUI: 'hide' })
      .then(async () => {
        root.dataset.mobileFullscreen = 'true';
        document.removeEventListener('pointerdown', enterFullscreen, true);
        try {
          await (window.screen.orientation as LockableScreenOrientation).lock?.('portrait');
        } catch {
          // iOS and some Android WebViews keep the current orientation policy.
        }
      })
      .catch(() => {
        // Keep listening: embedded browsers may reject the first gesture while
        // their own chrome is still settling, but allow a later game touch.
      })
      .finally(() => {
        requestInFlight = false;
      });
  };

  document.addEventListener('pointerdown', enterFullscreen, true);
}

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
  showFallback('美术或运行资源校验失败，没有进入降级画面。请重新装订。');
});
window.addEventListener('unhandledrejection', (event) => {
  if (gameStarted) {
    console.error('[runtime:promise]', event.reason);
    return;
  }
  showFallback('美术或运行资源校验失败，没有进入降级画面。请重新装订。');
});

installMobileFullscreenIntent();

async function init(): Promise<void> {
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('缺少 Canvas 入口');
  await preloadAllProductionArt(updateArtProgress);
  if (import.meta.env.DEV) {
    const auditParams = new URLSearchParams(window.location.search);
    if (auditParams.get('audit-art-fail') === '1') throw new ProductionArtError(1);
    const auditDelay = Number.parseInt(auditParams.get('audit-art-delay') ?? '0', 10);
    if (Number.isFinite(auditDelay) && auditDelay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(auditDelay, 10000)));
    }
  }
  updateInitProgress(92, '唤醒这一身');
  const { ZheYiShenGame } = await import('./game');
  new ZheYiShenGame(canvas);
  markGameStarted();
  updateInitProgress(97, '准备第一口呼吸');
  // 游戏模块内的图集实例复用统一解码注册表；保留两帧给首轮 Canvas 缓存，
  // 确保童年正式美术已经接管画面。
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  updateInitProgress(100, '眼前这一页已装订');
  const loading = loadingElement();
  if (loading) loading.hidden = true;
}

init().catch((error: unknown) => {
  console.error(error);
  showFallback(error instanceof ProductionArtError
    ? `有 ${error.failedCount} 份美术原件没有通过校验。正式画面不会降级，请重新装订。`
    : '这一生出了点意外，正式画面不会降级，请重新装订。');
});
