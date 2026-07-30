#!/usr/bin/env python3
"""Lock every live lamp-keeper touchpoint to the canonical HD runtime atlas.

The old dedicated skill sheet drifted into a purple hooded figure.  The
canonical identity is the wide-brim hat, worn long coat, shadowed face and
hand lantern already used by ``lamp-keeper-hd.png``.  This script derives the
runtime skill fallbacks, the two identity-sensitive 8-frame strips, the legacy
half-size atlas and the wiki portrait from that single source.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ENEMY_DIR = ROOT / "src/assets/enemies"
SOURCE = ENEMY_DIR / "lamp-keeper-hd.png"
LOW_RES = ENEMY_DIR / "lamp-keeper.png"
SKILL_V1 = ENEMY_DIR / "boss-skills-v1/lamp-keeper-skills.png"
SKILL_V2_DIR = ENEMY_DIR / "boss-skills-v2"
V2_MANIFEST = SKILL_V2_DIR / "manifest.json"
PORTRAIT = ROOT / "docs/enemy-portraits-v1/lamp-keeper.png"

FRAME = 64
CLEAR = (0, 0, 0, 0)


def source_frame(atlas: Image.Image, motion_row: int, frame: int) -> Image.Image:
    return atlas.crop((
        frame * FRAME,
        motion_row * FRAME,
        (frame + 1) * FRAME,
        (motion_row + 1) * FRAME,
    ))


def compose(frames: list[Image.Image], columns: int, rows: int = 1) -> Image.Image:
    if len(frames) != columns * rows:
        raise AssertionError(f"expected {columns * rows} frames, got {len(frames)}")
    atlas = Image.new("RGBA", (FRAME * columns, FRAME * rows), CLEAR)
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, ((index % columns) * FRAME, (index // columns) * FRAME))
    return atlas


def preview(strip: Image.Image) -> Image.Image:
    background = Image.new("RGBA", strip.size, (12, 12, 16, 255))
    background.alpha_composite(strip)
    return background.resize((strip.width * 4, strip.height * 4), Image.Resampling.NEAREST)


def expected_assets() -> dict[Path, Image.Image]:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (FRAME * 4, FRAME * 5):
        raise AssertionError(f"unexpected canonical lamp-keeper atlas size: {source.size}")

    idle = [source_frame(source, 0, index) for index in range(2)]
    move = [source_frame(source, 1, index) for index in range(4)]
    attack = [source_frame(source, 2, index) for index in range(2)]
    death = [source_frame(source, 4, index) for index in range(4)]
    for label, frames in {
        "idle": idle,
        "move": move,
        "attack": attack,
        "death": death,
    }.items():
        for index, frame in enumerate(frames):
            if frame.getchannel("A").getbbox() is None:
                raise AssertionError(f"empty canonical frame: {label}/{index}")

    # v1 remains the guaranteed runtime fallback.  Each row keeps the same
    # four-beat contract while using only canonical source poses.
    v1 = compose([
        idle[0], attack[0], attack[1], idle[1],      # 灯来找你
        attack[0], attack[1], move[2], idle[0],      # 收灯（8f 未就绪时）
        death[0], death[1], death[2], death[3],      # 吹灯
    ], columns=4, rows=3)

    name_8f = compose([
        idle[0], idle[1], attack[0], attack[1],
        attack[1], attack[0], idle[1], idle[0],
    ], columns=8)
    dim_8f = compose([
        death[0], death[0], death[1], death[1],
        death[2], death[2], death[3], death[3],
    ], columns=8)

    return {
        LOW_RES: source.resize((128, 160), Image.Resampling.NEAREST),
        SKILL_V1: v1,
        SKILL_V2_DIR / "keeper-name-8f.png": name_8f,
        SKILL_V2_DIR / "keeper-dim-8f.png": dim_8f,
        SKILL_V2_DIR / "preview-keeper-name.png": preview(name_8f),
        SKILL_V2_DIR / "preview-keeper-dim.png": preview(dim_8f),
        PORTRAIT: idle[0],
    }


def same_pixels(left: Image.Image, right: Image.Image) -> bool:
    return left.mode == right.mode and left.size == right.size and left.tobytes() == right.tobytes()


def update_manifest(write: bool) -> None:
    manifest = json.loads(V2_MANIFEST.read_text(encoding="utf-8"))
    canonical = {
        "keeper-name": {
            "atlas": "keeper-name-8f.png",
            "frame": 64,
            "frames": 8,
            "display": 160,
            "loop": False,
            "sourceSheets": ["lamp-keeper-hd.png"],
            "sourceMode": "canonical-runtime-atlas",
        },
        "keeper-dim": {
            "atlas": "keeper-dim-8f.png",
            "frame": 64,
            "frames": 8,
            "display": 160,
            "loop": False,
            "sourceSheets": ["lamp-keeper-hd.png"],
            "sourceMode": "canonical-runtime-atlas",
        },
    }
    if write:
        manifest["skills"].update(canonical)
        V2_MANIFEST.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return
    for skill_id, expected in canonical.items():
        if manifest.get("skills", {}).get(skill_id) != expected:
            raise AssertionError(f"lamp-keeper v2 manifest drift: {skill_id}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify without writing")
    args = parser.parse_args()

    assets = expected_assets()
    if args.check:
        for path, expected in assets.items():
            if not path.exists():
                raise AssertionError(f"missing lamp-keeper identity asset: {path}")
            actual = Image.open(path).convert("RGBA")
            if not same_pixels(actual, expected):
                raise AssertionError(f"lamp-keeper identity drift: {path}")
        update_manifest(write=False)
        print(f"lamp-keeper identity locked across {len(assets)} derived assets")
        return

    for path, image in assets.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, format="PNG", optimize=True)
    update_manifest(write=True)
    print(f"rebuilt {len(assets)} lamp-keeper identity assets from {SOURCE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
