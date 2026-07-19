#!/usr/bin/env python3
"""Render static approval sheets for the locked style-1 hero."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


FRAME_W = 40
FRAME_H = 56
DIRECTIONS = ("front", "back", "left", "right")
STATURES = ("short", "average", "tall")
BUILDS = ("slim", "average", "sturdy", "soft")
PROFILES = tuple((stature, build) for stature in STATURES for build in BUILDS)

SOURCE_DIR = Path("output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1")
ATLAS_PATH = Path("src/assets/hero-style1-profiles/hero-idle.png")
OUTPUT_DIR = Path("output/art-review-static")

PAGE = (18, 17, 23)
PANEL = (43, 38, 48)
PANEL_ALT = (38, 34, 43)
GRID = (70, 62, 73)
TEXT = (218, 209, 192)
ACCENT = (198, 172, 101)


def place_sprite(
    canvas: Image.Image,
    sprite: Image.Image,
    box: tuple[int, int, int, int],
    scale: int,
) -> None:
    left, top, width, height = box
    scaled = sprite.resize((FRAME_W * scale, FRAME_H * scale), Image.Resampling.NEAREST)
    x = left + (width - scaled.width) // 2
    y = top + (height - scaled.height) // 2
    canvas.paste(scaled, (x, y), scaled)


def render_mother_sheet() -> None:
    scale = 7
    label_height = 26
    cell_width = FRAME_W * scale + 24
    cell_height = FRAME_H * scale + 20
    canvas = Image.new("RGB", (cell_width * 4, label_height + cell_height), PAGE)
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(DIRECTIONS):
        left = column * cell_width
        draw.rectangle((left, label_height, left + cell_width - 1, canvas.height - 1), fill=PANEL)
        draw.text((left + 10, 8), direction.upper(), fill=TEXT)
        sprite = Image.open(SOURCE_DIR / f"{direction}.png").convert("RGBA")
        place_sprite(canvas, sprite, (left, label_height, cell_width, cell_height), scale)
        if column:
            draw.line((left, 0, left, canvas.height), fill=GRID)
    canvas.save(OUTPUT_DIR / "01-hero-mother-4dir.png", optimize=True)


def render_profile_sheet() -> None:
    scale = 3
    label_width = 128
    header_height = 28
    cell_width = FRAME_W * scale + 18
    cell_height = FRAME_H * scale + 12
    canvas = Image.new(
        "RGB",
        (label_width + cell_width * 4, header_height + cell_height * len(PROFILES)),
        PAGE,
    )
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((label_width + column * cell_width + 8, 8), direction.upper(), fill=TEXT)

    atlas = Image.open(ATLAS_PATH).convert("RGBA")
    for profile_index, (stature, build) in enumerate(PROFILES):
        top = header_height + profile_index * cell_height
        background = PANEL if profile_index % 2 == 0 else PANEL_ALT
        draw.rectangle((0, top, canvas.width - 1, top + cell_height - 1), fill=background)
        draw.text((8, top + 10), f"{stature}-{build}".upper(), fill=ACCENT)
        for direction_index, _direction in enumerate(DIRECTIONS):
            source_y = (profile_index * len(DIRECTIONS) + direction_index) * FRAME_H
            sprite = atlas.crop((0, source_y, FRAME_W, source_y + FRAME_H))
            left = label_width + direction_index * cell_width
            place_sprite(canvas, sprite, (left, top, cell_width, cell_height), scale)
            if direction_index:
                draw.line((left, top, left, top + cell_height - 1), fill=GRID)
        draw.line((0, top + cell_height - 1, canvas.width, top + cell_height - 1), fill=GRID)
    canvas.save(OUTPUT_DIR / "02-hero-profiles-12x4.png", optimize=True)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    render_mother_sheet()
    render_profile_sheet()
    print(f"wrote static hero review sheets to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
