#!/usr/bin/env python3
"""Generate the blank red-ink archive button frame source with Image2."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-red-stamp-buttons-v1"
RAW_PATH = OUT_DIR / "red-stamp-button-raw.png"
BASE_URL = os.environ.get("IMAGE2_BASE_URL", "https://cpa.kk666.best/v1").rstrip("/")
MODEL = os.environ.get("IMAGE2_MODEL", "gpt-image-2")

PROMPT = """Use case: game-ui-asset
Asset type: one blank horizontal Chinese archive red-ink stamp frame for a game command button
View: perfectly front-facing flat 2D, centered, no perspective, no rotation
Canvas: landscape 1536x1024 with one single frame occupying most of the width and about one quarter of the height; pure flat warm off-white paper background (#E7DFD0) everywhere outside and inside the frame

Frame design: an elongated 4:1 rectangular official-record stamp made from old vermilion ink. Two nested thin rectangular ink borders with very slightly uneven pressure, square corners with tiny chipped interruptions, several sparse missing-ink flecks, and two short registration ticks near opposite corners. It should feel repeatedly hand-stamped on a life archive, restrained and serious rather than festive. The center must stay completely blank for runtime text. The frame must be horizontally symmetric enough to stretch as a UI button, but the wear pattern should be natural and asymmetrical.

Style: hard-edged high-resolution pixel-art source with medium-fine pixels, limited colors, no anti-aliasing, no soft glow, no gradients, no drop shadow, no bevel, no 3D wax seal, no metallic border. Ink colors only muted old red, dark dried crimson and a few pale paper holes.

Hard constraints: exactly one blank frame, no words, no letters, no numbers, no symbols, no icons, no logo, no watermark, no other panels, no mockup, no hands, no stationery objects, no rounded capsule, no blue, cyan, purple, orange or gold. Do not fill the center with red. Do not make a four-state sheet; render one clean master frame only."""


def main() -> None:
    api_key = os.environ.get("IMAGE2_API_KEY", "")
    if not api_key:
        sys.exit("IMAGE2_API_KEY not set")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "prompt.txt").write_text(PROMPT + "\n", encoding="utf-8")
    if RAW_PATH.exists() and "--force" not in sys.argv[1:]:
        print(f"exists, skip: {RAW_PATH.relative_to(ROOT)}")
        return
    body = json.dumps(
        {"model": MODEL, "prompt": PROMPT, "size": "1536x1024", "quality": "high", "n": 1}
    ).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    print(f"requesting red-stamp button source with {MODEL}", flush=True)
    try:
        with urllib.request.urlopen(request, timeout=360) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:800]
        sys.exit(f"Image2 HTTP {error.code}: {detail}")
    except urllib.error.URLError as error:
        sys.exit(f"Image2 network error: {error.reason}")
    try:
        image = base64.b64decode(payload["data"][0]["b64_json"])
    except (KeyError, IndexError, TypeError, ValueError):
        sys.exit(f"Image2 response missing b64_json: {json.dumps(payload)[:800]}")
    RAW_PATH.write_bytes(image)
    print(f"generated {RAW_PATH.relative_to(ROOT)} ({len(image)} bytes)")


if __name__ == "__main__":
    main()
