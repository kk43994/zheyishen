type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type StandaloneNavigator = Navigator & {
  standalone?: boolean;
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'portrait') => Promise<void>;
};

const MOBILE_QUERY = '(max-width: 768px) and (pointer: coarse)';
const MAX_MOBILE_FULLSCREEN_ATTEMPTS = 3;
let viewportUpdateFrame = 0;
let lastViewportHeight = -1;
let lastViewportWidth = -1;

function isMobileLayout(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function isAppleTouchDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandaloneDisplay(): boolean {
  return window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches
    || (navigator as StandaloneNavigator).standalone === true;
}

function fullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function updateViewportMetrics(): void {
  const viewport = window.visualViewport;
  const height = Math.round(viewport?.height ?? window.innerHeight);
  const width = Math.round(viewport?.width ?? window.innerWidth);
  // visualViewport.scroll 在部分 WebView 会跟手连续喷发；每次都写两条根 CSS 变量
  // 会触发整页样式/布局，并连带 ResizeObserver 反复重建高 DPR Canvas 背板。
  // 尺寸没变时不写，尺寸真在动画时也只在下一帧合并一次。
  if (height !== lastViewportHeight) {
    lastViewportHeight = height;
    document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
  }
  if (width !== lastViewportWidth) {
    lastViewportWidth = width;
    document.documentElement.style.setProperty('--app-viewport-width', `${width}px`);
  }
}

function scheduleViewportMetricsUpdate(): void {
  if (viewportUpdateFrame) return;
  viewportUpdateFrame = requestAnimationFrame(() => {
    viewportUpdateFrame = 0;
    updateViewportMetrics();
  });
}

function updateFullscreenDataset(): void {
  const root = document.documentElement;
  const nativeFullscreen = Boolean(fullscreenElement());
  const standalone = isStandaloneDisplay();
  root.dataset.mobileFullscreen = nativeFullscreen || standalone ? 'true' : 'viewport';
  root.dataset.iosBrowser = isAppleTouchDevice() && !standalone ? 'true' : 'false';
}

export function installMobileViewportAdaptation(): void {
  updateViewportMetrics();
  updateFullscreenDataset();
  window.addEventListener('resize', scheduleViewportMetricsUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleViewportMetricsUpdate, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleViewportMetricsUpdate, { passive: true });
  document.addEventListener('fullscreenchange', updateFullscreenDataset);
  document.addEventListener('webkitfullscreenchange', updateFullscreenDataset);
}

async function requestNativeFullscreen(): Promise<boolean> {
  const root = document.documentElement as FullscreenElement;
  const request = root.requestFullscreen
    ? () => root.requestFullscreen({ navigationUI: 'hide' })
    : root.webkitRequestFullscreen
      ? () => root.webkitRequestFullscreen?.()
      : null;
  if (!request) return false;
  try {
    await request();
    document.documentElement.dataset.mobileFullscreen = 'true';
    try {
      await (window.screen.orientation as LockableScreenOrientation).lock?.('portrait');
    } catch {
      // iOS and embedded WebViews may keep the host orientation policy.
    }
    return true;
  } catch {
    return false;
  }
}

function appendText(parent: HTMLElement, tag: 'strong' | 'p', text: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function showIOSFullscreenGuide(): void {
  if (document.getElementById('ios-fullscreen-guide')) return;
  const guide = document.createElement('section');
  guide.id = 'ios-fullscreen-guide';
  guide.setAttribute('role', 'dialog');
  guide.setAttribute('aria-modal', 'true');
  guide.setAttribute('aria-labelledby', 'ios-fullscreen-title');

  const card = document.createElement('div');
  card.className = 'ios-fullscreen-card';
  const title = appendText(card, 'strong', 'iPhone 全屏开启方法');
  title.id = 'ios-fullscreen-title';
  appendText(card, 'p', 'Safari 不允许网页按钮直接隐藏地址栏。请点浏览器底部“分享”，选择“添加到主屏幕”，再从桌面打开《这一身》。');
  appendText(card, 'p', '当前页面已经按可见区域铺满，关闭提示后也可以继续体验。');

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '知道了，继续';
  close.addEventListener('click', () => guide.remove(), { once: true });
  card.appendChild(close);
  guide.appendChild(card);
  document.body.appendChild(guide);
  close.focus();
}

export function fullscreenSettingLabel(): string {
  if (fullscreenElement() || isStandaloneDisplay()) return '已进入';
  if (isAppleTouchDevice()) return '主屏开启';
  return '进入';
}

export async function toggleImmersiveFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument;
  if (fullscreenElement()) {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await doc.webkitExitFullscreen?.();
    } catch {
      // Losing fullscreen is non-fatal in restrictive WebViews.
    }
    updateFullscreenDataset();
    return;
  }

  if (isStandaloneDisplay()) {
    updateFullscreenDataset();
    return;
  }

  if (await requestNativeFullscreen()) {
    updateFullscreenDataset();
    return;
  }

  updateViewportMetrics();
  updateFullscreenDataset();
  if (isAppleTouchDevice()) showIOSFullscreenGuide();
}

export function installMobileFullscreenIntent(): void {
  if (!isMobileLayout() || isStandaloneDisplay()) return;
  const root = document.documentElement as FullscreenElement;
  if (typeof root.requestFullscreen !== 'function'
    && typeof root.webkitRequestFullscreen !== 'function') {
    updateFullscreenDataset();
    return;
  }

  let requestInFlight = false;
  let attempts = 0;
  const stopListening = (): void => {
    document.removeEventListener('pointerdown', enterFullscreen, true);
  };
  const enterFullscreen = (): void => {
    if (fullscreenElement()) {
      stopListening();
      return;
    }
    if (requestInFlight || attempts >= MAX_MOBILE_FULLSCREEN_ATTEMPTS) return;
    requestInFlight = true;
    attempts += 1;
    void requestNativeFullscreen()
      .then((entered) => {
        if (entered || attempts >= MAX_MOBILE_FULLSCREEN_ATTEMPTS) stopListening();
      })
      .finally(() => {
        requestInFlight = false;
      });
  };
  document.addEventListener('pointerdown', enterFullscreen, true);
}
