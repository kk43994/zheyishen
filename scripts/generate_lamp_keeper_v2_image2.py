#!/usr/bin/env python3
"""Generate the canon-correct Lamp Keeper v2 Image2 design sheet."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("IMAGE2_BASE_URL", "https://cpa.kk666.best/v1").rstrip("/")
MODEL = os.environ.get("IMAGE2_MODEL", "gpt-image-2")
OUT_DIR = Path("output/imagegen/zhe-yi-shen-lamp-keeper-v2")
RAW_PATH = OUT_DIR / "lamp-keeper-v2-raw.png"

PROMPT = """Use case: stylized-concept
Asset type: four-pose pixel-art source sheet for the final boss of a dark fairytale roguelite
Scene/backdrop: strict 2x2 grid on a perfectly flat solid pure green background (#00FF00), with no visible grid lines
Subject: the exact same dual-identity final boss, "The Lamp Keeper", in all four quadrants. A tall, calm hooded cloak of deep ink-purple darkness holds one dim warm lantern on a short chain. Nested inside the open front of the cloak is exactly one much smaller ordinary Chinese boy: the same unequipped child seen at the beginning of the game, pale paper-toned face, short black hair, plain faded dark undershirt and trousers, bare of relics, armor, bags, weapons, jewelry, or special clothing. "Unequipped" means no items or gear, not nude. The boy is 35-40% of the cloak height, centered inside the chest and abdomen cavity, and must remain visibly connected to the same outer cloak silhouette. The hood above him stays a deep empty shadow. The child must never stand beside, in front of, or outside the cloak.
Style/medium: crisp hard-edged low-resolution pixel art, limited muted palette, no anti-aliasing, no gradients, melancholic dark fairytale mood. Calm and inevitable, never menacing, heroic, skeletal, demonic, or gory.
Composition/framing: identical construction, child identity, proportions, palette, camera distance, and three-quarter front view in all quadrants. Each complete boss is full-body, centered, isolated, and separated from the others with generous green padding.
Quadrant 1: idle, cloak standing still, lantern hanging low, the small boy quietly visible inside.
Quadrant 2: moving, cloak drifting forward with the hem trailing, lantern swaying slightly, boy still nested at the exact same scale.
Quadrant 3: attack, outer sleeve raises the lantern high and its warm light brightens slightly; boy looks upward but remains inside the cloak.
Quadrant 4: hurt, cloak recoils and the far hem scatters into a few ash-like pixels; lantern stays attached and the same boy remains readable inside.
Constraints: perfectly uniform #00FF00 background with no texture, shadow, floor, reflection, glow spill, scenery, text, letters, numbers, symbols, watermark, borders, or grid lines. Exactly one cloak, one nested boy, and one lantern per quadrant. No extra people, faces, hands, lanterns, weapons, props, or detached body parts. Do not use #00FF00 inside the subject. Designed to survive reduction into a 64x64 game sprite while retaining the empty hood, nested child, and lantern as three distinct readable shapes."""


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
        "quality": "high",
        "n": 1,
    }).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = json.load(response)
    image = base64.b64decode(payload["data"][0]["b64_json"])
    RAW_PATH.write_bytes(image)
    print(f"generated {RAW_PATH} · {len(image)} bytes")


if __name__ == "__main__":
    main()
