#!/usr/bin/env python3
"""Cut three guided Image2 hero boards into consistent 40x56 four-direction sprites."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


SOURCE_SIZE = 1024
CELL_SIZE = 512
FRAME_W = 240
FRAME_H = 336
FRAME_TOP = 70
LOGICAL_SIZE = (40, 56)
ROOT = (20, 49)
DIRECTIONS = ("front", "back", "left", "right")
CELLS = ((0, 0), (1, 0), (0, 1), (1, 1))
CROP_ROOT = (112, 286)
STYLE_PALETTES = (
    (
        (23, 21, 27),
        (55, 52, 58),
        (103, 98, 98),
        (199, 181, 158),
        (146, 119, 100),
        (218, 208, 186),
    ),
    (
        (19, 18, 23),
        (48, 45, 48),
        (113, 104, 95),
        (203, 189, 161),
        (157, 127, 109),
        (222, 211, 186),
    ),
    (
        (24, 22, 28),
        (71, 65, 72),
        (112, 106, 107),
        (194, 173, 146),
        (141, 112, 94),
        (220, 207, 181),
        (66, 80, 112),
    ),
)


def remove_key_and_guides(image: Image.Image) -> Image.Image:
    cleaned = Image.new("RGBA", image.size, (0, 0, 0, 0))
    output = []
    rgba = image.convert("RGBA")
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = rgba.getpixel((x, y))
            is_key = green > 70 and green > red * 1.28 and green > blue * 1.16
            is_magenta = red > 195 and blue > 165 and green < 100
            is_cyan = blue > 175 and green > 135 and red < 110
            # Image edits shift the yellow guide across a wide yellow-green
            # range. It is safe to use a broad threshold only in this small
            # foot-pivot window; character skin never occupies this region.
            root_color = red > 150 and green > 180 and blue < 230
            # The edit model can drift the guide by roughly three logical
            # pixels, so keep the spatial window wider than the source cross.
            inside_root_guide = abs(x - CROP_ROOT[0]) <= 40 and abs(y - CROP_ROOT[1]) <= 40
            is_root = root_color and inside_root_guide
            output.append(
                (0, 0, 0, 0)
                if alpha and (is_key or is_magenta or is_cyan or is_root)
                else (red, green, blue, alpha)
            )
    cleaned.putdata(output)
    return cleaned


def crop_cell(source: Image.Image, column: int, row: int) -> Image.Image:
    center_x = column * CELL_SIZE + CELL_SIZE // 2
    top = row * CELL_SIZE + FRAME_TOP
    # Stay inside the cyan guide so residual guide pixels cannot enter a sprite.
    return source.crop((center_x - FRAME_W // 2 + 8, top + 8, center_x + FRAME_W // 2 - 8, top + FRAME_H - 8))


def quantize_group(
    images: list[Image.Image],
    palette: tuple[tuple[int, int, int], ...],
) -> list[Image.Image]:
    def nearest(color: tuple[int, int, int]) -> tuple[int, int, int]:
        red, green, blue = color
        return min(
            palette,
            key=lambda candidate: (
                (red - candidate[0]) ** 2
                + (green - candidate[1]) ** 2
                + (blue - candidate[2]) ** 2
            ),
        )

    results = []
    for image in images:
        result = Image.new("RGBA", image.size, (0, 0, 0, 0))
        result.putdata([
            (*nearest((red, green, blue)), 255) if alpha > 96 else (0, 0, 0, 0)
            for red, green, blue, alpha in image.convert("RGBA").getdata()
        ])
        results.append(result)
    return results


def normalize_style(
    source: Image.Image,
    palette: tuple[tuple[int, int, int], ...],
) -> tuple[list[Image.Image], list[dict[str, int]]]:
    source = source.convert("RGBA").resize((SOURCE_SIZE, SOURCE_SIZE), Image.Resampling.NEAREST)
    crops = [remove_key_and_guides(crop_cell(source, column, row)) for column, row in CELLS]
    bboxes = [crop.getchannel("A").getbbox() for crop in crops]
    if any(bbox is None for bbox in bboxes):
        raise ValueError("one or more direction cells are empty")
    sprites = [crop.crop(bbox) for crop, bbox in zip(crops, bboxes) if bbox is not None]

    max_source_width = max(sprite.width for sprite in sprites)
    max_source_height = max(sprite.height for sprite in sprites)
    shared_ratio = min(28 / max_source_width, 43 / max_source_height)
    resized = []
    dimensions = []
    for sprite in sprites:
        width = max(1, round(sprite.width * shared_ratio))
        height = max(1, round(sprite.height * shared_ratio))
        # Image2's apparent pixel blocks are rarely aligned to the requested
        # six-pixel grid. Area reduction preserves the dominant color in each
        # logical cell; the following fixed-palette pass restores hard pixels.
        scaled = sprite.resize((width, height), Image.Resampling.BOX)
        canvas = Image.new("RGBA", LOGICAL_SIZE, (0, 0, 0, 0))
        left = ROOT[0] - width // 2
        top = ROOT[1] - height + 1
        canvas.alpha_composite(scaled, (left, top))
        resized.append(canvas)
        dimensions.append({"x": left, "y": top, "width": width, "height": height})
    return quantize_group(resized, palette), dimensions


def native_sheet(frames: list[Image.Image]) -> Image.Image:
    sheet = Image.new("RGBA", (LOGICAL_SIZE[0] * len(frames), LOGICAL_SIZE[1]), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * LOGICAL_SIZE[0], 0))
    return sheet


def comparison(all_styles: list[list[Image.Image]]) -> Image.Image:
    scale = 6
    label_left = 60
    label_top = 28
    panel_width = LOGICAL_SIZE[0] * scale
    panel_height = LOGICAL_SIZE[1] * scale
    image = Image.new(
        "RGBA",
        (label_left + panel_width * len(all_styles), label_top + panel_height * len(DIRECTIONS)),
        (19, 18, 24, 255),
    )
    draw = ImageDraw.Draw(image)
    for style_index in range(len(all_styles)):
        draw.text((label_left + style_index * panel_width + 8, 8), str(style_index + 1), fill=(232, 225, 211, 255))
    for direction_index, direction in enumerate(DIRECTIONS):
        top = label_top + direction_index * panel_height
        draw.text((7, top + 9), direction.upper(), fill=(196, 180, 151, 255))
        for style_index, style in enumerate(all_styles):
            frame = style[direction_index]
            background = Image.new("RGBA", frame.size, (43, 38, 48, 255))
            background.alpha_composite(frame)
            enlarged = background.resize((panel_width, panel_height), Image.Resampling.NEAREST)
            image.alpha_composite(enlarged, (label_left + style_index * panel_width, top))
    for style_index in range(len(all_styles) + 1):
        x = label_left + style_index * panel_width
        draw.line((x, 0, x, image.height), fill=(67, 57, 70, 255), width=1)
    for direction_index in range(len(DIRECTIONS) + 1):
        y = label_top + direction_index * panel_height
        draw.line((0, y, image.width, y), fill=(67, 57, 70, 255), width=1)
    return image.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--style-1", required=True)
    parser.add_argument("--style-2", required=True)
    parser.add_argument("--style-3", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    comparison_path = out_dir / "comparison-4dir.png"
    if comparison_path.exists() and not args.force:
        raise SystemExit(f"refusing to overwrite {comparison_path}; pass --force")

    sources = [Path(args.style_1), Path(args.style_2), Path(args.style_3)]
    all_styles = []
    report = []
    out_dir.mkdir(parents=True, exist_ok=True)
    for style_index, (source_path, palette) in enumerate(zip(sources, STYLE_PALETTES), start=1):
        frames, dimensions = normalize_style(Image.open(source_path), palette)
        all_styles.append(frames)
        style_dir = out_dir / f"style-{style_index}"
        style_dir.mkdir(parents=True, exist_ok=True)
        for direction, frame in zip(DIRECTIONS, frames):
            frame.save(style_dir / f"{direction}.png", optimize=True)
        sheet = native_sheet(frames)
        sheet.save(out_dir / f"style-{style_index}-4dir.png", optimize=True)
        report.append({
            "style": style_index,
            "source": str(source_path),
            "palette": [list(color) for color in palette],
            "directions": dict(zip(DIRECTIONS, dimensions)),
            "sheet_bytes": (out_dir / f"style-{style_index}-4dir.png").stat().st_size,
        })

    comparison(all_styles).save(comparison_path, optimize=True)
    (out_dir / "manifest.json").write_text(json.dumps({
        "logical_size": list(LOGICAL_SIZE),
        "root": list(ROOT),
        "directions": list(DIRECTIONS),
        "styles": report,
        "usage": "style-selection gate only; selected style must be redrawn as code-native canonical layers",
    }, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"wrote {comparison_path}")
    print("wrote three 40x56 four-direction style gates")


if __name__ == "__main__":
    main()
