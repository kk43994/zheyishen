#!/usr/bin/env python3
"""Process the three Image2 plinth style boards into review-only pixel atlases."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "output/imagegen/zhe-yi-shen-plinth-style-gate-v1/raw"
OUTPUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-plinth-style-gate-v1/processed"
STYLES = (
    ("01-lived-furniture", "1  LIVED FURNITURE"),
    ("02-archive-machinery", "2  ARCHIVE MACHINERY"),
    ("03-last-line-station", "3  LAST-LINE STATION"),
)
NAMES = ("reward", "shop", "light-room", "inner-room")
CELL = (48, 32)
SAFE = (44, 28)
SCALE = 8
PALETTE = (
    (17, 17, 22),
    (27, 26, 32),
    (23, 21, 26),
    (62, 58, 61),
    (216, 208, 193),
    (232, 225, 211),
    (170, 162, 151),
    (120, 111, 105),
    (159, 53, 72),
    (100, 34, 49),
    (198, 164, 74),
    (113, 129, 138),
    (56, 67, 74),
    (47, 38, 34),
    (80, 63, 50),
    (119, 91, 61),
    (153, 123, 82),
)


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = (
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    )
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def chroma_key(image: Image.Image) -> Image.Image:
    result = Image.new("RGBA", image.size, (0, 0, 0, 0))
    output = []
    for red, green, blue, _ in image.convert("RGBA").getdata():
        green_screen = green > 72 and green > red * 1.20 and green > blue * 1.16
        output.append((0, 0, 0, 0) if green_screen else (red, green, blue, 255))
    result.putdata(output)
    return result


def map_palette(image: Image.Image) -> Image.Image:
    mapped = Image.new("RGBA", image.size, (0, 0, 0, 0))
    pixels = []
    for red, green, blue, alpha in image.getdata():
        if alpha < 128:
            pixels.append((0, 0, 0, 0))
            continue
        color = min(
            PALETTE,
            key=lambda item: (red - item[0]) ** 2 + (green - item[1]) ** 2 + (blue - item[2]) ** 2,
        )
        pixels.append((*color, 255))
    mapped.putdata(pixels)
    return mapped


def add_outline(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    expanded = alpha.filter(ImageFilter.MaxFilter(3))
    rim = ImageChops.subtract(expanded, alpha)
    outlined = Image.new("RGBA", image.size, (23, 21, 26, 0))
    outlined.putalpha(rim)
    outlined.alpha_composite(image)
    return outlined


def process_cell(source: Image.Image) -> Image.Image:
    keyed = chroma_key(source)
    bbox = keyed.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty cell after chroma key")
    crop = keyed.crop(bbox)
    ratio = min(SAFE[0] / crop.width, SAFE[1] / crop.height)
    size = (max(1, round(crop.width * ratio)), max(1, round(crop.height * ratio)))
    reduced = crop.resize(size, Image.Resampling.LANCZOS)
    reduced = map_palette(reduced)
    target = Image.new("RGBA", CELL, (0, 0, 0, 0))
    target.alpha_composite(reduced, ((CELL[0] - reduced.width) // 2, CELL[1] - 2 - reduced.height))
    target = add_outline(target)
    clean = []
    for red, green, blue, alpha in target.getdata():
        clean.append((red, green, blue, alpha) if alpha else (0, 0, 0, 0))
    target.putdata(clean)
    return target


def process_board(path: Path) -> list[Image.Image]:
    board = Image.open(path).convert("RGBA")
    board = board.resize((1024, 1024), Image.Resampling.NEAREST)
    cells = []
    for row in range(2):
        for column in range(2):
            crop = board.crop((column * 512, row * 512, (column + 1) * 512, (row + 1) * 512))
            cells.append(process_cell(crop))
    return cells


def make_atlas(cells: list[Image.Image]) -> Image.Image:
    atlas = Image.new("RGBA", (CELL[0] * len(cells), CELL[1]), (0, 0, 0, 0))
    for index, sprite in enumerate(cells):
        atlas.alpha_composite(sprite, (index * CELL[0], 0))
    return atlas


def make_contact(all_cells: list[tuple[str, list[Image.Image]]]) -> Image.Image:
    margin = 24
    label_h = 42
    column_w = CELL[0] * SCALE
    row_h = label_h + CELL[1] * SCALE
    width = margin * 2 + column_w * 4
    height = margin * 2 + row_h * len(all_cells) + 48
    contact = Image.new("RGB", (width, height), (17, 17, 22))
    draw = ImageDraw.Draw(contact)
    title_font = load_font(22)
    label_font = load_font(16)
    draw.text((margin, 12), "PLINTH STYLE GATE / 48x32 LOGICAL PIXELS / REVIEW ONLY", fill=(216, 208, 193), font=title_font)
    top = margin + 46
    for column, name in enumerate(NAMES):
        draw.text((margin + column * column_w + 10, top), name.upper(), fill=(170, 162, 151), font=label_font)
    top += 28
    for style_index, (label, cells) in enumerate(all_cells):
        y = top + style_index * row_h
        draw.rectangle((margin, y, width - margin - 1, y + row_h - 5), fill=(27, 26, 32), outline=(62, 58, 61))
        draw.text((margin + 10, y + 8), label, fill=(198, 164, 74), font=label_font)
        sprite_y = y + label_h
        for column, sprite in enumerate(cells):
            enlarged = sprite.resize((column_w, CELL[1] * SCALE), Image.Resampling.NEAREST)
            contact.paste(enlarged.convert("RGB"), (margin + column * column_w, sprite_y), enlarged.getchannel("A"))
    return contact


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    processed: list[tuple[str, list[Image.Image]]] = []
    manifest = {"review_only": True, "runtime_integration": False, "logical_cell": list(CELL), "styles": {}}
    for stem, label in STYLES:
        source = SOURCE_DIR / f"{stem}.png"
        if not source.exists():
            raise FileNotFoundError(source)
        cells = process_board(source)
        processed.append((label, cells))
        atlas_path = OUTPUT_DIR / f"{stem}-atlas-48x32.png"
        make_atlas(cells).save(atlas_path, optimize=True)
        style_dir = OUTPUT_DIR / stem
        style_dir.mkdir(exist_ok=True)
        bounds = {}
        for name, sprite in zip(NAMES, cells):
            sprite.save(style_dir / f"{name}-48x32.png", optimize=True)
            bounds[name] = sprite.getchannel("A").getbbox()
        manifest["styles"][stem] = {"label": label, "atlas": atlas_path.name, "bounds": bounds}
    contact_path = OUTPUT_DIR / "plinth-style-gate-contact-8x.png"
    make_contact(processed).save(contact_path, optimize=True)
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")
    print(contact_path)


if __name__ == "__main__":
    main()
