export interface CircularBody {
  x: number;
  y: number;
  radius: number;
  dead: boolean;
}

/**
 * Resolves soft circular separation while visiting only bodies in the same
 * spatial cell or one of its eight neighbors. The cell size is derived from
 * the largest live body, so every potentially overlapping pair is covered.
 *
 * Returns the number of candidate pairs inspected for deterministic audits.
 */
export function separateCircularBodies(
  bodies: CircularBody[],
  separationScale = 0.72,
): number {
  const liveIndices: number[] = [];
  let maxRadius = 0;
  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index]!;
    if (body.dead) continue;
    liveIndices.push(index);
    maxRadius = Math.max(maxRadius, body.radius);
  }
  if (liveIndices.length < 2) return 0;

  const cellSize = Math.max(32, maxRadius * 2 * separationScale);
  const buckets = new Map<string, number[]>();
  for (const index of liveIndices) {
    const body = bodies[index]!;
    const key = `${Math.floor(body.x / cellSize)},${Math.floor(body.y / cellSize)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  }

  let candidatePairs = 0;
  for (const index of liveIndices) {
    const a = bodies[index]!;
    const cellX = Math.floor(a.x / cellSize);
    const cellY = Math.floor(a.y / cellSize);
    const candidates: number[] = [];
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const bucket = buckets.get(`${cellX + offsetX},${cellY + offsetY}`);
        if (!bucket) continue;
        for (const otherIndex of bucket) {
          if (otherIndex > index) candidates.push(otherIndex);
        }
      }
    }
    // Preserve the original all-pairs index order for fixed-seed determinism.
    candidates.sort((left, right) => left - right);
    for (const otherIndex of candidates) {
      candidatePairs += 1;
      const b = bodies[otherIndex]!;
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = (a.radius + b.radius) * separationScale;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.01 && distance < minDist) {
        const push = ((minDist - distance) / distance) * 0.5;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  }
  return candidatePairs;
}
