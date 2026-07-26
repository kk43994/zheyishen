#!/usr/bin/env python3
"""Validate and record the Image2 sources promoted into enemy status VFX."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


RAW = Path("output/imagegen/zhe-yi-shen-vfx-ui-v1/raw")
JOBS = Path("scripts/image2/status-v2/jobs.jsonl")
PROVENANCE = Path("src/assets/vfx/status.sources.json")
SHEETS = ["status-marks", "status-materials"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def green_ratio(path: Path) -> float:
    image = Image.open(path).convert("RGB").resize((128, 128), Image.Resampling.NEAREST)
    keyed = sum(
        1 for red, green, blue in image.getdata()
        if green > 150 and green > red * 1.35 and green > blue * 1.35
    )
    return keyed / (128 * 128)


def main() -> None:
    job = json.loads(JOBS.read_text(encoding="utf-8").strip())
    if job.get("model") != "gpt-image-2" or len(job.get("images", [])) < 3:
        raise ValueError("status-materials must be a reference-aware gpt-image-2 edit")

    sources = {}
    for name in SHEETS:
        path = RAW / f"{name}.png"
        if not path.is_file():
            raise FileNotFoundError(f"missing Image2 status source: {path}")
        width, height = Image.open(path).size
        ratio = green_ratio(path)
        if width < 512 or height < 512 or ratio < 0.35:
            raise ValueError(f"invalid Image2 status source: {path} {width}x{height} greenRatio={ratio:.3f}")
        sources[str(path)] = {
            "sha256": sha256(path),
            "size": [width, height],
            "greenRatio": round(ratio, 4),
        }

    PROVENANCE.write_text(json.dumps({
        "pipeline": "Image2 reference edit -> chroma key -> crop -> 12px quantization",
        "sourceStatus": "image2-edit-recorded",
        "jobFile": str(JOBS),
        "sources": sources,
        "referenceJob": {
            "model": job["model"],
            "prompt": job["prompt_file"],
            "references": job["images"],
            "statuses": ["wet", "raw", "heavy", "control-fatigue"],
        },
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"status Image2 sources: {len(SHEETS)} sheets recorded in {PROVENANCE}")


if __name__ == "__main__":
    main()
