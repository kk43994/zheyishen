import type { ItemId, ProjectileForm, ProjectileTrail } from './types';
import type { HitMaterial } from './vfx-sprites';

export type ProjectileSignatureScope = 'base' | 'fallback' | 'derived' | 'modifier';
export type ProjectileRecipe = 'current' | 'inherit-current';
export type ProjectileCarrier = 'current-breath' | 'reshaped-breath' | 'literal-object' | 'semantic-glyph';
export type ProjectilePresentation = 'always' | 'derived-only' | 'trigger-only' | 'motion-only';

export interface ProjectileItemSignature {
  scope: ProjectileSignatureScope;
  recipe: ProjectileRecipe;
  carrier: ProjectileCarrier;
  presentation: ProjectilePresentation;
  hitMaterial: HitMaterial | 'inherit';
  form?: ProjectileForm;
  formPriority?: number;
  trail?: ProjectileTrail;
  trailPriority?: number;
  silhouette: string;
  motion: string;
  feedback: string;
  mechanic: string;
}

export interface FiveShotStep {
  delay: number;
  angleOffset: number;
  damageShare: number;
  sizeScale: number;
}

/**
 * Five-ha is a count rule. Name-sold keeps the five beats but standardizes the
 * three properties that would otherwise visibly fluctuate.
 */
export function planFiveShotBurst(standardized: boolean): readonly FiveShotStep[] {
  const shares = standardized ? [0.22, 0.22, 0.22, 0.22, 0.22] : [0.3, 0.26, 0.22, 0.18, 0.14];
  const sizes = standardized ? [0.74, 0.74, 0.74, 0.74, 0.74] : [1, 0.86, 0.72, 0.6, 0.5];
  return shares.map((damageShare, index) => ({
    delay: index * 0.07,
    angleOffset: standardized ? 0 : (index - 2) * 0.018,
    damageShare,
    sizeScale: sizes[index] ?? 0.5,
  }));
}

/**
 * Runtime counterpart of the 35 production-contract entries that include the
 * `projectile` layer. A base signature may replace the projectile sprite;
 * fallback signatures provide a sprite only when no explicit replacement wins;
 * derived signatures apply only to the extra projectile they create; modifier
 * signatures keep the current sprite and change motion/timing/impact instead.
 */
export const PROJECTILE_ITEM_SIGNATURES = {
  'loose-button': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'reshaped-breath', presentation: 'derived-only', hitMaterial: 'inherit', form: 'button',
    silhouette: 'Current breath recipe with one small two-hole button core, never a loose clothing icon.', motion: 'One extra shot on every third volley.', feedback: 'Two-hole core flashes with the remembered damage value.', mechanic: 'third-volley inherited extra shot',
  },
  'wooden-sword': {
    scope: 'base', recipe: 'current', carrier: 'reshaped-breath', presentation: 'always', hitMaterial: 'wood', form: 'slash', formPriority: 80, trail: 'splinter',
    silhouette: 'A wide, blunt and short breath slash with a wooden underside; no sword, handle or flying weapon.', motion: 'Large coverage with sharply shortened range.', feedback: 'Flat wood impact and two or three chips.', mechanic: 'wide blunt short-range slash',
  },
  'red-workbook': {
    scope: 'modifier', recipe: 'current', carrier: 'current-breath', presentation: 'trigger-only', hitMaterial: 'inherit',
    silhouette: 'Keep the current breath unchanged in flight.', motion: 'At the endpoint, turn around and return with increased force.', feedback: 'A red cross appears only at the endpoint before the return.', mechanic: 'red-cross return and empower',
  },
  'stone-schoolbag': {
    scope: 'base', recipe: 'current', carrier: 'reshaped-breath', presentation: 'always', hitMaterial: 'stone', form: 'stone', formPriority: 70, trail: 'heavy',
    silhouette: 'A compressed moon-white breath with a dark weighted underside, not a flying bag or boulder.', motion: 'Slow, heavy and strongly piercing.', feedback: 'Each pierce drops a small stone chip.', mechanic: 'slow heavy pierce',
  },
  'eyebrow-razor': {
    scope: 'base', recipe: 'current', carrier: 'reshaped-breath', presentation: 'always', hitMaterial: 'metal', form: 'razor', formPriority: 60, trail: 'streak',
    silhouette: 'An extremely thin silver-white breath edge, with no razor handle.', motion: 'Long narrow cut with increased critical force.', feedback: 'Critical hits draw one clean bright line.', mechanic: 'thin critical cut',
  },
  'od-pill': {
    scope: 'modifier', recipe: 'current', carrier: 'current-breath', presentation: 'always', hitMaterial: 'inherit', trail: 'glitch', trailPriority: 42,
    silhouette: 'The current breath is pixel-displaced and rescaled; never replace it with a pill.', motion: 'One boosted and one weakened ballistic stat are rolled each stage.', feedback: 'Short magenta-cyan displacement at fire and impact.', mechanic: 'stage-random ballistic distortion',
  },
  'front-desk-letter': {
    scope: 'base', recipe: 'current', carrier: 'reshaped-breath', presentation: 'always', hitMaterial: 'paper', form: 'paper', formPriority: 50, trail: 'curve',
    silhouette: 'A moon-white breath folded into a small paper wedge, not a heart or readable letter.', motion: 'Strong target-seeking bends after a wider launch spread.', feedback: 'Dry paper fold and crease at impact.', mechanic: 'strong homing with wider spread',
  },
  'cracked-glasses': {
    scope: 'base', recipe: 'current', carrier: 'reshaped-breath', presentation: 'always', hitMaterial: 'glass', form: 'lens', formPriority: 40, trail: 'streak',
    silhouette: 'A thin elongated refracted breath with one cyan split edge, not flying glasses or a lens icon.', motion: 'Longer range and higher critical chance at distance.', feedback: 'A small glass split-flash on distant critical hits.', mechanic: 'long thin distant critical',
  },
  'only-key': {
    scope: 'base', recipe: 'current', carrier: 'literal-object', presentation: 'always', hitMaterial: 'key', form: 'key', formPriority: 88, trail: 'key-dust',
    silhouette: 'A literal old brass rental-room key with a clear bow, shaft and single tooth.', motion: 'Flies as the current shot and bursts at its endpoint.', feedback: 'Keyhole or door-slit flash followed by a circular shock.', mechanic: 'terminal keyhole explosion',
  },
  'fathers-raincoat': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'reshaped-breath', presentation: 'derived-only', hitMaterial: 'water', form: 'rain',
    silhouette: 'Small rain drops carrying the current recipe, never a flying raincoat.', motion: 'The first hit of each stage is blocked and releases one inherited radial rain ring.', feedback: 'Wet ripple and muted water hit.', mechanic: 'first-hit guard-triggered inherited rain ring',
  },
  'slow-watch': {
    scope: 'modifier', recipe: 'current', carrier: 'current-breath', presentation: 'motion-only', hitMaterial: 'inherit', trail: 'clock', trailPriority: 44,
    silhouette: 'Keep the current breath; only a tiny freeze tick may surround it.', motion: 'Projectiles periodically suspend and then surge together.', feedback: 'One restrained clock tick at stop and release.', mechanic: 'periodic projectile freeze then surge',
  },
  'missing-photo': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'current-breath', presentation: 'derived-only', hitMaterial: 'inherit',
    silhouette: 'Two side shots reuse the complete current recipe; no photo frame flies.', motion: 'Every fourth volley adds a stronger inherited pair.', feedback: 'A brief missing-space afterimage links the pair.', mechanic: 'fourth-volley pair of inherited shots',
  },
  'empty-frame': {
    scope: 'modifier', recipe: 'current', carrier: 'current-breath', presentation: 'trigger-only', hitMaterial: 'inherit', trail: 'fade', trailPriority: 40,
    silhouette: 'Keep the current breath and shorten its visible tail; no frame-shaped bullet.', motion: 'Shorter lifetime with a wider existing endpoint blast.', feedback: 'An empty rectangular outline appears only when an endpoint blast exists.', mechanic: 'short life and larger terminal blast',
  },
  'spent-decade': {
    scope: 'modifier', recipe: 'current', carrier: 'current-breath', presentation: 'motion-only', hitMaterial: 'inherit', trail: 'afterimage', trailPriority: 38,
    silhouette: 'Five volleys keep the current recipe and differ only by fading afterimages.', motion: 'Rapidly release five prepaid volleys, then stop firing for two seconds.', feedback: 'Afterimage stack collapses into a quiet empty beat.', mechanic: 'five prepaid volleys then breathless gap',
  },
  'held-pee': {
    scope: 'modifier', recipe: 'current', carrier: 'reshaped-breath', presentation: 'always', hitMaterial: 'inherit', trail: 'heavy', trailPriority: 34,
    silhouette: 'The current breath becomes denser and lower as pressure builds, never a liquid-drop joke icon.', motion: 'Standing still adds weight until the next attack releases it.', feedback: 'A compact pressure ring empties on fire.', mechanic: 'standing still charges projectile weight',
  },
  'five-ha': {
    scope: 'fallback', recipe: 'current', carrier: 'semantic-glyph', presentation: 'always', hitMaterial: 'mist', form: 'laugh', formPriority: 10, trail: 'afterimage',
    silhouette: 'Without another projectile replacement, each shot is one real Chinese 哈 glyph pressed into a small breath puff.', motion: 'One attack becomes five close rapid shots using the winning current recipe, diminishing in size and force.', feedback: 'Bare breath reads 哈哈哈哈哈; replacement forms keep their own hit material and feedback.', mechanic: 'five diminishing rapid copies of the winning projectile recipe',
  },
  'marble': {
    scope: 'base', recipe: 'current', carrier: 'literal-object', presentation: 'always', hitMaterial: 'glass', form: 'marble', formPriority: 90, trail: 'ricochet',
    silhouette: 'A literal childhood glass marble with one bold curved highlight.', motion: 'Hard ricochet redirects toward another target after impact.', feedback: 'Glass ring and a sharp direction-change spark.', mechanic: 'ricochet to another target',
  },
  'always-crying': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'reshaped-breath', presentation: 'derived-only', hitMaterial: 'water', form: 'tear',
    silhouette: 'Three narrow vertical tear-breaths carrying the current recipe.', motion: 'Taking damage releases three penetrating shots in separate directions.', feedback: 'Thin wet streak and small water ring.', mechanic: 'damage-triggered inherited tears',
  },
  'three-day-visible': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'current-breath', presentation: 'derived-only', hitMaterial: 'inherit',
    silhouette: 'All three orbiting shots retain the complete current recipe; no social-app icon.', motion: 'Orbit the hero three times and then release outward.', feedback: 'The third orbit briefly closes a fading circle.', mechanic: 'three inherited shots orbit three times',
  },
  'read-3am': {
    scope: 'modifier', recipe: 'current', carrier: 'current-breath', presentation: 'trigger-only', hitMaterial: 'inherit',
    silhouette: 'Keep the current breath in flight.', motion: 'A hit plants a five-second delayed damage marker.', feedback: 'A tiny read-receipt mark appears on the enemy only, then bursts at maturity.', mechanic: 'five-second delayed read receipt damage',
  },
  'retracted-voice': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'reshaped-breath', presentation: 'derived-only', hitMaterial: 'signal', form: 'sound',
    silhouette: 'A compact sound ring carrying current projectile flags; no microphone or voice-message icon.', motion: 'Each fate layer releases one radial sound-wave shot.', feedback: 'Signal ripple breaks and retracts inward.', mechanic: 'fate-charge sound-wave release',
  },
  'bargain-link': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'reshaped-breath', presentation: 'derived-only', hitMaterial: 'signal', form: 'link',
    silhouette: 'A small incomplete red-gold chain link around the inherited breath core.', motion: 'Hits branch into diminishing nonlethal helper generations.', feedback: 'Each branch leaves an incomplete link flash and cannot finish the target.', mechanic: 'diminishing helper-shot branches',
  },
  'group-dad': {
    scope: 'modifier', recipe: 'inherit-current', carrier: 'current-breath', presentation: 'motion-only', hitMaterial: 'inherit',
    silhouette: 'Keep every derived shot recognizable as its source recipe; only thicken its outline.', motion: 'Derived and inherited projectiles gain damage while the base shot weakens.', feedback: 'A heavier secondary-shot impact confirms the handoff.', mechanic: 'derived projectiles gain damage',
  },
  'name-sold': {
    scope: 'base', recipe: 'current', carrier: 'reshaped-breath', presentation: 'always', hitMaterial: 'metal', form: 'serial', formPriority: 94, trail: 'serial', trailPriority: 110,
    silhouette: 'A uniform grey capsule made from breath, with barcode-like ticks but no readable numbers.', motion: 'Zero spread and stable damage with critical spikes removed; conflicting multi-shot variation is standardized.', feedback: 'Dry identical rectangular ticks at every hit.', mechanic: 'uniform non-critical shot',
  },
  'held-elevator': {
    scope: 'modifier', recipe: 'current', carrier: 'current-breath', presentation: 'motion-only', hitMaterial: 'inherit', trail: 'pause', trailPriority: 46,
    silhouette: 'Keep the current breath; a two-bar hold mark appears only during suspension.', motion: 'At the endpoint, pause briefly and then retarget the nearest enemy.', feedback: 'Soft elevator hold chime and resumed trail.', mechanic: 'terminal pause and retarget',
  },
  'old-door-lock': {
    scope: 'modifier', recipe: 'current', carrier: 'current-breath', presentation: 'motion-only', hitMaterial: 'inherit', trail: 'home', trailPriority: 59,
    silhouette: 'Keep the current breath with a warm homeward line; never turn it into another key.', motion: 'Return to the hero at the endpoint, then relaunch at higher force.', feedback: 'A small lock-tongue closes at the endpoint and opens at relaunch.', mechanic: 'return home and relaunch harder',
  },
  'pregnancy-test': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'current-breath', presentation: 'derived-only', hitMaterial: 'inherit',
    silhouette: 'The follower shot copies the entire current recipe; no pregnancy-test projectile.', motion: 'Every third volley adds one smaller follower shot.', feedback: 'A restrained double-line pulse appears at the hero, not on the bullet.', mechanic: 'third-volley follower copy',
  },
  'typing-indicator': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'current-breath', presentation: 'derived-only', hitMaterial: 'inherit',
    silhouette: 'Twelve readable copies of the current breath recipe; no chat bubble, phone or typing glyph replaces the projectile.', motion: 'One dot appears above the hero every 0.5 seconds; the third dot releases a full 360-degree spread and replaces ordinary autofire.', feedback: 'The third head dot holds briefly while a broad ring marks the radial release.', mechanic: 'three-beat radial spread replacing ordinary autofire',
  },
  'year-report': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'current-breath', presentation: 'derived-only', hitMaterial: 'inherit',
    silhouette: 'Replay the exact previous projectile recipe with a muted old-tape tint.', motion: 'Every fourth volley replays the previous ballistic path at lower force.', feedback: 'A single tape-loop afterimage marks the replay.', mechanic: 'fourth-volley replay',
  },
  'ai-chat': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'current-breath', presentation: 'derived-only', hitMaterial: 'inherit',
    silhouette: 'A delayed translucent copy of the complete current recipe; no chat bubble or AI icon.', motion: 'Repeat each volley after 0.4 seconds at lower power.', feedback: 'Cool-toned echo trail and quieter inherited impact.', mechanic: 'delayed weaker echo volley',
  },
  'friend-verify': {
    scope: 'modifier', recipe: 'current', carrier: 'current-breath', presentation: 'trigger-only', hitMaterial: 'inherit',
    silhouette: 'Keep the current breath before first contact.', motion: 'The first hit deals no damage, leaves the target and returns; the second hit resolves.', feedback: 'A readable red 验证失败 stamp appears only after the first hit.', mechanic: 'failed first hit returns before damage',
  },
  'card-binder': {
    scope: 'modifier', recipe: 'inherit-current', carrier: 'current-breath', presentation: 'trigger-only', hitMaterial: 'inherit',
    silhouette: 'Copied triggers keep their source projectile recipe; no card-shaped bullet.', motion: 'Record up to three eligible low-tier triggers and replay their core behavior.', feedback: 'Card insertion or eviction appears beside the hero only.', mechanic: 'copies recorded low-tier triggers',
  },
  'shop-freezer': {
    scope: 'base', recipe: 'current', carrier: 'reshaped-breath', presentation: 'always', hitMaterial: 'ice', form: 'ice', formPriority: 30, trail: 'frost', trailPriority: 100,
    silhouette: 'The current breath remains visible inside a square low-pixel frost rim; no ice crystal or freezer icon.', motion: 'Normal flight with a chance to freeze the enemy on impact.', feedback: 'Square frost closes over the target and visibly suspends it.', mechanic: 'frosted projectile can freeze',
  },
  'ktv-song': {
    scope: 'derived', recipe: 'inherit-current', carrier: 'reshaped-breath', presentation: 'derived-only', hitMaterial: 'signal', form: 'sound',
    silhouette: 'A large sound ring that inherits the current projectile recipe; no music note or microphone.', motion: 'Weaken normal shots, then release a full inherited radial wave when charged.', feedback: 'Broad signal ripple with the inherited material hit nested inside.', mechanic: 'periodic inherited radial sound wave',
  },
  'breath-on-glass': {
    scope: 'base', recipe: 'current', carrier: 'reshaped-breath', presentation: 'always', hitMaterial: 'water', form: 'cone', formPriority: 85, trail: 'mist', trailPriority: 105,
    silhouette: 'A wide short fog cone made of moon-white condensation; no readable writing.', motion: 'Greatly widen and deepen piercing while sharply shortening range.', feedback: 'Soft condensation bloom across the hit surface.', mechanic: 'wide short fog cone',
  },
} as const satisfies Partial<Record<ItemId, ProjectileItemSignature>>;

/** Every production-contract projectile entry must have a reproducible dev audit. */
export const PROJECTILE_AUDIT_CASES = {
  'loose-button': 'button-carrier',
  'wooden-sword': 'form',
  'red-workbook': 'return',
  'stone-schoolbag': 'burden',
  'eyebrow-razor': 'scars',
  'od-pill': 'od-distortion',
  'front-desk-letter': 'letter-homing',
  'cracked-glasses': 'glasses',
  'only-key': 'key-endpoint',
  'fathers-raincoat': 'raincoat-contract',
  'slow-watch': 'watch',
  'missing-photo': 'photo',
  'empty-frame': 'frame',
  'spent-decade': 'decade',
  'held-pee': 'pressure',
  'five-ha': 'laugh',
  'marble': 'marble-inheritance',
  'always-crying': 'tears',
  'three-day-visible': 'orbit',
  'read-3am': 'read',
  'retracted-voice': 'voice',
  'bargain-link': 'bargain',
  'group-dad': 'dad',
  'name-sold': 'uniform-five',
  'held-elevator': 'elevator',
  'old-door-lock': 'home',
  'pregnancy-test': 'dad',
  'typing-indicator': 'typing',
  'year-report': 'replay',
  'ai-chat': 'echo',
  'friend-verify': 'verify',
  'card-binder': 'binder',
  'shop-freezer': 'freezer',
  'ktv-song': 'ktv',
  'breath-on-glass': 'form',
} as const satisfies Partial<Record<ItemId, string>>;

/**
 * Representative collisions between base forms. Only the winning sprite and
 * trail are exclusive; every losing item's trajectory and impact mechanics
 * remain active on the resulting projectile.
 */
export const PROJECTILE_COMPOSITION_CASES = {
  'five-shot-rule-uses-marble-carrier': { items: ['five-ha', 'marble'], form: 'marble', trail: 'ricochet' },
  'bare-five-ha-uses-readable-glyph': { items: ['five-ha'], form: 'laugh', trail: 'afterimage' },
  'condensation-reshapes-breath': { items: ['wooden-sword', 'shop-freezer', 'breath-on-glass'], form: 'cone', trail: 'mist' },
  'literal-marble-carries-condensation': { items: ['marble', 'breath-on-glass'], form: 'marble', trail: 'mist' },
  'uniform-contract-overrides-frost': { items: ['name-sold', 'shop-freezer'], form: 'serial', trail: 'serial' },
  'uniform-contract-standardizes-five-shot-rule': { items: ['name-sold', 'five-ha'], form: 'serial', trail: 'serial' },
  'uniform-contract-overrides-condensation': { items: ['name-sold', 'breath-on-glass'], form: 'serial', trail: 'serial' },
  'uniform-contract-overrides-razor-streak': { items: ['name-sold', 'eyebrow-razor'], form: 'serial', trail: 'serial' },
  'literal-key-overrides-wooden-reshape': { items: ['wooden-sword', 'only-key'], form: 'key', trail: 'key-dust' },
  'frost-rim-coats-marble': { items: ['marble', 'shop-freezer'], form: 'marble', trail: 'frost' },
  'folded-letter-overrides-lens': { items: ['cracked-glasses', 'front-desk-letter'], form: 'paper', trail: 'curve' },
} as const;

const PROJECTILE_SIGNATURE_BY_ID: Partial<Record<ItemId, ProjectileItemSignature>> = PROJECTILE_ITEM_SIGNATURES;

export function selectBaseProjectileForm(items: readonly ItemId[], fallback: ProjectileForm): ProjectileForm {
  let selected = fallback;
  let priority = -1;
  for (const id of items) {
    const signature = PROJECTILE_SIGNATURE_BY_ID[id];
    if (!signature || (signature.scope !== 'base' && signature.scope !== 'fallback') || !signature.form) continue;
    const nextPriority = signature.formPriority ?? 0;
    if (nextPriority > priority) {
      priority = nextPriority;
      selected = signature.form;
    }
  }
  return selected;
}

export function selectProjectileTrail(items: readonly ItemId[], fallback: ProjectileTrail): ProjectileTrail {
  return resolveProjectileTrail(items, fallback).trail;
}

export function resolveProjectileTrail(
  items: readonly ItemId[],
  fallback: ProjectileTrail,
): { trail: ProjectileTrail; priority: number } {
  let selected = fallback;
  let priority = -1;
  for (const id of items) {
    const signature = PROJECTILE_SIGNATURE_BY_ID[id];
    if (!signature?.trail) continue;
    const nextPriority = signature.trailPriority ?? signature.formPriority ?? 0;
    if (nextPriority > priority) {
      priority = nextPriority;
      selected = signature.trail;
    }
  }
  return { trail: selected, priority };
}
