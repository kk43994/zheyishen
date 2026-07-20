import { getItem } from './relics';
import type { ItemDefinition, ItemId, ItemSlot } from './types';

export type BodyAnchor =
  | 'head'
  | 'face'
  | 'neck'
  | 'chest'
  | 'back'
  | 'leftHand'
  | 'rightHand'
  | 'waist'
  | 'feet'
  | 'shadow';

export type AppearanceLayer =
  | 'shadow'
  | 'behind'
  | 'body'
  | 'garment'
  | 'attachment'
  | 'face'
  | 'effect';

export const APPEARANCE_LAYER_ORDER: Readonly<Record<AppearanceLayer, number>> = {
  shadow: 0,
  behind: 10,
  body: 20,
  garment: 30,
  attachment: 40,
  face: 50,
  effect: 60,
};

export interface QualityVisualBudget {
  /** Maximum non-transparent pixels on the 40x56 logical hero surface. */
  readonly maxOpaquePixels: number;
  readonly maxPaletteColors: number;
  readonly maxLayerPasses: number;
  readonly maxAnimatedPixels: number;
  readonly silhouetteAllowancePx: number;
}

export const QUALITY_VISUAL_BUDGETS: Readonly<
  Record<ItemDefinition['quality'], QualityVisualBudget>
> = {
  1: { maxOpaquePixels: 44, maxPaletteColors: 2, maxLayerPasses: 1, maxAnimatedPixels: 8, silhouetteAllowancePx: 1 },
  2: { maxOpaquePixels: 72, maxPaletteColors: 3, maxLayerPasses: 2, maxAnimatedPixels: 16, silhouetteAllowancePx: 2 },
  3: { maxOpaquePixels: 104, maxPaletteColors: 4, maxLayerPasses: 2, maxAnimatedPixels: 26, silhouetteAllowancePx: 3 },
  4: { maxOpaquePixels: 152, maxPaletteColors: 5, maxLayerPasses: 3, maxAnimatedPixels: 42, silhouetteAllowancePx: 5 },
};

export type AppearancePropKey =
  | 'threaded-button'
  | 'wooden-sword'
  | 'red-workbook'
  | 'stone-schoolbag'
  | 'eyebrow-razor'
  | 'pill-bottle'
  | 'folded-letter'
  | 'cracked-glasses'
  | 'tight-uniform'
  | 'brass-key'
  | 'salary-envelope'
  | 'plain-tie'
  | 'yellow-raincoat'
  | 'old-phone'
  | 'tooth-charm'
  | 'expired-badge'
  | 'slow-watch'
  | 'missing-photo'
  | 'white-bottle'
  | 'broken-spine'
  | 'flash-afterimage'
  | 'last-page'
  | 'red-packet'
  | 'glass-marble'
  | 'numb-shadow';

export type AppearanceMutation =
  | {
      readonly kind: 'prop';
      readonly visual: AppearancePropKey;
      readonly scale: 'tiny' | 'small' | 'medium' | 'large';
      readonly offset?: readonly [x: number, y: number];
    }
  | {
      readonly kind: 'posture';
      readonly lean?: number;
      readonly shoulderDrop?: number;
      readonly kneeBend?: number;
      readonly headOffsetX?: number;
    }
  | {
      readonly kind: 'palette';
      readonly target: 'hair' | 'eyes' | 'skin' | 'outfit' | 'outline' | 'shadow';
      readonly color: string;
      readonly coverage: 'accent' | 'partial' | 'full';
    }
  | {
      readonly kind: 'mark';
      readonly target: 'hair' | 'face' | 'arm' | 'chest' | 'back' | 'outfit' | 'shadow';
      readonly pattern:
        | 'missing-button'
        | 'red-crosses'
        | 'forearm-cuts'
        | 'eye-crack'
        | 'under-eye-shadow'
        | 'gray-strands'
        | 'empty-person'
        | 'stress-lines'
        | 'static-specks';
      readonly color?: string;
    }
  | {
      readonly kind: 'silhouette';
      readonly target: 'hair' | 'head' | 'torso' | 'coat' | 'back' | 'shadow';
      readonly expandX?: number;
      readonly expandY?: number;
      readonly compressX?: number;
      readonly compressY?: number;
    }
  | {
      readonly kind: 'expression';
      readonly value: 'dazed' | 'guarded' | 'strained' | 'forced-smile' | 'numb' | 'startled';
      readonly intensity: 1 | 2 | 3;
    }
  | {
      readonly kind: 'age';
      readonly visualSteps: 1 | 2;
    }
  | {
      readonly kind: 'aura';
      readonly visual: 'phone-glow' | 'time-drag' | 'empty-space' | 'future-debt' | 'flash-slip' | 'recess-rush' | 'snow' | 'numbness';
      readonly color: string;
    };

export type ItemAnimationKind =
  | 'none'
  | 'bob'
  | 'sway'
  | 'flutter'
  | 'pulse'
  | 'jitter'
  | 'drip'
  | 'tick'
  | 'flicker'
  | 'afterimage'
  | 'orbit'
  | 'rattle';

export type ItemAnimationTrigger =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'hurt'
  | 'stage-start'
  | 'low-health'
  | 'always';

export interface ItemAnimationHint {
  readonly kind: ItemAnimationKind;
  readonly trigger: ItemAnimationTrigger;
  readonly frames: 1 | 2 | 3 | 4;
  readonly periodMs: number;
  readonly amplitudePx: number;
  readonly loop: boolean;
}

export interface ConditionalAttachment {
  readonly whenEquipped: ItemId;
  readonly anchor: BodyAnchor;
  readonly layer?: AppearanceLayer;
  readonly priority?: number;
  readonly placement: string;
}

export interface ItemAppearanceDefinition {
  readonly id: ItemId;
  readonly assetKey: `item.${ItemId}`;
  readonly quality: ItemDefinition['quality'];
  readonly slot: ItemSlot;
  readonly layer: AppearanceLayer;
  readonly anchor: BodyAnchor;
  readonly priority: number;
  readonly visualBudget: QualityVisualBudget;
  readonly mutations: readonly [AppearanceMutation, ...AppearanceMutation[]];
  readonly animation: ItemAnimationHint;
  readonly alternateAttachments?: readonly ConditionalAttachment[];
}

type AppearanceInput = Omit<
  ItemAppearanceDefinition,
  'id' | 'assetKey' | 'quality' | 'slot' | 'visualBudget'
>;

type ItemAppearanceFor<Id extends ItemId> = Omit<ItemAppearanceDefinition, 'id' | 'assetKey'> & {
  readonly id: Id;
  readonly assetKey: `item.${Id}`;
};

type ExhaustiveAppearanceRegistry = Record<ItemId, ItemAppearanceDefinition> & {
  readonly [Id in ItemId]: ItemAppearanceFor<Id>;
};

function appearance<const Id extends ItemId>(id: Id, input: AppearanceInput): ItemAppearanceFor<Id> {
  const item = getItem(id);
  return {
    id,
    assetKey: `item.${id}` as const,
    quality: item.quality,
    slot: item.slot,
    visualBudget: QUALITY_VISUAL_BUDGETS[item.quality],
    ...input,
  };
}

export const ITEM_APPEARANCE_REGISTRY: ExhaustiveAppearanceRegistry = {
  'server-shutdown': appearance('server-shutdown', {
    layer: 'effect', anchor: 'shadow', priority: 24,
    mutations: [
      { kind: 'mark', target: 'shadow', pattern: 'empty-person' },
      { kind: 'palette', target: 'shadow', color: '#6f8577', coverage: 'partial' },
    ],
    animation: { kind: 'pulse', trigger: 'low-health', frames: 2, periodMs: 900, amplitudePx: 1, loop: true },
  }),
  'always-crying': appearance('always-crying', {
    layer: 'effect', anchor: 'face', priority: 30,
    mutations: [
      { kind: 'expression', value: 'numb', intensity: 2 },
      { kind: 'palette', target: 'eyes', color: '#9fc2d8', coverage: 'partial' },
    ],
    animation: { kind: 'drip', trigger: 'always', frames: 2, periodMs: 900, amplitudePx: 2, loop: true },
  }),
  'three-day-visible': appearance('three-day-visible', {
    layer: 'effect', anchor: 'shadow', priority: 26,
    mutations: [
      { kind: 'mark', target: 'shadow', pattern: 'empty-person' },
    ],
    animation: { kind: 'pulse', trigger: 'always', frames: 2, periodMs: 1400, amplitudePx: 1, loop: true },
  }),
  'read-3am': appearance('read-3am', {
    layer: 'attachment', anchor: 'rightHand', priority: 12,
    mutations: [
      { kind: 'palette', target: 'eyes', color: '#d8d2c5', coverage: 'accent' },
      { kind: 'expression', value: 'dazed', intensity: 2 },
    ],
    animation: { kind: 'tick', trigger: 'always', frames: 2, periodMs: 1000, amplitudePx: 1, loop: true },
  }),
  'retracted-voice': appearance('retracted-voice', {
    layer: 'attachment', anchor: 'neck', priority: 14,
    mutations: [
      { kind: 'palette', target: 'outline', color: '#7a6f85', coverage: 'accent' },
      { kind: 'expression', value: 'guarded', intensity: 2 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'takeout-3am': appearance('takeout-3am', {
    layer: 'attachment', anchor: 'waist', priority: 12,
    mutations: [
      { kind: 'silhouette', target: 'torso', expandX: 2 },
      { kind: 'palette', target: 'outfit', color: '#8a7a5f', coverage: 'accent' },
    ],
    animation: { kind: 'bob', trigger: 'walk', frames: 2, periodMs: 500, amplitudePx: 1, loop: true },
  }),
  'auto-renew': appearance('auto-renew', {
    layer: 'effect', anchor: 'shadow', priority: 20,
    mutations: [
      { kind: 'palette', target: 'shadow', color: '#7f8a6e', coverage: 'partial' },
    ],
    animation: { kind: 'pulse', trigger: 'always', frames: 2, periodMs: 1300, amplitudePx: 1, loop: true },
  }),
  'bargain-link': appearance('bargain-link', {
    layer: 'attachment', anchor: 'chest', priority: 16,
    mutations: [
      { kind: 'palette', target: 'outfit', color: '#a05548', coverage: 'accent' },
      { kind: 'mark', target: 'chest', pattern: 'stress-lines', color: '#a05548' },
    ],
    animation: { kind: 'pulse', trigger: 'always', frames: 2, periodMs: 900, amplitudePx: 1, loop: true },
  }),
  'mineral-water': appearance('mineral-water', {
    layer: 'attachment', anchor: 'rightHand', priority: 10,
    mutations: [
      { kind: 'expression', value: 'guarded', intensity: 2 },
      { kind: 'posture', lean: -1 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'group-dad': appearance('group-dad', {
    layer: 'effect', anchor: 'shadow', priority: 22,
    mutations: [
      { kind: 'mark', target: 'shadow', pattern: 'empty-person' },
      { kind: 'expression', value: 'numb', intensity: 2 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'divorce-draft': appearance('divorce-draft', {
    layer: 'attachment', anchor: 'chest', priority: 18,
    mutations: [
      { kind: 'mark', target: 'chest', pattern: 'stress-lines' },
      { kind: 'expression', value: 'strained', intensity: 2 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'checkup-arrows': appearance('checkup-arrows', {
    layer: 'effect', anchor: 'chest', priority: 28,
    mutations: [
      { kind: 'mark', target: 'chest', pattern: 'stress-lines', color: '#a0524a' },
      { kind: 'palette', target: 'outline', color: '#a0524a', coverage: 'accent' },
    ],
    animation: { kind: 'jitter', trigger: 'always', frames: 2, periodMs: 700, amplitudePx: 1, loop: true },
  }),
  'shared-powerbank': appearance('shared-powerbank', {
    layer: 'attachment', anchor: 'waist', priority: 12,
    mutations: [
      { kind: 'palette', target: 'outline', color: '#6e8783', coverage: 'accent' },
      { kind: 'posture', shoulderDrop: 1 },
    ],
    animation: { kind: 'tick', trigger: 'always', frames: 2, periodMs: 1000, amplitudePx: 1, loop: true },
  }),
  'third-pill': appearance('third-pill', {
    layer: 'effect', anchor: 'face', priority: 32,
    mutations: [
      { kind: 'expression', value: 'dazed', intensity: 2 },
      { kind: 'silhouette', target: 'torso', compressX: 3 },
      { kind: 'palette', target: 'eyes', color: '#96789c', coverage: 'partial' },
    ],
    animation: { kind: 'jitter', trigger: 'always', frames: 2, periodMs: 600, amplitudePx: 2, loop: true },
  }),
  'loan-contract': appearance('loan-contract', {
    layer: 'attachment', anchor: 'chest', priority: 20,
    mutations: [
      { kind: 'palette', target: 'outfit', color: '#8a6a4f', coverage: 'partial' },
      { kind: 'posture', shoulderDrop: 2 },
      { kind: 'mark', target: 'chest', pattern: 'stress-lines' },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'name-sold': appearance('name-sold', {
    layer: 'effect', anchor: 'face', priority: 34,
    mutations: [
      { kind: 'expression', value: 'numb', intensity: 2 },
      { kind: 'mark', target: 'shadow', pattern: 'empty-person' },
      { kind: 'palette', target: 'outline', color: '#6b6f7e', coverage: 'partial' },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'moms-bowl': appearance('moms-bowl', {
    layer: 'attachment', anchor: 'chest', priority: 14,
    mutations: [
      { kind: 'silhouette', target: 'torso', expandX: 2 },
      { kind: 'palette', target: 'skin', color: '#c9a98a', coverage: 'accent' },
    ],
    animation: { kind: 'bob', trigger: 'walk', frames: 2, periodMs: 600, amplitudePx: 1, loop: true },
  }),
  'ruma-msg': appearance('ruma-msg', {
    layer: 'attachment', anchor: 'rightHand', priority: 12,
    mutations: [
      { kind: 'palette', target: 'eyes', color: '#9fd0b8', coverage: 'accent' },
      { kind: 'expression', value: 'guarded', intensity: 2 },
    ],
    animation: { kind: 'pulse', trigger: 'low-health', frames: 2, periodMs: 700, amplitudePx: 1, loop: true },
  }),
  'held-elevator': appearance('held-elevator', {
    layer: 'effect', anchor: 'shadow', priority: 18,
    mutations: [
      { kind: 'posture', lean: -1 },
      { kind: 'palette', target: 'outline', color: '#7c828e', coverage: 'accent' },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'old-door-lock': appearance('old-door-lock', {
    layer: 'attachment', anchor: 'waist', priority: 12,
    mutations: [
      { kind: 'prop', visual: 'brass-key', scale: 'small', offset: [2, 2] },
      { kind: 'palette', target: 'outline', color: '#8f7a49', coverage: 'accent' },
    ],
    animation: { kind: 'bob', trigger: 'walk', frames: 2, periodMs: 500, amplitudePx: 1, loop: true },
  }),
  'drank-for-boss': appearance('drank-for-boss', {
    layer: 'effect', anchor: 'face', priority: 26,
    mutations: [
      { kind: 'palette', target: 'skin', color: '#c98a6a', coverage: 'partial' },
      { kind: 'expression', value: 'dazed', intensity: 2 },
      { kind: 'posture', lean: 3 },
    ],
    animation: { kind: 'sway', trigger: 'walk', frames: 2, periodMs: 700, amplitudePx: 1, loop: true },
  }),
  'hair-in-takeout': appearance('hair-in-takeout', {
    layer: 'attachment', anchor: 'waist', priority: 10,
    mutations: [
      { kind: 'silhouette', target: 'torso', expandX: 2 },
      { kind: 'palette', target: 'outfit', color: '#8a7a5f', coverage: 'accent' },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'unwashed-pillow': appearance('unwashed-pillow', {
    layer: 'attachment', anchor: 'chest', priority: 12,
    mutations: [
      { kind: 'silhouette', target: 'torso', expandX: 3 },
      { kind: 'posture', shoulderDrop: 3 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'sock-cigs': appearance('sock-cigs', {
    layer: 'effect', anchor: 'face', priority: 24,
    mutations: [
      { kind: 'palette', target: 'skin', color: '#c9b98a', coverage: 'partial' },
      { kind: 'mark', target: 'face', pattern: 'under-eye-shadow' },
      { kind: 'silhouette', target: 'torso', compressX: 2 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'pregnancy-test': appearance('pregnancy-test', {
    layer: 'attachment', anchor: 'rightHand', priority: 12,
    mutations: [
      { kind: 'posture', shoulderDrop: 2 },
      { kind: 'expression', value: 'strained', intensity: 2 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'gym-card': appearance('gym-card', {
    layer: 'attachment', anchor: 'waist', priority: 8,
    mutations: [
      { kind: 'posture', lean: -2 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'funeral-photo': appearance('funeral-photo', {
    layer: 'effect', anchor: 'face', priority: 36,
    mutations: [
      { kind: 'expression', value: 'forced-smile', intensity: 2 },
      { kind: 'palette', target: 'outline', color: '#d8cfae', coverage: 'accent' },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'typing-indicator': appearance('typing-indicator', {
    layer: 'effect', anchor: 'face', priority: 22,
    mutations: [
      { kind: 'expression', value: 'startled', intensity: 2 },
      { kind: 'mark', target: 'face', pattern: 'under-eye-shadow' },
    ],
    animation: { kind: 'tick', trigger: 'always', frames: 2, periodMs: 800, amplitudePx: 1, loop: true },
  }),
  'year-report': appearance('year-report', {
    layer: 'effect', anchor: 'face', priority: 24,
    mutations: [
      { kind: 'mark', target: 'face', pattern: 'under-eye-shadow' },
      { kind: 'palette', target: 'eyes', color: '#4a4a58', coverage: 'partial' },
      { kind: 'silhouette', target: 'torso', compressX: 1 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'ktv-song': appearance('ktv-song', {
    layer: 'effect', anchor: 'face', priority: 18,
    mutations: [
      { kind: 'expression', value: 'guarded', intensity: 1 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'breath-on-glass': appearance('breath-on-glass', {
    layer: 'effect', anchor: 'face', priority: 18,
    mutations: [
      { kind: 'palette', target: 'eyes', color: '#a9c2c6', coverage: 'accent' },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'momo-avatar': appearance('momo-avatar', {
    layer: 'attachment', anchor: 'head', priority: 20,
    mutations: [
      { kind: 'palette', target: 'hair', color: '#e8a8c8', coverage: 'accent' },
      { kind: 'expression', value: 'guarded', intensity: 2 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'ai-chat': appearance('ai-chat', {
    layer: 'effect', anchor: 'face', priority: 26,
    mutations: [
      { kind: 'palette', target: 'eyes', color: '#7fb8c8', coverage: 'accent' },
      { kind: 'mark', target: 'face', pattern: 'under-eye-shadow' },
    ],
    animation: { kind: 'pulse', trigger: 'always', frames: 2, periodMs: 1100, amplitudePx: 1, loop: true },
  }),
  'streak-1847': appearance('streak-1847', {
    layer: 'attachment', anchor: 'rightHand', priority: 8,
    mutations: [
      { kind: 'posture', lean: -1 },
      { kind: 'palette', target: 'outline', color: '#7f8a6e', coverage: 'accent' },
    ],
    animation: { kind: 'tick', trigger: 'always', frames: 2, periodMs: 1200, amplitudePx: 1, loop: true },
  }),
  'goodnight-2h': appearance('goodnight-2h', {
    layer: 'effect', anchor: 'face', priority: 24,
    mutations: [
      { kind: 'mark', target: 'face', pattern: 'under-eye-shadow' },
      { kind: 'palette', target: 'skin', color: '#a8a4b0', coverage: 'partial' },
      { kind: 'silhouette', target: 'torso', compressX: 2 },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'friend-verify': appearance('friend-verify', {
    layer: 'effect', anchor: 'face', priority: 22,
    mutations: [
      { kind: 'expression', value: 'numb', intensity: 2 },
      { kind: 'palette', target: 'outline', color: '#77705f', coverage: 'accent' },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'summer-run': appearance('summer-run', {
    layer: 'effect', anchor: 'shadow', priority: 14,
    mutations: [
      { kind: 'posture', lean: 4 },
      { kind: 'palette', target: 'shadow', color: '#9a8154', coverage: 'accent' },
    ],
    animation: { kind: 'sway', trigger: 'walk', frames: 2, periodMs: 450, amplitudePx: 1, loop: true },
  }),
  'one-more-game': appearance('one-more-game', {
    layer: 'effect', anchor: 'face', priority: 22,
    mutations: [
      { kind: 'mark', target: 'face', pattern: 'under-eye-shadow' },
      { kind: 'expression', value: 'dazed', intensity: 2 },
      { kind: 'palette', target: 'eyes', color: '#6f7d88', coverage: 'partial' },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'eye-exercise': appearance('eye-exercise', {
    layer: 'effect', anchor: 'face', priority: 20,
    mutations: [
      { kind: 'palette', target: 'eyes', color: '#5f7581', coverage: 'accent' },
    ],
    animation: { kind: 'tick', trigger: 'always', frames: 2, periodMs: 1500, amplitudePx: 1, loop: true },
  }),
  'card-binder': appearance('card-binder', {
    layer: 'attachment', anchor: 'back', priority: 12,
    mutations: [
      { kind: 'palette', target: 'outfit', color: '#8a6a4f', coverage: 'accent' },
    ],
    animation: { kind: 'flutter', trigger: 'walk', frames: 2, periodMs: 600, amplitudePx: 1, loop: true },
  }),
  'abstract-lv10': appearance('abstract-lv10', {
    layer: 'effect', anchor: 'face', priority: 22,
    mutations: [
      { kind: 'expression', value: 'forced-smile', intensity: 2 },
      { kind: 'palette', target: 'hair', color: '#96789c', coverage: 'accent' },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),
  'shop-freezer': appearance('shop-freezer', {
    layer: 'attachment', anchor: 'back', priority: 12,
    mutations: [
      { kind: 'mark', target: 'outfit', pattern: 'static-specks', color: '#bfe0e8' },
      { kind: 'palette', target: 'outline', color: '#7e97a0', coverage: 'accent' },
    ],
    animation: { kind: 'none', trigger: 'always', frames: 1, periodMs: 0, amplitudePx: 0, loop: false },
  }),

  'loose-button': appearance('loose-button', {
    layer: 'attachment', anchor: 'chest', priority: 12,
    mutations: [
      { kind: 'prop', visual: 'threaded-button', scale: 'tiny', offset: [3, 8] },
      { kind: 'mark', target: 'outfit', pattern: 'missing-button' },
    ],
    animation: { kind: 'sway', trigger: 'walk', frames: 2, periodMs: 320, amplitudePx: 1, loop: true },
    alternateAttachments: [{ whenEquipped: 'fathers-raincoat', anchor: 'rightHand', placement: 'tied-to-wrist' }],
  }),
  'wooden-sword': appearance('wooden-sword', {
    layer: 'behind', anchor: 'back', priority: 14,
    mutations: [{ kind: 'prop', visual: 'wooden-sword', scale: 'large', offset: [0, -2] }],
    animation: { kind: 'sway', trigger: 'walk', frames: 2, periodMs: 420, amplitudePx: 1, loop: true },
  }),
  'red-workbook': appearance('red-workbook', {
    layer: 'behind', anchor: 'back', priority: 22,
    mutations: [
      { kind: 'prop', visual: 'red-workbook', scale: 'medium', offset: [-2, 2] },
      { kind: 'mark', target: 'outfit', pattern: 'red-crosses', color: '#a64049' },
    ],
    animation: { kind: 'flutter', trigger: 'attack', frames: 3, periodMs: 260, amplitudePx: 1, loop: false },
  }),
  'stone-schoolbag': appearance('stone-schoolbag', {
    layer: 'behind', anchor: 'back', priority: 30,
    mutations: [
      { kind: 'prop', visual: 'stone-schoolbag', scale: 'large', offset: [-2, 2] },
      { kind: 'posture', lean: 2, shoulderDrop: 2, headOffsetX: 2 },
      { kind: 'silhouette', target: 'back', expandX: 2, expandY: 2 },
    ],
    animation: { kind: 'rattle', trigger: 'walk', frames: 2, periodMs: 460, amplitudePx: 1, loop: true },
  }),
  'bleach-powder': appearance('bleach-powder', {
    layer: 'face', anchor: 'head', priority: 16,
    mutations: [
      { kind: 'palette', target: 'hair', color: '#d7c84f', coverage: 'full' },
      { kind: 'silhouette', target: 'hair', expandX: 1, expandY: 1 },
    ],
    animation: { kind: 'jitter', trigger: 'attack', frames: 2, periodMs: 160, amplitudePx: 1, loop: false },
  }),
  'eyebrow-razor': appearance('eyebrow-razor', {
    layer: 'attachment', anchor: 'leftHand', priority: 48,
    mutations: [
      { kind: 'prop', visual: 'eyebrow-razor', scale: 'small', offset: [-1, 1] },
      { kind: 'mark', target: 'arm', pattern: 'forearm-cuts', color: '#9b3848' },
      { kind: 'expression', value: 'guarded', intensity: 2 },
    ],
    animation: { kind: 'flicker', trigger: 'hurt', frames: 2, periodMs: 120, amplitudePx: 0, loop: false },
  }),
  'od-pill': appearance('od-pill', {
    layer: 'attachment', anchor: 'waist', priority: 38,
    mutations: [
      { kind: 'prop', visual: 'pill-bottle', scale: 'small', offset: [-2, 1] },
      { kind: 'palette', target: 'eyes', color: '#d57bb0', coverage: 'full' },
      { kind: 'expression', value: 'dazed', intensity: 2 },
    ],
    animation: { kind: 'jitter', trigger: 'always', frames: 3, periodMs: 540, amplitudePx: 1, loop: true },
  }),
  'front-desk-letter': appearance('front-desk-letter', {
    layer: 'attachment', anchor: 'chest', priority: 36,
    mutations: [{ kind: 'prop', visual: 'folded-letter', scale: 'medium', offset: [0, 2] }],
    animation: { kind: 'flutter', trigger: 'walk', frames: 2, periodMs: 520, amplitudePx: 1, loop: true },
    alternateAttachments: [{ whenEquipped: 'fathers-raincoat', anchor: 'chest', priority: 62, placement: 'outer-coat-pocket' }],
  }),
  'cracked-glasses': appearance('cracked-glasses', {
    layer: 'face', anchor: 'face', priority: 40,
    mutations: [
      { kind: 'prop', visual: 'cracked-glasses', scale: 'medium' },
      { kind: 'mark', target: 'face', pattern: 'eye-crack', color: '#d9e3df' },
    ],
    animation: { kind: 'flicker', trigger: 'hurt', frames: 2, periodMs: 100, amplitudePx: 0, loop: false },
  }),
  'small-uniform': appearance('small-uniform', {
    layer: 'garment', anchor: 'chest', priority: 24,
    mutations: [
      { kind: 'prop', visual: 'tight-uniform', scale: 'large' },
      { kind: 'silhouette', target: 'torso', compressX: 1, compressY: 1 },
      { kind: 'palette', target: 'outfit', color: '#405969', coverage: 'full' },
    ],
    animation: { kind: 'rattle', trigger: 'walk', frames: 2, periodMs: 360, amplitudePx: 1, loop: true },
  }),
  'only-key': appearance('only-key', {
    layer: 'attachment', anchor: 'waist', priority: 22,
    mutations: [{ kind: 'prop', visual: 'brass-key', scale: 'small', offset: [2, 2] }],
    animation: { kind: 'sway', trigger: 'walk', frames: 3, periodMs: 340, amplitudePx: 2, loop: true },
  }),
  'first-salary': appearance('first-salary', {
    layer: 'attachment', anchor: 'rightHand', priority: 32,
    mutations: [{ kind: 'prop', visual: 'salary-envelope', scale: 'small', offset: [1, 2] }],
    animation: { kind: 'bob', trigger: 'walk', frames: 2, periodMs: 360, amplitudePx: 1, loop: true },
  }),
  'nameless-tie': appearance('nameless-tie', {
    layer: 'attachment', anchor: 'neck', priority: 42,
    mutations: [
      { kind: 'prop', visual: 'plain-tie', scale: 'medium', offset: [0, 1] },
      { kind: 'posture', shoulderDrop: 1 },
      { kind: 'expression', value: 'strained', intensity: 1 },
    ],
    animation: { kind: 'sway', trigger: 'walk', frames: 3, periodMs: 380, amplitudePx: 1, loop: true },
  }),
  'fathers-raincoat': appearance('fathers-raincoat', {
    layer: 'garment', anchor: 'chest', priority: 60,
    mutations: [
      { kind: 'prop', visual: 'yellow-raincoat', scale: 'large' },
      { kind: 'silhouette', target: 'coat', expandX: 3, expandY: 4 },
      { kind: 'posture', lean: 1, shoulderDrop: 1 },
      { kind: 'palette', target: 'outfit', color: '#a78a2d', coverage: 'full' },
    ],
    animation: { kind: 'drip', trigger: 'always', frames: 4, periodMs: 640, amplitudePx: 2, loop: true },
  }),
  'unsent-phone': appearance('unsent-phone', {
    layer: 'attachment', anchor: 'leftHand', priority: 34,
    mutations: [
      { kind: 'prop', visual: 'old-phone', scale: 'small', offset: [-1, 1] },
      { kind: 'aura', visual: 'phone-glow', color: '#5e9c96' },
    ],
    animation: { kind: 'pulse', trigger: 'attack', frames: 3, periodMs: 380, amplitudePx: 1, loop: false },
  }),
  'baby-tooth': appearance('baby-tooth', {
    layer: 'attachment', anchor: 'neck', priority: 54,
    mutations: [{ kind: 'prop', visual: 'tooth-charm', scale: 'small', offset: [0, 2] }],
    animation: { kind: 'sway', trigger: 'walk', frames: 3, periodMs: 420, amplitudePx: 1, loop: true },
  }),
  'revoked-badge': appearance('revoked-badge', {
    layer: 'attachment', anchor: 'chest', priority: 44,
    mutations: [{ kind: 'prop', visual: 'expired-badge', scale: 'small', offset: [3, 0] }],
    animation: { kind: 'sway', trigger: 'walk', frames: 2, periodMs: 360, amplitudePx: 1, loop: true },
    alternateAttachments: [{ whenEquipped: 'fathers-raincoat', anchor: 'chest', priority: 66, placement: 'coat-zipper' }],
  }),
  'slow-watch': appearance('slow-watch', {
    layer: 'attachment', anchor: 'rightHand', priority: 46,
    mutations: [
      { kind: 'prop', visual: 'slow-watch', scale: 'tiny', offset: [0, 1] },
      { kind: 'aura', visual: 'time-drag', color: '#81a0aa' },
    ],
    animation: { kind: 'tick', trigger: 'always', frames: 4, periodMs: 7000, amplitudePx: 1, loop: true },
  }),
  'missing-photo': appearance('missing-photo', {
    layer: 'attachment', anchor: 'chest', priority: 50,
    mutations: [
      { kind: 'prop', visual: 'missing-photo', scale: 'small', offset: [-3, 1] },
      { kind: 'mark', target: 'outfit', pattern: 'empty-person', color: '#615951' },
    ],
    animation: { kind: 'flicker', trigger: 'low-health', frames: 2, periodMs: 720, amplitudePx: 0, loop: true },
    alternateAttachments: [{ whenEquipped: 'fathers-raincoat', anchor: 'chest', priority: 64, placement: 'inside-lapel' }],
  }),
  'white-bottle': appearance('white-bottle', {
    layer: 'attachment', anchor: 'waist', priority: 42,
    mutations: [
      { kind: 'prop', visual: 'white-bottle', scale: 'small', offset: [-2, 1] },
      { kind: 'mark', target: 'face', pattern: 'under-eye-shadow', color: '#77727a' },
    ],
    animation: { kind: 'rattle', trigger: 'attack', frames: 2, periodMs: 180, amplitudePx: 1, loop: false },
  }),
  'empty-frame': appearance('empty-frame', {
    // 相框空着，是因为那个人一直没来——不背框，影子里缺一块
    layer: 'behind', anchor: 'shadow', priority: 8,
    mutations: [
      { kind: 'mark', target: 'shadow', pattern: 'empty-person', color: '#76553d' },
      { kind: 'palette', target: 'outline', color: '#76553d', coverage: 'accent' },
    ],
    animation: { kind: 'pulse', trigger: 'attack', frames: 3, periodMs: 520, amplitudePx: 1, loop: false },
  }),
  'broken-spine': appearance('broken-spine', {
    layer: 'behind', anchor: 'back', priority: 52,
    mutations: [
      { kind: 'prop', visual: 'broken-spine', scale: 'large', offset: [1, 0] },
      { kind: 'posture', lean: 4, shoulderDrop: 3, headOffsetX: 4 },
      { kind: 'silhouette', target: 'back', expandX: 2 },
    ],
    animation: { kind: 'rattle', trigger: 'hurt', frames: 3, periodMs: 220, amplitudePx: 1, loop: false },
  }),
  'spent-decade': appearance('spent-decade', {
    layer: 'effect', anchor: 'shadow', priority: 28,
    mutations: [
      { kind: 'age', visualSteps: 2 },
      { kind: 'mark', target: 'hair', pattern: 'gray-strands', color: '#ded8ca' },
      { kind: 'aura', visual: 'future-debt', color: '#b9b7b0' },
    ],
    animation: { kind: 'afterimage', trigger: 'attack', frames: 4, periodMs: 320, amplitudePx: 2, loop: false },
  }),
  'painless-night': appearance('painless-night', {
    layer: 'effect', anchor: 'shadow', priority: 58,
    mutations: [
      { kind: 'prop', visual: 'numb-shadow', scale: 'large' },
      { kind: 'palette', target: 'skin', color: '#85858b', coverage: 'partial' },
      { kind: 'palette', target: 'shadow', color: '#5b5672', coverage: 'full' },
      { kind: 'expression', value: 'numb', intensity: 3 },
      { kind: 'aura', visual: 'numbness', color: '#7f8591' },
    ],
    animation: { kind: 'pulse', trigger: 'hurt', frames: 4, periodMs: 8000, amplitudePx: 2, loop: false },
  }),
  'held-pee': appearance('held-pee', {
    layer: 'body', anchor: 'waist', priority: 26,
    mutations: [
      { kind: 'posture', kneeBend: 2, shoulderDrop: -1 },
      { kind: 'expression', value: 'strained', intensity: 2 },
    ],
    animation: { kind: 'jitter', trigger: 'idle', frames: 3, periodMs: 260, amplitudePx: 1, loop: true },
  }),
  'flash-escape': appearance('flash-escape', {
    // 纯效果道具：平时不上身，只在受击触发瞬移时留短残影
    layer: 'effect', anchor: 'shadow', priority: 34,
    mutations: [
      { kind: 'palette', target: 'outline', color: '#9a8fb5', coverage: 'accent' },
    ],
    animation: { kind: 'afterimage', trigger: 'hurt', frames: 4, periodMs: 180, amplitudePx: 3, loop: false },
  }),
  'class-break': appearance('class-break', {
    layer: 'effect', anchor: 'feet', priority: 18,
    mutations: [
      { kind: 'aura', visual: 'recess-rush', color: '#a8842f' },
    ],
    animation: { kind: 'afterimage', trigger: 'stage-start', frames: 4, periodMs: 180, amplitudePx: 2, loop: true },
  }),
  'last-page': appearance('last-page', {
    layer: 'attachment', anchor: 'rightHand', priority: 38,
    mutations: [
      { kind: 'prop', visual: 'last-page', scale: 'medium', offset: [1, 1] },
      { kind: 'mark', target: 'outfit', pattern: 'red-crosses', color: '#a0524a' },
    ],
    animation: { kind: 'flutter', trigger: 'attack', frames: 3, periodMs: 240, amplitudePx: 2, loop: false },
  }),
  'five-ha': appearance('five-ha', {
    layer: 'face', anchor: 'face', priority: 46,
    mutations: [
      { kind: 'expression', value: 'forced-smile', intensity: 2 },
    ],
    animation: { kind: 'jitter', trigger: 'hurt', frames: 3, periodMs: 160, amplitudePx: 1, loop: false },
  }),
  'red-packet': appearance('red-packet', {
    layer: 'attachment', anchor: 'waist', priority: 18,
    mutations: [{ kind: 'prop', visual: 'red-packet', scale: 'small', offset: [2, 1] }],
    animation: { kind: 'bob', trigger: 'walk', frames: 2, periodMs: 360, amplitudePx: 1, loop: true },
  }),
  'snow-screen': appearance('snow-screen', {
    layer: 'effect', anchor: 'shadow', priority: 70,
    mutations: [
      { kind: 'mark', target: 'shadow', pattern: 'static-specks', color: '#8b93a0' },
      { kind: 'aura', visual: 'snow', color: '#b7bbc1' },
      { kind: 'expression', value: 'startled', intensity: 1 },
    ],
    animation: { kind: 'flicker', trigger: 'always', frames: 4, periodMs: 1100, amplitudePx: 1, loop: true },
  }),
  marble: appearance('marble', {
    layer: 'attachment', anchor: 'rightHand', priority: 28,
    mutations: [{ kind: 'prop', visual: 'glass-marble', scale: 'tiny', offset: [1, 1] }],
    animation: { kind: 'orbit', trigger: 'attack', frames: 4, periodMs: 300, amplitudePx: 2, loop: false },
  }),
};

export function getItemAppearance(id: ItemId): ItemAppearanceDefinition {
  return ITEM_APPEARANCE_REGISTRY[id];
}

export function getOrderedItemAppearances(items: readonly ItemId[]): ItemAppearanceDefinition[] {
  return items
    .map((id) => ITEM_APPEARANCE_REGISTRY[id])
    .sort((first, second) => {
      const layerDelta = APPEARANCE_LAYER_ORDER[first.layer] - APPEARANCE_LAYER_ORDER[second.layer];
      return layerDelta || first.priority - second.priority || first.id.localeCompare(second.id);
    });
}

export function resolveItemAttachment(
  definition: ItemAppearanceDefinition,
  equipped: ReadonlySet<ItemId>,
): Pick<ItemAppearanceDefinition, 'anchor' | 'layer' | 'priority'> & { placement: string } {
  const alternate = definition.alternateAttachments?.find((candidate) => equipped.has(candidate.whenEquipped));
  return {
    anchor: alternate?.anchor ?? definition.anchor,
    layer: alternate?.layer ?? definition.layer,
    priority: alternate?.priority ?? definition.priority,
    placement: alternate?.placement ?? 'default',
  };
}
