import type { EnemyType, EnemyUnit } from './types';

export const ENEMY_PIXEL_FRAME = 32;

export type EnemyPixelMotion = 'idle' | 'move' | 'attack' | 'hurt' | 'death';
export type EnemyPixelAssetKey =
  | 'fear' | 'red-mark' | 'whisper' | 'clockwork' | 'debt'
  | 'silent-father' | 'silent-father-p2' | 'lamp-keeper' | 'uniform-answer'
  | 'cry-moth' | 'hunger-shadow' | 'closet-dark' | 'missed-call' | 'silence'
  | 'badge-thief' | 'debt-collector' | 'forgetter' | 'empty-chair' | 'last-bus';

const MOTION_FRAMES = {
  idle: 2,
  move: 4,
  attack: 2,
  hurt: 2,
  death: 4,
} as const satisfies Record<EnemyPixelMotion, number>;

const MOTION_ROWS = {
  idle: 0,
  move: 1,
  attack: 2,
  hurt: 3,
  death: 4,
} as const satisfies Record<EnemyPixelMotion, number>;

const ATLAS_URLS = {
  // The canonical fear pass is mechanically valid but too close to the
  // childhood ground bands; keep the brighter source atlas for readability.
  fear: new URL('./assets/enemies/fear.png', import.meta.url).href,
  'red-mark': new URL('./assets/enemies/red-mark.png', import.meta.url).href,
  whisper: new URL('./assets/enemies/whisper.png', import.meta.url).href,
  clockwork: new URL('./assets/enemies/clockwork.png', import.meta.url).href,
  debt: new URL('./assets/enemies/debt.png', import.meta.url).href,
  'silent-father': new URL('./assets/enemies/silent-father.png', import.meta.url).href,
  'silent-father-p2': new URL('./assets/enemies/silent-father-p2.png', import.meta.url).href,
  'lamp-keeper': new URL('./assets/enemies/lamp-keeper.png', import.meta.url).href,
  'uniform-answer': new URL('./assets/canonical-v1/enemies/uniform-answer.png', import.meta.url).href,
  'cry-moth': new URL('./assets/enemies/cry-moth.png', import.meta.url).href,
  'hunger-shadow': new URL('./assets/canonical-v1/enemies/hunger-shadow.png', import.meta.url).href,
  'closet-dark': new URL('./assets/enemies/closet-dark.png', import.meta.url).href,
  'missed-call': new URL('./assets/enemies/missed-call.png', import.meta.url).href,
  silence: new URL('./assets/enemies/silence.png', import.meta.url).href,
  'badge-thief': new URL('./assets/enemies/badge-thief.png', import.meta.url).href,
  'debt-collector': new URL('./assets/enemies/debt-collector.png', import.meta.url).href,
  forgetter: new URL('./assets/enemies/forgetter.png', import.meta.url).href,
  'empty-chair': new URL('./assets/enemies/empty-chair.png', import.meta.url).href,
  // The station boss keeps its source yellow signal lights until a brighter
  // canonical pass is approved by visual QA.
  'last-bus': new URL('./assets/enemies/last-bus.png', import.meta.url).href,
} as const satisfies Record<EnemyPixelAssetKey, string>;

const ASSET_KEYS = Object.keys(ATLAS_URLS) as EnemyPixelAssetKey[];

export interface EnemyDeathPixelState {
  readonly asset: EnemyPixelAssetKey;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly progress: number;
  readonly faceLeft: boolean;
}

const ASSET_FALLBACK: Record<EnemyUnit['type'], EnemyPixelAssetKey> = {
  fear: 'fear', 'red-mark': 'red-mark', whisper: 'whisper', clockwork: 'clockwork', debt: 'debt',
  'silent-father': 'silent-father', 'lamp-keeper': 'lamp-keeper',
  'cry-moth': 'cry-moth', 'hunger-shadow': 'hunger-shadow', 'missed-bus': 'last-bus', 'missed-call': 'missed-call',
  silence: 'silence', 'badge-thief': 'badge-thief', forgetter: 'forgetter', 'empty-chair': 'empty-chair',
  'closet-dark': 'closet-dark', 'uniform-answer': 'uniform-answer', 'last-bus': 'last-bus', 'debt-collector': 'debt-collector',
};

export function resolveEnemyPixelAsset(enemy: EnemyUnit): EnemyPixelAssetKey {
  if (enemy.type === 'red-mark' && enemy.elite) return 'uniform-answer';
  if (enemy.type === 'silent-father' && enemy.hp <= enemy.maxHp * 0.5) return 'silent-father-p2';
  return ASSET_FALLBACK[enemy.type];
}

class EnemyPixelAtlas {
  private images = new Map<EnemyPixelAssetKey, HTMLImageElement>();
  private frames = new Map<string, HTMLCanvasElement>();
  private failed = new Set<EnemyPixelAssetKey>();
  private loading: Promise<void> | null = null;
  private loaded = false;

  get ready(): boolean {
    return this.loaded;
  }

  get failedAssets(): readonly EnemyPixelAssetKey[] {
    return [...this.failed];
  }

  whenReady(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.loading) this.loading = this.load();
    return this.loading;
  }

  slice(asset: EnemyPixelAssetKey, motion: EnemyPixelMotion, frame: number): HTMLCanvasElement | null {
    const image = this.images.get(asset);
    if (!this.loaded || !image) return null;
    const count = MOTION_FRAMES[motion];
    const normalized = ((Math.trunc(frame) % count) + count) % count;
    const key = `${asset}:${motion}:${normalized}`;
    const cached = this.frames.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = ENEMY_PIXEL_FRAME;
    canvas.height = ENEMY_PIXEL_FRAME;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('无法创建怪物像素帧画布');
    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      normalized * ENEMY_PIXEL_FRAME,
      MOTION_ROWS[motion] * ENEMY_PIXEL_FRAME,
      ENEMY_PIXEL_FRAME,
      ENEMY_PIXEL_FRAME,
      0,
      0,
      ENEMY_PIXEL_FRAME,
      ENEMY_PIXEL_FRAME,
    );
    this.frames.set(key, canvas);
    return canvas;
  }

  private async load(): Promise<void> {
    const results = await Promise.allSettled(ASSET_KEYS.map((asset) => this.loadImage(asset)));
    const entries: Array<[EnemyPixelAssetKey, HTMLImageElement]> = [];
    results.forEach((result, index) => {
      const asset = ASSET_KEYS[index]!;
      if (result.status === 'fulfilled') {
        entries.push([asset, result.value]);
        return;
      }
      this.failed.add(asset);
      console.warn(`跳过损坏的怪物像素图集 ${asset}，仅回退这一种怪物。`, result.reason);
    });
    this.images = new Map(entries);
    this.loaded = entries.length > 0;
    this.loading = null;
  }

  private loadImage(asset: EnemyPixelAssetKey): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        const expectedWidth = ENEMY_PIXEL_FRAME * 4;
        const expectedHeight = ENEMY_PIXEL_FRAME * Object.keys(MOTION_ROWS).length;
        if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight) {
          reject(new Error(`怪物图集尺寸错误 ${asset}: ${image.naturalWidth}x${image.naturalHeight}`));
          return;
        }
        resolve(image);
      };
      image.onerror = () => reject(new Error(`无法加载怪物像素图集 ${asset}`));
      image.src = ATLAS_URLS[asset];
    });
  }
}

const enemyPixelAtlas = new EnemyPixelAtlas();

function spriteScale(radius: number, elite: boolean, boss: boolean): number {
  if (boss) return 3;
  if (elite || radius >= 24) return 2;
  return 1;
}

export class PixelEnemyRenderer {
  constructor() {
    void enemyPixelAtlas.whenReady().catch((error: unknown) => {
      console.warn('怪物像素图集加载失败，继续使用矢量怪物。', error);
    });
  }

  draw(
    target: CanvasRenderingContext2D,
    enemy: EnemyUnit,
    attacking: boolean,
    attackProgress: number,
    faceLeft: boolean,
  ): boolean {
    const motion: EnemyPixelMotion = enemy.flash > 0 ? 'hurt' : attacking ? 'attack' : 'move';
    const frame = motion === 'hurt'
      ? (enemy.flash > 0.06 ? 0 : 1)
      : motion === 'attack'
        ? (attackProgress < 0.5 ? 0 : 1)
        : Math.floor(enemy.age * 6) % MOTION_FRAMES.move;
    return this.drawFrame(
      target,
      resolveEnemyPixelAsset(enemy),
      motion,
      frame,
      enemy.x,
      enemy.y,
      spriteScale(enemy.radius, enemy.elite, enemy.boss),
      faceLeft,
    );
  }

  drawDeath(target: CanvasRenderingContext2D, death: EnemyDeathPixelState): boolean {
    const frame = Math.min(3, Math.floor(Math.max(0, Math.min(0.999, death.progress)) * 4));
    const elite = death.asset === 'uniform-answer' || death.asset.startsWith('silent-father');
    return this.drawFrame(
      target,
      death.asset,
      'death',
      frame,
      death.x,
      death.y,
      spriteScale(death.radius, elite, death.asset === 'lamp-keeper'),
      death.faceLeft,
    );
  }

  private drawFrame(
    target: CanvasRenderingContext2D,
    asset: EnemyPixelAssetKey,
    motion: EnemyPixelMotion,
    frame: number,
    x: number,
    y: number,
    scale: number,
    faceLeft: boolean,
  ): boolean {
    const image = enemyPixelAtlas.slice(asset, motion, frame);
    if (!image) return false;
    const previousSmoothing = target.imageSmoothingEnabled;
    target.save();
    target.imageSmoothingEnabled = false;
    target.translate(Math.round(x), Math.round(y));
    target.scale(faceLeft ? -1 : 1, 1);
    const drawX = -Math.floor(ENEMY_PIXEL_FRAME / 2) * scale;
    const drawY = -Math.floor(ENEMY_PIXEL_FRAME / 2) * scale;
    const drawSize = ENEMY_PIXEL_FRAME * scale;
    target.drawImage(
      image,
      drawX,
      drawY,
      drawSize,
      drawSize,
    );
    // A restrained screen pass lifts near-black canonical sprites while
    // preserving their transparent pixel silhouette and shared palette.
    target.globalCompositeOperation = 'screen';
    target.globalAlpha = 0.12;
    target.drawImage(image, drawX, drawY, drawSize, drawSize);
    target.restore();
    target.imageSmoothingEnabled = previousSmoothing;
    return true;
  }
}

export const enemyPixelAssetsReady = (): Promise<void> => enemyPixelAtlas.whenReady();
