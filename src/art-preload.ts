import artWeights from './art-loading-weights.json';
import { loadArtImage, type ArtLoadPriority } from './art-runtime';

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

const artModules = { ...regularArtModules, ...canonicalRuntimeModules };
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
  const lateUi = path.endsWith('/ui/combo-art.png')
    || path.endsWith('/ui/chapter-strips.png')
    || path.endsWith('/ui/ending-lampman.png')
    || path.endsWith('/ui/ending-table.png')
    || path.endsWith('/ui/fate-profiles.png');
  const coreHero = path.includes('/assets/hero-style1-profiles/')
    && !path.includes('/raincoat-')
    && !path.includes('/uniform-');
  return (path.includes('/assets/ui/') && !lateUi)
    || coreHero
    || path.endsWith('/assets/items/icons.png')
    || path.includes('/assets/vfx/')
    || path.endsWith('/world/props.png')
    || path.endsWith('/world/entities.png')
    || path.endsWith('/world/plinths.png')
    || belongsToStage(path, 0);
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

export function preloadRemainingProductionArt(
  onProgress: ArtProgressListener = () => undefined,
): Promise<void> {
  if (!backgroundPromise) {
    backgroundPromise = loadEntries(ART_ENTRIES, 'background', 'background', onProgress);
  }
  return backgroundPromise;
}

export function warmProductionArtForStage(stageIndex: number): Promise<void> {
  const index = Math.max(0, Math.min(STAGE_TOKENS.length - 1, Math.trunc(stageIndex)));
  const entries = ART_ENTRIES.filter((entry) => belongsToStage(entry.path, index));
  return loadEntries(entries, index === 0 ? 'critical' : 'next', 'background', () => undefined);
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
