#!/usr/bin/env python3
"""Create a visible 2x2 guide for four-direction Image2 hero style gates."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 1024
CELL_SIZE = 512
FRAME_W = 240
FRAME_H = 336
FRAME_TOP = 70
ROOT_LOCAL_Y = 294

KEY = (0, 255, 0, 255)
GRID = (255, 0, 220, 255)
SAFE = (0, 195, 255, 255)
ROOT = (255, 245, 160, 255)


def dashed_line(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    color: tuple[int, int, int, int],
    width: int = 5,
    dash: int = 16,
) -> None:
    x1, y1 = start
    x2, y2 = end
    length = max(abs(x2 - x1), abs(y2 - y1))
    if length <= 0:
        return
    for offset in range(0, length, dash * 2):
        stop = min(length, offset + dash)
        sx = round(x1 + (x2 - x1) * offset / length)
        sy = round(y1 + (y2 - y1) * offset / length)
        ex = round(x1 + (x2 - x1) * stop / length)
        ey = round(y1 + (y2 - y1) * stop / length)
        draw.line((sx, sy, ex, ey), fill=color, width=width)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    output = Path(args.out)
    if output.exists() and not args.force:
        raise SystemExit(f"refusing to overwrite {output}; pass --force")

    image = Image.new("RGBA", (SIZE, SIZE), KEY)
    draw = ImageDraw.Draw(image)
    draw.line((CELL_SIZE, 0, CELL_SIZE, SIZE), fill=GRID, width=8)
    draw.line((0, CELL_SIZE, SIZE, CELL_SIZE), fill=GRID, width=8)

    for row in range(2):
        for column in range(2):
            cell_left = column * CELL_SIZE
            cell_top = row * CELL_SIZE
            center_x = cell_left + CELL_SIZE // 2
            frame_top = cell_top + FRAME_TOP
            frame_bottom = frame_top + FRAME_H
            frame_left = center_x - FRAME_W // 2
            frame_right = center_x + FRAME_W // 2
            dashed_line(draw, (frame_left, frame_top), (frame_right, frame_top), SAFE)
            dashed_line(draw, (frame_right, frame_top), (frame_right, frame_bottom), SAFE)
            dashed_line(draw, (frame_right, frame_bottom), (frame_left, frame_bottom), SAFE)
            dashed_line(draw, (frame_left, frame_bottom), (frame_left, frame_top), SAFE)

            root_y = frame_top + ROOT_LOCAL_Y
            draw.line((center_x - 19, root_y, center_x + 19, root_y), fill=ROOT, width=5)
            draw.line((center_x, root_y - 12, center_x, root_y + 12), fill=ROOT, width=5)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output, optimize=True)
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
