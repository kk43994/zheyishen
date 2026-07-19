#!/usr/bin/env python3
"""Extract a guided 1/2/3 review sheet into tiny indexed-style PNG variants."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 1024
BOUNDARIES = (0, 341, 683, 1024)
LOGICAL_SIZE = (32, 40)


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--kind", choices=("hero", "item", "enemy"), required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    expected = [out_dir / f"variant-{index}.png" for index in (1, 2, 3)]
    expected += [out_dir / "comparison.png", out_dir / "manifest.json"]
    if not args.force and any(path.exists() for path in expected):
        raise SystemExit("refusing to overwrite variant output; pass --force")

    source = Image.open(args.input).convert("RGBA").resize((SIZE, SIZE), Image.Resampling.NEAREST)
    if args.kind == "hero":
        safe_top, safe_bottom = 224, 722
        max_width, max_height = 28, 38
    elif args.kind == "enemy":
        safe_top, safe_bottom = 274, 722
        max_width, max_height = 28, 36
    else:
        safe_top, safe_bottom = 344, 680
        max_width, max_height = 28, 28

    palettes = (5, 4, 6)
    logical_variants = []
    report = []
    for index, (left, right) in enumerate(zip(BOUNDARIES[:-1], BOUNDARIES[1:]), start=1):
        center = (left + right) // 2
        panel = source.crop((center - 114, safe_top, center + 114, safe_bottom))
        panel = remove_guides_and_key(panel)
        bbox = panel.getchannel("A").getbbox()
        if bbox is None:
            raise SystemExit(f"variant {index} is empty")
        sprite = panel.crop(bbox)
        ratio = min(max_width / sprite.width, max_height / sprite.height)
        width = max(1, round(sprite.width * ratio))
        height = max(1, round(sprite.height * ratio))
        sprite = sprite.resize((width, height), Image.Resampling.NEAREST)
        sprite = quantize_opaque(sprite, palettes[index - 1])
        logical = Image.new("RGBA", LOGICAL_SIZE, (0, 0, 0, 0))
        x = (LOGICAL_SIZE[0] - width) // 2
        y = LOGICAL_SIZE[1] - 1 - height if args.kind != "item" else (LOGICAL_SIZE[1] - height) // 2
        logical.alpha_composite(sprite, (x, y))
        logical_variants.append(logical)
        report.append({
            "variant": index,
            "logical_width": LOGICAL_SIZE[0],
            "logical_height": LOGICAL_SIZE[1],
            "sprite_x": x,
            "sprite_y": y,
            "sprite_width": width,
            "sprite_height": height,
            "palette_limit": palettes[index - 1],
        })

    out_dir.mkdir(parents=True, exist_ok=True)
    for index, logical in enumerate(logical_variants, start=1):
        logical.save(out_dir / f"variant-{index}.png", optimize=True)

    scale = 8
    panel_width = LOGICAL_SIZE[0] * scale
    panel_height = LOGICAL_SIZE[1] * scale
    comparison = Image.new("RGBA", (panel_width * 3, panel_height + 32), (19, 18, 24, 255))
    draw = ImageDraw.Draw(comparison)
    for index, logical in enumerate(logical_variants):
        enlarged = logical.resize((panel_width, panel_height), Image.Resampling.NEAREST)
        comparison.alpha_composite(enlarged, (index * panel_width, 32))
        draw.text((index * panel_width + panel_width // 2 - 3, 10), str(index + 1), fill=(232, 225, 211, 255))
        if index:
            draw.line((index * panel_width, 0, index * panel_width, comparison.height), fill=(60, 52, 64, 255), width=1)
    comparison.convert("RGB").save(out_dir / "comparison.png", optimize=True)
    (out_dir / "manifest.json").write_text(json.dumps({
        "kind": args.kind,
        "logical_size": LOGICAL_SIZE,
        "variants": report,
    }, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"wrote {out_dir / 'comparison.png'}")
    print(f"wrote 3 logical PNG variants in {out_dir}")


if __name__ == "__main__":
    main()
