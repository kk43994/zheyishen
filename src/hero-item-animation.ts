import type { ItemAnimationHint } from './item-appearance';

export interface HeroItemAnimationState {
  readonly motion: 'idle' | 'walk' | 'attack' | 'hurt';
  readonly frame: 0 | 1 | 2 | 3;
  readonly timeMs?: number;
  readonly lowHealth?: boolean;
  readonly stageStarting?: boolean;
}

export function isItemAnimationActive(
  hint: ItemAnimationHint,
  state: HeroItemAnimationState,
): boolean {
  if (hint.trigger === 'always') return true;
  if (hint.trigger === 'low-health') return state.lowHealth === true;
  if (hint.trigger === 'stage-start') return state.stageStarting === true;
  return hint.trigger === state.motion;
}

export function getItemAnimationPhase(
  hint: ItemAnimationHint,
  state: HeroItemAnimationState,
): number {
  if (!isItemAnimationActive(hint, state) || hint.frames <= 1) return 0;
  const fallbackTime = state.frame * (1000 / 6);
  const time = Math.max(0, state.timeMs ?? fallbackTime);
  const period = Math.max(1, hint.periodMs);
  const progress = (time % period) / period;
  return Math.min(hint.frames - 1, Math.floor(progress * hint.frames));
}

export function getItemAnimationOffset(
  hint: ItemAnimationHint,
  state: HeroItemAnimationState,
): readonly [number, number] {
  if (!isItemAnimationActive(hint, state) || hint.amplitudePx === 0) return [0, 0];
  const phase = getItemAnimationPhase(hint, state);
  const amplitude = hint.amplitudePx;
  if (hint.kind === 'bob' || hint.kind === 'flutter' || hint.kind === 'drip') {
    const cycle = [0, -amplitude, 0, amplitude] as const;
    return [0, cycle[phase % cycle.length] ?? 0];
  }
  if (hint.kind === 'sway' || hint.kind === 'rattle' || hint.kind === 'jitter') {
    const cycle = [-amplitude, 0, amplitude, 0] as const;
    return [cycle[phase % cycle.length] ?? 0, 0];
  }
  if (hint.kind === 'orbit') {
    const orbit = [[0, -amplitude], [amplitude, 0], [0, amplitude], [-amplitude, 0]] as const;
    return orbit[phase % orbit.length] ?? [0, 0];
  }
  if (hint.kind === 'afterimage') {
    return [-Math.max(1, amplitude - phase), 0];
  }
  return [0, 0];
}
