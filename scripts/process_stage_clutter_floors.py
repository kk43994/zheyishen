#!/usr/bin/env python3
"""Normalize six Image2 stage backgrounds for the 360x640 runtime canvas."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "output/imagegen/zhe-yi-shen-stage-clutter-floors-v1"
RAW_DIR = BATCH / "raw"
PROCESSED_DIR = BATCH / "processed"
RUNTIME_DIR = ROOT / "src/assets/world"
STEMS = (
    "stage-0-childhood-bedroom",
    "stage-1-school-classroom",
    "stage-2-youth-station",
    "stage-3-adulthood-home",
    "stage-4-middle-age-office",
    "stage-5-old-age-hospital",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def crop_to_portrait(source: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    target_ratio = 360 / 640
    source_ratio = source.width / source.height
    if source_ratio > target_ratio:
        crop_width = round(source.height * target_ratio)
        left = (source.width - crop_width) // 2
        crop = (left, 0, left + crop_width, source.height)
    else:
        crop_height = round(source.width / target_ratio)
        top = (source.height - crop_height) // 2
        crop = (0, top, source.width, top + crop_height)
    return source.crop(crop), crop


def contact_sheet(paths: list[Path]) -> None:
    thumb_w, thumb_h = 180, 320
    gutter = 12
    sheet = Image.new("RGB", (gutter * 4 + thumb_w * 3, gutter * 3 + thumb_h * 2), "#111116")
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.NEAREST)
        x = gutter + (index % 3) * (thumb_w + gutter)
        y = gutter + (index // 3) * (thumb_h + gutter)
        sheet.paste(image, (x, y))
        draw.rectangle((x, y, x + 22, y + 16), fill="#101015")
        draw.text((x + 7, y + 3), str(index + 1), fill="#e9d58b")
    sheet.save(BATCH / "stage-backgrounds-contact-sheet.png", optimize=True)


def main() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    entries = []
    processed_paths: list[Path] = []

    for index, stem in enumerate(STEMS):
        raw = RAW_DIR / f"{stem}-raw.png"
        if not raw.is_file():
            raise FileNotFoundError(raw)
        source = Image.open(raw).convert("RGB")
        cropped, crop = crop_to_portrait(source)
        image = cropped.resize((360, 640), Image.Resampling.BOX)
        image = ImageEnhance.Contrast(image).enhance(0.9)
        image = ImageEnhance.Color(image).enhance(0.86)
        image = ImageEnhance.Brightness(image).enhance(0.94)
        image = image.quantize(colors=56, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        processed = PROCESSED_DIR / f"{stem}-360x640.png"
        runtime = RUNTIME_DIR / f"stage-floor-{index}.png"
        image.save(processed, optimize=True)
        image.save(runtime, optimize=True)
        processed_paths.append(processed)
        entries.append(
            {
                "stage": index,
                "source": str(raw.relative_to(ROOT)),
                "prompt": str((BATCH / "prompts" / f"{stem}.txt").relative_to(ROOT)),
                "sourceSize": list(source.size),
                "sourceSha256": sha256(raw),
                "crop": list(crop),
                "processed": str(processed.relative_to(ROOT)),
                "runtime": str(runtime.relative_to(ROOT)),
                "runtimeSize": [360, 640],
                "runtimeColors": len(image.getcolors(maxcolors=256) or []),
                "runtimeSha256": sha256(runtime),
            }
        )

    hashes = {entry["runtimeSha256"] for entry in entries}
    if len(hashes) != len(STEMS):
        raise AssertionError("stage backgrounds must have six unique runtime hashes")
    contact_sheet(processed_paths)
    manifest = {
        "model": "gpt-image-2",
        "contract": "six distinct full-screen life-stage battlefield backgrounds",
        "runtimeSize": [360, 640],
        "stages": entries,
        "status": "runtime-candidate",
        "usage": "one unique screen-space environment per chapter, crossfaded only during chapter transition",
    }
    (BATCH / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"processed {len(entries)} unique stage backgrounds")


if __name__ == "__main__":
    main()
