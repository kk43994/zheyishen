#!/usr/bin/env python3
"""Repeat a selected logical sprite over a visible 4x4 animation guide."""

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
    for offset in range(0, length, dash * 2):
        stop = min(length, offset + dash)
        sx = round(x1 + (x2 - x1) * offset / length)
        sy = round(y1 + (y2 - y1) * offset / length)
        ex = round(x1 + (x2 - x1) * stop / length)
        ey = round(y1 + (y2 - y1) * stop / length)
        draw.line((sx, sy, ex, ey), fill=fill, width=width)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sprite", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    out_path = Path(args.out)
    if out_path.exists() and not args.force:
        raise SystemExit(f"refusing to overwrite {out_path}; pass --force")

    sprite = Image.open(args.sprite).convert("RGBA")
    bbox = sprite.getchannel("A").getbbox()
    if bbox is None:
        raise SystemExit("selected sprite is empty")
    scale = 4
    enlarged = sprite.resize((sprite.width * scale, sprite.height * scale), Image.Resampling.NEAREST)
    enlarged_bbox = tuple(value * scale for value in bbox)

    guide = Image.new("RGBA", (SIZE, SIZE), KEY)
    draw = ImageDraw.Draw(guide)
    for boundary in range(CELL, SIZE, CELL):
        draw.line((boundary, 0, boundary, SIZE), fill=GRID_COLOR, width=5)
        draw.line((0, boundary, SIZE, boundary), fill=GRID_COLOR, width=5)

    for row in range(GRID):
        for column in range(GRID):
            cell_x = column * CELL
            cell_y = row * CELL
            safe_left = cell_x + 43
            safe_top = cell_y + 11
            safe_right = cell_x + 213
            safe_bottom = cell_y + 245
            dashed_line(draw, (safe_left, safe_top), (safe_right, safe_top), SAFE_COLOR)
            dashed_line(draw, (safe_right, safe_top), (safe_right, safe_bottom), SAFE_COLOR)
            dashed_line(draw, (safe_right, safe_bottom), (safe_left, safe_bottom), SAFE_COLOR)
            dashed_line(draw, (safe_left, safe_bottom), (safe_left, safe_top), SAFE_COLOR)
            root_x = cell_x + 128
            root_y = cell_y + 212
            draw.line((root_x - 12, root_y + 6, root_x + 12, root_y + 6), fill=ANCHOR_COLOR, width=3)
            draw.line((root_x, root_y + 1, root_x, root_y + 14), fill=ANCHOR_COLOR, width=3)
            sprite_center_x = (enlarged_bbox[0] + enlarged_bbox[2]) // 2
            paste_x = root_x - sprite_center_x
            paste_y = root_y - enlarged_bbox[3]
            guide.alpha_composite(enlarged, (paste_x, paste_y))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    guide.convert("RGB").save(out_path, quality=96)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
