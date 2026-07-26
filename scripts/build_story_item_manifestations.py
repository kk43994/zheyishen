#!/usr/bin/env python3
"""Build the three fixed-inheritance wiki manifestation cards from runtime atlases."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
HERO_DIR = ROOT / "src/assets/hero-style1-profiles"
EQUIPMENT_ATLAS = ROOT / "src/assets/items/equipment-sprites.png"
EQUIPMENT_MANIFEST = ROOT / "src/assets/items/equipment-sprites.json"
ICON_ATLAS = ROOT / "src/assets/items/icons.png"
ICON_MANIFEST = ROOT / "src/assets/items/icons.json"
MOTION_OFFSETS = HERO_DIR / "rig-motion-offsets.json"
OUTPUT_DIR = ROOT / "docs/item-manifestations-v1"

FRAME_W = 40
FRAME_H = 56
EQUIPMENT_W = 32
EQUIPMENT_H = 40
PROFILE_INDEX = 5  # average stature + average build
BACKGROUND = (23, 22, 30, 255)
PANEL = (29, 27, 36, 255)
RULE = (54, 49, 61, 255)
TEXT = (150, 142, 154, 255)
TEXT_SOFT = (111, 105, 119, 255)
DIRECTIONS = ("front", "left", "back", "right")
HERO_DIRECTION_ROWS = {"front": 0, "back": 1, "left": 2, "right": 3}

ITEMS = {
    "admission-notice": {
        "number": 75,
        "motion_anchor": "rightHand",
        "anchors": {"front": (31, 37), "left": (26, 37), "back": (31, 37), "right": (14, 37)},
    },
    "iphone-17-pro-max": {
        "number": 76,
        "motion_anchor": "rightHand",
        "anchors": {"front": (31, 37), "left": (26, 37), "back": (31, 37), "right": (14, 37)},
    },
    "fathers-chart": {
        "number": 77,
        "motion_anchor": "waist",
        "anchors": {"front": (26, 40), "left": (24, 39), "back": (14, 40), "right": (16, 39)},
    },
}

MOTIONS = {
    "idle": {"file": "hero-idle.png", "frames": 2, "frame": 0},
    "walk": {"file": "hero-walk.png", "frames": 4, "frame": 1},
    "attack": {"file": "hero-attack.png", "frames": 4, "frame": 1},
    "hurt": {"file": "hero-hurt.png", "frames": 2, "frame": 0},
}


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        Path("/System/Library/Fonts/STHeiti Light.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def hero_frame(motion: str, direction: str, frame: int) -> Image.Image:
    source = Image.open(HERO_DIR / str(MOTIONS[motion]["file"])).convert("RGBA")
    direction_row = HERO_DIRECTION_ROWS[direction]
    row = PROFILE_INDEX * 4 + direction_row
    return source.crop((frame * FRAME_W, row * FRAME_H, (frame + 1) * FRAME_W, (row + 1) * FRAME_H))


def equipment_frame(atlas: Image.Image, item_index: int, direction: str) -> Image.Image:
    column = DIRECTIONS.index(direction)
    return atlas.crop((
        column * EQUIPMENT_W,
        item_index * EQUIPMENT_H,
        (column + 1) * EQUIPMENT_W,
        (item_index + 1) * EQUIPMENT_H,
    ))


def motion_offset(
    offsets: dict[str, object],
    direction: str,
    motion: str,
    frame: int,
    anchor: str,
) -> tuple[int, int]:
    frames = offsets[direction][motion]  # type: ignore[index]
    value = frames[frame % len(frames)][anchor]  # type: ignore[index]
    return int(value[0]), int(value[1])


def composite(
    atlas: Image.Image,
    offsets: dict[str, object],
    item_id: str,
    direction: str,
    motion: str,
    frame: int,
    item_index: int,
) -> Image.Image:
    result = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    result.alpha_composite(hero_frame(motion, direction, frame))
    rule = ITEMS[item_id]
    anchor_x, anchor_y = rule["anchors"][direction]  # type: ignore[index]
    offset_x, offset_y = motion_offset(
        offsets, direction, motion, frame, str(rule["motion_anchor"]),
    )
    if item_id == "iphone-17-pro-max" and motion == "attack" and frame % 2:
        offset_x += 1
    prop = equipment_frame(atlas, item_index, direction)
    result.alpha_composite(prop, (
        int(anchor_x) + offset_x - EQUIPMENT_W // 2,
        int(anchor_y) + offset_y - EQUIPMENT_H // 2,
    ))
    return result


def paste_panel(canvas: Image.Image, frame: Image.Image, x: int, y: int) -> None:
    cell = Image.new("RGBA", (80, 76), PANEL)
    cell.alpha_composite(frame, ((80 - FRAME_W) // 2, 5))
    canvas.alpha_composite(cell, (x, y))


def build_card(
    item_id: str,
    item_index: int,
    equipment: Image.Image,
    icons: Image.Image,
    icon_index: int,
    offsets: dict[str, object],
) -> Image.Image:
    card = Image.new("RGBA", (480, 250), BACKGROUND)
    draw = ImageDraw.Draw(card)
    draw.line((119, 0, 119, 250), fill=RULE)
    draw.line((120, 124, 480, 124), fill=RULE)
    font = load_font(10)
    small_font = load_font(9)
    draw.text((124, 5), "四向", fill=TEXT, font=font)
    draw.text((446, 5), "常态", fill=TEXT_SOFT, font=small_font)
    draw.text((124, 129), "动作", fill=TEXT, font=font)

    icon_col, icon_row = icon_index % 8, icon_index // 8
    icon = icons.crop((icon_col * 36, icon_row * 36, icon_col * 36 + 36, icon_row * 36 + 36))
    icon = icon.resize((54, 54), Image.Resampling.NEAREST)
    icon_panel = Image.new("RGBA", (54, 54), PANEL)
    icon_panel.alpha_composite(icon)
    card.alpha_composite(icon_panel, (7, 31))

    rig = equipment_frame(equipment, item_index, "front").resize((64, 80), Image.Resampling.NEAREST)
    rig_panel = Image.new("RGBA", (52, 64), PANEL)
    rig_panel.alpha_composite(rig, (-6, -8))
    card.alpha_composite(rig_panel, (64, 25))
    draw.text((17, 97), "ICON + RIG", fill=TEXT_SOFT, font=small_font)

    labels = ("正", "左", "背", "右")
    for index, (direction, label) in enumerate(zip(DIRECTIONS, labels)):
        x = 120 + index * 90 + 5
        frame = composite(equipment, offsets, item_id, direction, "idle", 0, item_index)
        paste_panel(card, frame, x, 21)
        draw.text((x + 35, 102), label, fill=TEXT, font=font)

    action_specs = (("idle", 0, "待机"), ("walk", 1, "走路"), ("attack", 1, "攻击"), ("hurt", 0, "受击"))
    for index, (motion, frame_index, label) in enumerate(action_specs):
        x = 120 + index * 90 + 5
        frame = composite(equipment, offsets, item_id, "front", motion, frame_index, item_index)
        paste_panel(card, frame, x, 145)
        draw.text((x + 28, 228), label, fill=TEXT, font=font)
    return card.convert("RGB")


def main() -> None:
    equipment_manifest = json.loads(EQUIPMENT_MANIFEST.read_text(encoding="utf-8"))
    icon_manifest = json.loads(ICON_MANIFEST.read_text(encoding="utf-8"))
    offsets = json.loads(MOTION_OFFSETS.read_text(encoding="utf-8"))
    equipment = Image.open(EQUIPMENT_ATLAS).convert("RGBA")
    icons = Image.open(ICON_ATLAS).convert("RGBA")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for item_id, rule in ITEMS.items():
        item_index = int(equipment_manifest["index"][item_id])
        icon_index = int(icon_manifest["index"][item_id])
        if item_index != icon_index or item_index != int(rule["number"]) - 1:
            raise AssertionError(f"{item_id}: atlas indexes disagree")
        card = build_card(item_id, item_index, equipment, icons, icon_index, offsets)
        target = OUTPUT_DIR / f"{int(rule['number']):02d}-{item_id}.png"
        card.save(target, optimize=True)
        print(f"wrote {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
