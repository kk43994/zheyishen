#!/usr/bin/env python3
"""Normalize six reference-bound prop sheets without touching runtime assets."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "output" / "imagegen" / "zhe-yi-shen-props-reference-v2"
RAW = BATCH / "raw"
PROCESSED = BATCH / "processed"
CELL_W = 40
CELL_H = 44
MAX_W = 36
MAX_H = 40

STAGES = (
    ("stage0-childhood", "童年 · 床底王国", ("enamel-basin-stool", "child-iron-bed", "rocking-horse", "lunch-tin-slippers")),
    ("stage1-school", "少年 · 千眼教室", ("classroom-desk", "bicycle-rack-scarf", "standing-blackboard", "schoolbag-coat-stand")),
    ("stage2-youth", "青年 · 齿轮车站", ("station-bench", "platform-clock", "luggage-trolley", "ticket-machine")),
    ("stage3-adult", "成年 · 屋檐下的家", ("dining-table-two-chairs", "drying-rack", "sunken-sofa", "rice-cooker-trolley")),
    ("stage4-middle", "中年 · 没有关灯的办公室", ("office-desk", "filing-cabinet", "water-cooler", "boxed-office-chair")),
    ("stage5-old", "暮年 · 白发荒原", ("hospital-bench", "iv-stand", "folded-wheelchair", "bedside-cabinet")),
)

# Shared with the life-stage transition batch. Image2 determines shape and
# material placement; this fixed palette determines project color identity.
PROP_PALETTE = (
    "#08080B", "#111116", "#17151A", "#1B1A20", "#252229", "#30282A", "#3E3A3D",
    "#2B211D", "#3A2B24", "#4A352B", "#604536", "#78604A", "#8D7055", "#786F69",
    "#AAA297", "#D8D0C1", "#E8E1D3", "#642231", "#9F3548", "#75622F", "#C6A44A",
    "#283138", "#38434A", "#50616A", "#71818A", "#779887", "#B06961",
)
PROP_RGB = tuple(tuple(bytes.fromhex(value[1:])) for value in PROP_PALETTE)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def palette_image() -> Image.Image:
    values: list[int] = []
    for value in PROP_PALETTE:
        values.extend(int(value[index:index + 2], 16) for index in (1, 3, 5))
    values.extend((17, 17, 22) * ((768 - len(values)) // 3))
    image = Image.new("P", (1, 1))
    image.putpalette(values)
    return image


def is_chroma(red: int, green: int, blue: int) -> bool:
    return green >= 105 and green - red >= 52 and green - blue >= 52


def strip_green(image: Image.Image) -> tuple[Image.Image, float]:
    source = image.convert("RGBA")
    output: list[tuple[int, int, int, int]] = []
    removed = 0
    for red, green, blue, alpha in source.getdata():
        if is_chroma(red, green, blue):
            output.append((0, 0, 0, 0))
            removed += 1
        else:
            # Any weak chroma spill becomes project blue-gray instead of a
            # foreign green halo at one-pixel runtime scale.
            if alpha and green - red >= 14 and green - blue >= 7:
                lightness = (red * 2 + green * 5 + blue) // 8
                if lightness >= 104:
                    red, green, blue = 113, 129, 138
                elif lightness >= 58:
                    red, green, blue = 56, 67, 74
                else:
                    red, green, blue = 27, 26, 32
            output.append((red, green, blue, alpha))
    source.putdata(output)
    return source, removed / (source.width * source.height)


def reduce_to_project_palette(image: Image.Image, limit: int) -> Image.Image:
    adaptive = image.convert("RGB").quantize(
        colors=limit,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    cache: dict[tuple[int, int, int], tuple[int, int, int]] = {}
    mapped: list[tuple[int, int, int]] = []
    for pixel in adaptive.getdata():
        if pixel not in cache:
            cache[pixel] = min(
                PROP_RGB,
                key=lambda candidate: sum((pixel[index] - candidate[index]) ** 2 for index in range(3)),
            )
        mapped.append(cache[pixel])
    result = Image.new("RGB", adaptive.size)
    result.putdata(mapped)
    return result


def normalize(cell: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    keyed, green_coverage = strip_green(cell)
    hard_source_alpha = keyed.getchannel("A").point(lambda value: 255 if value > 42 else 0)
    bbox = hard_source_alpha.getbbox()
    if bbox is None:
        raise ValueError("empty prop cell after chroma key")
    crop = keyed.crop(bbox)
    ratio = min(MAX_W / crop.width, MAX_H / crop.height)
    size = (max(1, round(crop.width * ratio)), max(1, round(crop.height * ratio)))
    reduced = crop.resize(size, Image.Resampling.BOX)
    alpha = reduced.getchannel("A").point(lambda value: 255 if value > 42 else 0)
    colors = reduce_to_project_palette(reduced, 18)
    sprite = Image.merge("RGBA", (*colors.split(), alpha))
    sprite.putdata([
        (red, green, blue, 255) if alpha_value else (0, 0, 0, 0)
        for red, green, blue, alpha_value in sprite.getdata()
    ])

    result = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    x = (CELL_W - sprite.width) // 2
    y = CELL_H - sprite.height
    result.alpha_composite(sprite, (x, y))
    opaque = [pixel for pixel in result.getdata() if pixel[3]]
    output_bbox = result.getchannel("A").getbbox()
    if output_bbox is None:
        raise ValueError("empty normalized prop")
    return result, {
        "sourceBbox": list(bbox),
        "greenCoverage": round(green_coverage, 4),
        "spriteSize": [sprite.width, sprite.height],
        "outputBbox": list(output_bbox),
        "opaquePixels": len(opaque),
        "colors": len({pixel[:3] for pixel in opaque}),
        "anchor": "bottom-center",
        "transparentRgbZero": all(pixel == (0, 0, 0, 0) for pixel in result.getdata() if pixel[3] == 0),
    }


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (Path("/System/Library/Fonts/Hiragino Sans GB.ttc"), Path("/System/Library/Fonts/STHeiti Medium.ttc")):
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def make_contact(atlas: Image.Image) -> None:
    scale = 6
    left = 188
    top = 24
    row_h = CELL_H * scale + 44
    canvas = Image.new("RGB", (left + CELL_W * 4 * scale + 24, top + row_h * 6), "#111116")
    draw = ImageDraw.Draw(canvas)
    for stage_index, (_name, title, slots) in enumerate(STAGES):
        y = top + stage_index * row_h
        draw.text((18, y + 8), title, fill="#D8D0C1", font=font(15))
        row = atlas.crop((0, stage_index * CELL_H, CELL_W * 4, (stage_index + 1) * CELL_H))
        enlarged = row.resize((CELL_W * 4 * scale, CELL_H * scale), Image.Resampling.NEAREST)
        canvas.paste(enlarged.convert("RGB"), (left, y), enlarged.getchannel("A"))
        for index, slot in enumerate(slots):
            draw.text((left + index * CELL_W * scale + 4, y + CELL_H * scale + 10), slot, fill="#AAA297", font=ImageFont.load_default())
    canvas.save(PROCESSED / "props-contact-6x.png", optimize=True)


def make_runtime_preview(atlas: Image.Image) -> None:
    scene_w, scene_h = 360, 200
    canvas = Image.new("RGB", (scene_w * 3, scene_h * 2), "#111116")
    draw = ImageDraw.Draw(canvas)
    hero_sheet = Image.open(ROOT / "output/art-canonical-v1/approved/hero-style1-4dir.png").convert("RGBA")
    hero = hero_sheet.crop((0, 0, 40, 56))
    enemy_names = ("cry-moth", "red-mark", "clockwork", "missed-call", "debt-collector", "empty-chair")
    placements = ((18, 72), (104, 122), (216, 70), (298, 126))
    for stage_index, (_name, title, _slots) in enumerate(STAGES):
        scene = Image.new("RGBA", (scene_w, scene_h), "#111116")
        ground = Image.open(ROOT / f"src/assets/world/ground-{stage_index}.png").convert("RGBA")
        for y in range(0, scene_h, ground.height):
            for x in range(0, scene_w, ground.width):
                scene.alpha_composite(ground, (x, y))
        for variant, (x, y) in enumerate(placements):
            prop = atlas.crop((variant * CELL_W, stage_index * CELL_H, (variant + 1) * CELL_W, (stage_index + 1) * CELL_H))
            scene.alpha_composite(prop, (x, y))
        scene.alpha_composite(hero, (156, 105))
        enemy_sheet = Image.open(ROOT / f"src/assets/enemies/{enemy_names[stage_index]}.png").convert("RGBA")
        scene.alpha_composite(enemy_sheet.crop((0, 0, 32, 32)), (244, 112))
        draw_scene = ImageDraw.Draw(scene)
        draw_scene.rectangle((0, 0, scene_w, 24), fill="#111116")
        draw_scene.text((10, 5), title, fill="#D8D0C1", font=font(11))
        x = (stage_index % 3) * scene_w
        y = (stage_index // 3) * scene_h
        canvas.paste(scene.convert("RGB"), (x, y))
    canvas.resize((2160, 800), Image.Resampling.NEAREST).save(PROCESSED / "props-runtime-preview-2x.png", optimize=True)


def make_before_after(atlas: Image.Image) -> None:
    scale = 4
    label_h = 42
    panel_w = CELL_W * 4 * scale
    panel_h = CELL_H * 6 * scale
    gap = 24
    canvas = Image.new("RGB", (panel_w * 2 + gap * 3, panel_h + label_h + gap * 2), "#111116")
    draw = ImageDraw.Draw(canvas)
    old = Image.open(ROOT / "src/assets/world/props.png").convert("RGBA")
    for index, (label, source) in enumerate((("当前运行时", old), ("统一风格候选", atlas))):
        x = gap + index * (panel_w + gap)
        draw.text((x, gap), label, fill="#D8D0C1", font=font(16))
        enlarged = source.resize((panel_w, panel_h), Image.Resampling.NEAREST)
        canvas.paste(enlarged.convert("RGB"), (x, gap + label_h), enlarged.getchannel("A"))
    canvas.save(PROCESSED / "props-before-after-4x.png", optimize=True)


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (CELL_W * 4, CELL_H * 6), (0, 0, 0, 0))
    entries: list[dict[str, object]] = []
    for stage_index, (name, title, slots) in enumerate(STAGES):
        source_path = RAW / f"{name}.png"
        source = Image.open(source_path).convert("RGBA")
        inset = max(4, round(min(source.size) * 0.005))
        cells: list[dict[str, object]] = []
        for variant, slot in enumerate(slots):
            column, row = variant % 2, variant // 2
            left = round(column * source.width / 2) + inset
            right = round((column + 1) * source.width / 2) - inset
            top = round(row * source.height / 2) + inset
            bottom = round((row + 1) * source.height / 2) - inset
            prop, metrics = normalize(source.crop((left, top, right, bottom)))
            atlas.alpha_composite(prop, (variant * CELL_W, stage_index * CELL_H))
            cells.append({"id": slot, **metrics})
        entries.append({
            "id": name,
            "title": title,
            "source": str(source_path.relative_to(ROOT)),
            "sourceSize": list(source.size),
            "sourceSha256": sha256(source_path),
            "status": "candidate-passed-static-review",
            "cells": cells,
        })

    atlas_path = PROCESSED / "props-six-stage-atlas.png"
    atlas.save(atlas_path, optimize=True)
    make_contact(atlas)
    make_runtime_preview(atlas)
    make_before_after(atlas)
    manifest = {
        "runtimePromoted": False,
        "status": "static-review-passed-no-runtime-promotion",
        "cell": [CELL_W, CELL_H],
        "atlas": list(atlas.size),
        "anchor": "bottom-center",
        "sharedPalette": list(PROP_PALETTE),
        "atlasSha256": sha256(atlas_path),
        "stages": entries,
    }
    (PROCESSED / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"processed 24 props -> {atlas_path}")


if __name__ == "__main__":
    main()
