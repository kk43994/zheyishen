#!/usr/bin/env python3
"""Derive six stage-elite atlases from the approved Image2 life-prop atlas."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output/imagegen/zhe-yi-shen-props-reference-v2/processed/props-six-stage-atlas.png"
SOURCE_MANIFEST = ROOT / "output/imagegen/zhe-yi-shen-props-reference-v2/processed/manifest.json"
RUNTIME = ROOT / "src/assets/enemies"
OUTPUT = ROOT / "output/imagegen/zhe-yi-shen-stage-elites-v1"

SOURCE_CELL = (40, 44)
FRAME = 48
MOTIONS = ("idle", "move", "attack", "hurt", "death")
FRAMES = 4
CLEAR = (0, 0, 0, 0)
RED_DARK = (100, 34, 49, 255)
RED = (159, 53, 72, 255)
RED_LIGHT = (201, 90, 104, 255)

# These cells already passed the Image2 prop pipeline. The elite identity stays
# literal: hanging clothes, ranking board, desk, empty dinner table, moving box,
# and IV stand. No generic monster silhouette is substituted.
ELITES = (
    ("closet-clothes", "衣柜里那身衣服", 1, 3, "schoolbag-coat-stand", "童年"),
    ("wall-ranking", "贴满墙的排名", 1, 2, "standing-blackboard", "少年"),
    ("window-desk", "窗边那张空工位", 4, 0, "office-desk", "青年"),
    ("father-silence", "饭桌上没说完的话", 3, 0, "dining-table-two-chairs", "成年"),
    ("whose-box", "不知道是谁的纸箱", 4, 3, "boxed-office-chair", "中年"),
    ("iv-stand", "滴完的输液架", 5, 1, "iv-stand", "暮年"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    ):
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def recolor_hurt(sprite: Image.Image) -> Image.Image:
    pixels = []
    for red, green, blue, alpha in sprite.getdata():
        if not alpha:
            pixels.append(CLEAR)
            continue
        light = (red * 2 + green * 5 + blue) // 8
        pixels.append(RED_LIGHT if light >= 125 else RED if light >= 68 else RED_DARK)
    result = Image.new("RGBA", sprite.size, CLEAR)
    result.putdata(pixels)
    return result


def death_slice(sprite: Image.Image, frame_index: int) -> Image.Image:
    if frame_index == 0:
        return sprite.copy()
    result = Image.new("RGBA", sprite.size, CLEAR)
    source = sprite.load()
    target = result.load()
    for y in range(sprite.height):
        for x in range(sprite.width):
            pixel = source[x, y]
            if not pixel[3]:
                continue
            # More horizontal strips disappear each frame; remaining pieces
            # drop by integer pixels to keep the same hard-edged art language.
            if (y + frame_index * 2) % 7 < frame_index:
                continue
            fall = frame_index * 2 + ((x // 5) % 2)
            if y + fall < sprite.height:
                target[x, y + fall] = pixel
    return result


def place(sprite: Image.Image, offset_x: int, offset_y: int, accent: bool = False) -> Image.Image:
    frame = Image.new("RGBA", (FRAME, FRAME), CLEAR)
    x = (FRAME - sprite.width) // 2 + offset_x
    y = FRAME - sprite.height - 2 + offset_y
    frame.alpha_composite(sprite, (x, y))
    if accent:
        draw = ImageDraw.Draw(frame)
        bbox = frame.getchannel("A").getbbox()
        if bbox:
            left, top, right, bottom = bbox
            draw.rectangle((left - 1, top - 1, left + 2, top), fill=RED_LIGHT)
            draw.rectangle((right - 3, bottom, right, bottom + 1), fill=RED_DARK)
    return frame


def render_atlas(sprite: Image.Image) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME * FRAMES, FRAME * len(MOTIONS)), CLEAR)
    offsets = {
        "idle": ((0, 0), (0, -1), (0, 0), (0, -1)),
        "move": ((-2, 0), (0, -2), (2, 0), (0, -1)),
        "attack": ((0, 0), (2, -2), (2, -2), (0, 0)),
        "hurt": ((-1, 0), (1, 0), (-1, 0), (1, 0)),
        "death": ((0, 0), (0, 0), (0, 0), (0, 0)),
    }
    for row, motion in enumerate(MOTIONS):
        for column in range(FRAMES):
            working = sprite
            if motion == "hurt":
                working = recolor_hurt(sprite)
            elif motion == "death":
                working = death_slice(sprite, column)
            ox, oy = offsets[motion][column]
            frame = place(working, ox, oy, accent=motion == "attack" and column in (1, 2))
            atlas.alpha_composite(frame, (column * FRAME, row * FRAME))
    return atlas


def validate_atlas(path: Path) -> dict[str, object]:
    atlas = Image.open(path).convert("RGBA")
    if atlas.size != (FRAME * FRAMES, FRAME * len(MOTIONS)):
        raise AssertionError(f"bad atlas dimensions: {path}: {atlas.size}")
    alphas = set(atlas.getchannel("A").getdata())
    if alphas - {0, 255}:
        raise AssertionError(f"non-binary alpha: {path}: {sorted(alphas)}")
    if not all(pixel == CLEAR for pixel in atlas.getdata() if pixel[3] == 0):
        raise AssertionError(f"dirty transparent RGB: {path}")
    cells = []
    for row, motion in enumerate(MOTIONS):
        for column in range(FRAMES):
            cell = atlas.crop((column * FRAME, row * FRAME, (column + 1) * FRAME, (row + 1) * FRAME))
            bbox = cell.getchannel("A").getbbox()
            if bbox is None:
                raise AssertionError(f"empty cell: {path.name}/{motion}/{column}")
            cells.append({"motion": motion, "frame": column, "bbox": list(bbox)})
    return {
        "runtime": str(path.relative_to(ROOT)),
        "sha256": sha256(path),
        "size": list(atlas.size),
        "frame": [FRAME, FRAME],
        "binaryAlpha": True,
        "transparentRgbZero": True,
        "cells": cells,
    }


def make_contact(entries: list[dict[str, object]]) -> None:
    scale = 3
    card_w = FRAME * FRAMES * scale + 24
    card_h = FRAME * 2 * scale + 58
    canvas = Image.new("RGB", (card_w * 2 + 28, card_h * 3 + 36), "#111116")
    draw = ImageDraw.Draw(canvas)
    draw.text((18, 8), "六章生活物件精英 · Image2 道具图集派生 · IDLE / ATTACK", fill="#d8d0c1", font=font(18))
    for index, entry in enumerate(entries):
        row, column = divmod(index, 2)
        x = 14 + column * card_w
        y = 36 + row * card_h
        draw.rectangle((x, y, x + card_w - 10, y + card_h - 10), fill="#1b1a20", outline="#642231")
        draw.text((x + 8, y + 6), f"{entry['stage']} · {entry['name']}", fill="#e8e1d3", font=font(14))
        draw.text((x + 8, y + 25), str(entry["id"]), fill="#c95a68", font=font(11))
        atlas = Image.open(ROOT / str(entry["runtime"])).convert("RGBA")
        review = Image.new("RGBA", (FRAME * FRAMES, FRAME * 2), CLEAR)
        review.alpha_composite(atlas.crop((0, 0, FRAME * FRAMES, FRAME)), (0, 0))
        review.alpha_composite(atlas.crop((0, FRAME * 2, FRAME * FRAMES, FRAME * 3)), (0, FRAME))
        enlarged = review.resize((review.width * scale, review.height * scale), Image.Resampling.NEAREST)
        canvas.paste(enlarged.convert("RGB"), (x + 8, y + 46), enlarged.getchannel("A"))
    canvas.save(OUTPUT / "stage-elites-contact.png", optimize=True)


def main() -> None:
    if not SOURCE.exists() or not SOURCE_MANIFEST.exists():
        raise FileNotFoundError("approved Image2 prop source/manifest is missing")
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (SOURCE_CELL[0] * 4, SOURCE_CELL[1] * 6):
        raise AssertionError(f"unexpected prop atlas size: {source.size}")

    RUNTIME.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, object]] = []
    for elite_id, name, source_row, source_column, source_id, stage in ELITES:
        sprite = source.crop((
            source_column * SOURCE_CELL[0],
            source_row * SOURCE_CELL[1],
            (source_column + 1) * SOURCE_CELL[0],
            (source_row + 1) * SOURCE_CELL[1],
        ))
        runtime = RUNTIME / f"{elite_id}.png"
        render_atlas(sprite).save(runtime, optimize=True)
        record = validate_atlas(runtime)
        record.update({
            "id": elite_id,
            "name": name,
            "stage": stage,
            "sourceCell": [source_column, source_row],
            "sourceProp": source_id,
        })
        entries.append(record)

    make_contact(entries)
    manifest = {
        "schemaVersion": 1,
        "pipeline": "approved Image2 life-prop review atlas -> 48px runtime motion atlas",
        "source": str(SOURCE.relative_to(ROOT)),
        "sourceManifest": str(SOURCE_MANIFEST.relative_to(ROOT)),
        "sourceSha256": sha256(SOURCE),
        "motions": list(MOTIONS),
        "framesPerRow": FRAMES,
        "entries": entries,
        "contact": "stage-elites-contact.png",
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(entries)} stage elite atlases")
    print(OUTPUT / "stage-elites-contact.png")


if __name__ == "__main__":
    main()
