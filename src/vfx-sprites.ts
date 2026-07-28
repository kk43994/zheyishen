// 战斗 VFX 贴图：image2 基底 + scripts/process_vfx_ui_pack.py 规整产物。
// 全部为可选增强：图集未加载时调用方保持程序化绘制，不产生任何视觉变化。
import projectilesManifest from './assets/vfx/projectiles.json';
import projectileAnimManifest from './assets/vfx/projectile-anim.json';
import hitsManifest from './assets/vfx/hits.json';
import savesManifest from './assets/vfx/saves.json';
import synergyManifest from './assets/vfx/synergy.json';
import statusManifest from './assets/vfx/status.json';
import poisonManifest from './assets/ui/poison.json';
import joystickManifest from './assets/ui/joystick.json';

const PROJECTILES_URL = new URL('./assets/vfx/projectiles.png', import.meta.url).href;
const PROJECTILE_ANIM_URL = new URL('./assets/vfx/projectile-anim.png', import.meta.url).href;
const HITS_URL = new URL('./assets/vfx/hits.png', import.meta.url).href;
const SAVES_URL = new URL('./assets/vfx/saves.png', import.meta.url).href;
const SYNERGY_URL = new URL('./assets/vfx/synergy.png', import.meta.url).href;
const STATUS_URL = new URL('./assets/vfx/status.png', import.meta.url).href;
const POISON_URL = new URL('./assets/ui/poison.png', import.meta.url).href;
const JOYSTICK_URL = new URL('./assets/ui/joystick.png', import.meta.url).href;

interface GridManifest { cell: number; cols: number; rows: number; index?: Record<string, number> }

class SpriteAtlas {
  private image: HTMLImageElement | null = null;
  private frames = new Map<number, HTMLCanvasElement>();
  private tinted = new Map<string, HTMLCanvasElement>();
  private loaded = false;
  private readyPromise: Promise<void> | null = null;

  constructor(private url: string, private manifest: GridManifest) {}

  load(): void {
    if (this.image) return;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const { cell, cols, rows } = this.manifest;
      if (image.naturalWidth !== cell * cols || image.naturalHeight !== cell * rows) {
        console.warn(`VFX 图集尺寸错误: ${this.url} ${image.naturalWidth}x${image.naturalHeight}`);
        return;
      }
      this.loaded = true;
    };
    image.onerror = () => {
      console.warn(`VFX 图集加载失败: ${this.url}`);
      this.image = null;
    };
    image.src = this.url;
    this.image = image;
  }

  whenReady(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    this.load();
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise((resolve, reject) => {
      const image = this.image;
      if (!image) {
        reject(new Error(`VFX 图集尚未初始化: ${this.url}`));
        return;
      }
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => reject(new Error(`VFX 图集加载失败: ${this.url}`)), { once: true });
    });
    return this.readyPromise;
  }

  get ready(): boolean { return this.loaded; }

  slice(index: number): HTMLCanvasElement | null {
    if (!this.loaded || !this.image) return null;
    const cached = this.frames.get(index);
    if (cached) return cached;
    const { cell, cols } = this.manifest;
    const canvas = document.createElement('canvas');
    canvas.width = cell;
    canvas.height = cell;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.image, (index % cols) * cell, Math.floor(index / cols) * cell, cell, cell, 0, 0, cell, cell);
    this.frames.set(index, canvas);
    return canvas;
  }

  named(name: string): HTMLCanvasElement | null {
    const index = this.manifest.index?.[name];
    return index === undefined ? null : this.slice(index);
  }

  /** 颜色偏移变体：保留贴图明暗，向目标色调靠拢。按 (索引|颜色) 缓存。 */
  tintedSlice(index: number, color: string, strength = 0.45): HTMLCanvasElement | null {
    const key = `${index}|${color}|${strength}`;
    const cached = this.tinted.get(key);
    if (cached) return cached;
    const base = this.slice(index);
    if (!base) return null;
    const canvas = document.createElement('canvas');
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = strength;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.tinted.set(key, canvas);
    return canvas;
  }

  tintedNamed(name: string, color: string, strength = 0.45): HTMLCanvasElement | null {
    const index = this.manifest.index?.[name];
    return index === undefined ? null : this.tintedSlice(index, color, strength);
  }

  /**
   * 描边变体：silhouette 四向冲压出 1px 墨色描边再叠本体，整张缓存。
   * 六章白天地板（米棕/灰蓝）上，灰白弹体没有描边就沉进地里——这一圈是弹体可读性的底线。
   * 烘进缓存意味着每帧零额外开销。
   */
  outlinedTinted(name: string, color: string, strength = 0.45, outline = '#26221c'): HTMLCanvasElement | null {
    const key = `o|${name}|${color}|${strength}|${outline}`;
    const cached = this.tinted.get(key);
    if (cached) return cached;
    const base = this.tintedNamed(name, color, strength);
    if (!base) return null;
    const pad = 2;
    const canvas = document.createElement('canvas');
    canvas.width = base.width + pad * 2;
    canvas.height = base.height + pad * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const silhouette = document.createElement('canvas');
    silhouette.width = base.width;
    silhouette.height = base.height;
    const silhouetteCtx = silhouette.getContext('2d');
    if (!silhouetteCtx) return null;
    silhouetteCtx.drawImage(base, 0, 0);
    silhouetteCtx.globalCompositeOperation = 'source-in';
    silhouetteCtx.fillStyle = outline;
    silhouetteCtx.fillRect(0, 0, silhouette.width, silhouette.height);
    ctx.imageSmoothingEnabled = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      ctx.drawImage(silhouette, pad + dx, pad + dy);
    }
    ctx.drawImage(base, pad, pad);
    this.tinted.set(key, canvas);
    return canvas;
  }
}

export const projectileAtlas = new SpriteAtlas(PROJECTILES_URL, projectilesManifest as GridManifest);
export const projectileAnimAtlas = new SpriteAtlas(PROJECTILE_ANIM_URL, projectileAnimManifest as GridManifest);
// v5 铺开：全部 18 种形态都有 4 帧飞行循环（2026-07-26 打样确认后扩全）。
// breath0/2/3 是呼吸凝实态专属行（"breath" 行=态1），恢复"雾→珠"的成长表达。
const PROJECTILE_IMAGE2_ANIMATED_FORMS = new Set([
  'breath', 'marble', 'key', 'slash',
  'rain', 'tear', 'ice', 'laugh', 'serial', 'paper', 'razor',
  'lens', 'sound', 'link', 'button', 'stone', 'cone', 'stamp',
  'breath0', 'breath2', 'breath3',
]);

/** 呼吸凝实态 0-3 → 帧动画行名（态1 复用 "breath" 行）。 */
export function breathAnimForm(firmnessState: number): string {
  return firmnessState <= 0 ? 'breath0' : firmnessState === 1 ? 'breath' : firmnessState === 2 ? 'breath2' : 'breath3';
}

/** 弹体 v5 飞行帧动画：4 帧循环 @10fps。没有该形态的帧时返回 null，调用方回落静态图。 */
export function projectileFlightFrame(
  form: string,
  time: number,
  seed: number,
  color?: string,
  tintStrength = 0.22,
): HTMLCanvasElement | null {
  const manifest = projectileAnimManifest as GridManifest & { forms?: string[] };
  if (!PROJECTILE_IMAGE2_ANIMATED_FORMS.has(form) || !manifest.forms?.includes(form)) return null;
  const frame = Math.floor(time * 10 + seed) % 4;
  const name = `${form}${frame}`;
  return color
    ? projectileAnimAtlas.outlinedTinted(name, color, tintStrength)
    : projectileAnimAtlas.named(name);
}
export const hitAtlas = new SpriteAtlas(HITS_URL, hitsManifest as GridManifest);
export const saveAtlas = new SpriteAtlas(SAVES_URL, savesManifest as GridManifest);
export const synergyAtlas = new SpriteAtlas(SYNERGY_URL, synergyManifest as GridManifest);
export const statusAtlas = new SpriteAtlas(STATUS_URL, statusManifest as GridManifest);
export const poisonAtlas = new SpriteAtlas(POISON_URL, poisonManifest as GridManifest);
export const joystickAtlas = new SpriteAtlas(JOYSTICK_URL, joystickManifest as GridManifest);

export type SaveKind = 'tooth' | 'photo' | 'shutdown';
const SAVE_ROW: Record<SaveKind, number> = { tooth: 0, photo: 1, shutdown: 2 };

/** 免死演出：kind 行 × 4 帧，progress ∈ [0,1)。 */
export function saveFrame(kind: SaveKind, progress: number): HTMLCanvasElement | null {
  const frame = Math.min(3, Math.floor(progress * 4));
  return saveAtlas.slice(SAVE_ROW[kind] * 4 + frame);
}

export type HitMaterial =
  | 'mist' | 'water' | 'crit' | 'paper' | 'wood' | 'stone'
  | 'metal' | 'ice' | 'signal' | 'key' | 'glass';
const HIT_ROW: Record<HitMaterial, number> = {
  mist: 0, water: 1, crit: 2, paper: 3, wood: 4, stone: 5,
  metal: 6, ice: 7, signal: 8, key: 9, glass: 10,
};

/** 命中动画：每种 material 一行 × 4 帧，progress ∈ [0,1)。 */
export function hitFrame(material: HitMaterial, progress: number): HTMLCanvasElement | null {
  const frame = Math.min(3, Math.floor(progress * 4));
  return hitAtlas.slice(HIT_ROW[material] * 4 + frame);
}

projectileAtlas.load();
projectileAnimAtlas.load();
hitAtlas.load();
saveAtlas.load();
synergyAtlas.load();
statusAtlas.load();
poisonAtlas.load();
joystickAtlas.load();
