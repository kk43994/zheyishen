import spriteManifest from './assets/items/equipment-sprites.json';
import type { HeroFacing } from './hero-morph';
import type { ItemId } from './types';
import { loadArtImage } from './art-runtime';

const SPRITES_URL = new URL('./assets/items/equipment-sprites.png', import.meta.url).href;
const CELL_WIDTH = spriteManifest.cell.width;
const CELL_HEIGHT = spriteManifest.cell.height;
const DIRECTIONS = spriteManifest.directions as readonly HeroFacing[];
const INDEX = spriteManifest.index as Record<ItemId, number>;
const ACTIVE = new Set(
  spriteManifest.items
    .filter((item) => item.status === 'source-approved')
    .map((item) => item.id as ItemId),
);

class ItemEquipmentAtlas {
  private image: HTMLImageElement | null = null;
  private frames = new Map<string, HTMLCanvasElement>();
  private loaded = false;
  private readyPromise: Promise<void> | null = null;

  load(): void {
    if (this.image || this.readyPromise) return;
    this.readyPromise = loadArtImage(SPRITES_URL).then((image) => {
      const expectedWidth = CELL_WIDTH * DIRECTIONS.length;
      const expectedHeight = CELL_HEIGHT * spriteManifest.rows;
      if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight) {
        throw new Error(`Image2 \u9053\u5177\u56fe\u96c6\u5c3a\u5bf8\u9519\u8bef: ${image.naturalWidth}x${image.naturalHeight}`);
      }
      this.image = image;
      this.loaded = true;
    }).catch((error: unknown) => {
      console.error('Image2 道具图集加载失败；完整美术闸门应阻断启动。');
      this.image = null;
      throw error;
    });
  }

  whenReady(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    this.load();
    return this.readyPromise ?? Promise.reject(new Error('Image2 道具图集尚未初始化'));
  }

  slice(id: ItemId, facing: HeroFacing): HTMLCanvasElement | null {
    if (!this.loaded || !this.image || !ACTIVE.has(id)) return null;
    const row = INDEX[id];
    const column = DIRECTIONS.indexOf(facing);
    if (row === undefined || column < 0) return null;
    const key = `${id}:${facing}`;
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
      column * CELL_WIDTH, row * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT,
      0, 0, CELL_WIDTH, CELL_HEIGHT,
    );
    this.frames.set(key, canvas);
    return canvas;
  }
}

export const itemEquipmentAtlas = new ItemEquipmentAtlas();
itemEquipmentAtlas.load();

export const ITEM_EQUIPMENT_CELL = { width: CELL_WIDTH, height: CELL_HEIGHT } as const;
