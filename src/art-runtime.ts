export type ArtLoadPriority = 'critical' | 'next' | 'background';

import { recordArtPerformance } from './performance-monitor';

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

/**
 * 关键队列的并发要分两档。
 *
 * 启动阶段屏幕上只有装帧页，没有帧要保护，压到三路纯粹是白等——首屏那批图能开多宽
 * 开多宽。进游戏之后每一路解码都在和战斗抢主线程，必须降回三路。
 */
const BOOT_CRITICAL_CONCURRENCY = 6;
const PLAY_CRITICAL_CONCURRENCY = 3;
/** 后台补装订永远单通道：它的任务是"别被察觉"，不是"快"。 */
const MAX_DEFERRED_CONCURRENCY = 1;

let bootPhase = true;
/** 标题页「资源预载」开关：全速装订后台资产，只在标题页生效（进战斗即关）。 */
let boostActive = false;

export function setArtBoost(active: boolean): void {
  if (boostActive === active) return;
  boostActive = active;
  if (active) pump();
}

function criticalConcurrency(): number {
  return bootPhase ? BOOT_CRITICAL_CONCURRENCY : PLAY_CRITICAL_CONCURRENCY;
}

/** 装帧页收起时调用：退出启动档，关键队列降回战斗并发，并让后台队列开始补。 */
export function endArtBootPhase(): void {
  if (!bootPhase) return;
  bootPhase = false;
  pump();
}

function normalizedArtUrl(url: string): string {
  return new URL(url, document.baseURI).href;
}

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
  // 非关键任务有两种让路理由：战斗正在进行，或刚刚测到长帧。
  const pausedByGameplay = task.priority < PRIORITY.critical;
  while (task.priority < PRIORITY.critical
    && ((pausedByGameplay && gameplayActive && !boostActive)
      || performance.now() < backgroundPausedUntil)) {
    // 预载加速时仍保留长帧退避（backgroundPausedUntil）：标题页本身不该有长帧，
    // 这层只是保险，不构成让路。
    await nextPaint();
  }
}

/**
 * 首绘预热。decode() 只保证解码完成，图片第一次真正 drawImage 时还要过一道
 * 栅格化/纹理上传——大图集一次几毫秒，落在章节开场、敌人首刷、Boss 变身的
 * 瞬间，就是玩家口中的「时不时卡一下」。这里在后台装订完成的当口就把这道
 * 成本付掉：往 8×8 离屏画一笔，强制走完整条绘制管线。
 */
let warmSurface: CanvasRenderingContext2D | null = null;
function warmRaster(image: HTMLImageElement): void {
  try {
    if (!warmSurface) {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      warmSurface = canvas.getContext('2d');
    }
    warmSurface?.drawImage(image, 0, 0, 8, 8);
  } catch { /* 预热失败无碍：首绘时再付一次成本，行为同从前 */ }
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
  const startedAt = performance.now();
  let decodeStartedAt = startedAt;
  try {
    await waitForBackgroundBudget(task);
    task.image.decoding = 'async';
    task.image.src = task.url;
    await waitForImage(task.image, task.url);
    decodeStartedAt = performance.now();
    if (typeof task.image.decode === 'function') await task.image.decode();
    if (task.image.naturalWidth <= 0 || task.image.naturalHeight <= 0) {
      throw new Error(`art_decode_failed:${task.url}`);
    }
    warmRaster(task.image);
    const completedAt = performance.now();
    recordArtPerformance(
      task.url,
      completedAt - startedAt,
      completedAt - decodeStartedAt,
      task.image.naturalWidth,
      task.image.naturalHeight,
    );
    const record = records.get(task.url);
    if (record) {
      record.loaded = true;
      record.task = undefined;
    }
    task.resolve(task.image);
  } catch (error) {
    recordArtPerformance(task.url, performance.now() - startedAt, 0, 0, 0, true);
    records.delete(task.url);
    task.reject(error instanceof Error ? error : new Error(`art_load_failed:${task.url}`));
  } finally {
    activeLoads = Math.max(0, activeLoads - 1);
    if (occupiedDeferredLane) {
      activeDeferredLoads = Math.max(0, activeDeferredLoads - 1);
    }
    // 让一帧是给战斗留呼吸口的。启动阶段没有战斗，逐张白等一帧等于把首屏时间
    // 乘上图片张数——首屏那批直接接着抽下一张，后台通道仍然逐张让。
    if (!bootPhase || occupiedDeferredLane) await nextPaint();
    pump();
  }
}

function pump(): void {
  queue.sort((a, b) => b.priority - a.priority);
  while (activeLoads < criticalConcurrency() && queue.length > 0) {
    const taskIndex = queue.findIndex((task) => (
      task.priority >= PRIORITY.critical
      || ((!gameplayActive || boostActive)
        && activeDeferredLoads < (boostActive ? PLAY_CRITICAL_CONCURRENCY : MAX_DEFERRED_CONCURRENCY))
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
  const normalizedUrl = normalizedArtUrl(url);
  const existing = records.get(normalizedUrl);
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
    url: normalizedUrl,
    priority: requestedPriority,
    image,
    resolve: resolveTask,
    reject: rejectTask,
  };
  records.set(normalizedUrl, { image, promise, task, loaded: false });
  queue.push(task);
  pump();
  return promise;
}

/**
 * 重做首绘预热。浏览器在内存吃紧时会**丢弃已栅格化的结果**（解码数据还在，
 * 但下一次 drawImage 要重新栅格化）——这正是「明明预载过了，玩到后面还是
 * 时不时卡一下」的机制。章节切换是重做的最佳时机：那一刻画面本来就在过场，
 * 而接下来 20 秒会密集用到这一章的图。只对已装订完成的资产做，不触发加载。
 */
export function rewarmArtRaster(urls: readonly string[]): void {
  for (const url of urls) {
    const record = records.get(normalizedArtUrl(url));
    if (record?.loaded) warmRaster(record.image);
  }
}

export function loadedArtImage(url: string): HTMLImageElement | null {
  const record = records.get(normalizedArtUrl(url));
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
