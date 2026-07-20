import type { AppearanceDNA, ItemId } from './types';
import {
  HERO_FRAME_HEIGHT,
  HERO_FRAME_WIDTH,
  type HeroFacing,
} from './hero-morph';
import { drawHeroItemMutationPass } from './hero-item-mutations';
import { drawHeroItemPixelPass } from './hero-item-pixel';
import { heroStyle1Atlas } from './hero-style1-atlas';

const SURFACE_W = 40;
const SURFACE_H = 56;
const PIVOT_X = 20;
const PIVOT_Y = 49;
const CACHE_LIMIT = 64;

type Point = readonly [number, number];

export interface PixelHeroState {
  appearance: AppearanceDNA;
  ageStep: 0 | 1 | 2 | 3 | 4 | 5;
  items: readonly ItemId[];
  facing: HeroFacing;
  motion: 'idle' | 'walk' | 'attack' | 'hurt';
  frame: 0 | 1 | 2 | 3;
  hurt?: boolean;
}

interface HeroPose {
  centerX: number;
  torsoTop: number;
  torsoWidth: number;
  torsoHeight: number;
  headX: number;
  headY: number;
  headWidth: number;
  headHeight: number;
  shoulderY: number;
  handY: number;
  footY: number;
  lean: number;
}

const SKIN: Record<AppearanceDNA['skinTone'], string> = {
  paper: '#cbbba5',
  warm: '#b9a38c',
  cool: '#aaa4a0',
  brown: '#95745e',
  deep: '#705247',
};

const HAIR: Record<AppearanceDNA['hairColor'], string> = {
  ink: '#1c1b20',
  brown: '#44342f',
  soft_black: '#2c2a2e',
};

const OUTFIT: Record<AppearanceDNA['outfit'], string> = {
  undershirt: '#948a7f',
  old_sweater: '#646267',
  uniform_liner: '#526774',
  plain_shirt: '#756d66',
};

class PixelSurface {
  constructor(private ctx: CanvasRenderingContext2D) {}

  clear(): void {
    this.ctx.clearRect(0, 0, SURFACE_W, SURFACE_H);
  }

  pixel(x: number, y: number, color: string): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= SURFACE_W || py >= SURFACE_H) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(px, py, 1, 1);
  }

  rect(x: number, y: number, width: number, height: number, color: string): void {
    const left = Math.round(x);
    const top = Math.round(y);
    const right = Math.round(x + width);
    const bottom = Math.round(y + height);
    if (right <= 0 || bottom <= 0 || left >= SURFACE_W || top >= SURFACE_H) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(left, top, right - left, bottom - top);
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string, thickness = 1): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const endX = Math.round(x1);
    const endY = Math.round(y1);
    const dx = Math.abs(endX - x);
    const sx = x < endX ? 1 : -1;
    const dy = -Math.abs(endY - y);
    const sy = y < endY ? 1 : -1;
    let error = dx + dy;
    const radius = Math.max(0, Math.floor((thickness - 1) / 2));
    while (true) {
      this.rect(x - radius, y - radius, radius * 2 + 1, radius * 2 + 1, color);
      if (x === endX && y === endY) break;
      const doubled = error * 2;
      if (doubled >= dy) { error += dy; x += sx; }
      if (doubled <= dx) { error += dx; y += sy; }
    }
  }

  ellipse(centerX: number, centerY: number, radiusX: number, radiusY: number, color: string): void {
    const rx = Math.max(1, Math.round(radiusX));
    const ry = Math.max(1, Math.round(radiusY));
    for (let y = -ry; y <= ry; y += 1) {
      const ratio = 1 - (y * y) / (ry * ry);
      const span = Math.round(rx * Math.sqrt(Math.max(0, ratio)));
      this.rect(centerX - span, centerY + y, span * 2 + 1, 1, color);
    }
  }

  polygon(points: readonly Point[], color: string): void {
    if (points.length < 3) return;
    const minY = Math.floor(Math.min(...points.map((point) => point[1])));
    const maxY = Math.ceil(Math.max(...points.map((point) => point[1])));
    for (let y = minY; y <= maxY; y += 1) {
      const intersections: number[] = [];
      for (let index = 0; index < points.length; index += 1) {
        const current = points[index]!;
        const next = points[(index + 1) % points.length]!;
        const [x1, y1] = current;
        const [x2, y2] = next;
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
      intersections.sort((first, second) => first - second);
      for (let index = 0; index + 1 < intersections.length; index += 2) {
        const from = Math.ceil(intersections[index]!);
        const to = Math.floor(intersections[index + 1]!);
        if (to >= from) this.rect(from, y, to - from + 1, 1, color);
      }
    }
  }
}

export class PixelHeroRenderer {
  private cache = new Map<string, HTMLCanvasElement>();

  constructor() {
    void heroStyle1Atlas.whenReady()
      .then(() => this.clear())
      .catch((error: unknown) => {
        console.warn('主角像素图集加载失败，继续使用程序化角色。', error);
      });
  }

  clear(): void {
    this.cache.clear();
  }

  draw(
    target: CanvasRenderingContext2D,
    screenX: number,
    bodyCenterY: number,
    requestedScale: number,
    state: PixelHeroState,
  ): void {
    const frame = this.getFrame(state);
    const pixelScale = requestedScale >= 1.3 ? 3 : 2;
    const groundY = Math.round(bodyCenterY + 35 * requestedScale);
    const destinationX = Math.round(screenX - PIVOT_X * pixelScale);
    const destinationY = Math.round(groundY - PIVOT_Y * pixelScale);
    const previousSmoothing = target.imageSmoothingEnabled;
    target.imageSmoothingEnabled = false;
    target.drawImage(frame, destinationX, destinationY, SURFACE_W * pixelScale, SURFACE_H * pixelScale);
    target.imageSmoothingEnabled = previousSmoothing;
  }

  private getFrame(state: PixelHeroState): HTMLCanvasElement {
    const key = this.cacheKey(state);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    const canvas = document.createElement('canvas');
    canvas.width = SURFACE_W;
    canvas.height = SURFACE_H;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('无法创建程序化像素主角画布');
    context.imageSmoothingEnabled = false;
    const atlasFrame = heroStyle1Atlas.slice(
      state.motion,
      state.facing,
      state.frame,
      state.appearance.stature,
      state.appearance.bodyBuild,
    );
    if (atlasFrame) {
      this.paintAtlasFrame(context, atlasFrame, state);
    } else {
      const surface = new PixelSurface(context);
      this.paint(surface, state);
    }
    this.cache.set(key, canvas);
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest) this.cache.delete(oldest);
    }
    return canvas;
  }

  private cacheKey(state: PixelHeroState): string {
    const dna = state.appearance;
    const appearance = [
      dna.skinTone, dna.faceShape, dna.eyeShape, dna.hairStyle, dna.hairColor,
      dna.stature, dna.bodyBuild, dna.posture, dna.outfit, dna.feature,
    ].join(':');
    return `${appearance}|${state.facing}|${state.motion}|${state.ageStep}|${[...state.items].sort().join(',')}|${state.frame}|${state.hurt ? 1 : 0}`;
  }

  private paintAtlasFrame(
    target: CanvasRenderingContext2D,
    atlasFrame: HTMLCanvasElement,
    state: PixelHeroState,
  ): void {
    const source = atlasFrame.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!source) throw new Error('无法读取主角像素图集帧');
    const sourceImage = source.getImageData(0, 0, HERO_FRAME_WIDTH, HERO_FRAME_HEIGHT);
    const hairMask = heroStyle1Atlas.sliceHairMask(
      state.motion,
      state.facing,
      state.frame,
      state.appearance.stature,
      state.appearance.bodyBuild,
    );
    this.recolorAtlasFrame(sourceImage, state, hairMask);
    const assembledCanvas = document.createElement('canvas');
    assembledCanvas.width = HERO_FRAME_WIDTH;
    assembledCanvas.height = HERO_FRAME_HEIGHT;
    const assembled = assembledCanvas.getContext('2d', { alpha: true });
    if (!assembled) throw new Error('无法合成主角像素帧');
    assembled.imageSmoothingEnabled = false;
    drawHeroItemMutationPass(assembled, state, 'behind');
    drawHeroItemPixelPass(assembled, state, 'behind');
    assembled.putImageData(sourceImage, 0, 0);
    if (state.items.includes('fathers-raincoat')) {
      const raincoat = heroStyle1Atlas.sliceRaincoat(
        state.motion,
        state.facing,
        state.frame,
        state.appearance.stature,
        state.appearance.bodyBuild,
      );
      if (raincoat) assembled.drawImage(raincoat, 0, 0);
    }
    drawHeroItemPixelPass(assembled, state, 'front');
    drawHeroItemMutationPass(assembled, state, 'front');
    const assembledImage = assembled.getImageData(0, 0, HERO_FRAME_WIDTH, HERO_FRAME_HEIGHT);
    this.applyAgeMorph(assembledImage, state);
    target.clearRect(0, 0, HERO_FRAME_WIDTH, HERO_FRAME_HEIGHT);
    target.putImageData(assembledImage, 0, 0);
  }

  /** Keeps the approved atlas identity while making later life chapters visibly older. */
  private applyAgeMorph(image: ImageData, state: PixelHeroState): void {
    const age = state.ageStep;
    if (age < 3) return;
    const source = new Uint8ClampedArray(image.data);
    const sideLean = state.facing === 'left' ? -1 : state.facing === 'right' ? 1 : 0;
    const shift = sideLean * Math.min(2, age - 2);
    image.data.fill(0);
    for (let y = 0; y < HERO_FRAME_HEIGHT; y += 1) {
      // Keep the feet and root fixed. Only the upper body leans into age.
      const dx = y < 44 ? shift : 0;
      for (let x = 0; x < HERO_FRAME_WIDTH; x += 1) {
        const destinationX = x + dx;
        if (destinationX < 0 || destinationX >= HERO_FRAME_WIDTH) continue;
        const sourceOffset = (y * HERO_FRAME_WIDTH + x) * 4;
        const destinationOffset = (y * HERO_FRAME_WIDTH + destinationX) * 4;
        image.data[destinationOffset] = source[sourceOffset]!;
        image.data[destinationOffset + 1] = source[sourceOffset + 1]!;
        image.data[destinationOffset + 2] = source[sourceOffset + 2]!;
        image.data[destinationOffset + 3] = source[sourceOffset + 3]!;
      }
    }

    if (age < 4) return;
    // A few deterministic one-pixel creases are enough at this resolution;
    // they stay within skin pixels and never alter the approved silhouette.
    const wrinkle = [146, 119, 100] as const;
    for (let y = 18; y <= 24; y += 3) {
      for (let x = 13; x < 28; x += 5) {
        const offset = (y * HERO_FRAME_WIDTH + x) * 4;
        if (image.data[offset + 3]! === 255 && image.data[offset]! >= 180 && image.data[offset + 1]! >= 160) {
          image.data[offset] = wrinkle[0];
          image.data[offset + 1] = wrinkle[1];
          image.data[offset + 2] = wrinkle[2];
        }
      }
    }
  }

  private recolorAtlasFrame(
    image: ImageData,
    state: PixelHeroState,
    hairMask: HTMLCanvasElement | null,
  ): void {
    const skinPalettes: Record<AppearanceDNA['skinTone'], readonly [number, number, number][]> = {
      // "warm" is the selected mother sprite's exact palette.
      warm: [[218, 208, 186], [199, 181, 158], [146, 119, 100]],
      paper: [[226, 218, 202], [207, 196, 178], [156, 137, 122]],
      cool: [[202, 199, 194], [176, 171, 168], [126, 117, 116]],
      brown: [[167, 132, 105], [143, 105, 83], [99, 72, 63]],
      deep: [[126, 91, 76], [104, 72, 63], [72, 51, 49]],
    };
    const outfitPalettes: Record<AppearanceDNA['outfit'], readonly [number, number, number][]> = {
      // "old_sweater" is the selected mother sprite's exact palette.
      old_sweater: [[55, 52, 58], [103, 98, 98]],
      undershirt: [[132, 122, 111], [181, 168, 151]],
      uniform_liner: [[67, 88, 101], [126, 145, 148]],
      plain_shirt: [[108, 99, 91], [153, 142, 132]],
    };
    const sourceSkin = [[218, 208, 186], [199, 181, 158], [146, 119, 100]] as const;
    const targetSkin = state.items.includes('painless-night')
      ? [[151, 151, 157], [126, 126, 133], [90, 88, 98]] as const
      : skinPalettes[state.appearance.skinTone];
    const targetOutfit = state.items.includes('small-uniform')
      ? [[64, 89, 105], [111, 137, 148]] as const
      : outfitPalettes[state.appearance.outfit];

    const matches = (offset: number, color: readonly number[]) => (
      image.data[offset] === color[0]
      && image.data[offset + 1] === color[1]
      && image.data[offset + 2] === color[2]
      && image.data[offset + 3] === 255
    );
    const replace = (offset: number, color: readonly number[]) => {
      image.data[offset] = color[0]!;
      image.data[offset + 1] = color[1]!;
      image.data[offset + 2] = color[2]!;
    };

    for (let y = 0; y < HERO_FRAME_HEIGHT; y += 1) {
      for (let x = 0; x < HERO_FRAME_WIDTH; x += 1) {
        const offset = (y * HERO_FRAME_WIDTH + x) * 4;
        const skinIndex = sourceSkin.findIndex((color) => matches(offset, color));
        if (skinIndex >= 0) {
          replace(offset, targetSkin[skinIndex]!);
          continue;
        }
        if (y >= 22 && y <= 40) {
          if (matches(offset, [55, 52, 58])) replace(offset, targetOutfit[0]!);
          else if (matches(offset, [103, 98, 98])) replace(offset, targetOutfit[1]!);
        }
      }
    }

    this.recolorHairFromMask(image, hairMask, state);
  }

  private recolorHairFromMask(
    image: ImageData,
    hairMask: HTMLCanvasElement | null,
    state: PixelHeroState,
  ): void {
    const target = state.items.includes('bleach-powder')
      ? [215, 200, 79]
      : state.ageStep >= 4
        ? [103, 98, 98]
      : state.appearance.hairColor === 'brown'
        ? [68, 52, 47]
        : state.appearance.hairColor === 'soft_black'
          ? [44, 42, 46]
          : [23, 21, 27];
    if (target[0] === 23 && target[1] === 21 && target[2] === 27) return;
    if (!hairMask) return;
    const maskContext = hairMask.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!maskContext) return;
    const mask = maskContext.getImageData(0, 0, HERO_FRAME_WIDTH, HERO_FRAME_HEIGHT).data;
    for (let pixel = 0; pixel < HERO_FRAME_WIDTH * HERO_FRAME_HEIGHT; pixel += 1) {
      const offset = pixel * 4;
      if (mask[offset + 3] !== 255 || image.data[offset + 3] !== 255) continue;
      image.data[offset] = target[0]!;
      image.data[offset + 1] = target[1]!;
      image.data[offset + 2] = target[2]!;
    }
  }

  private paint(surface: PixelSurface, state: PixelHeroState): void {
    surface.clear();
    const owns = (id: ItemId) => state.items.includes(id);
    const pose = this.resolvePose(state, owns);
    const outline = state.hurt ? '#6f2332' : '#1b1a1e';
    const skin = SKIN[state.appearance.skinTone];
    const step = state.frame === 0 ? 0 : 1;

    surface.ellipse(PIVOT_X, PIVOT_Y + 2, 9, 2, 'rgba(9,8,11,.45)');
    this.paintBehind(surface, pose, owns, outline);

    const leftLegX = pose.centerX - Math.max(3, Math.floor(pose.torsoWidth / 3));
    const rightLegX = pose.centerX + Math.max(2, Math.floor(pose.torsoWidth / 3));
    const leftFootY = pose.footY - step;
    const rightFootY = pose.footY - (1 - step);
    surface.line(leftLegX, pose.torsoTop + pose.torsoHeight - 1, leftLegX - 1, leftFootY, outline, 3);
    surface.line(rightLegX, pose.torsoTop + pose.torsoHeight - 1, rightLegX + 1, rightFootY, outline, 3);
    surface.line(leftLegX, pose.torsoTop + pose.torsoHeight, leftLegX - 1, leftFootY - 1, '#5e554e', 1);
    surface.line(rightLegX, pose.torsoTop + pose.torsoHeight, rightLegX + 1, rightFootY - 1, '#5e554e', 1);
    surface.rect(leftLegX - 3, leftFootY, 5, 2, outline);
    surface.rect(rightLegX - 1, rightFootY, 5, 2, outline);

    const shoulderOffset = Math.ceil(pose.torsoWidth / 2);
    surface.line(pose.centerX - shoulderOffset, pose.shoulderY, pose.centerX - shoulderOffset - 2, pose.handY, outline, 4);
    surface.line(pose.centerX + shoulderOffset, pose.shoulderY, pose.centerX + shoulderOffset + 2, pose.handY, outline, 4);
    surface.line(pose.centerX - shoulderOffset, pose.shoulderY, pose.centerX - shoulderOffset - 2, pose.handY, skin, 2);
    surface.line(pose.centerX + shoulderOffset, pose.shoulderY, pose.centerX + shoulderOffset + 2, pose.handY, skin, 2);

    const bodyColor = owns('small-uniform') ? '#405969' : OUTFIT[state.appearance.outfit];
    surface.polygon([
      [pose.centerX - shoulderOffset - 1, pose.torsoTop],
      [pose.centerX + shoulderOffset + 1, pose.torsoTop],
      [pose.centerX + shoulderOffset, pose.torsoTop + pose.torsoHeight],
      [pose.centerX - shoulderOffset, pose.torsoTop + pose.torsoHeight],
    ], outline);
    surface.rect(
      pose.centerX - shoulderOffset + 1,
      pose.torsoTop + 1,
      shoulderOffset * 2 - 1,
      pose.torsoHeight - 2,
      bodyColor,
    );
    this.paintBaseClothes(surface, pose, state.appearance);
    if (owns('fathers-raincoat')) this.paintRaincoat(surface, pose, outline);

    this.paintHead(surface, pose, state.appearance, skin, outline, owns, state.ageStep);
    this.paintFrontItems(surface, pose, owns, outline);

    if (owns('broken-spine')) {
      const spineX = pose.centerX + 1;
      surface.line(spineX, pose.torsoTop + 2, spineX + 2, pose.torsoTop + 7, '#e2d5b6', 2);
      surface.line(spineX + 2, pose.torsoTop + 8, spineX - 1, pose.torsoTop + 12, '#b74a52', 1);
    }
    if (owns('spent-decade')) {
      surface.pixel(pose.headX - 3, pose.headY + 1, '#ded8ca');
      surface.pixel(pose.headX + 4, pose.headY, '#ded8ca');
    }
    if (owns('painless-night')) {
      surface.rect(pose.centerX - 5, pose.footY + 2, 11, 1, '#5b5672');
    }
  }

  private resolvePose(state: PixelHeroState, owns: (id: ItemId) => boolean): HeroPose {
    const age = state.ageStep;
    const bodyBuild = state.appearance.bodyBuild;
    const torsoWidth = { slim: 7, average: 9, sturdy: 11, soft: 10 }[bodyBuild];
    const torsoHeight = 12 + Math.min(4, age);
    const faceSize = {
      round: [11, 10], long: [9, 12], square: [11, 10], narrow: [8, 11],
    }[state.appearance.faceShape] as [number, number];
    const posture = { upright: 0, guarded: 1, alert: -1, slight_slouch: 2 }[state.appearance.posture];
    const burden = posture
      + (owns('stone-schoolbag') ? 2 : 0)
      + (owns('fathers-raincoat') ? 1 : 0)
      + (owns('broken-spine') ? 4 : 0)
      + (age >= 4 ? age - 3 : 0);
    const centerX = PIVOT_X;
    const torsoTop = 25 - Math.min(3, age) + Math.max(0, Math.floor(burden / 3));
    const headX = centerX + burden;
    const headY = torsoTop - Math.floor(faceSize[1] / 2) - 3 + Math.max(0, Math.floor(burden / 3));
    return {
      centerX,
      torsoTop,
      torsoWidth,
      torsoHeight,
      headX,
      headY,
      headWidth: faceSize[0],
      headHeight: faceSize[1],
      shoulderY: torsoTop + 3,
      handY: torsoTop + torsoHeight - 1,
      footY: PIVOT_Y,
      lean: burden,
    };
  }

  private paintBehind(
    surface: PixelSurface,
    pose: HeroPose,
    owns: (id: ItemId) => boolean,
    outline: string,
  ): void {
    if (owns('empty-frame')) {
      surface.rect(pose.centerX - 13, pose.torsoTop - 7, 27, 2, '#6d4c35');
      surface.rect(pose.centerX - 13, pose.torsoTop + 19, 27, 2, '#6d4c35');
      surface.rect(pose.centerX - 13, pose.torsoTop - 7, 2, 28, '#6d4c35');
      surface.rect(pose.centerX + 12, pose.torsoTop - 7, 2, 28, '#6d4c35');
    }
    if (owns('wooden-sword')) {
      surface.line(pose.centerX - 9, pose.footY - 2, pose.centerX + 8, pose.torsoTop - 13, outline, 4);
      surface.line(pose.centerX - 9, pose.footY - 2, pose.centerX + 8, pose.torsoTop - 13, '#8a623d', 2);
      surface.line(pose.centerX + 3, pose.torsoTop - 9, pose.centerX + 10, pose.torsoTop - 5, '#8a623d', 2);
    }
    if (owns('stone-schoolbag')) {
      surface.polygon([
        [pose.centerX - 11, pose.torsoTop + 1],
        [pose.centerX + 1, pose.torsoTop - 1],
        [pose.centerX + 4, pose.torsoTop + 17],
        [pose.centerX - 12, pose.torsoTop + 18],
      ], outline);
      surface.rect(pose.centerX - 10, pose.torsoTop + 2, 12, 14, '#5d5854');
      surface.pixel(pose.centerX - 7, pose.torsoTop + 4, '#91877d');
      surface.pixel(pose.centerX - 3, pose.torsoTop + 4, '#91877d');
      surface.pixel(pose.centerX, pose.torsoTop + 4, '#91877d');
    }
  }

  private paintBaseClothes(surface: PixelSurface, pose: HeroPose, dna: AppearanceDNA): void {
    if (dna.outfit === 'undershirt') {
      surface.rect(pose.centerX - 2, pose.torsoTop + 1, 5, 1, '#c2b5a4');
    } else if (dna.outfit === 'old_sweater') {
      for (let offset = 5; offset < pose.torsoHeight - 1; offset += 4) {
        surface.rect(pose.centerX - Math.floor(pose.torsoWidth / 2) + 1, pose.torsoTop + offset, pose.torsoWidth - 1, 1, '#48474c');
      }
    } else if (dna.outfit === 'uniform_liner') {
      surface.line(pose.centerX, pose.torsoTop + 1, pose.centerX, pose.torsoTop + pose.torsoHeight - 2, '#9aa8aa');
    } else {
      surface.pixel(pose.centerX, pose.torsoTop + 4, '#aaa096');
      surface.pixel(pose.centerX, pose.torsoTop + 8, '#aaa096');
    }
  }

  private paintRaincoat(surface: PixelSurface, pose: HeroPose, outline: string): void {
    const left = pose.centerX - Math.ceil(pose.torsoWidth / 2) - 3;
    const right = pose.centerX + Math.ceil(pose.torsoWidth / 2) + 3;
    surface.polygon([
      [left + 2, pose.torsoTop - 1],
      [right - 1, pose.torsoTop - 1],
      [right, pose.torsoTop + pose.torsoHeight + 5],
      [pose.centerX + 2, pose.torsoTop + pose.torsoHeight + 2],
      [pose.centerX - 2, pose.torsoTop + pose.torsoHeight + 2],
      [left, pose.torsoTop + pose.torsoHeight + 5],
    ], outline);
    surface.polygon([
      [left + 3, pose.torsoTop],
      [right - 2, pose.torsoTop],
      [right - 2, pose.torsoTop + pose.torsoHeight + 2],
      [pose.centerX + 1, pose.torsoTop + pose.torsoHeight],
      [pose.centerX - 1, pose.torsoTop + pose.torsoHeight],
      [left + 2, pose.torsoTop + pose.torsoHeight + 2],
    ], '#a78a2d');
    surface.line(pose.centerX, pose.torsoTop + 1, pose.centerX, pose.torsoTop + pose.torsoHeight, '#d0b14f');
    surface.rect(pose.centerX - 5, pose.torsoTop - 3, 11, 2, '#c2a33f');
  }

  private paintHead(
    surface: PixelSurface,
    pose: HeroPose,
    dna: AppearanceDNA,
    skin: string,
    outline: string,
    owns: (id: ItemId) => boolean,
    ageStep: number,
  ): void {
    surface.ellipse(pose.headX, pose.headY, Math.ceil(pose.headWidth / 2) + 1, Math.ceil(pose.headHeight / 2) + 1, outline);
    surface.ellipse(pose.headX, pose.headY, Math.floor(pose.headWidth / 2), Math.floor(pose.headHeight / 2), skin);

    const hairColor = owns('bleach-powder') ? '#d7c54a' : (ageStep >= 4 ? '#777471' : HAIR[dna.hairColor]);
    const hairTop = pose.headY - Math.floor(pose.headHeight / 2);
    if (dna.hairStyle === 'buzz') {
      surface.rect(pose.headX - Math.floor(pose.headWidth / 2) + 1, hairTop, pose.headWidth - 1, 2, hairColor);
    } else if (dna.hairStyle === 'side_part') {
      surface.polygon([
        [pose.headX - 5, hairTop + 3], [pose.headX - 3, hairTop], [pose.headX + 5, hairTop + 1],
        [pose.headX + 5, hairTop + 3], [pose.headX, hairTop + 2], [pose.headX - 5, hairTop + 5],
      ], hairColor);
    } else if (dna.hairStyle === 'curly') {
      for (let offset = -4; offset <= 4; offset += 2) surface.rect(pose.headX + offset - 1, hairTop + (Math.abs(offset) % 3), 3, 3, hairColor);
    } else if (dna.hairStyle === 'messy') {
      surface.polygon([
        [pose.headX - 6, hairTop + 4], [pose.headX - 5, hairTop], [pose.headX - 2, hairTop + 2],
        [pose.headX, hairTop - 1], [pose.headX + 2, hairTop + 2], [pose.headX + 5, hairTop],
        [pose.headX + 6, hairTop + 5], [pose.headX + 2, hairTop + 3], [pose.headX - 2, hairTop + 4],
      ], hairColor);
    } else {
      surface.ellipse(pose.headX, hairTop + 3, Math.floor(pose.headWidth / 2), 4, hairColor);
      surface.rect(pose.headX - Math.floor(pose.headWidth / 2), hairTop + 3, pose.headWidth, 2, hairColor);
    }

    const eyeY = pose.headY;
    const eyeGap = dna.eyeShape === 'wide' ? 3 : 2;
    if (dna.eyeShape === 'downcast') {
      surface.line(pose.headX - eyeGap - 1, eyeY, pose.headX - eyeGap + 1, eyeY + 1, outline);
      surface.line(pose.headX + eyeGap - 1, eyeY + 1, pose.headX + eyeGap + 1, eyeY, outline);
    } else if (dna.eyeShape === 'narrow') {
      surface.line(pose.headX - eyeGap - 1, eyeY, pose.headX - eyeGap + 1, eyeY, outline);
      surface.line(pose.headX + eyeGap - 1, eyeY, pose.headX + eyeGap + 1, eyeY, outline);
    } else {
      surface.pixel(pose.headX - eyeGap, eyeY, outline);
      surface.pixel(pose.headX + eyeGap, eyeY + (dna.eyeShape === 'uneven' ? -1 : 0), outline);
    }
    surface.line(pose.headX - 2, pose.headY + 4, pose.headX + 2, pose.headY + 4, '#695151');

    if (dna.feature === 'cheek_mole') surface.pixel(pose.headX + 4, pose.headY + 2, '#4b3e3a');
    if (dna.feature === 'freckles') {
      surface.pixel(pose.headX - 4, pose.headY + 2, '#7a5c4d');
      surface.pixel(pose.headX, pose.headY + 2, '#7a5c4d');
      surface.pixel(pose.headX + 4, pose.headY + 2, '#7a5c4d');
    }
    if (dna.feature === 'brow_gap') {
      surface.pixel(pose.headX - 4, pose.headY - 2, outline);
      surface.pixel(pose.headX + 4, pose.headY - 2, outline);
    }
    if (dna.feature === 'uneven_brows') {
      surface.line(pose.headX - 4, pose.headY - 2, pose.headX - 2, pose.headY - 3, outline);
      surface.line(pose.headX + 2, pose.headY - 3, pose.headX + 4, pose.headY - 1, outline);
    }
    if (owns('cracked-glasses')) {
      surface.rect(pose.headX - 5, pose.headY - 2, 4, 4, '#91adb0');
      surface.rect(pose.headX + 2, pose.headY - 2, 4, 4, '#91adb0');
      surface.line(pose.headX - 1, pose.headY, pose.headX + 2, pose.headY, '#91adb0');
      surface.line(pose.headX + 2, pose.headY - 2, pose.headX + 5, pose.headY + 2, '#d9e3df');
    }
    if (owns('od-pill')) {
      surface.pixel(pose.headX - eyeGap, eyeY, '#d57bb0');
      surface.pixel(pose.headX + eyeGap, eyeY, '#d57bb0');
    }
  }

  private paintFrontItems(
    surface: PixelSurface,
    pose: HeroPose,
    owns: (id: ItemId) => boolean,
    outline: string,
  ): void {
    if (owns('nameless-tie')) {
      surface.polygon([
        [pose.centerX, pose.torsoTop + 2], [pose.centerX + 2, pose.torsoTop + 7],
        [pose.centerX, pose.torsoTop + 11], [pose.centerX - 2, pose.torsoTop + 7],
      ], '#7b2536');
    }
    if (owns('front-desk-letter')) {
      surface.rect(pose.centerX - 4, pose.torsoTop + 5, 8, 5, '#e0d2bc');
      surface.line(pose.centerX - 4, pose.torsoTop + 5, pose.centerX, pose.torsoTop + 8, '#9f7772');
      surface.line(pose.centerX + 4, pose.torsoTop + 5, pose.centerX, pose.torsoTop + 8, '#9f7772');
    }
    if (owns('loose-button')) surface.rect(pose.centerX + 3, pose.torsoTop + 9, 2, 2, '#d2c7b6');
    if (owns('revoked-badge')) surface.rect(pose.centerX + 3, pose.torsoTop + 3, 5, 4, '#61768a');
    if (owns('missing-photo')) {
      surface.rect(pose.centerX - 8, pose.torsoTop + 5, 5, 7, '#d2c6b2');
      surface.rect(pose.centerX - 7, pose.torsoTop + 6, 3, 4, '#615951');
    }
    if (owns('unsent-phone')) {
      surface.rect(pose.centerX - 10, pose.handY - 1, 4, 8, outline);
      surface.rect(pose.centerX - 9, pose.handY, 2, 4, '#5e9c96');
    }
    if (owns('only-key')) {
      surface.ellipse(pose.centerX + 10, pose.handY + 2, 2, 2, '#c7a14d');
      surface.line(pose.centerX + 10, pose.handY + 4, pose.centerX + 10, pose.handY + 9, '#c7a14d');
      surface.pixel(pose.centerX + 12, pose.handY + 8, '#c7a14d');
    }
    if (owns('white-bottle') || owns('od-pill')) {
      surface.rect(pose.centerX - 12, pose.handY + 1, 4, 7, owns('od-pill') ? '#c878a8' : '#cbd7d4');
      surface.rect(pose.centerX - 11, pose.handY, 2, 1, '#e9e4dd');
    }
    if (owns('eyebrow-razor')) {
      for (let index = 0; index < 4; index += 1) {
        surface.line(pose.centerX - 8, pose.torsoTop + 6 + index * 2, pose.centerX - 4, pose.torsoTop + 7 + index * 2, '#9b3848');
      }
      surface.line(pose.centerX - 10, pose.handY + 5, pose.centerX - 5, pose.handY + 5, '#b8c2c2');
    }
    if (owns('slow-watch')) surface.rect(pose.centerX + 8, pose.handY + 2, 3, 3, '#7ea4aa');
    if (owns('first-salary')) surface.rect(pose.centerX + 7, pose.handY + 6, 6, 4, '#b38358');
    if (owns('baby-tooth')) {
      surface.polygon([
        [pose.centerX - 2, pose.torsoTop + 4], [pose.centerX + 2, pose.torsoTop + 4],
        [pose.centerX + 1, pose.torsoTop + 8], [pose.centerX, pose.torsoTop + 6],
        [pose.centerX - 1, pose.torsoTop + 8],
      ], '#e6dcc5');
    }
  }
}
