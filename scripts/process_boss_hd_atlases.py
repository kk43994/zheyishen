#!/usr/bin/env python3
"""Build high-density boss atlases from the approved Image2 design sheets.

Regular enemies remain 32x32. Compact bosses use 48x48 frames while large or
detail-heavy bosses use 64x64 frames; every runtime boss is rendered at 2x.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

from process_image2_props import keep_largest_component, strip_green

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-boss-hd-v1"
ASSET_DIR = ROOT / "src/assets/enemies"
ENEMY_RAW_DIR = ROOT / "output/imagegen/zhe-yi-shen-enemy-hybrid-v1/raw"
FATHER_RAW = ROOT / "output/imagegen/zhe-yi-shen-silent-father-hybrid-v1/silent-father-raw.png"
FATHER_P2_SKILLS = ROOT / "src/assets/enemies/boss-skills-v1/silent-father-p2-skills.png"

MOTIONS = {"idle": 2, "move": 4, "attack": 2, "hurt": 2, "death": 4}
MOTION_ROWS = {motion: row for row, motion in enumerate(MOTIONS)}
TRANSPARENT = (0, 0, 0, 0)
HURT = (176, 47, 67)
PAPER = (218, 208, 186, 255)


@dataclass(frozen=True)
class BossSpec:
    asset: str
    source: Path
    frame: int
    display: int
    colors: int
    quadrant_roles: tuple[str, str, str, str]


SPECS = (
    BossSpec(
        asset="closet-dark-hd",
        source=ENEMY_RAW_DIR / "closet-dark.png",
        frame=48,
        display=96,
        colors=18,
        quadrant_roles=("idle", "move", "attack", "hurt"),
    ),
    BossSpec(
        asset="uniform-answer-hd",
        source=ENEMY_RAW_DIR / "uniform-answer.png",
        frame=48,
        display=96,
        colors=20,
        quadrant_roles=("idle", "move", "attack", "hurt"),
    ),
    BossSpec(
        asset="last-bus-hd",
        source=ENEMY_RAW_DIR / "last-bus.png",
        frame=64,
        display=128,
        colors=24,
        quadrant_roles=("idle", "move", "attack", "hurt"),
    ),
    BossSpec(
        asset="silent-father-hd",
        source=FATHER_RAW,
        frame=64,
        display=128,
        colors=24,
        quadrant_roles=("idle", "attack", "unused", "unused"),
    ),
    BossSpec(
        asset="silent-father-p2-hd",
        source=FATHER_P2_SKILLS,
        frame=64,
        display=96,
        colors=24,
        quadrant_roles=("idle", "move", "attack", "hurt"),
    ),
    BossSpec(
        asset="debt-collector-hd",
        source=ENEMY_RAW_DIR / "debt-collector.png",
        frame=48,
        display=96,
        colors=20,
        quadrant_roles=("idle", "move", "attack", "hurt"),
    ),
    BossSpec(
        asset="lamp-keeper-hd",
        source=ENEMY_RAW_DIR / "lamp-keeper.png",
        frame=64,
        display=128,
        colors=24,
        quadrant_roles=("idle", "move", "attack", "hurt"),
    ),
)


def hard_quantize(sprite: Image.Image, colors: int) -> Image.Image:
    quantized = sprite.quantize(
        colors=colors,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    ).convert("RGBA")
    pixels = []
    for red, green, blue, alpha in quantized.getdata():
        pixels.append((red, green, blue, 255) if alpha > 120 else TRANSPARENT)
    quantized.putdata(pixels)
    return quantized


def extract_quadrants(spec: BossSpec) -> list[Image.Image]:
    sheet = strip_green(Image.open(spec.source).convert("RGBA"))
    half_w, half_h = sheet.width // 2, sheet.height // 2
    quadrants: list[Image.Image] = []
    for slot in range(4):
        column, row = slot % 2, slot // 2
        cell = sheet.crop((
            column * half_w,
            row * half_h,
            (column + 1) * half_w,
            (row + 1) * half_h,
        ))
        cell = keep_largest_component(cell)
        alpha = cell.getchannel("A").point(lambda value: 255 if value > 120 else 0)
        bbox = alpha.getbbox()
        if bbox is None:
            raise ValueError(f"empty Image2 quadrant: {spec.asset}/{slot}")
        sprite = cell.crop(bbox)
        max_size = spec.frame - 4
        ratio = min(max_size / sprite.width, max_size / sprite.height)
        logical_size = (
            max(1, round(sprite.width * ratio)),
            max(1, round(sprite.height * ratio)),
        )
        logical = sprite.resize(logical_size, Image.Resampling.NEAREST)
        quadrants.append(hard_quantize(logical, spec.colors))
    return quadrants


def place(sprite: Image.Image, frame_size: int, dx: int = 0, dy: int = 0) -> Image.Image:
    frame = Image.new("RGBA", (frame_size, frame_size), TRANSPARENT)
    x = frame_size // 2 - sprite.width // 2 + dx
    y = frame_size - 2 - sprite.height + dy
    x = max(1, min(x, frame_size - 1 - sprite.width))
    y = max(1, min(y, frame_size - 1 - sprite.height))
    frame.alpha_composite(sprite, (x, y))
    return frame


def shifted(source: Image.Image, dx: int, dy: int) -> Image.Image:
    result = Image.new("RGBA", source.size, TRANSPARENT)
    result.alpha_composite(source, (dx, dy))
    return result


def red_flash(source: Image.Image, strength: float) -> Image.Image:
    result = source.copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if not alpha:
                continue
            pixels[x, y] = (
                round(red + (HURT[0] - red) * strength),
                round(green + (HURT[1] - green) * strength),
                round(blue + (HURT[2] - blue) * strength),
                255,
            )
    return result


def slash(source: Image.Image) -> Image.Image:
    result = source.copy()
    bbox = result.getchannel("A").getbbox()
    if bbox:
        left, top, right, bottom = bbox
        ImageDraw.Draw(result).line(
            (left + 3, top + 3, right - 4, bottom - 4),
            fill=PAPER,
            width=max(1, result.width // 48),
        )
    return result


def dissolve(source: Image.Image, threshold: int) -> Image.Image:
    result = Image.new("RGBA", source.size, TRANSPARENT)
    src = source.load()
    dst = result.load()
    for y in range(1, source.height - 1):
        for x in range(1, source.width - 1):
            pixel = src[x, y]
            if not pixel[3]:
                continue
            residue = (x * 17 + y * 31 + x * y * 7 + x * x * 3 + y * y * 5) % 23
            if residue >= threshold:
                dst[x, y] = pixel
    return result


def validate_frame(image: Image.Image, label: str) -> dict[str, object]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty frame: {label}")
    if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= image.width or bbox[3] >= image.height:
        raise AssertionError(f"frame touches edge: {label} {bbox}")
    alphas = {pixel[3] for pixel in image.getdata()}
    if not alphas.issubset({0, 255}):
        raise AssertionError(f"partial alpha: {label}")
    return {
        "bbox": list(bbox),
        "opaque_pixels": sum(1 for pixel in image.getdata() if pixel[3]),
        "colors": len({pixel for pixel in image.getdata() if pixel[3]}),
    }


def build_frames(spec: BossSpec) -> dict[str, list[Image.Image]]:
    if spec.asset == "silent-father-p2-hd":
        # The approved phase-two action atlas is the Image2 source of truth for
        # the revealed boy. Reusing its idle and charge poses prevents the old
        # hooded adult base from replacing him between dedicated attacks.
        atlas = Image.open(spec.source).convert("RGBA")
        expected = (spec.frame * 4, spec.frame * 3)
        if atlas.size != expected:
            raise AssertionError(f"wrong father phase-two skill atlas: {atlas.size} != {expected}")
        idle = atlas.crop((0, 0, spec.frame, spec.frame))
        charge = atlas.crop((spec.frame * 2, 0, spec.frame * 3, spec.frame))
        return {
            "idle": [idle, shifted(idle, 0, -1)],
            "move": [shifted(idle, -1, 0), shifted(idle, 0, -1), shifted(idle, 1, 0), idle],
            "attack": [idle, charge],
            "hurt": [red_flash(idle, 0.35), slash(red_flash(idle, 0.5))],
            "death": [dissolve(red_flash(idle, 0.35), threshold) for threshold in (0, 6, 13, 20)],
        }
    quadrants = extract_quadrants(spec)
    role_frames = {
        role: place(quadrants[index], spec.frame)
        for index, role in enumerate(spec.quadrant_roles)
        if role != "unused"
    }
    idle = role_frames["idle"]
    attack = role_frames["attack"]
    move = role_frames.get("move", idle)
    hurt_base = role_frames.get("hurt", idle)
    return {
        "idle": [idle, shifted(idle, 0, -1)],
        "move": [shifted(move, -1, 0), shifted(idle, 0, -1), shifted(move, 1, 0), idle],
        "attack": [idle, attack],
        "hurt": [red_flash(hurt_base, 0.35), slash(red_flash(hurt_base, 0.5))],
        "death": [dissolve(red_flash(hurt_base, 0.35), threshold) for threshold in (0, 6, 13, 20)],
    }


def build_atlas(spec: BossSpec) -> tuple[Image.Image, dict[str, object], dict[str, list[Image.Image]]]:
    frames = build_frames(spec)
    atlas = Image.new("RGBA", (spec.frame * 4, spec.frame * len(MOTIONS)), TRANSPARENT)
    validation: dict[str, object] = {}
    for motion, expected_count in MOTIONS.items():
        motion_frames = frames[motion]
        if len(motion_frames) != expected_count:
            raise AssertionError(f"wrong frame count: {spec.asset}/{motion}")
        if len({frame.tobytes() for frame in motion_frames}) != len(motion_frames):
            raise AssertionError(f"duplicate frames: {spec.asset}/{motion}")
        validation[motion] = [
            validate_frame(frame, f"{spec.asset}/{motion}/{index}")
            for index, frame in enumerate(motion_frames)
        ]
        for column, frame in enumerate(motion_frames):
            atlas.alpha_composite(frame, (column * spec.frame, MOTION_ROWS[motion] * spec.frame))
    return atlas, validation, frames


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=[spec.asset for spec in SPECS])
    args = parser.parse_args()
    selected_specs = [spec for spec in SPECS if args.only is None or spec.asset == args.only]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_DIR / "manifest.json"
    if args.only and manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {"regular_enemy_frame": [32, 32], "assets": {}}
    manifest["pipeline"] = "approved Image2 source -> chroma cleanup or promoted action pose -> HD atlas"
    built: list[tuple[BossSpec, dict[str, list[Image.Image]]]] = []
    for spec in selected_specs:
        if not spec.source.is_file():
            raise FileNotFoundError(spec.source)
        atlas, validation, frames = build_atlas(spec)
        runtime_path = ASSET_DIR / f"{spec.asset}.png"
        atlas.save(runtime_path, optimize=True)
        manifest["assets"][spec.asset] = {
            "source": str(spec.source.relative_to(ROOT)),
            "runtime": str(runtime_path.relative_to(ROOT)),
            "frame": [spec.frame, spec.frame],
            "display": [spec.display, spec.display],
            "atlas": list(atlas.size),
            "colors": spec.colors,
            "bytes": runtime_path.stat().st_size,
            "validation": validation,
        }
        built.append((spec, frames))

    # Rebuild the review sheet from promoted runtime atlases even in --only
    # mode, without rewriting unrelated boss assets.
    contact_built: list[tuple[BossSpec, dict[str, list[Image.Image]]]] = []
    for spec in SPECS:
        atlas_path = ASSET_DIR / f"{spec.asset}.png"
        atlas = Image.open(atlas_path).convert("RGBA")
        expected_size = (spec.frame * 4, spec.frame * len(MOTIONS))
        if atlas.size != expected_size:
            raise AssertionError(f"wrong promoted atlas size: {spec.asset} {atlas.size} != {expected_size}")
        frames = {
            motion: [
                atlas.crop((column * spec.frame, row * spec.frame, (column + 1) * spec.frame, (row + 1) * spec.frame))
                for column in range(count)
            ]
            for row, (motion, count) in enumerate(MOTIONS.items())
        }
        contact_built.append((spec, frames))

    preview_scale = 2
    label_width = 180
    row_height = max(spec.frame for spec, _ in contact_built) * preview_scale + 18
    contact = Image.new(
        "RGBA",
        (label_width + max(spec.frame for spec, _ in contact_built) * preview_scale * len(MOTIONS), row_height * len(contact_built)),
        (19, 18, 24, 255),
    )
    draw = ImageDraw.Draw(contact)
    for row, (spec, frames) in enumerate(contact_built):
        top = row * row_height
        draw.text((8, top + 8), f"{spec.asset}  {spec.frame}px -> {spec.display}px", fill=(218, 208, 186, 255))
        for column, motion in enumerate(MOTIONS):
            frame = frames[motion][min(1, len(frames[motion]) - 1)]
            enlarged = frame.resize((spec.frame * preview_scale, spec.frame * preview_scale), Image.Resampling.NEAREST)
            x = label_width + column * max(item.frame for item, _ in contact_built) * preview_scale
            y = top + 8
            contact.alpha_composite(enlarged, (x, y))
    contact_path = OUT_DIR / "boss-hd-contact.png"
    contact.convert("RGB").save(contact_path, optimize=True)
    manifest["contact"] = str(contact_path.relative_to(ROOT))
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"built {len(selected_specs)} HD boss atlas(es); contact={contact_path}")


if __name__ == "__main__":
    main()
