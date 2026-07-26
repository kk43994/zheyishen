#!/usr/bin/env python3
"""Build exact-scale auto-renew receipt growth previews without touching runtime art."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


LOGICAL_CELL = (40, 56)
FRAMES = 4
PALETTE_COLORS = 8
GROUND_SHIFT_Y = 7


def strip_green(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    keyed = (
        (green > 96)
        & (green * 100 > red * 135)
        & (green * 100 > blue * 135)
    ) | (
        (green > 60)
        & (green * 100 > red * 120)
        & (green * 100 > blue * 120)
        & (np.maximum(red, blue) < 120)
    )
    near_key = np.asarray(
        Image.fromarray((keyed.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(5))
    ) > 0
    strongest_other = np.maximum(red, blue)
    edge_spill = (
        ~keyed
        & near_key
        & (green > 70)
        & (green > strongest_other + 10)
    )
    array[..., 1][edge_spill] = strongest_other[edge_spill].astype(np.uint8)
    array[..., 3][keyed] = 0
    array[..., :3][keyed] = 0
    return Image.fromarray(array)


def hard_quantize(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 96
    if not opaque.any():
        raise ValueError("empty receipt frame")
    colors = array[..., :3][opaque]
    sample = Image.fromarray(colors.reshape((1, len(colors), 3)).astype(np.uint8))
    quantized = sample.quantize(
        colors=PALETTE_COLORS,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    array[..., :3] = 0
    array[..., :3][opaque] = np.asarray(quantized).reshape((-1, 3))
    array[..., 3] = np.where(opaque, 255, 0).astype(np.uint8)
    return Image.fromarray(array)


def logical_strip(raw: Image.Image) -> Image.Image:
    foreground = strip_green(raw)
    source_width = raw.width // FRAMES
    strip = Image.new("RGBA", (LOGICAL_CELL[0] * FRAMES, LOGICAL_CELL[1]))
    for frame in range(FRAMES):
        left = frame * source_width
        right = raw.width if frame == FRAMES - 1 else (frame + 1) * source_width
        cell = foreground.crop((left, 0, right, raw.height))
        resized = hard_quantize(cell.resize(LOGICAL_CELL, Image.Resampling.NEAREST))
        grounded = Image.new("RGBA", LOGICAL_CELL)
        grounded.alpha_composite(resized, (0, GROUND_SHIFT_Y))
        strip.alpha_composite(grounded, (frame * LOGICAL_CELL[0], 0))
    return strip


def hero_preview(strip: Image.Image, hero_path: Path) -> Image.Image:
    hero_sheet = Image.open(hero_path).convert("RGBA")
    if hero_sheet.size != (LOGICAL_CELL[0] * 4, LOGICAL_CELL[1]):
        raise ValueError(f"unexpected approved hero dimensions: {hero_sheet.size}")
    front = hero_sheet.crop((0, 0, LOGICAL_CELL[0], LOGICAL_CELL[1]))
    result = Image.new("RGBA", strip.size)
    result.alpha_composite(strip)
    for frame in range(FRAMES):
        result.alpha_composite(front, (frame * LOGICAL_CELL[0], 0))
    return result


def enlarged_contact(image: Image.Image, scale: int = 12) -> Image.Image:
    gutter = 2
    canvas = Image.new(
        "RGBA",
        (((LOGICAL_CELL[0] + gutter) * FRAMES + gutter) * scale,
         (LOGICAL_CELL[1] + gutter * 2) * scale),
        (20, 19, 25, 255),
    )
    for frame in range(FRAMES):
        cell = image.crop((
            frame * LOGICAL_CELL[0],
            0,
            (frame + 1) * LOGICAL_CELL[0],
            LOGICAL_CELL[1],
        )).resize((LOGICAL_CELL[0] * scale, LOGICAL_CELL[1] * scale), Image.Resampling.NEAREST)
        canvas.alpha_composite(cell, ((gutter + frame * (LOGICAL_CELL[0] + gutter)) * scale, gutter * scale))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--hero", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--version", default="v1")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    raw = Image.open(args.raw).convert("RGBA")
    alpha_source = strip_green(raw)
    alpha_source.save(args.out_dir / f"37-auto-renew-{args.version}-alpha.png", optimize=True)

    strip = logical_strip(raw)
    strip.save(args.out_dir / f"37-auto-renew-{args.version}-logical-vfx.png", optimize=True)
    preview = hero_preview(strip, args.hero)
    preview.save(args.out_dir / f"37-auto-renew-{args.version}-hero-preview.png", optimize=True)
    enlarged_contact(preview).convert("RGB").save(
        args.out_dir / f"37-auto-renew-{args.version}-hero-preview-12x.png",
        optimize=True,
    )


if __name__ == "__main__":
    main()
