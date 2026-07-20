#!/usr/bin/env python3
"""用 image2 (gpt-image-2) 生成六章场景摆设的基底图（绿幕 2x2 格）。

静态资源混合管线第一步：生图模型出风格与形体，后续由
process_image2_props.py 负责抠像、切格、降采样与调色板量化。
密钥经环境变量 IMAGE2_API_KEY 传入，不落盘。
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
RAW_DIR = Path("output/imagegen/zhe-yi-shen-props-v1/raw")

STYLE = (
    "Pixel art sprite sheet for a dark fairytale roguelite game, 2x2 grid on solid pure green "
    "background (#00FF00). Four separate objects, each centered in its own quadrant, no overlap, "
    "no text, no grid lines. Muted dark palette: deep ink purple-grey shadows, worn wood browns, "
    "faded paper cream highlights{accent}. Chunky low-resolution pixel art style, crisp hard "
    "pixels, no anti-aliasing, no gradients, each object roughly 200x300 pixels, {mood}."
)

STAGES = {
    "stage0": {
        "accent": "",
        "mood": "melancholic bedtime mood",
        "objects": (
            "(1) an old wooden bed post with a carved round finial, "
            "(2) a small pile of wooden toy blocks, "
            "(3) a dropped toy tin wind-up mouse, "
            "(4) a folded paper boat"
        ),
    },
    "stage1": {
        "accent": ", desaturated slate blue accents",
        "mood": "oppressive classroom mood",
        "objects": (
            "(1) an old one-piece school desk with attached chair, "
            "(2) a leaning stack of exam papers with a red cross mark on top sheet, "
            "(3) a chalkboard eraser with two pieces of chalk, "
            "(4) a small dusty trophy with a cracked base"
        ),
    },
    "stage2": {
        "accent": ", tarnished brass and ochre accents",
        "mood": "late night train station mood",
        "objects": (
            "(1) a simple wooden station bench seen from the side, clear silhouette, "
            "(2) one single large upright brass gear with clean teeth, clear silhouette, "
            "(3) a leaning bus stop sign pole with timetable board, "
            "(4) an abandoned suitcase with a luggage tag"
        ),
    },
    "stage3": {
        "accent": ", faded household green accents",
        "mood": "quiet cramped rented home mood",
        "objects": (
            "(1) a small folding dining table with a thermos flask on top, "
            "(2) an old wooden clothes drying rack with one hanging shirt, "
            "(3) a rice cooker with a slightly open lid, "
            "(4) a stack of moving boxes tied with string"
        ),
    },
    "stage4": {
        "accent": ", cold fluorescent grey-blue accents",
        "mood": "overtime office at 2am mood",
        "objects": (
            "(1) an office desk with a dark turned-off monitor, "
            "(2) a grey filing cabinet with one drawer half open, "
            "(3) a water dispenser with a nearly empty bottle, "
            "(4) an office chair with a jacket left on the backrest"
        ),
    },
    "stage5": {
        "accent": ", pale grey and washed-out white accents",
        "mood": "hospital ward at dusk mood",
        "objects": (
            "(1) a hospital bed side rail section, "
            "(2) an IV drip stand with a half empty bag, "
            "(3) an old high-back armchair with a folded blanket, "
            "(4) a bedside cabinet with a single cup on top"
        ),
    },
    "world": {
        "accent": ", one warm lamplight gold accent and one cold moonlight blue accent",
        "mood": "threshold between two rooms of one life mood",
        "objects": (
            "(1) an old wooden door standing alone slightly ajar, warm golden lamplight "
            "spilling through the gap, clear front silhouette, "
            "(2) a darker heavier wooden door standing alone slightly ajar, only cold "
            "blue-grey darkness inside the gap, clear front silhouette, "
            "(3) a tiny night market pawnshop stall with a cloth awning and one hanging "
            "dim lantern, front view, no signboard, no lettering, "
            "(4) an old cast iron street lamp post glowing with a small warm halo, full pole visible"
        ),
    },
}


def generate(name: str, spec: dict, api_key: str) -> None:
    prompt = f"{STYLE.format(accent=spec['accent'], mood=spec['mood'])} Objects: {spec['objects']}."
    body = json.dumps({"model": MODEL, "prompt": prompt, "size": "1024x1024", "n": 1}).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        payload = json.load(response)
    image = base64.b64decode(payload["data"][0]["b64_json"])
    (RAW_DIR / f"{name}.png").write_bytes(image)
    print(f"{name}: {len(image)} bytes")


def main() -> None:
    api_key = os.environ.get("IMAGE2_API_KEY", "")
    if not api_key:
        sys.exit("IMAGE2_API_KEY not set")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    only = sys.argv[1:]
    for name, spec in STAGES.items():
        if only and name not in only:
            continue
        if (RAW_DIR / f"{name}.png").exists() and not only:
            print(f"{name}: exists, skip")
            continue
        generate(name, spec, api_key)


if __name__ == "__main__":
    main()
