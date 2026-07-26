#!/usr/bin/env python3
"""Render one deterministic 32x32 pixel icon for every current item.

The generated files are static review assets. They are intentionally separate
from the runtime until the complete art set has been approved.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SIZE = 32
COLS = 6
ROWS = 3
PER_PAGE = COLS * ROWS
SOURCE = Path("src/relics.ts")
OUTPUT_DIR = Path("output/art-review-static/full-art-v1/items")
ICON_DIR = OUTPUT_DIR / "icons"

TRANSPARENT = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
SHADOW = (146, 119, 100, 255)
PAPER = (218, 208, 186, 255)
PAPER_DARK = (199, 181, 158, 255)
RED = (166, 54, 73, 255)
RED_DARK = (112, 39, 55, 255)
BRASS = (165, 139, 98, 255)
BRASS_LIGHT = (200, 176, 120, 255)
BLUE = (104, 132, 146, 255)
BLUE_LIGHT = (145, 173, 176, 255)
GREEN = (92, 139, 122, 255)
VIOLET = (110, 82, 108, 255)
PINK = (167, 119, 148, 255)
YELLOW = (190, 163, 75, 255)


@dataclass(frozen=True)
class Item:
    id: str
    name: str
    quality: int
    color: str


def rgba(hex_color: str) -> tuple[int, int, int, int]:
    value = hex_color.removeprefix("#")
    if len(value) != 6:
        raise ValueError(hex_color)
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4)) + (255,)


def mix(
    first: tuple[int, int, int, int],
    second: tuple[int, int, int, int],
    amount: float,
) -> tuple[int, int, int, int]:
    return tuple(round(a + (b - a) * amount) for a, b in zip(first, second))  # type: ignore[return-value]


def parse_items() -> list[Item]:
    source = SOURCE.read_text(encoding="utf-8")
    pattern = re.compile(
        r"id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*quality:\s*([1-5])"
        r".*?color:\s*'(#[0-9a-fA-F]{6})'",
        re.DOTALL,
    )
    items = [Item(match[1], match[2], int(match[3]), match[4]) for match in pattern.finditer(source)]
    ids = [item.id for item in items]
    if not items or len(set(ids)) != len(ids):
        raise AssertionError(f"expected a non-empty unique item set, got {len(items)} / {len(set(ids))}")
    return items


def frame(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color, width: int = 1) -> None:
    for offset in range(width):
        x0, y0, x1, y1 = box
        draw.rectangle((x0 + offset, y0 + offset, x1 - offset, y1 - offset), outline=color)


def line(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], color, width: int = 1) -> None:
    draw.line(points, fill=color, width=width, joint="curve")


def document(draw: ImageDraw.ImageDraw, accent, *, split: bool = False, cross: bool = False) -> None:
    draw.polygon([(7, 3), (22, 3), (26, 7), (26, 29), (7, 29)], fill=INK)
    draw.polygon([(9, 5), (20, 5), (24, 9), (24, 27), (9, 27)], fill=PAPER)
    draw.polygon([(20, 5), (24, 9), (20, 9)], fill=PAPER_DARK)
    for y in (12, 16, 20):
        line(draw, [(11, y), (21, y)], WORN)
    if split:
        line(draw, [(15, 7), (18, 13), (14, 18), (18, 25)], accent, 2)
    if cross:
        line(draw, [(11, 10), (22, 23)], accent, 2)
        line(draw, [(22, 10), (11, 23)], accent, 2)


def phone(draw: ImageDraw.ImageDraw, accent, *, dots: bool = False, cross: bool = False) -> None:
    draw.rounded_rectangle((8, 2, 24, 30), radius=3, fill=INK)
    draw.rectangle((10, 5, 22, 24), fill=COAL)
    draw.rectangle((11, 6, 21, 23), fill=accent)
    draw.rectangle((14, 3, 18, 3), fill=WORN)
    draw.rectangle((14, 27, 18, 28), fill=PAPER_DARK)
    if dots:
        for x in (13, 16, 19):
            draw.rectangle((x, 13, x + 1, 14), fill=PAPER)
    if cross:
        line(draw, [(11, 8), (21, 21)], RED_DARK, 2)


def speech(draw: ImageDraw.ImageDraw, accent, *, dots: int = 3, crossed: bool = False) -> None:
    draw.rounded_rectangle((4, 6, 27, 23), radius=4, fill=INK)
    draw.rounded_rectangle((6, 8, 25, 21), radius=3, fill=accent)
    draw.polygon([(18, 22), (24, 28), (23, 21)], fill=INK)
    if dots:
        centers = [16] if dots == 1 else [11, 16, 21][:dots]
        for x in centers:
            draw.rectangle((x - 1, 13, x + 1, 15), fill=PAPER)
    if crossed:
        line(draw, [(6, 7), (26, 24)], RED, 2)


def bag(draw: ImageDraw.ImageDraw, accent, *, stones: bool = False, takeout: bool = False) -> None:
    if takeout:
        draw.polygon([(8, 8), (24, 8), (26, 29), (6, 29)], fill=INK)
        draw.polygon([(10, 10), (22, 10), (23, 27), (9, 27)], fill=accent)
        line(draw, [(11, 10), (12, 4), (20, 4), (21, 10)], INK, 2)
        return
    draw.rounded_rectangle((5, 9, 27, 29), radius=3, fill=INK)
    draw.rounded_rectangle((7, 11, 25, 27), radius=2, fill=accent)
    draw.arc((10, 2, 22, 15), 180, 360, fill=INK, width=3)
    draw.rectangle((10, 18, 22, 25), outline=mix(accent, PAPER, 0.45))
    if stones:
        for x, y in ((10, 13), (15, 12), (21, 14), (13, 17), (19, 18)):
            draw.rectangle((x - 1, y - 1, x + 1, y + 1), fill=WORN)


def bottle(draw: ImageDraw.ImageDraw, accent, *, pill: bool = False, water: bool = False) -> None:
    draw.rectangle((12, 2, 20, 6), fill=INK)
    draw.rectangle((13, 3, 19, 5), fill=PAPER_DARK)
    draw.rounded_rectangle((8, 6, 24, 29), radius=3, fill=INK)
    draw.rounded_rectangle((10, 8, 22, 27), radius=2, fill=PAPER if not water else BLUE_LIGHT)
    draw.rectangle((10, 15, 22, 22), fill=accent)
    if pill:
        draw.ellipse((13, 16, 18, 20), fill=PINK)
        draw.rectangle((16, 16, 18, 20), fill=PAPER)
    if water:
        draw.rectangle((11, 11, 21, 14), fill=(204, 218, 213, 255))


def card(draw: ImageDraw.ImageDraw, accent, *, crossed: bool = False, portrait: bool = False) -> None:
    draw.rounded_rectangle((4, 7, 28, 25), radius=2, fill=INK)
    draw.rounded_rectangle((6, 9, 26, 23), radius=1, fill=accent)
    if portrait:
        draw.ellipse((8, 11, 14, 17), fill=PAPER)
        draw.rectangle((8, 18, 15, 21), fill=PAPER_DARK)
        line(draw, [(17, 13), (23, 13)], PAPER)
        line(draw, [(17, 17), (23, 17)], PAPER_DARK)
    else:
        draw.rectangle((9, 12, 23, 14), fill=PAPER)
        draw.rectangle((9, 18, 18, 20), fill=PAPER_DARK)
    if crossed:
        line(draw, [(7, 10), (25, 22)], RED, 2)


def calendar(draw: ImageDraw.ImageDraw, accent, *, pages: int = 1) -> None:
    for depth in range(pages - 1, -1, -1):
        left = 5 + depth * 2
        top = 5 - depth
        draw.rectangle((left, top, 27, 29 - depth), fill=INK)
        draw.rectangle((left + 2, top + 4, 25, 27 - depth), fill=PAPER)
    draw.rectangle((7, 6, 25, 11), fill=accent)
    for x in (10, 22):
        draw.rectangle((x, 3, x + 2, 8), fill=BRASS)
    for y in (15, 20, 25):
        for x in (11, 16, 21):
            draw.rectangle((x, y, x + 1, y + 1), fill=WORN)


def shadow_icon(draw: ImageDraw.ImageDraw, accent, motif: str) -> None:
    draw.ellipse((3, 20, 29, 29), fill=INK)
    draw.ellipse((6, 22, 26, 27), fill=COAL)
    if motif == "moon":
        draw.ellipse((9, 4, 24, 19), fill=accent)
        draw.ellipse((14, 2, 26, 16), fill=TRANSPARENT)
    elif motif == "snow":
        for x, y in ((8, 8), (15, 4), (23, 10), (12, 15), (21, 18)):
            draw.rectangle((x, y, x + 1, y + 1), fill=accent)
    elif motif == "steps":
        for index in range(4):
            draw.rectangle((7 + index * 5, 17 - index * 3, 10 + index * 5, 19 - index * 3), fill=accent)
    elif motif == "power":
        draw.arc((8, 3, 24, 19), 315, 225, fill=accent, width=3)
        line(draw, [(16, 2), (16, 11)], accent, 3)
    elif motif == "frame":
        frame(draw, (7, 3, 25, 24), accent, 2)
    elif motif == "static":
        for x, y in ((7, 6), (12, 9), (19, 5), (24, 12), (9, 15), (17, 17), (22, 20)):
            draw.rectangle((x, y, x + 2, y + 1), fill=accent)


def draw_item(item: Item) -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), TRANSPARENT)
    draw = ImageDraw.Draw(image)
    accent = rgba(item.color)
    dark = mix(accent, INK, 0.45)
    light = mix(accent, PAPER, 0.42)
    item_id = item.id

    if item_id == "loose-button":
        draw.ellipse((5, 5, 27, 27), fill=INK)
        draw.ellipse((7, 7, 25, 25), fill=accent)
        for x in (12, 19):
            for y in (12, 19):
                draw.rectangle((x, y, x + 1, y + 1), fill=INK)
        line(draw, [(2, 25), (10, 21), (18, 27), (30, 23)], PAPER_DARK)
    elif item_id == "wooden-sword":
        line(draw, [(5, 28), (25, 5)], INK, 5)
        line(draw, [(5, 28), (25, 5)], accent, 3)
        line(draw, [(8, 21), (15, 28)], INK, 4)
        line(draw, [(8, 21), (15, 28)], BRASS, 2)
        draw.polygon([(23, 4), (28, 2), (26, 8)], fill=light)
    elif item_id == "red-workbook":
        draw.polygon([(6, 3), (25, 5), (26, 29), (5, 27)], fill=INK)
        draw.polygon([(8, 5), (23, 7), (24, 27), (7, 25)], fill=accent)
        line(draw, [(10, 10), (21, 22)], PAPER_DARK, 2)
        line(draw, [(21, 10), (10, 22)], PAPER_DARK, 2)
        line(draw, [(8, 5), (7, 25)], BRASS)
    elif item_id == "stone-schoolbag":
        bag(draw, accent, stones=True)
    elif item_id == "bleach-powder":
        draw.polygon([(6, 4), (25, 6), (23, 23), (8, 22)], fill=INK)
        draw.polygon([(8, 6), (23, 8), (21, 21), (10, 20)], fill=accent)
        draw.rectangle((11, 10, 20, 13), fill=PAPER)
        for x, y in ((7, 25), (11, 27), (15, 24), (20, 28), (25, 25)):
            draw.rectangle((x, y, x + 2, y + 1), fill=light)
    elif item_id == "eyebrow-razor":
        line(draw, [(4, 24), (25, 7)], INK, 4)
        line(draw, [(5, 23), (24, 8)], accent, 2)
        draw.polygon([(22, 5), (29, 3), (26, 11)], fill=PAPER)
        line(draw, [(7, 26), (12, 30)], RED_DARK)
    elif item_id == "od-pill":
        for x, y, color in ((8, 9, PINK), (18, 7, BLUE_LIGHT), (14, 20, accent)):
            draw.rounded_rectangle((x - 5, y - 3, x + 5, y + 3), radius=3, fill=INK)
            draw.rounded_rectangle((x - 4, y - 2, x + 4, y + 2), radius=2, fill=color)
            line(draw, [(x, y - 2), (x, y + 2)], PAPER)
    elif item_id == "front-desk-letter":
        draw.rectangle((3, 7, 29, 25), fill=INK)
        draw.rectangle((5, 9, 27, 23), fill=PAPER)
        line(draw, [(5, 9), (16, 18), (27, 9)], dark)
        line(draw, [(5, 23), (13, 16)], PAPER_DARK)
        draw.ellipse((14, 17, 18, 21), fill=accent)
    elif item_id == "cracked-glasses":
        for box in ((3, 9, 15, 22), (17, 9, 29, 22)):
            draw.ellipse(box, outline=INK, width=3)
            draw.ellipse((box[0] + 2, box[1] + 2, box[2] - 2, box[3] - 2), outline=accent)
        line(draw, [(14, 14), (18, 14)], accent, 2)
        line(draw, [(20, 10), (25, 21)], PAPER, 2)
    elif item_id == "small-uniform":
        draw.polygon([(8, 5), (13, 3), (16, 8), (19, 3), (24, 5), (28, 12), (23, 15), (22, 29), (10, 29), (9, 15), (4, 12)], fill=INK)
        draw.polygon([(10, 7), (13, 6), (16, 11), (19, 6), (22, 7), (25, 12), (21, 13), (20, 27), (12, 27), (11, 13), (7, 12)], fill=accent)
        line(draw, [(16, 11), (16, 26)], light)
    elif item_id == "only-key":
        draw.ellipse((3, 3, 16, 16), fill=INK)
        draw.ellipse((6, 6, 13, 13), outline=accent, width=2)
        line(draw, [(13, 13), (28, 28)], INK, 5)
        line(draw, [(13, 13), (28, 28)], accent, 2)
        line(draw, [(21, 21), (25, 17)], accent, 2)
        line(draw, [(25, 25), (29, 21)], accent, 2)
    elif item_id == "first-salary":
        draw.rectangle((3, 8, 29, 25), fill=INK)
        draw.rectangle((5, 10, 27, 23), fill=accent)
        line(draw, [(5, 10), (16, 18), (27, 10)], light)
        draw.ellipse((13, 15, 19, 21), fill=BRASS_LIGHT)
        line(draw, [(16, 16), (16, 20)], INK)
    elif item_id == "nameless-tie":
        draw.polygon([(12, 3), (20, 3), (22, 8), (19, 13), (22, 26), (16, 30), (10, 26), (13, 13), (10, 8)], fill=INK)
        draw.polygon([(14, 5), (18, 5), (19, 8), (16, 11), (13, 8)], fill=accent)
        draw.polygon([(15, 12), (18, 13), (20, 25), (16, 27), (12, 25)], fill=accent)
    elif item_id == "fathers-raincoat":
        draw.polygon([(8, 7), (13, 3), (19, 3), (24, 7), (29, 27), (21, 29), (16, 25), (11, 29), (3, 27)], fill=INK)
        draw.polygon([(10, 8), (14, 5), (18, 5), (22, 8), (26, 25), (20, 27), (16, 23), (12, 27), (6, 25)], fill=accent)
        draw.arc((10, 1, 22, 11), 180, 360, fill=light, width=2)
        line(draw, [(16, 7), (16, 24)], dark)
    elif item_id == "unsent-phone":
        phone(draw, accent, cross=True)
        draw.rectangle((22, 4, 27, 9), fill=RED)
    elif item_id == "baby-tooth":
        draw.polygon([(6, 6), (11, 3), (16, 6), (21, 3), (26, 6), (24, 18), (20, 29), (16, 22), (12, 29), (8, 18)], fill=INK)
        draw.polygon([(9, 7), (12, 5), (16, 8), (20, 5), (23, 7), (21, 17), (19, 24), (16, 19), (13, 24), (11, 17)], fill=PAPER)
        draw.rectangle((11, 9, 21, 11), fill=light)
    elif item_id == "revoked-badge":
        card(draw, accent, crossed=True, portrait=True)
        line(draw, [(16, 2), (16, 7)], BRASS, 2)
    elif item_id == "slow-watch":
        draw.rectangle((13, 1, 19, 7), fill=INK)
        draw.rectangle((13, 25, 19, 30), fill=INK)
        draw.ellipse((5, 5, 27, 27), fill=INK)
        draw.ellipse((8, 8, 24, 24), fill=accent)
        line(draw, [(16, 16), (16, 10)], PAPER, 2)
        line(draw, [(16, 16), (21, 19)], PAPER, 2)
        draw.rectangle((15, 15, 17, 17), fill=BRASS_LIGHT)
    elif item_id == "missing-photo":
        frame(draw, (5, 3, 27, 29), INK, 2)
        draw.rectangle((8, 6, 24, 25), fill=PAPER_DARK)
        for x in (11, 16, 21):
            draw.ellipse((x - 2, 10, x + 2, 14), fill=COAL if x != 16 else accent)
            draw.rectangle((x - 2, 15, x + 2, 21), fill=COAL if x != 16 else accent)
        draw.rectangle((14, 8, 18, 23), fill=TRANSPARENT)
    elif item_id == "white-bottle":
        bottle(draw, accent)
    elif item_id == "empty-frame":
        frame(draw, (4, 3, 28, 29), INK, 3)
        frame(draw, (7, 6, 25, 26), accent, 2)
        draw.line((8, 7, 12, 7), fill=light)
        draw.line((20, 25, 24, 25), fill=dark)
    elif item_id == "broken-spine":
        points = [(15, 3), (18, 6), (14, 9), (18, 12), (13, 15), (17, 18), (12, 21), (16, 24), (13, 28)]
        line(draw, points, INK, 5)
        line(draw, points, PAPER_DARK, 3)
        for x, y in points[1:-1]:
            line(draw, [(x - 5, y), (x + 5, y)], PAPER, 2)
        draw.rectangle((19, 12, 22, 16), fill=RED_DARK)
    elif item_id == "spent-decade":
        calendar(draw, accent, pages=3)
        line(draw, [(10, 16), (22, 16)], RED, 2)
        line(draw, [(10, 22), (22, 22)], RED, 2)
        draw.rectangle((24, 4, 28, 8), fill=TRANSPARENT)
    elif item_id == "held-pee":
        draw.polygon([(16, 2), (25, 17), (24, 24), (20, 29), (12, 29), (8, 24), (7, 17)], fill=INK)
        draw.polygon([(16, 5), (22, 18), (21, 23), (18, 26), (14, 26), (11, 23), (10, 18)], fill=accent)
        line(draw, [(10, 20), (22, 20)], RED_DARK, 2)
        line(draw, [(12, 17), (20, 23)], RED_DARK, 2)
    elif item_id == "flash-escape":
        draw.polygon([(18, 2), (7, 17), (14, 17), (9, 30), (25, 12), (18, 12)], fill=INK)
        draw.polygon([(18, 6), (11, 15), (17, 15), (13, 24), (22, 14), (16, 14)], fill=accent)
        for offset in (0, 4):
            line(draw, [(3 + offset, 8), (3 + offset, 26)], light)
    elif item_id == "class-break":
        draw.ellipse((8, 5, 24, 21), fill=INK)
        draw.polygon([(10, 14), (12, 7), (20, 7), (22, 14), (25, 22), (7, 22)], fill=accent)
        draw.rectangle((13, 23, 19, 26), fill=INK)
        draw.ellipse((14, 25, 18, 29), fill=BRASS_LIGHT)
        for x in (3, 28):
            line(draw, [(x, 10), (x, 18)], light)
    elif item_id == "last-page":
        document(draw, accent)
        draw.polygon([(18, 21), (24, 21), (24, 27)], fill=accent)
        line(draw, [(12, 23), (18, 23)], RED, 2)
    elif item_id == "five-ha":
        speech(draw, accent, dots=0)
        for index in range(5):
            x = 8 + (index % 3) * 7
            y = 11 + (index // 3) * 6
            draw.arc((x - 2, y - 1, x + 3, y + 4), 15, 165, fill=PAPER, width=1)
    elif item_id == "red-packet":
        draw.polygon([(6, 5), (26, 5), (28, 28), (4, 28)], fill=INK)
        draw.polygon([(8, 7), (24, 7), (25, 26), (7, 26)], fill=accent)
        draw.ellipse((12, 12, 20, 20), fill=BRASS_LIGHT)
        line(draw, [(8, 8), (16, 15), (24, 8)], dark)
    elif item_id == "snow-screen":
        draw.rounded_rectangle((3, 5, 29, 25), radius=2, fill=INK)
        draw.rectangle((6, 8, 26, 22), fill=COAL)
        for x, y, length in ((7, 10, 8), (16, 9, 9), (9, 14, 12), (20, 16, 5), (6, 20, 9)):
            draw.rectangle((x, y, x + length, y + 1), fill=PAPER if y % 4 else accent)
        draw.rectangle((10, 26, 22, 29), fill=INK)
    elif item_id == "marble":
        draw.ellipse((4, 4, 28, 28), fill=INK)
        draw.ellipse((6, 6, 26, 26), fill=accent)
        line(draw, [(9, 23), (14, 9), (20, 22), (24, 10)], light, 3)
        draw.rectangle((11, 8, 13, 10), fill=PAPER)
    elif item_id == "always-crying":
        draw.ellipse((5, 4, 27, 27), fill=INK)
        draw.ellipse((7, 6, 25, 25), fill=PAPER_DARK)
        line(draw, [(10, 13), (14, 14)], INK, 2)
        line(draw, [(18, 14), (22, 13)], INK, 2)
        draw.arc((12, 17, 20, 23), 200, 340, fill=INK, width=2)
        for x in (11, 21):
            draw.polygon([(x, 15), (x - 3, 24), (x + 2, 24)], fill=accent)
    elif item_id == "three-day-visible":
        calendar(draw, accent, pages=3)
        draw.rectangle((13, 14, 19, 24), fill=INK)
        draw.rectangle((15, 16, 18, 18), fill=PAPER)
        draw.rectangle((14, 21, 18, 23), fill=PAPER_DARK)
    elif item_id == "read-3am":
        phone(draw, accent)
        line(draw, [(11, 14), (14, 17), (19, 10)], PAPER, 2)
        line(draw, [(15, 15), (18, 18), (22, 12)], PAPER, 2)
        draw.ellipse((21, 1, 29, 9), fill=YELLOW)
        draw.ellipse((24, 0, 31, 7), fill=TRANSPARENT)
    elif item_id == "retracted-voice":
        speech(draw, accent, dots=0, crossed=True)
        for height, x in ((4, 10), (8, 14), (12, 18), (6, 22)):
            draw.rectangle((x, 16 - height // 2, x + 1, 16 + height // 2), fill=PAPER)
    elif item_id == "takeout-3am":
        bag(draw, accent, takeout=True)
        draw.ellipse((19, 2, 29, 12), fill=YELLOW)
        draw.ellipse((23, 0, 31, 9), fill=TRANSPARENT)
    elif item_id == "auto-renew":
        draw.ellipse((8, 8, 24, 24), fill=INK)
        draw.ellipse((11, 11, 21, 21), fill=accent)
        draw.arc((3, 3, 29, 29), 205, 355, fill=light, width=3)
        draw.arc((3, 3, 29, 29), 25, 175, fill=light, width=3)
        draw.polygon([(26, 7), (29, 13), (22, 11)], fill=light)
        draw.polygon([(6, 25), (3, 19), (10, 21)], fill=light)
    elif item_id == "bargain-link":
        for box in ((3, 6, 16, 17), (16, 15, 29, 26)):
            draw.rounded_rectangle(box, radius=5, outline=INK, width=3)
            draw.rounded_rectangle((box[0] + 2, box[1] + 2, box[2] - 2, box[3] - 2), radius=3, outline=accent)
        line(draw, [(11, 21), (22, 10)], RED, 3)
        draw.polygon([(21, 5), (29, 3), (26, 11)], fill=PAPER)
    elif item_id == "mineral-water":
        bottle(draw, accent, water=True)
        frame(draw, (11, 16, 21, 21), PAPER, 1)
    elif item_id == "group-dad":
        speech(draw, accent, dots=0)
        for x in (11, 16, 21):
            draw.ellipse((x - 2, 10, x + 2, 14), fill=PAPER)
            draw.rectangle((x - 2, 15, x + 2, 18), fill=PAPER_DARK)
        draw.rectangle((18, 18, 24, 22), fill=dark)
    elif item_id == "divorce-draft":
        document(draw, accent, split=True)
        line(draw, [(9, 24), (14, 24)], RED, 2)
        line(draw, [(19, 24), (24, 24)], BLUE, 2)
    elif item_id == "checkup-arrows":
        document(draw, accent)
        for x in (12, 19):
            line(draw, [(x, 23), (x, 12)], RED, 2)
            draw.polygon([(x - 3, 14), (x, 9), (x + 3, 14)], fill=RED)
    elif item_id == "shared-powerbank":
        draw.rounded_rectangle((6, 5, 25, 27), radius=3, fill=INK)
        draw.rounded_rectangle((8, 7, 23, 25), radius=2, fill=accent)
        draw.rectangle((12, 2, 19, 6), fill=INK)
        draw.rectangle((11, 11, 20, 20), outline=PAPER)
        draw.rectangle((20, 14, 23, 17), fill=PAPER)
        line(draw, [(9, 27), (5, 30), (2, 27)], BLUE_LIGHT, 2)
    elif item_id == "third-pill":
        for index, (x, y) in enumerate(((9, 9), (21, 9), (16, 22))):
            color = RED if index == 2 else accent
            draw.rounded_rectangle((x - 5, y - 3, x + 5, y + 3), radius=3, fill=INK)
            draw.rounded_rectangle((x - 4, y - 2, x + 4, y + 2), radius=2, fill=color)
            line(draw, [(x, y - 2), (x, y + 2)], PAPER)
    elif item_id == "loan-contract":
        document(draw, accent, cross=True)
        line(draw, [(3, 5), (29, 27)], BRASS, 2)
        for x, y in ((5, 7), (10, 12), (22, 24), (27, 27)):
            draw.ellipse((x - 2, y - 2, x + 2, y + 2), outline=INK, width=2)
    elif item_id == "name-sold":
        card(draw, accent, portrait=True)
        draw.rectangle((8, 17, 23, 21), fill=INK)
        draw.ellipse((20, 2, 29, 11), fill=BRASS_LIGHT)
        line(draw, [(24, 4), (24, 9)], INK)
    elif item_id == "moms-bowl":
        draw.arc((4, 8, 28, 29), 0, 180, fill=INK, width=4)
        draw.rectangle((6, 18, 26, 22), fill=accent)
        draw.arc((7, 14, 25, 26), 0, 180, fill=light, width=2)
        for x in (11, 16, 21):
            line(draw, [(x, 12), (x - 2, 5), (x + 1, 2)], PAPER_DARK)
    elif item_id == "ruma-msg":
        phone(draw, accent, dots=True)
        draw.ellipse((21, 1, 29, 9), fill=YELLOW)
        draw.ellipse((24, 0, 31, 7), fill=TRANSPARENT)
        draw.rectangle((4, 22, 10, 28), fill=GREEN)
    elif item_id == "held-elevator":
        frame(draw, (5, 3, 27, 29), INK, 2)
        draw.rectangle((8, 6, 15, 27), fill=COAL)
        draw.rectangle((17, 6, 24, 27), fill=COAL)
        line(draw, [(16, 6), (16, 27)], accent, 2)
        draw.rectangle((12, 14, 19, 18), fill=PAPER_DARK)
        line(draw, [(11, 16), (21, 16)], PAPER_DARK, 2)
    elif item_id == "old-door-lock":
        draw.rounded_rectangle((6, 12, 26, 29), radius=3, fill=INK)
        draw.rounded_rectangle((8, 14, 24, 27), radius=2, fill=accent)
        draw.arc((9, 2, 23, 20), 180, 360, fill=INK, width=4)
        draw.ellipse((14, 18, 18, 22), fill=INK)
        draw.rectangle((15, 21, 17, 25), fill=INK)
    elif item_id == "drank-for-boss":
        draw.polygon([(8, 5), (24, 5), (21, 25), (11, 25)], fill=INK)
        draw.polygon([(10, 8), (22, 8), (19, 23), (13, 23)], fill=accent)
        draw.rectangle((8, 4, 24, 8), fill=PAPER_DARK)
        draw.rectangle((14, 25, 18, 29), fill=INK)
        line(draw, [(5, 14), (11, 17)], PAPER_DARK, 2)
    elif item_id == "hair-in-takeout":
        bag(draw, accent, takeout=True)
        line(draw, [(9, 12), (14, 9), (20, 13), (13, 17), (22, 21)], INK, 2)
        draw.ellipse((20, 20, 23, 23), fill=INK)
    elif item_id == "unwashed-pillow":
        draw.rounded_rectangle((3, 7, 29, 26), radius=6, fill=INK)
        draw.rounded_rectangle((5, 9, 27, 24), radius=5, fill=PAPER_DARK)
        for box in ((8, 11, 14, 16), (18, 15, 25, 21), (11, 20, 16, 23)):
            draw.ellipse(box, fill=accent)
        line(draw, [(6, 21), (10, 24)], WORN, 2)
    elif item_id == "sock-cigs":
        draw.polygon([(7, 4), (18, 4), (18, 18), (26, 22), (23, 29), (13, 25), (7, 25)], fill=INK)
        draw.polygon([(9, 6), (16, 6), (16, 19), (23, 23), (21, 26), (14, 23), (9, 23)], fill=accent)
        draw.rectangle((18, 3, 22, 17), fill=PAPER)
        draw.rectangle((18, 3, 22, 7), fill=RED_DARK)
        draw.rectangle((19, 1, 21, 3), fill=SHADOW)
    elif item_id == "pregnancy-test":
        draw.rounded_rectangle((3, 12, 29, 20), radius=3, fill=INK)
        draw.rounded_rectangle((5, 14, 27, 18), radius=2, fill=PAPER)
        draw.rectangle((8, 14, 13, 18), fill=accent)
        for x in (19, 23):
            draw.rectangle((x, 14, x + 1, 18), fill=RED)
    elif item_id == "gym-card":
        card(draw, accent)
        line(draw, [(8, 16), (12, 16), (12, 12), (14, 12), (14, 20), (18, 20), (18, 12), (20, 12), (20, 16), (24, 16)], PAPER, 2)
    elif item_id == "funeral-photo":
        frame(draw, (6, 3, 26, 29), INK, 3)
        draw.rectangle((9, 6, 23, 25), fill=PAPER_DARK)
        draw.ellipse((12, 8, 20, 16), fill=COAL)
        draw.rectangle((11, 17, 21, 24), fill=COAL)
        line(draw, [(5, 4), (27, 28)], accent, 3)
    elif item_id == "typing-indicator":
        speech(draw, accent, dots=3)
        for x in (11, 16, 21):
            draw.rectangle((x - 1, 13, x + 1, 15), fill=PAPER)
    elif item_id == "year-report":
        document(draw, accent)
        line(draw, [(11, 22), (14, 17), (17, 20), (22, 11)], BLUE, 2)
        draw.arc((2, 6, 13, 21), 90, 270, fill=INK, width=3)
        draw.arc((19, 6, 30, 21), 270, 90, fill=INK, width=3)
    elif item_id == "momo-avatar":
        draw.ellipse((4, 4, 28, 28), fill=INK)
        draw.ellipse((6, 6, 26, 26), fill=accent)
        draw.ellipse((11, 9, 21, 19), fill=PAPER_DARK)
        draw.polygon([(8, 25), (10, 19), (16, 17), (22, 19), (24, 25)], fill=PAPER_DARK)
        draw.rectangle((14, 3, 18, 7), fill=PINK)
    elif item_id == "ai-chat":
        speech(draw, accent, dots=0)
        draw.rectangle((12, 11, 20, 19), fill=INK)
        draw.rectangle((14, 13, 18, 17), fill=PAPER)
        for x, y in ((10, 12), (22, 12), (10, 18), (22, 18), (14, 9), (18, 9)):
            line(draw, [(x, y), (16, 15)], BLUE_LIGHT)
    elif item_id == "streak-1847":
        calendar(draw, accent, pages=1)
        draw.polygon([(16, 12), (21, 20), (18, 25), (13, 25), (10, 20)], fill=RED)
        draw.polygon([(16, 15), (18, 20), (16, 23), (13, 20)], fill=YELLOW)
    elif item_id == "goodnight-2h":
        shadow_icon(draw, accent, "moon")
        draw.polygon([(3, 12), (8, 12), (5, 16), (8, 20), (3, 20), (6, 16)], fill=BLUE_LIGHT)
        draw.polygon([(25, 4), (30, 4), (27, 8), (30, 12), (25, 12), (28, 8)], fill=BLUE_LIGHT)
    elif item_id == "friend-verify":
        draw.ellipse((6, 4, 16, 14), fill=PAPER_DARK)
        draw.polygon([(3, 27), (5, 17), (11, 14), (17, 17), (19, 27)], fill=accent)
        draw.rounded_rectangle((17, 14, 29, 27), radius=2, fill=INK)
        draw.arc((19, 8, 27, 20), 180, 360, fill=INK, width=3)
        draw.rectangle((21, 19, 25, 24), fill=RED)
    elif item_id == "summer-run":
        draw.polygon([(4, 18), (11, 17), (15, 7), (20, 9), (20, 17), (28, 22), (27, 27), (8, 27)], fill=INK)
        draw.polygon([(7, 19), (13, 19), (16, 10), (18, 11), (18, 19), (25, 23), (24, 25), (9, 25)], fill=accent)
        line(draw, [(4, 12), (10, 12)], light, 2)
        line(draw, [(2, 16), (9, 16)], light)
    elif item_id == "one-more-game":
        draw.rounded_rectangle((3, 9, 29, 25), radius=7, fill=INK)
        draw.rounded_rectangle((5, 11, 27, 23), radius=5, fill=accent)
        draw.rectangle((9, 15, 15, 17), fill=PAPER)
        draw.rectangle((11, 13, 13, 19), fill=PAPER)
        for x in (21, 25):
            draw.ellipse((x - 1, 14, x + 1, 16), fill=PAPER_DARK)
        draw.ellipse((21, 1, 29, 9), fill=YELLOW)
        draw.ellipse((24, 0, 31, 7), fill=TRANSPARENT)
    elif item_id == "eye-exercise":
        draw.polygon([(3, 16), (9, 9), (16, 6), (23, 9), (29, 16), (23, 23), (16, 26), (9, 23)], fill=INK)
        draw.polygon([(6, 16), (11, 11), (16, 9), (21, 11), (26, 16), (21, 21), (16, 23), (11, 21)], fill=PAPER)
        draw.ellipse((11, 11, 21, 21), fill=accent)
        draw.ellipse((14, 14, 18, 18), fill=INK)
        line(draw, [(4, 4), (12, 12)], PAPER_DARK, 3)
    elif item_id == "card-binder":
        draw.rounded_rectangle((5, 3, 27, 29), radius=2, fill=INK)
        draw.rounded_rectangle((8, 5, 25, 27), radius=1, fill=accent)
        line(draw, [(10, 5), (10, 27)], BRASS, 2)
        for x, y in ((13, 9), (19, 9), (13, 17), (19, 17)):
            draw.rectangle((x, y, x + 4, y + 5), fill=PAPER_DARK)
    elif item_id == "abstract-lv10":
        draw.ellipse((4, 4, 28, 28), fill=INK)
        draw.ellipse((6, 6, 26, 26), fill=accent)
        draw.rectangle((9, 11, 13, 14), fill=PAPER)
        draw.rectangle((20, 10, 24, 13), fill=PAPER)
        draw.arc((9, 14, 24, 24), 5, 175, fill=PAPER, width=2)
        for x, y in ((3, 8), (27, 5), (2, 22), (26, 24), (15, 1)):
            draw.rectangle((x, y, x + 3, y + 1), fill=light)
    elif item_id == "shop-freezer":
        draw.rounded_rectangle((3, 8, 29, 28), radius=2, fill=INK)
        draw.rectangle((5, 11, 27, 26), fill=accent)
        draw.rectangle((5, 11, 27, 14), fill=light)
        line(draw, [(16, 11), (16, 26)], INK, 2)
        for angle_points in (
            [(10, 17), (10, 24)], [(7, 20), (13, 20)], [(8, 18), (12, 23)], [(12, 18), (8, 23)],
        ):
            line(draw, angle_points, PAPER)
    elif item_id == "server-shutdown":
        draw.rounded_rectangle((6, 4, 26, 27), radius=2, fill=INK)
        draw.rectangle((8, 7, 24, 11), fill=COAL)
        draw.rectangle((8, 14, 24, 18), fill=COAL)
        draw.rectangle((8, 21, 24, 25), fill=COAL)
        for y in (9, 16, 23):
            draw.rectangle((10, y, 12, y + 1), fill=accent)
        draw.arc((11, 7, 27, 23), 315, 225, fill=RED, width=3)
        line(draw, [(19, 6), (19, 14)], RED, 3)
    elif item_id == "painless-night":
        shadow_icon(draw, accent, "moon")
        draw.polygon([(7, 17), (10, 12), (13, 17), (16, 12), (19, 17), (22, 12), (25, 17)], fill=RED_DARK)
        line(draw, [(5, 18), (27, 18)], PAPER_DARK, 2)
    elif item_id == "ktv-song":
        draw.ellipse((9, 3, 23, 17), fill=INK)
        draw.ellipse((11, 5, 21, 15), fill=accent)
        for y in (8, 11):
            line(draw, [(12, y), (20, y)], light)
        line(draw, [(16, 16), (16, 25)], INK, 4)
        line(draw, [(16, 16), (16, 25)], dark, 2)
        line(draw, [(10, 28), (22, 28)], INK, 3)
        for radius in (3, 6):
            draw.arc((23 - radius, 10 - radius, 23 + radius, 10 + radius), 285, 75, fill=light, width=1)
    elif item_id == "breath-on-glass":
        frame(draw, (4, 3, 28, 29), INK, 2)
        draw.rectangle((7, 6, 25, 26), fill=accent)
        for x, y in ((9, 9), (14, 7), (21, 10), (11, 20), (22, 23)):
            draw.rectangle((x, y, x + 2, y + 1), fill=light)
        line(draw, [(10, 18), (13, 13), (16, 18), (19, 12), (22, 17)], PAPER, 2)
        line(draw, [(8, 24), (13, 22), (18, 24), (24, 21)], light)
    else:
        raise AssertionError(f"missing icon drawing: {item_id}")

    return image


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    )
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def make_atlas(items: list[Item], icons: dict[str, Image.Image]) -> Image.Image:
    rows = (len(items) + 7) // 8
    atlas = Image.new("RGBA", (SIZE * 8, SIZE * rows), TRANSPARENT)
    for index, item in enumerate(items):
        atlas.alpha_composite(icons[item.id], ((index % 8) * SIZE, (index // 8) * SIZE))
    return atlas


def make_contact(items: list[Item], icons: dict[str, Image.Image], page: int) -> Image.Image:
    cell_w = 260
    cell_h = 245
    page_items = items[page * PER_PAGE:(page + 1) * PER_PAGE]
    canvas = Image.new("RGB", (cell_w * COLS, cell_h * ROWS), (19, 18, 24))
    draw = ImageDraw.Draw(canvas)
    title_font = font(18)
    id_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 13)
    quality_colors = {1: (117, 115, 119), 2: (104, 132, 146), 3: (166, 82, 100), 4: (200, 176, 90), 5: (166, 54, 73)}
    scale = 5
    for local_index, item in enumerate(page_items):
        column = local_index % COLS
        row = local_index // COLS
        left = column * cell_w
        top = row * cell_h
        panel = (43, 38, 48) if (row + column) % 2 == 0 else (38, 34, 43)
        draw.rectangle((left, top, left + cell_w - 1, top + cell_h - 1), fill=panel, outline=(68, 59, 71))
        icon = icons[item.id].resize((SIZE * scale, SIZE * scale), Image.Resampling.NEAREST)
        canvas.paste(icon, (left + (cell_w - SIZE * scale) // 2, top + 12), icon)
        color = quality_colors[item.quality]
        draw.rectangle((left + 16, top + 181, left + 20, top + 209), fill=color)
        draw.text((left + 29, top + 178), item.name, font=title_font, fill=(226, 218, 203))
        draw.text((left + 29, top + 207), item.id, font=id_font, fill=(156, 149, 143))
        draw.text((left + 214, top + 207), "I" * item.quality, font=id_font, fill=color)
    return canvas


def main() -> None:
    items = parse_items()
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    icons = {item.id: draw_item(item) for item in items}
    records = []
    for item in items:
        icon = icons[item.id]
        bbox = icon.getchannel("A").getbbox()
        if bbox is None:
            raise AssertionError(f"empty icon: {item.id}")
        if any(alpha not in {0, 255} for *_, alpha in icon.getdata()):
            raise AssertionError(f"partial alpha: {item.id}")
        colors = sorted({pixel for pixel in icon.getdata() if pixel[3]})
        opaque = sum(pixel[3] > 0 for pixel in icon.getdata())
        if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= SIZE or bbox[3] >= SIZE:
            raise AssertionError(f"icon clipping/padding: {item.id} {bbox}")
        icon.save(ICON_DIR / f"{item.id}.png", optimize=True)
        records.append({
            "id": item.id,
            "name": item.name,
            "quality": item.quality,
            "color": item.color,
            "bbox": list(bbox),
            "opaque_pixels": opaque,
            "palette_colors": len(colors),
        })

    atlas = make_atlas(items, icons)
    atlas.save(OUTPUT_DIR / "item-icons-atlas.png", optimize=True)
    page_count = (len(items) + PER_PAGE - 1) // PER_PAGE
    for page in range(page_count):
        make_contact(items, icons, page).save(
            OUTPUT_DIR / f"item-icons-contact-{page + 1:02d}.png", optimize=True
        )
    manifest = {
        "logical_icon": {"width": SIZE, "height": SIZE, "alpha": "binary"},
        "item_count": len(items),
        "atlas": {"columns": 8, "rows": (len(items) + 7) // 8},
        "contact_pages": page_count,
        "items": records,
    }
    (OUTPUT_DIR / "item-icons-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {len(items)} item icons and {page_count} review pages to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
