#!/usr/bin/env python3
"""boss-skills-v2 规整：把 generate.py 的 2 张 2x2 绿幕图（图A=帧1-4，图B=帧5-8）
切格→抠绿→去杂块→规整成 8 帧横条图集，单帧尺寸与 v1 同招一致。

抠绿/连通域/硬 alpha 逻辑与 scripts/image2/boss-skills-v1/build_atlases.py、
scripts/process_vfx_ui_pack.py 同源（底边对齐，帧内边留 3px，禁触边）。

产出：
  src/assets/enemies/boss-skills-v2/father-charge-8f.png  (8x64 = 512x64)
  src/assets/enemies/boss-skills-v2/praise-slam-8f.png    (8x96 = 768x96)
  src/assets/enemies/boss-skills-v2/manifest.json
  src/assets/enemies/boss-skills-v2/preview-*.png         (4x 放大暗底预览条)

用法：python3 scripts/image2/boss-skills-v2/process.py
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "output/imagegen/zhe-yi-shen-boss-skills-v2/raw"
OUT_DIR = ROOT / "src/assets/enemies/boss-skills-v2"
CLEAR = (0, 0, 0, 0)

# (招式id, 帧尺寸=与 v1 同招一致, 展示尺寸, [图A, 图B])
SKILLS = [
    ("father-charge", 64, 96, ["father-charge-a", "father-charge-b"]),
    ("praise-slam", 96, 192, ["praise-slam-a", "praise-slam-b"]),
]


def strip_green(image: Image.Image) -> Image.Image:
    """同 build_atlases.strip_key(key='green')：抠纯绿 + 绿溢色，硬 alpha。"""
    result = image.convert("RGBA")
    cleaned = []
    for red, green, blue, alpha in result.getdata():
        keyed = green > 30 and green > red * 1.32 and green > blue * 1.32 and max(red, blue) < 175
        cleaned.append(CLEAR if keyed or alpha < 20 else (red, green, blue, 255))
    result.putdata(cleaned)
    return result


def meaningful_components(image: Image.Image) -> Image.Image:
    """去掉生图杂块：保留面积 >= 最大连通域 1/350 的部件（同 v1 逻辑简化版）。"""
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.tobytes()
    seen = bytearray(width * height)
    components: list[list[int]] = []
    for start, value in enumerate(pixels):
        if value == 0 or seen[start]:
            continue
        queue = deque([start])
        seen[start] = 1
        component: list[int] = []
        while queue:
            index = queue.popleft()
            component.append(index)
            x, y = index % width, index // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < width and 0 <= ny < height:
                    neighbor = ny * width + nx
                    if pixels[neighbor] and not seen[neighbor]:
                        seen[neighbor] = 1
                        queue.append(neighbor)
        components.append(component)
    if not components:
        raise AssertionError("empty chroma-key cell")
    components.sort(key=len, reverse=True)
    threshold = max(8, len(components[0]) // 350)
    keep: set[int] = set()
    for component in components:
        if len(component) >= threshold:
            keep.update(component)
    source = image.load()
    output = Image.new("RGBA", image.size, CLEAR)
    target = output.load()
    for index in keep:
        x, y = index % width, index // width
        target[x, y] = source[x, y]
    return output


def extract_frames(sheet_path: Path) -> list[Image.Image]:
    """2x2 格 → 4 帧（裁到实际 bbox，尚未缩放）。象限顺序 (1)(2)(3)(4)。"""
    sheet = strip_green(Image.open(sheet_path).convert("RGBA"))
    half_w, half_h = sheet.width // 2, sheet.height // 2
    frames = []
    for index in range(4):
        col, row = index % 2, index // 2
        cell = sheet.crop((col * half_w, row * half_h, (col + 1) * half_w, (row + 1) * half_h))
        cell = meaningful_components(cell)
        bbox = cell.getchannel("A").getbbox()
        if bbox is None:
            raise AssertionError(f"empty frame {sheet_path.name}:{index}")
        frames.append(cell.crop(bbox))
    return frames


def fit_frame(cell: Image.Image, frame: int, scale: float) -> Image.Image:
    """按整招统一比例缩放 → 底边对齐进 frame x frame 画布（同 v1：留 3px 底边距）。"""
    resized = cell.resize(
        (max(1, round(cell.width * scale)), max(1, round(cell.height * scale))),
        Image.Resampling.NEAREST,
    )
    canvas = Image.new("RGBA", (frame, frame), CLEAR)
    canvas.alpha_composite(resized, ((frame - resized.width) // 2, frame - resized.height - 3))
    return canvas


def validate_frame(frame: Image.Image, label: str) -> None:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty frame: {label}")
    if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= frame.width or bbox[3] >= frame.height:
        raise AssertionError(f"frame touches edge: {label} {bbox}")
    if set(frame.getchannel("A").getdata()) - {0, 255}:
        raise AssertionError(f"partial alpha: {label}")
    for red, green, blue, alpha in frame.getdata():
        if alpha and green > 96 and green > red * 1.5 and green > blue * 1.5:
            raise AssertionError(f"green residue: {label}")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict = {
        "schemaVersion": 1,
        "note": "8-frame pilot atlases (horizontal strips), frame size matches boss-skills-v1",
        "skills": {},
    }
    for skill_id, frame, display, sheets in SKILLS:
        cells: list[Image.Image] = []
        for sheet in sheets:
            cells.extend(extract_frames(RAW_DIR / f"{sheet}.png"))
        # 整招统一缩放比例：以最大帧撑满 frame-6，避免逐帧归一化造成体型呼吸
        max_size = max(8, frame - 6)
        scale = min(max_size / max(c.width for c in cells), max_size / max(c.height for c in cells))
        atlas = Image.new("RGBA", (frame * 8, frame), CLEAR)
        for column, cell in enumerate(cells):
            fitted = fit_frame(cell, frame, scale)
            validate_frame(fitted, f"{skill_id}/{column}")
            atlas.alpha_composite(fitted, (column * frame, 0))
        atlas_path = OUT_DIR / f"{skill_id}-8f.png"
        atlas.save(atlas_path, optimize=True)
        manifest["skills"][skill_id] = {
            "atlas": atlas_path.name,
            "frame": frame,
            "frames": 8,
            "display": display,
            "loop": False,
            "sourceSheets": [f"{sheet}.png" for sheet in sheets],
        }
        preview = Image.new("RGBA", (frame * 8, frame), (12, 12, 16, 255))
        preview.alpha_composite(atlas)
        preview = preview.resize((preview.width * 4, preview.height * 4), Image.Resampling.NEAREST)
        preview.save(OUT_DIR / f"preview-{skill_id}.png", optimize=True)
        print(f"{skill_id}: atlas {atlas.width}x{atlas.height}, preview x4", flush=True)
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("done", flush=True)


if __name__ == "__main__":
    main()
