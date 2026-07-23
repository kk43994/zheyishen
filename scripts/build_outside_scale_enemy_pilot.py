#!/usr/bin/env python3
"""Build a stable 32px enemy atlas from one fixed ruler-creature rig."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/imagegen/zhe-yi-shen-reference-pilot-v2/processed"
FRAME = 32

NIGHT = "#111116"
INK = "#17151A"
INK_SOFT = "#3E3A3D"
PAPER = "#D8D0C1"
PAPER_DIM = "#AAA297"
PAPER_SHADOW = "#786F69"
OLD_RED = "#9F3548"
OLD_RED_DARK = "#642231"
METAL = "#71818A"
METAL_DARK = "#38434A"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def segment(draw: ImageDraw.ImageDraw, x: int, y: int, *, head: bool = False, crack: bool = False) -> None:
    draw.rectangle((x, y + 1, x + 6, y + 6), fill=INK)
    draw.rectangle((x + 1, y, x + 5, y + 7), fill=INK)
    draw.rectangle((x + 1, y + 1, x + 5, y + 5), fill=PAPER_DIM)
    draw.line((x + 1, y + 1, x + 4, y + 1), fill=PAPER)
    draw.line((x + 2, y + 5, x + 5, y + 5), fill=PAPER_SHADOW)
    draw.point((x + 2, y + 2), fill=INK_SOFT)
    draw.line((x + 4, y + 1, x + 4, y + 2), fill=INK_SOFT)
    if crack:
        draw.line((x + 3, y + 2, x + 2, y + 4), fill=OLD_RED_DARK)
        draw.point((x + 4, y + 4), fill=OLD_RED)
    if head:
        draw.point((x + 2, y + 3), fill=OLD_RED)
        draw.point((x + 4, y + 3), fill=OLD_RED)
        draw.point((x + 3, y + 4), fill=OLD_RED_DARK)


def leg(draw: ImageDraw.ImageDraw, x: int, y: int, phase: int) -> None:
    direction = -1 if phase < 0 else 1
    draw.point((x, y), fill=INK)
    draw.point((x + direction, y + 1), fill=METAL_DARK)
    draw.point((x + direction * 2, y + 2), fill=METAL)
    draw.point((x + direction * 2, y + 3), fill=INK)


def body_frame(
    *,
    bob: int = 0,
    leg_phases: tuple[int, int, int, int] = (-1, 1, -1, 1),
    compressed: int = 0,
    attack: bool = False,
    hurt: bool = False,
    crack: bool = False,
) -> Image.Image:
    image = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    x_positions = (6 + compressed, 12, 18 - compressed)
    y_positions = (13 + bob, 12 + bob, 13 + bob)
    for index, (x, y) in enumerate(zip(x_positions, y_positions)):
        segment(draw, x, y, head=index == 2, crack=crack and index == 1)
    joints = (8 + compressed, 13, 19 - compressed, 23 - compressed)
    for index, x in enumerate(joints):
        leg(draw, x, 19 + bob, leg_phases[index])
    draw.line((11, 15 + bob, 12, 15 + bob), fill=METAL_DARK)
    draw.line((17, 15 + bob, 18, 15 + bob), fill=METAL_DARK)
    if attack:
        draw.line((24 - compressed, 16 + bob, 29, 16 + bob), fill=INK)
        draw.line((25 - compressed, 15 + bob, 30, 15 + bob), fill=METAL)
        draw.point((30, 15 + bob), fill=PAPER)
    if hurt:
        for x, y in ((7, 14 + bob), (13, 13 + bob), (19, 14 + bob), (23, 16 + bob)):
            draw.point((x, y), fill=OLD_RED)
    return image


def death_frame(index: int) -> Image.Image:
    if index == 0:
        return body_frame(crack=True)
    image = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if index == 1:
        for x, y, head in ((5, 13, False), (13, 11, False), (21, 14, True)):
            segment(draw, x, y, head=head, crack=True)
        draw.point((11, 22), fill=METAL)
        draw.point((19, 23), fill=METAL_DARK)
        draw.point((26, 21), fill=OLD_RED)
    elif index == 2:
        for x, y, head in ((4, 16, False), (14, 12, False), (23, 17, True)):
            draw.rectangle((x, y, x + 4, y + 3), fill=INK)
            draw.rectangle((x + 1, y, x + 3, y + 2), fill=PAPER_DIM)
            if head:
                draw.point((x + 2, y + 1), fill=OLD_RED)
        for x, y, color in ((10, 23, OLD_RED), (18, 24, METAL), (28, 22, INK_SOFT)):
            draw.point((x, y), fill=color)
    else:
        for x, y, color in (
            (8, 22, PAPER_SHADOW),
            (12, 23, OLD_RED_DARK),
            (17, 21, PAPER_DIM),
            (21, 24, METAL_DARK),
            (25, 22, OLD_RED),
        ):
            draw.point((x, y), fill=color)
    return image


def build_frames() -> list[list[Image.Image]]:
    idle_a = body_frame()
    idle_b = body_frame(bob=-1, leg_phases=(1, -1, 1, -1))
    move = [
        body_frame(bob=0, leg_phases=(-1, 1, -1, 1)),
        body_frame(bob=-1, leg_phases=(1, 1, -1, -1)),
        body_frame(bob=0, leg_phases=(1, -1, 1, -1)),
        body_frame(bob=-1, leg_phases=(-1, -1, 1, 1)),
    ]
    attack_a = body_frame(compressed=1, leg_phases=(1, -1, 1, -1))
    attack_b = body_frame(attack=True, leg_phases=(-1, 1, -1, 1))
    hurt_a = body_frame(compressed=1, hurt=True)
    hurt_b = body_frame(bob=-1, compressed=1, hurt=True, leg_phases=(1, -1, 1, -1))
    return [
        [idle_a, idle_b, idle_a.copy(), idle_b.copy()],
        move,
        [attack_a, attack_b, attack_a.copy(), attack_b.copy()],
        [hurt_a, hurt_b, hurt_a.copy(), hurt_b.copy()],
        [death_frame(index) for index in range(4)],
    ]


def make_preview(atlas: Image.Image) -> None:
    contact = atlas.resize((768, 960), Image.Resampling.NEAREST)
    background = Image.new("RGBA", contact.size, (17, 17, 22, 255))
    background.alpha_composite(contact)
    background.convert("RGB").save(OUT / "outside-the-scale-rig-contact-6x.png", optimize=True)

    logical = Image.new("RGBA", (360, 200), NIGHT)
    ground = Image.open(ROOT / "src/assets/world/ground-1.png").convert("RGBA")
    for y in range(0, logical.height, ground.height):
        for x in range(0, logical.width, ground.width):
            logical.alpha_composite(ground, (x, y))
    hero = Image.open(ROOT / "output/art-canonical-v1/approved/hero-style1-4dir.png").convert("RGBA")
    logical.alpha_composite(hero.crop((0, 0, 40, 56)), (155, 100))
    red_mark = Image.open(ROOT / "src/assets/enemies/red-mark.png").convert("RGBA")
    logical.alpha_composite(red_mark.crop((0, 0, 32, 32)), (72, 120))
    logical.alpha_composite(atlas.crop((0, 0, 32, 32)), (246, 120))
    logical.resize((1080, 600), Image.Resampling.NEAREST).convert("RGB").save(
        OUT / "outside-the-scale-rig-combat-preview-3x.png", optimize=True,
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    frames = build_frames()
    atlas = Image.new("RGBA", (128, 160), (0, 0, 0, 0))
    for row, motion in enumerate(frames):
        for column, frame in enumerate(motion):
            atlas.alpha_composite(frame, (column * FRAME, row * FRAME))
    atlas_path = OUT / "outside-the-scale-rig-atlas.png"
    atlas.save(atlas_path, optimize=True)
    make_preview(atlas)
    opaque = [pixel for pixel in atlas.getdata() if pixel[3]]
    manifest = {
        "runtimePromoted": False,
        "status": "needs_visual_review",
        "sourceConcept": "outside-the-scale-enemy-v2.png",
        "method": "fixed integer-pixel rig derived from one concept",
        "atlas": [128, 160],
        "cell": [32, 32],
        "motionRows": ["idle", "move", "attack", "hurt", "death"],
        "motionFrames": [2, 4, 2, 2, 4],
        "facing": "right; runtime mirrors horizontally",
        "palette": sorted({pixel[:3] for pixel in opaque}),
        "transparentRgbZero": all(pixel[:3] == (0, 0, 0) for pixel in atlas.getdata() if pixel[3] == 0),
        "sha256": sha256(atlas_path),
    }
    (OUT / "outside-the-scale-rig-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8",
    )
    print(atlas_path)


if __name__ == "__main__":
    main()
