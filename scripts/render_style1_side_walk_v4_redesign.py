#!/usr/bin/env python3
"""Review-only contact/pass side walk built from the approved 40x56 mothers."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


W, H, ROOT_Y, SCALE = 40, 56, 49, 10
DIRECTIONS = ("left", "right")
POSES = ("contact-a", "pass-a", "contact-b", "pass-b")
SOURCE_DIR = Path("output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-hero-style1-animation-v4-redesign-review")

CLEAR = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
COAL = (55, 52, 58, 255)

# All coordinates are authored for the approved left mother and mirrored for
# right. Rows 40-41 remain the unmodified hip connector.
CONTACT_FRONT = {
    42: (17, 20), 43: (17, 20), 44: (16, 19), 45: (16, 19),
    46: (16, 19), 47: (16, 19), 48: (15, 19), 49: (15, 20),
}
CONTACT_BACK = {
    42: (21, 24), 43: (21, 24), 44: (22, 24), 45: (22, 24),
    46: (22, 24), 47: (22, 24), 48: (22, 25), 49: (22, 25),
}
SUPPORT_NEAR = {
    42: (17, 20), 43: (17, 20), 44: (17, 20), 45: (17, 20),
    46: (17, 20), 47: (17, 20), 48: (17, 20), 49: (16, 20),
}
LIFT_FAR = {
    42: (21, 24), 43: (21, 24), 44: (22, 25),
    45: (22, 25), 46: (21, 24), 47: (20, 24),
}
SUPPORT_FAR = {
    42: (21, 24), 43: (21, 24), 44: (21, 24), 45: (21, 24),
    46: (21, 24), 47: (21, 24), 48: (21, 24), 49: (20, 24),
}
LIFT_NEAR = {
    42: (17, 20), 43: (17, 20), 44: (16, 19),
    45: (16, 19), 46: (15, 18), 47: (14, 18),
}


def mx(x: int) -> int:
    return W - 1 - x


def target_x(x: int, direction: str) -> int:
    return x if direction == "left" else mx(x)


def paint_rows(
    pixels: Image.PixelAccess,
    rows: dict[int, tuple[int, int]],
    direction: str,
) -> None:
    for y, (x0, x1) in rows.items():
        for x in range(x0, x1 + 1):
            pixels[target_x(x, direction), y] = INK


def paint_coal(
    pixels: Image.PixelAccess,
    points: tuple[tuple[int, int], ...],
    direction: str,
) -> None:
    for x, y in points:
        pixels[target_x(x, direction), y] = COAL


def shear_forearm(image: Image.Image, direction: str, swing: int) -> None:
    """Move only rows below the elbow, preserving shoulder and sleeve contact."""
    if swing == 0:
        return
    pixels = image.load()
    xs = range(20, 25) if direction == "left" else range(15, 20)
    dx = swing if direction == "left" else -swing
    cutout: list[tuple[int, int, tuple[int, int, int, int]]] = []
    for y in range(35, 39):
        for x in xs:
            pixel = pixels[x, y]
            if pixel[3]:
                cutout.append((x, y, pixel))
            pixels[x, y] = CLEAR
    for x, y, pixel in cutout:
        pixels[x + dx, y] = pixel


def redraw_legs(image: Image.Image, direction: str, frame: int) -> None:
    pixels = image.load()
    for y in range(42, 50):
        for x in range(W):
            pixels[x, y] = CLEAR

    if frame == 0:
        paint_rows(pixels, CONTACT_BACK, direction)
        paint_coal(pixels, ((23, 48), (23, 49)), direction)
        paint_rows(pixels, CONTACT_FRONT, direction)
        paint_coal(pixels, ((19, 44), (18, 46), (17, 48), (16, 49)), direction)
    elif frame == 1:
        paint_rows(pixels, LIFT_FAR, direction)
        paint_coal(pixels, ((23, 45), (21, 47)), direction)
        paint_rows(pixels, SUPPORT_NEAR, direction)
        paint_coal(pixels, ((20, 44), (20, 46), (19, 48), (17, 49)), direction)
    elif frame == 2:
        paint_rows(pixels, CONTACT_FRONT, direction)
        paint_coal(pixels, ((17, 48), (16, 49)), direction)
        paint_rows(pixels, CONTACT_BACK, direction)
        paint_coal(pixels, ((22, 44), (22, 46), (23, 48), (24, 49)), direction)
    else:
        paint_rows(pixels, SUPPORT_FAR, direction)
        paint_coal(pixels, ((22, 46), (22, 48), (21, 49)), direction)
        paint_rows(pixels, LIFT_NEAR, direction)
        paint_coal(pixels, ((17, 44), (16, 46), (15, 47)), direction)


def render(source: Image.Image, direction: str, frame: int) -> Image.Image:
    result = source.copy()
    shear_forearm(result, direction, (1, 0, -1, 0)[frame])
    redraw_legs(result, direction, frame)
    return result


def alpha_components(image: Image.Image) -> int:
    opaque = {
        (x, y)
        for y in range(H)
        for x in range(W)
        if image.getpixel((x, y))[3]
    }
    count = 0
    while opaque:
        count += 1
        queue = deque((opaque.pop(),))
        while queue:
            x, y = queue.popleft()
            for point in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if point in opaque:
                    opaque.remove(point)
                    queue.append(point)
    return count


def row_runs(image: Image.Image, y: int) -> list[tuple[int, int]]:
    xs = [x for x in range(W) if image.getpixel((x, y))[3]]
    runs: list[tuple[int, int]] = []
    if not xs:
        return runs
    start = previous = xs[0]
    for x in xs[1:]:
        if x != previous + 1:
            runs.append((start, previous))
            start = x
        previous = x
    runs.append((start, previous))
    return runs


def validate(source: Image.Image, frame: Image.Image, direction: str, index: int) -> dict[str, object]:
    if frame.crop((0, 0, W, 32)).tobytes() != source.crop((0, 0, W, 32)).tobytes():
        raise AssertionError(f"head or torso changed: {direction}/{index}")
    if frame.crop((0, 40, W, 42)).tobytes() != source.crop((0, 40, W, 42)).tobytes():
        raise AssertionError(f"hip anchor changed: {direction}/{index}")
    bbox = frame.getchannel("A").getbbox()
    if bbox is None or bbox[3] - 1 != ROOT_Y:
        raise AssertionError(f"root drift: {direction}/{index} {bbox}")
    if alpha_components(frame) != 1:
        raise AssertionError(f"disconnected limb: {direction}/{index}")
    if any(alpha not in {0, 255} for *_, alpha in frame.getdata()):
        raise AssertionError(f"partial alpha: {direction}/{index}")
    ground = row_runs(frame, ROOT_Y)
    expected = 2 if index in {0, 2} else 1
    if len(ground) != expected:
        raise AssertionError(f"wrong ground contacts: {direction}/{index} {ground}")
    return {
        "bbox": list(bbox),
        "alpha_components": 1,
        "ground_runs": [list(run) for run in ground],
        "opaque_pixels": sum(pixel[3] > 0 for pixel in frame.getdata()),
    }


def make_atlas(frames: dict[str, list[Image.Image]]) -> Image.Image:
    atlas = Image.new("RGBA", (W * 4, H * 2), CLEAR)
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(frames[direction]):
            atlas.alpha_composite(frame, (column * W, row * H))
    return atlas


def make_contact(frames: dict[str, list[Image.Image]]) -> Image.Image:
    label_w, header_h = 64, 30
    cell_w, cell_h = W * SCALE, H * SCALE
    result = Image.new("RGB", (label_w + 4 * cell_w, header_h + 2 * cell_h), (19, 18, 24))
    draw = ImageDraw.Draw(result)
    for column, pose in enumerate(POSES):
        draw.text((label_w + column * cell_w + 10, 9), pose.upper(), fill=(211, 202, 185))
    for row, direction in enumerate(DIRECTIONS):
        y = header_h + row * cell_h
        draw.text((7, y + 12), direction.upper(), fill=(196, 180, 151))
        if row:
            draw.line((0, y, result.width, y), fill=(67, 57, 70), width=1)
        for column, frame in enumerate(frames[direction]):
            panel = Image.new("RGBA", (W, H), (43, 38, 48, 255))
            panel.alpha_composite(frame)
            panel = panel.resize((cell_w, cell_h), Image.Resampling.NEAREST).convert("RGB")
            x = label_w + column * cell_w
            result.paste(panel, (x, y))
            draw.line(
                (x, y + (ROOT_Y + 1) * SCALE, x + cell_w - 1, y + (ROOT_Y + 1) * SCALE),
                fill=(66, 58, 69),
                width=1,
            )
    return result


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = {
        direction: Image.open(SOURCE_DIR / f"{direction}.png").convert("RGBA")
        for direction in DIRECTIONS
    }
    frames = {
        direction: [render(source, direction, index) for index in range(4)]
        for direction, source in sources.items()
    }
    validation = {
        direction: [validate(sources[direction], frame, direction, index) for index, frame in enumerate(side)]
        for direction, side in frames.items()
    }
    for direction in DIRECTIONS:
        if len({frame.tobytes() for frame in frames[direction]}) != 4:
            raise AssertionError(f"duplicate frame: {direction}")

    atlas = OUTPUT_DIR / "style1-v4-redesign-side-walk-2dir.png"
    contact = OUTPUT_DIR / "style1-v4-redesign-side-walk-contact.png"
    make_atlas(frames).save(atlas, optimize=True)
    make_contact(frames).save(contact, optimize=True)
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps({
        "review_only": True,
        "source": str(SOURCE_DIR),
        "directions": list(DIRECTIONS),
        "poses": list(POSES),
        "frame": {"width": W, "height": H, "root_y": ROOT_Y},
        "rules": {
            "head_and_upper_torso_unchanged": True,
            "hip_rows_40_41_unchanged": True,
            "contact_feet": 2,
            "pass_support_feet": 1,
            "forearm_shear_px": 1,
            "runtime_integration": False,
        },
        "validation": validation,
    }, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"wrote redesign review to {OUTPUT_DIR}")
    print(f"contact: {contact}")


if __name__ == "__main__":
    main()
