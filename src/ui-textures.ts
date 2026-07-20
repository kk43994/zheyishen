// UI 纹理与饰件：image2 基底 + scripts/process_ui_textures.py 规整产物。
// 全部为可选增强：未加载完成时所有绘制函数保持原样，不产生任何视觉变化。
const PAPER_URL = new URL('./assets/ui/paper-texture.png', import.meta.url).href;
const NIGHT_URL = new URL('./assets/ui/night-texture.png', import.meta.url).href;
const CORNER_URL = new URL('./assets/ui/corner-ornament.png', import.meta.url).href;
const SEAL_URL = new URL('./assets/ui/seal-ornament.png', import.meta.url).href;

function loadImage(url: string, onload: (image: HTMLImageElement) => void): void {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => onload(image);
  image.src = url;
}

class UiTextures {
  private paper: HTMLImageElement | null = null;
  private night: HTMLImageElement | null = null;
  corner: HTMLImageElement | null = null;
  seal: HTMLImageElement | null = null;
  private paperPattern: CanvasPattern | null = null;
  private nightPattern: CanvasPattern | null = null;

  load(): void {
    loadImage(PAPER_URL, (image) => { this.paper = image; });
    loadImage(NIGHT_URL, (image) => { this.night = image; });
    loadImage(CORNER_URL, (image) => { this.corner = image; });
    loadImage(SEAL_URL, (image) => { this.seal = image; });
  }

  pattern(ctx: CanvasRenderingContext2D, kind: 'paper' | 'night'): CanvasPattern | null {
    if (kind === 'paper') {
      if (!this.paperPattern && this.paper) this.paperPattern = ctx.createPattern(this.paper, 'repeat');
      return this.paperPattern;
    }
    if (!this.nightPattern && this.night) this.nightPattern = ctx.createPattern(this.night, 'repeat');
    return this.nightPattern;
  }
}

export const uiTextures = new UiTextures();
uiTextures.load();

/** 大面积面板的纹理叠加；面积过小或纹理未就绪时静默跳过。 */
export function overlayPanelTexture(
  ctx: CanvasRenderingContext2D,
  fillColor: string,
  x: number,
  y: number,
  width: number,
  height: number,
  paperColors: readonly string[],
  nightColors: readonly string[],
): void {
  if (width * height < 3600) return;
  const isPaper = paperColors.includes(fillColor);
  const isNight = !isPaper && nightColors.includes(fillColor);
  if (!isPaper && !isNight) return;
  const pattern = uiTextures.pattern(ctx, isPaper ? 'paper' : 'night');
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = isPaper ? 'multiply' : 'source-over';
  ctx.globalAlpha = isPaper ? 0.5 : 0.35;
  ctx.fillStyle = pattern;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  ctx.restore();
}
