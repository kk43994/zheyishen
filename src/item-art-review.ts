import './item-art-review.css';
import equipment from './assets/items/equipment-art.json';
import equipmentSprites from './assets/items/equipment-sprites.json';
import runtimeArt from './assets/items/runtime-art-consumers.json';
import sourcePalettes from './assets/items/source-palettes.json';
import { itemEquipmentAtlas } from './item-equipment-atlas';
import { heroStyle1Atlas } from './hero-style1-atlas';
import { itemIconAtlas } from './item-icons';
import { itemStateOverlayAtlas } from './item-state-overlay-atlas';
import { PixelHeroRenderer, type PixelHeroState } from './hero-pixel';
import { ITEM_VISUAL_MODULES_V2 } from './item-visual-contract-v2';
import { selectBaseProjectileForm } from './projectile-item-signatures';
import { DEFAULT_APPEARANCE } from './origins';
import type { ItemId } from './types';
import { projectileAtlas } from './vfx-sprites';

const WIDTH = 480;
const HEIGHT = 250;
const DIRECTIONS = ['front', 'left', 'back', 'right'] as const;
const DIRECTION_LABELS = ['正', '左', '背', '右'] as const;
const MOTION_POSES = [
  { motion: 'idle', frame: 0, label: '待机' },
  { motion: 'walk', frame: 1, label: '走路' },
  { motion: 'attack', frame: 1, label: '攻击' },
  { motion: 'hurt', frame: 1, label: '受击' },
] as const satisfies readonly PreviewPose[];
type PreviewMotion = PixelHeroState['motion'];
type PreviewFrame = PixelHeroState['frame'];

interface PreviewPose {
  readonly motion: PreviewMotion;
  readonly frame: PreviewFrame;
  readonly label: string;
}

const PREVIEW_POSES: Partial<Record<ItemId, PreviewPose>> = {
  'typing-indicator': { motion: 'attack', frame: 1, label: '第三点·散射触发态' },
  'slow-watch': { motion: 'idle', frame: 0, label: '冻结触发态' },
  'eye-exercise': { motion: 'idle', frame: 0, label: '轮刮眼眶触发态' },
  'flash-escape': { motion: 'hurt', frame: 1, label: '受击触发态' },
  'summer-run': { motion: 'walk', frame: 1, label: '奔跑态' },
};

const RUNTIME_ART = new Map(runtimeArt.items.map((item) => [item.id as ItemId, item]));
const SOURCE_PALETTES = sourcePalettes.items as unknown as Record<ItemId, {
  readonly ink: string;
  readonly dominant: string;
  readonly accent: string;
  readonly light: string;
}>;

function sourceProjectile(id: ItemId): HTMLCanvasElement | null {
  const form = selectBaseProjectileForm([id], 'breath');
  return projectileAtlas.named(form === 'breath' ? 'breath0' : form);
}

function drawTriggerManifestation(
  context: CanvasRenderingContext2D,
  id: ItemId,
  x: number,
  y: number,
): void {
  if (id !== 'three-day-visible') return;
  const projectile = sourceProjectile(id);
  if (!projectile) return;
  const positions = [
    [x - 22, y + 2],
    [x + 15, y - 13],
    [x - 4, y - 31],
  ] as const;
  context.save();
  context.imageSmoothingEnabled = false;
  context.globalAlpha = 0.86;
  for (const [projectileX, projectileY] of positions) {
    context.drawImage(projectile, projectileX, projectileY, 9, 9);
  }
  context.globalAlpha = 0.42;
  context.fillStyle = '#9a94a6';
  for (const [trackX, trackY] of [
    [x - 17, y - 13], [x - 13, y - 22], [x + 5, y - 27], [x + 17, y - 2], [x + 10, y + 10], [x - 12, y + 11],
  ] as const) context.fillRect(trackX, trackY, 2, 2);
  context.restore();
}

function heroState(
  id: ItemId | null,
  facing: PixelHeroState['facing'],
  pose: PreviewPose,
): PixelHeroState {
  return {
    appearance: DEFAULT_APPEARANCE,
    ageStep: 2,
    items: id ? [id] : [],
    facing,
    motion: pose.motion,
    frame: pose.frame,
    thirdPillPhase: id === 'third-pill'
      ? (pose.frame % 2 === 0 ? 'rage' : 'crash')
      : undefined,
    autoRenewPhase: id === 'auto-renew'
      ? (['stub', 'two', 'three', 'four'] as const)[pose.frame]
      : undefined,
    slowWatchFreeze: id === 'slow-watch',
    momoHeadpieceState: id === 'momo-avatar' && pose.motion === 'hurt'
      ? 'threatened'
      : 'safe',
    eyeExerciseActive: id === 'eye-exercise',
    typingIndicatorDots: id === 'typing-indicator' ? 3 : undefined,
    serverShutdownPhase: id === 'server-shutdown' && pose.motion === 'hurt'
      ? 'guard'
      : 'standby',
  };
}

function previewPose(id: ItemId): PreviewPose {
  return PREVIEW_POSES[id] ?? { motion: 'idle', frame: 0, label: '常态' };
}

function countChangedPixels(
  renderer: PixelHeroRenderer,
  id: ItemId,
  facing: PixelHeroState['facing'],
  pose: PreviewPose,
): number {
  const base = document.createElement('canvas');
  const equipped = document.createElement('canvas');
  base.width = equipped.width = 120;
  base.height = equipped.height = 130;
  const baseContext = base.getContext('2d', { willReadFrequently: true });
  const itemContext = equipped.getContext('2d', { willReadFrequently: true });
  if (!baseContext || !itemContext) return 0;
  renderer.draw(baseContext, 60, 58, 1, heroState(null, facing, pose));
  renderer.draw(itemContext, 60, 58, 1, heroState(id, facing, pose));
  const first = baseContext.getImageData(0, 0, base.width, base.height).data;
  const second = itemContext.getImageData(0, 0, equipped.width, equipped.height).data;
  let changed = 0;
  for (let index = 0; index < first.length; index += 4) {
    if (
      first[index] !== second[index]
      || first[index + 1] !== second[index + 1]
      || first[index + 2] !== second[index + 2]
      || first[index + 3] !== second[index + 3]
    ) changed += 1;
  }
  return changed;
}

function drawStage(
  canvas: HTMLCanvasElement,
  renderer: PixelHeroRenderer,
  id: ItemId,
): { readonly directions: readonly number[]; readonly motions: readonly number[] } {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return { directions: [0, 0, 0, 0], motions: [0, 0, 0, 0] };
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#15141a';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#24212a';
  context.fillRect(0, 116, WIDTH, 1);
  context.fillRect(0, 214, WIDTH, 1);
  context.fillStyle = '#211e25';
  context.fillRect(120, 0, 1, 215);

  const icon = itemIconAtlas.slice(id);
  const runtime = RUNTIME_ART.get(id);
  const hasProjectile = runtime?.consumers.includes('image2-projectile-atlas') ?? false;
  if (icon) context.drawImage(icon, hasProjectile ? 12 : 24, hasProjectile ? 26 : 20, hasProjectile ? 54 : 72, hasProjectile ? 54 : 72);
  if (hasProjectile) {
    const projectile = sourceProjectile(id);
    if (projectile) context.drawImage(projectile, 72, 32, 40, 40);
  }
  context.fillStyle = '#76707a';
  context.font = '10px ui-monospace, monospace';
  context.textAlign = 'center';
  context.fillText(hasProjectile ? 'SOURCE + SHOT' : 'IMAGE2 SOURCE', 60, 108);

  const pose = previewPose(id);
  const directions = DIRECTIONS.map((facing, index) => {
    const x = 165 + index * 78;
    renderer.draw(context, x, 54, 0.9, heroState(id, facing, pose));
    drawTriggerManifestation(context, id, x, 54);
    context.fillStyle = '#77717a';
    context.font = '10px sans-serif';
    context.fillText(DIRECTION_LABELS[index]!, x, 108);
    return countChangedPixels(renderer, id, facing, pose);
  });
  const motions = MOTION_POSES.map((motionPose, index) => {
    const x = 165 + index * 78;
    renderer.draw(context, x, 158, 0.9, heroState(id, 'front', motionPose));
    drawTriggerManifestation(context, id, x, 158);
    context.fillStyle = '#77717a';
    context.font = '10px sans-serif';
    context.fillText(motionPose.label, x, 238);
    return countChangedPixels(renderer, id, 'front', motionPose);
  });
  context.fillStyle = '#9a8385';
  context.font = '9px sans-serif';
  context.textAlign = 'right';
  context.fillText(runtime?.persistentHero ? pose.label : '触发层 · 不常驻上身', WIDTH - 10, 14);
  context.textAlign = 'left';
  context.fillText('四向', 128, 14);
  context.fillText('动作', 128, 130);
  return { directions, motions };
}

async function render(): Promise<void> {
  await Promise.all([
    heroStyle1Atlas.whenReady(),
    itemIconAtlas.whenReady(),
    itemEquipmentAtlas.whenReady(),
    itemStateOverlayAtlas.whenReady(),
    projectileAtlas.whenReady(),
  ]);
  const root = document.querySelector<HTMLElement>('#catalog');
  if (!root) return;
  const renderer = new PixelHeroRenderer();
  const rigidCount = equipment.items.filter((item) => {
    const modules = ITEM_VISUAL_MODULES_V2[item.id as ItemId];
    return modules.includes('rigid') || modules.includes('garment');
  }).length;
  const image2Count = equipmentSprites.items.filter((item) => (
    item.status === 'source-approved' || item.status === 'custom-fitted-uniform-v1'
  )).length;
  root.className = 'catalog-shell';
  root.innerHTML = `
    <header class="catalog-head">
      <div>
        <p class="catalog-kicker">ART PRODUCTION REVIEW · V2</p>
        <h1>《这一身》道具与主角体现图鉴</h1>
        <p class="catalog-summary">逐件对齐百科外观与反讽事件；左侧为独立资产，右侧为主角四方向实装结果。</p>
      </div>
      <div class="catalog-counts"><span><strong>${equipment.itemCount}</strong><br>道具</span><span><strong>${image2Count}</strong><br>Image2 源</span><span><strong>${runtimeArt.itemCount}</strong><br>运行消费者</span><span><strong>${rigidCount}</strong><br>实体穿戴</span></div>
    </header>
    <section class="catalog-grid" aria-label="77件道具美术资产"></section>
  `;
  const grid = root.querySelector<HTMLElement>('.catalog-grid');
  if (!grid) return;

  for (const item of equipment.items) {
    const id = item.id as ItemId;
    const card = document.createElement('article');
    card.className = 'item-card';
    card.dataset.itemId = id;
    card.dataset.source = item.source;
    const canvas = document.createElement('canvas');
    canvas.className = 'art-stage';
    canvas.setAttribute('aria-label', `${item.name}道具资产与主角四视图`);
    const deltas = drawStage(canvas, renderer, id);
    const totalDelta = [...deltas.directions, ...deltas.motions].reduce((sum, value) => sum + value, 0);
    const runtime = RUNTIME_ART.get(id);
    if (!runtime) throw new Error(`${id}: 缺少运行时美术消费者`);
    const triggerOnly = !runtime.persistentHero;
    const sourceBacked = runtime.consumers.every((consumer) => !consumer.includes('programmatic-only'));
    card.dataset.visible = String((triggerOnly && sourceBacked) || totalDelta > 0);
    card.dataset.persistentHero = String(runtime.persistentHero);
    card.dataset.heroConsumer = runtime.heroConsumer;
    card.dataset.deltaFront = String(deltas.directions[0]);
    card.dataset.deltaLeft = String(deltas.directions[1]);
    card.dataset.deltaBack = String(deltas.directions[2]);
    card.dataset.deltaRight = String(deltas.directions[3]);
    card.dataset.deltaIdle = String(deltas.motions[0]);
    card.dataset.deltaWalk = String(deltas.motions[1]);
    card.dataset.deltaAttack = String(deltas.motions[2]);
    card.dataset.deltaHurt = String(deltas.motions[3]);
    const tags = ITEM_VISUAL_MODULES_V2[id].map((value) => `<span class="tag">${value}</span>`).join('');
    const palette = SOURCE_PALETTES[id];
    const swatches = [palette.ink, palette.dominant, palette.accent, palette.light]
      .map((color) => `<i style="--swatch:${color}" title="${color}"></i>`).join('');
    card.innerHTML = `
      <div class="item-copy">
        <div class="item-line"><h2 class="item-name"><span class="item-index">${String(item.index + 1).padStart(2, '0')}</span> ${item.name}</h2><span class="source">${item.source}</span></div>
        <p class="look-copy"><span>外观</span>${item.look}</p>
        <p class="irony-copy"><span>反讽</span>${item.irony}</p>
        <div class="consumer-line"><span class="consumer-mode">${runtime.heroConsumer}</span><span class="source-swatches" aria-label="Image2源色板">${swatches}</span></div>
        <div class="tags"><span class="tag image2">Image2</span>${tags}${triggerOnly ? '<span class="tag projectile">触发态不上身</span>' : '<span class="tag worn">常驻体现</span>'}<span class="tag delta ${!triggerOnly && totalDelta === 0 ? 'zero' : ''}">向 Δ ${deltas.directions.join('/')}</span><span class="tag delta ${!triggerOnly && totalDelta === 0 ? 'zero' : ''}">动 Δ ${deltas.motions.join('/')}</span></div>
      </div>
    `;
    card.prepend(canvas);
    grid.append(card);
  }
  const cards = [...grid.querySelectorAll<HTMLElement>('.item-card')];
  const failures = cards.flatMap((card) => {
    const id = card.dataset.itemId ?? 'unknown';
    if (card.dataset.visible !== 'true') return [`${id}: no visible runtime manifestation`];
    if (!card.dataset.heroConsumer?.startsWith('image2-')) return [`${id}: consumer is not source-backed`];
    const directional = [
      card.dataset.deltaFront,
      card.dataset.deltaLeft,
      card.dataset.deltaBack,
      card.dataset.deltaRight,
    ].map(Number);
    const motions = [
      card.dataset.deltaIdle,
      card.dataset.deltaWalk,
      card.dataset.deltaAttack,
      card.dataset.deltaHurt,
    ].map(Number);
    if (card.dataset.persistentHero === 'true' && directional.filter((value) => value > 0).length < 2) {
      return [`${id}: persistent manifestation does not cover enough directions`];
    }
    if (card.dataset.persistentHero === 'true' && motions.filter((value) => value > 0).length < 3) {
      return [`${id}: persistent manifestation does not cover enough motions`];
    }
    return [];
  });
  if (cards.length !== 77) failures.push(`review card count is ${cards.length}, expected 77`);
  document.documentElement.dataset.itemArtValid = String(failures.length === 0);
  if (failures.length) throw new Error(`道具运行时美术验收失败:\n${failures.join('\n')}`);
  document.documentElement.dataset.ready = 'true';
}

void render();
