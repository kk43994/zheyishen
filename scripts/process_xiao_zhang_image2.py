#!/usr/bin/env python3
"""Turn Xiao Zhang's Image2 2x2 green-screen sheet into a runtime atlas."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


SOURCE = Path("output/imagegen/zhe-yi-shen-xiao-zhang-v1/raw/xiao-zhang-actions.png")
ATLAS = Path("src/assets/characters/xiao-zhang.png")
MANIFEST = Path("src/assets/characters/xiao-zhang.json")
PREVIEW = Path("output/imagegen/zhe-yi-shen-xiao-zhang-v1/processed/xiao-zhang-atlas-preview.png")
FRAME = 64
COLS = 4
ACTIONS = ("idle", "follow", "shoot", "backstab")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remove_green(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, _ = pixels[x, y]
            green_strength = green - max(red, blue)
            if green >= 105 and green_strength >= 34 and green >= red * 1.28:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            if green_strength > 12 and green > 72:
                green = max(red, blue, green - green_strength)
            pixels[x, y] = (red, green, blue, 255)
    return result


def crop_quadrant(source: Image.Image, column: int, row: int) -> Image.Image:
    left = round(source.width * column / 2)
    top = round(source.height * row / 2)
    right = round(source.width * (column + 1) / 2)
    bottom = round(source.height * (row + 1) / 2)
    margin_x = round((right - left) * 0.035)
    margin_y = round((bottom - top) * 0.035)
    keyed = remove_green(source.crop((left + margin_x, top + margin_y, right - margin_x, bottom - margin_y)))
    bbox = keyed.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"Image2 quadrant {column},{row} has no foreground")
    return keyed.crop(bbox)


def fit_sprite(source: Image.Image) -> Image.Image:
    scale = min(54 / source.width, 59 / source.height)
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    reduced = source.resize((width, height), Image.Resampling.LANCZOS)
    alpha = reduced.getchannel("A").point(lambda value: 255 if value >= 104 else 0)
    rgb = reduced.convert("RGB").quantize(
        colors=28,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGBA")
    rgb.putalpha(alpha)
    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    frame.alpha_composite(rgb, ((FRAME - width) // 2, FRAME - height - 2))
    return frame


def shifted(frame: Image.Image, dx: int, dy: int) -> Image.Image:
    result = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    result.alpha_composite(frame, (dx, dy))
    return result


def build_frames(poses: dict[str, Image.Image]) -> dict[str, list[Image.Image]]:
    return {
        "idle": [poses["idle"], shifted(poses["idle"], 0, -1), poses["idle"], shifted(poses["idle"], 0, -1)],
        "follow": [
            shifted(poses["follow"], -1, 0),
            shifted(poses["follow"], 0, -1),
            shifted(poses["follow"], 1, 0),
            poses["follow"],
        ],
        "shoot": [poses["follow"], poses["shoot"], shifted(poses["shoot"], 2, 0), poses["idle"]],
        "backstab": [poses["backstab"], shifted(poses["backstab"], 1, 0), shifted(poses["backstab"], 3, 0), poses["backstab"]],
    }


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing Image2 source: {SOURCE}")
    source = Image.open(SOURCE).convert("RGBA")
    quadrants = ((0, 0), (1, 0), (0, 1), (1, 1))
    poses = {
        action: fit_sprite(crop_quadrant(source, *quadrant))
        for action, quadrant in zip(ACTIONS, quadrants)
    }
    rows = build_frames(poses)
    atlas = Image.new("RGBA", (FRAME * COLS, FRAME * len(ACTIONS)), (0, 0, 0, 0))
    for row, action in enumerate(ACTIONS):
        for column, frame in enumerate(rows[action]):
            atlas.alpha_composite(frame, (column * FRAME, row * FRAME))

    ATLAS.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS, optimize=True)
    atlas.resize((atlas.width * 3, atlas.height * 3), Image.Resampling.NEAREST).save(PREVIEW, optimize=True)
    record = {
        "version": 1,
        "model": "gpt-image-2",
        "source": str(SOURCE),
        "sourceSha256": sha256(SOURCE),
        "atlas": str(ATLAS),
        "frame": {"width": FRAME, "height": FRAME},
        "columns": COLS,
        "actions": {action: {"row": row, "frames": COLS} for row, action in enumerate(ACTIONS)},
        "quadrants": {action: [column, row] for action, (column, row) in zip(ACTIONS, quadrants)},
        "processing": "green-screen removal; fitted to 54x59; 28-color quantization; four-frame action rows",
    }
    MANIFEST.write_text(json.dumps(record, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    print(f"published Xiao Zhang atlas: {ATLAS} ({atlas.width}x{atlas.height})")


if __name__ == "__main__":
    main()
