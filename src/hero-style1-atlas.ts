import type { BodyBuild, BodyStature, HeroFacing } from './hero-morph';
import { loadArtImage } from './art-runtime';

export type HeroMotion = 'idle' | 'walk' | 'attack' | 'hurt';

export const HERO_STYLE1_FRAME_WIDTH = 40;
export const HERO_STYLE1_FRAME_HEIGHT = 56;

export const HERO_STYLE1_MOTION_FRAMES = {
  idle: 2,
  walk: 4,
  attack: 4,
  hurt: 2,
} as const satisfies Record<HeroMotion, number>;

export const HERO_STYLE1_DIRECTION_ROWS = {
  front: 0,
  back: 1,
  left: 2,
  right: 3,
} as const satisfies Record<HeroFacing, number>;

const ATLAS_URLS = {
  idle: new URL('./assets/hero-style1-profiles/hero-idle.png', import.meta.url).href,
  walk: new URL('./assets/hero-style1-profiles/hero-walk.png', import.meta.url).href,
  attack: new URL('./assets/hero-style1-profiles/hero-attack.png', import.meta.url).href,
  hurt: new URL('./assets/hero-style1-profiles/hero-hurt.png', import.meta.url).href,
} as const satisfies Record<HeroMotion, string>;

const RAINCOAT_URLS = {
  idle: new URL('./assets/hero-style1-profiles/raincoat-idle.png', import.meta.url).href,
  walk: new URL('./assets/hero-style1-profiles/raincoat-walk.png', import.meta.url).href,
  attack: new URL('./assets/hero-style1-profiles/raincoat-attack.png', import.meta.url).href,
  hurt: new URL('./assets/hero-style1-profiles/raincoat-hurt.png', import.meta.url).href,
} as const satisfies Record<HeroMotion, string>;

const UNIFORM_URLS = {
  idle: new URL('./assets/hero-style1-profiles/uniform-idle.png', import.meta.url).href,
  walk: new URL('./assets/hero-style1-profiles/uniform-walk.png', import.meta.url).href,
  attack: new URL('./assets/hero-style1-profiles/uniform-attack.png', import.meta.url).href,
  hurt: new URL('./assets/hero-style1-profiles/uniform-hurt.png', import.meta.url).href,
} as const satisfies Record<HeroMotion, string>;

const HAIR_MASK_URLS = {
  idle: new URL('./assets/hero-style1-profiles/hair-mask-idle.png', import.meta.url).href,
  walk: new URL('./assets/hero-style1-profiles/hair-mask-walk.png', import.meta.url).href,
  attack: new URL('./assets/hero-style1-profiles/hair-mask-attack.png', import.meta.url).href,
  hurt: new URL('./assets/hero-style1-profiles/hair-mask-hurt.png', import.meta.url).href,
} as const satisfies Record<HeroMotion, string>;

const PART_MASK_URLS = {
  idle: new URL('./assets/hero-style1-profiles/part-mask-idle.png', import.meta.url).href,
  walk: new URL('./assets/hero-style1-profiles/part-mask-walk.png', import.meta.url).href,
  attack: new URL('./assets/hero-style1-profiles/part-mask-attack.png', import.meta.url).href,
  hurt: new URL('./assets/hero-style1-profiles/part-mask-hurt.png', import.meta.url).href,
} as const satisfies Record<HeroMotion, string>;

const MOTIONS = Object.keys(ATLAS_URLS) as HeroMotion[];
const PROFILE_STATURE_INDEX = {
  short: 0,
  average: 1,
  tall: 2,
} as const satisfies Record<BodyStature, number>;
const PROFILE_BUILD_INDEX = {
  slim: 0,
  average: 1,
  sturdy: 2,
  soft: 3,
} as const satisfies Record<BodyBuild, number>;
const PROFILE_BUILD_COUNT = Object.keys(PROFILE_BUILD_INDEX).length;
const PROFILE_COUNT = Object.keys(PROFILE_STATURE_INDEX).length * PROFILE_BUILD_COUNT;

export class HeroStyle1Atlas {
  private images = new Map<HeroMotion, HTMLImageElement>();
  private raincoatImages = new Map<HeroMotion, HTMLImageElement>();
  private uniformImages = new Map<HeroMotion, HTMLImageElement>();
  private hairMaskImages = new Map<HeroMotion, HTMLImageElement>();
  private partMaskImages = new Map<HeroMotion, HTMLImageElement>();
  private frameCache = new Map<string, HTMLCanvasElement>();
  private failed = new Set<string>();
  private loading: Promise<void> | null = null;
  private allLoading: Promise<void> | null = null;
  private loadGeneration = 0;
  private loaded = false;

  get ready(): boolean {
    return this.loaded;
  }

  whenReady(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.loading) this.loading = this.load(this.loadGeneration);
    return this.loading;
  }

  whenAllReady(): Promise<void> {
    return this.whenReady().then(() => this.allLoading ?? Promise.resolve());
  }

  slice(
    motion: HeroMotion,
    facing: HeroFacing,
    frame: number,
    stature: BodyStature = 'average',
    build: BodyBuild = 'average',
  ): HTMLCanvasElement | null {
    return this.sliceFamily('hero', this.images, motion, facing, frame, stature, build);
  }

  sliceRaincoat(
    motion: HeroMotion,
    facing: HeroFacing,
    frame: number,
    stature: BodyStature = 'average',
    build: BodyBuild = 'average',
  ): HTMLCanvasElement | null {
    return this.sliceFamily('raincoat', this.raincoatImages, motion, facing, frame, stature, build);
  }

  sliceUniform(
    motion: HeroMotion,
    facing: HeroFacing,
    frame: number,
    stature: BodyStature = 'average',
    build: BodyBuild = 'average',
  ): HTMLCanvasElement | null {
    return this.sliceFamily('uniform', this.uniformImages, motion, facing, frame, stature, build);
  }

  sliceHairMask(
    motion: HeroMotion,
    facing: HeroFacing,
    frame: number,
    stature: BodyStature = 'average',
    build: BodyBuild = 'average',
  ): HTMLCanvasElement | null {
    return this.sliceFamily('hair-mask', this.hairMaskImages, motion, facing, frame, stature, build);
  }

  slicePartMask(
    motion: HeroMotion,
    facing: HeroFacing,
    frame: number,
    stature: BodyStature = 'average',
    build: BodyBuild = 'average',
  ): HTMLCanvasElement | null {
    return this.sliceFamily('part-mask', this.partMaskImages, motion, facing, frame, stature, build);
  }

  private sliceFamily(
    family: string,
    images: Map<HeroMotion, HTMLImageElement>,
    motion: HeroMotion,
    facing: HeroFacing,
    frame: number,
    stature: BodyStature,
    build: BodyBuild,
  ): HTMLCanvasElement | null {
    const image = images.get(motion);
    if (!this.loaded || !image) return null;

    const frameCount = HERO_STYLE1_MOTION_FRAMES[motion];
    const normalizedFrame = ((Math.trunc(frame) % frameCount) + frameCount) % frameCount;
    const profileIndex = PROFILE_STATURE_INDEX[stature] * PROFILE_BUILD_COUNT + PROFILE_BUILD_INDEX[build];
    const cacheKey = `${family}:${motion}:${facing}:${normalizedFrame}:${stature}:${build}`;
    const cached = this.frameCache.get(cacheKey);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = HERO_STYLE1_FRAME_WIDTH;
    canvas.height = HERO_STYLE1_FRAME_HEIGHT;
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) throw new Error('Unable to create the hero atlas frame canvas');

    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      normalizedFrame * HERO_STYLE1_FRAME_WIDTH,
      (profileIndex * 4 + HERO_STYLE1_DIRECTION_ROWS[facing]) * HERO_STYLE1_FRAME_HEIGHT,
      HERO_STYLE1_FRAME_WIDTH,
      HERO_STYLE1_FRAME_HEIGHT,
      0,
      0,
      HERO_STYLE1_FRAME_WIDTH,
      HERO_STYLE1_FRAME_HEIGHT,
    );
    this.frameCache.set(cacheKey, canvas);
    return canvas;
  }

  clear(): void {
    this.loadGeneration += 1;
    this.images.clear();
    this.raincoatImages.clear();
    this.uniformImages.clear();
    this.hairMaskImages.clear();
    this.partMaskImages.clear();
    this.frameCache.clear();
    this.failed.clear();
    this.loading = null;
    this.allLoading = null;
    this.loaded = false;
  }

  private async load(generation: number): Promise<void> {
    const optionalFamilies = Promise.all([
      this.loadFamily(RAINCOAT_URLS, 'raincoat'),
      this.loadFamily(UNIFORM_URLS, 'uniform'),
    ]);
    this.allLoading = optionalFamilies.then(([raincoatEntries, uniformEntries]) => {
      if (generation !== this.loadGeneration) return;
      this.raincoatImages = new Map(raincoatEntries);
      this.uniformImages = new Map(uniformEntries);
    });
    const [entries, hairMaskEntries, partMaskEntries] = await Promise.all([
      this.loadFamily(ATLAS_URLS, 'hero'),
      this.loadFamily(HAIR_MASK_URLS, 'hair-mask'),
      this.loadFamily(PART_MASK_URLS, 'part-mask'),
    ]);
    if (generation !== this.loadGeneration) return;
    this.images = new Map(entries);
    this.hairMaskImages = new Map(hairMaskEntries);
    this.partMaskImages = new Map(partMaskEntries);
    this.loaded = this.images.size > 0;
    if (!this.loaded) console.error('主角像素图集全部不可用；完整美术闸门应阻断启动。');
    this.loading = null;
  }

  private async loadFamily(
    urls: Record<HeroMotion, string>,
    family: string,
  ): Promise<Array<[HeroMotion, HTMLImageElement]>> {
    const results = await Promise.allSettled(
      MOTIONS.map((motion) => this.loadImage(motion, urls[motion], family)),
    );
    const entries: Array<[HeroMotion, HTMLImageElement]> = [];
    results.forEach((result, index) => {
      const motion = MOTIONS[index]!;
      if (result.status === 'fulfilled') {
        entries.push([motion, result.value]);
        return;
      }
      const key = `${family}:${motion}`;
      this.failed.add(key);
      console.error(`主角 ${family}/${motion} 图集损坏；完整美术闸门应阻断启动。`, result.reason);
    });
    return entries;
  }

  private async loadImage(motion: HeroMotion, url: string, family: string): Promise<HTMLImageElement> {
    const priority = family === 'raincoat' || family === 'uniform' ? 'background' : 'critical';
    const image = await loadArtImage(url, priority);
    const expectedWidth = HERO_STYLE1_FRAME_WIDTH * HERO_STYLE1_MOTION_FRAMES[motion];
    const expectedHeight = HERO_STYLE1_FRAME_HEIGHT * 4 * PROFILE_COUNT;
    if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight) {
      throw new Error(
        `Invalid ${motion} ${family} atlas size: ${image.naturalWidth}x${image.naturalHeight}`,
      );
    }
    return image;
  }
}

export const heroStyle1Atlas = new HeroStyle1Atlas();
