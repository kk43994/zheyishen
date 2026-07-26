import manifest from './assets/characters/xiao-zhang.json';

export type XiaoZhangPixelAction = 'idle' | 'follow' | 'shoot' | 'backstab';

const ATLAS_URL = new URL('./assets/characters/xiao-zhang.png', import.meta.url).href;
const FRAME_WIDTH = manifest.frame.width;
const FRAME_HEIGHT = manifest.frame.height;
const ACTIONS = manifest.actions as Record<XiaoZhangPixelAction, { readonly row: number; readonly frames: number }>;

class XiaoZhangPixelAtlas {
  private image: HTMLImageElement | null = null;
  private frames = new Map<string, HTMLCanvasElement>();
  private loaded = false;

  constructor() {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const expectedWidth = FRAME_WIDTH * manifest.columns;
      const expectedHeight = FRAME_HEIGHT * Object.keys(ACTIONS).length;
      if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight) {
        console.warn(`Xiao Zhang atlas size mismatch: ${image.naturalWidth}x${image.naturalHeight}`);
        this.image = null;
        return;
      }
      this.loaded = true;
    };
    image.onerror = () => {
      console.warn('Xiao Zhang Image2 atlas failed to load; using code-drawn fallback.');
      this.image = null;
    };
    image.src = ATLAS_URL;
    this.image = image;
  }

  slice(action: XiaoZhangPixelAction, frame: number): HTMLCanvasElement | null {
    if (!this.loaded || !this.image) return null;
    const spec = ACTIONS[action];
    const index = ((Math.trunc(frame) % spec.frames) + spec.frames) % spec.frames;
    const key = `${action}:${index}`;
    const cached = this.frames.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.image,
      index * FRAME_WIDTH,
      spec.row * FRAME_HEIGHT,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      0,
      0,
      FRAME_WIDTH,
      FRAME_HEIGHT,
    );
    this.frames.set(key, canvas);
    return canvas;
  }
}

const atlas = new XiaoZhangPixelAtlas();

export class PixelXiaoZhangRenderer {
  draw(
    target: CanvasRenderingContext2D,
    x: number,
    y: number,
    action: XiaoZhangPixelAction,
    frame: number,
    faceLeft: boolean,
    display = 56,
  ): boolean {
    const sprite = atlas.slice(action, frame);
    if (!sprite) return false;
    target.save();
    target.imageSmoothingEnabled = false;
    target.translate(Math.round(x), Math.round(y));
    target.scale(faceLeft ? -1 : 1, 1);
    target.drawImage(sprite, -display / 2, -display, display, display);
    target.restore();
    return true;
  }
}
