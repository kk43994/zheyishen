#!/usr/bin/env python3
"""Process approved standalone Image2 icon sources without chroma/palette contamination."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ATLAS_PATH = Path("src/assets/items/icons.png")
ICON_MANIFEST_PATH = Path("src/assets/items/icons.json")
SELECTIONS_PATH = Path("scripts/image2/icons-v2/selections.json")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-item-icons-v2/processed")
CELL = 36
SUBJECT_MAX = 32
PALETTE_COLORS = 12


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remove_chroma_and_despill(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.int16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    strongest_other = np.maximum(red, blue)

    # Generated sources use a flat #00ff00 field. The dominance requirement keeps
    # muted real greens intact while removing the key and its near-key variants.
    keyed = (
        (green >= 105)
        & (green - strongest_other >= 42)
        & (green * 100 >= red * 128)
        & (green * 100 >= blue * 128)
    )
    keyed_image = Image.fromarray((keyed.astype(np.uint8) * 255))
    near_key = np.asarray(keyed_image.filter(ImageFilter.MaxFilter(5))) > 0
    spill = (
        ~keyed
        & near_key
        & (green >= 70)
        & (green - strongest_other >= 10)
    )

    # Despill only the two-pixel ring touching removed chroma. Do not globally
    # suppress green, because legitimate item materials may be green.
    array[..., 1][spill] = np.clip(strongest_other[spill], 0, 255).astype(np.uint8)
    array[..., 3][keyed] = 0
    array[..., :3][keyed] = 0
    return Image.fromarray(array)


def quantize_opaque_only(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 128
    if not opaque.any():
        raise ValueError("icon source is empty after chroma removal")

    colors = array[..., :3][opaque]
    sample = Image.fromarray(colors.reshape((1, len(colors), 3)).astype(np.uint8))
    quantized = sample.quantize(
        colors=PALETTE_COLORS,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    array[..., :3] = 0
    array[..., :3][opaque] = np.asarray(quantized).reshape((-1, 3))
    array[..., 3] = np.where(opaque, 255, 0).astype(np.uint8)
    return Image.fromarray(array)


def process_icon(source: Path) -> Image.Image:
    cleaned = remove_chroma_and_despill(Image.open(source))
    bbox = cleaned.getchannel("A").point(lambda value: 255 if value >= 128 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"empty icon source: {source}")
    subject = cleaned.crop(bbox)
    scale = min(SUBJECT_MAX / subject.width, SUBJECT_MAX / subject.height)
    logical = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        Image.Resampling.NEAREST,
    )
    logical = quantize_opaque_only(logical)
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    cell.alpha_composite(logical, ((CELL - logical.width) // 2, (CELL - logical.height) // 2))

    pixels = np.asarray(cell)
    red, green, blue, alpha = [pixels[..., index].astype(np.int16) for index in range(4)]
    chroma_spill = (
        (alpha > 0)
        & (green > 150)
        & (green - np.maximum(red, blue) > 35)
    )
    if chroma_spill.any():
        raise ValueError(f"{source}: {int(chroma_spill.sum())} chroma-spill pixels remain")
    return cell


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()

    selections = json.loads(SELECTIONS_PATH.read_text(encoding="utf-8"))
    icon_manifest = json.loads(ICON_MANIFEST_PATH.read_text(encoding="utf-8"))
    atlas = Image.open(ATLAS_PATH).convert("RGBA")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []

    for item in selections["items"]:
        item_id = item["id"]
        source = Path(item["source"])
        prompt = Path(item["prompt"])
        if not source.is_file() or not prompt.is_file():
            raise FileNotFoundError(f"{item_id}: missing source or prompt")
        icon = process_icon(source)
        output = OUTPUT_DIR / f"{item_id}.png"
        icon.save(output, optimize=True)
        preview = icon.resize((CELL * 12, CELL * 12), Image.Resampling.NEAREST)
        preview.save(OUTPUT_DIR / f"{item_id}-12x.png", optimize=True)

        index = int(icon_manifest["index"][item_id])
        left = (index % int(icon_manifest["cols"])) * CELL
        top = (index // int(icon_manifest["cols"])) * CELL
        if args.install:
            atlas.paste((0, 0, 0, 0), (left, top, left + CELL, top + CELL))
            atlas.alpha_composite(icon, (left, top))
        records.append({
            "id": item_id,
            "index": index,
            "source": str(source),
            "sourceSha256": sha256(source),
            "prompt": str(prompt),
            "promptSha256": sha256(prompt),
            "processed": str(output),
            "processedSha256": sha256(output),
            "reviewStatus": item["reviewStatus"],
        })

    if args.install:
        atlas.save(ATLAS_PATH, optimize=True)
    contact = atlas.resize((atlas.width * 4, atlas.height * 4), Image.Resampling.NEAREST)
    background = Image.new("RGBA", contact.size, (24, 22, 30, 255))
    background.alpha_composite(contact)
    background.convert("RGB").save(OUTPUT_DIR / "icons-contact.png", optimize=True)
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps({
            "version": 2,
            "model": "gpt-image-2",
            "route": "DMIT sub2 owner pool",
            "installed": args.install,
            "itemCount": len(records),
            "items": records,
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"processed": len(records), "installed": args.install}, indent=2))


if __name__ == "__main__":
    main()
