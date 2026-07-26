import { getItemAppearance, resolveItemAttachment, type BodyAnchor } from './item-appearance';
import type { BodyZone, HeroFacing, RigAnchor } from './hero-morph';
import type { ItemId } from './types';

export type HeroPropPass = 'behind' | 'front';
export type HeroRigSlot =
  | 'nearHandGrip' | 'nearHandWrist' | 'farHandGrip' | 'farHandWrist'
  | 'waistNear' | 'waistFar'
  | 'chestCenter' | 'chestNearPin' | 'chestFarPin'
  | 'backLong' | 'backVolume' | 'backSurface'
  | 'faceEyes' | 'faceMouth' | 'neckTie' | 'neckCharm';

export interface HeroSlotPose {
  readonly rig: RigAnchor;
  readonly motionAnchor: BodyAnchor;
  readonly offset: readonly [dx: number, dy: number];
  readonly pass: HeroPropPass;
  readonly visible: boolean;
}

export type HeroItemClaim =
  | {
      readonly kind: 'rigid';
      readonly slots: readonly HeroRigSlot[];
      readonly raincoatSlots?: readonly HeroRigSlot[];
      readonly overflow: 'mark' | 'compact' | 'hide-prop';
    }
  | { readonly kind: 'fitted'; readonly lane: 'inner' | 'outer' }
  | { readonly kind: 'mutation' }
  | { readonly kind: 'effect'; readonly lane: 'behind' | 'ground' | 'transient' | 'orbit' };

export interface HeroItemSlotAllocation {
  readonly claim: HeroItemClaim;
  readonly slot?: HeroRigSlot;
  readonly pose?: HeroSlotPose;
  readonly overflow?: 'mark' | 'compact' | 'hide-prop';
}

const pose = (
  x: number,
  y: number,
  zone: BodyZone,
  motionAnchor: BodyAnchor,
  dx: number,
  dy: number,
  pass: HeroPropPass,
  visible = true,
): HeroSlotPose => ({ rig: { x, y, zone }, motionAnchor, offset: [dx, dy], pass, visible });

const HIDDEN = false;

export const HERO_SLOT_POSES: Readonly<Record<HeroRigSlot, Readonly<Record<HeroFacing, HeroSlotPose>>>> = {
  nearHandGrip: {
    front: pose(28, 36, 'torso', 'rightHand', 3, 1, 'front'), back: pose(28, 36, 'torso', 'rightHand', 3, 1, 'front'),
    left: pose(23, 36, 'torso', 'rightHand', 3, 1, 'front'), right: pose(17, 36, 'torso', 'rightHand', -3, 1, 'front'),
  },
  nearHandWrist: {
    front: pose(28, 36, 'torso', 'rightHand', 0, -1, 'front'), back: pose(28, 36, 'torso', 'rightHand', 0, -1, 'front'),
    left: pose(23, 36, 'torso', 'rightHand', 0, -1, 'front'), right: pose(17, 36, 'torso', 'rightHand', 0, -1, 'front'),
  },
  farHandGrip: {
    front: pose(12, 36, 'torso', 'leftHand', -3, 1, 'behind'), back: pose(12, 36, 'torso', 'leftHand', -3, 1, 'behind'),
    left: pose(17, 35, 'torso', 'leftHand', -2, 0, 'behind'), right: pose(23, 35, 'torso', 'leftHand', 2, 0, 'behind'),
  },
  farHandWrist: {
    front: pose(12, 36, 'torso', 'leftHand', 0, -1, 'behind'), back: pose(12, 36, 'torso', 'leftHand', 0, -1, 'behind'),
    left: pose(17, 35, 'torso', 'leftHand', 0, -1, 'behind', HIDDEN), right: pose(23, 35, 'torso', 'leftHand', 0, -1, 'behind', HIDDEN),
  },
  waistNear: {
    front: pose(20, 39, 'torso', 'waist', 6, 1, 'front'), back: pose(20, 39, 'torso', 'waist', -6, 1, 'front'),
    left: pose(20, 39, 'torso', 'waist', 4, 0, 'front'), right: pose(20, 39, 'torso', 'waist', -4, 0, 'front'),
  },
  waistFar: {
    front: pose(20, 39, 'torso', 'waist', -6, 1, 'behind'), back: pose(20, 39, 'torso', 'waist', 6, 1, 'behind'),
    left: pose(20, 39, 'torso', 'waist', -3, 0, 'behind'), right: pose(20, 39, 'torso', 'waist', 3, 0, 'behind'),
  },
  chestCenter: {
    front: pose(20, 29, 'torso', 'chest', 0, 2, 'front'), back: pose(20, 29, 'torso', 'chest', 0, 2, 'front', HIDDEN),
    left: pose(19, 29, 'torso', 'chest', -1, 2, 'front'), right: pose(21, 29, 'torso', 'chest', 1, 2, 'front'),
  },
  chestNearPin: {
    front: pose(20, 29, 'torso', 'chest', 5, -2, 'front'), back: pose(20, 29, 'torso', 'chest', 5, -2, 'front', HIDDEN),
    left: pose(19, 29, 'torso', 'chest', -4, -2, 'front'), right: pose(21, 29, 'torso', 'chest', 4, -2, 'front'),
  },
  chestFarPin: {
    front: pose(20, 29, 'torso', 'chest', -5, -2, 'front'), back: pose(20, 29, 'torso', 'chest', -5, -2, 'front', HIDDEN),
    left: pose(19, 29, 'torso', 'chest', 2, -2, 'behind', HIDDEN), right: pose(21, 29, 'torso', 'chest', -2, -2, 'behind', HIDDEN),
  },
  backLong: {
    front: pose(20, 29, 'torso', 'back', -4, 0, 'behind'), back: pose(20, 29, 'torso', 'back', 5, 0, 'front'),
    left: pose(24, 29, 'torso', 'back', 2, 0, 'behind'), right: pose(16, 29, 'torso', 'back', -2, 0, 'behind'),
  },
  backVolume: {
    front: pose(20, 29, 'torso', 'back', 0, 1, 'behind'), back: pose(20, 29, 'torso', 'back', 0, 1, 'front'),
    left: pose(24, 29, 'torso', 'back', 2, 1, 'behind'), right: pose(16, 29, 'torso', 'back', -2, 1, 'behind'),
  },
  backSurface: {
    front: pose(20, 29, 'torso', 'back', 0, 1, 'behind', HIDDEN), back: pose(20, 29, 'torso', 'back', 0, 1, 'front'),
    left: pose(24, 29, 'torso', 'back', 2, 1, 'behind'), right: pose(16, 29, 'torso', 'back', -2, 1, 'behind'),
  },
  faceEyes: {
    front: pose(20, 17, 'head', 'face', 0, -1, 'front'), back: pose(20, 17, 'head', 'face', 0, -1, 'front', HIDDEN),
    left: pose(15, 17, 'head', 'face', -1, -1, 'front'), right: pose(25, 17, 'head', 'face', 1, -1, 'front'),
  },
  faceMouth: {
    front: pose(20, 17, 'head', 'face', 0, 3, 'front'), back: pose(20, 17, 'head', 'face', 0, 3, 'front', HIDDEN),
    left: pose(15, 17, 'head', 'face', -1, 3, 'front'), right: pose(25, 17, 'head', 'face', 1, 3, 'front'),
  },
  neckTie: {
    front: pose(20, 23, 'torso', 'neck', 0, 1, 'front'), back: pose(20, 23, 'torso', 'neck', 0, 1, 'front', HIDDEN),
    left: pose(19, 23, 'torso', 'neck', -2, 1, 'front'), right: pose(21, 23, 'torso', 'neck', 2, 1, 'front'),
  },
  neckCharm: {
    front: pose(20, 23, 'torso', 'neck', -3, 2, 'front'), back: pose(20, 23, 'torso', 'neck', -3, 2, 'front', HIDDEN),
    left: pose(19, 23, 'torso', 'neck', 1, 2, 'front'), right: pose(21, 23, 'torso', 'neck', -1, 2, 'front'),
  },
};

export const HERO_ITEM_CLAIMS: Readonly<Record<ItemId, HeroItemClaim>> = {
  // 第五档「这一身」：固定传承物在拾取后形成常驻实体，触发反馈走独立事件层。
  'admission-notice': { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'iphone-17-pro-max': { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'fathers-chart': { kind: 'rigid', slots: ['waistNear', 'waistFar'], overflow: 'compact' },
  'ktv-song': { kind: 'mutation' },
  'breath-on-glass': { kind: 'mutation' },
  'server-shutdown': { kind: 'mutation' },
  'always-crying': { kind: 'mutation' },
  'three-day-visible': { kind: 'mutation' },
  // 百科明确为纯弹体延迟结算，不把手机永久挂在人物手上。
  'read-3am': { kind: 'mutation' },
  'retracted-voice': { kind: 'rigid', slots: ['neckCharm'], overflow: 'mark' },
  'takeout-3am': { kind: 'rigid', slots: ['backSurface', 'backVolume'], overflow: 'compact' },
  'auto-renew': { kind: 'mutation' },
  'bargain-link': { kind: 'mutation' },
  'mineral-water': { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'group-dad': { kind: 'mutation' },
  'divorce-draft': { kind: 'rigid', slots: ['chestCenter', 'chestFarPin'], raincoatSlots: ['chestCenter'], overflow: 'mark' },
  'checkup-arrows': { kind: 'mutation' },
  'shared-powerbank': { kind: 'rigid', slots: ['waistNear', 'waistFar'], overflow: 'compact' },
  'third-pill': { kind: 'mutation' },
  'loan-contract': { kind: 'mutation' },
  'name-sold': { kind: 'rigid', slots: ['faceEyes'], overflow: 'mark' },
  'moms-bowl': { kind: 'mutation' },
  'ruma-msg': { kind: 'mutation' },
  'held-elevator': { kind: 'mutation' },
  'old-door-lock': { kind: 'rigid', slots: ['waistNear', 'waistFar'], overflow: 'compact' },
  'drank-for-boss': { kind: 'mutation' },
  'hair-in-takeout': { kind: 'mutation' },
  'unwashed-pillow': { kind: 'mutation' },
  'sock-cigs': { kind: 'mutation' },
  'pregnancy-test': { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'gym-card': { kind: 'rigid', slots: ['waistNear', 'waistFar'], overflow: 'mark' },
  'funeral-photo': { kind: 'mutation' },
  // 只在头顶按攻击节拍出现三个点，不把手机常驻挂在手上。
  'typing-indicator': { kind: 'effect', lane: 'transient' },
  'year-report': { kind: 'mutation' },
  'momo-avatar': { kind: 'mutation' },
  'ai-chat': { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'streak-1847': { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'goodnight-2h': { kind: 'mutation' },
  'friend-verify': { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'summer-run': { kind: 'mutation' },
  'one-more-game': { kind: 'mutation' },
  'eye-exercise': { kind: 'mutation' },
  'card-binder': { kind: 'rigid', slots: ['backVolume', 'backSurface'], overflow: 'compact' },
  'abstract-lv10': { kind: 'mutation' },
  'shop-freezer': { kind: 'effect', lane: 'behind' },

  'loose-button': { kind: 'rigid', slots: ['nearHandWrist', 'farHandWrist'], overflow: 'mark' },
  'wooden-sword': { kind: 'rigid', slots: ['backLong'], overflow: 'compact' },
  'red-workbook': { kind: 'rigid', slots: ['backSurface'], overflow: 'mark' },
  'stone-schoolbag': { kind: 'rigid', slots: ['backVolume'], overflow: 'hide-prop' },
  'bleach-powder': { kind: 'mutation' },
  'eyebrow-razor': { kind: 'mutation' },
  'od-pill': { kind: 'mutation' },
  'front-desk-letter': { kind: 'rigid', slots: ['chestCenter', 'chestFarPin'], raincoatSlots: ['chestCenter'], overflow: 'compact' },
  'cracked-glasses': { kind: 'rigid', slots: ['faceEyes'], overflow: 'mark' },
  'small-uniform': { kind: 'fitted', lane: 'inner' },
  'only-key': { kind: 'rigid', slots: ['waistNear', 'waistFar'], overflow: 'compact' },
  'first-salary': { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'nameless-tie': { kind: 'rigid', slots: ['neckTie'], overflow: 'mark' },
  'fathers-raincoat': { kind: 'fitted', lane: 'outer' },
  'unsent-phone': { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'baby-tooth': { kind: 'rigid', slots: ['neckCharm'], overflow: 'mark' },
  'revoked-badge': { kind: 'rigid', slots: ['chestNearPin', 'chestFarPin'], raincoatSlots: ['chestNearPin'], overflow: 'mark' },
  'slow-watch': { kind: 'rigid', slots: ['nearHandWrist', 'farHandWrist'], overflow: 'mark' },
  'missing-photo': { kind: 'rigid', slots: ['chestCenter', 'chestFarPin'], raincoatSlots: ['chestFarPin'], overflow: 'mark' },
  'white-bottle': { kind: 'rigid', slots: ['waistFar', 'waistNear'], overflow: 'mark' },
  'empty-frame': { kind: 'effect', lane: 'behind' },
  'broken-spine': { kind: 'mutation' },
  'spent-decade': { kind: 'effect', lane: 'transient' },
  'held-pee': { kind: 'mutation' },
  'flash-escape': { kind: 'effect', lane: 'transient' },
  'class-break': { kind: 'effect', lane: 'transient' },
  'last-page': { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'five-ha': { kind: 'mutation' },
  'red-packet': { kind: 'rigid', slots: ['waistNear', 'waistFar'], overflow: 'mark' },
  'snow-screen': { kind: 'effect', lane: 'transient' },
  marble: { kind: 'rigid', slots: ['nearHandGrip', 'farHandGrip'], overflow: 'compact' },
  'painless-night': { kind: 'effect', lane: 'ground' },
};

export function allocateHeroItemSlots(
  items: readonly ItemId[],
  facing: HeroFacing,
): ReadonlyMap<ItemId, HeroItemSlotAllocation> {
  const equipped = new Set(items);
  const hasRaincoat = equipped.has('fathers-raincoat');
  const result = new Map<ItemId, HeroItemSlotAllocation>();
  const occupied = new Set<HeroRigSlot>();
  const requests = [...new Set(items)]
    .map((id) => {
      const definition = getItemAppearance(id);
      const resolved = resolveItemAttachment(definition, equipped);
      return { id, definition, resolved, claim: HERO_ITEM_CLAIMS[id] };
    })
    .sort((first, second) => (
      second.definition.quality - first.definition.quality
      || second.resolved.priority - first.resolved.priority
      || first.id.localeCompare(second.id)
    ));

  for (const request of requests) {
    if (request.claim.kind !== 'rigid') {
      result.set(request.id, { claim: request.claim });
      continue;
    }
    const candidates = hasRaincoat && request.claim.raincoatSlots
      ? request.claim.raincoatSlots
      : request.claim.slots;
    const visibleCandidates = candidates.filter((candidate) => HERO_SLOT_POSES[candidate][facing].visible);
    // A hidden directional pose is occlusion, not a capacity failure. For
    // example, glasses and chest pins should simply disappear from the back.
    if (visibleCandidates.length === 0) {
      result.set(request.id, { claim: request.claim, overflow: 'hide-prop' });
      continue;
    }
    const slot = visibleCandidates.find((candidate) => !occupied.has(candidate));
    if (!slot) {
      result.set(request.id, { claim: request.claim, overflow: request.claim.overflow });
      continue;
    }
    occupied.add(slot);
    result.set(request.id, { claim: request.claim, slot, pose: HERO_SLOT_POSES[slot][facing] });
  }
  return result;
}
