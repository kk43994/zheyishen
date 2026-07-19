import rigOffsetsJson from './assets/hero-style1-profiles/rig-motion-offsets.json';
import type { BodyAnchor } from './item-appearance';
import type { HeroFacing } from './hero-morph';
import { HERO_STYLE1_MOTION_FRAMES, type HeroMotion } from './hero-style1-atlas';

export type HeroMotionOffset = readonly [x: number, y: number];

type RigFrame = Record<BodyAnchor, [number, number]>;
type RigMotionData = Record<HeroMotion, RigFrame[]>;
type RigData = Record<HeroFacing, RigMotionData>;

const rigOffsets = rigOffsetsJson as RigData;

function validateRigData(): void {
  const facings: HeroFacing[] = ['front', 'back', 'left', 'right'];
  const motions: HeroMotion[] = ['idle', 'walk', 'attack', 'hurt'];
  const anchors: BodyAnchor[] = [
    'head', 'face', 'neck', 'chest', 'back',
    'leftHand', 'rightHand', 'waist', 'feet', 'shadow',
  ];
  for (const facing of facings) {
    for (const motion of motions) {
      const frames = rigOffsets[facing]?.[motion];
      if (!frames || frames.length !== HERO_STYLE1_MOTION_FRAMES[motion]) {
        throw new Error(`主角动作锚点帧数错误: ${facing}/${motion}`);
      }
      for (const frame of frames) {
        for (const anchor of anchors) {
          const offset = frame[anchor];
          if (!offset || offset.length !== 2 || !offset.every(Number.isInteger)) {
            throw new Error(`主角动作锚点无效: ${facing}/${motion}/${anchor}`);
          }
        }
      }
    }
  }
}

validateRigData();

export function getHeroMotionOffset(
  facing: HeroFacing,
  motion: HeroMotion,
  frame: number,
  anchor: BodyAnchor,
): HeroMotionOffset {
  const count = HERO_STYLE1_MOTION_FRAMES[motion];
  const normalized = ((Math.trunc(frame) % count) + count) % count;
  const offset = rigOffsets[facing][motion][normalized]![anchor];
  return [offset[0], offset[1]];
}
