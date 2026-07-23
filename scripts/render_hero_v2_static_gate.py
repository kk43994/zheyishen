#!/usr/bin/env python3
"""Build review-only modular hero v2 candidates from the approved style-1 identity.

The script never writes runtime assets. It preserves every approved head pixel,
redraws only the body below y=23, and emits structural, morph, anchor, and
wearable-pressure proofs for user approval.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output/art-canonical-v1/approved/hero-style1-4dir.png"
OUT = ROOT / "output/imagegen/zhe-yi-shen-hero-v2-static-gate-v1"

W = 40
H = 56
ROOT_X = 20
ROOT_Y = 49
DIRECTIONS = ("front", "back", "left", "right")
STATURES = ("short", "average", "tall")
BUILDS = ("slim", "average", "sturdy", "soft")

TRANSPARENT = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
COAL = (55, 52, 58, 255)
MID = (76, 71, 80, 255)
WORN = (103, 98, 98, 255)
SKIN = (218, 208, 186, 255)
SKIN_MID = (199, 181, 158, 255)

PAGE = (18, 17, 23, 255)
PANEL = (43, 38, 48, 255)
PANEL_ALT = (38, 34, 43, 255)
GRID = (70, 62, 73, 255)
TEXT = (218, 209, 192, 255)
SUBTEXT = (170, 162, 151, 255)
ACCENT = (198, 172, 101, 255)

RAIN = (184, 150, 44, 255)
RAIN_LIGHT = (214, 180, 73, 255)
PACK = (88, 82, 78, 255)
PACK_LIGHT = (145, 135, 125, 255)
FRAME = (118, 85, 61, 255)
FRAME_LIGHT = (173, 132, 82, 255)
TEAL = (105, 155, 151, 255)
PURPLE = (126, 113, 151, 255)
OLD_RED = (159, 53, 72, 255)
PAPER = (216, 208, 193, 255)

HEAD_BOTTOM = 23
SOURCE_ZONES = (
    ("head", 7, 22),
    ("torso", 23, 39),
    ("legs", 40, 46),
    ("feet", 47, 49),
)
STATURE_DELTAS = {
    "short": {"torso": -1, "legs": -3},
    "average": {"torso": 0, "legs": 0},
    "tall": {"torso": 1, "legs": 3},
}
WIDTH_PERCENT = {
    "slim": {"head": 100, "torso": 86, "legs": 90, "feet": 90},
    "average": {"head": 100, "torso": 100, "legs": 100, "feet": 100},
    "sturdy": {"head": 100, "torso": 114, "legs": 108, "feet": 108},
    "soft": {"head": 100, "torso": 126, "legs": 112, "feet": 112},
}


@dataclass(frozen=True)
class Variant:
    id: str
    label: str
    shoulder_half: int
    waist_half: int
    side_front: int
    side_back: int
    arm_width: int


VARIANTS = (
    Variant("b-modular", "V2 / MODULAR RECOMPOSED", 6, 5, 16, 25, 3),
)


def blank() -> Image.Image:
    return Image.new("RGBA", (W, H), TRANSPARENT)


def approved_frames() -> dict[str, Image.Image]:
    sheet = Image.open(SOURCE).convert("RGBA")
    if sheet.size != (W * 4, H):
        raise ValueError(f"expected approved hero sheet {(W * 4, H)}, got {sheet.size}")
    return {
        direction: sheet.crop((index * W, 0, (index + 1) * W, H))
        for index, direction in enumerate(DIRECTIONS)
    }


def draw_hand(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    draw.rectangle((x - 2, y - 2, x + 1, y + 1), fill=INK)
    draw.rectangle((x - 1, y - 1, x, y), fill=SKIN)
    draw.point((x, y), fill=SKIN_MID)


def draw_limb(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    width: int,
    color: tuple[int, int, int, int],
    *,
    hand: bool = False,
) -> None:
    draw.line((start, end), fill=INK, width=width)
    if width >= 3:
        draw.line((start, end), fill=color, width=max(1, width - 2))
    if hand:
        draw_hand(draw, end[0], end[1])


def draw_leg(
    draw: ImageDraw.ImageDraw,
    hip: tuple[int, int],
    foot: tuple[int, int],
    width: int,
    toe_sign: int,
) -> None:
    draw_limb(draw, hip, (foot[0], foot[1] - 2), width, COAL)
    x, y = foot
    if toe_sign < 0:
        draw.rectangle((x - 3, y - 1, x + 1, y), fill=INK)
        draw.point((x - 1, y - 1), fill=COAL)
    else:
        draw.rectangle((x - 1, y - 1, x + 3, y), fill=INK)
        draw.point((x + 1, y - 1), fill=COAL)


def preserve_head(source: Image.Image) -> Image.Image:
    result = blank()
    result.alpha_composite(source.crop((0, 0, W, HEAD_BOTTOM + 1)), (0, 0))
    return result


def draw_front_back(
    source: Image.Image,
    variant: Variant,
    direction: str,
) -> tuple[Image.Image, dict[str, Image.Image]]:
    layers = {name: blank() for name in ("far", "legs", "torso", "near", "head")}
    source_pixels = source.load()
    layer_pixels = {name: layer.load() for name, layer in layers.items()}
    for y in range(H):
        for x in range(W):
            pixel = source_pixels[x, y]
            if pixel[3] == 0:
                continue
            if y <= HEAD_BOTTOM:
                target = "head"
            elif y >= 40:
                target = "legs"
            elif x <= 12:
                target = "far" if direction == "front" else "near"
            elif x >= 28:
                target = "near" if direction == "front" else "far"
            else:
                target = "torso"
            layer_pixels[target][x, y] = pixel
    return source.copy(), layers


def draw_side(
    source: Image.Image,
    variant: Variant,
    direction: str,
) -> tuple[Image.Image, dict[str, Image.Image]]:
    layers = {name: blank() for name in ("far", "legs", "torso", "near", "head")}
    source_pixels = source.load()
    layer_pixels = {name: layer.load() for name, layer in layers.items()}
    for y in range(H):
        for x in range(W):
            pixel = source_pixels[x, y]
            if pixel[3] == 0:
                continue
            if y <= HEAD_BOTTOM:
                target = "head"
            elif y >= 40:
                target = "legs"
            elif direction == "left" and x >= 21:
                target = "near"
            elif direction == "right" and x <= 18:
                target = "near"
            elif direction == "left" and x <= 17:
                target = "far"
            elif direction == "right" and x >= 23:
                target = "far"
            else:
                target = "torso"
            layer_pixels[target][x, y] = pixel
    return source.copy(), layers


def build_variant(
    frames: dict[str, Image.Image],
    variant: Variant,
) -> tuple[dict[str, Image.Image], dict[str, dict[str, Image.Image]]]:
    result: dict[str, Image.Image] = {}
    layer_map: dict[str, dict[str, Image.Image]] = {}
    for direction in DIRECTIONS:
        if direction in {"front", "back"}:
            frame, layers = draw_front_back(frames[direction], variant, direction)
        else:
            frame, layers = draw_side(frames[direction], variant, direction)
        result[direction] = frame
        layer_map[direction] = layers
    return result, layer_map


def sprite_sheet(frames: dict[str, Image.Image]) -> Image.Image:
    sheet = Image.new("RGBA", (W * len(DIRECTIONS), H), TRANSPARENT)
    for index, direction in enumerate(DIRECTIONS):
        sheet.alpha_composite(frames[direction], (index * W, 0))
    return sheet


def preview_cell(frame: Image.Image, scale: int, background: tuple[int, int, int, int]) -> Image.Image:
    backing = Image.new("RGBA", frame.size, background)
    backing.alpha_composite(frame)
    return backing.resize((W * scale, H * scale), Image.Resampling.NEAREST)


def comparison_sheet(
    approved: dict[str, Image.Image],
    candidates: dict[str, dict[str, Image.Image]],
) -> Image.Image:
    scale = 7
    label_w = 140
    header_h = 28
    cell_w = W * scale + 18
    cell_h = H * scale + 18
    rows = [("CURRENT / V1", approved)] + [
        (variant.label, candidates[variant.id]) for variant in VARIANTS
    ]
    canvas = Image.new("RGBA", (label_w + cell_w * 4, header_h + cell_h * len(rows)), PAGE)
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((label_w + column * cell_w + 9, 8), direction.upper(), fill=TEXT)
    for row_index, (label, frames) in enumerate(rows):
        top = header_h + row_index * cell_h
        draw.rectangle((0, top, canvas.width - 1, top + cell_h - 1), fill=PANEL if row_index % 2 == 0 else PANEL_ALT)
        draw.text((8, top + 12), label, fill=ACCENT if row_index else SUBTEXT)
        for column, direction in enumerate(DIRECTIONS):
            left = label_w + column * cell_w
            enlarged = preview_cell(frames[direction], scale, PANEL)
            canvas.alpha_composite(enlarged, (left + 9, top + 9))
            draw.line((left, top, left, top + cell_h - 1), fill=GRID)
        draw.line((0, top + cell_h - 1, canvas.width, top + cell_h - 1), fill=GRID)
    return canvas


SEGMENT_COLORS = {
    "far": (78, 113, 135, 255),
    "legs": (75, 74, 92, 255),
    "torso": (171, 140, 56, 255),
    "head": (188, 172, 146, 255),
    "near": (159, 71, 88, 255),
}

ANATOMY_PARTS = (
    "hair",
    "head",
    "neck",
    "torso",
    "upperArmFar",
    "forearmFar",
    "handFar",
    "upperArmNear",
    "forearmNear",
    "handNear",
    "thighFar",
    "calfFar",
    "footFar",
    "thighNear",
    "calfNear",
    "footNear",
)
ANATOMY_RENDER_ORDER = (
    "neck",
    "head",
    "hair",
    "upperArmFar",
    "forearmFar",
    "handFar",
    "thighFar",
    "calfFar",
    "footFar",
    "torso",
    "thighNear",
    "calfNear",
    "footNear",
    "upperArmNear",
    "forearmNear",
    "handNear",
)
ANATOMY_COLORS = {
    "hair": (104, 91, 119, 255),
    "head": (211, 190, 155, 255),
    "neck": (180, 139, 113, 255),
    "torso": (180, 146, 51, 255),
    "upperArmFar": (61, 102, 135, 255),
    "forearmFar": (79, 132, 164, 255),
    "handFar": (121, 172, 194, 255),
    "upperArmNear": (143, 54, 74, 255),
    "forearmNear": (178, 72, 91, 255),
    "handNear": (213, 112, 123, 255),
    "thighFar": (72, 72, 103, 255),
    "calfFar": (91, 91, 128, 255),
    "footFar": (112, 112, 147, 255),
    "thighNear": (82, 106, 72, 255),
    "calfNear": (101, 132, 88, 255),
    "footNear": (129, 157, 113, 255),
}
SKIN_PIXELS = {
    (218, 208, 186, 255),
    (199, 181, 158, 255),
    (146, 119, 100, 255),
}


def tint_mask(mask: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    alpha = mask.getchannel("A")
    result = Image.new("RGBA", mask.size, color)
    result.putalpha(alpha.point(lambda value: 255 if value else 0))
    return result


def segment_sheet(layers: dict[str, dict[str, Image.Image]]) -> Image.Image:
    scale = 8
    header = 32
    panel_w = W * scale + 20
    panel_h = H * scale + 20
    canvas = Image.new("RGBA", (panel_w * 4, header + panel_h), PAGE)
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((column * panel_w + 10, 10), direction.upper(), fill=TEXT)
        frame = blank()
        for name in ("far", "legs", "torso", "head", "near"):
            frame.alpha_composite(tint_mask(layers[direction][name], SEGMENT_COLORS[name]))
        enlarged = preview_cell(frame, scale, PANEL)
        canvas.alpha_composite(enlarged, (column * panel_w + 10, header + 10))
        if column:
            draw.line((column * panel_w, 0, column * panel_w, canvas.height), fill=GRID)
    legend = "BLUE FAR / GOLD TORSO / RED NEAR / GREY LEGS / PAPER HEAD"
    draw.rectangle((8, canvas.height - 25, canvas.width - 8, canvas.height - 7), fill=(18, 17, 23, 220))
    draw.text((16, canvas.height - 22), legend, fill=SUBTEXT)
    return canvas


def is_near_side(direction: str, x: int) -> bool:
    if direction == "front":
        return x >= ROOT_X
    if direction == "back":
        return x < ROOT_X
    if direction == "left":
        return x >= ROOT_X
    return x <= ROOT_X


def is_face_pixel(
    frame: Image.Image,
    direction: str,
    x: int,
    y: int,
    pixel: tuple[int, int, int, int],
) -> bool:
    if pixel in SKIN_PIXELS:
        return True
    if direction == "back":
        return False
    skin_neighbours = 0
    for neighbour_y in range(max(0, y - 1), min(H, y + 2)):
        for neighbour_x in range(max(0, x - 1), min(W, x + 2)):
            if frame.getpixel((neighbour_x, neighbour_y)) in SKIN_PIXELS:
                skin_neighbours += 1
    return skin_neighbours >= 2


def anatomy_parts(frame: Image.Image, direction: str) -> dict[str, Image.Image]:
    parts = {name: blank() for name in ANATOMY_PARTS}
    outputs = {name: image.load() for name, image in parts.items()}
    source = frame.load()
    for y in range(H):
        for x in range(W):
            pixel = source[x, y]
            if pixel[3] == 0:
                continue
            if y <= 22:
                if 21 <= y <= 22 and abs(x - ROOT_X) <= 3 and pixel in SKIN_PIXELS:
                    part = "neck"
                else:
                    part = "head" if is_face_pixel(frame, direction, x, y, pixel) else "hair"
            elif y <= 24 and abs(x - ROOT_X) <= 5 and pixel in SKIN_PIXELS:
                part = "neck"
            elif y < 40:
                if direction in {"front", "back"}:
                    arm_pixel = x <= 13 or x >= 27
                else:
                    arm_pixel = x >= 21 if direction == "left" else x <= 18
                if not arm_pixel:
                    part = "torso"
                else:
                    suffix = "Near" if direction in {"left", "right"} or is_near_side(direction, x) else "Far"
                    if pixel in SKIN_PIXELS or y >= 36:
                        part = f"hand{suffix}"
                    elif y <= 30:
                        part = f"upperArm{suffix}"
                    else:
                        part = f"forearm{suffix}"
            else:
                suffix = "Near" if is_near_side(direction, x) else "Far"
                if y >= 48:
                    part = f"foot{suffix}"
                elif y >= 44:
                    part = f"calf{suffix}"
                else:
                    part = f"thigh{suffix}"
            outputs[part][x, y] = pixel

    # The approved side idle hides the far arm completely. Keep a rig-only copy
    # under the torso so later animation can rotate it out without changing the
    # approved recomposed silhouette.
    if direction in {"left", "right"}:
        shift = -5 if direction == "left" else 5
        for source_name, target_name in (
            ("upperArmNear", "upperArmFar"),
            ("forearmNear", "forearmFar"),
            ("handNear", "handFar"),
        ):
            source_pixels = parts[source_name].load()
            target_pixels = parts[target_name].load()
            torso_alpha = parts["torso"].getchannel("A").load()
            for y in range(H):
                for x in range(W):
                    destination_x = x + shift
                    if (
                        source_pixels[x, y][3]
                        and 0 <= destination_x < W
                        and torso_alpha[destination_x, y]
                    ):
                        target_pixels[destination_x, y] = source_pixels[x, y]

    # Fill surfaces hidden by hair/collar. They never change the approved idle
    # composite, but prevent holes when a hairstyle or outer garment is swapped.
    head_pixels = parts["head"].load()
    neck_pixels = parts["neck"].load()
    hair_alpha = parts["hair"].getchannel("A").load()
    torso_alpha = parts["torso"].getchannel("A").load()
    for y in range(HEAD_BOTTOM + 1):
        for x in range(W):
            if hair_alpha[x, y] and not head_pixels[x, y][3]:
                head_pixels[x, y] = SKIN
    neck_x = 19 if direction == "left" else 21 if direction == "right" else 20
    for y in range(20, 25):
        for x in range(neck_x - 1, neck_x + 2):
            if (hair_alpha[x, y] or torso_alpha[x, y]) and not neck_pixels[x, y][3]:
                neck_pixels[x, y] = SKIN_MID
    return parts


def anatomy_atlas(frames: dict[str, Image.Image]) -> Image.Image:
    atlas = Image.new("RGBA", (W * len(DIRECTIONS), H * len(ANATOMY_PARTS)), TRANSPARENT)
    for row, part in enumerate(ANATOMY_PARTS):
        for column, direction in enumerate(DIRECTIONS):
            atlas.alpha_composite(anatomy_parts(frames[direction], direction)[part], (column * W, row * H))
    return atlas


def anatomy_sheet(frames: dict[str, Image.Image]) -> Image.Image:
    scale = 8
    header = 32
    legend_h = 70
    panel_w = W * scale + 20
    panel_h = H * scale + 20
    canvas = Image.new("RGBA", (panel_w * 4, header + panel_h + legend_h), PAGE)
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((column * panel_w + 10, 10), direction.upper(), fill=TEXT)
        tinted = blank()
        parts = anatomy_parts(frames[direction], direction)
        for part in ANATOMY_RENDER_ORDER:
            mask = parts[part]
            tinted.alpha_composite(tint_mask(mask, ANATOMY_COLORS[part]))
        canvas.alpha_composite(preview_cell(tinted, scale, PANEL), (column * panel_w + 10, header + 10))
        if column:
            draw.line((column * panel_w, 0, column * panel_w, header + panel_h), fill=GRID)
    legend_top = header + panel_h + 8
    for index, part in enumerate(ANATOMY_PARTS):
        column = index % 8
        row = index // 8
        x = 12 + column * (canvas.width // 8)
        y = legend_top + row * 24
        draw.rectangle((x, y, x + 11, y + 11), fill=ANATOMY_COLORS[part])
        draw.text((x + 16, y + 1), part, fill=SUBTEXT)
    return canvas


def anatomy_parts_sheet(
    frames: dict[str, Image.Image],
    selected_parts: tuple[str, ...],
    title: str,
) -> Image.Image:
    scale = 4
    title_h = 34
    header_h = 28
    label_w = 150
    cell_w = W * scale + 14
    cell_h = H * scale + 12
    canvas = Image.new(
        "RGBA",
        (label_w + cell_w * len(DIRECTIONS), title_h + header_h + cell_h * len(selected_parts)),
        PAGE,
    )
    draw = ImageDraw.Draw(canvas)
    draw.text((10, 10), title, fill=ACCENT)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((label_w + column * cell_w + 7, title_h + 7), direction.upper(), fill=TEXT)
    per_direction = {
        direction: anatomy_parts(frames[direction], direction)
        for direction in DIRECTIONS
    }
    for row, part in enumerate(selected_parts):
        top = title_h + header_h + row * cell_h
        draw.rectangle((0, top, canvas.width - 1, top + cell_h - 1), fill=PANEL if row % 2 == 0 else PANEL_ALT)
        draw.rectangle((8, top + 12, 19, top + 23), fill=ANATOMY_COLORS[part])
        draw.text((27, top + 12), part, fill=SUBTEXT)
        for column, direction in enumerate(DIRECTIONS):
            isolated = tint_mask(per_direction[direction][part], ANATOMY_COLORS[part])
            canvas.alpha_composite(
                preview_cell(isolated, scale, PANEL),
                (label_w + column * cell_w + 7, top + 6),
            )
        draw.line((0, top + cell_h - 1, canvas.width, top + cell_h - 1), fill=GRID)
    return canvas


def composite_anatomy(parts: dict[str, Image.Image]) -> Image.Image:
    result = blank()
    for part in ANATOMY_RENDER_ORDER:
        result.alpha_composite(parts[part])
    return result


def round_ratio(numerator: int, denominator: int) -> int:
    sign = -1 if numerator < 0 else 1
    return sign * ((abs(numerator) + denominator // 2) // denominator)


def morph_rows(stature: str) -> list[tuple[int, int, str]]:
    lengths = []
    for zone, start, end in SOURCE_ZONES:
        length = end - start + 1
        if zone in {"torso", "legs"}:
            length += STATURE_DELTAS[stature][zone]
        lengths.append(length)
    destination_y = ROOT_Y + 1 - sum(lengths)
    rows: list[tuple[int, int, str]] = []
    for (zone, start, end), target_length in zip(SOURCE_ZONES, lengths):
        source_length = end - start + 1
        for target_offset in range(target_length):
            source_offset = min(source_length - 1, (target_offset * source_length) // target_length)
            rows.append((destination_y, start + source_offset, zone))
            destination_y += 1
    return rows


def warp(frame: Image.Image, stature: str, build: str) -> Image.Image:
    result = blank()
    source = frame.load()
    target = result.load()
    for destination_y, source_y, zone in morph_rows(stature):
        width = WIDTH_PERCENT[build][zone]
        for destination_x in range(W):
            source_x = ROOT_X + round_ratio((destination_x - ROOT_X) * 100, width)
            if 0 <= source_x < W:
                target[destination_x, destination_y] = source[source_x, source_y]
    return result


def morph_sheet(frames: dict[str, Image.Image]) -> Image.Image:
    profiles = [(stature, build) for stature in STATURES for build in BUILDS]
    scale = 3
    label_w = 126
    header_h = 26
    cell_w = W * scale + 12
    cell_h = H * scale + 10
    canvas = Image.new("RGBA", (label_w + cell_w * 4, header_h + cell_h * len(profiles)), PAGE)
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((label_w + column * cell_w + 7, 7), direction.upper(), fill=TEXT)
    for row, (stature, build) in enumerate(profiles):
        top = header_h + row * cell_h
        draw.rectangle((0, top, canvas.width - 1, top + cell_h - 1), fill=PANEL if row % 2 == 0 else PANEL_ALT)
        draw.text((8, top + 9), f"{stature}-{build}".upper(), fill=ACCENT)
        for column, direction in enumerate(DIRECTIONS):
            left = label_w + column * cell_w
            altered = warp(frames[direction], stature, build)
            canvas.alpha_composite(preview_cell(altered, scale, PANEL), (left + 6, top + 5))
        draw.line((0, top + cell_h - 1, canvas.width, top + cell_h - 1), fill=GRID)
    return canvas


ANCHORS = {
    "front": {
        "hair": (20, 7), "face": (20, 17), "neck": (20, 23),
        "chest": (20, 29), "chestNear": (26, 29), "chestFar": (14, 29),
        "back": (20, 29), "handNear": (29, 36), "handFar": (11, 36),
        "waistNear": (26, 40), "waistFar": (14, 40),
        "footNear": (24, 49), "footFar": (16, 49), "orbit": (20, 30), "ground": (20, 49),
    },
    "back": {
        "hair": (20, 7), "face": (20, 17), "neck": (20, 23),
        "chest": (20, 29), "chestNear": (14, 29), "chestFar": (26, 29),
        "back": (20, 29), "handNear": (11, 36), "handFar": (29, 36),
        "waistNear": (14, 40), "waistFar": (26, 40),
        "footNear": (16, 49), "footFar": (24, 49), "orbit": (20, 30), "ground": (20, 49),
    },
    "left": {
        "hair": (20, 7), "face": (15, 17), "neck": (19, 23),
        "chest": (18, 29), "chestNear": (22, 29), "chestFar": (17, 29),
        "back": (25, 29), "handNear": (22, 37), "handFar": (17, 37),
        "waistNear": (22, 40), "waistFar": (17, 40),
        "footNear": (22, 49), "footFar": (17, 49), "orbit": (20, 30), "ground": (20, 49),
    },
    "right": {
        "hair": (20, 7), "face": (25, 17), "neck": (21, 23),
        "chest": (22, 29), "chestNear": (18, 29), "chestFar": (23, 29),
        "back": (15, 29), "handNear": (17, 37), "handFar": (23, 37),
        "waistNear": (18, 40), "waistFar": (23, 40),
        "footNear": (18, 49), "footFar": (23, 49), "orbit": (20, 30), "ground": (20, 49),
    },
}

JOINT_ANCHORS = {
    "front": {
        "neck": (20, 23),
        "shoulderFar": (13, 26), "elbowFar": (11, 31), "wristFar": (11, 35), "handFar": (11, 37),
        "shoulderNear": (27, 26), "elbowNear": (29, 31), "wristNear": (29, 35), "handNear": (29, 37),
        "hipFar": (17, 39), "kneeFar": (16, 44), "ankleFar": (16, 48), "footFar": (16, 49),
        "hipNear": (23, 39), "kneeNear": (24, 44), "ankleNear": (24, 48), "footNear": (24, 49),
    },
    "back": {
        "neck": (20, 23),
        "shoulderFar": (27, 26), "elbowFar": (29, 31), "wristFar": (29, 35), "handFar": (29, 37),
        "shoulderNear": (13, 26), "elbowNear": (11, 31), "wristNear": (11, 35), "handNear": (11, 37),
        "hipFar": (23, 39), "kneeFar": (24, 44), "ankleFar": (24, 48), "footFar": (24, 49),
        "hipNear": (17, 39), "kneeNear": (16, 44), "ankleNear": (16, 48), "footNear": (16, 49),
    },
    "left": {
        "neck": (19, 23),
        "shoulderFar": (17, 27), "elbowFar": (17, 32), "wristFar": (17, 35), "handFar": (17, 37),
        "shoulderNear": (22, 27), "elbowNear": (22, 32), "wristNear": (22, 35), "handNear": (22, 37),
        "hipFar": (17, 39), "kneeFar": (17, 44), "ankleFar": (17, 48), "footFar": (17, 49),
        "hipNear": (22, 39), "kneeNear": (22, 44), "ankleNear": (22, 48), "footNear": (22, 49),
    },
    "right": {
        "neck": (21, 23),
        "shoulderFar": (23, 27), "elbowFar": (23, 32), "wristFar": (23, 35), "handFar": (23, 37),
        "shoulderNear": (18, 27), "elbowNear": (18, 32), "wristNear": (18, 35), "handNear": (17, 37),
        "hipFar": (23, 39), "kneeFar": (23, 44), "ankleFar": (23, 48), "footFar": (23, 49),
        "hipNear": (18, 39), "kneeNear": (18, 44), "ankleNear": (18, 48), "footNear": (18, 49),
    },
}
ANCHOR_COLORS = {
    "head": (226, 214, 181, 255),
    "body": (198, 172, 101, 255),
    "near": (184, 70, 89, 255),
    "far": (91, 151, 178, 255),
    "world": (126, 160, 118, 255),
}


def anchor_group(name: str) -> str:
    if name in {"hair", "face", "neck"}:
        return "head"
    if "Near" in name:
        return "near"
    if "Far" in name or name == "back":
        return "far"
    if name in {"orbit", "ground"}:
        return "world"
    return "body"


def anchor_sheet(frames: dict[str, Image.Image]) -> Image.Image:
    scale = 8
    header = 32
    panel_w = W * scale + 20
    panel_h = H * scale + 20
    canvas = Image.new("RGBA", (panel_w * 4, header + panel_h), PAGE)
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((column * panel_w + 10, 10), direction.upper(), fill=TEXT)
        canvas.alpha_composite(preview_cell(frames[direction], scale, PANEL), (column * panel_w + 10, header + 10))
        origin_x = column * panel_w + 10
        origin_y = header + 10
        for name, (x, y) in ANCHORS[direction].items():
            color = ANCHOR_COLORS[anchor_group(name)]
            cx = origin_x + x * scale + scale // 2
            cy = origin_y + y * scale + scale // 2
            draw.rectangle((cx - 3, cy - 3, cx + 3, cy + 3), fill=color, outline=INK)
        if column:
            draw.line((column * panel_w, 0, column * panel_w, canvas.height), fill=GRID)
    draw.rectangle((8, canvas.height - 25, canvas.width - 8, canvas.height - 7), fill=(18, 17, 23, 220))
    draw.text((16, canvas.height - 22), "PAPER HEAD / GOLD BODY / RED NEAR / BLUE FAR / GREEN WORLD", fill=SUBTEXT)
    return canvas


def draw_pixel_frame(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    draw.line((x0, y0, x1, y0), fill=color)
    draw.line((x0, y1, x1, y1), fill=color)
    draw.line((x0, y0, x0, y1), fill=color)
    draw.line((x1, y0, x1, y1), fill=color)


def shifted_outline(frame: Image.Image, offset_x: int, color: tuple[int, int, int, int]) -> Image.Image:
    result = blank()
    source_alpha = frame.getchannel("A")
    source = source_alpha.load()
    target = result.load()
    for y in range(H):
        for x in range(W):
            if source[x, y] == 0:
                continue
            boundary = any(
                nx < 0 or nx >= W or ny < 0 or ny >= H or source[nx, ny] == 0
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
            )
            destination_x = x + offset_x
            if boundary and 0 <= destination_x < W:
                target[destination_x, y] = color
    return result


def pressure_composite(frame: Image.Image, direction: str) -> Image.Image:
    result = blank()
    behind = blank()
    behind_draw = ImageDraw.Draw(behind)
    # Empty frame, auto-renew loop, flash afterimage, painless-night weight.
    draw_pixel_frame(behind_draw, (6, 10, 34, 48), FRAME)
    behind_draw.point((7, 11), fill=FRAME_LIGHT)
    behind_draw.ellipse((10, 45, 30, 53), outline=TEAL)
    for x in (11, 17, 23, 29):
        behind_draw.rectangle((x, 50, x + 2, 52), fill=PURPLE)
    behind.alpha_composite(shifted_outline(frame, -3 if direction != "right" else 3, PURPLE))

    # Stone schoolbag sits behind the body.
    anchors = ANCHORS[direction]
    bx, by = anchors["back"]
    if direction == "back":
        behind_draw.rectangle((bx - 6, by - 6, bx + 6, by + 8), fill=INK)
        behind_draw.rectangle((bx - 5, by - 5, bx + 5, by + 7), fill=PACK)
        behind_draw.line((bx - 3, by - 3, bx + 3, by - 3), fill=PACK_LIGHT)
    elif direction in {"left", "right"}:
        sign = 1 if direction == "left" else -1
        outer_x0, outer_x1 = sorted((bx - 3, bx + 4 * sign))
        inner_x0, inner_x1 = sorted((bx - 2, bx + 3 * sign))
        behind_draw.rectangle((outer_x0, by - 5, outer_x1, by + 7), fill=INK)
        behind_draw.rectangle((inner_x0, by - 4, inner_x1, by + 6), fill=PACK)
    else:
        behind_draw.line((15, 25, 13, 37), fill=PACK_LIGHT, width=2)
        behind_draw.line((25, 25, 27, 37), fill=PACK_LIGHT, width=2)

    result.alpha_composite(behind)
    result.alpha_composite(frame)

    front = blank()
    front_draw = ImageDraw.Draw(front)
    # Raincoat is an outer garment, kept open enough to preserve the face and hands.
    if direction in {"front", "back"}:
        front_draw.polygon(((12, 24), (28, 24), (29, 40), (26, 44), (20, 42), (14, 44), (11, 40)), fill=INK)
        front_draw.polygon(((14, 25), (26, 25), (27, 39), (25, 42), (20, 40), (15, 42), (13, 39)), fill=RAIN)
        front_draw.line((15, 25, 25, 25), fill=RAIN_LIGHT)
        if direction == "front":
            front_draw.line((20, 25, 20, 40), fill=RAIN_LIGHT)
        else:
            front_draw.line((14, 27, 26, 27), fill=PACK_LIGHT)
    else:
        sign = -1 if direction == "left" else 1
        front_draw.polygon(((15, 24), (25, 24), (26, 40), (23, 44), (16, 42), (14, 28)), fill=INK)
        front_draw.polygon(((16, 25), (24, 25), (24, 39), (22, 42), (17, 40), (16, 28)), fill=RAIN)
        front_draw.line((16, 25, 23, 25), fill=RAIN_LIGHT)
        front_draw.line((20 + sign, 26, 20 + sign, 39), fill=RAIN_LIGHT)

    # Mother's bowl shield and razor/forearm mark stay in front.
    cx, cy = anchors["chest"]
    front_draw.arc((cx - 8, cy - 7, cx + 8, cy + 9), 200, 340, fill=RAIN_LIGHT, width=1)
    hx, hy = anchors["handNear"]
    front_draw.line((hx - 3, hy, hx + 3, hy), fill=PAPER)
    front_draw.point((hx + 3, hy + 1), fill=OLD_RED)
    if direction != "back":
        front_draw.point((hx, hy - 4), fill=OLD_RED)
        front_draw.point((hx, hy - 2), fill=OLD_RED)
    result.alpha_composite(front)
    return result


def pressure_sheet(variants: dict[str, dict[str, Image.Image]]) -> Image.Image:
    scale = 6
    label_w = 140
    header_h = 28
    cell_w = W * scale + 16
    cell_h = H * scale + 16
    canvas = Image.new("RGBA", (label_w + cell_w * 4, header_h + cell_h * len(VARIANTS)), PAGE)
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((label_w + column * cell_w + 8, 8), direction.upper(), fill=TEXT)
    for row, variant in enumerate(VARIANTS):
        top = header_h + row * cell_h
        draw.rectangle((0, top, canvas.width - 1, top + cell_h - 1), fill=PANEL if row % 2 == 0 else PANEL_ALT)
        draw.text((8, top + 10), variant.label, fill=ACCENT)
        for column, direction in enumerate(DIRECTIONS):
            composite = pressure_composite(variants[variant.id][direction], direction)
            canvas.alpha_composite(preview_cell(composite, scale, PANEL), (label_w + column * cell_w + 8, top + 8))
        draw.line((0, top + cell_h - 1, canvas.width, top + cell_h - 1), fill=GRID)
    return canvas


def alpha_bbox(frame: Image.Image) -> tuple[int, int, int, int]:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError("empty frame")
    return bbox


def validate(
    approved: dict[str, Image.Image],
    variants: dict[str, dict[str, Image.Image]],
) -> dict[str, object]:
    report: dict[str, object] = {"valid": True, "errors": [], "variants": {}}
    errors: list[str] = report["errors"]  # type: ignore[assignment]
    for variant in VARIANTS:
        direction_report: dict[str, object] = {}
        for direction in DIRECTIONS:
            frame = variants[variant.id][direction]
            alpha_values = set(frame.getchannel("A").getdata())
            if not alpha_values.issubset({0, 255}):
                errors.append(f"{variant.id}/{direction}: non-binary alpha")
            for y in range(HEAD_BOTTOM + 1):
                for x in range(W):
                    if frame.getpixel((x, y)) != approved[direction].getpixel((x, y)):
                        errors.append(f"{variant.id}/{direction}: approved head changed at {x},{y}")
                        break
                else:
                    continue
                break
            bbox = alpha_bbox(frame)
            if bbox[3] - 1 != ROOT_Y:
                errors.append(f"{variant.id}/{direction}: root moved to y={bbox[3] - 1}")
            color_count = len({pixel for pixel in frame.getdata() if pixel[3]})
            if color_count > 8:
                errors.append(f"{variant.id}/{direction}: {color_count} opaque colors exceeds 8")
            parts = anatomy_parts(frame, direction)
            recomposed = composite_anatomy(parts)
            if list(recomposed.getdata()) != list(frame.getdata()):
                errors.append(f"{variant.id}/{direction}: anatomy parts do not recompose exactly")
            empty_parts = [name for name, image in parts.items() if image.getchannel("A").getbbox() is None]
            if empty_parts:
                errors.append(f"{variant.id}/{direction}: empty anatomy parts {','.join(empty_parts)}")
            torso_bbox = frame.crop((0, 24, W, 41)).getchannel("A").getbbox()
            direction_report[direction] = {
                "bbox": list(bbox),
                "opaqueColors": color_count,
                "torsoWidth": 0 if torso_bbox is None else torso_bbox[2] - torso_bbox[0],
            }
        report["variants"][variant.id] = direction_report  # type: ignore[index]
    report["valid"] = not errors
    return report


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    approved = approved_frames()
    candidates: dict[str, dict[str, Image.Image]] = {}
    candidate_layers: dict[str, dict[str, dict[str, Image.Image]]] = {}
    for variant in VARIANTS:
        frames, layers = build_variant(approved, variant)
        candidates[variant.id] = frames
        candidate_layers[variant.id] = layers
        sprite_sheet(frames).save(OUT / f"hero-v2-{variant.id}-4dir.png", optimize=True)

    comparison_sheet(approved, candidates).convert("RGB").save(OUT / "01-hero-v2-four-direction-gate.png", optimize=True)
    segment_sheet(candidate_layers["b-modular"]).convert("RGB").save(OUT / "02-hero-v2-b-segments.png", optimize=True)
    anchor_sheet(candidates["b-modular"]).convert("RGB").save(OUT / "03-hero-v2-b-anchors.png", optimize=True)
    morph_sheet(candidates["b-modular"]).convert("RGB").save(OUT / "04-hero-v2-b-12-morphs.png", optimize=True)
    pressure_sheet(candidates).convert("RGB").save(OUT / "05-hero-v2-eight-item-pressure.png", optimize=True)
    anatomy_sheet(candidates["b-modular"]).convert("RGB").save(OUT / "06-hero-v2-b-anatomy.png", optimize=True)
    anatomy_parts_sheet(
        candidates["b-modular"],
        ("hair", "head", "neck", "torso"),
        "HEAD / NECK / TORSO PARTS",
    ).convert("RGB").save(OUT / "07-hero-v2-b-head-torso-parts.png", optimize=True)
    anatomy_parts_sheet(
        candidates["b-modular"],
        ("upperArmFar", "forearmFar", "handFar", "upperArmNear", "forearmNear", "handNear"),
        "NEAR / FAR ARM PARTS",
    ).convert("RGB").save(OUT / "08-hero-v2-b-arm-parts.png", optimize=True)
    anatomy_parts_sheet(
        candidates["b-modular"],
        ("thighFar", "calfFar", "footFar", "thighNear", "calfNear", "footNear"),
        "NEAR / FAR LEG PARTS",
    ).convert("RGB").save(OUT / "09-hero-v2-b-leg-parts.png", optimize=True)
    anatomy_atlas(candidates["b-modular"]).save(OUT / "hero-v2-b-anatomy-atlas.png", optimize=True)

    anatomy_dir = OUT / "hero-v2-b-anatomy-parts"
    anatomy_dir.mkdir(exist_ok=True)
    for direction in DIRECTIONS:
        parts = anatomy_parts(candidates["b-modular"][direction], direction)
        for part, image in parts.items():
            image.save(anatomy_dir / f"{direction}-{part}.png", optimize=True)

    qa = validate(approved, candidates)
    manifest = {
        "status": "review-only",
        "runtimeAssetsModified": False,
        "source": str(SOURCE.relative_to(ROOT)),
        "sourceSha256": sha256(SOURCE),
        "logicalFrame": [W, H],
        "root": [ROOT_X, ROOT_Y],
        "headPreservedThroughY": HEAD_BOTTOM,
        "directions": list(DIRECTIONS),
        "variants": [variant.__dict__ for variant in VARIANTS],
        "recommendedForGate": "b-modular",
        "anchors": ANCHORS,
        "jointAnchors": JOINT_ANCHORS,
        "anatomyParts": list(ANATOMY_PARTS),
        "anatomyPartLayout": {
            "atlasColumns": list(DIRECTIONS),
            "atlasRows": list(ANATOMY_PARTS),
            "renderOrderBackToFront": list(ANATOMY_RENDER_ORDER),
            "individualFiles": "hero-v2-b-anatomy-parts/{direction}-{part}.png",
            "jointOverlapPixels": 1,
            "rigOnlyOccludedSurfaces": ["head-under-hair", "neck-under-collar", "side-far-arm-under-torso"],
        },
        "pressureItems": [
            "fathers-raincoat",
            "stone-schoolbag",
            "eyebrow-razor",
            "empty-frame",
            "auto-renew",
            "moms-bowl",
            "flash-escape",
            "painless-night",
        ],
        "qa": qa,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not qa["valid"]:
        raise AssertionError("hero v2 static gate failed: " + "; ".join(qa["errors"]))
    print(f"wrote hero v2 static gate to {OUT}")


if __name__ == "__main__":
    main()
