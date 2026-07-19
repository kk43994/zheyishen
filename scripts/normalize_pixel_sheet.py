#!/usr/bin/env python3
"""Normalize a generated 4x4 style board into deterministic sprite cells."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


GRID = 4
CELL = 256
LOGICAL_MAX = 40
PIXEL_SCALE = 4


def strip_green_spill(image: Image.Image) -> Image.Image:
    cleaned = []
    for red, green, blue, alpha in image.getdata():
        is_key_spill = alpha > 0 and green > 16 and green > red * 1.45 and green > blue * 1.3
        cleaned.append((red, green, blue, 0 if is_key_spill else alpha))
    image.putdata(cleaned)
    return image


def normalize_cell(cell: Image.Image, palette_size: int) -> tuple[Image.Image, dict[str, int]]:
    alpha = cell.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 16 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty cell after chroma-key removal")

    sprite = cell.crop(bbox)
    width, height = sprite.size
    ratio = min(LOGICAL_MAX / width, LOGICAL_MAX / height)
    logical_width = max(1, round(width * ratio))
    logical_height = max(1, round(height * ratio))
    logical = sprite.resize((logical_width, logical_height), Image.Resampling.NEAREST)
    logical = logical.quantize(
        colors=palette_size,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    ).convert("RGBA")
    enlarged = logical.resize(
        (logical_width * PIXEL_SCALE, logical_height * PIXEL_SCALE),
        Image.Resampling.NEAREST,
    )
    return enlarged, {
        "source_x": bbox[0],
        "source_y": bbox[1],
        "source_w": bbox[2] - bbox[0],
        "source_h": bbox[3] - bbox[1],
        "logical_w": logical_width,
        "logical_h": logical_height,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview")
    parser.add_argument("--palette", type=int, default=16)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    source_path = Path(args.input)
    out_path = Path(args.out)
    preview_path = Path(args.preview) if args.preview else None
    for path in (out_path, preview_path):
        if path and path.exists() and not args.force:
            raise SystemExit(f"refusing to overwrite {path}; pass --force")

    source = Image.open(source_path).convert("RGBA")
    if source.width != source.height:
        raise SystemExit(f"expected square source, got {source.size[0]}x{source.size[1]}")
    if source.size != (GRID * CELL, GRID * CELL):
        source = source.resize((GRID * CELL, GRID * CELL), Image.Resampling.NEAREST)
    source = strip_green_spill(source)

    sheet = Image.new("RGBA", source.size, (0, 0, 0, 0))
    manifest: list[dict[str, int]] = []
    for row in range(GRID):
        for column in range(GRID):
            left = column * CELL
            top = row * CELL
            cell = source.crop((left, top, left + CELL, top + CELL))
            sprite, info = normalize_cell(cell, args.palette)
            x = left + ((CELL - sprite.width) // (2 * PIXEL_SCALE)) * PIXEL_SCALE
            y = top + ((CELL - sprite.height) // (2 * PIXEL_SCALE)) * PIXEL_SCALE
            sheet.alpha_composite(sprite, (x, y))
            manifest.append({
                "index": row * GRID + column,
                "column": column,
                "row": row,
                "cell_x": left,
                "cell_y": top,
                "anchor_x": left + CELL // 2,
                "anchor_y": top + CELL // 2,
                "placed_x": x,
                "placed_y": y,
                "placed_w": sprite.width,
                "placed_h": sprite.height,
                **info,
            })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)

    if preview_path:
        preview = Image.new("RGBA", sheet.size, (19, 18, 24, 255))
        preview.alpha_composite(sheet)
        draw = ImageDraw.Draw(preview)
        for offset in range(CELL, GRID * CELL, CELL):
            draw.line((offset, 0, offset, GRID * CELL), fill=(62, 52, 64, 255), width=1)
            draw.line((0, offset, GRID * CELL, offset), fill=(62, 52, 64, 255), width=1)
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        preview.convert("RGB").save(preview_path, quality=95)

    manifest_path = out_path.with_suffix(".json")
    manifest_path.write_text(json.dumps({"cell": CELL, "grid": GRID, "sprites": manifest}, indent=2), encoding="utf-8")
    print(f"wrote {out_path}")
    if preview_path:
        print(f"wrote {preview_path}")
    print(f"wrote {manifest_path}")


if __name__ == "__main__":
    main()
