// UI 纹理与饰件：image2 基底 + scripts/process_ui_textures.py 规整产物。
// 全部为可选增强：未加载完成时所有绘制函数保持原样，不产生任何视觉变化。
const PAPER_URL = new URL('./assets/ui/paper-texture.png', import.meta.url).href;
const NIGHT_URL = new URL('./assets/ui/night-texture.png', import.meta.url).href;
const CORNER_URL = new URL('./assets/ui/corner-ornament.png', import.meta.url).href;
const SEAL_URL = new URL('./assets/ui/seal-ornament.png', import.meta.url).href;
const STATIC_URL = new URL('./assets/ui/static-texture.png', import.meta.url).href;
const RECORD_FRAMES_URL = new URL('./assets/ui/record-frames.png', import.meta.url).href;
const BUTTON_FRAME_URL = new URL('./assets/ui/button-frame.png', import.meta.url).href;
const PANEL_FRAME_URL = new URL('./assets/ui/panel-frame.png', import.meta.url).href;
const TORN_EDGE_URL = new URL('./assets/ui/torn-edge.png', import.meta.url).href;
const RECEIPT_EDGE_URL = new URL('./assets/ui/receipt-edge.png', import.meta.url).href;
const ARCHIVE_DECO_URL = new URL('./assets/ui/archive-deco.png', import.meta.url).href;
const DESK_URL = new URL('./assets/ui/desk-texture.png', import.meta.url).href;

type ArchiveDecoration = 'tape' | 'clip' | 'postmark' | 'seal';
const ARCHIVE_DECORATION_INDEX = (archiveDecoManifest as { index: Record<ArchiveDecoration, number> }).index;

function loadImage(url: string, onload: (image: HTMLImageElement) => void): void {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => onload(image);
  image.src = url;
}

class UiTextures {
  private paper: HTMLImageElement | null = null;
  private night: HTMLImageElement | null = null;
  private static_: HTMLImageElement | null = null;
  corner: HTMLImageElement | null = null;
  seal: HTMLImageElement | null = null;
  recordFrames: HTMLImageElement | null = null;
  buttonFrame: HTMLImageElement | null = null;
  panelFrame: HTMLImageElement | null = null;
  tornEdge: HTMLImageElement | null = null;
  receiptEdge: HTMLImageElement | null = null;
  archiveDeco: HTMLImageElement | null = null;
  private desk: HTMLImageElement | null = null;
  private paperPattern: CanvasPattern | null = null;
  private nightPattern: CanvasPattern | null = null;
  private staticPattern: CanvasPattern | null = null;
  private deskPattern: CanvasPattern | null = null;

  load(): void {
    loadImage(PAPER_URL, (image) => { this.paper = image; });
    loadImage(NIGHT_URL, (image) => { this.night = image; });
    loadImage(CORNER_URL, (image) => { this.corner = image; });
    loadImage(SEAL_URL, (image) => { this.seal = image; });
    loadImage(STATIC_URL, (image) => { this.static_ = image; });
    loadImage(RECORD_FRAMES_URL, (image) => { this.recordFrames = image; });
    loadImage(BUTTON_FRAME_URL, (image) => { this.buttonFrame = image; });
    loadImage(PANEL_FRAME_URL, (image) => { this.panelFrame = image; });
    loadImage(TORN_EDGE_URL, (image) => { this.tornEdge = image; });
    loadImage(RECEIPT_EDGE_URL, (image) => { this.receiptEdge = image; });
    loadImage(ARCHIVE_DECO_URL, (image) => { this.archiveDeco = image; });
    loadImage(DESK_URL, (image) => { this.desk = image; });
  }

  /** 手绘按钮框：拉伸盖在按钮矩形上。未加载时不绘制。 */
  drawButtonFrame(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, alpha = 0.8): void {
    if (!this.buttonFrame) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buttonFrame, x, y, width, height);
    ctx.restore();
  }

  drawPanelFrame(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, alpha = 0.72): void {
    if (!this.panelFrame) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.panelFrame, x, y, width, height);
    ctx.restore();
  }

  drawArchiveDecoration(
    ctx: CanvasRenderingContext2D,
    kind: ArchiveDecoration,
    x: number,
    y: number,
    size: number,
    alpha = 0.9,
    rotation = 0,
  ): void {
    if (!this.archiveDeco) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(rotation);
    ctx.drawImage(this.archiveDeco, ARCHIVE_DECORATION_INDEX[kind] * 36, 0, 36, 36, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  drawPaperEdge(
    ctx: CanvasRenderingContext2D,
    kind: 'torn' | 'receipt',
    x: number,
    y: number,
    width: number,
    height: number,
    alpha = 0.75,
  ): void {
    const image = kind === 'torn' ? this.tornEdge : this.receiptEdge;
    if (!image) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
  }

  /** 品质档案条框：quality 1-4 选行，拉伸盖在档案条边缘。未加载时不绘制。 */
  drawRecordFrame(ctx: CanvasRenderingContext2D, quality: number, x: number, y: number, width: number, height: number, alpha = 0.85): void {
    if (!this.recordFrames) return;
    const row = Math.min(3, Math.max(0, quality - 1));
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.recordFrames, 0, row * 56, 128, 56, x, y, width, height);
    ctx.restore();
  }

  pattern(ctx: CanvasRenderingContext2D, kind: 'paper' | 'night' | 'static' | 'desk'): CanvasPattern | null {
    if (kind === 'paper') {
      if (!this.paperPattern && this.paper) this.paperPattern = ctx.createPattern(this.paper, 'repeat');
      return this.paperPattern;
    }
    if (kind === 'static') {
      if (!this.staticPattern && this.static_) this.staticPattern = ctx.createPattern(this.static_, 'repeat');
      return this.staticPattern;
    }
    if (kind === 'desk') {
      if (!this.deskPattern && this.desk) this.deskPattern = ctx.createPattern(this.desk, 'repeat');
      return this.deskPattern;
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
import archiveDecoManifest from './assets/ui/archive-deco.json';
