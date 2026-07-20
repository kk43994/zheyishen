#!/usr/bin/env python3
"""把 image2 道具图标基底规整成运行时图集 src/assets/items/icons.png。

18 张 2x2 绿幕图 → 72 个图标，顺序取 raw/order.json（= relics.ts 声明顺序）。
单元格 36x36，图标最大 34x34 居中锚定，12 色量化 + 0/255 硬 alpha +
最大连通域过滤。输出 icons.png（8 列网格）与 icons.json（id → 序号）。
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from process_image2_props import keep_largest_component, strip_green

RAW_DIR = Path("output/imagegen/zhe-yi-shen-items-v1/raw")
OUT_DIR = Path("output/imagegen/zhe-yi-shen-items-v1")
ICONS_PNG = Path("src/assets/items/icons.png")
ICONS_JSON = Path("src/assets/items/icons.json")

CELL = 36
LOGICAL_MAX = 34
COLS = 8
PALETTE_COLORS = 12


def normalize_icon(cell: Image.Image) -> Image.Image:
    cell = keep_largest_component(cell)
    alpha = cell.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 120 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty icon cell after chroma key")
    sprite = cell.crop(bbox)
    ratio = min(LOGICAL_MAX / sprite.width, LOGICAL_MAX / sprite.height)
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


def main() -> None:
    order: list[str] = json.loads((RAW_DIR / "order.json").read_text(encoding="utf-8"))
    rows = (len(order) + COLS - 1) // COLS
    atlas = Image.new("RGBA", (CELL * COLS, CELL * rows), (0, 0, 0, 0))
    index_map: dict[str, int] = {}
    for index, item_id in enumerate(order):
        sheet_index, slot = divmod(index, 4)
        sheet_path = RAW_DIR / f"batch{sheet_index:02d}.png"
        sheet = strip_green(Image.open(sheet_path))
        half_w, half_h = sheet.width // 2, sheet.height // 2
        col, row = slot % 2, slot // 2
        cell = sheet.crop((col * half_w, row * half_h, (col + 1) * half_w, (row + 1) * half_h))
        icon = normalize_icon(cell)
        dst_col, dst_row = index % COLS, index // COLS
        atlas.alpha_composite(icon, (
            dst_col * CELL + (CELL - icon.width) // 2,
            dst_row * CELL + (CELL - icon.height) // 2,
        ))
        index_map[item_id] = index
    ICONS_PNG.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(ICONS_PNG, optimize=True)
    ICONS_JSON.write_text(
        json.dumps({"cell": CELL, "cols": COLS, "rows": rows, "index": index_map}), encoding="utf-8",
    )
    contact = atlas.resize((atlas.width * 3, atlas.height * 3), Image.Resampling.NEAREST)
    background = Image.new("RGBA", contact.size, (24, 22, 30, 255))
    background.alpha_composite(contact)
    background.convert("RGB").save(OUT_DIR / "icons-contact.png", optimize=True)
    print(f"icons {ICONS_PNG} · {ICONS_PNG.stat().st_size} bytes · {len(order)} items")


if __name__ == "__main__":
    main()
