import { readAudioProbe } from './audio-probe';
import { sfxEngineState } from './audio-platform';
const PERFORMANCE_STORAGE_KEY = 'zys-performance-v1';
const PERFORMANCE_PANEL_KEY = 'zys-performance-panel-v1';
const REPORT_LIMIT = 4;
const FRAME_LIMIT = 600;

type Scalar = string | number | boolean;

interface PerformanceMemory {
  readonly usedJSHeapSize: number;
  readonly totalJSHeapSize: number;
  readonly jsHeapSizeLimit: number;
}

interface RuntimePerformance extends Performance {
  readonly memory?: PerformanceMemory;
}

interface RuntimeNavigator extends Navigator {
  readonly deviceMemory?: number;
}

interface PerformanceMilestone {
  readonly name: string;
  readonly atMs: number;
  readonly fields: Record<string, Scalar>;
}

interface SlowAsset {
  readonly name: string;
  readonly totalMs: number;
  readonly decodeMs: number;
  readonly pixels: number;
}

interface PerformanceReport {
  version: 1;
  sessionId: string;
  startedAt: number;
  device: {
    viewport: string;
    dpr: number;
    cores: number;
    memoryGB?: number;
    userAgent: string;
  };
  milestones: PerformanceMilestone[];
  assets: {
    loaded: number;
    failed: number;
    totalMs: number;
    decodeMs: number;
    pixels: number;
    slowest: SlowAsset[];
  };
  frames: {
    samples: number;
    fps: number;
    p95Ms: number;
    worstMs: number;
    over33Ms: number;
    over50Ms: number;
    state: string;
  };
  longTasks: {
    count: number;
    totalMs: number;
    worstMs: number;
  };
  memory?: {
    usedMB: number;
    totalMB: number;
    limitMB: number;
  };
  updatedAt: number;
}

const sessionStartedAt = performance.now();
const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const frameDurations: number[] = [];
let lastFrameState = 'boot';
let lastPersistAt = 0;
let panel: HTMLElement | null = null;
let panelBody: HTMLElement | null = null;
let panelTimer = 0;
let panelShowingJson = false;
let cornerTapCount = 0;
let cornerTapStartedAt = 0;

const report: PerformanceReport = {
  version: 1,
  sessionId,
  startedAt: Date.now(),
  device: {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: Number((window.devicePixelRatio || 1).toFixed(2)),
    cores: navigator.hardwareConcurrency || 0,
    memoryGB: (navigator as RuntimeNavigator).deviceMemory,
    userAgent: navigator.userAgent.slice(0, 180),
  },
  milestones: [],
  assets: {
    loaded: 0,
    failed: 0,
    totalMs: 0,
    decodeMs: 0,
    pixels: 0,
    slowest: [],
  },
  frames: {
    samples: 0,
    fps: 0,
    p95Ms: 0,
    worstMs: 0,
    over33Ms: 0,
    over50Ms: 0,
    state: 'boot',
  },
  longTasks: {
    count: 0,
    totalMs: 0,
    worstMs: 0,
  },
  updatedAt: Date.now(),
};

function rounded(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function safeFields(
  fields: Record<string, Scalar | null | undefined>,
): Record<string, Scalar> {
  const result: Record<string, Scalar> = {};
  Object.entries(fields).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') result[key.slice(0, 40)] = value.slice(0, 100);
    else if (typeof value === 'number' && Number.isFinite(value)) result[key.slice(0, 40)] = rounded(value);
    else if (typeof value === 'boolean') result[key.slice(0, 40)] = value;
  });
  return result;
}

function readStoredReports(): PerformanceReport[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(PERFORMANCE_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.slice(-REPORT_LIMIT) as PerformanceReport[] : [];
  } catch {
    return [];
  }
}

function refreshFrameSummary(): void {
  if (frameDurations.length === 0) return;
  const sorted = [...frameDurations].sort((a, b) => a - b);
  const total = frameDurations.reduce((sum, duration) => sum + duration, 0);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  report.frames = {
    samples: frameDurations.length,
    fps: rounded(total > 0 ? (frameDurations.length * 1000) / total : 0),
    p95Ms: rounded(sorted[p95Index] ?? 0),
    worstMs: rounded(sorted[sorted.length - 1] ?? 0),
    over33Ms: frameDurations.filter((duration) => duration > 33.34).length,
    over50Ms: frameDurations.filter((duration) => duration > 50).length,
    state: lastFrameState,
  };
}

function refreshMemory(): void {
  const memory = (performance as RuntimePerformance).memory;
  if (!memory) return;
  report.memory = {
    usedMB: rounded(memory.usedJSHeapSize / 1048576),
    totalMB: rounded(memory.totalJSHeapSize / 1048576),
    limitMB: rounded(memory.jsHeapSizeLimit / 1048576),
  };
}

function persist(force = false): void {
  const now = performance.now();
  if (!force && now - lastPersistAt < 4000) return;
  lastPersistAt = now;
  refreshFrameSummary();
  refreshMemory();
  report.updatedAt = Date.now();
  try {
    const previous = readStoredReports().filter((entry) => entry.sessionId !== sessionId);
    window.localStorage.setItem(
      PERFORMANCE_STORAGE_KEY,
      JSON.stringify([...previous, report].slice(-REPORT_LIMIT)),
    );
  } catch {
    // 监控只写本地；存储不可用时不能影响游戏。
  }
}

export function markPerformance(
  name: string,
  fields: Record<string, Scalar | null | undefined> = {},
): void {
  report.milestones.push({
    name: name.slice(0, 56),
    atMs: rounded(performance.now() - sessionStartedAt),
    fields: safeFields(fields),
  });
  report.milestones = report.milestones.slice(-48);
  persist(true);
}

export function recordArtPerformance(
  url: string,
  totalMs: number,
  decodeMs: number,
  width: number,
  height: number,
  failed = false,
): void {
  const pixels = Math.max(0, width) * Math.max(0, height);
  if (failed) report.assets.failed += 1;
  else {
    report.assets.loaded += 1;
    report.assets.pixels += pixels;
  }
  report.assets.totalMs += Math.max(0, totalMs);
  report.assets.decodeMs += Math.max(0, decodeMs);
  const cleanUrl = url.split('?')[0] ?? url;
  const name = decodeURIComponent(cleanUrl.split('/').pop() ?? 'unknown').slice(0, 72);
  report.assets.slowest.push({
    name,
    totalMs: rounded(totalMs),
    decodeMs: rounded(decodeMs),
    pixels,
  });
  report.assets.slowest.sort((a, b) => b.totalMs - a.totalMs);
  report.assets.slowest = report.assets.slowest.slice(0, 8);
  persist();
}

export function recordFramePerformance(durationMs: number, state: string): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  frameDurations.push(Math.min(2000, durationMs));
  if (frameDurations.length > FRAME_LIMIT) frameDurations.shift();
  lastFrameState = state.slice(0, 32);
  // 这里刻意不落盘。persist() 要排序 600 个帧样本、JSON.parse 读回历史、再
  // JSON.stringify 整份报告同步写 localStorage；哪怕有 4 秒节流，也等于测帧率
  // 的模块自己每 4 秒造一个长帧。改由里程碑、切后台和 pagehide 落盘。
}

function performanceText(): string {
  refreshFrameSummary();
  refreshMemory();
  const milestones = report.milestones.slice(-12)
    .map((entry) => `${entry.atMs.toFixed(0).padStart(5)}ms  ${entry.name}`)
    .join('\n');
  const slowest = report.assets.slowest.slice(0, 5)
    .map((asset) => `${asset.totalMs.toFixed(0).padStart(4)}ms  ${asset.name}`)
    .join('\n');
  const audio = readAudioProbe(performance.now());
  const memory = report.memory
    ? `${report.memory.usedMB}/${report.memory.totalMB} MB（上限 ${report.memory.limitMB} MB）`
    : '当前宿主不开放 JS 堆内存';
  return [
    `会话 ${report.sessionId}`,
    `设备 ${report.device.viewport} · DPR ${report.device.dpr} · ${report.device.cores || '?'} 核 · ${report.device.memoryGB ?? '?'} GB`,
    '',
    `帧率 ${report.frames.fps} FPS · P95 ${report.frames.p95Ms}ms · 最慢 ${report.frames.worstMs}ms`,
    `长帧 >33ms ${report.frames.over33Ms} · >50ms ${report.frames.over50Ms} · 当前 ${report.frames.state}`,
    `主线程长任务 ${report.longTasks.count} 次 / ${rounded(report.longTasks.totalMs)}ms · 最慢 ${rounded(report.longTasks.worstMs)}ms`,
    `图片 ${report.assets.loaded} 成功 / ${report.assets.failed} 失败 · 解码像素 ${rounded(report.assets.pixels / 1e6)}MP`,
    `图片队列累计 ${rounded(report.assets.totalMs)}ms · 其中 decode ${rounded(report.assets.decodeMs)}ms`,
    // 媒体解码/起播/seek 不计入主线程长任务，真机上出现过「长任务 0 次」却只有 25.6 FPS，
    // 光看上面那一行永远发现不了音频问题，所以单独列一行。
    `音频 元素 ${audio.elements} 个 · 在播 ${audio.playing} · 起播 ${audio.playsPerSecond.toFixed(1)}/s · seek ${audio.seeksPerSecond.toFixed(1)}/s`,
    `音频 累计起播 ${audio.playCalls} · 累计seek ${audio.seeks} · 静音跳过 ${audio.skippedMuted}`,
    `音效引擎 ${sfxEngineState()}`,
    `JS 内存 ${memory}`,
    '',
    '最近启动节点',
    milestones || '尚无节点',
    '',
    '最慢图片',
    slowest || '尚无图片记录',
  ].join('\n');
}

function setPanelVisible(visible: boolean): void {
  if (!panel) return;
  panel.hidden = !visible;
  try {
    window.localStorage.setItem(PERFORMANCE_PANEL_KEY, visible ? '1' : '0');
  } catch {
    // ignore
  }
  if (visible) {
    if (panelBody) panelBody.textContent = panelShowingJson
      ? JSON.stringify(report, null, 2)
      : performanceText();
    window.clearInterval(panelTimer);
    panelTimer = window.setInterval(() => {
      if (panelBody) panelBody.textContent = panelShowingJson
        ? JSON.stringify(report, null, 2)
        : performanceText();
    }, 1000);
  } else {
    window.clearInterval(panelTimer);
  }
}

function installPanel(): void {
  const style = document.createElement('style');
  style.textContent = `
    #zys-performance-panel{position:fixed;inset:calc(env(safe-area-inset-top) + 8px) 8px auto 8px;z-index:2147483646;max-height:82vh;overflow:auto;background:rgba(8,9,13,.96);border:1px solid #7d394a;color:#e8e0d3;padding:10px;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 8px 30px #000}
    #zys-performance-panel[hidden]{display:none}
    #zys-performance-panel header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    #zys-performance-panel strong{font:700 13px/1.2 system-ui,sans-serif;margin-right:auto}
    #zys-performance-panel button{border:1px solid #69525a;background:#211a20;color:#eee3d7;padding:5px 8px;border-radius:2px}
    #zys-performance-panel pre{margin:0;white-space:pre-wrap;word-break:break-word}
  `;
  document.head.appendChild(style);
  panel = document.createElement('section');
  panel.id = 'zys-performance-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', '开发者性能监控');
  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = '性能物证 · 仅本机';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '查看 JSON';
  copy.addEventListener('click', () => {
    panelShowingJson = !panelShowingJson;
    copy.textContent = panelShowingJson ? '查看摘要' : '查看 JSON';
    if (panelBody) panelBody.textContent = panelShowingJson
      ? JSON.stringify(report, null, 2)
      : performanceText();
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '关闭';
  close.addEventListener('click', () => setPanelVisible(false));
  panelBody = document.createElement('pre');
  header.append(title, copy, close);
  panel.append(header, panelBody);
  document.body.appendChild(panel);

  const params = new URLSearchParams(window.location.search);
  let initiallyVisible = params.get('perf') === '1';
  if (params.get('perf') === '0') {
    try {
      window.localStorage.removeItem(PERFORMANCE_PANEL_KEY);
    } catch {
      // ignore
    }
  } else if (!initiallyVisible) {
    try {
      initiallyVisible = window.localStorage.getItem(PERFORMANCE_PANEL_KEY) === '1';
    } catch {
      // ignore
    }
  }
  setPanelVisible(initiallyVisible);
}

export function installPerformanceMonitor(): void {
  installPanel();
  window.addEventListener('pointerup', (event) => {
    if (event.clientX > 56 || event.clientY > 56) {
      cornerTapCount = 0;
      return;
    }
    const now = performance.now();
    if (now - cornerTapStartedAt > 3000) {
      cornerTapStartedAt = now;
      cornerTapCount = 0;
    }
    cornerTapCount += 1;
    if (cornerTapCount >= 6) {
      cornerTapCount = 0;
      setPanelVisible(panel?.hidden ?? true);
    }
  }, true);
  window.addEventListener('pagehide', () => persist(true));
  // 帧采样不再每帧落盘，改在切后台时补一次，保证被杀进程前数据已经写下。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist(true);
  });
  window.addEventListener('resize', () => {
    report.device.viewport = `${window.innerWidth}x${window.innerHeight}`;
    persist();
  });

  try {
    if (typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          report.longTasks.count += 1;
          report.longTasks.totalMs += entry.duration;
          report.longTasks.worstMs = Math.max(report.longTasks.worstMs, entry.duration);
        });
        persist();
      });
      observer.observe({ entryTypes: ['longtask'] });
    }
  } catch {
    // 部分抖音 WebView 不开放 longtask，帧采样仍可用。
  }
  markPerformance('monitor_installed');
}

export function currentPerformanceReport(): PerformanceReport {
  refreshFrameSummary();
  refreshMemory();
  return JSON.parse(JSON.stringify(report)) as PerformanceReport;
}
