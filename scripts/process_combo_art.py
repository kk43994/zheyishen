#!/usr/bin/env python3
"""把组合彩蛋奥义插画的绿幕 2x2 图规整成运行时图集。

输入 output/imagegen/zhe-yi-shen-combo-art-v1/raw/sheet00-02.png（每张 2x2 格），
顺序按 raw/order.json，输出 src/assets/ui/combo-art.png（2 列 x 6 行，288x162 单元格）
+ combo-art.json 清单 + combo-contact.png 校对拼图。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_image2_props import strip_green  # noqa: E402

RAW_DIR = Path("output/imagegen/zhe-yi-shen-combo-art-v1/raw")
OUT_DIR = Path("output/imagegen/zhe-yi-shen-combo-art-v1")
ASSET_PATH = Path("src/assets/ui/combo-art.png")
MANIFEST_PATH = Path("src/assets/ui/combo-art.json")

CELL_W = 288
CELL_H = 162
COLS = 2
PALETTE_COLORS = 24
BG = (16, 16, 20, 255)
BATCH = 4


def normalize_cell(cell: Image.Image) -> Image.Image:
    """切好的象限 → 去绿幕 → bbox 裁剪 → 等比缩放 → 量化 → 居中贴到不透明底色单元格。"""
    cell = strip_green(cell)
    alpha = cell.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 120 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty combo art cell after chroma key")
    sprite = cell.crop(bbox)
    ratio = min(CELL_W / sprite.width, CELL_H / sprite.height, 1.0)
    sprite = sprite.resize(
        (max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio))),
        Image.Resampling.NEAREST,
    )
    sprite = sprite.quantize(
        colors=PALETTE_COLORS, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE,
    ).convert("RGBA")
    tile = Image.new("RGBA", (CELL_W, CELL_H), BG)
    tile.alpha_composite(sprite, ((CELL_W - sprite.width) // 2, (CELL_H - sprite.height) // 2))
    return tile


def main() -> None:
    keys: list[str] = json.loads((RAW_DIR / "order.json").read_text(encoding="utf-8"))
    if len(keys) != 12:
        sys.exit(f"order.json has {len(keys)} keys, expected 12 — rerun generate script first")
    rows = (len(keys) + COLS - 1) // COLS
    atlas = Image.new("RGBA", (CELL_W * COLS, CELL_H * rows), BG)
    contact_cells: list[Image.Image] = []
    missing: list[str] = []
    for index, key in enumerate(keys):
        sheet_index, slot = divmod(index, BATCH)
        sheet = Image.open(RAW_DIR / f"sheet{sheet_index:02d}.png")
        half_w, half_h = sheet.width // 2, sheet.height // 2
        col, row = slot % 2, slot // 2
        quadrant = sheet.crop((col * half_w, row * half_h, (col + 1) * half_w, (row + 1) * half_h))
        contact_cells.append(quadrant.convert("RGBA"))
        try:
            tile = normalize_cell(quadrant)
        except ValueError:
            # Image generation can leave one quadrant as pure chroma key. Keep
            # the semantic key in the manifest so the game can fall back to a
            # caption while the other combo plates remain usable.
            tile = Image.new("RGBA", (CELL_W, CELL_H), BG)
            missing.append(key)
            print(f"{key}: missing source cell, keeping caption fallback", flush=True)
        atlas.paste(tile, ((index % COLS) * CELL_W, (index // COLS) * CELL_H))
        filled = sum(1 for p in tile.getdata() if p[:3] != BG[:3])
        print(f"{key}: filled {filled}", flush=True)
    ASSET_PATH.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(ASSET_PATH, optimize=True)
    MANIFEST_PATH.write_text(
        json.dumps({"cellWidth": CELL_W, "cellHeight": CELL_H, "cols": COLS, "keys": keys, "missing": missing}, indent=2),
        encoding="utf-8",
    )
    cw, ch = contact_cells[0].size
    contact = Image.new("RGBA", (cw * COLS, ch * rows), BG)
    for index, cell in enumerate(contact_cells):
        contact.paste(cell, ((index % COLS) * cw, (index // COLS) * ch))
    contact.convert("RGB").save(OUT_DIR / "combo-contact.png", optimize=True)
    print(f"atlas {ASSET_PATH} · {ASSET_PATH.stat().st_size} bytes · {atlas.width}x{atlas.height}")


if __name__ == "__main__":
    main()
