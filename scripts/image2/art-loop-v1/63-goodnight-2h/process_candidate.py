#!/usr/bin/env python3
"""Build exact goodnight phone-shadow overlays and reject portal-like sources."""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


OUTPUT_ROOT = Path("output/imagegen/zhe-yi-shen-art-loop-v1/63-goodnight-2h")
HERO_ATLAS = Path("src/assets/hero-style1-profiles/hero-idle.png")
DIRECTIONS = ("front", "left", "back", "right")
HERO_ROWS = {"front": 1120, "left": 1232, "back": 1176, "right": 1288}
X_SHIFTS = {"front": 6, "left": -12, "back": -7, "right": 12}
MAX_SIZE = (24, 9)
GROUND_BOTTOM = 52
REVIEW_BG = (21, 20, 26, 255)
REVIEW_TEXT = (226, 215, 194, 255)
REVIEW_FAIL = (196, 84, 93, 255)

PALETTE = (
    (8, 9, 12),
    (31, 29, 40),
    (50, 69, 91),
    (76, 101, 130),
    (145, 172, 195),
    (220, 232, 240),
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
    near_key = np.asarray(
        Image.fromarray((keyed.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(5))
    ) > 0
    strongest_other = np.maximum(red, blue)
    spill = ~keyed & near_key & (green > strongest_other + 10)
    array[..., 1][spill] = strongest_other[spill].astype(np.uint8)
    array[..., 3][keyed] = 0
    array[..., :3][keyed] = 0
    return Image.fromarray(array)


def split_sheet(sheet: Image.Image) -> list[Image.Image]:
    columns = [0, sheet.width // 2, sheet.width]
    rows = [0, sheet.height // 2, sheet.height]
    return [
        sheet.crop((columns[0], rows[0], columns[1], rows[1])),
        sheet.crop((columns[1], rows[0], columns[2], rows[1])),
        sheet.crop((columns[0], rows[1], columns[1], rows[2])),
        sheet.crop((columns[1], rows[1], columns[2], rows[2])),
    ]


def crop_subject(panel: Image.Image) -> Image.Image:
    subject = strip_green(panel)
    alpha = subject.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("empty source panel after chroma removal")
    return subject.crop(bbox)


def coverage_resize(source: Image.Image, width: int, height: int) -> Image.Image:
    source_array = np.asarray(source.convert("RGBA"))
    source_height, source_width = source_array.shape[:2]
    result = np.zeros((height, width, 4), dtype=np.uint8)

    for target_y in range(height):
        top = target_y * source_height // height
        bottom = max(top + 1, (target_y + 1) * source_height // height)
        for target_x in range(width):
            left = target_x * source_width // width
            right = max(left + 1, (target_x + 1) * source_width // width)
            cell = source_array[top:bottom, left:right]
            opaque = cell[..., 3] >= 128
            if int(opaque.sum()) * 5 < opaque.size:
                continue
            pixels = cell[..., :3][opaque]
            luminance = (
                pixels[:, 0].astype(np.uint32) * 299
                + pixels[:, 1].astype(np.uint32) * 587
                + pixels[:, 2].astype(np.uint32) * 114
            )
            spread = pixels.max(axis=1).astype(np.int16) - pixels.min(axis=1).astype(np.int16)
            neutral_dark = pixels[(luminance <= 85000) & (spread <= 42)]
            cold_bright = pixels[
                (luminance >= 165000)
                & (pixels[:, 2].astype(np.int16) + 18 >= pixels[:, 0].astype(np.int16))
            ]
            if len(cold_bright) * 6 >= len(pixels):
                selected = cold_bright
            elif len(neutral_dark) * 5 >= len(pixels):
                selected = neutral_dark
            else:
                selected = pixels
            result[target_y, target_x, :3] = np.median(selected, axis=0).astype(np.uint8)
            result[target_y, target_x, 3] = 255
    return Image.fromarray(result)


def fit(source: Image.Image) -> Image.Image:
    scale = min(MAX_SIZE[0] / source.width, MAX_SIZE[1] / source.height)
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    return coverage_resize(source, width, height)


def normalize_palette(image: Image.Image, preserve_phone_black: bool = False) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 128
    if not opaque.any():
        raise ValueError("cannot normalize an empty ground overlay")
    palette = np.asarray(PALETTE, dtype=np.int32)
    pixels = array[..., :3][opaque].astype(np.int32)
    distances = ((pixels[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)
    spread = pixels.max(axis=1) - pixels.min(axis=1)
    luminance = pixels[:, 0] * 299 + pixels[:, 1] * 587 + pixels[:, 2] * 114
    selected = np.argmin(distances, axis=1)
    selected[(spread <= 48) & (luminance <= 90000)] = 0 if preserve_phone_black else 1
    array[..., :3] = 0
    array[..., :3][opaque] = palette[selected].astype(np.uint8)
    array[..., 3] = np.where(opaque, 255, 0).astype(np.uint8)
    return Image.fromarray(array)


def connected_components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    for start_y in range(height):
        for start_x in range(width):
            if not mask[start_y, start_x] or visited[start_y, start_x]:
                continue
            queue = deque([(start_x, start_y)])
            visited[start_y, start_x] = True
            component: list[tuple[int, int]] = []
            while queue:
                x, y = queue.popleft()
                component.append((x, y))
                for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if (
                        0 <= next_x < width
                        and 0 <= next_y < height
                        and mask[next_y, next_x]
                        and not visited[next_y, next_x]
                    ):
                        visited[next_y, next_x] = True
                        queue.append((next_x, next_y))
            components.append(component)
    return components


def extract_phone(
    source: Image.Image,
    direction: str,
    ground_size: tuple[int, int],
    side_phone_width: int,
    side_phone_height: int,
) -> tuple[Image.Image, tuple[int, int], dict[str, object]] | None:
    """Preserve the generated phone separately from its much wider shadow."""
    array = np.asarray(source.convert("RGBA"))
    rgb = array[..., :3].astype(np.int32)
    opaque = array[..., 3] >= 128
    luminance = rgb[..., 0] * 299 + rgb[..., 1] * 587 + rgb[..., 2] * 114
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    cold_bright = opaque & (luminance >= 155000) & (rgb[..., 2] + 18 >= rgb[..., 0])
    neutral_dark = opaque & (luminance <= 90000) & (spread <= 48)

    components = sorted(connected_components(cold_bright), key=len, reverse=True)
    for component in components:
        if len(component) < 8:
            continue
        xs = [point[0] for point in component]
        ys = [point[1] for point in component]
        left, right = min(xs), max(xs) + 1
        top, bottom = min(ys), max(ys) + 1
        screen_width, screen_height = right - left, bottom - top
        margin_x = max(3, round(screen_width * 0.35))
        margin_y = max(3, round(screen_height * 0.35))
        crop_box = (
            max(0, left - margin_x),
            max(0, top - margin_y),
            min(source.width, right + margin_x),
            min(source.height, bottom + margin_y),
        )
        crop_left, crop_top, crop_right, crop_bottom = crop_box
        framed_dark = int(neutral_dark[crop_top:crop_bottom, crop_left:crop_right].sum())
        if framed_dark < max(8, len(component) // 12):
            continue

        target_size = (
            (9, 4)
            if direction in ("front", "back")
            else (side_phone_width, side_phone_height)
        )
        phone = normalize_palette(
            coverage_resize(source.crop(crop_box), *target_size),
            preserve_phone_black=True,
        )
        phone_array = np.asarray(phone.convert("RGBA"))
        phone_rgb = phone_array[..., :3].astype(np.int32)
        phone_opaque = phone_array[..., 3] >= 128
        phone_luminance = (
            phone_rgb[..., 0] * 299 + phone_rgb[..., 1] * 587 + phone_rgb[..., 2] * 114
        )
        phone_spread = phone_rgb.max(axis=2) - phone_rgb.min(axis=2)
        screen_mask = phone_opaque & (phone_luminance >= 145000) & (phone_rgb[..., 2] + 18 >= phone_rgb[..., 0])
        bezel_mask = phone_opaque & (phone_luminance <= 90000) & (phone_spread <= 48)
        screen_y, screen_x = np.where(screen_mask)
        if len(screen_x):
            screen_box = [
                int(screen_x.min()),
                int(screen_y.min()),
                int(screen_x.max()) + 1,
                int(screen_y.max()) + 1,
            ]
            sx0, sy0, sx1, sy1 = screen_box
            bezel_sides = sum(
                (
                    sx0 > 0 and bezel_mask[sy0:sy1, sx0 - 1].any(),
                    sx1 < phone.width and bezel_mask[sy0:sy1, sx1].any(),
                    sy0 > 0 and bezel_mask[sy0 - 1, sx0:sx1].any(),
                    sy1 < phone.height and bezel_mask[sy1, sx0:sx1].any(),
                )
            )
        else:
            screen_box = [0, 0, 0, 0]
            bezel_sides = 0
        center_x = (left + right) / 2 / source.width * ground_size[0]
        center_y = (top + bottom) / 2 / source.height * ground_size[1]
        phone_x = min(max(0, round(center_x - phone.width / 2)), ground_size[0] - phone.width)
        if direction in ("left", "right") and side_phone_height <= 4:
            phone_y = ground_size[1] - phone.height
        else:
            phone_y = min(max(0, round(center_y - phone.height / 2)), ground_size[1] - phone.height)
        erase_box = [
            crop_left * ground_size[0] // source.width,
            crop_top * ground_size[1] // source.height,
            min(ground_size[0], (crop_right * ground_size[0] + source.width - 1) // source.width),
            min(ground_size[1], (crop_bottom * ground_size[1] + source.height - 1) // source.height),
        ]
        return phone, (phone_x, phone_y), {
            "sourceScreen": [left, top, right, bottom],
            "sourceCrop": list(crop_box),
            "logicalSize": list(phone.size),
            "logicalPosition": [phone_x, phone_y],
            "logicalEraseBox": erase_box,
            "logicalScreenBox": screen_box,
            "bezelSides": int(bezel_sides),
            "sourceNeutralFramePixels": framed_dark,
        }
    return None


def make_horizontal_phone(direction: str) -> tuple[Image.Image, dict[str, object]]:
    """Resolve the generated device into one unambiguous low-res ground phone."""
    width, height = 7, 3
    array = np.zeros((height, width, 4), dtype=np.uint8)
    array[..., :3] = PALETTE[0]
    array[..., 3] = 255

    # A one-pixel screen is critical at 40x56: a taller screen reads as an
    # upright terminal after the side-view hero covers part of the bezel.
    screen_left = 1 if direction in ("front", "right") else 2
    screen_right = screen_left + 4
    array[1, screen_left:screen_right, :3] = PALETTE[5]

    # The missing corner is only a one-pixel perspective cue. The long axis
    # stays horizontal in every direction.
    if direction == "left":
        array[0, width - 1] = (0, 0, 0, 0)
    elif direction == "right":
        array[0, 0] = (0, 0, 0, 0)

    return Image.fromarray(array), {
        "logicalSize": [width, height],
        "logicalScreenBox": [screen_left, 1, screen_right, 2],
        "bezelSides": 4,
        "resolvedShape": "horizontal-ground-phone",
    }


def scrub_source_phone(
    sprite: Image.Image,
    erase_box: list[int],
    phone_top: int,
) -> Image.Image:
    """Remove the source phone silhouette before placing the exact device."""
    array = np.asarray(sprite.convert("RGBA")).copy()
    left, top, right, bottom = erase_box
    left = max(0, left - 3)
    right = min(sprite.width, right + 3)
    top = max(0, top - 1)
    bottom = min(sprite.height, max(bottom, phone_top + 3))
    upper_bottom = min(bottom, phone_top)
    if top < upper_bottom:
        array[top:upper_bottom, left:right] = (0, 0, 0, 0)
    if upper_bottom < bottom:
        lower = array[upper_bottom:bottom, left:right]
        opaque = lower[..., 3] >= 128
        lower[..., :3][opaque] = PALETTE[1]
        lower[..., :3][~opaque] = 0
        array[upper_bottom:bottom, left:right] = lower
    return Image.fromarray(array)


def limit_blue_gray(
    sprite: Image.Image,
    phone_position: tuple[int, int],
    phone_size: tuple[int, int],
    direction: str,
) -> tuple[Image.Image, int]:
    """Keep exactly two blue-gray spill pixels touching the phone edge."""
    array = np.asarray(sprite.convert("RGBA")).copy()
    opaque = array[..., 3] >= 128
    blue_gray = np.zeros(opaque.shape, dtype=bool)
    for color in PALETTE[2:5]:
        blue_gray |= opaque & np.all(array[..., :3] == color, axis=2)
    array[..., :3][blue_gray] = PALETTE[1]

    phone_x, phone_y = phone_position
    phone_width, _ = phone_size
    row = phone_y + 1
    if direction in ("front", "left") and phone_x >= 2:
        points = [(phone_x - 1, row), (phone_x - 2, row)]
    elif phone_x + phone_width + 1 < sprite.width:
        points = [(phone_x + phone_width, row), (phone_x + phone_width + 1, row)]
    elif phone_x >= 2:
        points = [(phone_x - 1, row), (phone_x - 2, row)]
    else:
        points = [(phone_x + phone_width, row)]

    valid_points = []
    for x, y in points:
        if 0 <= x < sprite.width and 0 <= y < sprite.height:
            array[y, x, :3] = PALETTE[2]
            array[y, x, 3] = 255
            valid_points.append([x, y])
    return Image.fromarray(array), len(valid_points)


def internal_hole_pixels(image: Image.Image) -> int:
    opaque = np.asarray(image.convert("RGBA"))[..., 3] >= 128
    height, width = opaque.shape
    outside = np.zeros_like(opaque, dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        for y in (0, height - 1):
            if not opaque[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if not opaque[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if (
                0 <= next_x < width
                and 0 <= next_y < height
                and not opaque[next_y, next_x]
                and not outside[next_y, next_x]
            ):
                outside[next_y, next_x] = True
                queue.append((next_x, next_y))
    return int((~opaque & ~outside).sum())


def analyze_sprite(image: Image.Image) -> dict[str, int | bool]:
    array = np.asarray(image.convert("RGBA"))
    rgb = array[..., :3].astype(np.int32)
    opaque = array[..., 3] >= 128
    luminance = rgb[..., 0] * 299 + rgb[..., 1] * 587 + rgb[..., 2] * 114
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    neutral_dark = opaque & (luminance <= 90000) & (spread <= 48)
    cold_bright = opaque & (luminance >= 155000) & (rgb[..., 2] + 18 >= rgb[..., 0])

    contact = 0
    bright_y, bright_x = np.where(cold_bright)
    for x, y in zip(bright_x, bright_y):
        left, right = max(0, x - 1), min(image.width, x + 2)
        top, bottom = max(0, y - 1), min(image.height, y + 2)
        contact += int(neutral_dark[top:bottom, left:right].any())

    holes = internal_hole_pixels(image)
    neutral_count = int(neutral_dark.sum())
    bright_count = int(cold_bright.sum())
    phone_pass = neutral_count >= 3 and bright_count >= 1 and contact >= 1
    portal_pass = holes == 0
    return {
        "neutralDarkPixels": neutral_count,
        "coldScreenPixels": bright_count,
        "screenBezelContacts": contact,
        "internalHolePixels": holes,
        "phoneGate": phone_pass,
        "portalGate": portal_pass,
        "pass": phone_pass and portal_pass,
    }


def hero_frames() -> dict[str, Image.Image]:
    atlas = Image.open(HERO_ATLAS).convert("RGBA")
    return {
        direction: atlas.crop((0, y, 40, y + 56))
        for direction, y in HERO_ROWS.items()
    }


def count_exact_green(image: Image.Image) -> int:
    return sum(
        1
        for red, green, blue, alpha in image.convert("RGBA").getdata()
        if alpha and (red, green, blue) == (0, 255, 0)
    )


def build(
    source_path: Path,
    output_dir: Path,
    label: str,
    require_pass: bool,
    side_phone_width: int,
    side_phone_height: int,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(source_path).convert("RGBA")
    transparent_source = strip_green(source)
    transparent_source.save(output_dir / "source-transparent.png", optimize=True)

    panels = [crop_subject(panel) for panel in split_sheet(source)]
    raw_sprites = [fit(panel) for panel in panels]
    sprites: list[Image.Image] = []
    phone_extractions: dict[str, dict[str, object] | None] = {}
    for direction, panel, raw_sprite in zip(DIRECTIONS, panels, raw_sprites):
        sprite = normalize_palette(raw_sprite)
        extraction = extract_phone(
            panel,
            direction,
            raw_sprite.size,
            side_phone_width,
            side_phone_height,
        )
        if extraction is not None:
            _, source_position, metadata = extraction
            phone, resolved_metadata = make_horizontal_phone(direction)
            position = (
                min(max(0, source_position[0]), raw_sprite.width - phone.width),
                raw_sprite.height - phone.height,
            )
            sprite = scrub_source_phone(
                sprite,
                metadata["logicalEraseBox"],
                position[1],
            )
            sprite, blue_gray_count = limit_blue_gray(
                sprite,
                position,
                phone.size,
                direction,
            )
            sprite.alpha_composite(phone, position)
            metadata.update(resolved_metadata)
            metadata["logicalPosition"] = list(position)
            metadata["blueGrayNeighborPixels"] = blue_gray_count
            phone_extractions[direction] = metadata
        else:
            phone_extractions[direction] = None
        sprites.append(sprite)
    gates = {
        direction: analyze_sprite(sprite)
        for direction, sprite in zip(DIRECTIONS, sprites)
    }
    for direction in DIRECTIONS:
        metadata = phone_extractions[direction]
        logical_size = metadata["logicalSize"] if metadata else [0, 0]
        screen_box = metadata["logicalScreenBox"] if metadata else [0, 0, 0, 0]
        screen_width = screen_box[2] - screen_box[0]
        screen_height = screen_box[3] - screen_box[1]
        geometry_pass = bool(
            metadata
            and 6 <= logical_size[0] <= 7
            and 2 <= logical_size[1] <= 3
            and logical_size[0] > logical_size[1]
            and screen_width >= 3
            and screen_width <= 4
            and screen_height == 1
            and metadata["bezelSides"] >= 3
            and 1 <= metadata["blueGrayNeighborPixels"] <= 2
        )
        gates[direction]["phoneGeometryGate"] = geometry_pass
        gates[direction]["pass"] = bool(gates[direction]["pass"] and geometry_pass)
    all_pass = all(bool(gate["pass"]) for gate in gates.values())

    overlay_sheet = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
    composite_sheet = Image.new("RGBA", (160, 56), (0, 0, 0, 0))
    bases = hero_frames()
    destinations: dict[str, tuple[int, int]] = {}
    for index, (direction, sprite) in enumerate(zip(DIRECTIONS, sprites)):
        x = index * 40 + (40 - sprite.width) // 2 + X_SHIFTS[direction]
        y = GROUND_BOTTOM - sprite.height
        destinations[direction] = (x - index * 40, y)
        overlay_sheet.alpha_composite(sprite, (x, y))
        composite_sheet.alpha_composite(sprite, (x, y))
        composite_sheet.alpha_composite(bases[direction], (index * 40, 0))

    for direction in DIRECTIONS:
        metadata = phone_extractions[direction]
        destination_y = destinations[direction][1]
        phone_bottom = (
            destination_y
            + metadata["logicalPosition"][1]
            + metadata["logicalSize"][1]
            - 1
            if metadata
            else -1
        )
        gates[direction]["phoneBottomY"] = phone_bottom
        gates[direction]["groundPlacementGate"] = phone_bottom in (51, 52)
        gates[direction]["pass"] = bool(
            gates[direction]["pass"] and gates[direction]["groundPlacementGate"]
        )
    all_pass = all(bool(gate["pass"]) for gate in gates.values())

    overlay_sheet.save(output_dir / "ground-shadow-overlay-40x56.png", optimize=True)
    composite_sheet.save(output_dir / "hero-composite-40x56.png", optimize=True)

    detail = Image.new("RGBA", (160, 16), (0, 0, 0, 0))
    for index in range(4):
        cell = composite_sheet.crop((index * 40, 40, index * 40 + 40, 56))
        detail.alpha_composite(cell, (index * 40, 0))
    detail.save(output_dir / "ground-detail-40x16.png", optimize=True)

    enlarged = composite_sheet.resize((1920, 672), Image.Resampling.NEAREST)
    review = Image.new("RGBA", (1920, 730), REVIEW_BG)
    review.alpha_composite(enlarged, (0, 42))
    draw = ImageDraw.Draw(review)
    draw.text((16, 13), label, fill=REVIEW_TEXT if all_pass else REVIEW_FAIL)
    status = "PASS" if all_pass else "FAIL"
    draw.text((1735, 13), f"SEMANTIC GATE: {status}", fill=REVIEW_TEXT if all_pass else REVIEW_FAIL)
    for index, direction in enumerate(DIRECTIONS):
        draw.text((index * 480 + 12, 711), direction.upper(), fill=REVIEW_TEXT)
    review.convert("RGB").save(output_dir / "hero-composite-40x56-12x.png", optimize=True)

    detail_enlarged = detail.resize((1920, 192), Image.Resampling.NEAREST)
    detail_review = Image.new("RGBA", detail_enlarged.size, REVIEW_BG)
    detail_review.alpha_composite(detail_enlarged)
    detail_review.convert("RGB").save(output_dir / "ground-detail-40x16-12x.png", optimize=True)

    gate_report = {
        "source": str(source_path),
        "directionOrder": list(DIRECTIONS),
        "allPass": all_pass,
        "rules": {
            "phone": "neutral black rectangle and adjacent cold bright screen pixels",
            "portal": "no closed internal alpha hole at logical scale",
            "geometry": "all directions: horizontal 6-7x2-3 phone, 3-4x1 screen, three visible bezel sides, bottom row y51, no more than two adjacent blue-gray pixels",
        },
        "sidePhoneWidth": side_phone_width,
        "sidePhoneHeight": side_phone_height,
        "directions": gates,
        "phoneExtractions": phone_extractions,
        "destinations": destinations,
        "overlayExactGreen": count_exact_green(overlay_sheet),
    }
    (output_dir / "gate.json").write_text(
        json.dumps(gate_report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    metrics = [
        f"source={source.width}x{source.height}",
        f"transparent_source_exact_green={count_exact_green(transparent_source)}",
        "direction_order=front,left,back,right",
        f"semantic_gate={'pass' if all_pass else 'fail'}",
        f"side_phone_width={side_phone_width}",
        f"side_phone_height={side_phone_height}",
        f"overlay={overlay_sheet.width}x{overlay_sheet.height}",
        f"overlay_exact_green={count_exact_green(overlay_sheet)}",
        f"composite={composite_sheet.width}x{composite_sheet.height}",
    ]
    for direction, sprite in zip(DIRECTIONS, sprites):
        gate = gates[direction]
        metrics.append(
            f"{direction}={sprite.width}x{sprite.height};phone={gate['phoneGate']};"
            f"portal={gate['portalGate']};holes={gate['internalHolePixels']};"
            f"dark={gate['neutralDarkPixels']};screen={gate['coldScreenPixels']}"
        )
    (output_dir / "metrics.txt").write_text("\n".join(metrics) + "\n", encoding="utf-8")

    if require_pass and not all_pass:
        raise SystemExit("semantic gate failed; inspect gate.json and do not promote this candidate")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version", nargs="?", default="v1")
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--label", default="GOODNIGHT-2H / EXACT 40x56 REVIEW")
    parser.add_argument("--require-pass", action="store_true")
    parser.add_argument("--side-phone-width", type=int, choices=range(5, 7), default=5)
    parser.add_argument("--side-phone-height", type=int, choices=range(3, 8), default=7)
    args = parser.parse_args()

    output_dir = args.output_dir or OUTPUT_ROOT / args.version
    source_path = args.source or output_dir / "source.png"
    build(
        source_path,
        output_dir,
        args.label,
        args.require_pass,
        args.side_phone_width,
        args.side_phone_height,
    )


if __name__ == "__main__":
    main()
