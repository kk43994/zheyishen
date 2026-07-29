#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
PROMPT = ROOT / "scripts/image2/release-icon-v1/prompt.txt"
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-release-icon-v1"
FINAL = ROOT / "docs/promo/app-icon-300.png"
REVIEW = OUT_DIR / "app-icon-review-4x.png"
SMALL_REVIEW = OUT_DIR / "app-icon-48-review-10x.png"
MANIFEST = OUT_DIR / "manifest.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="output/imagegen/zhe-yi-shen-release-icon-v1/raw/release-icon-v1.png")
    parser.add_argument(
        "--logical-size",
        type=int,
        default=0,
        help="collapse pixel art to this logical square size before nearest-neighbor export",
    )
    parser.add_argument(
        "--colors",
        type=int,
        default=0,
        help="maximum flat palette size for pixel-art export",
    )
    args = parser.parse_args()
    source = ROOT / args.source
    if not source.is_file():
        raise SystemExit(f"missing source: {source}")

    with Image.open(source) as opened:
        image = opened.convert("RGB")
    if image.width != image.height or image.width < 1024:
        raise SystemExit(f"expected a square source at least 1024px wide, got {image.size}")

    logical = image
    if args.logical_size > 0:
        logical = image.resize((args.logical_size, args.logical_size), Image.Resampling.NEAREST)
    if args.colors > 0:
        logical = logical.quantize(
            colors=args.colors,
            method=Image.Quantize.MEDIANCUT,
            dither=Image.Dither.NONE,
        ).convert("RGB")
    final = logical.resize((300, 300), Image.Resampling.NEAREST)
    FINAL.parent.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    final.save(FINAL, optimize=True)
    final.resize((1200, 1200), Image.Resampling.NEAREST).save(REVIEW, optimize=True)
    small = final.resize((48, 48), Image.Resampling.LANCZOS)
    small.resize((480, 480), Image.Resampling.NEAREST).save(SMALL_REVIEW, optimize=True)

    manifest = {
        "schemaVersion": 1,
        "model": "gpt-image-2",
        "source": str(source.relative_to(ROOT)),
        "sourceSha256": sha256(source),
        "sourceSize": list(image.size),
        "logicalSize": list(logical.size),
        "paletteColors": args.colors or None,
        "prompt": str(PROMPT.relative_to(ROOT)),
        "promptSha256": sha256(PROMPT),
        "final": str(FINAL.relative_to(ROOT)),
        "finalSha256": sha256(FINAL),
        "size": [300, 300],
        "review": str(REVIEW.relative_to(ROOT)),
        "smallSizeReview": str(SMALL_REVIEW.relative_to(ROOT)),
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
