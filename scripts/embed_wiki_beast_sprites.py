#!/usr/bin/env python3
"""把新画的敌人像素图集 idle 帧嵌入百科怪物图鉴，替换单字占位图。"""

from __future__ import annotations

import base64
import io
import re
from pathlib import Path

from PIL import Image

WIKI = Path("docs/这一身百科.html")
ATLAS_DIR = Path("src/assets/enemies")
FRAME = 32

# 图鉴条目名 → 图集文件
MAPPING = {
    "没人相信的怪物": "closet-dark",
    "末班车": "last-bus",
    "上门催收": "debt-collector",
    "哭蛾": "cry-moth",
    "空奶瓶": "hunger-shadow",
    "错过的车": "last-bus",
    "未接来电": "missed-call",
    "没人说话": "silence",
    "打包的纸箱": "badge-thief",
    "忘记名字的人": "forgetter",
    "空椅子": "empty-chair",
}


def idle_frame_data_uri(asset: str) -> str:
    atlas = Image.open(ATLAS_DIR / f"{asset}.png").convert("RGBA")
    frame = atlas.crop((0, 0, FRAME, FRAME))
    buffer = io.BytesIO()
    frame.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def main() -> None:
    html = WIKI.read_text(encoding="utf-8")
    replaced = 0
    for name, asset in MAPPING.items():
        uri = idle_frame_data_uri(asset)
        img = (
            f'<img src="{uri}" alt="{name}" '
            'style="width:54px;height:54px;object-fit:contain;image-rendering:pixelated">'
        )
        pattern = re.compile(
            r'(<div class="art">)<span class="pg"[^>]*>[^<]+</span>'
            r'(</div><div><div class="nm">' + re.escape(name) + ")"
        )
        html, count = pattern.subn(r"\1" + img + r"\2", html, count=1)
        if count != 1:
            raise AssertionError(f"未找到占位图: {name}")
        replaced += count
    WIKI.write_text(html, encoding="utf-8")
    print(f"embedded {replaced} sprites into {WIKI}")


if __name__ == "__main__":
    main()
