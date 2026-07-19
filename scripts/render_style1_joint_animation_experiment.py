#!/usr/bin/env python3
"""Prototype readable joint animation from the locked four-direction mother sprites."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


FRAME_W = 40
FRAME_H = 56
ROOT_Y = 49
SCALE = 7
DIRECTIONS = ("front", "back", "left", "right")
MOTIONS = {"idle": 2, "walk": 4, "attack": 3, "hurt": 2}
SOURCE_DIR = Path("output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1")
OUTPUT_DIR = Path("output/imagegen/zhe-yi-shen-hero-style1-joint-motion-v3")

INK = (23, 21, 27, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
SKIN = (218, 208, 186, 255)
SKIN_MID = (199, 181, 158, 255)
SKIN_SHADOW = (146, 119, 100, 255)


def blank() -> Image.Image:
    return Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))


def clear_where(image: Image.Image, predicate) -> None:
    pixels = image.load()
    for y in range(FRAME_H):
        for x in range(FRAME_W):
            if predicate(x, y):
                pixels[x, y] = (0, 0, 0, 0)


def shift_upper(source: Image.Image, dx: int) -> Image.Image:
    result = blank()
    source_pixels = source.load()
    target_pixels = result.load()
    for y in range(FRAME_H):
        row_dx = dx if y <= 39 else 0
        for x in range(FRAME_W):
            pixel = source_pixels[x, y]
            if pixel[3]:
                target_pixels[x + row_dx, y] = pixel
    return result


def draw_arm(
    image: Image.Image,
    shoulder: tuple[int, int],
    hand: tuple[int, int],
    inner: tuple[int, int, int, int] = COAL,
) -> None:
    draw = ImageDraw.Draw(image)
    draw.line((shoulder, hand), fill=INK, width=5)
    draw.line((shoulder, hand), fill=inner, width=3)
    hx, hy = hand
    draw.rectangle((hx - 2, hy - 2, hx + 1, hy + 1), fill=INK)
    draw.rectangle((hx - 1, hy - 1, hx, hy), fill=SKIN)
    draw.point((hx, hy), fill=SKIN_MID)


def draw_leg(
    image: Image.Image,
    hip: tuple[int, int],
    foot: tuple[int, int],
    toe_direction: int,
    near: bool,
) -> None:
    draw = ImageDraw.Draw(image)
    fx, fy = foot
    # Stop the thick trouser stroke above the shoe so its square cap never
    # drifts below the shared y=49 root.
    draw.line((hip, (fx, fy - 3)), fill=INK, width=6 if near else 5)
    left = fx - 2 if toe_direction < 0 else fx - 1
    right = fx + 1 if toe_direction < 0 else fx + 2
    draw.rectangle((left, fy - 1, right, fy), fill=INK)
    draw.point((fx + toe_direction, fy - 1), fill=COAL)


def blink(source: Image.Image, direction: str) -> Image.Image:
    result = source.copy()
    pixels = result.load()
    if direction == "front":
        eyes = ((16, 16), (17, 16), (22, 16), (23, 16))
    elif direction == "left":
        eyes = ((21, 16), (22, 16))
    elif direction == "right":
        eyes = ((17, 16), (18, 16))
    else:
        for x in range(18, 22):
            if pixels[x, 23] == WORN:
                pixels[x, 23] = COAL
        return result
    for x, y in eyes:
        if pixels[x, y] == COAL:
            pixels[x, y] = SKIN_SHADOW
    return result


def front_pose(
    source: Image.Image,
    left_hand: tuple[int, int],
    right_hand: tuple[int, int],
    left_foot: tuple[int, int],
    right_foot: tuple[int, int],
    upper_dx: int = 0,
) -> Image.Image:
    result = shift_upper(source, upper_dx) if upper_dx else source.copy()
    clear_where(result, lambda x, y: 27 <= y <= 39 and (x <= 14 + upper_dx or x >= 26 + upper_dx))
    clear_where(result, lambda _x, y: 40 <= y <= 49)
    draw_leg(result, (17 + upper_dx, 40), left_foot, -1, True)
    draw_leg(result, (23 + upper_dx, 40), right_foot, 1, True)
    draw_arm(result, (13 + upper_dx, 27), left_hand)
    draw_arm(result, (27 + upper_dx, 27), right_hand)
    return result


def side_value(direction: str, left_value: int) -> int:
    return left_value if direction == "left" else FRAME_W - 1 - left_value


def side_pose(
    source: Image.Image,
    direction: str,
    near_hand_left: tuple[int, int],
    near_foot_left: tuple[int, int],
    far_foot_left: tuple[int, int],
    upper_forward: int = 0,
) -> Image.Image:
    facing_sign = -1 if direction == "left" else 1
    upper_dx = upper_forward * facing_sign
    result = shift_upper(source, upper_dx) if upper_dx else source.copy()
    if direction == "left":
        clear_where(result, lambda x, y: 26 <= y <= 39 and x >= 21 + upper_dx)
    else:
        clear_where(result, lambda x, y: 26 <= y <= 39 and x <= 18 + upper_dx)
    clear_where(result, lambda _x, y: 40 <= y <= 49)

    far_hip_left = (20, 40)
    near_hip_left = (18, 40)
    far_hip = (side_value(direction, far_hip_left[0]), far_hip_left[1])
    near_hip = (side_value(direction, near_hip_left[0]), near_hip_left[1])
    far_foot = (side_value(direction, far_foot_left[0]), far_foot_left[1])
    near_foot = (side_value(direction, near_foot_left[0]), near_foot_left[1])
    draw_leg(result, far_hip, far_foot, -facing_sign, False)
    draw_leg(result, near_hip, near_foot, facing_sign, True)

    shoulder_left = (21 + (-1 if upper_forward else 0), 27)
    hand = (side_value(direction, near_hand_left[0]), near_hand_left[1])
    shoulder = (side_value(direction, shoulder_left[0]), shoulder_left[1])
    draw_arm(result, shoulder, hand)
    return result


FRONT_WALK = (
    ((12, 34), (29, 39), (15, 49), (24, 47)),
    ((12, 37), (28, 37), (17, 49), (23, 49)),
    ((11, 39), (28, 34), (17, 47), (26, 49)),
    ((13, 38), (27, 36), (17, 49), (23, 49)),
)

SIDE_WALK = (
    ((15, 34), (13, 49), (22, 47)),
    ((21, 37), (17, 49), (21, 49)),
    ((24, 39), (22, 47), (14, 49)),
    ((19, 36), (17, 49), (21, 49)),
)


def render_motion(source: Image.Image, direction: str, motion: str, frame: int) -> Image.Image:
    if motion == "idle":
        return source.copy() if frame == 0 else blink(source, direction)
    if direction in {"front", "back"}:
        if motion == "walk":
            return front_pose(source, *FRONT_WALK[frame])
        if motion == "attack":
            poses = (
                ((16, 31), (24, 31), (17, 49), (23, 49), 0),
                ((10, 37), (30, 37), (16, 49), (24, 49), -1 if direction == "front" else 1),
                ((12, 37), (28, 37), (17, 49), (23, 49), 0),
            )
            return front_pose(source, *poses[frame])
        poses = (
            ((9, 33), (31, 35), (16, 49), (24, 47), -1),
            ((10, 31), (31, 31), (17, 47), (25, 49), 2),
        )
        return front_pose(source, *poses[frame])

    if motion == "walk":
        return side_pose(source, direction, *SIDE_WALK[frame])
    if motion == "attack":
        poses = (
            ((14, 24), (17, 49), (21, 49), 0),
            ((24, 38), (14, 49), (21, 48), 1),
            ((21, 37), (17, 49), (21, 49), 0),
        )
        return side_pose(source, direction, *poses[frame])
    poses = (
        ((13, 31), (17, 48), (22, 49), -1),
        ((25, 32), (22, 48), (15, 49), 2),
    )
    return side_pose(source, direction, *poses[frame])


def preview_frame(frames: dict[str, Image.Image], label: str = "") -> Image.Image:
    label_w = 52
    label_h = 20
    cell_w = FRAME_W * SCALE
    cell_h = FRAME_H * SCALE
    result = Image.new("RGB", (label_w + cell_w * 4, label_h + cell_h), (19, 18, 24))
    draw = ImageDraw.Draw(result)
    if label:
        draw.text((5, label_h + 8), label, fill=(196, 180, 151))
    for column, direction in enumerate(DIRECTIONS):
        x = label_w + column * cell_w
        draw.text((x + 8, 5), direction.upper(), fill=(211, 202, 185))
        panel = Image.new("RGBA", (FRAME_W, FRAME_H), (43, 38, 48, 255))
        panel.alpha_composite(frames[direction])
        result.paste(panel.convert("RGB").resize((cell_w, cell_h), Image.Resampling.NEAREST), (x, label_h))
    return result


def save_atlas(frames: dict[str, list[Image.Image]], count: int, path: Path) -> None:
    atlas = Image.new("RGBA", (FRAME_W * count, FRAME_H * 4), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(frames[direction]):
            atlas.alpha_composite(frame, (column * FRAME_W, row * FRAME_H))
    atlas.save(path, optimize=True)


def validate(frame: Image.Image, label: str) -> int:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None or bbox[3] - 1 != ROOT_Y:
        raise AssertionError(f"invalid root: {label} {bbox}")
    if bbox[1] <= 0:
        raise AssertionError(f"top clipping: {label} {bbox}")
    if any(alpha not in {0, 255} for *_, alpha in frame.getdata()):
        raise AssertionError(f"partial alpha: {label}")
    return sum(pixel[3] > 0 for pixel in frame.getdata())


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = {direction: Image.open(SOURCE_DIR / f"{direction}.png").convert("RGBA") for direction in DIRECTIONS}
    all_frames: dict[str, dict[str, list[Image.Image]]] = {}
    for motion, count in MOTIONS.items():
        motion_frames = {
            direction: [render_motion(sources[direction], direction, motion, frame) for frame in range(count)]
            for direction in DIRECTIONS
        }
        if motion == "idle":
            for direction in DIRECTIONS:
                if motion_frames[direction][0].tobytes() != sources[direction].tobytes():
                    raise AssertionError(f"mother changed: {direction}")
        for direction, frames in motion_frames.items():
            if len({frame.tobytes() for frame in frames}) != count:
                raise AssertionError(f"duplicate frames: {direction}/{motion}")
            source_count = sum(pixel[3] > 0 for pixel in sources[direction].getdata())
            counts = [validate(frame, f"{direction}/{motion}/{index}") for index, frame in enumerate(frames)]
            if max(abs(count - source_count) for count in counts) > source_count * 0.18:
                raise AssertionError(f"excessive area change: {direction}/{motion} {source_count}->{counts}")
        all_frames[motion] = motion_frames
        save_atlas(motion_frames, count, OUTPUT_DIR / f"style1-joint-{motion}-4dir.png")

    sequence = [
        ("idle", 0, 500), ("idle", 1, 500),
        *[("walk", frame, 150) for frame in range(4)] * 2,
        ("attack", 0, 180), ("attack", 1, 220), ("attack", 2, 300),
        ("hurt", 0, 140), ("hurt", 1, 360),
    ]
    previews = [
        preview_frame({direction: all_frames[motion][direction][frame] for direction in DIRECTIONS})
        for motion, frame, _ in sequence
    ]
    previews[0].save(
        OUTPUT_DIR / "style1-joint-motion-preview.gif",
        save_all=True,
        append_images=previews[1:],
        duration=[duration for _, _, duration in sequence],
        loop=0,
        optimize=True,
        disposal=2,
    )

    for motion, motion_frames in all_frames.items():
        rows = [
            preview_frame(
                {direction: motion_frames[direction][frame] for direction in DIRECTIONS},
                f"{motion.upper()} {frame}",
            )
            for frame in range(MOTIONS[motion])
        ]
        contact = Image.new("RGB", (rows[0].width, rows[0].height * len(rows)), (19, 18, 24))
        for index, row in enumerate(rows):
            contact.paste(row, (0, index * row.height))
        contact.save(OUTPUT_DIR / f"style1-joint-{motion}-contact.png", optimize=True)
    print(f"wrote joint animation experiment to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
