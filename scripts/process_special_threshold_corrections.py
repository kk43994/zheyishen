#!/usr/bin/env python3
"""Process focused station corrections and assemble corrected review atlases."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

from process_plinth_style_gate import load_font, process_cell as process_plinth
from process_special_threshold_style_gate import process_cell as process_threshold


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output/imagegen/zhe-yi-shen-special-threshold-corrections-v1/raw/last-line-focused-corrections.png"
OUTPUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-special-threshold-corrections-v1/processed"
OLD_PLINTH = ROOT / "output/imagegen/zhe-yi-shen-plinth-style-gate-v1/processed/03-last-line-station-atlas-48x32.png"
OLD_THRESHOLD = ROOT / "output/imagegen/zhe-yi-shen-special-threshold-style-gate-v1/processed/03-last-line-station-atlas-32x64.png"


def quadrants() -> list[Image.Image]:
    board = Image.open(SOURCE).convert("RGBA").resize((1024, 1024), Image.Resampling.NEAREST)
    return [
        board.crop((column * 512, row * 512, (column + 1) * 512, (row + 1) * 512))
        for row in range(2)
        for column in range(2)
    ]


def replace_cell(atlas: Image.Image, index: int, cell: Image.Image, size: tuple[int, int]) -> Image.Image:
    result = atlas.copy()
    result.paste((0, 0, 0, 0), (index * size[0], 0, (index + 1) * size[0], size[1]))
    result.alpha_composite(cell, (index * size[0], 0))
    return result


def make_contact(merchant: Image.Image, inner: Image.Image, beam: Image.Image, plinth: Image.Image) -> Image.Image:
    scale = 8
    margin = 24
    logical_w = 48
    logical_h = 64
    width = margin * 2 + logical_w * scale * 4
    height = 72 + logical_h * scale
    result = Image.new("RGB", (width, height), (17, 17, 22))
    draw = ImageDraw.Draw(result)
    draw.text((margin, 12), "LAST-LINE FOCUSED CORRECTIONS / REVIEW ONLY", fill=(216, 208, 193), font=load_font(22))
    names = ("COMPACT MERCHANT", "COMPACT INNER GATE", "OPAQUE REWARD BEAM", "EMPTY REWARD PLINTH")
    sprites = (merchant, inner, beam, plinth)
    for index, (name, sprite) in enumerate(zip(names, sprites)):
        x = margin + index * logical_w * scale
        draw.text((x + 4, 46), name, fill=(198, 164, 74), font=load_font(13))
        canvas = Image.new("RGBA", (logical_w, logical_h), (0, 0, 0, 0))
        canvas.alpha_composite(sprite, ((logical_w - sprite.width) // 2, logical_h - sprite.height))
        enlarged = canvas.resize((logical_w * scale, logical_h * scale), Image.Resampling.NEAREST)
        result.paste(enlarged.convert("RGB"), (x, 72), enlarged.getchannel("A"))
    return result


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    raw = quadrants()
    merchant = process_threshold(raw[0], 0)
    inner = process_threshold(raw[1], 2)
    beam = process_threshold(raw[2], 3)
    plinth = process_plinth(raw[3])

    merchant.save(OUTPUT_DIR / "merchant-32x64.png", optimize=True)
    inner.save(OUTPUT_DIR / "inner-door-32x64.png", optimize=True)
    beam.save(OUTPUT_DIR / "reward-beam-32x64.png", optimize=True)
    plinth.save(OUTPUT_DIR / "reward-plinth-48x32.png", optimize=True)

    threshold_atlas = Image.open(OLD_THRESHOLD).convert("RGBA")
    for index, cell in ((0, merchant), (2, inner), (3, beam)):
        threshold_atlas = replace_cell(threshold_atlas, index, cell, (32, 64))
    threshold_atlas.save(OUTPUT_DIR / "last-line-corrected-threshold-atlas-32x64.png", optimize=True)

    plinth_atlas = Image.open(OLD_PLINTH).convert("RGBA")
    plinth_atlas = replace_cell(plinth_atlas, 0, plinth, (48, 32))
    plinth_atlas.save(OUTPUT_DIR / "last-line-corrected-plinth-atlas-48x32.png", optimize=True)

    contact = make_contact(merchant, inner, beam, plinth)
    contact.save(OUTPUT_DIR / "last-line-corrections-contact-8x.png", optimize=True)
    manifest = {
        "review_only": True,
        "runtime_integration": False,
        "replaces_candidate_cells": ["merchant", "inner-door", "reward-beam", "reward-plinth"],
        "threshold_atlas": "last-line-corrected-threshold-atlas-32x64.png",
        "plinth_atlas": "last-line-corrected-plinth-atlas-48x32.png",
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")
    print(OUTPUT_DIR / "last-line-corrections-contact-8x.png")


if __name__ == "__main__":
    main()
