#!/usr/bin/env python3
"""Compose review-only room mockups from processed special-room candidates."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance

from process_plinth_style_gate import load_font


ROOT = Path(__file__).resolve().parents[1]
PLINTH_DIR = ROOT / "output/imagegen/zhe-yi-shen-plinth-style-gate-v1/processed"
THRESHOLD_DIR = ROOT / "output/imagegen/zhe-yi-shen-special-threshold-style-gate-v1/processed"
OUTPUT = THRESHOLD_DIR / "special-room-composite-preview-4x.png"
STYLES = (
    ("01-lived-furniture", "1  LIVED FURNITURE"),
    ("02-archive-machinery", "2  ARCHIVE MACHINERY"),
    ("03-last-line-station", "3  LAST-LINE STATION"),
)
LOGICAL = (180, 120)
SCALE = 4


def crop_cell(atlas: Image.Image, index: int, size: tuple[int, int]) -> Image.Image:
    return atlas.crop((index * size[0], 0, (index + 1) * size[0], size[1]))


def tile_ground() -> Image.Image:
    tile = Image.open(ROOT / "src/assets/world/ground-2.png").convert("RGB")
    tile = ImageEnhance.Brightness(tile).enhance(0.66)
    result = Image.new("RGB", LOGICAL, (17, 17, 22))
    for y in range(0, LOGICAL[1], tile.height):
        for x in range(0, LOGICAL[0], tile.width):
            result.paste(tile, (x, y))
    return result.convert("RGBA")


def paste(room: Image.Image, sprite: Image.Image, x: int, y: int) -> None:
    room.alpha_composite(sprite, (x, y))


def build_room(stem: str, kind: str) -> Image.Image:
    room = tile_ground()
    plinths = Image.open(PLINTH_DIR / f"{stem}-atlas-48x32.png").convert("RGBA")
    thresholds = Image.open(THRESHOLD_DIR / f"{stem}-atlas-32x64.png").convert("RGBA")
    hero = Image.open(ROOT / "src/assets/hero-style1-profiles/hero-idle.png").convert("RGBA").crop((0, 0, 40, 56))
    items = Image.open(ROOT / "src/assets/items/icons.png").convert("RGBA")
    item_index = 13
    item = items.crop(((item_index % 8) * 36, (item_index // 8) * 36, (item_index % 8 + 1) * 36, (item_index // 8 + 1) * 36))
    item = item.resize((18, 18), Image.Resampling.NEAREST)

    if kind == "light":
        door = crop_cell(thresholds, 1, (32, 64))
        beam = crop_cell(thresholds, 3, (32, 64))
        plinth = crop_cell(plinths, 2, (48, 32))
        paste(room, door, 114, 10)
        paste(room, beam, 74, 30)
        paste(room, plinth, 66, 82)
        paste(room, item, 81, 68)
    else:
        door = crop_cell(thresholds, 2, (32, 64))
        merchant = crop_cell(thresholds, 0, (32, 64))
        plinth = crop_cell(plinths, 3, (48, 32))
        paste(room, door, 114, 10)
        paste(room, merchant, 140, 50)
        paste(room, plinth, 66, 82)
        paste(room, item, 81, 68)
    paste(room, hero, 18, 60)
    return room


def main() -> None:
    margin = 20
    header = 54
    row_label = 34
    panel_w = LOGICAL[0] * SCALE
    panel_h = LOGICAL[1] * SCALE
    width = margin * 2 + panel_w * 2
    height = margin * 2 + header + (row_label + panel_h) * len(STYLES)
    contact = Image.new("RGB", (width, height), (17, 17, 22))
    draw = ImageDraw.Draw(contact)
    title_font = load_font(22)
    label_font = load_font(17)
    draw.text((margin, 14), "SPECIAL ROOM COMPOSITE / REAL SPRITE SCALE / REVIEW ONLY", fill=(216, 208, 193), font=title_font)
    draw.text((margin + 8, header), "LIGHT / REWARD", fill=(170, 162, 151), font=label_font)
    draw.text((margin + panel_w + 8, header), "INNER / TEMPTATION", fill=(170, 162, 151), font=label_font)
    top = header + 28
    for index, (stem, label) in enumerate(STYLES):
        y = top + index * (row_label + panel_h)
        draw.text((margin + 8, y + 6), label, fill=(198, 164, 74), font=label_font)
        light = build_room(stem, "light").resize((panel_w, panel_h), Image.Resampling.NEAREST).convert("RGB")
        inner = build_room(stem, "inner").resize((panel_w, panel_h), Image.Resampling.NEAREST).convert("RGB")
        contact.paste(light, (margin, y + row_label))
        contact.paste(inner, (margin + panel_w, y + row_label))
        draw.rectangle((margin, y + row_label, margin + panel_w - 1, y + row_label + panel_h - 1), outline=(62, 58, 61))
        draw.rectangle((margin + panel_w, y + row_label, margin + panel_w * 2 - 1, y + row_label + panel_h - 1), outline=(62, 58, 61))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    contact.save(OUTPUT, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
