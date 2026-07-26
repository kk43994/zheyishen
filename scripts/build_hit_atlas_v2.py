#!/usr/bin/env python3
"""Build deterministic four-frame pixel impact reactions by material."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


OUT_PNG = Path("src/assets/vfx/hits.png")
OUT_JSON = Path("src/assets/vfx/hits.json")
CELL = 32
COLS = 4
MATERIALS = [
    "mist", "water", "crit", "paper", "wood", "stone",
    "metal", "ice", "signal", "key", "glass",
]
CLEAR = (0, 0, 0, 0)
INK = (42, 39, 47, 255)
MOON = (235, 229, 216, 255)
EDGE = (151, 145, 139, 255)
WATER = (126, 181, 190, 255)
PAPER = (225, 210, 185, 255)
WOOD = (152, 112, 67, 255)
STONE = (117, 108, 101, 255)
METAL = (199, 210, 214, 255)
ICE = (181, 221, 232, 255)
SIGNAL = (130, 197, 188, 255)
GOLD = (202, 160, 82, 255)
GLASS = (164, 214, 226, 255)
RED = (201, 77, 85, 255)


def frame(material: str, phase: int) -> Image.Image:
    image = Image.new("RGBA", (CELL, CELL), CLEAR)
    d = ImageDraw.Draw(image)
    radius = 4 + phase * 3
    if material == "mist":
        for index, (dx, dy) in enumerate(((-1, -1), (1, 0), (-2, 1), (2, -1))):
            size = max(1, 4 - phase + index % 2)
            x = 16 + dx * radius
            y = 16 + dy * radius // 2
            d.rectangle((x - size, y - size // 2, x + size, y + size // 2 + 1), fill=MOON if index < 2 else EDGE)
    elif material == "water":
        for index, angle in enumerate((-3, -1, 1, 3)):
            x = 16 + angle * radius // 4
            y = 17 - radius + abs(angle)
            d.line((16, 18, x, y), fill=WATER, width=2)
            d.rectangle((x - 1, y - 2, x + 1, y + 1), fill=GLASS if index % 2 else WATER)
        d.line((8 - phase, 20, 24 + phase, 20), fill=WATER, width=2)
    elif material == "crit":
        d.line((16 - radius, 16, 16 + radius, 16), fill=MOON, width=2)
        d.line((16, 16 - radius, 16, 16 + radius), fill=MOON, width=2)
        d.line((16 - radius // 2, 16 - radius // 2, 16 + radius // 2, 16 + radius // 2), fill=GOLD)
        d.rectangle((14, 14, 18, 18), fill=(255, 248, 225, 255))
    elif material == "paper":
        for index, dy in enumerate((-1, 0, 1)):
            x = 16 + (index - 1) * radius
            y = 16 + dy * radius
            d.polygon([(x - 3, y - 2), (x + 3, y - 1), (x + 1, y + 3), (x - 4, y + 1)], fill=PAPER)
            d.line((x - 3, y, x + 2, y + 1), fill=RED if index == 1 else EDGE)
    elif material == "wood":
        for index, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1), (0, -1))):
            x = 16 + dx * radius
            y = 16 + dy * radius
            d.line((16, 16, x + dx * 3, y + dy * (2 + index % 2)), fill=WOOD, width=2 if index < 2 else 1)
            d.rectangle((x - 1, y - 1, x + 1, y), fill=MOON if index == 4 else WOOD)
    elif material == "stone":
        for index, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
            x = 16 + dx * radius
            y = 16 + dy * radius
            d.polygon([(x - 3, y), (x - 1, y - 3), (x + 3, y - 1), (x + 2, y + 3), (x - 2, y + 2)], fill=INK)
            d.polygon([(x - 1, y - 1), (x + 2, y), (x, y + 2)], fill=STONE if index else EDGE)
    elif material == "metal":
        for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            d.line((16 + dx * 2, 16 + dy * 2, 16 + dx * radius, 16 + dy * radius), fill=METAL, width=2)
            d.point((16 + dx * (radius + 2), 16 + dy * (radius + 2)), fill=MOON)
        d.rectangle((14, 15, 18, 17), fill=GOLD)
    elif material == "ice":
        for index, (dx, dy) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0))):
            x = 16 + dx * radius
            y = 16 + dy * radius
            d.polygon([(x, y - 4), (x + 3, y), (x, y + 4), (x - 2, y)], fill=ICE if index % 2 else GLASS)
            d.line((16, 16, x, y), fill=MOON)
    elif material == "signal":
        for inset in (0, 4, 8):
            box_radius = radius + inset
            d.arc((16 - box_radius, 16 - box_radius, 16 + box_radius, 16 + box_radius), 205, 335, fill=SIGNAL, width=2)
        d.rectangle((14, 14, 18, 18), fill=MOON)
    elif material == "key":
        d.ellipse((16 - radius, 16 - radius, 16 + radius, 16 + radius), outline=GOLD, width=2)
        d.rectangle((14, 13, 18, 17), fill=INK)
        d.rectangle((15, 17, 17, 23 + phase), fill=GOLD)
        d.line((9 - phase, 12, 5, 9), fill=GOLD, width=2)
        d.line((23 + phase, 12, 27, 9), fill=GOLD, width=2)
    elif material == "glass":
        for index, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1), (0, -1))):
            x = 16 + dx * radius
            y = 16 + dy * radius
            d.polygon([(x, y - 4), (x + 3 + index % 2, y + 2), (x - 2, y + 3)], fill=GLASS)
            d.line((16, 16, x, y), fill=MOON)
    return image


def main() -> None:
    atlas = Image.new("RGBA", (COLS * CELL, len(MATERIALS) * CELL), CLEAR)
    for row, material in enumerate(MATERIALS):
        for phase in range(4):
            atlas.alpha_composite(frame(material, phase), (phase * CELL, row * CELL))
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT_PNG, optimize=True)
    OUT_JSON.write_text(json.dumps({
        "cell": CELL,
        "cols": COLS,
        "rows": len(MATERIALS),
        "materials": MATERIALS,
        "generator": "scripts/build_hit_atlas_v2.py",
    }, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
