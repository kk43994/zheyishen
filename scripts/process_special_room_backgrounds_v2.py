#!/usr/bin/env python3
"""Normalize the special-room background candidates for static review."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from process_transition_batch import TRANSITION_PALETTE, center_crop_9_16, palette_image


ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "output/imagegen/zhe-yi-shen-special-room-backgrounds-v2"
RAW = BATCH / "raw"
PROCESSED = BATCH / "processed"

ROOMS = (
    ("lamp", "留灯间", "普通人的深夜，还有一盏灯替你亮着"),
    ("inner", "里屋", "被封存的人生档案，只收无法补回的东西"),
    ("pawn", "没有招牌的当铺", "失物估价处，每件普通东西都有价格"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def font(size: int, *, serif: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Songti.ttc") if serif else Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def centered(draw: ImageDraw.ImageDraw, text: str, y: int, width: int, fill: str, face: ImageFont.ImageFont) -> None:
    box = draw.textbbox((0, 0), text, font=face)
    draw.text(((width - (box[2] - box[0])) // 2, y), text, fill=fill, font=face)


def centered_at(
    draw: ImageDraw.ImageDraw,
    text: str,
    x: int,
    y: int,
    width: int,
    fill: str,
    face: ImageFont.ImageFont,
) -> None:
    box = draw.textbbox((0, 0), text, font=face)
    draw.text((x + (width - (box[2] - box[0])) // 2, y), text, fill=fill, font=face)


def normalize(source_path: Path, destination: Path) -> dict[str, object]:
    source = Image.open(source_path).convert("RGB")
    original_size = list(source.size)
    cropped, crop_fraction = center_crop_9_16(source)
    logical = cropped.resize((180, 320), Image.Resampling.BOX)
    logical = logical.quantize(palette=palette_image(), dither=Image.Dither.NONE).convert("RGB")
    runtime = logical.resize((360, 640), Image.Resampling.NEAREST)
    runtime.save(destination, optimize=True)
    return {
        "source": str(source_path.relative_to(ROOT)),
        "sourceSize": original_size,
        "sourceSha256": sha256(source_path),
        "cropFraction": round(crop_fraction, 4),
        "logicalSize": [180, 320],
        "reviewSize": [360, 640],
        "colors": len(set(logical.getdata())),
        "processedSha256": sha256(destination),
    }


def safe_zone_preview(path: Path, name: str, note: str) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    veil = Image.new("RGBA", image.size, (8, 8, 11, 38))
    image = Image.alpha_composite(image, veil)
    zones = Image.new("RGBA", image.size, (0, 0, 0, 0))
    zone_draw = ImageDraw.Draw(zones)
    zone_draw.rounded_rectangle((20, 20, 340, 92), radius=4, fill=(8, 8, 11, 184))
    zone_draw.rounded_rectangle((72, 190, 288, 416), radius=3, fill=(119, 152, 135, 22))
    zone_draw.rounded_rectangle((20, 524, 340, 620), radius=4, fill=(8, 8, 11, 205))
    zone_draw.rounded_rectangle((96, 570, 264, 604), radius=3, fill=(60, 43, 36, 245))
    image = Image.alpha_composite(image, zones)
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((20, 20, 340, 92), radius=4, outline=(170, 162, 151, 185), width=1)
    centered(draw, name, 31, image.width, "#E8E1D3", font(22, serif=True))
    centered(draw, note, 63, image.width, "#AAA297", font(9))

    draw.rounded_rectangle((72, 190, 288, 416), radius=3, outline=(119, 152, 135, 210), width=2)
    centered(draw, "中央互动与道具悬浮安全区", 200, image.width, "#A8C2B4", font(10))
    draw.ellipse((158, 289, 202, 333), outline=(216, 208, 193, 220), width=2)
    draw.line((180, 279, 180, 343), fill=(216, 208, 193, 150), width=1)
    draw.line((148, 311, 212, 311), fill=(216, 208, 193, 150), width=1)

    draw.rounded_rectangle((20, 524, 340, 620), radius=4, outline=(159, 53, 72, 195), width=1)
    centered(draw, "底部说明 / 代价 / 操作区", 537, image.width, "#AAA297", font(10))
    draw.rounded_rectangle((96, 570, 264, 604), radius=3, outline=(198, 164, 74, 220), width=1)
    centered(draw, "确认选择", 578, image.width, "#E8E1D3", font(12))
    return image.convert("RGB")


def contact_sheet(entries: list[tuple[str, str, Path]]) -> None:
    label_h = 42
    canvas = Image.new("RGB", (360 * len(entries), 640 + label_h), "#111116")
    draw = ImageDraw.Draw(canvas)
    for index, (name, state, path) in enumerate(entries):
        x = index * 360
        canvas.paste(Image.open(path).convert("RGB"), (x, 0))
        centered_at(draw, f"{name} · {state}", x, 650, 360, "#AAA297", font(12))
        if index:
            draw.line((x, 0, x, canvas.height), fill="#3E3A3D", width=1)
    canvas.save(PROCESSED / "special-room-current-vs-candidate-contact.png", optimize=True)


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    manifest_entries: list[dict[str, object]] = []
    comparisons: list[tuple[str, str, Path]] = []
    previews: list[Image.Image] = []

    for room_id, name, note in ROOMS:
        source_path = RAW / f"{room_id}-room-v2.png"
        output_path = PROCESSED / f"{room_id}-room-v2-360x640.png"
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        entry = normalize(source_path, output_path)
        entry.update({"id": room_id, "name": name, "status": "candidate-static-review"})
        manifest_entries.append(entry)
        comparisons.extend((
            (name, "现役", ROOT / "src/assets/rooms" / f"{room_id}.png"),
            (name, "候选 v2", output_path),
        ))
        preview = safe_zone_preview(output_path, name, note)
        preview.save(PROCESSED / f"{room_id}-room-v2-safe-zone.png", optimize=True)
        previews.append(preview)

    contact_sheet(comparisons)
    safe_canvas = Image.new("RGB", (360 * len(previews), 640), "#111116")
    for index, preview in enumerate(previews):
        safe_canvas.paste(preview, (index * 360, 0))
    safe_canvas.save(PROCESSED / "special-room-v2-safe-zone-contact.png", optimize=True)

    manifest = {
        "runtimePromoted": False,
        "status": "candidate-static-review-no-runtime-promotion",
        "sharedPalette": list(TRANSITION_PALETTE),
        "rooms": manifest_entries,
    }
    (PROCESSED / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"processed {len(manifest_entries)} special-room candidates -> {PROCESSED}")


if __name__ == "__main__":
    main()
