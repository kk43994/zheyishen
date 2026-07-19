#!/usr/bin/env python3
"""Assemble the approved action sheet with only the side walk frames replaced.

This script creates static review assets. It does not generate GIFs or modify
runtime atlases.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


FRAME_W = 40
FRAME_H = 56
ROOT_Y = 49
DIRECTIONS = ("front", "back", "left", "right")
MOTIONS = {"idle": 2, "walk": 4, "attack": 4, "hurt": 2}

BASE_DIR = Path("output/imagegen/zhe-yi-shen-hero-style1-animation-v3-review")
SIDE_WALK_ATLAS = Path(
    "output/imagegen/zhe-yi-shen-hero-style1-animation-v4-redesign-review/"
    "style1-v4-redesign-side-walk-2dir.png"
)
SOURCE_DIR = Path("output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1")
OUTPUT_DIR = Path("output/art-review-static/hero-actions-v4")

BACKGROUND = (43, 38, 48, 255)
PAGE = (19, 18, 24)
GRID = (68, 59, 71)
TEXT = (211, 202, 185)
ACCENT = (198, 172, 101)


def atlas_frames(path: Path, frame_count: int, directions: tuple[str, ...]) -> dict[str, list[Image.Image]]:
    atlas = Image.open(path).convert("RGBA")
    expected = (FRAME_W * frame_count, FRAME_H * len(directions))
    if atlas.size != expected:
        raise AssertionError(f"unexpected atlas size: {path} {atlas.size}, expected {expected}")
    return {
        direction: [
            atlas.crop(
                (
                    frame * FRAME_W,
                    row * FRAME_H,
                    (frame + 1) * FRAME_W,
                    (row + 1) * FRAME_H,
                )
            )
            for frame in range(frame_count)
        ]
        for row, direction in enumerate(directions)
    }


def make_atlas(frames: dict[str, list[Image.Image]], frame_count: int) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME_W * frame_count, FRAME_H * len(DIRECTIONS)), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(frames[direction]):
            atlas.alpha_composite(frame, (column * FRAME_W, row * FRAME_H))
    return atlas


def draw_panel(canvas: Image.Image, frame: Image.Image, left: int, top: int, scale: int) -> None:
    panel = Image.new("RGBA", (FRAME_W, FRAME_H), BACKGROUND)
    panel.alpha_composite(frame)
    canvas.paste(
        panel.resize((FRAME_W * scale, FRAME_H * scale), Image.Resampling.NEAREST).convert("RGB"),
        (left, top),
    )


def make_full_contact(all_frames: dict[str, dict[str, list[Image.Image]]]) -> Image.Image:
    scale = 5
    label_w = 62
    header_h = 26
    max_frames = max(MOTIONS.values())
    cell_w = FRAME_W * scale
    cell_h = FRAME_H * scale
    group_w = cell_w * max_frames
    canvas = Image.new(
        "RGB",
        (label_w + group_w * len(DIRECTIONS), header_h + cell_h * len(MOTIONS)),
        PAGE,
    )
    draw = ImageDraw.Draw(canvas)

    for direction_index, direction in enumerate(DIRECTIONS):
        group_x = label_w + direction_index * group_w
        draw.text((group_x + 8, 7), direction.upper(), fill=TEXT)
        for frame in range(max_frames):
            draw.text((group_x + frame * cell_w + 8, 7), str(frame + 1), fill=(117, 110, 118))
        if direction_index:
            draw.line((group_x, 0, group_x, canvas.height), fill=(77, 66, 80), width=2)

    for motion_index, (motion, frame_count) in enumerate(MOTIONS.items()):
        top = header_h + motion_index * cell_h
        draw.text((6, top + 9), motion.upper(), fill=(196, 180, 151))
        if motion_index:
            draw.line((0, top, canvas.width, top), fill=GRID)
        for direction_index, direction in enumerate(DIRECTIONS):
            group_x = label_w + direction_index * group_w
            for frame_index in range(frame_count):
                draw_panel(
                    canvas,
                    all_frames[motion][direction][frame_index],
                    group_x + frame_index * cell_w,
                    top,
                    scale,
                )
    return canvas


def make_motion_contact(motion: str, frames: dict[str, list[Image.Image]]) -> Image.Image:
    scale = 8
    label_w = 58
    header_h = 24
    cell_w = FRAME_W * scale
    cell_h = FRAME_H * scale
    frame_count = MOTIONS[motion]
    canvas = Image.new(
        "RGB",
        (label_w + cell_w * len(DIRECTIONS), header_h + cell_h * frame_count),
        PAGE,
    )
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((label_w + column * cell_w + 8, 7), direction.upper(), fill=TEXT)
    for frame_index in range(frame_count):
        top = header_h + frame_index * cell_h
        draw.text((6, top + 9), f"F{frame_index}", fill=ACCENT)
        for column, direction in enumerate(DIRECTIONS):
            left = label_w + column * cell_w
            draw_panel(canvas, frames[direction][frame_index], left, top, scale)
            if column:
                draw.line((left, top, left, top + cell_h - 1), fill=GRID)
        draw.line((0, top + cell_h - 1, canvas.width, top + cell_h - 1), fill=GRID)
    return canvas


def validate_frame(frame: Image.Image, label: str) -> None:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None or bbox[3] - 1 != ROOT_Y:
        raise AssertionError(f"invalid root: {label} {bbox}")
    if any(alpha not in {0, 255} for *_, alpha in frame.getdata()):
        raise AssertionError(f"partial alpha: {label}")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    all_frames = {
        motion: atlas_frames(BASE_DIR / f"style1-{motion}-4dir.png", count, DIRECTIONS)
        for motion, count in MOTIONS.items()
    }
    original_walk = {
        direction: [frame.copy() for frame in all_frames["walk"][direction]]
        for direction in DIRECTIONS
    }
    side_walk = atlas_frames(SIDE_WALK_ATLAS, MOTIONS["walk"], ("left", "right"))
    all_frames["walk"]["left"] = side_walk["left"]
    all_frames["walk"]["right"] = side_walk["right"]

    # The user's approved base is immutable except for the two side walk rows.
    unchanged = []
    for direction in ("front", "back"):
        for index, frame in enumerate(all_frames["walk"][direction]):
            if frame.tobytes() != original_walk[direction][index].tobytes():
                raise AssertionError(f"approved walk frame changed: {direction}/{index}")
            unchanged.append(f"walk/{direction}/{index}")
    for motion in ("idle", "attack", "hurt"):
        base = atlas_frames(BASE_DIR / f"style1-{motion}-4dir.png", MOTIONS[motion], DIRECTIONS)
        for direction in DIRECTIONS:
            for index, frame in enumerate(all_frames[motion][direction]):
                if frame.tobytes() != base[direction][index].tobytes():
                    raise AssertionError(f"approved frame changed: {motion}/{direction}/{index}")
                unchanged.append(f"{motion}/{direction}/{index}")

    mother = {
        direction: Image.open(SOURCE_DIR / f"{direction}.png").convert("RGBA")
        for direction in DIRECTIONS
    }
    for direction in DIRECTIONS:
        if all_frames["idle"][direction][0].tobytes() != mother[direction].tobytes():
            raise AssertionError(f"idle mother identity changed: {direction}")
    for motion, direction_frames in all_frames.items():
        for direction, frames in direction_frames.items():
            for index, frame in enumerate(frames):
                validate_frame(frame, f"{motion}/{direction}/{index}")

    for motion, frame_count in MOTIONS.items():
        make_atlas(all_frames[motion], frame_count).save(
            OUTPUT_DIR / f"style1-{motion}-4dir.png", optimize=True
        )
        make_motion_contact(motion, all_frames[motion]).save(
            OUTPUT_DIR / f"hero-{motion}-frames.png", optimize=True
        )
    make_full_contact(all_frames).save(OUTPUT_DIR / "hero-actions-contact.png", optimize=True)

    changed_side_frames = sum(
        all_frames["walk"][direction][index].tobytes() != original_walk[direction][index].tobytes()
        for direction in ("left", "right")
        for index in range(MOTIONS["walk"])
    )
    manifest = {
        "review_only": True,
        "base": str(BASE_DIR),
        "side_walk_source": str(SIDE_WALK_ATLAS),
        "unchanged_frame_count": len(unchanged),
        "changed_side_walk_frames": changed_side_frames,
        "runtime_modified": False,
        "gif_generated": False,
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8"
    )
    print(f"wrote approved-base action review to {OUTPUT_DIR}")
    print(f"unchanged frames: {len(unchanged)}; replaced side walk frames: {changed_side_frames}")


if __name__ == "__main__":
    main()
