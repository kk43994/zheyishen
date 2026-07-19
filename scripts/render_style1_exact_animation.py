#!/usr/bin/env python3
"""Build review-only action frames from the approved 40x56 style-1 mother sprites.

The approved silhouettes are the source of truth.  Motion is made by moving
exclusive limb cutouts; no scanline duplication, resampling, projectile art,
or replacement character drawing is used.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw


FRAME_W = 40
FRAME_H = 56
ROOT_Y = 49
SCALE = 5
DIRECTIONS = ("front", "back", "left", "right")
MOTIONS = {"idle": 2, "walk": 4, "attack": 4, "hurt": 2}

SOURCE_DIR = Path("output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-hero-style1-animation-v3-review")

INK = (23, 21, 27, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
SKIN_SHADOW = (146, 119, 100, 255)
# Kept as a public palette constant for the profile generator. It is never
# painted into the review action frames.
BREATH = (191, 207, 199, 255)


@dataclass(frozen=True)
class Layers:
    head: Image.Image
    upper: Image.Image
    left_arm: Image.Image
    right_arm: Image.Image
    left_leg: Image.Image
    right_leg: Image.Image


def blank() -> Image.Image:
    return Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))


def shifted(image: Image.Image, dx: int, dy: int) -> Image.Image:
    result = blank()
    result.alpha_composite(image, (dx, dy))
    return result


def split_layers(source: Image.Image, direction: str) -> Layers:
    """Split the mother sprite into exclusive, joint-overlapping-free pieces."""
    images = {
        name: blank()
        for name in ("head", "upper", "left_arm", "right_arm", "left_leg", "right_leg")
    }
    targets = {name: image.load() for name, image in images.items()}
    pixels = source.load()

    for y in range(FRAME_H):
        for x in range(FRAME_W):
            pixel = pixels[x, y]
            if pixel[3] == 0:
                continue

            layer = "upper"
            if y <= 22:
                layer = "head"
            elif direction in {"front", "back"}:
                if 27 <= y <= 39 and x <= 13:
                    layer = "left_arm"
                elif 27 <= y <= 39 and x >= 26:
                    layer = "right_arm"
                elif y >= 42:
                    layer = "left_leg" if x < 20 else "right_leg"
            elif direction == "left":
                # Only the already-visible near arm/leg is animated. The
                # remaining lower-body pixels stay as the far, static leg.
                if 27 <= y <= 39 and x >= 23:
                    layer = "left_arm"
                elif y >= 42 and x <= 20:
                    layer = "left_leg"
                elif y >= 42:
                    layer = "right_leg"
            else:
                if 27 <= y <= 39 and x <= 16:
                    layer = "right_arm"
                elif y >= 42 and x >= 19:
                    layer = "right_leg"
                elif y >= 42:
                    layer = "left_leg"

            targets[layer][x, y] = pixel

    return Layers(**images)


def compose(
    layers: Layers,
    *,
    head: tuple[int, int] = (0, 0),
    upper: tuple[int, int] = (0, 0),
    left_arm: tuple[int, int] = (0, 0),
    right_arm: tuple[int, int] = (0, 0),
    left_leg: tuple[int, int] = (0, 0),
    right_leg: tuple[int, int] = (0, 0),
) -> Image.Image:
    result = blank()
    # Far leg first, identity-bearing head last. Pieces are exclusive, so a
    # neutral compose reproduces the mother sprite byte-for-byte.
    for image, offset in (
        (layers.right_leg, right_leg),
        (layers.left_leg, left_leg),
        (layers.upper, upper),
        (layers.right_arm, right_arm),
        (layers.left_arm, left_arm),
        (layers.head, head),
    ):
        result.alpha_composite(image, offset)
    return result


def idle_breath(
    source: Image.Image,
    direction: str,
    head_y_shift: int = 0,
    torso_y_shift: int = 0,
) -> Image.Image:
    """A one-pixel blink/collar settle; the silhouette never moves."""
    result = source.copy()
    pixels = result.load()
    if direction == "front":
        candidates = ((16, 16), (17, 16), (22, 16), (23, 16))
    elif direction == "left":
        candidates = ((21, 16), (22, 16))
    elif direction == "right":
        candidates = ((17, 16), (18, 16))
    else:
        collar_y = 23 + torso_y_shift
        collar = [x for x in range(FRAME_W) if pixels[x, collar_y] == WORN]
        if not collar:
            raise AssertionError("back mother sprite has no collar detail")
        pixels[collar[len(collar) // 2], collar_y] = COAL
        return result

    changed = 0
    for x, y in candidates:
        target_y = y + head_y_shift
        if pixels[x, target_y] == COAL:
            pixels[x, target_y] = SKIN_SHADOW
            changed += 1
    if changed == 0:
        raise AssertionError(f"{direction} mother sprite has no blink pixels")
    return result


def motion_offsets(direction: str, motion: str, frame: int) -> dict[str, tuple[int, int]]:
    """Return the exact rigid-piece offsets used by the review renderer."""
    zero = {
        "head": (0, 0),
        "upper": (0, 0),
        "left_arm": (0, 0),
        "right_arm": (0, 0),
        "left_leg": (0, 0),
        "right_leg": (0, 0),
    }
    if motion == "idle":
        return zero

    offsets = dict(zero)
    if motion == "walk":
        if direction in {"front", "back"}:
            offsets["left_leg"] = ((-1, 0), (0, 0), (-1, -1), (0, -1))[frame]
            offsets["right_leg"] = ((1, -1), (0, -1), (1, 0), (0, 0))[frame]
            offsets["left_arm"] = (0, (-1, 0, 1, 0)[frame])
            offsets["right_arm"] = (0, (1, 0, -1, 0)[frame])
        elif direction == "left":
            offsets["left_leg"] = ((-1, 0), (0, -1), (-1, -1), (0, 0))[frame]
            offsets["left_arm"] = ((1, -1), (0, 0), (1, 1), (0, -1))[frame]
        else:
            offsets["right_leg"] = ((1, 0), (0, -1), (1, -1), (0, 0))[frame]
            offsets["right_arm"] = ((-1, -1), (0, 0), (-1, 1), (0, -1))[frame]
        return offsets

    if motion == "attack":
        if direction == "front":
            arm_y = (-1, -3, 2, 0)[frame]
            offsets["left_arm"] = (0, arm_y)
            offsets["right_arm"] = (0, arm_y)
        elif direction == "back":
            arm_y = (1, 3, -2, 0)[frame]
            offsets["left_arm"] = (0, arm_y)
            offsets["right_arm"] = (0, arm_y)
        elif direction == "left":
            offsets["left_arm"] = ((0, -1), (0, -2), (0, 1), (0, 0))[frame]
        else:
            offsets["right_arm"] = ((0, -1), (0, -2), (0, 1), (0, 0))[frame]
        return offsets

    # Hurt is posture-only. No palette replacement is used.
    if direction == "left":
        lean = (2, 1)[frame]
        offsets["head"] = (lean, -1 if frame == 0 else 0)
        offsets["upper"] = (1, 0) if frame == 0 else (0, 0)
        offsets["left_arm"] = (1, -1) if frame == 0 else (0, 0)
    elif direction == "right":
        lean = (-2, -1)[frame]
        offsets["head"] = (lean, -1 if frame == 0 else 0)
        offsets["upper"] = (-1, 0) if frame == 0 else (0, 0)
        offsets["right_arm"] = (-1, -1) if frame == 0 else (0, 0)
    else:
        lean = (-1, 1)[frame]
        if direction == "back":
            lean = -lean
        offsets["head"] = (lean, -1 if frame == 0 else 0)
        offsets["upper"] = (lean, 0)
        offsets["left_arm"] = (-1, -1) if frame == 0 else (0, 0)
        offsets["right_arm"] = (1, -1) if frame == 0 else (0, 0)
    return offsets


def compose_with_offsets(layers: Layers, offsets: dict[str, tuple[int, int]]) -> Image.Image:
    return compose(
        layers,
        head=offsets["head"],
        upper=offsets["upper"],
        left_arm=offsets["left_arm"],
        right_arm=offsets["right_arm"],
        left_leg=offsets["left_leg"],
        right_leg=offsets["right_leg"],
    )


def deform_motion(source: Image.Image, direction: str, motion: str, frame: int) -> Image.Image:
    """Compatibility entry point used by the profile generator."""
    return compose_with_offsets(split_layers(source, direction), motion_offsets(direction, motion, frame))


def render_motion(source: Image.Image, direction: str, motion: str, frame: int) -> Image.Image:
    if motion == "idle":
        return source.copy() if frame == 0 else idle_breath(source, direction)
    return deform_motion(source, direction, motion, frame)


def make_atlas(frames: dict[str, list[Image.Image]], count: int) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME_W * count, FRAME_H * len(DIRECTIONS)), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(frames[direction]):
            atlas.alpha_composite(frame, (column * FRAME_W, row * FRAME_H))
    return atlas


def make_review_contact(all_frames: dict[str, dict[str, list[Image.Image]]]) -> Image.Image:
    label_w = 62
    header_h = 26
    cell_w = FRAME_W * SCALE
    cell_h = FRAME_H * SCALE
    columns_per_direction = max(MOTIONS.values())
    group_w = cell_w * columns_per_direction
    result = Image.new(
        "RGB",
        (label_w + group_w * len(DIRECTIONS), header_h + cell_h * len(MOTIONS)),
        (19, 18, 24),
    )
    draw = ImageDraw.Draw(result)

    for direction_index, direction in enumerate(DIRECTIONS):
        group_x = label_w + direction_index * group_w
        draw.text((group_x + 8, 7), direction.upper(), fill=(211, 202, 185))
        for frame in range(columns_per_direction):
            draw.text((group_x + frame * cell_w + 8, 7), str(frame + 1), fill=(117, 110, 118))
        if direction_index:
            draw.line((group_x, 0, group_x, result.height), fill=(77, 66, 80), width=2)

    for motion_index, (motion, count) in enumerate(MOTIONS.items()):
        y = header_h + motion_index * cell_h
        draw.text((6, y + 9), motion.upper(), fill=(196, 180, 151))
        if motion_index:
            draw.line((0, y, result.width, y), fill=(67, 57, 70), width=1)
        for direction_index, direction in enumerate(DIRECTIONS):
            group_x = label_w + direction_index * group_w
            for frame_index in range(count):
                panel = Image.new("RGBA", (FRAME_W, FRAME_H), (43, 38, 48, 255))
                panel.alpha_composite(all_frames[motion][direction][frame_index])
                panel = panel.resize((cell_w, cell_h), Image.Resampling.NEAREST).convert("RGB")
                result.paste(panel, (group_x + frame_index * cell_w, y))
    return result


def alpha_count(image: Image.Image) -> int:
    return sum(pixel[3] > 0 for pixel in image.getdata())


def validate_motion(
    source: Image.Image,
    direction: str,
    motion: str,
    frames: list[Image.Image],
) -> list[dict[str, object]]:
    source_colors = {pixel for pixel in source.getdata() if pixel[3]}
    source_count = alpha_count(source)
    records = []
    counts = []
    for index, frame in enumerate(frames):
        bbox = frame.getchannel("A").getbbox()
        if bbox is None:
            raise AssertionError(f"empty frame: {direction}/{motion}/{index}")
        if bbox[3] - 1 != ROOT_Y:
            raise AssertionError(f"ground drift: {direction}/{motion}/{index} {bbox}")
        if bbox[1] <= 0:
            raise AssertionError(f"top clipping: {direction}/{motion}/{index} {bbox}")
        if any(alpha not in {0, 255} for *_, alpha in frame.getdata()):
            raise AssertionError(f"partial alpha: {direction}/{motion}/{index}")
        frame_colors = {pixel for pixel in frame.getdata() if pixel[3]}
        if not frame_colors <= source_colors:
            raise AssertionError(f"new palette color: {direction}/{motion}/{index}")
        count = alpha_count(frame)
        counts.append(count)
        records.append({"bbox": list(bbox), "opaque_pixels": count, "delta": count - source_count})

    if len({frame.tobytes() for frame in frames}) != len(frames):
        raise AssertionError(f"duplicate action frame: {direction}/{motion}")
    # Exclusive pieces can overlap by a few pixels during a passing pose, but
    # may not produce the large area pumping caused by the old duplicated rows.
    allowed_span = 14 if direction in {"front", "back"} else 7
    if max(counts) - min(counts) > allowed_span:
        raise AssertionError(f"silhouette area pumps: {direction}/{motion} {counts}")
    if direction in {"left", "right"}:
        source_bbox = source.getchannel("A").getbbox()
        for index, record in enumerate(records):
            bbox = record["bbox"]
            if abs((bbox[2] - bbox[0]) - (source_bbox[2] - source_bbox[0])) > 2:
                raise AssertionError(f"side proportion changed: {direction}/{motion}/{index} {bbox}")
    return records


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = {
        direction: Image.open(SOURCE_DIR / f"{direction}.png").convert("RGBA")
        for direction in DIRECTIONS
    }
    for direction, source in sources.items():
        if source.size != (FRAME_W, FRAME_H):
            raise AssertionError(f"invalid mother sprite: {direction} {source.size}")
        if compose(split_layers(source, direction)).tobytes() != source.tobytes():
            raise AssertionError(f"neutral rig changed mother sprite: {direction}")

    all_frames: dict[str, dict[str, list[Image.Image]]] = {}
    validation: dict[str, object] = {}
    for motion, count in MOTIONS.items():
        motion_frames = {
            direction: [
                render_motion(sources[direction], direction, motion, frame)
                for frame in range(count)
            ]
            for direction in DIRECTIONS
        }
        if motion == "idle":
            for direction in DIRECTIONS:
                if motion_frames[direction][0].tobytes() != sources[direction].tobytes():
                    raise AssertionError(f"idle mother frame changed: {direction}")
        validation[motion] = {
            direction: validate_motion(sources[direction], direction, motion, motion_frames[direction])
            for direction in DIRECTIONS
        }
        all_frames[motion] = motion_frames
        make_atlas(motion_frames, count).save(OUTPUT_DIR / f"style1-{motion}-4dir.png", optimize=True)

    contact_path = OUTPUT_DIR / "style1-v3-action-frame-contact.png"
    make_review_contact(all_frames).save(contact_path, optimize=True)
    manifest = {
        "review_only": True,
        "source": str(SOURCE_DIR),
        "mother_identity": "idle frame 1 in the contact sheet is byte-for-byte source identity",
        "frame": {"width": FRAME_W, "height": FRAME_H, "root_y": ROOT_Y},
        "directions": list(DIRECTIONS),
        "motions": MOTIONS,
        "constraints": {
            "side_motion": "approved silhouette; near arm and near leg move only 1-2 px",
            "projectile_pixels": False,
            "hurt_recolor": False,
            "scanline_duplication": False,
        },
        "validation": validation,
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    print(f"wrote review action frames to {OUTPUT_DIR}")
    print(f"contact: {contact_path}")


if __name__ == "__main__":
    main()
