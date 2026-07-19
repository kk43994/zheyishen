#!/usr/bin/env python3
"""Build a review-only static catalog for every MVP enemy type.

The catalog is intentionally isolated from src/assets and the runtime loader.
It emits one transparent 32px-grid atlas, one 10x approval sheet, and a
machine-readable manifest. Existing approved enemy fronts are reused where
available; missing fronts and every side view are authored on the native grid.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


FRAME = 32
SCALE = 10
VIEWS = ("front", "side")
SOURCE_ASSET_DIR = Path("src/assets/enemies")
TYPES_PATH = Path("src/types.ts")
GAME_PATH = Path("src/game.ts")
PIXEL_RUNTIME_PATH = Path("src/enemy-pixel.ts")
WIKI_PATH = Path("docs/这一身百科.html")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-enemy-static-catalog-v2")
ATLAS_PATH = OUTPUT_DIR / "enemy-static-front-side-atlas.png"
CONTACT_PATH = OUTPUT_DIR / "enemy-static-approval-10x.png"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

CLEAR = (0, 0, 0, 0)
INK = (23, 21, 27, 255)          # #17151b
DEEP = (38, 35, 43, 255)         # #26232b
COAL = (55, 52, 58, 255)         # #37343a
WORN = (103, 98, 98, 255)        # #676262
PAPER = (218, 208, 186, 255)      # #dad0ba
PAPER_SHADOW = (199, 181, 158, 255)  # #c7b59e
SKIN_SHADOW = (146, 119, 100, 255)   # #927764
RED_DARK = (112, 39, 55, 255)     # #702737
RED = (166, 54, 73, 255)          # #a63649
RED_LIGHT = (201, 90, 104, 255)   # #c95a68
VIOLET = (110, 82, 108, 255)      # #6e526c
VIOLET_LIGHT = (144, 111, 137, 255)
BRASS = (165, 139, 98, 255)       # #a58b62
BRASS_LIGHT = (200, 176, 120, 255)  # #c8b078
RAIN = (167, 138, 45, 255)        # #a78a2d
RAIN_LIGHT = (208, 177, 79, 255)  # #d0b14f
BLUE = (111, 146, 158, 255)
BLUE_LIGHT = (155, 183, 190, 255)
SICK = (125, 131, 138, 255)
WOOD = (109, 89, 69, 255)

PALETTE = {
    "ink": INK, "deep": DEEP, "coal": COAL, "worn": WORN,
    "paper": PAPER, "paper-shadow": PAPER_SHADOW, "skin-shadow": SKIN_SHADOW,
    "red-dark": RED_DARK, "red": RED, "red-light": RED_LIGHT,
    "violet": VIOLET, "violet-light": VIOLET_LIGHT,
    "brass": BRASS, "brass-light": BRASS_LIGHT,
    "rain": RAIN, "rain-light": RAIN_LIGHT,
    "blue": BLUE, "blue-light": BLUE_LIGHT, "sick": SICK, "wood": WOOD,
}
COLOR_NAME = {color: name for name, color in PALETTE.items()}


@dataclass(frozen=True)
class EnemySpec:
    id: str
    name: str
    stage: str
    role: str
    hp: int
    speed: int
    radius: int
    damage: int
    root_kind: str = "ground"
    stage_pool: bool = True
    wiki_badge: str | None = None
    variant_of: str | None = None
    source_note: str | None = None

    @property
    def draw_scale(self) -> int:
        return 3 if self.role in {"boss", "phase_variant"} else 1

    @property
    def root(self) -> tuple[int, int]:
        return (16, 16) if self.root_kind == "hover" else (16, 30)


SPECS = (
    EnemySpec("cry-moth", "哭蛾", "童年", "normal", 8, 48, 10, 2, "hover"),
    EnemySpec("fear", "床下的呼吸", "童年", "normal", 13, 44, 14, 4),
    EnemySpec("hunger-shadow", "饥饿影", "童年", "normal", 10, 34, 12, 3),
    EnemySpec("closet-dark", "没人相信的怪物", "童年", "boss", 150, 30, 26, 6),
    EnemySpec("red-mark", "红叉", "少年", "normal", 21, 36, 15, 4),
    EnemySpec("whisper", "他们都在说", "少年", "normal", 15, 54, 13, 3, "hover"),
    EnemySpec("uniform-answer", "统一答案", "少年", "boss", 200, 22, 26, 6, wiki_badge="精英"),
    EnemySpec("clockwork", "打卡齿轮", "青年", "normal", 38, 32, 18, 6),
    EnemySpec(
        "missed-bus", "错过的车", "青年", "normal", 60, 150, 16, 9,
        stage_pool=False, source_note="EnemyType/spec retained; no STAGES pool entry; wiki aliases it to last-bus.",
    ),
    EnemySpec("last-bus", "末班车", "青年", "boss", 260, 26, 28, 10),
    EnemySpec("missed-call", "未接来电", "成年", "normal", 30, 30, 14, 1, "hover"),
    EnemySpec("silence", "沉默", "成年", "normal", 34, 22, 16, 3),
    EnemySpec("debt", "下个月账单", "成年/中年/暮年", "normal", 48, 28, 20, 7),
    EnemySpec("silent-father", "沉默的父亲", "成年", "boss", 300, 24, 30, 9, wiki_badge="精英"),
    EnemySpec(
        "silent-father-p2", "沉默的父亲·裂甲", "成年", "phase_variant", 300, 36, 30, 9,
        stage_pool=False, variant_of="silent-father", source_note="Half-HP visual phase; not a separate EnemyType.",
    ),
    EnemySpec("badge-thief", "注销工牌", "中年", "normal", 30, 40, 14, 4),
    EnemySpec("debt-collector", "上门催收", "中年", "boss", 340, 24, 26, 8),
    EnemySpec("forgetter", "忘记名字的人", "暮年", "normal", 90, 12, 18, 8),
    EnemySpec("empty-chair", "空椅子", "暮年", "normal", 70, 0, 14, 0),
    EnemySpec("lamp-keeper", "收灯人", "暮年", "boss", 430, 20, 40, 12),
)

EXISTING_FRONTS = {
    "fear", "red-mark", "whisper", "clockwork", "debt",
    "uniform-answer", "silent-father", "silent-father-p2", "lamp-keeper",
}


def blank() -> Image.Image:
    return Image.new("RGBA", (FRAME, FRAME), CLEAR)


def draw_cross(draw: ImageDraw.ImageDraw, cx: int, cy: int, size: int, color, width: int = 2) -> None:
    draw.line((cx - size, cy - size, cx + size, cy + size), fill=color, width=width)
    draw.line((cx + size, cy - size, cx - size, cy + size), fill=color, width=width)


def pixel_yen(draw: ImageDraw.ImageDraw, cx: int, cy: int, color) -> None:
    draw.line((cx - 3, cy - 4, cx, cy - 1, cx + 3, cy - 4), fill=color, width=2)
    draw.line((cx, cy - 1, cx, cy + 4), fill=color, width=2)
    draw.line((cx - 3, cy, cx + 3, cy), fill=color)
    draw.line((cx - 3, cy + 2, cx + 3, cy + 2), fill=color)


def grounded(image: Image.Image, root_y: int = 30) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError("cannot ground empty sprite")
    dy = root_y - (bbox[3] - 1)
    result = blank()
    result.alpha_composite(image, (0, dy))
    return result


def existing_front(spec: EnemySpec) -> Image.Image:
    atlas = Image.open(SOURCE_ASSET_DIR / f"{spec.id}.png").convert("RGBA")
    frame = atlas.crop((0, 0, FRAME, FRAME))
    return frame if spec.root_kind == "hover" else grounded(frame)


def draw_cry_moth(view: str) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if view == "front":
        draw.polygon([(15, 10), (8, 5), (3, 9), (5, 19), (13, 23), (15, 18)], fill=INK)
        draw.polygon([(17, 10), (24, 5), (29, 9), (27, 19), (19, 23), (17, 18)], fill=INK)
        draw.polygon([(13, 11), (8, 8), (6, 11), (8, 17), (13, 19)], fill=VIOLET)
        draw.polygon([(19, 11), (24, 8), (26, 11), (24, 17), (19, 19)], fill=VIOLET)
        draw.rectangle((14, 8, 18, 22), fill=INK); draw.rectangle((15, 11, 17, 19), fill=COAL)
        draw.point((15, 9), fill=PAPER); draw.point((17, 9), fill=PAPER)
        draw.point((9, 13), fill=BLUE_LIGHT); draw.point((23, 13), fill=BLUE_LIGHT)
        draw.line((15, 7, 12, 4), fill=WORN); draw.line((17, 7, 20, 4), fill=WORN)
    else:
        draw.polygon([(9, 9), (20, 5), (27, 10), (24, 20), (15, 23), (10, 18)], fill=INK)
        draw.polygon([(12, 11), (20, 8), (24, 11), (21, 18), (14, 20)], fill=VIOLET)
        draw.rectangle((8, 10, 12, 22), fill=INK); draw.rectangle((9, 12, 11, 19), fill=COAL)
        draw.point((9, 11), fill=PAPER); draw.line((9, 9, 6, 6), fill=WORN)
        draw.point((18, 14), fill=BLUE_LIGHT); draw.point((20, 17), fill=BLUE)
    return image


def draw_hunger_shadow(view: str) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if view == "front":
        draw.polygon([(2, 30), (5, 22), (10, 24), (12, 13), (16, 8), (20, 13), (22, 24), (27, 21), (30, 30)], fill=INK)
        draw.polygon([(9, 28), (12, 17), (16, 12), (20, 17), (23, 28)], fill=DEEP)
        draw.point((13, 17), fill=RED_DARK); draw.point((19, 17), fill=RED_DARK)
        draw.rectangle((13, 21, 19, 23), fill=INK); draw.point((16, 22), fill=PAPER_SHADOW)
    else:
        draw.polygon([(2, 30), (5, 23), (11, 22), (15, 13), (22, 16), (24, 23), (30, 27), (29, 30)], fill=INK)
        draw.polygon([(8, 28), (13, 18), (20, 18), (23, 26)], fill=DEEP)
        draw.point((17, 17), fill=RED_DARK)
        draw.rectangle((20, 20, 25, 22), fill=INK); draw.point((23, 21), fill=PAPER_SHADOW)
    return image


def draw_missed_bus(view: str, boss: bool = False) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if view == "front":
        x0, y0, x1 = (3, 5, 29) if boss else (6, 10, 26)
        draw.rectangle((x0, y0, x1, 28), fill=INK)
        draw.rectangle((x0 + 2, y0 + 2, x1 - 2, 24), fill=BRASS if boss else WORN)
        draw.rectangle((x0 + 4, y0 + 4, x1 - 4, y0 + 11), fill=COAL)
        draw.line((16, y0 + 4, 16, y0 + 11), fill=INK, width=2)
        draw.rectangle((x0 + 4, 24, x0 + 7, 26), fill=PAPER)
        draw.rectangle((x1 - 7, 24, x1 - 4, 26), fill=PAPER)
        draw.rectangle((x0 + 5, 28, x0 + 9, 30), fill=INK)
        draw.rectangle((x1 - 9, 28, x1 - 5, 30), fill=INK)
        if boss:
            draw.rectangle((10, 7, 22, 9), fill=RED_DARK); draw.line((12, 8, 20, 8), fill=RED_LIGHT)
            draw.line((8, 21, 24, 21), fill=INK, width=2)
    else:
        x0, y0, x1 = (2, 7, 29) if boss else (4, 12, 28)
        draw.polygon([(x0, 26), (x0 + 2, y0 + 3), (x0 + 7, y0), (x1 - 2, y0), (x1, 15), (x1, 26)], fill=INK)
        draw.polygon([(x0 + 3, 23), (x0 + 4, y0 + 4), (x0 + 8, y0 + 2), (x1 - 3, y0 + 2), (x1 - 2, 23)], fill=BRASS if boss else WORN)
        for x in range(x0 + 7, x1 - 5, 5):
            draw.rectangle((x, y0 + 4, x + 3, y0 + 10), fill=COAL)
        draw.rectangle((x0 + 5, 25, x0 + 9, 30), fill=INK)
        draw.rectangle((x1 - 9, 25, x1 - 5, 30), fill=INK)
        if boss:
            draw.rectangle((x0 + 8, y0 + 1, x1 - 4, y0 + 3), fill=RED_DARK)
            draw.rectangle((x1 - 4, 18, x1 - 1, 22), fill=PAPER)
    return image


def draw_missed_call(view: str) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if view == "front":
        draw.ellipse((6, 6, 26, 26), fill=INK); draw.ellipse((9, 9, 23, 23), fill=BLUE)
        draw.ellipse((12, 12, 20, 20), fill=INK); draw.rectangle((14, 13, 18, 19), fill=COAL)
        draw.arc((3, 3, 29, 29), 205, 335, fill=BLUE_LIGHT, width=2)
        draw.rectangle((6, 8, 10, 12), fill=PAPER_SHADOW); draw.rectangle((22, 8, 26, 12), fill=PAPER_SHADOW)
    else:
        draw.polygon([(5, 12), (8, 7), (12, 8), (14, 12), (21, 18), (25, 17), (28, 21), (25, 25), (21, 25), (18, 21), (11, 16), (7, 16)], fill=INK)
        draw.polygon([(8, 12), (10, 10), (12, 12), (20, 20), (24, 19), (25, 22), (22, 23), (18, 20), (10, 15)], fill=BLUE)
        draw.point((15, 17), fill=BLUE_LIGHT)
    return image


def draw_silence(view: str) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if view == "front":
        draw.polygon([(6, 30), (8, 13), (12, 6), (20, 6), (24, 13), (26, 30)], fill=INK)
        draw.ellipse((10, 7, 22, 21), fill=DEEP)
        draw.rectangle((12, 12, 20, 17), fill=COAL)
        draw.line((12, 18, 20, 18), fill=WORN); draw.point((14, 17), fill=WORN); draw.point((18, 17), fill=WORN)
        draw.line((3, 29, 29, 29), fill=VIOLET, width=2)
    else:
        draw.polygon([(8, 30), (9, 14), (13, 7), (20, 8), (24, 15), (25, 30)], fill=INK)
        draw.polygon([(12, 11), (18, 9), (21, 13), (20, 20), (14, 21), (11, 17)], fill=DEEP)
        draw.line((15, 17, 20, 17), fill=WORN); draw.line((4, 29, 28, 29), fill=VIOLET, width=2)
    return image


def draw_badge_thief(view: str) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if view == "front":
        draw.line((10, 4, 16, 10, 22, 4), fill=WORN, width=2)
        draw.rectangle((7, 9, 25, 28), fill=INK); draw.rectangle((9, 11, 23, 26), fill=PAPER)
        draw.rectangle((12, 13, 20, 18), fill=COAL); draw.line((11, 21, 21, 21), fill=WORN)
        draw.line((10, 24, 22, 12), fill=RED, width=3)
        draw.rectangle((9, 28, 12, 30), fill=INK); draw.rectangle((20, 28, 23, 30), fill=INK)
    else:
        draw.line((10, 4, 15, 10, 20, 5), fill=WORN, width=2)
        draw.polygon([(12, 9), (20, 11), (22, 27), (14, 28)], fill=INK)
        draw.polygon([(14, 11), (18, 12), (20, 25), (16, 26)], fill=PAPER)
        draw.line((14, 22, 20, 16), fill=RED, width=2)
        draw.line((22, 17, 27, 14, 29, 16), fill=INK, width=3)
        draw.rectangle((15, 28, 18, 30), fill=INK)
    return image


def draw_forgetter(view: str) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if view == "front":
        draw.ellipse((10, 3, 22, 15), fill=INK); draw.rectangle((8, 13, 24, 27), fill=INK)
        draw.polygon([(11, 6), (20, 6), (20, 13), (12, 13)], fill=SICK)
        draw.rectangle((14, 7, 17, 10), fill=CLEAR); draw.point((20, 11), fill=CLEAR)
        draw.rectangle((11, 16, 21, 20), fill=COAL); draw.rectangle((14, 17, 19, 18), fill=PAPER_SHADOW)
        draw.rectangle((9, 27, 14, 30), fill=INK); draw.rectangle((18, 27, 23, 30), fill=INK)
        draw.point((7, 20), fill=SICK); draw.point((25, 18), fill=SICK)
    else:
        draw.ellipse((11, 4, 23, 16), fill=INK); draw.polygon([(10, 14), (22, 13), (25, 27), (11, 28)], fill=INK)
        draw.polygon([(13, 7), (21, 7), (21, 13), (14, 14)], fill=SICK)
        draw.rectangle((13, 9, 16, 12), fill=CLEAR); draw.point((20, 8), fill=CLEAR)
        draw.rectangle((14, 16, 21, 19), fill=COAL); draw.rectangle((12, 28, 16, 30), fill=INK); draw.rectangle((21, 27, 25, 30), fill=INK)
    return image


def draw_empty_chair(view: str) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if view == "front":
        draw.rectangle((8, 5, 24, 18), fill=INK); draw.rectangle((11, 8, 21, 16), fill=WOOD)
        draw.rectangle((7, 17, 25, 22), fill=INK); draw.rectangle((10, 18, 22, 20), fill=WOOD)
        draw.rectangle((8, 21, 11, 30), fill=INK); draw.rectangle((21, 21, 24, 30), fill=INK)
        draw.point((10, 28), fill=WORN); draw.point((22, 28), fill=WORN)
    else:
        draw.rectangle((10, 5, 14, 20), fill=INK); draw.rectangle((12, 7, 15, 18), fill=WOOD)
        draw.polygon([(11, 18), (25, 18), (27, 22), (12, 22)], fill=INK)
        draw.polygon([(14, 19), (24, 19), (25, 20), (14, 20)], fill=WOOD)
        draw.line((13, 21, 10, 30), fill=INK, width=3); draw.line((24, 21, 27, 30), fill=INK, width=3)
    return image


def draw_closet_dark(view: str) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if view == "front":
        draw.rectangle((3, 3, 29, 30), fill=INK); draw.rectangle((6, 6, 26, 27), fill=DEEP)
        draw.line((16, 6, 16, 27), fill=INK, width=2)
        draw.rectangle((8, 9, 14, 24), fill=VIOLET); draw.rectangle((18, 9, 24, 24), fill=VIOLET)
        draw.point((12, 14), fill=PAPER); draw.point((20, 14), fill=PAPER)
        draw.line((7, 29, 3, 30), fill=VIOLET, width=2); draw.line((25, 29, 29, 30), fill=VIOLET, width=2)
        draw.point((14, 18), fill=BRASS); draw.point((18, 18), fill=BRASS)
    else:
        draw.polygon([(7, 4), (23, 3), (28, 7), (27, 30), (8, 30)], fill=INK)
        draw.polygon([(10, 7), (21, 6), (24, 9), (23, 26), (10, 27)], fill=DEEP)
        draw.polygon([(10, 8), (17, 7), (16, 25), (10, 27)], fill=VIOLET)
        draw.point((14, 14), fill=PAPER); draw.point((18, 18), fill=BRASS)
        draw.line((8, 29, 3, 30), fill=VIOLET, width=2)
    return image


def draw_debt_collector(view: str) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if view == "front":
        draw.polygon([(4, 30), (6, 9), (11, 4), (21, 4), (26, 9), (28, 30)], fill=INK)
        draw.polygon([(8, 27), (9, 10), (13, 7), (20, 7), (23, 11), (24, 27)], fill=PAPER)
        draw.rectangle((11, 10, 21, 15), fill=RED_DARK); draw.line((12, 12, 20, 12), fill=RED_LIGHT)
        for y in (18, 22): draw.line((11, y, 21, y), fill=WORN)
        pixel_yen(draw, 16, 25, RED)
        draw.rectangle((2, 16, 7, 22), fill=INK); draw.rectangle((25, 14, 30, 20), fill=INK)
        draw.point((4, 18), fill=SKIN_SHADOW); draw.point((28, 16), fill=SKIN_SHADOW)
    else:
        draw.polygon([(8, 30), (9, 10), (14, 5), (22, 7), (25, 28)], fill=INK)
        draw.polygon([(12, 27), (12, 11), (16, 8), (21, 9), (22, 26)], fill=PAPER)
        draw.rectangle((14, 11, 21, 15), fill=RED_DARK); draw.line((14, 19, 21, 19), fill=WORN)
        draw.line((22, 15, 28, 13), fill=INK, width=4); draw.rectangle((27, 11, 30, 15), fill=SKIN_SHADOW)
        draw.rectangle((11, 28, 15, 30), fill=INK); draw.rectangle((21, 28, 25, 30), fill=INK)
    return image


def draw_side_existing(asset_id: str) -> Image.Image:
    image = blank(); draw = ImageDraw.Draw(image)
    if asset_id == "fear":
        draw.ellipse((6, 5, 26, 29), fill=INK); draw.polygon([(13, 10), (25, 13), (29, 20), (24, 25), (13, 24)], fill=DEEP)
        draw.point((20, 14), fill=PAPER); draw.rectangle((23, 19, 28, 21), fill=INK); draw.point((26, 20), fill=RED_DARK)
    elif asset_id == "red-mark":
        draw.polygon([(12, 3), (21, 5), (22, 27), (13, 29)], fill=INK); draw.polygon([(14, 5), (19, 6), (20, 26), (15, 27)], fill=PAPER)
        draw.line((14, 9, 20, 23), fill=RED, width=2); draw.rectangle((13, 28, 16, 30), fill=INK); draw.rectangle((20, 27, 23, 30), fill=INK)
    elif asset_id == "whisper":
        draw.ellipse((5, 9, 27, 24), fill=INK); draw.ellipse((8, 11, 25, 22), fill=VIOLET)
        draw.rectangle((17, 14, 27, 17), fill=INK); draw.line((19, 14, 25, 14), fill=PAPER)
        draw.polygon([(10, 20), (5, 28), (15, 23)], fill=VIOLET)
    elif asset_id == "clockwork":
        draw.rectangle((12, 3, 20, 29), fill=INK); draw.rectangle((14, 5, 18, 27), fill=BRASS)
        for y in (4, 9, 15, 21, 27): draw.rectangle((8, y, 13, y + 2), fill=BRASS)
        draw.rectangle((18, 12, 26, 20), fill=INK); draw.rectangle((19, 14, 24, 18), fill=COAL); draw.point((22, 16), fill=BRASS_LIGHT)
    elif asset_id == "debt":
        draw.polygon([(10, 3), (21, 4), (23, 28), (12, 30)], fill=INK); draw.polygon([(12, 5), (19, 6), (21, 26), (14, 28)], fill=PAPER)
        draw.line((13, 10, 20, 10), fill=WORN); draw.line((14, 15, 20, 15), fill=WORN); draw.line((14, 20, 21, 20), fill=RED)
    elif asset_id == "uniform-answer":
        draw.polygon([(6, 6), (23, 3), (28, 7), (27, 28), (9, 30)], fill=INK); draw.polygon([(10, 7), (21, 6), (24, 8), (24, 26), (11, 27)], fill=PAPER)
        draw.line((12, 11, 23, 23), fill=RED, width=3); draw.line((22, 10, 12, 24), fill=RED, width=3)
        draw.line((7, 9, 4, 6), fill=RED_DARK, width=2); draw.line((27, 14, 30, 11), fill=RED_DARK, width=2)
    elif asset_id in {"silent-father", "silent-father-p2"}:
        phase2 = asset_id.endswith("p2")
        draw.polygon([(7, 30), (9, 11), (14, 5), (21, 7), (25, 29)], fill=INK)
        draw.polygon([(10, 28), (11, 13), (15, 8), (20, 10), (22, 27)], fill=RAIN)
        draw.ellipse((12, 5, 22, 15), fill=INK); draw.arc((10, 3, 24, 17), 180, 350, fill=RAIN_LIGHT, width=2)
        if phase2:
            draw.rectangle((14, 9, 20, 14), fill=PAPER_SHADOW); draw.point((18, 11), fill=INK)
            draw.line((15, 15, 12, 25), fill=PAPER, width=2); draw.line((20, 14, 22, 23), fill=RED_DARK)
        else:
            draw.rectangle((14, 10, 21, 14), fill=COAL)
    elif asset_id == "lamp-keeper":
        draw.polygon([(5, 30), (8, 11), (14, 4), (21, 6), (25, 29)], fill=INK)
        draw.polygon([(9, 27), (11, 13), (15, 8), (20, 9), (22, 27)], fill=COAL)
        draw.line((21, 14, 27, 18), fill=INK, width=3); draw.rectangle((25, 17, 30, 24), fill=BRASS)
        draw.rectangle((26, 18, 29, 22), fill=BRASS_LIGHT); draw.point((18, 11), fill=BRASS_LIGHT)
    else:
        raise AssertionError(f"no existing side renderer: {asset_id}")
    return image


def render_view(spec: EnemySpec, view: str) -> Image.Image:
    if view == "front" and spec.id in EXISTING_FRONTS:
        return existing_front(spec)
    if view == "side" and spec.id in EXISTING_FRONTS:
        image = draw_side_existing(spec.id)
    elif spec.id == "cry-moth": image = draw_cry_moth(view)
    elif spec.id == "hunger-shadow": image = draw_hunger_shadow(view)
    elif spec.id == "missed-bus": image = draw_missed_bus(view, boss=False)
    elif spec.id == "last-bus": image = draw_missed_bus(view, boss=True)
    elif spec.id == "missed-call": image = draw_missed_call(view)
    elif spec.id == "silence": image = draw_silence(view)
    elif spec.id == "badge-thief": image = draw_badge_thief(view)
    elif spec.id == "forgetter": image = draw_forgetter(view)
    elif spec.id == "empty-chair": image = draw_empty_chair(view)
    elif spec.id == "closet-dark": image = draw_closet_dark(view)
    elif spec.id == "debt-collector": image = draw_debt_collector(view)
    else: raise AssertionError(f"no renderer: {spec.id}/{view}")
    return image if spec.root_kind == "hover" else grounded(image)


def colors_of(image: Image.Image) -> list[tuple[int, int, int, int]]:
    return sorted({pixel for pixel in image.getdata() if pixel[3]})


def hex_color(color: tuple[int, int, int, int]) -> str:
    return "#" + "".join(f"{channel:02x}" for channel in color[:3])


def source_enemy_types() -> set[str]:
    source = TYPES_PATH.read_text(encoding="utf-8")
    match = re.search(r"export\s+type\s+EnemyType\s*=\s*(.*?);", source, re.DOTALL)
    if not match:
        raise AssertionError("EnemyType declaration not found")
    return set(re.findall(r"'([^']+)'", match.group(1)))


def validate_and_describe(
    spec: EnemySpec,
    views: dict[str, Image.Image],
    row: int,
) -> dict[str, object]:
    if views["front"].tobytes() == views["side"].tobytes():
        raise AssertionError(f"front/side duplicate: {spec.id}")
    described: dict[str, object] = {}
    union_colors: set[tuple[int, int, int, int]] = set()
    for column, view in enumerate(VIEWS):
        image = views[view]
        if image.size != (FRAME, FRAME):
            raise AssertionError(f"bad frame: {spec.id}/{view}/{image.size}")
        alphas = {pixel[3] for pixel in image.getdata()}
        if not alphas <= {0, 255}:
            raise AssertionError(f"antialiased alpha: {spec.id}/{view}/{alphas}")
        bbox = image.getchannel("A").getbbox()
        if bbox is None:
            raise AssertionError(f"empty frame: {spec.id}/{view}")
        if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= FRAME or bbox[3] >= FRAME:
            raise AssertionError(f"clipping/grid-edge risk: {spec.id}/{view}/{bbox}")
        if spec.root_kind == "ground" and bbox[3] - 1 != spec.root[1]:
            raise AssertionError(f"ground root mismatch: {spec.id}/{view}/{bbox}")
        colors = colors_of(image)
        unknown = [color for color in colors if color not in COLOR_NAME]
        if unknown:
            raise AssertionError(f"off-palette pixels: {spec.id}/{view}/{unknown}")
        if len(colors) > 8:
            raise AssertionError(f"palette too large: {spec.id}/{view}/{len(colors)}")
        union_colors.update(colors)
        described[view] = {
            "atlas_cell": [column, row],
            "bbox": list(bbox),
            "silhouette_size": [bbox[2] - bbox[0], bbox[3] - bbox[1]],
            "opaque_pixels": sum(pixel[3] > 0 for pixel in image.getdata()),
            "colors": [COLOR_NAME[color] for color in colors],
        }
    return {
        "atlas_row": row,
        "id": spec.id,
        "enemy_type": spec.variant_of or spec.id,
        "variant_of": spec.variant_of,
        "name": spec.name,
        "stage": spec.stage,
        "role": spec.role,
        "wiki_badge": spec.wiki_badge,
        "stage_pool": spec.stage_pool,
        "source_note": spec.source_note,
        "stats": {"hp": spec.hp, "speed": spec.speed, "radius": spec.radius, "damage": spec.damage},
        "anchors": {
            "render_pivot": [16, 16],
            "root": list(spec.root),
            "root_kind": spec.root_kind,
            "collision": [16, 16],
            "collision_radius_world": spec.radius,
            "runtime_scale_reference": spec.draw_scale,
        },
        "palette": [COLOR_NAME[color] for color in sorted(union_colors)],
        "views": described,
    }


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    paths = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in paths:
        try:
            return ImageFont.truetype(path, size=size, index=1 if bold and path.endswith(".ttc") else 0)
        except (OSError, ValueError):
            continue
    return ImageFont.load_default()


def checker_panel() -> Image.Image:
    image = Image.new("RGBA", (FRAME, FRAME), (42, 38, 47, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, FRAME, 4):
        for x in range(0, FRAME, 4):
            if (x // 4 + y // 4) % 2:
                draw.rectangle((x, y, x + 3, y + 3), fill=(46, 42, 51, 255))
    return image


def make_atlas(frames: dict[str, dict[str, Image.Image]]) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME * len(VIEWS), FRAME * len(SPECS)), CLEAR)
    for row, spec in enumerate(SPECS):
        for column, view in enumerate(VIEWS):
            atlas.alpha_composite(frames[spec.id][view], (column * FRAME, row * FRAME))
    return atlas


def make_contact(frames: dict[str, dict[str, Image.Image]]) -> Image.Image:
    columns = 4
    rows = (len(SPECS) + columns - 1) // columns
    panel = FRAME * SCALE
    card_w = panel * 2 + 28
    card_h = panel + 76
    margin = 24
    title_h = 64
    canvas = Image.new("RGB", (margin * 2 + card_w * columns, title_h + card_h * rows + margin), (18, 17, 22))
    draw = ImageDraw.Draw(canvas)
    draw.text((margin, 14), "《这一身》MVP ENEMY STATIC APPROVAL · FRONT / SIDE · 32PX @ 10X", font=font(24, True), fill=(220, 210, 194))
    draw.text((margin, 42), "cyan = collision pivot · amber = root · x = runtime scale reference · transparent atlas is guide-free", font=font(14), fill=(139, 137, 142))

    for index, spec in enumerate(SPECS):
        row, column = divmod(index, columns)
        x0 = margin + column * card_w
        y0 = title_h + row * card_h
        fill = (35, 31, 39) if spec.role == "normal" else (42, 34, 39)
        draw.rectangle((x0 + 2, y0 + 2, x0 + card_w - 4, y0 + card_h - 4), fill=fill, outline=(70, 62, 72))
        role = "PHASE" if spec.role == "phase_variant" else spec.role.upper()
        if spec.wiki_badge:
            role = f"{role}/WIKI{spec.wiki_badge}"
        draw.text((x0 + 10, y0 + 8), f"{index:02d}  {spec.id}", font=font(16, True), fill=(218, 209, 192))
        draw.text((x0 + 10, y0 + 29), f"{spec.name} · {spec.stage} · {role} · r{spec.radius} · x{spec.draw_scale}", font=font(14), fill=(181, 171, 158))
        for view_index, view in enumerate(VIEWS):
            vx = x0 + 8 + view_index * (panel + 12)
            vy = y0 + 56
            base = checker_panel()
            base.alpha_composite(frames[spec.id][view])
            # Guides live only on the approval sheet.
            guide = ImageDraw.Draw(base)
            cx, cy = 16, 16
            guide.line((cx - 1, cy, cx + 1, cy), fill=(89, 207, 215, 255))
            guide.line((cx, cy - 1, cx, cy + 1), fill=(89, 207, 215, 255))
            rx, ry = spec.root
            guide.point((rx, ry), fill=(219, 174, 83, 255))
            enlarged = base.resize((panel, panel), Image.Resampling.NEAREST).convert("RGB")
            canvas.paste(enlarged, (vx, vy))
            draw.rectangle((vx, vy, vx + panel - 1, vy + panel - 1), outline=(76, 68, 80))
            draw.text((vx + 6, vy + 5), view.upper(), font=font(13, True), fill=(211, 204, 193))
    return canvas


def main() -> None:
    source_types = source_enemy_types()
    catalog_types = {spec.id for spec in SPECS if spec.variant_of is None}
    if source_types != catalog_types:
        raise AssertionError(f"catalog/type mismatch: missing={sorted(source_types - catalog_types)} extra={sorted(catalog_types - source_types)}")
    if len(source_types) != 19:
        raise AssertionError(f"expected 19 MVP EnemyType values, found {len(source_types)}")
    for required in (GAME_PATH, PIXEL_RUNTIME_PATH, WIKI_PATH):
        if not required.exists():
            raise AssertionError(f"missing source-of-truth file: {required}")

    frames = {
        spec.id: {view: render_view(spec, view) for view in VIEWS}
        for spec in SPECS
    }
    entries = [
        validate_and_describe(spec, frames[spec.id], row)
        for row, spec in enumerate(SPECS)
    ]
    atlas = make_atlas(frames)
    if atlas.size != (64, 640):
        raise AssertionError(f"atlas grid mismatch: {atlas.size}")
    if any(alpha not in (0, 255) for alpha in atlas.getchannel("A").getdata()):
        raise AssertionError("atlas contains antialiased alpha")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS_PATH, optimize=True)
    make_contact(frames).save(CONTACT_PATH, optimize=True)
    manifest = {
        "schema_version": 2,
        "scope": "static art approval only; no GIF, runtime import, or src/assets mutation",
        "sources": [str(WIKI_PATH), str(TYPES_PATH), str(GAME_PATH), str(PIXEL_RUNTIME_PATH), str(SOURCE_ASSET_DIR)],
        "inventory": {
            "enemy_type_count": 19,
            "phase_variant_count": 1,
            "atlas_entry_count": len(SPECS),
            "boss_count": sum(spec.role == "boss" for spec in SPECS),
            "small_boss_count": 0,
            "small_boss_note": "MVP source defines no separate small-boss type; wiki 精英 entries are boss:true in game.ts.",
            "wiki_elite_badge_count": sum(spec.wiki_badge == "精英" for spec in SPECS),
            "wiki_elite_badge_ids": [spec.id for spec in SPECS if spec.wiki_badge == "精英"],
            "defined_but_not_stage_pool": [spec.id for spec in SPECS if spec.variant_of is None and not spec.stage_pool],
        },
        "grid": {
            "frame": [FRAME, FRAME],
            "views": list(VIEWS),
            "atlas": {"file": ATLAS_PATH.name, "size": list(atlas.size), "layout": "rows=entries, columns=front/side"},
            "approval": {"file": CONTACT_PATH.name, "scale": SCALE, "guides": "cyan collision pivot; amber root"},
        },
        "global_palette": {name: hex_color(color) for name, color in PALETTE.items()},
        "validation": {
            "all_frames_32x32": True,
            "binary_alpha_only": True,
            "palette_only": True,
            "max_colors_per_view": 8,
            "no_grid_edge_clipping": True,
            "front_side_unique": True,
            "grounded_roots_y30": True,
            "ai_generated_or_antialiased_edges": False,
        },
        "entries": entries,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(SPECS)} entries / {len(source_types)} EnemyType values")
    print(f"atlas: {ATLAS_PATH} ({ATLAS_PATH.stat().st_size} bytes)")
    print(f"approval: {CONTACT_PATH} ({CONTACT_PATH.stat().st_size} bytes)")
    print(f"manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
