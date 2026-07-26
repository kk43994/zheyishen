import {
  getOrderedItemAppearances,
  type AppearanceMutation,
  type BodyAnchor,
} from './item-appearance';
import { getHeroMotionOffset } from './hero-animation-rig';
import { allocateHeroItemSlots } from './hero-item-slots';
import { mapAnchor, type BodyMorph, type HeroFacing, type RigAnchor } from './hero-morph';
import { sourceDerivedPaint } from './item-source-art';
import type { AppearanceDNA, ItemId } from './types';

export type HeroMutationPass = 'behind' | 'front';

export interface HeroMutationPixelState {
  readonly appearance: AppearanceDNA;
  readonly items: readonly ItemId[];
  readonly facing: HeroFacing;
  readonly motion: 'idle' | 'walk' | 'attack' | 'hurt';
  readonly frame: 0 | 1 | 2 | 3;
}

const RIG: Readonly<Record<BodyAnchor, RigAnchor>> = {
  head: { x: 20, y: 11, zone: 'head' },
  face: { x: 20, y: 17, zone: 'head' },
  neck: { x: 20, y: 23, zone: 'torso' },
  chest: { x: 20, y: 29, zone: 'torso' },
  back: { x: 20, y: 29, zone: 'torso' },
  leftHand: { x: 12, y: 36, zone: 'torso' },
  rightHand: { x: 28, y: 36, zone: 'torso' },
  waist: { x: 20, y: 39, zone: 'torso' },
  feet: { x: 20, y: 49, zone: 'feet' },
  shadow: { x: 20, y: 49, zone: 'feet' },
};

class MutationBrush {
  private item: ItemId | null = null;

  constructor(private readonly context: CanvasRenderingContext2D) {}

  useItem(item: ItemId): void {
    this.item = item;
  }

  private color(color: string): string {
    return this.item ? sourceDerivedPaint(this.item, color) : color;
  }

  pixel(x: number, y: number, color: string): void {
    this.context.fillStyle = this.color(color);
    this.context.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  rect(x: number, y: number, width: number, height: number, color: string): void {
    this.context.fillStyle = this.color(color);
    this.context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }

  frame(x: number, y: number, width: number, height: number, color: string): void {
    this.rect(x, y, width, 1, color);
    this.rect(x, y + height - 1, width, 1, color);
    this.rect(x, y, 1, height, color);
    this.rect(x + width - 1, y, 1, height, color);
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const endX = Math.round(x1);
    const endY = Math.round(y1);
    const dx = Math.abs(endX - x);
    const sx = x < endX ? 1 : -1;
    const dy = -Math.abs(endY - y);
    const sy = y < endY ? 1 : -1;
    let error = dx + dy;
    while (true) {
      this.pixel(x, y, color);
      if (x === endX && y === endY) break;
      const twice = error * 2;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
  }
}

function facingRig(anchor: BodyAnchor, facing: HeroFacing): RigAnchor {
  const source = RIG[anchor];
  if (facing === 'front' || facing === 'back') return source;
  const left = facing === 'left';
  if (anchor === 'face') return { ...source, x: left ? 15 : 25 };
  if (anchor === 'back') return { ...source, x: left ? 24 : 16 };
  if (anchor === 'leftHand' || anchor === 'rightHand') return { ...source, x: left ? 23 : 17 };
  if (anchor === 'chest' || anchor === 'neck' || anchor === 'waist') {
    return { ...source, x: left ? 19 : 21 };
  }
  return source;
}

function anchorPoint(
  anchor: BodyAnchor,
  state: HeroMutationPixelState,
  morph: BodyMorph,
): { x: number; y: number } {
  const mapped = mapAnchor(facingRig(anchor, state.facing), morph);
  const [dx, dy] = getHeroMotionOffset(state.facing, state.motion, state.frame, anchor);
  return { x: mapped.x + dx, y: mapped.y + dy };
}

function itemPoint(
  item: ItemId,
  fallback: BodyAnchor,
  state: HeroMutationPixelState,
  morph: BodyMorph,
): { x: number; y: number } {
  const allocation = allocateHeroItemSlots(state.items, state.facing).get(item);
  if (!allocation?.pose) return anchorPoint(fallback, state, morph);
  const mapped = mapAnchor(allocation.pose.rig, morph);
  const [dx, dy] = getHeroMotionOffset(
    state.facing,
    state.motion,
    state.frame,
    allocation.pose.motionAnchor,
  );
  return {
    x: mapped.x + allocation.pose.offset[0] + dx,
    y: mapped.y + allocation.pose.offset[1] + dy,
  };
}

function drawAura(
  brush: MutationBrush,
  item: ItemId,
  mutation: Extract<AppearanceMutation, { kind: 'aura' }>,
  state: HeroMutationPixelState,
  morph: BodyMorph,
): void {
  const shadow = anchorPoint('shadow', state, morph);
  const farHand = itemPoint(item, 'leftHand', state, morph);
  const nearHand = itemPoint(item, 'rightHand', state, morph);
  const head = anchorPoint('head', state, morph);
  const phase = state.frame % 4;
  switch (mutation.visual) {
    case 'phone-glow':
      brush.pixel(farHand.x - 2, farHand.y - 4 - (phase % 2), mutation.color);
      brush.pixel(farHand.x + 2, farHand.y - 2, mutation.color);
      break;
    case 'time-drag':
      brush.pixel(nearHand.x - 4 - phase, nearHand.y - 1, mutation.color);
      brush.pixel(nearHand.x - 3 - phase, nearHand.y + 1, mutation.color);
      break;
    case 'empty-space':
      brush.pixel(shadow.x - 13, shadow.y - 20, mutation.color);
      brush.pixel(shadow.x + 13, shadow.y - 9, mutation.color);
      break;
    case 'future-debt':
      brush.line(head.x - 9 - phase, head.y + 5, head.x - 9 - phase, head.y + 12, mutation.color);
      break;
    case 'flash-slip':
      brush.line(shadow.x - 11 - phase, shadow.y - 28, shadow.x - 11 - phase, shadow.y - 12, mutation.color);
      break;
    case 'recess-rush':
      brush.pixel(shadow.x - 8 - phase, shadow.y + 1, mutation.color);
      brush.pixel(shadow.x + 7 + phase, shadow.y, mutation.color);
      break;
    case 'snow':
      brush.pixel(head.x - 12 + phase, head.y - 6, mutation.color);
      brush.pixel(head.x + 11 - phase, head.y + 9, mutation.color);
      brush.pixel(shadow.x - 9, shadow.y - 19 + phase, mutation.color);
      break;
    case 'numbness':
      brush.rect(shadow.x - 10 - (phase % 2), shadow.y + 1, 21 + (phase % 2) * 2, 2, mutation.color);
      break;
  }
}

function drawMark(
  brush: MutationBrush,
  mutation: Extract<AppearanceMutation, { kind: 'mark' }>,
  state: HeroMutationPixelState,
  morph: BodyMorph,
): void {
  // 每种痕迹有自己的现实颜色：黑眼圈是青黑不是血红，白发是灰白，压力纹是褐色。
  // 只有真正见血的图案（错题红叉/小臂划痕/眼镜裂纹）才默认红。
  const MARK_FALLBACK: Record<string, string> = {
    'red-crosses': '#a64049',
    'forearm-cuts': '#a64049',
    'eye-crack': '#a64049',
    'missing-button': '#17151b',
    'under-eye-shadow': '#4d4660',
    'gray-strands': '#b9b3a6',
    'empty-person': '#3f3b47',
    'stress-lines': '#6f5b52',
    'static-specks': '#8b93a0',
  };
  const color = mutation.color ?? MARK_FALLBACK[mutation.pattern] ?? '#5a5462';
  const face = anchorPoint('face', state, morph);
  const chest = anchorPoint('chest', state, morph);
  const hand = anchorPoint('leftHand', state, morph);
  const head = anchorPoint('head', state, morph);
  const shadow = anchorPoint('shadow', state, morph);
  switch (mutation.pattern) {
    case 'missing-button':
      if (state.facing !== 'back') brush.pixel(chest.x + 3, chest.y + 8, '#17151b');
      break;
    case 'red-crosses':
      if (state.facing !== 'back' && mutation.target === 'face') {
        const spread = state.facing === 'front' ? 5 : 1;
        brush.pixel(face.x - spread, face.y - 2, color);
        brush.pixel(face.x - spread + 1, face.y - 1, color);
        brush.pixel(face.x - spread + 1, face.y - 2, color);
        brush.pixel(face.x - spread, face.y - 1, color);
        if (state.facing === 'front') {
          brush.pixel(face.x + spread, face.y + 1, color);
          brush.pixel(face.x + spread - 1, face.y + 2, color);
          brush.pixel(face.x + spread - 1, face.y + 1, color);
          brush.pixel(face.x + spread, face.y + 2, color);
        }
      } else if (state.facing !== 'back') {
        brush.pixel(chest.x - 3, chest.y + 1, color); brush.pixel(chest.x - 2, chest.y + 2, color);
        brush.pixel(chest.x + 3, chest.y + 5, color); brush.pixel(chest.x + 2, chest.y + 6, color);
      }
      break;
    case 'forearm-cuts':
      for (let offset = -4; offset <= 2; offset += 3) {
        brush.pixel(hand.x - 1, hand.y + offset, color);
        brush.pixel(hand.x, hand.y + offset + 1, color);
      }
      break;
    case 'eye-crack':
      if (state.facing !== 'back') brush.line(face.x + 2, face.y - 2, face.x + 4, face.y + 2, color);
      break;
    case 'under-eye-shadow':
      if (state.facing === 'front') {
        brush.line(face.x - 5, face.y + 2, face.x - 2, face.y + 2, color);
        brush.line(face.x + 2, face.y + 2, face.x + 5, face.y + 2, color);
      } else if (state.facing !== 'back') {
        brush.line(face.x - 1, face.y + 2, face.x + 2, face.y + 2, color);
      }
      break;
    case 'gray-strands':
      brush.pixel(head.x - 3, head.y - 3, color);
      brush.pixel(head.x + 4, head.y - 1, color);
      break;
    case 'empty-person':
      if (mutation.target === 'shadow') {
        const side = state.facing === 'left' ? -1 : 1;
        const x = shadow.x + side * 11;
        brush.rect(x - 2, shadow.y - 22, 5, 5, color);
        brush.line(x, shadow.y - 17, x, shadow.y - 8, color);
        brush.line(x - 3, shadow.y - 14, x + 3, shadow.y - 14, color);
        brush.line(x, shadow.y - 8, x - 2, shadow.y - 3, color);
        brush.line(x, shadow.y - 8, x + 2, shadow.y - 3, color);
      } else if (state.facing !== 'back') {
        brush.pixel(chest.x, chest.y, color);
        brush.line(chest.x - 1, chest.y + 2, chest.x + 1, chest.y + 2, color);
      }
      break;
    case 'stress-lines':
      if (state.facing !== 'back') {
        brush.pixel(face.x - 4, face.y + 3, color);
        brush.pixel(face.x + 4, face.y + 3, color);
      }
      break;
    case 'static-specks':
      brush.pixel(shadow.x - 11, shadow.y - 22, color);
      brush.pixel(shadow.x + 10, shadow.y - 12, color);
      brush.pixel(shadow.x - 7, shadow.y - 4, color);
      break;
  }
}

function drawExpression(
  brush: MutationBrush,
  mutation: Extract<AppearanceMutation, { kind: 'expression' }>,
  state: HeroMutationPixelState,
  morph: BodyMorph,
): void {
  if (state.facing === 'back') return;
  const face = anchorPoint('face', state, morph);
  const side = state.facing === 'front' ? 1 : 0;
  switch (mutation.value) {
    case 'dazed':
      brush.pixel(face.x - 4 * side, face.y, '#d57bb0');
      brush.pixel(face.x + 4 * side, face.y, '#d57bb0');
      break;
    case 'guarded':
      brush.line(face.x - 5 * side, face.y - 4, face.x - 2 * side, face.y - 3, '#5c4240');
      brush.line(face.x + 2 * side, face.y - 3, face.x + 5 * side, face.y - 4, '#5c4240');
      break;
    case 'strained':
      brush.line(face.x - 2, face.y + 4, face.x + 2, face.y + 4, '#76545a');
      break;
    case 'forced-smile':
      brush.pixel(face.x - 2, face.y + 4, '#7b4048');
      brush.pixel(face.x + 2, face.y + 4, '#7b4048');
      brush.pixel(face.x, face.y + 5, '#7b4048');
      break;
    case 'numb':
      brush.line(face.x - 2, face.y + 4, face.x + 2, face.y + 4, '#595762');
      break;
    case 'startled':
      brush.pixel(face.x - 4 * side, face.y, '#ded9cb');
      brush.pixel(face.x + 4 * side, face.y, '#ded9cb');
      brush.pixel(face.x, face.y + 4, '#67535a');
      break;
  }
}

function drawSilhouetteAccent(
  brush: MutationBrush,
  mutation: Extract<AppearanceMutation, { kind: 'silhouette' }>,
  state: HeroMutationPixelState,
  morph: BodyMorph,
): void {
  const head = anchorPoint('head', state, morph);
  const chest = anchorPoint('chest', state, morph);
  const waist = anchorPoint('waist', state, morph);
  const shadow = anchorPoint('shadow', state, morph);
  const color = state.items.includes('bleach-powder') ? '#d7c84f' : '#17151b';
  if (mutation.target === 'hair' || mutation.target === 'head') {
    brush.pixel(head.x - 8, head.y, color);
    brush.pixel(head.x + 8, head.y, color);
    brush.pixel(head.x - 2, head.y - 5, color);
  } else if (mutation.target === 'shadow') {
    const spread = 10 + Math.max(1, mutation.expandX ?? 1);
    brush.line(shadow.x - spread, shadow.y + 1, shadow.x + spread, shadow.y + 1, '#34313c');
  } else if (mutation.target === 'torso') {
    const phaseColor = state.frame % 2 === 0 ? '#9b4855' : '#568995';
    const spread = state.facing === 'front' || state.facing === 'back' ? 7 : 4;
    brush.line(chest.x - spread, chest.y - 4, chest.x - spread - 1, waist.y - 4, phaseColor);
    brush.line(chest.x + spread, chest.y - 3, chest.x + spread + 1, waist.y - 5, phaseColor);
    brush.pixel(chest.x - spread - 2, chest.y + 1, '#55465f');
    brush.pixel(chest.x + spread + 2, chest.y + 4, '#55465f');
  }
}

function drawPaletteAccent(
  brush: MutationBrush,
  mutation: Extract<AppearanceMutation, { kind: 'palette' }>,
  state: HeroMutationPixelState,
  morph: BodyMorph,
): void {
  const head = anchorPoint('head', state, morph);
  const face = anchorPoint('face', state, morph);
  const chest = anchorPoint('chest', state, morph);
  const leftHand = anchorPoint('leftHand', state, morph);
  const rightHand = anchorPoint('rightHand', state, morph);
  const feet = anchorPoint('feet', state, morph);
  const shadow = anchorPoint('shadow', state, morph);
  if (mutation.target === 'eyes') {
    if (state.facing === 'back') return;
    if (state.facing === 'front') {
      brush.pixel(face.x - 4, face.y, mutation.color);
      brush.pixel(face.x + 4, face.y, mutation.color);
    } else brush.pixel(face.x, face.y, mutation.color);
  } else if (mutation.target === 'hair') {
    brush.line(head.x - 5, head.y - 3, head.x + 4, head.y - 3, mutation.color);
    brush.pixel(head.x + (state.facing === 'left' ? -6 : 6), head.y, mutation.color);
  } else if (mutation.target === 'skin') {
    if (state.facing !== 'back') brush.pixel(face.x, face.y + 3, mutation.color);
    brush.pixel(leftHand.x, leftHand.y, mutation.color);
    brush.pixel(rightHand.x, rightHand.y, mutation.color);
  } else if (mutation.target === 'outfit') {
    const halfWidth = state.facing === 'front' || state.facing === 'back' ? 5 : 1;
    brush.line(chest.x - halfWidth, chest.y + 2, chest.x + halfWidth, chest.y + 2, mutation.color);
    if (mutation.coverage === 'full') {
      brush.line(chest.x - halfWidth, chest.y + 5, chest.x + halfWidth, chest.y + 5, mutation.color);
    }
  } else if (mutation.target === 'outline') {
    brush.pixel(chest.x - 7, chest.y - 3, mutation.color);
    brush.pixel(chest.x + 7, chest.y - 3, mutation.color);
    brush.pixel(feet.x - 5, feet.y, mutation.color);
    brush.pixel(feet.x + 5, feet.y, mutation.color);
  } else if (mutation.target === 'shadow') {
    brush.line(shadow.x - 8, shadow.y + 1, shadow.x + 8, shadow.y + 1, mutation.color);
  }
}

function drawPostureCue(
  brush: MutationBrush,
  item: ItemId,
  mutation: Extract<AppearanceMutation, { kind: 'posture' }>,
  state: HeroMutationPixelState,
  morph: BodyMorph,
): void {
  const neck = anchorPoint('neck', state, morph);
  const chest = anchorPoint('chest', state, morph);
  if (item === 'stone-schoolbag' && state.facing === 'front') {
    brush.line(neck.x - 5, neck.y + 1, chest.x - 5, chest.y + 5, '#77706a');
    brush.line(neck.x + 5, neck.y + 1, chest.x + 5, chest.y + 5, '#77706a');
    return;
  }
  if (mutation.shoulderDrop && state.facing !== 'back') {
    brush.pixel(neck.x - 5, neck.y + mutation.shoulderDrop, '#242128');
    brush.pixel(neck.x + 5, neck.y + mutation.shoulderDrop, '#242128');
  }
}

function drawBehindNarrativeCue(
  brush: MutationBrush,
  item: ItemId,
  state: HeroMutationPixelState,
  morph: BodyMorph,
): void {
  const head = anchorPoint('head', state, morph);
  const chest = anchorPoint('chest', state, morph);
  const feet = anchorPoint('feet', state, morph);
  const shadow = anchorPoint('shadow', state, morph);
  const phase = state.frame % 4;
  const side = state.facing === 'left' ? -1 : 1;
  switch (item) {
    case 'front-desk-letter':
      brush.rect(chest.x - 13, chest.y - 7, 3, 2, '#d8c7ae');
      brush.rect(chest.x + 11, chest.y + 4, 3, 2, '#b9a58f');
      break;
    case 'baby-tooth': {
      const x = shadow.x + side * 12;
      const child = '#514a55';
      brush.rect(x - 2, shadow.y - 21, 5, 6, child);
      brush.rect(x + side * 3, shadow.y - 20, 2, 3, child);
      brush.rect(x - 2, shadow.y - 15, 5, 6, child);
      brush.line(x - 2, shadow.y - 14, x - 4, shadow.y - 8, child);
      brush.line(x + 2, shadow.y - 14, x + 4, shadow.y - 8, child);
      brush.rect(x - 4, shadow.y - 9, 9, 4, child);
      brush.rect(x - 3, shadow.y - 6, 2, 5, child);
      brush.rect(x + 1, shadow.y - 6, 2, 5, child);
      break;
    }
    case 'slow-watch':
      brush.line(chest.x - side * 6, chest.y + 4, chest.x - side * 10, chest.y + 8, '#52616e');
      brush.pixel(chest.x - side * 11, chest.y + 9, '#91a9af');
      brush.pixel(chest.x - side * 12, chest.y + 9, '#52616e');
      break;
    case 'empty-frame': {
      const x = shadow.x + (state.facing === 'left' ? 7 : -14);
      const color = '#57464a';
      brush.line(x, shadow.y - 20, x + 7, shadow.y - 20, color);
      brush.line(x, shadow.y - 20, x, shadow.y - 9, color);
      brush.line(x + 7, shadow.y - 20, x + 7, shadow.y - 13, color);
      brush.line(x, shadow.y - 9, x + 4, shadow.y - 9, color);
      break;
    }
    case 'flash-escape':
      if (state.motion === 'hurt') {
        const offset = state.facing === 'left' ? 9 : -9;
        const echo = '#554e63';
        brush.rect(head.x + offset - 3, head.y - 4, 7, 7, echo);
        brush.rect(chest.x + offset - 3, chest.y - 5, 7, 15, echo);
        brush.line(chest.x + offset - 3, chest.y, chest.x + offset - 6, chest.y + 8, echo);
        brush.line(chest.x + offset + 3, chest.y, chest.x + offset + 6, chest.y + 8, echo);
        brush.line(chest.x + offset - 2, chest.y + 10, feet.x + offset - 3, feet.y - 2, echo);
        brush.line(chest.x + offset + 2, chest.y + 10, feet.x + offset + 3, feet.y - 2, echo);
      }
      break;
    case 'class-break':
      brush.line(shadow.x - 13, shadow.y + 1, shadow.x - 4, shadow.y + 3, '#a8842f');
      brush.line(shadow.x + 4, shadow.y + 3, shadow.x + 13, shadow.y + 1, '#d0b762');
      brush.pixel(shadow.x - 16 - phase, shadow.y - 1, '#d0b762');
      brush.pixel(shadow.x + 15 + phase, shadow.y, '#a8842f');
      break;
    case 'moms-bowl': {
      const x = chest.x + (state.facing === 'right' ? -13 : 13);
      brush.line(x - 5, chest.y + 3, x + 5, chest.y + 3, '#d5c09a');
      brush.line(x - 4, chest.y + 4, x - 2, chest.y + 7, '#8c6545');
      brush.line(x + 4, chest.y + 4, x + 2, chest.y + 7, '#8c6545');
      brush.line(x - 2, chest.y + 7, x + 2, chest.y + 7, '#c89d61');
      brush.pixel(x - 2, chest.y - (phase % 2), '#d9c8a1');
      brush.pixel(x + 2, chest.y - 1, '#d9c8a1');
      break;
    }
    case 'ruma-msg': {
      const x = shadow.x + (state.facing === 'right' ? -17 : 9);
      brush.frame(x, shadow.y - 25, 9, 7, '#6f9b87');
      brush.pixel(x + 2, shadow.y - 22, '#c8d8cf');
      brush.pixel(x + 5, shadow.y - 22, '#c8d8cf');
      brush.pixel(x + 2, shadow.y - 17, '#6f9b87');
      break;
    }
    case 'held-elevator': {
      const x = state.facing === 'right' ? 3 : 25;
      brush.frame(x, 17, 12, 31, '#777b84');
      brush.line(x + 6, 18, x + 6, 47, '#4f535d');
      brush.rect(x + (state.facing === 'right' ? 9 : 2), 31, 2, 3, '#b6a76b');
      break;
    }
    case 'unwashed-pillow':
      brush.rect(shadow.x - 13, shadow.y, 27, 5, '#27242d');
      brush.frame(shadow.x - 11, shadow.y - 1, 23, 5, '#4f4750');
      brush.pixel(shadow.x - 7, shadow.y, '#62565a');
      brush.pixel(shadow.x + 8, shadow.y + 2, '#62565a');
      break;
    case 'year-report':
      brush.line(shadow.x - 14, shadow.y - 19, shadow.x - 14, shadow.y - 11, '#776e85');
      brush.line(shadow.x - 10, shadow.y - 22, shadow.x - 10, shadow.y - 11, '#8c7b91');
      brush.line(shadow.x - 6, shadow.y - 17, shadow.x - 6, shadow.y - 11, '#69677d');
      brush.pixel(shadow.x - 15, shadow.y - 10, '#b7a6bb');
      brush.pixel(shadow.x - 7, shadow.y - 10, '#b7a6bb');
      break;
    case 'one-more-game':
      brush.rect(shadow.x + 7, shadow.y - 13, 11, 6, '#34384b');
      brush.pixel(shadow.x + 9, shadow.y - 10, '#94a6c0');
      brush.pixel(shadow.x + 15, shadow.y - 11, '#a77983');
      brush.line(shadow.x + 10, shadow.y - 7, shadow.x + 8, shadow.y - 4, '#4d5368');
      break;
  }
}

function drawFrontNarrativeCue(
  brush: MutationBrush,
  item: ItemId,
  state: HeroMutationPixelState,
  morph: BodyMorph,
): void {
  const head = anchorPoint('head', state, morph);
  const face = anchorPoint('face', state, morph);
  const neck = anchorPoint('neck', state, morph);
  const chest = anchorPoint('chest', state, morph);
  const waist = anchorPoint('waist', state, morph);
  const feet = anchorPoint('feet', state, morph);
  const side = state.facing === 'left' ? -1 : 1;
  switch (item) {
    case 'bleach-powder':
      brush.line(head.x - 4, head.y - 4, head.x + 3, head.y - 4, '#5a4935');
      brush.pixel(head.x - 7, head.y + 4, '#b7a33a');
      brush.pixel(head.x + 6, head.y + 8, '#8f7d31');
      break;
    case 'eyebrow-razor': {
      const hand = anchorPoint('leftHand', state, morph);
      brush.line(hand.x - 1, hand.y - 5, hand.x + 1, hand.y - 5, '#7e4650');
      brush.line(hand.x - 1, hand.y - 2, hand.x + 1, hand.y - 2, '#9b5560');
      brush.line(hand.x - 1, hand.y + 1, hand.x + 1, hand.y + 1, '#6e3e48');
      break;
    }
    case 'od-pill':
      if (state.facing !== 'back') {
        brush.pixel(face.x - (state.facing === 'front' ? 5 : 1), face.y, '#d36fab');
        brush.pixel(face.x + (state.facing === 'front' ? 5 : 1), face.y, '#7eb7bd');
      }
      brush.pixel(head.x - side * 7, head.y + 3, '#895d8f');
      brush.pixel(chest.x + side * 8, chest.y + 4, '#4f7e84');
      break;
    case 'nameless-tie':
      if (state.facing !== 'back') brush.rect(neck.x - 2, neck.y - 2, 5, 2, '#8c555a');
      if (state.facing !== 'back') brush.pixel(face.x, face.y + 3, '#d8cec0');
      break;
    case 'unsent-phone': {
      const hand = itemPoint(item, 'rightHand', state, morph);
      brush.line(hand.x - side * 2, hand.y + 4, hand.x - side * 6, hand.y + 8, '#5f777b');
      brush.line(hand.x - side * 6, hand.y + 8, hand.x - side * 3, hand.y + 10, '#5f777b');
      break;
    }
    case 'revoked-badge':
      brush.rect(chest.x + 4, chest.y - 7, 3, 3, '#a64049');
      brush.pixel(chest.x + 5, chest.y - 8, '#d28c78');
      break;
    case 'white-bottle':
      brush.rect(waist.x - 7, waist.y - 1, 3, 6, '#aab8b5');
      brush.rect(waist.x + 5, waist.y, 3, 5, '#d4ddd6');
      break;
    case 'spent-decade':
      brush.line(head.x - 5, head.y - 4, head.x - 1, head.y - 4, '#ded8ca');
      brush.line(head.x + 1, head.y - 2, head.x + 5, head.y - 2, '#b9b3a6');
      brush.pixel(head.x - 6, head.y, '#ded8ca');
      brush.pixel(head.x + 6, head.y + 2, '#b9b3a6');
      break;
    case 'held-pee':
      if (state.facing === 'front' || state.facing === 'back') {
        brush.line(feet.x - 5, feet.y - 8, feet.x - 2, feet.y - 2, '#34313a');
        brush.line(feet.x + 5, feet.y - 8, feet.x + 2, feet.y - 2, '#34313a');
        brush.pixel(waist.x - 6, waist.y - 2, '#8c7568');
        brush.pixel(waist.x + 6, waist.y - 2, '#8c7568');
      }
      break;
    case 'always-crying':
      if (state.facing === 'front') {
        brush.line(face.x - 4, face.y + 1, face.x - 4, face.y + 8, '#79a9b6');
        brush.line(face.x + 4, face.y + 1, face.x + 4, face.y + 8, '#79a9b6');
        brush.pixel(face.x - 3, face.y + 9, '#b7d4d7');
        brush.pixel(face.x + 3, face.y + 9, '#b7d4d7');
      } else if (state.facing !== 'back') brush.line(face.x, face.y + 1, face.x, face.y + 7, '#79a9b6');
      break;
    case 'retracted-voice':
      brush.rect(face.x + side * 8 - 2, face.y - 4, 7, 4, '#59515f');
      brush.line(face.x + side * 8, face.y - 2, face.x + side * 11, face.y - 2, '#b9adb8');
      brush.pixel(face.x + side * 12, face.y - 2, '#a64049');
      break;
    case 'bargain-link':
      brush.line(chest.x - 8, chest.y - 4, chest.x + 8, chest.y - 4, '#4a333a');
      brush.line(chest.x - 8, chest.y - 3, chest.x + 4, chest.y - 3, '#a64049');
      brush.line(waist.x - 7, waist.y + 2, waist.x + 7, waist.y + 2, '#5a343b');
      brush.line(waist.x - 7, waist.y + 3, waist.x + 3, waist.y + 3, '#c04b55');
      brush.pixel(chest.x + 7, chest.y - 3, '#d7b257');
      break;
    case 'group-dad': {
      const labelSide = state.facing === 'left' ? -1 : 1;
      const labelX = head.x + labelSide * 12;
      const labelY = head.y - 4;
      brush.rect(labelX - 5, labelY, 11, 5, '#27242c');
      brush.frame(labelX - 4, labelY + 1, 9, 3, '#7e777f');
      brush.pixel(labelX - 3, labelY + 2, '#aaa198');
      brush.line(labelX - 1, labelY + 2, labelX + 2, labelY + 2, '#b7afa5');
      brush.pixel(labelX + 4, labelY, '#a64049');
      break;
    }
    case 'checkup-arrows': {
      const arrow = (x: number, y: number): void => {
        brush.line(x, y + 4, x, y, '#a64d4f');
        brush.pixel(x - 1, y + 1, '#a64d4f');
        brush.pixel(x + 1, y + 1, '#a64d4f');
      };
      arrow(face.x - 8, face.y - 5);
      arrow(face.x + 8, face.y - 2);
      arrow(chest.x, chest.y - 8);
      break;
    }
    case 'shared-powerbank': {
      const hand = anchorPoint('rightHand', state, morph);
      brush.line(waist.x + side * 6, waist.y, hand.x, hand.y - 5, '#8fa9a8');
      brush.pixel(hand.x, hand.y - 6, '#c5d8d5');
      break;
    }
    case 'loan-contract':
      brush.rect(chest.x - 8, chest.y - 5, 17, 3, '#c8b69e');
      brush.line(chest.x - 6, chest.y - 4, chest.x + 6, chest.y - 4, '#6d5d53');
      brush.rect(chest.x - 7, chest.y + 3, 15, 3, '#b7a58f');
      brush.line(chest.x - 5, chest.y + 4, chest.x + 5, chest.y + 4, '#805149');
      brush.rect(waist.x - 6, waist.y + 1, 13, 2, '#d0bda4');
      break;
    case 'sock-cigs': {
      const x = feet.x + side * 5;
      brush.line(x, feet.y - 8, x + side * 4, feet.y - 12, '#d4c3a6');
      brush.pixel(x + side * 4, feet.y - 12, '#c15e47');
      brush.pixel(x + side * 5, feet.y - 15, '#77727c');
      break;
    }
    case 'hair-in-takeout':
      if (state.facing !== 'back') {
        brush.line(face.x + side * 2, face.y + 3, face.x + side * 7, face.y + 8, '#29252b');
        brush.pixel(face.x + side * 8, face.y + 9, '#6f5a4b');
      }
      break;
    case 'funeral-photo':
      if (state.facing === 'front') {
        brush.pixel(face.x - 5, face.y + 4, '#d4b0a2');
        brush.pixel(face.x + 5, face.y + 4, '#d4b0a2');
      }
      break;
    case 'summer-run':
      if (state.motion === 'walk') {
        const trail = state.facing === 'left' ? 1 : -1;
        brush.line(chest.x + trail * 4, chest.y, chest.x + trail * 12, chest.y + 5, '#3e3a45');
        brush.line(chest.x + trail * 11, chest.y + 5, chest.x + trail * 14, chest.y + 4, '#c7a98e');
      }
      break;
    case 'abstract-lv10':
      if (state.facing !== 'back') {
        const spread = state.facing === 'front' ? 4 : 1;
        brush.rect(face.x - spread - 1, face.y - 1, 3, 2, '#392b42');
        brush.pixel(face.x + spread, face.y - 2, '#a56ca2');
        brush.line(face.x - 3, face.y + 4, face.x + 3, face.y + 2, '#7b3d58');
      }
      break;
    case 'ktv-song':
      if (state.facing !== 'back') {
        brush.line(face.x - 4, face.y - 4, face.x - 1, face.y - 3, '#5c4240');
        brush.line(face.x + 1, face.y - 3, face.x + 4, face.y - 4, '#5c4240');
        brush.pixel(face.x + side * 6, face.y + 3, '#8b6873');
        brush.pixel(face.x + side * 8, face.y + 2, '#6e5b69');
        brush.pixel(face.x + side * 10, face.y + 1, '#49434d');
      }
      break;
  }
}

export function drawHeroItemMutationPass(
  context: CanvasRenderingContext2D,
  state: HeroMutationPixelState,
  pass: HeroMutationPass,
): void {
  const brush = new MutationBrush(context);
  const morph: BodyMorph = {
    stature: state.appearance.stature,
    build: state.appearance.bodyBuild,
  };
  for (const definition of getOrderedItemAppearances(state.items)) {
    brush.useItem(definition.id);
    for (const mutation of definition.mutations) {
      if (mutation.kind === 'aura') {
        if (pass === 'behind') drawAura(brush, definition.id, mutation, state, morph);
        continue;
      }
      if (mutation.kind === 'palette' && mutation.target === 'shadow') {
        if (pass === 'behind') drawPaletteAccent(brush, mutation, state, morph);
        continue;
      }
      if (mutation.kind === 'silhouette' && mutation.target === 'shadow') {
        if (pass === 'behind') drawSilhouetteAccent(brush, mutation, state, morph);
        continue;
      }
      if (pass !== 'front') continue;
      if (mutation.kind === 'mark') drawMark(brush, mutation, state, morph);
      else if (mutation.kind === 'expression') drawExpression(brush, mutation, state, morph);
      else if (mutation.kind === 'silhouette') drawSilhouetteAccent(brush, mutation, state, morph);
      else if (mutation.kind === 'age') {
        const head = anchorPoint('head', state, morph);
        brush.pixel(head.x - 2, head.y - 3, '#ded8ca');
        brush.pixel(head.x + 3, head.y - 1, '#ded8ca');
      } else if (mutation.kind === 'palette') drawPaletteAccent(brush, mutation, state, morph);
      else if (mutation.kind === 'posture') drawPostureCue(
        brush,
        definition.id,
        mutation,
        state,
        morph,
      );
    }
    if (pass === 'behind') drawBehindNarrativeCue(brush, definition.id, state, morph);
    else drawFrontNarrativeCue(brush, definition.id, state, morph);
  }
}
