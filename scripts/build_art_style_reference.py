#!/usr/bin/env python3
"""Build the canonical art-language board from current runtime assets."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "art-style-reference-v1" / "canonical-style-board.png"

PALETTE = [
    ("night", "#111116"),
    ("raised", "#1B1A20"),
    ("ink", "#17151A"),
    ("ink soft", "#3E3A3D"),
    ("paper", "#D8D0C1"),
    ("paper light", "#E8E1D3"),
    ("paper dim", "#AAA297"),
    ("paper shadow", "#786F69"),
    ("old red", "#9F3548"),
    ("dark red", "#642231"),
    ("raincoat", "#C6A44A"),
    ("hospital", "#71818A"),
]


def load(path: str) -> Image.Image:
    return Image.open(ROOT / path).convert("RGBA")


def paste_fit(
    board: Image.Image,
    source: Image.Image,
    box: tuple[int, int, int, int],
    *,
    pixel: bool = False,
    background: str = "#111116",
) -> None:
    x, y, width, height = box
    resample = Image.Resampling.NEAREST if pixel else Image.Resampling.LANCZOS
    contained = ImageOps.contain(source, (width, height), method=resample)
    backing = Image.new("RGBA", (width, height), background)
    px = (width - contained.width) // 2
    py = (height - contained.height) // 2
    backing.alpha_composite(contained, (px, py))
    board.alpha_composite(backing, (x, y))


def panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], title: str) -> None:
    x, y, width, height = box
    draw.rectangle((x, y, x + width, y + height), fill="#1B1A20", outline="#3E3A3D", width=2)
    draw.rectangle((x + 1, y + 1, x + width - 1, y + 34), fill="#17151A")
    draw.text((x + 12, y + 11), title, fill="#E8E1D3", font=ImageFont.load_default())


def paste_pixel_crop(
    board: Image.Image,
    path: str,
    crop: tuple[int, int, int, int],
    xy: tuple[int, int],
    scale: int,
) -> None:
    image = load(path).crop(crop)
    image = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
    board.alpha_composite(image, xy)


def main() -> None:
    width, height = 1600, 1660
    board = Image.new("RGBA", (width, height), "#111116")
    draw = ImageDraw.Draw(board)
    font = ImageFont.load_default()

    draw.rectangle((0, 0, width, 92), fill="#17151A")
    draw.rectangle((0, 88, width, 92), fill="#9F3548")
    draw.text((34, 25), "ZHE YI SHEN / CANONICAL ART LANGUAGE", fill="#E8E1D3", font=font)
    draw.text(
        (34, 51),
        "LIFE ARCHIVE + LAST-LINE NIGHT / runtime assets are authoritative",
        fill="#AAA297",
        font=font,
    )

    panel(draw, (24, 112, 1552, 126), "SHARED PALETTE / one saturated accent per screen")
    swatch_width = 118
    for index, (name, color) in enumerate(PALETTE):
        x = 42 + index * 126
        draw.rectangle((x, 158, x + swatch_width, 198), fill=color, outline="#786F69")
        draw.text((x + 4, 204), name, fill="#AAA297", font=font)

    panel(draw, (24, 258, 744, 480), "LIFE ARCHIVE / title, origin record, combat hierarchy")
    screenshots = [
        "docs/readme/screenshot-title.png",
        "docs/readme/screenshot-origin.png",
        "docs/readme/screenshot-combat.png",
    ]
    for index, path in enumerate(screenshots):
        paste_fit(board, load(path), (42 + index * 238, 308, 220, 404), background="#111116")

    panel(draw, (792, 258, 784, 480), "HERO / approved 40x56 rig, fixed silhouette and integer pixels")
    hero = load("output/art-canonical-v1/approved/hero-style1-4dir.png")
    hero = hero.resize((hero.width * 4, hero.height * 4), Image.Resampling.NEAREST)
    board.alpha_composite(hero, (864, 336))
    draw.text((824, 590), "40x56 / pivot (20,49) / front-back-left-right", fill="#AAA297", font=font)
    draw.text((824, 616), "idle 2 / walk 4 / attack 2 / hurt 2", fill="#AAA297", font=font)
    draw.text((824, 654), "AI output is concept-only; runtime appearance remains modular", fill="#C6A44A", font=font)

    panel(draw, (24, 758, 1000, 344), "LAST-LINE NIGHT / actual 32x32 enemy atlases")
    enemies = [
        ("fear", "src/assets/enemies/fear.png"),
        ("red mark", "src/assets/enemies/red-mark.png"),
        ("empty chair", "src/assets/enemies/empty-chair.png"),
        ("lamp keeper", "src/assets/enemies/lamp-keeper.png"),
        ("last bus", "src/assets/enemies/last-bus.png"),
        ("silent father", "src/assets/enemies/silent-father.png"),
    ]
    for index, (name, path) in enumerate(enemies):
        col = index % 3
        row = index // 3
        x = 56 + col * 318
        y = 812 + row * 134
        paste_pixel_crop(board, path, (0, 0, 32, 32), (x, y), 3)
        paste_pixel_crop(board, path, (64, 32, 96, 64), (x + 108, y), 3)
        draw.text((x, y + 102), name, fill="#AAA297", font=font)

    panel(draw, (1048, 758, 528, 344), "ITEMS / 36x36, centered, worn everyday objects")
    item_atlas = load("src/assets/items/icons.png")
    selected = [0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19]
    for index, item_index in enumerate(selected):
        source_x = (item_index % 8) * 36
        source_y = (item_index // 8) * 36
        icon = item_atlas.crop((source_x, source_y, source_x + 36, source_y + 36))
        icon = icon.resize((72, 72), Image.Resampling.NEAREST)
        x = 1080 + (index % 4) * 116
        y = 814 + (index // 4) * 86
        board.alpha_composite(icon, (x, y))

    panel(draw, (24, 1122, 660, 510), "WORLD / bottom-center anchors, shared perspective")
    props = load("src/assets/world/props.png")
    board.alpha_composite(props, (52, 1172))
    sample_indices = [0, 3, 8, 11, 16, 23]
    for index, prop_index in enumerate(sample_indices):
        source_x = (prop_index % 4) * 40
        source_y = (prop_index // 4) * 44
        prop = props.crop((source_x, source_y, source_x + 40, source_y + 44))
        prop = prop.resize((120, 132), Image.Resampling.NEAREST)
        x = 248 + (index % 3) * 132
        y = 1172 + (index // 3) * 142
        board.alpha_composite(prop, (x, y))
    entities = load("src/assets/world/entities.png")
    entities = entities.resize((entities.width * 2, entities.height * 2), Image.Resampling.NEAREST)
    board.alpha_composite(entities, (52, 1462))

    panel(draw, (708, 1122, 868, 510), "VFX / exact-size readability before enlarged contact sheets")
    vfx = [
        ("projectiles 28", "src/assets/vfx/projectiles.png", 2),
        ("hits 32", "src/assets/vfx/hits.png", 1),
        ("status 12", "src/assets/vfx/status.png", 4),
        ("synergy 26", "src/assets/vfx/synergy.png", 2),
    ]
    cursor_y = 1176
    for name, path, scale in vfx:
        image = load(path)
        image = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
        board.alpha_composite(image, (742, cursor_y))
        draw.text((1280, cursor_y + 8), name, fill="#AAA297", font=font)
        cursor_y += max(image.height, 54) + 20

    OUT.parent.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
