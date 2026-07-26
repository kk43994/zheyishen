import type { EnemyUnit } from './types';

export type BossSkillId =
  | 'closet-shadow' | 'closet-split'
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
  | 'closet-dark-skills'
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
    if (!this.loaded || !image) return null;
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
    const results = await Promise.allSettled(assets.map(([key, spec]) => this.loadImage(key, spec)));
    const entries: Array<[BossSkillAssetKey, HTMLImageElement]> = [];
    results.forEach((result, index) => {
      const key = assets[index]![0];
      if (result.status === 'fulfilled') entries.push([key, result.value]);
      else console.warn(`Skipping unavailable boss skill atlas ${key}.`, result.reason);
    });
    this.images = new Map(entries);
    this.loaded = entries.length > 0;
    this.loading = null;
  }

  private loadImage(key: BossSkillAssetKey, spec: BossSkillAssetSpec): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const element = new Image();
      element.decoding = 'async';
      element.onload = () => {
        if (element.naturalWidth !== spec.frame * 4 || element.naturalHeight !== spec.frame * spec.rows) {
          reject(new Error(`Boss skill atlas size mismatch: ${key}`));
        } else resolve(element);
      };
      element.onerror = () => reject(new Error(`Boss skill atlas failed to load: ${key}`));
      element.src = spec.url;
    });
  }
}

const bossSkillAtlas = new BossSkillAtlas();

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
  ): boolean {
    const sprite = bossSkillAtlas.slice(id, frame);
    if (!sprite) return false;
    target.save();
    target.imageSmoothingEnabled = false;
    target.translate(Math.round(enemy.x), Math.round(enemy.y));
    target.scale(faceLeft ? -1 : 1, 1);
    const display = Math.max(1, Math.round(sprite.display * displayScale));
    const offset = Math.floor(display / 2);
    target.drawImage(sprite.image, -offset, -offset, display, display);
    target.restore();
    return true;
  }
}
