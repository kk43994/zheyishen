#!/usr/bin/env python3
"""VFX/UI 资源包规整：把 generate_vfx_ui_pack_image2.py 的基底图切格、抠绿、
量化、降采样成运行时资产。raw 缺失的族自动跳过，可断点重复执行。

用法：python3 scripts/process_vfx_ui_pack.py [族名...]
族名：proj hits saves syn status poison frames archive rooms grounds chapters fates endings promos
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAW = Path("output/imagegen/zhe-yi-shen-vfx-ui-v1/raw")
ASSETS = Path("src/assets")


def strip_green(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    cleaned = []
    for red, green, blue, alpha in result.getdata():
        is_green = green > 96 and green > red * 1.35 and green > blue * 1.35
        is_spill = green > 60 and green > red * 1.2 and green > blue * 1.2 and max(red, blue) < 120
        cleaned.append((red, green, blue, 0 if (is_green or is_spill) else alpha))
    result.putdata(cleaned)
    return result


def largest_component(sprite: Image.Image, keep_ratio: float = 0.06) -> Image.Image:
    """去掉生图杂块：保留面积 >= 最大连通域 keep_ratio 的部件（特效可能天然多块）。"""
    width, height = sprite.size
    pixels = sprite.load()
    seen = [[False] * width for _ in range(height)]
    components: list[list[tuple[int, int]]] = []
    for start_y in range(height):
        for start_x in range(width):
            if seen[start_y][start_x] or pixels[start_x, start_y][3] == 0:
                continue
            stack = [(start_x, start_y)]
            seen[start_y][start_x] = True
            component = []
            while stack:
                x, y = stack.pop()
                component.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1), (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1)):
                    if 0 <= nx < width and 0 <= ny < height and not seen[ny][nx] and pixels[nx, ny][3] > 0:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            components.append(component)
    if not components:
        return sprite
    biggest = max(len(component) for component in components)
    keep = {point for component in components if len(component) >= biggest * keep_ratio for point in component}
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] > 0 and (x, y) not in keep:
                pixels[x, y] = (0, 0, 0, 0)
    return sprite


def quantize_hard(sprite: Image.Image, colors: int = 12, alpha_cut: int = 120) -> Image.Image:
    quantized = sprite.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGBA")
    hard = [
        (r, g, b, 255) if a > alpha_cut else (0, 0, 0, 0)
        for r, g, b, a in quantized.getdata()
    ]
    quantized.putdata(hard)
    return quantized


def tint_alpha_sprite(sprite: Image.Image, color: str) -> Image.Image:
    """把生成图的杂色收进统一色相，同时保留像素明暗和透明轮廓。"""
    base = tuple(int(color[index:index + 2], 16) for index in (1, 3, 5))
    tinted = []
    for red, green, blue, alpha in sprite.convert("RGBA").getdata():
        if alpha == 0:
            tinted.append((0, 0, 0, 0))
            continue
        luminance = (red * 30 + green * 59 + blue * 11) / 25500
        shade = 0.54 + luminance * 0.62
        tinted.append(tuple(min(255, round(channel * shade)) for channel in base) + (alpha,))
    result = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
    result.putdata(tinted)
    return result


def cell_sprite(sheet: Image.Image, quadrant: int, logical: int, colors: int = 12, soft: bool = False) -> Image.Image:
    """取 2x2 格中的一格 → 抠绿 → 裁边 → 等比降到 logical 内接 → 量化。"""
    half_w, half_h = sheet.width // 2, sheet.height // 2
    x, y = (quadrant % 2) * half_w, (quadrant // 2) * half_h
    cell = strip_green(sheet.crop((x, y, x + half_w, y + half_h)))
    cell = largest_component(cell)
    bbox = cell.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"empty quadrant {quadrant}")
    sprite = cell.crop(bbox)
    ratio = min(logical / sprite.width, logical / sprite.height)
    resized = sprite.resize((max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio))), Image.Resampling.NEAREST)
    return quantize_hard(resized, colors, alpha_cut=40 if soft else 120)


def paste_center(atlas: Image.Image, sprite: Image.Image, cell: int, col: int, row: int) -> None:
    atlas.paste(sprite, (col * cell + (cell - sprite.width) // 2, row * cell + (cell - sprite.height) // 2), sprite)


def build_grid_atlas(specs: list[tuple[str, int]], cell: int, cols: int, out_png: Path, out_json: Path, logical: int, colors: int = 12, soft: bool = False) -> bool:
    """specs: [(raw名, 象限)]，顺序即索引。全部 raw 就绪才构建。"""
    needed = {name for name, _ in specs}
    if any(not (RAW / f"{name}.png").exists() for name in needed):
        return False
    sheets = {name: Image.open(RAW / f"{name}.png").convert("RGBA") for name in needed}
    rows = (len(specs) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
    for index, (name, quadrant) in enumerate(specs):
        sprite = cell_sprite(sheets[name], quadrant, logical, colors, soft)
        paste_center(atlas, sprite, cell, index % cols, index // cols)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(out_png, optimize=True)
    out_json.write_text(json.dumps({"cell": cell, "cols": cols, "rows": rows}), encoding="utf-8")
    return True


def tile_texture(name: str, out: Path, size: int = 192, colors: int = 10, darken: float = 1.0) -> bool:
    src = RAW / f"{name}.png"
    if not src.exists():
        return False
    half = size // 2
    base = Image.open(src).convert("RGB").resize((half, half), Image.Resampling.NEAREST)
    image = Image.new("RGB", (size, size))
    image.paste(base, (0, 0))
    image.paste(base.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (half, 0))
    image.paste(base.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, half))
    image.paste(base.transpose(Image.Transpose.ROTATE_180), (half, half))
    if darken != 1.0:
        image = image.point(lambda v: int(v * darken))
    image = image.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGB")
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, optimize=True)
    return True


def full_scene(name: str, out: Path, size: tuple[int, int], colors: int = 24, darken: float = 1.0) -> bool:
    src = RAW / f"{name}.png"
    if not src.exists():
        return False
    image = Image.open(src).convert("RGB")
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    scaled = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (scaled.width - target_w) // 2
    top = (scaled.height - target_h) // 2
    cropped = scaled.crop((left, top, left + target_w, top + target_h))
    if darken != 1.0:
        cropped = cropped.point(lambda v: int(v * darken))
    cropped = cropped.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGB")
    out.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(out, optimize=True)
    return True


# ── 各族 ──────────────────────────────────────────────────────────

def do_proj() -> bool:
    specs = [
        ("proj-breath", 0), ("proj-breath", 1), ("proj-breath", 2), ("proj-breath", 3),
        ("proj-forms", 0), ("proj-forms", 1), ("proj-forms", 2), ("proj-forms", 3),
        ("proj-special", 0), ("proj-special", 1), ("proj-special", 2), ("proj-special", 3),
        ("proj-wood-slash-v2", 1), ("proj-readable-a", 1), ("proj-readable-a", 2), ("proj-readable-a", 3),
        ("proj-readable-b", 0), ("proj-readable-b", 1), ("proj-readable-b", 2), ("proj-readable-b", 3),
        ("proj-readable-c", 0), ("proj-readable-c", 1), ("proj-readable-c", 2), ("proj-readable-c", 3),
    ]
    ok = build_grid_atlas(specs, cell=28, cols=6, out_png=ASSETS / "vfx/projectiles.png",
                          out_json=ASSETS / "vfx/projectiles.json", logical=26, colors=8, soft=True)
    if ok:
        names = [
            "breath0", "breath1", "breath2", "breath3", "paper", "rain", "sound", "key", "bone", "tear", "cone", "echo",
            "slash", "razor", "marble", "ice", "serial", "typing", "button", "link", "stamp", "stone", "lens", "laugh",
        ]
        manifest = json.loads((ASSETS / "vfx/projectiles.json").read_text())
        manifest["index"] = {name: index for index, name in enumerate(names)}
        manifest["generator"] = "reference-aware Image2 bases + scripts/process_vfx_ui_pack.py"
        manifest["designContract"] = "src/projectile-item-signatures.ts"
        manifest["provenance"] = "src/assets/vfx/projectiles.sources.json"
        manifest["sourceSheets"] = ["proj-breath", "proj-forms", "proj-special", "proj-readable-a", "proj-readable-b", "proj-readable-c", "proj-wood-slash-v2"]
        manifest["deterministicOverlays"] = {"laugh": "哈"}
        # Image2 supplies the breath/ink base. Exact Chinese text is rendered in
        # post-processing so the five-shot volley always spells 哈哈哈哈哈.
        atlas_path = ASSETS / "vfx/projectiles.png"
        atlas = Image.open(atlas_path).convert("RGBA")
        index = manifest["index"]["laugh"]
        cell = manifest["cell"]
        left = (index % manifest["cols"]) * cell
        top = (index // manifest["cols"]) * cell
        patch = atlas.crop((left, top, left + cell, top + cell))
        font_paths = [
            Path("/System/Library/Fonts/STHeiti Medium.ttc"),
            Path("/System/Library/Fonts/STHeiti Light.ttc"),
            Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
        ]
        font_path = next((path for path in font_paths if path.is_file()), None)
        if font_path is None:
            raise FileNotFoundError("a CJK font is required to render the 五个哈 projectile")
        font = ImageFont.truetype(str(font_path), 21)
        draw = ImageDraw.Draw(patch)
        bounds = draw.textbbox((0, 0), "哈", font=font, stroke_width=1)
        width = bounds[2] - bounds[0]
        height = bounds[3] - bounds[1]
        x = (cell - width) // 2 - bounds[0]
        y = (cell - height) // 2 - bounds[1]
        draw.text((x, y), "哈", font=font, fill=(245, 238, 221, 255), stroke_width=1, stroke_fill=(48, 43, 50, 255))
        patch = quantize_hard(patch, colors=8, alpha_cut=48)
        atlas.paste(patch, (left, top), patch)
        atlas.save(atlas_path, optimize=True)
        (ASSETS / "vfx/projectiles.json").write_text(json.dumps(manifest), encoding="utf-8")
    return ok


def do_hits() -> bool:
    specs = [(f"hit-{material}", frame) for material in ("mist", "water", "crit", "paper") for frame in range(4)]
    ok = build_grid_atlas(specs, cell=32, cols=4, out_png=ASSETS / "vfx/hits.png",
                          out_json=ASSETS / "vfx/hits.json", logical=30, colors=8, soft=True)
    if ok:
        manifest = json.loads((ASSETS / "vfx/hits.json").read_text())
        manifest["materials"] = ["mist", "water", "crit", "paper"]
        (ASSETS / "vfx/hits.json").write_text(json.dumps(manifest), encoding="utf-8")
        # 暴击首帧生图易塌成色块：用第 2 帧缩小 55% 重建"亮点初闪"
        atlas = Image.open(ASSETS / "vfx/hits.png").convert("RGBA")
        star = atlas.crop((32, 64, 64, 96))
        small = star.resize((18, 18), Image.Resampling.NEAREST)
        patch = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        patch.paste(small, (7, 7), small)
        atlas.paste(patch, (0, 64))
        atlas.save(ASSETS / "vfx/hits.png", optimize=True)
    return ok


def do_saves() -> bool:
    specs = [(f"save-{kind}", frame) for kind in ("tooth", "photo", "shutdown") for frame in range(4)]
    ok = build_grid_atlas(specs, cell=40, cols=4, out_png=ASSETS / "vfx/saves.png",
                          out_json=ASSETS / "vfx/saves.json", logical=38, colors=10, soft=True)
    if ok:
        manifest = json.loads((ASSETS / "vfx/saves.json").read_text())
        manifest["kinds"] = ["tooth", "photo", "shutdown"]
        (ASSETS / "vfx/saves.json").write_text(json.dumps(manifest), encoding="utf-8")
    static_ok = tile_texture("save-static", ASSETS / "ui/static-texture.png", size=192, colors=8)
    return ok or static_ok


def do_syn() -> bool:
    specs = [("syn-overlays", quadrant) for quadrant in range(4)]
    ok = build_grid_atlas(specs, cell=26, cols=4, out_png=ASSETS / "vfx/synergy.png",
                          out_json=ASSETS / "vfx/synergy.json", logical=24, colors=8, soft=True)
    if ok:
        manifest = json.loads((ASSETS / "vfx/synergy.json").read_text())
        manifest["index"] = {"ice": 0, "crack": 1, "collapse": 2, "arc": 3}
        (ASSETS / "vfx/synergy.json").write_text(json.dumps(manifest), encoding="utf-8")
    return ok


def do_status() -> bool:
    specs = [
        *[("status-marks", quadrant) for quadrant in range(4)],
        *[("status-materials", quadrant) for quadrant in range(4)],
    ]
    ok = build_grid_atlas(specs, cell=12, cols=4, out_png=ASSETS / "vfx/status.png",
                          out_json=ASSETS / "vfx/status.json", logical=11, colors=6)
    if ok:
        manifest = json.loads((ASSETS / "vfx/status.json").read_text())
        manifest["index"] = {
            "freeze": 0, "paralyze": 1, "read": 2, "loop": 3,
            "wet": 4, "raw": 5, "heavy": 6, "control-fatigue": 7,
        }
        manifest["generator"] = "reference-aware Image2 bases + scripts/process_vfx_ui_pack.py"
        manifest["provenance"] = "src/assets/vfx/status.sources.json"
        (ASSETS / "vfx/status.json").write_text(json.dumps(manifest), encoding="utf-8")
    return ok


def do_poison() -> bool:
    specs = [("poison-a", 0), ("poison-a", 1), ("poison-a", 2), ("poison-a", 3), ("poison-b", 0)]
    ok = build_grid_atlas(specs, cell=20, cols=5, out_png=ASSETS / "ui/poison.png",
                          out_json=ASSETS / "ui/poison.json", logical=18, colors=8)
    if ok:
        manifest = json.loads((ASSETS / "ui/poison.json").read_text())
        manifest["index"] = {"greed": 0, "anger": 1, "delusion": 2, "pride": 3, "doubt": 4}
        (ASSETS / "ui/poison.json").write_text(json.dumps(manifest), encoding="utf-8")
    joystick = build_grid_atlas([("poison-b", 1), ("poison-b", 2)], cell=48, cols=2,
                                out_png=ASSETS / "ui/joystick.png", out_json=ASSETS / "ui/joystick.json",
                                logical=46, colors=8)
    return ok or joystick


def do_frames() -> bool:
    ok = False
    if (RAW / "frame-quality.png").exists():
        sheet = Image.open(RAW / "frame-quality.png").convert("RGBA")
        atlas = Image.new("RGBA", (128, 56 * 4), (0, 0, 0, 0))
        # 品质只改变档案批注色，不另起一套霓虹语言。
        quality_colors = ("#71818A", "#8A7D68", "#9F3548", "#C6A44A")
        for quadrant in range(4):
            half_w, half_h = sheet.width // 2, sheet.height // 2
            x, y = (quadrant % 2) * half_w, (quadrant // 2) * half_h
            cell = strip_green(sheet.crop((x, y, x + half_w, y + half_h)))
            bbox = cell.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
            if bbox is None:
                continue
            frame = cell.crop(bbox).resize((128, 56), Image.Resampling.NEAREST)
            frame = tint_alpha_sprite(quantize_hard(frame, 10), quality_colors[quadrant])
            atlas.paste(frame, (0, quadrant * 56), frame)
        (ASSETS / "ui").mkdir(parents=True, exist_ok=True)
        atlas.save(ASSETS / "ui/record-frames.png", optimize=True)
        ok = True
    if (RAW / "frame-panels.png").exists():
        sheet = Image.open(RAW / "frame-panels.png").convert("RGBA")
        targets = [("panel-frame.png", 120, 160), ("button-frame.png", 96, 30), ("torn-edge.png", 160, 14), ("receipt-edge.png", 160, 14)]
        for quadrant, (name, width, height) in enumerate(targets):
            half_w, half_h = sheet.width // 2, sheet.height // 2
            x, y = (quadrant % 2) * half_w, (quadrant // 2) * half_h
            cell = strip_green(sheet.crop((x, y, x + half_w, y + half_h)))
            bbox = cell.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
            if bbox is None:
                continue
            piece = quantize_hard(cell.crop(bbox).resize((width, height), Image.Resampling.NEAREST), 10)
            piece.save(ASSETS / "ui" / name, optimize=True)
        ok = True
    return ok


def do_archive() -> bool:
    specs = [("archive-deco", quadrant) for quadrant in range(4)]
    ok = build_grid_atlas(specs, cell=36, cols=4, out_png=ASSETS / "ui/archive-deco.png",
                          out_json=ASSETS / "ui/archive-deco.json", logical=34, colors=10)
    if ok:
        manifest = json.loads((ASSETS / "ui/archive-deco.json").read_text())
        manifest["index"] = {"tape": 0, "clip": 1, "postmark": 2, "seal": 3}
        (ASSETS / "ui/archive-deco.json").write_text(json.dumps(manifest), encoding="utf-8")
    desk = tile_texture("archive-desk", ASSETS / "ui/desk-texture.png", size=192, colors=8, darken=0.9)
    return ok or desk


def do_rooms() -> bool:
    ok = False
    for name, out in (("room-lamp", "rooms/lamp.png"), ("room-inner", "rooms/inner.png"), ("room-pawn", "rooms/pawn.png")):
        ok = full_scene(name, ASSETS / out, (360, 640), colors=28, darken=0.82) or ok
    return ok


def do_grounds() -> bool:
    """六章地面：64 逻辑格 → 128 镜像四拼消缝。章节顺序 wood terrazzo metal carpet hospital asphalt。"""
    sources = [("ground-a", 0), ("ground-a", 1), ("ground-b", 0), ("ground-a", 2), ("ground-a", 3), ("ground-b", 1)]
    if any(not (RAW / f"{name}.png").exists() for name, _ in sources):
        return False
    (ASSETS / "world").mkdir(parents=True, exist_ok=True)
    for chapter, (name, quadrant) in enumerate(sources):
        sheet = Image.open(RAW / f"{name}.png").convert("RGB")
        half = sheet.width // 2
        x, y = (quadrant % 2) * half, (quadrant // 2) * half
        swatch = sheet.crop((x + 40, y + 40, x + half - 40, y + half - 40)).resize((64, 64), Image.Resampling.NEAREST)
        swatch = swatch.point(lambda v: int(v * 0.5))
        tile = Image.new("RGB", (128, 128))
        tile.paste(swatch, (0, 0))
        tile.paste(swatch.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (64, 0))
        tile.paste(swatch.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, 64))
        tile.paste(swatch.transpose(Image.Transpose.ROTATE_180), (64, 64))
        tile = tile.quantize(colors=8, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGB")
        tile.save(ASSETS / f"world/ground-{chapter}.png", optimize=True)
    return True


def do_chapters() -> bool:
    specs = [("chapter-a", 0), ("chapter-a", 1), ("chapter-a", 2), ("chapter-a", 3), ("chapter-b", 0), ("chapter-b", 1)]
    if any(not (RAW / f"{name}.png").exists() for name, _ in specs):
        return False
    atlas = Image.new("RGBA", (96, 52 * 6), (0, 0, 0, 0))
    for index, (name, quadrant) in enumerate(specs):
        sheet = Image.open(RAW / f"{name}.png").convert("RGBA")
        half = sheet.width // 2
        x, y = (quadrant % 2) * half, (quadrant // 2) * half
        cell = strip_green(sheet.crop((x, y, x + half, y + half)))
        bbox = cell.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        if bbox is None:
            continue
        scene = cell.crop(bbox)
        scale = max(96 / scene.width, 52 / scene.height)
        scene = scene.resize((round(scene.width * scale), round(scene.height * scale)), Image.Resampling.NEAREST)
        left = (scene.width - 96) // 2
        top = (scene.height - 52) // 2
        scene = scene.crop((left, top, left + 96, top + 52))
        backdrop = Image.new("RGBA", (96, 52), (12, 12, 16, 255))
        backdrop.alpha_composite(scene)
        backdrop = backdrop.point(lambda v: int(v * 0.85))
        atlas.paste(quantize_hard(backdrop, 14, alpha_cut=0), (0, index * 52))
    (ASSETS / "ui").mkdir(parents=True, exist_ok=True)
    atlas.save(ASSETS / "ui/chapter-strips.png", optimize=True)
    return True


def do_fates() -> bool:
    specs = [("fate-profile-a", 0), ("fate-profile-a", 1), ("fate-profile-a", 2), ("fate-profile-a", 3), ("fate-profile-b", 0), ("fate-profile-b", 1)]
    ok = build_grid_atlas(specs, cell=30, cols=6, out_png=ASSETS / "ui/fate-profiles.png",
                          out_json=ASSETS / "ui/fate-profiles.json", logical=28, colors=10)
    if ok:
        manifest = json.loads((ASSETS / "ui/fate-profiles.json").read_text())
        manifest["index"] = {"微光": 0, "交换": 1, "诱惑": 2, "反噬": 3, "荒诞": 4, "沉默": 5}
        (ASSETS / "ui/fate-profiles.json").write_text(json.dumps(manifest), encoding="utf-8")
    return ok


def do_endings() -> bool:
    ok = full_scene("ending-table", ASSETS / "ui/ending-table.png", (360, 640), colors=24, darken=0.9)
    ok = full_scene("ending-lampman", ASSETS / "ui/ending-lampman.png", (360, 640), colors=24, darken=0.95) or ok
    return ok


def do_promos() -> bool:
    promo_dir = Path("docs/promo")
    ok = full_scene("promo-cover", promo_dir / "cover-3x4.png", (768, 1024), colors=32, darken=0.96)
    ok = full_scene("promo-banner", promo_dir / "banner-16x9.png", (1280, 720), colors=32, darken=0.96) or ok
    return ok


FAMILIES = {
    "proj": do_proj, "hits": do_hits, "saves": do_saves, "syn": do_syn, "status": do_status,
    "poison": do_poison, "frames": do_frames, "archive": do_archive, "rooms": do_rooms,
    "grounds": do_grounds, "chapters": do_chapters, "fates": do_fates, "endings": do_endings,
    "promos": do_promos,
}


def main() -> None:
    picked = sys.argv[1:] or list(FAMILIES)
    failed = False
    for family in picked:
        handler = FAMILIES.get(family)
        if handler is None:
            print(f"{family}: unknown family")
            failed = True
            continue
        try:
            print(f"{family}: {'done' if handler() else 'skip (raw missing)'}", flush=True)
        except Exception as error:  # noqa: BLE001
            print(f"{family}: FAILED · {error}", flush=True)
            failed = True
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
