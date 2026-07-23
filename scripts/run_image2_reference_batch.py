#!/usr/bin/env python3
"""Run Image2 edit jobs while requiring real local reference images."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


MAX_IMAGE_BYTES = 50 * 1024 * 1024
CANONICAL_STYLE_BOARD = Path("output/art-style-reference-v1/canonical-style-board.png")
ALLOWED_FIELDS = {
    "name",
    "images",
    "prompt_file",
    "out",
    "model",
    "size",
    "quality",
    "background",
    "output_format",
}


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--jobs", type=Path, required=True)
    result.add_argument("--root", type=Path, default=Path.cwd())
    result.add_argument("--image-gen", type=Path, required=True)
    result.add_argument("--python", default=sys.executable)
    result.add_argument("--out-dir", type=Path, required=True)
    result.add_argument("--only")
    result.add_argument("--max-attempts", type=int, default=2)
    result.add_argument("--dry-run", action="store_true")
    return result


def resolve(root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else root / path


def read_jobs(path: Path) -> list[dict[str, object]]:
    jobs: list[dict[str, object]] = []
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"line {line_number}: job must be an object")
        unknown = set(value) - ALLOWED_FIELDS
        if unknown:
            raise ValueError(f"line {line_number}: unsupported fields {sorted(unknown)}")
        jobs.append(value)
    if not jobs:
        raise ValueError("jobs file is empty")
    return jobs


def validate_job(job: dict[str, object], root: Path, index: int) -> tuple[list[Path], Path, str]:
    label = str(job.get("name") or f"job-{index + 1}")
    images_value = job.get("images")
    if not isinstance(images_value, list) or len(images_value) < 2:
        raise ValueError(
            f"{label}: images must start with the canonical style board and include a family reference"
        )
    if not all(isinstance(value, str) and value for value in images_value):
        raise ValueError(f"{label}: every image path must be a non-empty string")
    images = [resolve(root, value) for value in images_value]
    canonical = (root / CANONICAL_STYLE_BOARD).resolve()
    if images[0].resolve() != canonical:
        raise ValueError(
            f"{label}: first image must be {CANONICAL_STYLE_BOARD}; got {images[0]}"
        )
    for image in images:
        if not image.is_file():
            raise FileNotFoundError(f"{label}: missing reference image {image}")
        if image.stat().st_size > MAX_IMAGE_BYTES:
            raise ValueError(f"{label}: reference exceeds 50 MB: {image}")

    prompt_value = job.get("prompt_file")
    if not isinstance(prompt_value, str) or not prompt_value:
        raise ValueError(f"{label}: prompt_file is required")
    prompt = resolve(root, prompt_value)
    if not prompt.is_file() or not prompt.read_text(encoding="utf-8").strip():
        raise ValueError(f"{label}: prompt file is missing or empty: {prompt}")

    out_value = job.get("out")
    if not isinstance(out_value, str) or not out_value:
        raise ValueError(f"{label}: out is required")
    output_name = Path(out_value).name
    if output_name != out_value or not output_name.lower().endswith(".png"):
        raise ValueError(f"{label}: out must be a plain PNG filename")
    return images, prompt, output_name


def command_for(
    job: dict[str, object],
    images: list[Path],
    prompt: Path,
    output: Path,
    image_gen: Path,
    python: str,
) -> list[str]:
    command = [python, str(image_gen), "edit"]
    command.extend(["--model", str(job.get("model", "gpt-image-2"))])
    for image in images:
        command.extend(["--image", str(image)])
    command.extend([
        "--prompt-file",
        str(prompt),
        "--size",
        str(job.get("size", "1024x1024")),
        "--quality",
        str(job.get("quality", "medium")),
        "--background",
        str(job.get("background", "opaque")),
        "--output-format",
        str(job.get("output_format", "png")),
        "--out",
        str(output),
        "--force",
        "--no-augment",
    ])
    return command


def main() -> None:
    args = parser().parse_args()
    root = args.root.resolve()
    image_gen = args.image_gen.resolve()
    if not image_gen.is_file():
        raise FileNotFoundError(image_gen)
    jobs = read_jobs(args.jobs.resolve())
    if args.only:
        jobs = [job for job in jobs if str(job.get("name")) == args.only]
        if not jobs:
            raise ValueError(f"no job named {args.only!r}")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    if not args.dry_run and not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    for index, job in enumerate(jobs):
        images, prompt, output_name = validate_job(job, root, index)
        output = args.out_dir.resolve() / output_name
        command = command_for(job, images, prompt, output, image_gen, args.python)
        label = str(job.get("name") or f"job-{index + 1}")
        if args.dry_run:
            print(json.dumps({
                "name": label,
                "referenceCount": len(images),
                "prompt": str(prompt),
                "output": str(output),
                "size": str(job.get("size", "1024x1024")),
            }))
            continue
        for attempt in range(1, args.max_attempts + 1):
            try:
                subprocess.run(command, check=True)
                break
            except subprocess.CalledProcessError:
                if attempt == args.max_attempts:
                    raise
                print(f"{label}: attempt {attempt} failed, retrying", file=sys.stderr)


if __name__ == "__main__":
    main()
