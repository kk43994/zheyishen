#!/usr/bin/env python3
"""Build exact slow-watch lag/freeze/release overlays and hero previews."""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


TASK_DIR = Path("scripts/image2/art-loop-v1/18-slow-watch")
INPUT_DIR = TASK_DIR / "input"
OUTPUT_ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/18-slow-watch")
BASE_GRID = INPUT_DIR / "base-hero-watch-4action-4dir-40x56.png"
ANCHORS_PATH = INPUT_DIR / "anchors.json"

CELL = (40, 56)
ACTIONS = ("idle", "walk", "attack", "hurt")
DIRECTIONS = ("front", "left", "back", "right")
PHASES = ("lag", "freeze", "release")
REVIEW_BG = (21, 20, 26, 255)
GHOST_DARK = (64, 59, 73, 170)
GHOST_MID = (83, 79, 92, 166)
GHOST_COLD = (125, 143, 151, 196)
SNAP = (181, 192, 192, 224)


def strip_key(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    key = (
        (green > 76)
        & (green * 100 > red * 124)
        & (green * 100 > blue * 124)
    )
    magenta_guide = (red > 190) & (blue > 170) & (green < 100)
    cyan_guide = (green > 170) & (blue > 170) & (red < 100)
    removed = key | magenta_guide | cyan_guide
    array[..., 3][removed] = 0
    array[..., :3][removed] = 0
    array[..., :3][array[..., 3] == 0] = 0
    return Image.fromarray(array)


def split_grid(source: Image.Image) -> dict[tuple[str, str], Image.Image]:
    panels: dict[tuple[str, str], Image.Image] = {}
    for row, action in enumerate(ACTIONS):
        top = round(row * source.height / len(ACTIONS))
        bottom = round((row + 1) * source.height / len(ACTIONS))
        for column, direction in enumerate(DIRECTIONS):
            left = round(column * source.width / len(DIRECTIONS))
            right = round((column + 1) * source.width / len(DIRECTIONS))
            panels[(action, direction)] = source.crop((left, top, right, bottom))
    return panels


def components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    groups: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or visited[y, x]:
                continue
            queue = deque([(x, y)])
            visited[y, x] = True
            group: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                group.append((current_x, current_y))
                for offset_y in (-1, 0, 1):
                    for offset_x in (-1, 0, 1):
                        if not offset_x and not offset_y:
                            continue
                        next_x = current_x + offset_x
                        next_y = current_y + offset_y
                        if not (0 <= next_x < width and 0 <= next_y < height):
                            continue
                        if mask[next_y, next_x] and not visited[next_y, next_x]:
                            visited[next_y, next_x] = True
                            queue.append((next_x, next_y))
            groups.append(group)
    return groups


def lag_offset(action: str, direction: str) -> tuple[int, int]:
    inward_x = {"front": -1, "back": -1, "left": 1, "right": -1}[direction]
    if action == "idle":
        return inward_x, 2
    if action == "walk":
        return inward_x, -2
    if action == "attack":
        return inward_x, -3 if direction == "back" else 3
    if direction in {"front", "back"}:
        return -1, 1
    return (-1, 0) if direction == "left" else (1, 0)


def fitted_lag(
    panel: Image.Image,
    anchor: tuple[int, int],
    action: str,
    direction: str,
) -> Image.Image:
    cleaned = strip_key(panel)
    bbox = cleaned.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"empty generated forearm: {action}/{direction}")
    subject = cleaned.crop(bbox)
    max_width = 7 if action == "attack" else 6
    max_height = 12 if action == "attack" else 11
    scale = min(max_width / subject.width, max_height / subject.height)
    width = max(2, round(subject.width * scale))
    height = max(5, round(subject.height * scale))
    reduced = subject.resize((width, height), Image.Resampling.BOX)
    source = np.asarray(reduced.convert("RGBA"))
    mask = source[..., 3] >= 24
    groups = components(mask)
    candidates = [group for group in groups if len(group) >= 2]
    if not candidates:
        raise ValueError(f"generated forearm vanished after reduction: {action}/{direction}")
    selected = max(candidates, key=len)

    sprite = np.zeros((height, width, 4), dtype=np.uint8)
    for px, py in selected:
        red, green, blue = source[py, px, :3]
        luminance = (int(red) * 299 + int(green) * 587 + int(blue) * 114) // 1000
        color = GHOST_COLD if luminance >= 154 else GHOST_MID if luminance >= 86 else GHOST_DARK
        sprite[py, px] = color

    lag_x, lag_y = lag_offset(action, direction)
    target_x = anchor[0] + lag_x
    target_y = anchor[1] + lag_y
    wrist_pivot = (width // 2, max(0, height - 3))
    result = Image.new("RGBA", CELL, (0, 0, 0, 0))
    result.alpha_composite(
        Image.fromarray(sprite),
        (target_x - wrist_pivot[0], target_y - wrist_pivot[1]),
    )
    return result


def add_points(image: Image.Image, points: list[tuple[int, int]], color: tuple[int, int, int, int]) -> Image.Image:
    result = image.copy()
    pixels = result.load()
    for x, y in points:
        if 0 <= x < result.width and 0 <= y < result.height:
            pixels[x, y] = color
    return result


def freeze_phase(lag: Image.Image, anchor: tuple[int, int]) -> Image.Image:
    x, y = anchor
    return add_points(lag, [(x - 4, y), (x + 4, y), (x, y - 4), (x, y + 4)], GHOST_COLD)


def release_phase(anchor: tuple[int, int], direction: str) -> Image.Image:
    x, y = anchor
    if direction in {"front", "back"}:
        points = [(x - 4, y - 2), (x, y - 4), (x + 4, y - 2)]
    elif direction == "left":
        points = [(x + 2, y - 4), (x + 4, y), (x + 2, y + 4)]
    else:
        points = [(x - 2, y - 4), (x - 4, y), (x - 2, y + 4)]
    return add_points(Image.new("RGBA", CELL, (0, 0, 0, 0)), points, SNAP)


def echo_axis(direction: str) -> tuple[int, int]:
    if direction in {"front", "back"}:
        return 0, 1
    return (1, 0) if direction == "left" else (-1, 0)


def short_hand_template(panel: Image.Image) -> Image.Image:
    cleaned = strip_key(panel)
    bbox = cleaned.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty generated hand source")
    subject = cleaned.crop(bbox)
    hand_top = max(0, round(subject.height * 0.60))
    hand = subject.crop((0, hand_top, subject.width, subject.height))
    reduced = hand.resize((3, 3), Image.Resampling.BOX)
    array = np.asarray(reduced.convert("RGBA"))
    mask = array[..., 3] >= 20
    points = [(x, y) for y in range(3) for x in range(3) if mask[y, x]]
    if not points:
        raise ValueError("generated hand vanished after 3x3 reduction")

    center = 1
    candidates = [
        max(points, key=lambda point: (point[1], -abs(point[0] - center))),
        min(points, key=lambda point: (point[0], abs(point[1] - center))),
        max(points, key=lambda point: (point[0], -abs(point[1] - center))),
    ]
    selected: list[tuple[int, int]] = []
    for point in candidates:
        if point not in selected:
            selected.append(point)
    if len(selected) < 2:
        top = min(points, key=lambda point: (point[1], abs(point[0] - center)))
        if top not in selected:
            selected.append(top)

    template = Image.new("RGBA", (3, 3), (0, 0, 0, 0))
    pixels = template.load()
    for index, (x, y) in enumerate(selected[:3]):
        pixels[x, y] = GHOST_COLD if index == 0 else GHOST_MID
    return template


def tint_alpha(image: Image.Image, alpha: int) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    visible = array[..., 3] > 0
    array[..., 3][visible] = alpha
    return Image.fromarray(array)


def paste_echo(
    canvas: Image.Image,
    template: Image.Image,
    anchor: tuple[int, int],
    direction: str,
    distance: int,
) -> None:
    dx, dy = echo_axis(direction)
    x = anchor[0] + dx * distance - 1
    y = anchor[1] + dy * distance - 1
    canvas.alpha_composite(template, (x, y))


def short_echo_phases(
    panel: Image.Image,
    anchor: tuple[int, int],
    direction: str,
) -> dict[str, Image.Image]:
    template = short_hand_template(panel)

    lag = Image.new("RGBA", CELL, (0, 0, 0, 0))
    paste_echo(lag, tint_alpha(template, 142), anchor, direction, 2)
    lag = add_points(lag, [anchor], GHOST_COLD)

    freeze = Image.new("RGBA", CELL, (0, 0, 0, 0))
    paste_echo(freeze, tint_alpha(template, 94), anchor, direction, 1)
    paste_echo(freeze, tint_alpha(template, 154), anchor, direction, 2)
    freeze = add_points(freeze, [anchor], SNAP)

    dx, dy = echo_axis(direction)
    release = add_points(
        Image.new("RGBA", CELL, (0, 0, 0, 0)),
        [
            (anchor[0] - dx, anchor[1] - dy),
            (anchor[0] - dx * 2, anchor[1] - dy * 2),
        ],
        SNAP,
    )
    return {"lag": lag, "freeze": freeze, "release": release}


def paste_cell(atlas: Image.Image, cell: Image.Image, row: int, column: int) -> None:
    atlas.alpha_composite(cell, (column * CELL[0], row * CELL[1]))


def save_preview(image: Image.Image, path: Path, scale: int = 12) -> None:
    enlarged = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
    background = Image.new("RGBA", enlarged.size, REVIEW_BG)
    background.alpha_composite(enlarged)
    background.convert("RGB").save(path, optimize=True)


def cell_metrics(image: Image.Image) -> dict[str, object]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    visible = sum(1 for value in alpha.getdata() if value)
    colors = len({pixel[:3] for pixel in image.getdata() if pixel[3]})
    width = 0 if bbox is None else bbox[2] - bbox[0]
    height = 0 if bbox is None else bbox[3] - bbox[1]
    return {
        "visiblePixels": visible,
        "colors": colors,
        "bbox": list(bbox) if bbox else None,
        "gate": {
            "nonEmpty": visible > 0,
            "compact": width <= 23 and height <= 21,
            "notFullArm": visible <= 90,
            "shortEcho": width <= 5 and height <= 5 and visible <= 8,
        },
    }


def build(version: str) -> None:
    output_dir = OUTPUT_ROOT / version
    source_path = output_dir / "source.png"
    if not source_path.exists():
        raise FileNotFoundError(f"missing generated source: {source_path}")

    source = Image.open(source_path).convert("RGBA")
    transparent = strip_key(source)
    transparent.save(output_dir / "source-transparent.png", optimize=True)
    panels = split_grid(source)
    anchors_data = json.loads(ANCHORS_PATH.read_text(encoding="utf-8"))["watchAnchors"]
    base_grid = Image.open(BASE_GRID).convert("RGBA")

    overlays = {
        phase: Image.new("RGBA", base_grid.size, (0, 0, 0, 0))
        for phase in PHASES
    }
    metrics: dict[str, object] = {
        "source": list(source.size),
        "logicalCell": list(CELL),
        "rows": list(ACTIONS),
        "columns": list(DIRECTIONS),
        "cells": {},
    }

    for row, action in enumerate(ACTIONS):
        for column, direction in enumerate(DIRECTIONS):
            anchor = tuple(anchors_data[action][direction])
            if version == "v1.1":
                phase_cells = short_echo_phases(panels[(action, direction)], anchor, direction)
            else:
                lag = fitted_lag(panels[(action, direction)], anchor, action, direction)
                phase_cells = {
                    "lag": lag,
                    "freeze": freeze_phase(lag, anchor),
                    "release": release_phase(anchor, direction),
                }
            key = f"{action}:{direction}"
            metrics["cells"][key] = {
                phase: cell_metrics(cell)
                for phase, cell in phase_cells.items()
            }
            for phase, cell in phase_cells.items():
                paste_cell(overlays[phase], cell, row, column)

    for phase, overlay in overlays.items():
        overlay_path = output_dir / f"{phase}-overlay-4action-4dir-40x56.png"
        overlay.save(overlay_path, optimize=True)
        if version == "v1.1":
            composite = base_grid.copy()
            composite.alpha_composite(overlay)
        else:
            composite = Image.new("RGBA", base_grid.size, (0, 0, 0, 0))
            composite.alpha_composite(overlay)
            composite.alpha_composite(base_grid)
        composite_path = output_dir / f"{phase}-hero-composite-4action-4dir-40x56.png"
        composite.save(composite_path, optimize=True)
        save_preview(composite, output_dir / f"{phase}-hero-composite-12x.png")

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
