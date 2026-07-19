#!/usr/bin/env python3
"""Place a generated board over visible registration guides for an Image2 edit pass."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


GRID = 4
CELL = 256
SIZE = GRID * CELL
KEY = (0, 255, 0, 255)
GRID_COLOR = (255, 0, 220, 255)
SAFE_COLOR = (0, 195, 255, 255)
ANCHOR_COLOR = (255, 245, 160, 255)


def chroma_key(image: Image.Image) -> Image.Image:
    pixels = []
    for red, green, blue, alpha in image.getdata():
        keyed = alpha > 0 and green > 64 and green > red * 1.35 and green > blue * 1.22
        pixels.append((red, green, blue, 0 if keyed else alpha))
    image.putdata(pixels)
    return image


def dashed_line(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    fill: tuple[int, int, int, int],
    width: int = 3,
    dash: int = 12,
) -> None:
    x1, y1 = start
    x2, y2 = end
    length = max(abs(x2 - x1), abs(y2 - y1))
    if not length:
        return
    for offset in range(0, length, dash * 2):
        stop = min(length, offset + dash)
        sx = round(x1 + (x2 - x1) * offset / length)
        sy = round(y1 + (y2 - y1) * offset / length)
        ex = round(x1 + (x2 - x1) * stop / length)
        ey = round(y1 + (y2 - y1) * stop / length)
        draw.line((sx, sy, ex, ey), fill=fill, width=width)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--kind", choices=("item", "hero", "enemy", "pedestal"), required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    out_path = Path(args.out)
    if out_path.exists() and not args.force:
        raise SystemExit(f"refusing to overwrite {out_path}; pass --force")

    source = Image.open(args.input).convert("RGBA").resize((SIZE, SIZE), Image.Resampling.NEAREST)
    source = chroma_key(source)
    guide = Image.new("RGBA", (SIZE, SIZE), KEY)
    draw = ImageDraw.Draw(guide)

    for boundary in range(CELL, SIZE, CELL):
        draw.line((boundary, 0, boundary, SIZE), fill=GRID_COLOR, width=5)
        draw.line((0, boundary, SIZE, boundary), fill=GRID_COLOR, width=5)

    safe = (48, 16, 208, 240) if args.kind == "hero" else (48, 48, 208, 208)
    for row in range(GRID):
        for column in range(GRID):
            cell_x = column * CELL
            cell_y = row * CELL
            left = cell_x + safe[0] - 5
            top = cell_y + safe[1] - 5
            right = cell_x + safe[2] + 4
            bottom = cell_y + safe[3] + 4
            dashed_line(draw, (left, top), (right, top), SAFE_COLOR)
            dashed_line(draw, (right, top), (right, bottom), SAFE_COLOR)
            dashed_line(draw, (right, bottom), (left, bottom), SAFE_COLOR)
            dashed_line(draw, (left, bottom), (left, top), SAFE_COLOR)

            if args.kind in ("hero", "enemy", "pedestal"):
                root_y = cell_y + (212 if args.kind == "hero" else 208)
                root_x = cell_x + 128
                draw.line((root_x - 12, root_y + 5, root_x + 12, root_y + 5), fill=ANCHOR_COLOR, width=3)
                draw.line((root_x, root_y + 1, root_x, root_y + 12), fill=ANCHOR_COLOR, width=3)

    guide.alpha_composite(source)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    guide.convert("RGB").save(out_path, quality=96)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
