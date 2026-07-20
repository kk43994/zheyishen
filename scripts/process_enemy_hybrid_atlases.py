#!/usr/bin/env python3
"""把 image2 四姿态基底合成敌怪五行动作图集，覆盖 src/assets/enemies/*.png。

四格含义：Q1 站立 / Q2 移动 / Q3 攻击 / Q4 受击。
合成：idle=[Q1, Q1↑1]；move=[Q2, Q1↑1, Q2→1, Q1]；attack=[Q3, Q3↑1]；
hurt=[Q4 红闪35%, Q4 红闪50%+划痕]；death=Q4 按残差阈值溶解 4 帧。
校验：帧内互异、alpha 0/255、bbox 不贴边（1..30）。
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

from generate_enemy_bases_image2 import ENEMIES
from process_image2_props import keep_largest_component, strip_green

RAW_DIR = Path("output/imagegen/zhe-yi-shen-enemy-hybrid-v1/raw")
OUT_DIR = Path("output/imagegen/zhe-yi-shen-enemy-hybrid-v1")
ASSET_DIR = Path("src/assets/enemies")

FRAME = 32
LOGICAL_MAX = 28
MOTIONS = {"idle": 2, "move": 4, "attack": 2, "hurt": 2, "death": 4}
MOTION_ROWS = {motion: row for row, motion in enumerate(MOTIONS)}
HURT = (176, 47, 67)
PAPER = (218, 208, 186, 255)


def normalize_quadrant(cell: Image.Image) -> Image.Image:
    cell = keep_largest_component(cell)
    alpha = cell.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 120 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty quadrant after chroma key")
    sprite = cell.crop(bbox)
    ratio = min(LOGICAL_MAX / sprite.width, LOGICAL_MAX / sprite.height)
    logical = sprite.resize(
        (max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio))),
        Image.Resampling.NEAREST,
    )
    quantized = logical.quantize(
        colors=12, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE,
    ).convert("RGBA")
    hard = []
    for red, green, blue, alpha_value in quantized.getdata():
        hard.append((red, green, blue, 255 if alpha_value > 120 else 0))
    quantized.putdata(hard)
    return quantized


def place(sprite: Image.Image, dx: int = 0, dy: int = 0) -> Image.Image:
    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    x = 16 - sprite.width // 2 + dx
    y = 31 - sprite.height + dy
    frame.alpha_composite(sprite, (max(1, min(x, 31 - sprite.width)), max(1, min(y, 31 - sprite.height))))
    return frame


def red_flash(frame: Image.Image, strength: float) -> Image.Image:
    result = frame.copy()
    pixels = result.load()
    for y in range(FRAME):
        for x in range(FRAME):
            r, g, b, a = pixels[x, y]
            if a:
                pixels[x, y] = (
                    round(r + (HURT[0] - r) * strength),
                    round(g + (HURT[1] - g) * strength),
                    round(b + (HURT[2] - b) * strength),
                    255,
                )
    return result


def slash(frame: Image.Image) -> Image.Image:
    result = frame.copy()
    alpha = result.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        draw = ImageDraw.Draw(result)
        left, top, right, bottom = bbox
        draw.line((left + 2, top + 2, right - 3, bottom - 3), fill=PAPER)
    return result


def dissolve(frame: Image.Image, threshold: int) -> Image.Image:
    result = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    src = frame.load()
    dst = result.load()
    for y in range(1, FRAME - 1):
        for x in range(1, FRAME - 1):
            pixel = src[x, y]
            if pixel[3] == 0:
                continue
            residue = (x * 17 + y * 31 + x * y * 7 + x * x * 3 + y * y * 5) % 17
            if residue >= threshold:
                dst[x, y] = pixel
    return result


def validate(image: Image.Image, label: str) -> dict:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty frame: {label}")
    if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= FRAME or bbox[3] >= FRAME:
        raise AssertionError(f"frame touches edge: {label} {bbox}")
    alphas = {p[3] for p in image.getdata()}
    if not alphas.issubset({0, 255}):
        raise AssertionError(f"partial alpha: {label}")
    return {"bbox": list(bbox), "colors": len({p for p in image.getdata() if p[3]})}


def build_atlas(asset: str) -> tuple[Image.Image, dict]:
    sheet = strip_green(Image.open(RAW_DIR / f"{asset}.png"))
    half_w, half_h = sheet.width // 2, sheet.height // 2
    quads = []
    for slot in range(4):
        col, row = slot % 2, slot // 2
        cell = sheet.crop((col * half_w, row * half_h, (col + 1) * half_w, (row + 1) * half_h))
        quads.append(normalize_quadrant(cell))
    q_idle, q_move, q_attack, q_hurt = quads

    frames: dict[str, list[Image.Image]] = {
        "idle": [place(q_idle), place(q_idle, 0, -1)],
        "move": [place(q_move), place(q_idle, 0, -1), place(q_move, 1, 0), place(q_idle)],
        "attack": [place(q_attack), place(q_attack, 0, -1)],
        "hurt": [red_flash(place(q_hurt), 0.35), slash(red_flash(place(q_hurt), 0.5))],
        "death": [dissolve(place(q_hurt), t) for t in (0, 4, 9, 14)],
    }
    atlas = Image.new("RGBA", (FRAME * 4, FRAME * len(MOTIONS)), (0, 0, 0, 0))
    validation: dict[str, list] = {}
    for motion, motion_frames in frames.items():
        if len({f.tobytes() for f in motion_frames}) != len(motion_frames):
            raise AssertionError(f"duplicate frames: {asset}/{motion}")
        validation[motion] = [
            validate(f, f"{asset}/{motion}/{i}") for i, f in enumerate(motion_frames)
        ]
        for index, f in enumerate(motion_frames):
            atlas.alpha_composite(f, (index * FRAME, MOTION_ROWS[motion] * FRAME))
    return atlas, validation


def main() -> None:
    manifest: dict[str, object] = {}
    asset_bytes: dict[str, int] = {}
    contact_rows: list[tuple[str, Image.Image]] = []
    for asset, _identity, _poses in ENEMIES:
        atlas, validation = build_atlas(asset)
        path = ASSET_DIR / f"{asset}.png"
        atlas.save(path, optimize=True)
        asset_bytes[path.name] = path.stat().st_size
        manifest[asset] = validation
        contact_rows.append((asset, atlas))
        print(f"{asset}: {path.stat().st_size} bytes", flush=True)

    scale = 4
    sheet = Image.new("RGB", (140 + FRAME * scale * 5, 20 + FRAME * scale * len(contact_rows)), (19, 18, 24))
    draw = ImageDraw.Draw(sheet)
    for row, (asset, atlas) in enumerate(contact_rows):
        top = 20 + row * FRAME * scale
        draw.text((6, top + 8), asset, fill=(218, 209, 192))
        for col, motion in enumerate(MOTIONS):
            frame = atlas.crop((0, MOTION_ROWS[motion] * FRAME, FRAME, (MOTION_ROWS[motion] + 1) * FRAME))
            enlarged = frame.resize((FRAME * scale, FRAME * scale), Image.Resampling.NEAREST)
            sheet.paste(enlarged, (140 + col * FRAME * scale, top), enlarged)
    sheet.save(OUT_DIR / "enemy-hybrid-contact.png", optimize=True)
    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"asset_bytes": asset_bytes, "total": sum(asset_bytes.values()), "validation": manifest}, indent=2),
        encoding="utf-8",
    )
    print(f"total {sum(asset_bytes.values())} bytes across {len(contact_rows)} atlases")


if __name__ == "__main__":
    main()
