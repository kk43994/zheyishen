#!/usr/bin/env python3
"""Build exact 40x56 broken-spine posture morphs from approved hero parts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import median

import numpy as np
from PIL import Image


TASK_DIR = Path("scripts/image2/art-loop-v1/22-broken-spine")
INPUT_DIR = TASK_DIR / "input"
OUTPUT_ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/22-broken-spine")
BASE_GRID = INPUT_DIR / "base-hero-4action-4dir-40x56.png"
POSTURE_GRID = INPUT_DIR / "base-hero-broken-spine-morph-4action-4dir-40x56.png"
ANCHORS_PATH = INPUT_DIR / "anchors.json"

CELL = (40, 56)
ACTIONS = ("idle", "walk", "attack", "hurt")
DIRECTIONS = ("front", "left", "back", "right")
REVIEW_BG = (43, 40, 48, 255)


def strip_key(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    key = (
        (green > 76)
        & (green * 100 > red * 124)
        & (green * 100 > blue * 124)
    )
    array[..., 3][key] = 0
    array[..., :3][key] = 0
    array[..., :3][array[..., 3] == 0] = 0
    return Image.fromarray(array)


def scar_palette(source: Image.Image) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
    pixels = np.asarray(source.convert("RGB"))
    red = pixels[..., 0].astype(np.int16)
    green = pixels[..., 1].astype(np.int16)
    blue = pixels[..., 2].astype(np.int16)
    candidates = pixels[
        (red >= 72)
        & (red >= green + 18)
        & (red >= blue + 8)
        & (green <= 112)
    ]
    if len(candidates) < 8:
        return (103, 56, 58, 255), (149, 76, 69, 255)
    values = sorted((tuple(int(value) for value in pixel) for pixel in candidates), key=sum)
    split = max(1, len(values) // 2)

    def med(group: list[tuple[int, int, int]]) -> tuple[int, int, int, int]:
        return tuple(int(median(pixel[channel] for pixel in group)) for channel in range(3)) + (255,)

    return med(values[:split]), med(values[split:])


def nearest_opaque(image: Image.Image, x: int, y: int, radius: int = 2) -> tuple[int, int] | None:
    alpha = image.getchannel("A")
    candidates: list[tuple[int, int, int]] = []
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            px, py = x + dx, y + dy
            if 0 <= px < image.width and 0 <= py < image.height and alpha.getpixel((px, py)):
                candidates.append((abs(dx) + abs(dy), px, py))
    if not candidates:
        return None
    _, px, py = min(candidates)
    return px, py


def scar_points(direction: str, action: str, anchor: tuple[int, int]) -> list[tuple[int, int, int]]:
    x, y = anchor
    hurt_extra = [(x + (1 if direction != "right" else -1), y + 1, 1)] if action == "hurt" else []
    if direction == "back":
        return [(x, y - 2, 0), (x - 1, y - 1, 1), (x, y, 1)] + hurt_extra
    if direction == "left":
        return [(x, y - 1, 0), (x - 1, y, 1)] + hurt_extra
    if direction == "right":
        return [(x, y - 1, 0), (x + 1, y, 1)] + hurt_extra
    return []


def add_scar(
    frame: Image.Image,
    direction: str,
    action: str,
    anchor: tuple[int, int],
    colors: tuple[tuple[int, int, int, int], tuple[int, int, int, int]],
) -> tuple[Image.Image, Image.Image]:
    result = frame.copy()
    decal = Image.new("RGBA", CELL, (0, 0, 0, 0))
    result_pixels = result.load()
    decal_pixels = decal.load()
    used: set[tuple[int, int]] = set()
    for x, y, color_index in scar_points(direction, action, anchor):
        point = nearest_opaque(frame, x, y)
        if point is None or point in used:
            continue
        used.add(point)
        px, py = point
        result_pixels[px, py] = colors[color_index]
        decal_pixels[px, py] = colors[color_index]
    return result, decal


def paste_cell(atlas: Image.Image, cell: Image.Image, row: int, column: int) -> None:
    atlas.alpha_composite(cell, (column * CELL[0], row * CELL[1]))


def save_preview(image: Image.Image, path: Path, scale: int = 12) -> None:
    enlarged = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
    background = Image.new("RGBA", enlarged.size, REVIEW_BG)
    background.alpha_composite(enlarged)
    background.convert("RGB").save(path, optimize=True)


def component_sizes(image: Image.Image) -> list[int]:
    mask = np.asarray(image.getchannel("A")) > 0
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    sizes: list[int] = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(x, y)]
            seen[y, x] = True
            size = 0
            while stack:
                px, py = stack.pop()
                size += 1
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = px + dx, py + dy
                    if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((nx, ny))
            sizes.append(size)
    return sorted(sizes, reverse=True)


def cell_metrics(base: Image.Image, result: Image.Image, decal: Image.Image, direction: str) -> dict[str, object]:
    base_alpha = np.asarray(base.getchannel("A")) > 0
    result_alpha = np.asarray(result.getchannel("A")) > 0
    decal_alpha = np.asarray(decal.getchannel("A")) > 0
    base_foot = base_alpha[49, :]
    result_foot = result_alpha[49, :]
    components = component_sizes(result)
    bbox = result.getchannel("A").getbbox()
    decal_bbox = decal.getchannel("A").getbbox()
    decal_width = 0 if decal_bbox is None else decal_bbox[2] - decal_bbox[0]
    decal_height = 0 if decal_bbox is None else decal_bbox[3] - decal_bbox[1]

    if direction == "left":
        base_head_x = np.argwhere(base_alpha[7:24]).mean(axis=0)[1]
        result_head_x = np.argwhere(result_alpha[7:26]).mean(axis=0)[1]
        forward_shift = float(base_head_x - result_head_x)
    elif direction == "right":
        base_head_x = np.argwhere(base_alpha[7:24]).mean(axis=0)[1]
        result_head_x = np.argwhere(result_alpha[7:26]).mean(axis=0)[1]
        forward_shift = float(result_head_x - base_head_x)
    else:
        forward_shift = 0.0

    return {
        "bbox": list(bbox) if bbox else None,
        "visiblePixels": int(result_alpha.sum()),
        "componentSizes": components,
        "footRootY": 49,
        "footRowUnchanged": bool(np.array_equal(base_foot, result_foot)),
        "belowFootPixels": int(result_alpha[50:, :].sum()),
        "headForwardShiftApprox": round(forward_shift, 2),
        "scarPixels": int(decal_alpha.sum()),
        "scarBBox": list(decal_bbox) if decal_bbox else None,
        "gate": {
            "completeHero": bbox is not None and bbox[1] <= 10 and bbox[3] - 1 == 49,
            "footRootStable": bool(np.array_equal(base_foot, result_foot)),
            "noGroundAttachment": int(result_alpha[50:, :].sum()) == 0,
            "noDetachedLargeAttachment": len(components) <= 4 and (not components or components[0] >= 100),
            "sideHeadMovedForward": direction not in {"left", "right"} or forward_shift >= 1.5,
            "scarIsSecondary": int(decal_alpha.sum()) <= 4 and decal_width <= 4 and decal_height <= 4,
        },
    }


def build(version: str) -> None:
    output_dir = OUTPUT_ROOT / version
    source_path = output_dir / "source.png"
    if not source_path.exists():
        raise FileNotFoundError(source_path)

    source = Image.open(source_path).convert("RGBA")
    strip_key(source).save(output_dir / "source-transparent.png", optimize=True)
    colors = scar_palette(source)
    base_grid = Image.open(BASE_GRID).convert("RGBA")
    posture_grid = Image.open(POSTURE_GRID).convert("RGBA")
    anchors = json.loads(ANCHORS_PATH.read_text(encoding="utf-8"))["bodyMidAnchors"]
    posture_atlas = posture_grid.copy()
    decal_atlas = Image.new("RGBA", posture_grid.size, (0, 0, 0, 0))
    composite_atlas = Image.new("RGBA", posture_grid.size, (0, 0, 0, 0))
    metrics: dict[str, object] = {
        "source": list(source.size),
        "logicalCell": list(CELL),
        "rows": list(ACTIONS),
        "columns": list(DIRECTIONS),
        "footRoot": [20, 49],
        "scarPaletteSampledFromImage2": [list(color) for color in colors],
        "cells": {},
    }

    for row, action in enumerate(ACTIONS):
        for column, direction in enumerate(DIRECTIONS):
            box = (column * CELL[0], row * CELL[1], (column + 1) * CELL[0], (row + 1) * CELL[1])
            base = base_grid.crop(box)
            posture = posture_grid.crop(box)
            result, decal = add_scar(posture, direction, action, tuple(anchors[action][direction]), colors)
            paste_cell(decal_atlas, decal, row, column)
            paste_cell(composite_atlas, result, row, column)
            metrics["cells"][f"{action}:{direction}"] = cell_metrics(base, result, decal, direction)

    posture_atlas.save(output_dir / "posture-morph-4action-4dir-40x56.png", optimize=True)
    decal_atlas.save(output_dir / "old-scar-decal-4action-4dir-40x56.png", optimize=True)
    composite_atlas.save(output_dir / "hero-composite-4action-4dir-40x56.png", optimize=True)
    save_preview(composite_atlas, output_dir / "hero-composite-12x.png")

    comparison = Image.new("RGBA", (base_grid.width * 2, base_grid.height), (0, 0, 0, 0))
    comparison.alpha_composite(base_grid, (0, 0))
    comparison.alpha_composite(composite_atlas, (base_grid.width, 0))
    save_preview(comparison, output_dir / "upright-vs-hunched-8x.png", scale=8)

    (output_dir / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    args = parser.parse_args()
    build(args.version)


if __name__ == "__main__":
    main()
