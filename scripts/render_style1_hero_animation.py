#!/usr/bin/env python3
"""Render the selected style-1 hero as native 40x56 code-drawn animation frames."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw


FRAME_W = 40
FRAME_H = 56
ROOT_X = 20
ROOT_Y = 49
PREVIEW_SCALE = 7
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-hero-style1-animation-v1")

DIRECTIONS = ("front", "back", "left", "right")
MOTIONS = {"idle": 2, "walk": 4, "attack": 2, "hurt": 2}

INK = (23, 21, 27, 255)
HAIR = (31, 29, 34, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
SKIN = (199, 181, 158, 255)
SKIN_SHADOW = (146, 119, 100, 255)
PAPER = (218, 208, 186, 255)
TROUSERS = (39, 37, 43, 255)
SHOE = (18, 17, 21, 255)
HURT = (148, 52, 66, 255)
BREATH = (191, 207, 199, 255)


@dataclass(frozen=True)
class Pose:
    body_bob: int = 0
    head_dx: int = 0
    torso_dx: int = 0
    left_foot_dx: int = 0
    right_foot_dx: int = 0
    left_lift: int = 0
    right_lift: int = 0
    left_hand_dx: int = 0
    right_hand_dx: int = 0
    mouth_open: bool = False
    attacking: bool = False
    hurt: bool = False


def pose_for(direction: str, motion: str, frame: int) -> Pose:
    if motion == "idle":
        return Pose(body_bob=-1 if frame == 1 else 0)
    if motion == "walk":
        bob = (0, -1, 0, -1)[frame]
        sway = (-1, 0, 1, 0)[frame]
        pass_swing = (0, -1, 0, 1)[frame]
        left_dx = (-1, 0, 1, 0)[frame]
        right_dx = (1, 0, -1, 0)[frame]
        left_lift = (0, 0, 1, 0)[frame]
        right_lift = (1, 0, 0, 0)[frame]
        return Pose(
            body_bob=bob,
            head_dx=sway,
            torso_dx=sway,
            left_foot_dx=left_dx,
            right_foot_dx=right_dx,
            left_lift=left_lift,
            right_lift=right_lift,
            left_hand_dx=-right_dx + pass_swing,
            right_hand_dx=-left_dx - pass_swing,
        )
    if motion == "attack":
        if frame == 0:
            return Pose(mouth_open=True)
        forward = -1 if direction == "left" else 1 if direction == "right" else 0
        return Pose(
            body_bob=-1,
            head_dx=forward,
            torso_dx=forward,
            left_hand_dx=-2 if direction in {"front", "back"} else forward,
            right_hand_dx=2 if direction in {"front", "back"} else forward,
            mouth_open=True,
            attacking=True,
        )
    return Pose(
        head_dx=-1 if frame == 0 else 1,
        torso_dx=-1 if frame == 0 else 0,
        left_lift=1 if frame == 0 else 0,
        right_lift=0,
        hurt=True,
    )


def polygon(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], color: tuple[int, int, int, int]) -> None:
    draw.polygon(points, fill=color)


def draw_front(image: Image.Image, pose: Pose, motion: str) -> None:
    draw = ImageDraw.Draw(image)
    outline = HURT if pose.hurt else INK
    torso_y = 24 + pose.body_bob
    head_y = 7 + pose.body_bob
    torso_x = pose.torso_dx
    head_x = pose.head_dx

    # Feet and legs stay rooted even while the upper body bobs.
    left_foot_x = 16 + pose.left_foot_dx
    right_foot_x = 22 + pose.right_foot_dx
    left_foot_y = ROOT_Y - pose.left_lift
    right_foot_y = ROOT_Y - pose.right_lift
    polygon(draw, [(16, 35), (20, 35), (left_foot_x + 3, left_foot_y - 2), (left_foot_x, left_foot_y - 2)], outline)
    polygon(draw, [(17, 36), (19, 36), (left_foot_x + 2, left_foot_y - 2), (left_foot_x + 1, left_foot_y - 2)], TROUSERS)
    draw.rectangle((left_foot_x - 1, left_foot_y - 1, left_foot_x + 4, left_foot_y), fill=SHOE)
    polygon(draw, [(20, 35), (24, 35), (right_foot_x + 3, right_foot_y - 2), (right_foot_x, right_foot_y - 2)], outline)
    polygon(draw, [(21, 36), (23, 36), (right_foot_x + 2, right_foot_y - 2), (right_foot_x + 1, right_foot_y - 2)], TROUSERS)
    draw.rectangle((right_foot_x - 1, right_foot_y - 1, right_foot_x + 4, right_foot_y), fill=SHOE)

    left_hand_x = 12 + pose.left_hand_dx + torso_x
    right_hand_x = 28 + pose.right_hand_dx + torso_x
    draw.line((15 + torso_x, torso_y + 3, left_hand_x, torso_y + 13), fill=outline, width=4)
    draw.line((25 + torso_x, torso_y + 3, right_hand_x, torso_y + 13), fill=outline, width=4)
    draw.line((15 + torso_x, torso_y + 4, left_hand_x + 1, torso_y + 11), fill=COAL, width=2)
    draw.line((25 + torso_x, torso_y + 4, right_hand_x - 1, torso_y + 11), fill=COAL, width=2)
    draw.rectangle((left_hand_x - 1, torso_y + 12, left_hand_x + 1, torso_y + 14), fill=SKIN)
    draw.rectangle((right_hand_x - 1, torso_y + 12, right_hand_x + 1, torso_y + 14), fill=SKIN)

    polygon(draw, [
        (14 + torso_x, torso_y), (26 + torso_x, torso_y),
        (25 + torso_x, torso_y + 14), (15 + torso_x, torso_y + 14),
    ], outline)
    draw.rectangle((16 + torso_x, torso_y + 2, 24 + torso_x, torso_y + 12), fill=COAL)
    draw.line((17 + torso_x, torso_y + 6, 23 + torso_x, torso_y + 6), fill=WORN, width=1)
    draw.rectangle((19 + torso_x, torso_y - 1, 21 + torso_x, torso_y + 1), fill=SKIN_SHADOW)

    # A single connected face plane; features never form full-face stripes.
    polygon(draw, [
        (15 + head_x, head_y), (25 + head_x, head_y),
        (28 + head_x, head_y + 3), (28 + head_x, head_y + 12),
        (25 + head_x, head_y + 16), (15 + head_x, head_y + 16),
        (12 + head_x, head_y + 12), (12 + head_x, head_y + 3),
    ], outline)
    draw.rectangle((14 + head_x, head_y + 5, 26 + head_x, head_y + 12), fill=SKIN)
    draw.rectangle((15 + head_x, head_y + 12, 25 + head_x, head_y + 14), fill=SKIN)
    draw.rectangle((13 + head_x, head_y + 7, 14 + head_x, head_y + 10), fill=SKIN_SHADOW)
    draw.rectangle((26 + head_x, head_y + 7, 27 + head_x, head_y + 10), fill=SKIN_SHADOW)
    draw.rectangle((14 + head_x, head_y + 1, 26 + head_x, head_y + 5), fill=HAIR)
    draw.rectangle((13 + head_x, head_y + 3, 16 + head_x, head_y + 7), fill=HAIR)
    draw.rectangle((24 + head_x, head_y + 3, 27 + head_x, head_y + 6), fill=HAIR)

    # Maximum 11 facial-detail pixels in the neutral frame.
    draw.line((15 + head_x, head_y + 7, 17 + head_x, head_y + 7), fill=INK, width=1)
    draw.line((23 + head_x, head_y + 7, 25 + head_x, head_y + 7), fill=INK, width=1)
    draw.point((16 + head_x, head_y + 9), fill=INK)
    draw.point((24 + head_x, head_y + 9), fill=INK)
    draw.point((20 + head_x, head_y + 10), fill=SKIN_SHADOW)
    if pose.mouth_open:
        draw.rectangle((19 + head_x, head_y + 12, 21 + head_x, head_y + 13), fill=INK)
        draw.point((20 + head_x, head_y + 12), fill=BREATH)
    else:
        draw.line((19 + head_x, head_y + 13, 21 + head_x, head_y + 13), fill=SKIN_SHADOW, width=1)

    if pose.attacking:
        draw.point((20 + head_x, head_y + 17), fill=BREATH)
        draw.rectangle((19 + head_x, head_y + 18, 21 + head_x, head_y + 19), fill=BREATH)
        draw.point((20 + head_x, head_y + 21), fill=BREATH)


def draw_back(image: Image.Image, pose: Pose) -> None:
    draw = ImageDraw.Draw(image)
    outline = HURT if pose.hurt else INK
    torso_y = 24 + pose.body_bob
    head_y = 7 + pose.body_bob
    torso_x = pose.torso_dx
    head_x = pose.head_dx

    left_foot_x = 16 + pose.left_foot_dx
    right_foot_x = 22 + pose.right_foot_dx
    left_foot_y = ROOT_Y - pose.left_lift
    right_foot_y = ROOT_Y - pose.right_lift
    draw.line((18, 35, left_foot_x + 2, left_foot_y - 2), fill=outline, width=4)
    draw.line((18, 36, left_foot_x + 2, left_foot_y - 2), fill=TROUSERS, width=2)
    draw.rectangle((left_foot_x - 1, left_foot_y - 1, left_foot_x + 4, left_foot_y), fill=SHOE)
    draw.line((22, 35, right_foot_x + 2, right_foot_y - 2), fill=outline, width=4)
    draw.line((22, 36, right_foot_x + 2, right_foot_y - 2), fill=TROUSERS, width=2)
    draw.rectangle((right_foot_x - 1, right_foot_y - 1, right_foot_x + 4, right_foot_y), fill=SHOE)

    left_hand_x = 12 + pose.left_hand_dx + torso_x
    right_hand_x = 28 + pose.right_hand_dx + torso_x
    draw.line((15 + torso_x, torso_y + 3, left_hand_x, torso_y + 13), fill=outline, width=4)
    draw.line((25 + torso_x, torso_y + 3, right_hand_x, torso_y + 13), fill=outline, width=4)
    draw.line((15 + torso_x, torso_y + 4, left_hand_x + 1, torso_y + 11), fill=COAL, width=2)
    draw.line((25 + torso_x, torso_y + 4, right_hand_x - 1, torso_y + 11), fill=COAL, width=2)
    draw.rectangle((left_hand_x - 1, torso_y + 12, left_hand_x + 1, torso_y + 14), fill=SKIN_SHADOW)
    draw.rectangle((right_hand_x - 1, torso_y + 12, right_hand_x + 1, torso_y + 14), fill=SKIN_SHADOW)
    polygon(draw, [(14 + torso_x, torso_y), (26 + torso_x, torso_y), (25 + torso_x, torso_y + 14), (15 + torso_x, torso_y + 14)], outline)
    draw.rectangle((16 + torso_x, torso_y + 2, 24 + torso_x, torso_y + 12), fill=COAL)
    draw.line((17 + torso_x, torso_y + 5, 23 + torso_x, torso_y + 5), fill=WORN, width=1)
    draw.rectangle((19 + torso_x, torso_y - 1, 21 + torso_x, torso_y + 1), fill=SKIN_SHADOW)

    polygon(draw, [
        (15 + head_x, head_y), (25 + head_x, head_y),
        (28 + head_x, head_y + 3), (28 + head_x, head_y + 12),
        (25 + head_x, head_y + 16), (15 + head_x, head_y + 16),
        (12 + head_x, head_y + 12), (12 + head_x, head_y + 3),
    ], outline)
    draw.rectangle((14 + head_x, head_y + 3, 26 + head_x, head_y + 13), fill=HAIR)
    draw.rectangle((16 + head_x, head_y + 12, 24 + head_x, head_y + 15), fill=HAIR)
    draw.rectangle((13 + head_x, head_y + 7, 14 + head_x, head_y + 10), fill=SKIN_SHADOW)
    draw.rectangle((26 + head_x, head_y + 7, 27 + head_x, head_y + 10), fill=SKIN_SHADOW)
    if pose.attacking:
        draw.point((20 + head_x, head_y - 1), fill=BREATH)
        draw.rectangle((19 + head_x, head_y - 3, 21 + head_x, head_y - 2), fill=BREATH)
        draw.point((20 + head_x, head_y - 5), fill=BREATH)


def draw_left(image: Image.Image, pose: Pose) -> None:
    draw = ImageDraw.Draw(image)
    outline = HURT if pose.hurt else INK
    torso_y = 24 + pose.body_bob
    torso_x = pose.torso_dx
    head_y = 7 + pose.body_bob
    head_x = pose.head_dx

    far_x = 22 + pose.right_foot_dx
    far_y = ROOT_Y - pose.right_lift
    draw.line((22 + torso_x, 36, far_x, far_y - 2), fill=outline, width=4)
    draw.line((22 + torso_x, 36, far_x, far_y - 2), fill=TROUSERS, width=2)
    draw.rectangle((far_x - 2, far_y - 1, far_x + 3, far_y), fill=SHOE)

    draw.line((23 + torso_x, torso_y + 4, 25 + torso_x, torso_y + 12), fill=outline, width=4)
    draw.line((23 + torso_x, torso_y + 4, 24 + torso_x, torso_y + 11), fill=COAL, width=2)
    draw.rectangle((23 + torso_x, torso_y + 12, 25 + torso_x, torso_y + 14), fill=SKIN_SHADOW)

    polygon(draw, [(17 + torso_x, torso_y), (25 + torso_x, torso_y + 1), (25 + torso_x, torso_y + 14), (17 + torso_x, torso_y + 14)], outline)
    polygon(draw, [(19 + torso_x, torso_y + 2), (23 + torso_x, torso_y + 2), (23 + torso_x, torso_y + 12), (19 + torso_x, torso_y + 12)], COAL)
    draw.line((19 + torso_x, torso_y + 6, 22 + torso_x, torso_y + 6), fill=WORN, width=1)
    draw.rectangle((19 + torso_x, torso_y - 1, 21 + torso_x, torso_y + 1), fill=SKIN_SHADOW)

    near_x = 18 + pose.left_foot_dx
    near_y = ROOT_Y - pose.left_lift
    draw.line((19 + torso_x, 36, near_x, near_y - 2), fill=outline, width=5)
    draw.line((19 + torso_x, 36, near_x, near_y - 2), fill=TROUSERS, width=3)
    draw.rectangle((near_x - 3, near_y - 1, near_x + 2, near_y), fill=SHOE)
    hand_x = 15 + pose.left_hand_dx + torso_x
    draw.line((18 + torso_x, torso_y + 4, hand_x, torso_y + 12), fill=outline, width=5)
    draw.line((18 + torso_x, torso_y + 4, hand_x + 1, torso_y + 11), fill=COAL, width=3)
    draw.rectangle((hand_x - 1, torso_y + 12, hand_x + 2, torso_y + 14), fill=SKIN)

    polygon(draw, [
        (17 + head_x, head_y), (24 + head_x, head_y),
        (27 + head_x, head_y + 3), (27 + head_x, head_y + 12),
        (23 + head_x, head_y + 16), (16 + head_x, head_y + 14),
        (13 + head_x, head_y + 10), (14 + head_x, head_y + 3),
    ], outline)
    polygon(draw, [
        (16 + head_x, head_y + 5), (24 + head_x, head_y + 5),
        (25 + head_x, head_y + 12), (22 + head_x, head_y + 14),
        (16 + head_x, head_y + 12), (14 + head_x, head_y + 9),
    ], SKIN)
    draw.rectangle((18 + head_x, head_y + 1, 25 + head_x, head_y + 5), fill=HAIR)
    draw.rectangle((23 + head_x, head_y + 3, 26 + head_x, head_y + 10), fill=HAIR)
    draw.rectangle((15 + head_x, head_y + 3, 18 + head_x, head_y + 6), fill=HAIR)
    draw.rectangle((13 + head_x, head_y + 8, 14 + head_x, head_y + 10), fill=SKIN_SHADOW)
    draw.line((15 + head_x, head_y + 7, 17 + head_x, head_y + 7), fill=INK, width=1)
    draw.point((16 + head_x, head_y + 9), fill=INK)
    draw.point((14 + head_x, head_y + 10), fill=SKIN_SHADOW)
    if pose.mouth_open:
        draw.rectangle((13 + head_x, head_y + 11, 14 + head_x, head_y + 12), fill=INK)
    else:
        draw.point((14 + head_x, head_y + 12), fill=SKIN_SHADOW)
    if pose.attacking:
        draw.rectangle((11 + head_x, head_y + 10, 12 + head_x, head_y + 11), fill=BREATH)
        draw.point((9 + head_x, head_y + 9), fill=BREATH)


def mirror_about_root(image: Image.Image) -> Image.Image:
    mirrored = Image.new("RGBA", image.size, (0, 0, 0, 0))
    source = image.load()
    target = mirrored.load()
    clipped = 0
    for y in range(FRAME_H):
        for x in range(FRAME_W):
            pixel = source[x, y]
            if pixel[3] == 0:
                continue
            target_x = ROOT_X * 2 - x
            if 0 <= target_x < FRAME_W:
                target[target_x, y] = pixel
            else:
                clipped += 1
    if clipped:
        raise AssertionError(f"right-facing mirror clipped {clipped} pixels")
    return mirrored


def render_frame(direction: str, motion: str, frame: int) -> Image.Image:
    pose = pose_for(direction, motion, frame)
    image = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    if direction == "front":
        draw_front(image, pose, motion)
    elif direction == "back":
        draw_back(image, pose)
    elif direction == "left":
        draw_left(image, pose)
    else:
        left_pose = pose_for("left", motion, frame)
        left = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
        draw_left(left, left_pose)
        image = mirror_about_root(left)
    return image


def make_native_atlas(frames: dict[str, list[Image.Image]], frame_count: int) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME_W * frame_count, FRAME_H * len(DIRECTIONS)), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(frames[direction]):
            atlas.alpha_composite(frame, (column * FRAME_W, row * FRAME_H))
    return atlas


def preview_strip(frames_by_direction: dict[str, Image.Image]) -> Image.Image:
    label_top = 22
    panel_w = FRAME_W * PREVIEW_SCALE
    panel_h = FRAME_H * PREVIEW_SCALE
    preview = Image.new("RGBA", (panel_w * len(DIRECTIONS), label_top + panel_h), (19, 18, 24, 255))
    draw = ImageDraw.Draw(preview)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((column * panel_w + 8, 6), direction.upper(), fill=(211, 202, 185, 255))
        background = Image.new("RGBA", (FRAME_W, FRAME_H), (43, 38, 48, 255))
        background.alpha_composite(frames_by_direction[direction])
        enlarged = background.resize((panel_w, panel_h), Image.Resampling.NEAREST)
        preview.alpha_composite(enlarged, (column * panel_w, label_top))
        if column:
            draw.line((column * panel_w, 0, column * panel_w, preview.height), fill=(67, 57, 70, 255))
    return preview.convert("RGB")


def connected_skin_pixels(image: Image.Image) -> int:
    skin_colors = {SKIN, SKIN_SHADOW, PAPER}
    pixels = image.load()
    candidates = {
        (x, y)
        for y in range(6, 25)
        for x in range(10, 31)
        if pixels[x, y] in skin_colors
    }
    largest = 0
    while candidates:
        start = candidates.pop()
        stack = [start]
        size = 1
        while stack:
            x, y = stack.pop()
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor in candidates:
                    candidates.remove(neighbor)
                    stack.append(neighbor)
                    size += 1
        largest = max(largest, size)
    return largest


def validate_frame(image: Image.Image, direction: str, motion: str, frame: int) -> dict[str, object]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty frame: {direction}/{motion}/{frame}")
    if bbox[3] - 1 != ROOT_Y:
        raise AssertionError(f"ground drift {direction}/{motion}/{frame}: {bbox}")
    if any(alpha not in {0, 255} for *_, alpha in image.getdata()):
        raise AssertionError(f"partial alpha: {direction}/{motion}/{frame}")
    colors = {pixel for pixel in image.getdata() if pixel[3]}
    if len(colors) > 10:
        raise AssertionError(f"palette overflow {direction}/{motion}/{frame}: {len(colors)}")
    skin_component = connected_skin_pixels(image) if direction == "front" else None
    if direction == "front" and (skin_component is None or skin_component < 58):
        raise AssertionError(f"fragmented face {direction}/{motion}/{frame}: {skin_component}")
    return {
        "bbox": list(bbox),
        "colors": len(colors),
        "largest_connected_face_skin": skin_component,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    all_frames: dict[str, dict[str, list[Image.Image]]] = {}
    validation: dict[str, object] = {}
    for motion, count in MOTIONS.items():
        direction_frames = {
            direction: [render_frame(direction, motion, frame) for frame in range(count)]
            for direction in DIRECTIONS
        }
        all_frames[motion] = direction_frames
        validation[motion] = {
            direction: [
                validate_frame(image, direction, motion, frame)
                for frame, image in enumerate(direction_frames[direction])
            ]
            for direction in DIRECTIONS
        }
        atlas = make_native_atlas(direction_frames, count)
        atlas.save(OUTPUT_DIR / f"style1-{motion}-4dir.png", optimize=True)

    # A single GIF previews all runtime states; it is not a shipping asset.
    sequence: list[tuple[str, int, int]] = [
        ("idle", 0, 420), ("idle", 1, 420),
        ("walk", 0, 130), ("walk", 1, 130), ("walk", 2, 130), ("walk", 3, 130),
        ("walk", 0, 130), ("walk", 1, 130), ("walk", 2, 130), ("walk", 3, 360),
        ("attack", 0, 180), ("attack", 1, 260),
        ("hurt", 0, 130), ("hurt", 1, 420),
    ]
    gif_frames = []
    durations = []
    for motion, index, duration in sequence:
        strip = preview_strip({
            direction: all_frames[motion][direction][index]
            for direction in DIRECTIONS
        })
        gif_frames.append(strip.convert("P", palette=Image.Palette.ADAPTIVE, colors=24))
        durations.append(duration)
    gif_frames[0].save(
        OUTPUT_DIR / "style1-motion-preview.gif",
        save_all=True,
        append_images=gif_frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )

    panel_w = FRAME_W * PREVIEW_SCALE
    panel_h = FRAME_H * PREVIEW_SCALE
    label_left = 58
    label_top = 22
    contact = Image.new(
        "RGBA",
        (label_left + panel_w * len(DIRECTIONS), label_top + panel_h * len(MOTIONS)),
        (19, 18, 24, 255),
    )
    contact_draw = ImageDraw.Draw(contact)
    for column, direction in enumerate(DIRECTIONS):
        contact_draw.text((label_left + column * panel_w + 8, 6), direction.upper(), fill=(211, 202, 185, 255))
    for row, (motion, frames) in enumerate(all_frames.items()):
        representative = 1 if len(frames["front"]) > 1 else 0
        top = label_top + row * panel_h
        contact_draw.text((7, top + 9), motion.upper(), fill=(196, 180, 151, 255))
        for column, direction in enumerate(DIRECTIONS):
            frame = frames[direction][representative]
            background = Image.new("RGBA", frame.size, (43, 38, 48, 255))
            background.alpha_composite(frame)
            enlarged = background.resize((panel_w, panel_h), Image.Resampling.NEAREST)
            contact.alpha_composite(enlarged, (label_left + column * panel_w, top))
    for column in range(len(DIRECTIONS) + 1):
        x = label_left + column * panel_w
        contact_draw.line((x, 0, x, contact.height), fill=(67, 57, 70, 255), width=1)
    for row in range(len(MOTIONS) + 1):
        y = label_top + row * panel_h
        contact_draw.line((0, y, contact.width, y), fill=(67, 57, 70, 255), width=1)
    contact.convert("RGB").save(OUTPUT_DIR / "style1-motion-contact.png", optimize=True)

    atlas_files = [OUTPUT_DIR / f"style1-{motion}-4dir.png" for motion in MOTIONS]
    manifest = {
        "style": "1-old-handheld-hard-edge-citizen",
        "frame": {"width": FRAME_W, "height": FRAME_H, "root": [ROOT_X, ROOT_Y]},
        "directions": list(DIRECTIONS),
        "motions": MOTIONS,
        "runtime_atlas_bytes": {path.name: path.stat().st_size for path in atlas_files},
        "preview_gif_shipping": False,
        "validation": validation,
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"wrote native atlases and previews to {OUTPUT_DIR}")
    print(f"runtime atlas total: {sum(path.stat().st_size for path in atlas_files)} bytes")


if __name__ == "__main__":
    main()
