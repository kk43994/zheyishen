#!/usr/bin/env python3
"""Render candidate sprites at their proposed in-game display sizes."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
TASK_DIR = ROOT / "scripts/image2/enemy-roster-v1"
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-enemy-roster-v1"
REVIEW_DIR = ROOT / "output/art-audit-loop/new-enemy-roster-v1"
STAGE_NAMES = ("童年", "少年", "青年", "成年", "中年", "暮年")
CARD_W = 420
CARD_H = 250
HEADER_H = 54
PAGE_BG = (17, 17, 22, 255)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    )
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size, index=2 if bold and path.name == "PingFang.ttc" else 0)
    return ImageFont.load_default()


def nearest(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    return source.resize(size, Image.Resampling.NEAREST)


def hero_frame() -> Image.Image:
    atlas = Image.open(ROOT / "src/assets/hero-style1-profiles/hero-idle.png").convert("RGBA")
    return atlas.crop((0, 0, 40, 56))


def stage_panel(index: int) -> Image.Image:
    floor = Image.open(ROOT / f"src/assets/world/stage-floor-{index}.png").convert("RGBA")
    panel = floor.crop((0, 210, 360, 410))
    shade = Image.new("RGBA", panel.size, (8, 8, 12, 42))
    return Image.alpha_composite(panel, shade)


def build_card(entry: dict[str, object], names: dict[str, str], hero: Image.Image) -> Image.Image:
    card = Image.new("RGBA", (CARD_W, CARD_H), (27, 26, 32, 255))
    draw = ImageDraw.Draw(card)
    stage = int(entry["stage"])
    world = stage_panel(stage)
    card.alpha_composite(world, (30, 46))

    frame = int(entry["frame"])
    display = int(entry["display"])
    atlas = Image.open(OUT_DIR / "candidate-atlases" / f"{entry['assetId']}.png").convert("RGBA")
    idle = atlas.crop((0, 0, frame, frame))
    sprite = nearest(idle, (display, display))
    baseline = 220
    enemy_x = 116 - display // 2
    enemy_y = baseline - display
    card.alpha_composite(sprite, (enemy_x, enemy_y))

    hero_size = (35, 49)
    hero_sprite = nearest(hero, hero_size)
    hero_x = 275 - hero_size[0] // 2
    hero_y = baseline - hero_size[1]
    card.alpha_composite(hero_sprite, (hero_x, hero_y))

    asset_id = str(entry["assetId"])
    phase = entry.get("phase")
    phase_label = f" · P{phase}" if phase is not None else ""
    draw.text((12, 9), f"{STAGE_NAMES[stage]} · {names[asset_id]}{phase_label}", fill="#eee7da", font=font(17, True))
    draw.text((12, 29), f"{asset_id} · frame {frame}px → display {display}px", fill="#aaa297", font=font(11))
    draw.text((74, 225), "候选敌人", fill="#aaa297", font=font(11))
    draw.text((247, 225), "当前主角 35×49", fill="#aaa297", font=font(11))
    draw.rectangle((0, 0, CARD_W - 1, CARD_H - 1), outline="#4a454b")
    return card


def main() -> None:
    plan = json.loads((TASK_DIR / "integration-plan.json").read_text(encoding="utf-8"))
    roster = json.loads((TASK_DIR / "roster.json").read_text(encoding="utf-8"))
    assert plan["status"] == "approved-and-promoted"
    assert plan["promotionAllowed"] is True
    names = {entry["id"]: entry["name"] for entry in roster["assets"]}
    hero = hero_frame()
    outputs: list[str] = []
    for page_index in range(2):
        page_entries = plan["entries"][page_index * 10:(page_index + 1) * 10]
        page = Image.new("RGBA", (CARD_W * 2 + 36, CARD_H * 5 + HEADER_H + 14), PAGE_BG)
        draw = ImageDraw.Draw(page)
        draw.text((18, 14), f"《这一身》候选敌人 · 实际世界尺寸预审 {page_index + 1}/2", fill="#eee7da", font=font(23, True))
        for index, entry in enumerate(page_entries):
            row, column = divmod(index, 2)
            page.alpha_composite(build_card(entry, names, hero), (14 + column * (CARD_W + 8), HEADER_H + row * CARD_H))
        filename = f"runtime-scale-review-{page_index + 1}.png"
        page.convert("RGB").save(REVIEW_DIR / filename, optimize=True)
        outputs.append(filename)
    manifest_path = REVIEW_DIR / "manifest.json"
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["runtimeScalePages"] = outputs
        manifest["integrationPlan"] = str(TASK_DIR / "integration-plan.json")
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"built {len(outputs)} runtime-scale review boards")


if __name__ == "__main__":
    main()
