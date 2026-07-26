#!/usr/bin/env python3
"""Rebuild readable projectile source sheets from approved generated assets.

The online Image2 reference jobs live in scripts/image2/projectile-v3. This
deterministic fallback keeps the same design contract when that edit endpoint
is unavailable: it reshapes the approved Image2 breath sheets and samples the
canonical item-icon atlas, then process_vfx_ui_pack.py performs the normal
chroma-key, crop, quantize and 28px atlas stages.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

from process_vfx_ui_pack import cell_sprite, tint_alpha_sprite


RAW = Path("output/imagegen/zhe-yi-shen-vfx-ui-v1/raw")
ICON_PNG = Path("src/assets/items/icons.png")
ICON_JSON = Path("src/assets/items/icons.json")
PROVENANCE = Path("output/imagegen/zhe-yi-shen-vfx-ui-v1/projectiles.draft.sources.json")
DESIGN_CONTRACT = Path("src/projectile-item-signatures.ts")
PROMPT_JOBS = Path("scripts/image2/projectile-v3/jobs.jsonl")
GREEN = (0, 255, 0, 255)
CLEAR = (0, 0, 0, 0)
INK = (42, 39, 47, 255)
MOON = (235, 229, 216, 255)
LIGHT = (255, 248, 225, 255)
WOOD = (145, 104, 63, 255)
METAL = (199, 210, 214, 255)
GLASS = (153, 207, 218, 255)
ICE = (177, 220, 231, 255)
GREY = (128, 129, 132, 255)
RED = (181, 67, 78, 255)
GOLD = (194, 153, 75, 255)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fit(sprite: Image.Image, max_width: int, max_height: int) -> Image.Image:
    sprite = sprite.convert("RGBA")
    bbox = sprite.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("cannot fit an empty sprite")
    sprite = sprite.crop(bbox)
    ratio = min(max_width / sprite.width, max_height / sprite.height)
    return sprite.resize(
        (max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio))),
        Image.Resampling.NEAREST,
    )


def stretch(sprite: Image.Image, width: int, height: int) -> Image.Image:
    sprite = sprite.convert("RGBA")
    bbox = sprite.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("cannot stretch an empty sprite")
    return sprite.crop(bbox).resize((width, height), Image.Resampling.NEAREST)


def paste_center(canvas: Image.Image, sprite: Image.Image, x: int = 14, y: int = 14) -> None:
    canvas.alpha_composite(sprite, (round(x - sprite.width / 2), round(y - sprite.height / 2)))


def source_sprite(sheet_name: str, quadrant: int, logical: int = 24) -> Image.Image:
    sheet = Image.open(RAW / f"{sheet_name}.png").convert("RGBA")
    return cell_sprite(sheet, quadrant, logical=logical, colors=10, soft=True)


def icon_sprite(item_id: str, max_width: int, max_height: int) -> Image.Image:
    manifest = json.loads(ICON_JSON.read_text(encoding="utf-8"))
    index = manifest["index"][item_id]
    cell = manifest["cell"]
    cols = manifest["cols"]
    atlas = Image.open(ICON_PNG).convert("RGBA")
    left = (index % cols) * cell
    top = (index // cols) * cell
    return fit(atlas.crop((left, top, left + cell, top + cell)), max_width, max_height)


def breath_variant(quadrant: int = 2, width: int = 22, height: int = 14, color: str | None = None) -> Image.Image:
    sprite = fit(source_sprite("proj-breath", quadrant), width, height)
    return tint_alpha_sprite(sprite, color) if color else sprite


def slash_sprite() -> Image.Image:
    # The generated fog texture is clipped into a thick forward crescent. Wood
    # only appears as two chips, so no straight edge can turn into a sword.
    out = Image.new("RGBA", (28, 28), CLEAR)
    texture = stretch(source_sprite("proj-breath", 3), 28, 28)
    mask = Image.new("L", (28, 28), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.arc((1, 1, 26, 26), -125, 125, fill=255, width=8)
    out.paste(texture, (0, 0), Image.composite(texture.getchannel("A"), Image.new("L", (28, 28), 0), mask))
    draw = ImageDraw.Draw(out)
    draw.arc((1, 2, 25, 27), 30, 125, fill=WOOD, width=2)
    draw.rectangle((2, 19, 4, 20), fill=WOOD)
    draw.rectangle((6, 23, 7, 24), fill=WOOD)
    return out


def razor_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    edge = tint_alpha_sprite(stretch(source_sprite("proj-forms", 0), 23, 4), "#c7d2d6")
    out.alpha_composite(edge, (3, 11))
    draw = ImageDraw.Draw(out)
    draw.line((4, 14, 24, 9), fill=INK, width=1)
    draw.line((5, 13, 23, 9), fill=METAL, width=1)
    draw.point((21, 9), fill=LIGHT)
    return out


def marble_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    paste_center(out, icon_sprite("marble", 20, 20))
    return out


def ice_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    paste_center(out, breath_variant(2, 17, 11), y=14)
    draw = ImageDraw.Draw(out)
    draw.rectangle((4, 6, 23, 21), outline=INK, width=2)
    draw.line((7, 7, 20, 7), fill=ICE, width=2)
    draw.line((5, 9, 5, 18), fill=GLASS, width=2)
    draw.line((8, 20, 21, 20), fill=ICE, width=2)
    for x, y in ((3, 4), (22, 4), (2, 20), (23, 21)):
        draw.rectangle((x, y, x + 2, y + 2), fill=ICE)
    return out


def serial_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    body = tint_alpha_sprite(stretch(source_sprite("proj-breath", 3), 23, 10), "#808184")
    paste_center(out, body)
    draw = ImageDraw.Draw(out)
    for x, height in ((9, 5), (13, 7), (17, 5), (20, 7)):
        draw.line((x, 11, x, 11 + height), fill=INK, width=1)
    draw.line((5, 10, 22, 10), fill=METAL, width=1)
    return out


def typing_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    body = stretch(source_sprite("proj-breath", 3), 25, 17)
    paste_center(out, body)
    draw = ImageDraw.Draw(out)
    for x, y in ((2, 15), (6, 13), (10, 11)):
        draw.rectangle((x, y, x + 1, y + 1), fill=INK)
    return out


def button_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    paste_center(out, breath_variant(2, 23, 14))
    button = icon_sprite("loose-button", 11, 11)
    paste_center(out, button)
    return out


def link_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    paste_center(out, breath_variant(2, 16, 10))
    draw = ImageDraw.Draw(out)
    draw.ellipse((2, 8, 15, 20), outline=RED, width=3)
    draw.ellipse((13, 8, 26, 20), outline=GOLD, width=3)
    draw.rectangle((12, 7, 16, 11), fill=CLEAR)
    draw.line((10, 14, 18, 14), fill=LIGHT, width=1)
    return out


def stamp_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    draw = ImageDraw.Draw(out)
    draw.rectangle((3, 6, 24, 21), fill=INK)
    draw.rectangle((5, 8, 22, 19), outline=RED, width=2)
    draw.rectangle((8, 11, 13, 16), fill=RED)
    draw.line((13, 13, 20, 13), fill=RED, width=2)
    draw.rectangle((17, 10, 20, 16), fill=RED)
    return out


def stone_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    body = breath_variant(3, 23, 11)
    paste_center(out, body, y=12)
    draw = ImageDraw.Draw(out)
    draw.polygon(((4, 14), (24, 14), (20, 19), (8, 19)), fill=INK)
    draw.polygon(((7, 14), (21, 14), (18, 17), (9, 17)), fill=GREY)
    draw.rectangle((5, 21, 7, 23), fill=GREY)
    draw.rectangle((12, 23, 13, 25), fill=WOOD)
    return out


def lens_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    body = fit(breath_variant(3, 25, 7), 25, 7)
    paste_center(out, body)
    draw = ImageDraw.Draw(out)
    draw.line((3, 12, 18, 9, 25, 11), fill=GLASS, width=2)
    draw.line((4, 16, 18, 14, 24, 16), fill=(104, 166, 181, 255), width=2)
    draw.rectangle((20, 9, 22, 11), fill=LIGHT)
    return out


def laugh_sprite() -> Image.Image:
    out = Image.new("RGBA", (28, 28), CLEAR)
    body = breath_variant(1, 20, 12)
    paste_center(out, body, x=16)
    tail = breath_variant(0, 7, 5)
    paste_center(out, tail, x=4, y=17)
    return out


SHEETS = {
    "proj-readable-a-draft": (slash_sprite, razor_sprite, marble_sprite, ice_sprite),
    "proj-readable-b-draft": (serial_sprite, typing_sprite, button_sprite, link_sprite),
    "proj-readable-c-draft": (stamp_sprite, stone_sprite, lens_sprite, laugh_sprite),
}


def write_source_sheet(name: str, builders: tuple) -> Path:
    sheet = Image.new("RGBA", (512, 512), GREEN)
    for quadrant, builder in enumerate(builders):
        sprite = builder()
        sprite = sprite.resize((224, 224), Image.Resampling.NEAREST)
        left = (quadrant % 2) * 256 + 16
        top = (quadrant // 2) * 256 + 16
        sheet.alpha_composite(sprite, (left, top))
    output = RAW / f"{name}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output, optimize=True)
    return output


def main() -> None:
    required = [RAW / "proj-breath.png", RAW / "proj-forms.png", RAW / "proj-special.png", ICON_PNG, ICON_JSON, DESIGN_CONTRACT, PROMPT_JOBS]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"missing projectile pipeline inputs: {', '.join(missing)}")
    outputs = [write_source_sheet(name, builders) for name, builders in SHEETS.items()]
    PROVENANCE.parent.mkdir(parents=True, exist_ok=True)
    PROVENANCE.write_text(json.dumps({
        "pipeline": "approved Image2 bases -> semantic reshape -> chroma key -> crop -> 28px quantization",
        "onlineReferenceJobs": str(PROMPT_JOBS),
        "designContract": str(DESIGN_CONTRACT),
        "inputs": {str(path): sha256(path) for path in required},
        "hybridSheets": {str(path): sha256(path) for path in outputs},
        "forms": {
            "proj-readable-a-draft": ["slash", "razor", "marble", "ice"],
            "proj-readable-b-draft": ["serial", "typing", "button", "link"],
            "proj-readable-c-draft": ["stamp", "stone", "lens", "laugh"],
        },
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"projectile hybrid bases: {len(outputs)} sheets, provenance {PROVENANCE}")


if __name__ == "__main__":
    main()
