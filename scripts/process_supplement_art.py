#!/usr/bin/env python3
"""Build review assets from the distributed Image2 supplement batch.

Generated files stay under output/imagegen. Runtime promotion is a separate,
explicit review step.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parents[1]
ROOT = REPO_ROOT / "output/imagegen/zhe-yi-shen-supplement-v1"
RAW = ROOT / "raw"
PROCESSED = ROOT / "processed"
CELLS = PROCESSED / "cells"
PREVIEWS = ROOT / "previews"
PROMPTS = ROOT / "prompts.jsonl"


@dataclass(frozen=True)
class GridSpec:
    width: int
    height: int
    colors: int
    slots: tuple[str, str, str, str]


def grid(width: int, height: int, colors: int, *slots: str) -> GridSpec:
    if len(slots) != 4:
        raise ValueError("grid jobs need exactly four semantic slots")
    return GridSpec(width, height, colors, tuple(slots))


SPECS: dict[int, GridSpec] = {
    1: grid(32, 32, 12, "bleached-hair", "rain-soaked-hair", "cracked-glasses", "tear-track"),
    2: grid(32, 32, 12, "brow-scar", "medicine-sick-face", "dark-eye-circles", "old-age-face"),
    3: grid(40, 48, 12, "fathers-raincoat", "small-school-uniform", "office-tie-lanyard", "hospital-gown"),
    4: grid(40, 48, 12, "schoolbag-straps", "worn-hoodie", "cheap-work-vest", "patched-sweater"),
    5: grid(56, 64, 12, "broken-spine-shadow", "empty-frame-halo", "phone-glow", "raincoat-shelter"),
    6: grid(40, 56, 10, "very-slim", "soft-wide-waist", "broad-torso", "hunched-posture"),
    7: grid(40, 40, 14, "blanket-lump", "alarm-clock", "hungry-bowl", "schoolbag-mouth"),
    8: grid(40, 40, 14, "correction-pen", "ruler-centipede", "chalk-face", "report-card-bird"),
    9: grid(40, 40, 14, "ticket-moth", "intern-badge", "phone-alarm", "gear-suitcase"),
    10: grid(40, 40, 14, "necktie-chair", "takeaway-crab", "powerbank-parasite", "contract-slug"),
    11: grid(40, 40, 14, "medical-report", "pill-blister-beetle", "mortgage-brick", "office-chair-spider"),
    12: grid(40, 40, 14, "empty-chair", "medicine-lantern", "faceless-photo", "last-bus-cane"),
    13: grid(80, 80, 12, "correction-stamp-zone", "clock-sweep", "puddle-burst", "office-grid-collapse"),
    14: grid(80, 80, 12, "closet-cone", "train-lanes", "ledger-spiral", "lamp-safe-circle"),
    15: grid(24, 24, 8, "correction-cross", "chalk-pellet", "clock-hand-dart", "receipt-shard"),
    16: grid(24, 24, 8, "notification-bubble", "capsule-comet", "ash-cluster", "chained-coin"),
    17: grid(48, 48, 12, "blanket-fold", "paper-tear", "gear-unwind", "badge-tie-collapse"),
    18: grid(48, 48, 12, "blister-scatter", "contract-roll", "photo-dust", "lamp-ash"),
    19: grid(32, 32, 10, "worn-coin", "breath-paper", "warm-water", "archive-corner"),
    20: grid(64, 64, 14, "evidence-plinth", "desk-lamp-table", "pawnshop-tray", "wardrobe-mirror"),
    21: grid(32, 32, 10, "held-elevator", "upturned-rice-bowl", "unanswered-phone", "passing-key"),
    22: grid(32, 32, 10, "family-chair", "shared-umbrella", "wage-vs-medicine", "unlatched-door"),
    23: grid(32, 32, 8, "inhale", "exhale", "archive-page", "exit-door"),
    24: grid(32, 32, 8, "stored-breath", "taped-shield", "coin-magnet", "delayed-pain"),
    25: grid(64, 64, 14, "child-bed", "toy-box", "school-desk", "coat-hooks"),
    26: grid(64, 64, 14, "platform-bench", "departure-board", "office-cubicle", "takeaway-chair"),
    27: grid(64, 64, 14, "hospital-bench", "medicine-trolley", "shoe-cabinet", "street-lamp"),
    28: grid(96, 48, 12, "eyes-under-bed", "wall-correction", "passing-train", "distant-figure"),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_chroma_green(red: int, green: int, blue: int) -> bool:
    maximum = max(red, green, blue)
    saturation = (maximum - min(red, green, blue)) / maximum if maximum else 0
    return (
        green >= 100
        and green - red >= 45
        and green - blue >= 45
        and saturation >= 0.35
    )


def strip_green(image: Image.Image) -> tuple[Image.Image, float, float]:
    source = image.convert("RGBA")
    width, height = source.size
    output: list[tuple[int, int, int, int]] = []
    green_count = 0
    edge_green_count = 0
    edge_count = 0
    for index, (red, green, blue, alpha) in enumerate(source.getdata()):
        x, y = index % width, index // width
        keyed = is_chroma_green(red, green, blue)
        if keyed:
            green_count += 1
            output.append((0, 0, 0, 0))
        else:
            output.append((red, green, blue, alpha))
        if x in (0, width - 1) or y in (0, height - 1):
            edge_count += 1
            edge_green_count += int(keyed)
    source.putdata(output)
    total = width * height
    return source, green_count / total, edge_green_count / edge_count


def normalize_viewport(cell: Image.Image, spec: GridSpec) -> tuple[Image.Image, dict[str, object]]:
    keyed, green_coverage, edge_green_coverage = strip_green(cell)
    quality_flags: list[str] = []
    alpha = keyed.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 96 else 0).getbbox()
    if bbox is None:
        raise ValueError("empty quadrant after chroma key")
    if green_coverage < 0.12:
        raise ValueError(f"insufficient chroma background: {green_coverage:.3f}")
    if edge_green_coverage < 0.25:
        raise ValueError(f"foreground touches or crosses quadrant edge: {edge_green_coverage:.3f}")
    if edge_green_coverage < 0.75:
        quality_flags.append("edge-contact-needs-manual-review")

    # Resize the complete quadrant, not a per-sprite tight crop. This preserves
    # common head/feet anchors and relative wearable sizes across all four cells.
    reduced = keyed.resize((spec.width, spec.height), Image.Resampling.BOX)
    hard_alpha = reduced.getchannel("A").point(lambda value: 255 if value > 24 else 0)
    palette = reduced.convert("RGB").quantize(
        colors=spec.colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    result = Image.merge("RGBA", (*palette.split(), hard_alpha))
    result.putdata([
        (red, green, blue, 255) if alpha else (0, 0, 0, 0)
        for red, green, blue, alpha in result.getdata()
    ])
    opaque = [pixel for pixel in result.getdata() if pixel[3]]
    if not opaque:
        raise ValueError("sprite disappeared during low-resolution conversion")
    return result, {
        "sourceBbox": list(bbox),
        "greenCoverage": round(green_coverage, 4),
        "edgeGreenCoverage": round(edge_green_coverage, 4),
        "opaquePixels": len(opaque),
        "colors": len({pixel[:3] for pixel in opaque}),
        "qualityFlags": quality_flags,
    }


def process_grid(path: Path, index: int, spec: GridSpec) -> tuple[dict[str, object], list[Path]]:
    sheet = Image.open(path).convert("RGBA")
    if abs(sheet.width / sheet.height - 1) > 0.02 or min(sheet.size) < 512:
        raise ValueError(f"grid source must be a large square: {path.name} {sheet.size}")
    half_w, half_h = sheet.width // 2, sheet.height // 2
    viewport_inset = max(2, round(min(sheet.size) * 0.012))
    atlas = Image.new("RGBA", (spec.width * 4, spec.height), (0, 0, 0, 0))
    cell_dir = CELLS / path.stem
    cell_dir.mkdir(parents=True, exist_ok=True)
    cell_paths: list[Path] = []
    cells: list[dict[str, object]] = []
    for quadrant, slot_id in enumerate(spec.slots):
        col, row = quadrant % 2, quadrant // 2
        source = sheet.crop((
            col * half_w + viewport_inset,
            row * half_h + viewport_inset,
            (col + 1) * half_w - viewport_inset,
            (row + 1) * half_h - viewport_inset,
        ))
        try:
            sprite, metrics = normalize_viewport(source, spec)
        except ValueError as error:
            raise ValueError(f"{path.name} slot {quadrant + 1} ({slot_id}): {error}") from error
        atlas.alpha_composite(sprite, (quadrant * spec.width, 0))
        cell_path = cell_dir / f"{quadrant + 1:02d}-{slot_id}.png"
        sprite.save(cell_path, optimize=True)
        cell_paths.append(cell_path)
        cells.append({"quadrant": quadrant, "id": slot_id, **metrics})
    output = PROCESSED / path.name
    atlas.save(output, optimize=True)
    return ({
        "file": path.name,
        "kind": "grid",
        "qualityStatus": "warning" if any(cell["qualityFlags"] for cell in cells) else "pass",
        "rawSize": list(sheet.size),
        "sourceViewportInset": viewport_inset,
        "cell": [spec.width, spec.height],
        "rawSha256": sha256(path),
        "processedSha256": sha256(output),
        "cells": cells,
    }, cell_paths)


def process_background(path: Path) -> dict[str, object]:
    source = Image.open(path).convert("RGB")
    if min(source.size) < 768 or not 0.53 <= source.width / source.height <= 0.69:
        raise ValueError(f"background source has unexpected aspect ratio: {path.name} {source.size}")
    original_size = list(source.size)
    target_ratio = 9 / 16
    if source.width / source.height > target_ratio:
        crop_w = round(source.height * target_ratio)
        left = (source.width - crop_w) // 2
        source = source.crop((left, 0, left + crop_w, source.height))
    else:
        crop_h = round(source.width / target_ratio)
        top = (source.height - crop_h) // 2
        source = source.crop((0, top, source.width, top + crop_h))
    crop_fraction = 1 - (source.width * source.height) / (original_size[0] * original_size[1])
    if crop_fraction > 0.18:
        raise ValueError(f"background crop exceeds safe area: {path.name} {crop_fraction:.3f}")

    logical = source.resize((180, 320), Image.Resampling.BOX)
    logical = logical.quantize(
        colors=24,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    runtime = logical.resize((360, 640), Image.Resampling.NEAREST)
    output = PROCESSED / path.name
    runtime.save(output, optimize=True)
    return {
        "file": path.name,
        "kind": "background",
        "rawSize": original_size,
        "runtimeSize": [360, 640],
        "cropFraction": round(crop_fraction, 4),
        "rawSha256": sha256(path),
        "processedSha256": sha256(output),
    }


def contact_sheet(
    paths: list[Path],
    destination: Path,
    columns: int,
    thumb: tuple[int, int],
    *,
    upscale: bool = False,
) -> None:
    label_h = 24
    rows = math.ceil(len(paths) / columns)
    canvas = Image.new("RGB", (columns * thumb[0], rows * (thumb[1] + label_h)), (17, 16, 21))
    draw = ImageDraw.Draw(canvas)
    for index, path in enumerate(paths):
        source = Image.open(path).convert("RGBA")
        scale = min(thumb[0] / source.width, thumb[1] / source.height)
        if not upscale:
            scale = min(1, scale)
        size = (max(1, round(source.width * scale)), max(1, round(source.height * scale)))
        preview = source.resize(size, Image.Resampling.NEAREST)
        left = (index % columns) * thumb[0] + (thumb[0] - preview.width) // 2
        top = (index // columns) * (thumb[1] + label_h) + (thumb[1] - preview.height) // 2
        canvas.paste(preview.convert("RGB"), (left, top), preview.getchannel("A"))
        draw.text(
            ((index % columns) * thumb[0] + 4, (index // columns) * (thumb[1] + label_h) + thumb[1] + 5),
            path.stem[:34],
            fill=(216, 208, 193),
        )
    canvas.save(destination, optimize=True)


def expected_outputs() -> list[str]:
    outputs: list[str] = []
    for line_number, line in enumerate(PROMPTS.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        record = json.loads(line)
        output = record.get("out")
        if not isinstance(output, str) or not output.endswith(".png"):
            raise ValueError(f"invalid out field on prompts line {line_number}")
        outputs.append(output)
    if len(outputs) != 34 or len(set(outputs)) != 34:
        raise ValueError("prompts must define exactly 34 unique PNG outputs")
    return outputs


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    CELLS.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    outputs = expected_outputs()
    actual = {path.name for path in RAW.glob("*.png")}
    expected = set(outputs)
    if actual != expected:
        raise SystemExit(json.dumps({
            "missing": sorted(expected - actual),
            "extra": sorted(actual - expected),
        }, ensure_ascii=False))

    manifest: list[dict[str, object]] = []
    processed_paths: list[Path] = []
    cell_paths: list[Path] = []
    for filename in outputs:
        path = RAW / filename
        index = int(filename.split("-", 1)[0])
        if index in SPECS:
            record, written_cells = process_grid(path, index, SPECS[index])
            cell_paths.extend(written_cells)
        elif 29 <= index <= 34:
            record = process_background(path)
        else:
            raise ValueError(f"unsupported job index: {index}")
        manifest.append(record)
        processed_paths.append(PROCESSED / filename)

    manifest_path = ROOT / "manifest.json"
    manifest_path.write_text(json.dumps({
        "schemaVersion": 2,
        "status": "needs_visual_review",
        "rawCount": len(outputs),
        "runtimePromoted": False,
        "promptSha256": sha256(PROMPTS),
        "assets": manifest,
    }, indent=2), encoding="utf-8")
    contact_sheet([RAW / name for name in outputs], PREVIEWS / "raw-contact.png", 6, (180, 180))
    contact_sheet(processed_paths, PREVIEWS / "processed-contact.png", 6, (180, 180), upscale=True)
    contact_sheet(cell_paths, PREVIEWS / "cells-contact.png", 8, (128, 128), upscale=True)
    print(f"supplement art: {len(outputs)} raw -> {len(manifest)} processed, {len(cell_paths)} cells")


if __name__ == "__main__":
    main()
