#!/usr/bin/env python3
"""Publish Image2 sheets as four-direction rig sprites and source palettes.

The inventory icon atlas is a separate, icon-specific Image2 deliverable. Four-direction
equipment sheets often contain decals, effects, or anatomy fragments that are invalid as
standalone 36px icons, so this pipeline must never overwrite ``icons.png``.
"""

from __future__ import annotations

import argparse
from collections import deque
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CONTRACT_PATH = Path("src/assets/items/equipment-art.json")
ICON_MANIFEST_PATH = Path("src/assets/items/icons.json")
ICON_ATLAS_PATH = Path("src/assets/items/icons.png")
RAW_DIR = Path("output/imagegen/zhe-yi-shen-items-image2-v1/raw")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-items-image2-v1/processed")
SPRITE_ATLAS_PATH = Path("src/assets/items/equipment-sprites.png")
SPRITE_MANIFEST_PATH = Path("src/assets/items/equipment-sprites.json")
PALETTE_MANIFEST_PATH = Path("src/assets/items/source-palettes.json")
AUDIT_PATH = Path("scripts/image2/items-v1/audit.json")
PALETTE_SOURCE_OVERRIDES = {
    "third-pill": Path(
        "output/imagegen/zhe-yi-shen-art-loop-v1/44-third-pill/v1/"
        "44-third-pill-v1.png"
    ),
}

SPRITE_CELL_W = 32
SPRITE_CELL_H = 40
PALETTE_COLORS = 8
DIRECTIONS = ("front", "left", "back", "right")

LONG_IDS = {"wooden-sword"}
BACK_VOLUME_IDS = {"stone-schoolbag", "card-binder"}
BACK_SURFACE_IDS = {"red-workbook", "takeout-3am"}
FACE_IDS = {"cracked-glasses", "name-sold"}
WRIST_IDS = {"loose-button", "slow-watch"}
NECK_IDS = {"nameless-tie", "baby-tooth", "retracted-voice"}
CHEST_IDS = {"front-desk-letter", "revoked-badge", "missing-photo", "divorce-draft"}
WAIST_IDS = {
    "only-key", "white-bottle", "red-packet", "shared-powerbank", "old-door-lock", "gym-card",
    "fathers-chart",
}
CUSTOM_FITTED_IDS = {"small-uniform", "fathers-raincoat"}
TARGET_OVERRIDES = {
    "loose-button": (5, 6),
    "wooden-sword": (14, 28),
    "front-desk-letter": (9, 8),
    "first-salary": (10, 9),
    "unsent-phone": (8, 12),
    "missing-photo": (8, 9),
    "white-bottle": (8, 11),
    "last-page": (10, 14),
    "marble": (5, 5),
    "read-3am": (8, 13),
    "retracted-voice": (13, 6),
    "mineral-water": (7, 13),
    "divorce-draft": (8, 8),
    "shared-powerbank": (9, 12),
    "old-door-lock": (8, 10),
    "pregnancy-test": (7, 11),
    "gym-card": (9, 7),
    "typing-indicator": (8, 13),
    "ai-chat": (8, 13),
    "streak-1847": (10, 14),
    "friend-verify": (8, 13),
    "admission-notice": (12, 18),
    "iphone-17-pro-max": (10, 18),
    "fathers-chart": (12, 16),
}
STORY_SIGNATURE_IDS = {"admission-notice", "iphone-17-pro-max", "fathers-chart"}
STORY_PALETTE_COLORS = {
    "admission-notice": 7,
    "iphone-17-pro-max": 6,
    "fathers-chart": 6,
}
OLD_RED = (158, 57, 65, 255)
DEVICE_INK = (24, 22, 29, 255)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hard_quantize(image: Image.Image, colors: int = PALETTE_COLORS) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 128
    if not opaque.any():
        raise ValueError("cannot quantize an empty sprite")
    subject_colors = array[..., :3][opaque]
    sample = Image.fromarray(subject_colors.reshape((1, len(subject_colors), 3)).astype(np.uint8))
    quantized = sample.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    array[..., :3] = 0
    array[..., :3][opaque] = np.asarray(quantized).reshape((-1, 3))
    array[..., 3] = np.where(opaque, 255, 0).astype(np.uint8)
    return Image.fromarray(array)


def strip_green_fast(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    is_green = (green > 96) & (green * 100 > red * 135) & (green * 100 > blue * 135)
    is_spill = (
        (green > 60)
        & (green * 100 > red * 120)
        & (green * 100 > blue * 120)
        & (np.maximum(red, blue) < 120)
    )
    keyed = is_green | is_spill
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
    array[..., 1][edge_spill] = np.clip(strongest_other[edge_spill], 0, 255).astype(np.uint8)
    array[..., 3][keyed] = 0
    array[..., :3][keyed] = 0
    return Image.fromarray(array)


def hex_color(color: tuple[int, int, int]) -> str:
    return "#" + "".join(f"{channel:02x}" for channel in color)


def source_palette(image: Image.Image) -> dict[str, object]:
    """Extract a stable runtime palette from an approved Image2 source sheet."""
    foreground = strip_green_fast(image)
    sample = foreground.copy()
    sample.thumbnail((384, 384), Image.Resampling.NEAREST)
    rgb = np.asarray(sample.convert("RGBA"))
    opaque = rgb[..., 3] >= 128
    colors = rgb[..., :3][opaque]
    if not len(colors):
        raise ValueError("empty Image2 source while extracting runtime palette")

    # The chroma key intentionally uses an extreme green. Remove the small
    # antialiased fringe too so it can never become an in-game accent color.
    keep = ~(
        (colors[:, 1] > 80)
        & (colors[:, 1] * 100 > colors[:, 0] * 120)
        & (colors[:, 1] * 100 > colors[:, 2] * 120)
    )
    colors = colors[keep]
    palette_source = Image.fromarray(colors.reshape((1, len(colors), 3)).astype(np.uint8))
    quantized = palette_source.quantize(
        colors=12,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    counts = sorted(quantized.getcolors(maxcolors=256) or [], reverse=True)
    raw_palette = quantized.getpalette() or []
    weighted: list[tuple[int, tuple[int, int, int]]] = []
    for count, palette_index in counts:
        offset = palette_index * 3
        color = tuple(raw_palette[offset:offset + 3])
        if len(color) == 3:
            weighted.append((count, color))
    if not weighted:
        raise ValueError("Image2 source quantized to an empty runtime palette")

    def luminance(color: tuple[int, int, int]) -> float:
        return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722

    def saturation(color: tuple[int, int, int]) -> float:
        high, low = max(color), min(color)
        return (high - low) / max(1, high)

    common = [color for count, color in weighted if count >= max(4, len(colors) // 1500)]
    if not common:
        common = [color for _, color in weighted]
    ink = min(common, key=luminance)
    light = max(common, key=luminance)
    middle = [color for color in common if 45 <= luminance(color) <= 225] or common
    dominant = next((
        color for _, color in weighted
        if color in middle and luminance(color) >= 45
    ), middle[0])
    accent = max(
        middle,
        key=lambda color: saturation(color) * 180 + min(luminance(color), 180),
    )
    dark_candidates = [color for color in common if luminance(color) < luminance(dominant)]
    dark = max(dark_candidates, key=luminance) if dark_candidates else ink
    ordered = []
    for _, color in weighted:
        encoded = hex_color(color)
        if encoded not in ordered:
            ordered.append(encoded)
        if len(ordered) == PALETTE_COLORS:
            break
    return {
        "ink": hex_color(ink),
        "dark": hex_color(dark),
        "dominant": hex_color(dominant),
        "accent": hex_color(accent),
        "light": hex_color(light),
        "colors": ordered,
    }


def crop_main_component(cell: Image.Image) -> Image.Image:
    foreground = strip_green_fast(cell)
    alpha = foreground.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    outer_bbox = alpha.getbbox()
    if outer_bbox is None:
        raise ValueError("empty item cell after chroma key and component filtering")
    cropped = foreground.crop(outer_bbox)
    mask = alpha.crop(outer_bbox)
    scale = min(1.0, 160 / max(mask.size))
    sample_size = (
        max(1, round(mask.width * scale)),
        max(1, round(mask.height * scale)),
    )
    sample = mask.resize(sample_size, Image.Resampling.NEAREST)
    pixels = sample.load()
    visited: set[tuple[int, int]] = set()
    best: list[tuple[int, int]] = []
    for start_y in range(sample.height):
        for start_x in range(sample.width):
            if not pixels[start_x, start_y] or (start_x, start_y) in visited:
                continue
            queue = deque([(start_x, start_y)])
            visited.add((start_x, start_y))
            component: list[tuple[int, int]] = []
            while queue:
                x, y = queue.popleft()
                component.append((x, y))
                for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    nx, ny = neighbor
                    if (
                        0 <= nx < sample.width
                        and 0 <= ny < sample.height
                        and pixels[nx, ny]
                        and neighbor not in visited
                    ):
                        visited.add(neighbor)
                        queue.append(neighbor)
            if len(component) > len(best):
                best = component
    if not best:
        raise ValueError("empty item component after sampled scan")
    min_x = min(point[0] for point in best)
    min_y = min(point[1] for point in best)
    max_x = max(point[0] for point in best) + 1
    max_y = max(point[1] for point in best) + 1
    source_bbox = (
        max(0, int(min_x / scale) - 2),
        max(0, int(min_y / scale) - 2),
        min(cropped.width, int(max_x / scale) + 2),
        min(cropped.height, int(max_y / scale) + 2),
    )
    return cropped.crop(source_bbox)


def fit(source: Image.Image, max_width: int, max_height: int, colors: int = PALETTE_COLORS) -> Image.Image:
    scale = min(max_width / source.width, max_height / source.height)
    resized = source.resize(
        (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
        Image.Resampling.NEAREST,
    )
    return hard_quantize(resized, colors=colors)


def preserve_story_signature(item_id: str, direction: str, sprite: Image.Image) -> Image.Image:
    """Keep approved Image2 identity marks legible after the final nearest-neighbor downsample."""
    if item_id not in STORY_SIGNATURE_IDS:
        return sprite
    result = sprite.copy()
    draw = ImageDraw.Draw(result)
    width, height = result.size

    if item_id == "admission-notice" and direction == "front":
        # The source has an old red rectangular admission stamp in the lower-right quarter.
        left, top = max(1, width - 5), max(1, height - 6)
        draw.rectangle((left, top, width - 2, top + 2), outline=OLD_RED)
        draw.point((left + 1, top + 1), fill=OLD_RED)
    elif item_id == "iphone-17-pro-max":
        if direction == "front":
            # Preserve the source's top island on the otherwise bright front screen.
            left = max(1, width // 2 - 1)
            draw.rectangle((left, 1, min(width - 2, left + 2), 1), fill=DEVICE_INK)
        elif direction == "back":
            # Preserve the triangular three-lens cluster already present in the Image2 source.
            left, top = 1, 2
            draw.rectangle((left, top, min(width - 2, left + 3), min(height - 2, top + 3)), fill=(58, 56, 64, 255))
            for x, y in ((left, top), (left + 2, top + 1), (left, top + 2)):
                draw.point((x, y), fill=DEVICE_INK)
    elif item_id == "fathers-chart" and direction == "front":
        # The approved v2 source uses this registration block to distinguish a chart from a notebook.
        left, top = max(2, width // 3), max(2, height // 4)
        draw.rectangle((left, top, min(width - 2, left + 4), top + 1), fill=OLD_RED)
        draw.point((left + 1, top), fill=(214, 190, 164, 255))
    return result


def target_size(item_id: str) -> tuple[int, int]:
    if item_id in TARGET_OVERRIDES:
        return TARGET_OVERRIDES[item_id]
    if item_id in LONG_IDS:
        return (18, 34)
    if item_id in BACK_VOLUME_IDS:
        return (22, 28)
    if item_id in BACK_SURFACE_IDS:
        return (18, 24)
    if item_id in FACE_IDS:
        return (18, 10)
    if item_id in WRIST_IDS:
        return (8, 10)
    if item_id in NECK_IDS:
        return (10, 14)
    if item_id in CHEST_IDS:
        return (12, 14)
    if item_id in WAIST_IDS:
        return (12, 14)
    return (14, 18)


def split_sheet(sheet: Image.Image) -> list[Image.Image]:
    half_width = sheet.width // 2
    half_height = sheet.height // 2
    return [
        sheet.crop((0, 0, half_width, half_height)),
        sheet.crop((half_width, 0, sheet.width, half_height)),
        sheet.crop((0, half_height, half_width, sheet.height)),
        sheet.crop((half_width, half_height, sheet.width, sheet.height)),
    ]


def source_path(item: dict[str, object]) -> Path:
    return RAW_DIR / f"{int(item['index']) + 1:02d}-{item['id']}.png"


def build_source_contacts(items: list[dict[str, object]], prefix: str) -> None:
    available = [item for item in items if source_path(item).exists()]
    columns, rows = 3, 3
    tile_width, tile_height = 320, 340
    for page_index in range((len(available) + columns * rows - 1) // (columns * rows)):
        page_items = available[page_index * columns * rows:(page_index + 1) * columns * rows]
        contact = Image.new("RGB", (tile_width * columns, tile_height * rows), (24, 22, 30))
        draw = ImageDraw.Draw(contact)
        for slot, item in enumerate(page_items):
            image = Image.open(source_path(item)).convert("RGB")
            image.thumbnail((300, 300), Image.Resampling.NEAREST)
            column, row = slot % columns, slot // columns
            left = column * tile_width + (tile_width - image.width) // 2
            top = row * tile_height + 6
            contact.paste(image, (left, top))
            draw.text(
                (column * tile_width + 10, row * tile_height + 310),
                f"{int(item['index']) + 1:02d} {item['id']}",
                fill=(218, 208, 190),
            )
        contact.save(OUTPUT_DIR / f"{prefix}-{page_index + 1:02d}.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--allow-partial", action="store_true")
    args = parser.parse_args()

    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    icon_manifest = json.loads(ICON_MANIFEST_PATH.read_text(encoding="utf-8"))
    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    reviewed_through = int(audit["reviewedThrough"])
    redo = audit["redo"]
    items = contract["items"]
    if len(items) != 77:
        raise AssertionError(f"expected 77 items, got {len(items)}")

    icon_atlas = Image.open(ICON_ATLAS_PATH).convert("RGBA")
    sprite_atlas = Image.new(
        "RGBA",
        (SPRITE_CELL_W * len(DIRECTIONS), SPRITE_CELL_H * len(items)),
        (0, 0, 0, 0),
    )
    records: list[dict[str, object]] = []
    palette_records: dict[str, object] = {}
    missing: list[str] = []

    for item in items:
        item_id = str(item["id"])
        path = source_path(item)
        if item_id == "small-uniform":
            records.append({
                "index": item["index"],
                "id": item_id,
                "status": "custom-fitted-uniform-v1",
                "directions": list(DIRECTIONS),
            })
            uniform_source = Path(
                "output/imagegen/zhe-yi-shen-uniform-image2-v1/raw/"
                "small-uniform-anatomy-source.png"
            )
            if not uniform_source.exists():
                missing.append(item_id)
            else:
                palette_records[item_id] = {
                    "source": str(uniform_source),
                    "sourceSha256": sha256(uniform_source),
                    **source_palette(Image.open(uniform_source).convert("RGBA")),
                }
            continue
        if not path.exists():
            missing.append(item_id)
            records.append({
                "index": item["index"],
                "id": item_id,
                "status": "pending-source",
                "directions": list(DIRECTIONS),
            })
            continue

        review_status = "redo" if item_id in redo else (
            "approved" if int(item["index"]) <= reviewed_through else "pending-review"
        )
        sheet = Image.open(path).convert("RGBA")
        palette_source_path = PALETTE_SOURCE_OVERRIDES.get(item_id, path)
        if not palette_source_path.exists():
            raise FileNotFoundError(f"{item_id}: missing palette source {palette_source_path}")
        palette_source = Image.open(palette_source_path).convert("RGBA")
        palette_records[item_id] = {
            "source": str(palette_source_path),
            "sourceSha256": sha256(palette_source_path),
            **source_palette(palette_source),
        }
        panels = split_sheet(sheet)
        icon_index = int(icon_manifest["index"][item_id])

        max_width, max_height = target_size(item_id)
        direction_meta: dict[str, object] = {}
        for direction_index, (direction, panel) in enumerate(zip(DIRECTIONS, panels)):
            palette_size = STORY_PALETTE_COLORS.get(item_id, PALETTE_COLORS)
            sprite = fit(crop_main_component(panel), max_width, max_height, colors=palette_size)
            if item_id == "wooden-sword" and direction in {"front", "back"}:
                angle = -18 if direction == "front" else 18
                sprite = sprite.rotate(angle, resample=Image.Resampling.NEAREST, expand=True)
                rotated_bbox = sprite.getchannel("A").getbbox()
                if rotated_bbox:
                    sprite = fit(sprite.crop(rotated_bbox), max_width, max_height)
            sprite = preserve_story_signature(item_id, direction, sprite)
            if review_status == "approved":
                destination_x = direction_index * SPRITE_CELL_W + (SPRITE_CELL_W - sprite.width) // 2
                destination_y = int(item["index"]) * SPRITE_CELL_H + (SPRITE_CELL_H - sprite.height) // 2
                sprite_atlas.alpha_composite(sprite, (destination_x, destination_y))
            direction_meta[direction] = {
                "width": sprite.width,
                "height": sprite.height,
                "colors": len({pixel for pixel in sprite.getdata() if pixel[3]}),
            }

        records.append({
            "index": item["index"],
            "id": item_id,
            "status": f"source-{review_status}",
            "source": str(path),
            "sourceSha256": sha256(path),
            "production": item["production"],
            "directions": direction_meta,
            "iconAtlasIndex": icon_index,
            "spriteMax": [max_width, max_height],
            "runtime": "custom-fitted" if item_id in CUSTOM_FITTED_IDS else "source-sprite-or-canon-mutation",
            "reviewNote": redo.get(item_id),
        })

    if missing and not args.allow_partial:
        raise AssertionError(f"missing {len(missing)} Image2 item sources: {', '.join(missing)}")

    sprite_atlas.save(SPRITE_ATLAS_PATH, optimize=True)
    sprite_manifest = {
        "version": 1,
        "model": "gpt-image-2",
        "route": "DMIT sub2 owner pool",
        "cell": {"width": SPRITE_CELL_W, "height": SPRITE_CELL_H},
        "directions": list(DIRECTIONS),
        "rows": len(items),
        "index": {item["id"]: item["index"] for item in items},
        "processed": len(items) - len(missing) - 1,
        "missing": missing,
        "items": records,
    }
    SPRITE_MANIFEST_PATH.write_text(
        json.dumps(sprite_manifest, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    PALETTE_MANIFEST_PATH.write_text(
        json.dumps({
            "version": 1,
            "model": "gpt-image-2",
            "route": "DMIT sub2 owner pool",
            "itemCount": len(palette_records),
            "items": palette_records,
        }, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    icon_contact = icon_atlas.resize(
        (icon_atlas.width * 3, icon_atlas.height * 3), Image.Resampling.NEAREST,
    )
    icon_background = Image.new("RGBA", icon_contact.size, (24, 22, 30, 255))
    icon_background.alpha_composite(icon_contact)
    icon_background.convert("RGB").save(OUTPUT_DIR / "icons-contact.png", optimize=True)
    sprite_contact = sprite_atlas.resize(
        (sprite_atlas.width * 3, sprite_atlas.height * 3), Image.Resampling.NEAREST,
    )
    sprite_background = Image.new("RGBA", sprite_contact.size, (24, 22, 30, 255))
    sprite_background.alpha_composite(sprite_contact)
    sprite_background.convert("RGB").save(OUTPUT_DIR / "equipment-sprites-contact.png", optimize=True)
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(sprite_manifest, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    build_source_contacts(items, "raw-contact")
    build_source_contacts([item for item in items if item["id"] in redo], "redo-v2-contact")
    print(f"processed {sprite_manifest['processed']} Image2 item sources; missing {len(missing)}")


if __name__ == "__main__":
    main()
