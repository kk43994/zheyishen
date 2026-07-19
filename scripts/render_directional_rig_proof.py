#!/usr/bin/env python3
"""Render six body rigs and fitted raincoats in four gameplay directions."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

from render_rig_fit_proof import (
    DEEP,
    FRAME_H,
    FRAME_W,
    HAIR,
    INK,
    RAIN,
    RAIN_LIGHT,
    RAIN_SHADOW,
    RIGS,
    ROOT_X,
    ROOT_Y,
    SHOE,
    SKIN,
    SKIN_SHADOW,
    SWEATER,
    SWEATER_LIGHT,
    TROUSERS,
    RigSpec,
    SolvedRig,
    dark_preview,
    draw_body,
    draw_raincoat,
    solve,
)


DIRECTIONS = ("front", "back", "left", "right")
SCALE = 5


def mirror_registered(image: Image.Image) -> Image.Image:
    mirrored = ImageOps.mirror(image)
    registered = Image.new("RGBA", image.size, (0, 0, 0, 0))
    registered.alpha_composite(mirrored, (1, 0))
    return registered


def body_inner_polygon(spec: RigSpec, rig: SolvedRig) -> list[tuple[int, int]]:
    torso_top = rig.torso_box[1]
    torso_bottom = rig.torso_box[3]
    left_shoulder, right_shoulder = rig.shoulders
    waist_half = spec.waist_width // 2
    return [
        (left_shoulder[0] + 1, torso_top + 1),
        (right_shoulder[0] - 1, torso_top + 1),
        (ROOT_X + max(2, waist_half - 1), torso_bottom - 1),
        (ROOT_X - max(2, waist_half - 1), torso_bottom - 1),
    ]


def draw_body_back(spec: RigSpec, rig: SolvedRig) -> Image.Image:
    image = draw_body(spec, rig)
    draw = ImageDraw.Draw(image)
    draw.polygon(body_inner_polygon(spec, rig), fill=SWEATER)
    draw.line((ROOT_X, rig.torso_box[1] + 2, ROOT_X, rig.torso_box[3] - 2), fill=SWEATER_LIGHT, width=1)
    head_left, head_top, head_right, head_bottom = rig.head_box
    draw.ellipse((head_left - 1, head_top - 1, head_right + 1, head_bottom + 1), fill=INK)
    draw.ellipse((head_left, head_top, head_right, head_bottom), fill=HAIR)
    draw.rectangle((head_left + 2, head_top + 2, head_right - 2, head_bottom - 2), fill=HAIR)
    draw.rectangle((head_left + 1, head_bottom - 3, head_right - 1, head_bottom), fill=SKIN_SHADOW)
    return image


def draw_body_side(spec: RigSpec, rig: SolvedRig) -> Image.Image:
    image = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    pelvis_y = rig.pelvis[1]
    foot_y = rig.feet[0][1]
    torso_top = rig.torso_box[1]
    torso_bottom = rig.torso_box[3]
    depth = max(5, round((spec.chest_width + spec.waist_width) / 4))
    front_x = ROOT_X - depth // 2 - (1 if spec.soft_belly else 0)
    back_x = ROOT_X + depth // 2

    draw.line((ROOT_X + 1, pelvis_y, ROOT_X + 2, foot_y - 1), fill=INK, width=spec.limb_width + 2)
    draw.line((ROOT_X + 1, pelvis_y, ROOT_X + 2, foot_y - 1), fill=DEEP, width=spec.limb_width)
    draw.rectangle((ROOT_X, foot_y - 1, ROOT_X + 4, foot_y + 1), fill=SHOE)
    draw.line((ROOT_X - 1, pelvis_y, ROOT_X - 2, foot_y - 1), fill=INK, width=spec.limb_width + 2)
    draw.line((ROOT_X - 1, pelvis_y, ROOT_X - 2, foot_y - 1), fill=TROUSERS, width=spec.limb_width)
    draw.rectangle((ROOT_X - 5, foot_y - 1, ROOT_X, foot_y + 1), fill=SHOE)

    far_hand_y = rig.hands[1][1] - 1
    draw.line((ROOT_X + 1, torso_top + 3, ROOT_X + 2, far_hand_y), fill=INK, width=spec.limb_width + 2)
    draw.line((ROOT_X + 1, torso_top + 3, ROOT_X + 2, far_hand_y), fill=DEEP, width=spec.limb_width)
    draw.point((ROOT_X + 2, far_hand_y + 1), fill=SKIN_SHADOW)

    torso = [(front_x, torso_top), (back_x, torso_top + 1), (back_x + 1, torso_bottom), (front_x, torso_bottom)]
    draw.polygon(torso, fill=INK)
    inner = [(front_x + 1, torso_top + 1), (back_x - 1, torso_top + 2), (back_x, torso_bottom - 1), (front_x + 1, torso_bottom - 1)]
    draw.polygon(inner, fill=SWEATER)
    if spec.soft_belly:
        draw.line((front_x, rig.chest[1], front_x - 1, torso_bottom - 2), fill=SWEATER_LIGHT, width=2)

    near_hand_y = rig.hands[0][1]
    draw.line((front_x + 1, torso_top + 3, front_x - 1, near_hand_y), fill=INK, width=spec.limb_width + 3)
    draw.line((front_x + 1, torso_top + 3, front_x - 1, near_hand_y), fill=SWEATER, width=spec.limb_width + 1)
    draw.rectangle((front_x - 2, near_hand_y - 1, front_x, near_hand_y + 1), fill=SKIN)

    head_left, head_top, head_right, head_bottom = rig.head_box
    side_width = max(8, round(spec.head_width * 0.78))
    side_left = ROOT_X - side_width // 2
    side_right = side_left + side_width
    draw.ellipse((side_left - 1, head_top - 1, side_right + 1, head_bottom + 1), fill=INK)
    draw.ellipse((side_left, head_top, side_right, head_bottom), fill=SKIN)
    draw.rectangle((side_left, head_top, side_right, head_top + max(3, spec.head_height // 3)), fill=HAIR)
    draw.rectangle((side_right - 3, head_top + 1, side_right, head_bottom - 2), fill=HAIR)
    draw.point((side_left + 2, rig.eyes[0][1]), fill=INK)
    draw.point((side_left - 1, rig.eyes[0][1] + 2), fill=SKIN)
    return image


def draw_raincoat_back(spec: RigSpec, rig: SolvedRig) -> Image.Image:
    image = draw_raincoat(spec, rig)
    draw = ImageDraw.Draw(image)
    torso_top = rig.torso_box[1] - 1
    hem_y = min(ROOT_Y - 4, rig.pelvis[1] + 7)
    shoulder_half = spec.shoulder_width // 2 + 1
    hem_half = max(spec.waist_width // 2 + 1, shoulder_half)
    draw.polygon([
        (ROOT_X - shoulder_half, torso_top + 1),
        (ROOT_X + shoulder_half, torso_top + 1),
        (ROOT_X + hem_half, hem_y - 1),
        (ROOT_X - hem_half, hem_y - 1),
    ], fill=RAIN)
    draw.line((ROOT_X, torso_top + 2, ROOT_X, hem_y - 1), fill=RAIN_SHADOW, width=1)
    draw.line((ROOT_X - shoulder_half + 2, torso_top + 3, ROOT_X + shoulder_half - 2, torso_top + 3), fill=RAIN_LIGHT, width=1)
    return image


def draw_raincoat_side(spec: RigSpec, rig: SolvedRig) -> Image.Image:
    image = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    head_left, head_top, head_right, head_bottom = rig.head_box
    side_width = max(8, round(spec.head_width * 0.78))
    side_left = ROOT_X - side_width // 2
    side_right = side_left + side_width
    draw.ellipse((side_left - 3, head_top - 2, side_right + 2, head_bottom + 3), fill=INK)
    draw.ellipse((side_left - 2, head_top - 1, side_right + 1, head_bottom + 2), fill=RAIN)
    draw.ellipse((side_left, head_top + 1, side_right - 1, head_bottom), fill=(0, 0, 0, 0))

    torso_top = rig.torso_box[1] - 1
    hem_y = min(ROOT_Y - 4, rig.pelvis[1] + 7)
    depth = max(6, round((spec.chest_width + spec.waist_width) / 4) + 2)
    front_x = ROOT_X - depth // 2 - (1 if spec.soft_belly else 0)
    back_x = ROOT_X + depth // 2 + 1
    draw.polygon(
        [(front_x, torso_top), (back_x, torso_top + 1), (back_x + 2, hem_y), (front_x - 1, hem_y)],
        fill=INK,
    )
    draw.polygon(
        [(front_x + 1, torso_top + 1), (back_x - 1, torso_top + 2), (back_x, hem_y - 1), (front_x, hem_y - 1)],
        fill=RAIN,
    )
    hand_y = rig.hands[0][1]
    draw.line((front_x + 1, torso_top + 3, front_x - 2, hand_y - 1), fill=INK, width=spec.limb_width + 4)
    draw.line((front_x + 1, torso_top + 3, front_x - 2, hand_y - 1), fill=RAIN, width=spec.limb_width + 2)
    draw.line((back_x - 1, torso_top + 3, back_x + 1, hand_y - 2), fill=RAIN_SHADOW, width=max(2, spec.limb_width))
    draw.line((ROOT_X, torso_top + 2, ROOT_X, hem_y - 2), fill=RAIN_LIGHT, width=1)
    return image


def directional_body(spec: RigSpec, rig: SolvedRig, direction: str) -> Image.Image:
    if direction == "front":
        return draw_body(spec, rig)
    if direction == "back":
        return draw_body_back(spec, rig)
    side = draw_body_side(spec, rig)
    return side if direction == "left" else mirror_registered(side)


def directional_coat(spec: RigSpec, rig: SolvedRig, direction: str) -> Image.Image:
    if direction == "front":
        return draw_raincoat(spec, rig)
    if direction == "back":
        return draw_raincoat_back(spec, rig)
    side = draw_raincoat_side(spec, rig)
    return side if direction == "left" else mirror_registered(side)


def make_grid(frames: list[list[Image.Image]]) -> Image.Image:
    image = Image.new("RGBA", (FRAME_W * len(RIGS), FRAME_H * len(DIRECTIONS)), (0, 0, 0, 0))
    for row, direction_frames in enumerate(frames):
        for column, frame in enumerate(direction_frames):
            image.alpha_composite(frame, (column * FRAME_W, row * FRAME_H))
    return image


def main() -> None:
    out_dir = Path("output/imagegen/zhe-yi-shen-rig-fit-proof")
    out_dir.mkdir(parents=True, exist_ok=True)
    solved = [solve(spec) for spec in RIGS]
    body_rows = []
    coat_rows = []
    composite_rows = []
    for direction in DIRECTIONS:
        bodies = [directional_body(spec, rig, direction) for spec, rig in zip(RIGS, solved)]
        coats = [directional_coat(spec, rig, direction) for spec, rig in zip(RIGS, solved)]
        composites = []
        for body, coat in zip(bodies, coats):
            composite = body.copy()
            composite.alpha_composite(coat)
            composites.append(composite)
        body_rows.append(bodies)
        coat_rows.append(coats)
        composite_rows.append(composites)

    body_grid = make_grid(body_rows)
    coat_grid = make_grid(coat_rows)
    composite_grid = make_grid(composite_rows)
    body_grid.save(out_dir / "base-rigs-4dir.png", optimize=True)
    coat_grid.save(out_dir / "raincoat-overlays-4dir.png", optimize=True)
    composite_grid.save(out_dir / "raincoat-composites-4dir.png", optimize=True)

    label_top = 26
    label_left = 42
    panel_w = FRAME_W * SCALE
    panel_h = FRAME_H * SCALE
    preview = Image.new(
        "RGBA",
        (label_left + panel_w * len(RIGS), label_top + panel_h * len(DIRECTIONS)),
        (19, 18, 24, 255),
    )
    draw = ImageDraw.Draw(preview)
    for column, spec in enumerate(RIGS):
        draw.text((label_left + column * panel_w + 6, 8), spec.label, fill=(220, 211, 195, 255))
    for row, direction in enumerate(DIRECTIONS):
        draw.text((7, label_top + row * panel_h + 8), direction.upper(), fill=(196, 180, 151, 255))
        for column, frame in enumerate(composite_rows[row]):
            enlarged = dark_preview(frame).resize((panel_w, panel_h), Image.Resampling.NEAREST)
            preview.alpha_composite(enlarged, (label_left + column * panel_w, label_top + row * panel_h))
    for column in range(1, len(RIGS)):
        x = label_left + column * panel_w
        draw.line((x, 0, x, preview.height), fill=(67, 57, 70, 255), width=1)
    for row in range(1, len(DIRECTIONS)):
        y = label_top + row * panel_h
        draw.line((0, y, preview.width, y), fill=(67, 57, 70, 255), width=1)
    preview.convert("RGB").save(out_dir / "four-direction-comparison.png", optimize=True)

    gif_frames = []
    for row in range(len(DIRECTIONS)):
        strip = Image.new("RGBA", (FRAME_W * len(RIGS), FRAME_H), (43, 38, 48, 255))
        for column, frame in enumerate(composite_rows[row]):
            strip.alpha_composite(frame, (column * FRAME_W, 0))
        enlarged = strip.resize((strip.width * SCALE, strip.height * SCALE), Image.Resampling.NEAREST)
        gif_frames.append(enlarged.convert("P", palette=Image.Palette.ADAPTIVE, colors=16))
    gif_frames[0].save(
        out_dir / "four-direction-turn.gif",
        save_all=True,
        append_images=gif_frames[1:],
        duration=650,
        loop=0,
        optimize=True,
        disposal=2,
    )

    direction_rules = {
        "front": {
            "near_hand": "both",
            "visible_slots": ["face", "neck", "chest-left", "chest-center", "chest-right", "left-hand", "right-hand", "waist", "back-edge"],
            "layer_order": ["shadow", "back", "body", "coat", "chest", "hands", "face", "front-fx"],
        },
        "back": {
            "near_hand": "both",
            "visible_slots": ["head-back", "back", "left-hand", "right-hand", "waist-back", "shadow"],
            "hidden_slots": ["face", "neck-front", "chest-left", "chest-center", "chest-right"],
            "layer_order": ["shadow", "body", "hands-far", "coat-back", "back-item", "hands-near", "front-fx"],
        },
        "left": {
            "near_hand": "left",
            "far_hand": "right",
            "visible_slots": ["face-profile", "neck-side", "chest-side", "back", "left-hand", "waist-side"],
            "layer_order": ["shadow", "far-hand", "back", "body", "coat", "chest-side", "near-hand", "face", "front-fx"],
        },
        "right": {
            "near_hand": "right",
            "far_hand": "left",
            "visible_slots": ["face-profile", "neck-side", "chest-side", "back", "right-hand", "waist-side"],
            "layer_order": ["shadow", "far-hand", "back", "body", "coat", "chest-side", "near-hand", "face", "front-fx"],
        },
    }
    (out_dir / "four-direction-manifest.json").write_text(json.dumps({
        "frame_width": FRAME_W,
        "frame_height": FRAME_H,
        "directions": DIRECTIONS,
        "rigs": [spec.id for spec in RIGS],
        "root": [ROOT_X, ROOT_Y],
        "direction_rules": direction_rules,
    }, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"wrote {out_dir / 'four-direction-comparison.png'}")
    print(f"wrote {out_dir / 'four-direction-turn.gif'}")
    print("wrote native base, raincoat overlay, and composite 4-direction grids")


if __name__ == "__main__":
    main()
