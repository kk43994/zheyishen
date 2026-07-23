#!/usr/bin/env python3
"""Normalize the five life-stage transitions into one shared pixel palette."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "output/imagegen/zhe-yi-shen-transitions-v2"
PROCESSED = BATCH / "processed"

TRANSITIONS = (
    (
        "childhood-to-school",
        ROOT / "output/imagegen/zhe-yi-shen-reference-pilot-v2/childhood-to-school-transition-v2.png",
        "第 2 章",
        "少年 · 千眼教室",
        "统一答案",
    ),
    ("school-to-youth", BATCH / "school-to-youth.png", "第 3 章", "青年 · 齿轮车站", "错过的那一班"),
    ("youth-to-adult", BATCH / "youth-to-adult.png", "第 4 章", "成年 · 屋檐下的家", "沉默的父亲"),
    ("adult-to-middle", BATCH / "adult-to-middle-v2.png", "第 5 章", "中年 · 没有关灯的办公室", "名字还在表格里"),
    ("middle-to-old", BATCH / "middle-to-old.png", "第 6 章", "暮年 · 白发荒原", "收灯人"),
)

# Every transition uses this exact project palette. The image model only
# proposes material placement; runtime color identity remains deterministic.
TRANSITION_PALETTE = (
    "#08080B",
    "#111116",
    "#17151A",
    "#1B1A20",
    "#252229",
    "#30282A",
    "#3E3A3D",
    "#2B211D",
    "#3A2B24",
    "#4A352B",
    "#604536",
    "#78604A",
    "#8D7055",
    "#786F69",
    "#AAA297",
    "#D8D0C1",
    "#E8E1D3",
    "#642231",
    "#9F3548",
    "#75622F",
    "#C6A44A",
    "#283138",
    "#38434A",
    "#50616A",
    "#71818A",
    "#779887",
    "#B06961",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def palette_image() -> Image.Image:
    values: list[int] = []
    for value in TRANSITION_PALETTE:
        values.extend(int(value[index:index + 2], 16) for index in (1, 3, 5))
    values.extend((17, 17, 22) * ((768 - len(values)) // 3))
    image = Image.new("P", (1, 1))
    image.putpalette(values)
    return image


def center_crop_9_16(source: Image.Image) -> tuple[Image.Image, float]:
    original_area = source.width * source.height
    target_ratio = 9 / 16
    if source.width / source.height > target_ratio:
        crop_width = round(source.height * target_ratio)
        left = (source.width - crop_width) // 2
        source = source.crop((left, 0, left + crop_width, source.height))
    else:
        crop_height = round(source.width / target_ratio)
        top = (source.height - crop_height) // 2
        source = source.crop((0, top, source.width, top + crop_height))
    return source, 1 - (source.width * source.height) / original_area


def font(size: int, *, serif: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Songti.ttc") if serif else Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def centered(draw: ImageDraw.ImageDraw, text: str, y: int, image_width: int, fill: str, face: ImageFont.ImageFont) -> None:
    box = draw.textbbox((0, 0), text, font=face)
    draw.text(((image_width - (box[2] - box[0])) // 2, y), text, fill=fill, font=face)


def overlay_preview(image: Image.Image, chapter_number: str, chapter: str, title: str) -> Image.Image:
    preview = image.convert("RGBA")
    veil = Image.new("RGBA", preview.size, (8, 8, 11, 72))
    preview = Image.alpha_composite(preview, veil)
    draw = ImageDraw.Draw(preview)
    centered(draw, chapter_number, 172, preview.width, "#AAA297", font(9))
    centered(draw, chapter, 389, preview.width, "#E8E1D3", font(19, serif=True))
    draw.rectangle((118, 421, 241, 422), fill="#9F3548")
    centered(draw, title, 436, preview.width, "#AAA297", font(10, serif=True))
    return preview.convert("RGB")


def contact_sheet(paths: list[Path], destination: Path, *, columns: int = 5) -> None:
    thumb_w, thumb_h = 288, 512
    label_h = 30
    rows = math.ceil(len(paths) / columns)
    canvas = Image.new("RGB", (columns * thumb_w, rows * (thumb_h + label_h)), "#111116")
    draw = ImageDraw.Draw(canvas)
    for index, path in enumerate(paths):
        source = Image.open(path).convert("RGB")
        preview = source.resize((thumb_w, thumb_h), Image.Resampling.NEAREST)
        x = (index % columns) * thumb_w
        y = (index // columns) * (thumb_h + label_h)
        canvas.paste(preview, (x, y))
        draw.text((x + 8, y + thumb_h + 8), path.stem, fill="#AAA297", font=ImageFont.load_default())
    canvas.save(destination, optimize=True)


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    palette = palette_image()
    processed_paths: list[Path] = []
    overlay_paths: list[Path] = []
    entries: list[dict[str, object]] = []
    for name, path, chapter_number, chapter, title in TRANSITIONS:
        if not path.exists():
            raise FileNotFoundError(path)
        source = Image.open(path).convert("RGB")
        original_size = list(source.size)
        cropped, crop_fraction = center_crop_9_16(source)
        logical = cropped.resize((180, 320), Image.Resampling.BOX)
        logical = logical.quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
        runtime = logical.resize((360, 640), Image.Resampling.NEAREST)
        output_path = PROCESSED / f"{name}-360x640.png"
        runtime.save(output_path, optimize=True)
        overlay_path = PROCESSED / f"{name}-overlay-preview.png"
        overlay_preview(runtime, chapter_number, chapter, title).save(overlay_path, optimize=True)
        processed_paths.append(output_path)
        overlay_paths.append(overlay_path)
        entries.append({
            "id": name,
            "source": str(path.relative_to(ROOT)),
            "sourceSize": original_size,
            "sourceSha256": sha256(path),
            "cropFraction": round(crop_fraction, 4),
            "logicalSize": [180, 320],
            "runtimeSize": [360, 640],
            "colors": len(set(logical.getdata())),
            "processedSha256": sha256(output_path),
            "status": "candidate-passed-static-review",
        })
    contact_sheet(processed_paths, PROCESSED / "transitions-contact.png")
    contact_sheet(overlay_paths, PROCESSED / "transition-overlays-contact.png")
    rejected = BATCH / "adult-to-middle.png"
    manifest = {
        "runtimePromoted": False,
        "status": "static-review-passed-no-runtime-promotion",
        "sharedPalette": list(TRANSITION_PALETTE),
        "transitions": entries,
        "rejectedSources": [{
            "source": rejected.name,
            "reason": "baked protagonist violates runtime identity and title-safe composition",
            "sha256": sha256(rejected),
        }] if rejected.exists() else [],
    }
    (PROCESSED / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"processed {len(entries)} transitions -> {PROCESSED}")


if __name__ == "__main__":
    main()
