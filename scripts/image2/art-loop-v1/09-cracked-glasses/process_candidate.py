#!/usr/bin/env python3
"""Build isolated face overlays and exact 40x56 hero composites for review."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


OUTPUT_ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/09-cracked-glasses")
HERO_ATLAS = Path("src/assets/hero-style1-profiles/hero-idle.png")
DIRECTIONS = ("front", "left", "back", "right")
HERO_ROWS = {"front": 1120, "left": 1232, "back": 1176, "right": 1288}
ANCHORS = {"front": (20, 18), "left": (14, 18), "back": (20, 17), "right": (26, 18)}
LIMITS = {"front": (10, 4), "left": (6, 4), "back": (6, 2), "right": (6, 4)}
REVIEW_BG = (21, 20, 26, 255)


def strip_green(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    keyed = (
        (green > 88)
        & (green * 100 > red * 125)
        & (green * 100 > blue * 125)
        & (np.maximum(red, blue) < 150)
    )
    near_key = np.asarray(
        Image.fromarray((keyed.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(5))
    ) > 0
    strongest_other = np.maximum(red, blue)
    edge_spill = (
        ~keyed
        & near_key
        & (green > 70)
        & (green > strongest_other + 10)
    )
    array[..., 1][edge_spill] = strongest_other[edge_spill].astype(np.uint8)
    array[..., 3][keyed] = 0
    array[..., :3][keyed] = 0
    return Image.fromarray(array)


def split_sheet(sheet: Image.Image) -> list[Image.Image]:
    half_width = sheet.width // 2
    half_height = sheet.height // 2
    return [
        sheet.crop((0, 0, half_width, half_height)),
        sheet.crop((half_width, 0, sheet.width, half_height)),
        sheet.crop((0, half_height, half_width, sheet.height)),
        sheet.crop((half_width, half_height, sheet.width, sheet.height)),
    ]


def crop_subject(panel: Image.Image) -> Image.Image:
    subject = strip_green(panel)
    alpha = subject.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("empty source panel after chroma removal")
    left, top, right, bottom = bbox
    return subject.crop((max(0, left - 2), max(0, top - 2), min(subject.width, right + 2), min(subject.height, bottom + 2)))


def quantize_opaque(image: Image.Image, colors: int = 6) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 128
    if not opaque.any():
        raise ValueError("cannot quantize an empty overlay")
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


def coverage_resize(source: Image.Image, width: int, height: int) -> Image.Image:
    """Downsample sparse pixel art without dropping one-pixel rims or cracks."""
    source_array = np.asarray(source.convert("RGBA"))
    source_height, source_width = source_array.shape[:2]
    result = np.zeros((height, width, 4), dtype=np.uint8)

    for target_y in range(height):
        top = target_y * source_height // height
        bottom = max(top + 1, (target_y + 1) * source_height // height)
        for target_x in range(width):
            left = target_x * source_width // width
            right = max(left + 1, (target_x + 1) * source_width // width)
            cell = source_array[top:bottom, left:right]
            opaque = cell[..., 3] >= 128
            if not opaque.any():
                continue

            pixels = cell[..., :3][opaque]
            luminance = (
                pixels[:, 0].astype(np.uint16) * 299
                + pixels[:, 1].astype(np.uint16) * 587
                + pixels[:, 2].astype(np.uint16) * 114
            )
            # A pale crack is much thinner than the dark rim. Preserve it when it
            # crosses a target cell instead of averaging it into the frame color.
            bright = pixels[luminance >= 170000]
            selected = bright if len(bright) else pixels
            result[target_y, target_x, :3] = np.median(selected, axis=0).astype(np.uint8)
            result[target_y, target_x, 3] = 255

    return Image.fromarray(result)


def fit(source: Image.Image, max_width: int, max_height: int) -> Image.Image:
    # The display budget is only four pixels high. Use the full per-direction
    # footprint so a rim reads as glasses instead of collapsing into a bar.
    resized = coverage_resize(source, max_width, max_height)
    return quantize_opaque(resized)


def semantic_palette(source: Image.Image) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    array = np.asarray(source.convert("RGBA"))
    pixels = array[..., :3][array[..., 3] >= 128]
    if not len(pixels):
        raise ValueError("cannot sample an empty eyeglass source")
    # The source palette is nearly black and white. At final scale that reads as
    # sunglasses, so remap the fitted layer to the project's old-metal midtones.
    frame = (96, 86, 100)
    crack = (160, 164, 172)
    return frame, crack


def fitted_v2_sprite(
    direction: str,
    frame: tuple[int, int, int],
    crack: tuple[int, int, int],
) -> Image.Image:
    """Map the generated v2 identity onto the final four-pixel-high face grid."""
    width, height = LIMITS[direction]
    array = np.zeros((height, width, 4), dtype=np.uint8)

    if direction == "front":
        frame_points = {
            *( (x, 0) for x in (1, 2, 7, 8) ),
            *( (x, 3) for x in (1, 2, 7, 8) ),
            (0, 1), (3, 1), (4, 1), (5, 1), (6, 1), (9, 1),
            (0, 2), (3, 2), (6, 2), (9, 2),
        }
        crack_points = {(8, 1), (7, 2), (8, 2)}
    elif direction in {"left", "right"}:
        frame_points = {
            (1, 0), (2, 0),
            (0, 1), (3, 1), (4, 1),
            (0, 2), (3, 2), (5, 2),
            (1, 3), (2, 3),
        }
        crack_points = {(1, 1), (2, 2)} if direction == "left" else set()
        if direction == "right":
            frame_points = {(width - 1 - x, y) for x, y in frame_points}
    else:
        frame_points = {(0, 1), (5, 1)}
        crack_points = set()

    for x, y in frame_points:
        array[y, x, :3] = frame
        array[y, x, 3] = 255
    for x, y in crack_points:
        array[y, x, :3] = crack
        array[y, x, 3] = 255
    return Image.fromarray(array)


def max_horizontal_run(image: Image.Image) -> int:
    alpha = np.asarray(image.getchannel("A")) > 0
    longest = 0
    for row in alpha:
        current = 0
        for value in row:
            current = current + 1 if value else 0
            longest = max(longest, current)
    return longest


def hero_frames() -> dict[str, Image.Image]:
    atlas = Image.open(HERO_ATLAS).convert("RGBA")
    return {
        direction: atlas.crop((0, y, 40, y + 56))
        for direction, y in HERO_ROWS.items()
    }


def count_exact_green(image: Image.Image) -> int:
    return sum(1 for pixel in image.convert("RGBA").getdata() if pixel[:3] == (0, 255, 0) and pixel[3])


def build(version: str) -> None:
    version_dir = OUTPUT_ROOT / version
    source_path = version_dir / "source.png"
    source = Image.open(source_path).convert("RGBA")
    transparent_source = strip_green(source)
    transparent_source.save(version_dir / "source-transparent.png", optimize=True)

    panels = [crop_subject(panel) for panel in split_sheet(source)]
    frame_color, crack_color = semantic_palette(panels[0])
    overlay_sheet = Image.new("RGBA", (40 * 4, 56), (0, 0, 0, 0))
    sprites: dict[str, Image.Image] = {}
    for index, direction in enumerate(DIRECTIONS):
        max_width, max_height = LIMITS[direction]
        sprite = (
            fitted_v2_sprite(direction, frame_color, crack_color)
            if version.startswith("v2")
            else fit(panels[index], max_width, max_height)
        )
        sprites[direction] = sprite
        anchor_x, anchor_y = ANCHORS[direction]
        destination = (
            index * 40 + anchor_x - sprite.width // 2,
            anchor_y - sprite.height // 2,
        )
        overlay_sheet.alpha_composite(sprite, destination)
    overlay_sheet.save(version_dir / "face-overlay-40x56.png", optimize=True)

    composite_sheet = Image.new("RGBA", (40 * 4, 56), (0, 0, 0, 0))
    bases = hero_frames()
    for index, direction in enumerate(DIRECTIONS):
        composite_sheet.alpha_composite(bases[direction], (index * 40, 0))
        overlay = overlay_sheet.crop((index * 40, 0, (index + 1) * 40, 56))
        composite_sheet.alpha_composite(overlay, (index * 40, 0))
    composite_sheet.save(version_dir / "hero-composite-40x56.png", optimize=True)

    enlarged = composite_sheet.resize((160 * 12, 56 * 12), Image.Resampling.NEAREST)
    review = Image.new("RGBA", enlarged.size, REVIEW_BG)
    review.alpha_composite(enlarged)
    review.convert("RGB").save(version_dir / "hero-composite-40x56-12x.png", optimize=True)

    overlay_enlarged = overlay_sheet.resize((160 * 12, 56 * 12), Image.Resampling.NEAREST)
    overlay_review = Image.new("RGBA", overlay_enlarged.size, REVIEW_BG)
    overlay_review.alpha_composite(overlay_enlarged)
    overlay_review.convert("RGB").save(version_dir / "face-overlay-40x56-12x.png", optimize=True)

    metrics = [
        f"source={source.width}x{source.height}",
        f"transparent_source_exact_green={count_exact_green(transparent_source)}",
        f"overlay={overlay_sheet.width}x{overlay_sheet.height}",
        f"overlay_exact_green={count_exact_green(overlay_sheet)}",
        f"composite={composite_sheet.width}x{composite_sheet.height}",
    ]
    for direction in DIRECTIONS:
        sprite = sprites[direction]
        visible = sum(1 for pixel in sprite.getdata() if pixel[3])
        colors = len({pixel[:3] for pixel in sprite.getdata() if pixel[3]})
        metrics.append(
            f"{direction}={sprite.width}x{sprite.height};visible={visible};"
            f"colors={colors};max_horizontal_run={max_horizontal_run(sprite)}"
        )
    (version_dir / "metrics.txt").write_text("\n".join(metrics) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    args = parser.parse_args()
    build(args.version)


if __name__ == "__main__":
    main()
