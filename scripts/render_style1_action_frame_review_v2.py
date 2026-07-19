#!/usr/bin/env python3
"""Render conservative action frames by moving only pixels from the approved mother sprites."""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw

import render_style1_joint_animation_experiment as joint


DIRECTIONS = ("front", "back", "left", "right")
MOTIONS = {"idle": 2, "walk": 4, "attack": 4, "hurt": 2}
OUTPUT_DIR = Path("output/art-review-static/hero-actions-v2")
PixelPredicate = Callable[[int, int], bool]


def move_source_pixels(
    result: Image.Image,
    source: Image.Image,
    predicate: PixelPredicate,
    dx: int,
    dy: int,
    underpaint: tuple[int, int, int, int] | None = None,
) -> None:
    source_pixels = source.load()
    target_pixels = result.load()
    moving: list[tuple[int, int, tuple[int, int, int, int]]] = []
    for y in range(joint.FRAME_H):
        for x in range(joint.FRAME_W):
            if not predicate(x, y):
                continue
            pixel = source_pixels[x, y]
            if pixel[3]:
                moving.append((x, y, pixel))
                target_pixels[x, y] = underpaint or (0, 0, 0, 0)
    for x, y, pixel in moving:
        target_x = x + dx
        target_y = y + dy
        if 0 <= target_x < joint.FRAME_W and 0 <= target_y < joint.FRAME_H:
            target_pixels[target_x, target_y] = pixel


def front_walk(source: Image.Image, frame: int) -> Image.Image:
    result = source.copy()
    hand_offsets = (
        ((0, 1), (0, -1)),
        ((0, 0), (0, 0)),
        ((0, -1), (0, 1)),
        ((0, 0), (0, 0)),
    )[frame]
    foot_offsets = (
        ((-1, 0), (0, -1)),
        ((0, -1), (0, 0)),
        ((0, 0), (1, 0)),
        ((0, 0), (0, -1)),
    )[frame]
    move_source_pixels(result, source, lambda x, y: 11 <= x <= 14 and 35 <= y <= 38, *hand_offsets[0])
    move_source_pixels(result, source, lambda x, y: 25 <= x <= 28 and 35 <= y <= 38, *hand_offsets[1])
    move_source_pixels(result, source, lambda x, y: x < 20 and 47 <= y <= 49, *foot_offsets[0])
    move_source_pixels(result, source, lambda x, y: x >= 20 and 47 <= y <= 49, *foot_offsets[1])
    return result


def side_patch_ranges(direction: str) -> tuple[range, range]:
    if direction == "left":
        return range(20, 25), range(17, 21)
    return range(15, 20), range(19, 23)


def side_walk(source: Image.Image, direction: str, frame: int) -> Image.Image:
    result = source.copy()
    sign = -1 if direction == "left" else 1
    arm_x, foot_x = side_patch_ranges(direction)
    arm_dx, foot_dx, foot_dy = (
        (-sign, sign, 0),
        (0, 0, -1),
        (sign, -sign, 0),
        (0, 0, 0),
    )[frame]
    move_source_pixels(
        result,
        source,
        lambda x, y: x in arm_x and 31 <= y <= 38,
        arm_dx,
        0,
        joint.COAL,
    )
    move_source_pixels(
        result,
        source,
        lambda x, y: x in foot_x and 47 <= y <= 49,
        foot_dx,
        foot_dy,
    )
    if frame == 3:
        # The opposite leg is passing behind; a single dark heel pixel is
        # enough at this resolution and avoids inventing a second long leg.
        pixels = result.load()
        heel_x = 22 if direction == "left" else 17
        pixels[heel_x, 48] = joint.COAL
    return result


def rooted_upper_shear(source: Image.Image, tip_dx: int) -> Image.Image:
    result = joint.blank()
    source_pixels = source.load()
    target_pixels = result.load()
    for y in range(joint.FRAME_H):
        if y <= 22:
            dx = tip_dx
        elif y <= 39:
            remaining = 39 - y
            numerator = remaining * tip_dx
            sign = -1 if numerator < 0 else 1
            dx = sign * ((abs(numerator) + 8) // 16)
        else:
            dx = 0
        for x in range(joint.FRAME_W):
            pixel = source_pixels[x, y]
            if pixel[3]:
                target_pixels[x + dx, y] = pixel
    return result


def attack_frame(source: Image.Image, direction: str, frame: int) -> Image.Image:
    if frame in {0, 3}:
        return source.copy()
    if direction in {"front", "back"}:
        result = source.copy()
        if frame == 1:
            move_source_pixels(result, source, lambda x, y: 11 <= x <= 14 and 35 <= y <= 38, 0, -1)
            move_source_pixels(result, source, lambda x, y: 25 <= x <= 28 and 35 <= y <= 38, 0, -1)
            return result
        move_source_pixels(result, source, lambda x, y: 11 <= x <= 14 and 35 <= y <= 38, -1, 0)
        move_source_pixels(result, source, lambda x, y: 25 <= x <= 28 and 35 <= y <= 38, 1, 0)
        if direction == "front":
            pixels = result.load()
            pixels[19, 21] = joint.INK
            pixels[20, 21] = joint.INK
        return result

    sign = -1 if direction == "left" else 1
    if frame == 1:
        result = source.copy()
        arm_x, _ = side_patch_ranges(direction)
        move_source_pixels(
            result,
            source,
            lambda x, y: x in arm_x and 31 <= y <= 38,
            sign,
            -1,
            joint.COAL,
        )
        return result
    result = rooted_upper_shear(source, sign)
    pixels = result.load()
    mouth_x = 13 if direction == "left" else 26
    pixels[mouth_x, 19] = joint.INK
    return result


def hurt_frame(source: Image.Image, direction: str, frame: int) -> Image.Image:
    if direction == "left":
        recoil = 2 if frame == 0 else 1
    elif direction == "right":
        recoil = -2 if frame == 0 else -1
    elif direction == "front":
        recoil = -2 if frame == 0 else -1
    else:
        recoil = 2 if frame == 0 else 1
    return rooted_upper_shear(source, recoil)


def render_frame(source: Image.Image, direction: str, motion: str, frame: int) -> Image.Image:
    if motion == "idle":
        return source.copy() if frame == 0 else joint.blink(source, direction)
    if motion == "walk":
        return front_walk(source, frame) if direction in {"front", "back"} else side_walk(source, direction, frame)
    if motion == "attack":
        return attack_frame(source, direction, frame)
    return hurt_frame(source, direction, frame)


def make_contact(motion: str, frames: dict[str, list[Image.Image]]) -> Image.Image:
    scale = 7
    label_width = 58
    header_height = 24
    cell_width = joint.FRAME_W * scale
    cell_height = joint.FRAME_H * scale
    canvas = Image.new(
        "RGB",
        (label_width + cell_width * 4, header_height + cell_height * MOTIONS[motion]),
        (19, 18, 24),
    )
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((label_width + column * cell_width + 8, 7), direction.upper(), fill=(211, 202, 185))
    for frame in range(MOTIONS[motion]):
        top = header_height + frame * cell_height
        draw.text((6, top + 9), f"F{frame}", fill=(198, 172, 101))
        for column, direction in enumerate(DIRECTIONS):
            left = label_width + column * cell_width
            panel = Image.new("RGBA", (joint.FRAME_W, joint.FRAME_H), (43, 38, 48, 255))
            panel.alpha_composite(frames[direction][frame])
            canvas.paste(
                panel.convert("RGB").resize((cell_width, cell_height), Image.Resampling.NEAREST),
                (left, top),
            )
            if column:
                draw.line((left, top, left, top + cell_height - 1), fill=(68, 59, 71))
        draw.line((0, top + cell_height - 1, canvas.width, top + cell_height - 1), fill=(68, 59, 71))
    return canvas


def validate(frame: Image.Image, label: str) -> None:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None or bbox[3] - 1 != joint.ROOT_Y:
        raise AssertionError(f"invalid root: {label} {bbox}")
    if bbox[1] <= 0:
        raise AssertionError(f"top clipping: {label} {bbox}")
    if any(alpha not in {0, 255} for *_, alpha in frame.getdata()):
        raise AssertionError(f"partial alpha: {label}")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = {
        direction: Image.open(joint.SOURCE_DIR / f"{direction}.png").convert("RGBA")
        for direction in DIRECTIONS
    }
    for motion, frame_count in MOTIONS.items():
        frames = {
            direction: [render_frame(sources[direction], direction, motion, frame) for frame in range(frame_count)]
            for direction in DIRECTIONS
        }
        for direction, direction_frames in frames.items():
            for frame, image in enumerate(direction_frames):
                validate(image, f"{motion}/{direction}/{frame}")
        make_contact(motion, frames).save(OUTPUT_DIR / f"hero-{motion}-frames.png", optimize=True)
    print(f"wrote conservative static action frames to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
