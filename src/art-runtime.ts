export type ArtLoadPriority = 'critical' | 'next' | 'background';

interface ArtLoadTask {
  readonly url: string;
  priority: number;
  readonly image: HTMLImageElement;
  readonly resolve: (image: HTMLImageElement) => void;
  readonly reject: (error: Error) => void;
}

interface ArtRecord {
  readonly image: HTMLImageElement;
  readonly promise: Promise<HTMLImageElement>;
  task?: ArtLoadTask;
  loaded: boolean;
}

const PRIORITY: Record<ArtLoadPriority, number> = {
  critical: 300,
  next: 200,
  background: 100,
};

const records = new Map<string, ArtRecord>();
const queue: ArtLoadTask[] = [];
let activeLoads = 0;
let activeDeferredLoads = 0;
let backgroundPausedUntil = 0;
let gameplayActive = false;

const MAX_CRITICAL_CONCURRENCY = 3;
const MAX_DEFERRED_CONCURRENCY = 1;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (document.visibilityState === 'hidden') {
      window.setTimeout(resolve, 16);
      return;
    }
    requestAnimationFrame(() => resolve());
  });
}

async function waitForBackgroundBudget(task: ArtLoadTask): Promise<void> {
  if (task.priority >= PRIORITY.critical) return;
  while (task.priority < PRIORITY.critical
    && (gameplayActive || performance.now() < backgroundPausedUntil)) {
    await nextPaint();
  }
}

function waitForImage(image: HTMLImageElement, url: string): Promise<void> {
  if (image.complete) {
    return image.naturalWidth > 0
      ? Promise.resolve()
      : Promise.reject(new Error(`art_load_failed:${url}`));
  }
  return new Promise((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error(`art_load_failed:${url}`)), { once: true });
  });
}

async function runTask(task: ArtLoadTask): Promise<void> {
  const occupiedDeferredLane = task.priority < PRIORITY.critical;
  try {
    await waitForBackgroundBudget(task);
    task.image.decoding = 'async';
    task.image.src = task.url;
    await waitForImage(task.image, task.url);
    if (typeof task.image.decode === 'function') await task.image.decode();
    if (task.image.naturalWidth <= 0 || task.image.naturalHeight <= 0) {
      throw new Error(`art_decode_failed:${task.url}`);
    }
    const record = records.get(task.url);
    if (record) {
      record.loaded = true;
      record.task = undefined;
    }
    task.resolve(task.image);
  } catch (error) {
    records.delete(task.url);
    task.reject(error instanceof Error ? error : new Error(`art_load_failed:${task.url}`));
  } finally {
    activeLoads = Math.max(0, activeLoads - 1);
    if (occupiedDeferredLane) {
      activeDeferredLoads = Math.max(0, activeDeferredLoads - 1);
    }
    await nextPaint();
    pump();
  }
}

function pump(): void {
  queue.sort((a, b) => b.priority - a.priority);
  while (activeLoads < MAX_CRITICAL_CONCURRENCY && queue.length > 0) {
    const taskIndex = queue.findIndex((task) => (
      task.priority >= PRIORITY.critical
      || (!gameplayActive && activeDeferredLoads < MAX_DEFERRED_CONCURRENCY)
    ));
    if (taskIndex < 0) return;
    const task = queue[taskIndex]!;
    queue.splice(taskIndex, 1);
    activeLoads += 1;
    if (task.priority < PRIORITY.critical) activeDeferredLoads += 1;
    void runTask(task);
  }
}

export function loadArtImage(
  url: string,
  priority: ArtLoadPriority = 'background',
): Promise<HTMLImageElement> {
  const existing = records.get(url);
  const requestedPriority = PRIORITY[priority];
  if (existing) {
    if (existing.task && requestedPriority > existing.task.priority) {
      existing.task.priority = requestedPriority;
      pump();
    }
    return existing.promise;
  }

  const image = new Image();
  let resolveTask!: (image: HTMLImageElement) => void;
  let rejectTask!: (error: Error) => void;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });
  const task: ArtLoadTask = {
    url,
    priority: requestedPriority,
    image,
    resolve: resolveTask,
    reject: rejectTask,
  };
  records.set(url, { image, promise, task, loaded: false });
  queue.push(task);
  pump();
  return promise;
}

export function loadedArtImage(url: string): HTMLImageElement | null {
  const record = records.get(url);
  return record?.loaded ? record.image : null;
}

/**
 * 战斗掉帧时让非关键美术预热短暂停手。只影响后台解码调度，不改变画面、
 * 动画或模拟步数。
 */
export function reportArtFrameDuration(frameDurationMs: number): void {
  if (!Number.isFinite(frameDurationMs) || frameDurationMs <= 20) return;
  backgroundPausedUntil = Math.max(backgroundPausedUntil, performance.now() + 420);
}

/**
 * 战斗移动期间不启动任何非关键图片解码。退出战斗、打开档案或进入章节过场后，
 * 单通道继续预热；关键资源仍可抢占队列，不牺牲画质或章节完整性。
 */
export function setArtGameplayActive(active: boolean): void {
  if (gameplayActive === active) return;
  gameplayActive = active;
  if (!active) pump();
}

export function artRuntimeSnapshot(): {
  loaded: number;
  queued: number;
  active: number;
  deferredActive: number;
  gameplayActive: boolean;
} {
  let loaded = 0;
  records.forEach((record) => {
    if (record.loaded) loaded += 1;
  });
  return {
    loaded,
    queued: queue.length,
    active: activeLoads,
    deferredActive: activeDeferredLoads,
    gameplayActive,
  };
}
