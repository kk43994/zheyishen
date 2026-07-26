#!/usr/bin/env python3
"""Derive a readable 36px stone-schoolbag icon from its approved Image2 source."""

from pathlib import Path

from PIL import Image, ImageEnhance, ImageDraw

from process_item_icon_image2_v2 import process_icon
from process_item_image2_assets import crop_main_component, split_sheet


RAW = Path("output/imagegen/zhe-yi-shen-items-image2-v1/raw/04-stone-schoolbag.png")
ATLAS = Path("src/assets/items/icons.png")
OUT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/04-stone-schoolbag/v1")
CELL = 36
INDEX = 3
COLS = 8


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    front = split_sheet(Image.open(RAW).convert("RGBA"))[0]
    subject = crop_main_component(front)
    subject = ImageEnhance.Brightness(subject).enhance(1.13)
    subject.save(OUT / "source-front.png", optimize=True)
    icon = process_icon(OUT / "source-front.png")
    icon.save(OUT / "icon-36.png", optimize=True)

    atlas = Image.open(ATLAS).convert("RGBA")
    left = (INDEX % COLS) * CELL
    top = (INDEX // COLS) * CELL
    current = atlas.crop((left, top, left + CELL, top + CELL))
    preview = Image.new("RGBA", (900, 540), (16, 16, 20, 255))
    draw = ImageDraw.Draw(preview)
    draw.text((60, 28), "CURRENT", fill=(150, 142, 145, 255))
    draw.text((510, 28), "IMAGE2 FRONT RECROP", fill=(218, 208, 190, 255))
    preview.alpha_composite(current.resize((360, 360), Image.Resampling.NEAREST), (45, 90))
    preview.alpha_composite(icon.resize((360, 360), Image.Resampling.NEAREST), (495, 90))
    preview.save(OUT / "current-vs-candidate-10x.png", optimize=True)


if __name__ == "__main__":
    main()
