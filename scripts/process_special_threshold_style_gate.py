#!/usr/bin/env python3
"""Process Image2 special-room threshold boards into runtime-scale review assets."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

from process_plinth_style_gate import add_outline, chroma_key, load_font, map_palette


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "output/imagegen/zhe-yi-shen-special-threshold-style-gate-v1/raw"
OUTPUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-special-threshold-style-gate-v1/processed"
STYLES = (
    ("01-lived-furniture", "1  LIVED FURNITURE"),
    ("02-archive-machinery", "2  ARCHIVE MACHINERY"),
    ("03-last-line-station", "3  LAST-LINE STATION"),
)
NAMES = ("merchant", "light-door", "inner-door", "reward-beam")
CELL = (32, 64)
MAX_SIZES = ((30, 46), (30, 46), (30, 46), (28, 60))
SCALE = 8


def clean_transparent(image: Image.Image) -> Image.Image:
    result = []
    for red, green, blue, alpha in image.getdata():
        result.append((red, green, blue, alpha) if alpha else (0, 0, 0, 0))
    image.putdata(result)
    return image


def process_cell(source: Image.Image, index: int) -> Image.Image:
    keyed = chroma_key(source)
    bbox = keyed.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"empty cell {index} after chroma key")
    crop = keyed.crop(bbox)
    max_width, max_height = MAX_SIZES[index]
    ratio = min(max_width / crop.width, max_height / crop.height)
    size = (max(1, round(crop.width * ratio)), max(1, round(crop.height * ratio)))
    reduced = crop.resize(size, Image.Resampling.LANCZOS)
    reduced = map_palette(reduced)
    target = Image.new("RGBA", CELL, (0, 0, 0, 0))
    target.alpha_composite(reduced, ((CELL[0] - reduced.width) // 2, CELL[1] - 2 - reduced.height))
    return clean_transparent(add_outline(target))


def process_board(path: Path) -> list[Image.Image]:
    board = Image.open(path).convert("RGBA").resize((1024, 1024), Image.Resampling.NEAREST)
    cells = []
    for index in range(4):
        row, column = divmod(index, 2)
        crop = board.crop((column * 512, row * 512, (column + 1) * 512, (row + 1) * 512))
        cells.append(process_cell(crop, index))
    return cells


def make_atlas(cells: list[Image.Image]) -> Image.Image:
    atlas = Image.new("RGBA", (CELL[0] * 4, CELL[1]), (0, 0, 0, 0))
    for index, sprite in enumerate(cells):
        atlas.alpha_composite(sprite, (index * CELL[0], 0))
    return atlas


def make_contact(all_cells: list[tuple[str, list[Image.Image]]]) -> Image.Image:
    margin = 24
    label_h = 42
    column_w = CELL[0] * SCALE
    sprite_h = CELL[1] * SCALE
    row_h = label_h + sprite_h
    width = margin * 2 + column_w * 4
    height = margin * 2 + 48 + row_h * len(all_cells)
    contact = Image.new("RGB", (width, height), (17, 17, 22))
    draw = ImageDraw.Draw(contact)
    title_font = load_font(22)
    label_font = load_font(16)
    draw.text((margin, 12), "SPECIAL THRESHOLDS / 32x64 CELLS / REVIEW ONLY", fill=(216, 208, 193), font=title_font)
    top = margin + 46
    for column, name in enumerate(NAMES):
        draw.text((margin + column * column_w + 8, top), name.upper(), fill=(170, 162, 151), font=label_font)
    top += 28
    for style_index, (label, cells) in enumerate(all_cells):
        y = top + style_index * row_h
        draw.rectangle((margin, y, width - margin - 1, y + row_h - 5), fill=(27, 26, 32), outline=(62, 58, 61))
        draw.text((margin + 8, y + 8), label, fill=(198, 164, 74), font=label_font)
        for column, sprite in enumerate(cells):
            enlarged = sprite.resize((column_w, sprite_h), Image.Resampling.NEAREST)
            contact.paste(enlarged.convert("RGB"), (margin + column * column_w, y + label_h), enlarged.getchannel("A"))
    return contact


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    processed = []
    manifest = {"review_only": True, "runtime_integration": False, "cell": list(CELL), "styles": {}}
    for stem, label in STYLES:
        cells = process_board(SOURCE_DIR / f"{stem}.png")
        processed.append((label, cells))
        atlas_path = OUTPUT_DIR / f"{stem}-atlas-32x64.png"
        make_atlas(cells).save(atlas_path, optimize=True)
        style_dir = OUTPUT_DIR / stem
        style_dir.mkdir(exist_ok=True)
        bounds = {}
        for name, sprite in zip(NAMES, cells):
            sprite.save(style_dir / f"{name}-32x64.png", optimize=True)
            bounds[name] = sprite.getchannel("A").getbbox()
        manifest["styles"][stem] = {"label": label, "atlas": atlas_path.name, "bounds": bounds}
    contact_path = OUTPUT_DIR / "special-threshold-style-gate-contact-8x.png"
    make_contact(processed).save(contact_path, optimize=True)
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")
    print(contact_path)


if __name__ == "__main__":
    main()
