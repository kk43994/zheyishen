#!/usr/bin/env python3
"""Build exact-scale and enlarged third-pill review previews without touching runtime art."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


LOGICAL_CELL = (40, 56)
COLS = 4
ROWS = 2
PALETTE_COLORS = 10


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
        raise ValueError("empty logical effect cell")
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


def logical_sheet(raw: Image.Image) -> Image.Image:
    foreground = strip_green(raw)
    source_cell = (raw.width // COLS, raw.height // ROWS)
    sheet = Image.new("RGBA", (LOGICAL_CELL[0] * COLS, LOGICAL_CELL[1] * ROWS))
    for row in range(ROWS):
        for col in range(COLS):
            cell = foreground.crop((
                col * source_cell[0],
                row * source_cell[1],
                (col + 1) * source_cell[0],
                (row + 1) * source_cell[1],
            ))
            resized = cell.resize(LOGICAL_CELL, Image.Resampling.NEAREST)
            resized = hard_quantize(resized)
            sheet.alpha_composite(resized, (col * LOGICAL_CELL[0], row * LOGICAL_CELL[1]))
    return sheet


def hero_composite(sheet: Image.Image, hero_path: Path) -> Image.Image:
    hero = Image.open(hero_path).convert("RGBA")
    if hero.size != (LOGICAL_CELL[0] * COLS, LOGICAL_CELL[1]):
        raise ValueError(f"unexpected approved hero dimensions: {hero.size}")
    result = Image.new("RGBA", sheet.size)
    for row in range(ROWS):
        result.alpha_composite(hero, (0, row * LOGICAL_CELL[1]))
    result.alpha_composite(sheet)
    return result


def contact_preview(image: Image.Image, scale: int = 12) -> Image.Image:
    cell_w, cell_h = LOGICAL_CELL
    gutter = 2
    canvas = Image.new(
        "RGBA",
        (
            (cell_w * COLS + gutter * (COLS + 1)) * scale,
            (cell_h * ROWS + gutter * (ROWS + 1)) * scale,
        ),
        (20, 19, 25, 255),
    )
    for row in range(ROWS):
        for col in range(COLS):
            cell = image.crop((
                col * cell_w,
                row * cell_h,
                (col + 1) * cell_w,
                (row + 1) * cell_h,
            )).resize((cell_w * scale, cell_h * scale), Image.Resampling.NEAREST)
            canvas.alpha_composite(
                cell,
                ((gutter + col * (cell_w + gutter)) * scale,
                 (gutter + row * (cell_h + gutter)) * scale),
            )
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
    alpha_source.save(args.out_dir / f"44-third-pill-{args.version}-alpha.png", optimize=True)

    overlays = logical_sheet(raw)
    overlays.save(args.out_dir / f"44-third-pill-{args.version}-logical-overlays.png", optimize=True)
    composite = hero_composite(overlays, args.hero)
    composite.save(args.out_dir / f"44-third-pill-{args.version}-hero-preview.png", optimize=True)
    contact_preview(composite).convert("RGB").save(
        args.out_dir / f"44-third-pill-{args.version}-hero-preview-12x.png",
        optimize=True,
    )


if __name__ == "__main__":
    main()
