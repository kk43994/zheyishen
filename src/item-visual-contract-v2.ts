import type { ItemId } from './types';

export type ItemVisualModule =
  | 'rigid'
  | 'garment'
  | 'mutation'
  | 'vfx'
  | 'projectile';

export type BodyConsequence =
  | 'slim'
  | 'soft'
  | 'stooped'
  | 'weighted'
  | 'compressed'
  | 'guarded'
  | 'upright'
  | 'knees-in'
  | 'swaying'
  | 'sprint-lean'
  | 'aged'
  | 'tired'
  | 'symmetric'
  | 'periodic-distortion'
  | 'attribute-amplified'
  | 'numb-weight';

type NonEmptyModules = readonly [ItemVisualModule, ...ItemVisualModule[]];

const modules = <const T extends NonEmptyModules>(...values: T): T => values;

/**
 * Machine-readable version of the R/G/M/V/P matrix in
 * docs/主角道具外观系统-v2.md. This registry describes production intent only;
 * it does not opt unapproved review assets into the runtime renderer.
 */
export const ITEM_VISUAL_MODULES_V2 = {
  'loose-button': modules('mutation', 'vfx', 'projectile'),
  'wooden-sword': modules('rigid', 'mutation', 'projectile'),
  'red-workbook': modules('rigid', 'vfx', 'projectile'),
  'stone-schoolbag': modules('rigid', 'mutation', 'projectile'),
  'bleach-powder': modules('mutation', 'vfx'),
  'eyebrow-razor': modules('rigid', 'mutation', 'projectile'),
  'od-pill': modules('rigid', 'mutation', 'vfx', 'projectile'),
  'front-desk-letter': modules('rigid', 'vfx', 'projectile'),
  'cracked-glasses': modules('rigid', 'projectile'),
  'small-uniform': modules('garment', 'mutation', 'vfx'),
  'only-key': modules('rigid', 'vfx', 'projectile'),
  'first-salary': modules('rigid', 'vfx'),
  'nameless-tie': modules('garment', 'mutation', 'vfx'),
  'fathers-raincoat': modules('garment', 'mutation', 'vfx', 'projectile'),
  'unsent-phone': modules('rigid', 'vfx', 'projectile'),
  'baby-tooth': modules('rigid', 'vfx'),
  'revoked-badge': modules('rigid', 'vfx'),
  'slow-watch': modules('rigid', 'vfx', 'projectile'),
  'missing-photo': modules('rigid', 'vfx', 'projectile'),
  'white-bottle': modules('rigid', 'mutation', 'vfx', 'projectile'),
  'empty-frame': modules('rigid', 'vfx', 'projectile'),
  'broken-spine': modules('rigid', 'mutation', 'vfx', 'projectile'),
  'spent-decade': modules('mutation', 'vfx', 'projectile'),
  'held-pee': modules('mutation', 'vfx', 'projectile'),
  'flash-escape': modules('mutation', 'vfx'),
  'class-break': modules('rigid', 'mutation', 'vfx'),
  'last-page': modules('rigid', 'vfx', 'projectile'),
  'five-ha': modules('mutation', 'vfx', 'projectile'),
  'red-packet': modules('rigid', 'vfx'),
  'snow-screen': modules('mutation', 'vfx'),
  marble: modules('rigid', 'vfx', 'projectile'),
  'always-crying': modules('mutation', 'vfx', 'projectile'),
  'three-day-visible': modules('vfx', 'projectile'),
  'read-3am': modules('rigid', 'mutation', 'vfx', 'projectile'),
  'retracted-voice': modules('mutation', 'vfx', 'projectile'),
  'takeout-3am': modules('rigid', 'mutation', 'vfx'),
  'auto-renew': modules('rigid', 'vfx'),
  'bargain-link': modules('rigid', 'vfx'),
  'mineral-water': modules('rigid', 'mutation', 'vfx'),
  'group-dad': modules('mutation', 'vfx', 'projectile'),
  'divorce-draft': modules('rigid', 'vfx'),
  'checkup-arrows': modules('mutation', 'vfx'),
  'shared-powerbank': modules('rigid', 'vfx'),
  'third-pill': modules('rigid', 'mutation', 'vfx', 'projectile'),
  'loan-contract': modules('rigid', 'mutation', 'vfx'),
  'name-sold': modules('rigid', 'mutation', 'vfx', 'projectile'),
  'moms-bowl': modules('rigid', 'mutation', 'vfx'),
  'ruma-msg': modules('rigid', 'mutation', 'vfx'),
  'held-elevator': modules('vfx', 'projectile'),
  'old-door-lock': modules('rigid', 'vfx', 'projectile'),
  'drank-for-boss': modules('mutation', 'vfx', 'projectile'),
  'hair-in-takeout': modules('rigid', 'mutation', 'vfx'),
  'unwashed-pillow': modules('rigid', 'mutation', 'vfx'),
  'sock-cigs': modules('rigid', 'mutation', 'vfx'),
  'pregnancy-test': modules('rigid', 'vfx', 'projectile'),
  'gym-card': modules('rigid', 'mutation', 'vfx'),
  'funeral-photo': modules('mutation', 'vfx'),
  'typing-indicator': modules('vfx', 'projectile'),
  'year-report': modules('rigid', 'vfx', 'projectile'),
  'momo-avatar': modules('rigid', 'mutation', 'vfx'),
  'ai-chat': modules('rigid', 'mutation', 'vfx', 'projectile'),
  'streak-1847': modules('rigid', 'vfx', 'projectile'),
  'goodnight-2h': modules('rigid', 'mutation', 'vfx'),
  'friend-verify': modules('rigid', 'vfx'),
  'summer-run': modules('mutation', 'vfx'),
  'one-more-game': modules('rigid', 'mutation', 'vfx', 'projectile'),
  'eye-exercise': modules('mutation', 'vfx'),
  'card-binder': modules('rigid', 'vfx'),
  'abstract-lv10': modules('mutation', 'vfx'),
  'shop-freezer': modules('rigid', 'vfx', 'projectile'),
  'server-shutdown': modules('rigid', 'vfx'),
  'painless-night': modules('mutation', 'vfx', 'projectile'),
  'ktv-song': modules('rigid', 'vfx', 'projectile'),
  'breath-on-glass': modules('mutation', 'vfx', 'projectile'),
} satisfies Record<ItemId, NonEmptyModules>;

/** Persistent or conditional body consequences driven by the modular rig. */
export const ITEM_BODY_CONSEQUENCES_V2 = {
  'stone-schoolbag': ['stooped', 'weighted'],
  'eyebrow-razor': ['guarded'],
  'od-pill': ['periodic-distortion'],
  'small-uniform': ['compressed'],
  'nameless-tie': ['compressed', 'guarded'],
  'fathers-raincoat': ['weighted'],
  'white-bottle': ['slim', 'tired'],
  'broken-spine': ['stooped', 'compressed'],
  'spent-decade': ['aged', 'tired'],
  'held-pee': ['knees-in', 'compressed'],
  'class-break': ['sprint-lean'],
  'takeout-3am': ['soft', 'tired'],
  'mineral-water': ['guarded', 'upright'],
  'checkup-arrows': ['attribute-amplified'],
  'third-pill': ['periodic-distortion'],
  'loan-contract': ['compressed'],
  'name-sold': ['symmetric', 'compressed'],
  'moms-bowl': ['soft'],
  'ruma-msg': ['upright'],
  'drank-for-boss': ['swaying'],
  'hair-in-takeout': ['soft'],
  'unwashed-pillow': ['soft', 'stooped'],
  'sock-cigs': ['slim', 'tired'],
  'gym-card': ['upright'],
  'funeral-photo': ['upright'],
  'momo-avatar': ['guarded'],
  'ai-chat': ['tired'],
  'goodnight-2h': ['slim', 'tired'],
  'summer-run': ['sprint-lean'],
  'painless-night': ['numb-weight', 'weighted'],
} as const satisfies Partial<Record<ItemId, readonly BodyConsequence[]>>;

