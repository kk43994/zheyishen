// 道具实物图标：独立的 Image2 图标源 + scripts/process_item_icons.py 规整产物。
// 四方向上身源图只供 equipment-sprites 使用，不能回写这套 36px 图标。
// icons.json 的 index 映射以 relics.ts 声明顺序为准；tiny 尺寸（物证栏）不走贴图。
import iconManifest from './assets/items/icons.json';
import type { ItemId } from './types';
import { loadArtImage } from './art-runtime';

const ICONS_URL = new URL('./assets/items/icons.png', import.meta.url).href;

const CELL = iconManifest.cell;
const COLS = iconManifest.cols;
const ROWS = iconManifest.rows;
const INDEX = iconManifest.index as Record<string, number>;

class ItemIconAtlas {
  private image: HTMLImageElement | null = null;
  private frames = new Map<number, HTMLCanvasElement>();
  private loaded = false;
  private readyPromise: Promise<void> | null = null;

  load(): void {
    if (this.image || this.readyPromise) return;
    this.readyPromise = loadArtImage(ICONS_URL, 'critical').then((image) => {
      const expectedWidth = CELL * COLS;
      const expectedHeight = CELL * ROWS;
      if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight) {
        throw new Error(`道具图集尺寸错误: ${image.naturalWidth}x${image.naturalHeight}，期望 ${expectedWidth}x${expectedHeight}`);
      }
      this.image = image;
      this.loaded = true;
    }).catch((error: unknown) => {
      console.error('道具图集加载失败；完整美术闸门应阻断启动。');
      this.image = null;
      throw error;
    });
  }

  whenReady(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    this.load();
    return this.readyPromise ?? Promise.reject(new Error('道具图集尚未初始化'));
  }

  slice(id: ItemId): HTMLCanvasElement | null {
    if (!this.loaded || !this.image) return null;
    const index = INDEX[id];
    if (index === undefined) return null;
    const cached = this.frames.get(index);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = CELL;
    canvas.height = CELL;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      this.image,
      (index % COLS) * CELL, Math.floor(index / COLS) * CELL, CELL, CELL,
      0, 0, CELL, CELL,
    );
    this.frames.set(index, canvas);
    return canvas;
  }
}

export const itemIconAtlas = new ItemIconAtlas();
itemIconAtlas.load();
