import spriteManifest from './assets/items/equipment-sprites.json';
import type { HeroFacing } from './hero-morph';
import type { ItemId } from './types';

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
    if (this.image) return;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const expectedWidth = CELL_WIDTH * DIRECTIONS.length;
      const expectedHeight = CELL_HEIGHT * spriteManifest.rows;
      if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight) {
        console.warn(`Image2 \u9053\u5177\u56fe\u96c6\u5c3a\u5bf8\u9519\u8bef: ${image.naturalWidth}x${image.naturalHeight}`);
        this.image = null;
        return;
      }
      this.loaded = true;
    };
    image.onerror = () => {
      console.warn('Image2 \u9053\u5177\u56fe\u96c6\u52a0\u8f7d\u5931\u8d25\uff0c\u4fdd\u7559\u7a0b\u5e8f\u5316\u56de\u9000\u3002');
      this.image = null;
    };
    image.src = SPRITES_URL;
    this.image = image;
  }

  whenReady(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    this.load();
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise((resolve, reject) => {
      const image = this.image;
      if (!image) {
        reject(new Error('Image2 \u9053\u5177\u56fe\u96c6\u5c1a\u672a\u521d\u59cb\u5316'));
        return;
      }
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => reject(new Error('Image2 \u9053\u5177\u56fe\u96c6\u52a0\u8f7d\u5931\u8d25')), { once: true });
    });
    return this.readyPromise;
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
