#!/usr/bin/env python3
"""Independent side-walk segmentation study for the selected style-1 hero.

This is review-only: it reads the approved 40x56 left/right mothers and writes
one enlarged comparison PNG.  It never updates runtime atlases or GIF files.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


W, H, ROOT_Y, SCALE = 40, 56, 49, 10
SOURCE_DIR = Path("output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-hero-style1-v4-segmentation-review")
OUTPUT_PATH = OUTPUT_DIR / "style1-side-walk-v4-segmentation-contact.png"

CLEAR = (0, 0, 0, 0)
INK = (23, 21, 27, 255)
FAR_CLOTH = (38, 35, 42, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
SKIN = (218, 208, 186, 255)
SKIN_MID = (199, 181, 158, 255)
SKIN_SHADOW = (146, 119, 100, 255)

# Canonical rig faces left. Right is mirrored around x=19.5, but keeps its own
# approved head instead of mirroring facial pixels.
NEAR_SHOULDER = (22, 27)
FAR_SHOULDER = (19, 27)
NEAR_HIP = (19, 40)
FAR_HIP = (23, 40)

# End-effector offsets. The hip/shoulder stays fixed; knee/elbow takes one
# signed pixel when the endpoint moves, producing a native-pixel stair-step.
POSES = (
    {"near_hand": (2, 0), "far_hand": (-1, 0), "near_foot": (-2, 0), "far_foot": (1, 0)},
    {"near_hand": (0, 0), "far_hand": (0, 0), "near_foot": (0, -1), "far_foot": (0, 0)},
    {"near_hand": (-4, 0), "far_hand": (4, 0), "near_foot": (5, 0), "far_foot": (-5, 0)},
    {"near_hand": (0, 0), "far_hand": (0, 0), "near_foot": (0, 0), "far_foot": (0, -1)},
)
POSE_NAMES = ("CONTACT A", "PASS A", "CONTACT B", "PASS B")


def blank() -> Image.Image:
    return Image.new("RGBA", (W, H), CLEAR)


def mirror_x(x: int) -> int:
    return W - 1 - x


def orient(point: tuple[int, int], direction: str) -> tuple[int, int]:
    x, y = point
    return (mirror_x(x), y) if direction == "right" else (x, y)


def orient_dx(dx: int, direction: str) -> int:
    return -dx if direction == "right" else dx


def signed_step(value: int) -> int:
    return (value > 0) - (value < 0)


def draw_leg(
    direction: str,
    hip: tuple[int, int],
    offset: tuple[int, int],
    *,
    far: bool,
) -> Image.Image:
    layer = blank()
    draw = ImageDraw.Draw(layer)
    dx, dy = orient_dx(offset[0], direction), offset[1]
    hx, hy = orient(hip, direction)
    knee = (hx + signed_step(dx), 44)
    shin = (hx + dx, 47 + dy)

    draw.line((hx, hy, *knee, *shin), fill=INK, width=4)
    if far:
        draw.line((hx, hy + 1, *knee, *shin), fill=FAR_CLOTH, width=2)

    foot_y = ROOT_Y + dy
    facing = 1 if direction == "right" else -1
    toe_direction = signed_step(dx) or facing
    if toe_direction < 0:
        x0, x1 = shin[0] - 2, shin[0] + 1
        connector_x = shin[0] + 2
    else:
        x0, x1 = shin[0] - 1, shin[0] + 2
        connector_x = shin[0] - 2
    draw.rectangle((x0, foot_y - 1, x1, foot_y), fill=INK)
    draw.point((connector_x, foot_y - 1), fill=INK)
    accent_x = x0 + 1 if toe_direction < 0 else x1 - 1
    draw.point((accent_x, foot_y - 1), fill=FAR_CLOTH if far else COAL)
    return layer


def draw_arm(
    direction: str,
    shoulder: tuple[int, int],
    offset: tuple[int, int],
    *,
    far: bool,
) -> Image.Image:
    layer = blank()
    draw = ImageDraw.Draw(layer)
    dx = orient_dx(offset[0], direction)
    sx, sy = orient(shoulder, direction)
    elbow = (sx + signed_step(dx), 32)
    wrist = (sx + dx, 36)

    draw.line((sx, sy, *elbow, *wrist), fill=INK, width=4 if far else 5)
    draw.line(
        (sx, sy + 1, *elbow, *wrist),
        fill=FAR_CLOTH if far else COAL,
        width=2 if far else 3,
    )
    draw.rectangle((wrist[0] - 2, 35, wrist[0] + 2, 38), fill=INK)
    draw.line((wrist[0] - 1, 35, wrist[0] + 1, 35), fill=WORN, width=1)
    draw.rectangle(
        (wrist[0] - 1, 36, wrist[0] + 1, 37),
        fill=SKIN_SHADOW if far else SKIN_MID,
    )
    if not far:
        draw.point((wrist[0], 36), fill=SKIN)
    return layer


def draw_underpainted_torso(direction: str) -> Image.Image:
    layer = blank()
    draw = ImageDraw.Draw(layer)
    outer = [
        (18, 24), (24, 24), (25, 25), (26, 26), (26, 36), (25, 37),
        (25, 41), (17, 41), (17, 37), (16, 36), (17, 26), (18, 25),
    ]
    inner = [
        (19, 25), (23, 25), (24, 26), (25, 27), (25, 35),
        (24, 36), (18, 36), (18, 27), (19, 26),
    ]
    if direction == "right":
        outer = [(mirror_x(x), y) for x, y in outer]
        inner = [(mirror_x(x), y) for x, y in inner]
    draw.polygon(outer, fill=INK)
    draw.polygon(inner, fill=COAL)

    # A stable five-row pelvis masks the moving limb sockets.
    if direction == "left":
        draw.rectangle((17, 37, 25, 41), fill=INK)
        draw.line((18, 37, 24, 37), fill=COAL, width=1)
    else:
        draw.rectangle((14, 37, 22, 41), fill=INK)
        draw.line((15, 37, 21, 37), fill=COAL, width=1)
    return layer


def mother_head(source: Image.Image) -> Image.Image:
    layer = blank()
    layer.alpha_composite(source.crop((0, 0, W, 24)), (0, 0))
    return layer


def shifted(layer: Image.Image, dy: int) -> Image.Image:
    result = blank()
    result.alpha_composite(layer, (0, dy))
    return result


def render_frame(source: Image.Image, direction: str, pose_index: int) -> Image.Image:
    pose = POSES[pose_index]
    legs = blank()
    upper = blank()
    # Author the articulated body once in canonical left-facing coordinates.
    # Mirroring the finished native-pixel layers avoids PIL's even-width line
    # rasterization giving the right-facing rig a different body mass.
    for layer in (
        draw_leg("left", FAR_HIP, pose["far_foot"], far=True),
        draw_leg("left", NEAR_HIP, pose["near_foot"], far=False),
    ):
        legs.alpha_composite(layer)
    for layer in (
        draw_arm("left", FAR_SHOULDER, pose["far_hand"], far=True),
        draw_underpainted_torso("left"),
        draw_arm("left", NEAR_SHOULDER, pose["near_hand"], far=False),
    ):
        upper.alpha_composite(layer)
    if direction == "right":
        legs = legs.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        upper = upper.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    # Passing poses rise one native pixel while the support foot remains at
    # y49. The pelvis still overlaps the leg socket, so the bob adds no seam.
    bob_y = -1 if pose_index in (1, 3) else 0
    result = blank()
    result.alpha_composite(legs)
    result.alpha_composite(shifted(upper, bob_y))
    result.alpha_composite(shifted(mother_head(source), bob_y))
    return result


def opaque_count(image: Image.Image) -> int:
    return sum(alpha > 0 for alpha in image.getchannel("A").getdata())


def component_count(image: Image.Image) -> int:
    alpha = image.getchannel("A")
    remaining = {(x, y) for y in range(H) for x in range(W) if alpha.getpixel((x, y))}
    count = 0
    while remaining:
        count += 1
        queue = deque([remaining.pop()])
        while queue:
            x, y = queue.popleft()
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    queue.append(neighbor)
    return count


def validate(direction: str, source: Image.Image, frames: list[Image.Image]) -> None:
    if source.size != (W, H):
        raise AssertionError(f"bad mother size: {direction} {source.size}")
    if len({frame.tobytes() for frame in frames}) != 4:
        raise AssertionError(f"duplicate poses: {direction}")

    counts: list[int] = []
    for index, frame in enumerate(frames):
        bbox = frame.getchannel("A").getbbox()
        if bbox is None or bbox[3] - 1 != ROOT_Y:
            raise AssertionError(f"root drift: {direction}/{index} {bbox}")
        if component_count(frame) != 1:
            raise AssertionError(f"broken shoulder/hip: {direction}/{index}")
        if any(alpha not in (0, 255) for alpha in frame.getchannel("A").getdata()):
            raise AssertionError(f"partial alpha: {direction}/{index}")
        for y in range(22, 44):
            if not any(frame.getpixel((x, y))[3] for x in range(W)):
                raise AssertionError(f"empty core row: {direction}/{index}/y{y}")
        counts.append(opaque_count(frame))

    # Crossed limbs naturally occlude a few pixels; a two-percent cap keeps
    # the apparent mass stable while still permitting a readable pass pose.
    allowed_delta = max(2, round(min(counts) * 0.02))
    if max(counts) - min(counts) > allowed_delta:
        raise AssertionError(f"area pumping: {direction} {counts}, limit={allowed_delta}")
    print(f"{direction}: opaque={counts}; one component; root={ROOT_Y}")


def make_contact(frames: dict[str, list[Image.Image]]) -> Image.Image:
    top = 28
    left = 64
    pw, ph = W * SCALE, H * SCALE
    canvas = Image.new("RGB", (left + pw * 4, top + ph * 2), (19, 18, 24))
    draw = ImageDraw.Draw(canvas)
    for column, label in enumerate(POSE_NAMES):
        draw.text((left + column * pw + 10, 8), label, fill=(211, 202, 185))
    for row, direction in enumerate(("left", "right")):
        y0 = top + row * ph
        draw.text((8, y0 + 10), direction.upper(), fill=(196, 180, 151))
        for column, frame in enumerate(frames[direction]):
            x0 = left + column * pw
            panel = Image.new("RGBA", (W, H), (43, 38, 48, 255))
            panel.alpha_composite(frame)
            canvas.paste(
                panel.resize((pw, ph), Image.Resampling.NEAREST).convert("RGB"),
                (x0, y0),
            )
            if column:
                draw.line((x0, y0, x0, y0 + ph), fill=(67, 57, 70), width=1)
        if row:
            draw.line((0, y0, canvas.width, y0), fill=(67, 57, 70), width=1)
    return canvas


def main() -> None:
    mothers = {
        direction: Image.open(SOURCE_DIR / f"{direction}.png").convert("RGBA")
        for direction in ("left", "right")
    }
    original_bytes = {direction: image.tobytes() for direction, image in mothers.items()}
    frames = {
        direction: [render_frame(source, direction, index) for index in range(4)]
        for direction, source in mothers.items()
    }
    for direction in ("left", "right"):
        validate(direction, mothers[direction], frames[direction])
        if mothers[direction].tobytes() != original_bytes[direction]:
            raise AssertionError(f"mother changed: {direction}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    make_contact(frames).save(OUTPUT_PATH, optimize=True)
    print(f"wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
