#!/usr/bin/env python3
"""把运行时图集切成循环 GIF，供百科词条页内嵌动画使用。

输出 docs/assets/wiki/gif/**（deploy_wiki.sh 会随 docs/assets 一起 rsync 上线）。
幂等：重跑整体覆盖。图帧全部合成到夜桌底色上（GIF 无半透明）。
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/assets/wiki/gif"
BG = (16, 16, 20)  # 与百科图片底色 #101014 一致

ENEMY_DIR = ROOT / "src/assets/enemies"
SKILL_V1 = ENEMY_DIR / "boss-skills-v1"
SKILL_V2 = ENEMY_DIR / "boss-skills-v2"
HERO_DIR = ROOT / "src/assets/hero-style1-profiles"
VFX = ROOT / "src/assets/vfx"

ENEMY_MOTIONS = ["idle", "move", "attack", "hurt", "death"]
HERO_MOTION_FRAMES = {"idle": 2, "walk": 4, "attack": 2, "hurt": 2}
HERO_W, HERO_H = 40, 56
HERO_PROFILE_ROW = (1 * 4 + 1) * 4  # 平均身高×平均体格 front


def scale_for(frame: int) -> int:
    return max(1, min(4, 144 // frame + (1 if frame <= 32 else 0)))


def frame_nonempty(cell: Image.Image) -> bool:
    alpha = cell.getchannel("A")
    return alpha.getbbox() is not None


def save_gif(frames: list[Image.Image], path: Path, duration: int, scale: int) -> bool:
    if not frames:
        return False
    rendered_rgb = []
    for cell in frames:
        base = Image.new("RGBA", cell.size, BG + (255,))
        base.alpha_composite(cell)
        if scale > 1:
            base = base.resize((base.width * scale, base.height * scale), Image.NEAREST)
        rendered_rgb.append(base.convert("RGB"))

    # GIF 的后续帧如果各自带一套自适应色板，Pillow 在优化时会沿用首帧
    # 索引，结果就会把原来的紫灰色错误解释成红绿蓝“彩虹色”。先把整组
    # 动画拼在一起求一套共享色板，再让每帧按同一色板量化。
    sheet = Image.new(
        "RGB",
        (rendered_rgb[0].width * len(rendered_rgb), rendered_rgb[0].height),
        BG,
    )
    for index, frame in enumerate(rendered_rgb):
        sheet.paste(frame, (index * frame.width, 0))
    palette = sheet.quantize(
        colors=128,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    rendered = [
        frame.quantize(palette=palette, dither=Image.Dither.NONE)
        for frame in rendered_rgb
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered[0].save(
        path, save_all=True, append_images=rendered[1:],
        duration=duration, loop=0, optimize=False, disposal=2,
    )
    return True


def build_enemies() -> int:
    count = 0
    for atlas_path in sorted(ENEMY_DIR.glob("*.png")):
        atlas = Image.open(atlas_path).convert("RGBA")
        frame = atlas.width // 4
        if frame == 0 or atlas.height % frame:
            continue
        rows = atlas.height // frame
        for row in range(min(rows, len(ENEMY_MOTIONS))):
            cells = []
            for col in range(4):
                cell = atlas.crop((col * frame, row * frame, (col + 1) * frame, (row + 1) * frame))
                if frame_nonempty(cell):
                    cells.append(cell)
            if len(cells) < 2:
                continue
            motion = ENEMY_MOTIONS[row]
            if save_gif(
                cells,
                OUT / "enemy" / f"{atlas_path.stem}-{motion}.gif",
                duration=170 if motion in ("idle", "move") else 140,
                scale=scale_for(frame),
            ):
                count += 1
    return count


def build_boss_skills() -> int:
    manifest = json.loads((SKILL_V1 / "manifest.json").read_text())
    count = 0
    for skill_id, spec in manifest["skills"].items():
        atlas = Image.open(SKILL_V1 / f"{spec['asset']}.png").convert("RGBA")
        frame = manifest["assets"][spec["asset"]]["frame"]
        row = spec["row"]
        cells = [
            atlas.crop((col * frame, row * frame, (col + 1) * frame, (row + 1) * frame))
            for col in range(4)
        ]
        cells = [c for c in cells if frame_nonempty(c)]
        if save_gif(
            cells,
            OUT / "boss-skill" / f"{skill_id}.gif",
            duration=190,
            scale=scale_for(frame),
        ):
            count += 1
    v2 = json.loads((SKILL_V2 / "manifest.json").read_text())
    for skill_id, spec in v2["skills"].items():
        strip = Image.open(SKILL_V2 / spec["atlas"]).convert("RGBA")
        frame = spec["frame"]
        cells = [
            strip.crop((i * frame, 0, (i + 1) * frame, frame))
            for i in range(spec["frames"])
        ]
        cells = [c for c in cells if frame_nonempty(c)]
        if save_gif(
            cells,
            OUT / "boss-skill-8f" / f"{skill_id}.gif",
            duration=110,
            scale=scale_for(frame),
        ):
            count += 1
    return count


def build_npc() -> int:
    """友军 NPC 的动作循环。小张是设计上横穿青年到中年的人物，
    但他不在 enemies.json 里（不是敌人），此前百科完全没有他的图。"""
    made = 0
    manifest_path = ROOT / "src/assets/characters/xiao-zhang.json"
    if not manifest_path.exists():
        return 0
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    atlas = Image.open(ROOT / manifest["atlas"]).convert("RGBA")
    fw, fh = manifest["frame"]["width"], manifest["frame"]["height"]
    for action, spec in manifest["actions"].items():
        row = spec["row"]
        cells = [
            atlas.crop((i * fw, row * fh, (i + 1) * fw, (row + 1) * fh))
            for i in range(spec["frames"])
        ]
        if save_gif(cells, OUT / "npc" / f"xiao-zhang-{action}.gif", duration=200, scale=3):
            made += 1
    return made


def build_hero() -> int:
    count = 0
    top = HERO_PROFILE_ROW * HERO_H
    for motion, frames in HERO_MOTION_FRAMES.items():
        for coat in (False, True):
            cells = []
            base_atlas = Image.open(HERO_DIR / f"hero-{motion}.png").convert("RGBA")
            coat_atlas = Image.open(HERO_DIR / f"raincoat-{motion}.png").convert("RGBA") if coat else None
            for i in range(frames):
                cell = base_atlas.crop((i * HERO_W, top, (i + 1) * HERO_W, top + HERO_H)).copy()
                if coat_atlas is not None:
                    cell.alpha_composite(coat_atlas.crop((i * HERO_W, top, (i + 1) * HERO_W, top + HERO_H)))
                cells.append(cell)
            name = f"hero-{motion}" + ("-raincoat" if coat else "")
            if save_gif(cells, OUT / "hero" / f"{name}.gif", duration=200, scale=3):
                count += 1
    return count


def build_vfx() -> int:
    count = 0
    # 弹体飞行 21 形态 · 4 帧 @10fps
    manifest = json.loads((VFX / "projectile-anim.json").read_text())
    atlas = Image.open(VFX / "projectile-anim.png").convert("RGBA")
    cell, cols = manifest["cell"], manifest["cols"]
    for form in manifest["forms"]:
        frames = []
        for frame_index in range(4):
            key = f"{form}{frame_index}"
            index = manifest["index"][key]
            row, col = divmod(index, cols)
            frames.append(
                atlas.crop((col * cell, row * cell, (col + 1) * cell, (row + 1) * cell))
            )
        frames = [f for f in frames if frame_nonempty(f)]
        if save_gif(frames, OUT / "projectile" / f"{form}.gif", duration=100, scale=4):
            count += 1
    # 命中特效 11 材质 · 4 帧
    hits = json.loads((VFX / "hits.json").read_text())
    hit_atlas = Image.open(VFX / "hits.png").convert("RGBA")
    hc = hits["cell"]
    for row, material in enumerate(hits["materials"]):
        frames = [
            hit_atlas.crop((i * hc, row * hc, (i + 1) * hc, (row + 1) * hc))
            for i in range(hits["cols"])
        ]
        frames = [f for f in frames if frame_nonempty(f)]
        if save_gif(frames, OUT / "hit" / f"{material}.gif", duration=120, scale=4):
            count += 1
    # 免死演出 3 种 · 4 帧
    saves = json.loads((VFX / "saves.json").read_text())
    save_atlas = Image.open(VFX / "saves.png").convert("RGBA")
    sc = saves["cell"]
    for row, kind in enumerate(saves["kinds"]):
        frames = [
            save_atlas.crop((i * sc, row * sc, (i + 1) * sc, (row + 1) * sc))
            for i in range(saves["cols"])
        ]
        frames = [f for f in frames if frame_nonempty(f)]
        if save_gif(frames, OUT / "save" / f"{kind}.gif", duration=150, scale=3):
            count += 1
    return count


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)
    stats = {
        "enemy": build_enemies(),
        "boss-skill": build_boss_skills(),
        "hero": build_hero(),
        "npc": build_npc(),
        "vfx": build_vfx(),
    }
    total_bytes = sum(p.stat().st_size for p in OUT.rglob("*.gif"))
    total_files = len(list(OUT.rglob("*.gif")))
    generated = sum(stats.values())
    if total_files != generated:
        raise AssertionError(f"GIF 计数不一致：统计 {generated}，实际 {total_files}")
    print(f"gifs: {stats} · {total_files} files · {total_bytes / 1024:.0f} KB")


if __name__ == "__main__":
    main()
