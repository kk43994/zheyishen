#!/usr/bin/env python3
"""Prepare local references for the server-shutdown trigger-only Image2 pass."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
INPUT = ROOT / "input"
HERO_ROWS = (1120, 1232, 1176, 1288)


def save_copy(source: Path, target: Path) -> None:
    Image.open(source).save(target, optimize=True)


def main() -> None:
    INPUT.mkdir(parents=True, exist_ok=True)
    save_copy(
        Path("scripts/image2/art-loop-v1/60-momo-avatar/input/04-canonical-style-board.png"),
        INPUT / "01-canonical-style-board.png",
    )

    atlas = Image.open("src/assets/hero-style1-profiles/hero-idle.png").convert("RGBA")
    heroes = Image.new("RGBA", (160, 56), (21, 20, 26, 255))
    for index, row in enumerate(HERO_ROWS):
        heroes.alpha_composite(atlas.crop((0, row, 40, row + 56)), (index * 40, 0))
    heroes.save(INPUT / "02-approved-hero-ground-anchors.png", optimize=True)

    save_copy(
        Path("docs/item-equipment-v1/items/71-server-shutdown.png"),
        INPUT / "03-current-failed-permanent-devices.png",
    )
    saves = Image.open("src/assets/vfx/saves.png").convert("RGBA")
    shutdown = saves.crop((0, 80, 160, 120)).resize((640, 160), Image.Resampling.NEAREST)
    shutdown.save(INPUT / "04-current-failed-fullscreen-shutdown.png", optimize=True)
    save_copy(
        Path("output/imagegen/zhe-yi-shen-items-image2-v1/raw/71-server-shutdown.png"),
        INPUT / "05-rejected-paper-source.png",
    )


if __name__ == "__main__":
    main()
