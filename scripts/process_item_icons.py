#!/usr/bin/env python3
"""把 image2 道具图标基底规整成运行时图集 src/assets/items/icons.png。

旧批次继续按 raw/order.json 读取；新增固定传承物直接复用其已批准的
四方向 Image2 物件源，保证图标与角色持有物是同一件东西。
单元格 36x36，图标最大 34x34 居中锚定，12 色量化 + 0/255 硬 alpha +
最大连通域过滤。最后覆盖已审核的独立 Image2 图标，输出 icons.png（8 列网格）
与 icons.json（id → 序号）。
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from process_image2_props import keep_largest_component, strip_green
from process_item_icon_image2_v2 import SELECTIONS_PATH, process_icon, quantize_opaque_only

RAW_DIR = Path("output/imagegen/zhe-yi-shen-items-v1/raw")
OUT_DIR = Path("output/imagegen/zhe-yi-shen-items-v1")
ICONS_PNG = Path("src/assets/items/icons.png")
ICONS_JSON = Path("src/assets/items/icons.json")
EQUIPMENT_CONTRACT = Path("src/assets/items/equipment-art.json")
EQUIPMENT_RAW_DIR = Path("output/imagegen/zhe-yi-shen-items-image2-v1/raw")

CELL = 36
LOGICAL_MAX = 34
COLS = 8
LEGACY_ORDER_PATH = RAW_DIR / "order.json"
STORY_ICON_DIRECTION = {
    "admission-notice": 0,
    "iphone-17-pro-max": 2,
    "fathers-chart": 0,
}


def source_cell(item_id: str, index: int, legacy_order: list[str]) -> Image.Image:
    if index < len(legacy_order) and legacy_order[index] == item_id:
        sheet_index, slot = divmod(index, 4)
        sheet = strip_green(Image.open(RAW_DIR / f"batch{sheet_index:02d}.png"))
    else:
        sheet = strip_green(Image.open(EQUIPMENT_RAW_DIR / f"{index + 1:02d}-{item_id}.png"))
        slot = STORY_ICON_DIRECTION[item_id]
    half_w, half_h = sheet.width // 2, sheet.height // 2
    col, row = slot % 2, slot // 2
    return sheet.crop((col * half_w, row * half_h, (col + 1) * half_w, (row + 1) * half_h))


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
    return quantize_opaque_only(logical)


def apply_approved_overrides(atlas: Image.Image, index_map: dict[str, int]) -> int:
    if not SELECTIONS_PATH.is_file():
        return 0
    selections = json.loads(SELECTIONS_PATH.read_text(encoding="utf-8"))
    applied = 0
    for record in selections.get("items", []):
        item_id = record["id"]
        if item_id not in index_map:
            raise ValueError(f"unknown icon override item: {item_id}")
        if "approved" not in record.get("reviewStatus", ""):
            raise ValueError(f"unapproved icon override: {item_id}")
        icon = process_icon(Path(record["source"]))
        index = index_map[item_id]
        left = (index % COLS) * CELL
        top = (index // COLS) * CELL
        atlas.paste((0, 0, 0, 0), (left, top, left + CELL, top + CELL))
        atlas.alpha_composite(icon, (left, top))
        applied += 1
    return applied


def main() -> None:
    legacy_order: list[str] = json.loads(LEGACY_ORDER_PATH.read_text(encoding="utf-8"))
    equipment = json.loads(EQUIPMENT_CONTRACT.read_text(encoding="utf-8"))
    order = [str(item["id"]) for item in equipment["items"]]
    rows = (len(order) + COLS - 1) // COLS
    atlas = Image.new("RGBA", (CELL * COLS, CELL * rows), (0, 0, 0, 0))
    index_map: dict[str, int] = {}
    for index, item_id in enumerate(order):
        cell = source_cell(item_id, index, legacy_order)
        icon = normalize_icon(cell)
        dst_col, dst_row = index % COLS, index // COLS
        atlas.alpha_composite(icon, (
            dst_col * CELL + (CELL - icon.width) // 2,
            dst_row * CELL + (CELL - icon.height) // 2,
        ))
        index_map[item_id] = index
    override_count = apply_approved_overrides(atlas, index_map)
    ICONS_PNG.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(ICONS_PNG, optimize=True)
    ICONS_JSON.write_text(
        json.dumps({"cell": CELL, "cols": COLS, "rows": rows, "index": index_map}), encoding="utf-8",
    )
    contact = atlas.resize((atlas.width * 3, atlas.height * 3), Image.Resampling.NEAREST)
    background = Image.new("RGBA", contact.size, (24, 22, 30, 255))
    background.alpha_composite(contact)
    background.convert("RGB").save(OUT_DIR / "icons-contact.png", optimize=True)
    print(
        f"icons {ICONS_PNG} · {ICONS_PNG.stat().st_size} bytes · "
        f"{len(order)} items · {override_count} approved overrides"
    )


if __name__ == "__main__":
    main()
