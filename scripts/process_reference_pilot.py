#!/usr/bin/env python3
"""Process the reference-bound prop pilot without touching runtime assets."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PILOT = ROOT / "output" / "imagegen" / "zhe-yi-shen-reference-pilot-v2"
SOURCE = PILOT / "props-child-school-v2.png"
ENEMY_SOURCE = PILOT / "outside-the-scale-enemy-v2.png"
HIT_SOURCE = PILOT / "correction-mark-hit-v2.png"
TRANSITION_SOURCE = PILOT / "childhood-to-school-transition-v2.png"
PROCESSED = PILOT / "processed"
CELL_W = 40
CELL_H = 44
COLORS = 16
SLOTS = (
    "enamel-basin-stool",
    "rusted-tricycle",
    "old-classroom-desk",
    "bicycle-rack-red-scarf",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_chroma(red: int, green: int, blue: int) -> bool:
    return green >= 105 and green - red >= 52 and green - blue >= 52


def strip_green(image: Image.Image) -> tuple[Image.Image, float]:
    source = image.convert("RGBA")
    output: list[tuple[int, int, int, int]] = []
    keyed = 0
    for red, green, blue, alpha in source.getdata():
        if is_chroma(red, green, blue):
            output.append((0, 0, 0, 0))
            keyed += 1
        else:
            output.append((red, green, blue, alpha))
    source.putdata(output)
    return source, keyed / (source.width * source.height)


def neutralize_green_residue(image: Image.Image) -> Image.Image:
    """Map intentional greenish metal and weak spill into the project blue-gray ramp."""
    result = image.convert("RGBA")
    cleaned: list[tuple[int, int, int, int]] = []
    for red, green, blue, alpha in result.getdata():
        if alpha and green - red >= 14 and green - blue >= 7:
            lightness = (red * 2 + green * 5 + blue) // 8
            if lightness >= 104:
                cleaned.append((113, 129, 138, alpha))
            elif lightness >= 58:
                cleaned.append((56, 67, 74, alpha))
            else:
                cleaned.append((27, 26, 32, alpha))
        else:
            cleaned.append((red, green, blue, alpha))
    result.putdata(cleaned)
    return result


def normalize(cell: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    keyed, green_coverage = strip_green(cell)
    keyed = neutralize_green_residue(keyed)
    reduced = keyed.resize((CELL_W, CELL_W), Image.Resampling.BOX)
    hard_alpha = reduced.getchannel("A").point(lambda value: 255 if value > 42 else 0)
    bbox = hard_alpha.getbbox()
    if bbox is None:
        raise ValueError("empty cell after chroma key")

    crop = reduced.crop(bbox)
    crop_alpha = hard_alpha.crop(bbox)
    quantized = crop.convert("RGB").quantize(
        colors=COLORS,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    sprite = Image.merge("RGBA", (*quantized.split(), crop_alpha))
    sprite.putdata([
        (red, green, blue, 255) if alpha else (0, 0, 0, 0)
        for red, green, blue, alpha in sprite.getdata()
    ])

    result = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    destination_x = (CELL_W - sprite.width) // 2
    destination_y = CELL_H - sprite.height
    result.alpha_composite(sprite, (destination_x, destination_y))
    opaque = [pixel for pixel in result.getdata() if pixel[3]]
    return result, {
        "sourceBbox": list(bbox),
        "greenCoverage": round(green_coverage, 4),
        "opaquePixels": len(opaque),
        "colors": len({pixel[:3] for pixel in opaque}),
        "spriteSize": [sprite.width, sprite.height],
        "anchor": "bottom-center",
    }


def normalize_viewport(
    cell: Image.Image,
    width: int,
    height: int,
    colors: int,
    *,
    bottom: int | None = None,
    preserve_old_red: bool = False,
    hard_outline: bool = False,
) -> tuple[Image.Image, dict[str, object]]:
    accent_source = Image.new("L", cell.size, 0)
    if preserve_old_red:
        accent_source.putdata([
            255 if red >= 86 and red >= green * 1.55 and red >= blue * 1.25 and green < 120 else 0
            for red, green, blue, _alpha in cell.convert("RGBA").getdata()
        ])
    keyed, green_coverage = strip_green(cell)
    keyed = neutralize_green_residue(keyed)
    ratio = min(width / keyed.width, height / keyed.height)
    resized_size = (max(1, round(keyed.width * ratio)), max(1, round(keyed.height * ratio)))
    resized = keyed.resize(resized_size, Image.Resampling.BOX)
    viewport = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    viewport_x = (width - resized.width) // 2
    viewport_y = (height - resized.height) // 2
    viewport.alpha_composite(resized, (viewport_x, viewport_y))
    accent_viewport = Image.new("L", (width, height), 0)
    if preserve_old_red:
        accent_viewport.paste(
            accent_source.resize(resized_size, Image.Resampling.BOX),
            (viewport_x, viewport_y),
        )
    hard_alpha = viewport.getchannel("A").point(lambda value: 255 if value > 42 else 0)
    bbox = hard_alpha.getbbox()
    if bbox is None:
        raise ValueError("empty cell after viewport reduction")
    crop = viewport.crop(bbox)
    crop_alpha = hard_alpha.crop(bbox)
    accent_crop = accent_viewport.crop(bbox)
    quantized = crop.convert("RGB").quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    sprite = Image.merge("RGBA", (*quantized.split(), crop_alpha))
    sprite_pixels = list(sprite.getdata())
    accent_pixels = list(accent_crop.getdata())
    if preserve_old_red:
        sprite_pixels = [
            (159, 53, 72, 255) if alpha and accent >= 8 else (red, green, blue, alpha)
            for (red, green, blue, alpha), accent in zip(sprite_pixels, accent_pixels)
        ]
    if hard_outline:
        outlined = list(sprite_pixels)
        sprite_width, sprite_height = sprite.size
        for y in range(sprite_height):
            for x in range(sprite_width):
                index = y * sprite_width + x
                if sprite_pixels[index][3] == 0 or accent_pixels[index] >= 8:
                    continue
                edge = any(
                    nx < 0
                    or ny < 0
                    or nx >= sprite_width
                    or ny >= sprite_height
                    or sprite_pixels[ny * sprite_width + nx][3] == 0
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                )
                if edge:
                    outlined[index] = (23, 21, 26, 255)
        sprite_pixels = outlined
    sprite.putdata([
        (red, green, blue, 255) if alpha else (0, 0, 0, 0)
        for red, green, blue, alpha in sprite_pixels
    ])
    result = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    destination_x = (width - sprite.width) // 2
    destination_y = (height - sprite.height) // 2 if bottom is None else bottom - sprite.height
    result.alpha_composite(sprite, (destination_x, destination_y))
    opaque = [pixel for pixel in result.getdata() if pixel[3]]
    return result, {
        "greenCoverage": round(green_coverage, 4),
        "spriteSize": [sprite.width, sprite.height],
        "opaquePixels": len(opaque),
        "colors": len({pixel[:3] for pixel in opaque}),
        "anchor": "center" if bottom is None else "bottom-center",
    }


def make_contact(cells: list[Image.Image]) -> None:
    scale = 8
    gap = 28
    label_height = 34
    width = gap + len(cells) * (CELL_W * scale + gap)
    height = gap + CELL_H * scale + label_height + gap
    canvas = Image.new("RGB", (width, height), "#111116")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for index, (cell, slot) in enumerate(zip(cells, SLOTS)):
        x = gap + index * (CELL_W * scale + gap)
        enlarged = cell.resize((CELL_W * scale, CELL_H * scale), Image.Resampling.NEAREST)
        canvas.paste(enlarged.convert("RGB"), (x, gap), enlarged.getchannel("A"))
        draw.text((x, gap + CELL_H * scale + 10), slot, fill="#AAA297", font=font)
    canvas.save(PROCESSED / "props-contact-8x.png", optimize=True)


def make_runtime_preview(cells: list[Image.Image]) -> None:
    logical = Image.new("RGBA", (360, 200), "#111116")
    ground = Image.open(ROOT / "src/assets/world/ground-1.png").convert("RGBA")
    for y in range(0, logical.height, ground.height):
        for x in range(0, logical.width, ground.width):
            logical.alpha_composite(ground, (x, y))

    existing = Image.open(ROOT / "src/assets/world/props.png").convert("RGBA")
    for index in range(4):
        prop = existing.crop((index * CELL_W, CELL_H, (index + 1) * CELL_W, CELL_H * 2))
        logical.alpha_composite(prop, (12 + index * 44, 58))
    for index, cell in enumerate(cells):
        logical.alpha_composite(cell, (12 + index * 44, 138))

    hero_sheet = Image.open(ROOT / "output/art-canonical-v1/approved/hero-style1-4dir.png").convert("RGBA")
    logical.alpha_composite(hero_sheet.crop((0, 0, 40, 56)), (196, 94))
    enemy = Image.open(ROOT / "src/assets/enemies/fear.png").convert("RGBA").crop((0, 0, 32, 32))
    logical.alpha_composite(enemy, (260, 112))
    projectile = Image.open(ROOT / "src/assets/vfx/projectiles.png").convert("RGBA").crop((0, 0, 28, 28))
    logical.alpha_composite(projectile, (236, 110))

    enlarged = logical.resize((1080, 600), Image.Resampling.NEAREST)
    enlarged.convert("RGB").save(PROCESSED / "runtime-scale-preview-3x.png", optimize=True)
    logical.convert("RGB").save(PROCESSED / "runtime-scale-preview-1x.png", optimize=True)


def process_enemy() -> tuple[dict[str, object], Image.Image]:
    source = Image.open(ENEMY_SOURCE).convert("RGBA")
    if abs(source.width / source.height - 1) > 0.01:
        raise ValueError(f"enemy source is not square: {source.size}")
    atlas = Image.new("RGBA", (128, 160), (0, 0, 0, 0))
    enemy_dir = PROCESSED / "enemy-cells"
    enemy_dir.mkdir(parents=True, exist_ok=True)
    inset = max(3, round(min(source.size) * 0.004))
    metrics: dict[str, object] = {}
    for row in range(5):
        for column in range(4):
            left = round(column * source.width / 4) + inset
            right = round((column + 1) * source.width / 4) - inset
            top = round(row * source.height / 5) + inset
            bottom = round((row + 1) * source.height / 5) - inset
            frame, frame_metrics = normalize_viewport(
                source.crop((left, top, right, bottom)),
                32,
                32,
                14,
                bottom=29,
                preserve_old_red=True,
                hard_outline=True,
            )
            atlas.alpha_composite(frame, (column * 32, row * 32))
            frame.save(enemy_dir / f"r{row + 1}c{column + 1}.png", optimize=True)
            metrics[f"r{row + 1}c{column + 1}"] = frame_metrics
    atlas_path = PROCESSED / "outside-the-scale-enemy-atlas.png"
    atlas.save(atlas_path, optimize=True)
    contact = atlas.resize((768, 960), Image.Resampling.NEAREST)
    background = Image.new("RGBA", contact.size, (17, 17, 22, 255))
    background.alpha_composite(contact)
    background.convert("RGB").save(PROCESSED / "outside-the-scale-enemy-contact-6x.png", optimize=True)
    return ({
        "source": ENEMY_SOURCE.name,
        "sourceSha256": sha256(ENEMY_SOURCE),
        "sourceSize": list(source.size),
        "atlas": [128, 160],
        "cell": [32, 32],
        "motionRows": ["idle", "move", "attack", "hurt", "death"],
        "status": "rejected-concept-only",
        "reasons": [
            "segment count and body proportions drift across generated frames",
            "unused attack columns reverse direction and show the generation is not rig-stable",
            "ruler identity becomes a generic pale crawler at 32px",
        ],
        "frames": metrics,
        "atlasSha256": sha256(atlas_path),
    }, atlas.crop((0, 0, 32, 32)))


def process_hit() -> tuple[dict[str, object], list[Image.Image]]:
    source = Image.open(HIT_SOURCE).convert("RGBA")
    if abs(source.width / source.height - 1) > 0.01:
        raise ValueError(f"hit source is not square: {source.size}")
    atlas = Image.new("RGBA", (128, 32), (0, 0, 0, 0))
    hit_dir = PROCESSED / "hit-cells"
    hit_dir.mkdir(parents=True, exist_ok=True)
    inset = max(3, round(min(source.size) * 0.005))
    frames: list[Image.Image] = []
    metrics: dict[str, object] = {}
    for index in range(4):
        column, row = index % 2, index // 2
        left = round(column * source.width / 2) + inset
        right = round((column + 1) * source.width / 2) - inset
        top = round(row * source.height / 2) + inset
        bottom = round((row + 1) * source.height / 2) - inset
        frame, frame_metrics = normalize_viewport(
            source.crop((left, top, right, bottom)),
            32,
            32,
            8,
            preserve_old_red=True,
        )
        atlas.alpha_composite(frame, (index * 32, 0))
        frame.save(hit_dir / f"frame-{index + 1}.png", optimize=True)
        frames.append(frame)
        metrics[f"frame-{index + 1}"] = frame_metrics
    atlas_path = PROCESSED / "correction-mark-hit-atlas.png"
    atlas.save(atlas_path, optimize=True)
    contact = atlas.resize((1024, 256), Image.Resampling.NEAREST)
    background = Image.new("RGBA", contact.size, (17, 17, 22, 255))
    background.alpha_composite(contact)
    background.convert("RGB").save(PROCESSED / "correction-mark-hit-contact-8x.png", optimize=True)
    return ({
        "source": HIT_SOURCE.name,
        "sourceSha256": sha256(HIT_SOURCE),
        "sourceSize": list(source.size),
        "atlas": [128, 32],
        "cell": [32, 32],
        "status": "candidate-after-processed-review",
        "frames": metrics,
        "atlasSha256": sha256(atlas_path),
    }, frames)


def process_transition() -> dict[str, object]:
    source = Image.open(TRANSITION_SOURCE).convert("RGB")
    target_ratio = 9 / 16
    if source.width / source.height > target_ratio:
        crop_width = round(source.height * target_ratio)
        left = (source.width - crop_width) // 2
        source = source.crop((left, 0, left + crop_width, source.height))
    else:
        crop_height = round(source.width / target_ratio)
        top = (source.height - crop_height) // 2
        source = source.crop((0, top, source.width, top + crop_height))
    logical = source.resize((180, 320), Image.Resampling.BOX)
    logical = logical.quantize(
        colors=24,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    output = logical.resize((360, 640), Image.Resampling.NEAREST)
    output_path = PROCESSED / "childhood-to-school-transition-360x640.png"
    output.save(output_path, optimize=True)

    comparison = Image.new("RGB", (1140, 700), "#111116")
    draw = ImageDraw.Draw(comparison)
    font = ImageFont.load_default()
    references = [
        ("CURRENT TITLE", ROOT / "src/assets/ui/title-life-night.png"),
        ("CURRENT LAMP ROOM", ROOT / "src/assets/rooms/lamp.png"),
        ("PILOT TRANSITION", output_path),
    ]
    for index, (label, path) in enumerate(references):
        image = Image.open(path).convert("RGB")
        x = 30 + index * 370
        comparison.paste(image, (x, 42))
        draw.text((x, 660), label, fill="#AAA297", font=font)
    comparison.save(PROCESSED / "transition-comparison.png", optimize=True)
    return {
        "source": TRANSITION_SOURCE.name,
        "sourceSha256": sha256(TRANSITION_SOURCE),
        "sourceSize": list(Image.open(TRANSITION_SOURCE).size),
        "runtimeSize": [360, 640],
        "logicalSize": [180, 320],
        "colors": 24,
        "status": "candidate-chapter-transition-only",
        "processedSha256": sha256(output_path),
    }


def make_combat_preview(enemy: Image.Image, hits: list[Image.Image]) -> None:
    logical = Image.new("RGBA", (360, 200), "#111116")
    ground = Image.open(ROOT / "src/assets/world/ground-1.png").convert("RGBA")
    for y in range(0, logical.height, ground.height):
        for x in range(0, logical.width, ground.width):
            logical.alpha_composite(ground, (x, y))
    hero_sheet = Image.open(ROOT / "output/art-canonical-v1/approved/hero-style1-4dir.png").convert("RGBA")
    logical.alpha_composite(hero_sheet.crop((0, 0, 40, 56)), (155, 100))
    existing = Image.open(ROOT / "src/assets/enemies/red-mark.png").convert("RGBA").crop((0, 0, 32, 32))
    logical.alpha_composite(existing, (72, 120))
    logical.alpha_composite(enemy, (246, 120))
    logical.alpha_composite(hits[0], (122, 112))
    logical.alpha_composite(hits[1], (206, 112))
    logical.resize((1080, 600), Image.Resampling.NEAREST).convert("RGB").save(
        PROCESSED / "combat-pilot-preview-3x.png", optimize=True,
    )


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SOURCE).convert("RGBA")
    if abs(sheet.width / sheet.height - 1) > 0.01:
        raise ValueError(f"source is not square: {sheet.size}")
    half_w, half_h = sheet.width // 2, sheet.height // 2
    inset = max(4, round(min(sheet.size) * 0.006))
    atlas = Image.new("RGBA", (CELL_W * 4, CELL_H), (0, 0, 0, 0))
    cells: list[Image.Image] = []
    metrics: dict[str, object] = {}
    for index, slot in enumerate(SLOTS):
        col, row = index % 2, index // 2
        source = sheet.crop((
            col * half_w + inset,
            row * half_h + inset,
            (col + 1) * half_w - inset,
            (row + 1) * half_h - inset,
        ))
        cell, cell_metrics = normalize(source)
        cell_path = PROCESSED / f"{index + 1:02d}-{slot}.png"
        cell.save(cell_path, optimize=True)
        atlas.alpha_composite(cell, (index * CELL_W, 0))
        cells.append(cell)
        metrics[slot] = cell_metrics
    atlas_path = PROCESSED / "props-child-school-atlas.png"
    atlas.save(atlas_path, optimize=True)
    make_contact(cells)
    make_runtime_preview(cells)
    enemy_manifest, enemy_frame = process_enemy()
    hit_manifest, hit_frames = process_hit()
    transition_manifest = process_transition()
    make_combat_preview(enemy_frame, hit_frames)
    rig_manifest_path = PROCESSED / "outside-the-scale-rig-manifest.json"
    rig_manifest = json.loads(rig_manifest_path.read_text(encoding="utf-8")) if rig_manifest_path.exists() else None
    manifest = {
        "runtimePromoted": False,
        "status": "reviewed-no-runtime-promotion",
        "props": {
            "source": SOURCE.name,
            "sourceSha256": sha256(SOURCE),
            "sourceSize": list(sheet.size),
            "cell": [CELL_W, CELL_H],
            "atlas": [CELL_W * 4, CELL_H],
            "sourceInset": inset,
            "status": "candidate-minor-pixel-cleanup",
            "slots": metrics,
            "atlasSha256": sha256(atlas_path),
        },
        "enemy": enemy_manifest,
        "programmaticEnemy": rig_manifest,
        "hitVfx": hit_manifest,
        "transition": transition_manifest,
    }
    (PROCESSED / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"processed {len(cells)} cells -> {atlas_path}")


if __name__ == "__main__":
    main()
