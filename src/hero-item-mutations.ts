import {
  getOrderedItemAppearances,
  type AppearanceMutation,
  type BodyAnchor,
} from './item-appearance';
import { getHeroMotionOffset } from './hero-animation-rig';
import { allocateHeroItemSlots } from './hero-item-slots';
import { mapAnchor, type BodyMorph, type HeroFacing, type RigAnchor } from './hero-morph';
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
  constructor(private readonly context: CanvasRenderingContext2D) {}

  pixel(x: number, y: number, color: string): void {
    this.context.fillStyle = color;
    this.context.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  rect(x: number, y: number, width: number, height: number, color: string): void {
    this.context.fillStyle = color;
    this.context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
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
      if (state.facing !== 'back') {
        brush.pixel(chest.x - 3, chest.y + 1, color); brush.pixel(chest.x - 2, chest.y + 2, color);
        brush.pixel(chest.x + 3, chest.y + 5, color); brush.pixel(chest.x + 2, chest.y + 6, color);
      }
      break;
    case 'forearm-cuts':
      for (let offset = -4; offset <= 2; offset += 2) brush.pixel(hand.x, hand.y + offset, color);
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
      if (state.facing !== 'back') {
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
  if (mutation.target !== 'hair') return;
  const head = anchorPoint('head', state, morph);
  const color = state.items.includes('bleach-powder') ? '#d7c84f' : '#17151b';
  brush.pixel(head.x - 8, head.y, color);
  brush.pixel(head.x + 8, head.y, color);
  brush.pixel(head.x - 2, head.y - 5, color);
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
  if (item === 'broken-spine' && state.facing === 'front') {
    brush.line(neck.x - 4, neck.y + 1, neck.x + 1, neck.y + 3, '#8f8478');
    brush.pixel(chest.x + 4, chest.y - 1, '#4a454b');
    return;
  }
  if (mutation.shoulderDrop && state.facing !== 'back') {
    brush.pixel(neck.x - 5, neck.y + mutation.shoulderDrop, '#242128');
    brush.pixel(neck.x + 5, neck.y + mutation.shoulderDrop, '#242128');
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
    for (const mutation of definition.mutations) {
      if (mutation.kind === 'aura') {
        if (pass === 'behind') drawAura(brush, definition.id, mutation, state, morph);
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
      } else if (mutation.kind === 'palette' && mutation.target === 'eyes' && state.facing !== 'back') {
        const face = anchorPoint('face', state, morph);
        if (state.facing === 'front') {
          brush.pixel(face.x - 4, face.y, mutation.color);
          brush.pixel(face.x + 4, face.y, mutation.color);
        } else {
          brush.pixel(face.x, face.y, mutation.color);
        }
      } else if (mutation.kind === 'posture') drawPostureCue(
        brush,
        definition.id,
        mutation,
        state,
        morph,
      );
    }
  }
}
