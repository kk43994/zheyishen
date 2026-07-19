#!/usr/bin/env python3
"""Re-slice the approved A/C item style without cutting wide silhouettes."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


SOURCE = Path("output/imagegen/zhe-yi-shen-art-resources-ac-v1/source/01-item-icons-ac.png")
OUTPUT_DIR = Path("output/art-review-static/full-art-v1/items/ac-style-fixed")
SPRITE_DIR = OUTPUT_DIR / "sprites"
GRID = 4
SOURCE_SHEET = 1024
SOURCE_CELL = SOURCE_SHEET // GRID
LOGICAL = 64
PIXEL_SCALE = 4
MAX_SPRITE = 50
MIN_PADDING = (LOGICAL - MAX_SPRITE) // 2
NAMES = (
    "loose-button", "wooden-sword", "red-workbook", "stone-schoolbag",
    "bleach-powder", "eyebrow-razor", "od-pill", "front-desk-letter",
    "cracked-glasses", "small-uniform", "only-key", "first-salary",
    "nameless-tie", "fathers-raincoat", "broken-spine", "baby-tooth",
)


def chroma_key(image: Image.Image) -> Image.Image:
    result = Image.new("RGBA", image.size, (0, 0, 0, 0))
    keyed = []
    for red, green, blue, alpha in image.convert("RGBA").getdata():
        is_green = alpha > 0 and green > 72 and green > red * 1.34 and green > blue * 1.20
        keyed.append((red, green, blue, 0 if is_green else 255 if alpha > 20 else 0))
    result.putdata(keyed)
    return result


def quantize_opaque(image: Image.Image, colors: int = 14) -> Image.Image:
    rgba = list(image.getdata())
    opaque = [(red, green, blue) for red, green, blue, alpha in rgba if alpha]
    if not opaque:
        raise AssertionError("empty icon")
    samples = Image.new("RGB", (len(opaque), 1))
    samples.putdata(opaque)
    indexed = samples.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    palette = list(dict.fromkeys(indexed.getdata()))
    output = Image.new("RGBA", image.size, (0, 0, 0, 0))
    output.putdata([
        (*min(palette, key=lambda color: (
            (red - color[0]) ** 2 + (green - color[1]) ** 2 + (blue - color[2]) ** 2
        )), 255)
        if alpha else (0, 0, 0, 0)
        for red, green, blue, alpha in rgba
    ])
    return output


def keep_primary_component(image: Image.Image) -> Image.Image:
    """Drop model-added floor shadows and isolated chroma-key crumbs."""
    alpha = image.getchannel("A")
    remaining = {
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if alpha.getpixel((x, y))
    }
    components: list[set[tuple[int, int]]] = []
    while remaining:
        seed = remaining.pop()
        component = {seed}
        queue = deque((seed,))
        while queue:
            x, y = queue.popleft()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    neighbor = (x + dx, y + dy)
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        component.add(neighbor)
                        queue.append(neighbor)
        components.append(component)
    primary = max(components, key=len)
    output = Image.new("RGBA", image.size, (0, 0, 0, 0))
    source_pixels = image.load()
    output_pixels = output.load()
    for x, y in primary:
        output_pixels[x, y] = source_pixels[x, y]
    return output


def fit_complete_sprite(cell: Image.Image) -> Image.Image:
    logical = cell.resize((LOGICAL, LOGICAL), Image.Resampling.NEAREST)
    logical = chroma_key(logical)
    logical = keep_primary_component(logical)
    bbox = logical.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError("empty cell after keying")
    crop = logical.crop(bbox)
    ratio = min(MAX_SPRITE / crop.width, MAX_SPRITE / crop.height, 1.0)
    width = max(1, round(crop.width * ratio))
    height = max(1, round(crop.height * ratio))
    crop = crop.resize((width, height), Image.Resampling.NEAREST)
    crop = quantize_opaque(crop)
    output = Image.new("RGBA", (LOGICAL, LOGICAL), (0, 0, 0, 0))
    output.alpha_composite(crop, ((LOGICAL - width) // 2, (LOGICAL - height) // 2))
    return output


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SPRITE_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA").resize(
        (SOURCE_SHEET, SOURCE_SHEET), Image.Resampling.NEAREST
    )
    sprites: list[Image.Image] = []
    manifest = []
    for index, name in enumerate(NAMES):
        row, column = divmod(index, GRID)
        left = column * SOURCE_CELL
        top = row * SOURCE_CELL
        # Keep the entire generated cell. The previous 48..208 safe window is
        # deliberately gone because it amputated straps, spills, cords, and rubble.
        cell = source.crop((left, top, left + SOURCE_CELL, top + SOURCE_CELL))
        sprite = fit_complete_sprite(cell)
        bbox = sprite.getchannel("A").getbbox()
        if bbox is None:
            raise AssertionError(name)
        padding = {
            "left": bbox[0],
            "top": bbox[1],
            "right": LOGICAL - bbox[2],
            "bottom": LOGICAL - bbox[3],
        }
        if min(padding.values()) < MIN_PADDING:
            raise AssertionError(f"unsafe padding {name}: {padding}")
        if any(alpha not in {0, 255} for *_, alpha in sprite.getdata()):
            raise AssertionError(f"partial alpha: {name}")
        sprite.save(SPRITE_DIR / f"{name}.png", optimize=True)
        sprites.append(sprite)
        manifest.append({
            "index": index,
            "id": name,
            "logical_size": [LOGICAL, LOGICAL],
            "bbox": list(bbox),
            "padding": padding,
            "opaque_pixels": sum(pixel[3] > 0 for pixel in sprite.getdata()),
            "palette_colors": len({pixel for pixel in sprite.getdata() if pixel[3]}),
        })

    atlas = Image.new("RGBA", (LOGICAL * GRID, LOGICAL * GRID), (0, 0, 0, 0))
    for index, sprite in enumerate(sprites):
        row, column = divmod(index, GRID)
        atlas.alpha_composite(sprite, (column * LOGICAL, row * LOGICAL))
    atlas.save(OUTPUT_DIR / "item-icons-ac-fixed-64.png", optimize=True)

    scale = 4
    preview = Image.new(
        "RGBA",
        (LOGICAL * GRID * scale, LOGICAL * GRID * scale),
        (19, 18, 24, 255),
    )
    preview.alpha_composite(atlas.resize(preview.size, Image.Resampling.NEAREST))
    draw = ImageDraw.Draw(preview)
    cell = LOGICAL * scale
    for offset in range(cell, preview.width, cell):
        draw.line((offset, 0, offset, preview.height), fill=(62, 52, 64, 255))
        draw.line((0, offset, preview.width, offset), fill=(62, 52, 64, 255))
    preview.convert("RGB").save(OUTPUT_DIR / "item-icons-ac-fixed-preview.png", optimize=True)
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps({
            "source": str(SOURCE),
            "logical_cell": LOGICAL,
            "pixel_scale": PIXEL_SCALE,
            "max_sprite": MAX_SPRITE,
            "minimum_padding": MIN_PADDING,
            "item_count": len(sprites),
            "sprites": manifest,
        }, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    print(f"wrote {len(sprites)} complete A/C sprites to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
