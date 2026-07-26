#!/usr/bin/env python3
"""Build non-destructive review previews for the first-salary Image2 candidates."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/12-first-salary")
INK = (21, 20, 26, 255)
PAPER = (226, 215, 194, 255)


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


def enlarged_on_dark(source: Image.Image, scale: int, padding: int = 12) -> Image.Image:
    enlarged = source.resize((source.width * scale, source.height * scale), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (enlarged.width + padding * 2, enlarged.height + padding * 2), INK)
    canvas.alpha_composite(enlarged, (padding, padding))
    return canvas


def build(version: str) -> None:
    version_dir = ROOT / version
    source_path = version_dir / "source.png"
    source = Image.open(source_path).convert("RGBA")
    panels = [crop_subject(panel) for panel in split_sheet(source)]

    equipment = Image.new("RGBA", (32 * 4, 40), (0, 0, 0, 0))
    processed: list[Image.Image] = []
    for index, panel in enumerate(panels):
        max_width = 10 if index in (0, 2) else 4
        sprite = fit(panel, max_width, 9, 8)
        processed.append(sprite)
        equipment.alpha_composite(
            sprite,
            (index * 32 + (32 - sprite.width) // 2, (40 - sprite.height) // 2),
        )
    equipment.save(version_dir / "equipment-32x40.png", optimize=True)

    icon_sprite = fit(panels[0], 28, 28, 10)
    icon = Image.new("RGBA", (36, 36), (0, 0, 0, 0))
    icon.alpha_composite(icon_sprite, ((36 - icon_sprite.width) // 2, (36 - icon_sprite.height) // 2))
    icon.save(version_dir / "icon-36.png", optimize=True)

    contact = Image.new("RGBA", (1600, 540), INK)
    draw = ImageDraw.Draw(contact)
    draw.text((32, 24), f"FIRST SALARY / {version.upper()} / NATIVE-SIZE GATES", fill=PAPER)
    draw.text((32, 54), "36x36 ICON (12x nearest-neighbor)", fill=(152, 143, 151, 255))
    icon_review = enlarged_on_dark(icon, 12, 8)
    contact.alpha_composite(icon_review, (32, 84))

    draw.text((520, 54), "FOUR 32x40 CELLS (8x nearest-neighbor)", fill=(152, 143, 151, 255))
    equipment_review = enlarged_on_dark(equipment, 8, 8)
    contact.alpha_composite(equipment_review, (520, 84))
    labels = ("FRONT", "LEFT", "BACK", "RIGHT")
    for index, label in enumerate(labels):
        draw.text((528 + index * 256, 424), label, fill=(152, 143, 151, 255))
    contact.convert("RGB").save(version_dir / "size-gate-preview.png", optimize=True)

    transparent_pixels = sum(1 for pixel in equipment.getdata() if pixel[3] == 0)
    visible_colors = {pixel[:3] for pixel in equipment.getdata() if pixel[3]}
    (version_dir / "metrics.txt").write_text(
        "\n".join([
            f"source={source.size[0]}x{source.size[1]}",
            f"icon={icon.size[0]}x{icon.size[1]}",
            f"equipment={equipment.size[0]}x{equipment.size[1]}",
            f"equipment_transparent_pixels={transparent_pixels}",
            f"equipment_visible_colors={len(visible_colors)}",
            "sprite_sizes=" + ",".join(f"{sprite.width}x{sprite.height}" for sprite in processed),
        ]) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    args = parser.parse_args()
    build(args.version)


if __name__ == "__main__":
    main()
