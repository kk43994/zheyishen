import type { EnemyType, EnemyUnit } from './types';

export const ENEMY_PIXEL_FRAME = 32;

export type EnemyPixelMotion = 'idle' | 'move' | 'attack' | 'hurt' | 'death';
export type EnemyPixelAssetKey =
  | 'fear' | 'red-mark' | 'whisper' | 'clockwork' | 'debt'
  | 'silent-father' | 'silent-father-p2' | 'lamp-keeper' | 'uniform-answer'
  | 'uniform-answer-hd' | 'last-bus-hd'
  | 'cry-moth' | 'hunger-shadow' | 'closet-dark' | 'missed-call' | 'silence'
  | 'badge-thief' | 'debt-collector' | 'forgetter' | 'empty-chair' | 'last-bus'
  | 'closet-clothes' | 'wall-ranking' | 'window-desk' | 'father-silence' | 'whose-box' | 'iv-stand'
  | 'coat-rack' | 'others-paper' | 'sign-here' | 'wet-shoes' | 'desk-lamp' | 'reheated-pot'
  | 'id-scanner' | 'task-simple' | 'task-revise' | 'task-deadline' | 'task-sync'
  | 'meeting-door' | 'checkup-report' | 'revolving-lantern' | 'queue-screen' | 'others-family'
  | 'praise-chair-p1' | 'praise-chair-p2' | 'ringing-phone-p1' | 'ringing-phone-p2';

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
  'silent-father': new URL('./assets/enemies/silent-father-hd.png', import.meta.url).href,
  'silent-father-p2': new URL('./assets/enemies/silent-father-p2-hd.png', import.meta.url).href,
  'lamp-keeper': new URL('./assets/enemies/lamp-keeper-hd.png', import.meta.url).href,
  'uniform-answer': new URL('./assets/canonical-v1/enemies/uniform-answer.png', import.meta.url).href,
  'uniform-answer-hd': new URL('./assets/enemies/uniform-answer-hd.png', import.meta.url).href,
  'cry-moth': new URL('./assets/enemies/cry-moth.png', import.meta.url).href,
  'hunger-shadow': new URL('./assets/canonical-v1/enemies/hunger-shadow.png', import.meta.url).href,
  'closet-dark': new URL('./assets/enemies/closet-dark-hd.png', import.meta.url).href,
  'missed-call': new URL('./assets/enemies/missed-call.png', import.meta.url).href,
  silence: new URL('./assets/enemies/silence.png', import.meta.url).href,
  'badge-thief': new URL('./assets/enemies/badge-thief.png', import.meta.url).href,
  'debt-collector': new URL('./assets/enemies/debt-collector-hd.png', import.meta.url).href,
  forgetter: new URL('./assets/enemies/forgetter.png', import.meta.url).href,
  'empty-chair': new URL('./assets/enemies/empty-chair.png', import.meta.url).href,
  // The station boss keeps its source yellow signal lights until a brighter
  // canonical pass is approved by visual QA.
  'last-bus': new URL('./assets/enemies/last-bus.png', import.meta.url).href,
  'last-bus-hd': new URL('./assets/enemies/last-bus-hd.png', import.meta.url).href,
  'closet-clothes': new URL('./assets/enemies/closet-clothes.png', import.meta.url).href,
  'wall-ranking': new URL('./assets/enemies/wall-ranking.png', import.meta.url).href,
  'window-desk': new URL('./assets/enemies/window-desk.png', import.meta.url).href,
  'father-silence': new URL('./assets/enemies/father-silence.png', import.meta.url).href,
  'whose-box': new URL('./assets/enemies/whose-box.png', import.meta.url).href,
  'iv-stand': new URL('./assets/enemies/iv-stand.png', import.meta.url).href,
  'coat-rack': new URL('./assets/enemies/coat-rack.png', import.meta.url).href,
  'others-paper': new URL('./assets/enemies/others-paper.png', import.meta.url).href,
  'sign-here': new URL('./assets/enemies/sign-here.png', import.meta.url).href,
  'wet-shoes': new URL('./assets/enemies/wet-shoes.png', import.meta.url).href,
  'desk-lamp': new URL('./assets/enemies/desk-lamp.png', import.meta.url).href,
  'reheated-pot': new URL('./assets/enemies/reheated-pot.png', import.meta.url).href,
  'id-scanner': new URL('./assets/enemies/id-scanner.png', import.meta.url).href,
  'task-simple': new URL('./assets/enemies/task-simple.png', import.meta.url).href,
  'task-revise': new URL('./assets/enemies/task-revise.png', import.meta.url).href,
  'task-deadline': new URL('./assets/enemies/task-deadline.png', import.meta.url).href,
  'task-sync': new URL('./assets/enemies/task-sync.png', import.meta.url).href,
  'meeting-door': new URL('./assets/enemies/meeting-door.png', import.meta.url).href,
  'checkup-report': new URL('./assets/enemies/checkup-report.png', import.meta.url).href,
  'revolving-lantern': new URL('./assets/enemies/revolving-lantern.png', import.meta.url).href,
  'queue-screen': new URL('./assets/enemies/queue-screen.png', import.meta.url).href,
  'others-family': new URL('./assets/enemies/others-family.png', import.meta.url).href,
  'praise-chair-p1': new URL('./assets/enemies/praise-chair-p1.png', import.meta.url).href,
  'praise-chair-p2': new URL('./assets/enemies/praise-chair-p2.png', import.meta.url).href,
  'ringing-phone-p1': new URL('./assets/enemies/ringing-phone-p1.png', import.meta.url).href,
  'ringing-phone-p2': new URL('./assets/enemies/ringing-phone-p2.png', import.meta.url).href,
} as const satisfies Record<EnemyPixelAssetKey, string>;

const ASSET_KEYS = Object.keys(ATLAS_URLS) as EnemyPixelAssetKey[];

const ASSET_FRAME_SIZE: Partial<Record<EnemyPixelAssetKey, number>> = {
  'closet-dark': 48,
  'uniform-answer-hd': 48,
  'last-bus-hd': 64,
  'silent-father': 64,
  'silent-father-p2': 64,
  'debt-collector': 48,
  'lamp-keeper': 64,
  'closet-clothes': 48,
  'wall-ranking': 48,
  'window-desk': 48,
  'father-silence': 48,
  'whose-box': 48,
  'iv-stand': 48,
  'coat-rack': 48,
  'wet-shoes': 48,
  'revolving-lantern': 48,
  'praise-chair-p1': 64,
  'praise-chair-p2': 96,
  'ringing-phone-p1': 64,
  'ringing-phone-p2': 64,
};

function assetFrameSize(asset: EnemyPixelAssetKey): number {
  return ASSET_FRAME_SIZE[asset] ?? ENEMY_PIXEL_FRAME;
}

export interface EnemyDeathPixelState {
  readonly asset: EnemyPixelAssetKey;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly boss: boolean;
  readonly progress: number;
  readonly faceLeft: boolean;
}

export interface EnemyHandoffPixelState {
  readonly asset: EnemyPixelAssetKey;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly scale: number;
  readonly time: number;
}

const ASSET_FALLBACK: Record<EnemyUnit['type'], EnemyPixelAssetKey> = {
  fear: 'fear', 'red-mark': 'red-mark', whisper: 'whisper', clockwork: 'clockwork', debt: 'debt',
  'silent-father': 'silent-father', 'lamp-keeper': 'lamp-keeper',
  'cry-moth': 'cry-moth', 'hunger-shadow': 'hunger-shadow', 'missed-bus': 'last-bus', 'missed-call': 'missed-call',
  silence: 'silence', 'badge-thief': 'badge-thief', forgetter: 'forgetter', 'empty-chair': 'empty-chair',
  'closet-dark': 'closet-dark', 'uniform-answer': 'uniform-answer-hd', 'last-bus': 'last-bus-hd', 'debt-collector': 'debt-collector',
  // —— 已有美术的沿用 ——
  'whose-box': 'whose-box', 'iv-stand': 'iv-stand',
  // —— 六章新增独立美术 ——
  'coat-rack': 'coat-rack',
  'others-paper': 'others-paper', 'sign-here': 'sign-here',
  'id-scanner': 'id-scanner',
  'task-simple': 'task-simple', 'task-revise': 'task-revise',
  'task-deadline': 'task-deadline', 'task-sync': 'task-sync',
  'wet-shoes': 'wet-shoes', 'desk-lamp': 'desk-lamp', 'reheated-pot': 'reheated-pot',
  'meeting-door': 'meeting-door', 'checkup-report': 'checkup-report',
  'queue-screen': 'queue-screen', 'others-family': 'others-family',
  'revolving-lantern': 'revolving-lantern',
  'praise-chair': 'praise-chair-p1',
  'ringing-phone': 'ringing-phone-p1',
};

export function resolveEnemyPixelAsset(enemy: EnemyUnit): EnemyPixelAssetKey {
  if (enemy.type === 'red-mark' && enemy.elite) return 'uniform-answer';
  if (enemy.type === 'silent-father' && enemy.hp <= enemy.maxHp * 0.5) return 'silent-father-p2';
  if (enemy.type === 'praise-chair') return (enemy.phase ?? 1) === 2 ? 'praise-chair-p2' : 'praise-chair-p1';
  if (enemy.type === 'ringing-phone') return (enemy.phase ?? 1) === 2 ? 'ringing-phone-p2' : 'ringing-phone-p1';
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

    const frameSize = assetFrameSize(asset);
    const canvas = document.createElement('canvas');
    canvas.width = frameSize;
    canvas.height = frameSize;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('无法创建怪物像素帧画布');
    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      normalized * frameSize,
      MOTION_ROWS[motion] * frameSize,
      frameSize,
      frameSize,
      0,
      0,
      frameSize,
      frameSize,
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
        const frameSize = assetFrameSize(asset);
        const expectedWidth = frameSize * 4;
        const expectedHeight = frameSize * Object.keys(MOTION_ROWS).length;
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

/**
 * 逐怪显示尺寸覆盖。基准：主角实绘约 40×56（HERO_WORLD_SCALE 0.88 后 ≈49px 高）。
 * 原则：小怪略小于或近于主角；小 Boss 明显高于主角；大 Boss 是压迫感的来源。
 */
const DISPLAY_SIZE_OVERRIDES: Partial<Record<EnemyPixelAssetKey, number>> = {
  'silent-father': 144,     // 孩子眼里的父亲——比谁都高
  'silent-father-p2': 96,   // 仍明显缩小，但保持章节 Boss 层级，不再像普通小怪
  'lamp-keeper': 160,       // 终局，最高的一个
  'last-bus-hd': 144,       // 一辆车
  'closet-dark': 128,
  'uniform-answer-hd': 112,
  'debt-collector': 128,    // 一扇立着的门，比人高
  'closet-clothes': 96,     // 旧精英：挂着大人外套，比孩子高
  'whose-box': 80,
  'iv-stand': 72,           // 输液架细高
  'window-desk': 96,
  'last-bus': 64,           // 错过的车（小怪）
  'coat-rack': 96,
  'others-paper': 48,
  'sign-here': 40,
  'id-scanner': 64,
  'task-simple': 40,
  'task-revise': 40,
  'task-deadline': 40,
  'task-sync': 40,
  'wet-shoes': 72,
  'desk-lamp': 40,
  'reheated-pot': 48,
  'meeting-door': 80,
  'checkup-report': 40,
  'queue-screen': 48,
  'others-family': 48,
  'revolving-lantern': 96,
  'praise-chair-p1': 128,
  'praise-chair-p2': 192,
  'ringing-phone-p1': 128,
  'ringing-phone-p2': 128,
};

function spriteDisplaySize(
  asset: EnemyPixelAssetKey,
  radius: number,
  elite: boolean,
  boss: boolean,
): number {
  const override = DISPLAY_SIZE_OVERRIDES[asset];
  if (override !== undefined) return override;
  if (boss) return 128;
  if (elite) return 96;
  if (radius >= 16) return 48;
  return 40;
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
    const taskAction = enemy.type.startsWith('task-') && (enemy.taskActionTimer ?? 0) > 0;
    const motion: EnemyPixelMotion = taskAction ? 'attack' : enemy.flash > 0 ? 'hurt' : attacking ? 'attack' : 'move';
    const frame = motion === 'hurt'
      ? (enemy.flash > 0.06 ? 0 : 1)
      : motion === 'attack'
        ? (attackProgress < 0.5 ? 0 : 1)
        : Math.floor(enemy.age * 6) % MOTION_FRAMES.move;
    const asset = resolveEnemyPixelAsset(enemy);
    return this.drawFrame(
      target,
      asset,
      motion,
      frame,
      enemy.x,
      enemy.y,
      spriteDisplaySize(asset, enemy.radius, enemy.elite, enemy.boss),
      faceLeft,
      !enemy.lanternSummon,
      enemy.lanternSummon ? 0.68 : 1,
    );
  }

  drawDeath(target: CanvasRenderingContext2D, death: EnemyDeathPixelState): boolean {
    const frame = Math.min(3, Math.floor(Math.max(0, Math.min(0.999, death.progress)) * 4));
    return this.drawFrame(
      target,
      death.asset,
      'death',
      frame,
      death.x,
      death.y,
      spriteDisplaySize(death.asset, death.radius, false, death.boss),
      death.faceLeft,
    );
  }

  drawHandoff(target: CanvasRenderingContext2D, handoff: EnemyHandoffPixelState): boolean {
    const drawSize = Math.max(
      16,
      Math.round(spriteDisplaySize(handoff.asset, handoff.radius, false, false) * handoff.scale),
    );
    return this.drawFrame(
      target,
      handoff.asset,
      'idle',
      Math.floor(handoff.time * 4) % MOTION_FRAMES.idle,
      handoff.x,
      handoff.y,
      drawSize,
      false,
    );
  }

  private drawFrame(
    target: CanvasRenderingContext2D,
    asset: EnemyPixelAssetKey,
    motion: EnemyPixelMotion,
    frame: number,
    x: number,
    y: number,
    drawSize: number,
    faceLeft: boolean,
    screenLift = true,
    opacity = 1,
  ): boolean {
    const image = enemyPixelAtlas.slice(asset, motion, frame);
    if (!image) return false;
    const previousSmoothing = target.imageSmoothingEnabled;
    target.save();
    target.imageSmoothingEnabled = false;
    target.translate(Math.round(x), Math.round(y));
    target.scale(faceLeft ? -1 : 1, 1);
    const drawX = -Math.floor(drawSize / 2);
    const drawY = -Math.floor(drawSize / 2);
    target.globalAlpha = opacity;
    target.drawImage(
      image,
      drawX,
      drawY,
      drawSize,
      drawSize,
    );
    // The walk-out figures are memories cast by the lantern. Keeping them on
    // one translucent pass makes the source lamp readable even at the 100-unit
    // safety cap and avoids an expensive blend layer per shadow.
    if (screenLift) {
      target.globalCompositeOperation = 'screen';
      target.globalAlpha = 0.12 * opacity;
      target.drawImage(image, drawX, drawY, drawSize, drawSize);
    }
    target.restore();
    target.imageSmoothingEnabled = previousSmoothing;
    return true;
  }
}

export const enemyPixelAssetsReady = (): Promise<void> => enemyPixelAtlas.whenReady();
