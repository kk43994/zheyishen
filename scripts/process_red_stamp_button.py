#!/usr/bin/env python3
"""Extract the Image2 red-stamp master into a four-state transparent button atlas."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "output/imagegen/zhe-yi-shen-red-stamp-buttons-v1"
RAW = BATCH / "red-stamp-button-raw.png"
RUNTIME = ROOT / "src/assets/ui/button-stamp-states.png"
ATLAS = BATCH / "button-stamp-states.png"
PREVIEW = BATCH / "button-stamp-preview.png"
FRAME_SIZE = (384, 120)
STATE_COLORS = (
    (182, 67, 88),   # normal
    (213, 91, 112),  # hover/focus
    (155, 48, 68),   # pressed
    (96, 68, 76),    # disabled
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ink_mask(source: Image.Image) -> Image.Image:
    rgb = source.convert("RGB")
    mask = Image.new("L", rgb.size)
    pixels = []
    for red, green, blue in rgb.getdata():
        dominance = red - max(green, blue)
        darkness = max(0, 232 - min(red, green, blue))
        alpha = max(0, min(255, round((dominance - 18) * 3.2 + darkness * 0.22)))
        pixels.append(alpha if dominance > 20 else 0)
    mask.putdata(pixels)
    bbox = mask.getbbox()
    if not bbox:
        raise AssertionError("Image2 source contains no extractable red ink")
    left, top, right, bottom = bbox
    pad_x = max(2, round((right - left) * 0.012))
    pad_y = max(2, round((bottom - top) * 0.035))
    crop = (
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(source.width, right + pad_x),
        min(source.height, bottom + pad_y),
    )
    return mask.crop(crop)


def state_frame(base_mask: Image.Image, index: int) -> Image.Image:
    mask = base_mask.resize(FRAME_SIZE, Image.Resampling.LANCZOS)
    if index == 1:
        mask = mask.point(lambda value: min(255, round(value * 1.18)))
    elif index == 2:
        shifted = Image.new("L", FRAME_SIZE)
        shifted.paste(mask, (0, 3))
        mask = ImageChops.lighter(mask.point(lambda value: round(value * 0.72)), shifted)
    elif index == 3:
        mask = mask.point(lambda value: round(value * 0.68))
    red, green, blue = STATE_COLORS[index]
    frame = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    frame.paste((red, green, blue, 255), (0, 0, *FRAME_SIZE), mask)
    return frame


def make_preview(frames: list[Image.Image]) -> None:
    preview = Image.new("RGB", (640, 214), "#101015")
    draw = ImageDraw.Draw(preview)
    labels = ("NORMAL", "HOVER", "PRESSED", "DISABLED")
    for index, frame in enumerate(frames):
        x = 20 + (index % 2) * 310
        y = 20 + (index // 2) * 96
        scaled = frame.resize((288, 90), Image.Resampling.NEAREST)
        preview.paste(scaled, (x, y), scaled)
        draw.text((x + 8, y + 36), labels[index], fill="#e8e1d3")
    preview.save(PREVIEW, optimize=True)


def main() -> None:
    source = Image.open(RAW).convert("RGB")
    mask = ink_mask(source)
    frames = [state_frame(mask, index) for index in range(4)]
    atlas = Image.new("RGBA", (FRAME_SIZE[0], FRAME_SIZE[1] * len(frames)), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, (0, index * FRAME_SIZE[1]))
    RUNTIME.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS, optimize=True)
    atlas.save(RUNTIME, optimize=True)
    make_preview(frames)
    manifest = {
        "model": "gpt-image-2",
        "source": str(RAW.relative_to(ROOT)),
        "prompt": str((BATCH / "prompt.txt").relative_to(ROOT)),
        "sourceSize": list(source.size),
        "sourceSha256": sha256(RAW),
        "runtime": str(RUNTIME.relative_to(ROOT)),
        "runtimeSize": list(atlas.size),
        "frameSize": list(FRAME_SIZE),
        "states": ["normal", "hover", "pressed", "disabled"],
        "runtimeSha256": sha256(RUNTIME),
        "usage": "Image2 red-ink frame; runtime text remains deterministic canvas type",
    }
    (BATCH / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"processed red-stamp button atlas -> {RUNTIME.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
