#!/usr/bin/env python3
"""Publish the Image2 small-uniform design as the canonical item icon."""

from __future__ import annotations

from collections import deque
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


SOURCE = Path(
    "output/imagegen/zhe-yi-shen-uniform-image2-v1/raw/small-uniform-anatomy-source.png"
)
ATLAS_PATH = Path("src/assets/items/icons.png")
MANIFEST_PATH = Path("src/assets/items/icons.json")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-uniform-image2-v1/processed")
ITEM_ID = "small-uniform"
PANEL = (31, 29, 36, 255)
GRID = (66, 61, 71, 255)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def chroma_key(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, _ = pixels[x, y]
            if green >= 105 and green >= red * 1.7 and green >= blue * 1.7:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (red, green, blue, 255)
    return result


def keep_largest_component(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(image.height):
        for x in range(image.width):
            if not pixels[x, y] or (x, y) in visited:
                continue
            queue = deque([(x, y)])
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for neighbour in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    neighbour_x, neighbour_y = neighbour
                    if (
                        0 <= neighbour_x < image.width
                        and 0 <= neighbour_y < image.height
                        and pixels[neighbour_x, neighbour_y]
                        and neighbour not in visited
                    ):
                        visited.add(neighbour)
                        queue.append(neighbour)
            components.append(component)
    if not components:
        raise AssertionError("Image2 uniform crop has no foreground components")
    keep = set(max(components, key=len))
    result = image.copy()
    result_pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            if (x, y) not in keep:
                result_pixels[x, y] = (0, 0, 0, 0)
    return result


def fit_icon(source: Image.Image, cell: int) -> Image.Image:
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError("Image2 uniform crop is empty")
    sprite = source.crop(bbox)
    scale = min(30 / sprite.width, 30 / sprite.height)
    size = (
        max(1, round(sprite.width * scale)),
        max(1, round(sprite.height * scale)),
    )
    sprite = sprite.resize(size, Image.Resampling.NEAREST)
    alpha = sprite.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    rgb = sprite.convert("RGB").quantize(colors=10, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")
    rgb.putalpha(alpha)
    icon = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    icon.alpha_composite(sprite if len(set(sprite.getdata())) <= 12 else rgb, (
        (cell - sprite.width) // 2,
        cell - sprite.height - 2,
    ))
    return icon


def comparison(before: Image.Image, after: Image.Image) -> Image.Image:
    scale = 6
    cell = before.width
    label_h = 22
    canvas = Image.new("RGBA", (cell * scale * 2, label_h + cell * scale), PANEL)
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 6), "BEFORE", fill=(178, 166, 151, 255))
    draw.text((cell * scale + 8, 6), "IMAGE2", fill=(178, 166, 151, 255))
    draw.line((cell * scale, 0, cell * scale, canvas.height), fill=GRID)
    canvas.alpha_composite(before.resize((cell * scale, cell * scale), Image.Resampling.NEAREST), (0, label_h))
    canvas.alpha_composite(after.resize((cell * scale, cell * scale), Image.Resampling.NEAREST), (cell * scale, label_h))
    return canvas


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    cell = int(manifest["cell"])
    cols = int(manifest["cols"])
    index = int(manifest["index"][ITEM_ID])
    atlas = Image.open(ATLAS_PATH).convert("RGBA")
    left = (index % cols) * cell
    top = (index // cols) * cell
    before = atlas.crop((left, top, left + cell, top + cell))

    source = Image.open(SOURCE).convert("RGBA")
    design_crop = source.crop((
        round(source.width * 0.13),
        round(source.height * 0.12),
        round(source.width * 0.39),
        round(source.height * 0.39),
    ))
    icon = fit_icon(keep_largest_component(chroma_key(design_crop)), cell)
    atlas.paste((0, 0, 0, 0), (left, top, left + cell, top + cell))
    atlas.alpha_composite(icon, (left, top))
    atlas.save(ATLAS_PATH, optimize=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    icon.save(OUTPUT_DIR / "small-uniform-icon-36.png", optimize=True)
    comparison(before, icon).save(OUTPUT_DIR / "small-uniform-icon-before-after.png", optimize=True)
    record = {
        "item": ITEM_ID,
        "model": "gpt-image-2",
        "mode": "edit with canonical style, hero, torso-part, and arm-part references",
        "source": str(SOURCE),
        "source_sha256": sha256(SOURCE),
        "atlas": str(ATLAS_PATH),
        "atlas_index": index,
        "cell": cell,
        "processed_icon": "small-uniform-icon-36.png",
        "fit": "front jacket design, chroma keyed, nearest-neighbor downscale, 10-color maximum",
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(record, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"published {ITEM_ID} Image2 icon to atlas cell {index}")


if __name__ == "__main__":
    main()
