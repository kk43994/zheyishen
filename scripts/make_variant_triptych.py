#!/usr/bin/env python3
"""Create a visible three-column guide for per-asset 1/2/3 review passes."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 1024
BOUNDARIES = (0, 341, 683, 1024)
KEY = (0, 255, 0, 255)
GRID_COLOR = (255, 0, 220, 255)
SAFE_COLOR = (0, 195, 255, 255)
ANCHOR_COLOR = (255, 245, 160, 255)


def dashed_line(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    fill: tuple[int, int, int, int],
    width: int = 4,
    dash: int = 16,
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
    parser.add_argument("--out", required=True)
    parser.add_argument("--kind", choices=("hero", "item", "enemy"), required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    out_path = Path(args.out)
    if out_path.exists() and not args.force:
        raise SystemExit(f"refusing to overwrite {out_path}; pass --force")

    image = Image.new("RGBA", (SIZE, SIZE), KEY)
    draw = ImageDraw.Draw(image)
    for boundary in BOUNDARIES[1:-1]:
        draw.line((boundary, 0, boundary, SIZE), fill=GRID_COLOR, width=7)

    if args.kind == "hero":
        safe_top, safe_bottom, half_width, root_y = 220, 744, 118, 720
    elif args.kind == "enemy":
        safe_top, safe_bottom, half_width, root_y = 270, 744, 118, 720
    else:
        safe_top, safe_bottom, half_width, root_y = 340, 684, 118, 512

    for left, right in zip(BOUNDARIES[:-1], BOUNDARIES[1:]):
        center_x = (left + right) // 2
        box_left = center_x - half_width
        box_right = center_x + half_width
        dashed_line(draw, (box_left, safe_top), (box_right, safe_top), SAFE_COLOR)
        dashed_line(draw, (box_right, safe_top), (box_right, safe_bottom), SAFE_COLOR)
        dashed_line(draw, (box_right, safe_bottom), (box_left, safe_bottom), SAFE_COLOR)
        dashed_line(draw, (box_left, safe_bottom), (box_left, safe_top), SAFE_COLOR)
        if args.kind != "item":
            draw.line((center_x - 16, root_y + 6, center_x + 16, root_y + 6), fill=ANCHOR_COLOR, width=4)
            draw.line((center_x, root_y, center_x, root_y + 18), fill=ANCHOR_COLOR, width=4)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(out_path, quality=95)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
