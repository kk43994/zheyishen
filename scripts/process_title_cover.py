#!/usr/bin/env python3
"""Normalize the Image2 title cover for the 360x640 runtime canvas."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "output/imagegen/zhe-yi-shen-title-cover-v1"
RAW = BATCH / "title-cover-raw.png"
PROCESSED = BATCH / "title-cover-360x640.png"
RUNTIME = ROOT / "src/assets/ui/title-life-clutter.png"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    source = Image.open(RAW).convert("RGB")
    crop_width = round(source.height * 360 / 640)
    left = max(0, (source.width - crop_width) // 2)
    crop = (left, 0, min(source.width, left + crop_width), source.height)
    image = source.crop(crop).resize((360, 640), Image.Resampling.BOX)
    image = ImageEnhance.Contrast(image).enhance(0.88)
    image = ImageEnhance.Color(image).enhance(0.84)
    image = ImageEnhance.Brightness(image).enhance(0.82)
    image = image.quantize(colors=56, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    RUNTIME.parent.mkdir(parents=True, exist_ok=True)
    image.save(PROCESSED, optimize=True)
    image.save(RUNTIME, optimize=True)
    manifest = {
        "model": "gpt-image-2",
        "source": str(RAW.relative_to(ROOT)),
        "prompt": str((BATCH / "prompt.txt").relative_to(ROOT)),
        "sourceSize": list(source.size),
        "sourceSha256": sha256(RAW),
        "crop": list(crop),
        "runtime": str(RUNTIME.relative_to(ROOT)),
        "runtimeSize": [360, 640],
        "runtimeColors": len(image.getcolors(maxcolors=256) or []),
        "runtimeSha256": sha256(RUNTIME),
        "usage": "dedicated title cover only; never reused as a chapter background",
    }
    (BATCH / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"processed title cover -> {RUNTIME.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
