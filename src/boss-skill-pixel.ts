import type { EnemyUnit } from './types';
import { loadArtImage } from './art-runtime';

export type BossSkillId =
  | 'closet-shadow' | 'closet-split' | 'closet-hands' | 'closet-slam'
  | 'father-stomp' | 'father-stand' | 'father-brace'
  | 'father-charge' | 'father-tantrum' | 'father-tears'
  | 'praise-p1-praise' | 'praise-p1-delegate' | 'praise-p1-retreat' | 'praise-p1-consult'
  | 'praise-p2-slam' | 'praise-p2-paper' | 'praise-p2-optimize' | 'praise-p2-dismiss' | 'praise-p2-one-seat'
  | 'phone-p1-ring' | 'phone-p1-answer' | 'phone-p1-missed'
  | 'phone-p2-ring' | 'phone-p2-answer' | 'phone-p2-missed'
  | 'collector-bill' | 'collector-drag' | 'collector-relocate'
  | 'keeper-name' | 'keeper-strip' | 'keeper-dim'
  | 'coat-sleeve' | 'coat-double-sleeve'
  | 'uniform-standard' | 'uniform-process' | 'uniform-pass'
  | 'bus-depart' | 'wet-shoes-hurry' | 'box-count'
  | 'lantern-summon' | 'lantern-summon-fast';

type BossSkillAssetKey =
  | 'closet-dark-skills' | 'closet-dark-extra-skills'
  | 'silent-father-p1-skills' | 'silent-father-p2-skills'
  | 'praise-chair-p1-skills' | 'praise-chair-p2-skills'
  | 'ringing-phone-p1-skills' | 'ringing-phone-p2-skills'
  | 'debt-collector-skills' | 'lamp-keeper-skills'
  | 'coat-rack-skills' | 'uniform-answer-skills' | 'last-bus-skills'
  | 'wet-shoes-skills' | 'whose-box-skills' | 'revolving-lantern-skills';

interface BossSkillAssetSpec {
  frame: number;
  rows: number;
  display: number;
  url: string;
}

interface BossSkillSpec {
  asset: BossSkillAssetKey;
  row: number;
  loop?: boolean;
}

const ASSETS: Record<BossSkillAssetKey, BossSkillAssetSpec> = {
  'closet-dark-skills': { frame: 48, rows: 2, display: 128, url: new URL('./assets/enemies/boss-skills-v1/closet-dark-skills.png', import.meta.url).href },
  'closet-dark-extra-skills': { frame: 48, rows: 2, display: 128, url: new URL('./assets/enemies/boss-skills-v1/closet-dark-extra-skills.png', import.meta.url).href },
  'silent-father-p1-skills': { frame: 64, rows: 3, display: 144, url: new URL('./assets/enemies/boss-skills-v1/silent-father-p1-skills.png', import.meta.url).href },
  'silent-father-p2-skills': { frame: 64, rows: 3, display: 96, url: new URL('./assets/enemies/boss-skills-v1/silent-father-p2-skills.png', import.meta.url).href },
  'praise-chair-p1-skills': { frame: 64, rows: 4, display: 128, url: new URL('./assets/enemies/boss-skills-v1/praise-chair-p1-skills.png', import.meta.url).href },
  'praise-chair-p2-skills': { frame: 96, rows: 5, display: 192, url: new URL('./assets/enemies/boss-skills-v1/praise-chair-p2-skills.png', import.meta.url).href },
  'ringing-phone-p1-skills': { frame: 64, rows: 3, display: 128, url: new URL('./assets/enemies/boss-skills-v1/ringing-phone-p1-skills.png', import.meta.url).href },
  'ringing-phone-p2-skills': { frame: 64, rows: 3, display: 128, url: new URL('./assets/enemies/boss-skills-v1/ringing-phone-p2-skills.png', import.meta.url).href },
  'debt-collector-skills': { frame: 48, rows: 3, display: 128, url: new URL('./assets/enemies/boss-skills-v1/debt-collector-skills.png', import.meta.url).href },
  'lamp-keeper-skills': { frame: 64, rows: 3, display: 160, url: new URL('./assets/enemies/boss-skills-v1/lamp-keeper-skills.png', import.meta.url).href },
  'coat-rack-skills': { frame: 48, rows: 2, display: 96, url: new URL('./assets/enemies/boss-skills-v1/coat-rack-skills.png', import.meta.url).href },
  'uniform-answer-skills': { frame: 48, rows: 3, display: 112, url: new URL('./assets/enemies/boss-skills-v1/uniform-answer-skills.png', import.meta.url).href },
  'last-bus-skills': { frame: 64, rows: 1, display: 144, url: new URL('./assets/enemies/boss-skills-v1/last-bus-skills.png', import.meta.url).href },
  'wet-shoes-skills': { frame: 48, rows: 1, display: 72, url: new URL('./assets/enemies/boss-skills-v1/wet-shoes-skills.png', import.meta.url).href },
  'whose-box-skills': { frame: 48, rows: 1, display: 80, url: new URL('./assets/enemies/boss-skills-v1/whose-box-skills.png', import.meta.url).href },
  'revolving-lantern-skills': { frame: 48, rows: 2, display: 96, url: new URL('./assets/enemies/boss-skills-v1/revolving-lantern-skills.png', import.meta.url).href },
};

const SKILLS: Record<BossSkillId, BossSkillSpec> = {
  'closet-shadow': { asset: 'closet-dark-skills', row: 0 },
  'closet-split': { asset: 'closet-dark-skills', row: 1 },
  'closet-hands': { asset: 'closet-dark-extra-skills', row: 0 },
  'closet-slam': { asset: 'closet-dark-extra-skills', row: 1 },
  'father-stomp': { asset: 'silent-father-p1-skills', row: 0 },
  'father-stand': { asset: 'silent-father-p1-skills', row: 1 },
  'father-brace': { asset: 'silent-father-p1-skills', row: 2 },
  'father-charge': { asset: 'silent-father-p2-skills', row: 0 },
  'father-tantrum': { asset: 'silent-father-p2-skills', row: 1 },
  'father-tears': { asset: 'silent-father-p2-skills', row: 2 },
  'praise-p1-praise': { asset: 'praise-chair-p1-skills', row: 0 },
  'praise-p1-delegate': { asset: 'praise-chair-p1-skills', row: 1 },
  'praise-p1-retreat': { asset: 'praise-chair-p1-skills', row: 2 },
  'praise-p1-consult': { asset: 'praise-chair-p1-skills', row: 3 },
  'praise-p2-slam': { asset: 'praise-chair-p2-skills', row: 0 },
  'praise-p2-paper': { asset: 'praise-chair-p2-skills', row: 1 },
  'praise-p2-optimize': { asset: 'praise-chair-p2-skills', row: 2 },
  'praise-p2-dismiss': { asset: 'praise-chair-p2-skills', row: 3 },
  'praise-p2-one-seat': { asset: 'praise-chair-p2-skills', row: 4 },
  'phone-p1-ring': { asset: 'ringing-phone-p1-skills', row: 0, loop: true },
  'phone-p1-answer': { asset: 'ringing-phone-p1-skills', row: 1 },
  'phone-p1-missed': { asset: 'ringing-phone-p1-skills', row: 2 },
  'phone-p2-ring': { asset: 'ringing-phone-p2-skills', row: 0, loop: true },
  'phone-p2-answer': { asset: 'ringing-phone-p2-skills', row: 1 },
  'phone-p2-missed': { asset: 'ringing-phone-p2-skills', row: 2 },
  'collector-bill': { asset: 'debt-collector-skills', row: 0 },
  'collector-drag': { asset: 'debt-collector-skills', row: 1 },
  'collector-relocate': { asset: 'debt-collector-skills', row: 2 },
  'keeper-name': { asset: 'lamp-keeper-skills', row: 0 },
  'keeper-strip': { asset: 'lamp-keeper-skills', row: 1 },
  'keeper-dim': { asset: 'lamp-keeper-skills', row: 2 },
  'coat-sleeve': { asset: 'coat-rack-skills', row: 0 },
  'coat-double-sleeve': { asset: 'coat-rack-skills', row: 1 },
  'uniform-standard': { asset: 'uniform-answer-skills', row: 0 },
  'uniform-process': { asset: 'uniform-answer-skills', row: 1 },
  'uniform-pass': { asset: 'uniform-answer-skills', row: 2 },
  'bus-depart': { asset: 'last-bus-skills', row: 0 },
  'wet-shoes-hurry': { asset: 'wet-shoes-skills', row: 0 },
  'box-count': { asset: 'whose-box-skills', row: 0 },
  'lantern-summon': { asset: 'revolving-lantern-skills', row: 0 },
  'lantern-summon-fast': { asset: 'revolving-lantern-skills', row: 1 },
};

const SKILL_IDS = new Set<string>(Object.keys(SKILLS));

export function isBossSkillId(value: string | undefined): value is BossSkillId {
  return value !== undefined && SKILL_IDS.has(value);
}

export function bossSkillLoops(id: BossSkillId): boolean {
  return SKILLS[id].loop === true;
}

class BossSkillAtlas {
  private images = new Map<BossSkillAssetKey, HTMLImageElement>();
  private frames = new Map<string, HTMLCanvasElement>();
  private loading: Promise<void> | null = null;
  private loaded = false;

  whenReady(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.loading) this.loading = this.load();
    return this.loading;
  }

  slice(id: BossSkillId, frameIndex: number): { image: HTMLCanvasElement; display: number } | null {
    const skill = SKILLS[id];
    const asset = ASSETS[skill.asset];
    const image = this.images.get(skill.asset);
    if (!image) return null;
    const frame = Math.max(0, Math.min(3, Math.trunc(frameIndex)));
    const key = `${id}:${frame}`;
    const cached = this.frames.get(key);
    if (cached) return { image: cached, display: asset.display };
    const canvas = document.createElement('canvas');
    canvas.width = asset.frame;
    canvas.height = asset.frame;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, frame * asset.frame, skill.row * asset.frame, asset.frame, asset.frame, 0, 0, asset.frame, asset.frame);
    this.frames.set(key, canvas);
    return { image: canvas, display: asset.display };
  }

  private async load(): Promise<void> {
    const assets = Object.entries(ASSETS) as Array<[BossSkillAssetKey, BossSkillAssetSpec]>;
    const results = await Promise.allSettled(assets.map(async ([key, spec]) => {
      const image = await this.loadImage(key, spec);
      this.images.set(key, image);
      return image;
    }));
    results.forEach((result, index) => {
      const key = assets[index]![0];
      if (result.status === 'rejected') console.warn(`Skipping unavailable boss skill atlas ${key}.`, result.reason);
    });
    this.loaded = results.some((result) => result.status === 'fulfilled');
    this.loading = null;
  }

  private async loadImage(key: BossSkillAssetKey, spec: BossSkillAssetSpec): Promise<HTMLImageElement> {
    const element = await loadArtImage(spec.url);
    if (element.naturalWidth !== spec.frame * 4 || element.naturalHeight !== spec.frame * spec.rows) {
      throw new Error(`Boss skill atlas size mismatch: ${key}`);
    }
    return element;
  }
}

const bossSkillAtlas = new BossSkillAtlas();

/** v2 8 帧试点：横排条带图集，存在则优先于 v1 四帧 */
interface EightFrameSpec { url: string; frame: number; frames: number; display: number }
const EIGHT_FRAME_SKILLS: Partial<Record<BossSkillId, EightFrameSpec>> = {
  'father-charge': {
    url: new URL('./assets/enemies/boss-skills-v2/father-charge-8f.png', import.meta.url).href,
    frame: 64, frames: 8, display: 96,
  },
  'praise-p2-slam': {
    url: new URL('./assets/enemies/boss-skills-v2/praise-slam-8f.png', import.meta.url).href,
    frame: 96, frames: 8, display: 192,
  },
  'praise-p2-paper': {
    url: new URL('./assets/enemies/boss-skills-v2/praise-p2-paper-8f.png', import.meta.url).href,
    frame: 96, frames: 8, display: 192,
  },
  'praise-p2-optimize': {
    url: new URL('./assets/enemies/boss-skills-v2/praise-p2-optimize-8f.png', import.meta.url).href,
    frame: 96, frames: 8, display: 192,
  },
  'praise-p2-dismiss': {
    url: new URL('./assets/enemies/boss-skills-v2/praise-p2-dismiss-8f.png', import.meta.url).href,
    frame: 96, frames: 8, display: 192,
  },
  'praise-p2-one-seat': {
    url: new URL('./assets/enemies/boss-skills-v2/praise-p2-one-seat-8f.png', import.meta.url).href,
    frame: 96, frames: 8, display: 192,
  },
  'bus-depart': {
    url: new URL('./assets/enemies/boss-skills-v2/bus-depart-8f.png', import.meta.url).href,
    frame: 64, frames: 8, display: 144,
  },
  'keeper-name': {
    url: new URL('./assets/enemies/boss-skills-v2/keeper-name-8f.png', import.meta.url).href,
    frame: 64, frames: 8, display: 160,
  },
  'keeper-strip': {
    url: new URL('./assets/enemies/boss-skills-v2/keeper-strip-8f.png', import.meta.url).href,
    frame: 64, frames: 8, display: 160,
  },
};

class EightFrameAtlas {
  private images = new Map<BossSkillId, HTMLImageElement>();
  private frames = new Map<string, HTMLCanvasElement>();

  constructor() {
    for (const [id, spec] of Object.entries(EIGHT_FRAME_SKILLS) as Array<[BossSkillId, EightFrameSpec]>) {
      void loadArtImage(spec.url).then((image) => {
        if (image.naturalWidth === spec.frame * spec.frames && image.naturalHeight === spec.frame) {
          this.images.set(id, image);
        } else console.warn(`8f atlas size mismatch: ${id}`);
      }).catch(() => console.warn(`8f atlas failed: ${id}`));
    }
  }

  slice(id: BossSkillId, progress: number): { image: HTMLCanvasElement; display: number } | null {
    const spec = EIGHT_FRAME_SKILLS[id];
    const image = this.images.get(id);
    if (!spec || !image) return null;
    // 8 帧非匀速曲线：前摇 0-2 帧拖住、爆发 3-5 帧、收势 6-7 缓出
    const eased = progress < 0.42
      ? (progress / 0.42) * 3
      : progress < 0.72
        ? 3 + ((progress - 0.42) / 0.3) * 3
        : 6 + ((progress - 0.72) / 0.28) * 2;
    const frame = Math.max(0, Math.min(spec.frames - 1, Math.floor(eased)));
    const key = `${id}:${frame}`;
    const cached = this.frames.get(key);
    if (cached) return { image: cached, display: spec.display };
    const canvas = document.createElement('canvas');
    canvas.width = spec.frame;
    canvas.height = spec.frame;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, frame * spec.frame, 0, spec.frame, spec.frame, 0, 0, spec.frame, spec.frame);
    this.frames.set(key, canvas);
    return { image: canvas, display: spec.display };
  }
}

const eightFrameAtlas = new EightFrameAtlas();

export class PixelBossSkillRenderer {
  constructor() {
    void bossSkillAtlas.whenReady().catch((error: unknown) => console.warn('Boss skill atlases unavailable.', error));
  }

  draw(
    target: CanvasRenderingContext2D,
    enemy: EnemyUnit,
    id: BossSkillId,
    frame: number,
    faceLeft: boolean,
    displayScale = 1,
    progress?: number,
  ): boolean {
    // v2 8 帧优先：progress 已知时用连续曲线选帧，动作更顺
    const sprite = (progress !== undefined ? eightFrameAtlas.slice(id, progress) : null)
      ?? bossSkillAtlas.slice(id, frame);
    if (!sprite) return false;
    target.save();
    target.imageSmoothingEnabled = false;
    target.translate(Math.round(enemy.x), Math.round(enemy.y));
    // 挤压拉伸：爆发帧（2）沿水平微拉伸、垂直微压，收势帧（3）反向回弹——
    // 幅度控制在 ±6%，像素画上读作"发力"而不是"变形"。
    const stretchX = frame === 2 ? 1.06 : frame === 3 ? 0.97 : 1;
    const stretchY = frame === 2 ? 0.95 : frame === 3 ? 1.03 : 1;
    target.scale((faceLeft ? -1 : 1) * stretchX, stretchY);
    const display = Math.max(1, Math.round(sprite.display * displayScale));
    const offset = Math.floor(display / 2);
    target.drawImage(sprite.image, -offset, -offset, display, display);
    target.restore();
    return true;
  }
}
