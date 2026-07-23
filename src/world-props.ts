// 场景摆设贴图：image2 基底 + scripts/process_image2_props.py 规整产物。
// 图集 6 行（章节）x 4 列（变体），单元格 40x44，精灵底部居中锚定。
const PROPS_URL = new URL('./assets/world/props.png', import.meta.url).href;

export const PROP_VARIANTS = 4;
const CELL_W = 40;
const CELL_H = 44;
const STAGE_ROWS = 6;

class WorldPropAtlas {
  private image: HTMLImageElement | null = null;
  private frames = new Map<string, HTMLCanvasElement>();
  private loaded = false;

  get ready(): boolean {
    return this.loaded;
  }

  load(): void {
    if (this.image) return;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (image.naturalWidth !== CELL_W * PROP_VARIANTS || image.naturalHeight !== CELL_H * STAGE_ROWS) {
        console.warn(`场景摆设图集尺寸错误: ${image.naturalWidth}x${image.naturalHeight}`);
        return;
      }
      this.loaded = true;
    };
    image.onerror = () => console.warn('场景摆设图集加载失败，继续使用程序化摆设回退。');
    image.src = PROPS_URL;
    this.image = image;
  }

  slice(stageIndex: number, variant: number): HTMLCanvasElement | null {
    if (!this.loaded || !this.image) return null;
    const row = Math.min(Math.max(stageIndex, 0), STAGE_ROWS - 1);
    const col = ((variant % PROP_VARIANTS) + PROP_VARIANTS) % PROP_VARIANTS;
    const key = `${row}:${col}`;
    const cached = this.frames.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = CELL_W;
    canvas.height = CELL_H;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(this.image, col * CELL_W, row * CELL_H, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
    this.frames.set(key, canvas);
    return canvas;
  }
}

export const worldPropAtlas = new WorldPropAtlas();
worldPropAtlas.load();

// 世界实体：0=留灯间门 1=里屋门 2=当铺摊 3=终局路灯（单行 4 格，64x72，底部居中锚定）
const ENTITIES_URL = new URL('./assets/world/entities.png', import.meta.url).href;
const ENTITY_CELL_W = 64;
const ENTITY_CELL_H = 72;
const ENTITY_COUNT = 4;

export type WorldEntityKind = 'door-light' | 'door-dark' | 'stall' | 'lamp';
const ENTITY_INDEX: Record<WorldEntityKind, number> = {
  'door-light': 0, 'door-dark': 1, stall: 2, lamp: 3,
};

class WorldEntityAtlas {
  private image: HTMLImageElement | null = null;
  private frames = new Map<number, HTMLCanvasElement>();
  private loaded = false;

  load(): void {
    if (this.image) return;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (image.naturalWidth !== ENTITY_CELL_W * ENTITY_COUNT || image.naturalHeight !== ENTITY_CELL_H) {
        console.warn(`世界实体图集尺寸错误: ${image.naturalWidth}x${image.naturalHeight}`);
        return;
      }
      this.loaded = true;
    };
    image.onerror = () => console.warn('世界实体图集加载失败，继续使用程序化实体回退。');
    image.src = ENTITIES_URL;
    this.image = image;
  }

  slice(kind: WorldEntityKind): HTMLCanvasElement | null {
    if (!this.loaded || !this.image) return null;
    const index = ENTITY_INDEX[kind];
    const cached = this.frames.get(index);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = ENTITY_CELL_W;
    canvas.height = ENTITY_CELL_H;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(this.image, index * ENTITY_CELL_W, 0, ENTITY_CELL_W, ENTITY_CELL_H, 0, 0, ENTITY_CELL_W, ENTITY_CELL_H);
    this.frames.set(index, canvas);
    return canvas;
  }
}

export const worldEntityAtlas = new WorldEntityAtlas();
worldEntityAtlas.load();
