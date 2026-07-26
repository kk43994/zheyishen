#!/usr/bin/env python3
"""Validate and record the Image2 sources promoted into projectile VFX."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


RAW = Path("output/imagegen/zhe-yi-shen-vfx-ui-v1/raw")
JOBS = Path("scripts/image2/projectile-v3/jobs.jsonl")
DESIGN_CONTRACT = Path("src/projectile-item-signatures.ts")
PROVENANCE = Path("src/assets/vfx/projectiles.sources.json")
LEGACY_SHEETS = ["proj-breath", "proj-forms", "proj-special"]
NEW_FORMS = {
    "proj-readable-a": ["razor", "marble", "ice"],
    "proj-readable-b": ["serial", "typing", "button", "link"],
    "proj-readable-c": ["stamp", "stone", "lens", "laugh"],
    "proj-wood-slash-v2": ["slash"],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def green_ratio(path: Path) -> float:
    image = Image.open(path).convert("RGB").resize((128, 128), Image.Resampling.NEAREST)
    green = sum(1 for red, channel, blue in image.getdata() if channel > 150 and channel > red * 1.35 and channel > blue * 1.35)
    return green / (128 * 128)


def read_jobs() -> dict[str, dict]:
    jobs = {}
    for line in JOBS.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        job = json.loads(line)
        jobs[Path(job["out"]).stem] = job
    return jobs


def main() -> None:
    jobs = read_jobs()
    expected = [*LEGACY_SHEETS, *NEW_FORMS]
    sources = {}
    for name in expected:
        path = RAW / f"{name}.png"
        if not path.is_file():
            raise FileNotFoundError(f"missing Image2 projectile source: {path}")
        width, height = Image.open(path).size
        if width < 512 or height < 512:
            raise ValueError(f"Image2 source is too small: {path} {width}x{height}")
        ratio = green_ratio(path)
        if ratio < 0.35:
            raise ValueError(f"Image2 source lacks chroma-key separation: {path} greenRatio={ratio:.3f}")
        sources[str(path)] = {
            "sha256": sha256(path),
            "size": [width, height],
            "greenRatio": round(ratio, 4),
        }

    reference_jobs = {}
    for sheet in NEW_FORMS:
        job = jobs.get(sheet)
        if not job:
            raise ValueError(f"missing reference-aware Image2 job for {sheet}")
        if len(job.get("images", [])) < 3:
            raise ValueError(f"{sheet} must include style, family and semantic references")
        reference_jobs[sheet] = {
            "model": job["model"],
            "prompt": job["prompt_file"],
            "references": job["images"],
            "forms": NEW_FORMS[sheet],
        }

    PROVENANCE.parent.mkdir(parents=True, exist_ok=True)
    PROVENANCE.write_text(json.dumps({
        "pipeline": "Image2 reference edit -> chroma key -> crop -> 28px quantization",
        "sourceStatus": "image2-edit-recorded",
        "designContract": str(DESIGN_CONTRACT),
        "jobFile": str(JOBS),
        "sources": sources,
        "referenceJobs": reference_jobs,
        "selections": {
            "slash": {
                "sheet": "proj-wood-slash-v2",
                "quadrant": 1,
                "reason": "runtime-scale review kept the 3:1 horizontal blunt slash; rejected taller blobs, detached streaks and green-fringed variants",
            },
        },
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"projectile Image2 sources: {len(expected)} sheets recorded in {PROVENANCE}")


if __name__ == "__main__":
    main()
