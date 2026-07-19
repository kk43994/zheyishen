#!/usr/bin/env python3
"""Turn Image2 chroma-key boards into deterministic, slice-safe pixel atlases."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


GRID = 4
CELL = 256
PIXEL_SCALE = 4
LOGICAL_CELL = CELL // PIXEL_SCALE

NAMES = {
    "item": [
        "loose-button", "wooden-sword", "red-workbook", "stone-schoolbag",
        "bleach-powder", "eyebrow-razor", "od-pill", "front-desk-letter",
        "cracked-glasses", "small-uniform", "only-key", "first-salary",
        "nameless-tie", "fathers-raincoat", "broken-spine", "baby-tooth",
    ],
    "hero": [
        "age-child", "age-school", "age-youth", "age-adult",
        "age-middle", "age-late", "base-body", "base-presentation",
        "overlay-schoolbag", "overlay-raincoat", "overlay-broken-spine", "overlay-bleach-hair",
        "overlay-cracked-glasses", "overlay-razor-scars", "overlay-love-letter", "overlay-empty-frame",
    ],
    "enemy": [
        "fear-idle", "fear-attack", "red-mark-idle", "red-mark-attack",
        "whisper-idle", "whisper-attack", "clockwork-idle", "clockwork-attack",
        "debt-idle", "debt-attack", "one-answer-idle", "one-answer-attack",
        "silent-father-closed", "silent-father-open", "lamp-keeper-closed", "lamp-keeper-open",
    ],
    "pedestal": [
        "reward-base", "shop-base", "light-room-base", "back-room-base",
        "reward-composite", "shop-composite", "light-room-composite", "back-room-composite",
        "hover-0", "hover-1", "hover-2", "hover-3",
        "pickup-0", "pickup-1", "pickup-2", "pickup-3",
    ],
}


def chroma_key(image: Image.Image) -> Image.Image:
    pixels = []
    for red, green, blue, alpha in image.getdata():
        keyed = alpha > 0 and green > 64 and green > red * 1.35 and green > blue * 1.22
        pixels.append((red, green, blue, 0 if keyed else alpha))
    image.putdata(pixels)
    return image


def quantize_rgba(image: Image.Image, colors: int) -> Image.Image:
    rgba = list(image.convert("RGBA").getdata())
    opaque = [(red, green, blue) for red, green, blue, alpha in rgba if alpha > 20]
    if not opaque:
        return Image.new("RGBA", image.size, (0, 0, 0, 0))
    samples = Image.new("RGB", (len(opaque), 1))
    samples.putdata(opaque)
    indexed = samples.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    palette = list(dict.fromkeys(indexed.getdata()))
    quantized = Image.new("RGBA", image.size, (0, 0, 0, 0))
    quantized.putdata([
        (*min(palette, key=lambda color: (
            (red - color[0]) ** 2 + (green - color[1]) ** 2 + (blue - color[2]) ** 2
        )), 255) if alpha > 20 else (0, 0, 0, 0)
        for red, green, blue, alpha in rgba
    ])
    return quantized


def logical_cell(cell: Image.Image, colors: int, safe_box: tuple[int, int, int, int]) -> Image.Image:
    logical = cell.resize((LOGICAL_CELL, LOGICAL_CELL), Image.Resampling.NEAREST)
    logical = quantize_rgba(logical, colors)
    left, top, right, bottom = (value // PIXEL_SCALE for value in safe_box)
    clipped = Image.new("RGBA", logical.size, (0, 0, 0, 0))
    clipped.alpha_composite(logical.crop((left, top, right, bottom)), (left, top))
    return clipped


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def fit_crop(
    image: Image.Image,
    max_width: int,
    max_height: int,
    shared_ratio: float | None = None,
) -> tuple[Image.Image, float]:
    bbox = alpha_bbox(image)
    if bbox is None:
        raise ValueError("empty sprite after chroma-key removal")
    crop = image.crop(bbox)
    ratio = shared_ratio if shared_ratio is not None else min(max_width / crop.width, max_height / crop.height)
    width = max(1, round(crop.width * ratio))
    height = max(1, round(crop.height * ratio))
    return crop.resize((width, height), Image.Resampling.NEAREST), ratio


def place_center(image: Image.Image, center_x: int, center_y: int) -> Image.Image:
    target = Image.new("RGBA", (LOGICAL_CELL, LOGICAL_CELL), (0, 0, 0, 0))
    target.alpha_composite(image, (center_x - image.width // 2, center_y - image.height // 2))
    return target


def place_grounded(image: Image.Image, anchor_x: int = 32, anchor_y: int = 52) -> Image.Image:
    target = Image.new("RGBA", (LOGICAL_CELL, LOGICAL_CELL), (0, 0, 0, 0))
    target.alpha_composite(image, (anchor_x - image.width // 2, anchor_y - image.height))
    return target


def add_hard_rim(image: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    alpha = image.getchannel("A")
    expanded = alpha.filter(ImageFilter.MaxFilter(3))
    rim_alpha = ImageChops.subtract(expanded, alpha)
    rim = Image.new("RGBA", image.size, color)
    rim.putalpha(rim_alpha)
    rim.alpha_composite(image)
    return rim


def process_items(cells: list[Image.Image]) -> list[Image.Image]:
    result = []
    for cell in cells:
        sprite, _ = fit_crop(cell, 36, 36)
        result.append(place_center(sprite, 32, 32))
    return result


def process_enemies(cells: list[Image.Image]) -> list[Image.Image]:
    target_heights = [28, 28, 28, 34, 34, 38, 38, 40]
    result: list[Image.Image] = []
    for pair_index, target_height in enumerate(target_heights):
        pair = cells[pair_index * 2:pair_index * 2 + 2]
        boxes = [alpha_bbox(cell) for cell in pair]
        if any(box is None for box in boxes):
            raise ValueError(f"empty enemy frame in pair {pair_index}")
        widths = [box[2] - box[0] for box in boxes if box]
        heights = [box[3] - box[1] for box in boxes if box]
        width_limit = 38 if pair_index == 7 else 40
        height_limit = 38 if pair_index == 7 else target_height
        ratio = min(width_limit / max(widths), height_limit / max(heights))
        for cell in pair:
            sprite, _ = fit_crop(cell, width_limit, height_limit, ratio)
            placed = place_grounded(sprite, anchor_y=51 if pair_index == 7 else 52)
            if pair_index == 7:
                placed = add_hard_rim(placed, (92, 89, 84, 255))
            result.append(placed)
    return result


def process_pedestals(cells: list[Image.Image]) -> list[Image.Image]:
    result = []
    for index, cell in enumerate(cells):
        if index < 8:
            sprite, _ = fit_crop(cell, 40, 40)
            result.append(place_grounded(sprite))
        else:
            sprite, _ = fit_crop(cell, 40, 40)
            result.append(place_center(sprite, 32, 37))
    return result


def bbox_manifest(image: Image.Image) -> dict[str, int] | None:
    bbox = alpha_bbox(image)
    if bbox is None:
        return None
    return {
        "local_x": bbox[0] * PIXEL_SCALE,
        "local_y": bbox[1] * PIXEL_SCALE,
        "width": (bbox[2] - bbox[0]) * PIXEL_SCALE,
        "height": (bbox[3] - bbox[1]) * PIXEL_SCALE,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview")
    parser.add_argument("--kind", choices=sorted(NAMES), required=True)
    parser.add_argument("--palette", type=int, default=10)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    source_path = Path(args.input)
    out_path = Path(args.out)
    preview_path = Path(args.preview) if args.preview else None
    for path in (out_path, preview_path, out_path.with_suffix(".json")):
        if path and path.exists() and not args.force:
            raise SystemExit(f"refusing to overwrite {path}; pass --force")

    source = Image.open(source_path).convert("RGBA")
    if source.width != source.height:
        raise SystemExit(f"expected square source, got {source.width}x{source.height}")
    source = source.resize((GRID * CELL, GRID * CELL), Image.Resampling.NEAREST)
    source = chroma_key(source)

    safe_box = (48, 16, 208, 240) if args.kind == "hero" else (48, 48, 208, 208)
    cells: list[Image.Image] = []
    for row in range(GRID):
        for column in range(GRID):
            left = column * CELL
            top = row * CELL
            raw = source.crop((left, top, left + CELL, top + CELL))
            cells.append(logical_cell(raw, args.palette, safe_box))

    if args.kind == "item":
        cells = process_items(cells)
    elif args.kind == "enemy":
        cells = process_enemies(cells)
    elif args.kind == "pedestal":
        cells = process_pedestals(cells)
    # Hero layers retain the model's registered coordinates by design.

    sheet = Image.new("RGBA", (GRID * CELL, GRID * CELL), (0, 0, 0, 0))
    manifest = []
    for index, cell in enumerate(cells):
        row, column = divmod(index, GRID)
        x = column * CELL
        y = row * CELL
        enlarged = cell.resize((CELL, CELL), Image.Resampling.NEAREST)
        sheet.alpha_composite(enlarged, (x, y))
        bounds = bbox_manifest(cell)
        manifest.append({
            "index": index,
            "name": NAMES[args.kind][index],
            "row": row,
            "column": column,
            "cell_x": x,
            "cell_y": y,
            "cell_w": CELL,
            "cell_h": CELL,
            "center_anchor_x": x + 128,
            "center_anchor_y": y + 128,
            "root_anchor_x": x + 128,
            "root_anchor_y": y + (212 if args.kind == "hero" else 208),
            "bounds": bounds,
        })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    out_path.with_suffix(".json").write_text(json.dumps({
        "kind": args.kind,
        "grid": GRID,
        "cell": CELL,
        "pixel_scale": PIXEL_SCALE,
        "sprites": manifest,
    }, ensure_ascii=True, indent=2), encoding="utf-8")

    if preview_path:
        preview = Image.new("RGBA", sheet.size, (19, 18, 24, 255))
        preview.alpha_composite(sheet)
        draw = ImageDraw.Draw(preview)
        for offset in range(CELL, GRID * CELL, CELL):
            draw.line((offset, 0, offset, GRID * CELL), fill=(62, 52, 64, 255), width=1)
            draw.line((0, offset, GRID * CELL, offset), fill=(62, 52, 64, 255), width=1)
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        preview.convert("RGB").save(preview_path, quality=95)

    print(f"wrote {out_path}")
    if preview_path:
        print(f"wrote {preview_path}")
    print(f"wrote {out_path.with_suffix('.json')}")


if __name__ == "__main__":
    main()
