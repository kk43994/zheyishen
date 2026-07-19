#!/usr/bin/env python3
"""Render six fixed body rigs and a body-fitted raincoat proof at native pixel size."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image, ImageDraw


FRAME_W = 40
FRAME_H = 56
ROOT_X = 20
ROOT_Y = 52
SCALE = 6

INK = (24, 23, 29, 255)
DEEP = (42, 39, 46, 255)
SKIN = (185, 163, 140, 255)
SKIN_SHADOW = (138, 113, 98, 255)
HAIR = (31, 29, 34, 255)
SWEATER = (87, 85, 91, 255)
SWEATER_LIGHT = (111, 107, 111, 255)
TROUSERS = (54, 53, 60, 255)
SHOE = (40, 35, 34, 255)
RAIN = (177, 138, 36, 255)
RAIN_LIGHT = (204, 167, 57, 255)
RAIN_SHADOW = (108, 82, 31, 255)


@dataclass(frozen=True)
class RigSpec:
    id: str
    label: str
    leg_length: int
    torso_height: int
    shoulder_width: int
    chest_width: int
    waist_width: int
    limb_width: int
    head_width: int
    head_height: int
    soft_belly: bool = False


RIGS = [
    RigSpec("tall-thin", "TALL THIN", 16, 14, 10, 8, 7, 2, 11, 10),
    RigSpec("tall-broad", "TALL BROAD", 15, 15, 16, 14, 13, 3, 12, 10),
    RigSpec("mid-thin", "MID THIN", 13, 13, 10, 8, 7, 2, 11, 10),
    RigSpec("mid-soft", "MID SOFT", 12, 13, 15, 14, 16, 3, 12, 10, True),
    RigSpec("short-thin", "SHORT THIN", 9, 12, 10, 8, 7, 2, 12, 11),
    RigSpec("short-soft", "SHORT SOFT", 8, 12, 15, 14, 17, 3, 13, 11, True),
]


@dataclass(frozen=True)
class SolvedRig:
    root: tuple[int, int]
    head_box: tuple[int, int, int, int]
    eyes: tuple[tuple[int, int], tuple[int, int]]
    neck: tuple[int, int]
    shoulders: tuple[tuple[int, int], tuple[int, int]]
    chest: tuple[int, int]
    waist: tuple[int, int]
    hands: tuple[tuple[int, int], tuple[int, int]]
    pelvis: tuple[int, int]
    feet: tuple[tuple[int, int], tuple[int, int]]
    torso_box: tuple[int, int, int, int]


def solve(spec: RigSpec) -> SolvedRig:
    foot_y = ROOT_Y - 1
    pelvis_y = foot_y - spec.leg_length
    torso_bottom = pelvis_y + 2
    torso_top = torso_bottom - spec.torso_height
    shoulder_y = torso_top + 2
    neck_y = torso_top - 1
    head_bottom = neck_y
    head_top = head_bottom - spec.head_height
    head_left = ROOT_X - spec.head_width // 2
    head_right = head_left + spec.head_width
    eye_y = head_top + spec.head_height // 2 + 1
    eye_gap = max(2, spec.head_width // 4)
    left_shoulder = ROOT_X - spec.shoulder_width // 2
    right_shoulder = ROOT_X + spec.shoulder_width // 2
    hand_y = min(pelvis_y + 1, shoulder_y + spec.torso_height - 2)
    stance = 3 if spec.waist_width < 10 else 4
    return SolvedRig(
        root=(ROOT_X, ROOT_Y),
        head_box=(head_left, head_top, head_right, head_bottom),
        eyes=((ROOT_X - eye_gap, eye_y), (ROOT_X + eye_gap, eye_y)),
        neck=(ROOT_X, neck_y),
        shoulders=((left_shoulder, shoulder_y), (right_shoulder, shoulder_y)),
        chest=(ROOT_X, torso_top + spec.torso_height // 2),
        waist=(ROOT_X, torso_bottom - 2),
        hands=((left_shoulder - 2, hand_y), (right_shoulder + 2, hand_y)),
        pelvis=(ROOT_X, pelvis_y),
        feet=((ROOT_X - stance, foot_y), (ROOT_X + stance, foot_y)),
        torso_box=(
            ROOT_X - spec.chest_width // 2,
            torso_top,
            ROOT_X + spec.chest_width // 2,
            torso_bottom,
        ),
    )


def draw_body(spec: RigSpec, rig: SolvedRig) -> Image.Image:
    image = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    left_foot, right_foot = rig.feet
    pelvis_x, pelvis_y = rig.pelvis
    leg_width = spec.limb_width
    for foot_x, direction in ((left_foot[0], -1), (right_foot[0], 1)):
        draw.line((pelvis_x + direction * 2, pelvis_y, foot_x, foot_x * 0 + left_foot[1] - 1), fill=INK, width=leg_width + 2)
        draw.line((pelvis_x + direction * 2, pelvis_y, foot_x, left_foot[1] - 1), fill=TROUSERS, width=leg_width)
        draw.rectangle((foot_x - 2, left_foot[1] - 1, foot_x + 2 + (1 if direction > 0 else 0), left_foot[1] + 1), fill=SHOE)

    left_shoulder, right_shoulder = rig.shoulders
    left_hand, right_hand = rig.hands
    draw.line((*left_shoulder, *left_hand), fill=INK, width=spec.limb_width + 3)
    draw.line((*right_shoulder, *right_hand), fill=INK, width=spec.limb_width + 3)
    draw.line((*left_shoulder, left_hand[0] + 1, left_hand[1] - 1), fill=SWEATER, width=spec.limb_width + 1)
    draw.line((*right_shoulder, right_hand[0] - 1, right_hand[1] - 1), fill=SWEATER, width=spec.limb_width + 1)
    draw.rectangle((left_hand[0] - 1, left_hand[1] - 1, left_hand[0] + 1, left_hand[1] + 1), fill=SKIN)
    draw.rectangle((right_hand[0] - 1, right_hand[1] - 1, right_hand[0] + 1, right_hand[1] + 1), fill=SKIN)

    torso_left, torso_top, torso_right, torso_bottom = rig.torso_box
    waist_half = spec.waist_width // 2
    body_polygon = [
        (left_shoulder[0] - 1, torso_top),
        (right_shoulder[0] + 1, torso_top),
        (ROOT_X + waist_half, torso_bottom),
        (ROOT_X - waist_half, torso_bottom),
    ]
    draw.polygon(body_polygon, fill=INK)
    inner = [
        (left_shoulder[0] + 1, torso_top + 1),
        (right_shoulder[0] - 1, torso_top + 1),
        (ROOT_X + max(2, waist_half - 1), torso_bottom - 1),
        (ROOT_X - max(2, waist_half - 1), torso_bottom - 1),
    ]
    draw.polygon(inner, fill=SWEATER)
    if spec.soft_belly:
        draw.rectangle((ROOT_X - waist_half + 2, rig.chest[1], ROOT_X + waist_half - 2, torso_bottom - 1), fill=SWEATER_LIGHT)
    else:
        draw.line((torso_left + 2, rig.chest[1], torso_right - 2, rig.chest[1]), fill=SWEATER_LIGHT, width=1)

    head_left, head_top, head_right, head_bottom = rig.head_box
    draw.ellipse((head_left - 1, head_top - 1, head_right + 1, head_bottom + 1), fill=INK)
    draw.ellipse((head_left, head_top, head_right, head_bottom), fill=SKIN)
    draw.rectangle((head_left, head_top, head_right, head_top + max(3, spec.head_height // 3)), fill=HAIR)
    draw.rectangle((head_left + 1, head_top + 2, head_left + 3, head_top + 5), fill=HAIR)
    draw.rectangle((head_right - 3, head_top + 1, head_right - 1, head_top + 4), fill=HAIR)
    for eye in rig.eyes:
        draw.point(eye, fill=INK)
    draw.point((ROOT_X, head_bottom - 2), fill=SKIN_SHADOW)
    return image


def draw_raincoat(spec: RigSpec, rig: SolvedRig) -> Image.Image:
    image = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    head_left, head_top, head_right, head_bottom = rig.head_box
    hood_padding = 2
    draw.ellipse(
        (head_left - hood_padding, head_top - hood_padding, head_right + hood_padding, head_bottom + 3),
        fill=INK,
    )
    draw.ellipse((head_left - 1, head_top - 1, head_right + 1, head_bottom + 1), fill=RAIN)
    draw.ellipse((head_left + 1, head_top + 1, head_right - 1, head_bottom), fill=(0, 0, 0, 0))

    left_shoulder, right_shoulder = rig.shoulders
    left_hand, right_hand = rig.hands
    sleeve_width = max(3, spec.limb_width + 2)
    draw.line((*left_shoulder, left_hand[0], left_hand[1] - 2), fill=INK, width=sleeve_width + 2)
    draw.line((*right_shoulder, right_hand[0], right_hand[1] - 2), fill=INK, width=sleeve_width + 2)
    draw.line((*left_shoulder, left_hand[0], left_hand[1] - 2), fill=RAIN, width=sleeve_width)
    draw.line((*right_shoulder, right_hand[0], right_hand[1] - 2), fill=RAIN, width=sleeve_width)

    torso_top = rig.torso_box[1] - 1
    hem_y = min(ROOT_Y - 4, rig.pelvis[1] + 7)
    shoulder_half = spec.shoulder_width // 2 + 2
    hem_half = max(spec.waist_width // 2 + 2, shoulder_half)
    coat = [
        (ROOT_X - shoulder_half, torso_top),
        (ROOT_X + shoulder_half, torso_top),
        (ROOT_X + hem_half, hem_y),
        (ROOT_X - hem_half, hem_y),
    ]
    draw.polygon(coat, fill=INK)
    inner = [
        (ROOT_X - shoulder_half + 1, torso_top + 1),
        (ROOT_X + shoulder_half - 1, torso_top + 1),
        (ROOT_X + hem_half - 1, hem_y - 1),
        (ROOT_X - hem_half + 1, hem_y - 1),
    ]
    draw.polygon(inner, fill=RAIN)
    draw.line((ROOT_X, torso_top + 2, ROOT_X, hem_y - 1), fill=RAIN_SHADOW, width=1)
    pocket_y = rig.chest[1] + 3
    draw.line((ROOT_X - max(3, hem_half // 2), pocket_y, ROOT_X - 1, pocket_y), fill=RAIN_LIGHT, width=1)
    draw.line((ROOT_X + 1, pocket_y, ROOT_X + max(3, hem_half // 2), pocket_y), fill=RAIN_LIGHT, width=1)
    for button_y in range(torso_top + 4, hem_y - 1, 5):
        draw.point((ROOT_X + 1, button_y), fill=RAIN_LIGHT)
    return image


def make_sheet(frames: list[Image.Image]) -> Image.Image:
    sheet = Image.new("RGBA", (FRAME_W * len(frames), FRAME_H), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * FRAME_W, 0))
    return sheet


def dark_preview(frame: Image.Image) -> Image.Image:
    background = Image.new("RGBA", frame.size, (43, 38, 48, 255))
    background.alpha_composite(frame)
    return background


def main() -> None:
    out_dir = Path("output/imagegen/zhe-yi-shen-rig-fit-proof")
    out_dir.mkdir(parents=True, exist_ok=True)
    solved = [solve(spec) for spec in RIGS]
    bases = [draw_body(spec, rig) for spec, rig in zip(RIGS, solved)]
    coats = [draw_raincoat(spec, rig) for spec, rig in zip(RIGS, solved)]
    composites = []
    for base, coat in zip(bases, coats):
        composed = base.copy()
        composed.alpha_composite(coat)
        composites.append(composed)

    base_sheet = make_sheet(bases)
    coat_sheet = make_sheet(coats)
    composite_sheet = make_sheet(composites)
    base_sheet.save(out_dir / "base-rigs.png", optimize=True)
    coat_sheet.save(out_dir / "raincoat-overlays.png", optimize=True)
    composite_sheet.save(out_dir / "raincoat-composites.png", optimize=True)

    label_h = 26
    row_h = FRAME_H * SCALE
    preview = Image.new("RGBA", (FRAME_W * SCALE * len(RIGS), label_h + row_h * 3), (19, 18, 24, 255))
    draw = ImageDraw.Draw(preview)
    for index, (spec, base, coat, composite) in enumerate(zip(RIGS, bases, coats, composites)):
        x = index * FRAME_W * SCALE
        draw.text((x + 8, 8), spec.label, fill=(220, 211, 195, 255))
        for row, frame in enumerate((base, coat, composite)):
            enlarged = dark_preview(frame).resize((FRAME_W * SCALE, FRAME_H * SCALE), Image.Resampling.NEAREST)
            preview.alpha_composite(enlarged, (x, label_h + row * row_h))
        if index:
            draw.line((x, 0, x, preview.height), fill=(67, 57, 70, 255), width=1)
    draw.line((0, label_h + row_h, preview.width, label_h + row_h), fill=(67, 57, 70, 255), width=1)
    draw.line((0, label_h + row_h * 2, preview.width, label_h + row_h * 2), fill=(67, 57, 70, 255), width=1)
    preview.convert("RGB").save(out_dir / "fit-comparison.png", optimize=True)

    gif_frames = []
    for sheet in (base_sheet, base_sheet, composite_sheet, composite_sheet):
        enlarged = dark_preview(sheet).resize((sheet.width * SCALE, sheet.height * SCALE), Image.Resampling.NEAREST)
        gif_frames.append(enlarged.convert("P", palette=Image.Palette.ADAPTIVE, colors=16))
    gif_frames[0].save(
        out_dir / "raincoat-fit.gif",
        save_all=True,
        append_images=gif_frames[1:],
        duration=(520, 240, 760, 240),
        loop=0,
        optimize=True,
        disposal=2,
    )

    manifest = []
    for spec, rig in zip(RIGS, solved):
        entry = {"spec": asdict(spec), "anchors": asdict(rig)}
        manifest.append(entry)
    (out_dir / "manifest.json").write_text(json.dumps({
        "frame_width": FRAME_W,
        "frame_height": FRAME_H,
        "root": [ROOT_X, ROOT_Y],
        "rigs": manifest,
    }, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"wrote {out_dir / 'fit-comparison.png'}")
    print(f"wrote {out_dir / 'raincoat-fit.gif'}")
    print(f"wrote 3 native-size runtime sheets and manifest in {out_dir}")


if __name__ == "__main__":
    main()
