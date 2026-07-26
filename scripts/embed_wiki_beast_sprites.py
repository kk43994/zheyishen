#!/usr/bin/env python3
"""Build wiki portraits from the exact enemy atlases consumed at runtime."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


WIKI = Path("docs/这一身百科.html")
OUTPUT_DIR = Path("docs/enemy-portraits-v1")
PORTRAIT_SIZE = 64


@dataclass(frozen=True)
class EnemyPortrait:
    name: str
    asset_id: str
    source: Path
    frame_size: int


# Keep this in the same order as the canonical cards in the wiki.
PORTRAITS = (
    EnemyPortrait("床下的呼吸", "fear", Path("src/assets/enemies/fear.png"), 32),
    EnemyPortrait("红叉", "red-mark", Path("src/assets/enemies/red-mark.png"), 32),
    EnemyPortrait("他们都在说", "whisper", Path("src/assets/enemies/whisper.png"), 32),
    EnemyPortrait("打卡齿轮", "clockwork", Path("src/assets/enemies/clockwork.png"), 32),
    EnemyPortrait("下个月账单", "debt", Path("src/assets/enemies/debt.png"), 32),
    EnemyPortrait("统一答案", "uniform-answer", Path("src/assets/enemies/uniform-answer-hd.png"), 48),
    EnemyPortrait("沉默的自己", "silent-father", Path("src/assets/enemies/silent-father-hd.png"), 64),
    EnemyPortrait("收灯人", "lamp-keeper", Path("src/assets/enemies/lamp-keeper-hd.png"), 64),
    EnemyPortrait("衣柜里那身衣服", "closet-clothes", Path("src/assets/enemies/closet-clothes.png"), 48),
    EnemyPortrait("贴满墙的排名", "wall-ranking", Path("src/assets/enemies/wall-ranking.png"), 48),
    EnemyPortrait("窗边那张空工位", "window-desk", Path("src/assets/enemies/window-desk.png"), 48),
    EnemyPortrait("饭桌上没说完的话", "father-silence", Path("src/assets/enemies/father-silence.png"), 48),
    EnemyPortrait("不知道是谁的纸箱", "whose-box", Path("src/assets/enemies/whose-box.png"), 48),
    EnemyPortrait("滴完的输液架", "iv-stand", Path("src/assets/enemies/iv-stand.png"), 48),
    EnemyPortrait("没人相信的怪物", "closet-dark", Path("src/assets/enemies/closet-dark-hd.png"), 48),
    EnemyPortrait("末班车", "last-bus", Path("src/assets/enemies/last-bus-hd.png"), 64),
    EnemyPortrait("上门催收", "debt-collector", Path("src/assets/enemies/debt-collector-hd.png"), 48),
    EnemyPortrait("哭蛾", "cry-moth", Path("src/assets/enemies/cry-moth.png"), 32),
    EnemyPortrait("空奶瓶", "hunger-shadow", Path("src/assets/canonical-v1/enemies/hunger-shadow.png"), 32),
    EnemyPortrait("错过的车", "missed-bus", Path("src/assets/enemies/last-bus.png"), 32),
    EnemyPortrait("未接来电", "missed-call", Path("src/assets/enemies/missed-call.png"), 32),
    EnemyPortrait("没人说话", "silence", Path("src/assets/enemies/silence.png"), 32),
    EnemyPortrait("打包的纸箱", "badge-thief", Path("src/assets/enemies/badge-thief.png"), 32),
    EnemyPortrait("忘记名字的人", "forgetter", Path("src/assets/enemies/forgetter.png"), 32),
    EnemyPortrait("空椅子", "empty-chair", Path("src/assets/enemies/empty-chair.png"), 32),
    EnemyPortrait("立在墙角的衣架", "coat-rack", Path("src/assets/enemies/coat-rack.png"), 48),
    EnemyPortrait("别人的那张", "others-paper", Path("src/assets/enemies/others-paper.png"), 32),
    EnemyPortrait("要签字的那一栏", "sign-here", Path("src/assets/enemies/sign-here.png"), 32),
    EnemyPortrait("识别中", "id-scanner", Path("src/assets/enemies/id-scanner.png"), 32),
    EnemyPortrait("这个很简单", "task-simple", Path("src/assets/enemies/task-simple.png"), 32),
    EnemyPortrait("再改一版", "task-revise", Path("src/assets/enemies/task-revise.png"), 32),
    EnemyPortrait("辛苦下周一前", "task-deadline", Path("src/assets/enemies/task-deadline.png"), 32),
    EnemyPortrait("对齐一下", "task-sync", Path("src/assets/enemies/task-sync.png"), 32),
    EnemyPortrait("还没干的那双鞋", "wet-shoes", Path("src/assets/enemies/wet-shoes.png"), 48),
    EnemyPortrait("没关的台灯", "desk-lamp", Path("src/assets/enemies/desk-lamp.png"), 32),
    EnemyPortrait("热过两遍的那锅", "reheated-pot", Path("src/assets/enemies/reheated-pot.png"), 32),
    EnemyPortrait("会议室的门", "meeting-door", Path("src/assets/enemies/meeting-door.png"), 32),
    EnemyPortrait("去年的体检报告", "checkup-report", Path("src/assets/enemies/checkup-report.png"), 32),
    EnemyPortrait("叫号屏", "queue-screen", Path("src/assets/enemies/queue-screen.png"), 32),
    EnemyPortrait("别人的家属", "others-family", Path("src/assets/enemies/others-family.png"), 32),
    EnemyPortrait("走马灯", "revolving-lantern", Path("src/assets/enemies/revolving-lantern.png"), 48),
    EnemyPortrait("你很优秀", "praise-chair", Path("src/assets/enemies/praise-chair-p1.png"), 64),
    EnemyPortrait("响个不停", "ringing-phone", Path("src/assets/enemies/ringing-phone-p1.png"), 64),
)

PHASE_PORTRAITS = (
    EnemyPortrait("你很优秀 · 第一阶段", "praise-chair-p1", Path("src/assets/enemies/praise-chair-p1.png"), 64),
    EnemyPortrait("你很优秀 · 第二阶段", "praise-chair-p2", Path("src/assets/enemies/praise-chair-p2.png"), 96),
    EnemyPortrait("响个不停 · 第一阶段", "ringing-phone-p1", Path("src/assets/enemies/ringing-phone-p1.png"), 64),
    EnemyPortrait("响个不停 · 第二阶段", "ringing-phone-p2", Path("src/assets/enemies/ringing-phone-p2.png"), 64),
)


def build_portrait(spec: EnemyPortrait) -> Path:
    atlas = Image.open(spec.source).convert("RGBA")
    expected_size = (spec.frame_size * 4, spec.frame_size * 5)
    if atlas.size != expected_size:
        raise AssertionError(f"unexpected atlas size for {spec.asset_id}: {atlas.size} != {expected_size}")

    frame = atlas.crop((0, 0, spec.frame_size, spec.frame_size))
    portrait = Image.new("RGBA", (PORTRAIT_SIZE, PORTRAIT_SIZE), (0, 0, 0, 0))
    if spec.frame_size == 32:
        frame = frame.resize((PORTRAIT_SIZE, PORTRAIT_SIZE), Image.Resampling.NEAREST)
        portrait.alpha_composite(frame)
    elif spec.frame_size > PORTRAIT_SIZE:
        frame = frame.resize((PORTRAIT_SIZE, PORTRAIT_SIZE), Image.Resampling.NEAREST)
        portrait.alpha_composite(frame)
    else:
        offset = (PORTRAIT_SIZE - spec.frame_size) // 2
        portrait.alpha_composite(frame, (offset, offset))

    destination = OUTPUT_DIR / f"{spec.asset_id}.png"
    portrait.save(destination, format="PNG", optimize=True)
    return destination


def replace_card_art(html: str, spec: EnemyPortrait) -> tuple[str, int]:
    portrait = (
        f'<img class="enemy-portrait" src="enemy-portraits-v1/{spec.asset_id}.png" '
        f'alt="{spec.name} · 运行时正面待机帧" width="64" height="64" loading="lazy">'
    )
    pattern = re.compile(
        r'(<div class="item beast"><div class="top"><div class="art">)'
        r'(?:(?!<div class="item beast").)*?'
        r'(</div><div><div class="nm">' + re.escape(spec.name) + r'(?:\s|<))',
        re.DOTALL,
    )
    return pattern.subn(r"\1" + portrait + r"\2", html, count=1)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    html = WIKI.read_text(encoding="utf-8")
    replaced = 0

    for spec in PORTRAITS:
        build_portrait(spec)
        html, count = replace_card_art(html, spec)
        if count != 1:
            raise AssertionError(f"wiki beast card not found exactly once: {spec.name} ({count})")
        replaced += count

    for spec in PHASE_PORTRAITS:
        build_portrait(spec)

    beast_start = html.index('<section class="entry" id="beasts">')
    beast_end = html.index('<!-- ART-GALLERY-START -->', beast_start)
    beast_section = html[beast_start:beast_end]
    if beast_section.count('class="enemy-portrait"') != len(PORTRAITS) + 6:
        raise AssertionError("wiki beast portrait count is incomplete")
    if beast_section.count('class="enemy-phase-portrait"') != len(PHASE_PORTRAITS):
        raise AssertionError("wiki boss phase portrait count is incomplete")
    if 'src="data:image' in beast_section or '<svg' in beast_section:
        raise AssertionError("wiki beast catalog still contains legacy embedded art")

    WIKI.write_text(html, encoding="utf-8")
    print(f"built and linked {replaced} runtime enemy portraits plus {len(PHASE_PORTRAITS)} boss phase portraits in {WIKI}")


if __name__ == "__main__":
    main()
