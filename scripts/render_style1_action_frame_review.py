#!/usr/bin/env python3
"""Render static action-frame approval sheets without replacing runtime assets."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

import render_style1_joint_animation_experiment as joint


DIRECTIONS = ("front", "back", "left", "right")
MOTIONS = {"idle": 2, "walk": 4, "attack": 4, "hurt": 2}
SOURCE_DIR = joint.SOURCE_DIR
OUTPUT_DIR = Path("output/art-review-static/hero-actions-v1")


def interpolate_offset(value: int, y: int, pivot_y: int, end_y: int) -> int:
    if value == 0 or y <= pivot_y:
        return 0
    numerator = (y - pivot_y) * value
    denominator = max(1, end_y - pivot_y)
    sign = -1 if numerator < 0 else 1
    return sign * ((abs(numerator) + denominator // 2) // denominator)


def conservative_side_pose(
    source: Image.Image,
    direction: str,
    *,
    arm_dx: int = 0,
    arm_dy: int = 0,
    foot_dx: int = 0,
    foot_dy: int = 0,
) -> Image.Image:
    result = source.copy()
    source_pixels = source.load()
    target_pixels = result.load()
    if direction == "left":
        arm_x = range(20, 25)
        foot_x = range(17, 21)
    else:
        arm_x = range(15, 20)
        foot_x = range(19, 23)

    arm_pixels: list[tuple[int, int, tuple[int, int, int, int]]] = []
    for y in range(28, 39):
        for x in arm_x:
            pixel = source_pixels[x, y]
            if pixel[3]:
                arm_pixels.append((x, y, pixel))
            # The approved side mother only exposes one arm. Fill the area it
            # covered with a quiet torso underpaint before moving that arm.
            target_pixels[x, y] = joint.COAL
    for x, y, pixel in arm_pixels:
        dx = interpolate_offset(arm_dx, y, 28, 38)
        dy = interpolate_offset(arm_dy, y, 28, 38)
        target_x = x + dx
        target_y = y + dy
        if 0 <= target_x < joint.FRAME_W and 0 <= target_y < joint.FRAME_H:
            target_pixels[target_x, target_y] = pixel

    foot_pixels: list[tuple[int, int, tuple[int, int, int, int]]] = []
    for y in range(47, 50):
        for x in foot_x:
            pixel = source_pixels[x, y]
            if pixel[3]:
                foot_pixels.append((x, y, pixel))
                target_pixels[x, y] = (0, 0, 0, 0)
    for x, y, pixel in foot_pixels:
        target_x = x + foot_dx
        target_y = y + foot_dy
        if 0 <= target_x < joint.FRAME_W and 0 <= target_y < joint.FRAME_H:
            target_pixels[target_x, target_y] = pixel
    return result


def render_frame(source: Image.Image, direction: str, motion: str, frame: int) -> Image.Image:
    if motion == "idle":
        return source.copy() if frame == 0 else joint.blink(source, direction)

    if direction in {"front", "back"}:
        if motion == "walk":
            return joint.front_pose(source, *joint.FRONT_WALK[frame])
        if motion == "attack":
            if frame == 0 or frame == 3:
                return source.copy()
            if frame == 1:
                return joint.front_pose(source, (16, 31), (24, 31), (17, 49), (23, 49), 0)
            return joint.front_pose(
                source,
                (10, 37),
                (30, 37),
                (16, 49),
                (24, 49),
                -1 if direction == "front" else 1,
            )
        hurt_poses = (
            ((9, 33), (31, 35), (16, 49), (24, 47), -1),
            ((10, 31), (31, 31), (17, 47), (25, 49), 2),
        )
        return joint.front_pose(source, *hurt_poses[frame])

    sign = -1 if direction == "left" else 1
    if motion == "walk":
        poses = (
            {"arm_dx": -2 * sign, "foot_dx": 2 * sign},
            {"arm_dx": -sign, "foot_dx": sign, "foot_dy": -1},
            {"arm_dx": 2 * sign, "foot_dx": -sign},
            {"arm_dx": sign, "foot_dx": 0},
        )
        return conservative_side_pose(source, direction, **poses[frame])
    if motion == "attack":
        poses = (
            {},
            {"arm_dx": sign, "arm_dy": -2},
            {"arm_dx": -sign},
            {},
        )
        return conservative_side_pose(source, direction, **poses[frame])
    poses = (
        {"arm_dx": -2 * sign, "arm_dy": -1},
        {"arm_dx": sign, "foot_dx": sign},
    )
    return conservative_side_pose(source, direction, **poses[frame])


def make_contact(
    motion: str,
    frames: dict[str, list[Image.Image]],
) -> Image.Image:
    scale = 7
    label_width = 58
    header_height = 24
    cell_width = joint.FRAME_W * scale
    cell_height = joint.FRAME_H * scale
    canvas = Image.new(
        "RGB",
        (label_width + cell_width * len(DIRECTIONS), header_height + cell_height * MOTIONS[motion]),
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
        direction: Image.open(SOURCE_DIR / f"{direction}.png").convert("RGBA")
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
    print(f"wrote static action-frame review sheets to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
