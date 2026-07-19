#!/usr/bin/env python3
"""Render a review-only side walk cycle from the approved style-1 mothers."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


FRAME_W = 40
FRAME_H = 56
ROOT_Y = 49
SCALE = 10
DIRECTIONS = ("left", "right")
POSES = ("contact-a", "pass-a", "contact-b", "pass-b")

SOURCE_DIR = Path("output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-hero-style1-animation-v4-side-walk-review")

TRANSPARENT = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
COAL = (55, 52, 58, 255)


def mirror_x(x: int) -> int:
    return FRAME_W - 1 - x


def paint_rows(
    pixels: Image.PixelAccess,
    rows: dict[int, tuple[int, int]],
    direction: str,
    color: tuple[int, int, int, int] = INK,
) -> None:
    for y, (left, right) in rows.items():
        xs = range(left, right + 1)
        for x in xs:
            target_x = x if direction == "left" else mirror_x(x)
            pixels[target_x, y] = color


def paint_points(
    pixels: Image.PixelAccess,
    points: tuple[tuple[int, int], ...],
    direction: str,
    color: tuple[int, int, int, int] = COAL,
) -> None:
    for x, y in points:
        target_x = x if direction == "left" else mirror_x(x)
        pixels[target_x, y] = color


CONTACT_FRONT = {
    42: (17, 20),
    43: (17, 20),
    44: (16, 19),
    45: (16, 19),
    46: (16, 19),
    47: (16, 19),
    48: (15, 19),
    49: (15, 20),
}

CONTACT_BACK = {
    42: (21, 24),
    43: (21, 24),
    44: (22, 24),
    45: (22, 24),
    46: (22, 24),
    47: (22, 24),
    48: (22, 25),
    49: (22, 25),
}

SUPPORT_NEAR = {
    42: (17, 20),
    43: (17, 20),
    44: (17, 20),
    45: (17, 20),
    46: (17, 20),
    47: (17, 20),
    48: (17, 20),
    49: (16, 20),
}

LIFT_FAR = {
    42: (21, 24),
    43: (21, 24),
    44: (22, 25),
    45: (22, 25),
    46: (21, 24),
    47: (20, 24),
}

SUPPORT_FAR = {
    42: (21, 24),
    43: (21, 24),
    44: (21, 24),
    45: (21, 24),
    46: (21, 24),
    47: (21, 24),
    48: (21, 24),
    49: (20, 24),
}

LIFT_NEAR = {
    42: (17, 20),
    43: (17, 20),
    44: (16, 19),
    45: (16, 19),
    46: (15, 18),
    47: (14, 18),
}


def shear_near_forearm(image: Image.Image, direction: str, swing: int) -> None:
    """Shear only the forearm below the elbow; the sleeve shoulder stays fixed."""
    if swing == 0:
        return
    pixels = image.load()
    if direction == "left":
        xs = range(20, 25)
        dx = swing
    else:
        xs = range(15, 20)
        dx = -swing

    cutout: list[tuple[int, int, tuple[int, int, int, int]]] = []
    for y in range(35, 39):
        for x in xs:
            pixel = pixels[x, y]
            if pixel[3]:
                cutout.append((x, y, pixel))
            pixels[x, y] = TRANSPARENT

    for x, y, pixel in cutout:
        pixels[x + dx, y] = pixel


def redraw_legs(image: Image.Image, direction: str, frame: int) -> None:
    pixels = image.load()
    for y in range(42, 50):
        for x in range(FRAME_W):
            pixels[x, y] = TRANSPARENT

    if frame == 0:
        # Far leg first; the highlighted near leg lands toward the facing side.
        paint_rows(pixels, CONTACT_BACK, direction)
        paint_points(pixels, ((23, 48), (23, 49)), direction)
        paint_rows(pixels, CONTACT_FRONT, direction)
        paint_points(pixels, ((19, 44), (18, 46), (17, 48), (16, 49)), direction)
    elif frame == 1:
        # Near leg supports while the far heel folds up behind it.
        paint_rows(pixels, LIFT_FAR, direction)
        paint_points(pixels, ((23, 45), (21, 47)), direction)
        paint_rows(pixels, SUPPORT_NEAR, direction)
        paint_points(pixels, ((20, 44), (20, 46), (19, 48), (17, 49)), direction)
    elif frame == 2:
        # The same silhouette changes depth: near leg is now the rear contact.
        paint_rows(pixels, CONTACT_FRONT, direction)
        paint_points(pixels, ((17, 48), (16, 49)), direction)
        paint_rows(pixels, CONTACT_BACK, direction)
        paint_points(pixels, ((22, 44), (22, 46), (23, 48), (24, 49)), direction)
    else:
        # Far leg supports; the near knee and toe lift visibly off the ground.
        paint_rows(pixels, SUPPORT_FAR, direction)
        paint_points(pixels, ((22, 46), (22, 48), (21, 49)), direction)
        paint_rows(pixels, LIFT_NEAR, direction)
        paint_points(pixels, ((17, 44), (16, 46), (15, 47)), direction)


def render_frame(source: Image.Image, direction: str, frame: int) -> Image.Image:
    result = source.copy()
    # Arm counter-swing follows the near leg without detaching the sleeve.
    shear_near_forearm(result, direction, (1, 0, -1, 0)[frame])
    redraw_legs(result, direction, frame)
    return result


def alpha_components(image: Image.Image) -> int:
    opaque = {
        (x, y)
        for y in range(FRAME_H)
        for x in range(FRAME_W)
        if image.getpixel((x, y))[3]
    }
    components = 0
    while opaque:
        components += 1
        queue = deque((opaque.pop(),))
        while queue:
            x, y = queue.popleft()
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor in opaque:
                    opaque.remove(neighbor)
                    queue.append(neighbor)
    return components


def row_runs(image: Image.Image, y: int) -> list[tuple[int, int]]:
    xs = [x for x in range(FRAME_W) if image.getpixel((x, y))[3]]
    if not xs:
        return []
    runs: list[tuple[int, int]] = []
    start = previous = xs[0]
    for x in xs[1:]:
        if x != previous + 1:
            runs.append((start, previous))
            start = x
        previous = x
    runs.append((start, previous))
    return runs


def validate_frame(source: Image.Image, frame: Image.Image, direction: str, index: int) -> dict[str, object]:
    if frame.crop((0, 0, FRAME_W, 32)).tobytes() != source.crop((0, 0, FRAME_W, 32)).tobytes():
        raise AssertionError(f"head/torso identity changed: {direction}/{index}")
    if frame.crop((0, 40, FRAME_W, 42)).tobytes() != source.crop((0, 40, FRAME_W, 42)).tobytes():
        raise AssertionError(f"hip anchor changed: {direction}/{index}")
    bbox = frame.getchannel("A").getbbox()
    if bbox is None or bbox[3] - 1 != ROOT_Y:
        raise AssertionError(f"root drift: {direction}/{index} {bbox}")
    if any(alpha not in {0, 255} for *_, alpha in frame.getdata()):
        raise AssertionError(f"partial alpha: {direction}/{index}")
    if alpha_components(frame) != 1:
        raise AssertionError(f"disconnected sleeve/limb: {direction}/{index}")

    ground_runs = row_runs(frame, ROOT_Y)
    if index in {0, 2} and len(ground_runs) != 2:
        raise AssertionError(f"contact pose needs two ground contacts: {direction}/{index} {ground_runs}")
    if index in {1, 3} and len(ground_runs) != 1:
        raise AssertionError(f"pass pose needs one support foot: {direction}/{index} {ground_runs}")
    return {
        "bbox": list(bbox),
        "opaque_pixels": sum(pixel[3] > 0 for pixel in frame.getdata()),
        "components": 1,
        "ground_runs": [list(run) for run in ground_runs],
    }


def make_atlas(frames: dict[str, list[Image.Image]]) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME_W * 4, FRAME_H * 2), TRANSPARENT)
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(frames[direction]):
            atlas.alpha_composite(frame, (column * FRAME_W, row * FRAME_H))
    return atlas


def make_contact(frames: dict[str, list[Image.Image]]) -> Image.Image:
    label_w = 64
    header_h = 30
    cell_w = FRAME_W * SCALE
    cell_h = FRAME_H * SCALE
    result = Image.new("RGB", (label_w + cell_w * 4, header_h + cell_h * 2), (19, 18, 24))
    draw = ImageDraw.Draw(result)

    for column, pose in enumerate(POSES):
        draw.text((label_w + column * cell_w + 10, 9), pose.upper(), fill=(211, 202, 185))
    for row, direction in enumerate(DIRECTIONS):
        y = header_h + row * cell_h
        draw.text((7, y + 12), direction.upper(), fill=(196, 180, 151))
        if row:
            draw.line((0, y, result.width, y), fill=(67, 57, 70), width=1)
        for column, frame in enumerate(frames[direction]):
            panel = Image.new("RGBA", (FRAME_W, FRAME_H), (43, 38, 48, 255))
            panel.alpha_composite(frame)
            panel = panel.resize((cell_w, cell_h), Image.Resampling.NEAREST).convert("RGB")
            x = label_w + column * cell_w
            result.paste(panel, (x, y))
            baseline = y + (ROOT_Y + 1) * SCALE
            draw.line((x, baseline, x + cell_w - 1, baseline), fill=(66, 58, 69), width=1)
    return result


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = {
        direction: Image.open(SOURCE_DIR / f"{direction}.png").convert("RGBA")
        for direction in DIRECTIONS
    }
    frames = {
        direction: [render_frame(source, direction, frame) for frame in range(4)]
        for direction, source in sources.items()
    }
    validation = {
        direction: [
            validate_frame(sources[direction], frame, direction, index)
            for index, frame in enumerate(frames[direction])
        ]
        for direction in DIRECTIONS
    }
    for direction in DIRECTIONS:
        if len({frame.tobytes() for frame in frames[direction]}) != 4:
            raise AssertionError(f"duplicate side-walk frame: {direction}")

    atlas_path = OUTPUT_DIR / "style1-v4-side-walk-2dir.png"
    contact_path = OUTPUT_DIR / "style1-v4-side-walk-contact.png"
    make_atlas(frames).save(atlas_path, optimize=True)
    make_contact(frames).save(contact_path, optimize=True)
    manifest = {
        "review_only": True,
        "source": str(SOURCE_DIR),
        "directions": list(DIRECTIONS),
        "poses": list(POSES),
        "frame": {"width": FRAME_W, "height": FRAME_H, "root_y": ROOT_Y},
        "constraints": {
            "head_and_torso_unchanged": True,
            "hip_rows_40_41_unchanged": True,
            "arm_motion": "one-pixel forearm shear below elbow",
            "contact_ground_points": 2,
            "pass_ground_points": 1,
            "runtime_integration": False,
        },
        "validation": validation,
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8"
    )
    print(f"wrote side-walk v4 review to {OUTPUT_DIR}")
    print(f"contact: {contact_path}")


if __name__ == "__main__":
    main()
