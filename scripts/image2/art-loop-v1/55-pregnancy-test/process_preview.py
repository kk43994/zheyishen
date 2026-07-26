#!/usr/bin/env python3
"""Build non-destructive 40x56 review previews for pregnancy-test candidates."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/55-pregnancy-test")
HERO_PATH = Path(
    "scripts/image2/art-loop-v1/55-pregnancy-test/input/03-approved-hero-4dir.png"
)
INK = (21, 20, 26, 255)
PAPER = (226, 215, 194, 255)
DIRECTIONS = ("FRONT", "BACK", "LEFT", "RIGHT")


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
    near_key = np.asarray(
        Image.fromarray((keyed.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(5))
    ) > 0
    strongest_other = np.maximum(red, blue)
    spill = ~keyed & near_key & (green > strongest_other + 10)
    array[..., 1][spill] = strongest_other[spill].astype(np.uint8)
    array[..., 3][keyed] = 0
    array[..., :3][keyed] = 0
    return Image.fromarray(array)


def split_grid(sheet: Image.Image) -> tuple[list[Image.Image], list[Image.Image]]:
    columns = [round(sheet.width * index / 4) for index in range(5)]
    rows = [0, round(sheet.height / 2), sheet.height]
    top = [sheet.crop((columns[i], rows[0], columns[i + 1], rows[1])) for i in range(4)]
    bottom = [sheet.crop((columns[i], rows[1], columns[i + 1], rows[2])) for i in range(4)]
    return top, bottom


def crop_subject(panel: Image.Image) -> Image.Image:
    subject = strip_green(panel)
    alpha = subject.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("empty source panel after chroma removal")
    left, top, right, bottom = bbox
    return subject.crop(
        (max(0, left - 2), max(0, top - 2), min(subject.width, right + 2), min(subject.height, bottom + 2))
    )


def quantize_opaque(image: Image.Image, colors: int) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 128
    if not opaque.any():
        raise ValueError("cannot quantize an empty image")
    samples = Image.fromarray(array[..., :3][opaque].reshape((1, -1, 3)).astype(np.uint8))
    reduced = samples.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    array[..., :3] = 0
    array[..., :3][opaque] = np.asarray(reduced).reshape((-1, 3))
    array[..., 3] = np.where(opaque, 255, 0).astype(np.uint8)
    return Image.fromarray(array)


def fit(source: Image.Image, max_width: int, max_height: int, colors: int) -> Image.Image:
    scale = min(max_width / source.width, max_height / source.height)
    resized = source.resize(
        (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
        Image.Resampling.NEAREST,
    )
    return quantize_opaque(resized, colors)


def remove_small_components(image: Image.Image, min_pixels: int = 2) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 128
    visited = np.zeros_like(opaque, dtype=bool)
    height, width = opaque.shape
    for start_y in range(height):
        for start_x in range(width):
            if not opaque[start_y, start_x] or visited[start_y, start_x]:
                continue
            stack = [(start_x, start_y)]
            visited[start_y, start_x] = True
            component: list[tuple[int, int]] = []
            while stack:
                x, y = stack.pop()
                component.append((x, y))
                for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if (
                        0 <= next_x < width
                        and 0 <= next_y < height
                        and opaque[next_y, next_x]
                        and not visited[next_y, next_x]
                    ):
                        visited[next_y, next_x] = True
                        stack.append((next_x, next_y))
            if len(component) < min_pixels:
                for x, y in component:
                    array[y, x] = (0, 0, 0, 0)
    return Image.fromarray(array)


def normalize_shadow(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 128
    eroded = np.asarray(
        Image.fromarray((opaque.astype(np.uint8) * 255)).filter(ImageFilter.MinFilter(3))
    ) >= 128
    outline = opaque & ~eroded
    array[..., :3] = 0
    array[..., :3][opaque] = (47, 40, 52)
    array[..., :3][outline] = (67, 53, 69)
    array[..., 3] = np.where(opaque, 255, 0).astype(np.uint8)
    return Image.fromarray(array)


def reinforce_result_bars(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    red = array[..., 0]
    green = array[..., 1]
    blue = array[..., 2]
    window = (
        (array[..., 3] >= 128)
        & (red >= 160)
        & (green >= 140)
        & (blue >= 140)
        & ((red.astype(np.int16) - green.astype(np.int16)) < 70)
    )
    coordinates = np.argwhere(window)
    if len(coordinates) < 2:
        return image
    xy = coordinates[:, ::-1].astype(np.float32)
    centered = xy - xy.mean(axis=0)
    _, _, vectors = np.linalg.svd(centered, full_matrices=False)
    projections = centered @ vectors[0]
    targets = np.quantile(projections, (0.40, 0.68))
    selected: list[int] = []
    for target in targets:
        candidates = np.argsort(np.abs(projections - target))
        choice = next((int(index) for index in candidates if int(index) not in selected), int(candidates[0]))
        selected.append(choice)
    for index in selected:
        y, x = coordinates[index]
        array[y, x, :3] = (139, 42, 70)
    return Image.fromarray(array)


def build(version: str) -> None:
    version_dir = ROOT / version
    source = Image.open(version_dir / f"55-pregnancy-test-{version}.png").convert("RGBA")
    prop_panels, shadow_panels = split_grid(source)
    props = []
    for index, panel in enumerate(prop_panels):
        max_size = (8, 6) if index < 2 else (8, 5)
        sprite = fit(crop_subject(panel), *max_size, 8)
        sprite = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        props.append(reinforce_result_bars(sprite))
    shadows = [
        remove_small_components(normalize_shadow(fit(crop_subject(panel), 12, 15, 5)))
        for panel in shadow_panels
    ]

    prop_atlas = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
    shadow_atlas = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
    composite = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
    hero = Image.open(HERO_PATH).convert("RGBA")
    prop_anchors = ((29, 40), (10, 40), (13, 38), (27, 38))
    prop_grips = ("right", "left", "left", "right")
    shadow_offsets = (7, -7, 7, -7)

    for index, (prop, shadow) in enumerate(zip(props, shadows)):
        cell_x = index * 40
        shadow_x = cell_x + (40 - shadow.width) // 2 + shadow_offsets[index]
        shadow_y = 50 - shadow.height
        anchor_x, anchor_y = prop_anchors[index]
        if prop_grips[index] == "right":
            prop_x = cell_x + anchor_x - prop.width + 2
        else:
            prop_x = cell_x + anchor_x - 1
        prop_y = anchor_y - prop.height + 2
        shadow_atlas.alpha_composite(shadow, (shadow_x, shadow_y))
        prop_atlas.alpha_composite(prop, (prop_x, prop_y))
        composite.alpha_composite(shadow, (shadow_x, shadow_y))
        hero_cell = hero.crop((cell_x, 0, cell_x + 40, 56))
        composite.alpha_composite(hero_cell, (cell_x, 0))
        composite.alpha_composite(prop, (prop_x, prop_y))
        hand_box = (
            max(0, anchor_x - 2),
            max(0, anchor_y - 2),
            min(40, anchor_x + 2),
            min(56, anchor_y + 2),
        )
        hand_patch = hero_cell.crop(hand_box)
        composite.alpha_composite(hand_patch, (cell_x + hand_box[0], hand_box[1]))

    prop_atlas.save(version_dir / "rigid-overlay-4dir-40x56.png", optimize=True)
    shadow_atlas.save(version_dir / "child-shadow-overlay-4dir-40x56.png", optimize=True)
    composite.save(version_dir / "hero-child-preview-4dir-40x56.png", optimize=True)

    review = Image.new("RGBA", (1600, 650), INK)
    draw = ImageDraw.Draw(review)
    draw.text((24, 18), f"PREGNANCY TEST / {version.upper()} / 40x56 HERO GATE", fill=PAPER)
    enlarged = composite.resize((1600, 560), Image.Resampling.NEAREST)
    review.alpha_composite(enlarged, (0, 54))
    for index, label in enumerate(DIRECTIONS):
        draw.text((index * 400 + 16, 620), label, fill=(152, 143, 151, 255))
    review.convert("RGB").save(version_dir / "hero-child-preview-10x.png", optimize=True)

    visible_prop_colors = {
        pixel[:3] for pixel in prop_atlas.getdata() if pixel[3] >= 128
    }
    visible_shadow_colors = {
        pixel[:3] for pixel in shadow_atlas.getdata() if pixel[3] >= 128
    }
    (version_dir / "metrics.txt").write_text(
        "\n".join(
            [
                f"source={source.width}x{source.height}",
                "prop_sizes=" + ",".join(f"{sprite.width}x{sprite.height}" for sprite in props),
                "shadow_sizes=" + ",".join(f"{sprite.width}x{sprite.height}" for sprite in shadows),
                f"prop_visible_colors={len(visible_prop_colors)}",
                f"shadow_visible_colors={len(visible_shadow_colors)}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    args = parser.parse_args()
    build(args.version)


if __name__ == "__main__":
    main()
