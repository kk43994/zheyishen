#!/usr/bin/env python3
"""Convert the Silent Father image2 design sheet into two candidate motion atlases."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from process_image2_props import strip_green

OUT_DIR = Path("output/imagegen/zhe-yi-shen-silent-father-hybrid-v1")
RAW_PATH = OUT_DIR / "silent-father-raw.png"
ASSET_DIR = Path("src/assets/enemies")
FRAME = 32
MOTIONS = {"idle": 2, "move": 4, "attack": 2, "hurt": 2, "death": 4}

TRANSPARENT = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
DEEP = (38, 35, 43, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
PAPER = (218, 208, 186, 255)
PAPER_SHADOW = (199, 181, 158, 255)
SKIN = (176, 145, 120, 255)
SKIN_SHADOW = (146, 119, 100, 255)
SKIN_LIGHT = (215, 177, 145, 255)
RED_DARK = (112, 39, 55, 255)
RED = (166, 54, 73, 255)
RAIN = (167, 138, 45, 255)
RAIN_LIGHT = (208, 177, 79, 255)
OLIVE_DARK = (67, 67, 43, 255)
OLIVE = (106, 103, 61, 255)
OLIVE_LIGHT = (151, 140, 82, 255)
SLEEVE_DARK = (49, 39, 57, 255)
SLEEVE = (78, 61, 87, 255)
BLUE = (111, 146, 158, 255)
BLUE_LIGHT = (155, 183, 190, 255)
PALETTE = [
    INK, DEEP, COAL, WORN, PAPER, PAPER_SHADOW, SKIN, SKIN_SHADOW, SKIN_LIGHT,
    RED_DARK, RED, RAIN, RAIN_LIGHT, OLIVE_DARK, OLIVE, OLIVE_LIGHT,
    SLEEVE_DARK, SLEEVE, BLUE, BLUE_LIGHT,
]


def palette_image() -> Image.Image:
    image = Image.new("P", (1, 1))
    flat = [channel for color in PALETTE for channel in color[:3]]
    image.putpalette(flat + [0] * (768 - len(flat)))
    return image


def draw_child(frame: Image.Image, attacking: bool) -> None:
    draw = ImageDraw.Draw(frame)
    draw.polygon(((12, 10), (20, 10), (20, 28), (18, 30), (14, 30), (12, 28)), fill=INK)
    draw.line((12, 10, 12, 28), fill=RED_DARK)
    draw.line((20, 10, 20, 28), fill=RED_DARK)

    draw.polygon(((15, 17), (17, 17), (18, 18), (17, 19), (14, 19), (14, 18)), fill=DEEP)
    draw.rectangle((15, 18, 17, 19), fill=SKIN_SHADOW)
    draw.point((16, 18), fill=SKIN_LIGHT)
    draw.point((15, 19), fill=INK)
    draw.point((17, 19), fill=SKIN)
    draw.rectangle((14, 20, 18, 23), fill=COAL)
    draw.point((16, 20), fill=WORN)
    if attacking:
        draw.line((13, 21, 16, 23), fill=SLEEVE)
        draw.line((19, 21, 16, 22), fill=SLEEVE_DARK)
    else:
        draw.line((13, 21, 14, 23), fill=SLEEVE_DARK)
        draw.line((19, 21, 18, 23), fill=SLEEVE_DARK)
    draw.line((15, 24, 15, 26), fill=DEEP)
    draw.line((17, 24, 17, 26), fill=DEEP)
    draw.line((14, 27, 15, 27), fill=INK)
    draw.line((17, 27, 18, 27), fill=INK)


def normalize(cell: Image.Image, child_pose: str | None = None) -> Image.Image:
    cleaned = strip_green(cell)
    alpha = cleaned.getchannel("A").point(lambda value: 255 if value > 120 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("empty Silent Father quadrant after chroma key")
    sprite = cleaned.crop(bbox)
    alpha = alpha.crop(bbox)
    ratio = min(28 / sprite.width, 29 / sprite.height)
    size = (max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio)))
    sprite = sprite.resize(size, Image.Resampling.NEAREST)
    alpha = alpha.resize(size, Image.Resampling.NEAREST)
    quantized = sprite.convert("RGB").quantize(
        palette=palette_image(), dither=Image.Dither.NONE,
    ).convert("RGBA")
    quantized.putalpha(alpha.point(lambda value: 255 if value > 120 else 0))
    frame = Image.new("RGBA", (FRAME, FRAME), TRANSPARENT)
    frame.alpha_composite(quantized, ((FRAME - size[0]) // 2, 31 - size[1]))
    if child_pose is not None:
        draw_child(frame, attacking=child_pose == "attack")
    return frame


def shifted(source: Image.Image, dx: int, dy: int) -> Image.Image:
    result = Image.new("RGBA", source.size, TRANSPARENT)
    result.alpha_composite(source, (dx, dy))
    return result


def hurt(source: Image.Image, frame: int) -> Image.Image:
    result = source.copy()
    pixels = result.load()
    for y in range(FRAME):
        for x in range(FRAME):
            pixel = pixels[x, y]
            if pixel == RAIN_LIGHT:
                pixels[x, y] = RED
            elif pixel == RAIN:
                pixels[x, y] = RED_DARK
    draw = ImageDraw.Draw(result)
    draw.line((9 + frame, 6, 22 - frame, 25), fill=PAPER, width=1)
    return result


def death(source: Image.Image, frame: int) -> Image.Image:
    result = Image.new("RGBA", source.size, TRANSPARENT)
    source_pixels = source.load()
    result_pixels = result.load()
    threshold = (0, 5, 10, 14)[frame]
    for y in range(1, FRAME - 1):
        for x in range(1, FRAME - 1):
            pixel = source_pixels[x, y]
            if pixel[3] == 0:
                continue
            residue = (x * 17 + y * 31 + x * y * 7) % 17
            if residue >= threshold:
                result_pixels[x, y] = pixel
    return result


def build_motion_frames(idle: Image.Image, attack: Image.Image) -> dict[str, list[Image.Image]]:
    return {
        "idle": [idle, shifted(idle, 0, -1)],
        "move": [shifted(idle, -1, 0), shifted(idle, 0, -1), shifted(idle, 1, 0), idle],
        "attack": [idle, attack],
        "hurt": [hurt(idle, 0), hurt(idle, 1)],
        "death": [death(hurt(idle, 1), frame) for frame in range(4)],
    }


def build_atlas(frames: dict[str, list[Image.Image]], path: Path) -> dict[str, object]:
    atlas = Image.new("RGBA", (FRAME * 4, FRAME * len(MOTIONS)), TRANSPARENT)
    validation: dict[str, object] = {}
    for row, (motion, count) in enumerate(MOTIONS.items()):
        motion_frames = frames[motion]
        for column in range(4):
            frame = motion_frames[min(column, count - 1)]
            atlas.alpha_composite(frame, (column * FRAME, row * FRAME))
        validation[motion] = [
            {"bbox": list(frame.getchannel("A").getbbox() or (0, 0, 0, 0)),
             "colors": len({pixel for pixel in frame.getdata() if pixel[3]})}
            for frame in motion_frames
        ]
    atlas.save(path, optimize=True)
    return validation


def main() -> None:
    sheet = Image.open(RAW_PATH).convert("RGBA")
    half_w, half_h = sheet.width // 2, sheet.height // 2
    child_poses = (None, None, "idle", "attack")
    cells = [
        normalize(
            sheet.crop((column * half_w, row * half_h, (column + 1) * half_w, (row + 1) * half_h)),
            child_pose=child_poses[row * 2 + column],
        )
        for row in range(2) for column in range(2)
    ]
    phase_one = build_motion_frames(cells[0], cells[1])
    phase_two = build_motion_frames(cells[2], cells[3])
    validation = {
        "silent-father": build_atlas(phase_one, OUT_DIR / "silent-father-hybrid.png"),
        "silent-father-p2": build_atlas(phase_two, OUT_DIR / "silent-father-p2-hybrid.png"),
    }
    contact = Image.new("RGB", (FRAME * 4 * 5, FRAME * 2 * 5), (19, 18, 24))
    for row, frames in enumerate((phase_one, phase_two)):
        representatives = [frames[motion][min(1, len(frames[motion]) - 1)] for motion in MOTIONS]
        for column, frame in enumerate(representatives):
            enlarged = frame.resize((FRAME * 5, FRAME * 5), Image.Resampling.NEAREST)
            contact.paste(enlarged, (column * FRAME * 5, row * FRAME * 5), enlarged)
    contact.save(OUT_DIR / "silent-father-hybrid-contact.png", optimize=True)
    (OUT_DIR / "manifest.json").write_text(json.dumps({
        "source": RAW_PATH.name,
        "frame": [FRAME, FRAME],
        "layout": "rows=idle/move/attack/hurt/death, columns=up to four frames",
        "validation": validation,
    }, indent=2), encoding="utf-8")
    if "--publish" in sys.argv[1:]:
        for name in ("silent-father", "silent-father-p2"):
            current = ASSET_DIR / f"{name}.png"
            backup = OUT_DIR / f"{name}-programmatic-original.png"
            candidate = OUT_DIR / f"{name}-hybrid.png"
            if current.exists() and not backup.exists():
                shutil.copyfile(current, backup)
            shutil.copyfile(candidate, current)
        print(f"published hybrid atlases to {ASSET_DIR}")
    print(f"processed candidates in {OUT_DIR}")


if __name__ == "__main__":
    main()
