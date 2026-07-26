#!/usr/bin/env python3
"""Generate the all-life title cover background with Image2."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-title-cover-v1"
RAW_PATH = OUT_DIR / "title-cover-raw.png"
BASE_URL = os.environ.get("IMAGE2_BASE_URL", "https://cpa.kk666.best/v1").rstrip("/")
MODEL = os.environ.get("IMAGE2_MODEL", "gpt-image-2")
IMAGE_SIZE = os.environ.get("IMAGE2_SIZE", "1024x1536")

PROMPT = """Use case: game-title-cover-background
Asset type: one complete portrait title-screen background for a 360x640 mobile survivor-style roguelite named 这一身; do not render the title or any text into the image
Camera: strict top-down orthographic view looking straight at the ground, no horizon, no upright walls, no room perspective, no vanishing point
Subject: one continuous, heavily lived-in ground surface holding the recognizable physical leftovers of an ordinary Chinese man's whole life. Unlike a level background, this cover may combine all six life stages into one coherent visual journey.

Required edge objects, distributed asymmetrically and overlapping naturally:
- childhood: old bed corner, dim bedside lamp, sock, five marbles, wooden toy sword, schoolbag, crayons
- school: crooked desk and chair edge, red-marked papers without readable writing, red workbook, ruler, cracked glasses
- youth: torn bus tickets, station bench fragment, clock gear, old phone, tangled earphones, suitcase, instant-noodle cup
- adulthood: oversized folded yellow raincoat, umbrella, rice bowl, keys, missed-call phone without text, baby-tooth box
- middle age: collapsed boxes, blank work badge, bills without writing, medicine blister, thermos, loosened necktie, old laptop
- old age: cane, slippers, unlabelled pill bottles, folded hospital blanket, walker fragment, empty chair, reading glasses

Composition: arrange dense clutter around all four sides in broken islands, forming one irregular clockwise life journey rather than six bands or panels. Preserve three intentional safe areas: a dark calm upper-center area for the game title, a broad open center for one standing character, and a dark calm lower-center area for a large start button. The path between these areas should feel worn by footsteps but must not use road edges, perspective rails, chapter stripes or straight tracks. No object may cross the center character silhouette. Keep important objects recognizable after reduction to 360x640.

Style/medium: crisp hard-edged pixel-art environment with medium-fine pixel clusters, limited 30-38 muted colors, no anti-aliasing, no smooth gradients, no painterly brushwork, no photorealism. Palette: ink black, paper grey, worn red, raincoat yellow, hospital blue-grey, dusty green and muted wood. Low-to-medium contrast so white title type, the player and UI remain dominant.

Hard constraints: no people, bodies, visible faces, creatures, enemies, combat effects, UI, HUD, title text, letters, numbers, logos, labels, watermarks, poster border, vignette, repeated rows, checkerboard, grid, graph lines, scan lines, six horizontal stage stripes, six panels, railroad tracks, road markings or furniture blocking the center. This is one real title-cover environment, not one level reused six times."""


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
        {"model": MODEL, "prompt": PROMPT, "size": IMAGE_SIZE, "quality": "high", "n": 1}
    ).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    print(f"requesting title cover with {MODEL} at {IMAGE_SIZE}", flush=True)
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
