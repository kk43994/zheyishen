#!/usr/bin/env python3
"""Draft exact processor for two-state momo dinosaur-headpiece overlays."""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/60-momo-avatar")
HERO = Path("src/assets/hero-style1-profiles/hero-idle.png")
DIRECTIONS = ("front", "left", "back", "right")
STATES = ("safe", "threatened")
HERO_ROWS = {"front": 1120, "left": 1232, "back": 1176, "right": 1288}
PALETTE = ((35, 25, 39), (74, 43, 58), (126, 64, 88), (181, 106, 143), (217, 154, 185), (232, 190, 207))


def largest_component(mask: np.ndarray) -> list[tuple[int, int]]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    largest: list[tuple[int, int]] = []
    for start_y in range(height):
        for start_x in range(width):
            if not mask[start_y, start_x] or visited[start_y, start_x]:
                continue
            queue = deque([(start_x, start_y)])
            visited[start_y, start_x] = True
            component: list[tuple[int, int]] = []
            while queue:
                x, y = queue.popleft()
                component.append((x, y))
                for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= next_x < width and 0 <= next_y < height and mask[next_y, next_x] and not visited[next_y, next_x]:
                        visited[next_y, next_x] = True
                        queue.append((next_x, next_y))
            if len(component) > len(largest):
                largest = component
    return largest


def strip_green(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    keyed = (
        (green > 88)
        & (green * 100 > red * 125)
        & (green * 100 > blue * 125)
        & (np.maximum(red, blue) < 170)
    )
    near = np.asarray(Image.fromarray(keyed.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
    spill = ~keyed & near & (green > np.maximum(red, blue) + 10)
    array[..., 1][spill] = np.maximum(red, blue)[spill].astype(np.uint8)
    array[..., 3][keyed] = 0
    array[..., :3][keyed] = 0
    return Image.fromarray(array)


def crop_subject(panel: Image.Image) -> Image.Image:
    subject = strip_green(panel)
    array = np.asarray(subject.convert("RGBA"))
    rgb = array[..., :3].astype(np.int32)
    opaque = array[..., 3] >= 128
    pink_shell = (
        opaque
        & (rgb[..., 0] >= 105)
        & (rgb[..., 0] >= rgb[..., 1] + 20)
        & (rgb[..., 0] >= rgb[..., 2] + 6)
    )
    component = largest_component(pink_shell)
    if component:
        xs = [point[0] for point in component]
        ys = [point[1] for point in component]
        margin = max(3, round(min(panel.width, panel.height) * 0.025))
        bbox = (
            max(0, min(xs) - margin),
            max(0, min(ys) - margin),
            min(panel.width, max(xs) + 1 + margin),
            min(panel.height, max(ys) + 1 + max(2, margin // 2)),
        )
    else:
        bbox = subject.getchannel("A").point(lambda value: 255 if value >= 128 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty generated headpiece panel")
    return subject.crop(bbox)


def fill_internal_holes(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 128
    height, width = opaque.shape
    outside = np.zeros_like(opaque, dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        for y in (0, height - 1):
            if not opaque[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if not opaque[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= next_x < width and 0 <= next_y < height and not opaque[next_y, next_x] and not outside[next_y, next_x]:
                outside[next_y, next_x] = True
                queue.append((next_x, next_y))
    holes = ~opaque & ~outside
    array[..., :3][holes] = PALETTE[2]
    array[..., 3][holes] = 255
    return Image.fromarray(array)


def split_source(source: Image.Image) -> dict[str, dict[str, Image.Image]]:
    result: dict[str, dict[str, Image.Image]] = {state: {} for state in STATES}
    for row, state in enumerate(STATES):
        for column, direction in enumerate(DIRECTIONS):
            result[state][direction] = source.crop((
                column * source.width // 4,
                row * source.height // 2,
                (column + 1) * source.width // 4,
                (row + 1) * source.height // 2,
            ))
    return result


def coverage_resize(source: Image.Image, width: int, height: int) -> Image.Image:
    source_array = np.asarray(fill_internal_holes(source).convert("RGBA"))
    source_height, source_width = source_array.shape[:2]
    palette = np.asarray(PALETTE, dtype=np.int32)
    result = np.zeros((height, width, 4), dtype=np.uint8)
    for y in range(height):
        top, bottom = y * source_height // height, max(y * source_height // height + 1, (y + 1) * source_height // height)
        for x in range(width):
            left, right = x * source_width // width, max(x * source_width // width + 1, (x + 1) * source_width // width)
            cell = source_array[top:bottom, left:right]
            opaque = cell[..., 3] >= 128
            if int(opaque.sum()) * 4 < opaque.size:
                continue
            color = np.median(cell[..., :3][opaque], axis=0).astype(np.int32)
            index = int(np.argmin(((palette - color) ** 2).sum(axis=1)))
            result[y, x] = (*PALETTE[index], 255)
    return Image.fromarray(result)


def fit(source: Image.Image, limit: list[int]) -> Image.Image:
    scale = min(limit[0] / source.width, limit[1] / source.height)
    return coverage_resize(source, max(1, round(source.width * scale)), max(1, round(source.height * scale)))


def count_green(image: Image.Image) -> int:
    array = np.asarray(image.convert("RGBA"))
    return int(((array[..., 3] > 0) & np.all(array[..., :3] == (0, 255, 0), axis=2)).sum())


def build(source_path: Path, output_dir: Path, config_path: Path) -> None:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGBA")
    transparent_source = strip_green(source)
    transparent_source.save(output_dir / "source-transparent.png", optimize=True)
    panels = split_source(source)
    atlas = Image.open(HERO).convert("RGBA")
    report: dict[str, object] = {"source": str(source_path), "states": {}, "allPass": True}
    composites: list[Image.Image] = []

    for state in STATES:
        overlay = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
        composite = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
        state_report: dict[str, object] = {}
        for index, direction in enumerate(DIRECTIONS):
            base = atlas.crop((0, HERO_ROWS[direction], 40, HERO_ROWS[direction] + 56))
            sprite = fit(crop_subject(panels[state][direction]), config["limits"][state][direction])
            anchor_x, anchor_y = config["anchors"][state][direction]
            x, y = anchor_x - sprite.width // 2, anchor_y - sprite.height // 2
            bottom_y = y + sprite.height - 1
            sprite_array = np.asarray(sprite)
            opaque = sprite_array[..., 3] >= 128
            bbox = sprite.getchannel("A").getbbox()
            bbox_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) if bbox else 1
            fill_ratio = float(opaque.sum() / bbox_area)
            pink = np.zeros(opaque.shape, dtype=bool)
            for color in PALETTE[2:]:
                pink |= opaque & np.all(sprite_array[..., :3] == color, axis=2)
            pink_ratio = float(pink.sum() / max(1, opaque.sum()))
            cell_overlay = Image.new("RGBA", (40, 56), (0, 0, 0, 0))
            cell_overlay.alpha_composite(sprite, (x, y))
            base_alpha = np.asarray(base)[..., 3] >= 128
            overlay_alpha = np.asarray(cell_overlay)[..., 3] >= 128
            head_coverage = int((base_alpha[:30] & overlay_alpha[:30]).sum())
            body_intrusion = int(overlay_alpha[30:].sum())
            passed = (
                bottom_y <= config["gates"]["maximumOverlayBottomY"]
                and fill_ratio <= config["gates"]["maximumRectangularFillRatio"]
                and pink_ratio >= config["gates"]["minimumPinkPixelRatio"]
                and head_coverage >= config["gates"]["minimumOriginalHeadCoveragePixels"]
                and body_intrusion == 0
            )
            state_report[direction] = {
                "size": list(sprite.size),
                "position": [x, y],
                "bottomY": bottom_y,
                "rectangularFillRatio": round(fill_ratio, 4),
                "pinkPixelRatio": round(pink_ratio, 4),
                "originalHeadCoveragePixels": head_coverage,
                "bodyClothingLimbOverlayPixels": body_intrusion,
                "manualGate": "confirm round head, short muzzle, top bump, attached cheek-paws, and zero rear face",
                "pass": passed,
            }
            report["allPass"] = bool(report["allPass"] and passed)
            overlay.alpha_composite(sprite, (index * 40 + x, y))
            composite.alpha_composite(base, (index * 40, 0))
            composite.alpha_composite(sprite, (index * 40 + x, y))
        overlay.save(output_dir / f"{state}-headpiece-overlay-40x56.png", optimize=True)
        composite.save(output_dir / f"{state}-hero-composite-40x56.png", optimize=True)
        state_report["exactGreenPixels"] = count_green(overlay)
        report["states"][state] = state_report
        composites.append(composite)

    review = Image.new("RGBA", (1920, 1344), (21, 20, 26, 255))
    for row, composite in enumerate(composites):
        review.alpha_composite(composite.resize((1920, 672), Image.Resampling.NEAREST), (0, row * 672))
    review.convert("RGB").save(output_dir / "safe-threatened-headpiece-review-12x.png", optimize=True)
    report["allPass"] = bool(report["allPass"] and all(report["states"][state]["exactGreenPixels"] == 0 for state in STATES))
    (output_dir / "gate.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "v2-draft")
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("anchors-v2.json"))
    args = parser.parse_args()
    build(args.source, args.output_dir, args.config)


if __name__ == "__main__":
    main()
