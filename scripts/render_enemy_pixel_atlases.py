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
}


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
            motion_frames = [
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
