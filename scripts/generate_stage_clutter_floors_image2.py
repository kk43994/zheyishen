#!/usr/bin/env python3
"""Generate six distinct top-down life-stage battlefield backgrounds with Image2."""

from __future__ import annotations

import argparse
import base64
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-stage-clutter-floors-v1"
BASE_URL = os.environ.get("IMAGE2_BASE_URL", "https://cpa.kk666.best/v1").rstrip("/")
MODEL = os.environ.get("IMAGE2_MODEL", "gpt-image-2")
IMAGE_SIZE = os.environ.get("IMAGE2_SIZE", "1024x1536")


@dataclass(frozen=True)
class StageJob:
    index: int
    slug: str
    title: str
    setting: str
    floor: str
    objects: tuple[str, ...]
    mood: str

    @property
    def stem(self) -> str:
        return f"stage-{self.index}-{self.slug}"


STAGES = (
    StageJob(
        0,
        "childhood-bedroom",
        "童年 · 床边灯",
        "a cramped, heavily lived-in childhood bedroom in an ordinary Chinese family home",
        "worn dark wooden boards, rubbed patches and tiny stains, without regular plank lines",
        (
            "the corner and legs of an old wooden bed frame",
            "a dim bedside lamp",
            "one small sock",
            "five loose glass marbles",
            "a harmless wooden toy sword",
            "a battered schoolbag",
            "an empty milk bottle",
            "a small wooden rocking horse",
            "scattered crayons and one childish drawing with no letters",
            "a rumpled quilt edge and a few toy blocks",
        ),
        "warm but cramped, a child awake after the adults have gone quiet",
    ),
    StageJob(
        1,
        "school-classroom",
        "求学 · 红叉教室",
        "an emptied Chinese school classroom after an exam, untidy and pressurized rather than nostalgic",
        "dull green-grey terrazzo with chalk dust and shoe scuffs, no regular tile grid",
        (
            "crooked student desk and chair fragments kept near the outer edges",
            "crumpled exercise sheets with red correction marks but no readable writing",
            "a closed worn red workbook",
            "pencil stubs, an eraser and a wooden ruler",
            "a folded classmate note with no letters",
            "cracked eyeglasses",
            "a visibly overfilled schoolbag",
            "a folded school jacket",
            "small irregular piles of exam papers",
            "a broken piece of white chalk and dusty footprints",
        ),
        "cold fluorescent silence after everyone else has handed in their paper",
    ),
    StageJob(
        2,
        "youth-station",
        "青年 · 齿轮车站",
        "a worn bus and railway waiting platform from a young adult's years of graduation, job seeking and renting",
        "patched station concrete with oil marks and grit, no platform safety lines and no tracks",
        (
            "a broken waiting-bench end near one side",
            "torn bus tickets with no readable print",
            "a blank chipped station-sign fragment without letters",
            "a loose clock gear and one broken clock hand",
            "an old mobile phone",
            "cheap tangled earphones",
            "a wrinkled convenience-store bag",
            "a battered suitcase and a soft duffel bag",
            "scattered recruitment papers with no readable writing",
            "a punch-clock casing, house key and empty instant-noodle cup",
        ),
        "restless, windblown and temporary, as if the last bus has just left",
    ),
    StageJob(
        3,
        "adulthood-home",
        "成年 · 屋檐下的家",
        "a small rented family home carrying work, parenthood and unspoken family tension",
        "worn dusty-green domestic flooring with irregular rubbed areas, no regular tile seams",
        (
            "an oversized folded yellow raincoat as the strongest color landmark",
            "a wet umbrella near the edge",
            "a plain rice bowl and a chipped ceramic cup",
            "a ring of house keys",
            "an old phone showing only a red missed-call symbol, no text or numbers",
            "a tiny baby-tooth keepsake box",
            "a face-down family photograph with no visible face",
            "one empty dining chair pushed to an outer edge",
            "a grocery bag and a child's small wheeled toy",
            "a few unpaid household slips with no readable writing",
        ),
        "domestic warmth under strain, dinner gone cold while the phone keeps lighting up",
    ),
    StageJob(
        4,
        "middle-age-office",
        "中年 · 没有关灯的办公室",
        "an office left running late at night during middle age, after layoffs, health reports and overdue bills",
        "scuffed grey-blue office vinyl with caster marks and worn patches, no cubicle or tile grid",
        (
            "collapsed cardboard moving boxes",
            "a revoked work badge with no portrait, text or logo",
            "scattered bills and contract sheets with no readable writing",
            "medicine blister packs",
            "a dented metal thermos",
            "a loosened necktie",
            "an empty water-dispenser jug",
            "a broken office-chair base kept near an outer edge",
            "a closed old laptop with no logo",
            "takeout boxes, a rental power bank and an abstract health-report sheet without text",
        ),
        "exhausted cold light, the desk is gone but the paperwork remains",
    ),
    StageJob(
        5,
        "old-age-hospital",
        "暮年 · 白发荒原",
        "a long quiet hospital corridor after visiting hours, seen as an old person's final waiting place",
        "pale blue-grey hospital flooring, stained and worn into soft irregular patches, no tile grid or corridor guide lines",
        (
            "a wooden cane",
            "a pair of plain slippers",
            "unlabelled white pill bottles and blister packs",
            "a folded hospital blanket",
            "a wheelchair wheel and a folded walker kept near the outer edges",
            "one empty visitor chair at the side",
            "a blank hospital wristband with no text or numbers",
            "a small thermos and reading glasses",
            "a closed denture case",
            "a face-down old photograph and an extinguished corridor lamp",
        ),
        "quiet, pale and spacious, not horror; the last lamp has almost gone out",
    ),
)


def prompt_for(stage: StageJob) -> str:
    object_lines = "\n".join(f"- {item}" for item in stage.objects)
    return f"""Use case: game-environment
Asset type: one complete portrait mobile-game battlefield background for exactly one life stage, {stage.title}
Game context: survivor-style roguelite viewed on a 360x640 canvas; the player, enemies, bullets and combat warnings will be drawn over this image
Camera: strict top-down orthographic view looking straight at the ground, no horizon, no walls standing upright, no room perspective, no vanishing point
Setting: {stage.setting}
Floor material: {stage.floor}
Emotional tone: {stage.mood}

Required recognizable stage-specific objects:
{object_lines}

Composition: this is a full environmental background, not a sprite sheet and not a collection of cutout icons. Build one coherent location using only this life stage. Place dense, messy, asymmetrical clusters around all four sides and in several broken outer islands. Keep a broad winding gameplay route through the center and two smaller open combat pockets. Outer furniture fragments may be partly cropped by the image edge. Objects may overlap naturally, but their silhouettes must remain readable after reduction to 360x640. Make the spatial layout unique to this stage, not a reusable template.

Style/medium: crisp hard-edged low-resolution pixel-art environment, deliberately pixelated yet readable, medium-fine pixel clusters rather than very coarse blocks, limited 28-36 color muted palette, no anti-aliasing, no smooth gradient, no painterly brushwork, no photorealism. Individual props need distinct local silhouettes and material colors. The background contrast must remain lower than characters, projectiles and red/cyan combat telegraphs.

Hard constraints: no people, bodies, visible faces, creatures, enemies, combat projectiles, UI, HUD, captions, text, letters, numbers, logos, labels, watermark, poster framing, vignette, border, repeated rows, evenly spaced objects, checkerboard, grid, graph-paper lines, scan lines, long straight tracks, platform safety lines, road markings, stage stripes, continuous edge rails, or furniture blocking the center. Do not include objects from other life stages. Do not create a six-panel overview. Render only this single stage background."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "stages",
        nargs="*",
        help="Optional stage indexes or slugs; default generates all six.",
    )
    parser.add_argument("--force", action="store_true", help="Replace existing raw images.")
    return parser.parse_args()


def select_jobs(tokens: list[str]) -> tuple[StageJob, ...]:
    if not tokens:
        return STAGES
    selected: list[StageJob] = []
    for token in tokens:
        matches = [job for job in STAGES if token in {str(job.index), job.slug, job.stem}]
        if not matches:
            choices = ", ".join(f"{job.index}/{job.slug}" for job in STAGES)
            raise SystemExit(f"unknown stage {token!r}; choose {choices}")
        if matches[0] not in selected:
            selected.append(matches[0])
    return tuple(selected)


def request_image(prompt: str, api_key: str) -> bytes:
    body = json.dumps(
        {
            "model": MODEL,
            "prompt": prompt,
            "size": IMAGE_SIZE,
            "quality": "high",
            "n": 1,
        }
    ).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=360) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:800]
        raise SystemExit(f"Image2 HTTP {error.code}: {detail}") from None
    except urllib.error.URLError as error:
        raise SystemExit(f"Image2 network error: {error.reason}") from None
    try:
        return base64.b64decode(payload["data"][0]["b64_json"])
    except (KeyError, IndexError, TypeError, ValueError):
        raise SystemExit(f"Image2 response missing b64_json: {json.dumps(payload)[:800]}") from None


def main() -> None:
    args = parse_args()
    api_key = os.environ.get("IMAGE2_API_KEY", "")
    if not api_key:
        raise SystemExit("IMAGE2_API_KEY not set")
    jobs = select_jobs(args.stages)
    raw_dir = OUT_DIR / "raw"
    prompt_dir = OUT_DIR / "prompts"
    raw_dir.mkdir(parents=True, exist_ok=True)
    prompt_dir.mkdir(parents=True, exist_ok=True)

    for position, job in enumerate(jobs, start=1):
        prompt = prompt_for(job)
        prompt_path = prompt_dir / f"{job.stem}.txt"
        raw_path = raw_dir / f"{job.stem}-raw.png"
        prompt_path.write_text(prompt + "\n", encoding="utf-8")
        if raw_path.exists() and not args.force:
            print(f"[{position}/{len(jobs)}] exists, skip: {raw_path.relative_to(ROOT)}", flush=True)
            continue
        print(f"[{position}/{len(jobs)}] requesting {job.title} with {MODEL} at {IMAGE_SIZE}", flush=True)
        image = request_image(prompt, api_key)
        raw_path.write_bytes(image)
        print(f"[{position}/{len(jobs)}] generated {raw_path.relative_to(ROOT)} ({len(image)} bytes)", flush=True)


if __name__ == "__main__":
    main()
