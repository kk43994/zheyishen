// 战斗 VFX 贴图：image2 基底 + scripts/process_vfx_ui_pack.py 规整产物。
// 全部为可选增强：图集未加载时调用方保持程序化绘制，不产生任何视觉变化。
import projectilesManifest from './assets/vfx/projectiles.json';
import hitsManifest from './assets/vfx/hits.json';
import savesManifest from './assets/vfx/saves.json';
import synergyManifest from './assets/vfx/synergy.json';
import statusManifest from './assets/vfx/status.json';
import poisonManifest from './assets/ui/poison.json';
import joystickManifest from './assets/ui/joystick.json';

const PROJECTILES_URL = new URL('./assets/vfx/projectiles.png', import.meta.url).href;
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
    image.src = this.url;
    this.image = image;
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
    const key = `${index}|${color}`;
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
}

export const projectileAtlas = new SpriteAtlas(PROJECTILES_URL, projectilesManifest as GridManifest);
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

export type HitMaterial = 'mist' | 'water' | 'crit' | 'paper';
const HIT_ROW: Record<HitMaterial, number> = { mist: 0, water: 1, crit: 2, paper: 3 };

/** 命中动画：material 行 × 4 帧，progress ∈ [0,1)。 */
export function hitFrame(material: HitMaterial, progress: number): HTMLCanvasElement | null {
  const frame = Math.min(3, Math.floor(progress * 4));
  return hitAtlas.slice(HIT_ROW[material] * 4 + frame);
}

projectileAtlas.load();
hitAtlas.load();
saveAtlas.load();
synergyAtlas.load();
statusAtlas.load();
poisonAtlas.load();
joystickAtlas.load();
