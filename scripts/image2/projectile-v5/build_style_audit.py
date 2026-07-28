#!/usr/bin/env python3
"""Build candidate-only projectile style comparisons at runtime scale."""

from pathlib import Path
import json
import sys

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

import process_vfx_ui_pack as pipeline  # noqa: E402


CANDIDATES = ROOT / "output/imagegen/zhe-yi-shen-vfx-ui-v1/candidates/projectile-v5"
OUTPUT = ROOT / "output/imagegen/zhe-yi-shen-vfx-ui-v1/candidates/projectile-style-audit-v1"
SHEETS = ("style-a-archive-grit", "style-b-clear-file", "style-c-ink-impact")


def cjk_font(size: int) -> ImageFont.FreeTypeFont:
    paths = (
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
        Path("/System/Library/Fonts/STHeiti Light.ttc"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
    )
    path = next((entry for entry in paths if entry.is_file()), None)
    if path is None:
        raise FileNotFoundError("a CJK font is required for the style audit")
    return ImageFont.truetype(str(path), size)


def add_ha_overlays(atlas_path: Path) -> None:
    atlas = Image.open(atlas_path).convert("RGBA")
    font = cjk_font(21)
    for index in (3, 7, 11):
        left = (index % 4) * 28
        top = (index // 4) * 28
        patch = atlas.crop((left, top, left + 28, top + 28))
        draw = ImageDraw.Draw(patch)
        bounds = draw.textbbox((0, 0), "哈", font=font, stroke_width=1)
        x = (28 - (bounds[2] - bounds[0])) // 2 - bounds[0]
        y = (28 - (bounds[3] - bounds[1])) // 2 - bounds[1]
        draw.text((x, y), "哈", font=font, fill=(245, 238, 221, 255), stroke_width=1, stroke_fill=(37, 31, 29, 255))
        patch = pipeline.quantize_hard(patch, colors=10, alpha_cut=48)
        atlas.paste(patch, (left, top), patch)
    atlas.save(atlas_path, optimize=True)


def make_zoom(atlas: Image.Image) -> None:
    zoom = atlas.resize((atlas.width * 8, atlas.height * 8), Image.Resampling.NEAREST)
    background = Image.new("RGBA", zoom.size, (23, 22, 26, 255))
    background.alpha_composite(zoom)
    background.convert("RGB").save(OUTPUT / "style-atlas-8x.png", optimize=True)


def make_stage_preview(atlas: Image.Image) -> None:
    stage = Image.open(ROOT / "src/assets/world/stage-floor-2.png").convert("RGBA")
    overlay = Image.new("RGBA", stage.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 14)
    x_positions = (86, 136, 186, 236)
    y_positions = (205, 325, 445)
    labels = ("A  DIRTY ARCHIVE", "B  CLEAR FILE", "C  INK IMPACT")
    for row, (y, label) in enumerate(zip(y_positions, labels)):
        draw.rectangle((70, y - 30, 290, y + 38), fill=(19, 18, 22, 182), outline=(177, 61, 72, 220), width=1)
        draw.text((78, y - 24), label, font=label_font, fill=(239, 228, 202, 255))
        for column, x in enumerate(x_positions):
            cell = atlas.crop((column * 28, row * 28, column * 28 + 28, row * 28 + 28))
            overlay.alpha_composite(cell, (x, y))
    stage.alpha_composite(overlay)
    stage.convert("RGB").save(OUTPUT / "style-on-stage-actual.png", optimize=True)
    stage.resize((720, 1280), Image.Resampling.NEAREST).convert("RGB").save(
        OUTPUT / "style-on-stage-2x.png", optimize=True,
    )


def main() -> None:
    missing = [name for name in SHEETS if not (CANDIDATES / f"{name}.png").is_file()]
    if missing:
        raise FileNotFoundError(f"missing style candidates: {missing}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pipeline.RAW = CANDIDATES
    specs = [(name, quadrant) for name in SHEETS for quadrant in range(4)]
    atlas_path = OUTPUT / "style-atlas-28.png"
    manifest_path = OUTPUT / "style-atlas-28.json"
    if not pipeline.build_grid_atlas(specs, cell=28, cols=4, out_png=atlas_path,
                                     out_json=manifest_path, logical=26, colors=10, soft=True):
        raise RuntimeError("style audit atlas build was skipped")
    add_ha_overlays(atlas_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["rows"] = {"A": 0, "B": 1, "C": 2}
    manifest["forms"] = ["wood-slash", "key", "marble", "laugh"]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    atlas = Image.open(atlas_path).convert("RGBA")
    make_zoom(atlas)
    make_stage_preview(atlas)
    print(OUTPUT / "style-atlas-8x.png")
    print(OUTPUT / "style-on-stage-2x.png")


if __name__ == "__main__":
    main()
