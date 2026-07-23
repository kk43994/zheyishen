#!/usr/bin/env python3
"""Build a same-scale visual audit for every gameplay art family.

This script is intentionally read-only with respect to runtime assets. It places
representative sprites on one board and records palette/detail metrics so an
Image2 candidate cannot look coherent in isolation but drift in the game.
"""

from __future__ import annotations

import json
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "art-audit-v1"
BOARD_PATH = OUT_DIR / "style-consistency-board.png"
REPORT_PATH = OUT_DIR / "style-consistency-report.json"
NORMALIZATION_PATH = OUT_DIR / "palette-normalization-preview.png"

NIGHT = "#111116"
RAISED = "#1B1A20"
INK = "#17151A"
SOFT_INK = "#3E3A3D"
PAPER = "#D8D0C1"
PAPER_DIM = "#AAA297"
OLD_RED = "#9F3548"
RAINCOAT = "#C6A44A"

SHARED_PALETTE = {
    "#08080B", "#111116", "#17151A", "#1B1A20", "#252229", "#30282A",
    "#3E3A3D", "#2B211D", "#3A2B24", "#4A352B", "#604536", "#78604A",
    "#8D7055", "#786F69", "#AAA297", "#D8D0C1", "#E8E1D3", "#642231",
    "#9F3548", "#75622F", "#C6A44A", "#283138", "#38434A", "#50616A",
    "#71818A", "#779887", "#B06961",
}
SHARED_RGB = {tuple(bytes.fromhex(color[1:])) for color in SHARED_PALETTE}

ENEMIES = (
    "src/assets/enemies/fear.png",
    "src/assets/enemies/red-mark.png",
    "src/assets/enemies/whisper.png",
    "src/assets/enemies/clockwork.png",
    "src/assets/enemies/debt.png",
    "src/assets/enemies/silent-father.png",
    "src/assets/enemies/silent-father-p2.png",
    "src/assets/enemies/lamp-keeper.png",
    "src/assets/canonical-v1/enemies/uniform-answer.png",
    "src/assets/enemies/cry-moth.png",
    "src/assets/canonical-v1/enemies/hunger-shadow.png",
    "src/assets/enemies/closet-dark.png",
    "src/assets/enemies/missed-call.png",
    "src/assets/enemies/silence.png",
    "src/assets/enemies/badge-thief.png",
    "src/assets/enemies/debt-collector.png",
    "src/assets/enemies/forgetter.png",
    "src/assets/enemies/empty-chair.png",
    "src/assets/enemies/last-bus.png",
)


def load(relative: str) -> Image.Image:
    return Image.open(ROOT / relative).convert("RGBA")


def crop_cells(relative: str, cell: tuple[int, int], indexes: range | list[int]) -> list[Image.Image]:
    atlas = load(relative)
    cell_w, cell_h = cell
    cols = atlas.width // cell_w
    cells = []
    for index in indexes:
        left = (index % cols) * cell_w
        top = (index // cols) * cell_h
        cells.append(atlas.crop((left, top, left + cell_w, top + cell_h)))
    return cells


def metrics(image: Image.Image) -> dict[str, float | int | bool]:
    rgba = image.convert("RGBA")
    visible = [(r, g, b, a) for r, g, b, a in rgba.getdata() if a]
    if not visible:
        return {
            "opaquePixels": 0,
            "visibleColors": 0,
            "sharedPaletteCoverage": 0.0,
            "sharedPaletteNearCoverage24": 0.0,
            "sharedPaletteMedianDistance": 0.0,
            "hardAlpha": True,
            "detailTransitionsPerOpaquePixel": 0.0,
        }
    colors = {(r, g, b) for r, g, b, _ in visible}
    exact = sum(1 for r, g, b, _ in visible if (r, g, b) in SHARED_RGB)
    distances = [
        min(sum((pixel[index] - candidate[index]) ** 2 for index in range(3)) ** 0.5 for candidate in SHARED_RGB)
        for pixel in ((r, g, b) for r, g, b, _ in visible)
    ]
    alpha_values = set(rgba.getchannel("A").getdata())

    transitions = 0
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            current = pixels[x, y]
            if current[3] == 0:
                continue
            if x + 1 < rgba.width:
                right = pixels[x + 1, y]
                transitions += int(right[3] > 0 and right[:3] != current[:3])
            if y + 1 < rgba.height:
                below = pixels[x, y + 1]
                transitions += int(below[3] > 0 and below[:3] != current[:3])

    return {
        "opaquePixels": len(visible),
        "visibleColors": len(colors),
        "sharedPaletteCoverage": round(exact / len(visible), 4),
        "sharedPaletteNearCoverage24": round(sum(distance <= 24 for distance in distances) / len(distances), 4),
        "sharedPaletteMedianDistance": round(median(distances), 2),
        "hardAlpha": alpha_values.issubset({0, 255}),
        "detailTransitionsPerOpaquePixel": round(transitions / len(visible), 4),
    }


def family_summary(cells: list[Image.Image]) -> dict:
    samples = [metrics(cell) for cell in cells]
    colors = [int(sample["visibleColors"]) for sample in samples]
    coverage = [float(sample["sharedPaletteCoverage"]) for sample in samples]
    near_coverage = [float(sample["sharedPaletteNearCoverage24"]) for sample in samples]
    palette_distance = [float(sample["sharedPaletteMedianDistance"]) for sample in samples]
    density = [float(sample["detailTransitionsPerOpaquePixel"]) for sample in samples]
    return {
        "samples": len(samples),
        "visibleColors": {"min": min(colors), "median": median(colors), "max": max(colors)},
        "sharedPaletteCoverageMedian": round(median(coverage), 4),
        "sharedPaletteNearCoverage24Median": round(median(near_coverage), 4),
        "sharedPaletteDistanceMedian": round(median(palette_distance), 2),
        "detailDensityMedian": round(median(density), 4),
        "hardAlpha": all(bool(sample["hardAlpha"]) for sample in samples),
    }


def normalize_palette(image: Image.Image) -> Image.Image:
    """Map a sprite to the core palette while preserving hard transparency."""
    source = image.convert("RGBA")
    cache: dict[tuple[int, int, int], tuple[int, int, int]] = {}
    output: list[tuple[int, int, int, int]] = []
    for red, green, blue, alpha in source.getdata():
        if alpha == 0:
            output.append((0, 0, 0, 0))
            continue
        pixel = (red, green, blue)
        if pixel not in cache:
            cache[pixel] = min(
                SHARED_RGB,
                key=lambda candidate: sum((pixel[index] - candidate[index]) ** 2 for index in range(3)),
            )
        mapped = cache[pixel]
        output.append((*mapped, 255))
    result = Image.new("RGBA", source.size)
    result.putdata(output)
    return result


def panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], title: str) -> None:
    x, y, width, height = box
    draw.rectangle((x, y, x + width, y + height), fill=RAISED, outline=SOFT_INK, width=2)
    draw.rectangle((x + 1, y + 1, x + width - 1, y + 32), fill=INK)
    draw.text((x + 12, y + 10), title, fill=PAPER, font=ImageFont.load_default())


def paste_cells(
    board: Image.Image,
    cells: list[Image.Image],
    origin: tuple[int, int],
    *,
    scale: int,
    columns: int,
    stride: tuple[int, int],
) -> None:
    for index, cell in enumerate(cells):
        sprite = cell.resize((cell.width * scale, cell.height * scale), Image.Resampling.NEAREST)
        x = origin[0] + (index % columns) * stride[0] + (stride[0] - sprite.width) // 2
        y = origin[1] + (index // columns) * stride[1] + (stride[1] - sprite.height) // 2
        board.alpha_composite(sprite, (x, y))


def normalization_preview(
    hero: list[Image.Image],
    enemies: list[Image.Image],
    items: list[Image.Image],
    props: list[Image.Image],
) -> None:
    width, height = 1680, 1320
    board = Image.new("RGBA", (width, height), NIGHT)
    draw = ImageDraw.Draw(board)
    font = ImageFont.load_default()
    draw.rectangle((0, 0, width, 92), fill=INK)
    draw.rectangle((0, 88, width, 92), fill=OLD_RED)
    draw.text((28, 24), "PALETTE NORMALIZATION / STATIC PREVIEW ONLY", fill=PAPER, font=font)
    draw.text(
        (28, 51),
        "left = current runtime, right = mechanical mapping diagnostic; no runtime file is changed",
        fill=PAPER_DIM,
        font=font,
    )

    rows = (
        ("HERO / identity anchor", hero, 3, 4, (124, 180), 190),
        ("ENEMIES / all 19 idle silhouettes", enemies, 3, 10, (104, 112), 280),
        ("ITEMS / representative 40 of 74", items[:40], 2, 10, (76, 74), 338),
        ("WORLD PROPS / all 24", props, 2, 8, (96, 92), 294),
    )
    y = 112
    for title, cells, scale, columns, stride, panel_height in rows:
        panel(draw, (24, y, 800, panel_height), f"CURRENT / {title}")
        panel(draw, (856, y, 800, panel_height), f"NORMALIZED / {title}")
        paste_cells(board, cells, (42, y + 42), scale=scale, columns=columns, stride=stride)
        paste_cells(
            board,
            [normalize_palette(cell) for cell in cells],
            (874, y + 42),
            scale=scale,
            columns=columns,
            stride=stride,
        )
        y += panel_height + 20

    draw.text(
        (28, 1288),
        "Diagnostic only, not a recommendation. VFX are excluded because semantic colors outrank exact palette matching.",
        fill=RAINCOAT,
        font=font,
    )
    board.convert("RGB").save(NORMALIZATION_PATH, optimize=True)


def main() -> None:
    hero = crop_cells("src/assets/hero-style1-profiles/hero-idle.png", (40, 56), [0, 2, 4, 6])
    enemy_cells = [load(relative).crop((0, 0, 32, 32)) for relative in ENEMIES]
    item_cells = crop_cells("src/assets/items/icons.png", (36, 36), list(range(74)))
    runtime_props = crop_cells("src/assets/world/props.png", (40, 44), list(range(24)))

    candidate_relative = "output/imagegen/zhe-yi-shen-props-reference-v2/processed/props-six-stage-atlas.png"
    candidate_path = ROOT / candidate_relative
    candidate_props = crop_cells(candidate_relative, (40, 44), list(range(24))) if candidate_path.is_file() else []

    projectiles = crop_cells("src/assets/vfx/projectiles.png", (28, 28), list(range(12)))
    hits = crop_cells("src/assets/vfx/hits.png", (32, 32), list(range(16)))

    families = {
        "hero": family_summary(hero),
        "enemies": family_summary(enemy_cells),
        "items": family_summary(item_cells),
        "runtimeProps": family_summary(runtime_props),
        "projectiles": family_summary(projectiles),
        "hits": family_summary(hits),
    }
    if candidate_props:
        families["candidateProps"] = family_summary(candidate_props)

    report = {
        "runtimeMutated": False,
        "visualContract": {
            "logicalPixelScaling": "nearest-neighbor only",
            "outline": "one logical pixel; night/ink family",
            "lightDirection": "top-left",
            "screenAccentLimit": 1,
            "sharedPalette": sorted(SHARED_PALETTE),
        },
        "families": families,
        "candidateDecision": "review-only; no runtime promotion" if candidate_props else "not present",
        "normalizationPreview": str(NORMALIZATION_PATH.relative_to(ROOT)),
    }

    width, height = 1680, 1850
    board = Image.new("RGBA", (width, height), NIGHT)
    draw = ImageDraw.Draw(board)
    font = ImageFont.load_default()
    draw.rectangle((0, 0, width, 92), fill=INK)
    draw.rectangle((0, 88, width, 92), fill=OLD_RED)
    draw.text((28, 24), "ZHE YI SHEN / SAME-SCALE STYLE CONSISTENCY AUDIT", fill=PAPER, font=font)
    draw.text((28, 51), "runtime on the left, review-only candidates on the right", fill=PAPER_DIM, font=font)

    panel(draw, (24, 112, 520, 302), "HERO / fixed rig / 40x56 / 4 directions")
    paste_cells(board, hero, (44, 160), scale=3, columns=4, stride=(118, 190))

    panel(draw, (568, 112, 1088, 302), "ENEMIES / actual idle frames / 32x32 / all 19")
    paste_cells(board, enemy_cells, (586, 152), scale=3, columns=10, stride=(104, 116))

    panel(draw, (24, 438, 808, 660), "RUNTIME ITEMS / all 74 / 36x36")
    paste_cells(board, item_cells, (40, 478), scale=2, columns=10, stride=(78, 76))

    panel(draw, (856, 438, 800, 318), "RUNTIME PROPS / 6 stages x 4 / 40x44")
    paste_cells(board, runtime_props, (870, 478), scale=2, columns=8, stride=(96, 90))

    panel(draw, (856, 780, 800, 318), "CANDIDATE PROPS / review only / same 40x44 contract")
    if candidate_props:
        paste_cells(board, candidate_props, (870, 820), scale=2, columns=8, stride=(96, 90))
    else:
        draw.text((892, 842), "candidate atlas not present", fill=PAPER_DIM, font=font)

    panel(draw, (24, 1122, 808, 284), "PROJECTILES / 28x28 / real logical scale x3")
    paste_cells(board, projectiles, (54, 1174), scale=3, columns=6, stride=(122, 104))

    panel(draw, (856, 1122, 800, 284), "HITS / 32x32 / real logical scale x3")
    paste_cells(board, hits, (884, 1170), scale=3, columns=8, stride=(92, 104))

    panel(draw, (24, 1430, 1632, 392), "METRICS / diagnostic, not a substitute for visual review")
    headers = ("family", "samples", "colors min/med/max", "palette near <=24", "median distance", "detail median", "hard alpha")
    columns = (44, 258, 386, 646, 884, 1114, 1340)
    for x, value in zip(columns, headers):
        draw.text((x, 1478), value, fill=RAINCOAT, font=font)
    for row, (name, summary) in enumerate(families.items()):
        y = 1514 + row * 40
        color_range = summary["visibleColors"]
        values = (
            name,
            str(summary["samples"]),
            f'{color_range["min"]}/{color_range["median"]}/{color_range["max"]}',
            f'{summary["sharedPaletteNearCoverage24Median"]:.1%}',
            f'{summary["sharedPaletteDistanceMedian"]:.1f}',
            f'{summary["detailDensityMedian"]:.3f}',
            "yes" if summary["hardAlpha"] else "NO",
        )
        for x, value in zip(columns, values):
            draw.text((x, y), value, fill=PAPER if row % 2 == 0 else PAPER_DIM, font=font)

    draw.text(
        (44, 1790),
        "Gate: same logical pixels + one-pixel outline + top-left light + shared material language; Image2 never promotes itself.",
        fill=OLD_RED,
        font=font,
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(BOARD_PATH, optimize=True)
    normalization_preview(hero, enemy_cells, item_cells, runtime_props)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(BOARD_PATH.relative_to(ROOT))
    print(NORMALIZATION_PATH.relative_to(ROOT))
    print(REPORT_PATH.relative_to(ROOT))


if __name__ == "__main__":
    main()
