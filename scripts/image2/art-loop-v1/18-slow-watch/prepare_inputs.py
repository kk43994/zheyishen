#!/usr/bin/env python3
"""Build exact approved hero/watch references for slow-watch Image2."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


TASK_DIR = Path("scripts/image2/art-loop-v1/18-slow-watch")
INPUT_DIR = TASK_DIR / "input"
ACTION_DIR = Path("output/art-review-static/hero-actions-v4")
EQUIPMENT_ATLAS = Path("src/assets/items/equipment-sprites.png")
RIG_OFFSETS = Path("src/assets/hero-style1-profiles/rig-motion-offsets.json")

FRAME = (40, 56)
EQUIPMENT_CELL = (32, 40)
ACTIONS = ("idle", "walk", "attack", "hurt")
DIRECTIONS = ("front", "left", "back", "right")
SOURCE_ROWS = {"front": 0, "back": 1, "left": 2, "right": 3}
EQUIPMENT_COLUMNS = {direction: index for index, direction in enumerate(DIRECTIONS)}
SELECTED_FRAMES = {"idle": 0, "walk": 0, "attack": 1, "hurt": 0}
WATCH_BASE = {
    "front": (28, 35),
    "left": (23, 35),
    "back": (28, 35),
    "right": (17, 35),
}
BACKGROUND = (43, 40, 48, 255)
GUIDE_CENTER = (255, 0, 255, 255)
GUIDE_EDGE = (0, 255, 255, 255)


def action_frame(action: str, direction: str) -> Image.Image:
    atlas = Image.open(ACTION_DIR / f"style1-{action}-4dir.png").convert("RGBA")
    column = SELECTED_FRAMES[action]
    row = SOURCE_ROWS[direction]
    return atlas.crop((column * 40, row * 56, column * 40 + 40, row * 56 + 56))


def watch_anchor(
    offsets: dict[str, dict[str, list[dict[str, list[int]]]]],
    action: str,
    direction: str,
) -> tuple[int, int]:
    base_x, base_y = WATCH_BASE[direction]
    dx, dy = offsets[direction][action][SELECTED_FRAMES[action]]["rightHand"]
    return base_x + dx, base_y + dy


def watch_sprite(direction: str) -> Image.Image:
    atlas = Image.open(EQUIPMENT_ATLAS).convert("RGBA")
    column = EQUIPMENT_COLUMNS[direction]
    row = 17
    left = column * EQUIPMENT_CELL[0]
    top = row * EQUIPMENT_CELL[1]
    return atlas.crop((left, top, left + EQUIPMENT_CELL[0], top + EQUIPMENT_CELL[1]))


def build() -> None:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    offsets = json.loads(RIG_OFFSETS.read_text(encoding="utf-8"))
    exact = Image.new("RGBA", (40 * len(DIRECTIONS), 56 * len(ACTIONS)), (0, 0, 0, 0))
    anchors: dict[str, dict[str, list[int]]] = {}

    for row, action in enumerate(ACTIONS):
        anchors[action] = {}
        for column, direction in enumerate(DIRECTIONS):
            frame = action_frame(action, direction)
            anchor = watch_anchor(offsets, action, direction)
            watch = watch_sprite(direction)
            frame.alpha_composite(
                watch,
                (anchor[0] - EQUIPMENT_CELL[0] // 2, anchor[1] - EQUIPMENT_CELL[1] // 2),
            )
            exact.alpha_composite(frame, (column * 40, row * 56))
            anchors[action][direction] = [anchor[0], anchor[1]]

    exact_path = INPUT_DIR / "base-hero-watch-4action-4dir-40x56.png"
    exact.save(exact_path, optimize=True)

    review = Image.new("RGBA", exact.size, BACKGROUND)
    review.alpha_composite(exact)
    enlarged = review.resize((exact.width * 4, exact.height * 4), Image.Resampling.NEAREST)
    enlarged.convert("RGB").save(INPUT_DIR / "01-approved-hero-watch-action-grid.png", optimize=True)

    guide = review.copy()
    draw = ImageDraw.Draw(guide)
    for row, action in enumerate(ACTIONS):
        for column, direction in enumerate(DIRECTIONS):
            x, y = anchors[action][direction]
            x += column * 40
            y += row * 56
            draw.point((x, y), fill=GUIDE_CENTER)
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                draw.point((x + dx, y + dy), fill=GUIDE_EDGE)
    guide.resize((guide.width * 4, guide.height * 4), Image.Resampling.NEAREST).convert("RGB").save(
        INPUT_DIR / "03-wrist-anchor-guide.png",
        optimize=True,
    )

    manifest = {
        "logicalCell": [40, 56],
        "rows": list(ACTIONS),
        "columns": list(DIRECTIONS),
        "selectedFrames": SELECTED_FRAMES,
        "watchAtlasRow": 17,
        "watchAnchors": anchors,
        "scope": "review input only; approved watch and hero atlases are not modified",
    }
    (INPUT_DIR / "anchors.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build()

