/**
 * Canvas UI primitives for "这一身".
 *
 * The module deliberately owns no game state. Every exported drawing function
 * snaps to the logical pixel grid and uses only flat fills, so callers can draw
 * into a low-resolution canvas and scale it with nearest-neighbour filtering.
 */

import { overlayPanelTexture, uiTextures } from './ui-textures';

export const UI_PALETTE = {
  night: '#111116',
  nightRaised: '#1B1A20',
  ink: '#17151A',
  inkSoft: '#3E3A3D',
  paper: '#D8D0C1',
  paperLight: '#E8E1D3',
  paperDim: '#AAA297',
  paperShadow: '#786F69',
  oldRed: '#9F3548',
  oldRedDark: '#642231',
  raincoatYellow: '#C6A44A',
  raincoatShadow: '#75622F',
  hospitalBlueGray: '#71818A',
  hospitalBlueGrayDark: '#38434A',
  breath: '#E8E1D3',
  positive: '#779887',
  warning: '#B06961',
} as const;

export type UiPaletteKey = keyof typeof UI_PALETTE;
export type UiPaletteColor = (typeof UI_PALETTE)[UiPaletteKey];

/** Browser/system fallbacks are ordered from bitmap-first to conservative CJK. */
export const UI_FONT_STACK =
  '"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

export const UI_ARCHIVE_FONT_STACK =
  '"Songti SC", "Noto Serif CJK SC", "STSong", serif';

export const UI_FONT = {
  tiny: `8px ${UI_FONT_STACK}`,
  small: `9px ${UI_FONT_STACK}`,
  body: `11px ${UI_FONT_STACK}`,
  label: `bold 10px ${UI_FONT_STACK}`,
  title: `bold 14px ${UI_ARCHIVE_FONT_STACK}`,
  stamp: `bold 11px ${UI_ARCHIVE_FONT_STACK}`,
} as const;

export type UiStatIconKind =
  | 'life'
  | 'shield'
  | 'coins'
  | 'fate'
  | 'breath-power'
  | 'breath-speed'
  | 'breath-range';

export type UiResponseDirection = 'swallow' | 'exhale';

const snap = (value: number): number => Math.round(value);
const atLeast = (value: number, minimum: number): number => Math.max(minimum, snap(value));

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const characters = [...text];
  while (characters.length > 1 && ctx.measureText(`${characters.join('')}…`).width > maxWidth) characters.pop();
  return `${characters.join('')}…`;
}

function fillPixelShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  corner: number,
  color: string,
): void {
  const sx = snap(x);
  const sy = snap(y);
  const sw = atLeast(width, 1);
  const sh = atLeast(height, 1);
  const cut = Math.min(atLeast(corner, 0), Math.floor(sw / 3), Math.floor(sh / 3));
  ctx.fillStyle = color;
  if (cut <= 0) {
    ctx.fillRect(sx, sy, sw, sh);
    return;
  }
  ctx.fillRect(sx + cut, sy, sw - cut * 2, sh);
  ctx.fillRect(sx, sy + cut, sw, sh - cut * 2);
  for (let offset = 1; offset < cut; offset += 1) {
    ctx.fillRect(sx + cut - offset, sy + offset, sw - (cut - offset) * 2, 1);
    ctx.fillRect(sx + cut - offset, sy + sh - offset - 1, sw - (cut - offset) * 2, 1);
  }
}

function drawPixelFrameOnly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  corner: number,
  thickness: number,
  color: string,
): void {
  const sx = snap(x);
  const sy = snap(y);
  const sw = atLeast(width, 1);
  const sh = atLeast(height, 1);
  const cut = Math.min(atLeast(corner, 0), Math.floor(sw / 3), Math.floor(sh / 3));
  const line = Math.min(atLeast(thickness, 1), Math.ceil(Math.min(sw, sh) / 2));
  const innerWidth = sw - line * 2;
  const innerHeight = sh - line * 2;
  const innerCut = Math.max(0, cut - line);
  ctx.fillStyle = color;
  for (let row = 0; row < sh; row += 1) {
    const edgeDistance = Math.min(row, sh - row - 1);
    const outerInset = edgeDistance < cut ? cut - edgeDistance : 0;
    const outerLeft = outerInset;
    const outerRight = sw - outerInset;
    const innerRow = row - line;
    if (innerWidth <= 0 || innerHeight <= 0 || innerRow < 0 || innerRow >= innerHeight) {
      ctx.fillRect(sx + outerLeft, sy + row, outerRight - outerLeft, 1);
      continue;
    }
    const innerEdgeDistance = Math.min(innerRow, innerHeight - innerRow - 1);
    const inset = innerEdgeDistance < innerCut ? innerCut - innerEdgeDistance : 0;
    const innerLeft = line + inset;
    const innerRight = sw - line - inset;
    if (innerLeft > outerLeft) ctx.fillRect(sx + outerLeft, sy + row, innerLeft - outerLeft, 1);
    if (outerRight > innerRight) ctx.fillRect(sx + innerRight, sy + row, outerRight - innerRight, 1);
  }
}

function fillPattern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
  pattern: readonly string[],
): void {
  const px = atLeast(scale, 1);
  const sx = snap(x);
  const sy = snap(y);
  ctx.fillStyle = color;
  pattern.forEach((row, rowIndex) => {
    for (let column = 0; column < row.length; column += 1) {
      if (row[column] === '1') ctx.fillRect(sx + column * px, sy + rowIndex * px, px, px);
    }
  });
}

function hashPixel(x: number, y: number, seed: number): number {
  let value = Math.imul(x ^ snap(seed), 0x45d9f3b);
  value = Math.imul(value ^ y, 0x45d9f3b);
  value ^= value >>> 16;
  return value >>> 0;
}

/** Apply once per canvas or before a self-contained UI pass. */
export function applyPixelDiscipline(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.textBaseline = 'alphabetic';
}

/** Flat panel with stair-stepped cut corners and a one-colour outline. */
export function drawCutCornerPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string = UI_PALETTE.paper,
  border: string = UI_PALETTE.ink,
  corner: number = 4,
  borderWidth: number = 1,
): void {
  applyPixelDiscipline(ctx);
  fillPixelShape(ctx, x, y, width, height, corner, border);
  const line = atLeast(borderWidth, 1);
  const innerWidth = atLeast(width, 1) - line * 2;
  const innerHeight = atLeast(height, 1) - line * 2;
  if (innerWidth > 0 && innerHeight > 0) {
    fillPixelShape(ctx, x + line, y + line, innerWidth, innerHeight, Math.max(0, corner - line), fill);
    overlayPanelTexture(
      ctx, fill,
      snap(x) + line + corner, snap(y) + line + corner,
      innerWidth - corner * 2, innerHeight - corner * 2,
      [UI_PALETTE.paper, UI_PALETTE.paperLight],
      [UI_PALETTE.night, UI_PALETTE.nightRaised],
    );
  }
}

/** Two-line archive border with registration ticks, suitable for files and fate cards. */
export function drawArchiveFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string = UI_PALETTE.paper,
  ink: string = UI_PALETTE.ink,
  accent: string = UI_PALETTE.oldRed,
): void {
  const sx = snap(x);
  const sy = snap(y);
  const sw = atLeast(width, 14);
  const sh = atLeast(height, 14);
  drawCutCornerPanel(ctx, sx, sy, sw, sh, fill, ink, 5, 2);
  drawPixelFrameOnly(ctx, sx + 5, sy + 5, sw - 10, sh - 10, 2, 1, ink);
  ctx.fillStyle = accent;
  ctx.fillRect(sx + 9, sy + 1, 10, 2);
  ctx.fillRect(sx + 1, sy + 9, 2, 10);
  ctx.fillRect(sx + sw - 19, sy + sh - 3, 10, 2);
  ctx.fillRect(sx + sw - 3, sy + sh - 19, 2, 10);
  const ornament = uiTextures.corner;
  if (ornament && sw >= 120 && sh >= 120) {
    const size = 16;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.imageSmoothingEnabled = false;
    const positions: Array<[number, number, number]> = [
      [sx + 8 + size / 2, sy + 8 + size / 2, 0],
      [sx + sw - 8 - size / 2, sy + 8 + size / 2, Math.PI / 2],
      [sx + sw - 8 - size / 2, sy + sh - 8 - size / 2, Math.PI],
      [sx + 8 + size / 2, sy + sh - 8 - size / 2, -Math.PI / 2],
    ];
    for (const [px, py, angle] of positions) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.drawImage(ornament, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.restore();
  }
}

/** Old red ink stamp. Wear is deterministic for a stable frame-to-frame silhouette. */
export function drawRedStamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  seed: number = 1,
  color: string = UI_PALETTE.oldRed,
  labelColor: string = color,
  wearColor: string = UI_PALETTE.paper,
  fontSize?: number,
): void {
  const sx = snap(x);
  const sy = snap(y);
  const sw = atLeast(width, 22);
  const sh = atLeast(height, 18);
  const sealBase = uiTextures.seal;
  const sealAspect = sw / Math.max(1, sh);
  // Always establish a complete pixel frame first. The generated seal is a
  // worn corner mark (not a symmetric border), so it is only overprinted at a
  // low alpha on near-square stamps and never stretched into horizontal ones.
  drawPixelFrameOnly(ctx, sx, sy, sw, sh, 2, 2, color);
  drawPixelFrameOnly(ctx, sx + 4, sy + 4, sw - 8, sh - 8, 0, 1, color);
  if (sealBase && sw >= 56 && sealAspect >= 0.78 && sealAspect <= 1.28) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.28;
    ctx.drawImage(sealBase, sx, sy, sw, sh);
    ctx.restore();
  }
  // Wear the ink field before lettering so small mobile stamps keep a clean,
  // readable label while their frame still looks rubbed and uneven.
  drawDeterministicWear(ctx, sx + 2, sy + 2, sw - 4, sh - 4, seed, 9, wearColor, 1);
  ctx.fillStyle = labelColor;
  ctx.font = fontSize ? `bold ${fontSize}px ${UI_ARCHIVE_FONT_STACK}` : UI_FONT.stamp;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, sx + Math.floor(sw / 2), sy + Math.floor(sh / 2));
  ctx.textBaseline = 'alphabetic';
}

/** Dashed seam with square needle holes; orientation is horizontal or vertical. */
export function drawStitchDivider(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  orientation: string = 'horizontal',
  color: string = UI_PALETTE.paperShadow,
  dash: number = 5,
  gap: number = 3,
): void {
  const sx = snap(x);
  const sy = snap(y);
  const extent = atLeast(length, 0);
  const dashSize = atLeast(dash, 1);
  const stride = dashSize + atLeast(gap, 1);
  ctx.fillStyle = color;
  for (let offset = 0; offset < extent; offset += stride) {
    const span = Math.min(dashSize, extent - offset);
    if (orientation === 'vertical') ctx.fillRect(sx, sy + offset, 1, span);
    else ctx.fillRect(sx + offset, sy, span, 1);
  }
  if (orientation === 'vertical') {
    ctx.fillRect(sx - 1, sy, 3, 1);
    ctx.fillRect(sx - 1, sy + extent - 1, 3, 1);
  } else {
    ctx.fillRect(sx, sy - 1, 1, 3);
    ctx.fillRect(sx + extent - 1, sy - 1, 1, 3);
  }
}

/**
 * Life chapter rail. labels is a pipe-separated string; nodeCount should be 6
 * for the MVP or 8 for the complete canon.
 */
export function drawLifeChapterTrack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  nodeCount: number,
  activeNode: number,
  labels: string,
  showLabels: number = 1,
): void {
  const sx = snap(x);
  const sy = snap(y);
  const sw = atLeast(width, 24);
  const count = Math.min(8, Math.max(2, snap(nodeCount)));
  const active = Math.min(count - 1, Math.max(0, snap(activeNode)));
  const names = labels.split('|');
  const railStart = sx + 4;
  const railWidth = sw - 8;
  ctx.fillStyle = UI_PALETTE.inkSoft;
  ctx.fillRect(railStart, sy, railWidth, 2);
  const completedWidth = count > 1 ? Math.floor((railWidth * active) / (count - 1)) : 0;
  ctx.fillStyle = UI_PALETTE.oldRed;
  ctx.fillRect(railStart, sy, completedWidth, 2);

  for (let index = 0; index < count; index += 1) {
    const px = railStart + Math.floor((railWidth * index) / (count - 1));
    const color = index < active
      ? UI_PALETTE.oldRed
      : index === active
        ? UI_PALETTE.raincoatYellow
        : UI_PALETTE.paperShadow;
    ctx.fillStyle = UI_PALETTE.ink;
    ctx.fillRect(px - 4, sy - 4, 8, 10);
    ctx.fillStyle = color;
    ctx.fillRect(px - 2, sy - 2, 4, 6);
    if (index === active) {
      ctx.fillStyle = UI_PALETTE.paperLight;
      ctx.fillRect(px - 1, sy - 1, 2, 4);
    }
    if (showLabels > 0) {
      const label = names[index] ?? `${index + 1}`;
      ctx.fillStyle = index === active ? UI_PALETTE.paperLight : UI_PALETTE.paperDim;
      ctx.font = UI_FONT.tiny;
      ctx.textAlign = 'center';
      ctx.fillText(label, px, sy + 18 + (index % 2) * 9);
    }
  }
}

/** Draw a single 11x11 logical-pixel status symbol at an integer scale. */
export function drawStatusIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: UiStatIconKind,
  scale: number = 1,
  color: string = UI_PALETTE.paperLight,
): void {
  const patterns: Record<UiStatIconKind, readonly string[]> = {
    life: [
      '01100110',
      '11111111',
      '11111111',
      '01111110',
      '00111100',
      '00011000',
    ],
    shield: [
      '00111100',
      '01111110',
      '11111111',
      '11011011',
      '01111110',
      '00111100',
      '00011000',
    ],
    coins: [
      '00111100',
      '01111110',
      '11011011',
      '11100111',
      '11011011',
      '01111110',
      '00111100',
    ],
    fate: [
      '11111110',
      '10000110',
      '10110110',
      '10010110',
      '10110110',
      '10000110',
      '11111110',
    ],
    'breath-power': [
      '00011000',
      '00111100',
      '01111110',
      '11111111',
      '01111110',
      '00111100',
      '00011000',
    ],
    'breath-speed': [
      '00001100',
      '00111110',
      '11111111',
      '00111110',
      '00001100',
      '00000000',
      '11110000',
    ],
    'breath-range': [
      '11000011',
      '10011001',
      '00111100',
      '00111100',
      '10011001',
      '11000011',
    ],
  };
  fillPattern(ctx, x, y, scale, color, patterns[kind]);
  if (kind.startsWith('breath')) {
    const px = atLeast(scale, 1);
    ctx.fillStyle = UI_PALETTE.paperShadow;
    ctx.fillRect(snap(x) + px * 3, snap(y) + px * 2, px * 2, px * 2);
  }
}

/** Icon + label + value readout; dimensions remain stable as values change. */
export function drawStatusReadout(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  kind: UiStatIconKind,
  label: string,
  value: string,
  accent: string = UI_PALETTE.paperLight,
): void {
  const sx = snap(x);
  const sy = snap(y);
  const sw = atLeast(width, 44);
  ctx.fillStyle = UI_PALETTE.nightRaised;
  ctx.fillRect(sx, sy, sw, 22);
  ctx.fillStyle = UI_PALETTE.inkSoft;
  ctx.fillRect(sx, sy + 21, sw, 1);
  drawStatusIcon(ctx, sx + 5, sy + 7, kind, 1, accent);
  ctx.textAlign = 'left';
  ctx.fillStyle = UI_PALETTE.paperDim;
  ctx.font = UI_FONT.tiny;
  ctx.fillText(label, sx + 18, sy + 9);
  ctx.fillStyle = accent;
  ctx.font = UI_FONT.label;
  ctx.fillText(value, sx + 18, sy + 19);
}

/** Stair-step folded top-right paper corner. */
export function drawPaperFold(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  paper: string = UI_PALETTE.paper,
  fold: string = UI_PALETTE.paperShadow,
  ink: string = UI_PALETTE.ink,
): void {
  const sx = snap(x);
  const sy = snap(y);
  const extent = atLeast(size, 6);
  ctx.fillStyle = paper;
  ctx.fillRect(sx, sy, extent, extent);
  ctx.fillStyle = ink;
  for (let offset = 0; offset < extent; offset += 2) {
    const span = Math.min(2, extent - offset);
    ctx.fillRect(sx + extent - offset - span, sy + offset, span, extent - offset);
  }
  ctx.fillStyle = fold;
  for (let offset = 2; offset < extent; offset += 2) {
    const span = Math.min(2, extent - offset);
    ctx.fillRect(sx + extent - offset, sy, span, offset);
  }
  ctx.fillStyle = paper;
  ctx.fillRect(sx, sy + 2, Math.max(0, extent - 4), Math.max(0, extent - 2));
}

/**
 * Direction marker for the non-moral binary response: swallow / exhale.
 * detail is intentionally short; the fate fact itself belongs on the card.
 */
export function drawResponseMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  direction: UiResponseDirection,
  label: string,
  detail: string,
): void {
  const sx = snap(x);
  const sy = snap(y);
  const sw = atLeast(width, 96);
  const isSwallow = direction === 'swallow';
  const accent = isSwallow ? UI_PALETTE.hospitalBlueGray : UI_PALETTE.oldRed;
  drawCutCornerPanel(ctx, sx, sy, sw, 46, UI_PALETTE.nightRaised, accent, 3, 1);
  const arrowX = isSwallow ? sx + 7 : sx + sw - 16;
  ctx.fillStyle = accent;
  ctx.fillRect(arrowX + (isSwallow ? 4 : 0), sy + 10, 8, 3);
  ctx.fillRect(arrowX + (isSwallow ? 2 : 8), sy + 13, 6, 3);
  ctx.fillRect(arrowX + (isSwallow ? 0 : 12), sy + 16, 4, 3);
  ctx.fillRect(arrowX + (isSwallow ? 2 : 8), sy + 19, 6, 3);
  ctx.fillRect(arrowX + (isSwallow ? 4 : 0), sy + 22, 8, 3);
  const textX = isSwallow ? sx + 25 : sx + 8;
  const textWidth = isSwallow ? sw - 33 : sw - 32;
  ctx.textAlign = 'left';
  ctx.fillStyle = UI_PALETTE.paperLight;
  ctx.font = `bold 11px ${UI_FONT_STACK}`;
  ctx.fillText(fitText(ctx, label, textWidth), textX, sy + 17);
  ctx.fillStyle = UI_PALETTE.paperDim;
  ctx.font = `10px ${UI_FONT_STACK}`;
  ctx.fillText(fitText(ctx, detail, textWidth), textX, sy + 34);
}

/**
 * Stable point damage and rubbed patches. density is a percentage from 0..100;
 * the same geometry and seed always produce the same pixels.
 */
export function drawDeterministicWear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  density: number,
  color: string = UI_PALETTE.paperShadow,
  pixelSize: number = 1,
): void {
  const sx = snap(x);
  const sy = snap(y);
  const sw = atLeast(width, 0);
  const sh = atLeast(height, 0);
  const px = atLeast(pixelSize, 1);
  const threshold = Math.min(100, Math.max(0, snap(density)));
  ctx.fillStyle = color;
  for (let py = 0; py < sh; py += px * 2) {
    for (let pxOffset = 0; pxOffset < sw; pxOffset += px * 2) {
      const hash = hashPixel(sx + pxOffset, sy + py, seed);
      if (hash % 100 >= threshold) continue;
      const size = hash % 11 === 0 ? px * 2 : px;
      ctx.fillRect(sx + pxOffset, sy + py, Math.min(size, sw - pxOffset), Math.min(px, sh - py));
    }
  }
}
