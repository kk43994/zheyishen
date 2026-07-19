#!/usr/bin/env python3
"""Build all runtime stature/build atlases from the selected style-1 mother sprites."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

import render_style1_exact_animation as exact


SOURCE_DIR = exact.SOURCE_DIR
REFERENCE_DIR = exact.OUTPUT_DIR
ASSET_DIR = Path("src/assets/hero-style1-profiles")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-hero-style1-profiles")

STATURES = ("short", "average", "tall")
BUILDS = ("slim", "average", "sturdy", "soft")
PROFILES = tuple((stature, build) for stature in STATURES for build in BUILDS)

SOURCE_ZONES = (
    ("head", 7, 22),
    ("torso", 23, 39),
    ("legs", 40, 46),
    ("feet", 47, 49),
)
STATURE_DELTAS = {
    "short": {"torso": -1, "legs": -3},
    "average": {"torso": 0, "legs": 0},
    "tall": {"torso": 1, "legs": 3},
}
WIDTH_PERCENT = {
    "slim": {"head": 100, "torso": 84, "legs": 90, "feet": 90},
    "average": {"head": 100, "torso": 100, "legs": 100, "feet": 100},
    "sturdy": {"head": 100, "torso": 116, "legs": 108, "feet": 108},
    "soft": {"head": 100, "torso": 128, "legs": 112, "feet": 112},
}

RAIN_INK = (23, 21, 27, 255)
RAIN_DARK = (142, 116, 40, 255)
RAIN = (167, 138, 45, 255)
RAIN_LIGHT = (208, 177, 79, 255)
MASK = (255, 255, 255, 255)
SKIN_COLORS = {
    (218, 208, 186, 255),
    (199, 181, 158, 255),
    exact.SKIN_SHADOW,
}

ANCHOR_LAYERS = {
    "head": "head",
    "face": "head",
    "neck": "upper",
    "chest": "upper",
    "back": "upper",
    "leftHand": "left_arm",
    "rightHand": "right_arm",
    "waist": "upper",
    "feet": None,
    "shadow": None,
}


@dataclass(frozen=True)
class Profile:
    stature: str
    build: str

    @property
    def key(self) -> str:
        return f"{self.stature}-{self.build}"


def round_ratio(numerator: int, denominator: int) -> int:
    """Match src/hero-morph.ts symmetric integer rounding exactly."""
    sign = -1 if numerator < 0 else 1
    return sign * ((abs(numerator) + denominator // 2) // denominator)


def target_length(zone: str, source_length: int, stature: str) -> int:
    if zone in {"torso", "legs"}:
        return source_length + STATURE_DELTAS[stature][zone]
    return source_length


def row_map(profile: Profile) -> list[tuple[int, int, str]]:
    lengths = [
        target_length(zone, end - start + 1, profile.stature)
        for zone, start, end in SOURCE_ZONES
    ]
    destination_y = exact.ROOT_Y + 1 - sum(lengths)
    rows: list[tuple[int, int, str]] = []
    for (zone, source_start, source_end), destination_length in zip(SOURCE_ZONES, lengths):
        source_length = source_end - source_start + 1
        for target_offset in range(destination_length):
            source_offset = min(
                source_length - 1,
                (target_offset * source_length) // destination_length,
            )
            rows.append((destination_y, source_start + source_offset, zone))
            destination_y += 1
    return rows


def warp_layer(source: Image.Image, profile: Profile) -> Image.Image:
    target = exact.blank()
    source_pixels = source.load()
    target_pixels = target.load()
    for destination_y, source_y, zone in row_map(profile):
        width_percent = WIDTH_PERCENT[profile.build][zone]
        for destination_x in range(exact.FRAME_W):
            source_x = exact.FRAME_W // 2 + round_ratio(
                (destination_x - exact.FRAME_W // 2) * 100,
                width_percent,
            )
            if 0 <= source_x < exact.FRAME_W:
                target_pixels[destination_x, destination_y] = source_pixels[source_x, source_y]
    return target


def warp_layers(layers: exact.Layers, profile: Profile) -> exact.Layers:
    return exact.Layers(**{
        field: warp_layer(getattr(layers, field), profile)
        for field in ("head", "upper", "left_arm", "right_arm", "left_leg", "right_leg")
    })


def mirror_about_root(source: Image.Image) -> Image.Image:
    target = exact.blank()
    source_pixels = source.load()
    target_pixels = target.load()
    for y in range(exact.FRAME_H):
        for x in range(exact.FRAME_W):
            pixel = source_pixels[x, y]
            if pixel[3] == 0:
                continue
            target_x = exact.FRAME_W - 1 - x
            if 0 <= target_x < exact.FRAME_W:
                target_pixels[target_x, y] = pixel
    return target


def make_raincoat_layers(direction: str) -> exact.Layers:
    if direction == "right":
        left = make_raincoat_layers("left")
        return exact.Layers(**{
            field: mirror_about_root(getattr(left, field))
            for field in ("head", "upper", "left_arm", "right_arm", "left_leg", "right_leg")
        })

    layers = {name: exact.blank() for name in (
        "head", "upper", "left_arm", "right_arm", "left_leg", "right_leg",
    )}
    upper = ImageDraw.Draw(layers["upper"])
    if direction in {"front", "back"}:
        upper.polygon([
            (13, 23), (26, 23), (27, 37), (29, 43), (24, 44),
            (20, 42), (16, 44), (11, 43), (13, 37),
        ], fill=RAIN_INK)
        upper.polygon([
            (15, 24), (24, 24), (25, 37), (27, 42), (23, 42),
            (20, 40), (17, 42), (13, 42), (15, 37),
        ], fill=RAIN)
        upper.rectangle((15, 22, 24, 24), fill=RAIN_INK)
        upper.rectangle((16, 22, 23, 23), fill=RAIN_LIGHT)
        if direction == "front":
            upper.line((20, 24, 20, 39), fill=RAIN_LIGHT, width=1)
            upper.line((20, 40, 20, 44), fill=RAIN_INK, width=1)
        else:
            upper.line((15, 26, 24, 26), fill=RAIN_DARK, width=1)

        left_arm = ImageDraw.Draw(layers["left_arm"])
        right_arm = ImageDraw.Draw(layers["right_arm"])
        left_arm.rectangle((10, 24, 14, 38), fill=RAIN_INK)
        left_arm.rectangle((11, 25, 13, 37), fill=RAIN)
        left_arm.line((11, 37, 13, 37), fill=RAIN_LIGHT)
        right_arm.rectangle((25, 24, 29, 38), fill=RAIN_INK)
        right_arm.rectangle((26, 25, 28, 37), fill=RAIN)
        right_arm.line((26, 37, 28, 37), fill=RAIN_LIGHT)
    else:
        upper.polygon([
            (14, 22), (23, 22), (25, 25), (26, 39), (27, 43),
            (22, 44), (19, 42), (14, 44), (12, 41), (13, 25),
        ], fill=RAIN_INK)
        upper.polygon([
            (15, 23), (22, 23), (24, 26), (24, 39), (25, 42),
            (21, 42), (19, 40), (15, 42), (14, 40), (15, 25),
        ], fill=RAIN)
        upper.line((15, 24, 22, 24), fill=RAIN_LIGHT)
        upper.rectangle((20, 25, 24, 38), fill=RAIN_INK)
        upper.rectangle((21, 26, 23, 37), fill=RAIN)
        upper.line((21, 37, 23, 37), fill=RAIN_LIGHT)
    return exact.Layers(**layers)


def make_hair_mask(source: Image.Image, direction: str) -> exact.Layers:
    mask = exact.blank()
    source_pixels = source.load()
    mask_pixels = mask.load()
    for y in range(7, 23):
        for x in range(exact.FRAME_W):
            if source_pixels[x, y] != exact.INK:
                continue
            if direction == "front":
                selected = y <= 13 or (y <= 20 and (x <= 14 or x >= 25))
            elif direction == "back":
                selected = True
            elif direction == "left":
                selected = y <= 13 or (x >= 23 and y <= 22) or (x <= 14 and y <= 16)
            else:
                selected = y <= 13 or (x <= 17 and y <= 22) or (x >= 25 and y <= 16)
            if selected:
                mask_pixels[x, y] = MASK
    return exact.split_layers(mask, direction)


def render_fitted_layer(
    layers: exact.Layers,
    direction: str,
    motion: str,
    frame: int,
) -> Image.Image:
    source = exact.compose(layers)
    if motion == "idle":
        return source
    return exact.deform_motion(source, direction, motion, frame)


def clear_body_foreground_overlap(
    fitted: Image.Image,
    body: Image.Image,
    profile: Profile,
) -> tuple[Image.Image, int, int, int]:
    """Punch head/skin foreground holes into a fitted coat drawn after the body."""
    result = fitted.copy()
    result_pixels = result.load()
    body_pixels = body.load()
    covered_skin_pixels = 0
    covered_head_pixels = 0
    removed_foreground_pixels = 0
    head_rows = {
        destination_y
        for destination_y, _, zone in row_map(profile)
        if zone == "head"
    }
    for y in range(exact.FRAME_H):
        for x in range(exact.FRAME_W):
            if result_pixels[x, y][3] == 0:
                continue
            body_pixel = body_pixels[x, y]
            covers_skin = body_pixel in SKIN_COLORS
            covers_head = body_pixel[3] > 0 and y in head_rows
            if not covers_skin and not covers_head:
                continue
            covered_skin_pixels += int(covers_skin)
            covered_head_pixels += int(covers_head)
            removed_foreground_pixels += 1
            result_pixels[x, y] = (0, 0, 0, 0)
    return result, covered_skin_pixels, covered_head_pixels, removed_foreground_pixels


def count_body_skin_overlap(fitted: Image.Image, body: Image.Image) -> int:
    return sum(
        fitted.getpixel((x, y))[3] > 0 and body.getpixel((x, y)) in SKIN_COLORS
        for y in range(exact.FRAME_H)
        for x in range(exact.FRAME_W)
    )


def count_body_head_overlap(fitted: Image.Image, body: Image.Image, profile: Profile) -> int:
    head_rows = {
        destination_y
        for destination_y, _, zone in row_map(profile)
        if zone == "head"
    }
    return sum(
        fitted.getpixel((x, y))[3] > 0 and body.getpixel((x, y))[3] > 0
        for y in head_rows
        for x in range(exact.FRAME_W)
    )


def head_shift(profile: Profile) -> int:
    return row_map(profile)[0][0] - SOURCE_ZONES[0][1]


def zone_shift(profile: Profile, zone_name: str) -> int:
    source_start = next(start for zone, start, _ in SOURCE_ZONES if zone == zone_name)
    target_start = next(destination for destination, _, zone in row_map(profile) if zone == zone_name)
    return target_start - source_start


def draw_profile_breath(
    image: Image.Image,
    direction: str,
    strength: int,
    profile: Profile,
    offset: tuple[int, int],
) -> None:
    draw = ImageDraw.Draw(image)
    vertical_shift = head_shift(profile)
    if direction == "front":
        points = [(20, 23), (20, 25), (19, 26), (20, 26), (21, 26), (20, 28)]
    elif direction == "back":
        points = [(20, 6), (20, 4), (19, 3), (20, 3), (21, 3), (20, 1)]
    elif direction == "left":
        points = [(11, 18), (9, 18), (8, 17), (8, 18), (8, 19), (6, 18)]
    else:
        points = [(28, 18), (30, 18), (31, 17), (31, 18), (31, 19), (33, 18)]
    count = 2 if strength == 1 else len(points)
    transformed = [
        (x + offset[0], y + vertical_shift + offset[1])
        for x, y in points[:count]
    ]
    min_y = min(y for _, y in transformed)
    correction_y = max(0, 1 - min_y)
    for x, y in transformed:
        shifted_y = y + correction_y
        if 0 <= x < exact.FRAME_W and 0 <= shifted_y < exact.FRAME_H:
            draw.point((x, shifted_y), fill=exact.BREATH)


def render_motion(
    layers: exact.Layers,
    direction: str,
    motion: str,
    frame: int,
    profile: Profile,
) -> Image.Image:
    source = exact.compose(layers)
    if motion == "idle" and frame == 0:
        return source

    if motion == "idle":
        return exact.idle_breath(
            source,
            direction,
            head_y_shift=head_shift(profile),
            torso_y_shift=zone_shift(profile, "torso"),
        )
    return exact.deform_motion(source, direction, motion, frame)


def validate_frame(frame: Image.Image, label: str) -> None:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty frame: {label}")
    if bbox[3] - 1 != exact.ROOT_Y:
        raise AssertionError(f"ground drift: {label} {bbox}")
    if bbox[1] <= 0:
        raise AssertionError(f"top clipping risk: {label} {bbox}")
    for y in range(22, 45):
        if not any(frame.getpixel((x, y))[3] for x in range(exact.FRAME_W)):
            raise AssertionError(f"body seam row is empty: {label} y={y}")
    if any(alpha not in {0, 255} for *_, alpha in frame.getdata()):
        raise AssertionError(f"partial alpha: {label}")


def make_profile_preview(profile_frames: dict[str, Image.Image]) -> Image.Image:
    scale = 5
    cell_w = exact.FRAME_W * scale
    cell_h = exact.FRAME_H * scale
    label_h = 24
    canvas = Image.new("RGB", (cell_w * len(BUILDS), label_h + cell_h * len(STATURES)), (19, 18, 24))
    draw = ImageDraw.Draw(canvas)
    for column, build in enumerate(BUILDS):
        draw.text((column * cell_w + 8, 7), build.upper(), fill=(216, 207, 190))
    for row, stature in enumerate(STATURES):
        for column, build in enumerate(BUILDS):
            frame = profile_frames[f"{stature}-{build}"]
            panel = Image.new("RGBA", frame.size, (43, 38, 48, 255))
            panel.alpha_composite(frame)
            canvas.paste(
                panel.convert("RGB").resize((cell_w, cell_h), Image.Resampling.NEAREST),
                (column * cell_w, label_h + row * cell_h),
            )
        draw.text((6, label_h + row * cell_h + 8), stature.upper(), fill=(196, 180, 151))
    return canvas


def make_raincoat_preview(
    body_frames: dict[str, dict[str, dict[str, list[Image.Image]]]],
    coat_frames: dict[str, dict[str, dict[str, list[Image.Image]]]],
    profiles: list[Profile],
) -> Image.Image:
    scale = 3
    label_w = 118
    label_h = 22
    cell_w = exact.FRAME_W * scale
    cell_h = exact.FRAME_H * scale
    canvas = Image.new(
        "RGB",
        (label_w + cell_w * len(exact.DIRECTIONS), label_h + cell_h * len(profiles)),
        (19, 18, 24),
    )
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(exact.DIRECTIONS):
        draw.text((label_w + column * cell_w + 6, 7), direction.upper(), fill=(216, 207, 190))
    for row, profile in enumerate(profiles):
        y = label_h + row * cell_h
        draw.text((6, y + 8), profile.key.upper(), fill=(196, 180, 151))
        for column, direction in enumerate(exact.DIRECTIONS):
            panel = Image.new("RGBA", (exact.FRAME_W, exact.FRAME_H), (43, 38, 48, 255))
            panel.alpha_composite(body_frames[profile.key]["idle"][direction][0])
            panel.alpha_composite(coat_frames[profile.key]["idle"][direction][0])
            canvas.paste(
                panel.convert("RGB").resize((cell_w, cell_h), Image.Resampling.NEAREST),
                (label_w + column * cell_w, y),
            )
    return canvas


def make_raincoat_motion_preview(
    body_frames: dict[str, dict[str, dict[str, list[Image.Image]]]],
    coat_frames: dict[str, dict[str, dict[str, list[Image.Image]]]],
    profile_key: str,
) -> Image.Image:
    scale = 4
    label_w = 64
    label_h = 22
    cell_w = exact.FRAME_W * scale
    cell_h = exact.FRAME_H * scale
    canvas = Image.new(
        "RGB",
        (label_w + cell_w * len(exact.DIRECTIONS), label_h + cell_h * len(exact.MOTIONS)),
        (19, 18, 24),
    )
    draw = ImageDraw.Draw(canvas)
    for column, direction in enumerate(exact.DIRECTIONS):
        draw.text((label_w + column * cell_w + 6, 7), direction.upper(), fill=(216, 207, 190))
    for row, (motion, frame_count) in enumerate(exact.MOTIONS.items()):
        y = label_h + row * cell_h
        draw.text((6, y + 8), motion.upper(), fill=(196, 180, 151))
        frame_index = min(1, frame_count - 1)
        for column, direction in enumerate(exact.DIRECTIONS):
            panel = Image.new("RGBA", (exact.FRAME_W, exact.FRAME_H), (43, 38, 48, 255))
            panel.alpha_composite(body_frames[profile_key][motion][direction][frame_index])
            panel.alpha_composite(coat_frames[profile_key][motion][direction][frame_index])
            canvas.paste(
                panel.convert("RGB").resize((cell_w, cell_h), Image.Resampling.NEAREST),
                (label_w + column * cell_w, y),
            )
    return canvas


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = {
        direction: Image.open(SOURCE_DIR / f"{direction}.png").convert("RGBA")
        for direction in exact.DIRECTIONS
    }
    source_layers = {
        direction: exact.split_layers(source, direction)
        for direction, source in sources.items()
    }
    source_raincoat_layers = {
        direction: make_raincoat_layers(direction)
        for direction in exact.DIRECTIONS
    }
    source_hair_mask_layers = {
        direction: make_hair_mask(source, direction)
        for direction, source in sources.items()
    }
    profiles = [Profile(stature, build) for stature, build in PROFILES]
    frames: dict[str, dict[str, dict[str, list[Image.Image]]]] = {}
    raincoat_frames: dict[str, dict[str, dict[str, list[Image.Image]]]] = {}
    hair_mask_frames: dict[str, dict[str, dict[str, list[Image.Image]]]] = {}
    preview_frames: dict[str, Image.Image] = {}
    skin_overlap_stats: dict[str, object] = {
        "frames": 0,
        "before_clear_total": 0,
        "after_clear_total": 0,
        "head_before_clear_total": 0,
        "head_after_clear_total": 0,
        "foreground_pixels_removed_total": 0,
        "max_before_clear": 0,
        "max_before_clear_frame": None,
        "by_direction": {
            direction: {"frames": 0, "before_clear_total": 0, "after_clear_total": 0}
            for direction in exact.DIRECTIONS
        },
    }

    for profile in profiles:
        frames[profile.key] = {}
        raincoat_frames[profile.key] = {}
        hair_mask_frames[profile.key] = {}
        for motion, frame_count in exact.MOTIONS.items():
            frames[profile.key][motion] = {}
            raincoat_frames[profile.key][motion] = {}
            hair_mask_frames[profile.key][motion] = {}
            for direction in exact.DIRECTIONS:
                layers = warp_layers(source_layers[direction], profile)
                raincoat_layers = warp_layers(source_raincoat_layers[direction], profile)
                hair_layers = warp_layers(source_hair_mask_layers[direction], profile)
                direction_frames = [
                    render_motion(layers, direction, motion, frame, profile)
                    for frame in range(frame_count)
                ]
                raw_direction_raincoat_frames = [
                    render_fitted_layer(raincoat_layers, direction, motion, frame)
                    for frame in range(frame_count)
                ]
                direction_raincoat_frames = []
                for index, (raincoat_frame, body_frame) in enumerate(zip(
                    raw_direction_raincoat_frames,
                    direction_frames,
                )):
                    (
                        cleared_frame,
                        before_clear,
                        head_before_clear,
                        foreground_removed,
                    ) = clear_body_foreground_overlap(raincoat_frame, body_frame, profile)
                    after_clear = count_body_skin_overlap(cleared_frame, body_frame)
                    head_after_clear = count_body_head_overlap(cleared_frame, body_frame, profile)
                    frame_label = f"{profile.key}/{motion}/{direction}/{index}"
                    if after_clear:
                        raise AssertionError(f"raincoat covers body skin after clear: {frame_label} {after_clear}")
                    if head_after_clear:
                        raise AssertionError(f"raincoat covers body head after clear: {frame_label} {head_after_clear}")
                    direction_raincoat_frames.append(cleared_frame)
                    skin_overlap_stats["frames"] += 1
                    skin_overlap_stats["before_clear_total"] += before_clear
                    skin_overlap_stats["after_clear_total"] += after_clear
                    skin_overlap_stats["head_before_clear_total"] += head_before_clear
                    skin_overlap_stats["head_after_clear_total"] += head_after_clear
                    skin_overlap_stats["foreground_pixels_removed_total"] += foreground_removed
                    direction_stats = skin_overlap_stats["by_direction"][direction]
                    direction_stats["frames"] += 1
                    direction_stats["before_clear_total"] += before_clear
                    direction_stats["after_clear_total"] += after_clear
                    if before_clear > skin_overlap_stats["max_before_clear"]:
                        skin_overlap_stats["max_before_clear"] = before_clear
                        skin_overlap_stats["max_before_clear_frame"] = frame_label
                direction_hair_frames = [
                    render_fitted_layer(hair_layers, direction, motion, frame)
                    for frame in range(frame_count)
                ]
                for index, frame in enumerate(direction_frames):
                    validate_frame(frame, f"{profile.key}/{motion}/{direction}/{index}")
                for family, layer_frames in (
                    ("raincoat", direction_raincoat_frames),
                    ("hair-mask", direction_hair_frames),
                ):
                    for index, layer_frame in enumerate(layer_frames):
                        bbox = layer_frame.getchannel("A").getbbox()
                        if bbox is None:
                            raise AssertionError(f"empty {family}: {profile.key}/{motion}/{direction}/{index}")
                        if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= exact.FRAME_W or bbox[3] >= exact.FRAME_H:
                            raise AssertionError(
                                f"{family} clipping risk: {profile.key}/{motion}/{direction}/{index} {bbox}"
                            )
                        if any(alpha not in {0, 255} for *_, alpha in layer_frame.getdata()):
                            raise AssertionError(f"partial alpha in {family}: {profile.key}/{motion}/{direction}/{index}")
                frames[profile.key][motion][direction] = direction_frames
                raincoat_frames[profile.key][motion][direction] = direction_raincoat_frames
                hair_mask_frames[profile.key][motion][direction] = direction_hair_frames
        preview_frames[profile.key] = frames[profile.key]["idle"]["front"][0]

    standard_key = "average-average"
    for motion, frame_count in exact.MOTIONS.items():
        reference = Image.open(REFERENCE_DIR / f"style1-{motion}-4dir.png").convert("RGBA")
        for row, direction in enumerate(exact.DIRECTIONS):
            for column in range(frame_count):
                expected = reference.crop((
                    column * exact.FRAME_W,
                    row * exact.FRAME_H,
                    (column + 1) * exact.FRAME_W,
                    (row + 1) * exact.FRAME_H,
                ))
                actual = frames[standard_key][motion][direction][column]
                if actual.tobytes() != expected.tobytes():
                    raise AssertionError(f"standard animation changed: {motion}/{direction}/{column}")

    asset_bytes: dict[str, int] = {}
    for family, prefix in (
        (frames, "hero"),
        (raincoat_frames, "raincoat"),
        (hair_mask_frames, "hair-mask"),
    ):
        for motion, frame_count in exact.MOTIONS.items():
            atlas = Image.new(
                "RGBA",
                (exact.FRAME_W * frame_count, exact.FRAME_H * len(exact.DIRECTIONS) * len(profiles)),
                (0, 0, 0, 0),
            )
            for profile_index, profile in enumerate(profiles):
                for direction_index, direction in enumerate(exact.DIRECTIONS):
                    for frame_index, frame in enumerate(family[profile.key][motion][direction]):
                        atlas.alpha_composite(frame, (
                            frame_index * exact.FRAME_W,
                            (profile_index * len(exact.DIRECTIONS) + direction_index) * exact.FRAME_H,
                        ))
            path = ASSET_DIR / f"{prefix}-{motion}.png"
            atlas.save(path, optimize=True)
            asset_bytes[path.name] = path.stat().st_size

    rig_offsets: dict[str, object] = {}
    for direction in exact.DIRECTIONS:
        rig_offsets[direction] = {}
        for motion, frame_count in exact.MOTIONS.items():
            frame_offsets = []
            for frame in range(frame_count):
                layer_offsets = exact.motion_offsets(direction, motion, frame)
                anchor_offsets: dict[str, list[int]] = {}
                for anchor, layer in ANCHOR_LAYERS.items():
                    resolved_layer = layer
                    if direction in {"left", "right"} and anchor in {"leftHand", "rightHand"}:
                        resolved_layer = "upper"
                    anchor_offsets[anchor] = list(layer_offsets[resolved_layer]) if resolved_layer else [0, 0]
                frame_offsets.append(anchor_offsets)
            rig_offsets[direction][motion] = frame_offsets
    rig_path = ASSET_DIR / "rig-motion-offsets.json"
    rig_path.write_text(json.dumps(rig_offsets, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")
    asset_bytes[rig_path.name] = rig_path.stat().st_size

    make_profile_preview(preview_frames).save(OUTPUT_DIR / "style1-profile-grid.png", optimize=True)
    make_raincoat_preview(frames, raincoat_frames, profiles).save(
        OUTPUT_DIR / "style1-raincoat-profile-grid.png",
        optimize=True,
    )
    make_raincoat_motion_preview(frames, raincoat_frames, standard_key).save(
        OUTPUT_DIR / "style1-raincoat-motion-contact.png",
        optimize=True,
    )
    manifest = {
        "source": str(SOURCE_DIR),
        "profiles": [profile.key for profile in profiles],
        "profile_order": "stature-major, then build",
        "directions": list(exact.DIRECTIONS),
        "motions": exact.MOTIONS,
        "frame": {"width": exact.FRAME_W, "height": exact.FRAME_H, "root_y": exact.ROOT_Y},
        "standard_animation_identity": "all average-average frames are byte-for-byte identical to v2-exact",
        "fitted_transform_identity": "body and raincoat use the same profile row/width warp and motion deformation",
        "raincoat_skin_overlap": skin_overlap_stats,
        "families": ["hero", "raincoat", "hair-mask", "rig-motion-offsets"],
        "asset_bytes": asset_bytes,
        "asset_total_bytes": sum(asset_bytes.values()),
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    print(f"wrote {len(profiles)} profile atlases to {ASSET_DIR}")
    print(f"runtime profile atlas total: {sum(asset_bytes.values())} bytes")
    print(
        "raincoat skin overlap: "
        f"{skin_overlap_stats['before_clear_total']} before clear, "
        f"{skin_overlap_stats['after_clear_total']} after clear "
        f"across {skin_overlap_stats['frames']} frames"
    )


if __name__ == "__main__":
    main()
