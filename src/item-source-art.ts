import sourcePalettes from './assets/items/source-palettes.json';
import type { ItemId } from './types';

export interface ItemSourcePalette {
  readonly source: string;
  readonly sourceSha256: string;
  readonly ink: string;
  readonly dark: string;
  readonly dominant: string;
  readonly accent: string;
  readonly light: string;
  readonly colors: readonly string[];
}

const PALETTES = sourcePalettes.items as unknown as Partial<Record<ItemId, ItemSourcePalette>>;

// 第五档新道具的 image2 基底还没生成：给个纸墨系兜底，防止运行时空引用。
const FALLBACK_PALETTE: ItemSourcePalette = {
  source: '', sourceSha256: '',
  ink: '#1a1713', dark: '#3a342a', dominant: '#8a8378', accent: '#c9b87a', light: '#e4dcc9',
  colors: ['#1a1713', '#8a8378', '#e4dcc9'],
};

function rgb(color: string): readonly [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function encode(channels: readonly number[]): string {
  return `#${channels.map((channel) => (
    Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')
  )).join('')}`;
}

function mix(first: string, second: string, secondWeight: number): string {
  const a = rgb(first);
  const b = rgb(second);
  if (!a || !b) return first;
  return encode(a.map((channel, index) => (
    channel * (1 - secondWeight) + b[index]! * secondWeight
  )));
}

export function getItemSourcePalette(id: ItemId): ItemSourcePalette {
  return PALETTES[id] ?? FALLBACK_PALETTE;
}

/**
 * Preserve the wiki-authored semantic hue while tying every runtime cue to
 * colors sampled from that item's approved Image2 source.
 */
export function sourceDerivedPaint(id: ItemId, semanticColor: string): string {
  const channels = rgb(semanticColor);
  if (!channels) return semanticColor;
  const [red, green, blue] = channels;
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const saturation = (high - low) / Math.max(1, high);
  const palette = getItemSourcePalette(id);
  const source = luminance < 48
    ? palette.ink
    : luminance > 205
      ? palette.light
      : saturation > 0.24
        ? palette.accent
        : luminance < 120
          ? palette.dark
          : palette.dominant;
  return mix(semanticColor, source, 0.38);
}

export function sourceDerivedMutationColor(
  id: ItemId,
  target: 'hair' | 'eyes' | 'skin' | 'outfit' | 'outline' | 'shadow',
  semanticColor: string,
): string {
  const palette = getItemSourcePalette(id);
  const source = target === 'hair' || target === 'eyes'
    ? palette.accent
    : target === 'skin'
      ? palette.light
      : target === 'outfit'
        ? palette.dominant
        : target === 'shadow'
          ? palette.dark
          : palette.ink;
  // Skin mutations need the authored complexion/redness to remain readable;
  // material, hair and effect colors can inherit more of the source asset.
  return mix(semanticColor, source, target === 'skin' ? 0.2 : 0.48);
}

