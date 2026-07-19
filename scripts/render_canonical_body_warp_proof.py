#!/usr/bin/env python3
"""Prove one canonical pixel body can support several builds without asset multiplication."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image, ImageDraw

from render_directional_rig_proof import (
    DIRECTIONS,
    directional_body,
    directional_coat,
)
from render_rig_fit_proof import (
    FRAME_H,
    FRAME_W,
    ROOT_X,
    RigSpec,
    dark_preview,
    solve,
)


OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-canonical-warp-proof")
PREVIEW_SCALE = 5
RUNTIME_ROOT_Y = 49
SOURCE_SHIFT_Y = -3
SOURCE_BOTTOM = 52

GLASS = (133, 177, 181, 255)
GLASS_LIGHT = (211, 229, 223, 255)
PHONE = (30, 29, 35, 255)
PHONE_SCREEN = (91, 157, 149, 255)
PHONE_GLINT = (168, 205, 190, 255)


@dataclass(frozen=True)
class WarpProfile:
    id: str
    label: str
    torso_row_delta: int
    leg_row_delta: int
    torso_width_percent: int
    leg_width_percent: int


PROFILES = (
    WarpProfile("tall-slim", "TALL / SLIM", 1, 3, 82, 88),
    WarpProfile("tall-soft", "TALL / SOFT", 1, 3, 126, 110),
    WarpProfile("standard", "STANDARD", 0, 0, 100, 100),
    WarpProfile("short-slim", "SHORT / SLIM", -1, -3, 84, 90),
    WarpProfile("short-soft", "SHORT / SOFT", -1, -3, 128, 112),
)

# Source bands are fixed for every direction. Destination bands change only by
# repeating or omitting complete pixel rows; the feet remain registered at y=49.
SOURCE_BANDS = (
    ("head", 11, 23),
    ("torso", 24, 36),
    ("legs", 37, 47),
    ("feet", 48, 52),
)

CANONICAL_SPEC = RigSpec(
    id="canonical",
    label="CANONICAL",
    leg_length=13,
    torso_height=13,
    shoulder_width=12,
    chest_width=10,
    waist_width=9,
    limb_width=2,
    head_width=11,
    head_height=10,
)


def target_band_length(name: str, source_length: int, profile: WarpProfile) -> int:
    if name == "torso":
        return source_length + profile.torso_row_delta
    if name == "legs":
        return source_length + profile.leg_row_delta
    return source_length


def x_factor(name: str, profile: WarpProfile) -> float:
    if name == "torso":
        return profile.torso_width_percent / 100
    if name in {"legs", "feet"}:
        return profile.leg_width_percent / 100
    return 1.0


def build_row_map(profile: WarpProfile) -> list[tuple[int, int, str]]:
    target_lengths = [
        target_band_length(name, end - start + 1, profile)
        for name, start, end in SOURCE_BANDS
    ]
    target_top = SOURCE_BOTTOM + 1 - sum(target_lengths)
    rows: list[tuple[int, int, str]] = []
    destination_y = target_top
    for (name, source_start, source_end), target_length in zip(SOURCE_BANDS, target_lengths):
        source_length = source_end - source_start + 1
        for target_offset in range(target_length):
            source_offset = min(source_length - 1, (target_offset * source_length) // target_length)
            rows.append((destination_y, source_start + source_offset, name))
            destination_y += 1
    return rows


def warp_layer(source: Image.Image, profile: WarpProfile) -> Image.Image:
    if source.size != (FRAME_W, FRAME_H):
        raise ValueError(f"expected {(FRAME_W, FRAME_H)}, got {source.size}")
    destination = Image.new("RGBA", source.size, (0, 0, 0, 0))
    source_pixels = source.load()
    destination_pixels = destination.load()
    for destination_y, source_y, band_name in build_row_map(profile):
        factor = x_factor(band_name, profile)
        for destination_x in range(FRAME_W):
            source_x = ROOT_X + round((destination_x - ROOT_X) / factor)
            if 0 <= source_x < FRAME_W:
                destination_pixels[destination_x, destination_y] = source_pixels[source_x, source_y]
    return destination


def band_for_source_y(source_y: int) -> str:
    for name, start, end in SOURCE_BANDS:
        if start <= source_y <= end:
            return name
    raise ValueError(f"source y {source_y} is outside canonical bands")


def map_anchor(anchor: tuple[int, int], profile: WarpProfile) -> tuple[int, int]:
    source_x, source_y = anchor
    band_name = band_for_source_y(source_y)
    source_band = next(band for band in SOURCE_BANDS if band[0] == band_name)
    _, source_start, source_end = source_band
    source_length = source_end - source_start + 1
    target_length = target_band_length(band_name, source_length, profile)

    target_top = SOURCE_BOTTOM + 1 - sum(
        target_band_length(name, end - start + 1, profile)
        for name, start, end in SOURCE_BANDS
    )
    for name, start, end in SOURCE_BANDS:
        if name == band_name:
            break
        target_top += target_band_length(name, end - start + 1, profile)

    source_offset = source_y - source_start
    target_offset = min(
        target_length - 1,
        round(source_offset * max(0, target_length - 1) / max(1, source_length - 1)),
    )
    destination_y = target_top + target_offset
    factor = x_factor(band_name, profile)
    destination_x = ROOT_X + round((source_x - ROOT_X) * factor)
    return destination_x, destination_y


def canonical_anchors(direction: str, rig) -> dict[str, tuple[int, int]]:
    eye_y = rig.eyes[0][1] + SOURCE_SHIFT_Y
    hand_y = rig.hands[0][1] + SOURCE_SHIFT_Y
    if direction == "front":
        return {"face": (ROOT_X, eye_y), "phone": (rig.hands[0][0] - 1, hand_y + 3)}
    if direction == "back":
        return {"face": (ROOT_X, eye_y), "phone": (rig.hands[1][0] + 1, hand_y + 3)}
    if direction == "left":
        return {"face": (ROOT_X - 3, eye_y), "phone": (ROOT_X - 5, hand_y + 3)}
    return {"face": (ROOT_X + 3, eye_y), "phone": (ROOT_X + 5, hand_y + 3)}


def shift_to_runtime_root(image: Image.Image) -> Image.Image:
    shifted = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shifted.alpha_composite(image, (0, SOURCE_SHIFT_Y))
    return shifted


def mirror_about_root(image: Image.Image) -> Image.Image:
    mirrored = Image.new("RGBA", image.size, (0, 0, 0, 0))
    source_pixels = image.load()
    destination_pixels = mirrored.load()
    clipped = 0
    for source_y in range(FRAME_H):
        for source_x in range(FRAME_W):
            pixel = source_pixels[source_x, source_y]
            if pixel[3] == 0:
                continue
            destination_x = ROOT_X * 2 - source_x
            if 0 <= destination_x < FRAME_W:
                destination_pixels[destination_x, source_y] = pixel
            else:
                clipped += 1
    if clipped:
        raise AssertionError(f"rooted mirror clipped {clipped} opaque pixels")
    return mirrored


def draw_glasses(image: Image.Image, anchor: tuple[int, int], direction: str) -> tuple[int, int]:
    if direction == "back":
        return (0, 0)
    draw = ImageDraw.Draw(image)
    x, y = anchor
    if direction == "front":
        draw.rectangle((x - 5, y - 2, x - 2, y + 1), fill=GLASS)
        draw.rectangle((x + 2, y - 2, x + 5, y + 1), fill=GLASS)
        draw.line((x - 1, y - 1, x + 2, y - 1), fill=GLASS, width=1)
        draw.point((x - 4, y - 1), fill=GLASS_LIGHT)
        draw.point((x + 3, y - 1), fill=GLASS_LIGHT)
        return (11, 4)
    if direction == "left":
        draw.rectangle((x - 2, y - 2, x + 2, y + 1), fill=GLASS)
        draw.line((x + 2, y - 1, x + 5, y - 1), fill=GLASS, width=1)
        draw.point((x - 1, y - 1), fill=GLASS_LIGHT)
        return (8, 4)
    draw.rectangle((x - 2, y - 2, x + 2, y + 1), fill=GLASS)
    draw.line((x - 5, y - 1, x - 2, y - 1), fill=GLASS, width=1)
    draw.point((x + 1, y - 1), fill=GLASS_LIGHT)
    return (8, 4)


def draw_phone(image: Image.Image, anchor: tuple[int, int]) -> tuple[int, int]:
    draw = ImageDraw.Draw(image)
    x, y = anchor
    draw.rectangle((x - 2, y - 4, x + 1, y + 3), fill=PHONE)
    draw.rectangle((x - 1, y - 3, x, y + 1), fill=PHONE_SCREEN)
    draw.point((x - 1, y - 3), fill=PHONE_GLINT)
    draw.point((x, y + 2), fill=PHONE_GLINT)
    return (4, 8)


def render_rigid_props(
    direction: str,
    profile: WarpProfile,
    anchors: dict[str, tuple[int, int]],
) -> tuple[Image.Image, dict[str, object]]:
    image = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    mapped_face = map_anchor(anchors["face"], profile)
    mapped_phone = map_anchor(anchors["phone"], profile)
    glasses_size = draw_glasses(image, mapped_face, direction)
    phone_size = draw_phone(image, mapped_phone)
    return image, {
        "anchors": {"face": list(mapped_face), "phone": list(mapped_phone)},
        "component_size": {"glasses": list(glasses_size), "phone": list(phone_size)},
        "occlusion": {"glasses": "hidden-by-head" if direction == "back" else "visible"},
    }


def make_grid(rows: list[list[Image.Image]]) -> Image.Image:
    grid = Image.new(
        "RGBA",
        (FRAME_W * len(PROFILES), FRAME_H * len(DIRECTIONS)),
        (0, 0, 0, 0),
    )
    for row_index, row in enumerate(rows):
        for column_index, frame in enumerate(row):
            grid.alpha_composite(frame, (column_index * FRAME_W, row_index * FRAME_H))
    return grid


def make_labeled_preview(
    rows: list[tuple[str, list[Image.Image]]],
    output_path: Path,
    row_label_width: int = 86,
) -> None:
    label_top = 30
    panel_width = FRAME_W * PREVIEW_SCALE
    panel_height = FRAME_H * PREVIEW_SCALE
    preview = Image.new(
        "RGBA",
        (
            row_label_width + panel_width * len(PROFILES),
            label_top + panel_height * len(rows),
        ),
        (19, 18, 24, 255),
    )
    draw = ImageDraw.Draw(preview)
    for column, profile in enumerate(PROFILES):
        draw.text(
            (row_label_width + column * panel_width + 8, 9),
            profile.label,
            fill=(220, 211, 195, 255),
        )
    for row_index, (label, frames) in enumerate(rows):
        row_y = label_top + row_index * panel_height
        draw.text((8, row_y + 10), label, fill=(196, 180, 151, 255))
        for column, frame in enumerate(frames):
            enlarged = dark_preview(frame).resize(
                (panel_width, panel_height),
                Image.Resampling.NEAREST,
            )
            preview.alpha_composite(enlarged, (row_label_width + column * panel_width, row_y))
    for column in range(len(PROFILES) + 1):
        x = row_label_width + column * panel_width
        draw.line((x, 0, x, preview.height), fill=(67, 57, 70, 255), width=1)
    for row_index in range(len(rows) + 1):
        y = label_top + row_index * panel_height
        draw.line((0, y, preview.width, y), fill=(67, 57, 70, 255), width=1)
    preview.convert("RGB").save(output_path, optimize=True)


def assert_palette_preserved(source: Image.Image, warped: Image.Image) -> None:
    source_colors = set(source.getdata())
    warped_colors = set(warped.getdata())
    unexpected = warped_colors - source_colors
    if unexpected:
        raise AssertionError(f"warp introduced interpolated colors: {unexpected}")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    rig = solve(CANONICAL_SPEC)
    canonical_bodies = {
        direction: shift_to_runtime_root(directional_body(CANONICAL_SPEC, rig, direction))
        for direction in ("front", "back", "left")
    }
    canonical_coats = {
        direction: shift_to_runtime_root(directional_coat(CANONICAL_SPEC, rig, direction))
        for direction in ("front", "back", "left")
    }
    canonical_bodies["right"] = mirror_about_root(canonical_bodies["left"])
    canonical_coats["right"] = mirror_about_root(canonical_coats["left"])
    canonical_anchors_by_direction = {
        direction: canonical_anchors(direction, rig) for direction in DIRECTIONS
    }

    body_rows: list[list[Image.Image]] = []
    coat_rows: list[list[Image.Image]] = []
    prop_rows: list[list[Image.Image]] = []
    composite_rows: list[list[Image.Image]] = []
    manifest_profiles: dict[str, object] = {}

    for direction in DIRECTIONS:
        body_row: list[Image.Image] = []
        coat_row: list[Image.Image] = []
        prop_row: list[Image.Image] = []
        composite_row: list[Image.Image] = []
        direction_manifest: dict[str, object] = {}
        for profile in PROFILES:
            body = warp_layer(canonical_bodies[direction], profile)
            coat = warp_layer(canonical_coats[direction], profile)
            props, prop_manifest = render_rigid_props(
                direction,
                profile,
                canonical_anchors_by_direction[direction],
            )
            assert_palette_preserved(canonical_bodies[direction], body)
            assert_palette_preserved(canonical_coats[direction], coat)
            if profile.id == "standard":
                if body.tobytes() != canonical_bodies[direction].tobytes():
                    raise AssertionError(f"standard body is not identity in {direction}")
                if coat.tobytes() != canonical_coats[direction].tobytes():
                    raise AssertionError(f"standard coat is not identity in {direction}")
            if warp_layer(canonical_bodies[direction], profile).tobytes() != body.tobytes():
                raise AssertionError(f"body warp is not deterministic for {direction}/{profile.id}")
            body_bbox = body.getbbox()
            if body_bbox is None or body_bbox[3] - 1 != RUNTIME_ROOT_Y:
                raise AssertionError(
                    f"ground registration failed for {direction}/{profile.id}: {body_bbox}"
                )
            if any(alpha not in {0, 255} for *_, alpha in body.getdata()):
                raise AssertionError(f"partial alpha in body {direction}/{profile.id}")
            if any(alpha not in {0, 255} for *_, alpha in coat.getdata()):
                raise AssertionError(f"partial alpha in coat {direction}/{profile.id}")
            composite = body.copy()
            composite.alpha_composite(coat)
            composite.alpha_composite(props)
            body_row.append(body)
            coat_row.append(coat)
            prop_row.append(props)
            composite_row.append(composite)
            direction_manifest[profile.id] = prop_manifest
        body_rows.append(body_row)
        coat_rows.append(coat_row)
        prop_rows.append(prop_row)
        composite_rows.append(composite_row)
        manifest_profiles[direction] = direction_manifest

    for profile_index, profile in enumerate(PROFILES):
        mirrored_body = mirror_about_root(body_rows[DIRECTIONS.index("left")][profile_index])
        mirrored_coat = mirror_about_root(coat_rows[DIRECTIONS.index("left")][profile_index])
        if mirrored_body.tobytes() != body_rows[DIRECTIONS.index("right")][profile_index].tobytes():
            raise AssertionError(f"left/right body mirror mismatch for {profile.id}")
        if mirrored_coat.tobytes() != coat_rows[DIRECTIONS.index("right")][profile_index].tobytes():
            raise AssertionError(f"left/right coat mirror mismatch for {profile.id}")

    canonical_body_sheet = Image.new("RGBA", (FRAME_W * len(DIRECTIONS), FRAME_H), (0, 0, 0, 0))
    canonical_coat_sheet = canonical_body_sheet.copy()
    for index, direction in enumerate(DIRECTIONS):
        canonical_body_sheet.alpha_composite(canonical_bodies[direction], (index * FRAME_W, 0))
        canonical_coat_sheet.alpha_composite(canonical_coats[direction], (index * FRAME_W, 0))
    canonical_body_sheet.save(OUTPUT_DIR / "canonical-body-4dir.png", optimize=True)
    canonical_coat_sheet.save(OUTPUT_DIR / "canonical-raincoat-4dir.png", optimize=True)

    sheets = {
        "warped-body-4dir.png": make_grid(body_rows),
        "warped-raincoat-4dir.png": make_grid(coat_rows),
        "rigid-props-4dir.png": make_grid(prop_rows),
        "composite-4dir.png": make_grid(composite_rows),
    }
    for filename, sheet in sheets.items():
        sheet.save(OUTPUT_DIR / filename, optimize=True)

    front_index = DIRECTIONS.index("front")
    make_labeled_preview(
        [
            ("BASE", body_rows[front_index]),
            ("FITTED", coat_rows[front_index]),
            ("RIGID", prop_rows[front_index]),
            ("COMPOSITE", composite_rows[front_index]),
        ],
        OUTPUT_DIR / "front-layer-comparison.png",
    )
    make_labeled_preview(
        [(direction.upper(), frames) for direction, frames in zip(DIRECTIONS, composite_rows)],
        OUTPUT_DIR / "four-direction-comparison.png",
    )

    file_sizes = {
        filename: (OUTPUT_DIR / filename).stat().st_size
        for filename in [
            "canonical-body-4dir.png",
            "canonical-raincoat-4dir.png",
            *sheets.keys(),
        ]
    }
    manifest = {
        "purpose": "structural proof only; not final production art",
        "frame": {"width": FRAME_W, "height": FRAME_H, "root": [ROOT_X, RUNTIME_ROOT_Y]},
        "canonical_body_count": 1,
        "directions": list(DIRECTIONS),
        "profiles": [asdict(profile) for profile in PROFILES],
        "source_bands": [
            {"name": name, "start": start, "end": end}
            for name, start, end in SOURCE_BANDS
        ],
        "rules": {
            "body_and_fitted_garments": "integer row/column remap; no interpolation",
            "rigid_accessories": "drawn after body warp at transformed anchors; own pixels unchanged",
            "back_face_items": "occluded by head unless item explicitly has a rear component",
            "right_direction": "body may mirror; asymmetric props use a distinct right attachment",
        },
        "accessories": manifest_profiles,
        "runtime_png_bytes": file_sizes,
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )

    total_runtime_bytes = sum(file_sizes.values())
    print(f"wrote proof to {OUTPUT_DIR}")
    print(f"wrote {len(PROFILES)} profiles x {len(DIRECTIONS)} directions")
    print(f"six native PNG files total {total_runtime_bytes} bytes")


if __name__ == "__main__":
    main()
