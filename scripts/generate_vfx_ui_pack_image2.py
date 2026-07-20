#!/usr/bin/env python3
"""VFX/UI 资源包基底生成：弹体、命中特效、免死演出、协同、状态标记、
卡框、档案饰件、房间内景、地面、五毒图腾、章节字卡、命运纹样、结局、宣传。

grid 模式=绿幕 2x2 格（后续按格切）；full 模式=整幅画（无绿幕）。
断点续跑：已存在的文件跳过；命令行传文件名（不含 .png）可强制重跑指定条目。
用法：IMAGE2_API_KEY=... [IMAGE2_BASE_URL=...] python3 scripts/generate_vfx_ui_pack_image2.py [名字...]
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("IMAGE2_BASE_URL", "https://api.gbgjxj.store/v1")
MODEL = "gpt-image-2"
RAW_DIR = Path("output/imagegen/zhe-yi-shen-vfx-ui-v1/raw")

PIXEL = (
    "Chunky low-resolution pixel art, crisp hard pixels, no anti-aliasing, no gradients, "
    "muted dark fairytale palette: deep ink purple-grey, worn browns, faded paper cream, "
    "occasional dull red or cold blue accent. Absolutely no text, no letters, no numbers."
)
GRID = (
    "2x2 grid on solid pure green background (#00FF00), four separate elements, each centered "
    "in its own quadrant, no overlap, no grid lines. " + PIXEL
)

# (名字, 模式 grid|full, 提示词)
SPECS: list[tuple[str, str, str]] = [
    # ── 弹体（孤立实物，无场景背景）─────────────────────────────
    ("proj-breath", "grid", GRID + " Elements: (1) a very loose wispy puff of pale moon-white breath fog, barely holding together, (2) a half-condensed round fog puff with soft edge, (3) a firm dense fog orb with defined silhouette, (4) a hard condensed orb with a bright pale core. All pale moon-white and cool grey, isolated objects, no background scene."),
    ("proj-forms", "grid", GRID + " Elements: (1) a small folded paper note shard seen edge-on flying, cream paper, (2) an elongated falling water drop, cold blue-grey, (3) a thin concentric double ring sound wave, teal, (4) an old worn brass key seen from the side. Isolated objects, no background scene."),
    ("proj-special", "grid", GRID + " Elements: (1) a short bolt made of three small vertebra bone segments in a row, bone cream, (2) one single large falling tear drop with a tiny highlight, (3) a wide flat cone of exhaled breath fog spreading to the right, pale moon-white, (4) two overlapping faint round fog puffs, the rear one more transparent, echo feeling. Isolated objects, no background scene."),
    # ── 命中/消散特效（每张 2x2 = 4 帧动画序列）───────────────────
    ("hit-mist", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a small puff of pale moon-white fog bursting and dissipating into thin wisps, frame 1 tight burst, frame 4 almost gone. Isolated effect on green, no background."),
    ("hit-water", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a small cold blue-grey water splash bursting outward into droplets and settling, frame 1 tight impact, frame 4 last falling drops. Isolated effect on green, no background."),
    ("hit-crit", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a pale warm gold four-pointed star flash expanding then collapsing, frame 1 small bright point, frame 2 full star, frame 4 fading sparks. Isolated effect on green, no background."),
    ("hit-paper", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a few cream paper scraps bursting outward and fluttering down, frame 1 tight bunch, frame 4 scattered falling pieces. Isolated effect on green, no background."),
    # ── 免死演出 ────────────────────────────────────────────────
    ("save-tooth", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a single small white milk tooth cracking, frame 1 whole tooth with a hairline crack, frame 2 crack spreading, frame 3 splitting into shards, frame 4 shards scattering with tiny pale sparks. Isolated on green."),
    ("save-photo", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): a small old framed portrait photo flashing, frame 1 dark frame, frame 2 frame glowing bright white, frame 3 white light spilling out, frame 4 dimming back with a faint afterglow. Isolated on green."),
    ("save-static", "full", "Full-frame analog CRT television static noise texture, dense random monochrome snow pixels, subtle horizontal scanline bands, dark grey and pale grey speckle, seamless texture feeling, no recognizable shapes. " + PIXEL),
    ("save-shutdown", "grid", GRID + " Four animation frames of the same effect, order (1)(2)(3)(4): an old CRT screen turning off, frame 1 full pale glowing rectangle, frame 2 collapsing into a bright horizontal line, frame 3 the line shrinking to a small bright dot, frame 4 tiny fading dot in darkness. Isolated on green."),
    # ── 协同「成双」静态覆盖 + 状态标记 ──────────────────────────
    ("syn-overlays", "grid", GRID + " Elements: (1) a small cluster of sharp ice crystals growing upward, cold pale blue, (2) a star of thin dark crack lines as on old porcelain, (3) a small collapsing plume of dust and debris falling inward, grey-brown, (4) two short jagged electric arcs, pale cold white-blue. Isolated effects on green, no background."),
    ("status-marks", "grid", GRID + " Elements, each a tiny simple game status icon: (1) a minimal ice crystal snowflake, (2) a tiny electric spark zigzag, (3) a tiny rounded chat bubble containing two small check marks, (4) a small circular loop of two arrows chasing each other. Bold minimal silhouettes, isolated on green."),
    # ── 五毒图腾 + 摇杆 ─────────────────────────────────────────
    ("poison-a", "grid", GRID + " Elements, each a small quiet emblem drawn as an everyday object, no faces: (1) a cupped hand closing around one coin, (2) a single thin flame rising from a matchstick, (3) a moth pressed against a glowing lamp glass, (4) a slightly tilted paper crown. Muted colors, isolated on green."),
    ("poison-b", "grid", GRID + " Elements: (1) a short rope tied into a tangled knot with both ends loose, (2) a flat worn stone ring pad seen from above, subtle concentric grooves, dark neutral, (3) a small round worn stone cap seen from above with a soft center dimple, dark neutral, (4) a small dark red wax seal stamp with an illegible relief. Isolated on green."),
    # ── 卡框（中心必须纯绿，供程序抠空）──────────────────────────
    ("frame-quality", "grid", GRID + " Elements, each a thin rectangular horizontal FRAME BORDER only, landscape ratio about 2.3:1, the inside of each frame is pure green (#00FF00) empty: (1) a plain single-line worn dark border, (2) a double-line border with small corner ticks, aged brown, (3) a border with tiny stitched dashes and one small dark red corner seal, (4) an ornate but restrained border with faded dull gold corner filigree. Only borders, hollow centers."),
    ("frame-panels", "grid", GRID + " Elements: (1) a large thin rectangular portrait FRAME BORDER with hollow pure green center, quiet worn paper-edge style with corner folds, (2) a small horizontal button frame border with hollow green center, single worn line with notched corners, (3) a horizontal strip of torn paper edge, cream, ragged lower edge, (4) a horizontal strip of receipt paper edge with a row of small punched holes. Only borders and strips, hollow centers where stated."),
    # ── 档案饰件 + 桌面 ─────────────────────────────────────────
    ("archive-deco", "grid", GRID + " Elements: (1) two short strips of translucent aged sticky paper tape, cream-yellow, (2) a slightly bent metal paperclip, (3) a faded round postmark ring stamp with an illegible center, dull ink blue, (4) a rectangular dark red ink seal stamp, edges unevenly inked, illegible relief. Isolated objects on green."),
    ("archive-desk", "full", "Full-frame top-down view of a dark worn wooden desk surface, old lacquer rubbed off in places, faint ring stains from cups, one shallow scratch, very dark and quiet, mostly uniform so paper documents can sit on top. " + PIXEL),
    # ── 房间内景（整幅，竖屏构图，中部留空给 UI）─────────────────
    ("room-lamp", "full", "Vertical portrait pixel art scene: a tiny dark room at night where one warm desk lamp has been left on, the lamp stands on a small table to one side, warm pool of light on the floor, a folded blanket and a cup still steaming faintly, walls fade into darkness, middle of the image relatively empty and dark so interface text can sit there, quiet and kind mood. " + PIXEL),
    ("room-inner", "full", "Vertical portrait pixel art scene: a dark inner room behind a curtain, the curtain half open at the top, a single cold small bulb hanging, shelves with indistinct wrapped bundles at the sides, floor boards dark, middle of the image relatively empty and very dark so interface text can sit there, uneasy quiet mood, nothing supernatural, no faces. " + PIXEL),
    ("room-pawn", "full", "Vertical portrait pixel art scene: inside a cramped unnamed pawnshop at night, a worn wooden counter at the bottom edge, shelves with tagged bundles and boxes rising at both sides, one dim hanging bulb, dust in the light, middle of the image relatively empty and dark so interface text can sit there. " + PIXEL),
    # ── 地面材质（整幅可平铺感）──────────────────────────────────
    ("ground-a", "grid", GRID + " Elements, each a small square swatch of floor material seen top-down, flat, tileable feeling, very dark and low contrast: (1) worn dark wooden floor planks, (2) old terrazzo school floor with tiny speckles, (3) grey office carpet with faint weave, (4) pale-green hospital vinyl floor with subtle sheen lines. Swatches fill their quadrants fully."),
    ("ground-b", "grid", GRID + " Elements, each a small square swatch of floor material seen top-down, flat, tileable feeling, very dark and low contrast: (1) dark riveted metal plate floor with faint gear-tooth imprints, (2) night asphalt with tiny cold speckles, (3) plain packed dark earth, (4) dark dusty concrete. Swatches fill their quadrants fully."),
    # ── 章节字卡小景 ────────────────────────────────────────────
    ("chapter-a", "grid", GRID + " Elements, each a tiny quiet scene vignette in a small rectangle: (1) the dark space under a bed with one golden rattle bell lying on the floorboards, (2) a school desk edge with a stub of chalk and an eraser, (3) interlocking rusty gears against darkness, (4) an office cubicle corner with a dim monitor glow. No people. Vignettes fill their quadrants."),
    ("chapter-b", "grid", GRID + " Elements, each a tiny quiet scene vignette in a small rectangle: (1) a hospital bed side rail with an IV stand silhouette, (2) one street lamp cone of light on wet night pavement, (3) a windowsill at night with a cooling cup of tea, (4) an empty coat hook on a dark wall. No people. Vignettes fill their quadrants."),
    # ── 命运 profile 纹样 ───────────────────────────────────────
    ("fate-profile-a", "grid", GRID + " Elements, each a small quiet emblem, no faces: (1) a thin warm light leaking through a door crack, (2) two open hands exchanging a small parcel, (3) a boiled sweet in a shiny wrapper with a thin thread tied to it, (4) a fishhook hidden inside a piece of bread. Muted, isolated on green."),
    ("fate-profile-b", "grid", GRID + " Elements, each a small quiet emblem, no faces: (1) an umbrella turned inside out by wind, (2) an old telephone handset resting off the hook, cord coiled, (3) an empty chair facing a wall, (4) a curtain drawn shut with light behind it. Muted, isolated on green."),
    # ── 结局 + 宣传 ─────────────────────────────────────────────
    ("ending-table", "full", "Vertical portrait pixel art scene: a plain table under one cold ceiling light at night, personal belongings laid out in a careful row on the table like evidence: a key, a folded jacket, a small bottle, an envelope, a watch, a marble, seen at a slight angle, background pure darkness, upper third of image empty darkness so text can sit there, quiet museum-of-a-life mood, no people. " + PIXEL),
    ("ending-lampman", "full", "Vertical portrait pixel art scene: one tall street lamp at night casting a warm cone of light on the ground, a quiet figure in a long coat and wide-brimmed hat standing just inside the edge of the light holding a small unlit lantern, face completely in shadow, gentle not menacing, darkness all around, lower third mostly dark ground. " + PIXEL),
    ("promo-cover", "full", "Vertical portrait pixel art poster composition: a small dark bedroom scene at night seen from the front, a lone small pixel figure standing in the center surrounded by towering piles of everyday life objects fading up into darkness — schoolbags, desks, clocks, bottles, envelopes, a hanging necktie — one warm lamp glow from one side, melancholic dark fairytale mood, no text anywhere, generous empty dark space at top for a title. " + PIXEL),
    ("promo-banner", "full", "Wide horizontal pixel art banner composition: a night road lit by a row of street lamps stretching right, a small pixel figure walking away carrying an oversized bundle of everyday objects on his back — a schoolbag, a clock, an envelope, a kettle — each lamp pool of light a different faint color of a life stage, melancholic but gently humorous dark fairytale mood, no text anywhere. " + PIXEL),
]


def generate(name: str, prompt: str, api_key: str) -> None:
    body = json.dumps({
        "model": MODEL, "prompt": prompt, "size": "1024x1024", "n": 1,
    }).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=body,
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = json.load(response)
    image = base64.b64decode(payload["data"][0]["b64_json"])
    (RAW_DIR / f"{name}.png").write_bytes(image)
    print(f"{name}: {len(image)} bytes", flush=True)


def main() -> None:
    api_key = os.environ.get("IMAGE2_API_KEY", "")
    if not api_key:
        sys.exit("IMAGE2_API_KEY not set")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    failures: list[str] = []
    for name, _mode, prompt in SPECS:
        if only and name not in only:
            continue
        if not only and (RAW_DIR / f"{name}.png").exists():
            print(f"{name}: exists, skip", flush=True)
            continue
        for attempt in (1, 2, 3):
            try:
                generate(name, prompt, api_key)
                break
            except Exception as error:  # noqa: BLE001 — 断点续跑，逐条容错
                print(f"{name}: attempt {attempt} failed · {error}", flush=True)
                if attempt == 3:
                    failures.append(name)
                else:
                    time.sleep(8)
    if failures:
        print(f"FAILED: {', '.join(failures)}", flush=True)
        sys.exit(1)
    print("all done", flush=True)


if __name__ == "__main__":
    main()
