#!/usr/bin/env python3
"""用 image2 为 17 种敌怪生成四姿态基底图（绿幕 2x2：站立/移动/攻击/受击）。

沉默的父亲两形态已由既有 hybrid 管线完成，不在此列。
后续由 process_enemy_hybrid_atlases.py 合成五行动作图集。
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
RAW_DIR = Path("output/imagegen/zhe-yi-shen-enemy-hybrid-v1/raw")

STYLE_HEAD = (
    "Pixel art creature design sheet for a dark fairytale roguelite game, presented as a strict "
    "2x2 grid on a perfectly flat solid pure green background (#00FF00). Show the exact same "
    "creature in all four quadrants with identical construction, color palette, camera distance "
    "and three-quarter front perspective. Each figure must be centered, isolated, fully visible "
    "with generous green padding. No overlap, no grid lines, no text, no letters, no numbers, "
    "no scenery, no floor, no shadow."
)
STYLE_TAIL = (
    "Visual style: chunky low-resolution pixel art with crisp hard pixels, clear silhouette, no "
    "anti-aliasing, no gradients. Muted limited palette: deep ink purple-grey shadows, worn "
    "browns, faded paper cream highlights, restrained dull red or cold blue accents. Melancholic "
    "dark fairytale mood, the creature is an everyday hardship given a quiet body — an object or "
    "presence, never gory, never heroic. Designed to survive reduction to a 32x32 game sprite."
)

# (asset id, 身份描述, 四格姿态描述)
ENEMIES: list[tuple[str, str, str]] = [
    ("fear",
     'Creature identity: "The Breathing Under the Bed", a small soft lump of living darkness '
     "with two pale glowing oval eyes and a faint small mouth, edges wispy like held breath.",
     "Quadrant 1: resting, hunched and still. Quadrant 2: creeping forward, body stretched "
     "slightly. Quadrant 3: attacking, mouth open wide showing a violet throat, wisps flaring. "
     "Quadrant 4: flinching away, eyes squeezed to thin lines."),
    ("red-mark",
     'Creature identity: "The Red Cross", a crumpled exam paper sheet come alive, one large '
     "harsh red cross dominating its face, faint ruled lines and a low score smudge.",
     "Quadrant 1: hovering upright at rest. Quadrant 2: hopping forward mid-bounce, corners "
     "trailing. Quadrant 3: attacking, the red cross flaring larger with red streaks out both "
     "sides. Quadrant 4: recoiling, paper crumpling inward."),
    ("whisper",
     'Creature identity: "They All Talk", a floating dark violet blob whose surface is mostly '
     "overlapping mouths of different sizes, all slightly open.",
     "Quadrant 1: drifting at rest, mouths murmuring. Quadrant 2: gliding forward, body leaning. "
     "Quadrant 3: attacking, every mouth stretched wide shouting, sound lines to one side. "
     "Quadrant 4: recoiling, mouths clamped shut."),
    ("clockwork",
     'Creature identity: "The Punch-Clock Gear", a heavy tarnished brass gear with a worn clock '
     "face embedded in its center, hands slightly bent.",
     "Quadrant 1: standing upright at rest. Quadrant 2: rolling forward, tilted with a small "
     "motion nick. Quadrant 3: attacking, clock hands spun into a blur, face glowing faint "
     "amber. Quadrant 4: struck, a crack across the clock glass."),
    ("debt",
     'Creature identity: "Next Month\'s Bill", a stiff bill paper standing upright, rows of '
     "faint entry lines and two harsh red stamp marks, bottom edge torn.",
     "Quadrant 1: standing at rest. Quadrant 2: shuffling forward with a slight lean. Quadrant "
     "3: attacking, red stamps glowing hot, paper spread wider. Quadrant 4: flinching, top "
     "corner folding over."),
    ("lamp-keeper",
     'Creature identity: "The Lamp Keeper", a tall hooded cloak of deep darkness with nothing '
     "inside, holding one dim warm lantern on a short chain. Calm, patient, never menacing.",
     "Quadrant 1: standing still, lantern hanging low. Quadrant 2: drifting forward, hem "
     "trailing. Quadrant 3: raising the lantern high, its light slightly brighter. Quadrant 4: "
     "recoiling, cloak edges scattering like ash."),
    ("uniform-answer",
     'Creature identity: "The Uniform Answer", a hovering cluster of identical exam sheets '
     "arranged into a rough mask-like face, red crosses for eyes, one red bar for a mouth.",
     "Quadrant 1: hovering at rest, sheets aligned. Quadrant 2: advancing, sheets fanning "
     "slightly. Quadrant 3: attacking, sheets flared outward, red marks blazing. Quadrant 4: "
     "struck, sheets scattered loose."),
    ("cry-moth",
     'Creature identity: "The Cry Moth", a small violet moth with teardrop-shaped pale marks on '
     "its wings and drooping antennae.",
     "Quadrant 1: resting, wings folded half. Quadrant 2: flying, wings spread wide mid-flap. "
     "Quadrant 3: attacking, wings flared fully, pale tear-dust falling below. Quadrant 4: "
     "tumbling, wings bent."),
    ("hunger-shadow",
     'Creature identity: "The Empty Bottle", an empty glass baby bottle with a rubber teat, '
     "faint measurement marks, a dried milk stain at the bottom, standing like a small ghost.",
     "Quadrant 1: standing upright. Quadrant 2: hopping forward with a tilt. Quadrant 3: "
     "lunging, tilted hard forward with speed lines behind. Quadrant 4: wobbling back, almost "
     "tipping over."),
    ("closet-dark",
     'Creature identity: "The Monster Nobody Believed", an old dark wardrobe standing alone, '
     "doors slightly ajar with pure blackness and two small pale eyes in the gap.",
     "Quadrant 1: standing still, gap narrow. Quadrant 2: rocking forward on its feet mid-step. "
     "Quadrant 3: attacking, doors thrown wide, darkness spilling out and eyes burning red. "
     "Quadrant 4: struck, doors clapped shut, one hinge splintering."),
    ("missed-call",
     'Creature identity: "The Missed Call", an old candybar mobile phone standing upright, '
     "screen glowing cold with one small red notification dot, keypad worn.",
     "Quadrant 1: standing, screen dim. Quadrant 2: vibrating forward, tilted with small "
     "shake marks. Quadrant 3: attacking, screen flaring bright red, ring waves out both "
     "sides. Quadrant 4: struck, screen glitching dark."),
    ("silence",
     'Creature identity: "Nobody Speaks", a small worn dinner table carrying two plain bowls '
     "with faint steam, moving by itself. The horror is only its quietness.",
     "Quadrant 1: standing still, steam thin. Quadrant 2: dragging forward, slightly tilted. "
     "Quadrant 3: attacking, bowls jolted mid-air above the table, steam gone. Quadrant 4: "
     "struck, one bowl tipped over."),
    ("badge-thief",
     'Creature identity: "The Packed Cardboard Box", a taped moving box with two small tired '
     "legs underneath and a work badge lanyard dangling from under the flap.",
     "Quadrant 1: standing, flap closed. Quadrant 2: walking, one leg mid-step, box tilted. "
     "Quadrant 3: attacking, flap open with a pale hand reaching out to grab. Quadrant 4: "
     "struck, box dented, lanyard swinging."),
    ("debt-collector",
     'Creature identity: "The Door Knock", a heavy standing door pasted with red-stamped '
     "notice papers, brass knob, moving on its own frame.",
     "Quadrant 1: standing shut. Quadrant 2: stepping forward, frame tilted. Quadrant 3: "
     "attacking, door cracked open with a heavy fist punching out of the gap. Quadrant 4: "
     "struck, notices torn loose and fluttering."),
    ("forgetter",
     'Creature identity: "The One Who Forgot His Name", a hunched grey elderly figure in a '
     "plain coat, face completely blank with no features, right side of the body dissolving "
     "into scattered pixels.",
     "Quadrant 1: standing hunched. Quadrant 2: shuffling forward slowly. Quadrant 3: reaching "
     "out with one arm, hand open. Quadrant 4: struck, dissolving further, more of the body "
     "gone."),
    ("empty-chair",
     'Creature identity: "The Empty Chair", one old wooden chair, worn smooth by years of the '
     "same person sitting, now empty. It never moves fast; its presence is the whole point.",
     "Quadrant 1: standing still. Quadrant 2: creaking, tilted slightly on two legs. Quadrant "
     "3: a faint dark human silhouette briefly seated on it, translucent edges. Quadrant 4: "
     "struck, rocking hard, one leg lifted."),
    ("last-bus",
     'Creature identity: "The Last Bus", a night bus seen from the side, dark body, glowing '
     "warm yellow windows, a small red route sign, tired headlight.",
     "Quadrant 1: parked at rest, engine quiet. Quadrant 2: rolling forward, slight lean, "
     "wheels in motion. Quadrant 3: charging, headlights blazing cones of light, body lunging. "
     "Quadrant 4: struck, windows flickering dark, body dented."),
]


def generate(asset: str, identity: str, poses: str, api_key: str) -> None:
    prompt = f"{STYLE_HEAD}\n\n{identity}\n\n{poses}\n\n{STYLE_TAIL}"
    body = json.dumps({"model": MODEL, "prompt": prompt, "size": "1024x1024", "n": 1}).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=240) as response:
        payload = json.load(response)
    image = base64.b64decode(payload["data"][0]["b64_json"])
    (RAW_DIR / f"{asset}.png").write_bytes(image)
    print(f"{asset}: {len(image)} bytes", flush=True)


def main() -> None:
    api_key = os.environ.get("IMAGE2_API_KEY", "")
    if not api_key:
        sys.exit("IMAGE2_API_KEY not set")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    for asset, identity, poses in ENEMIES:
        if only and asset not in only:
            continue
        if not only and (RAW_DIR / f"{asset}.png").exists():
            print(f"{asset}: exists, skip", flush=True)
            continue
        generate(asset, identity, poses, api_key)


if __name__ == "__main__":
    main()
