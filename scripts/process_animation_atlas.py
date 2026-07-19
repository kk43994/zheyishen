#!/usr/bin/env python3
"""Extract a guided 4x4 character animation into tiny runtime frames and review GIFs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


GRID = 4
CELL = 256
SIZE = GRID * CELL
FRAME_SIZE = (32, 40)


def remove_guides_and_key(image: Image.Image) -> Image.Image:
    pixels = []
    for red, green, blue, alpha in image.getdata():
        is_green = green > 64 and green > red * 1.32 and green > blue * 1.18
        is_magenta = red > 200 and blue > 180 and green < 80
        is_cyan = blue > 200 and green > 160 and red < 80
        is_anchor = red > 230 and green > 210 and 120 < blue < 210
        pixels.append((red, green, blue, 0 if alpha and (is_green or is_magenta or is_cyan or is_anchor) else alpha))
    image.putdata(pixels)
    return image


def quantize_opaque(image: Image.Image, colors: int) -> Image.Image:
    rgba = list(image.convert("RGBA").getdata())
    opaque = [(red, green, blue) for red, green, blue, alpha in rgba if alpha > 20]
    if not opaque:
        return Image.new("RGBA", image.size, (0, 0, 0, 0))
    samples = Image.new("RGB", (len(opaque), 1))
    samples.putdata(opaque)
    indexed = samples.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    palette = list(dict.fromkeys(indexed.getdata()))

    def nearest(red: int, green: int, blue: int) -> tuple[int, int, int]:
        return min(palette, key=lambda color: (
            (red - color[0]) ** 2 + (green - color[1]) ** 2 + (blue - color[2]) ** 2
        ))

    result = Image.new("RGBA", image.size, (0, 0, 0, 0))
    result.putdata([
        (*nearest(red, green, blue), 255) if alpha > 20 else (0, 0, 0, 0)
        for red, green, blue, alpha in rgba
    ])
    return result


def preview_frame(frame: Image.Image, scale: int = 8) -> Image.Image:
    enlarged = frame.resize((frame.width * scale, frame.height * scale), Image.Resampling.NEAREST)
    preview = Image.new("RGBA", enlarged.size, (38, 34, 43, 255))
    preview.alpha_composite(enlarged)
    return preview.convert("P", palette=Image.Palette.ADAPTIVE, colors=16)


def save_gif(path: Path, frames: list[Image.Image], duration: int) -> None:
    previews = [preview_frame(frame) for frame in frames]
    previews[0].save(
        path,
        save_all=True,
        append_images=previews[1:],
        duration=duration,
        loop=0,
        optimize=True,
        disposal=2,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    if out_dir.exists() and not args.force and any(out_dir.iterdir()):
        raise SystemExit("refusing to overwrite animation output; pass --force")
    out_dir.mkdir(parents=True, exist_ok=True)

    source = Image.open(args.input).convert("RGBA").resize((SIZE, SIZE), Image.Resampling.NEAREST)
    frames = []
    report = []
    for index in range(GRID * GRID):
        row, column = divmod(index, GRID)
        left = column * CELL + 64
        top = row * CELL + 52
        raw = source.crop((left, top, left + 128, top + 160))
        raw = remove_guides_and_key(raw)
        frame = raw.resize(FRAME_SIZE, Image.Resampling.NEAREST)
        frame = quantize_opaque(frame, 6)
        if frame.getchannel("A").getbbox() is None:
            raise SystemExit(f"empty frame {index}")
        frames.append(frame)
        frame.save(out_dir / f"frame-{index:02d}.png", optimize=True)
        report.append({"index": index, "row": row, "column": column, "bbox": frame.getchannel("A").getbbox()})

    sheet = Image.new("RGBA", (FRAME_SIZE[0] * GRID, FRAME_SIZE[1] * GRID), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        row, column = divmod(index, GRID)
        sheet.alpha_composite(frame, (column * FRAME_SIZE[0], row * FRAME_SIZE[1]))
    sheet.save(out_dir / "runtime-sheet.png", optimize=True)

    save_gif(out_dir / "idle.gif", frames[0:4], 220)
    save_gif(out_dir / "walk.gif", frames[4:8], 130)
    save_gif(out_dir / "hurt.gif", [frames[8], frames[9], frames[9], frames[8]], 150)
    save_gif(out_dir / "acquire.gif", [frames[10], frames[11], frames[11], frames[10]], 180)
    save_gif(out_dir / "exhale.gif", frames[12:16], 150)
    (out_dir / "manifest.json").write_text(json.dumps({
        "frame_width": FRAME_SIZE[0],
        "frame_height": FRAME_SIZE[1],
        "palette_limit": 6,
        "animations": {
            "idle": [0, 1, 2, 3],
            "walk": [4, 5, 6, 7],
            "hurt": [8, 9],
            "acquire": [10, 11],
            "exhale": [12, 13, 14, 15],
        },
        "frames": report,
    }, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"wrote {out_dir / 'runtime-sheet.png'}")
    print("wrote idle/walk/hurt/acquire/exhale GIF previews")


if __name__ == "__main__":
    main()
