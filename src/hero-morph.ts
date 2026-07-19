import type { BodyBuild, BodyStature } from './types';

export type { BodyBuild, BodyStature } from './types';

export const HERO_FRAME_WIDTH = 40 as const;
export const HERO_FRAME_HEIGHT = 56 as const;
export const HERO_ROOT = Object.freeze({ x: 20, y: 49 }) as Readonly<{ x: 20; y: 49 }>;

export const HERO_FACINGS = ['front', 'back', 'left', 'right'] as const;
export type HeroFacing = (typeof HERO_FACINGS)[number];

export const STATURES = ['short', 'average', 'tall'] as const satisfies readonly BodyStature[];
export const BODY_BUILDS = ['slim', 'average', 'sturdy', 'soft'] as const satisfies readonly BodyBuild[];

export type BodyZone = 'head' | 'torso' | 'legs' | 'feet';

export interface BodyMorph {
  readonly stature: BodyStature;
  readonly build: BodyBuild;
}

/** A point on the canonical rig. Rigid props keep their own size after this point moves. */
export interface RigAnchor {
  readonly x: number;
  readonly y: number;
  readonly zone: BodyZone;
}

export interface BodyZoneDefinition {
  readonly zone: BodyZone;
  readonly sourceStartY: number;
  readonly sourceEndY: number;
}

export interface MorphRowSample {
  readonly destinationY: number;
  readonly sourceY: number;
  readonly zone: BodyZone;
}

export interface MorphColumnSample {
  readonly destinationX: number;
  readonly sourceX: number;
}

export interface BodyMorphMap {
  readonly morph: BodyMorph;
  readonly rows: readonly MorphRowSample[];
  readonly columns: Readonly<Record<BodyZone, readonly MorphColumnSample[]>>;
  readonly targetBands: Readonly<Record<BodyZone, readonly [startY: number, endY: number]>>;
}

export interface HeroMorphValidation {
  readonly valid: boolean;
  readonly profileCount: number;
  readonly errors: readonly string[];
}

export const STANDARD_BODY_MORPH: BodyMorph = Object.freeze({
  stature: 'average',
  build: 'average',
});

export const BODY_ZONES: readonly BodyZoneDefinition[] = Object.freeze([
  Object.freeze({ zone: 'head', sourceStartY: 7, sourceEndY: 22 }),
  Object.freeze({ zone: 'torso', sourceStartY: 23, sourceEndY: 39 }),
  Object.freeze({ zone: 'legs', sourceStartY: 40, sourceEndY: 46 }),
  Object.freeze({ zone: 'feet', sourceStartY: 47, sourceEndY: 49 }),
]);

const SOURCE_BOTTOM = 49;

const STATURE_DELTAS: Readonly<Record<BodyStature, Readonly<Record<'torso' | 'legs', number>>>> = {
  short: { torso: -1, legs: -3 },
  average: { torso: 0, legs: 0 },
  tall: { torso: 1, legs: 3 },
};

const WIDTH_PERCENT: Readonly<
  Record<BodyBuild, Readonly<Record<BodyZone, number>>>
> = {
  slim: { head: 100, torso: 84, legs: 90, feet: 90 },
  average: { head: 100, torso: 100, legs: 100, feet: 100 },
  sturdy: { head: 100, torso: 116, legs: 108, feet: 108 },
  soft: { head: 100, torso: 128, legs: 112, feet: 112 },
};

function zoneLength(definition: BodyZoneDefinition): number {
  return definition.sourceEndY - definition.sourceStartY + 1;
}

function targetZoneLength(zone: BodyZoneDefinition, stature: BodyStature): number {
  const sourceLength = zoneLength(zone);
  if (zone.zone === 'torso' || zone.zone === 'legs') {
    return sourceLength + STATURE_DELTAS[stature][zone.zone];
  }
  return sourceLength;
}

/** Integer division rounded to nearest, with symmetric handling of negative values. */
function roundRatio(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) {
    throw new Error(`roundRatio requires integer numerator and positive denominator, got ${numerator}/${denominator}`);
  }
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator);
}

function assertMorph(morph: BodyMorph): void {
  if (!STATURES.includes(morph.stature)) {
    throw new Error(`Unknown hero stature: ${String(morph.stature)}`);
  }
  if (!BODY_BUILDS.includes(morph.build)) {
    throw new Error(`Unknown hero body build: ${String(morph.build)}`);
  }
}

export function getBodyZone(sourceY: number): BodyZone | undefined {
  if (!Number.isInteger(sourceY)) return undefined;
  return BODY_ZONES.find(
    ({ sourceStartY, sourceEndY }) => sourceY >= sourceStartY && sourceY <= sourceEndY,
  )?.zone;
}

export function createBodyMorphMap(morph: BodyMorph): BodyMorphMap {
  assertMorph(morph);

  const targetLengths = BODY_ZONES.map((zone) => targetZoneLength(zone, morph.stature));
  const totalTargetRows = targetLengths.reduce((sum, length) => sum + length, 0);
  let destinationY = SOURCE_BOTTOM + 1 - totalTargetRows;
  const rows: MorphRowSample[] = [];
  const targetBands = {} as Record<BodyZone, readonly [number, number]>;

  BODY_ZONES.forEach((definition, index) => {
    const sourceLength = zoneLength(definition);
    const targetLength = targetLengths[index]!;
    const targetStartY = destinationY;
    for (let targetOffset = 0; targetOffset < targetLength; targetOffset += 1) {
      const sourceOffset = Math.min(
        sourceLength - 1,
        Math.floor((targetOffset * sourceLength) / targetLength),
      );
      rows.push({
        destinationY,
        sourceY: definition.sourceStartY + sourceOffset,
        zone: definition.zone,
      });
      destinationY += 1;
    }
    targetBands[definition.zone] = [targetStartY, destinationY - 1];
  });

  const columns = {} as Record<BodyZone, readonly MorphColumnSample[]>;
  for (const zone of BODY_ZONES) {
    const widthPercent = WIDTH_PERCENT[morph.build][zone.zone];
    const samples: MorphColumnSample[] = [];
    for (let destinationX = 0; destinationX < HERO_FRAME_WIDTH; destinationX += 1) {
      const sourceX = HERO_ROOT.x + roundRatio(
        (destinationX - HERO_ROOT.x) * 100,
        widthPercent,
      );
      if (sourceX >= 0 && sourceX < HERO_FRAME_WIDTH) {
        samples.push({ destinationX, sourceX });
      }
    }
    columns[zone.zone] = samples;
  }

  return {
    morph: { ...morph },
    rows,
    columns,
    targetBands,
  };
}

export function mapAnchor(anchor: RigAnchor, morph: BodyMorph): RigAnchor {
  assertMorph(morph);
  const definition = BODY_ZONES.find(({ zone }) => zone === anchor.zone);
  if (!definition) throw new Error(`Unknown anchor body zone: ${String(anchor.zone)}`);
  if (!Number.isInteger(anchor.x) || !Number.isInteger(anchor.y)) {
    throw new Error(`Rig anchors must use integer pixels, got (${anchor.x}, ${anchor.y})`);
  }
  if (anchor.x < 0 || anchor.x >= HERO_FRAME_WIDTH) {
    throw new Error(`Rig anchor x is outside the ${HERO_FRAME_WIDTH}px frame: ${anchor.x}`);
  }
  if (anchor.y < definition.sourceStartY || anchor.y > definition.sourceEndY) {
    throw new Error(
      `Rig anchor y=${anchor.y} is outside its ${anchor.zone} zone `
      + `[${definition.sourceStartY}, ${definition.sourceEndY}]`,
    );
  }

  const map = createBodyMorphMap(morph);
  const [targetStartY, targetEndY] = map.targetBands[anchor.zone];
  const sourceLength = zoneLength(definition);
  const targetLength = targetEndY - targetStartY + 1;
  const sourceOffset = anchor.y - definition.sourceStartY;
  const destinationOffset = roundRatio(
    sourceOffset * Math.max(0, targetLength - 1),
    Math.max(1, sourceLength - 1),
  );
  const widthPercent = WIDTH_PERCENT[morph.build][anchor.zone];

  return {
    x: HERO_ROOT.x + roundRatio((anchor.x - HERO_ROOT.x) * widthPercent, 100),
    y: targetStartY + Math.min(targetLength - 1, destinationOffset),
    zone: anchor.zone,
  };
}

/**
 * Remap a canonical body or fitted-garment pixel grid. Each array entry is one
 * logical pixel; rigid props must instead keep their grid and use mapAnchor.
 */
export function remapPixelGrid<T>(
  source: readonly T[],
  morph: BodyMorph,
  emptyPixel: T,
): T[] {
  const expectedLength = HERO_FRAME_WIDTH * HERO_FRAME_HEIGHT;
  if (source.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} hero pixels, got ${source.length}`);
  }
  const map = createBodyMorphMap(morph);
  const result = [...source];
  const targetTop = map.targetBands.head[0];
  const clearTop = Math.min(BODY_ZONES[0]!.sourceStartY, targetTop);

  for (let y = clearTop; y <= SOURCE_BOTTOM; y += 1) {
    const rowOffset = y * HERO_FRAME_WIDTH;
    result.fill(emptyPixel, rowOffset, rowOffset + HERO_FRAME_WIDTH);
  }

  for (const row of map.rows) {
    const sourceOffset = row.sourceY * HERO_FRAME_WIDTH;
    const destinationOffset = row.destinationY * HERO_FRAME_WIDTH;
    for (const column of map.columns[row.zone]) {
      result[destinationOffset + column.destinationX] = source[sourceOffset + column.sourceX]!;
    }
  }
  return result;
}

function isMonotonicIntegerSequence(values: readonly number[]): boolean {
  return values.every((value, index) => (
    Number.isInteger(value) && (index === 0 || value >= values[index - 1]!)
  ));
}

export function validateHeroMorphRuntime(): HeroMorphValidation {
  const errors: string[] = [];
  let profileCount = 0;
  const rootAnchor: RigAnchor = { x: HERO_ROOT.x, y: HERO_ROOT.y, zone: 'feet' };

  for (const stature of STATURES) {
    for (const build of BODY_BUILDS) {
      profileCount += 1;
      const morph: BodyMorph = { stature, build };
      const id = `${stature}/${build}`;
      const map = createBodyMorphMap(morph);
      const rowDestinations = map.rows.map(({ destinationY }) => destinationY);
      const rowSources = map.rows.map(({ sourceY }) => sourceY);

      if (!isMonotonicIntegerSequence(rowDestinations)) errors.push(`${id}: destination rows are not monotonic integers`);
      if (!isMonotonicIntegerSequence(rowSources)) errors.push(`${id}: source rows are not monotonic integers`);
      if (rowDestinations.some((y) => y < 0 || y >= HERO_FRAME_HEIGHT)) errors.push(`${id}: destination row left frame`);
      if (rowSources.some((y) => y < 0 || y >= HERO_FRAME_HEIGHT)) errors.push(`${id}: source row left frame`);

      for (const zone of BODY_ZONES) {
        const columnSamples = map.columns[zone.zone];
        if (!isMonotonicIntegerSequence(columnSamples.map(({ destinationX }) => destinationX))) {
          errors.push(`${id}/${zone.zone}: destination columns are not monotonic integers`);
        }
        if (!isMonotonicIntegerSequence(columnSamples.map(({ sourceX }) => sourceX))) {
          errors.push(`${id}/${zone.zone}: source columns are not monotonic integers`);
        }
        if (columnSamples.some(({ destinationX, sourceX }) => (
          destinationX < 0 || destinationX >= HERO_FRAME_WIDTH
          || sourceX < 0 || sourceX >= HERO_FRAME_WIDTH
        ))) {
          errors.push(`${id}/${zone.zone}: column mapping left frame`);
        }
      }

      const mappedRoot = mapAnchor(rootAnchor, morph);
      if (mappedRoot.x !== HERO_ROOT.x || mappedRoot.y !== HERO_ROOT.y) {
        errors.push(`${id}: root moved to (${mappedRoot.x}, ${mappedRoot.y})`);
      }

      const torsoDefinition = BODY_ZONES.find(({ zone }) => zone === 'torso')!;
      const legsDefinition = BODY_ZONES.find(({ zone }) => zone === 'legs')!;
      const expectedTorsoLength = zoneLength(torsoDefinition) + STATURE_DELTAS[stature].torso;
      const expectedLegLength = zoneLength(legsDefinition) + STATURE_DELTAS[stature].legs;
      const [torsoStart, torsoEnd] = map.targetBands.torso;
      const [legsStart, legsEnd] = map.targetBands.legs;
      if (torsoEnd - torsoStart + 1 !== expectedTorsoLength) errors.push(`${id}: torso row delta is incorrect`);
      if (legsEnd - legsStart + 1 !== expectedLegLength) errors.push(`${id}: leg row delta is incorrect`);

      const fixture = Array.from(
        { length: HERO_FRAME_WIDTH * HERO_FRAME_HEIGHT },
        (_, index) => index + 1,
      );
      const firstPass = remapPixelGrid(fixture, morph, 0);
      const secondPass = remapPixelGrid(fixture, morph, 0);
      if (firstPass.some((value, index) => value !== secondPass[index])) {
        errors.push(`${id}: layer remap is not deterministic`);
      }
    }
  }

  if (profileCount !== STATURES.length * BODY_BUILDS.length || profileCount !== 12) {
    errors.push(`expected 12 morph profiles, validated ${profileCount}`);
  }

  const standardMap = createBodyMorphMap(STANDARD_BODY_MORPH);
  if (standardMap.rows.some(({ destinationY, sourceY }) => destinationY !== sourceY)) {
    errors.push('standard: row mapping is not identity');
  }
  for (const zone of BODY_ZONES) {
    if (standardMap.columns[zone.zone].some(({ destinationX, sourceX }) => destinationX !== sourceX)) {
      errors.push(`standard/${zone.zone}: column mapping is not identity`);
    }
  }
  const identityFixture = Array.from(
    { length: HERO_FRAME_WIDTH * HERO_FRAME_HEIGHT },
    (_, index) => index,
  );
  const identityResult = remapPixelGrid(identityFixture, STANDARD_BODY_MORPH, -1);
  if (identityResult.some((value, index) => value !== identityFixture[index])) {
    errors.push('standard: complete pixel grid is not identity');
  }

  return { valid: errors.length === 0, profileCount, errors };
}

export function assertHeroMorphRuntimeValid(): true {
  const validation = validateHeroMorphRuntime();
  if (!validation.valid) {
    throw new Error(`Hero morph validation failed:\n${validation.errors.join('\n')}`);
  }
  return true;
}
