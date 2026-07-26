#!/usr/bin/env python3
"""Draft exact processor for standby companion plus four-frame save event."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/71-server-shutdown")
HERO = Path("src/assets/hero-style1-profiles/hero-idle.png")
DIRECTIONS = ("front", "left", "back", "right")
FRAMES = ("standby", "appear", "leap", "guard", "disconnect")
HERO_ROWS = {"front": 1120, "left": 1232, "back": 1176, "right": 1288}
PALETTE = (
    (26, 27, 32),
    (44, 48, 52),
    (64, 84, 75),
    (104, 131, 117),
    (159, 189, 173),
    (223, 232, 225),
)


def strip_green(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    keyed = (
        (green > 88)
        & (green * 100 > red * 125)
        & (green * 100 > blue * 125)
        & (np.maximum(red, blue) < 170)
    )
    near = np.asarray(Image.fromarray(keyed.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
    spill = ~keyed & near & (green > np.maximum(red, blue) + 10)
    array[..., 1][spill] = np.maximum(red, blue)[spill].astype(np.uint8)
    array[..., 3][keyed] = 0
    array[..., :3][keyed] = 0
    return Image.fromarray(array)


def crop_subject(panel: Image.Image) -> Image.Image | None:
    subject = strip_green(panel)
    bbox = subject.getchannel("A").point(lambda value: 255 if value >= 128 else 0).getbbox()
    if bbox is None:
        return None
    return subject.crop(bbox)


def split_source(source: Image.Image) -> dict[str, list[Image.Image]]:
    result: dict[str, list[Image.Image]] = {}
    for direction_index, direction in enumerate(DIRECTIONS):
        column = direction_index % 2
        row = direction_index // 2
        quadrant = source.crop((
            column * source.width // 2,
            row * source.height // 2,
            (column + 1) * source.width // 2,
            (row + 1) * source.height // 2,
        ))
        content_box = strip_green(quadrant).getchannel("A").point(
            lambda value: 255 if value >= 128 else 0
        ).getbbox()
        if content_box is None:
            result[direction] = [quadrant.crop((0, 0, 1, 1)) for _ in FRAMES]
            continue
        content_left, _, content_right, _ = content_box
        content_width = content_right - content_left
        result[direction] = [
            quadrant.crop((
                content_left + frame * content_width // 5,
                0,
                content_left + (frame + 1) * content_width // 5,
                quadrant.height,
            ))
            for frame in range(5)
        ]
    return result


def coverage_resize(source: Image.Image, width: int, height: int) -> Image.Image:
    source_array = np.asarray(source.convert("RGBA"))
    source_height, source_width = source_array.shape[:2]
    result = np.zeros((height, width, 4), dtype=np.uint8)
    palette = np.asarray(PALETTE, dtype=np.int32)
    for y in range(height):
        top, bottom = y * source_height // height, max(y * source_height // height + 1, (y + 1) * source_height // height)
        for x in range(width):
            left, right = x * source_width // width, max(x * source_width // width + 1, (x + 1) * source_width // width)
            cell = source_array[top:bottom, left:right]
            opaque = cell[..., 3] >= 128
            if int(opaque.sum()) * 4 < opaque.size:
                continue
            color = np.median(cell[..., :3][opaque], axis=0).astype(np.int32)
            index = int(np.argmin(((palette - color) ** 2).sum(axis=1)))
            result[y, x] = (*PALETTE[index], 255)
    return Image.fromarray(result)


def fit(source: Image.Image, limit: list[int]) -> Image.Image:
    scale = min(limit[0] / source.width, limit[1] / source.height)
    return coverage_resize(source, max(1, round(source.width * scale)), max(1, round(source.height * scale)))


def opaque_count(image: Image.Image) -> int:
    return int((np.asarray(image.convert("RGBA"))[..., 3] >= 128).sum())


def large_bright_rectangle(image: Image.Image) -> bool:
    array = np.asarray(image.convert("RGBA"))
    rgb = array[..., :3].astype(np.int32)
    bright = (array[..., 3] >= 128) & ((rgb[..., 0] + rgb[..., 1] + rgb[..., 2]) >= 570)
    ys, xs = np.where(bright)
    if len(xs) < 6:
        return False
    width, height = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    return width >= 3 and height >= 2 and len(xs) / (width * height) >= 0.75


def count_green(image: Image.Image) -> int:
    array = np.asarray(image.convert("RGBA"))
    return int(((array[..., 3] > 0) & np.all(array[..., :3] == (0, 255, 0), axis=2)).sum())


def build(source_path: Path, output_dir: Path, config_path: Path) -> None:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGBA")
    strip_green(source).save(output_dir / "source-transparent.png", optimize=True)
    panels = split_source(source)
    hero_atlas = Image.open(HERO).convert("RGBA")
    standby_overlay = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
    standby_composite = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
    trigger_overlay = Image.new("RGBA", (160, 224), (0, 0, 0, 0))
    trigger_composite = Image.new("RGBA", (160, 224), (0, 0, 0, 0))
    report: dict[str, object] = {
        "source": str(source_path),
        "persistentAssetUntilTriggered": True,
        "removedAfterTrigger": True,
        "directions": {},
        "allPass": True,
    }

    for row, direction in enumerate(DIRECTIONS):
        direction_report: dict[str, object] = {}
        counts: list[int] = []
        for column, frame_name in enumerate(FRAMES):
            subject = crop_subject(panels[direction][column])
            missing = subject is None
            sprite = (
                Image.new("RGBA", (1, 1), (0, 0, 0, 0))
                if missing
                else fit(subject, config["limits"][column])
            )
            anchor_x, anchor_y = config["anchors"][direction][column]
            x, y = anchor_x - sprite.width // 2, anchor_y - sprite.height // 2
            counts.append(opaque_count(sprite))
            screen_fail = large_bright_rectangle(sprite)
            ground_remnant = frame_name == "disconnect" and y + sprite.height - 1 >= 50
            standby_bottom = y + sprite.height - 1
            standby_grounded = frame_name != "standby" or 50 <= standby_bottom <= 52
            passed = (
                not missing
                and sprite.width <= config["limits"][column][0]
                and sprite.height <= config["limits"][column][1]
                and (frame_name != "standby" or counts[-1] >= 6)
                and standby_grounded
                and not screen_fail
                and not ground_remnant
            )
            direction_report[frame_name] = {
                "size": list(sprite.size),
                "position": [x, y],
                "opaquePixels": counts[-1],
                "largeBrightRectangle": screen_fail,
                "groundRemnant": ground_remnant,
                "bottomY": standby_bottom,
                "standbyGrounded": standby_grounded,
                "missingFrame": missing,
                "manualGate": "same living companion identity; no CRT, bezel, cable, status light, or device debris",
                "pass": passed,
            }
            report["allPass"] = bool(report["allPass"] and passed)
            base = hero_atlas.crop((0, HERO_ROWS[direction], 40, HERO_ROWS[direction] + 56))
            if frame_name == "standby":
                cell_x = row * 40
                standby_overlay.alpha_composite(sprite, (cell_x + x, y))
                standby_composite.alpha_composite(sprite, (cell_x + x, y))
                standby_composite.alpha_composite(base, (cell_x, 0))
            else:
                trigger_column = column - 1
                cell_x, cell_y = trigger_column * 40, row * 56
                if frame_name == "appear":
                    trigger_composite.alpha_composite(sprite, (cell_x + x, cell_y + y))
                    trigger_composite.alpha_composite(base, (cell_x, cell_y))
                else:
                    trigger_composite.alpha_composite(base, (cell_x, cell_y))
                    trigger_composite.alpha_composite(sprite, (cell_x + x, cell_y + y))
                trigger_overlay.alpha_composite(sprite, (cell_x + x, cell_y + y))
        disconnect_pass = counts[4] < counts[3]
        trajectory = config["anchors"][direction][1:4]
        distances = [abs(point[0] - 20) + abs(point[1] - 34) for point in trajectory]
        trajectory_pass = distances[0] > distances[1] > distances[2]
        direction_report["disconnectPixelCountGate"] = disconnect_pass
        direction_report["inwardTrajectoryGate"] = trajectory_pass
        report["allPass"] = bool(report["allPass"] and disconnect_pass and trajectory_pass)
        report["directions"][direction] = direction_report

    standby_overlay.save(output_dir / "shutdown-standby-overlay-40x56.png", optimize=True)
    standby_composite.save(output_dir / "shutdown-standby-composite-40x56.png", optimize=True)
    trigger_overlay.save(output_dir / "shutdown-trigger-overlay-4f-4dir.png", optimize=True)
    trigger_composite.save(output_dir / "shutdown-trigger-composite-4f-4dir.png", optimize=True)
    standby_review = Image.new("RGBA", (1920, 672), (21, 20, 26, 255))
    standby_review.alpha_composite(standby_composite.resize(standby_review.size, Image.Resampling.NEAREST))
    standby_review.convert("RGB").save(output_dir / "shutdown-standby-review-12x.png", optimize=True)
    trigger_review = Image.new("RGBA", (1920, 2688), (21, 20, 26, 255))
    trigger_review.alpha_composite(trigger_composite.resize(trigger_review.size, Image.Resampling.NEAREST))
    trigger_review.convert("RGB").save(output_dir / "shutdown-trigger-review-12x.png", optimize=True)
    report["standbyOverlayExactGreen"] = count_green(standby_overlay)
    report["triggerOverlayExactGreen"] = count_green(trigger_overlay)
    report["allPass"] = bool(
        report["allPass"]
        and report["standbyOverlayExactGreen"] == 0
        and report["triggerOverlayExactGreen"] == 0
    )
    (output_dir / "gate.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "v1-draft")
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("anchors.json"))
    args = parser.parse_args()
    build(args.source, args.output_dir, args.config)


if __name__ == "__main__":
    main()
