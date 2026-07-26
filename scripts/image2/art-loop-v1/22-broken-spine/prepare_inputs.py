#!/usr/bin/env python3
"""Prepare canonical broken-spine Image2 references and body-mid anchors."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw


TASK_DIR = Path("scripts/image2/art-loop-v1/22-broken-spine")
INPUT_DIR = TASK_DIR / "input"
PROFILE_DIR = Path("src/assets/hero-style1-profiles")
STYLE_BOARD = Path("output/art-style-reference-v1/canonical-style-board.png")
REJECTED_SOURCE = Path("output/imagegen/zhe-yi-shen-items-image2-v1/raw/22-broken-spine.png")

FRAME = (40, 56)
ACTIONS = ("idle", "walk", "attack", "hurt")
DIRECTIONS = ("front", "left", "back", "right")
SOURCE_ROWS = {"front": 0, "back": 1, "left": 2, "right": 3}
PROFILE_INDEX = 5  # average stature, average build
SELECTED_FRAMES = {"idle": 0, "walk": 0, "attack": 1, "hurt": 0}
BASE_ANCHORS = {
    "front": (20, 33),
    "left": (22, 33),
    "back": (20, 33),
    "right": (18, 33),
}
ACTION_Y = {"idle": 0, "walk": 0, "attack": -1, "hurt": 1}
BACKGROUND = (43, 40, 48, 255)
GUIDE_CENTER = (255, 0, 255, 255)
GUIDE_EDGE = (0, 255, 255, 255)
PART_COLORS = {
    "head": (255, 64, 64, 255),
    "upper": (64, 255, 64, 255),
    "leftArm": (64, 64, 255, 255),
    "rightArm": (255, 255, 64, 255),
    "leftLeg": (255, 64, 255, 255),
    "rightLeg": (64, 255, 255, 255),
}
PART_ORDER = ("rightLeg", "leftLeg", "upper", "rightArm", "leftArm", "head")


def action_frame(action: str, direction: str) -> Image.Image:
    atlas = Image.open(PROFILE_DIR / f"hero-{action}.png").convert("RGBA")
    column = SELECTED_FRAMES[action]
    row = PROFILE_INDEX * len(SOURCE_ROWS) + SOURCE_ROWS[direction]
    left = column * FRAME[0]
    top = row * FRAME[1]
    return atlas.crop((left, top, left + FRAME[0], top + FRAME[1]))


def part_mask(action: str, direction: str) -> Image.Image:
    atlas = Image.open(PROFILE_DIR / f"part-mask-{action}.png").convert("RGBA")
    column = SELECTED_FRAMES[action]
    row = PROFILE_INDEX * len(SOURCE_ROWS) + SOURCE_ROWS[direction]
    left = column * FRAME[0]
    top = row * FRAME[1]
    return atlas.crop((left, top, left + FRAME[0], top + FRAME[1]))


def broken_spine_transform(direction: str) -> dict[str, tuple[int, int, float]]:
    forward = -1 if direction == "left" else 1 if direction == "right" else 0
    return {
        "head": (forward * 3, 2, 1.0),
        "upper": (forward * 2, 1, 0.94),
        "leftArm": (forward, 2, 1.0),
        "rightArm": (forward, 2, 1.0),
        "leftLeg": (0, 0, 1.0),
        "rightLeg": (0, 0, 1.0),
    }


def apply_part_morph(source: Image.Image, mask: Image.Image, direction: str) -> Image.Image:
    source_pixels = source.load()
    mask_pixels = mask.load()
    output = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    output_pixels = output.load()

    part_at: dict[tuple[int, int], str] = {}
    for y in range(FRAME[1]):
        for x in range(FRAME[0]):
            color = mask_pixels[x, y]
            for part, expected in PART_COLORS.items():
                if color == expected:
                    part_at[(x, y)] = part
                    break

    for y in range(FRAME[1]):
        for x in range(FRAME[0]):
            if source_pixels[x, y][3] and (x, y) not in part_at:
                output_pixels[x, y] = source_pixels[x, y]

    transforms = broken_spine_transform(direction)
    for part in PART_ORDER:
        dx, dy, scale_x = transforms[part]
        for y in range(FRAME[1]):
            for x in range(FRAME[0]):
                if part_at.get((x, y)) != part or not source_pixels[x, y][3]:
                    continue
                target_x = round(20 + (x - 20) * scale_x) + dx
                target_y = y + dy
                if 0 <= target_x < FRAME[0] and 0 <= target_y < FRAME[1]:
                    output_pixels[target_x, target_y] = source_pixels[x, y]
    return output


def build() -> None:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    for source in (STYLE_BOARD, REJECTED_SOURCE):
        if not source.exists():
            raise FileNotFoundError(source)

    shutil.copyfile(STYLE_BOARD, INPUT_DIR / "01-canonical-style-board.png")
    shutil.copyfile(REJECTED_SOURCE, INPUT_DIR / "04-rejected-giant-spine.png")

    exact = Image.new("RGBA", (FRAME[0] * len(DIRECTIONS), FRAME[1] * len(ACTIONS)), (0, 0, 0, 0))
    hunched = Image.new("RGBA", exact.size, (0, 0, 0, 0))
    anchors: dict[str, dict[str, list[int]]] = {}
    for row, action in enumerate(ACTIONS):
        anchors[action] = {}
        for column, direction in enumerate(DIRECTIONS):
            frame = action_frame(action, direction)
            exact.alpha_composite(frame, (column * FRAME[0], row * FRAME[1]))
            hunched_frame = apply_part_morph(frame, part_mask(action, direction), direction)
            hunched.alpha_composite(hunched_frame, (column * FRAME[0], row * FRAME[1]))
            x, y = BASE_ANCHORS[direction]
            anchors[action][direction] = [x, y + ACTION_Y[action]]

    exact.save(INPUT_DIR / "base-hero-4action-4dir-40x56.png", optimize=True)
    hunched.save(INPUT_DIR / "base-hero-broken-spine-morph-4action-4dir-40x56.png", optimize=True)
    review = Image.new("RGBA", exact.size, BACKGROUND)
    review.alpha_composite(exact)
    review.resize((exact.width * 4, exact.height * 4), Image.Resampling.NEAREST).convert("RGB").save(
        INPUT_DIR / "02-approved-hero-4action-4dir.png",
        optimize=True,
    )

    guide = Image.new("RGBA", hunched.size, BACKGROUND)
    guide.alpha_composite(hunched)
    draw = ImageDraw.Draw(guide)
    for row, action in enumerate(ACTIONS):
        for column, direction in enumerate(DIRECTIONS):
            x, y = anchors[action][direction]
            x += column * FRAME[0]
            y += row * FRAME[1]
            draw.point((x, y), fill=GUIDE_CENTER)
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                draw.point((x + dx, y + dy), fill=GUIDE_EDGE)
    guide.resize((guide.width * 4, guide.height * 4), Image.Resampling.NEAREST).convert("RGB").save(
        INPUT_DIR / "03-hunch-posture-target-guide.png",
        optimize=True,
    )

    manifest = {
        "logicalCell": list(FRAME),
        "rows": list(ACTIONS),
        "columns": list(DIRECTIONS),
        "selectedFrames": SELECTED_FRAMES,
        "bodyMidAnchors": anchors,
        "partTransforms": {
            direction: {
                part: [dx, dy, scale_x]
                for part, (dx, dy, scale_x) in broken_spine_transform(direction).items()
            }
            for direction in DIRECTIONS
        },
        "footRoot": [20, 49],
        "shadowPolicy": "preserve ordinary ground shadow; add no shadow attachment",
        "hardConstraint": "decal pixels must remain inside the approved hero torso silhouette",
        "formalAssetsModified": False,
    }
    (INPUT_DIR / "anchors.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build()
