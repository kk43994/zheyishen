// 道具实物图标：image2 基底 + scripts/process_item_icons.py 规整产物。
// icons.json 的 index 映射以 relics.ts 声明顺序为准；tiny 尺寸（物证栏）不走贴图。
import iconManifest from './assets/items/icons.json';
import type { ItemId } from './types';

const ICONS_URL = new URL('./assets/items/icons.png', import.meta.url).href;

const CELL = iconManifest.cell;
const COLS = iconManifest.cols;
const ROWS = iconManifest.rows;
const INDEX = iconManifest.index as Record<string, number>;

class ItemIconAtlas {
  private image: HTMLImageElement | null = null;
  private frames = new Map<number, HTMLCanvasElement>();
  private loaded = false;

  load(): void {
    if (this.image) return;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const expectedWidth = CELL * COLS;
      const expectedHeight = CELL * ROWS;
      if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight) {
        console.warn(`道具图集尺寸错误: ${image.naturalWidth}x${image.naturalHeight}，期望 ${expectedWidth}x${expectedHeight}`);
        this.image = null;
        return;
      }
      this.loaded = true;
    };
    image.onerror = () => {
      console.warn('道具图集加载失败，保留代码绘制回退。');
      this.image = null;
    };
    image.src = ICONS_URL;
    this.image = image;
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
