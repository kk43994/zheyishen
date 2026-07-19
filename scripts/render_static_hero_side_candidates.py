#!/usr/bin/env python3
"""Render three static side-view corrections while preserving the locked head."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


W = 40
H = 56
SCALE = 7
SOURCE = Path("output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1/left.png")
SOURCE_RIGHT = Path("output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1/right.png")
OUTPUT_DIR = Path("output/art-review-static")

INK = (23, 21, 27, 255)
COAL = (55, 52, 58, 255)
WORN = (103, 98, 98, 255)
SKIN = (218, 208, 186, 255)
SKIN_MID = (199, 181, 158, 255)
SKIN_SHADOW = (146, 119, 100, 255)


def blank() -> Image.Image:
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def head_from(source: Image.Image) -> Image.Image:
    result = blank()
    result.paste(source.crop((0, 0, W, 24)), (0, 0))
    return result


def draw_hand(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    draw.rectangle((x - 2, y - 2, x + 1, y + 1), fill=INK)
    draw.rectangle((x - 1, y - 1, x, y), fill=SKIN)
    draw.point((x, y), fill=SKIN_MID)


def draw_leg(
    draw: ImageDraw.ImageDraw,
    hip: tuple[int, int],
    foot: tuple[int, int],
    width: int,
    toe_left: bool,
    highlight: bool,
) -> None:
    draw.line((hip, (foot[0], foot[1] - 2)), fill=INK, width=width)
    fx, fy = foot
    if toe_left:
        draw.rectangle((fx - 2, fy - 1, fx + 1, fy), fill=INK)
        if highlight:
            draw.point((fx - 1, fy - 1), fill=COAL)
    else:
        draw.rectangle((fx - 1, fy - 1, fx + 2, fy), fill=INK)
        if highlight:
            draw.point((fx + 1, fy - 1), fill=COAL)


def draw_arm(
    draw: ImageDraw.ImageDraw,
    shoulder: tuple[int, int],
    hand: tuple[int, int],
    width: int,
    inner: tuple[int, int, int, int],
) -> None:
    draw.line((shoulder, hand), fill=INK, width=width)
    draw.line((shoulder, hand), fill=inner, width=max(1, width - 2))
    draw_hand(draw, hand[0], hand[1])


def candidate_a(source: Image.Image) -> Image.Image:
    image = head_from(source)
    draw = ImageDraw.Draw(image)
    draw_leg(draw, (22, 40), (22, 49), 5, False, False)
    draw_leg(draw, (18, 40), (17, 49), 5, True, True)
    draw_arm(draw, (23, 27), (23, 37), 3, COAL)
    draw.polygon([(17, 24), (24, 24), (26, 27), (25, 40), (17, 40), (16, 37), (16, 27)], fill=INK)
    draw.polygon([(18, 25), (23, 25), (24, 28), (23, 38), (18, 38), (17, 36), (17, 28)], fill=COAL)
    draw.line((18, 25, 23, 25), fill=WORN)
    draw_arm(draw, (18, 27), (18, 37), 4, COAL)
    return image


def candidate_b(source: Image.Image) -> Image.Image:
    image = head_from(source)
    draw = ImageDraw.Draw(image)
    draw_leg(draw, (22, 40), (23, 49), 5, False, False)
    draw_leg(draw, (18, 40), (16, 49), 5, True, True)
    draw_arm(draw, (24, 27), (24, 36), 3, (43, 40, 46, 255))
    draw.polygon([(16, 24), (24, 24), (27, 28), (26, 40), (16, 40), (15, 37), (15, 27)], fill=INK)
    draw.polygon([(17, 25), (23, 25), (25, 28), (24, 38), (17, 38), (16, 36), (16, 28)], fill=COAL)
    draw.line((17, 25, 23, 25), fill=WORN)
    draw_arm(draw, (17, 27), (16, 37), 4, COAL)
    draw.line((20, 42, 20, 47), fill=COAL)
    return image


def candidate_c(source: Image.Image) -> Image.Image:
    image = head_from(source)
    draw = ImageDraw.Draw(image)
    draw_leg(draw, (22, 40), (22, 49), 5, False, False)
    draw_leg(draw, (18, 40), (17, 49), 5, True, True)
    draw_arm(draw, (24, 28), (23, 37), 3, (45, 42, 48, 255))
    draw.polygon([(17, 24), (24, 24), (26, 28), (25, 40), (17, 40), (16, 36), (16, 27)], fill=INK)
    draw.polygon([(18, 25), (23, 25), (24, 28), (23, 38), (18, 38), (17, 35), (17, 28)], fill=COAL)
    draw.line((18, 25, 23, 25), fill=WORN)
    draw_arm(draw, (18, 28), (17, 37), 4, COAL)
    draw.point((20, 46), fill=COAL)
    return image


def mirror(source: Image.Image) -> Image.Image:
    return source.transpose(Image.Transpose.FLIP_LEFT_RIGHT)


def make_sheet(
    original: Image.Image,
    original_right: Image.Image,
    candidates: list[tuple[str, Image.Image]],
) -> Image.Image:
    columns = [("ORIGINAL", original), *candidates]
    cell_w = W * SCALE + 20
    cell_h = H * SCALE + 18
    label_h = 26
    row_label_w = 48
    canvas = Image.new("RGB", (row_label_w + cell_w * len(columns), label_h + cell_h * 2), (18, 17, 23))
    draw = ImageDraw.Draw(canvas)
    for column, (label, _sprite) in enumerate(columns):
        draw.text((row_label_w + column * cell_w + 8, 8), label, fill=(218, 209, 192))
    for row, direction in enumerate(("LEFT", "RIGHT")):
        top = label_h + row * cell_h
        draw.text((6, top + 10), direction, fill=(198, 172, 101))
        for column, (_label, left_sprite) in enumerate(columns):
            if column == 0 and direction == "RIGHT":
                sprite = original_right
            else:
                sprite = left_sprite if direction == "LEFT" else mirror(left_sprite)
            left = row_label_w + column * cell_w
            draw.rectangle((left, top, left + cell_w - 1, top + cell_h - 1), fill=(43, 38, 48))
            scaled = sprite.resize((W * SCALE, H * SCALE), Image.Resampling.NEAREST)
            canvas.paste(scaled, (left + 10, top + 9), scaled)
            if column:
                draw.line((left, top, left, top + cell_h - 1), fill=(70, 62, 73))
    return canvas


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    original = Image.open(SOURCE).convert("RGBA")
    original_right = Image.open(SOURCE_RIGHT).convert("RGBA")
    candidates = [
        ("A PROPORTION", candidate_a(original)),
        ("B READABLE", candidate_b(original)),
        ("C BALANCED", candidate_c(original)),
    ]
    for label, image in candidates:
        slug = label.split()[0].lower()
        image.save(OUTPUT_DIR / f"hero-side-{slug}-left.png", optimize=True)
        mirror(image).save(OUTPUT_DIR / f"hero-side-{slug}-right.png", optimize=True)
    make_sheet(original, original_right, candidates).save(
        OUTPUT_DIR / "03-hero-side-candidates.png",
        optimize=True,
    )
    print(f"wrote side-view candidates to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
