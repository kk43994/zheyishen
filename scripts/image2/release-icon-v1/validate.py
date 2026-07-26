#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageStat


ROOT = Path(__file__).resolve().parents[3]
MANIFEST_PATH = ROOT / "output/imagegen/zhe-yi-shen-release-icon-v1/manifest.json"
FINAL_PATH = ROOT / "docs/promo/app-icon-300.png"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--final-only",
        action="store_true",
        help="validate the tracked upload icon without requiring local generation evidence",
    )
    args = parser.parse_args()

    final = FINAL_PATH
    if not args.final_only:
        if not MANIFEST_PATH.is_file():
            raise SystemExit(f"missing release icon manifest: {MANIFEST_PATH}")
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        source = ROOT / manifest["source"]
        final = ROOT / manifest["final"]
        prompt = ROOT / manifest["prompt"]
        for path in (source, final, prompt):
            if not path.is_file():
                raise SystemExit(f"missing release icon artifact: {path}")
        if sha256(source) != manifest["sourceSha256"]:
            raise SystemExit("release icon source hash drifted")
        if sha256(final) != manifest["finalSha256"]:
            raise SystemExit("release icon final hash drifted")
        if sha256(prompt) != manifest["promptSha256"]:
            raise SystemExit("release icon prompt hash drifted")
    elif not final.is_file():
        raise SystemExit(f"missing release upload icon: {final}")

    with Image.open(final) as opened:
        image = opened.convert("RGB")
    if image.size != (300, 300):
        raise SystemExit(f"release icon must be 300x300, got {image.size}")
    if final.stat().st_size > 1024 * 1024:
        raise SystemExit("release icon exceeds 1 MiB upload budget")
    grayscale = image.convert("L")
    extrema = grayscale.getextrema()
    if extrema[1] - extrema[0] < 80 or ImageStat.Stat(grayscale).stddev[0] < 22:
        raise SystemExit("release icon lacks enough small-size contrast")
    center = image.crop((90, 60, 210, 240))
    if ImageStat.Stat(center.convert("L")).stddev[0] < 24:
        raise SystemExit("release icon center lacks a readable subject silhouette")
    small = image.resize((48, 48), Image.Resampling.LANCZOS).convert("L")
    small_center_stddev = ImageStat.Stat(small.crop((15, 7, 33, 39))).stddev[0]
    if small_center_stddev < 20:
        raise SystemExit("release icon subject collapses at 48px")
    print(json.dumps({
        "valid": True,
        "size": list(image.size),
        "bytes": final.stat().st_size,
        "contrastRange": extrema[1] - extrema[0],
        "centerStdDev": round(ImageStat.Stat(center.convert("L")).stddev[0], 2),
        "smallCenterStdDev": round(small_center_stddev, 2),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
