#!/usr/bin/env python3
"""boss-skills-v2：Boss 招式 4帧→8帧（试点 father-charge / praise-slam，已铺开更多招式）。

每招 2 张 2x2 绿幕格图：图A=帧1-4（前半段），图B=帧5-8（后半段，衔接前段）。
经验教训：图B 提示词必须带 CRITICAL continuity 段（与图A 完全一致的外观/配色/视角），
否则后半段画风漂移；生成后必须目检帧序连贯性。
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

PRAISE_DESK = (
    " CRITICAL continuity: the desk is the SAME tall dark worn wooden podium-style"
    " front panel with corner pillars and a recessed rectangular panel, occupying"
    " the bottom third of every frame, identical size and position in all four"
    " frames; the boss stays the SAME size seated behind it, very dark charcoal"
    " grey-black padded jacket arms, bare fists in a lighter dusty skin tone; same"
    " very dark muted brightness in all frames."
    " CRITICAL scale lock: EXACT same camera distance and zoom in every frame -"
    " the seated boss with his cracked chair back fills the middle 55-60% of the"
    " frame height ABOVE the desk, his head reaching close to the top edge; he"
    " must NEVER shrink or grow between frames. CRITICAL palette lock: the desk"
    " wood and jacket stay COLD very dark charcoal grey-black; absolutely NO"
    " warm brown or lighter tan color shift: "
)
FATHER_CONT = (
    " CRITICAL color continuity with the first half: the coat is the SAME medium"
    " warm olive-brown in every frame (not grey, not black), the shirt the same"
    " dark grey, overall brightness identical to the first half: "
)
BUS_ID = (
    " The subject is EXACTLY the same worn late-night city bus in every frame:"
    " a long horizontal old night bus seen from the SIDE with its front pointing"
    " LEFT in every frame, dark desaturated navy-black body with a dull dark-red"
    " trim line, one row of small warm dull-yellow lit windows along the side,"
    " round pale-yellow headlights at the left front, dark heavy wheels, no driver"
    " and no passengers visible as people. Same side viewpoint, same scale, same"
    " construction in all frames, unmistakably a threatening small boss, readable"
    " at 64 pixels. No route numbers, no readable destination text, no station,"
    " no road, no people."
)
BUS_CONT = (
    " CRITICAL continuity with the first half: the SAME dark desaturated"
    " navy-black bus body with the dull dark-red trim line, the SAME warm"
    " dull-yellow lit side windows, front still pointing LEFT, same side"
    " viewpoint and scale, overall dark muted brightness identical to the first"
    " half. CRITICAL scale lock: EXACT same camera distance and zoom in every"
    " frame - the bus body fills about 80% of the frame width and stays that"
    " size in ALL frames; it must NEVER shrink into the distance: "
)
KEEPER_ID = (
    " The character is EXACTLY the same lamp keeper in every frame: a tall solemn"
    " hooded figure wearing a wide-brimmed dark charcoal hat, the face completely"
    " hidden in flat black shadow under the hat (NO visible face, no eyes), a long"
    " ragged dark grey-brown coat reaching the ground with a tattered hem, dark"
    " gloved hands, carrying one old square metal hand lantern with a warm dull"
    " orange flame glowing inside. Same three-quarter front viewpoint and same"
    " scale in all frames, solemn final-boss silhouette, readable at 64 pixels."
    " No scythe, no weapon, no gore, no extra people, no teeth."
    " STRICTLY exactly ONE figure in every frame - never a second person or"
    " human silhouette, not even inside the lamplight beam."
)
KEEPER_CONT = (
    " CRITICAL continuity with the first half: the SAME wide-brimmed dark"
    " charcoal hat with the face hidden in flat black shadow, the SAME long"
    " ragged dark grey-brown coat with tattered hem, the SAME square metal hand"
    " lantern with its warm dull orange flame, same three-quarter front"
    " viewpoint and scale, overall dark muted brightness identical to the first"
    " half. CRITICAL scale lock: EXACT same camera distance in every frame -"
    " the keeper stands the SAME height filling about 85% of the frame height"
    " in ALL frames, never smaller, never a warmer browner palette. He is"
    " STRICTLY ALONE - exactly ONE figure per frame, no second person, no"
    " silhouette inside the lamplight: "
)
FATHER_TEARS_ID = (
    " The character is EXACTLY the same small crying boy in every frame: messy"
    " dark shaggy hair, ONE hand always pressed flat over his face so the face is"
    " NEVER visible, the other arm free to move, oversized ragged dark olive-brown"
    " coat with a torn tattered hem worn over a dark grey shirt, dark cropped"
    " trousers, small dark shoes. The flying teardrops are large chunky rounded"
    " pale grey-blue pixel drops, NOT glossy, NOT neon. Child proportions,"
    " vulnerable scale, readable at 64 pixels. No weapon, no gore, no smile."
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
    # ── 你很优秀二阶段铺开 ──
    (
        "praise-p2-paper-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " paper-throw attack animation (a boss hurling a stack of documents"
        " sideways)." + PRAISE_DESK +
        "(1) sitting low and quiet in the chair, both arms resting down at his"
        " sides, cracks thin; (2) one arm lifting a thick stack of dusty"
        " pale-grey papers up beside his shoulder, torso turning slightly;"
        " (3) that arm winding back across his body, the paper stack tilted,"
        " shoulders twisted into the wind-up; (4) the arm mid-swing hurling"
        " sideways, the top papers starting to slide off the stack, short chunky"
        " motion streaks behind the arm. The papers are blank dusty pale-grey"
        " rectangles with NO readable text." + PRAISE_ID + PIXEL,
    ),
    (
        "praise-p2-paper-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous"
        " 8-frame paper-throw attack animation of this chair boss. Frame 5"
        " continues directly from the arm swinging sideways with papers sliding"
        " off the stack." + PRAISE_DESK +
        "(5) full sideways release - the arm fully extended out to the side, a"
        " fan of chunky blank dusty pale-grey rectangular papers flying away"
        " above the desk; (6) the papers spread at their widest mid-air, arm in"
        " follow-through across the body; (7) only two last papers fluttering"
        " down, the arm lowering back; (8) settled back into the low seated pose"
        " of frame 1, both arms down at his sides, no papers left. The papers"
        " have NO readable text." + PRAISE_ID + PIXEL,
    ),
    (
        "praise-p2-optimize-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " consume-task attack animation (the cracks in the chair back pull a"
        " small task shape in and swallow it)." + PRAISE_DESK +
        "(1) sitting low and quiet in the chair, arms down, black cracks thin;"
        " (2) one arm rising and pointing out to the side as if naming a target,"
        " cracks starting to widen; (3) the black cracks in the chair back"
        " opening into a plain dark gap (just a dark opening in the leather - NO"
        " teeth, NO tongue), a small blank dusty pale-grey rectangular task-note"
        " shape drifting in from the pointed side toward the chair; (4) the"
        " task-note shape pulled close to the wide dark crack gap, bending"
        " toward it." + PRAISE_ID + PIXEL,
    ),
    (
        "praise-p2-optimize-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous"
        " 8-frame consume-task attack animation of this chair boss. Frame 5"
        " continues directly from a small blank dusty pale-grey task-note shape"
        " being pulled into the wide dark crack gap in the chair back (the gap is"
        " a plain dark opening - NO teeth, NO tongue, NO blood)." + PRAISE_DESK +
        "(5) the task-note shape half swallowed into the dark crack gap, only"
        " its corner still visible; (6) the shape fully swallowed, the cracks"
        " bulging at their widest, a few chunky dust specks around the gap;"
        " (7) the cracks contracting, the gap almost closed, dust settling;"
        " (8) settled back into the low seated pose of frame 1, arms down,"
        " cracks back to thin." + PRAISE_ID + PIXEL,
    ),
    (
        "praise-p2-dismiss-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " dismissal-shout attack animation (the boss rears up and sweeps an arm"
        " to fire everyone)." + PRAISE_DESK +
        "(1) sitting low and quiet in the chair, arms down, cracks thin;"
        " (2) torso rising taller, shoulders tensing upward, cracks widening;"
        " (3) fully reared up at his tallest, both arms spread wide and high,"
        " every black crack opened wide; (4) one arm sweeping out in a hard flat"
        " dismissive backhand, short chunky motion streaks behind the arm, a"
        " thin dull dust ring starting to rise around the chair." + PRAISE_ID + PIXEL,
    ),
    (
        "praise-p2-dismiss-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous"
        " 8-frame dismissal-shout attack animation of this chair boss. Frame 5"
        " continues directly from the hard sweeping backhand with a thin dust"
        " ring rising." + PRAISE_DESK +
        "(5) SHOCKWAVE - a big chunky dull grey-brown dust ring bursting outward"
        " around the boss and desk (matte dust only, NO fire, NO flames, NO"
        " glow), the sweeping arm fully extended; (6) the dust ring at its"
        " widest, breaking apart into chunky dust pieces, torso still tall;"
        " (7) dust settling down, torso lowering back toward the chair;"
        " (8) settled back into the low seated pose of frame 1, arms down,"
        " cracks back to thin." + PRAISE_ID + PIXEL,
    ),
    (
        "praise-p2-one-seat-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " absorb-the-seat attack animation (the chair itself swells wider as if"
        " to swallow every other position)." + PRAISE_DESK +
        "(1) sitting low and quiet in the chair, arms down, cracks thin;"
        " (2) both arms spreading slowly outward, the dark cracked chair back"
        " beginning to widen behind the shoulders; (3) the chair back bulging"
        " and spreading clearly wider than normal, cracks stretching across the"
        " new leather mass; (4) arms spread at their widest, the swollen chair"
        " back at its widest, every crack opened." + PRAISE_ID + PIXEL,
    ),
    (
        "praise-p2-one-seat-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous"
        " 8-frame absorb-the-seat attack animation of this chair boss. Frame 5"
        " continues directly from the arms and swollen chair back spread at"
        " their widest." + PRAISE_DESK +
        "(5) both arms sweeping forward and inward in a huge gathering hug"
        " motion, the widened chair mass folding inward with them; (6) everything"
        " clenched inward at the tightest, shoulders hunched, cracks pressed"
        " into thick dark lines, a few chunky dust specks squeezed out;"
        " (7) the chair mass relaxing back toward its normal width, arms"
        " lowering; (8) settled back into the low seated pose of frame 1, chair"
        " back at normal width, cracks back to thin." + PRAISE_ID + PIXEL,
    ),
    # ── 末班车：冲刺进站 ──
    (
        "bus-depart-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " station-sprint attack animation of a haunted last night bus:"
        " (1) standing still at rest, folding doors on the side fully open,"
        " window lights a calm dull warm yellow; (2) the doors snapped shut,"
        " headlights brightening, body rocking slightly backward onto the rear"
        " wheels; (3) deep wind-up - whole body tilted back, front wheels almost"
        " light, one small chunky grey exhaust puff behind the rear;"
        " (4) launching forward-left into the sprint, body tilted nose-down,"
        " short chunky grey speed streaks and exhaust puffs starting behind"
        " it." + BUS_ID + PIXEL,
    ),
    (
        "bus-depart-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous"
        " 8-frame station-sprint attack animation of this night bus. Frame 5"
        " continues directly from the bus launching forward-left with short"
        " speed streaks behind it." + BUS_CONT +
        "(5) full sprint - the body stretched slightly long, a chunky grey"
        " speed-wake of straight pixel streaks and exhaust puffs trailing behind"
        " the rear, headlights at their brightest; (6) still at top speed, the"
        " speed-wake at its longest; (7) braking hard - nose dipping down, body"
        " compressed slightly short, chunky dust puffs bursting at the wheels,"
        " wake fading; (8) fully stopped and settled level, folding doors open"
        " again, window lights back to calm dull warm yellow like frame"
        " 1." + BUS_ID + PIXEL,
    ),
    # ── 收灯人：点名 / 收灯 ──
    (
        "keeper-name-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " naming attack animation (the keeper lifts his lantern and points to"
        " name a target): (1) standing still and solemn, the lantern hanging low"
        " at his side, flame small and dim, the empty hand resting; (2) lifting"
        " the lantern up to chest height, the flame inside growing brighter;"
        " (3) raising the lantern high overhead, the flame at its brightest -"
        " ALL light stays INSIDE the lantern glass, absolutely NO light beam,"
        " NO cone, NO glow spilling outside the lantern (the game engine draws"
        " the light cone itself); (4) lantern held high, the empty hand"
        " starting to rise and reach forward." + KEEPER_ID + PIXEL,
    ),
    (
        "keeper-name-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous"
        " 8-frame naming attack animation of this lamp keeper. Frame 5 continues"
        " directly from the lantern held high overhead with the empty hand"
        " rising." + KEEPER_CONT +
        "(5) the empty hand fully extended forward with one finger pointing to"
        " name a target, lantern still high overhead; (6) holding the pointing"
        " pose, the lantern flame flaring slightly brighter and warmer orange"
        " (NO large light cone, NO green light, only a small warm orange glow"
        " tight around the lantern); (7) the pointing arm lowering, the lantern coming down to"
        " chest height, glow shrinking; (8) back to standing still and solemn"
        " like frame 1, lantern hanging low at his side, flame small and"
        " dim." + KEEPER_ID + PIXEL,
    ),
    (
        "keeper-strip-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " light-stripping attack animation (the keeper pulls a ribbon of light"
        " into his lantern): (1) standing still and solemn, the lantern hanging"
        " low at his side, flame small and dim; (2) holding the lantern forward"
        " at chest height and opening its small metal door, the empty hand"
        " reaching toward it; (3) the empty hand stretched out forward, palm"
        " open, lantern door open and waiting; (4) a narrow ribbon of warm dull"
        " orange light beginning to stream in from the open side of the frame"
        " toward the open lantern door." + KEEPER_ID + PIXEL,
    ),
    (
        "keeper-strip-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous"
        " 8-frame light-stripping attack animation of this lamp keeper. Frame 5"
        " continues directly from a narrow ribbon of warm dull orange light"
        " streaming toward the open lantern door." + KEEPER_CONT +
        "(5) the ribbon of light streaming strongly into the open lantern, the"
        " flame inside growing taller; (6) the last of the ribbon pulled in, the"
        " lantern glowing at its brightest, keeper hunched slightly over it;"
        " (7) snapping the small lantern door shut, the glow settling back down;"
        " (8) back to standing still and solemn like frame 1, lantern hanging"
        " low at his side with a small steady flame." + KEEPER_ID + PIXEL,
    ),
    # ── 沉默的父亲二阶段补全 ──
    (
        "father-tantrum-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " tantrum-stomp attack animation (a hurt child stamping his feet in a"
        " furious tantrum while hiding his face): (1) standing hunched and"
        " still, hands over face, coat hanging straight; (2) crouching down"
        " slightly, shoulders shaking, coat hem trembling; (3) stamping the left"
        " foot down hard, a small chunky dust puff at that foot, body twisting;"
        " (4) stamping the right foot down hard, another small dust puff, the"
        " coat swinging the other way." + FATHER_ID + PIXEL,
    ),
    (
        "father-tantrum-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous"
        " 8-frame tantrum-stomp attack animation of this boy. Frame 5 continues"
        " directly from the right-foot stomp with a small dust puff." + FATHER_CONT +
        "(5) hopping a little off the ground, both knees pulled up mid-tantrum,"
        " coat flaring; (6) landing with BOTH feet stomping down together - the"
        " biggest chunky dust puffs bursting out on both sides, coat flared"
        " wide; (7) aftershock - knees bent low, dust fading, coat settling;"
        " (8) back to the hunched standing pose of frame 1, hands over face,"
        " coat hanging straight." + FATHER_ID + PIXEL,
    ),
    (
        "father-tears-a",
        GRID + "These are frames 1-4, the FIRST half of one continuous 8-frame"
        " tear-volley attack animation (a hurt child wiping his face and"
        " flinging a fan of heavy tears): (1) standing hunched and still, both"
        " hands pressed over his face, coat hanging straight; (2) one hand"
        " stays pressed over the face, the other hand wiping down across it and"
        " collecting three large chunky rounded pale grey-blue teardrops;"
        " (3) the free arm winding back low behind him, holding the cluster of"
        " chunky teardrops, body twisting into the wind-up; (4) the arm swinging"
        " forward fast, the first teardrop just leaving the"
        " hand." + FATHER_TEARS_ID + PIXEL,
    ),
    (
        "father-tears-b",
        GRID + "These are frames 5-8, the SECOND half of the same continuous"
        " 8-frame tear-volley attack animation of this boy. Frame 5 continues"
        " directly from the arm swinging forward with the first teardrop leaving"
        " the hand." + FATHER_CONT +
        "(5) full sideways fling - the free arm fully extended, a fan of large"
        " chunky rounded pale grey-blue teardrops flying away from the hand;"
        " (6) follow-through - the teardrops spread in a wide fan in the air,"
        " arm swung across the body; (7) the arm dropping back down, only one"
        " last teardrop falling; (8) back to the hunched standing pose of frame"
        " 1, BOTH hands pressed over the face, coat hanging"
        " straight." + FATHER_TEARS_ID + PIXEL,
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
        max_attempts = 10  # 端点偶发 503/断连，快失败 + 25s 退避比 3 次×8s 更扛得住
        for attempt in range(1, max_attempts + 1):
            try:
                generate(base_url, api_key, name, prompt)
                break
            except Exception as error:  # noqa: BLE001 — 逐条容错，断点续跑
                print(f"{name}: attempt {attempt} failed · {error}", flush=True)
                if attempt == max_attempts:
                    failures.append(name)
                else:
                    time.sleep(25)
    if failures:
        sys.exit(f"FAILED: {', '.join(failures)}")
    print("all done", flush=True)


if __name__ == "__main__":
    main()
