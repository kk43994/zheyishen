#!/usr/bin/env python3
"""Prepare exact four-action hero, arm-cutout and face/shoulder anchor references."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


TASK_DIR = Path("scripts/image2/art-loop-v1/67-eye-exercise")
INPUT_DIR = TASK_DIR / "input"
ACTION_DIR = Path("output/art-review-static/hero-actions-v4")
PART_MASK_DIR = Path("src/assets/hero-style1-profiles")
RIG_OFFSETS = PART_MASK_DIR / "rig-motion-offsets.json"

CELL = (40, 56)
ACTIONS = ("idle", "walk", "attack", "hurt")
DIRECTIONS = ("front", "left", "back", "right")
SOURCE_ROWS = {"front": 0, "back": 1, "left": 2, "right": 3}
SELECTED_FRAMES = {"idle": 0, "walk": 0, "attack": 1, "hurt": 0}
PROFILE_INDEX = 5  # average-average in stature-major/build-minor order
ARM_COLORS = {(64, 64, 255, 255), (255, 255, 64, 255)}

FACE_BASE = {"front": (20, 17), "back": (20, 17), "left": (15, 17), "right": (25, 17)}
SHOULDERS = {
    "front": {"far": (13, 26), "near": (27, 26)},
    "back": {"far": (27, 26), "near": (13, 26)},
    "left": {"far": (17, 27), "near": (22, 27)},
    "right": {"far": (23, 27), "near": (18, 27)},
}
TARGET_OFFSETS = {
    "front": {"far": (-4, 0), "near": (4, 0)},
    "back": {"far": (5, 0), "near": (-5, 0)},
    "left": {"far": (2, 1), "near": (-1, 0)},
    "right": {"far": (-2, 1), "near": (1, 0)},
}


def action_frame(action: str, direction: str) -> Image.Image:
    atlas = Image.open(ACTION_DIR / f"style1-{action}-4dir.png").convert("RGBA")
    column = SELECTED_FRAMES[action]
    row = SOURCE_ROWS[direction]
    return atlas.crop((column * 40, row * 56, column * 40 + 40, row * 56 + 56))


def part_mask(action: str, direction: str) -> Image.Image:
    atlas = Image.open(PART_MASK_DIR / f"part-mask-{action}.png").convert("RGBA")
    column = SELECTED_FRAMES[action]
    direction_row = SOURCE_ROWS[direction]
    top = (PROFILE_INDEX * 4 + direction_row) * CELL[1]
    frame = atlas.crop((column * CELL[0], top, (column + 1) * CELL[0], top + CELL[1]))
    result = Image.new("RGBA", CELL)
    source = frame.load()
    target = result.load()
    for y in range(CELL[1]):
        for x in range(CELL[0]):
            if source[x, y] in ARM_COLORS:
                target[x, y] = (255, 255, 255, 255)
    return result


def shifted(point: tuple[int, int], offset: list[int]) -> tuple[int, int]:
    return point[0] + int(offset[0]), point[1] + int(offset[1])


def elbow_for(direction: str, side: str, shoulder: tuple[int, int], target: tuple[int, int]) -> tuple[int, int]:
    if direction in {"front", "back"}:
        outward = -1 if shoulder[0] < 20 else 1
        return shoulder[0] + outward, 22 + (shoulder[1] - 26)
    if side == "far":
        return shoulder[0], 23 + (shoulder[1] - 27)
    inward = -2 if direction == "left" else 2
    return shoulder[0] + inward, 22 + (shoulder[1] - 27)


def build() -> None:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    offsets = json.loads(RIG_OFFSETS.read_text(encoding="utf-8"))
    exact = Image.new("RGBA", (CELL[0] * 4, CELL[1] * 4))
    arm_masks = Image.new("RGBA", exact.size)
    anchors: dict[str, dict[str, object]] = {}

    for row, action in enumerate(ACTIONS):
        anchors[action] = {}
        for column, direction in enumerate(DIRECTIONS):
            frame_index = SELECTED_FRAMES[action]
            motion = offsets[direction][action][frame_index]
            frame = action_frame(action, direction)
            mask = part_mask(action, direction)
            exact.alpha_composite(frame, (column * CELL[0], row * CELL[1]))
            arm_masks.alpha_composite(mask, (column * CELL[0], row * CELL[1]))

            face = shifted(FACE_BASE[direction], motion["face"])
            chest_offset = motion["chest"]
            record: dict[str, object] = {"face": list(face), "arms": {}}
            for side in ("far", "near"):
                shoulder = shifted(SHOULDERS[direction][side], chest_offset)
                dx, dy = TARGET_OFFSETS[direction][side]
                target = (face[0] + dx, face[1] + dy)
                elbow = elbow_for(direction, side, shoulder, target)
                wrist = (
                    round(elbow[0] * 0.35 + target[0] * 0.65),
                    round(elbow[1] * 0.35 + target[1] * 0.65) + 1,
                )
                record["arms"][side] = {
                    "shoulder": list(shoulder),
                    "elbow": list(elbow),
                    "wrist": list(wrist),
                    "eyeTarget": list(target),
                    "handRingRadius": (
                        2
                        if direction == "front" or (direction in {"left", "right"} and side == "near")
                        else 0
                    ),
                }
            anchors[action][direction] = record

    exact.save(INPUT_DIR / "base-hero-4action-4dir-40x56.png", optimize=True)
    arm_masks.save(INPUT_DIR / "base-arm-cutout-mask-4action-4dir-40x56.png", optimize=True)

    base_review = Image.new("RGBA", exact.size, (35, 32, 40, 255))
    base_review.alpha_composite(exact)
    base_review.resize((exact.width * 4, exact.height * 4), Image.Resampling.NEAREST).convert("RGB").save(
        INPUT_DIR / "06-approved-hero-4action-4dir.png", optimize=True
    )

    guide = base_review.copy()
    guide_pixels = guide.load()
    mask_pixels = arm_masks.load()
    for y in range(guide.height):
        for x in range(guide.width):
            if mask_pixels[x, y][3]:
                red, green, blue, _ = guide_pixels[x, y]
                guide_pixels[x, y] = (min(255, red + 40), min(255, green + 26), min(255, blue + 70), 255)
    draw = ImageDraw.Draw(guide)
    for row, action in enumerate(ACTIONS):
        for column, direction in enumerate(DIRECTIONS):
            record = anchors[action][direction]
            cell_x = column * CELL[0]
            cell_y = row * CELL[1]
            for side, color in (("far", (74, 191, 216, 255)), ("near", (236, 91, 132, 255))):
                arm = record["arms"][side]
                points = [
                    (cell_x + arm[key][0], cell_y + arm[key][1])
                    for key in ("shoulder", "elbow", "wrist", "eyeTarget")
                ]
                draw.line(points, fill=color, width=1)
                for x, y in (points[0], points[-1]):
                    draw.rectangle((x - 1, y - 1, x + 1, y + 1), outline=color)
                radius = int(arm["handRingRadius"])
                if radius:
                    target_x, target_y = points[-1]
                    opens_left = target_x < cell_x + CELL[0] // 2
                    draw.arc(
                        (
                            target_x - radius,
                            target_y - radius,
                            target_x + radius,
                            target_y + radius,
                        ),
                        start=205 if opens_left else 25,
                        end=515 if opens_left else 335,
                        fill=color,
                    )
                    draw.point((target_x, target_y + 1), fill=color)
    guide.resize((guide.width * 4, guide.height * 4), Image.Resampling.NEAREST).convert("RGB").save(
        INPUT_DIR / "07-face-shoulder-anchor-guide.png", optimize=True
    )

    manifest = {
        "logicalCell": list(CELL),
        "rows": list(ACTIONS),
        "columns": list(DIRECTIONS),
        "selectedFrames": SELECTED_FRAMES,
        "profile": "average-average",
        "gesture": "compressed thumb-index contact arcs at the eye sockets; front=2, side near=1, back=0",
        "armMaskColors": [list(color) for color in sorted(ARM_COLORS)],
        "anchors": anchors,
        "scope": "review input only; no runtime atlas was modified",
    }
    (INPUT_DIR / "anchors.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    build()
