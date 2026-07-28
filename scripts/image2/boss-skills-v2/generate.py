#!/usr/bin/env python3
"""boss-skills-v2 试点：father-charge / praise-slam 4帧→8帧。

每招 2 张 2x2 绿幕格图：图A=帧1-4（前半段），图B=帧5-8（后半段，衔接前段）。
API 凭证读仓库根 ai-profiles.local.json → profiles['cpa-luna']。
断点续跑：raw 已存在跳过；命令行传名字（不含 .png）强制重跑。
用法：python3 scripts/image2/boss-skills-v2/generate.py [名字...]
"""

from __future__ import annotations

import base64
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "output/imagegen/zhe-yi-shen-boss-skills-v2/raw"

MODEL = "gpt-image-2"

# ── 提示词纪律：低饱和暗童话、大色块粗轮廓、纯绿 2x2、与 v1 形象一致 ──
PIXEL = (
    " Crisp hard-pixel art, chunky simple pixel shapes with a thick dark outline,"
    " no anti-aliasing, no gradients, no blur, no smooth painting."
    " Muted low-saturation dark fairytale palette - dusty, worn, faded tones,"
    " NOT vibrant, NOT neon, NOT glossy. Absolutely no text, labels, borders or grid lines."
)
GRID = (
    "2x2 grid on solid pure green background (#00FF00), four separate frames,"
    " each one complete character centered in its own quadrant, no overlap,"
    " quadrant order (1)(2)(3)(4). "
)

FATHER_ID = (
    " The character is EXACTLY the same small crying boy in every frame: messy dark"
    " shaggy hair, BOTH hands pressed flat over his face the whole time (face never"
    " visible), oversized ragged dark olive-brown coat with a torn tattered hem worn"
    " over a dark grey shirt, dark cropped trousers, small dark shoes. Child"
    " proportions, vulnerable scale, readable at 64 pixels. No weapon, no gore, no smile."
)
PRAISE_ID = (
    " The character is EXACTLY the same boss in every frame: a huge back-facing man"
    " fused into a giant dark cracked leather office chair, seen from behind - small"
    " dark-haired head seen from the back (face NEVER visible), massive padded dark"
    " grey-brown shoulders and arms, one dark navy strap running diagonally across the"
    " chair back, jagged black cracks running down the chair back, and a dark worn"
    " wooden desk-height surface in front of him at the bottom of every frame."
    " Largest oppressive boss silhouette, readable at 96 pixels. No teeth, no blood, no extra character."
)

SPECS: list[tuple[str, str]] = [
    (
        "father-charge-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " shoulder-charge attack animation (a hurt child charging blindly while hiding"
        " his face): (1) standing hunched and still, hands over face, coat hanging"
        " straight; (2) wind-up - leaning back slightly, one foot slid behind, coat hem"
        " swaying backward; (3) tipping forward into the first step, leading shoulder"
        " dropped, coat starting to trail behind; (4) a low lunging running stride,"
        " both legs stretched mid-run, body leaning hard forward, coat trailing"
        " horizontally behind him." + FATHER_ID + PIXEL,
    ),
    (
        "father-charge-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous 8-frame"
        " shoulder-charge attack animation of this boy. Frame 5 continues directly"
        " from a low forward running lunge with the coat trailing horizontally."
        " CRITICAL color continuity: the coat is the SAME medium warm olive-brown in"
        " every frame (not grey, not black), the shirt the same dark grey, overall"
        " brightness identical to the first half:"
        " (5) deepest point of the charge - shoulder rammed fully forward, body almost"
        " horizontal, rear foot off the ground, coat streaming straight behind;"
        " (6) second running step, torso beginning to rise back up, coat still"
        " trailing; (7) skidding to a stop - both feet planted wide and braced, body"
        " upright, coat momentum swinging forward past his body; (8) back to the"
        " hunched standing pose of frame 1, hands over face, coat settling straight"
        " down." + FATHER_ID + PIXEL,
    ),
    (
        "praise-slam-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " desk-slam attack animation. CRITICAL continuity: the desk is the SAME tall"
        " dark worn wooden podium-style front panel with corner pillars and a"
        " recessed rectangular panel, occupying the bottom third of every frame,"
        " identical size and position in all four frames; the boss stays the SAME"
        " size seated behind it, very dark charcoal grey-black padded jacket arms,"
        " bare fists in a lighter dusty skin tone; same very dark muted brightness"
        " in all frames: (1) sitting low and quiet in the chair, both"
        " arms resting down at his sides, cracks thin; (2) torso rising, both arms"
        " lifting up and outward, hands starting to clench; (3) full rear-up - torso"
        " tall, both clenched fists raised high above the head, black cracks in the"
        " chair back widening; (4) both arms mid-swing hammering downward fast, short"
        " motion streaks behind the arms, torso pitching forward." + PRAISE_ID + PIXEL,
    ),
    (
        "praise-slam-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous 8-frame"
        " desk-slam attack animation of this chair boss. Frame 5 continues directly"
        " from both arms swinging down. CRITICAL continuity: the desk is the SAME"
        " tall dark worn wooden podium-style front panel with corner pillars and a"
        " recessed rectangular panel, occupying the bottom third of every frame,"
        " identical size and position in all four frames; the boss stays the SAME"
        " size seated behind it, only his arms reach forward over the desk top; same"
        " very dark muted brightness as the first half: (5) IMPACT - both fists hammering into the"
        " wooden desk surface, a few chunky wood splinters bursting up around the"
        " fists; (6) fists still buried in the desk, shoulders hunched at their"
        " lowest, black cracks at their widest, last splinters falling; (7) arms"
        " lifting slightly off the desk, dust settling, torso rising a little;"
        " (8) settled back into the low seated pose of frame 1, arms down at his"
        " sides, cracks back to thin." + PRAISE_ID + PIXEL,
    ),
]


def load_profile() -> tuple[str, str]:
    profiles = json.loads((ROOT / "ai-profiles.local.json").read_text(encoding="utf-8"))
    profile = profiles["profiles"]["cpa-luna"]
    return profile["baseUrl"].rstrip("/"), profile["apiKey"]


def generate(base_url: str, api_key: str, name: str, prompt: str) -> None:
    body = json.dumps({"model": MODEL, "prompt": prompt, "size": "1024x1024", "n": 1}).encode()
    request = urllib.request.Request(
        f"{base_url}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = json.load(response)
    image = base64.b64decode(payload["data"][0]["b64_json"])
    (RAW_DIR / f"{name}.png").write_bytes(image)
    print(f"{name}: {len(image)} bytes", flush=True)


def main() -> None:
    base_url, api_key = load_profile()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    failures: list[str] = []
    for name, prompt in SPECS:
        if only and name not in only:
            continue
        if not only and (RAW_DIR / f"{name}.png").exists():
            print(f"{name}: exists, skip", flush=True)
            continue
        for attempt in (1, 2, 3):
            try:
                generate(base_url, api_key, name, prompt)
                break
            except Exception as error:  # noqa: BLE001 — 逐条容错，断点续跑
                print(f"{name}: attempt {attempt} failed · {error}", flush=True)
                if attempt == 3:
                    failures.append(name)
                else:
                    time.sleep(8)
    if failures:
        sys.exit(f"FAILED: {', '.join(failures)}")
    print("all done", flush=True)


if __name__ == "__main__":
    main()
