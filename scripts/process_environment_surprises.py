#!/usr/bin/env python3
"""Convert the six-stage Image2 surprise board into review-only runtime-scale sprites."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance

from process_plinth_style_gate import add_outline, chroma_key, load_font, map_palette


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output/imagegen/zhe-yi-shen-environment-surprises-reference-v1/raw/six-stage-environment-surprises.png"
OUTPUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-environment-surprises-reference-v1/processed"
CELL = (96, 48)
SAFE = (90, 42)
NAMES = (
    "childhood-bed-eyes",
    "school-correction-strike",
    "youth-last-train",
    "adult-unanswered-table",
    "middle-empty-office-chair",
    "old-wheelchair-lamp",
)
LABELS = (
    "CHILDHOOD / EYES UNDER BED",
    "SCHOOL / CORRECTION STRIKE",
    "YOUTH / LAST TRAIN",
    "ADULT / UNANSWERED TABLE",
    "MIDDLE / EMPTY OFFICE CHAIR",
    "OLD / WHEELCHAIR UNDER LAMP",
)


def clean_transparent(image: Image.Image) -> Image.Image:
    pixels = []
    for red, green, blue, alpha in image.getdata():
        pixels.append((red, green, blue, alpha) if alpha else (0, 0, 0, 0))
    image.putdata(pixels)
    return image


def process_cell(source: Image.Image) -> Image.Image:
    keyed = chroma_key(source)
    bbox = keyed.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty environment-surprise cell after chroma key")
    crop = keyed.crop(bbox)
    ratio = min(SAFE[0] / crop.width, SAFE[1] / crop.height)
    size = (max(1, round(crop.width * ratio)), max(1, round(crop.height * ratio)))
    reduced = crop.resize(size, Image.Resampling.LANCZOS)
    reduced = map_palette(reduced)
    target = Image.new("RGBA", CELL, (0, 0, 0, 0))
    target.alpha_composite(reduced, ((CELL[0] - reduced.width) // 2, CELL[1] - 2 - reduced.height))
    return clean_transparent(add_outline(target))


def remove_duplicate_childhood_eyes(sprite: Image.Image) -> Image.Image:
    """The source produced two pairs; preserve only the centered right-hand pair."""
    result = sprite.copy()
    draw = ImageDraw.Draw(result)
    draw.rectangle((33, 36, 42, 41), fill=(17, 17, 22, 255))
    return result


def cells_from_board() -> list[Image.Image]:
    board = Image.open(SOURCE).convert("RGBA").resize((1024, 1536), Image.Resampling.NEAREST)
    cells = []
    for row in range(3):
        for column in range(2):
            crop = board.crop((column * 512, row * 512, (column + 1) * 512, (row + 1) * 512))
            sprite = process_cell(crop)
            if row == 0 and column == 0:
                sprite = remove_duplicate_childhood_eyes(sprite)
            cells.append(sprite)
    return cells


def make_atlas(cells: list[Image.Image]) -> Image.Image:
    atlas = Image.new("RGBA", (CELL[0] * 6, CELL[1]), (0, 0, 0, 0))
    for index, sprite in enumerate(cells):
        atlas.alpha_composite(sprite, (index * CELL[0], 0))
    return atlas


def make_contact(cells: list[Image.Image]) -> Image.Image:
    scale = 5
    margin = 20
    label_h = 36
    panel_w = CELL[0] * scale
    panel_h = CELL[1] * scale
    width = margin * 2 + panel_w * 2
    height = 54 + (label_h + panel_h) * 3 + margin
    result = Image.new("RGB", (width, height), (17, 17, 22))
    draw = ImageDraw.Draw(result)
    draw.text((margin, 12), "SIX-STAGE ENVIRONMENT SURPRISES / 96x48 / REVIEW ONLY", fill=(216, 208, 193), font=load_font(21))
    for index, (label, sprite) in enumerate(zip(LABELS, cells)):
        row, column = divmod(index, 2)
        x = margin + column * panel_w
        y = 54 + row * (label_h + panel_h)
        draw.rectangle((x, y, x + panel_w - 1, y + label_h + panel_h - 1), fill=(27, 26, 32), outline=(62, 58, 61))
        draw.text((x + 8, y + 9), label, fill=(198, 164, 74), font=load_font(14))
        enlarged = sprite.resize((panel_w, panel_h), Image.Resampling.NEAREST)
        result.paste(enlarged.convert("RGB"), (x, y + label_h), enlarged.getchannel("A"))
    return result


def ground_panel(stage: int) -> Image.Image:
    logical = (180, 104)
    tile = Image.open(ROOT / f"src/assets/world/ground-{stage}.png").convert("RGB")
    tile = ImageEnhance.Brightness(tile).enhance(0.68)
    panel = Image.new("RGB", logical, (17, 17, 22))
    for y in range(0, logical[1], tile.height):
        for x in range(0, logical[0], tile.width):
            panel.paste(tile, (x, y))
    return panel.convert("RGBA")


def make_scene_preview(cells: list[Image.Image]) -> Image.Image:
    logical = (180, 104)
    scale = 3
    margin = 18
    label_h = 28
    panel_w = logical[0] * scale
    panel_h = logical[1] * scale
    width = margin * 2 + panel_w * 3
    height = 52 + (label_h + panel_h) * 2 + margin
    result = Image.new("RGB", (width, height), (17, 17, 22))
    draw = ImageDraw.Draw(result)
    draw.text((margin, 12), "ENVIRONMENT SURPRISES / REAL HERO AND GROUND SCALE", fill=(216, 208, 193), font=load_font(21))
    hero_atlas = Image.open(ROOT / "src/assets/hero-style1-profiles/hero-idle.png").convert("RGBA")
    hero_top = 20 * 56
    hero = hero_atlas.crop((0, hero_top, 40, hero_top + 56))
    short_labels = ("CHILDHOOD", "SCHOOL", "YOUTH", "ADULT", "MIDDLE", "OLD")
    for index, (label, sprite) in enumerate(zip(short_labels, cells)):
        row, column = divmod(index, 3)
        x = margin + column * panel_w
        y = 52 + row * (label_h + panel_h)
        draw.text((x + 8, y + 7), label, fill=(198, 164, 74), font=load_font(14))
        panel = ground_panel(index)
        panel.alpha_composite(sprite, (73, 20))
        panel.alpha_composite(hero, (18, 45))
        enlarged = panel.resize((panel_w, panel_h), Image.Resampling.NEAREST).convert("RGB")
        result.paste(enlarged, (x, y + label_h))
        draw.rectangle((x, y + label_h, x + panel_w - 1, y + label_h + panel_h - 1), outline=(62, 58, 61))
    return result


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cells = cells_from_board()
    for name, sprite in zip(NAMES, cells):
        sprite.save(OUTPUT_DIR / f"{name}-96x48.png", optimize=True)
    atlas_path = OUTPUT_DIR / "environment-surprises-six-stage-atlas-96x48.png"
    contact_path = OUTPUT_DIR / "environment-surprises-contact-5x.png"
    scene_path = OUTPUT_DIR / "environment-surprises-scene-preview-3x.png"
    make_atlas(cells).save(atlas_path, optimize=True)
    make_contact(cells).save(contact_path, optimize=True)
    make_scene_preview(cells).save(scene_path, optimize=True)
    manifest = {
        "review_only": True,
        "runtime_integration": False,
        "cell": list(CELL),
        "order": list(NAMES),
        "atlas": atlas_path.name,
        "contact": contact_path.name,
        "scene_preview": scene_path.name,
        "bounds": {name: sprite.getchannel("A").getbbox() for name, sprite in zip(NAMES, cells)},
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")
    print(contact_path)
    print(scene_path)


if __name__ == "__main__":
    main()
