const ROOM_URLS = {
  lamp: new URL('./assets/rooms/lamp.png', import.meta.url).href,
  inner: new URL('./assets/rooms/inner.png', import.meta.url).href,
  pawn: new URL('./assets/rooms/pawn.png', import.meta.url).href,
} as const;

const GROUND_URLS = [
  new URL('./assets/world/ground-0.png', import.meta.url).href,
  new URL('./assets/world/ground-1.png', import.meta.url).href,
  new URL('./assets/world/ground-2.png', import.meta.url).href,
  new URL('./assets/world/ground-3.png', import.meta.url).href,
  new URL('./assets/world/ground-4.png', import.meta.url).href,
  new URL('./assets/world/ground-5.png', import.meta.url).href,
] as const;

const ENDING_URLS = {
  table: new URL('./assets/ui/ending-table.png', import.meta.url).href,
  lampman: new URL('./assets/ui/ending-lampman.png', import.meta.url).href,
} as const;

const CHAPTER_STRIPS_URL = new URL('./assets/ui/chapter-strips.png', import.meta.url).href;
const FATE_PROFILES_URL = new URL('./assets/ui/fate-profiles.png', import.meta.url).href;

interface FateProfileManifest {
  cell: number;
  cols: number;
  index: Record<string, number>;
}

type RoomArt = keyof typeof ROOM_URLS;
type EndingArt = keyof typeof ENDING_URLS;

function loadImage(url: string, onload: (image: HTMLImageElement) => void): void {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => onload(image);
  image.src = url;
}

class SceneArt {
  private rooms: Partial<Record<RoomArt, HTMLImageElement>> = {};
  private grounds: Array<HTMLImageElement | undefined> = [];
  private endings: Partial<Record<EndingArt, HTMLImageElement>> = {};
  private chapterStrips: HTMLImageElement | null = null;
  private fateProfiles: HTMLImageElement | null = null;

  load(): void {
    (Object.entries(ROOM_URLS) as Array<[RoomArt, string]>).forEach(([name, url]) => {
      loadImage(url, (image) => { this.rooms[name] = image; });
    });
    GROUND_URLS.forEach((url, index) => {
      loadImage(url, (image) => { this.grounds[index] = image; });
    });
    (Object.entries(ENDING_URLS) as Array<[EndingArt, string]>).forEach(([name, url]) => {
      loadImage(url, (image) => { this.endings[name] = image; });
    });
    loadImage(CHAPTER_STRIPS_URL, (image) => { this.chapterStrips = image; });
    loadImage(FATE_PROFILES_URL, (image) => { this.fateProfiles = image; });
  }

  drawRoom(ctx: CanvasRenderingContext2D, room: RoomArt, alpha = 1): boolean {
    const image = this.rooms[room];
    if (!image) return false;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, 360, 640);
    ctx.restore();
    return true;
  }

  drawGround(
    ctx: CanvasRenderingContext2D,
    stageIndex: number,
    cameraX: number,
    cameraY: number,
    alpha: number,
  ): boolean {
    const image = this.grounds[Math.min(this.grounds.length - 1, Math.max(0, stageIndex))];
    if (!image || alpha <= 0) return false;
    const tileWidth = image.naturalWidth || 128;
    const tileHeight = image.naturalHeight || 128;
    const startX = ((Math.round(cameraX) % tileWidth) + tileWidth) % tileWidth - tileWidth;
    const startY = ((Math.round(cameraY) % tileHeight) + tileHeight) % tileHeight - tileHeight;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    for (let y = startY; y < 640; y += tileHeight) {
      for (let x = startX; x < 360; x += tileWidth) ctx.drawImage(image, x, y);
    }
    ctx.restore();
    return true;
  }

  drawEnding(ctx: CanvasRenderingContext2D, ending: EndingArt, alpha = 1): boolean {
    const image = this.endings[ending];
    if (!image) return false;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, 360, 640);
    ctx.restore();
    return true;
  }

  drawChapterStrip(
    ctx: CanvasRenderingContext2D,
    chapterIndex: number,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha = 1,
  ): boolean {
    if (!this.chapterStrips) return false;
    const row = Math.min(5, Math.max(0, chapterIndex));
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.chapterStrips, 0, row * 52, 96, 52, x, y, width, height);
    ctx.restore();
    return true;
  }

  drawFateProfile(
    ctx: CanvasRenderingContext2D,
    profile: FateProfile,
    x: number,
    y: number,
    size: number,
    alpha = 1,
  ): boolean {
    if (!this.fateProfiles) return false;
    const manifest = fateProfilesManifest as FateProfileManifest;
    const index = manifest.index[profile];
    if (index === undefined) return false;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.fateProfiles,
      (index % manifest.cols) * manifest.cell,
      Math.floor(index / manifest.cols) * manifest.cell,
      manifest.cell,
      manifest.cell,
      x,
      y,
      size,
      size,
    );
    ctx.restore();
    return true;
  }
}

export const sceneArt = new SceneArt();
sceneArt.load();
import fateProfilesManifest from './assets/ui/fate-profiles.json';
import type { FateProfile } from './types';
