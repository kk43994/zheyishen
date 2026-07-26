#!/usr/bin/env python3
"""Build the deterministic pixel projectile atlas used by the runtime.

Each frame is drawn on its final 28x28 grid. Object-shaped projectiles are
literal replacements for the base breath; tinting and mechanic trails remain
runtime compositing concerns.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


OUT_PNG = Path("src/assets/vfx/projectiles.png")
OUT_JSON = Path("src/assets/vfx/projectiles.json")
CELL = 28
COLS = 6
CLEAR = (0, 0, 0, 0)
INK = (42, 39, 47, 255)
EDGE = (151, 145, 139, 255)
MOON = (235, 229, 216, 255)
LIGHT = (255, 248, 225, 255)
PAPER = (225, 210, 185, 255)
RED = (181, 67, 78, 255)
BLUE = (126, 181, 190, 255)
ICE = (181, 221, 232, 255)
GOLD = (202, 160, 82, 255)
WOOD = (152, 112, 67, 255)
METAL = (199, 210, 214, 255)
GLASS = (164, 214, 226, 255)
PINK = (219, 139, 181, 255)
VIOLET = (165, 140, 191, 255)


NAMES = [
    "breath0", "breath1", "breath2", "breath3", "paper", "rain", "sound",
    "key", "bone", "tear", "cone", "echo", "slash", "razor",
    "marble", "ice", "serial", "typing", "card", "button", "workbook",
    "lens", "frame", "receipt", "link", "stamp", "pill", "photo",
    "stone", "laugh",
]


def sprite() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (CELL, CELL), CLEAR)
    return image, ImageDraw.Draw(image)


def breath(draw: ImageDraw.ImageDraw, level: int) -> None:
    if level == 0:
        draw.polygon([(5, 14), (8, 10), (13, 9), (18, 11), (21, 14), (18, 18), (11, 19), (6, 17)], fill=EDGE)
        draw.polygon([(8, 14), (11, 11), (17, 12), (19, 14), (16, 17), (10, 17)], fill=MOON)
        draw.point((4, 17), fill=EDGE); draw.point((7, 8), fill=MOON)
    else:
        radius = 5 + level
        draw.ellipse((14-radius, 14-radius+1, 14+radius, 14+radius-1), fill=EDGE)
        draw.ellipse((10, 10, 19 + level, 18), fill=MOON)
        if level >= 2: draw.rectangle((15, 12, 20, 16), fill=LIGHT)
        if level == 3: draw.rectangle((7, 12, 10, 16), fill=MOON)


def draw_form(name: str) -> Image.Image:
    image, d = sprite()
    if name.startswith("breath"):
        breath(d, int(name[-1])); return image
    if name == "paper":
        # A folded paper trajectory, not the whole love letter flying as an icon.
        d.polygon([(2, 11), (18, 6), (26, 10), (18, 14), (25, 17), (7, 20)], fill=INK)
        d.polygon([(5, 12), (18, 8), (23, 10), (15, 13), (22, 17), (8, 18)], fill=PAPER)
        d.line((6, 13, 15, 13, 22, 10), fill=LIGHT, width=2)
        d.line((8, 18, 15, 13, 21, 17), fill=EDGE, width=1)
    elif name in {"rain", "tear"}:
        color = BLUE if name == "rain" else GLASS
        d.polygon([(14, 3), (20, 14), (19, 20), (15, 24), (10, 22), (7, 17), (9, 11)], fill=INK)
        d.polygon([(14, 6), (18, 14), (17, 19), (14, 21), (10, 18), (11, 12)], fill=color)
        d.rectangle((12, 11, 14, 15), fill=LIGHT)
    elif name == "sound":
        for inset, color in [(3, BLUE), (7, MOON), (11, BLUE)]:
            d.arc((inset, inset, 27-inset, 27-inset), 210, 510, fill=color, width=2)
    elif name == "key":
        d.ellipse((3, 7, 13, 17), fill=INK); d.ellipse((5, 9, 11, 15), fill=GOLD)
        d.rectangle((11, 11, 24, 14), fill=INK); d.rectangle((12, 12, 23, 13), fill=GOLD)
        d.rectangle((20, 14, 23, 19), fill=INK); d.rectangle((17, 14, 19, 17), fill=GOLD)
    elif name == "bone":
        d.line((4, 14, 24, 14), fill=INK, width=7); d.line((5, 14, 23, 14), fill=MOON, width=4)
        for x in (5, 23):
            d.ellipse((x-3, 8, x+2, 13), fill=MOON); d.ellipse((x-3, 15, x+2, 20), fill=MOON)
        d.line((10, 11, 10, 17), fill=EDGE); d.line((15, 11, 15, 17), fill=EDGE); d.line((20, 11, 20, 17), fill=EDGE)
    elif name == "cone":
        d.polygon([(3, 8), (24, 14), (3, 21)], fill=EDGE)
        d.polygon([(5, 11), (21, 14), (5, 18)], fill=MOON)
        d.rectangle((7, 13, 14, 15), fill=LIGHT)
    elif name == "echo":
        for off, alpha in [(0, MOON), (4, EDGE), (8, (110, 130, 150, 255))]:
            d.arc((3+off, 7, 17+off, 21), 250, 470, fill=alpha, width=2)
    elif name == "slash":
        # The sword does not fly. It compresses the breath into a broad,
        # blunt close-range crescent. It has no blade, hilt, or sword silhouette.
        outer = [(2, 4), (10, 4), (19, 7), (26, 11), (27, 16), (23, 20),
                 (14, 24), (4, 25), (1, 22), (8, 19), (15, 15), (15, 13),
                 (9, 9), (2, 7)]
        inner = [(4, 7), (10, 7), (18, 10), (23, 13), (23, 16), (18, 18),
                 (11, 21), (5, 22), (10, 18), (18, 14), (10, 10)]
        d.polygon(outer, fill=INK)
        d.polygon(inner, fill=MOON)
        d.line((5, 7, 12, 8, 20, 12, 23, 14), fill=LIGHT, width=3)
        d.line((5, 22, 12, 20, 20, 17, 23, 15), fill=WOOD, width=3)
        d.rectangle((2, 12, 4, 14), fill=WOOD)
    elif name == "razor":
        d.polygon([(3, 13), (22, 7), (25, 10), (7, 17)], fill=INK)
        d.polygon([(6, 13), (22, 9), (23, 10), (7, 15)], fill=METAL)
        d.line((5, 17, 22, 12), fill=LIGHT)
    elif name == "marble":
        d.ellipse((5, 5, 23, 23), fill=INK); d.ellipse((7, 7, 21, 21), fill=GLASS)
        d.arc((9, 9, 20, 20), 180, 430, fill=VIOLET, width=3); d.rectangle((10, 8, 13, 11), fill=LIGHT)
    elif name == "ice":
        # The freezer adds a square frost rim around the breath; it is not an ice gem.
        d.rectangle((4, 6, 23, 21), outline=INK, width=3)
        d.rectangle((7, 9, 20, 18), outline=ICE, width=2)
        d.ellipse((8, 10, 21, 18), fill=MOON)
        d.rectangle((12, 11, 18, 14), fill=LIGHT)
        for x, y in [(3, 5), (22, 5), (3, 20), (22, 20)]:
            d.rectangle((x, y, x + 3, y + 3), fill=BLUE)
    elif name == "serial":
        d.rectangle((3, 8, 24, 20), fill=INK); d.rectangle((5, 10, 22, 18), fill=EDGE)
        for x in range(6, 22, 3): d.line((x, 11, x, 17), fill=MOON, width=1)
    elif name == "typing":
        d.rounded_rectangle((2, 7, 25, 21), radius=3, fill=INK)
        d.polygon([(7, 20), (10, 24), (12, 20)], fill=INK)
        for x in (8, 14, 20): d.ellipse((x-2, 12, x+1, 15), fill=MOON)
    elif name == "card":
        d.polygon([(5, 5), (22, 8), (20, 23), (3, 20)], fill=INK)
        d.polygon([(7, 7), (20, 9), (18, 20), (5, 18)], fill=VIOLET)
        d.rectangle((8, 10, 17, 12), fill=MOON); d.rectangle((8, 14, 14, 16), fill=EDGE)
    elif name == "button":
        d.ellipse((5, 5, 23, 23), fill=INK); d.ellipse((7, 7, 21, 21), fill=PAPER)
        for x in (11, 16):
            for y in (11, 16): d.rectangle((x, y, x+1, y+1), fill=INK)
    elif name == "workbook":
        d.polygon([(5, 5), (22, 7), (21, 23), (4, 21)], fill=INK)
        d.polygon([(7, 7), (20, 9), (19, 20), (6, 19)], fill=PAPER)
        d.line((9, 10, 17, 18), fill=RED, width=2); d.line((17, 10, 9, 18), fill=RED, width=2)
    elif name == "lens":
        # A refracted, narrowed breath. No spectacle lens or temple arm flies out.
        d.polygon([(2, 12), (20, 7), (26, 10), (19, 13), (25, 16), (5, 18)], fill=INK)
        d.polygon([(5, 13), (19, 9), (23, 10), (16, 13), (22, 15), (7, 16)], fill=MOON)
        d.line((6, 11, 17, 8, 24, 10), fill=GLASS, width=2)
        d.line((8, 18, 18, 15, 24, 16), fill=BLUE, width=2)
        d.rectangle((16, 11, 19, 13), fill=LIGHT)
    elif name == "frame":
        d.rectangle((4, 5, 23, 22), fill=INK); d.rectangle((7, 8, 20, 19), fill=GOLD)
        d.rectangle((9, 10, 18, 17), fill=CLEAR)
    elif name == "receipt":
        d.rectangle((6, 3, 21, 24), fill=INK); d.rectangle((8, 5, 19, 22), fill=PAPER)
        d.line((10, 10, 12, 13, 17, 8), fill=BLUE, width=2); d.line((10, 16, 17, 16), fill=EDGE)
    elif name == "link":
        d.ellipse((3, 8, 15, 19), outline=RED, width=4); d.ellipse((13, 8, 25, 19), outline=GOLD, width=4)
        d.line((10, 14, 18, 14), fill=LIGHT, width=2)
    elif name == "stamp":
        d.rectangle((4, 5, 23, 22), fill=INK); d.rectangle((6, 7, 21, 20), outline=RED, width=2)
        d.line((8, 10, 19, 17), fill=RED, width=2); d.line((19, 10, 8, 17), fill=RED, width=2)
    elif name == "pill":
        d.rounded_rectangle((3, 8, 24, 19), radius=6, fill=INK)
        d.rounded_rectangle((5, 10, 22, 17), radius=4, fill=PINK); d.rectangle((13, 10, 15, 17), fill=MOON)
    elif name == "photo":
        d.rectangle((3, 5, 24, 22), fill=INK); d.rectangle((5, 7, 22, 20), fill=PAPER)
        d.ellipse((8, 9, 13, 14), fill=EDGE); d.rectangle((15, 9, 19, 15), outline=RED)
        d.polygon([(7, 18), (12, 14), (16, 18)], fill=MOON)
    elif name == "stone":
        # Weight compresses the breath and shakes loose stone chips; no boulder projectile.
        d.polygon([(3, 12), (8, 8), (20, 8), (25, 12), (23, 18), (17, 21), (7, 19), (3, 16)], fill=INK)
        d.polygon([(6, 13), (10, 10), (19, 10), (22, 13), (20, 17), (15, 18), (8, 17)], fill=EDGE)
        d.ellipse((9, 11, 21, 17), fill=MOON)
        d.rectangle((14, 12, 19, 14), fill=LIGHT)
        d.rectangle((3, 21, 6, 23), fill=WOOD)
        d.rectangle((9, 23, 11, 25), fill=EDGE)
    elif name == "laugh":
        # One of the five restrained exhalations: no face and no baked text.
        d.polygon([(3, 14), (7, 10), (12, 10), (15, 7), (21, 9), (24, 13),
                   (22, 18), (17, 20), (10, 19), (6, 17)], fill=INK)
        d.polygon([(6, 14), (9, 12), (13, 13), (16, 10), (20, 11), (22, 14),
                   (19, 17), (13, 18), (8, 16)], fill=MOON)
        d.rectangle((14, 11, 19, 13), fill=LIGHT)
        d.rectangle((2, 17, 5, 18), fill=EDGE)
    return image


def main() -> None:
    rows = (len(NAMES) + COLS - 1) // COLS
    atlas = Image.new("RGBA", (COLS * CELL, rows * CELL), CLEAR)
    for index, name in enumerate(NAMES):
        atlas.alpha_composite(draw_form(name), ((index % COLS) * CELL, (index // COLS) * CELL))
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT_PNG, optimize=True)
    OUT_JSON.write_text(json.dumps({
        "cell": CELL,
        "cols": COLS,
        "rows": rows,
        "index": {name: index for index, name in enumerate(NAMES)},
        "generator": "scripts/build_projectile_atlas_v2.py",
    }, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
