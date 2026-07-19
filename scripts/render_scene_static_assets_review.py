#!/usr/bin/env python3
"""Generate isolated low-resolution scene art for static approval.

All sprites are code-drawn with a fixed project palette. AI concept sheets are
reference-only and no source pixels are copied from them.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


TILE = 32
PLINTH_SIZE = (48, 32)
TALL_CELL = (32, 64)
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-scene-static-assets-review-v1")

CLEAR = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
DEEP = (42, 38, 45, 255)
ASH = (72, 68, 72, 255)
PAPER_DARK = (151, 142, 130, 255)
PAPER = (210, 201, 183, 255)
PAPER_LIGHT = (229, 220, 201, 255)
OLD_RED_DARK = (102, 43, 54, 255)
OLD_RED = (157, 57, 74, 255)
RAIN_DARK = (126, 104, 37, 255)
RAIN = (167, 138, 45, 255)
RAIN_LIGHT = (205, 176, 85, 255)
BLUE_DARK = (70, 85, 91, 255)
BLUE = (113, 135, 142, 255)
BLUE_LIGHT = (161, 178, 180, 255)

PALETTE = {
    CLEAR, INK, DEEP, ASH,
    PAPER_DARK, PAPER, PAPER_LIGHT,
    OLD_RED_DARK, OLD_RED,
    RAIN_DARK, RAIN, RAIN_LIGHT,
    BLUE_DARK, BLUE, BLUE_LIGHT,
}


@dataclass(frozen=True)
class StageArtSpec:
    key: str
    chapter: str
    place: str
    tile_names: tuple[str, str, str, str]
    landmark_names: tuple[str, str, str, str]
    ground: tuple[int, int, int, int]
    line: tuple[int, int, int, int]
    accent: tuple[int, int, int, int]


STAGES = (
    StageArtSpec(
        "childhood", "童年", "床底王国",
        ("床板缝", "褪色方毯", "床底积灰", "粉笔积木"),
        ("床柱", "积木塔", "拉灯绳", "玩具箱"),
        DEEP, ASH, OLD_RED,
    ),
    StageArtSpec(
        "school", "少年", "千眼教室",
        ("蓝灰地胶", "作业横线", "千眼印记", "磨损方砖"),
        ("课桌", "铁皮柜", "千眼黑板", "红叉试卷"),
        DEEP, BLUE_DARK, OLD_RED,
    ),
    StageArtSpec(
        "station", "青年", "齿轮车站",
        ("站台水泥", "安全黄线", "齿轮铆钉", "旧铁轨板"),
        ("站台长椅", "晚点时钟", "进站闸机", "旧行李箱"),
        DEEP, ASH, RAIN,
    ),
    StageArtSpec(
        "home", "成年", "屋檐下的家",
        ("出租屋木地板", "旧花毯", "裂纹地砖", "墙角返潮"),
        ("上锁的门", "一只碗的饭桌", "父亲的落地灯", "雨衣衣架"),
        DEEP, PAPER_DARK, RAIN,
    ),
    StageArtSpec(
        "office", "中年", "没有关灯的办公室",
        ("工位方毯", "地面线槽", "日光灯倒影", "盖章废纸"),
        ("格子工位", "空转办公椅", "档案柜", "饮水机"),
        DEEP, BLUE_DARK, OLD_RED,
    ),
    StageArtSpec(
        "late", "暮年", "白发荒原",
        ("病房地胶", "白发积尘", "开裂白砖", "轮椅旧痕"),
        ("病床护栏", "空椅子", "输液架", "床头药柜"),
        DEEP, BLUE, PAPER,
    ),
)


def rgba(size: tuple[int, int], fill: tuple[int, int, int, int] = CLEAR) -> Image.Image:
    return Image.new("RGBA", size, fill)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def outline_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] = INK,
    fill: tuple[int, int, int, int] | None = None,
) -> None:
    x0, y0, x1, y1 = box
    if fill is not None:
        draw.rectangle(box, fill=fill)
    draw.line((x0, y0, x1, y0), fill=outline)
    draw.line((x0, y1, x1, y1), fill=outline)
    draw.line((x0, y0, x0, y1), fill=outline)
    draw.line((x1, y0, x1, y1), fill=outline)


def line(draw: ImageDraw.ImageDraw, points: tuple[int, ...], color=INK, width=1) -> None:
    draw.line(points, fill=color, width=width)


def force_tile_border(image: Image.Image, color: tuple[int, int, int, int]) -> None:
    pixels = image.load()
    for x in range(TILE):
        pixels[x, 0] = color
        pixels[x, TILE - 1] = color
    for y in range(TILE):
        pixels[0, y] = color
        pixels[TILE - 1, y] = color


def draw_tile(spec: StageArtSpec, variant: int) -> Image.Image:
    image = rgba((TILE, TILE), spec.ground)
    draw = ImageDraw.Draw(image)
    line_color = spec.line
    accent = spec.accent

    if spec.key == "childhood":
        if variant == 0:
            for x in (8, 16, 24):
                line(draw, (x, 1, x, 30), line_color)
            for x, y in ((5, 9), (20, 22), (27, 6)):
                draw.rectangle((x, y, x + 1, y + 1), fill=PAPER_DARK)
        elif variant == 1:
            for y in range(4, 29, 6):
                for x in range(4, 29, 6):
                    if (x + y) // 6 % 2:
                        draw.rectangle((x, y, x + 3, y + 3), fill=OLD_RED_DARK)
                    else:
                        draw.rectangle((x, y, x + 3, y + 3), fill=PAPER_DARK)
        elif variant == 2:
            for x, y in ((5, 6), (11, 24), (18, 9), (25, 20), (28, 12), (7, 17)):
                draw.point((x, y), fill=PAPER_DARK)
                draw.point((x + 1, y), fill=ASH)
            line(draw, (4, 27, 10, 23, 15, 27), ASH)
        else:
            for x, y, color in ((5, 6, OLD_RED), (19, 5, PAPER_DARK), (8, 20, RAIN), (23, 19, BLUE)):
                outline_rect(draw, (x, y, x + 5, y + 5), INK, color)
    elif spec.key == "school":
        if variant == 0:
            for p in (8, 16, 24):
                line(draw, (p, 1, p, 30), line_color)
                line(draw, (1, p, 30, p), line_color)
            for x, y in ((8, 8), (24, 16), (16, 24)):
                draw.point((x, y), fill=BLUE)
        elif variant == 1:
            for y in (6, 12, 18, 24):
                line(draw, (3, y, 28, y), BLUE_DARK)
            line(draw, (8, 3, 8, 28), OLD_RED_DARK)
            line(draw, (20, 20, 24, 24), OLD_RED)
            line(draw, (24, 20, 20, 24), OLD_RED)
        elif variant == 2:
            for cx, cy in ((8, 8), (23, 9), (14, 23), (27, 25)):
                line(draw, (cx - 3, cy, cx, cy - 2, cx + 3, cy, cx, cy + 2, cx - 3, cy), BLUE)
                draw.point((cx, cy), fill=PAPER)
        else:
            for y in (8, 16, 24):
                for x in (8, 16, 24):
                    color = BLUE_DARK if (x + y) // 8 % 2 else ASH
                    draw.rectangle((x - 3, y - 3, x + 2, y + 2), fill=color)
            draw.rectangle((21, 13, 24, 14), fill=OLD_RED)
    elif spec.key == "station":
        if variant == 0:
            for p in (10, 21):
                line(draw, (p, 1, p, 30), ASH)
                line(draw, (1, p, 30, p), ASH)
            for x, y in ((5, 5), (26, 5), (5, 26), (26, 26)):
                draw.point((x, y), fill=BLUE)
        elif variant == 1:
            draw.rectangle((1, 13, 30, 18), fill=RAIN_DARK)
            draw.rectangle((1, 14, 30, 16), fill=RAIN)
            for x in range(4, 29, 7):
                draw.rectangle((x, 14, x + 2, 16), fill=PAPER_DARK)
        elif variant == 2:
            for cx, cy in ((9, 9), (23, 10), (15, 24), (27, 25)):
                outline_rect(draw, (cx - 2, cy - 2, cx + 2, cy + 2), ASH)
                draw.point((cx, cy), fill=RAIN)
        else:
            for y in (7, 16, 25):
                draw.rectangle((2, y, 29, y + 2), fill=INK)
                for x in range(5, 29, 8):
                    draw.rectangle((x, y + 1, x + 2, y + 3), fill=ASH)
    elif spec.key == "home":
        if variant == 0:
            for y in (8, 16, 24):
                line(draw, (1, y, 30, y), PAPER_DARK)
            for x, y in ((9, 7), (21, 15), (14, 23), (27, 23)):
                draw.rectangle((x, y, x + 1, y + 1), fill=RAIN_DARK)
        elif variant == 1:
            for y in range(5, 28, 7):
                for x in range(5, 28, 7):
                    color = OLD_RED_DARK if (x + y) // 7 % 2 else RAIN_DARK
                    draw.polygon(((x, y - 2), (x + 2, y), (x, y + 2), (x - 2, y)), fill=color)
        elif variant == 2:
            for p in (11, 21):
                line(draw, (p, 1, p, 30), PAPER_DARK)
                line(draw, (1, p, 30, p), PAPER_DARK)
            line(draw, (15, 4, 13, 10, 18, 15, 16, 23), ASH)
        else:
            draw.rectangle((4, 20, 14, 27), fill=BLUE_DARK)
            draw.rectangle((19, 5, 28, 12), fill=BLUE_DARK)
            for x, y in ((6, 18), (15, 26), (22, 14), (27, 4)):
                draw.point((x, y), fill=BLUE)
    elif spec.key == "office":
        if variant == 0:
            for p in (8, 16, 24):
                line(draw, (p, 1, p, 30), ASH)
                line(draw, (1, p, 30, p), ASH)
            draw.rectangle((10, 10, 14, 14), fill=BLUE_DARK)
            draw.rectangle((18, 18, 22, 22), fill=BLUE_DARK)
        elif variant == 1:
            line(draw, (3, 8, 12, 8, 12, 24, 27, 24), BLUE_DARK, 2)
            line(draw, (7, 4, 7, 20, 23, 20, 23, 28), OLD_RED_DARK)
            for x, y in ((12, 8), (12, 24), (23, 20)):
                draw.rectangle((x - 1, y - 1, x + 1, y + 1), fill=INK)
        elif variant == 2:
            draw.rectangle((5, 4, 26, 7), fill=BLUE_DARK)
            draw.rectangle((8, 13, 23, 15), fill=BLUE)
            draw.rectangle((11, 22, 20, 23), fill=BLUE_LIGHT)
        else:
            for x, y in ((5, 5), (18, 4), (9, 19), (21, 18)):
                draw.rectangle((x, y, x + 7, y + 5), fill=PAPER_DARK)
                draw.line((x + 1, y + 2, x + 5, y + 2), fill=ASH)
            draw.rectangle((23, 23, 27, 26), fill=OLD_RED)
    else:
        if variant == 0:
            for p in (10, 21):
                line(draw, (p, 1, p, 30), BLUE_DARK)
                line(draw, (1, p, 30, p), BLUE_DARK)
            draw.rectangle((12, 12, 19, 18), fill=BLUE)
        elif variant == 1:
            for x, y in ((4, 6), (10, 22), (17, 8), (23, 25), (28, 14), (7, 16), (20, 18)):
                draw.point((x, y), fill=PAPER)
                if (x + y) % 2:
                    draw.point((x + 1, y), fill=BLUE_LIGHT)
        elif variant == 2:
            for p in (9, 20):
                line(draw, (p, 1, p, 30), BLUE_DARK)
                line(draw, (1, p, 30, p), BLUE_DARK)
            line(draw, (4, 25, 10, 19, 8, 13, 16, 7, 21, 13, 27, 9), PAPER_DARK)
        else:
            line(draw, (4, 8, 27, 8), BLUE_DARK, 2)
            line(draw, (6, 22, 25, 22), BLUE_DARK, 2)
            for x, y in ((8, 11), (11, 14), (21, 24), (24, 27)):
                draw.rectangle((x, y, x + 2, y + 4), fill=PAPER_DARK)

    force_tile_border(image, spec.ground)
    return image


def draw_landmark(stage_key: str, variant: int) -> Image.Image:
    image = rgba((TILE, TILE))
    draw = ImageDraw.Draw(image)

    if stage_key == "childhood":
        if variant == 0:
            draw.rectangle((13, 8, 18, 29), fill=INK)
            draw.rectangle((15, 9, 16, 27), fill=PAPER_DARK)
            draw.rectangle((11, 5, 20, 10), fill=INK)
            draw.rectangle((13, 4, 18, 7), fill=OLD_RED_DARK)
        elif variant == 1:
            for box, color in (((5, 21, 14, 28), OLD_RED), ((15, 21, 25, 28), RAIN), ((10, 12, 20, 20), BLUE)):
                outline_rect(draw, box, INK, color)
            draw.point((13, 15), fill=PAPER_LIGHT)
        elif variant == 2:
            line(draw, (16, 3, 16, 22), PAPER_DARK)
            outline_rect(draw, (12, 21, 20, 27), INK)
            outline_rect(draw, (14, 23, 18, 25), PAPER)
        else:
            outline_rect(draw, (4, 13, 27, 27), INK, PAPER_DARK)
            draw.rectangle((3, 11, 28, 15), fill=INK)
            draw.rectangle((5, 12, 26, 13), fill=OLD_RED_DARK)
            outline_rect(draw, (14, 17, 18, 21), INK, RAIN)
    elif stage_key == "school":
        if variant == 0:
            draw.rectangle((3, 12, 28, 16), fill=INK)
            draw.rectangle((5, 13, 26, 14), fill=PAPER_DARK)
            draw.rectangle((5, 16, 7, 29), fill=INK)
            draw.rectangle((24, 16, 26, 29), fill=INK)
            draw.rectangle((10, 7, 22, 11), fill=OLD_RED_DARK)
        elif variant == 1:
            outline_rect(draw, (8, 3, 24, 29), INK, BLUE_DARK)
            line(draw, (8, 16, 24, 16), INK)
            for y in (7, 10, 21, 24):
                line(draw, (12, y, 20, y), BLUE_LIGHT)
            draw.point((21, 18), fill=OLD_RED)
        elif variant == 2:
            outline_rect(draw, (3, 5, 28, 25), INK, DEEP)
            line(draw, (8, 15, 15, 10, 23, 15, 15, 20, 8, 15), BLUE)
            draw.rectangle((13, 13, 17, 17), fill=PAPER)
            draw.rectangle((6, 26, 12, 28), fill=PAPER_DARK)
        else:
            draw.rectangle((9, 5, 25, 26), fill=INK)
            draw.rectangle((7, 7, 23, 28), fill=PAPER)
            draw.rectangle((10, 10, 20, 11), fill=ASH)
            line(draw, (11, 15, 20, 24), OLD_RED, 2)
            line(draw, (20, 15, 11, 24), OLD_RED, 2)
    elif stage_key == "station":
        if variant == 0:
            draw.rectangle((3, 14, 28, 18), fill=INK)
            draw.rectangle((5, 15, 26, 16), fill=PAPER_DARK)
            draw.rectangle((6, 18, 8, 29), fill=INK)
            draw.rectangle((23, 18, 25, 29), fill=INK)
        elif variant == 1:
            draw.rectangle((14, 13, 17, 29), fill=INK)
            outline_rect(draw, (7, 3, 24, 17), INK, BLUE_DARK)
            draw.rectangle((10, 6, 21, 14), fill=PAPER_DARK)
            line(draw, (15, 10, 15, 6), OLD_RED)
            line(draw, (15, 10, 19, 12), OLD_RED)
        elif variant == 2:
            draw.rectangle((6, 7, 10, 29), fill=INK)
            draw.rectangle((21, 7, 25, 29), fill=INK)
            line(draw, (8, 16, 23, 16), RAIN, 3)
            draw.rectangle((13, 14, 17, 18), fill=INK)
        else:
            outline_rect(draw, (6, 12, 26, 28), INK, OLD_RED_DARK)
            outline_rect(draw, (10, 8, 21, 13), INK, PAPER_DARK)
            line(draw, (16, 13, 16, 27), RAIN_DARK)
            draw.rectangle((8, 25, 24, 27), fill=ASH)
    elif stage_key == "home":
        if variant == 0:
            outline_rect(draw, (8, 3, 24, 29), INK, DEEP)
            outline_rect(draw, (11, 6, 21, 26), PAPER_DARK)
            draw.rectangle((13, 15, 19, 17), fill=OLD_RED_DARK)
            draw.point((20, 17), fill=RAIN_LIGHT)
        elif variant == 1:
            draw.rectangle((3, 17, 28, 21), fill=INK)
            draw.rectangle((6, 18, 25, 19), fill=PAPER_DARK)
            draw.rectangle((6, 21, 8, 29), fill=INK)
            draw.rectangle((23, 21, 25, 29), fill=INK)
            line(draw, (12, 15, 15, 17, 19, 17, 22, 15), PAPER)
        elif variant == 2:
            draw.rectangle((15, 12, 17, 29), fill=INK)
            draw.polygon(((8, 12), (24, 12), (20, 5), (12, 5)), fill=INK)
            draw.polygon(((11, 11), (21, 11), (19, 7), (13, 7)), fill=RAIN)
            draw.rectangle((13, 28, 19, 29), fill=ASH)
        else:
            draw.rectangle((15, 4, 17, 29), fill=INK)
            line(draw, (16, 7, 9, 12), INK, 2)
            line(draw, (16, 8, 24, 12), INK, 2)
            draw.polygon(((18, 10), (25, 13), (23, 27), (16, 26), (16, 13)), fill=INK)
            draw.polygon(((19, 12), (23, 14), (21, 25), (18, 24)), fill=RAIN)
    elif stage_key == "office":
        if variant == 0:
            draw.rectangle((3, 13, 28, 17), fill=INK)
            draw.rectangle((5, 14, 26, 15), fill=BLUE_DARK)
            outline_rect(draw, (10, 4, 22, 13), INK, DEEP)
            draw.rectangle((12, 6, 20, 10), fill=BLUE)
            draw.rectangle((5, 17, 7, 29), fill=INK)
            draw.rectangle((24, 17, 26, 29), fill=INK)
        elif variant == 1:
            outline_rect(draw, (9, 12, 23, 23), INK, ASH)
            draw.rectangle((14, 23, 18, 28), fill=INK)
            draw.rectangle((8, 28, 24, 29), fill=INK)
            draw.rectangle((11, 7, 21, 13), fill=BLUE_DARK)
        elif variant == 2:
            outline_rect(draw, (8, 3, 24, 29), INK, ASH)
            for y in (9, 16, 23):
                line(draw, (8, y, 24, y), INK)
                draw.rectangle((18, y + 2, 21, y + 3), fill=PAPER_DARK)
            draw.rectangle((20, 18, 22, 20), fill=OLD_RED)
        else:
            outline_rect(draw, (9, 5, 23, 29), INK, BLUE_DARK)
            draw.rectangle((11, 7, 21, 16), fill=BLUE_LIGHT)
            draw.rectangle((13, 18, 19, 24), fill=PAPER_DARK)
            draw.rectangle((14, 3, 18, 6), fill=BLUE)
            draw.point((20, 26), fill=OLD_RED)
    else:
        if variant == 0:
            draw.rectangle((3, 18, 28, 21), fill=INK)
            for x in (5, 12, 19, 26):
                draw.rectangle((x, 9, x + 1, 26), fill=BLUE)
            draw.rectangle((4, 26, 28, 29), fill=INK)
        elif variant == 1:
            outline_rect(draw, (8, 12, 24, 25), INK, ASH)
            draw.rectangle((10, 6, 22, 13), fill=INK)
            draw.rectangle((12, 8, 20, 11), fill=BLUE_DARK)
            draw.rectangle((10, 25, 12, 29), fill=INK)
            draw.rectangle((20, 25, 22, 29), fill=INK)
        elif variant == 2:
            draw.rectangle((15, 6, 17, 29), fill=INK)
            draw.rectangle((7, 8, 25, 10), fill=INK)
            draw.rectangle((8, 9, 13, 11), fill=BLUE)
            draw.rectangle((19, 9, 24, 11), fill=BLUE)
            outline_rect(draw, (11, 20, 21, 25), INK, PAPER_DARK)
        else:
            outline_rect(draw, (7, 10, 25, 29), INK, BLUE_DARK)
            line(draw, (7, 17, 25, 17), INK)
            outline_rect(draw, (12, 4, 20, 11), INK, PAPER_DARK)
            draw.rectangle((14, 6, 18, 8), fill=OLD_RED)
            draw.rectangle((10, 22, 15, 25), fill=PAPER)
    return image


def draw_plinth(kind: str) -> Image.Image:
    image = rgba(PLINTH_SIZE)
    draw = ImageDraw.Draw(image)
    if kind == "reward":
        draw.rectangle((5, 22, 42, 29), fill=INK)
        draw.rectangle((8, 20, 39, 24), fill=ASH)
        draw.rectangle((12, 16, 35, 21), fill=INK)
        draw.rectangle((14, 17, 33, 19), fill=PAPER_DARK)
        draw.rectangle((22, 13, 25, 17), fill=OLD_RED)
    elif kind == "shop":
        draw.rectangle((3, 13, 44, 29), fill=INK)
        draw.rectangle((5, 15, 42, 27), fill=DEEP)
        draw.rectangle((2, 11, 45, 15), fill=RAIN_DARK)
        draw.rectangle((4, 12, 43, 13), fill=RAIN)
        for x in (10, 22, 34):
            outline_rect(draw, (x - 4, 18, x + 3, 25), ASH)
        draw.rectangle((22, 6, 25, 10), fill=RAIN_LIGHT)
    elif kind == "light":
        draw.rectangle((6, 23, 41, 29), fill=INK)
        draw.rectangle((9, 20, 38, 24), fill=RAIN_DARK)
        draw.rectangle((13, 17, 34, 21), fill=INK)
        draw.rectangle((19, 8, 28, 18), fill=INK)
        draw.rectangle((21, 9, 26, 16), fill=RAIN_LIGHT)
        for x, y in ((16, 10), (31, 12), (18, 5), (29, 6)):
            draw.point((x, y), fill=RAIN)
    else:
        draw.rectangle((5, 23, 42, 29), fill=INK)
        draw.rectangle((8, 20, 39, 24), fill=BLUE_DARK)
        draw.rectangle((12, 14, 35, 21), fill=INK)
        draw.rectangle((14, 16, 33, 19), fill=BLUE)
        line(draw, (18, 15, 29, 20), OLD_RED)
        line(draw, (29, 15, 18, 20), OLD_RED)
        draw.rectangle((22, 9, 25, 14), fill=PAPER_DARK)
    return image


def draw_merchant() -> Image.Image:
    image = rgba((32, 48))
    draw = ImageDraw.Draw(image)
    draw.polygon(((9, 4), (22, 4), (26, 10), (24, 19), (20, 22), (11, 22), (7, 18), (6, 10)), fill=INK)
    draw.rectangle((10, 11, 21, 19), fill=DEEP)
    draw.rectangle((12, 15, 19, 17), fill=ASH)
    draw.point((14, 15), fill=BLUE_LIGHT)
    draw.polygon(((8, 20), (23, 20), (27, 43), (20, 45), (11, 45), (5, 43)), fill=INK)
    draw.polygon(((10, 22), (21, 22), (23, 41), (19, 43), (12, 43), (8, 41)), fill=DEEP)
    draw.rectangle((11, 27, 20, 39), fill=ASH)
    draw.rectangle((13, 29, 18, 37), fill=PAPER_DARK)
    draw.rectangle((4, 27, 9, 31), fill=INK)
    draw.rectangle((22, 27, 27, 31), fill=INK)
    draw.rectangle((5, 28, 7, 29), fill=PAPER_DARK)
    draw.rectangle((24, 28, 26, 29), fill=PAPER_DARK)
    draw.rectangle((12, 44, 15, 46), fill=INK)
    draw.rectangle((17, 44, 20, 46), fill=INK)
    draw.point((16, 35), fill=RAIN_LIGHT)
    return image


def draw_door(kind: str) -> Image.Image:
    image = rgba((32, 48))
    draw = ImageDraw.Draw(image)
    warm = kind == "light"
    frame = RAIN_DARK if warm else BLUE_DARK
    panel = DEEP if warm else INK
    outline_rect(draw, (3, 1, 28, 46), INK, frame)
    outline_rect(draw, (6, 4, 25, 45), frame, panel)
    if warm:
        outline_rect(draw, (9, 8, 22, 21), INK, RAIN)
        draw.rectangle((11, 10, 20, 18), fill=RAIN_LIGHT)
        draw.rectangle((15, 25, 17, 40), fill=RAIN_DARK)
        draw.point((21, 28), fill=PAPER_LIGHT)
        draw.point((8, 5), fill=RAIN_LIGHT)
        draw.point((23, 5), fill=RAIN_LIGHT)
    else:
        draw.rectangle((8, 8, 23, 12), fill=BLUE)
        draw.rectangle((10, 10, 21, 11), fill=BLUE_LIGHT)
        draw.rectangle((8, 27, 23, 31), fill=BLUE_DARK)
        draw.rectangle((10, 28, 21, 29), fill=OLD_RED)
        line(draw, (10, 17, 21, 23), OLD_RED_DARK)
        line(draw, (21, 17, 10, 23), OLD_RED_DARK)
        draw.point((23, 35), fill=PAPER_DARK)
    return image


def draw_coin() -> Image.Image:
    image = rgba((8, 8))
    draw = ImageDraw.Draw(image)
    draw.rectangle((2, 1, 5, 6), fill=INK)
    draw.rectangle((1, 2, 6, 5), fill=INK)
    draw.rectangle((2, 2, 5, 5), fill=RAIN)
    draw.rectangle((3, 2, 4, 4), fill=RAIN_LIGHT)
    draw.point((5, 5), fill=RAIN_DARK)
    return image


def draw_reward_beam() -> Image.Image:
    image = rgba((32, 64))
    draw = ImageDraw.Draw(image)
    draw.polygon(((13, 2), (18, 2), (24, 58), (7, 58)), fill=RAIN_DARK)
    draw.polygon(((15, 4), (17, 4), (20, 58), (11, 58)), fill=RAIN)
    draw.rectangle((14, 9, 17, 54), fill=RAIN_LIGHT)
    # Binary-alpha dithering softens the silhouette without translucent pixels.
    for y in range(6, 60, 4):
        draw.point((10 + (y // 4) % 3, y), fill=PAPER)
        draw.point((21 - (y // 4) % 3, y + 1), fill=PAPER_DARK)
    for x, y, color in (
        (5, 52, RAIN), (26, 49, RAIN), (9, 61, PAPER), (22, 62, PAPER),
        (4, 34, RAIN_DARK), (27, 29, RAIN_DARK), (8, 18, PAPER_DARK), (24, 14, PAPER_DARK),
    ):
        draw.point((x, y), fill=color)
    return image


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def validate_palette_alpha(image: Image.Image, label: str) -> dict[str, object]:
    colors = set(image.getdata())
    alpha_values = {color[3] for color in colors}
    if not alpha_values <= {0, 255}:
        raise AssertionError(f"partial alpha: {label} {alpha_values}")
    if not colors <= PALETTE:
        raise AssertionError(f"palette escape: {label} {colors - PALETTE}")
    return {
        "binary_alpha": True,
        "colors": ["#%02x%02x%02x%02x" % color for color in sorted(colors)],
    }


def validate_tile(image: Image.Image, label: str) -> dict[str, object]:
    record = validate_palette_alpha(image, label)
    if image.size != (TILE, TILE):
        raise AssertionError(f"tile size: {label} {image.size}")
    if any(pixel[3] != 255 for pixel in image.getdata()):
        raise AssertionError(f"tile transparency: {label}")
    pixels = image.load()
    horizontal = all(pixels[0, y] == pixels[TILE - 1, y] for y in range(TILE))
    vertical = all(pixels[x, 0] == pixels[x, TILE - 1] for x in range(TILE))
    if not horizontal or not vertical:
        raise AssertionError(f"non-seamless tile edge: {label}")
    return {**record, "size": [TILE, TILE], "seamless_x": True, "seamless_y": True}


def validate_sprite(
    image: Image.Image,
    expected: tuple[int, int],
    label: str,
    require_margin: bool = True,
) -> dict[str, object]:
    record = validate_palette_alpha(image, label)
    if image.size != expected:
        raise AssertionError(f"sprite size: {label} {image.size} != {expected}")
    bbox = alpha_bbox(image)
    if bbox is None:
        raise AssertionError(f"empty sprite: {label}")
    if require_margin and (bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= expected[0] or bbox[3] >= expected[1]):
        raise AssertionError(f"sprite clipping risk: {label} {bbox}")
    return {
        **record,
        "size": list(expected),
        "bbox": list(bbox),
        "opaque_pixels": sum(pixel[3] > 0 for pixel in image.getdata()),
        "no_edge_clip": not require_margin or True,
    }


def stage_atlas(groups: dict[str, list[Image.Image]]) -> Image.Image:
    atlas = rgba((TILE * 4, TILE * len(STAGES)))
    for row, stage in enumerate(STAGES):
        for column, image in enumerate(groups[stage.key]):
            atlas.alpha_composite(image, (column * TILE, row * TILE))
    return atlas


def plinth_atlas(plinths: dict[str, Image.Image]) -> Image.Image:
    atlas = rgba((PLINTH_SIZE[0] * 4, PLINTH_SIZE[1]))
    for column, kind in enumerate(("reward", "shop", "light", "inner")):
        atlas.alpha_composite(plinths[kind], (column * PLINTH_SIZE[0], 0))
    return atlas


def tall_atlas(assets: dict[str, Image.Image]) -> tuple[Image.Image, dict[str, list[int]]]:
    names = ("merchant", "light-door", "inner-door", "reward-beam")
    atlas = rgba((TALL_CELL[0] * len(names), TALL_CELL[1]))
    rects: dict[str, list[int]] = {}
    for column, name in enumerate(names):
        image = assets[name]
        y = TALL_CELL[1] - image.height
        x = column * TALL_CELL[0]
        atlas.alpha_composite(image, (x, y))
        rects[name] = [x, y, image.width, image.height]
    return atlas, rects


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = (
        Path("/System/Library/Fonts/STHeiti Light.ttc"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
        Path("/System/Library/Fonts/Monaco.ttf"),
        Path("/System/Library/Fonts/SFNSMono.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
    )
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def make_stage_approval(
    tiles: dict[str, list[Image.Image]],
    landmarks: dict[str, list[Image.Image]],
) -> Image.Image:
    scale = 6
    label_w = 180
    header_h = 36
    cell = TILE * scale
    result = Image.new("RGB", (label_w + cell * 8, header_h + cell * len(STAGES)), (19, 18, 24))
    draw = ImageDraw.Draw(result)
    header_font = load_font(13)
    label_font = load_font(13)
    for column in range(8):
        title = f"GROUND {column + 1}" if column < 4 else f"OBJECT {column - 3}"
        draw.text((label_w + column * cell + 8, 10), title, fill=(211, 202, 185), font=header_font)
    for row, stage in enumerate(STAGES):
        y = header_h + row * cell
        draw.text((8, y + 10), stage.chapter, fill=(210, 201, 183), font=label_font)
        draw.text((8, y + 30), stage.place, fill=(151, 142, 130), font=label_font)
        if row:
            draw.line((0, y, result.width, y), fill=(67, 57, 70))
        for column, tile in enumerate(tiles[stage.key]):
            scaled = tile.resize((cell, cell), Image.Resampling.NEAREST).convert("RGB")
            result.paste(scaled, (label_w + column * cell, y))
        for local_column, landmark in enumerate(landmarks[stage.key]):
            panel = rgba((TILE, TILE), (43, 38, 48, 255))
            panel.alpha_composite(landmark)
            scaled = panel.resize((cell, cell), Image.Resampling.NEAREST).convert("RGB")
            result.paste(scaled, (label_w + (4 + local_column) * cell, y))
    return result


def make_special_approval(
    plinths: dict[str, Image.Image],
    tall_assets: dict[str, Image.Image],
    coin: Image.Image,
) -> Image.Image:
    scale = 8
    width = PLINTH_SIZE[0] * scale * 4
    header_h = 34
    plinth_h = PLINTH_SIZE[1] * scale
    actor_h = 64 * scale
    result = Image.new("RGB", (width, header_h * 2 + plinth_h + actor_h), (19, 18, 24))
    draw = ImageDraw.Draw(result)
    font = load_font(13)
    plinth_names = (("reward", "REWARD"), ("shop", "SHOP"), ("light", "LIGHT ROOM"), ("inner", "INNER ROOM"))
    for column, (key, label) in enumerate(plinth_names):
        x = column * PLINTH_SIZE[0] * scale
        draw.text((x + 8, 10), label, fill=(211, 202, 185), font=font)
        panel = rgba(PLINTH_SIZE, (43, 38, 48, 255))
        panel.alpha_composite(plinths[key])
        result.paste(panel.resize((PLINTH_SIZE[0] * scale, plinth_h), Image.Resampling.NEAREST).convert("RGB"), (x, header_h))

    actor_y = header_h + plinth_h + header_h
    actor_names = (("merchant", "MERCHANT"), ("light-door", "LIGHT DOOR"), ("inner-door", "INNER DOOR"), ("reward-beam", "REWARD BEAM"))
    actor_cell_w = 32 * scale
    for column, (key, label) in enumerate(actor_names):
        x = column * actor_cell_w
        draw.text((x + 8, header_h + plinth_h + 10), label, fill=(211, 202, 185), font=font)
        panel = rgba((32, 64), (43, 38, 48, 255))
        asset = tall_assets[key]
        panel.alpha_composite(asset, (0, 64 - asset.height))
        result.paste(panel.resize((actor_cell_w, actor_h), Image.Resampling.NEAREST).convert("RGB"), (x, actor_y))

    coin_x = actor_cell_w * 4 + 32
    draw.text((coin_x, header_h + plinth_h + 10), "COIN 8x8", fill=(211, 202, 185), font=font)
    coin_panel = rgba((16, 16), (43, 38, 48, 255))
    coin_panel.alpha_composite(coin, (4, 4))
    result.paste(coin_panel.resize((128, 128), Image.Resampling.NEAREST).convert("RGB"), (coin_x, actor_y + 48))
    return result


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    tiles = {stage.key: [draw_tile(stage, index) for index in range(4)] for stage in STAGES}
    landmarks = {stage.key: [draw_landmark(stage.key, index) for index in range(4)] for stage in STAGES}
    plinths = {kind: draw_plinth(kind) for kind in ("reward", "shop", "light", "inner")}
    merchant = draw_merchant()
    doors = {"light-door": draw_door("light"), "inner-door": draw_door("inner")}
    coin = draw_coin()
    beam = draw_reward_beam()
    tall_assets = {"merchant": merchant, **doors, "reward-beam": beam}

    validation: dict[str, object] = {"stages": {}, "special": {}}
    for stage in STAGES:
        tile_records = [validate_tile(image, f"{stage.key}/tile-{index}") for index, image in enumerate(tiles[stage.key])]
        landmark_records = [
            validate_sprite(image, (32, 32), f"{stage.key}/landmark-{index}")
            for index, image in enumerate(landmarks[stage.key])
        ]
        if len({image.tobytes() for image in tiles[stage.key]}) != 4:
            raise AssertionError(f"duplicate ground tiles: {stage.key}")
        if len({image.tobytes() for image in landmarks[stage.key]}) != 4:
            raise AssertionError(f"duplicate landmarks: {stage.key}")
        validation["stages"][stage.key] = {"tiles": tile_records, "landmarks": landmark_records}

    for kind, image in plinths.items():
        validation["special"][f"{kind}-plinth"] = validate_sprite(image, PLINTH_SIZE, f"{kind}-plinth")
    validation["special"]["merchant"] = validate_sprite(merchant, (32, 48), "merchant")
    validation["special"]["light-door"] = validate_sprite(doors["light-door"], (32, 48), "light-door")
    validation["special"]["inner-door"] = validate_sprite(doors["inner-door"], (32, 48), "inner-door")
    validation["special"]["coin"] = validate_sprite(coin, (8, 8), "coin")
    validation["special"]["reward-beam"] = validate_sprite(beam, (32, 64), "reward-beam")

    tile_atlas_path = OUTPUT_DIR / "scene-ground-tiles-atlas.png"
    landmark_atlas_path = OUTPUT_DIR / "scene-landmarks-atlas.png"
    plinth_atlas_path = OUTPUT_DIR / "scene-special-plinths-atlas.png"
    tall_atlas_path = OUTPUT_DIR / "scene-special-tall-atlas.png"
    coin_path = OUTPUT_DIR / "scene-coin-8x8.png"
    merchant_path = OUTPUT_DIR / "scene-merchant-32x48.png"
    light_door_path = OUTPUT_DIR / "scene-light-door-32x48.png"
    inner_door_path = OUTPUT_DIR / "scene-inner-door-32x48.png"
    beam_path = OUTPUT_DIR / "scene-reward-beam-32x64.png"
    stage_approval_path = OUTPUT_DIR / "scene-stage-assets-approval-6x.png"
    special_approval_path = OUTPUT_DIR / "scene-special-assets-approval-8x.png"

    stage_atlas(tiles).save(tile_atlas_path, optimize=True)
    stage_atlas(landmarks).save(landmark_atlas_path, optimize=True)
    plinth_atlas(plinths).save(plinth_atlas_path, optimize=True)
    tall_sheet, tall_rects = tall_atlas(tall_assets)
    tall_sheet.save(tall_atlas_path, optimize=True)
    coin.save(coin_path, optimize=True)
    merchant.save(merchant_path, optimize=True)
    doors["light-door"].save(light_door_path, optimize=True)
    doors["inner-door"].save(inner_door_path, optimize=True)
    beam.save(beam_path, optimize=True)
    make_stage_approval(tiles, landmarks).save(stage_approval_path, optimize=True)
    make_special_approval(plinths, tall_assets, coin).save(special_approval_path, optimize=True)

    artifact_paths = {
        "ground_atlas": tile_atlas_path,
        "landmark_atlas": landmark_atlas_path,
        "plinth_atlas": plinth_atlas_path,
        "tall_atlas": tall_atlas_path,
        "coin": coin_path,
        "merchant": merchant_path,
        "light_door": light_door_path,
        "inner_door": inner_door_path,
        "reward_beam": beam_path,
        "stage_approval": stage_approval_path,
        "special_approval": special_approval_path,
    }
    manifest = {
        "review_only": True,
        "runtime_integration": False,
        "gif_output": False,
        "ai_concept_pixels_used": False,
        "palette": ["#%02x%02x%02x%02x" % color for color in sorted(PALETTE)],
        "stage_order": [stage.key for stage in STAGES],
        "stages": {
            stage.key: {
                "chapter": stage.chapter,
                "place": stage.place,
                "ground_tile_names": list(stage.tile_names),
                "landmark_names": list(stage.landmark_names),
                "ground_atlas_row": row,
                "landmark_atlas_row": row,
                "cell": [32, 32],
            }
            for row, stage in enumerate(STAGES)
        },
        "atlases": {
            "ground": {"size": [128, 192], "cell": [32, 32], "columns": 4, "rows": 6},
            "landmarks": {"size": [128, 192], "cell": [32, 32], "columns": 4, "rows": 6},
            "plinths": {
                "size": [192, 32], "cell": [48, 32],
                "order": ["reward", "shop", "light", "inner"],
            },
            "tall": {"size": [128, 64], "cell": [32, 64], "rects": tall_rects},
            "coin": {"size": [8, 8]},
        },
        "validation": validation,
        "artifacts": {
            name: {"path": path.name, "bytes": path.stat().st_size, "sha256": file_sha256(path)}
            for name, path in artifact_paths.items()
        },
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8"
    )
    print(f"wrote scene static approval set to {OUTPUT_DIR}")
    print("stage modules: 6 x (4 tiles + 4 landmarks)")
    print(f"artifact bytes: {sum(path.stat().st_size for path in artifact_paths.values())}")


if __name__ == "__main__":
    main()
