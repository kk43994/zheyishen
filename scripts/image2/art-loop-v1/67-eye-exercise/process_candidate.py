#!/usr/bin/env python3
"""Gate Image2 sources and build exact eye-exercise trigger composites."""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


TASK_DIR = Path("scripts/image2/art-loop-v1/67-eye-exercise")
INPUT_DIR = TASK_DIR / "input"
OUTPUT_ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/67-eye-exercise")
BASE_PATH = INPUT_DIR / "base-hero-4action-4dir-40x56.png"
ARM_MASK_PATH = INPUT_DIR / "base-arm-cutout-mask-4action-4dir-40x56.png"
ANCHORS_PATH = INPUT_DIR / "anchors.json"

CELL_W = 40
CELL_H = 56
ACTIONS = ("idle", "walk", "attack", "hurt")
DIRECTIONS = ("front", "left", "back", "right")
REVIEW_BG = (21, 20, 26, 255)

# The exact output is palette-locked so chroma spill or lossy source colors can
# never turn the skin green. Image2 supplies the semantic/form reference only.
PALETTE = {
    "outline": (23, 21, 27, 255),
    "sleeve": (50, 69, 91, 255),
    "sleeve_highlight": (76, 101, 130, 255),
    "skin": (218, 208, 186, 255),
    "skin_shadow": (199, 181, 158, 255),
    "release": (145, 172, 195, 255),
}


def strip_green(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    keyed = (
        (green > 88)
        & (green * 100 > red * 125)
        & (green * 100 > blue * 125)
        & (np.maximum(red, blue) < 175)
    )
    near_key = np.asarray(
        Image.fromarray((keyed.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(5))
    ) > 0
    strongest_other = np.maximum(red, blue)
    spill = ~keyed & near_key & (green > strongest_other + 10)
    array[..., 1][spill] = strongest_other[spill].astype(np.uint8)
    array[..., 3][keyed] = 0
    array[..., :3][keyed] = 0
    return Image.fromarray(array)


def components(mask: np.ndarray, minimum: int = 1) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    result: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            queue = deque([(x, y)])
            seen[y, x] = True
            part: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                part.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if (
                        0 <= next_x < width
                        and 0 <= next_y < height
                        and mask[next_y, next_x]
                        and not seen[next_y, next_x]
                    ):
                        seen[next_y, next_x] = True
                        queue.append((next_x, next_y))
            if len(part) >= minimum:
                result.append(part)
    return sorted(result, key=len, reverse=True)


def enclosed_holes(mask: np.ndarray, minimum: int = 4) -> int:
    """Count transparent islands enclosed by opaque pixels."""
    inverse = ~mask
    height, width = inverse.shape
    seen = np.zeros_like(inverse, dtype=bool)
    holes = 0
    for y in range(height):
        for x in range(width):
            if not inverse[y, x] or seen[y, x]:
                continue
            queue = deque([(x, y)])
            seen[y, x] = True
            size = 0
            touches_edge = False
            while queue:
                current_x, current_y = queue.popleft()
                size += 1
                touches_edge |= (
                    current_x == 0
                    or current_x == width - 1
                    or current_y == 0
                    or current_y == height - 1
                )
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if (
                        0 <= next_x < width
                        and 0 <= next_y < height
                        and inverse[next_y, next_x]
                        and not seen[next_y, next_x]
                    ):
                        seen[next_y, next_x] = True
                        queue.append((next_x, next_y))
            if not touches_edge and size >= minimum:
                holes += 1
    return holes


def split_4x4(sheet: Image.Image) -> list[Image.Image]:
    panels: list[Image.Image] = []
    for row in range(4):
        top = row * sheet.height // 4
        bottom = (row + 1) * sheet.height // 4
        for column in range(4):
            left = column * sheet.width // 4
            right = (column + 1) * sheet.width // 4
            inset = max(1, round(min(right - left, bottom - top) * 0.008))
            panels.append(sheet.crop((left + inset, top + inset, right - inset, bottom - inset)))
    return panels


def source_cell_metrics(panel: Image.Image) -> dict[str, object]:
    sample = panel.copy()
    scale = min(1.0, 128 / max(sample.size))
    if scale < 1:
        sample = sample.resize(
            (max(1, round(sample.width * scale)), max(1, round(sample.height * scale))),
            Image.Resampling.NEAREST,
        )
    mask = np.asarray(sample.getchannel("A")) >= 96
    visible = int(mask.sum())
    coverage = visible / max(1, mask.size)
    parts = components(mask, minimum=3)
    holes = enclosed_holes(mask, minimum=4)
    ys, xs = np.where(mask)
    bbox = None if not len(xs) else [
        int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    ]
    tall_narrow = 0
    for part in parts:
        part_x = [point[0] for point in part]
        part_y = [point[1] for point in part]
        width = max(part_x) - min(part_x) + 1
        height = max(part_y) - min(part_y) + 1
        if height >= 14 and height >= width * 5:
            tall_narrow += 1
    return {
        "sampleSize": list(sample.size),
        "visiblePixels": visible,
        "coverage": round(coverage, 5),
        "bbox": bbox,
        "componentCount": len(parts),
        "dominantComponentRatio": 0.0 if not visible or not parts else round(len(parts[0]) / visible, 4),
        "enclosedHoles": holes,
        "tallNarrowComponents": tall_narrow,
    }


def source_gate(
    cleaned: Image.Image,
    source_columns: tuple[str, str, str, str],
) -> dict[str, object]:
    records = [source_cell_metrics(panel) for panel in split_4x4(cleaned)]
    coverage = [float(record["coverage"]) for record in records]
    visible = [int(record["visiblePixels"]) for record in records]
    component_counts = [int(record["componentCount"]) for record in records]
    holes = sum(int(record["enclosedHoles"]) for record in records)
    balance = min(visible) / max(1, max(visible))
    direction_index = {direction: index for index, direction in enumerate(source_columns)}
    directional_void_counts = {
        direction: [
            int(records[row * 4 + direction_index[direction]]["enclosedHoles"])
            for row in range(4)
        ]
        for direction in DIRECTIONS
    }
    rules = {
        "allSixteenCellsPopulated": all(value >= 0.006 for value in coverage),
        "balancedFourByFourCells": balance >= 0.14,
        "compactAttachedPartsPerCell": all(1 <= value <= 8 for value in component_counts),
        "oneHighlyConnectedPosePerCell": all(
            int(record["componentCount"]) <= 3
            and float(record["dominantComponentRatio"]) >= 0.94
            for record in records
        ),
    }
    named: dict[str, object] = {}
    for index, record in enumerate(records):
        row, column = divmod(index, 4)
        named[f"{ACTIONS[row]}-{source_columns[column]}"] = record
    return {
        "pass": all(rules.values()),
        "rules": rules,
        "minToMaxVisibleRatio": round(balance, 4),
        "totalEnclosedHoles": holes,
        "sourceColumnOrder": list(source_columns),
        "directionalInternalVoidCounts": directional_void_counts,
        "reportedTallNarrowComponents": sum(
            int(record["tallNarrowComponents"]) for record in records
        ),
        "cells": named,
    }


def load_inputs() -> tuple[Image.Image, Image.Image, dict[str, object]]:
    base = Image.open(BASE_PATH).convert("RGBA")
    arm_mask = Image.open(ARM_MASK_PATH).convert("RGBA")
    anchors = json.loads(ANCHORS_PATH.read_text(encoding="utf-8"))
    expected = (CELL_W * 4, CELL_H * 4)
    if base.size != expected or arm_mask.size != expected:
        raise ValueError(f"unexpected exact input size: base={base.size}, mask={arm_mask.size}")
    return base, arm_mask, anchors


def local_point(point: list[int] | tuple[int, int]) -> tuple[int, int]:
    return int(point[0]), int(point[1])


def global_point(point: tuple[int, int], column: int, row: int) -> tuple[int, int]:
    return point[0] + column * CELL_W, point[1] + row * CELL_H


def draw_complete_arm(
    layer: Image.Image,
    ring_layer: Image.Image,
    arm: dict[str, list[int]],
    column: int,
    row: int,
    *,
    draw_hand_ring: bool,
) -> None:
    draw = ImageDraw.Draw(layer)
    shoulder = global_point(local_point(arm["shoulder"]), column, row)
    elbow = global_point(local_point(arm["elbow"]), column, row)
    wrist = global_point(local_point(arm["wrist"]), column, row)
    target = global_point(local_point(arm["eyeTarget"]), column, row)
    draw.line((shoulder, elbow, wrist), fill=PALETTE["outline"], width=5, joint="curve")
    draw.line((shoulder, elbow, wrist), fill=PALETTE["sleeve"], width=3, joint="curve")
    draw.line((shoulder, elbow), fill=PALETTE["sleeve_highlight"], width=1)
    if not draw_hand_ring:
        return
    ring_draw = ImageDraw.Draw(ring_layer)
    ring_draw.line((wrist, (target[0], target[1] + 3)), fill=PALETTE["outline"], width=3)
    ring_draw.line((wrist, (target[0], target[1] + 3)), fill=PALETTE["skin_shadow"], width=1)

    # A deliberately coarse 5x5 thumb-index arc. The outward-side gap keeps it
    # from reading as hollow goggles, while the eyelid and contact pixels remain
    # readable. It is physically connected to wrist/sleeve/shoulder.
    outer = {
        (-1, -2), (0, -2), (1, -2),
        (-2, -1), (2, -1), (-2, 0), (2, 0), (-2, 1), (2, 1),
        (-1, 2), (0, 2), (1, 2),
    }
    finger = {
        (-1, -1), (0, -1), (1, -1),
        (-1, 0), (1, 0),
        (-1, 1), (0, 1), (1, 1),
    }
    outward = -1 if target[0] % CELL_W < CELL_W // 2 else 1
    outer.discard((outward * 2, 0))
    finger.discard((outward, 0))
    for dx, dy in outer:
        ring_draw.point((target[0] + dx, target[1] + dy), fill=PALETTE["outline"])
    for dx, dy in finger:
        ring_draw.point((target[0] + dx, target[1] + dy), fill=PALETTE["skin"])
    # Folded middle/ring fingers sit against the brow instead of opening into a
    # second clean circle. Their irregular offset gives the hand a pressing read.
    ring_draw.point((target[0] + outward * 2, target[1] - 2), fill=PALETTE["skin_shadow"])
    ring_draw.point((target[0] + outward * 3, target[1] - 1), fill=PALETTE["outline"])


def draw_occluded_far_fragment(
    layer: Image.Image,
    arm: dict[str, list[int]],
    column: int,
    row: int,
) -> None:
    """A profile far arm is hidden by the torso/head, leaving one compact cue."""
    draw = ImageDraw.Draw(layer)
    target = global_point(local_point(arm["eyeTarget"]), column, row)
    inward = 1 if target[0] % CELL_W < 20 else -1
    draw.line(
        ((target[0] - inward, target[1] + 3), (target[0], target[1] + 1)),
        fill=PALETTE["outline"],
        width=2,
    )
    draw.point(target, fill=PALETTE["skin_shadow"])


def draw_closed_eyes(
    layer: Image.Image,
    face: list[int],
    direction: str,
    column: int,
    row: int,
) -> None:
    if direction == "back":
        return
    draw = ImageDraw.Draw(layer)
    face_x, face_y = global_point(local_point(face), column, row)
    if direction == "front":
        for center_x in (face_x - 4, face_x + 4):
            draw.rectangle((center_x - 2, face_y, center_x + 2, face_y + 2), fill=PALETTE["skin"])
            draw.line((center_x - 1, face_y + 1, center_x + 1, face_y + 1), fill=PALETTE["outline"])
    elif direction == "left":
        draw.rectangle((face_x - 2, face_y, face_x + 1, face_y + 2), fill=PALETTE["skin"])
        draw.line((face_x - 1, face_y + 1, face_x + 1, face_y + 1), fill=PALETTE["outline"])
    else:
        draw.rectangle((face_x - 1, face_y, face_x + 2, face_y + 2), fill=PALETTE["skin"])
        draw.line((face_x - 1, face_y + 1, face_x + 1, face_y + 1), fill=PALETTE["outline"])


def clear_with_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    clear = np.asarray(mask.getchannel("A")) > 0
    array[clear] = (0, 0, 0, 0)
    return Image.fromarray(array)


def build_exact_assets() -> dict[str, Image.Image]:
    base, arm_mask, manifest = load_inputs()
    far_layer = Image.new("RGBA", base.size)
    near_layer = Image.new("RGBA", base.size)
    ring_layer = Image.new("RGBA", base.size)
    face_layer = Image.new("RGBA", base.size)

    anchors = manifest["anchors"]
    for row, action in enumerate(ACTIONS):
        for column, direction in enumerate(DIRECTIONS):
            record = anchors[action][direction]
            draw_closed_eyes(face_layer, record["face"], direction, column, row)
            if direction in {"left", "right"}:
                draw_occluded_far_fragment(far_layer, record["arms"]["far"], column, row)
                draw_complete_arm(
                    near_layer, ring_layer, record["arms"]["near"], column, row,
                    draw_hand_ring=True,
                )
            elif direction == "back":
                draw_complete_arm(
                    near_layer, ring_layer, record["arms"]["far"], column, row,
                    draw_hand_ring=False,
                )
                draw_complete_arm(
                    near_layer, ring_layer, record["arms"]["near"], column, row,
                    draw_hand_ring=False,
                )
            else:
                draw_complete_arm(
                    near_layer, ring_layer, record["arms"]["far"], column, row,
                    draw_hand_ring=True,
                )
                draw_complete_arm(
                    near_layer, ring_layer, record["arms"]["near"], column, row,
                    draw_hand_ring=True,
                )

    cut_base = clear_with_mask(base, arm_mask)
    press = Image.new("RGBA", base.size)
    press.alpha_composite(far_layer)
    press.alpha_composite(cut_base)
    press.alpha_composite(face_layer)
    press.alpha_composite(near_layer)
    press.alpha_composite(ring_layer)

    press_overlay = Image.new("RGBA", base.size)
    press_overlay.alpha_composite(far_layer)
    press_overlay.alpha_composite(face_layer)
    press_overlay.alpha_composite(near_layer)
    press_overlay.alpha_composite(ring_layer)

    release_overlay = Image.new("RGBA", base.size)
    release_draw = ImageDraw.Draw(release_overlay)
    for row, action in enumerate(ACTIONS):
        for column, direction in enumerate(DIRECTIONS):
            face = local_point(anchors[action][direction]["face"])
            origin_x = column * CELL_W
            origin_y = row * CELL_H
            side = -1 if direction in {"front", "left"} else 1
            for dx, dy in ((side * 8, -1), (side * 9, 1), (-side * 8, 3), (-side * 9, 4)):
                x = origin_x + face[0] + dx
                y = origin_y + face[1] + dy
                release_draw.point((x, y), fill=PALETTE["release"])

    release = base.copy()
    release.alpha_composite(release_overlay)
    return {
        "normal": base,
        "cutout": arm_mask,
        "press_overlay": press_overlay,
        "press": press,
        "release_overlay": release_overlay,
        "release": release,
        "far_layer": far_layer,
        "near_layer": near_layer,
        "ring_layer": ring_layer,
        "face_layer": face_layer,
    }


def count_exact_green(image: Image.Image) -> int:
    array = np.asarray(image.convert("RGBA"))
    return int(((array[..., 3] > 0) & np.all(array[..., :3] == (0, 255, 0), axis=2)).sum())


def transparent_rgb_count(image: Image.Image) -> int:
    array = np.asarray(image.convert("RGBA"))
    return int(((array[..., 3] == 0) & np.any(array[..., :3] != 0, axis=2)).sum())


def binary_alpha(image: Image.Image) -> bool:
    return set(np.unique(np.asarray(image.getchannel("A"))).tolist()) <= {0, 255}


def color_mask(image: Image.Image, colors: set[tuple[int, int, int, int]]) -> np.ndarray:
    array = np.asarray(image.convert("RGBA"))
    result = np.zeros(array.shape[:2], dtype=bool)
    for color in colors:
        result |= np.all(array == np.asarray(color, dtype=np.uint8), axis=2)
    return result


def touches(mask: np.ndarray, point: list[int], radius: int = 2) -> bool:
    x, y = int(point[0]), int(point[1])
    left, right = max(0, x - radius), min(mask.shape[1], x + radius + 1)
    top, bottom = max(0, y - radius), min(mask.shape[0], y + radius + 1)
    return bool(mask[top:bottom, left:right].any())


def max_vertical_run(mask: np.ndarray) -> int:
    longest = 0
    for column in mask.T:
        current = 0
        for value in column:
            current = current + 1 if value else 0
            longest = max(longest, current)
    return longest


def exact_gate(assets: dict[str, Image.Image]) -> dict[str, object]:
    base, expected_mask, manifest = load_inputs()
    press_overlay = assets["press_overlay"]
    release_overlay = assets["release_overlay"]
    face_layer = assets["face_layer"]
    ring_layer = assets["ring_layer"]
    sleeve_colors = {PALETTE["outline"], PALETTE["sleeve"], PALETTE["sleeve_highlight"]}
    skin_colors = {PALETTE["skin"], PALETTE["skin_shadow"]}
    records: dict[str, object] = {}
    anchor_rules: list[bool] = []
    target_rules: list[bool] = []
    upper_rules: list[bool] = []
    skin_rules: list[bool] = []
    back_face_rules: list[bool] = []
    ring_rules: list[bool] = []

    for row, action in enumerate(ACTIONS):
        for column, direction in enumerate(DIRECTIONS):
            key = f"{action}-{direction}"
            box = (column * CELL_W, row * CELL_H, (column + 1) * CELL_W, (row + 1) * CELL_H)
            overlay = press_overlay.crop(box)
            face = face_layer.crop(box)
            rings = ring_layer.crop(box)
            alpha = np.asarray(overlay.getchannel("A")) > 0
            sleeve = color_mask(overlay, sleeve_colors)
            skin = color_mask(overlay, skin_colors)
            ys, xs = np.where(alpha)
            bbox = None if not len(xs) else [
                int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
            ]
            anchor = manifest["anchors"][action][direction]
            full_sides = ("near",) if direction in {"left", "right"} else ("far", "near")
            shoulders_ok = all(touches(sleeve, anchor["arms"][side]["shoulder"], 2) for side in full_sides)
            if direction == "back":
                targets_ok = all(touches(sleeve, anchor["arms"][side]["eyeTarget"], 3) for side in full_sides)
            else:
                targets_ok = all(touches(skin, anchor["arms"][side]["eyeTarget"], 2) for side in full_sides)
            upper_only = not len(ys) or int(ys.max()) <= 30
            skin_y, _ = np.where(skin)
            skin_upper = not len(skin_y) or int(skin_y.max()) <= 22
            no_back_face = bool(
                direction != "back" or np.asarray(face.getchannel("A")).max() == 0
            )
            ring_mask = np.asarray(rings.getchannel("A")) > 0
            ring_holes = enclosed_holes(ring_mask)
            ring_components = len(components(ring_mask))
            expected_ring_components = 2 if direction == "front" else (0 if direction == "back" else 1)
            rings_ok = ring_holes == 0 and ring_components == expected_ring_components
            anchor_rules.append(shoulders_ok)
            target_rules.append(targets_ok)
            upper_rules.append(upper_only)
            skin_rules.append(skin_upper and max_vertical_run(skin) <= 6)
            back_face_rules.append(no_back_face)
            ring_rules.append(rings_ok)
            records[key] = {
                "bbox": bbox,
                "visiblePixels": int(alpha.sum()),
                "skinPixels": int(skin.sum()),
                "componentCount": len(components(alpha)),
                "shouldersTouched": shoulders_ok,
                "eyeOrTempleTargetsTouched": targets_ok,
                "maxSkinVerticalRun": max_vertical_run(skin),
                "upperBodyOnly": upper_only,
                "skinStopsAboveChest": skin_upper,
                "backFaceLayerEmpty": no_back_face,
                "attachedHandRingHoles": ring_holes,
                "attachedHandArcComponents": ring_components,
                "expectedHandArcComponents": expected_ring_components,
            }

    press_array = np.asarray(assets["press"].convert("RGBA"))
    base_array = np.asarray(base.convert("RGBA"))
    roots_unchanged = all(
        np.array_equal(
            press_array[row * CELL_H + 44:(row + 1) * CELL_H, :, :],
            base_array[row * CELL_H + 44:(row + 1) * CELL_H, :, :],
        )
        for row in range(4)
    )
    release_pixels_per_cell = []
    for row in range(4):
        for column in range(4):
            release_cell = release_overlay.crop(
                (column * CELL_W, row * CELL_H, (column + 1) * CELL_W, (row + 1) * CELL_H)
            )
            release_pixels_per_cell.append(int((np.asarray(release_cell.getchannel("A")) > 0).sum()))

    rules = {
        "exactFourActionFourDirectionDimensions": all(
            image.size == (CELL_W * 4, CELL_H * 4)
            for image in (
                assets["normal"], assets["cutout"], press_overlay, assets["press"],
                release_overlay, assets["release"],
            )
        ),
        "normalStateIsByteExactBaseHero": assets["normal"].tobytes() == base.tobytes(),
        "cutoutIsExactApprovedArmMask": assets["cutout"].tobytes() == expected_mask.tobytes(),
        "allRequiredSleevesStartAtShoulders": all(anchor_rules),
        "allHandsOrSleevesReachEyeTempleTargets": all(target_rules),
        "allPressPartsStayAboveY31": all(upper_rules),
        "skinIsOnlyShortWristAndFingerClusters": all(skin_rules),
        "backNeverReceivesEyeOrFaceDecal": all(back_face_rules),
        "compressedHandArcCountMatchesDirection": all(ring_rules),
        "feetAndRootRemainUnchanged": roots_unchanged,
        "releaseIsSparseAndBodyPreserving": (
            all(1 <= value <= 8 for value in release_pixels_per_cell)
            and np.array_equal(
                np.asarray(assets["release"].convert("RGBA"))[..., :3][
                    np.asarray(release_overlay.getchannel("A")) == 0
                ],
                base_array[..., :3][np.asarray(release_overlay.getchannel("A")) == 0],
            )
        ),
        "binaryAlpha": all(binary_alpha(image) for image in (press_overlay, assets["press"], release_overlay)),
        "noVisibleKeyGreen": all(count_exact_green(image) == 0 for image in assets.values()),
        "transparentRgbCleared": all(
            transparent_rgb_count(image) == 0
            for image in (
                press_overlay, release_overlay, assets["far_layer"], assets["near_layer"],
                assets["ring_layer"], assets["face_layer"],
            )
        ),
    }
    return {
        "pass": all(rules.values()),
        "rules": rules,
        "releasePixelsPerCell": release_pixels_per_cell,
        "cells": records,
    }


def review_on_dark(image: Image.Image, scale: int = 12) -> Image.Image:
    enlarged = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
    review = Image.new("RGBA", enlarged.size, REVIEW_BG)
    review.alpha_composite(enlarged)
    return review.convert("RGB")


def build(
    source_path: Path,
    output_dir: Path,
    label: str,
    require_pass: bool,
    source_columns: tuple[str, str, str, str],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGBA")
    cleaned = strip_green(source)
    cleaned.save(output_dir / "source-transparent.png", optimize=True)
    raw_gate = source_gate(cleaned, source_columns)
    assets = build_exact_assets()
    exact = exact_gate(assets)
    integration_allowed = bool(raw_gate["pass"] and exact["pass"])

    files = {
        "cutout": "press-cutout-mask-4action-4dir-40x56.png",
        "press_overlay": "press-overlay-4action-4dir-40x56.png",
        "press": "press-hero-composite-4action-4dir-40x56.png",
        "normal": "normal-hero-composite-4action-4dir-40x56.png",
        "release_overlay": "release-overlay-4action-4dir-40x56.png",
        "release": "release-hero-composite-4action-4dir-40x56.png",
        "ring_layer": "press-hand-ring-layer-4action-4dir-40x56.png",
    }
    for key, filename in files.items():
        assets[key].save(output_dir / filename, optimize=True)
    review_on_dark(assets["press"]).save(output_dir / "press-hero-composite-12x.png", optimize=True)
    review_on_dark(assets["release"]).save(output_dir / "release-hero-composite-12x.png", optimize=True)

    report = {
        "itemId": "eye-exercise",
        "order": 67,
        "label": label,
        "source": str(source_path),
        "sourceSize": list(source.size),
        "sourceColumnOrderObserved": list(source_columns),
        "cellOrder": {"rows": list(ACTIONS), "columns": list(DIRECTIONS)},
        "sourceGate": raw_gate,
        "exactGate": exact,
        "palettePolicy": "canonical-locked; generated source cannot inject chroma spill into exact skin/sleeves",
        "statePolicy": {
            "normal": "byte-exact approved hero",
            "press": "0.5-second replacement-arm eye-exercise trigger",
            "release": "sparse acceleration echo; no persistent face or hand overlay",
        },
        "integrationAllowed": integration_allowed,
        "runtimeModified": False,
        "wikiModified": False,
        "inventoryIconModified": False,
    }
    (output_dir / "gate.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    metrics = [
        f"source={source.width}x{source.height}",
        "grid=4x4;rows=idle,walk,attack,hurt;columns=front,left,back,right",
        f"source_gate={'pass' if raw_gate['pass'] else 'fail'}",
        f"exact_gate={'pass' if exact['pass'] else 'fail'}",
        f"integration_allowed={'true' if integration_allowed else 'false'}",
        f"source_min_to_max_visible_ratio={raw_gate['minToMaxVisibleRatio']}",
        f"source_enclosed_holes={raw_gate['totalEnclosedHoles']}",
        f"press={assets['press'].width}x{assets['press'].height}",
        f"press_exact_green={count_exact_green(assets['press'])}",
        f"press_overlay_transparent_rgb={transparent_rgb_count(assets['press_overlay'])}",
        f"release_pixels_per_cell={exact['releasePixelsPerCell']}",
    ]
    (output_dir / "metrics.txt").write_text("\n".join(metrics) + "\n", encoding="utf-8")

    if require_pass and not integration_allowed:
        raise SystemExit("semantic gate failed; inspect gate.json and do not promote this source")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version", nargs="?", default="v1")
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--label", default="67 EYE-EXERCISE / PRESS TRIGGER REVIEW")
    parser.add_argument("--require-pass", action="store_true")
    parser.add_argument(
        "--source-columns",
        default="front,left,back,right",
        help="observed Image2 column order; exact output always remains front,left,back,right",
    )
    args = parser.parse_args()
    source_columns = tuple(part.strip() for part in args.source_columns.split(","))
    if len(source_columns) != 4 or set(source_columns) != set(DIRECTIONS):
        raise SystemExit("--source-columns must contain front,left,back,right exactly once")
    output_dir = args.output_dir or OUTPUT_ROOT / args.version
    source_path = args.source or output_dir / f"67-eye-exercise-{args.version}.png"
    build(source_path, output_dir, args.label, args.require_pass, source_columns)


if __name__ == "__main__":
    main()
