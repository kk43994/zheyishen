#!/usr/bin/env python3
"""用 image2 生成全部 72 件道具的实物图标基底（绿幕 2x2 格，18 张）。

顺序与 src/relics.ts 的道具声明顺序一致；后续由 process_item_icons.py
切格规整成 icons.png 图集。密钥经 IMAGE2_API_KEY 传入。
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
RAW_DIR = Path("output/imagegen/zhe-yi-shen-items-v1/raw")

STYLE = (
    "Pixel art sprite sheet for a dark fairytale roguelite game, 2x2 grid on solid pure green "
    "background (#00FF00). Four separate small objects, each centered in its own quadrant, no "
    "overlap, no grid lines. Absolutely no text, no letters, no numbers, no writing of any kind. "
    "Muted dark palette: deep ink purple-grey shadows, worn browns, faded paper cream highlights, "
    "occasional dull red or cold blue accent. Chunky low-resolution pixel art, crisp hard pixels, "
    "no anti-aliasing, no gradients, each object roughly 220x220 pixels, melancholic everyday-life "
    "mood, objects look worn and personally owned."
)

# (item id, 英文实物描述) —— 顺序 = relics.ts 声明顺序
ITEMS: list[tuple[str, str]] = [
    ("loose-button", "a single dark school-uniform button with a loose thread"),
    ("wooden-sword", "a chipped wooden toy sword"),
    ("red-workbook", "an exercise workbook covered in red cross marks"),
    ("stone-schoolbag", "a school backpack with its flap open, stuffed full of grey stones, straps strained by the weight"),
    ("bleach-powder", "a half-empty twist-tied plastic bag of yellow bleaching powder"),
    ("eyebrow-razor", "a small pink eyebrow razor"),
    ("od-pill", "a single two-tone pill capsule"),
    ("front-desk-letter", "a folded love letter sealed with a tiny heart sticker"),
    ("cracked-glasses", "a pair of eyeglasses with one cracked lens"),
    ("small-uniform", "a folded school uniform jacket clearly one size too small"),
    ("only-key", "a single worn brass key on a plain ring"),
    ("first-salary", "a thin paper wage envelope with a corner of cash visible"),
    ("nameless-tie", "a plain dark necktie with no label"),
    ("fathers-raincoat", "an old yellow-green raincoat hanging on a hook"),
    ("unsent-phone", "an old mobile phone with dial screen glowing, held mid-air"),
    ("baby-tooth", "a tiny white milk tooth"),
    ("revoked-badge", "a work ID badge on a lanyard with an empty grey photo square"),
    ("slow-watch", "a worn wristwatch with a leather strap"),
    ("missing-photo", "a group photo with one figure torn away leaving a gap"),
    ("white-bottle", "a plain white medicine bottle with a small worn label, writing too faded to read"),
    ("empty-frame", "an empty wooden photo frame"),
    ("broken-spine", "a cracked spine bone snapped at the middle"),
    ("spent-decade", "an hourglass with almost all sand fallen"),
    ("held-pee", "a pale yellow water balloon tied in a tight knot"),
    ("flash-escape", "a small purple lightning bolt dissolving at its edges"),
    ("class-break", "an old school wall bell with a worn rope"),
    ("last-page", "a single ruled homework page half blank with a pencil resting on it"),
    ("five-ha", "a slightly deflated grey speech bubble, sagging"),
    ("red-packet", "a small red envelope with one tiny coin beside it"),
    ("snow-screen", "an old CRT television showing static snow"),
    ("marble", "a glass marble with a colored swirl inside"),
    ("always-crying", "one large falling tear drop"),
    ("three-day-visible", "a small desk calendar with only three pages left"),
    ("read-3am", "a phone lying on a bedside glowing coldly in darkness"),
    ("retracted-voice", "a cassette tape with its brown tape pulled out and tangled"),
    ("takeout-3am", "a knotted plastic takeout bag"),
    ("auto-renew", "a coin trapped inside a circular arrow loop"),
    ("bargain-link", "an axe chopping at a chain that refuses to break"),
    ("mineral-water", "an unopened small bottle of mineral water"),
    ("group-dad", "a phone screen showing a grid of tiny blank circular avatars"),
    ("divorce-draft", "a document with a pen resting on an unsigned signature line"),
    ("checkup-arrows", "a medical report sheet with several small upward red arrows"),
    ("shared-powerbank", "a rental shared power bank unit with charging slots"),
    ("third-pill", "three pills in a row, the third one faintly glowing"),
    ("loan-contract", "a rolled contract with a red fingerprint stamp"),
    ("name-sold", "a contract paper with a red seal and a signature fading away"),
    ("moms-bowl", "a bowl turned upside down over rice inside a pot"),
    ("ruma-msg", "a phone glowing alone in darkness with a single small chat bubble"),
    ("held-elevator", "elevator doors held open by a single hand"),
    ("old-door-lock", "an old brass door lock with a keyhole"),
    ("drank-for-boss", "a full shot glass of clear liquor"),
    ("hair-in-takeout", "an opened takeout box of noodles with one long black hair"),
    ("unwashed-pillow", "a crumpled yellowed pillow"),
    ("sock-cigs", "a grey sock with a cigarette pack tucked inside"),
    ("pregnancy-test", "a pregnancy test stick showing two lines"),
    ("gym-card", "a plastic gym membership card with a tiny dumbbell symbol"),
    ("funeral-photo", "a framed portrait with a black ribbon across one corner, face only a soft smiling silhouette"),
    ("typing-indicator", "a chat bubble containing three dots"),
    ("year-report", "a pair of headphones resting on a small bar chart"),
    ("momo-avatar", "a small pink cartoon dinosaur head inside a round avatar circle"),
    ("ai-chat", "a phone glowing warm blue in darkness with a soft sparkle above the screen"),
    ("streak-1847", "a calendar page densely covered in tiny check marks"),
    ("goodnight-2h", "a phone glowing under a lifted blanket corner"),
    ("friend-verify", "a phone screen showing a grey padlock"),
    ("summer-run", "a running boy silhouette leaning far forward with arms trailing straight back"),
    ("one-more-game", "a game controller with a small alarm clock beside it"),
    ("eye-exercise", "a pair of closed eyes with small pressure-point dots around them"),
    ("card-binder", "an open binder filled with trading cards"),
    ("abstract-lv10", "a yellow grinning emoji face slightly melting and distorted"),
    ("shop-freezer", "a small shop chest freezer with frost on the lid, slightly open"),
    ("server-shutdown", "an old egg-shaped virtual pet keychain toy, a tiny pixel creature on its small screen looking out, screen light dimming"),
    ("painless-night", "a bed floating in a dark void, blanket perfectly flat"),
    ("ktv-song", "a KTV microphone lying beside an untouched fruit plate in a dark private room, cable coiled, cold screen glow"),
    ("breath-on-glass", "a frosted winter window pane covered in breath fog, one small patch freshly wiped clean, night outside"),
]

BATCH = 4


def generate(index: int, batch: list[tuple[str, str]], api_key: str) -> None:
    objects = ", ".join(f"({slot + 1}) {desc}" for slot, (_, desc) in enumerate(batch))
    if len(batch) < BATCH:
        objects += ". Remaining quadrants: plain solid pure green (#00FF00), completely empty"
    body = json.dumps({
        "model": MODEL,
        "prompt": f"{STYLE} Objects: {objects}.",
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
    (RAW_DIR / f"batch{index:02d}.png").write_bytes(image)
    print(f"batch{index:02d} ({', '.join(item_id for item_id, _ in batch)}): {len(image)} bytes", flush=True)


def main() -> None:
    api_key = os.environ.get("IMAGE2_API_KEY", "")
    if not api_key:
        sys.exit("IMAGE2_API_KEY not set")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    only = {int(arg) for arg in sys.argv[1:]}
    batches = [ITEMS[i:i + BATCH] for i in range(0, len(ITEMS), BATCH)]
    (RAW_DIR / "order.json").write_text(
        json.dumps([item_id for item_id, _ in ITEMS], indent=2), encoding="utf-8",
    )
    for index, batch in enumerate(batches):
        if only and index not in only:
            continue
        if not only and (RAW_DIR / f"batch{index:02d}.png").exists():
            print(f"batch{index:02d}: exists, skip", flush=True)
            continue
        generate(index, batch, api_key)


if __name__ == "__main__":
    main()
