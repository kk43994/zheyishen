#!/usr/bin/env python3
"""Validate deterministic slicing and pixel constraints for an art atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


GRID = 4
CELL = 256
EXPECTED_SIZE = GRID * CELL


def fail(message: str) -> None:
    raise SystemExit(f"invalid atlas: {message}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--manifest")
    parser.add_argument("--kind", choices=("item", "hero", "enemy", "pedestal"), required=True)
    parser.add_argument("--max-colors", type=int, default=12)
    args = parser.parse_args()

    image_path = Path(args.image)
    manifest_path = Path(args.manifest) if args.manifest else image_path.with_suffix(".json")
    image = Image.open(image_path).convert("RGBA")
    if image.size != (EXPECTED_SIZE, EXPECTED_SIZE):
        fail(f"expected 1024x1024, got {image.width}x{image.height}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sprites = manifest.get("sprites")
    if manifest.get("kind") != args.kind or not isinstance(sprites, list) or len(sprites) != 16:
        fail("manifest kind or sprite count mismatch")

    safe = (48, 16, 208, 240) if args.kind == "hero" else (48, 48, 208, 208)
    green_spill = 0
    reports = []
    for index, entry in enumerate(sprites):
        row, column = divmod(index, GRID)
        if entry.get("index") != index or entry.get("row") != row or entry.get("column") != column:
            fail(f"manifest index mismatch at {index}")
        left = column * CELL
        top = row * CELL
        cell = image.crop((left, top, left + CELL, top + CELL))
        bbox = cell.getchannel("A").getbbox()
        if bbox is None:
            fail(f"empty cell {index} ({entry.get('name')})")
        if bbox[0] < safe[0] or bbox[1] < safe[1] or bbox[2] > safe[2] or bbox[3] > safe[3]:
            fail(f"cell {index} leaves safe box: {bbox}")
        if any(value % 4 for value in bbox):
            fail(f"cell {index} is not aligned to 4px grid: {bbox}")
        colors = set()
        for red, green, blue, alpha in cell.getdata():
            if not alpha:
                continue
            colors.add((red, green, blue))
            if green > 90 and green > red * 1.2 and green > blue * 1.15:
                green_spill += 1
        if len(colors) > args.max_colors:
            fail(f"cell {index} has {len(colors)} colors, max {args.max_colors}")

        center_x = (bbox[0] + bbox[2]) / 2
        center_y = (bbox[1] + bbox[3]) / 2
        if args.kind == "item" and (abs(center_x - 128) > 4 or abs(center_y - 128) > 4):
            fail(f"item {index} misses center anchor: ({center_x},{center_y})")
        if args.kind == "enemy" and bbox[3] != 208:
            fail(f"enemy {index} misses root y=208: bbox bottom {bbox[3]}")
        if args.kind == "pedestal" and index < 8 and bbox[3] != 208:
            fail(f"pedestal {index} misses root y=208: bbox bottom {bbox[3]}")
        reports.append({
            "index": index,
            "name": entry.get("name"),
            "bbox": bbox,
            "colors": len(colors),
        })

    if green_spill:
        fail(f"found {green_spill} green-spill pixels")

    print(json.dumps({
        "ok": True,
        "kind": args.kind,
        "image": str(image_path),
        "cells": len(reports),
        "green_spill": green_spill,
        "reports": reports,
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()
