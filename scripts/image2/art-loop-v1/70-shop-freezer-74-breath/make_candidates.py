#!/usr/bin/env python3
"""Build item 70; retain item 74 only behind an explicit rejected-audit flag."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


CELL_W = 40
CELL_H = 56
DIRECTIONS = ("front", "back", "left", "right")
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
    return [
        sheet.crop((0, 0, half_w, half_h)),
        sheet.crop((half_w, 0, sheet.width, half_h)),
        sheet.crop((0, half_h, half_w, sheet.height)),
        sheet.crop((half_w, half_h, sheet.width, sheet.height)),
    ]


def largest_component(image: Image.Image) -> Image.Image:
    foreground = strip_green(image)
    alpha = foreground.getchannel("A").point(lambda value: 255 if value >= 96 else 0)
    outer_bbox = alpha.getbbox()
    if outer_bbox is None:
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
        raise ValueError("no connected source component")

    min_x = min(point[0] for point in best)
    min_y = min(point[1] for point in best)
    max_x = max(point[0] for point in best) + 1
    max_y = max(point[1] for point in best) + 1
    margin = 3
    source_bbox = (
        max(0, int(min_x / sample_scale) - margin),
        max(0, int(min_y / sample_scale) - margin),
        min(foreground.width, int(max_x / sample_scale) + margin),
        min(foreground.height, int(max_y / sample_scale) + margin),
    )
    component = foreground.crop(source_bbox)
    final_bbox = component.getchannel("A").getbbox()
    if final_bbox is None:
        raise ValueError("empty isolated component")
    return component.crop(final_bbox)


def compact_sprite(
    source: Image.Image,
    max_width: int,
    max_height: int,
    colors: int,
    *,
    force_size: bool = False,
    outline: bool = False,
) -> Image.Image:
    scale = min(max_width / source.width, max_height / source.height)
    target_size = (max_width, max_height) if force_size else (
        max(1, round(source.width * scale)),
        max(1, round(source.height * scale)),
    )
    resized = source.resize(target_size, Image.Resampling.LANCZOS)
    array = np.asarray(resized.convert("RGBA")).copy()
    opaque = array[..., 3] >= 48
    if not opaque.any():
        raise ValueError("source disappeared during reduction")

    visible_colors = array[..., :3][opaque]
    sample = Image.fromarray(visible_colors.reshape((1, len(visible_colors), 3)).astype(np.uint8))
    quantized = sample.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    array[..., :3] = 0
    array[..., :3][opaque] = np.asarray(quantized).reshape((-1, 3))
    array[..., 3] = np.where(opaque, 255, 0).astype(np.uint8)

    if outline:
        mask = Image.fromarray((opaque.astype(np.uint8) * 255))
        interior = np.asarray(mask.filter(ImageFilter.MinFilter(3))) > 0
        edge = opaque & ~interior
        luminance = (
            visible_colors[:, 0].astype(np.uint32) * 2126
            + visible_colors[:, 1].astype(np.uint32) * 7152
            + visible_colors[:, 2].astype(np.uint32) * 722
        )
        ink = visible_colors[int(np.argmin(luminance))]
        array[..., :3][edge] = ink

    sprite = Image.fromarray(array)
    bbox = sprite.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty compact sprite")
    return sprite.crop(bbox)


def hero_cells(hero_sheet: Image.Image) -> list[Image.Image]:
    if hero_sheet.size != (CELL_W * 4, CELL_H):
        raise ValueError(f"unexpected hero sheet size: {hero_sheet.size}")
    return [hero_sheet.crop((index * CELL_W, 0, (index + 1) * CELL_W, CELL_H)) for index in range(4)]


def bottom_of(image: Image.Image) -> int:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty image")
    return bbox[3]


def build_freezer_overlay(raw: Image.Image, heroes: list[Image.Image]) -> Image.Image:
    source_panels = split_quadrants(raw)
    # Raw Image2 quadrants are front/left/back/right; the canonical hero is
    # front/back/left/right.
    panels = [source_panels[0], source_panels[2], source_panels[1], source_panels[3]]
    # The small in-cell sizes preserve two clear pixels between body and freezer.
    limits = ((9, 7), (9, 7), (10, 7), (10, 7))
    sides = ("right", "left", "right", "left")
    strip = Image.new("RGBA", (CELL_W * 4, CELL_H))
    for index, (panel, hero, limit, side) in enumerate(zip(panels, heroes, limits, sides)):
        sprite = compact_sprite(
            largest_component(panel),
            *limit,
            colors=7,
            force_size=True,
            outline=True,
        )
        hero_bbox = hero.getchannel("A").getbbox()
        if hero_bbox is None:
            raise ValueError("empty hero cell")
        if side == "right":
            x = hero_bbox[2] + 2
            if x + sprite.width > CELL_W:
                x = CELL_W - sprite.width
        else:
            x = hero_bbox[0] - 2 - sprite.width
            if x < 0:
                x = 0
        y = bottom_of(hero) - sprite.height
        strip.alpha_composite(sprite, (index * CELL_W + x, y))
    return strip


def build_breath_overlay(raw: Image.Image) -> Image.Image:
    # The lower-left panel includes a detached, unlettered exhalation puff.
    panel = split_quadrants(raw)[2]
    puff_crop = panel.crop((
        round(panel.width * 0.62),
        round(panel.height * 0.62),
        round(panel.width * 0.90),
        round(panel.height * 0.82),
    ))
    unlettered = largest_component(puff_crop)
    front = compact_sprite(unlettered, 5, 3, colors=4)
    side = compact_sprite(unlettered, 6, 3, colors=4)
    strip = Image.new("RGBA", (CELL_W * 4, CELL_H))

    # Front: six pixels below the former eye-bar anchor, centered under the mouth.
    strip.alpha_composite(front, ((CELL_W - front.width) // 2, 21))

    # Left/right: emit away from the face by roughly four logical pixels.
    left = side.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    strip.alpha_composite(left, (5 + CELL_W * 2, 21))
    strip.alpha_composite(side, (29 + CELL_W * 3, 21))
    # Back stays empty: breath cannot originate from the back of the head.
    return strip


def composite(overlay: Image.Image, hero_sheet: Image.Image, overlay_above: bool) -> Image.Image:
    result = Image.new("RGBA", hero_sheet.size)
    if overlay_above:
        result.alpha_composite(hero_sheet)
        result.alpha_composite(overlay)
    else:
        result.alpha_composite(overlay)
        result.alpha_composite(hero_sheet)
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


def save_set(
    item: str,
    overlay: Image.Image,
    preview: Image.Image,
    out_dir: Path,
) -> None:
    overlay.save(out_dir / f"{item}-overlay-4dir-40x56.png", optimize=True)
    preview.save(out_dir / f"{item}-hero-preview-4dir-40x56.png", optimize=True)
    contact(preview).save(out_dir / f"{item}-hero-preview-12x.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--freezer-raw", type=Path, required=True)
    parser.add_argument("--breath-raw", type=Path)
    parser.add_argument("--emit-rejected-breath-audit", action="store_true")
    parser.add_argument("--hero", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    hero_sheet = Image.open(args.hero).convert("RGBA")
    heroes = hero_cells(hero_sheet)
    freezer_raw = Image.open(args.freezer_raw).convert("RGBA")

    freezer_overlay = build_freezer_overlay(freezer_raw, heroes)
    freezer_preview = composite(freezer_overlay, hero_sheet, overlay_above=False)
    save_set("70-shop-freezer", freezer_overlay, freezer_preview, args.out_dir)

    if args.emit_rejected_breath_audit:
        if args.breath_raw is None:
            parser.error("--breath-raw is required with --emit-rejected-breath-audit")
        breath_raw = Image.open(args.breath_raw).convert("RGBA")
        breath_overlay = build_breath_overlay(breath_raw)
        breath_preview = composite(breath_overlay, hero_sheet, overlay_above=True)
        save_set("74-breath-on-glass", breath_overlay, breath_preview, args.out_dir)


if __name__ == "__main__":
    main()
