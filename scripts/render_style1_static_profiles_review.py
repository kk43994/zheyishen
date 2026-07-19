#!/usr/bin/env python3
"""Build isolated static approval assets for all 12 style-1 body profiles.

This script reads only the approved 40x56 four-direction mothers. It emits
review PNGs and transparent atlases; it does not write runtime assets.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


FRAME_W = 40
FRAME_H = 56
ROOT_X = 20
ROOT_Y = 49
SCALE = 10

DIRECTIONS = ("front", "back", "left", "right")
STATURES = ("short", "average", "tall")
BUILDS = ("slim", "average", "sturdy", "soft")
SOURCE_DIR = Path("output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1")
SIDE_WALK_REFERENCE = Path(
    "output/imagegen/zhe-yi-shen-hero-style1-animation-v4-redesign-review/"
    "style1-v4-redesign-side-walk-2dir.png"
)
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-hero-style1-static-profiles-review-v1")

TRANSPARENT = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
SKIN_SHADOW = (146, 119, 100, 255)
SKIN = (199, 181, 158, 255)
SKIN_LIGHT = (218, 208, 186, 255)

RAIN_DARK = (142, 116, 40, 255)
RAIN = (167, 138, 45, 255)
RAIN_LIGHT = (208, 177, 79, 255)
GLASS = (105, 130, 132, 255)
GLASS_LIGHT = (185, 205, 201, 255)
PAPER = (218, 208, 186, 255)
PAPER_SHADOW = (159, 119, 114, 255)
PACK = (93, 88, 84, 255)
PACK_LIGHT = (145, 135, 125, 255)

SKIN_COLORS = {SKIN_SHADOW, SKIN, SKIN_LIGHT}

ZONES = (
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


@dataclass(frozen=True)
class Profile:
    stature: str
    build: str

    @property
    def key(self) -> str:
        return f"{self.stature}-{self.build}"


@dataclass(frozen=True)
class Anchor:
    x: int
    y: int
    zone: str
    dx: int = 0
    dy: int = 0


PROFILES = tuple(Profile(stature, build) for stature in STATURES for build in BUILDS)
PROOF_PROFILES = (
    Profile("short", "slim"),
    Profile("average", "average"),
    Profile("tall", "soft"),
)

PROP_ANCHORS = {
    "glasses": {
        "front": Anchor(20, 17, "head"),
        "back": None,
        "left": Anchor(15, 17, "head", -1, -1),
        "right": Anchor(25, 17, "head", 1, -1),
    },
    "envelope": {
        "front": Anchor(28, 36, "torso", 3, 1),
        "back": Anchor(28, 36, "torso", 3, 1),
        "left": Anchor(23, 36, "torso", 3, 1),
        "right": Anchor(17, 36, "torso", -3, 1),
    },
    "backpack": {
        "front": Anchor(20, 29, "torso", 0, 1),
        "back": Anchor(20, 29, "torso", 0, 1),
        "left": Anchor(24, 29, "torso", 2, 1),
        "right": Anchor(16, 29, "torso", -2, 1),
    },
}


def blank() -> Image.Image:
    return Image.new("RGBA", (FRAME_W, FRAME_H), TRANSPARENT)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def round_ratio(numerator: int, denominator: int) -> int:
    sign = -1 if numerator < 0 else 1
    return sign * ((abs(numerator) + denominator // 2) // denominator)


def zone_definition(zone: str) -> tuple[int, int]:
    for name, start, end in ZONES:
        if name == zone:
            return start, end
    raise KeyError(zone)


def target_length(zone: str, start: int, end: int, stature: str) -> int:
    length = end - start + 1
    if zone in {"torso", "legs"}:
        return length + STATURE_DELTAS[stature][zone]
    return length


def morph_rows(profile: Profile) -> tuple[list[tuple[int, int, str]], dict[str, tuple[int, int]]]:
    lengths = [target_length(zone, start, end, profile.stature) for zone, start, end in ZONES]
    destination_y = ROOT_Y + 1 - sum(lengths)
    rows: list[tuple[int, int, str]] = []
    bands: dict[str, tuple[int, int]] = {}
    for (zone, source_start, source_end), destination_length in zip(ZONES, lengths):
        target_start = destination_y
        source_length = source_end - source_start + 1
        for target_offset in range(destination_length):
            source_offset = min(source_length - 1, (target_offset * source_length) // destination_length)
            rows.append((destination_y, source_start + source_offset, zone))
            destination_y += 1
        bands[zone] = (target_start, destination_y - 1)
    return rows, bands


def warp(source: Image.Image, profile: Profile) -> Image.Image:
    result = blank()
    source_pixels = source.load()
    target_pixels = result.load()
    rows, _ = morph_rows(profile)
    for destination_y, source_y, zone in rows:
        width_percent = WIDTH_PERCENT[profile.build][zone]
        for destination_x in range(FRAME_W):
            source_x = ROOT_X + round_ratio((destination_x - ROOT_X) * 100, width_percent)
            if 0 <= source_x < FRAME_W:
                target_pixels[destination_x, destination_y] = source_pixels[source_x, source_y]
    return result


def map_anchor(anchor: Anchor, profile: Profile) -> tuple[int, int]:
    source_start, source_end = zone_definition(anchor.zone)
    _, bands = morph_rows(profile)
    target_start, target_end = bands[anchor.zone]
    source_length = source_end - source_start + 1
    target_length_value = target_end - target_start + 1
    source_offset = anchor.y - source_start
    destination_offset = round_ratio(
        source_offset * max(0, target_length_value - 1),
        max(1, source_length - 1),
    )
    x = ROOT_X + round_ratio(
        (anchor.x - ROOT_X) * WIDTH_PERCENT[profile.build][anchor.zone],
        100,
    )
    return x + anchor.dx, target_start + min(target_length_value - 1, destination_offset) + anchor.dy


def canonical_raincoat(direction: str) -> Image.Image:
    if direction == "right":
        return ImageOps.mirror(canonical_raincoat("left"))

    result = blank()
    draw = ImageDraw.Draw(result)
    if direction in {"front", "back"}:
        draw.rectangle((10, 24, 14, 38), fill=INK)
        draw.rectangle((11, 25, 13, 37), fill=RAIN)
        draw.line((11, 37, 13, 37), fill=RAIN_LIGHT)
        draw.rectangle((25, 24, 29, 38), fill=INK)
        draw.rectangle((26, 25, 28, 37), fill=RAIN)
        draw.line((26, 37, 28, 37), fill=RAIN_LIGHT)
        draw.polygon(
            ((13, 23), (26, 23), (27, 37), (29, 43), (24, 44),
             (20, 42), (16, 44), (11, 43), (13, 37)),
            fill=INK,
        )
        draw.polygon(
            ((15, 24), (24, 24), (25, 37), (27, 42), (23, 42),
             (20, 40), (17, 42), (13, 42), (15, 37)),
            fill=RAIN,
        )
        draw.rectangle((15, 22, 24, 24), fill=INK)
        draw.rectangle((16, 22, 23, 23), fill=RAIN_LIGHT)
        if direction == "front":
            draw.line((20, 24, 20, 39), fill=RAIN_LIGHT)
            draw.line((20, 40, 20, 44), fill=INK)
        else:
            draw.line((15, 26, 24, 26), fill=RAIN_DARK)
    else:
        draw.polygon(
            ((14, 22), (23, 22), (25, 25), (26, 39), (27, 43),
             (22, 44), (19, 42), (14, 44), (12, 41), (13, 25)),
            fill=INK,
        )
        draw.polygon(
            ((15, 23), (22, 23), (24, 26), (24, 39), (25, 42),
             (21, 42), (19, 40), (15, 42), (14, 40), (15, 25)),
            fill=RAIN,
        )
        draw.line((15, 24, 22, 24), fill=RAIN_LIGHT)
        draw.rectangle((20, 25, 24, 38), fill=INK)
        draw.rectangle((21, 26, 23, 37), fill=RAIN)
        draw.line((21, 37, 23, 37), fill=RAIN_LIGHT)
    return result


def clear_coat_foreground(coat: Image.Image, body: Image.Image, profile: Profile) -> Image.Image:
    result = coat.copy()
    pixels = result.load()
    body_pixels = body.load()
    _, bands = morph_rows(profile)
    head_start, head_end = bands["head"]
    for y in range(FRAME_H):
        for x in range(FRAME_W):
            if pixels[x, y][3] == 0:
                continue
            if head_start <= y <= head_end or body_pixels[x, y] in SKIN_COLORS:
                pixels[x, y] = TRANSPARENT
    return result


def frame_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    draw.rectangle((x0, y0, x1, y0), fill=color)
    draw.rectangle((x0, y1, x1, y1), fill=color)
    draw.rectangle((x0, y0, x0, y1), fill=color)
    draw.rectangle((x1, y0, x1, y1), fill=color)


def draw_prop(prop: str, direction: str, anchor: tuple[int, int]) -> Image.Image:
    result = blank()
    draw = ImageDraw.Draw(result)
    x, y = anchor
    if prop == "glasses":
        if direction == "back":
            return result
        if direction == "front":
            frame_rect(draw, (x - 5, y - 1, x - 2, y + 1), GLASS)
            frame_rect(draw, (x + 2, y - 1, x + 5, y + 1), GLASS)
            draw.line((x - 1, y, x + 2, y), fill=GLASS)
            draw.point((x + 3, y - 1), fill=GLASS_LIGHT)
        else:
            if direction == "left":
                frame_rect(draw, (x - 1, y - 1, x + 2, y + 1), GLASS)
                draw.line((x + 2, y, x + 4, y), fill=GLASS)
                draw.point((x, y - 1), fill=GLASS_LIGHT)
            else:
                frame_rect(draw, (x - 2, y - 1, x + 1, y + 1), GLASS)
                draw.line((x - 2, y, x - 4, y), fill=GLASS)
                draw.point((x - 1, y - 1), fill=GLASS_LIGHT)
    elif prop == "envelope":
        if direction in {"left", "right"}:
            left = x - 1 if direction == "left" else x
            draw.rectangle((left, y - 2, left + 1, y + 3), fill=INK)
            fill_x = left if direction == "left" else left + 1
            draw.rectangle((fill_x, y - 1, fill_x, y + 2), fill=PAPER)
        else:
            draw.rectangle((x - 3, y - 2, x + 3, y + 2), fill=INK)
            draw.rectangle((x - 2, y - 1, x + 2, y + 1), fill=PAPER)
            if direction == "front":
                draw.line((x - 2, y - 1, x, y), fill=PAPER_SHADOW)
                draw.line((x + 2, y - 1, x, y), fill=PAPER_SHADOW)
    elif prop == "backpack":
        if direction in {"left", "right"}:
            left = x - 2
            draw.rectangle((left, y - 6, left + 4, y + 6), fill=INK)
            draw.rectangle((left + 1, y - 5, left + 3, y + 5), fill=PACK)
            edge = left + 1 if direction == "left" else left + 3
            draw.line((edge, y - 4, edge, y + 4), fill=PACK_LIGHT)
        else:
            draw.rectangle((x - 5, y - 6, x + 5, y + 6), fill=INK)
            draw.rectangle((x - 4, y - 5, x + 4, y + 5), fill=PACK)
            draw.rectangle((x - 2, y - 7, x + 2, y - 5), fill=PACK_LIGHT)
            if direction == "back":
                draw.line((x - 3, y, x + 3, y), fill=PACK_LIGHT)
    else:
        raise KeyError(prop)
    return result


def prop_layer(prop: str, direction: str, profile: Profile) -> tuple[Image.Image, tuple[int, int] | None]:
    anchor = PROP_ANCHORS[prop][direction]
    if anchor is None:
        return blank(), None
    mapped = map_anchor(anchor, profile)
    return draw_prop(prop, direction, mapped), mapped


def rigid_overlay(direction: str, profile: Profile) -> tuple[Image.Image, dict[str, tuple[int, int] | None]]:
    result = blank()
    anchors: dict[str, tuple[int, int] | None] = {}
    for prop in ("backpack", "envelope", "glasses"):
        layer, anchor = prop_layer(prop, direction, profile)
        anchors[prop] = anchor
        result.alpha_composite(layer)
    return result, anchors


def compose_rigid_proof(body: Image.Image, direction: str, profile: Profile) -> Image.Image:
    backpack, _ = prop_layer("backpack", direction, profile)
    envelope, _ = prop_layer("envelope", direction, profile)
    glasses, _ = prop_layer("glasses", direction, profile)
    result = blank()
    if direction != "back":
        result.alpha_composite(backpack)
    result.alpha_composite(body)
    if direction == "back":
        result.alpha_composite(backpack)
    result.alpha_composite(envelope)
    result.alpha_composite(glasses)
    return result


def alpha_count(image: Image.Image) -> int:
    return sum(pixel[3] > 0 for pixel in image.getdata())


def alpha_bbox_in_band(image: Image.Image, start: int, end: int) -> tuple[int, int, int, int] | None:
    crop = image.crop((0, start, FRAME_W, end + 1))
    bbox = crop.getchannel("A").getbbox()
    if bbox is None:
        return None
    return bbox[0], bbox[1] + start, bbox[2], bbox[3] + start


def alpha_mask_mismatch(left: Image.Image, right: Image.Image) -> int:
    mirrored = ImageOps.mirror(right)
    return sum(
        (left.getpixel((x, y))[3] > 0) != (mirrored.getpixel((x, y))[3] > 0)
        for y in range(FRAME_H)
        for x in range(FRAME_W)
    )


def validate_body(source: Image.Image, body: Image.Image, profile: Profile, direction: str) -> dict[str, object]:
    bbox = body.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty body: {profile.key}/{direction}")
    if bbox[3] - 1 != ROOT_Y:
        raise AssertionError(f"root drift: {profile.key}/{direction} {bbox}")
    if bbox[1] <= 0:
        raise AssertionError(f"top clip: {profile.key}/{direction} {bbox}")
    if any(alpha not in {0, 255} for *_, alpha in body.getdata()):
        raise AssertionError(f"partial alpha: {profile.key}/{direction}")

    rows, bands = morph_rows(profile)
    head_start, head_end = bands["head"]
    source_head = source.crop((0, 7, FRAME_W, 23))
    target_head = body.crop((0, head_start, FRAME_W, head_end + 1))
    if source_head.tobytes() != target_head.tobytes():
        raise AssertionError(f"face/head pixels changed: {profile.key}/{direction}")
    if profile.key == "average-average" and body.tobytes() != source.tobytes():
        raise AssertionError(f"standard profile is not mother identity: {direction}")

    for y in range(head_start, ROOT_Y + 1):
        if not any(body.getpixel((x, y))[3] for x in range(FRAME_W)):
            raise AssertionError(f"empty body seam row: {profile.key}/{direction} y={y}")
    torso_bbox = alpha_bbox_in_band(body, *bands["torso"])
    if torso_bbox is None:
        raise AssertionError(f"missing torso: {profile.key}/{direction}")
    return {
        "bbox": list(bbox),
        "root_y": ROOT_Y,
        "opaque_pixels": alpha_count(body),
        "head_identity": True,
        "head_target_band": list(bands["head"]),
        "torso_target_band": list(bands["torso"]),
        "legs_target_band": list(bands["legs"]),
        "feet_target_band": list(bands["feet"]),
        "torso_alpha_bbox": list(torso_bbox),
        "row_samples": len(rows),
    }


def validate_coat(coat: Image.Image, body: Image.Image, profile: Profile, direction: str) -> dict[str, object]:
    bbox = coat.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty coat: {profile.key}/{direction}")
    if any(alpha not in {0, 255} for *_, alpha in coat.getdata()):
        raise AssertionError(f"partial coat alpha: {profile.key}/{direction}")
    _, bands = morph_rows(profile)
    head_start, head_end = bands["head"]
    head_overlap = sum(
        coat.getpixel((x, y))[3] > 0
        for y in range(head_start, head_end + 1)
        for x in range(FRAME_W)
    )
    skin_overlap = sum(
        coat.getpixel((x, y))[3] > 0 and body.getpixel((x, y)) in SKIN_COLORS
        for y in range(FRAME_H)
        for x in range(FRAME_W)
    )
    if head_overlap or skin_overlap:
        raise AssertionError(
            f"coat covers face/skin: {profile.key}/{direction} head={head_overlap} skin={skin_overlap}"
        )
    return {
        "bbox": list(bbox),
        "opaque_pixels": alpha_count(coat),
        "head_overlap": 0,
        "skin_overlap": 0,
    }


def validate_prop_layer(
    layer: Image.Image,
    anchor: tuple[int, int] | None,
    prop: str,
    profile: Profile,
    direction: str,
) -> dict[str, object]:
    bbox = layer.getchannel("A").getbbox()
    if anchor is None:
        if bbox is not None:
            raise AssertionError(f"hidden prop rendered: {prop}/{profile.key}/{direction}")
        return {"visible": False, "anchor": None, "bbox": None, "opaque_pixels": 0}
    if bbox is None:
        raise AssertionError(f"visible prop missing: {prop}/{profile.key}/{direction}")
    if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= FRAME_W or bbox[3] >= FRAME_H:
        raise AssertionError(f"prop clipping risk: {prop}/{profile.key}/{direction} {bbox}")
    return {
        "visible": True,
        "anchor": list(anchor),
        "bbox": list(bbox),
        "size": [bbox[2] - bbox[0], bbox[3] - bbox[1]],
        "opaque_pixels": alpha_count(layer),
    }


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = (
        Path("/System/Library/Fonts/Monaco.ttf"),
        Path("/System/Library/Fonts/SFNSMono.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
    )
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def make_approval(
    frames: dict[str, dict[str, Image.Image]],
    profiles: tuple[Profile, ...],
) -> Image.Image:
    label_w = 180
    header_h = 38
    cell_w = FRAME_W * SCALE
    cell_h = FRAME_H * SCALE
    result = Image.new(
        "RGB",
        (label_w + cell_w * len(DIRECTIONS), header_h + cell_h * len(profiles)),
        (19, 18, 24),
    )
    draw = ImageDraw.Draw(result)
    header_font = load_font(15)
    label_font = load_font(14)
    for column, direction in enumerate(DIRECTIONS):
        draw.text((label_w + column * cell_w + 12, 10), direction.upper(), fill=(211, 202, 185), font=header_font)
    for row, profile in enumerate(profiles):
        y = header_h + row * cell_h
        draw.text((8, y + 14), profile.key.upper(), fill=(196, 180, 151), font=label_font)
        if row:
            draw.line((0, y, result.width, y), fill=(67, 57, 70), width=1)
        for column, direction in enumerate(DIRECTIONS):
            panel = Image.new("RGBA", (FRAME_W, FRAME_H), (43, 38, 48, 255))
            panel.alpha_composite(frames[profile.key][direction])
            scaled = panel.resize((cell_w, cell_h), Image.Resampling.NEAREST).convert("RGB")
            x = label_w + column * cell_w
            result.paste(scaled, (x, y))
            baseline = y + (ROOT_Y + 1) * SCALE
            draw.line((x, baseline, x + cell_w - 1, baseline), fill=(66, 58, 69), width=1)
    return result


def make_atlas(frames: dict[str, dict[str, Image.Image]]) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME_W * len(DIRECTIONS), FRAME_H * len(PROFILES)), TRANSPARENT)
    for row, profile in enumerate(PROFILES):
        for column, direction in enumerate(DIRECTIONS):
            atlas.alpha_composite(frames[profile.key][direction], (column * FRAME_W, row * FRAME_H))
    return atlas


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = {
        direction: Image.open(SOURCE_DIR / f"{direction}.png").convert("RGBA")
        for direction in DIRECTIONS
    }
    source_hashes = {direction: file_sha256(SOURCE_DIR / f"{direction}.png") for direction in DIRECTIONS}

    bodies: dict[str, dict[str, Image.Image]] = {}
    coat_overlays: dict[str, dict[str, Image.Image]] = {}
    coat_composites: dict[str, dict[str, Image.Image]] = {}
    rigid_overlays: dict[str, dict[str, Image.Image]] = {}
    rigid_composites: dict[str, dict[str, Image.Image]] = {}
    body_validation: dict[str, object] = {}
    coat_validation: dict[str, object] = {}
    prop_validation: dict[str, object] = {}

    canonical_coats = {direction: canonical_raincoat(direction) for direction in DIRECTIONS}
    for profile in PROFILES:
        bodies[profile.key] = {}
        coat_overlays[profile.key] = {}
        coat_composites[profile.key] = {}
        rigid_overlays[profile.key] = {}
        rigid_composites[profile.key] = {}
        body_validation[profile.key] = {}
        coat_validation[profile.key] = {}
        prop_validation[profile.key] = {}
        for direction in DIRECTIONS:
            body = warp(sources[direction], profile)
            body_record = validate_body(sources[direction], body, profile, direction)
            bodies[profile.key][direction] = body
            body_validation[profile.key][direction] = body_record

            coat = clear_coat_foreground(warp(canonical_coats[direction], profile), body, profile)
            coat_validation[profile.key][direction] = validate_coat(coat, body, profile, direction)
            coat_overlays[profile.key][direction] = coat
            coat_composite = body.copy()
            coat_composite.alpha_composite(coat)
            coat_composites[profile.key][direction] = coat_composite

            overlay, anchors = rigid_overlay(direction, profile)
            rigid_overlays[profile.key][direction] = overlay
            rigid_composites[profile.key][direction] = compose_rigid_proof(body, direction, profile)
            prop_validation[profile.key][direction] = {
                prop: validate_prop_layer(
                    prop_layer(prop, direction, profile)[0],
                    anchors[prop],
                    prop,
                    profile,
                    direction,
                )
                for prop in ("glasses", "envelope", "backpack")
            }

    # Body width must be ordered by build inside the torso band. Overall width
    # can remain head-limited in side views, so torso width is the useful test.
    for stature in STATURES:
        for direction in DIRECTIONS:
            widths = []
            for build in BUILDS:
                record = body_validation[f"{stature}-{build}"][direction]
                torso_bbox = record["torso_alpha_bbox"]
                widths.append(torso_bbox[2] - torso_bbox[0])
            if any(right < left for left, right in zip(widths, widths[1:])):
                raise AssertionError(f"non-monotonic torso widths: {stature}/{direction} {widths}")

    for build in BUILDS:
        for direction in DIRECTIONS:
            heights = []
            for stature in STATURES:
                bbox = body_validation[f"{stature}-{build}"][direction]["bbox"]
                heights.append(bbox[3] - bbox[1])
            if not all(right > left for left, right in zip(heights, heights[1:])):
                raise AssertionError(f"non-increasing stature heights: {build}/{direction} {heights}")

    # Each rigid prop/direction keeps its exact bitmap dimensions and pixel
    # count across all 12 profiles. Only its mapped anchor is allowed to move.
    rigid_invariants: dict[str, object] = {}
    for prop in ("glasses", "envelope", "backpack"):
        rigid_invariants[prop] = {}
        for direction in DIRECTIONS:
            visible_records = [
                prop_validation[profile.key][direction][prop]
                for profile in PROFILES
                if prop_validation[profile.key][direction][prop]["visible"]
            ]
            sizes = {tuple(record["size"]) for record in visible_records}
            counts = {record["opaque_pixels"] for record in visible_records}
            if len(sizes) > 1 or len(counts) > 1:
                raise AssertionError(f"rigid prop scaled: {prop}/{direction} sizes={sizes} counts={counts}")
            rigid_invariants[prop][direction] = {
                "visible_profiles": len(visible_records),
                "fixed_sizes": [list(size) for size in sorted(sizes)],
                "fixed_opaque_counts": sorted(counts),
            }
        left_rule = rigid_invariants[prop]["left"]
        right_rule = rigid_invariants[prop]["right"]
        if (
            left_rule["fixed_sizes"] != right_rule["fixed_sizes"]
            or left_rule["fixed_opaque_counts"] != right_rule["fixed_opaque_counts"]
        ):
            raise AssertionError(f"rigid side projection is not mirrored: {prop} {left_rule} {right_rule}")

    mirror_validation: dict[str, object] = {}
    for profile in PROFILES:
        left_body = bodies[profile.key]["left"]
        right_body = bodies[profile.key]["right"]
        left_coat = coat_overlays[profile.key]["left"]
        right_coat = coat_overlays[profile.key]["right"]
        body_mismatch = alpha_mask_mismatch(left_body, right_body)
        coat_mismatch = alpha_mask_mismatch(left_coat, right_coat)
        body_ratio = body_mismatch / max(1, max(alpha_count(left_body), alpha_count(right_body)))
        coat_ratio = coat_mismatch / max(1, max(alpha_count(left_coat), alpha_count(right_coat)))
        if body_ratio > 0.07:
            raise AssertionError(f"body side mirror drift: {profile.key} ratio={body_ratio:.4f}")
        if coat_ratio > 0.01:
            raise AssertionError(f"coat side mirror drift: {profile.key} ratio={coat_ratio:.4f}")
        mirror_validation[profile.key] = {
            "body_alpha_mismatch": body_mismatch,
            "body_mismatch_ratio": round(body_ratio, 6),
            "body_within_7pct": True,
            "coat_alpha_mismatch": coat_mismatch,
            "coat_mismatch_ratio": round(coat_ratio, 6),
            "coat_within_1pct": True,
        }
    # The canonical right coat is an exact mirror. Width remapping is centered
    # on the integer root x=20 in an even 40px frame, so nearest-neighbor
    # rounding may differ by at most three edge pixels after non-100% scaling.
    if any(record["coat_alpha_mismatch"] > 3 for record in mirror_validation.values()):
        raise AssertionError(f"raincoat side mirror drift: {mirror_validation}")

    proof_rigid = {profile.key: rigid_composites[profile.key] for profile in PROOF_PROFILES}
    approval_paths = {
        "body": OUTPUT_DIR / "style1-profile-body-approval-10x.png",
        "raincoat": OUTPUT_DIR / "style1-profile-raincoat-approval-10x.png",
        "rigid": OUTPUT_DIR / "style1-profile-rigid-anchor-proof-10x.png",
    }
    make_approval(bodies, PROFILES).save(approval_paths["body"], optimize=True)
    make_approval(coat_composites, PROFILES).save(approval_paths["raincoat"], optimize=True)
    make_approval(proof_rigid, PROOF_PROFILES).save(approval_paths["rigid"], optimize=True)

    atlas_paths = {
        "body": OUTPUT_DIR / "style1-profile-body-atlas.png",
        "raincoat_overlay": OUTPUT_DIR / "style1-profile-raincoat-overlay-atlas.png",
        "raincoat_composite": OUTPUT_DIR / "style1-profile-raincoat-composite-atlas.png",
        "rigid_overlay": OUTPUT_DIR / "style1-profile-rigid-props-overlay-atlas.png",
    }
    make_atlas(bodies).save(atlas_paths["body"], optimize=True)
    make_atlas(coat_overlays).save(atlas_paths["raincoat_overlay"], optimize=True)
    make_atlas(coat_composites).save(atlas_paths["raincoat_composite"], optimize=True)
    make_atlas(rigid_overlays).save(atlas_paths["rigid_overlay"], optimize=True)

    artifacts = {**approval_paths, **atlas_paths}
    manifest = {
        "review_only": True,
        "runtime_integration": False,
        "gif_output": False,
        "source": str(SOURCE_DIR),
        "source_sha256": source_hashes,
        "side_walk_reference": {
            "path": str(SIDE_WALK_REFERENCE),
            "exists": SIDE_WALK_REFERENCE.exists(),
            "sha256": file_sha256(SIDE_WALK_REFERENCE) if SIDE_WALK_REFERENCE.exists() else None,
        },
        "frame": {"width": FRAME_W, "height": FRAME_H, "root": [ROOT_X, ROOT_Y]},
        "profile_order": [profile.key for profile in PROFILES],
        "direction_order": list(DIRECTIONS),
        "atlas_layout": {"columns": "directions", "rows": "profiles"},
        "morph_rules": {
            "stature_deltas": STATURE_DELTAS,
            "width_percent": WIDTH_PERCENT,
            "head_scale_percent": 100,
            "fitted_layers_use_same_map": True,
            "rigid_props_use_anchor_only": True,
        },
        "validation": {
            "profile_count": len(PROFILES),
            "body": body_validation,
            "raincoat": coat_validation,
            "rigid_props": prop_validation,
            "rigid_invariants": rigid_invariants,
            "side_mirror": mirror_validation,
        },
        "artifacts": {
            name: {"path": path.name, "bytes": path.stat().st_size, "sha256": file_sha256(path)}
            for name, path in artifacts.items()
        },
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8"
    )
    print(f"wrote 12-profile static approval set to {OUTPUT_DIR}")
    print(f"profiles: {len(PROFILES)}, directions: {len(DIRECTIONS)}")
    print(f"artifact bytes: {sum(path.stat().st_size for path in artifacts.values())}")


if __name__ == "__main__":
    main()
