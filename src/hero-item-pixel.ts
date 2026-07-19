import {
  APPEARANCE_LAYER_ORDER,
  getItemAppearance,
  resolveItemAttachment,
  type AppearanceLayer,
  type AppearancePropKey,
  type BodyAnchor,
  type ItemAppearanceDefinition,
} from './item-appearance';
import { getHeroMotionOffset } from './hero-animation-rig';
import {
  allocateHeroItemSlots,
  type HeroItemSlotAllocation,
  type HeroRigSlot,
  type HeroSlotPose,
} from './hero-item-slots';
import { mapAnchor, type BodyMorph, type HeroFacing, type RigAnchor } from './hero-morph';
import type { AppearanceDNA, ItemId } from './types';

export type HeroItemPixelPass = 'behind' | 'front';

export interface HeroItemPixelState {
  readonly appearance: AppearanceDNA;
  readonly items: readonly ItemId[];
  readonly facing: HeroFacing;
  readonly motion: 'idle' | 'walk' | 'attack' | 'hurt';
  readonly frame: 0 | 1 | 2 | 3;
}

interface ResolvedAppearance {
  readonly definition: ItemAppearanceDefinition;
  readonly anchor: BodyAnchor;
  readonly layer: AppearanceLayer;
  readonly priority: number;
}

const INK = '#17151b';
const PAPER = '#dad0ba';
const RED = '#a64049';
const GOLD = '#c5a34c';
const GLASS = '#91adb0';

const SLOT_DRAW_ORDER: Readonly<Partial<Record<HeroRigSlot, number>>> = {
  backVolume: 10,
  backSurface: 20,
  backLong: 30,
};

class PixelBrush {
  constructor(private readonly context: CanvasRenderingContext2D) {}

  pixel(x: number, y: number, color: string): void {
    this.context.fillStyle = color;
    this.context.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  rect(x: number, y: number, width: number, height: number, color: string): void {
    if (width <= 0 || height <= 0) return;
    this.context.fillStyle = color;
    this.context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }

  frame(x: number, y: number, width: number, height: number, color: string): void {
    this.rect(x, y, width, 1, color);
    this.rect(x, y + height - 1, width, 1, color);
    this.rect(x, y, 1, height, color);
    this.rect(x + width - 1, y, 1, height, color);
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
    while (true) {
      this.rect(x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
      if (x === endX && y === endY) break;
      const doubled = error * 2;
      if (doubled >= dy) { error += dy; x += sx; }
      if (doubled <= dx) { error += dx; y += sy; }
    }
  }
}

const CANONICAL_ANCHORS: Readonly<Record<BodyAnchor, RigAnchor>> = {
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

function facingAnchor(anchor: BodyAnchor, facing: HeroFacing): RigAnchor {
  const source = CANONICAL_ANCHORS[anchor];
  if (facing === 'front' || facing === 'back') return source;
  const isLeft = facing === 'left';
  if (anchor === 'face') return { ...source, x: isLeft ? 15 : 25 };
  if (anchor === 'back') return { ...source, x: isLeft ? 24 : 16 };
  if (anchor === 'leftHand' || anchor === 'rightHand') return { ...source, x: isLeft ? 23 : 17 };
  if (anchor === 'chest' || anchor === 'neck' || anchor === 'waist') return { ...source, x: isLeft ? 19 : 21 };
  return source;
}

function orderedAppearances(items: readonly ItemId[]): ResolvedAppearance[] {
  const equipped = new Set(items);
  return [...equipped]
    .map((id) => {
      const definition = getItemAppearance(id);
      const attachment = resolveItemAttachment(definition, equipped);
      return { definition, ...attachment };
    })
    .sort((first, second) => {
      const layerDelta = APPEARANCE_LAYER_ORDER[first.layer] - APPEARANCE_LAYER_ORDER[second.layer];
      return layerDelta || first.priority - second.priority || first.definition.id.localeCompare(second.definition.id);
    });
}

function shouldDrawInPass(record: ResolvedAppearance, facing: HeroFacing, pass: HeroItemPixelPass): boolean {
  if (record.definition.id === 'fathers-raincoat') return pass === 'front';
  const naturallyBehind = record.layer === 'shadow' || record.layer === 'behind';
  const backFacesViewer = facing === 'back' && record.anchor === 'back';
  return pass === (naturallyBehind && !backFacesViewer ? 'behind' : 'front');
}

function hiddenByFacing(record: ResolvedAppearance, facing: HeroFacing): boolean {
  if (facing !== 'back') return false;
  return record.layer !== 'behind'
    && record.definition.id !== 'fathers-raincoat'
    && ['face', 'neck', 'chest'].includes(record.anchor);
}

function animationOffset(definition: ItemAppearanceDefinition, state: HeroItemPixelState): readonly [number, number] {
  const hint = definition.animation;
  const triggerMatches = hint.trigger === 'always' || hint.trigger === state.motion;
  if (!triggerMatches || hint.amplitudePx === 0) return [0, 0];
  const phase = state.frame % Math.max(1, hint.frames);
  if (hint.kind === 'bob' || hint.kind === 'flutter' || hint.kind === 'drip') {
    return [0, phase % 2 === 0 ? 0 : -hint.amplitudePx];
  }
  if (hint.kind === 'sway' || hint.kind === 'rattle' || hint.kind === 'jitter') {
    return [phase % 2 === 0 ? -hint.amplitudePx : hint.amplitudePx, 0];
  }
  if (hint.kind === 'orbit') {
    const orbit = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
    return orbit[phase] ?? [0, 0];
  }
  return [0, 0];
}

function animatedAnchor(
  anchor: BodyAnchor,
  state: HeroItemPixelState,
  morph: BodyMorph,
): { x: number; y: number } {
  const base = mapAnchor(facingAnchor(anchor, state.facing), morph);
  const [motionX, motionY] = getHeroMotionOffset(state.facing, state.motion, state.frame, anchor);
  return { x: base.x + motionX, y: base.y + motionY };
}

function slottedAnchor(
  pose: HeroSlotPose,
  state: HeroItemPixelState,
  morph: BodyMorph,
): { x: number; y: number } {
  const base = mapAnchor(pose.rig, morph);
  const [motionX, motionY] = getHeroMotionOffset(
    state.facing,
    state.motion,
    state.frame,
    pose.motionAnchor,
  );
  return {
    x: base.x + pose.offset[0] + motionX,
    y: base.y + pose.offset[1] + motionY,
  };
}

function isSideFacing(facing: HeroFacing): boolean {
  return facing === 'left' || facing === 'right';
}

function drawSideSlab(
  brush: PixelBrush,
  x: number,
  top: number,
  height: number,
  outline: string,
  fill: string,
  facing: HeroFacing,
): void {
  const left = facing === 'left' ? x - 1 : x;
  brush.rect(left, top, 2, height, outline);
  brush.rect(facing === 'left' ? left : left + 1, top + 1, 1, Math.max(1, height - 2), fill);
}

function drawGlasses(brush: PixelBrush, x: number, y: number, facing: HeroFacing): void {
  if (facing === 'back') return;
  if (facing === 'front') {
    brush.frame(x - 6, y - 2, 5, 4, GLASS);
    brush.frame(x + 2, y - 2, 5, 4, GLASS);
    brush.line(x - 1, y - 1, x + 2, y - 1, GLASS);
    brush.line(x + 2, y - 2, x + 5, y + 2, '#d9e3df');
    return;
  }
  brush.frame(x - 2, y - 2, 5, 4, GLASS);
  brush.line(x + (facing === 'left' ? 2 : -2), y - 1, x + (facing === 'left' ? 5 : -5), y - 1, GLASS);
  brush.pixel(x, y - 1, '#d9e3df');
}

function drawProp(
  brush: PixelBrush,
  visual: AppearancePropKey,
  x: number,
  y: number,
  facing: HeroFacing,
  frame: number,
): void {
  const side = facing === 'left' ? -1 : 1;
  switch (visual) {
    case 'threaded-button':
      brush.rect(x - 1, y - 1, 2, 2, PAPER); brush.pixel(x - 1, y - 1, INK); break;
    case 'wooden-sword':
      brush.line(x - 6 * side, y + 12, x + 6 * side, y - 12, INK, 3);
      brush.line(x - 6 * side, y + 12, x + 6 * side, y - 12, '#8a623d');
      brush.line(x + 2 * side, y - 6, x + 8 * side, y - 2, '#8a623d', 2); break;
    case 'red-workbook':
      if (isSideFacing(facing)) {
        drawSideSlab(brush, x, y - 5, 11, INK, '#9d394a', facing);
      } else {
        brush.rect(x - 4, y - 5, 9, 11, INK); brush.rect(x - 3, y - 4, 7, 9, '#9d394a');
        if (facing === 'front') brush.line(x, y - 3, x, y + 4, '#d7b0a7');
      }
      break;
    case 'stone-schoolbag':
      if (isSideFacing(facing)) {
        brush.rect(x - 3, y - 6, 7, 14, INK); brush.rect(x - 2, y - 5, 5, 12, '#5d5854');
      } else {
        brush.rect(x - 6, y - 6, 13, 14, INK); brush.rect(x - 5, y - 5, 11, 12, '#5d5854');
        if (facing === 'front') brush.rect(x - 3, y - 7, 7, 2, '#91877d');
      }
      break;
    case 'eyebrow-razor':
      brush.line(x - 3, y, x + 3, y, '#b8c2c2'); brush.pixel(x + 3, y + 1, '#776e69'); break;
    case 'pill-bottle':
      brush.rect(x - 2, y - 3, 5, 7, INK); brush.rect(x - 1, y - 2, 3, 5, '#c878a8'); brush.rect(x - 1, y - 4, 3, 1, PAPER); break;
    case 'folded-letter':
      if (isSideFacing(facing)) {
        drawSideSlab(brush, x, y - 2, 6, INK, PAPER, facing);
      } else {
        brush.rect(x - 4, y - 2, 9, 6, PAPER);
        if (facing === 'front') {
          brush.line(x - 4, y - 2, x, y + 1, '#9f7772'); brush.line(x + 4, y - 2, x, y + 1, '#9f7772');
        }
      }
      break;
    case 'cracked-glasses': drawGlasses(brush, x, y, facing); break;
    case 'tight-uniform': break;
    case 'brass-key':
      brush.frame(x - 2, y - 2, 4, 4, GOLD); brush.line(x, y + 2, x, y + 7, GOLD); brush.pixel(x + 2, y + 6, GOLD); break;
    case 'salary-envelope':
      if (isSideFacing(facing)) {
        drawSideSlab(brush, x, y - 2, 5, INK, '#b38358', facing);
      } else {
        brush.rect(x - 3, y - 2, 7, 5, '#b38358');
        if (facing === 'front') brush.line(x - 3, y - 2, x, y, '#e0c49b');
      }
      break;
    case 'plain-tie':
      brush.line(x, y, x, y + 7, '#7b2536', 2); brush.rect(x - 1, y + 6, 3, 3, '#7b2536'); break;
    case 'yellow-raincoat': break;
    case 'old-phone':
      if (isSideFacing(facing)) {
        drawSideSlab(brush, x, y - 4, 8, INK, '#5e9c96', facing);
      } else {
        brush.rect(x - 2, y - 4, 4, 8, INK);
        if (facing === 'front') {
          brush.rect(x - 1, y - 3, 2, 5, '#5e9c96'); brush.pixel(x, y - 3, '#a8cdbf');
        } else {
          brush.pixel(x - 1, y - 3, '#5e9c96');
        }
      }
      break;
    case 'tooth-charm':
      brush.line(x, y - 3, x, y, '#a9895a'); brush.rect(x - 1, y, 3, 3, '#e6dcc5'); brush.pixel(x, y + 3, '#e6dcc5'); break;
    case 'expired-badge':
      if (isSideFacing(facing)) {
        brush.rect(x, y - 2, 1, 4, '#61768a');
      } else {
        brush.rect(x - 2, y - 2, 5, 4, facing === 'front' ? '#61768a' : '#46515b');
        if (facing === 'front') brush.line(x - 1, y - 1, x + 2, y + 1, RED);
      }
      break;
    case 'slow-watch':
      brush.frame(x - 2, y - 2, 4, 4, '#7ea4aa'); brush.pixel(x, y, frame % 2 ? PAPER : INK); break;
    case 'missing-photo':
      if (isSideFacing(facing)) {
        drawSideSlab(brush, x, y - 3, 8, INK, PAPER, facing);
      } else {
        brush.rect(x - 3, y - 3, 6, 8, PAPER);
        if (facing === 'front') {
          brush.rect(x - 2, y - 2, 4, 5, '#615951'); brush.rect(x - 1, y - 1, 2, 3, '#2a282d');
        } else {
          brush.pixel(x + 1, y - 1, '#9e978b');
        }
      }
      break;
    case 'white-bottle':
      brush.rect(x - 2, y - 3, 5, 7, '#cbd7d4'); brush.rect(x - 1, y - 4, 3, 1, PAPER); brush.pixel(x, y, '#879399'); break;
    case 'broken-spine':
      brush.line(x, y - 9, x + 2, y - 4, '#e2d5b6', 2); brush.line(x + 2, y - 3, x - 1, y + 2, '#b74a52'); brush.line(x - 1, y + 2, x + 2, y + 7, '#e2d5b6', 2); break;
    case 'flash-afterimage':
      brush.line(x - 8, y - 14, x - 8, y, '#796f91'); brush.line(x - 11, y - 10, x - 11, y + 2, '#574f6a'); break;
    case 'last-page':
      if (isSideFacing(facing)) {
        drawSideSlab(brush, x, y - 4, 10, INK, PAPER, facing);
      } else {
        brush.rect(x - 4, y - 4, 8, 10, PAPER);
        if (facing === 'front') {
          brush.line(x - 2, y - 1, x + 2, y - 1, RED); brush.line(x - 2, y + 2, x + 1, y + 2, RED);
        }
      }
      break;
    case 'red-packet':
      if (isSideFacing(facing)) {
        drawSideSlab(brush, x, y - 3, 7, INK, '#a73743', facing);
      } else {
        brush.rect(x - 3, y - 3, 7, 7, '#a73743');
        if (facing === 'front') brush.pixel(x, y, '#d5b458');
      }
      break;
    case 'glass-marble':
      brush.frame(x - 2, y - 2, 4, 4, '#7aa1ac'); brush.pixel(x - 1, y - 1, '#d1e0dc'); brush.pixel(x, y, '#8b77a2'); break;
    case 'numb-shadow':
      brush.rect(x - 9, y, 19, 2, '#5b5672'); brush.rect(x - 5, y + 2, 11, 1, '#3e3a51'); break;
  }
}

function overflowColor(visual: AppearancePropKey): string {
  if (['red-workbook', 'last-page', 'red-packet'].includes(visual)) return RED;
  if (['folded-letter', 'missing-photo', 'future-contract'].includes(visual)) return PAPER;
  if (['pill-bottle', 'white-bottle', 'old-phone'].includes(visual)) return GLASS;
  if (['brass-key', 'tooth-charm'].includes(visual)) return GOLD;
  return '#8b8178';
}

function drawOverflowGlyph(
  brush: PixelBrush,
  allocation: HeroItemSlotAllocation,
  visual: AppearancePropKey,
  x: number,
  y: number,
): void {
  if (!allocation.overflow || allocation.overflow === 'hide-prop') return;
  const color = overflowColor(visual);
  if (allocation.overflow === 'mark') {
    brush.pixel(x, y, color);
    brush.pixel(x + 1, y - 1, INK);
    return;
  }
  brush.rect(x - 1, y - 1, 3, 3, INK);
  brush.pixel(x, y, color);
  brush.pixel(x + 1, y, color);
}

export function drawHeroItemPixelPass(
  context: CanvasRenderingContext2D,
  state: HeroItemPixelState,
  pass: HeroItemPixelPass,
): void {
  const brush = new PixelBrush(context);
  const morph: BodyMorph = {
    stature: state.appearance.stature,
    build: state.appearance.bodyBuild,
  };
  const allocations = allocateHeroItemSlots(state.items, state.facing);
  const overflowItems = [...allocations]
    .filter(([, allocation]) => (
      allocation.claim.kind === 'rigid'
      && allocation.overflow !== undefined
      && allocation.overflow !== 'hide-prop'
    ))
    .map(([id]) => id);
  const records = orderedAppearances(state.items);
  records.sort((first, second) => {
    const firstSlot = allocations.get(first.definition.id)?.slot;
    const secondSlot = allocations.get(second.definition.id)?.slot;
    const firstOrder = firstSlot ? SLOT_DRAW_ORDER[firstSlot] : undefined;
    const secondOrder = secondSlot ? SLOT_DRAW_ORDER[secondSlot] : undefined;
    if (firstOrder === undefined || secondOrder === undefined) return 0;
    return firstOrder - secondOrder;
  });
  for (const record of records) {
    const allocation = allocations.get(record.definition.id);
    if (allocation?.claim.kind === 'rigid') {
      if (allocation.pose && allocation.pose.pass === pass) {
        const anchor = slottedAnchor(allocation.pose, state, morph);
        const [animationX, animationY] = animationOffset(record.definition, state);
        for (const mutation of record.definition.mutations) {
          if (mutation.kind !== 'prop') continue;
          // Slot poses own placement. Registry offsets belong to the legacy
          // single-anchor layout and would reintroduce collisions here.
          drawProp(
            brush,
            mutation.visual,
            anchor.x + animationX,
            anchor.y + animationY,
            state.facing,
            state.frame,
          );
        }
      } else if (!allocation.pose && pass === 'front' && allocation.overflow !== 'hide-prop') {
        const overflowIndex = overflowItems.indexOf(record.definition.id);
        const root = animatedAnchor('feet', state, morph);
        const glyphX = root.x - 9 + (overflowIndex % 7) * 3;
        const glyphY = root.y + 3 - Math.floor(overflowIndex / 7) * 3;
        const prop = record.definition.mutations.find((mutation) => mutation.kind === 'prop');
        if (prop?.kind === 'prop') {
          drawOverflowGlyph(brush, allocation, prop.visual, glyphX, glyphY);
        }
      }
      continue;
    }
    if (!shouldDrawInPass(record, state.facing, pass) || hiddenByFacing(record, state.facing)) continue;
    if (record.definition.id === 'fathers-raincoat') {
      continue;
    }
    const anchor = animatedAnchor(record.anchor, state, morph);
    const [animationX, animationY] = animationOffset(record.definition, state);
    for (const mutation of record.definition.mutations) {
      if (mutation.kind !== 'prop') continue;
      const [offsetX = 0, offsetY = 0] = mutation.offset ?? [];
      const directionX = state.facing === 'left' ? -offsetX : offsetX;
      drawProp(
        brush,
        mutation.visual,
        anchor.x + directionX + animationX,
        anchor.y + offsetY + animationY,
        state.facing,
        state.frame,
      );
    }
  }
}
