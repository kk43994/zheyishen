import artWeights from './art-loading-weights.json';
import { loadArtImage, rewarmArtRaster, type ArtLoadPriority } from './art-runtime';

export type ArtProgressPhase = 'boot' | 'background' | 'all';

export type ArtProgress = {
  loaded: number;
  total: number;
  percent: number;
  phase: ArtProgressPhase;
  label: string;
};

type ArtProgressListener = (progress: ArtProgress) => void;

interface ArtEntry {
  readonly path: string;
  readonly url: string;
  readonly weight: number;
}

// 制作审阅图和未被运行时引用的 canonical 重复源不进入正式包。两张仍被
// EnemyPixelAtlas 使用的 canonical 图显式纳入，避免依赖通配符误装整套旧资源。
const regularArtModules = import.meta.glob<string>([
  './assets/**/*.png',
  './assets/**/*.webp',
  '!./assets/**/preview-*.png',
  '!./assets/canonical-v1/**/*.png',
], {
  eager: true,
  query: '?url',
  import: 'default',
});
const canonicalRuntimeModules = import.meta.glob<string>([
  './assets/canonical-v1/enemies/uniform-answer.png',
  './assets/canonical-v1/enemies/hunger-shadow.png',
], {
  eager: true,
  query: '?url',
  import: 'default',
});
// 当铺商人是首章就可能绘制的正式角色，但历史上存放在 Image2 产出目录，未被
// ./assets/** 清单覆盖；把它显式接进同一硬闸门，不能再靠模块导入时顺便排队。
const externalRuntimeModules = import.meta.glob<string>([
  '../output/imagegen/zhe-yi-shen-special-threshold-corrections-v1/processed/merchant-32x64.png',
], {
  eager: true,
  query: '?url',
  import: 'default',
});

const artModules = { ...regularArtModules, ...canonicalRuntimeModules, ...externalRuntimeModules };
const weightMap = artWeights as Record<string, number>;
const ART_ENTRIES: readonly ArtEntry[] = Object.entries(artModules)
  .map(([path, url]) => ({ path, url, weight: Math.max(1, weightMap[path] ?? 1) }))
  .sort((a, b) => a.path.localeCompare(b.path));

const STAGE_TOKENS: readonly (readonly string[])[] = [
  [
    '/world/stage-floor-0.png',
    '/enemies/cry-moth.png',
    '/enemies/fear.png',
    '/canonical-v1/enemies/hunger-shadow.png',
    '/enemies/coat-rack.png',
    '/enemies/closet-dark-hd.png',
    '/boss-skills-v1/coat-rack-skills.png',
    '/boss-skills-v1/closet-dark-skills.png',
    '/boss-skills-v1/closet-dark-extra-skills.png',
  ],
  [
    '/world/stage-floor-1.png',
    '/enemies/red-mark.png',
    '/enemies/whisper.png',
    '/enemies/others-paper.png',
    '/enemies/sign-here.png',
    '/enemies/uniform-answer-hd.png',
    '/canonical-v1/enemies/uniform-answer.png',
    '/enemies/silent-father-hd.png',
    '/enemies/silent-father-p2-hd.png',
    '/boss-skills-v1/uniform-answer-skills.png',
    '/boss-skills-v1/silent-father-p1-skills.png',
    '/boss-skills-v1/silent-father-p2-skills.png',
    '/boss-skills-v2/father-charge-8f.png',
  ],
  [
    '/world/stage-floor-2.png',
    '/characters/xiao-zhang.png',
    '/enemies/id-scanner.png',
    '/enemies/last-bus-hd.png',
    '/enemies/task-simple.png',
    '/enemies/task-revise.png',
    '/enemies/task-deadline.png',
    '/enemies/task-sync.png',
    '/enemies/praise-chair-p1.png',
    '/enemies/praise-chair-p2.png',
    '/boss-skills-v1/last-bus-skills.png',
    '/boss-skills-v1/praise-chair-p1-skills.png',
    '/boss-skills-v1/praise-chair-p2-skills.png',
    '/boss-skills-v2/praise-slam-8f.png',
    '/boss-skills-v2/praise-p2-paper-8f.png',
    '/boss-skills-v2/praise-p2-optimize-8f.png',
    '/boss-skills-v2/praise-p2-dismiss-8f.png',
    '/boss-skills-v2/praise-p2-one-seat-8f.png',
    '/boss-skills-v2/bus-depart-8f.png',
  ],
  [
    '/world/stage-floor-3.png',
    '/enemies/missed-call.png',
    '/enemies/debt.png',
    '/enemies/silence.png',
    '/enemies/desk-lamp.png',
    '/enemies/reheated-pot.png',
    '/enemies/wet-shoes.png',
    '/enemies/ringing-phone-p1.png',
    '/enemies/ringing-phone-p2.png',
    '/boss-skills-v1/wet-shoes-skills.png',
    '/boss-skills-v1/ringing-phone-p1-skills.png',
    '/boss-skills-v1/ringing-phone-p2-skills.png',
  ],
  [
    '/world/stage-floor-4.png',
    '/enemies/debt.png',
    '/enemies/badge-thief.png',
    '/enemies/whisper.png',
    '/enemies/meeting-door.png',
    '/enemies/checkup-report.png',
    '/enemies/whose-box.png',
    '/enemies/debt-collector-hd.png',
    '/boss-skills-v1/whose-box-skills.png',
    '/boss-skills-v1/debt-collector-skills.png',
  ],
  [
    '/world/stage-floor-5.png',
    '/ui/ending-lampman.png',
    '/enemies/debt.png',
    '/enemies/forgetter.png',
    '/enemies/empty-chair.png',
    '/enemies/queue-screen.png',
    '/enemies/others-family.png',
    '/enemies/iv-stand.png',
    '/enemies/revolving-lantern.png',
    '/enemies/lamp-keeper-hd.png',
    '/boss-skills-v1/revolving-lantern-skills.png',
    '/boss-skills-v1/lamp-keeper-skills.png',
    '/boss-skills-v2/keeper-strip-8f.png',
  ],
] as const;

const completedPaths = new Set<string>();
let bootCompleted = false;
let backgroundPromise: Promise<void> | null = null;

export class ProductionArtError extends Error {
  constructor(readonly failedCount: number) {
    super(`production_art_failed:${failedCount}`);
    this.name = 'ProductionArtError';
  }
}

function belongsToStage(path: string, stageIndex: number): boolean {
  return (STAGE_TOKENS[stageIndex] ?? []).some((token) => path.endsWith(token));
}

function isBootArt(entry: ArtEntry): boolean {
  const path = entry.path;
  // 组合奥义有文本兜底且图集较大；胜利定格由暮年章硬闸门负责。其余 UI 中，
  // 章节题图可能在首章结束立刻绘制、物证桌可能在首章战败立刻绘制、命运头像
  // 体积仅 4KB 且绘制缺失会抛错，因此必须随首屏门禁完成，不能排到六章之后。
  const lateUi = path.endsWith('/ui/combo-art.png')
    || path.endsWith('/ui/ending-lampman.png');
  const coreHero = path.includes('/assets/hero-style1-profiles/')
    && !path.includes('/raincoat-')
    && !path.includes('/uniform-');
  return (path.includes('/assets/ui/') && !lateUi)
    || coreHero
    || path.endsWith('/assets/items/icons.png')
    || path.endsWith('/merchant-32x64.png')
    || path.includes('/assets/vfx/')
    // 留灯间/里屋/当铺三间房在童年章就能被推开。它们不进首屏门禁的话，
    // 玩家会在第一章撞见一扇程序化替代门——那正是"降级画面"，红线不允许。
    || path.includes('/assets/rooms/')
    || path.endsWith('/world/props.png')
    || path.endsWith('/world/entities.png')
    || path.endsWith('/world/plinths.png')
    || belongsToStage(path, 0);
}

/**
 * 后台补装订的排队次序：必须按人生顺序（少年 → 青年 → 成年 → 中年 → 暮年）。
 *
 * 不排序就是数组原序（大体是字母序），会让暮年的收灯人先装、少年的父亲最后到——
 * 玩家刚打完童年就撞上没装订完的少年章，等于把门禁的意义抵消掉。
 */
function backgroundRank(entry: ArtEntry): number {
  for (let stage = 1; stage < STAGE_TOKENS.length; stage += 1) {
    if (belongsToStage(entry.path, stage)) return stage;
  }
  // 不属于任何章节的收尾资产（结算页、组合彩蛋、章节条）排在所有章节之后。
  return STAGE_TOKENS.length;
}

function progressLabel(phase: ArtProgressPhase, percent: number): string {
  if (phase === 'all') {
    if (percent < 18) return '打开档案';
    if (percent < 42) return '装订主角与童年';
    if (percent < 68) return '装订少年到成年';
    if (percent < 90) return '装订中年与老年';
    return '核对全部正式美术';
  }
  if (phase === 'background') return percent >= 100 ? '后续人生已装订' : '后台预热后续人生';
  if (percent < 18) return '打开档案';
  if (percent < 58) return '装订主角与童年';
  if (percent < 82) return '点亮动作与声音';
  return '翻开眼前这一页';
}

async function loadEntries(
  entries: readonly ArtEntry[],
  priority: ArtLoadPriority,
  phase: ArtProgressPhase,
  onProgress: ArtProgressListener,
): Promise<void> {
  const pending = entries.filter((entry) => !completedPaths.has(entry.path));
  const total = entries.length;
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let loaded = entries.length - pending.length;
  let loadedWeight = entries
    .filter((entry) => completedPaths.has(entry.path))
    .reduce((sum, entry) => sum + entry.weight, 0);
  let failures = 0;
  const emit = (): void => {
    const percent = totalWeight > 0 ? Math.round((loadedWeight / totalWeight) * 100) : 100;
    onProgress({ loaded, total, percent, phase, label: progressLabel(phase, percent) });
  };
  emit();
  await Promise.all(pending.map(async (entry) => {
    try {
      await loadArtImage(entry.url, priority);
      completedPaths.add(entry.path);
    } catch {
      failures += 1;
    } finally {
      loaded += 1;
      loadedWeight += entry.weight;
      emit();
    }
  }));
  if (failures > 0) throw new ProductionArtError(failures);
}

export async function preloadProductionArt(
  onProgress: ArtProgressListener = () => undefined,
): Promise<void> {
  const bootEntries = ART_ENTRIES.filter(isBootArt);
  if (bootCompleted) {
    onProgress({
      loaded: bootEntries.length,
      total: bootEntries.length,
      percent: 100,
      phase: 'boot',
      label: progressLabel('boot', 100),
    });
    return;
  }
  if (bootEntries.length === 0) throw new ProductionArtError(1);
  await loadEntries(bootEntries, 'critical', 'boot', onProgress);
  bootCompleted = true;
}

/**
 * 正式发布的硬门禁：全部运行时 PNG 下载并完整解码成功后才允许导入游戏。
 * 这条路径不做分页预热，避免慢网或快速推进时短暂显示程序化替代画面。
 */
export async function preloadAllProductionArt(
  onProgress: ArtProgressListener = () => undefined,
): Promise<void> {
  if (ART_ENTRIES.length === 0) throw new ProductionArtError(1);
  await loadEntries(ART_ENTRIES, 'critical', 'all', onProgress);
  bootCompleted = true;
}

/** 首屏门禁之外的全部正式美术，按人生顺序排好队，只走后台单通道。 */
const BACKGROUND_ENTRIES: readonly ArtEntry[] = ART_ENTRIES
  .filter((entry) => !isBootArt(entry))
  .slice()
  .sort((a, b) => backgroundRank(a) - backgroundRank(b));

/**
 * 进游戏之后在后台把后续章节补齐。
 *
 * 必须排在装帧页收起之后调用：它和首屏门禁抢的是同一条解码通道，提前开就是
 * 把首屏时间又拖长。失败不阻断——真正的硬闸门在每章开打前的 productionArtStageReady。
 */
export function preloadRemainingProductionArt(
  onProgress: ArtProgressListener = () => undefined,
): Promise<void> {
  if (!backgroundPromise) {
    backgroundPromise = loadEntries(BACKGROUND_ENTRIES, 'background', 'background', onProgress);
  }
  return backgroundPromise;
}

export function warmProductionArtForStage(stageIndex: number, urgent = false): Promise<void> {
  const index = Math.max(0, Math.min(STAGE_TOKENS.length - 1, Math.trunc(stageIndex)));
  const entries = ART_ENTRIES.filter((entry) => belongsToStage(entry.path, index));
  // 已装订完的先把首绘成本重付一遍：栅格化缓存可能已被系统回收，等到战斗里
  // 第一次画出来才发现就晚了。不触发任何加载，纯 CPU、几毫秒，且在过场期间。
  rewarmArtRaster(entries.filter((entry) => completedPaths.has(entry.path)).map((entry) => entry.url));
  // 平时预热仍走单通道，绝不与战斗抢帧；但章节过场已经被硬闸门挡住时，玩家
  // 正在等这些图，继续按后台单通道串行会像整局卡死。urgent 只由章末闸门使用，
  // 此时 setArtGameplayActive 已为 false，最多三路完成解码后再进入下一章。
  return loadEntries(entries, index === 0 || urgent ? 'critical' : 'next', 'background', () => undefined);
}

export function productionArtStageReady(stageIndex: number): boolean {
  const index = Math.max(0, Math.min(STAGE_TOKENS.length - 1, Math.trunc(stageIndex)));
  const entries = ART_ENTRIES.filter((entry) => belongsToStage(entry.path, index));
  return entries.length > 0 && entries.every((entry) => completedPaths.has(entry.path));
}

export function productionArtCount(): number {
  return ART_ENTRIES.length;
}

export function productionBootArtCount(): number {
  return ART_ENTRIES.filter(isBootArt).length;
}

/**
 * 后台补装订进度快照：给标题页「资源预载」按钮与暂停页那行。
 * 按解码像素量加权（与装帧页同一标尺），不按文件数——大量小图不制造假快感，
 * 进度推进与真实解码工作量严格成正比。
 */
export function backgroundArtStatus(): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const entry of BACKGROUND_ENTRIES) {
    total += entry.weight;
    if (completedPaths.has(entry.path)) done += entry.weight;
  }
  return { done, total };
}
