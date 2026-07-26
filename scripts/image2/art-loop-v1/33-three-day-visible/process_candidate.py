#!/usr/bin/env python3
"""Build and gate the four-stage behind-hero frame deletion overlay for item 33."""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


CELL_W = 40
CELL_H = 56
STAGES = ("full", "missing-corner", "two-segments", "delete")
HERO_SHEET = Path("output/art-canonical-v1/approved/hero-style1-4dir.png")
OUTPUT_ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/33-three-day-visible")
REVIEW_BG = (20, 19, 25, 255)
DEFAULT_PALETTE = {
    "outline": (43, 38, 45, 255),
    "wood": (116, 88, 68, 255),
    "highlight": (185, 150, 112, 255),
    "photo": (91, 82, 88, 255),
    "paper": (154, 139, 126, 255),
}


def strip_green(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    keyed = (
        (green > 96)
        & (green * 100 > red * 135)
        & (green * 100 > blue * 135)
    ) | (
        (green > 60)
        & (green * 100 > red * 120)
        & (green * 100 > blue * 120)
        & (np.maximum(red, blue) < 125)
    )
    near_key = np.asarray(
        Image.fromarray((keyed.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(5))
    ) > 0
    strongest_other = np.maximum(red, blue)
    spill = ~keyed & near_key & (green > strongest_other + 10)
    array[..., 1][spill] = strongest_other[spill].astype(np.uint8)
    array[..., :3][keyed] = 0
    array[..., 3][keyed] = 0
    return Image.fromarray(array)


def split_quadrants(sheet: Image.Image) -> list[Image.Image]:
    half_w = sheet.width // 2
    half_h = sheet.height // 2
    inset = max(3, round(min(sheet.size) * 0.005))
    return [
        sheet.crop((inset, inset, half_w - inset, half_h - inset)),
        sheet.crop((half_w + inset, inset, sheet.width - inset, half_h - inset)),
        sheet.crop((inset, half_h + inset, half_w - inset, sheet.height - inset)),
        sheet.crop((half_w + inset, half_h + inset, sheet.width - inset, sheet.height - inset)),
    ]


def components(mask: np.ndarray, minimum: int = 1) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    result: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            queue = deque([(x, y)])
            seen[y, x] = True
            part: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                part.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if (
                        0 <= next_x < width
                        and 0 <= next_y < height
                        and mask[next_y, next_x]
                        and not seen[next_y, next_x]
                    ):
                        seen[next_y, next_x] = True
                        queue.append((next_x, next_y))
            if len(part) >= minimum:
                result.append(part)
    return sorted(result, key=len, reverse=True)


def source_panel_metrics(panel: Image.Image) -> dict[str, object]:
    cleaned = strip_green(panel)
    scale = min(1.0, 160 / max(cleaned.size))
    sample = cleaned.resize(
        (max(1, round(cleaned.width * scale)), max(1, round(cleaned.height * scale))),
        Image.Resampling.NEAREST,
    )
    mask = np.asarray(sample.getchannel("A")) >= 96
    visible = int(mask.sum())
    parts = components(mask, minimum=2)
    ys, xs = np.where(mask)
    bbox = None if not len(xs) else [
        int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)
    ]
    round_like = 0
    for part in parts:
        part_x = [point[0] for point in part]
        part_y = [point[1] for point in part]
        width = max(part_x) - min(part_x) + 1
        height = max(part_y) - min(part_y) + 1
        if (
            min(part_y) > sample.height * 0.52
            and 0.72 <= width / max(1, height) <= 1.38
            and len(part) >= 8
        ):
            round_like += 1
    return {
        "sampleSize": list(sample.size),
        "visiblePixels": visible,
        "bbox": bbox,
        "componentCount": len(parts),
        "dominantComponentRatio": 0.0 if not visible or not parts else round(len(parts[0]) / visible, 4),
        "lowerRoundLikeComponents": round_like,
    }


def source_gate(panels: list[Image.Image]) -> dict[str, object]:
    records = [source_panel_metrics(panel) for panel in panels]
    areas = [int(record["visiblePixels"]) for record in records]
    full = max(1, areas[0])
    ratios = [round(area / full, 4) for area in areas]
    rules = {
        "singleMainFrameAtStart": (
            int(records[0]["componentCount"]) <= 4
            and float(records[0]["dominantComponentRatio"]) >= 0.55
            and int(records[1]["componentCount"]) <= 5
            and float(records[1]["dominantComponentRatio"]) >= 0.45
        ),
        "strictDeletionProgression": (
            areas[1] <= areas[0] * 0.88
            and areas[2] <= areas[0] * 0.55
            and areas[3] <= areas[0] * 0.24
            and areas[3] <= areas[2] * 0.58
        ),
        "noLowerCircularUiControls": sum(
            int(record["lowerRoundLikeComponents"]) for record in records
        ) == 0,
    }
    return {
        "pass": all(rules.values()),
        "stageAreaRatiosToFull": ratios,
        "rules": rules,
        "stages": dict(zip(STAGES, records)),
    }


def palette_from_source(cleaned: Image.Image) -> dict[str, tuple[int, int, int, int]]:
    array = np.asarray(cleaned.convert("RGBA"))
    colors = array[..., :3][array[..., 3] >= 96].astype(np.int32)
    if len(colors) < 20:
        return DEFAULT_PALETTE.copy()
    luminance = colors[:, 0] * 299 + colors[:, 1] * 587 + colors[:, 2] * 114
    spread = colors.max(axis=1) - colors.min(axis=1)
    brown = colors[
        (colors[:, 0] > colors[:, 1] * 1.03)
        & (colors[:, 1] > colors[:, 2] * 1.02)
        & (luminance > 55000)
    ]
    neutral = colors[(spread <= 55) & (luminance > 42000) & (luminance < 190000)]

    def rgba(value: np.ndarray) -> tuple[int, int, int, int]:
        value = np.clip(np.rint(value), 0, 255).astype(np.uint8)
        return int(value[0]), int(value[1]), int(value[2]), 255

    outline = rgba(colors[int(np.argmin(luminance))])
    if len(brown):
        brown_luma = brown[:, 0] * 299 + brown[:, 1] * 587 + brown[:, 2] * 114
        wood = rgba(np.median(brown, axis=0))
        highlight = rgba(brown[int(np.argmax(brown_luma))])
    else:
        wood = DEFAULT_PALETTE["wood"]
        highlight = DEFAULT_PALETTE["highlight"]
    photo = rgba(np.median(neutral, axis=0)) if len(neutral) else DEFAULT_PALETTE["photo"]
    paper = rgba((np.asarray(photo[:3]) * 0.6 + np.asarray(highlight[:3]) * 0.4))
    return {
        "outline": outline,
        "wood": wood,
        "highlight": highlight,
        "photo": photo,
        "paper": paper,
    }


def draw_intact_frame(image: Image.Image, palette: dict[str, tuple[int, int, int, int]]) -> None:
    draw = ImageDraw.Draw(image)
    draw.rectangle((22, 17, 33, 31), fill=palette["outline"])
    draw.rectangle((23, 18, 32, 30), fill=palette["wood"])
    draw.rectangle((24, 20, 31, 29), fill=palette["photo"])
    draw.line((24, 18, 31, 18), fill=palette["highlight"])
    draw.line((23, 19, 23, 28), fill=palette["highlight"])
    draw.rectangle((26, 22, 28, 25), fill=palette["paper"])
    draw.rectangle((25, 26, 29, 28), fill=palette["outline"])
    image.putpixel((32, 29), palette["outline"])


def build_exact_overlay(palette: dict[str, tuple[int, int, int, int]]) -> Image.Image:
    strip = Image.new("RGBA", (CELL_W * 4, CELL_H))

    full = Image.new("RGBA", (CELL_W, CELL_H))
    draw_intact_frame(full, palette)
    strip.alpha_composite(full, (0, 0))

    missing = full.copy()
    missing_draw = ImageDraw.Draw(missing)
    missing_draw.rectangle((30, 17, 33, 20), fill=(0, 0, 0, 0))
    missing_draw.rectangle((32, 21, 33, 22), fill=(0, 0, 0, 0))
    missing.putpixel((29, 18), (0, 0, 0, 0))
    missing.putpixel((31, 23), (0, 0, 0, 0))
    strip.alpha_composite(missing, (CELL_W, 0))

    two = Image.new("RGBA", (CELL_W, CELL_H))
    two_draw = ImageDraw.Draw(two)
    two_draw.rectangle((24, 18, 29, 19), fill=palette["outline"])
    two_draw.line((25, 18, 28, 18), fill=palette["highlight"])
    two_draw.rectangle((31, 23, 33, 29), fill=palette["outline"])
    two_draw.line((31, 24, 31, 28), fill=palette["wood"])
    strip.alpha_composite(two, (CELL_W * 2, 0))

    delete = Image.new("RGBA", (CELL_W, CELL_H))
    for x, y, key in (
        (24, 22, "wood"),
        (28, 20, "highlight"),
        (31, 22, "outline"),
        (29, 25, "photo"),
        (32, 27, "outline"),
    ):
        delete.putpixel((x, y), palette[key])
    strip.alpha_composite(delete, (CELL_W * 3, 0))
    return strip


def hero_front() -> Image.Image:
    sheet = Image.open(HERO_SHEET).convert("RGBA")
    if sheet.size != (160, 56):
        raise ValueError(f"unexpected approved hero size: {sheet.size}")
    return sheet.crop((0, 0, CELL_W, CELL_H))


def composite_behind(overlay: Image.Image) -> Image.Image:
    preview = overlay.copy()
    hero = hero_front()
    for index in range(4):
        preview.alpha_composite(hero, (index * CELL_W, 0))
    return preview


def count_green(image: Image.Image) -> int:
    array = np.asarray(image.convert("RGBA"))
    return int(((array[..., 3] > 0) & np.all(array[..., :3] == (0, 255, 0), axis=2)).sum())


def transparent_rgb_count(image: Image.Image) -> int:
    array = np.asarray(image.convert("RGBA"))
    return int(((array[..., 3] == 0) & np.any(array[..., :3] != 0, axis=2)).sum())


def exact_gate(overlay: Image.Image) -> dict[str, object]:
    hero_mask = np.asarray(hero_front().getchannel("A")) > 0
    records: dict[str, object] = {}
    counts: list[int] = []
    component_counts: list[int] = []
    occluded_counts: list[int] = []
    for index, stage in enumerate(STAGES):
        cell = overlay.crop((index * CELL_W, 0, (index + 1) * CELL_W, CELL_H))
        mask = np.asarray(cell.getchannel("A")) > 0
        ys, xs = np.where(mask)
        bbox = None if not len(xs) else [
            int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)
        ]
        parts = components(mask)
        visible = int(mask.sum())
        occluded = int((mask & hero_mask).sum())
        counts.append(visible)
        component_counts.append(len(parts))
        occluded_counts.append(occluded)
        records[stage] = {
            "bbox": bbox,
            "visiblePixels": visible,
            "componentCount": len(parts),
            "occludedByHeroPixels": occluded,
            "visibleAfterHeroPixels": int((mask & ~hero_mask).sum()),
        }
    rules = {
        "exactDimensions": overlay.size == (160, 56),
        "strictPixelDecline": counts[0] > counts[1] > counts[2] > counts[3],
        "fullAndMissingRemainOneObject": component_counts[:2] == [1, 1],
        "stageTwoHasExactlyTwoFragments": component_counts[2] == 2,
        "deleteStageIsOnlyThreeToSixDots": 3 <= component_counts[3] <= 6 and counts[3] <= 6,
        "allStagesAreBehindHero": all(value > 0 for value in occluded_counts),
        "upperRightCornerActuallyDeleted": (
            overlay.getpixel((33, 17))[3] > 0
            and overlay.getpixel((CELL_W + 33, 17))[3] == 0
        ),
        "noVisibleKeyGreen": count_green(overlay) == 0,
        "transparentRgbCleared": transparent_rgb_count(overlay) == 0,
    }
    return {"pass": all(rules.values()), "rules": rules, "stages": records}


def review_12x(preview: Image.Image, title: str, passed: bool) -> Image.Image:
    scale = 12
    gutter = 2
    top = 42
    width = ((CELL_W + gutter) * 4 + gutter) * scale
    height = top + (CELL_H + gutter * 2) * scale
    review = Image.new("RGBA", (width, height), REVIEW_BG)
    for index in range(4):
        cell = preview.crop((index * CELL_W, 0, (index + 1) * CELL_W, CELL_H))
        cell = cell.resize((CELL_W * scale, CELL_H * scale), Image.Resampling.NEAREST)
        review.alpha_composite(cell, ((gutter + index * (CELL_W + gutter)) * scale, top + gutter * scale))
    draw = ImageDraw.Draw(review)
    draw.text((14, 14), title, fill=(226, 215, 194, 255) if passed else (196, 84, 93, 255))
    draw.text((width - 170, 14), "PASS" if passed else "FAIL", fill=(226, 215, 194, 255) if passed else (196, 84, 93, 255))
    return review


def make_input_guide(path: Path) -> None:
    overlay = build_exact_overlay(DEFAULT_PALETTE)
    preview = composite_behind(overlay)
    scale = 12
    gutter = 2
    row_height = (CELL_H + gutter * 2) * scale
    width = ((CELL_W + gutter) * 4 + gutter) * scale
    guide = Image.new("RGBA", (width, row_height * 2), REVIEW_BG)
    for index in range(4):
        x = (gutter + index * (CELL_W + gutter)) * scale
        keyed_cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 255, 0, 255))
        keyed_cell.alpha_composite(overlay.crop((index * CELL_W, 0, (index + 1) * CELL_W, CELL_H)))
        guide.alpha_composite(
            keyed_cell.resize((CELL_W * scale, CELL_H * scale), Image.Resampling.NEAREST),
            (x, gutter * scale),
        )
        guide.alpha_composite(
            preview.crop((index * CELL_W, 0, (index + 1) * CELL_W, CELL_H)).resize(
                (CELL_W * scale, CELL_H * scale), Image.Resampling.NEAREST
            ),
            (x, row_height + gutter * scale),
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    guide.convert("RGB").save(path, optimize=True)


def build(source_path: Path, output_dir: Path, label: str, require_pass: bool) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGBA")
    cleaned = strip_green(source)
    cleaned.save(output_dir / "source-transparent.png", optimize=True)
    panels = split_quadrants(source)
    raw_gate = source_gate(panels)
    palette = palette_from_source(cleaned)
    overlay = build_exact_overlay(palette)
    exact = exact_gate(overlay)
    integration_allowed = bool(raw_gate["pass"] and exact["pass"])
    preview = composite_behind(overlay)

    overlay.save(output_dir / "behind-overlay-4phase-40x56.png", optimize=True)
    preview.save(output_dir / "hero-preview-4phase-40x56.png", optimize=True)
    review_12x(preview, label, integration_allowed).convert("RGB").save(
        output_dir / "hero-preview-4phase-12x.png", optimize=True
    )

    report = {
        "source": str(source_path),
        "stageOrder": list(STAGES),
        "sourceSize": list(source.size),
        "sourceGate": raw_gate,
        "exactGate": exact,
        "palette": {key: list(value) for key, value in palette.items()},
        "integrationAllowed": integration_allowed,
    }
    (output_dir / "gate.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    lines = [
        f"source={source.width}x{source.height}",
        "stage_order=full,missing-corner,two-segments,delete",
        f"source_gate={'pass' if raw_gate['pass'] else 'fail'}",
        f"exact_gate={'pass' if exact['pass'] else 'fail'}",
        f"integration_allowed={'true' if integration_allowed else 'false'}",
        f"overlay={overlay.width}x{overlay.height}",
        f"overlay_exact_green={count_green(overlay)}",
        f"overlay_transparent_rgb={transparent_rgb_count(overlay)}",
    ]
    for stage in STAGES:
        item = exact["stages"][stage]
        lines.append(
            f"{stage}=bbox:{item['bbox']};pixels:{item['visiblePixels']};"
            f"components:{item['componentCount']};occluded:{item['occludedByHeroPixels']};"
            f"visible_after_hero:{item['visibleAfterHeroPixels']}"
        )
    (output_dir / "metrics.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    if require_pass and not integration_allowed:
        raise SystemExit("semantic gate failed; inspect gate.json and do not promote this source")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version", nargs="?", default="v1")
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--label", default="33 THREE-DAY-VISIBLE / EXACT BEHIND-HERO REVIEW")
    parser.add_argument("--require-pass", action="store_true")
    parser.add_argument("--make-input-guide", type=Path)
    args = parser.parse_args()

    if args.make_input_guide:
        make_input_guide(args.make_input_guide)
        return
    output_dir = args.output_dir or OUTPUT_ROOT / args.version
    source_path = args.source or output_dir / f"33-three-day-visible-{args.version}.png"
    build(source_path, output_dir, args.label, args.require_pass)


if __name__ == "__main__":
    main()
