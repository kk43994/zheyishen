#!/usr/bin/env python3
"""Build review-only native-pixel breath, VFX, and UI resources.

The output is deliberately detached from runtime code. All shapes are drawn on
their final logical grids with integer coordinates, binary alpha, and a shared
palette. The enlarged approval image contains labels; the transparent atlas
contains no text or guides.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-breath-vfx-ui-static-v1")
ATLAS_PATH = OUTPUT_DIR / "breath-vfx-ui-transparent-atlas.png"
APPROVAL_PATH = OUTPUT_DIR / "breath-vfx-ui-approval.png"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
TYPES_PATH = Path("src/types.ts")
ORIGINS_PATH = Path("src/origins.ts")
GAME_PATH = Path("src/game.ts")
WIKI_PATH = Path("docs/这一身百科.html")

ATLAS_SIZE = (416, 208)
CLEAR = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
DEEP = (38, 35, 43, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
MOON = (232, 225, 211, 255)
MOON_EDGE = (170, 161, 150, 255)
PAPER = (226, 211, 189, 255)
PAPER_DARK = (129, 118, 109, 255)
RED = (183, 68, 80, 255)
RED_DARK = (132, 56, 66, 255)
WATER = (130, 180, 187, 255)
WATER_DARK = (96, 151, 160, 255)
BONE = (216, 208, 187, 255)
SIGNAL = (130, 197, 188, 255)
SIGNAL_DARK = (94, 159, 152, 255)
METAL = (215, 223, 224, 255)
METAL_DARK = (127, 137, 144, 255)
GOLD = (209, 171, 95, 255)
GOLD_DARK = (143, 122, 73, 255)
PINK = (232, 154, 200, 255)
VIOLET = (185, 168, 214, 255)
GREEN = (143, 192, 165, 255)

PALETTE = {
    "ink": INK, "deep": DEEP, "coal": COAL, "worn": WORN,
    "moon": MOON, "moon-edge": MOON_EDGE,
    "paper": PAPER, "paper-dark": PAPER_DARK,
    "red": RED, "red-dark": RED_DARK,
    "water": WATER, "water-dark": WATER_DARK,
    "bone": BONE,
    "signal": SIGNAL, "signal-dark": SIGNAL_DARK,
    "metal": METAL, "metal-dark": METAL_DARK,
    "gold": GOLD, "gold-dark": GOLD_DARK,
    "pink": PINK, "violet": VIOLET, "green": GREEN,
}
COLOR_NAME = {color: name for name, color in PALETTE.items()}

MATERIALS = ("breath", "paper", "water", "bone", "signal", "metal")
MASK_MATERIALS = MATERIALS[1:]
PHASES = ("seed", "stretch", "charged", "fray")
POISONS = ("greed", "anger", "delusion", "pride", "doubt")
ORIGIN_TRAITS = (
    "long_breath", "quick_breath", "sharp_eyes", "heavy_hands",
    "lucky_pocket", "someone_left_food", "light_sleeper", "weak_lungs",
    "bad_eyesight", "empty_pockets", "too_sensible", "soft_hearted",
)
STAT_ICONS = (
    "hp", "shield", "coins", "damage", "fire_rate", "range", "width",
    "pierce", "homing", "returning", "critical",
)
STATUS_ICONS = (
    "slowed", "stunned", "projectile_freeze", "delayed_pain", "raincoat_guard",
    "grace", "bill_due", "distortion", "haste", "taunt",
)
ICON_GROUPS = (
    ("poison", POISONS),
    ("origin", ORIGIN_TRAITS),
    ("stat", STAT_ICONS),
    ("status", STATUS_ICONS),
)
STATUS_FIELDS = {
    "slowed": ["heroSlowTimer"],
    "stunned": ["stunTimer"],
    "projectile_freeze": ["watchFreeze"],
    "delayed_pain": ["painlessTimer", "painlessDamage"],
    "raincoat_guard": ["raincoatReady"],
    "grace": ["graceTimer"],
    "bill_due": ["billTimer"],
    "distortion": ["odBoost", "pillTimer"],
    "haste": ["sockBoostTimer", "oneMoreBuff"],
    "taunt": ["tauntTimer"],
}


def blank(width: int, height: int) -> Image.Image:
    return Image.new("RGBA", (width, height), CLEAR)


def draw_seed(draw: ImageDraw.ImageDraw, state: int, color=MOON, edge=MOON_EDGE) -> None:
    if state == 0:
        draw.polygon([(4, 7), (6, 4), (10, 4), (13, 7), (11, 10), (7, 11), (4, 9)], fill=edge)
        draw.polygon([(6, 6), (10, 5), (12, 7), (10, 9), (7, 9), (5, 8)], fill=color)
    elif state == 1:
        draw.polygon([(2, 7), (5, 5), (11, 5), (14, 7), (12, 10), (5, 10), (2, 9)], fill=edge)
        draw.polygon([(4, 7), (7, 6), (12, 6), (13, 8), (10, 9), (5, 9)], fill=color)
    elif state == 2:
        draw.rectangle((4, 5, 11, 10), fill=edge)
        draw.rectangle((6, 6, 10, 9), fill=color)
        draw.point((3, 7), fill=color); draw.point((12, 8), fill=color)
    else:
        draw.polygon([(3, 7), (6, 5), (10, 5), (12, 7), (10, 9), (6, 10), (3, 9)], fill=edge)
        draw.rectangle((6, 6, 9, 8), fill=color)
        draw.point((12, 5), fill=color); draw.point((13, 9), fill=edge); draw.point((2, 10), fill=edge)


def core_sprite(state: int) -> Image.Image:
    image = blank(16, 16); draw_seed(ImageDraw.Draw(image), state); return image


def material_mask(material: str, state: int) -> Image.Image:
    image = blank(16, 16); draw = ImageDraw.Draw(image)
    shift = (0, 1, 0, -1)[state]
    if material == "paper":
        draw.polygon([(2, 5 + shift), (12, 4 + shift), (14, 8 + shift), (11, 12 + shift), (3, 11 + shift)], fill=PAPER_DARK)
        draw.polygon([(3, 6 + shift), (11, 5 + shift), (13, 8 + shift), (10, 11 + shift), (4, 10 + shift)], fill=PAPER)
        draw.line((3, 6 + shift, 8, 9 + shift, 12, 5 + shift), fill=PAPER_DARK)
        draw.rectangle((6, 6 + shift, 10, 9 + shift), fill=CLEAR)
        if state == 3: draw.point((14, 11), fill=PAPER); draw.point((2, 3), fill=PAPER_DARK)
    elif material == "water":
        draw.polygon([(8, 2 + shift), (13, 8 + shift), (11, 12 + shift), (8, 14 + shift), (4, 12 + shift), (3, 8 + shift)], fill=WATER_DARK)
        draw.polygon([(8, 4 + shift), (11, 8 + shift), (10, 11 + shift), (8, 12 + shift), (5, 10 + shift), (5, 8 + shift)], fill=WATER)
        draw.rectangle((6, 6 + shift, 10, 9 + shift), fill=CLEAR)
        draw.point((12, 4), fill=WATER); draw.point((3, 12), fill=WATER_DARK)
    elif material == "bone":
        segments = 2 + state
        for index in range(segments):
            x = 2 + index * 3
            draw.rectangle((x, 6, x + 2, 10), fill=INK)
            draw.rectangle((x, 7, x + 2, 9), fill=BONE)
            draw.point((x + 1, 5), fill=BONE); draw.point((x + 1, 11), fill=BONE)
        draw.rectangle((6, 7, 10, 9), fill=CLEAR)
        if state == 3: draw.point((13, 4), fill=BONE); draw.point((14, 11), fill=RED_DARK)
    elif material == "signal":
        radius = 3 + state
        draw.arc((8 - radius, 8 - radius, 8 + radius, 8 + radius), 210, 150, fill=SIGNAL_DARK, width=2)
        draw.arc((5 - state, 3 - state, 15 + state, 13 + state), 210, 150, fill=SIGNAL, width=1)
        draw.rectangle((6, 6, 10, 9), fill=CLEAR)
        draw.point((3, 8), fill=SIGNAL); draw.point((13, 8), fill=SIGNAL_DARK)
    elif material == "metal":
        draw.polygon([(1, 8), (5, 5 - state // 2), (14, 6), (12, 10 + state // 2), (5, 11)], fill=METAL_DARK)
        draw.polygon([(4, 7), (12, 7), (11, 9), (5, 10), (3, 9)], fill=METAL)
        draw.rectangle((6, 7, 10, 9), fill=CLEAR)
        draw.point((13, 4), fill=METAL); draw.point((14, 11), fill=METAL_DARK)
    else:
        raise AssertionError(material)
    return image


def trail_sprite(material: str) -> Image.Image:
    image = blank(32, 8); draw = ImageDraw.Draw(image)
    if material == "breath":
        draw.line((4, 4, 27, 4), fill=MOON_EDGE, width=2)
        for x in (2, 7, 13, 20, 27): draw.point((x, 3 + (x // 7) % 2), fill=MOON)
    elif material == "paper":
        draw.line((3, 4, 29, 4), fill=PAPER_DARK)
        for x, y in ((4, 2), (9, 5), (15, 1), (21, 5), (27, 2)):
            draw.polygon([(x - 2, y), (x + 2, y + 1), (x, y + 4)], fill=PAPER)
    elif material == "water":
        draw.line((4, 4, 29, 4), fill=WATER_DARK)
        for x, y in ((3, 2), (9, 5), (15, 2), (22, 4), (28, 1)):
            draw.point((x, y), fill=WATER); draw.point((x + 1, y + 1), fill=WATER)
    elif material == "bone":
        for x in range(2, 29, 5):
            draw.rectangle((x, 2, x + 3, 5), fill=INK); draw.rectangle((x + 1, 2, x + 2, 5), fill=BONE)
    elif material == "signal":
        points = [(1, 4), (5, 4), (7, 1), (10, 6), (13, 3), (17, 3), (20, 1), (23, 6), (26, 3), (30, 3)]
        draw.line(points, fill=SIGNAL, width=1); draw.point((16, 4), fill=SIGNAL_DARK)
    elif material == "metal":
        draw.line((3, 4, 29, 4), fill=METAL_DARK)
        for x, y in ((4, 2), (9, 5), (15, 1), (21, 5), (27, 2)):
            draw.line((x - 1, y, x + 1, 4), fill=METAL)
    else:
        raise AssertionError(material)
    return image


def impact_sprite(material: str, state: int) -> Image.Image:
    image = blank(32, 32); draw = ImageDraw.Draw(image)
    radius = (2, 5, 9, 13)[state]
    cx = cy = 16
    if material == "breath":
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=MOON_EDGE, width=2)
        if state < 2: draw.rectangle((14, 14, 18, 18), fill=MOON)
        for x, y in ((8, 13), (23, 11), (11, 23), (24, 22))[:state]: draw.point((x, y), fill=MOON)
    elif material == "paper":
        count = state + 2
        for index in range(count):
            angle = index % 4
            points = [((16, 6 - state), (19, 12), (15, 14)), ((26 + state, 16), (20, 19), (18, 15)), ((16, 26 + state), (13, 20), (17, 18)), ((6 - state, 16), (12, 13), (14, 17))][angle]
            draw.polygon(points, fill=PAPER if index % 2 else PAPER_DARK)
    elif material == "water":
        draw.arc((cx - radius, cy - radius, cx + radius, cy + radius), 190, 350, fill=WATER_DARK, width=2)
        for index in range(state + 2):
            x = 7 + index * 6; y = 12 - (index % 2) * 4
            draw.polygon([(x, y), (x + 2, y + 3), (x, y + 5), (x - 2, y + 3)], fill=WATER)
    elif material == "bone":
        for index, (dx, dy) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0), (1, 1), (-1, -1))[:state + 3]):
            x, y = cx + dx * (5 + state * 2), cy + dy * (5 + state * 2)
            draw.rectangle((x - 2, y - 1, x + 2, y + 1), fill=INK)
            draw.line((x - 1, y, x + 1, y), fill=BONE)
    elif material == "signal":
        for ring in range(1, state + 2):
            r = ring * 3
            draw.rectangle((cx - r, cy - r, cx + r, cy + r), outline=SIGNAL if ring % 2 else SIGNAL_DARK)
        draw.line((5, 16, 27, 16), fill=SIGNAL); draw.line((16, 5, 16, 27), fill=SIGNAL_DARK)
    elif material == "metal":
        for index, (dx, dy) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1))[:state + 4]):
            length = 4 + state * 2
            draw.line((cx + dx * 2, cy + dy * 2, cx + dx * length, cy + dy * length), fill=METAL if index % 2 else GOLD, width=1)
        draw.rectangle((14, 14, 18, 18), fill=METAL_DARK)
    else:
        raise AssertionError(material)
    return image


def big_vfx(kind: str, state: int) -> Image.Image:
    image = blank(48, 48); draw = ImageDraw.Draw(image); cx = cy = 24
    if kind == "explosion":
        if state == 0:
            draw.rectangle((21, 21, 27, 27), fill=GOLD); draw_cross(draw, cx, cy, 8, RED, 2)
        elif state == 1:
            draw.polygon([(24, 4), (29, 17), (43, 10), (34, 23), (45, 30), (31, 31), (35, 45), (23, 35), (12, 44), (15, 31), (2, 27), (15, 21), (8, 8), (20, 16)], fill=RED_DARK)
            draw.polygon([(24, 10), (29, 20), (38, 17), (32, 26), (37, 31), (28, 30), (24, 39), (20, 30), (10, 31), (17, 24), (12, 17), (21, 20)], fill=GOLD)
            draw.rectangle((21, 21, 27, 27), fill=MOON)
        elif state == 2:
            draw.ellipse((6, 6, 42, 42), outline=RED, width=3); draw.ellipse((13, 13, 35, 35), outline=GOLD, width=2)
            for x, y in ((3, 24), (45, 24), (24, 3), (24, 45), (8, 8), (40, 40)): draw.rectangle((x - 1, y - 1, x + 1, y + 1), fill=GOLD)
        else:
            for x, y, color in ((7, 10, RED_DARK), (15, 30, WORN), (25, 18, GOLD_DARK), (36, 34, RED), (41, 12, GOLD), (9, 41, COAL), (29, 43, WORN)):
                draw.rectangle((x - 1, y - 1, x + 1, y + 1), fill=color)
    elif kind == "key_door":
        if state == 0:
            draw.ellipse((8, 18, 18, 28), outline=GOLD, width=3); draw.line((18, 23, 36, 23, 36, 29), fill=GOLD, width=3)
            draw.line((31, 23, 31, 27), fill=GOLD_DARK, width=2)
        elif state == 1:
            draw.rectangle((13, 5, 35, 43), outline=GOLD_DARK, width=3); draw.rectangle((17, 9, 31, 42), outline=GOLD, width=2)
            draw.ellipse((25, 23, 29, 27), fill=GOLD); draw.line((27, 27, 27, 32), fill=GOLD)
        elif state == 2:
            draw.rectangle((9, 4, 35, 43), outline=GOLD_DARK, width=3); draw.polygon([(14, 8), (31, 12), (31, 40), (14, 43)], fill=DEEP, outline=GOLD)
            draw.polygon([(16, 10), (28, 13), (28, 37), (16, 40)], fill=MOON)
            draw.line((34, 7, 41, 4), fill=GOLD, width=2); draw.line((35, 39, 42, 44), fill=GOLD, width=2)
        else:
            draw.rectangle((10, 4, 35, 43), outline=GOLD_DARK, width=2); draw.rectangle((14, 8, 31, 40), outline=COAL, width=2)
            draw.line((17, 11, 28, 36), fill=WORN); draw.point((7, 43), fill=GOLD); draw.point((39, 6), fill=GOLD_DARK)
    else:
        raise AssertionError(kind)
    return image


def draw_cross(draw: ImageDraw.ImageDraw, cx: int, cy: int, size: int, color, width: int = 1) -> None:
    draw.line((cx - size, cy, cx + size, cy), fill=color, width=width)
    draw.line((cx, cy - size, cx, cy + size), fill=color, width=width)


def draw_heart(draw: ImageDraw.ImageDraw, color=RED) -> None:
    draw.polygon([(2, 6), (4, 3), (7, 4), (8, 6), (9, 4), (12, 3), (14, 6), (13, 9), (8, 14), (3, 9)], fill=INK)
    draw.polygon([(4, 6), (5, 5), (7, 6), (8, 8), (9, 6), (12, 5), (12, 8), (8, 12), (4, 8)], fill=color)


def icon_sprite(group: str, icon_id: str) -> Image.Image:
    image = blank(16, 16); d = ImageDraw.Draw(image)
    if group == "poison":
        if icon_id == "greed":
            d.ellipse((7, 3, 14, 10), fill=INK); d.ellipse((9, 5, 12, 8), fill=GOLD)
            d.line((2, 12, 4, 7, 7, 6), fill=INK, width=2); d.line((4, 12, 7, 9, 10, 10), fill=GOLD_DARK, width=2)
        elif icon_id == "anger":
            d.polygon([(8, 1), (11, 5), (10, 7), (14, 9), (11, 14), (5, 14), (2, 10), (5, 6), (5, 2)], fill=INK)
            d.polygon([(7, 5), (10, 8), (9, 10), (11, 11), (8, 13), (5, 11), (6, 8)], fill=RED)
        elif icon_id == "delusion":
            d.polygon([(1, 8), (5, 4), (11, 4), (15, 8), (11, 12), (5, 12)], fill=INK)
            d.ellipse((5, 5, 11, 11), fill=VIOLET); d.rectangle((7, 6, 9, 9), fill=MOON)
            d.point((10, 5), fill=PINK); d.point((5, 11), fill=PINK)
        elif icon_id == "pride":
            d.polygon([(2, 5), (4, 2), (7, 5), (10, 2), (13, 5), (12, 9), (3, 9)], fill=INK)
            d.polygon([(4, 5), (5, 4), (7, 7), (10, 4), (11, 6), (10, 8), (4, 8)], fill=GOLD)
            d.line((5, 12, 12, 12), fill=RED, width=2)
        elif icon_id == "doubt":
            d.line((8, 14, 8, 8), fill=INK, width=2); d.line((8, 8, 3, 3), fill=INK, width=2); d.line((8, 8, 13, 3), fill=INK, width=2)
            d.polygon([(2, 3), (5, 2), (4, 5)], fill=VIOLET); d.polygon([(14, 3), (11, 2), (12, 5)], fill=VIOLET)
            d.point((6, 12), fill=MOON); d.point((10, 12), fill=MOON)
    elif group == "origin":
        if icon_id in {"long_breath", "weak_lungs"}:
            d.line((8, 2, 8, 7), fill=INK, width=2); d.ellipse((2, 5, 8, 13), fill=INK); d.ellipse((8, 5, 14, 13), fill=INK)
            d.ellipse((4, 7, 7, 11), fill=MOON); d.ellipse((9, 7, 12, 11), fill=MOON)
            if icon_id == "weak_lungs": d.line((5, 6, 11, 13), fill=RED, width=2)
            else: d.point((8, 1), fill=GREEN)
        elif icon_id == "quick_breath":
            draw_seed(d, 1); d.line((1, 4, 4, 4), fill=GREEN); d.line((1, 11, 4, 11), fill=GREEN)
        elif icon_id == "sharp_eyes":
            d.polygon([(1, 8), (5, 4), (11, 4), (15, 8), (11, 12), (5, 12)], fill=INK); d.ellipse((6, 5, 10, 11), fill=GREEN)
            d.line((11, 4, 15, 1), fill=MOON); d.line((12, 6, 15, 5), fill=MOON)
        elif icon_id == "heavy_hands":
            d.rectangle((3, 6, 12, 13), fill=INK); d.rectangle((5, 8, 10, 11), fill=GOLD_DARK)
            for x in (4, 7, 10, 13): d.rectangle((x, 3, x + 1, 7), fill=INK)
        elif icon_id in {"lucky_pocket", "empty_pockets"}:
            d.polygon([(2, 4), (14, 4), (12, 14), (4, 14)], fill=INK); d.polygon([(4, 6), (12, 6), (10, 12), (6, 12)], fill=COAL)
            if icon_id == "lucky_pocket": d.ellipse((4, 2, 7, 5), fill=GOLD); d.ellipse((9, 2, 12, 5), fill=GOLD)
            else: d.polygon([(6, 7), (10, 7), (8, 11)], fill=CLEAR); d.line((4, 12, 2, 14), fill=WORN)
        elif icon_id == "someone_left_food":
            d.rectangle((2, 8, 14, 11), fill=INK); d.arc((3, 4, 13, 11), 180, 360, fill=PAPER, width=2); d.line((5, 13, 11, 13), fill=GREEN, width=2)
        elif icon_id == "light_sleeper":
            d.rectangle((1, 5, 15, 13), fill=INK); d.rectangle((3, 7, 13, 11), fill=COAL)
            d.polygon([(4, 9), (7, 7), (10, 9), (7, 11)], fill=MOON); d.point((7, 9), fill=GREEN)
        elif icon_id == "bad_eyesight":
            d.ellipse((1, 5, 7, 11), outline=INK, width=2); d.ellipse((9, 5, 15, 11), outline=INK, width=2); d.line((7, 8, 9, 8), fill=INK)
            d.line((2, 3, 14, 13), fill=WORN); d.point((4, 8), fill=VIOLET); d.point((12, 8), fill=VIOLET)
        elif icon_id == "too_sensible":
            d.line((2, 6, 14, 6), fill=INK, width=2)
            for x in range(3, 14, 2): d.point((x, 5 if x % 4 else 7), fill=METAL)
            d.line((8, 8, 8, 14), fill=RED_DARK, width=2); d.polygon([(6, 12), (10, 12), (8, 15)], fill=RED_DARK)
        elif icon_id == "soft_hearted":
            draw_heart(d, PINK); d.rectangle((6, 7, 10, 9), fill=PAPER); d.line((8, 6, 8, 10), fill=PAPER_DARK)
    elif group == "stat":
        if icon_id == "hp": draw_heart(d)
        elif icon_id == "shield":
            d.polygon([(8, 1), (14, 4), (13, 11), (8, 15), (3, 11), (2, 4)], fill=INK); d.polygon([(8, 3), (12, 5), (11, 10), (8, 12), (5, 10), (4, 5)], fill=GOLD)
        elif icon_id == "coins":
            d.ellipse((2, 4, 10, 12), fill=INK); d.ellipse((4, 6, 8, 10), fill=GOLD); d.ellipse((8, 2, 14, 8), fill=INK); d.ellipse((10, 4, 12, 6), fill=GOLD)
        elif icon_id == "damage":
            d.polygon([(8, 1), (10, 5), (15, 3), (12, 8), (15, 12), (10, 11), (8, 15), (6, 11), (1, 13), (4, 8), (1, 4), (6, 5)], fill=RED)
        elif icon_id == "fire_rate":
            d.ellipse((2, 2, 13, 13), outline=INK, width=2); d.line((8, 8, 11, 4), fill=GREEN, width=2); d.polygon([(8, 1), (11, 1), (9, 4)], fill=GOLD)
        elif icon_id == "range":
            d.line((2, 12, 13, 3), fill=MOON, width=2); d.polygon([(11, 2), (15, 1), (14, 5)], fill=GREEN); d.ellipse((1, 9, 5, 13), outline=INK)
        elif icon_id == "width":
            d.line((2, 8, 14, 8), fill=MOON, width=2); d.polygon([(1, 8), (5, 5), (5, 11)], fill=GREEN); d.polygon([(15, 8), (11, 5), (11, 11)], fill=GREEN)
        elif icon_id == "pierce":
            for x in (4, 8, 12): d.rectangle((x, 3, x + 1, 13), fill=WORN)
            d.line((1, 8, 15, 8), fill=MOON, width=2); d.polygon([(15, 8), (12, 5), (12, 11)], fill=GREEN)
        elif icon_id == "homing":
            d.arc((1, 2, 13, 14), 70, 300, fill=GREEN, width=2); d.polygon([(13, 10), (15, 13), (11, 13)], fill=GREEN); d.ellipse((6, 5, 10, 9), outline=MOON)
        elif icon_id == "returning":
            d.arc((2, 2, 14, 14), 40, 290, fill=VIOLET, width=2); d.polygon([(2, 9), (1, 13), (5, 11)], fill=VIOLET); d.line((6, 8, 12, 8), fill=MOON)
        elif icon_id == "critical":
            d.polygon([(8, 1), (10, 6), (15, 5), (11, 9), (14, 14), (8, 11), (3, 14), (5, 9), (1, 5), (6, 6)], fill=GOLD); d.rectangle((7, 7, 9, 9), fill=MOON)
    elif group == "status":
        if icon_id == "slowed":
            d.line((3, 3, 7, 10, 12, 11), fill=INK, width=3); d.ellipse((10, 9, 15, 14), outline=WORN, width=2); d.line((1, 13, 6, 13), fill=VIOLET)
        elif icon_id == "stunned":
            d.ellipse((4, 5, 12, 13), fill=COAL); d.point((5, 2), fill=GOLD); d.point((10, 1), fill=GOLD); d.point((14, 4), fill=GOLD); d.arc((2, 1, 14, 8), 180, 350, fill=GOLD)
        elif icon_id == "projectile_freeze":
            draw_cross(d, 8, 8, 6, WATER, 2); d.line((3, 3, 13, 13), fill=WATER, width=2); d.line((13, 3, 3, 13), fill=WATER, width=2); d.rectangle((7, 7, 9, 9), fill=MOON)
        elif icon_id == "delayed_pain":
            draw_heart(d, RED_DARK); d.line((5, 2, 11, 2, 8, 6, 5, 2), fill=MOON); d.line((5, 14, 11, 14, 8, 10, 5, 14), fill=MOON)
        elif icon_id == "raincoat_guard":
            d.arc((1, 2, 15, 12), 180, 360, fill=GOLD, width=3); d.line((8, 7, 8, 14), fill=GOLD, width=2); d.line((8, 14, 11, 14), fill=GOLD, width=2); d.point((3, 12), fill=WATER); d.point((13, 12), fill=WATER)
        elif icon_id == "grace":
            d.ellipse((3, 1, 13, 5), outline=GOLD, width=2); d.polygon([(8, 4), (11, 9), (9, 14), (5, 14), (4, 9)], fill=MOON); d.rectangle((6, 12, 10, 14), fill=GOLD)
        elif icon_id == "bill_due":
            d.rectangle((2, 2, 11, 14), fill=INK); d.rectangle((4, 4, 9, 12), fill=PAPER); d.ellipse((8, 7, 15, 14), fill=INK); d.ellipse((10, 9, 13, 12), fill=RED); d.line((11, 10, 11, 8), fill=MOON)
        elif icon_id == "distortion":
            d.ellipse((2, 4, 8, 10), fill=PINK); d.ellipse((8, 6, 14, 12), fill=SIGNAL); d.rectangle((6, 1, 10, 4), fill=INK); d.line((3, 13, 13, 3), fill=VIOLET)
        elif icon_id == "haste":
            d.polygon([(1, 3), (7, 8), (1, 13), (5, 8)], fill=GREEN); d.polygon([(7, 3), (14, 8), (7, 13), (11, 8)], fill=MOON)
        elif icon_id == "taunt":
            d.ellipse((2, 5, 14, 12), fill=INK); d.rectangle((5, 8, 11, 10), fill=RED); d.line((2, 3, 5, 4), fill=GOLD); d.line((14, 3, 11, 4), fill=GOLD); d.point((8, 2), fill=GOLD)
    else:
        raise AssertionError(group)
    if not image.getchannel("A").getbbox():
        raise AssertionError(f"empty icon: {group}/{icon_id}")
    return image


def colors_of(image: Image.Image) -> list[tuple[int, int, int, int]]:
    return sorted({pixel for pixel in image.getdata() if pixel[3]})


def describe_sprite(category: str, sprite_id: str, state: str, image: Image.Image, rect: tuple[int, int, int, int], anchor: tuple[int, int]) -> dict[str, object]:
    if any(alpha not in (0, 255) for alpha in image.getchannel("A").getdata()):
        raise AssertionError(f"partial alpha: {category}/{sprite_id}/{state}")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty sprite: {category}/{sprite_id}/{state}")
    colors = colors_of(image)
    unknown = [color for color in colors if color not in COLOR_NAME]
    if unknown:
        raise AssertionError(f"off-palette: {category}/{sprite_id}/{state}/{unknown}")
    if len(colors) > 7:
        raise AssertionError(f"palette budget: {category}/{sprite_id}/{state}/{len(colors)}")
    return {
        "category": category,
        "id": sprite_id,
        "state": state,
        "size": list(image.size),
        "atlas_rect": list(rect),
        "anchor": list(anchor),
        "bbox": list(bbox),
        "opaque_pixels": sum(pixel[3] > 0 for pixel in image.getdata()),
        "palette": [COLOR_NAME[color] for color in colors],
    }


def font(size: int, bold: bool = False):
    for path in ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(path, size=size, index=1 if bold and path.endswith(".ttc") else 0)
        except (OSError, ValueError):
            pass
    return ImageFont.load_default()


def checker(width: int, height: int) -> Image.Image:
    image = Image.new("RGBA", (width, height), (43, 38, 48, 255)); draw = ImageDraw.Draw(image)
    for y in range(0, height, 4):
        for x in range(0, width, 4):
            if (x // 4 + y // 4) % 2: draw.rectangle((x, y, min(width - 1, x + 3), min(height - 1, y + 3)), fill=(48, 43, 53, 255))
    return image


def enlarged(image: Image.Image, scale: int) -> Image.Image:
    base = checker(*image.size); base.alpha_composite(image)
    return base.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST).convert("RGB")


def make_approval(
    cores: list[Image.Image], masks: dict[str, list[Image.Image]], trails: dict[str, Image.Image],
    impacts: dict[str, list[Image.Image]], big: dict[str, list[Image.Image]], icons: list[tuple[str, str, Image.Image]],
) -> Image.Image:
    canvas = Image.new("RGB", (2200, 2000), (18, 17, 22)); d = ImageDraw.Draw(canvas)
    d.text((24, 16), "《一口气》VFX + UI STATIC APPROVAL · NATIVE PIXEL", font=font(28, True), fill=(226, 216, 198))
    d.text((24, 50), "atlas has no labels or guides · every edge is binary alpha · cyan squares are the moon-white core", font=font(15), fill=(142, 138, 145))

    # Core and composited material masks, 8x.
    x0, y0, s = 24, 92, 8
    d.text((x0, y0), "16x16 BREATH CORE / MATERIAL MASK COMPOSITES · 4 STATES", font=font(18, True), fill=(205, 190, 165)); y0 += 30
    rows = [("breath-core", cores)] + [(material, masks[material]) for material in MASK_MATERIALS]
    for row, (label, sprites) in enumerate(rows):
        yy = y0 + row * (16 * s + 24)
        d.text((x0, yy + 46), label, font=font(14, True), fill=(186, 177, 164))
        for state, sprite in enumerate(sprites):
            preview = sprite if label == "breath-core" else Image.alpha_composite(cores[state], sprite)
            xx = x0 + 110 + state * (16 * s + 10)
            canvas.paste(enlarged(preview, s), (xx, yy))
            d.text((xx + 4, yy + 4), PHASES[state], font=font(11), fill=(212, 204, 194))

    # Trails, 8x.
    tx, ty = 760, 92
    d.text((tx, ty), "32x8 TRAILS · 6 MATERIALS", font=font(18, True), fill=(205, 190, 165)); ty += 34
    for index, material in enumerate(MATERIALS):
        yy = ty + index * 94
        d.text((tx, yy + 22), material, font=font(14, True), fill=(186, 177, 164))
        canvas.paste(enlarged(trails[material], 8), (tx + 88, yy))

    # Big forms, 3x, kept clear of the icon column.
    bx, by = 760, 720
    d.text((bx, by), "48x48 EXPLOSION / KEY-DOOR FORMS", font=font(18, True), fill=(205, 190, 165)); by += 34
    for row, kind in enumerate(("explosion", "key_door")):
        yy = by + row * 180
        d.text((bx, yy + 80), kind, font=font(14, True), fill=(186, 177, 164))
        for state, sprite in enumerate(big[kind]):
            xx = bx + 96 + state * 152
            canvas.paste(enlarged(sprite, 3), (xx, yy))
            d.text((xx + 4, yy + 4), PHASES[state], font=font(11), fill=(212, 204, 194))

    # Impacts, 5x.
    ix, iy = 24, 1040
    d.text((ix, iy), "32x32 IMPACT KEYS · 6 MATERIALS x 4", font=font(18, True), fill=(205, 190, 165)); iy += 34
    for row, material in enumerate(MATERIALS):
        yy = iy + row * 136
        d.text((ix, yy + 58), material, font=font(14, True), fill=(186, 177, 164))
        for state, sprite in enumerate(impacts[material]):
            xx = ix + 86 + state * 168
            canvas.paste(enlarged(sprite, 5), (xx, yy))

    # Icons, 7x, grouped but packed continuously.
    ux, uy = 1460, 92
    d.text((ux, uy), "16x16 UI ICONS · 38", font=font(18, True), fill=(205, 190, 165)); uy += 34
    for index, (group, icon_id, sprite) in enumerate(icons):
        col, row = index % 6, index // 6
        xx, yy = ux + col * 120, uy + row * 154
        canvas.paste(enlarged(sprite, 7), (xx, yy))
        d.text((xx, yy + 116), icon_id.replace("_", "-"), font=font(11), fill=(192, 183, 171))
        d.text((xx, yy + 132), group, font=font(10), fill=(126, 122, 130))
    return canvas


def extract_union(type_name: str) -> set[str]:
    source = TYPES_PATH.read_text(encoding="utf-8")
    match = re.search(rf"export\s+type\s+{type_name}\s*=\s*(.*?);", source, re.DOTALL)
    if not match: raise AssertionError(f"missing type {type_name}")
    return set(re.findall(r"'([^']+)'", match.group(1)))


def extract_materials() -> set[str]:
    source = TYPES_PATH.read_text(encoding="utf-8")
    match = re.search(r"materials:\s*Array<(.*?)>", source, re.DOTALL)
    if not match: raise AssertionError("missing ProjectileVisual.materials")
    return set(re.findall(r"'([^']+)'", match.group(1)))


def main() -> None:
    if extract_union("PoisonKey") != set(POISONS): raise AssertionError("PoisonKey/icon mismatch")
    if extract_union("OriginTraitId") != set(ORIGIN_TRAITS): raise AssertionError("OriginTraitId/icon mismatch")
    if extract_materials() != set(MATERIALS): raise AssertionError("Projectile material mismatch")
    origin_source = ORIGINS_PATH.read_text(encoding="utf-8")
    game_source = GAME_PATH.read_text(encoding="utf-8")
    wiki_source = WIKI_PATH.read_text(encoding="utf-8")
    for trait in ORIGIN_TRAITS:
        if f"{trait}:" not in origin_source: raise AssertionError(f"origin definition missing: {trait}")
    for fields in STATUS_FIELDS.values():
        for field in fields:
            if field not in game_source: raise AssertionError(f"status field missing: {field}")
    if "初始形态：不规则小椭圆" not in wiki_source: raise AssertionError("breath art specification missing")

    cores = [core_sprite(state) for state in range(4)]
    masks = {material: [material_mask(material, state) for state in range(4)] for material in MASK_MATERIALS}
    trails = {material: trail_sprite(material) for material in MATERIALS}
    impacts = {material: [impact_sprite(material, state) for state in range(4)] for material in MATERIALS}
    big = {kind: [big_vfx(kind, state) for state in range(4)] for kind in ("explosion", "key_door")}
    icons = [(group, icon_id, icon_sprite(group, icon_id)) for group, ids in ICON_GROUPS for icon_id in ids]

    atlas = blank(*ATLAS_SIZE); records: list[dict[str, object]] = []
    def place(category: str, sprite_id: str, state: str, image: Image.Image, x: int, y: int, anchor: tuple[int, int]) -> None:
        rect = (x, y, image.width, image.height)
        atlas.alpha_composite(image, (x, y))
        records.append(describe_sprite(category, sprite_id, state, image, rect, anchor))

    for state, image in enumerate(cores): place("core", "breath", PHASES[state], image, state * 16, 0, (8, 8))
    for row, material in enumerate(MASK_MATERIALS):
        for state, image in enumerate(masks[material]): place("material_mask", material, PHASES[state], image, state * 16, 16 + row * 16, (8, 8))
    for row, material in enumerate(MATERIALS): place("trail", material, "static", trails[material], 64, row * 8, (31, 4))
    for row, material in enumerate(MATERIALS):
        for state, image in enumerate(impacts[material]): place("impact", material, PHASES[state], image, 96 + state * 32, row * 32, (16, 16))
    for row, kind in enumerate(("explosion", "key_door")):
        for state, image in enumerate(big[kind]): place("large_vfx", kind, PHASES[state], image, 224 + state * 48, row * 48, (24, 24))
    for index, (group, icon_id, image) in enumerate(icons): place(f"icon_{group}", icon_id, "static", image, (index % 6) * 16, 96 + (index // 6) * 16, (8, 8))

    if len(records) != 100: raise AssertionError(f"sprite inventory mismatch: {len(records)}")
    if any(alpha not in (0, 255) for alpha in atlas.getchannel("A").getdata()): raise AssertionError("atlas partial alpha")
    atlas_colors = colors_of(atlas)
    if any(color not in COLOR_NAME for color in atlas_colors): raise AssertionError("atlas off-palette")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS_PATH, optimize=True)
    make_approval(cores, masks, trails, impacts, big, icons).save(APPROVAL_PATH, optimize=True)
    manifest = {
        "schema_version": 1,
        "scope": "static approval only; no GIF and no runtime integration",
        "sources": [str(WIKI_PATH), str(TYPES_PATH), str(ORIGINS_PATH), str(GAME_PATH)],
        "atlas": {
            "file": ATLAS_PATH.name, "size": list(ATLAS_SIZE),
            "regions": {
                "core": [0, 0, 64, 16], "material_masks": [0, 16, 64, 80],
                "trails": [64, 0, 32, 48], "impacts": [96, 0, 128, 192],
                "large_vfx": [224, 0, 192, 96], "icons": [0, 96, 96, 112],
            },
        },
        "approval": {"file": APPROVAL_PATH.name, "contains_labels": True, "atlas_contains_labels": False},
        "inventory": {
            "sprite_count": len(records), "core_states": 4, "material_masks": {material: 4 for material in MASK_MATERIALS},
            "trails": list(MATERIALS), "impact_keys": {material: 4 for material in MATERIALS},
            "large_vfx": {"explosion": 4, "key_door": 4},
            "icons": {"poison": len(POISONS), "origin": len(ORIGIN_TRAITS), "stat": len(STAT_ICONS), "status": len(STATUS_ICONS)},
        },
        "definitions": {
            "materials": list(MATERIALS), "phases": list(PHASES), "poisons": list(POISONS),
            "origin_traits": list(ORIGIN_TRAITS), "stats": list(STAT_ICONS), "statuses": STATUS_FIELDS,
        },
        "palette": {name: "#" + "".join(f"{channel:02x}" for channel in color[:3]) for name, color in PALETTE.items()},
        "validation": {
            "binary_alpha_only": True, "palette_only": True, "max_colors_per_sprite": 7,
            "native_integer_grid": True, "atlas_text_or_placeholder_glyphs": False,
            "gif_output": False, "runtime_files_modified": False,
        },
        "sprites": records,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(records)} native-pixel sprites")
    print(f"atlas: {ATLAS_PATH} ({ATLAS_PATH.stat().st_size} bytes)")
    print(f"approval: {APPROVAL_PATH} ({APPROVAL_PATH.stat().st_size} bytes)")
    print(f"manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
