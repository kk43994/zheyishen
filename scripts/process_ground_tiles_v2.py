#!/usr/bin/env python3
"""Turn Image2 floor proposals into seamless 128px candidates and review boards."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "output/imagegen/zhe-yi-shen-ground-tiles-v2"
RAW = BATCH / "raw"
PROCESSED = BATCH / "processed"

STAGES = (
    ("childhood", "童年 · 旧木地板", "ground-0-childhood.png"),
    ("school", "少年 · 教室水磨石", "ground-1-school.png"),
    ("youth", "青年 · 站台铺面", "ground-2-youth.png"),
    ("adult", "成年 · 出租屋旧地砖", "ground-3-adult.png"),
    ("middle", "中年 · 办公地胶", "ground-4-middle.png"),
    ("old", "暮年 · 苍白院廊", "ground-5-old.png"),
)

PROP_SCALES = (
    (1.35, 1.0, 0.74, 0.76),
    (1.3, 0.9, 0.78, 0.9),
    (1.45, 0.86, 1.18, 1.0),
    (1.4, 1.15, 0.9, 1.08),
    (1.35, 1.08, 0.9, 0.96),
    (1.45, 1.18, 1.12, 1.0),
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


def center_square(source: Image.Image) -> Image.Image:
    size = min(source.size)
    left = (source.width - size) // 2
    top = (source.height - size) // 2
    return source.crop((left, top, left + size, top + size))


def blend_channel(left: int, right: int, ratio: float) -> int:
    return round(left + (right - left) * ratio)


def periodicize(source: Image.Image, band: int = 12) -> Image.Image:
    """Blend opposing edge bands, then make the outermost pixels exact."""
    image = source.convert("RGB")
    pixels = image.load()
    width, height = image.size
    original = image.copy().load()

    for distance in range(band):
        ratio = distance / max(1, band - 1)
        left_x = distance
        right_x = width - 1 - distance
        for y in range(height):
            left = original[left_x, y]
            right = original[right_x, y]
            average = tuple((left[channel] + right[channel]) // 2 for channel in range(3))
            pixels[left_x, y] = tuple(blend_channel(average[channel], left[channel], ratio) for channel in range(3))
            pixels[right_x, y] = tuple(blend_channel(average[channel], right[channel], ratio) for channel in range(3))

    horizontal = image.copy().load()
    for distance in range(band):
        ratio = distance / max(1, band - 1)
        top_y = distance
        bottom_y = height - 1 - distance
        for x in range(width):
            top = horizontal[x, top_y]
            bottom = horizontal[x, bottom_y]
            average = tuple((top[channel] + bottom[channel]) // 2 for channel in range(3))
            pixels[x, top_y] = tuple(blend_channel(average[channel], top[channel], ratio) for channel in range(3))
            pixels[x, bottom_y] = tuple(blend_channel(average[channel], bottom[channel], ratio) for channel in range(3))

    image = image.quantize(colors=20, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    pixels = image.load()
    for y in range(height):
        pixels[width - 1, y] = pixels[0, y]
    for x in range(width):
        pixels[x, height - 1] = pixels[x, 0]
    return image


def normalize(source_path: Path, destination: Path) -> dict[str, object]:
    source = Image.open(source_path).convert("RGB")
    logical = center_square(source).resize((128, 128), Image.Resampling.BOX)
    logical = periodicize(logical)
    logical.save(destination, optimize=True)
    return {
        "source": str(source_path.relative_to(ROOT)),
        "sourceSize": list(source.size),
        "sourceSha256": sha256(source_path),
        "logicalSize": [128, 128],
        "colors": len(set(logical.getdata())),
        "leftRightSeamExact": all(logical.getpixel((0, y)) == logical.getpixel((127, y)) for y in range(128)),
        "topBottomSeamExact": all(logical.getpixel((x, 0)) == logical.getpixel((x, 127)) for x in range(128)),
        "processedSha256": sha256(destination),
    }


def tiled(image: Image.Image, columns: int, rows: int) -> Image.Image:
    canvas = Image.new("RGB", (image.width * columns, image.height * rows))
    for row in range(rows):
        for column in range(columns):
            canvas.paste(image, (column * image.width, row * image.height))
    return canvas


def review_contact(paths: list[Path]) -> None:
    panel = 256
    label_h = 34
    canvas = Image.new("RGB", (panel * len(paths), panel + label_h), "#111116")
    draw = ImageDraw.Draw(canvas)
    for index, path in enumerate(paths):
        x = index * panel
        canvas.paste(Image.open(path).convert("RGB").resize((panel, panel), Image.Resampling.NEAREST), (x, 0))
        centered_at(draw, STAGES[index][1], x, panel + 9, panel, "#E8E1D3", font(11, serif=True))
        if index:
            draw.line((x, 0, x, canvas.height), fill="#3E3A3D")
    canvas.save(PROCESSED / "ground-tiles-v2-contact.png", optimize=True)


def tiled_review(paths: list[Path]) -> None:
    panel = 384
    label_h = 34
    canvas = Image.new("RGB", (panel * len(paths), panel + label_h), "#111116")
    draw = ImageDraw.Draw(canvas)
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGB")
        preview = tiled(image, 3, 3)
        x = index * panel
        canvas.paste(preview, (x, 0))
        centered_at(draw, f"{STAGES[index][1]} · 3×3 无缝检查", x, panel + 9, panel, "#AAA297", font(11))
        if index:
            draw.line((x, 0, x, canvas.height), fill="#3E3A3D")
    canvas.save(PROCESSED / "ground-tiles-v2-tiled-contact.png", optimize=True)


def hero_frame() -> Image.Image:
    atlas = Image.open(ROOT / "src/assets/hero-style1-profiles/hero-idle.png").convert("RGBA")
    profile_index = 1 * 4 + 1
    return atlas.crop((0, profile_index * 4 * 56, 40, profile_index * 4 * 56 + 56))


def prop_frame(stage: int, variant: int) -> Image.Image:
    atlas = Image.open(ROOT / "src/assets/world/props.png").convert("RGBA")
    return atlas.crop((variant * 40, stage * 44, variant * 40 + 40, stage * 44 + 44))


def scene_review(paths: list[Path]) -> None:
    panel_w, panel_h = 240, 427
    label_h = 40
    canvas = Image.new("RGB", (panel_w * len(paths), panel_h + label_h), "#111116")
    draw = ImageDraw.Draw(canvas)
    placements = ((28, 110), (198, 176), (46, 360), (202, 386))
    for stage, path in enumerate(paths):
        base = tiled(Image.open(path).convert("RGB"), 3, 4).crop((0, 0, 360, 512)).resize((panel_w, panel_h), Image.Resampling.NEAREST).convert("RGBA")
        for variant, (x, y) in enumerate(placements):
            prop = prop_frame(stage, variant)
            scale = PROP_SCALES[stage][variant] * 1.45
            prop = prop.resize((round(prop.width * scale), round(prop.height * scale)), Image.Resampling.NEAREST)
            base.alpha_composite(prop, (round(x - prop.width / 2), round(y - prop.height)))
        hero = hero_frame().resize((48, 67), Image.Resampling.NEAREST)
        base.alpha_composite(hero, ((panel_w - hero.width) // 2, 214))
        x = stage * panel_w
        canvas.paste(base.convert("RGB"), (x, 0))
        centered_at(draw, STAGES[stage][1], x, panel_h + 11, panel_w, "#E8E1D3", font(11, serif=True))
        if stage:
            draw.line((x, 0, x, canvas.height), fill="#3E3A3D")
    canvas.save(PROCESSED / "ground-tiles-v2-scene-composite.png", optimize=True)


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    entries: list[dict[str, object]] = []
    for index, (stage_id, name, raw_filename) in enumerate(STAGES):
        source = RAW / raw_filename
        if not source.exists():
            raise FileNotFoundError(source)
        destination = PROCESSED / f"ground-{index}-v2.png"
        entry = normalize(source, destination)
        entry.update({"id": stage_id, "name": name, "status": "candidate-static-review"})
        entries.append(entry)
        paths.append(destination)

    review_contact(paths)
    tiled_review(paths)
    scene_review(paths)
    manifest = {
        "runtimePromoted": False,
        "status": "candidate-static-review-no-runtime-promotion",
        "groundTiles": entries,
        "runtimeRecommendation": {
            "textureAlpha": 0.72,
            "propScaleClasses": "small 0.74-0.90, medium 0.96-1.18, large 1.30-1.45",
            "placement": "large edge clusters, medium outer activity belt, small traces near parent objects",
        },
    }
    (PROCESSED / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"processed {len(paths)} seamless ground candidates -> {PROCESSED}")


if __name__ == "__main__":
    main()
