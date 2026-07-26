#!/usr/bin/env python3
"""Reduce an Image2 item-41 sheet into exact 40x56 overlays and hero previews."""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


CELL_W = 40
CELL_H = 56
DIRECTIONS = ("front", "back", "left", "right")
LIMITS = ((5, 4), (1, 2), (2, 3), (2, 3))
ANCHORS = ((16, 29), (27, 30), (14, 29), (24, 29))
CONTACT_SCALE = 12
CONTACT_GUTTER = 2


def strip_green(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    keyed = (
        (green > 96)
        & (green * 100 > red * 135)
        & (green * 100 > blue * 135)
    ) | (
        (green > 60)
        & (green * 100 > red * 120)
        & (green * 100 > blue * 120)
        & (np.maximum(red, blue) < 120)
    )
    near_key = np.asarray(
        Image.fromarray((keyed.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(5))
    ) > 0
    strongest_other = np.maximum(red, blue)
    spill = ~keyed & near_key & (green > 70) & (green > strongest_other + 10)
    array[..., 1][spill] = strongest_other[spill].astype(np.uint8)
    array[..., :3][keyed] = 0
    array[..., 3][keyed] = 0
    return Image.fromarray(array)


def split_quadrants(sheet: Image.Image) -> list[Image.Image]:
    half_w = sheet.width // 2
    half_h = sheet.height // 2
    # Image2 may add a thin white quadrant separator despite the prompt. The
    # item is centered with generous padding, so a small inset safely removes it.
    inset = max(4, round(min(sheet.size) * 0.006))
    return [
        sheet.crop((inset, inset, half_w - inset, half_h - inset)),
        sheet.crop((half_w + inset, inset, sheet.width - inset, half_h - inset)),
        sheet.crop((inset, half_h + inset, half_w - inset, sheet.height - inset)),
        sheet.crop((half_w + inset, half_h + inset, sheet.width - inset, sheet.height - inset)),
    ]


def clean_alpha_sheet(sheet: Image.Image) -> Image.Image:
    cleaned = np.asarray(strip_green(sheet)).copy()
    half_w = sheet.width // 2
    half_h = sheet.height // 2
    inset = max(4, round(min(sheet.size) * 0.006))
    cleaned[:, max(0, half_w - inset):min(sheet.width, half_w + inset)] = 0
    cleaned[max(0, half_h - inset):min(sheet.height, half_h + inset), :] = 0
    return Image.fromarray(cleaned)


def largest_component(image: Image.Image, allow_empty: bool = False) -> Image.Image | None:
    foreground = strip_green(image)
    alpha = foreground.getchannel("A").point(lambda value: 255 if value >= 96 else 0)
    outer_bbox = alpha.getbbox()
    if outer_bbox is None:
        if allow_empty:
            return None
        raise ValueError("empty source panel")
    foreground = foreground.crop(outer_bbox)
    mask = alpha.crop(outer_bbox)

    sample_scale = min(1.0, 180 / max(mask.size))
    sample_size = (
        max(1, round(mask.width * sample_scale)),
        max(1, round(mask.height * sample_scale)),
    )
    sample = mask.resize(sample_size, Image.Resampling.NEAREST)
    pixels = sample.load()
    visited: set[tuple[int, int]] = set()
    best: list[tuple[int, int]] = []
    for y in range(sample.height):
        for x in range(sample.width):
            if not pixels[x, y] or (x, y) in visited:
                continue
            queue = deque([(x, y)])
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for neighbor in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    neighbor_x, neighbor_y = neighbor
                    if (
                        0 <= neighbor_x < sample.width
                        and 0 <= neighbor_y < sample.height
                        and pixels[neighbor_x, neighbor_y]
                        and neighbor not in visited
                    ):
                        visited.add(neighbor)
                        queue.append(neighbor)
            if len(component) > len(best):
                best = component
    if not best:
        if allow_empty:
            return None
        raise ValueError("no connected source component")

    min_x = min(point[0] for point in best)
    min_y = min(point[1] for point in best)
    max_x = max(point[0] for point in best) + 1
    max_y = max(point[1] for point in best) + 1
    margin = 3
    bbox = (
        max(0, int(min_x / sample_scale) - margin),
        max(0, int(min_y / sample_scale) - margin),
        min(foreground.width, int(max_x / sample_scale) + margin),
        min(foreground.height, int(max_y / sample_scale) + margin),
    )
    component = foreground.crop(bbox)
    final_bbox = component.getchannel("A").getbbox()
    return component.crop(final_bbox) if final_bbox else None


def is_dark_red(colors: np.ndarray) -> np.ndarray:
    values = colors.astype(np.uint16)
    red, green, blue = values[..., 0], values[..., 1], values[..., 2]
    return (
        (red >= 70)
        & (red * 100 > green * 125)
        & (red * 100 > blue * 115)
        & (green < 150)
    )


def representative_colors(
    source: Image.Image,
    *,
    require_red: bool,
) -> tuple[np.ndarray | None, np.ndarray]:
    array = np.asarray(source.convert("RGBA"))
    opaque = array[..., 3] >= 96
    colors = array[..., :3][opaque]
    if not len(colors):
        raise ValueError("empty paper source")
    red_colors = colors[is_dark_red(colors)]
    if require_red and not len(red_colors):
        raise ValueError("source has no dark-red signature or stamp pixels")
    red = np.median(red_colors, axis=0).astype(np.uint8) if len(red_colors) else None
    neutral_colors = colors[~is_dark_red(colors)]
    if not len(neutral_colors):
        raise ValueError("source has no neutral paper pixels")
    luminance = (
        neutral_colors[:, 0].astype(np.uint32) * 2126
        + neutral_colors[:, 1].astype(np.uint32) * 7152
        + neutral_colors[:, 2].astype(np.uint32) * 722
    )
    paper = neutral_colors[int(np.argmax(luminance))]
    return red, paper


def compact_paper(source: Image.Image, size: tuple[int, int], direction: str) -> Image.Image:
    red_color, paper_color = representative_colors(source, require_red=direction == "front")
    resized = source.resize(size, Image.Resampling.LANCZOS)
    array = np.asarray(resized.convert("RGBA")).copy()
    opaque = array[..., 3] >= 48
    if not opaque.any():
        raise ValueError(f"{direction}: paper vanished during reduction")

    visible = array[..., :3][opaque]
    sample = Image.fromarray(visible.reshape((1, len(visible), 3)).astype(np.uint8))
    quantized = sample.quantize(
        colors=6,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    array[..., :3] = 0
    array[..., :3][opaque] = np.asarray(quantized).reshape((-1, 3))
    array[..., 3] = np.where(opaque, 255, 0).astype(np.uint8)

    # A stepped missing corner keeps the tiny asset from becoming a progress bar.
    if direction == "front":
        array[0, -1] = 0
    elif direction == "left":
        array[0, 0] = 0
    elif direction == "right":
        array[0, -1] = 0

    if direction == "back":
        red_mask = is_dark_red(array[..., :3]) & (array[..., 3] > 0)
        array[..., :3][red_mask] = paper_color
    elif direction == "front":
        # Force one compact 2-pixel signature cluster sourced from the input red.
        red_mask = is_dark_red(array[..., :3]) & (array[..., 3] > 0)
        array[..., :3][red_mask] = paper_color
        row = max(1, size[1] - 2)
        columns = (max(0, size[0] - 3), max(0, size[0] - 2))
        for column in columns:
            if array[row, column, 3]:
                assert red_color is not None
                array[row, column, :3] = red_color
    else:
        red_mask = is_dark_red(array[..., :3]) & (array[..., 3] > 0)
        array[..., :3][red_mask] = paper_color
        if red_color is not None:
            row = max(1, size[1] - 2)
            column = size[0] - 1 if direction == "left" else 0
            if array[row, column, 3]:
                array[row, column, :3] = red_color

    result = Image.fromarray(array)
    bbox = result.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"{direction}: empty compact paper")
    result = result.crop(bbox)
    result_array = np.asarray(result)
    red_count = int((is_dark_red(result_array[..., :3]) & (result_array[..., 3] > 0)).sum())
    if direction == "front" and not 2 <= red_count <= 4:
        raise ValueError(f"{direction}: expected 2-4 red pixels, got {red_count}")
    if direction in {"left", "right"} and red_count > 1:
        raise ValueError(f"{direction}: expected at most 1 red pixel, got {red_count}")
    if direction == "back" and red_count:
        raise ValueError("back: red signature must not be visible")
    return result


def build_overlay(raw: Image.Image) -> Image.Image:
    panels = split_quadrants(raw)
    overlay = Image.new("RGBA", (CELL_W * 4, CELL_H))
    for index, (direction, panel, limit, anchor) in enumerate(
        zip(DIRECTIONS, panels, LIMITS, ANCHORS)
    ):
        component = largest_component(panel, allow_empty=direction == "back")
        if component is None:
            continue
        sprite = compact_paper(component, limit, direction)
        x, y = anchor
        overlay.alpha_composite(sprite, (index * CELL_W + x, y))
    return overlay


def local_v11_palette(raw: Image.Image, hero: Image.Image) -> dict[str, tuple[int, int, int, int]]:
    front_source = largest_component(split_quadrants(raw)[0])
    if front_source is None:
        raise ValueError("v1.1: missing front source")
    red, paper = representative_colors(front_source, require_red=True)
    assert red is not None

    array = np.asarray(front_source.convert("RGBA"))
    opaque = array[..., 3] >= 96
    colors = array[..., :3][opaque]
    neutral = colors[~is_dark_red(colors)]
    luminance = (
        neutral[:, 0].astype(np.uint32) * 2126
        + neutral[:, 1].astype(np.uint32) * 7152
        + neutral[:, 2].astype(np.uint32) * 722
    )
    target = 185 * 10000
    fold = neutral[int(np.argmin(np.abs(luminance.astype(np.int64) - target)))]

    shirt = np.asarray(hero.getpixel((18, 30))[:3], dtype=np.uint16)
    ink = np.asarray(hero.getpixel((14, 30))[:3], dtype=np.uint16)
    pocket = np.rint(shirt * 0.75 + ink * 0.25).astype(np.uint8)

    def rgba(color: np.ndarray) -> tuple[int, int, int, int]:
        return (int(color[0]), int(color[1]), int(color[2]), 255)

    return {
        "paper": rgba(paper),
        "fold": rgba(fold),
        "red": rgba(red),
        "pocket": rgba(pocket),
    }


def build_local_v11_overlay(raw: Image.Image, hero: Image.Image) -> Image.Image:
    palette = local_v11_palette(raw, hero)
    overlay = Image.new("RGBA", (CELL_W * 4, CELL_H))

    # FRONT: a seven-pixel stepped paper tip, pressed down by one dark-grey
    # pocket-lip row. The asymmetry reads as a fold rather than an ID badge.
    front_pixels = {
        (18, 28): "paper",
        (17, 29): "paper",
        (18, 29): "fold",
        (19, 29): "paper",
        (16, 30): "paper",
        (17, 30): "fold",
        (18, 30): "paper",
        (19, 30): "red",
    }
    for (x, y), color in front_pixels.items():
        overlay.putpixel((x, y), palette[color])
    for x in range(15, 21):
        overlay.putpixel((x, 31), palette["pocket"])

    # BACK is intentionally empty: an inner chest pocket cannot show through.

    # LEFT / RIGHT: two neutral paper pixels, immediately four-neighbouring
    # the canonical hero's front chest outline at x=17 / x=22.
    left_offset = CELL_W * 2
    overlay.putpixel((left_offset + 16, 29), palette["paper"])
    overlay.putpixel((left_offset + 16, 30), palette["fold"])
    right_offset = CELL_W * 3
    overlay.putpixel((right_offset + 23, 29), palette["paper"])
    overlay.putpixel((right_offset + 23, 30), palette["fold"])
    return overlay


def v11_metrics(overlay: Image.Image, hero: Image.Image) -> dict[str, object]:
    records: dict[str, object] = {}
    for index, direction in enumerate(DIRECTIONS):
        box = (index * CELL_W, 0, (index + 1) * CELL_W, CELL_H)
        item = np.asarray(overlay.crop(box))
        base = np.asarray(hero.crop(box))
        visible = item[..., 3] > 0
        ys, xs = np.where(visible)
        bbox = None if not len(xs) else [
            int(xs.min()),
            int(ys.min()),
            int(xs.max() + 1),
            int(ys.max() + 1),
        ]
        red = visible & is_dark_red(item[..., :3])
        adjacent = 0
        for y, x in zip(ys, xs):
            if any(
                0 <= nx < CELL_W
                and 0 <= ny < CELL_H
                and base[ny, nx, 3] > 0
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
            ):
                adjacent += 1
        records[direction] = {
            "bbox": bbox,
            "visiblePixels": int(visible.sum()),
            "darkRedPixels": int(red.sum()),
            "heroAdjacentPixels": adjacent,
        }

    array = np.asarray(overlay)
    transparent = array[..., 3] == 0
    visible = ~transparent
    rgb = array[..., :3].astype(np.uint16)
    key_green = (
        visible
        & (rgb[..., 1] > 120)
        & (rgb[..., 1] * 100 > rgb[..., 0] * 125)
        & (rgb[..., 1] * 100 > rgb[..., 2] * 125)
    )
    return {
        "version": "v1.1",
        "sourceVersion": "v1",
        "remoteGenerationUsed": False,
        "directions": records,
        "frontPaperPixels": 8,
        "frontPocketLipPixels": 6,
        "transparentRgbNonZero": int(np.any(array[..., :3][transparent] != 0, axis=1).sum()),
        "visibleKeyGreenPixels": int(key_green.sum()),
    }


def composite(overlay: Image.Image, hero: Image.Image) -> Image.Image:
    if hero.size != (CELL_W * 4, CELL_H):
        raise ValueError(f"unexpected canonical hero size: {hero.size}")
    result = hero.copy()
    result.alpha_composite(overlay)
    return result


def contact(image: Image.Image) -> Image.Image:
    width = (CELL_W * 4 + CONTACT_GUTTER * 5) * CONTACT_SCALE
    height = (CELL_H + CONTACT_GUTTER * 2) * CONTACT_SCALE
    canvas = Image.new("RGBA", (width, height), (20, 19, 25, 255))
    for index in range(4):
        cell = image.crop((index * CELL_W, 0, (index + 1) * CELL_W, CELL_H))
        cell = cell.resize((CELL_W * CONTACT_SCALE, CELL_H * CONTACT_SCALE), Image.Resampling.NEAREST)
        x = (CONTACT_GUTTER + index * (CELL_W + CONTACT_GUTTER)) * CONTACT_SCALE
        y = CONTACT_GUTTER * CONTACT_SCALE
        canvas.alpha_composite(cell, (x, y))
    return canvas.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--hero", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--version", default="v1")
    parser.add_argument("--local-refine-v11", action="store_true")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    raw = Image.open(args.raw).convert("RGBA")
    hero = Image.open(args.hero).convert("RGBA")
    alpha = clean_alpha_sheet(raw)
    overlay = build_local_v11_overlay(raw, hero) if args.local_refine_v11 else build_overlay(raw)
    preview = composite(overlay, hero)
    prefix = f"41-divorce-draft-{args.version}"
    alpha.save(args.out_dir / f"{prefix}-alpha.png", optimize=True)
    overlay.save(args.out_dir / f"{prefix}-overlay-4dir-40x56.png", optimize=True)
    preview.save(args.out_dir / f"{prefix}-hero-preview-4dir-40x56.png", optimize=True)
    contact(preview).save(args.out_dir / f"{prefix}-hero-preview-12x.png", optimize=True)
    if args.local_refine_v11:
        (args.out_dir / f"{prefix}-metrics.json").write_text(
            json.dumps(v11_metrics(overlay, hero), ensure_ascii=True, indent=2) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
