#!/usr/bin/env python3
"""把 image2 的 UI 基底图规整成运行时纹理与饰件。

四格：Q1 旧档案纸纹理 / Q2 暗夜布纹 / Q3 角花（绿幕）/ Q4 无字章饰（绿幕）。
输出 src/assets/ui/paper-texture.png（192², 亮度归一到纸白，供 multiply 叠加）、
night-texture.png（192², 供低透明度叠加）、corner-ornament.png、seal-ornament.png。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from process_image2_props import keep_largest_component, strip_green

RAW = Path("output/imagegen/zhe-yi-shen-ui-hybrid-v1/raw/ui.png")
OUT_DIR = Path("output/imagegen/zhe-yi-shen-ui-hybrid-v1")
UI_DIR = Path("src/assets/ui")

TEXTURE_SIZE = 192


def quadrant(sheet: Image.Image, index: int, inset: int = 24) -> Image.Image:
    half_w, half_h = sheet.width // 2, sheet.height // 2
    col, row = index % 2, index // 2
    return sheet.crop((
        col * half_w + inset, row * half_h + inset,
        (col + 1) * half_w - inset, (row + 1) * half_h - inset,
    ))


def normalize_texture(cell: Image.Image, target_median: int) -> Image.Image:
    logical = cell.convert("RGB").resize((TEXTURE_SIZE, TEXTURE_SIZE), Image.Resampling.NEAREST)
    values = sorted(sum(pixel) // 3 for pixel in logical.getdata())
    median = max(1, values[len(values) // 2])
    scale = target_median / median
    adjusted = logical.point(lambda value: max(0, min(255, round(value * scale))))
    quantized = adjusted.quantize(colors=8, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    return quantized.convert("RGB")


def normalize_ornament(cell: Image.Image, max_size: int) -> Image.Image:
    cell = keep_largest_component(strip_green(cell))
    alpha = cell.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 120 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty ornament after chroma key")
    sprite = cell.crop(bbox)
    ratio = min(max_size / sprite.width, max_size / sprite.height)
    logical = sprite.resize(
        (max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio))),
        Image.Resampling.NEAREST,
    )
    quantized = logical.quantize(colors=8, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGBA")
    hard = []
    for red, green, blue, alpha_value in quantized.getdata():
        hard.append((red, green, blue, 255) if alpha_value > 120 else (0, 0, 0, 0))
    quantized.putdata(hard)
    return quantized


def main() -> None:
    sheet = Image.open(RAW).convert("RGBA")
    UI_DIR.mkdir(parents=True, exist_ok=True)

    paper = normalize_texture(quadrant(sheet, 0), 232)
    paper.save(UI_DIR / "paper-texture.png", optimize=True)
    night = normalize_texture(quadrant(sheet, 1), 30)
    night.save(UI_DIR / "night-texture.png", optimize=True)
    corner = normalize_ornament(quadrant(sheet, 2), 24)
    corner.save(UI_DIR / "corner-ornament.png", optimize=True)
    seal = normalize_ornament(quadrant(sheet, 3), 56)
    seal.save(UI_DIR / "seal-ornament.png", optimize=True)

    contact = Image.new("RGB", (TEXTURE_SIZE * 2 + 120, TEXTURE_SIZE + 20), (24, 22, 30))
    contact.paste(paper, (10, 10))
    contact.paste(night, (TEXTURE_SIZE + 20, 10))
    corner_bg = Image.new("RGBA", (56, 56), (216, 208, 193, 255))
    corner_bg.alpha_composite(corner.resize((corner.width * 2, corner.height * 2), Image.Resampling.NEAREST), (4, 4))
    contact.paste(corner_bg.convert("RGB"), (TEXTURE_SIZE * 2 + 40, 10))
    seal_bg = Image.new("RGBA", (60, 60), (216, 208, 193, 255))
    seal_bg.alpha_composite(seal, (2, 2))
    contact.paste(seal_bg.convert("RGB"), (TEXTURE_SIZE * 2 + 40, 80))
    contact.save(OUT_DIR / "ui-textures-contact.png", optimize=True)
    for name in ("paper-texture", "night-texture", "corner-ornament", "seal-ornament"):
        print(name, (UI_DIR / f"{name}.png").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
