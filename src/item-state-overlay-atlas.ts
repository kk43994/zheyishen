import manifest from './assets/items/state-overlays.json';
import type { HeroFacing } from './hero-morph';
import type { ItemId } from './types';
import { loadArtImage } from './art-runtime';

const ATLAS_URL = new URL('./assets/items/state-overlays.png', import.meta.url).href;
const CELL_WIDTH = manifest.cell.width;
const CELL_HEIGHT = manifest.cell.height;
const DIRECTIONS = manifest.directions as readonly HeroFacing[];
const ITEMS = manifest.items as Partial<Record<ItemId, {
  readonly row: number;
  readonly phases: readonly ItemStateOverlayPhase[];
}>>;

export type ItemStateOverlayPhase = 'rage' | 'crash' | 'stub' | 'two' | 'three' | 'four' | 'drag' | 'shadow' | 'prop' | 'fitted' | 'freeze-idle' | 'freeze-walk' | 'freeze-attack' | 'freeze-hurt' | 'scar-idle' | 'scar-walk' | 'scar-attack' | 'scar-hurt' | 'safe' | 'threatened' | 'press-idle' | 'press-walk' | 'press-attack' | 'press-hurt' | 'standby' | 'appear' | 'leap' | 'guard' | 'disconnect';
export type AutoRenewOverlayPhase = 'stub' | 'two' | 'three' | 'four';

class ItemStateOverlayAtlas {
  private image: HTMLImageElement | null = null;
  private frames = new Map<string, HTMLCanvasElement>();
  private loaded = false;
  private readyPromise: Promise<void> | null = null;

  load(): void {
    if (this.image || this.readyPromise) return;
    this.readyPromise = loadArtImage(ATLAS_URL).then((image) => {
      const expectedWidth = CELL_WIDTH * DIRECTIONS.length;
      const expectedHeight = CELL_HEIGHT * manifest.rowCount;
      if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight) {
        throw new Error(`Image2 状态层图集尺寸错误: ${image.naturalWidth}x${image.naturalHeight}`);
      }
      this.image = image;
      this.loaded = true;
    }).catch((error: unknown) => {
      console.error('Image2 状态层图集加载失败；完整美术闸门应阻断启动。');
      this.image = null;
      throw error;
    });
  }

  whenReady(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    this.load();
    return this.readyPromise ?? Promise.reject(new Error('Image2 状态层图集尚未初始化'));
  }

  slice(
    id: ItemId,
    phase: ItemStateOverlayPhase,
    facing: HeroFacing,
  ): HTMLCanvasElement | null {
    const item = ITEMS[id];
    if (!this.loaded || !this.image || !item) return null;
    const phaseIndex = item.phases.indexOf(phase);
    const directionIndex = DIRECTIONS.indexOf(facing);
    if (phaseIndex < 0 || directionIndex < 0) return null;
    const key = `${id}:${phase}:${facing}`;
    const cached = this.frames.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = CELL_WIDTH;
    canvas.height = CELL_HEIGHT;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      this.image,
      directionIndex * CELL_WIDTH,
      (item.row + phaseIndex) * CELL_HEIGHT,
      CELL_WIDTH,
      CELL_HEIGHT,
      0,
      0,
      CELL_WIDTH,
      CELL_HEIGHT,
    );
    this.frames.set(key, canvas);
    return canvas;
  }
}

export const itemStateOverlayAtlas = new ItemStateOverlayAtlas();
itemStateOverlayAtlas.load();
