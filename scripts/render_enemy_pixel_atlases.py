#!/usr/bin/env python3
"""Generate the low-resolution enemy atlases used by the runtime renderer."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


FRAME = 32
MOTIONS = {"idle": 2, "move": 4, "attack": 2, "hurt": 2, "death": 4}
MOTION_ROWS = {motion: row for row, motion in enumerate(MOTIONS)}
ENEMIES = (
    "fear",
    "red-mark",
    "whisper",
    "clockwork",
    "debt",
    "silent-father",
    "silent-father-p2",
    "lamp-keeper",
    "uniform-answer",
    "cry-moth",
    "hunger-shadow",
    "closet-dark",
    "missed-call",
    "silence",
    "badge-thief",
    "debt-collector",
    "forgetter",
    "empty-chair",
    "last-bus",
)
ASSET_DIR = Path("src/assets/enemies")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-enemies-v1")

TRANSPARENT = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
PAPER = (218, 208, 186, 255)
SKIN = (199, 181, 158, 255)
SHADOW = (146, 119, 100, 255)
RED = (166, 54, 73, 255)
RED_DARK = (112, 39, 55, 255)
VIOLET = (110, 82, 108, 255)
VIOLET_LIGHT = (157, 127, 151, 255)
BRASS = (165, 139, 98, 255)
BRASS_LIGHT = (200, 176, 120, 255)
RAIN = (167, 138, 45, 255)
RAIN_LIGHT = (208, 177, 79, 255)
SIGNAL = (126, 174, 174, 255)
HURT = (176, 47, 67, 255)


def blank() -> Image.Image:
    return Image.new("RGBA", (FRAME, FRAME), TRANSPARENT)


def shifted(image: Image.Image, dx: int, dy: int = 0) -> Image.Image:
    result = blank()
    result.alpha_composite(image, (dx, dy))
    return result


def recolor_hurt(image: Image.Image) -> Image.Image:
    result = image.copy()
    pixels = result.load()
    for y in range(FRAME):
        for x in range(FRAME):
            if pixels[x, y] in {INK, COAL}:
                pixels[x, y] = HURT
    return result


def draw_fear(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 1)[frame] if motion == "move" else 0
    top = 4 + bob
    bottom = 28 + bob
    draw.polygon([
        (6, bottom), (6, 15 + bob), (8, 9 + bob), (11, 6 + bob),
        (13, top), (16, 6 + bob), (19, top + 1), (22, 8 + bob),
        (25, 14 + bob), (26, bottom), (21, 27 + bob), (18, 29 + bob),
        (14, 27 + bob), (10, 29 + bob),
    ], fill=INK)
    draw.rectangle((8, 15 + bob, 23, 25 + bob), fill=COAL)
    eye_y = 13 + bob
    if motion == "idle" and frame == 1:
        draw.line((10, eye_y, 13, eye_y), fill=PAPER)
        draw.line((19, eye_y, 22, eye_y), fill=PAPER)
    else:
        draw.rectangle((10, eye_y - 1, 13, eye_y + 1), fill=PAPER)
        draw.rectangle((19, eye_y - 1, 22, eye_y + 1), fill=PAPER)
        draw.point((12, eye_y), fill=RED_DARK)
        draw.point((20, eye_y), fill=RED_DARK)
    if motion == "attack":
        mouth_h = 3 + frame * 2
        draw.rectangle((12, 19 + bob, 20, 19 + bob + mouth_h), fill=INK)
        draw.rectangle((14, 20 + bob, 18, 20 + bob + max(1, mouth_h - 2)), fill=VIOLET_LIGHT)
        draw.line((5, 19 + bob, 2 - frame, 17 + bob), fill=WORN, width=1)
        draw.line((26, 19 + bob, 29 + frame, 17 + bob), fill=WORN, width=1)
    else:
        draw.rectangle((14, 20 + bob, 18, 22 + bob), fill=INK)
        draw.point((16, 21 + bob), fill=WORN)
    draw.point((8 + frame % 2, bottom), fill=COAL)
    draw.point((23 - frame % 2, bottom), fill=COAL)
    if motion == "hurt":
        image = recolor_hurt(image)
        draw = ImageDraw.Draw(image)
        draw.line((11 + frame, 8, 18 - frame, 17), fill=PAPER)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_red_mark(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 1)[frame] if motion == "move" else 0
    skew = (-1, 0, 1, 0)[frame] if motion == "move" else 0
    left, right = 7 + skew, 25 + skew
    top, bottom = 3 + bob, 29 + bob
    draw.polygon([
        (left + 2, top), (left + 6, top + 1), (left + 9, top),
        (right, top + 2), (right - 1, bottom - 2), (right - 4, bottom),
        (right - 7, bottom - 1), (left + 5, bottom), (left, bottom - 3),
        (left + 1, top + 3),
    ], fill=INK)
    draw.polygon([
        (left + 3, top + 2), (right - 2, top + 3), (right - 3, bottom - 3),
        (left + 4, bottom - 2), (left + 2, bottom - 4),
    ], fill=PAPER)
    cross_size = 5 + (frame if motion == "attack" else 0)
    center_x, center_y = 16 + skew, 16 + bob
    draw.line((center_x - cross_size, center_y - cross_size, center_x + cross_size, center_y + cross_size), fill=RED, width=3)
    draw.line((center_x + cross_size, center_y - cross_size, center_x - cross_size, center_y + cross_size), fill=RED, width=3)
    draw.line((left + 5, top + 6, right - 5, top + 6), fill=WORN)
    draw.line((left + 5, bottom - 5, right - 6, bottom - 5), fill=SHADOW)
    if motion == "idle" and frame == 1:
        draw.line((left + 2, top + 3, left + 5, top + 5), fill=SHADOW)
    if motion == "attack":
        draw.line((left - frame, center_y, 2, center_y + 2), fill=RED_DARK, width=2)
        draw.line((right + frame, center_y, 30, center_y - 2), fill=RED_DARK, width=2)
    if motion == "hurt":
        draw.line((10, 5 + frame, 20, 26 - frame), fill=RED_DARK, width=2)
        draw.rectangle((22, 8, 25, 12), fill=TRANSPARENT)
    return image


def draw_whisper(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 1)[frame] if motion == "move" else 0
    wobble = (-1, 0, 1, 0)[frame] if motion == "move" else 0
    draw.ellipse((5 + wobble, 8 + bob, 27 + wobble, 24 + bob), fill=INK)
    draw.ellipse((7 + wobble, 10 + bob, 25 + wobble, 22 + bob), fill=VIOLET)
    mouths = [(10 + wobble, 13 + bob), (18 + wobble, 11 + bob), (16 - wobble, 18 + bob)]
    for index, (x, y) in enumerate(mouths):
        width = 7 if motion == "attack" and index == frame else 5
        draw.rectangle((x - width // 2, y, x + width // 2, y + 2), fill=INK)
        draw.line((x - width // 2 + 1, y, x + width // 2 - 1, y), fill=PAPER)
    draw.polygon([(8 + wobble, 21 + bob), (5 + wobble, 28 + bob), (13 + wobble, 23 + bob)], fill=VIOLET)
    draw.polygon([(23 + wobble, 20 + bob), (27 + wobble, 27 + bob), (19 + wobble, 23 + bob)], fill=VIOLET)
    if motion == "idle" and frame == 1:
        draw.point((5, 16), fill=VIOLET_LIGHT)
        draw.point((28, 13), fill=VIOLET_LIGHT)
    if motion == "attack":
        end_x = 29 + frame
        draw.line((21, 14 + bob, end_x, 14 - frame + bob), fill=VIOLET_LIGHT)
        draw.point((30, 12 + bob), fill=PAPER)
    if motion == "hurt":
        image = recolor_hurt(image)
        draw = ImageDraw.Draw(image)
        draw.line((9 + frame, 10, 23 - frame, 23), fill=PAPER)
        if frame == 1:
            draw.point((7, 17), fill=HURT)
    return image


def gear_teeth(draw: ImageDraw.ImageDraw, center_x: int, center_y: int, phase: int, color) -> None:
    cardinal = [
        (center_x - 2, center_y - 14, center_x + 2, center_y - 11),
        (center_x - 2, center_y + 11, center_x + 2, center_y + 14),
        (center_x - 14, center_y - 2, center_x - 11, center_y + 2),
        (center_x + 11, center_y - 2, center_x + 14, center_y + 2),
    ]
    diagonal = [
        (center_x - 12, center_y - 12, center_x - 8, center_y - 8),
        (center_x + 8, center_y - 12, center_x + 12, center_y - 8),
        (center_x - 12, center_y + 8, center_x - 8, center_y + 12),
        (center_x + 8, center_y + 8, center_x + 12, center_y + 12),
    ]
    for box in (cardinal if phase % 2 == 0 else diagonal):
        draw.rectangle(box, fill=color)


def draw_clockwork(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    phase = frame if motion == "move" else 0
    gear_teeth(draw, 16, 16, phase, INK)
    gear_teeth(draw, 16, 16, phase, BRASS)
    draw.ellipse((4, 4, 28, 28), fill=INK)
    draw.ellipse((7, 7, 25, 25), fill=BRASS)
    draw.ellipse((10, 10, 22, 22), fill=COAL)
    draw.rectangle((12, 5, 20, 9), fill=INK)
    draw.rectangle((13, 6, 19, 8), fill=PAPER)
    angle_points = [(16, 11), (21, 16), (16, 21), (11, 16)]
    hand = angle_points[frame % 4] if motion == "move" else angle_points[1 if frame else 0]
    draw.line((16, 16, hand[0], hand[1]), fill=BRASS_LIGHT, width=2)
    draw.rectangle((14, 14, 18, 18), fill=BRASS_LIGHT)
    if motion == "attack":
        draw.rectangle((2, 14, 7 + frame, 18), fill=RED_DARK)
        draw.rectangle((25 - frame, 14, 30, 18), fill=RED_DARK)
    if motion == "idle" and frame == 1:
        draw.point((16, 16), fill=PAPER)
    if motion == "hurt":
        image = recolor_hurt(image)
        draw = ImageDraw.Draw(image)
        draw.line((9, 8 + frame, 22, 24 - frame), fill=PAPER, width=2)
    return image


def draw_debt(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 1)[frame] if motion == "move" else 0
    squeeze = frame if motion == "attack" else 0
    left, right = 5 + squeeze, 27 - squeeze
    top, bottom = 2 + bob, 29 + bob
    draw.polygon([
        (left + 1, top), (right - 1, top), (right, bottom - 3),
        (right - 3, bottom), (right - 6, bottom - 2), (right - 9, bottom),
        (right - 12, bottom - 2), (left + 5, bottom), (left, bottom - 3),
    ], fill=INK)
    draw.polygon([
        (left + 2, top + 2), (right - 2, top + 2), (right - 2, bottom - 4),
        (left + 3, bottom - 3), (left + 2, bottom - 5),
    ], fill=PAPER)
    for row in (7, 11, 23):
        draw.line((left + 4, row + bob, right - 4, row + bob), fill=WORN)
    center_x = 16
    draw.line((center_x - 4, 14 + bob, center_x + 4, 14 + bob), fill=RED, width=2)
    draw.line((center_x, 12 + bob, center_x, 21 + bob), fill=RED, width=2)
    draw.line((center_x - 4, 18 + bob, center_x + 4, 18 + bob), fill=RED, width=2)
    draw.line((center_x - 3, 21 + bob, center_x + 3, 21 + bob), fill=RED, width=2)
    if motion == "attack":
        draw.rectangle((left - 2, 13 + bob, left + 1, 19 + bob), fill=RED_DARK)
        draw.rectangle((right - 1, 13 + bob, right + 2, 19 + bob), fill=RED_DARK)
    if motion == "idle" and frame == 1:
        draw.point((right - 4, top + 4), fill=RED)
    if motion == "hurt":
        draw.line((8 + frame, 4, 23 - frame, 27), fill=RED_DARK, width=2)
        draw.rectangle((6, 18, 9, 22), fill=TRANSPARENT)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_silent_father(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 1)[frame] if motion == "move" else 0
    lean = frame if motion == "attack" else 0
    draw.polygon([
        (6 + lean, 29), (7 + lean, 12 + bob), (10 + lean, 7 + bob),
        (13 + lean, 5 + bob), (19 + lean, 5 + bob), (23 + lean, 8 + bob),
        (25 + lean, 13 + bob), (26 + lean, 29), (20 + lean, 27),
        (16 + lean, 30), (12 + lean, 27),
    ], fill=INK)
    draw.polygon([
        (8 + lean, 28), (9 + lean, 13 + bob), (12 + lean, 9 + bob),
        (20 + lean, 9 + bob), (23 + lean, 13 + bob), (24 + lean, 28),
        (19 + lean, 26), (16 + lean, 28), (12 + lean, 26),
    ], fill=RAIN)
    draw.ellipse((10 + lean, 4 + bob, 22 + lean, 16 + bob), fill=INK)
    draw.arc((8 + lean, 2 + bob, 24 + lean, 17 + bob), 185, 355, fill=RAIN_LIGHT, width=2)
    draw.rectangle((12 + lean, 10 + bob, 20 + lean, 14 + bob), fill=COAL)
    if motion == "idle" and frame == 1:
        draw.point((15 + lean, 12 + bob), fill=SKIN)
    draw.line((16 + lean, 16 + bob, 16 + lean, 26), fill=RAIN_LIGHT)
    draw.rectangle((7 + lean, 15 + bob, 10 + lean, 26), fill=INK)
    draw.rectangle((22 + lean, 15 + bob, 25 + lean, 26), fill=INK)
    if motion == "attack":
        draw.line((9 + lean, 17 + bob, 6 - frame, 21 + bob), fill=RAIN, width=3)
        draw.line((23 + lean, 17 + bob, 26 + frame, 21 + bob), fill=RAIN, width=3)
        draw.point((16 + lean, 12 + bob), fill=SKIN)
    if motion == "hurt":
        image = recolor_hurt(image)
        draw = ImageDraw.Draw(image)
        draw.line((16, 7, 13 + frame, 20), fill=PAPER, width=2)
        draw.rectangle((14, 11, 18, 14), fill=SKIN)
        draw.point((16, 12), fill=INK)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_lamp_keeper(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, 0, 0, 1)[frame] if motion == "move" else 0
    flicker = frame % 2
    draw.rectangle((15, 1 + bob, 17, 5 + bob), fill=BRASS)
    draw.rectangle((10, 4 + bob, 22, 6 + bob), fill=BRASS_LIGHT)
    draw.rectangle((8, 6 + bob, 24, 8 + bob), fill=BRASS)
    draw.ellipse((10, 7 + bob, 22, 19 + bob), fill=INK)
    draw.ellipse((12, 9 + bob, 20, 17 + bob), outline=BRASS_LIGHT, width=2)
    draw.rectangle((15, 12 + bob, 17, 15 + bob), fill=BRASS_LIGHT if flicker else RED_DARK)
    draw.polygon([
        (4, 30), (7, 17 + bob), (11, 12 + bob), (21, 12 + bob),
        (25, 17 + bob), (28, 30), (22, 28), (18, 30),
        (14, 27), (10, 30),
    ], fill=INK)
    draw.polygon([
        (8, 28), (10, 18 + bob), (13, 15 + bob), (19, 15 + bob),
        (22, 18 + bob), (24, 28), (19, 26), (16, 28), (12, 25),
    ], fill=COAL)
    if motion == "idle" and frame == 1:
        draw.point((5, 17), fill=BRASS)
        draw.point((27, 20), fill=BRASS)
    if motion == "attack":
        radius = 9 + frame * 2
        draw.arc((16 - radius, 13 + bob - radius, 16 + radius, 13 + bob + radius), 180, 359, fill=BRASS_LIGHT, width=2)
        draw.rectangle((14, 11 + bob, 18, 16 + bob), fill=TRANSPARENT)
        draw.point((16, 13 + bob), fill=PAPER)
    if motion == "hurt":
        image = recolor_hurt(image)
        draw = ImageDraw.Draw(image)
        draw.line((10 + frame, 15, 21 - frame, 28), fill=BRASS_LIGHT, width=2)
        draw.rectangle((14, 20, 18, 25), fill=SKIN)
        draw.point((16, 22), fill=INK)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_uniform_answer(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    move_offsets = ((-1, 0), (0, -1), (1, 0), (0, 1))
    dx, dy = move_offsets[frame] if motion == "move" else (0, 0)
    squeeze = frame if motion == "attack" else 0
    tiles = [
        (3 + dx + squeeze, 4 + dy, 13 + dx + squeeze, 15 + dy),
        (19 + dx - squeeze, 4 + dy, 29 + dx - squeeze, 15 + dy),
        (8 + dx + squeeze, 17 + dy, 18 + dx + squeeze, 28 + dy),
        (18 + dx - squeeze, 17 + dy, 28 + dx - squeeze, 28 + dy),
    ]
    for index, (left, top, right, bottom) in enumerate(tiles):
        draw.rectangle((left, top, right, bottom), fill=INK)
        draw.rectangle((left + 1, top + 1, right - 1, bottom - 1), fill=PAPER)
        draw.line((left + 3, top + 3, right - 3, bottom - 3), fill=RED, width=2)
        draw.line((right - 3, top + 3, left + 3, bottom - 3), fill=RED, width=2)
        if motion == "idle" and frame == 1 and index == 1:
            draw.point((right - 2, bottom - 2), fill=SHADOW)
    draw.rectangle((12 + dx, 11 + dy, 22 + dx, 21 + dy), fill=INK)
    draw.rectangle((14 + dx, 13 + dy, 20 + dx, 19 + dy), fill=RED_DARK)
    if motion == "idle" and frame == 1:
        draw.line((15 + dx, 16 + dy, 19 + dx, 16 + dy), fill=PAPER)
    else:
        draw.rectangle((16 + dx, 15 + dy, 18 + dx, 18 + dy), fill=PAPER)
        draw.point((17 + dx, 17 + dy), fill=INK)
    if motion == "attack":
        draw.line((2, 16, 8 + frame, 16), fill=RED_DARK, width=2)
        draw.line((25 - frame, 16, 30, 16), fill=RED_DARK, width=2)
    if motion == "hurt":
        image = recolor_hurt(image)
        draw = ImageDraw.Draw(image)
        draw.line((7 + frame, 5, 25 - frame, 27), fill=PAPER, width=2)
    return image


def draw_silent_father_p2(motion: str, frame: int) -> Image.Image:
    image = draw_silent_father(motion, frame)
    draw = ImageDraw.Draw(image)
    draw.line((12 + frame % 2, 8, 18, 19), fill=PAPER, width=2)
    draw.rectangle((12, 15, 20, 23), fill=INK)
    draw.rectangle((14, 16, 18, 21), fill=SKIN)
    draw.point((15, 18), fill=INK)
    draw.point((18, 18), fill=INK)
    draw.line((15, 21, 18, 21), fill=SHADOW)
    if motion == "attack":
        draw.rectangle((13, 14, 19, 16), fill=RED_DARK)
    if motion == "hurt":
        draw.line((10, 13 + frame, 22, 24 - frame), fill=HURT, width=2)
    return image


def draw_death(enemy: str, frame: int) -> Image.Image:
    source_enemy = "silent-father" if enemy == "silent-father-p2" else enemy
    source = DRAWERS[source_enemy]("hurt", 1)
    if enemy == "uniform-answer":
        source = draw_uniform_answer("hurt", 1)
    elif enemy == "silent-father-p2":
        source = draw_silent_father_p2("hurt", 1)
    source_pixels = source.load()
    result = blank()
    result_pixels = result.load()
    thresholds = (0, 4, 9, 14)
    threshold = thresholds[frame]
    for y in range(1, FRAME - 1):
        for x in range(1, FRAME - 1):
            pixel = source_pixels[x, y]
            if pixel[3] == 0:
                continue
            residue = (x * 17 + y * 31 + x * y * 7 + x * x * 3 + y * y * 5) % 17
            if residue >= threshold:
                result_pixels[x, y] = pixel
    draw = ImageDraw.Draw(result)
    if frame >= 1:
        draw.point((6 + frame * 2, 28), fill=HURT)
        draw.point((26 - frame * 2, 29 - frame), fill=WORN)
    return result


BOTTLE = (176, 192, 196, 255)


def recolor_map(image: Image.Image, mapping: dict) -> Image.Image:
    result = image.copy()
    pixels = result.load()
    for y in range(FRAME):
        for x in range(FRAME):
            if pixels[x, y] in mapping:
                pixels[x, y] = mapping[pixels[x, y]]
    return result


def draw_cry_moth(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    if motion == "move":
        spread = (0, 2, 3, 2)[frame]
        bob = (0, -1, 0, 1)[frame]
    elif motion == "attack":
        spread = (4, 0)[frame]
        bob = (-1, 1)[frame]
    else:
        spread = (1, 2)[frame % 2]
        bob = (0, 1)[frame % 2]
    cx = 16
    top = 9 + bob
    draw.polygon([(cx - 3, top + 3), (cx - 8 - spread, top - 2), (cx - 10 - spread, top + 5), (cx - 4, top + 9)], fill=VIOLET)
    draw.polygon([(cx + 3, top + 3), (cx + 8 + spread, top - 2), (cx + 10 + spread, top + 5), (cx + 4, top + 9)], fill=VIOLET)
    draw.polygon([(cx - 3, top + 8), (cx - 7 - spread, top + 9), (cx - 8 - spread, top + 14), (cx - 2, top + 12)], fill=VIOLET_LIGHT)
    draw.polygon([(cx + 3, top + 8), (cx + 7 + spread, top + 9), (cx + 8 + spread, top + 14), (cx + 2, top + 12)], fill=VIOLET_LIGHT)
    draw.point((cx - 7 - spread, top + 2), fill=PAPER)
    draw.point((cx - 6 - spread, top + 3), fill=PAPER)
    draw.point((cx + 7 + spread, top + 2), fill=PAPER)
    draw.point((cx + 6 + spread, top + 3), fill=PAPER)
    draw.rectangle((cx - 1, top + 1, cx + 1, top + 13), fill=INK)
    draw.line((cx - 1, top + 1, cx - 3, top - 3), fill=COAL)
    draw.line((cx + 1, top + 1, cx + 3, top - 3), fill=COAL)
    draw.point((cx - 1, top + 3), fill=RED_DARK)
    draw.point((cx + 1, top + 3), fill=RED_DARK)
    if motion == "attack":
        drop_y = top + 16 + frame * 3
        draw.point((cx - 5, drop_y), fill=SIGNAL)
        draw.point((cx + 5, drop_y - 2), fill=SIGNAL)
        draw.point((cx, min(29, drop_y + 2)), fill=SIGNAL)
    if motion == "hurt":
        image = recolor_hurt(image)
        draw = ImageDraw.Draw(image)
        draw.line((cx - 4 + frame, top, cx + 4 - frame, top + 11), fill=PAPER)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_hunger_shadow(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    lean = 0
    if motion == "move":
        bob = (0, -1, 0, 1)[frame]
    elif motion == "attack":
        lean = (2, 4)[frame]
        bob = (0, 1)[frame]
    else:
        bob = (0, 1)[frame % 2]
    left, right = 11 + lean, 21 + lean
    top, bottom = 9 + bob, 28 + bob
    draw.polygon([(14 + lean, top - 5), (18 + lean, top - 5), (17 + lean, top - 2), (15 + lean, top - 2)], fill=SKIN)
    draw.rectangle((13 + lean, top - 2, 19 + lean, top), fill=SHADOW)
    draw.rectangle((left, top + 1, right, bottom), fill=BOTTLE)
    draw.rectangle((left + 1, top + 2, right - 1, bottom - 1), fill=COAL)
    for i in range(3):
        draw.line((right - 3, top + 5 + i * 6, right - 1, top + 5 + i * 6), fill=BOTTLE)
    draw.rectangle((left + 2, bottom - 3, left + 5, bottom - 1), fill=PAPER)
    draw.point((left + 4, top + 6), fill=WORN)
    draw.point((left + 6, top + 7), fill=WORN)
    if motion == "attack":
        draw.line((left - 6, top + 8, left - 2, top + 8), fill=WORN)
        draw.line((left - 5 - frame, bottom - 6, left - 2, bottom - 6), fill=WORN)
    if motion == "hurt":
        image = recolor_map(image, {BOTTLE: HURT, COAL: RED_DARK})
        draw = ImageDraw.Draw(image)
        draw.line((left + 1 + frame, top + 2, right - 1 - frame, bottom - 4), fill=PAPER)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_closet_dark(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 1)[frame] if motion == "move" else 0
    if motion == "attack":
        gap = (6, 10)[frame]
    elif motion == "idle":
        gap = (2, 3)[frame]
    else:
        gap = 3
    top, bottom = 3 + bob, 29 + bob
    left, right = 6, 26
    mid = 16
    draw.rectangle((left, top, right, bottom - 2), fill=COAL)
    draw.rectangle((left + 1, top + 1, right - 1, bottom - 3), fill=WORN)
    draw.line((left + 1, top + 3, right - 1, top + 3), fill=COAL)
    draw.rectangle((mid - gap // 2, top + 4, mid + gap // 2, bottom - 4), fill=INK)
    eye_y = top + 10
    if motion == "attack":
        draw.rectangle((mid - 3, eye_y - 1, mid - 1, eye_y), fill=RED)
        draw.rectangle((mid + 1, eye_y - 1, mid + 3, eye_y), fill=RED)
        draw.polygon([(mid - gap, bottom - 4), (mid + gap, bottom - 4), (mid + gap + 3, bottom), (mid - gap - 3, bottom)], fill=INK)
    else:
        draw.point((mid - 1 - gap // 3, eye_y), fill=PAPER)
        draw.point((mid + 1 + gap // 3, eye_y), fill=PAPER)
    draw.point((mid - gap // 2 - 2, top + 13), fill=BRASS_LIGHT)
    draw.point((mid + gap // 2 + 2, top + 13), fill=BRASS_LIGHT)
    draw.rectangle((left + 1, bottom - 2, left + 3, bottom), fill=INK)
    draw.rectangle((right - 3, bottom - 2, right - 1, bottom), fill=INK)
    spill = (1, 2, 3, 2)[frame] if motion == "move" else 1 + frame % 2
    draw.rectangle((left - spill, bottom - 1, left - 1, bottom), fill=INK)
    draw.rectangle((right + 1, bottom - 1, right + spill, bottom), fill=INK)
    if motion == "hurt":
        image = recolor_map(image, {WORN: HURT, COAL: RED_DARK})
        draw = ImageDraw.Draw(image)
        draw.line((left + 3 + frame * 2, top + 2, right - 6 - frame, bottom - 5), fill=PAPER)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_missed_call(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 1)[frame] if motion == "move" else 0
    top = 6 + bob
    left, right = 11, 21
    draw.rectangle((left, top, right, top + 21), fill=COAL)
    draw.rectangle((left + 1, top + 1, right - 1, top + 20), fill=INK)
    draw.rectangle((left + 1, top + 1, right - 1, top + 2), fill=COAL)
    screen_on = not (motion == "idle" and frame == 1)
    screen_color = RED if motion == "attack" else SIGNAL if screen_on else COAL
    draw.rectangle((left + 2, top + 3, right - 2, top + 10), fill=screen_color)
    if screen_on and motion != "attack":
        draw.rectangle((right - 4, top + 4, right - 3, top + 5), fill=RED)
        draw.line((left + 3, top + 8, left + 6, top + 8), fill=INK)
    if motion == "attack":
        draw.rectangle((left + 3, top + 5, left + 4, top + 8), fill=PAPER)
        draw.rectangle((right - 5, top + 5, right - 4, top + 8), fill=PAPER)
    for row in range(3):
        for col in range(3):
            draw.point((left + 3 + col * 3, top + 13 + row * 3), fill=WORN)
    draw.rectangle((right - 2, top - 3, right - 1, top - 1), fill=COAL)
    if motion == "attack":
        wave = 1 + frame * 2
        draw.line((left - 3 - wave, top + 4, left - 3 - wave, top + 8), fill=SIGNAL)
        draw.line((right + 3 + wave, top + 4, right + 3 + wave, top + 8), fill=SIGNAL)
    if motion == "hurt":
        image = recolor_hurt(image)
        draw = ImageDraw.Draw(image)
        draw.line((left + 1 + frame, top + 1, right - 1 - frame, top + 19), fill=PAPER)
    if motion == "move":
        image = shifted(image, (-1, 1, 1, -1)[frame])
    return image


def draw_silence(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 1)[frame] if motion == "move" else 0
    jump = 2 if motion == "attack" and frame == 1 else 0
    table_y = 15 + bob
    draw.rectangle((5, table_y, 27, table_y + 2), fill=WORN)
    draw.line((5, table_y, 27, table_y), fill=BRASS)
    leg_lift = (0, 1, 0, 1) if motion == "move" else (0, 0, 0, 0)
    draw.rectangle((7, table_y + 3, 8, 28 + bob - leg_lift[frame % 4]), fill=INK)
    draw.rectangle((24, table_y + 3, 25, 28 + bob - leg_lift[(frame + 1) % 4]), fill=INK)
    bowl_y = table_y - 3 - jump
    draw.rectangle((8, bowl_y, 12, bowl_y + 2), fill=PAPER)
    draw.line((8, bowl_y, 12, bowl_y), fill=SHADOW)
    draw.rectangle((20, bowl_y, 24, bowl_y + 2), fill=PAPER)
    draw.line((20, bowl_y, 24, bowl_y), fill=SHADOW)
    if motion != "attack":
        steam_shift = frame % 2
        draw.point((10, bowl_y - 4 + steam_shift), fill=COAL)
        draw.point((11, bowl_y - 6 + steam_shift), fill=COAL)
        draw.point((22, bowl_y - 5 - steam_shift), fill=COAL)
        draw.point((21, bowl_y - 7 - steam_shift), fill=COAL)
    else:
        ring = 2 + frame * 3
        draw.line((16 - ring, table_y - 6, 16 - ring + 1, table_y - 6), fill=WORN)
        draw.line((16 + ring - 1, table_y - 6, 16 + ring, table_y - 6), fill=WORN)
        draw.point((16 - ring, table_y - 9), fill=COAL)
        draw.point((16 + ring, table_y - 9), fill=COAL)
    if motion == "hurt":
        image = recolor_map(image, {WORN: HURT, INK: RED_DARK})
        draw = ImageDraw.Draw(image)
        draw.line((8 + frame * 2, table_y - 8, 24 - frame * 2, table_y + 10), fill=PAPER)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_badge_thief(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 1)[frame] if motion == "move" else (0, 1)[frame % 2] if motion == "idle" else 0
    top = 10 + bob
    left, right = 8, 24
    bottom = top + 14
    draw.rectangle((left, top, right, bottom), fill=BRASS)
    draw.rectangle((left, top, right, top + 2), fill=BRASS_LIGHT)
    draw.line((16, top, 16, bottom), fill=PAPER)
    draw.line((left, top + 7, right, top + 7), fill=SHADOW)
    if motion == "attack":
        flap = (3, 5)[frame]
        draw.polygon([(left, top), (left + 6, top), (left + 2, top - flap)], fill=BRASS_LIGHT)
        draw.rectangle((13, top - flap - 2, 19, top - flap), fill=SKIN)
        draw.point((12, top - flap - 1), fill=SKIN)
        draw.point((20, top - flap - 1), fill=SKIN)
    else:
        draw.line((left + 2, top - 2, left + 6, top - 1), fill=BRASS_LIGHT)
    strap_sway = frame % 2
    draw.line((right - 3, bottom, right - 3 + strap_sway, bottom + 3), fill=SIGNAL)
    draw.rectangle((right - 4 + strap_sway, bottom + 3, right - 2 + strap_sway, bottom + 5), fill=PAPER)
    step = (0, 1, 0, 1)[frame] if motion == "move" else 0
    draw.rectangle((left + 3, bottom + 1, left + 5, bottom + 4 - step), fill=INK)
    draw.rectangle((14, bottom + 1, 16, bottom + 3 + step), fill=INK)
    draw.point((left + 9, top + 4), fill=SHADOW)
    draw.point((left + 10, top + 5), fill=SHADOW)
    if motion == "hurt":
        image = recolor_map(image, {BRASS: HURT, BRASS_LIGHT: RED})
        draw = ImageDraw.Draw(image)
        draw.line((left + 2 + frame * 2, top - 1, right - 2 - frame, bottom + 2), fill=PAPER)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_debt_collector(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 1)[frame] if motion == "move" else 0
    top, bottom = 3 + bob, 29 + bob
    left, right = 8, 24
    draw.rectangle((left - 1, top, right + 1, bottom), fill=INK)
    draw.rectangle((left + 1, top + 2, right - 1, bottom - 1), fill=WORN)
    if motion == "attack":
        gap = (3, 6)[frame]
        draw.rectangle((right - 1 - gap, top + 2, right - 1, bottom - 1), fill=INK)
        fist_y = top + 12
        draw.rectangle((right - gap - 4, fist_y, right - gap + 1, fist_y + 4), fill=SKIN)
        draw.line((right - gap + 2, fist_y + 1, right - gap + 4, fist_y + 1), fill=WORN)
        draw.line((right - gap + 2, fist_y + 3, right - gap + 5, fist_y + 3), fill=WORN)
    draw.rectangle((left + 3, top + 6, left + 9, top + 11), fill=PAPER)
    draw.rectangle((left + 4, top + 7, left + 5, top + 8), fill=RED)
    draw.line((left + 4, top + 10, left + 8, top + 10), fill=SHADOW)
    draw.rectangle((left + 6, top + 14, left + 12, top + 18), fill=RED_DARK)
    draw.line((left + 7, top + 16, left + 11, top + 16), fill=PAPER)
    draw.point((right - 4, top + 13), fill=BRASS_LIGHT)
    if motion == "idle" and frame == 1:
        draw.line((right - 8, top + 8, right - 7, top + 7), fill=BRASS_LIGHT)
        draw.line((right - 8, top + 11, right - 7, top + 12), fill=BRASS_LIGHT)
    if motion == "hurt":
        image = recolor_map(image, {WORN: HURT})
        draw = ImageDraw.Draw(image)
        draw.line((left + 2 + frame * 2, top + 3, right - 4 - frame, bottom - 3), fill=PAPER)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_forgetter(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, 0, 1, 1)[frame] if motion == "move" else (0, 1)[frame % 2] if motion == "idle" else 0
    head_x = 14
    head_y = 6 + bob
    draw.rectangle((head_x - 2, head_y, head_x + 3, head_y + 5), fill=SKIN)
    draw.rectangle((head_x - 3, head_y - 1, head_x + 4, head_y + 1), fill=WORN)
    draw.polygon([
        (9, 29 + bob), (10, 15 + bob), (12, 11 + bob), (17, 11 + bob),
        (21, 14 + bob), (23, 20 + bob), (23, 29 + bob),
    ], fill=COAL)
    draw.line((10, 18 + bob, 12, 24 + bob), fill=INK)
    if motion == "attack":
        reach = (3, 6)[frame]
        draw.rectangle((17, 15 + bob, 21 + reach, 17 + bob), fill=COAL)
        draw.rectangle((21 + reach, 14 + bob, 23 + reach, 17 + bob), fill=SKIN)
    dissolve_from = 17 if motion == "attack" else 19
    pixels = image.load()
    for y in range(FRAME):
        for x in range(dissolve_from, FRAME):
            if pixels[x, y][3] and (x + y + frame) % 2 == 0:
                pixels[x, y] = (0, 0, 0, 0)
    if motion == "hurt":
        image = recolor_map(image, {COAL: HURT})
        draw = ImageDraw.Draw(image)
        draw.line((10 + frame, head_y + 2, 20 - frame, 26 + bob), fill=PAPER)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


def draw_empty_chair(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    tilt = (0, 1)[frame % 2] if motion in ("idle", "move") else 0
    if motion == "move":
        tilt = (-1, 0, 1, 0)[frame]
    draw.rectangle((10 + tilt, 5, 22 + tilt, 7), fill=BRASS)
    draw.rectangle((10 + tilt, 7, 11 + tilt, 17), fill=WORN)
    draw.rectangle((21 + tilt, 7, 22 + tilt, 17), fill=WORN)
    draw.line((13 + tilt, 9, 19 + tilt, 9), fill=WORN)
    draw.rectangle((8, 17, 24, 20), fill=WORN)
    draw.line((8, 17, 24, 17), fill=BRASS_LIGHT)
    draw.rectangle((9, 21, 10, 29), fill=INK)
    draw.rectangle((22, 21, 23, 29), fill=INK)
    draw.line((10, 24, 22, 24), fill=INK)
    if motion == "move":
        draw.point((12 + frame * 3, 21), fill=SHADOW)
    if motion == "attack":
        shade_alpha = frame
        draw.rectangle((13, 10 - shade_alpha, 18, 16), fill=INK)
        draw.rectangle((14, 6 - shade_alpha, 17, 9 - shade_alpha), fill=INK)
        draw.point((12, 12 - shade_alpha), fill=INK)
        draw.point((19, 12 - shade_alpha), fill=INK)
    if motion == "hurt":
        image = recolor_map(image, {WORN: HURT, BRASS: RED})
        draw = ImageDraw.Draw(image)
        draw.line((10 + frame * 2, 6, 21 - frame, 27), fill=PAPER)
    return image


def draw_last_bus(motion: str, frame: int) -> Image.Image:
    image = blank()
    draw = ImageDraw.Draw(image)
    bob = (0, -1, 0, 0)[frame] if motion == "move" else 0
    lurch = (1, 3)[frame] if motion == "attack" else 0
    top = 9 + bob
    left, right = 3 + lurch, 28 + lurch
    draw.rectangle((min(29, left), top, min(29, right), top + 15), fill=COAL)
    draw.rectangle((min(29, left + 1), top + 1, min(29, right - 1), top + 3), fill=INK)
    window_right = min(29, right - 2)
    draw.rectangle((left + 2, top + 4, window_right, top + 8), fill=RAIN_LIGHT)
    for sep in range(left + 6, window_right - 1, 5):
        draw.line((sep, top + 4, sep, top + 8), fill=COAL)
    draw.rectangle((min(29, right - 6), top + 4, min(29, right - 3), top + 10), fill=WORN)
    draw.rectangle((left + 2, top + 1, left + 8, top + 3), fill=RED)
    draw.point((left + 4, top + 2), fill=PAPER)
    draw.point((left + 6, top + 2), fill=PAPER)
    draw.line((left, top + 12, min(29, right), top + 12), fill=INK)
    wheel_y = top + 15
    for wheel_x in (left + 6, right - 8):
        wx = min(27, wheel_x)
        draw.rectangle((wx - 2, wheel_y - 1, wx + 2, wheel_y + 3), fill=INK)
        hub = ((0, -1), (1, 0), (0, 1), (-1, 0))[frame % 4]
        draw.point((wx + hub[0], wheel_y + 1 + hub[1]), fill=WORN)
    if motion == "attack":
        beam_y = top + 10
        draw.polygon([(min(29, right), beam_y), (min(30, right + 2), beam_y - 2 - frame), (min(30, right + 2), beam_y + 3 + frame)], fill=RAIN_LIGHT)
        draw.point((min(29, right - 1), beam_y), fill=PAPER)
    else:
        draw.point((min(29, right - 1), top + 10), fill=RAIN_LIGHT)
    if motion == "hurt":
        image = recolor_map(image, {COAL: HURT, INK: RED_DARK})
        draw = ImageDraw.Draw(image)
        draw.line((left + 4 + frame * 2, top + 1, right - 8 - frame, top + 14), fill=PAPER)
    if motion == "move":
        image = shifted(image, (-1, 0, 1, 0)[frame])
    return image


DRAWERS = {
    "fear": draw_fear,
    "red-mark": draw_red_mark,
    "whisper": draw_whisper,
    "clockwork": draw_clockwork,
    "debt": draw_debt,
    "silent-father": draw_silent_father,
    "silent-father-p2": draw_silent_father_p2,
    "lamp-keeper": draw_lamp_keeper,
    "uniform-answer": draw_uniform_answer,
    "cry-moth": draw_cry_moth,
    "hunger-shadow": draw_hunger_shadow,
    "closet-dark": draw_closet_dark,
    "missed-call": draw_missed_call,
    "silence": draw_silence,
    "badge-thief": draw_badge_thief,
    "debt-collector": draw_debt_collector,
    "forgetter": draw_forgetter,
    "empty-chair": draw_empty_chair,
    "last-bus": draw_last_bus,
}

# 全部敌怪已切换为混合管线图集（scripts/process_enemy_hybrid_atlases.py 产出）；
# 本脚本重跑时回读运行时图集，程序化 drawer 仅作为断供兜底。
HYBRID_OVERRIDE_ENEMIES = set(ENEMIES)


def read_runtime_motion_frames(enemy: str, motion: str, count: int) -> list[Image.Image] | None:
    path = ASSET_DIR / f"{enemy}.png"
    if enemy not in HYBRID_OVERRIDE_ENEMIES or not path.exists():
        return None
    atlas = Image.open(path).convert("RGBA")
    row = MOTION_ROWS[motion]
    return [
        atlas.crop((frame * FRAME, row * FRAME, (frame + 1) * FRAME, (row + 1) * FRAME))
        for frame in range(count)
    ]


def validate_frame(image: Image.Image, label: str) -> dict[str, object]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty enemy frame: {label}")
    if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= FRAME or bbox[3] >= FRAME:
        raise AssertionError(f"enemy frame touches atlas edge: {label} {bbox}")
    alphas = {pixel[3] for pixel in image.getdata()}
    if not alphas.issubset({0, 255}):
        raise AssertionError(f"partial alpha in {label}: {sorted(alphas)}")
    return {
        "bbox": list(bbox),
        "opaque_pixels": sum(1 for pixel in image.getdata() if pixel[3]),
        "colors": len({pixel for pixel in image.getdata() if pixel[3]}),
    }


def contact_sheet(frames: dict[str, dict[str, list[Image.Image]]]) -> Image.Image:
    scale = 5
    label_w = 104
    header_h = 24
    cell_w = FRAME * scale
    cell_h = FRAME * scale
    sheet = Image.new(
        "RGB",
        (label_w + cell_w * len(MOTIONS), header_h + cell_h * len(ENEMIES)),
        (19, 18, 24),
    )
    draw = ImageDraw.Draw(sheet)
    for column, motion in enumerate(MOTIONS):
        draw.text((label_w + column * cell_w + 8, 7), motion.upper(), fill=(218, 209, 192))
    for row, enemy in enumerate(ENEMIES):
        top = header_h + row * cell_h
        draw.rectangle((0, top, sheet.width, top + cell_h - 1), fill=(43, 38, 48) if row % 2 == 0 else (37, 33, 43))
        draw.text((8, top + 10), enemy.upper(), fill=(196, 180, 151))
        for column, motion in enumerate(MOTIONS):
            representative = min(1, len(frames[enemy][motion]) - 1)
            enlarged = frames[enemy][motion][representative].resize((cell_w, cell_h), Image.Resampling.NEAREST)
            sheet.paste(enlarged, (label_w + column * cell_w, top), enlarged)
    return sheet


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    frames: dict[str, dict[str, list[Image.Image]]] = {}
    validation: dict[str, object] = {}
    asset_bytes: dict[str, int] = {}

    for enemy in ENEMIES:
        frames[enemy] = {}
        validation[enemy] = {}
        atlas = Image.new("RGBA", (FRAME * 4, FRAME * len(MOTIONS)), TRANSPARENT)
        for motion, count in MOTIONS.items():
            motion_frames = read_runtime_motion_frames(enemy, motion, count) or [
                draw_death(enemy, frame) if motion == "death" else DRAWERS[enemy](motion, frame)
                for frame in range(count)
            ]
            if len({frame.tobytes() for frame in motion_frames}) != count:
                raise AssertionError(f"duplicate frames: {enemy}/{motion}")
            validation[enemy][motion] = [
                validate_frame(frame, f"{enemy}/{motion}/{index}")
                for index, frame in enumerate(motion_frames)
            ]
            frames[enemy][motion] = motion_frames
            for index, frame in enumerate(motion_frames):
                atlas.alpha_composite(frame, (index * FRAME, MOTION_ROWS[motion] * FRAME))
        path = ASSET_DIR / f"{enemy}.png"
        atlas.save(path, optimize=True)
        asset_bytes[path.name] = path.stat().st_size

    contact_sheet(frames).save(OUTPUT_DIR / "enemy-motion-contact.png", optimize=True)
    manifest = {
        "frame": {"width": FRAME, "height": FRAME},
        "atlas": {"columns": 4, "rows": list(MOTIONS)},
        "enemies": list(ENEMIES),
        "motions": MOTIONS,
        "alpha": [0, 255],
        "asset_bytes": asset_bytes,
        "asset_total_bytes": sum(asset_bytes.values()),
        "validation": validation,
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    print(f"wrote {len(ENEMIES)} enemy atlases to {ASSET_DIR}")
    print(f"runtime enemy atlas total: {sum(asset_bytes.values())} bytes")


if __name__ == "__main__":
    main()
