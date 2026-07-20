#!/usr/bin/env python3
"""把 image2 生成的绿幕摆设图规整成运行时图集。

每张原图是 2x2 格（1024x1024），输出 src/assets/world/props.png：
6 行（章节）x 4 列（变体），单元格 CELL_W x CELL_H，精灵底部居中锚定，
逻辑像素最近邻降采样 + 有限调色板量化 + 0/255 硬 alpha。
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

RAW_DIR = Path("output/imagegen/zhe-yi-shen-props-v1/raw")
OUT_DIR = Path("output/imagegen/zhe-yi-shen-props-v1")
ASSET_PATH = Path("src/assets/world/props.png")

STAGES = 6
VARIANTS = 4
CELL_W = 40
CELL_H = 44
LOGICAL_MAX_W = 36
LOGICAL_MAX_H = 40
PALETTE_COLORS = 14


def strip_green(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    cleaned = []
    for red, green, blue, alpha in result.getdata():
        is_green = green > 96 and green > red * 1.35 and green > blue * 1.35
        is_spill = green > 60 and green > red * 1.2 and green > blue * 1.2 and max(red, blue) < 120
        cleaned.append((red, green, blue, 0 if (is_green or is_spill) else alpha))
    result.putdata(cleaned)
    return result


def normalize_cell(cell: Image.Image) -> Image.Image:
    alpha = cell.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 120 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty prop cell after chroma key")
    sprite = cell.crop(bbox)
    ratio = min(LOGICAL_MAX_W / sprite.width, LOGICAL_MAX_H / sprite.height)
    logical = sprite.resize(
        (max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio))),
        Image.Resampling.NEAREST,
    )
    quantized = logical.quantize(
        colors=PALETTE_COLORS, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE,
    ).convert("RGBA")
    hard = []
    for red, green, blue, alpha_value in quantized.getdata():
        hard.append((red, green, blue, 255 if alpha_value > 120 else 0))
    quantized.putdata(hard)
    return quantized


ENTITIES_PATH = Path("src/assets/world/entities.png")
ENTITY_CELL_W = 64
ENTITY_CELL_H = 72
ENTITY_MAX_W = 60
ENTITY_MAX_H = 66
ENTITY_COUNT = 4


def keep_largest_component(cell: Image.Image) -> Image.Image:
    """抹掉离体的小杂块，只留最大连通域（生图偶尔会在角落漏一条邻物边缘）。"""
    width, height = cell.size
    pixels = cell.load()
    seen = [[False] * height for _ in range(width)]
    best: list[tuple[int, int]] = []
    for sx in range(width):
        for sy in range(height):
            if seen[sx][sy] or pixels[sx, sy][3] <= 120:
                continue
            stack = [(sx, sy)]
            seen[sx][sy] = True
            component: list[tuple[int, int]] = []
            while stack:
                x, y = stack.pop()
                component.append((x, y))
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < width and 0 <= ny < height and not seen[nx][ny] and pixels[nx, ny][3] > 120:
                        seen[nx][ny] = True
                        stack.append((nx, ny))
            if len(component) > len(best):
                best = component
    keep = set(best)
    for x in range(width):
        for y in range(height):
            if pixels[x, y][3] > 0 and (x, y) not in keep:
                pixels[x, y] = (0, 0, 0, 0)
    return cell


def normalize_entity(cell: Image.Image) -> Image.Image:
    cell = keep_largest_component(cell)
    alpha = cell.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 120 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty entity cell after chroma key")
    sprite = cell.crop(bbox)
    ratio = min(ENTITY_MAX_W / sprite.width, ENTITY_MAX_H / sprite.height)
    logical = sprite.resize(
        (max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio))),
        Image.Resampling.NEAREST,
    )
    quantized = logical.quantize(
        colors=16, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE,
    ).convert("RGBA")
    hard = []
    for red, green, blue, alpha_value in quantized.getdata():
        hard.append((red, green, blue, 255 if alpha_value > 120 else 0))
    quantized.putdata(hard)
    return quantized


def process_entities() -> None:
    raw_path = RAW_DIR / "world.png"
    if not raw_path.exists():
        print("world.png missing, skip entities")
        return
    sheet = strip_green(Image.open(raw_path))
    half_w, half_h = sheet.width // 2, sheet.height // 2
    atlas = Image.new("RGBA", (ENTITY_CELL_W * ENTITY_COUNT, ENTITY_CELL_H), (0, 0, 0, 0))
    for index in range(ENTITY_COUNT):
        col, row = index % 2, index // 2
        cell = sheet.crop((col * half_w, row * half_h, (col + 1) * half_w, (row + 1) * half_h))
        sprite = normalize_entity(cell)
        dst_x = index * ENTITY_CELL_W + (ENTITY_CELL_W - sprite.width) // 2
        dst_y = ENTITY_CELL_H - sprite.height
        atlas.alpha_composite(sprite, (dst_x, dst_y))
    atlas.save(ENTITIES_PATH, optimize=True)
    contact = atlas.resize((atlas.width * 3, atlas.height * 3), Image.Resampling.NEAREST)
    background = Image.new("RGBA", contact.size, (24, 22, 30, 255))
    background.alpha_composite(contact)
    background.convert("RGB").save(OUT_DIR / "entities-contact.png", optimize=True)
    print(f"entities {ENTITIES_PATH} · {ENTITIES_PATH.stat().st_size} bytes")


def main() -> None:
    ASSET_PATH.parent.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (CELL_W * VARIANTS, CELL_H * STAGES), (0, 0, 0, 0))
    manifest: dict[str, object] = {
        "cell": {"width": CELL_W, "height": CELL_H},
        "grid": {"stages": STAGES, "variants": VARIANTS},
        "anchor": "bottom-center",
        "cells": {},
    }
    for stage in range(STAGES):
        raw_path = RAW_DIR / f"stage{stage}.png"
        sheet = strip_green(Image.open(raw_path))
        half_w, half_h = sheet.width // 2, sheet.height // 2
        for variant in range(VARIANTS):
            col, row = variant % 2, variant // 2
            cell = sheet.crop((col * half_w, row * half_h, (col + 1) * half_w, (row + 1) * half_h))
            sprite = normalize_cell(cell)
            dst_x = variant * CELL_W + (CELL_W - sprite.width) // 2
            dst_y = stage * CELL_H + (CELL_H - sprite.height)
            atlas.alpha_composite(sprite, (dst_x, dst_y))
            manifest["cells"][f"s{stage}v{variant}"] = {
                "width": sprite.width, "height": sprite.height,
                "colors": len({p for p in sprite.getdata() if p[3]}),
            }
    atlas.save(ASSET_PATH, optimize=True)
    contact = atlas.resize((atlas.width * 4, atlas.height * 4), Image.Resampling.NEAREST)
    contact_bg = Image.new("RGBA", contact.size, (24, 22, 30, 255))
    contact_bg.alpha_composite(contact)
    contact_bg.convert("RGB").save(OUT_DIR / "props-contact.png", optimize=True)
    (OUT_DIR / "props-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"atlas {ASSET_PATH} · {ASSET_PATH.stat().st_size} bytes")
    process_entities()


if __name__ == "__main__":
    main()
