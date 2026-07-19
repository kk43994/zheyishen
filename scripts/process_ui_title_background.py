#!/usr/bin/env python3
"""Convert the Image2 UI concept into a restrained native-pixel title asset."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageEnhance


SOURCE = Path("output/imagegen/zhe-yi-shen-ui-art-v1/source/title-life-night-gate.png")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-ui-art-v1/processed")
RUNTIME_DIR = Path("src/assets/ui")
NATIVE_SIZE = (180, 320)
RUNTIME_SIZE = (360, 640)
PALETTE_COLORS = 22


def center_crop_ratio(image: Image.Image, width_ratio: int, height_ratio: int) -> Image.Image:
    source_width, source_height = image.size
    target_width = min(source_width, source_height * width_ratio // height_ratio)
    target_height = min(source_height, source_width * height_ratio // width_ratio)
    left = (source_width - target_width) // 2
    top = (source_height - target_height) // 2
    return image.crop((left, top, left + target_width, top + target_height))


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    source = Image.open(SOURCE).convert("RGB")
    cropped = center_crop_ratio(source, 9, 16)
    native = cropped.resize(NATIVE_SIZE, Image.Resampling.BOX)
    native = ImageEnhance.Contrast(native).enhance(1.08)
    native = native.quantize(colors=PALETTE_COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    runtime = native.resize(RUNTIME_SIZE, Image.Resampling.NEAREST)

    native_path = OUTPUT_DIR / "title-life-night-native-180x320.png"
    runtime_path = RUNTIME_DIR / "title-life-night.png"
    preview_path = OUTPUT_DIR / "title-life-night-preview-2x.png"
    native.save(native_path, optimize=True)
    runtime.save(runtime_path, optimize=True)
    runtime.save(preview_path, optimize=True)

    manifest = {
        "source": str(SOURCE),
        "sourceSize": list(source.size),
        "cropAspect": "9:16 center",
        "native": {"path": str(native_path), "size": list(NATIVE_SIZE)},
        "runtime": {"path": str(runtime_path), "size": list(RUNTIME_SIZE)},
        "paletteColors": len(native.getcolors(maxcolors=256) or []),
        "alpha": False,
        "resampling": {"downscale": "BOX", "runtime": "NEAREST"},
    }
    (OUTPUT_DIR / "title-life-night-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
