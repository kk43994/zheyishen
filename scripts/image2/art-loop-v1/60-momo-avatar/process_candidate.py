#!/usr/bin/env python3
"""Build exact 40x56 momo-avatar face overlays and hero review composites."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


OUTPUT_ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/60-momo-avatar")
HERO_ATLAS = Path("src/assets/hero-style1-profiles/hero-idle.png")
DIRECTIONS = ("front", "left", "back", "right")
HERO_ROWS = {"front": 1120, "left": 1232, "back": 1176, "right": 1288}
ANCHORS = {"front": (20, 17), "left": (14, 17), "back": (20, 20), "right": (26, 17)}
LIMITS = {"front": (12, 12), "left": (9, 12), "back": (12, 3), "right": (9, 12)}
REVIEW_BG = (21, 20, 26, 255)
REVIEW_TEXT = (226, 215, 194, 255)

# Fixed to the approved icon's quiet gray-pink identity. Generated hues are
# normalized into this small set so source color drift cannot become neon skin.
PALETTE = (
    (35, 25, 39),
    (74, 43, 58),
    (126, 64, 88),
    (181, 106, 143),
    (217, 154, 185),
)


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


def split_sheet(sheet: Image.Image) -> list[Image.Image]:
    columns = [0, sheet.width // 2, sheet.width]
    rows = [0, sheet.height // 2, sheet.height]
    return [
        sheet.crop((columns[0], rows[0], columns[1], rows[1])),
        sheet.crop((columns[1], rows[0], columns[2], rows[1])),
        sheet.crop((columns[0], rows[1], columns[1], rows[2])),
        sheet.crop((columns[1], rows[1], columns[2], rows[2])),
    ]


def crop_subject(panel: Image.Image) -> Image.Image:
    subject = strip_green(panel)
    alpha = subject.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("empty source panel after chroma removal")
    return subject.crop(bbox)


def fill_internal_holes(image: Image.Image) -> Image.Image:
    """Make the avatar a solid identity mask, not a frame exposing human eyes."""
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
            if (
                0 <= next_x < width
                and 0 <= next_y < height
                and not opaque[next_y, next_x]
                and not outside[next_y, next_x]
            ):
                outside[next_y, next_x] = True
                queue.append((next_x, next_y))

    holes = ~opaque & ~outside
    array[..., :3][holes] = PALETTE[3]
    array[..., 3][holes] = 255
    return Image.fromarray(array)


def coverage_resize(source: Image.Image, width: int, height: int) -> Image.Image:
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
            coverage = int(opaque.sum())
            if coverage * 4 < opaque.size:
                continue
            pixels = cell[..., :3][opaque]
            luminance = (
                pixels[:, 0].astype(np.uint32) * 299
                + pixels[:, 1].astype(np.uint32) * 587
                + pixels[:, 2].astype(np.uint32) * 114
            )
            dark = pixels[luminance <= 80000]
            selected = dark if len(dark) * 5 >= len(pixels) else pixels
            result[target_y, target_x, :3] = np.median(selected, axis=0).astype(np.uint8)
            result[target_y, target_x, 3] = 255

    return Image.fromarray(result)


def normalize_palette(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 128
    if not opaque.any():
        raise ValueError("cannot normalize an empty face overlay")
    colors = np.asarray(PALETTE, dtype=np.int32)
    pixels = array[..., :3][opaque].astype(np.int32)
    distances = ((pixels[:, None, :] - colors[None, :, :]) ** 2).sum(axis=2)
    array[..., :3] = 0
    array[..., :3][opaque] = colors[np.argmin(distances, axis=1)].astype(np.uint8)
    array[..., 3] = np.where(opaque, 255, 0).astype(np.uint8)
    return Image.fromarray(array)


def fit(source: Image.Image, max_width: int, max_height: int) -> Image.Image:
    scale = min(max_width / source.width, max_height / source.height)
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    return normalize_palette(coverage_resize(fill_internal_holes(source), width, height))


def make_back_edge() -> Image.Image:
    """Back view is deliberately almost empty and can never contain an eye."""
    sprite = Image.new("RGBA", LIMITS["back"], (0, 0, 0, 0))
    pixels = sprite.load()
    left = ((0, 0), (0, 1), (1, 1), (1, 2))
    right = tuple((sprite.width - 1 - x, y) for x, y in left)
    for x, y in left + right:
        pixels[x, y] = PALETTE[2] + (255,)
    pixels[1, 1] = PALETTE[3] + (255,)
    pixels[sprite.width - 2, 1] = PALETTE[3] + (255,)
    return sprite


def hero_frames() -> dict[str, Image.Image]:
    atlas = Image.open(HERO_ATLAS).convert("RGBA")
    return {
        direction: atlas.crop((0, y, 40, y + 56))
        for direction, y in HERO_ROWS.items()
    }


def count_exact_green(image: Image.Image) -> int:
    return sum(
        1
        for red, green, blue, alpha in image.convert("RGBA").getdata()
        if alpha and (red, green, blue) == (0, 255, 0)
    )


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").point(lambda value: 255 if value >= 128 else 0).getbbox()


def build(source_path: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGBA")
    transparent_source = strip_green(source)
    transparent_source.save(output_dir / "source-transparent.png", optimize=True)

    panels = [crop_subject(panel) for panel in split_sheet(source)]
    sprites = {
        direction: fit(panels[index], *LIMITS[direction])
        for index, direction in enumerate(DIRECTIONS)
        if direction != "back"
    }
    sprites["back"] = make_back_edge()

    overlay_sheet = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
    composite_sheet = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
    bases = hero_frames()

    for index, direction in enumerate(DIRECTIONS):
        sprite = sprites[direction]
        anchor_x, anchor_y = ANCHORS[direction]
        destination = (
            index * 40 + anchor_x - sprite.width // 2,
            anchor_y - sprite.height // 2,
        )
        overlay_sheet.alpha_composite(sprite, destination)
        composite_sheet.alpha_composite(bases[direction], (index * 40, 0))
        composite_sheet.alpha_composite(sprite, destination)

    overlay_sheet.save(output_dir / "face-overlay-40x56.png", optimize=True)
    composite_sheet.save(output_dir / "hero-composite-40x56.png", optimize=True)

    gate = Image.new("RGBA", (48, 12), (0, 0, 0, 0))
    for index, direction in enumerate(DIRECTIONS):
        anchor_x, anchor_y = ANCHORS[direction]
        cell = composite_sheet.crop((index * 40, 0, index * 40 + 40, 56))
        region = cell.crop((anchor_x - 6, anchor_y - 6, anchor_x + 6, anchor_y + 6))
        gate.alpha_composite(region, (index * 12, 0))
    gate.save(output_dir / "face-regions-12x12.png", optimize=True)

    full_enlarged = composite_sheet.resize((1920, 672), Image.Resampling.NEAREST)
    full_review = Image.new("RGBA", full_enlarged.size, REVIEW_BG)
    full_review.alpha_composite(full_enlarged)
    full_review.convert("RGB").save(output_dir / "hero-composite-40x56-12x.png", optimize=True)

    gate_enlarged = gate.resize((576, 144), Image.Resampling.NEAREST)
    gate_review = Image.new("RGBA", (576, 174), REVIEW_BG)
    gate_review.alpha_composite(gate_enlarged, (0, 0))
    draw = ImageDraw.Draw(gate_review)
    for index, direction in enumerate(DIRECTIONS):
        draw.text((index * 144 + 6, 152), direction.upper(), fill=REVIEW_TEXT)
    gate_review.convert("RGB").save(output_dir / "face-regions-12x12-12x.png", optimize=True)

    metrics = [
        f"source={source.width}x{source.height}",
        f"transparent_source_exact_green={count_exact_green(transparent_source)}",
        "direction_order=front,left,back,right",
        "face_gate=12x12",
        f"overlay={overlay_sheet.width}x{overlay_sheet.height}",
        f"overlay_exact_green={count_exact_green(overlay_sheet)}",
        f"composite={composite_sheet.width}x{composite_sheet.height}",
    ]
    for direction in DIRECTIONS:
        sprite = sprites[direction]
        visible = sum(1 for pixel in sprite.getdata() if pixel[3])
        colors = len({pixel[:3] for pixel in sprite.getdata() if pixel[3]})
        darkest = sum(1 for pixel in sprite.getdata() if pixel[:3] == PALETTE[0] and pixel[3])
        metrics.append(
            f"{direction}={sprite.width}x{sprite.height};bounds={alpha_bounds(sprite)};"
            f"visible={visible};colors={colors};darkest={darkest}"
        )
    metrics.append("back_eye_pixels=0")
    (output_dir / "metrics.txt").write_text("\n".join(metrics) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version", nargs="?", default="v1")
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()

    output_dir = args.output_dir or OUTPUT_ROOT / args.version
    source_path = args.source or output_dir / "source.png"
    build(source_path, output_dir)


if __name__ == "__main__":
    main()
