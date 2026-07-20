#!/usr/bin/env python3
"""Generate a four-panel image2 design sheet for the Silent Father boss."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("IMAGE2_BASE_URL", "https://cpa.kk666.best/v1").rstrip("/")
MODEL = os.environ.get("IMAGE2_MODEL", "gpt-image-2")
OUT_DIR = Path("output/imagegen/zhe-yi-shen-silent-father-hybrid-v1")
RAW_PATH = OUT_DIR / "silent-father-raw.png"

PROMPT = """Pixel art character design sheet for a dark fairytale roguelite game, presented as a strict 2x2 grid on a perfectly flat solid pure green background (#00FF00).

Show the exact same dual-phase boss character in all four quadrants with identical body proportions, clothing construction, color palette, camera distance, and three-quarter front perspective. Each figure must be full-body, centered, isolated, and fully visible with generous green padding. No overlap between quadrants, no grid lines, no text, no letters, no numbers, no symbols, no scenery, no floor, no shadow, no weapons, no extra people.

Character identity: "The Silent Father", an ordinary exhausted Chinese working-class father turned into a dark fairytale boss. His old yellow-green raincoat has hardened into a broad triangular shell like emotional armor. The wet hood hangs low and hides the adult face completely. Heavy shoulders, long dark sleeves, worn hem, rain-darkened cloth, restrained posture. He must feel sorrowful and human, never heroic, never muscular, never a zombie, never a knight, never a machine.

Quadrant 1: phase one idle. The raincoat is fully closed like a sealed shell. Arms hang stiffly at the sides. Face completely hidden under the hood. Strong readable silhouette.

Quadrant 2: phase one attack pose. Same sealed raincoat and exact same proportions. The armored sleeves open outward in a heavy, awkward warning gesture while the face remains hidden.

Quadrant 3: phase two idle. The same outer raincoat shell has split vertically from hood to chest, with torn wet edges folding outward. Inside is a much smaller frightened boy version of the same person, pale face, short dark hair, hunched shoulders, looking outward from inside the adult shell. The boy is only 35-40% of the coat height, his head is no wider than 15% of the coat torso, and he remains fully nested inside the father's shell. The outer shell and boy must read as one connected silhouette. No gore and no body horror.

Quadrant 4: phase two attack pose. Same split shell and same small frightened boy at exactly the same relative scale. The broken adult sleeves reach outward while the boy recoils inside. Preserve the exact phase-two design from quadrant 3.

Visual style: chunky low-resolution pixel art with crisp hard pixels, clear silhouette, no anti-aliasing, no gradients. Muted limited palette: deep ink purple-grey shadows, worn olive raincoat, dim mustard seam highlights, pale paper skin, one restrained dark red accent only on torn inner seams. Melancholic rainy-night mood. Designed to survive reduction to a 32x32 game sprite."""


def main() -> None:
    api_key = os.environ.get("IMAGE2_API_KEY", "")
    if not api_key:
        sys.exit("IMAGE2_API_KEY not set")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "prompt.txt").write_text(PROMPT + "\n", encoding="utf-8")
    if RAW_PATH.exists() and "--force" not in sys.argv[1:]:
        print(f"exists, skip: {RAW_PATH}")
        return
    body = json.dumps({
        "model": MODEL,
        "prompt": PROMPT,
        "size": "1024x1024",
        "n": 1,
    }).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=240) as response:
        payload = json.load(response)
    image = base64.b64decode(payload["data"][0]["b64_json"])
    RAW_PATH.write_bytes(image)
    print(f"generated {RAW_PATH} · {len(image)} bytes")


if __name__ == "__main__":
    main()
