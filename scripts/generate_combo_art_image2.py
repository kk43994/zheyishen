#!/usr/bin/env python3
"""用 image2 生成 11 个组合彩蛋的奥义插画基底（绿幕 2x2，横幅小场景）。

由 process_combo_art.py 切格规整成 src/assets/ui/combo-art.png。
"""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("IMAGE2_BASE_URL", "https://api.gbgjxj.store/v1")
MODEL = "gpt-image-2"
RAW_DIR = Path("output/imagegen/zhe-yi-shen-combo-art-v1/raw")

STYLE = (
    "Pixel art illustration sheet for a dark fairytale roguelite game, strict 2x2 grid on solid "
    "pure green background (#00FF00). Each quadrant contains one complete wide cinematic vignette "
    "scene in roughly 16:9 framing, fully separated from the others by green gutters. No text, no "
    "letters, no numbers. Chunky low-resolution pixel art, crisp hard pixels, no anti-aliasing, "
    "muted melancholic palette: deep ink purple-grey, worn browns, faded cream, restrained dull "
    "red and cold blue accents, one warm lamplight accent allowed. Emotional, quiet, restrained "
    "dark fairytale mood — sad everyday Chinese life turned into legend, never gory, never heroic."
)

# (combo key, 场景描述) —— 顺序即图集顺序
SCENES: list[tuple[str, str]] = [
    ("rain-letter",
     "heavy night rain on an empty street, a soaked folded love letter lying on the wet ground, "
     "ink bleeding into the puddle, a yellow raincoat figure walking away in the distance"),
    ("for-your-own-good",
     "a small child bent under an enormous schoolbag overflowing with grey stones, a huge looming "
     "wall clock behind, adult hands pressing down on the bag from above"),
    ("returned-letter",
     "a folded letter flying back through dark air toward the viewer, covered in harsh red "
     "correction cross marks, trailing torn paper scraps"),
    ("thought-he-was-cool",
     "rain washing bright yellow hair dye out of a teenage boy's hair seen from behind, yellow "
     "streaks running down his neck and school jacket into a drain"),
    ("cry-for-help-as-style",
     "a school desk at night with a small pink razor and a single pill on it, surrounded by "
     "floating glowing heart and thumbs-up icons that cast no warmth"),
    ("someone-answered",
     "an old mobile phone lying in darkness suddenly glowing warm, the light reaching a hand "
     "stretched toward it, two a.m. bedroom shadows around"),
    ("became-him",
     "a man in a worn yellow raincoat crouching in heavy rain, sheltering a small child silhouette "
     "under the coat, both lit by one street lamp"),
    ("when-everyone-is-free",
     "a dinner table set for many, one framed group photo standing on it with figures fading into "
     "blankness, one empty photo frame beside it, cold dust light"),
    ("this-weight-is-nothing",
     "a man bent almost horizontal carrying a mountain-sized bundle of stones on his cracked "
     "spine, still taking one step forward against wind"),
    ("bend-and-stretch",
     "a man in shirt and necktie bowing extremely deeply in an office corridor, his work badge "
     "swinging, a huge red ink stroke crossing the air above him"),
    ("stood-the-same-way",
     "two silhouettes seen from behind standing in rain under one umbrella of lamplight, an old "
     "bent father and a grown son bent exactly the same way, rain inheriting their shape"),
    ("seen-only-when-useful",
     "a tired office man at a desk visible only inside one harsh cone of spotlight, his body "
     "fading to transparency outside the light edge, dark empty office around, his necktie and "
     "work badge the only crisp details"),
]

BATCH = 4


def generate(index: int, batch: list[tuple[str, str]], api_key: str) -> None:
    quads = ". ".join(
        f"Quadrant {slot + 1}: {desc}" for slot, (_, desc) in enumerate(batch)
    )
    if len(batch) < BATCH:
        quads += f". Remaining quadrants: plain solid pure green (#00FF00), completely empty"
    body = json.dumps({"model": MODEL, "prompt": f"{STYLE}\n\n{quads}.", "size": "1024x1024", "n": 1}).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=240) as response:
        payload = json.load(response)
    image = base64.b64decode(payload["data"][0]["b64_json"])
    (RAW_DIR / f"sheet{index:02d}.png").write_bytes(image)
    print(f"sheet{index:02d} ({', '.join(key for key, _ in batch)}): {len(image)} bytes", flush=True)


def main() -> None:
    api_key = os.environ.get("IMAGE2_API_KEY", "")
    if not api_key:
        sys.exit("IMAGE2_API_KEY not set")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / "order.json").write_text(json.dumps([key for key, _ in SCENES], indent=2), encoding="utf-8")
    only = {int(a) for a in sys.argv[1:]}
    batches = [SCENES[i:i + BATCH] for i in range(0, len(SCENES), BATCH)]
    for index, batch in enumerate(batches):
        if only and index not in only:
            continue
        if not only and (RAW_DIR / f"sheet{index:02d}.png").exists():
            print(f"sheet{index:02d}: exists, skip", flush=True)
            continue
        generate(index, batch, api_key)


if __name__ == "__main__":
    main()
