#!/usr/bin/env python3
"""Normalize ending background candidates and preview the real result-screen layers."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from process_transition_batch import TRANSITION_PALETTE, center_crop_9_16, palette_image


ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "output/imagegen/zhe-yi-shen-ending-backgrounds-v2"
RAW = BATCH / "raw"
PROCESSED = BATCH / "processed"

ENDINGS = (
    (
        "table",
        "写到这里",
        ROOT / "src/assets/ui/ending-table.png",
        RAW / "ending-table-v2.png",
        "ending-table-v2-360x640.png",
    ),
    (
        "lampman",
        "已封卷",
        ROOT / "src/assets/ui/ending-lampman.png",
        RAW / "ending-lampman-v2-clear.png",
        "ending-lampman-v2-clear-360x640.png",
    ),
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


def centered(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    width: int,
    fill: str,
    face: ImageFont.ImageFont,
) -> None:
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


def average_front_hero() -> Image.Image:
    atlas = Image.open(ROOT / "src/assets/hero-style1-profiles/hero-idle.png").convert("RGBA")
    profile_index = 1 * 4 + 1  # average stature, average build
    frame = atlas.crop((0, profile_index * 4 * 56, 40, profile_index * 4 * 56 + 56))
    return frame.resize((56, 78), Image.Resampling.NEAREST)


def result_preview(path: Path, *, won: bool) -> Image.Image:
    background = Image.open(path).convert("RGBA")
    night = Image.new("RGBA", background.size, (8, 8, 11, 255))
    background.putalpha(199)  # Runtime ending art is drawn at 0.78 alpha.
    image = Image.alpha_composite(night, background)
    image = Image.alpha_composite(image, Image.new("RGBA", image.size, (7, 7, 10, 179)))
    draw = ImageDraw.Draw(image)

    draw.text((20, 20), "第 7F3A19C2 号人生档案 · 已封卷", fill="#6F6960", font=font(8))
    draw.rectangle((16, 36, 206, 86), fill=(8, 8, 11, 174))
    draw.text((22, 43), "这一生" if won else "这一身", fill="#E8E1D3", font=font(30, serif=True))
    draw.rectangle((20, 89, 340, 91), fill="#9F3548")
    stamp = "已封卷" if won else "写到这里"
    draw.rounded_rectangle((242, 43, 328, 77), radius=3, outline="#9F3548", width=2)
    centered_at(draw, stamp, 242, 52, 86, "#D8D0C1", font(11, serif=True))

    for index, label in enumerate(("封卷", "穿过的", "咽与吐", "留下的")):
        x = 20 + index * 80
        draw.rectangle((x, 98, x + 78, 126), fill=(216, 208, 193, 38) if index == 0 else (27, 26, 32, 184))
        draw.rectangle((x, 124, x + 78, 126), fill="#9F3548" if index == 0 else "#514D53")
        centered_at(draw, label, x, 105, 78, "#E8E1D3" if index == 0 else "#AAA297", font(9))

    draw.text((190, 142), "《没有留下名字的人》", fill="#D8D0C1", font=font(11, serif=True))
    draw.text((190, 163), "暮年 · 7 件物证", fill="#AAA297", font=font(9))
    draw.rectangle((42, 176, 44, 426), fill="#403C40")
    for index, label in enumerate(("降生", "童年", "少年", "青年", "成年", "中年", "暮年")):
        y = 181 + index * 35
        draw.rectangle((38, y, 48, y + 10), fill="#9F3548" if index == 6 else "#D8D0C1")
        draw.text((58, y - 1), label, fill="#AAA297", font=font(9))

    hero = average_front_hero()
    image.alpha_composite(hero, (242, 271))
    draw = ImageDraw.Draw(image)
    draw.line((206, 360, 330, 360), fill="#4E494C", width=1)
    centered_at(draw, "《尚未命名的一生》", 206, 376, 124, "#C6A44A", font(9, serif=True))
    draw.line((20, 431, 340, 431), fill="#4D494D", width=1)
    draw.text((20, 443), "这一身最深的两道痕 · 到这里才第一次落字", fill="#AAA297", font=font(9))

    draw.rounded_rectangle((70, 505, 290, 563), radius=3, fill="#17151A", outline="#9F3548", width=2)
    centered(draw, "再活一次", 518, 360, "#E8E1D3", font(16, serif=True))
    centered(
        draw,
        "他没有赢，只是终于松了这一口气。" if won else "他没有走完，但已经走过的都算数。",
        590,
        360,
        "#AAA297",
        font(9, serif=True),
    )
    return image.convert("RGB")


def labeled_contact(entries: list[tuple[str, Path]], destination: Path) -> None:
    label_height = 34
    canvas = Image.new("RGB", (360 * len(entries), 640 + label_height), "#111116")
    draw = ImageDraw.Draw(canvas)
    for index, (label, path) in enumerate(entries):
        x = index * 360
        canvas.paste(Image.open(path).convert("RGB"), (x, 0))
        centered_at(draw, label, x, 648, 360, "#AAA297", font(11))
        if index:
            draw.line((x, 0, x, canvas.height), fill="#3E3A3D", width=1)
    canvas.save(destination, optimize=True)


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    manifest_entries: list[dict[str, object]] = []
    comparisons: list[tuple[str, Path]] = []
    preview_paths: list[tuple[str, Path]] = []

    for ending_id, state, current_path, source_path, filename in ENDINGS:
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        output_path = PROCESSED / filename
        entry = normalize(source_path, output_path)
        entry.update({"id": ending_id, "state": state, "status": "candidate-static-review"})
        manifest_entries.append(entry)
        comparisons.extend(((f"{state} · 现役", current_path), (f"{state} · 候选 v2", output_path)))

        preview_path = PROCESSED / f"ending-{ending_id}-v2-result-preview.png"
        result_preview(output_path, won=ending_id == "lampman").save(preview_path, optimize=True)
        preview_paths.append((f"{state} · 实机叠层", preview_path))

    labeled_contact(comparisons, PROCESSED / "ending-backgrounds-current-vs-candidate.png")
    labeled_contact(preview_paths, PROCESSED / "ending-backgrounds-v2-result-previews.png")

    rejected = RAW / "ending-lampman-v2.png"
    manifest = {
        "runtimePromoted": False,
        "status": "candidate-static-review-no-runtime-promotion",
        "sharedPalette": list(TRANSITION_PALETTE),
        "endings": manifest_entries,
        "rejectedSources": [{
            "source": str(rejected.relative_to(ROOT)),
            "reason": "baked caretaker overlaps the runtime modular final protagonist",
            "sha256": sha256(rejected),
        }] if rejected.exists() else [],
    }
    (PROCESSED / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"processed {len(manifest_entries)} ending backgrounds -> {PROCESSED}")


if __name__ == "__main__":
    main()
