#!/usr/bin/env python3
"""Generate five complete image2 design-sheet options for the Silent Father boss."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("IMAGE2_BASE_URL", "https://cpa.kk666.best/v1").rstrip("/")
MODEL = os.environ.get("IMAGE2_MODEL", "gpt-image-2")
OUT_DIR = Path("output/imagegen/zhe-yi-shen-silent-father-options-v2")
RAW_DIR = OUT_DIR / "raw"

COMMON = """Pixel art boss character design sheet for a dark fairytale roguelite game. Strict 2x2 grid on a perfectly flat solid pure green background (#00FF00). Show the exact same dual-phase boss in all four quadrants with identical body proportions, clothing construction, palette, camera distance, and three-quarter front view. Every figure is full-body, centered, isolated, and fully visible with generous green padding. The boss fills about 70% of each quadrant width and 84% of its height, with an unusually broad heavy silhouette.

Quadrant 1: phase one idle, a huge severe father in a sealed raincoat-armor posture. Quadrant 2: phase one attack, the same towering father scolding, pointing, sweeping one heavy sleeve, or forcefully pushing the child away. Quadrant 3: phase two idle, the giant raincoat has completely collapsed beside or behind him and the true figure is one crying eight-to-ten-year-old boy. Quadrant 4: phase two attack, the same crying boy actively throwing a tantrum: stomping, flailing his small fists, shoving, or charging forward through tears.

The figure is "The Silent Father", an exhausted ordinary Chinese working-class father transformed by his child's memory into a sorrowful boss. As a boy he was taught not to cry, ask for help, or show fear. As a father he still feels small and frightened, but always pretends to be strong in front of his child because he believes the family will collapse if the child sees his weakness. He protects by saying "I am fine", "we have enough money", and "go inside, it is cold", but this silence also wounds his child. He is not an evil father and not a saint asking for forgiveness. He is an ordinary person who never learned that weakness could be seen.

His worn oversized yellow-green raincoat was once a cheap hardware-store raincoat used to pick up his child in heavy rain. He claimed he was merely passing by, but water poured from his shoes when he got home. The right pocket has been repaired twice, the cuffs are pale from wear, the inner lining stays visibly dry, and the low wet hood hides the adult face completely. In phase one one outer shoulder and shoe are darker with rain while the sheltered side remains dry. The coat looks heavy because it contains years of withheld fear, not because it is metal armor. He bends slightly from fatigue even while forcing his shoulders to look broad. He is human and tragic, never heroic, muscular, undead, mechanical, royal, knight-like, or monstrous.

Phase two means the performance of strength has completely collapsed. The father is simply a crying child who grew older without learning how to name fear, shame, or hurt. The boy attacks the protagonist because being seen makes him panic and throw a genuine angry tantrum. This is tragic but not cute, comic, innocent, or harmless. Show one complete boy with messy dark hair, an irregular tear-streaked pale face, hunched shoulders, torso, active arms, legs, and worn shoes. Keep the collapsed old raincoat as a separate pooled shape beside or behind him for continuity, never wrapped around his body and never used as a monster shell. In the attack pose, the crying boy has unconsciously nudged the raincoat toward the viewer with one foot, leaving its dry inner lining facing outward. Phase one and phase two will use different runtime display scales, so each figure should independently fill about 80% of its own quadrant for clean 32x32 reduction. Do not draw a large square face, floating face, mask, giant child, extra child, cockpit, gore, organs, or body horror.

Chunky low-resolution pixel art, crisp hard pixels, no anti-aliasing, no gradients, very limited detail, strong silhouette that survives reduction to a 32x32 sprite. Muted palette: ink purple-grey shadows, worn olive raincoat, dim mustard structural highlights, pale paper skin, restrained dark red only inside the opening. No overlap between quadrants, no grid lines, no text, letters, numbers, symbols, scenery, floor, shadow, weapons, or extra people.

Design direction: {direction}"""

OPTIONS = {
    "01-door-shell": (
        "THE PERSON AT THE DOOR. In phase one the massive trapezoid raincoat resembles one closed old apartment door, with a central seam and broad oppressive shoulders; attacks feel like scolding, closing a door, and pushing the protagonist inside. In phase two the empty door-shaped coat lies collapsed behind the crying boy. The boy stomps at the threshold and rushes forward to shove the protagonist. Simple blocky geometry and maximum 32x32 readability."
    ),
    "02-embrace-shell": (
        "THE PERSON WHO BLOCKS THE RAIN. In phase one the broad hood and drooping shoulders form an oppressive human shelter, like an old umbrella shape without a separate umbrella; a protective sweep becomes a forceful shove. In phase two the large hood lies behind the boy like a broken umbrella. He runs out from beneath it, crying and shoulder-charging the protagonist. Strongest size contrast, never angelic."
    ),
    "03-rain-rib-shell": (
        "THE PERSON WHO SAYS I AM FINE. In phase one three large overlapping raincoat fronts create a thick severe silhouette; repaired pocket, worn cuff, and large buttons use only bold shapes. In phase two all three layers lie empty on the ground. The crying boy has one comically too-long but still tragic old sleeve hanging from a shoulder, which he uses while wiping tears and flailing his fists. No mechanical panels and no cute comedy."
    ),
    "04-umbrella-rib-shell": (
        "THE BOY WHO LEARNED TO STAND STRAIGHT. In phase one the silhouette is tall, square, and unnaturally rigid, with a perfectly level shoulder line, lowered hood, and severe pointing gesture. In phase two the raincoat collapses vertically like an empty column and the boy falls out, then stands hunched, cries, stamps, and swings with completely uncontrolled curved poses. Minimal decoration and strongest character acting."
    ),
    "05-workcoat-tower": (
        "THE EMBRACE THAT NEVER HAPPENED. In phase one extra-long human sleeves cross tightly over the chest, then open into a stern pushing attack. In phase two the raincoat lies empty and the boy begins by hugging himself, then suddenly releases both arms to cry, slap, shove, and flail at the protagonist. Rounded heavy adult silhouette contrasted with a raw unstable child pose, never a straitjacket or monster."
    ),
}


def generate(name: str, direction: str, api_key: str, force: bool) -> None:
    raw_path = RAW_DIR / f"{name}.png"
    prompt = COMMON.format(direction=direction)
    (OUT_DIR / f"{name}-prompt.txt").write_text(prompt + "\n", encoding="utf-8")
    if raw_path.exists() and not force:
        print(f"{name}: exists, skip", flush=True)
        return
    body = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "size": "1024x1024",
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
    raw_path.write_bytes(image)
    print(f"{name}: generated {len(image)} bytes", flush=True)


def main() -> None:
    api_key = os.environ.get("IMAGE2_API_KEY", "")
    if not api_key:
        sys.exit("IMAGE2_API_KEY not set")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    requested = {argument for argument in sys.argv[1:] if not argument.startswith("--")}
    force = "--force" in sys.argv[1:]
    unknown = requested.difference(OPTIONS)
    if unknown:
        sys.exit(f"unknown options: {', '.join(sorted(unknown))}")
    for name, direction in OPTIONS.items():
        if requested and name not in requested:
            continue
        generate(name, direction, api_key, force)


if __name__ == "__main__":
    main()
