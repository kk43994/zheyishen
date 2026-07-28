#!/usr/bin/env python3
"""Build a non-runtime 28px atlas from projectile-v5 Image2 candidates."""

from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

import process_vfx_ui_pack as pipeline  # noqa: E402

CANDIDATES = ROOT / "output/imagegen/zhe-yi-shen-vfx-ui-v1/candidates/projectile-v5"
PREVIEW_ROOT = ROOT / "output/imagegen/zhe-yi-shen-vfx-ui-v1/candidates/projectile-v5-preview"


def main() -> None:
    required = [
        "proj-breath.png", "proj-forms.png", "proj-special.png",
        "proj-readable-a.png", "proj-readable-b.png", "proj-readable-c.png",
        "proj-wood-slash-v2.png", "proj-anim-key.png", "proj-anim-marble.png",
        "proj-anim-slash.png",
    ]
    missing = [name for name in required if not (CANDIDATES / name).is_file()]
    if missing:
        raise FileNotFoundError(f"missing projectile-v5 candidates: {missing}")

    pipeline.RAW = CANDIDATES
    pipeline.ASSETS = PREVIEW_ROOT
    # The four v5 breath quadrants already are the approved animation frames.
    breath_animation = CANDIDATES / "proj-anim-breath.png"
    breath_animation.write_bytes((CANDIDATES / "proj-breath.png").read_bytes())
    if not pipeline.do_proj():
        raise RuntimeError("projectile-v5 candidate atlas build was skipped")
    if not pipeline.do_proj_anim():
        raise RuntimeError("projectile-v5 candidate animation atlas build was skipped")

    atlas_path = PREVIEW_ROOT / "vfx/projectiles.png"
    atlas = Image.open(atlas_path).convert("RGBA")
    enlarged = atlas.resize((atlas.width * 8, atlas.height * 8), Image.Resampling.NEAREST)
    background = Image.new("RGBA", enlarged.size, (23, 22, 26, 255))
    background.alpha_composite(enlarged)
    preview_path = PREVIEW_ROOT / "projectile-v5-atlas-8x.png"
    background.convert("RGB").save(preview_path, optimize=True)
    print(preview_path)

    animation_path = PREVIEW_ROOT / "vfx/projectile-anim.png"
    animation = Image.open(animation_path).convert("RGBA")
    animation_large = animation.resize((animation.width * 8, animation.height * 8), Image.Resampling.NEAREST)
    animation_background = Image.new("RGBA", animation_large.size, (23, 22, 26, 255))
    animation_background.alpha_composite(animation_large)
    animation_preview = PREVIEW_ROOT / "projectile-v5-anim-8x.png"
    animation_background.convert("RGB").save(animation_preview, optimize=True)
    print(animation_preview)


if __name__ == "__main__":
    main()
