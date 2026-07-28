// 组合彩蛋奥义插画：image2 基底 + scripts/process_combo_art.py 规整产物。
// 正式入口由完整美术闸门保证图集可用；缺失时阻断启动，不向玩家降级展示。
// 清单走构建期 JSON 内联——平台规范禁止一切运行时网络请求（fetch/XHR）。
import comboArtManifest from './assets/ui/combo-art.json';
import { loadArtImage } from './art-runtime';

const ART_URL = new URL('./assets/ui/combo-art.png', import.meta.url).href;

interface ComboArtManifest {
  cellWidth: number;
  cellHeight: number;
  cols: number;
  keys: string[];
  missing?: string[];
}

class ComboArtAtlas {
  private image: HTMLImageElement | null = null;
  private manifest: ComboArtManifest | null = null;
  private missing = new Set<string>();
  private frames = new Map<string, HTMLCanvasElement>();

  load(): void {
    const manifest = comboArtManifest as ComboArtManifest;
    this.manifest = manifest;
    this.missing = new Set(manifest.missing ?? []);
    void loadArtImage(ART_URL).then((image) => {
      const rows = Math.ceil(manifest.keys.length / manifest.cols);
      if (image.naturalWidth !== manifest.cellWidth * manifest.cols
        || image.naturalHeight !== manifest.cellHeight * rows) {
        console.warn(`奥义插画图集尺寸错误: ${image.naturalWidth}x${image.naturalHeight}`);
        return;
      }
      this.image = image;
    }).catch(() => console.error('奥义插画图集加载失败；完整美术闸门应阻断启动。'));
  }

  get cellSize(): { width: number; height: number } | null {
    return this.manifest ? { width: this.manifest.cellWidth, height: this.manifest.cellHeight } : null;
  }

  slice(key: string): HTMLCanvasElement | null {
    if (!this.image || !this.manifest) return null;
    if (this.missing.has(key)) return null;
    const index = this.manifest.keys.indexOf(key);
    if (index < 0) return null;
    const cached = this.frames.get(key);
    if (cached) return cached;
    const { cellWidth, cellHeight, cols } = this.manifest;
    const canvas = document.createElement('canvas');
    canvas.width = cellWidth;
    canvas.height = cellHeight;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      this.image,
      (index % cols) * cellWidth, Math.floor(index / cols) * cellHeight, cellWidth, cellHeight,
      0, 0, cellWidth, cellHeight,
    );
    this.frames.set(key, canvas);
    return canvas;
  }
}

export const comboArtAtlas = new ComboArtAtlas();
comboArtAtlas.load();
