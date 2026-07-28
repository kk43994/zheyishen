// UI 纹理与饰件：image2 基底 + scripts/process_ui_textures.py 规整产物。
// 正式入口由完整美术闸门保证这些纹理已解码；null 分支只供开发期诊断。
import { loadArtImage } from './art-runtime';

const PAPER_URL = new URL('./assets/ui/paper-texture.png', import.meta.url).href;
const NIGHT_URL = new URL('./assets/ui/night-texture.png', import.meta.url).href;
const CORNER_URL = new URL('./assets/ui/corner-ornament.png', import.meta.url).href;
const SEAL_URL = new URL('./assets/ui/seal-ornament.png', import.meta.url).href;
const STATIC_URL = new URL('./assets/ui/static-texture.png', import.meta.url).href;
const RECORD_FRAMES_URL = new URL('./assets/ui/record-frames.png', import.meta.url).href;
const BUTTON_FRAME_URL = new URL('./assets/ui/button-frame.png', import.meta.url).href;
const BUTTON_STAMP_STATES_URL = new URL('./assets/ui/button-stamp-states.png', import.meta.url).href;
const PANEL_FRAME_URL = new URL('./assets/ui/panel-frame.png', import.meta.url).href;
const TORN_EDGE_URL = new URL('./assets/ui/torn-edge.png', import.meta.url).href;
const RECEIPT_EDGE_URL = new URL('./assets/ui/receipt-edge.png', import.meta.url).href;
const ARCHIVE_DECO_URL = new URL('./assets/ui/archive-deco.png', import.meta.url).href;
const DESK_URL = new URL('./assets/ui/desk-texture.png', import.meta.url).href;

type ArchiveDecoration = 'tape' | 'clip' | 'postmark' | 'seal';
export type StampButtonState = 'normal' | 'hover' | 'pressed' | 'disabled';
const ARCHIVE_DECORATION_INDEX = (archiveDecoManifest as { index: Record<ArchiveDecoration, number> }).index;
const STAMP_BUTTON_INDEX: Record<StampButtonState, number> = {
  normal: 0,
  hover: 1,
  pressed: 2,
  disabled: 3,
};

function loadImage(url: string, onload: (image: HTMLImageElement) => void): void {
  void loadArtImage(url, 'critical').then(onload).catch((error: unknown) => {
    console.error('正式 UI 纹理加载失败；完整美术闸门应阻断启动。', error);
  });
}

class UiTextures {
  private paper: HTMLImageElement | null = null;
  private night: HTMLImageElement | null = null;
  private static_: HTMLImageElement | null = null;
  corner: HTMLImageElement | null = null;
  seal: HTMLImageElement | null = null;
  recordFrames: HTMLImageElement | null = null;
  buttonFrame: HTMLImageElement | null = null;
  buttonStampStates: HTMLImageElement | null = null;
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
    loadImage(BUTTON_STAMP_STATES_URL, (image) => { this.buttonStampStates = image; });
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

  /** Image2 红章按钮框：四态逐行存放，以九宫格保持角落断墨与校准记号。 */
  drawStampButtonFrame(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    state: StampButtonState,
    alpha = 1,
  ): boolean {
    const image = this.buttonStampStates;
    if (!image || image.naturalWidth !== 384 || image.naturalHeight !== 480) return false;
    const sourceY = STAMP_BUTTON_INDEX[state] * 120;
    const sourceCornerX = 48;
    const sourceCornerY = 36;
    const destCornerX = Math.min(12, Math.floor(width / 3));
    const destCornerY = Math.min(9, Math.floor(height / 3));
    const sourceXs = [0, sourceCornerX, 384 - sourceCornerX] as const;
    const sourceYs = [sourceY, sourceY + sourceCornerY, sourceY + 120 - sourceCornerY] as const;
    const sourceWidths = [sourceCornerX, 384 - sourceCornerX * 2, sourceCornerX] as const;
    const sourceHeights = [sourceCornerY, 120 - sourceCornerY * 2, sourceCornerY] as const;
    const destXs = [x, x + destCornerX, x + width - destCornerX] as const;
    const destYs = [y, y + destCornerY, y + height - destCornerY] as const;
    const destWidths = [destCornerX, width - destCornerX * 2, destCornerX] as const;
    const destHeights = [destCornerY, height - destCornerY * 2, destCornerY] as const;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        ctx.drawImage(
          image,
          sourceXs[col]!, sourceYs[row]!, sourceWidths[col]!, sourceHeights[row]!,
          destXs[col]!, destYs[row]!, destWidths[col]!, destHeights[row]!,
        );
      }
    }
    ctx.restore();
    return true;
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
