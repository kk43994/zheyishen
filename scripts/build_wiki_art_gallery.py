#!/usr/bin/env python3
"""把全部实机在用的美术资源嵌入百科「附卷 · 美术馆」板块。

数据源全部取自运行时真实图集（src/assets/**），切帧规则与运行时代码一致；
重复执行会整体替换 ART-GALLERY 标记之间的内容。
"""

from __future__ import annotations

import base64
import io
import json
import re
from pathlib import Path

from PIL import Image

WIKI = Path("docs/这一身百科.html")
START = "<!-- ART-GALLERY-START -->"
END = "<!-- ART-GALLERY-END -->"

ENEMY_DIR = Path("src/assets/enemies")
HERO_DIR = Path("src/assets/hero-style1-profiles")
TITLE_PNG = Path("src/assets/ui/title-life-night.png")
PROPS_PNG = Path("src/assets/world/props.png")
ENTITIES_PNG = Path("src/assets/world/entities.png")

ENEMY_FRAME = 32
ENEMY_MOTION_ROWS = {"idle": 0, "move": 1, "attack": 2, "hurt": 3, "death": 4}
HERO_W, HERO_H = 40, 56
HERO_MOTION_FRAMES = {"idle": 2, "walk": 4, "attack": 2, "hurt": 2}
HERO_PROFILE_ROW = (1 * 4 + 1) * 4  # 平均身高 x 平均体格, front 朝向
PROP_CELL_W, PROP_CELL_H = 40, 44

# 图鉴顺序：按人生阶段
ENEMIES = [
    ("cry-moth", "哭蛾", "降生"),
    ("hunger-shadow", "空奶瓶", "降生"),
    ("fear", "床下的呼吸", "童年"),
    ("closet-dark", "没人相信的怪物", "童年 Boss"),
    ("red-mark", "红叉", "少年"),
    ("whisper", "他们都在说", "少年"),
    ("uniform-answer", "统一答案", "少年 Boss"),
    ("clockwork", "打卡齿轮", "青年"),
    ("last-bus", "末班车", "青年 Boss"),
    ("missed-call", "未接来电", "成年"),
    ("silence", "没人说话", "成年"),
    ("silent-father", "沉默的父亲", "成年 Boss"),
    ("silent-father-p2", "沉默的父亲 · 裂开", "成年 Boss 二阶段"),
    ("debt", "下个月账单", "中年"),
    ("badge-thief", "打包的纸箱", "中年"),
    ("debt-collector", "上门催收", "中年 Boss"),
    ("forgetter", "忘记名字的人", "暮年"),
    ("empty-chair", "空椅子", "暮年"),
    ("lamp-keeper", "收灯人", "终 Boss"),
]

PROP_STAGES = [
    ("童年 · 床底王国", ["床柱", "积木", "发条老鼠", "纸船"]),
    ("少年 · 千眼教室", ["连体课桌", "打红叉的试卷", "黑板擦与粉笔", "裂座的奖杯"]),
    ("青年 · 齿轮车站", ["车站长椅", "黄铜齿轮", "站牌", "被丢下的行李箱"]),
    ("成年 · 屋檐下的家", ["折叠饭桌与暖瓶", "晾衣架", "电饭煲", "捆好的纸箱"]),
    ("中年 · 没有关灯的办公室", ["熄屏的工位", "档案柜", "饮水机", "搭着外套的转椅"]),
    ("暮年 · 白发荒原", ["病床栏", "输液架", "搭毯子的扶手椅", "床头柜与水杯"]),
]

HERO_MOTION_LABELS = {"idle": "站立", "walk": "行走", "attack": "吐气", "hurt": "受击"}

ITEMS_PNG = Path("src/assets/items/icons.png")
ITEMS_JSON = Path("src/assets/items/icons.json")
QUALITY_NAMES = {1: "杂物", 2: "旧物", 3: "心结", 4: "遗物"}

ENTITY_CELL_W, ENTITY_CELL_H = 64, 72
ENTITIES = [
    ("留灯间的门", "地图上限时刷新 · 走进去触发"),
    ("里屋的门", "地图上限时刷新 · 走进去触发"),
    ("没有招牌的当铺", "怪潮间隙路边出现"),
    ("终局路灯", "黑暗收拢的圆心 · 收灯人在它底下现身"),
]


def to_uri(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def file_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def enemy_frame(asset: str, motion: str, frame: int) -> Image.Image:
    atlas = Image.open(ENEMY_DIR / f"{asset}.png").convert("RGBA")
    row = ENEMY_MOTION_ROWS[motion]
    return atlas.crop((frame * ENEMY_FRAME, row * ENEMY_FRAME, (frame + 1) * ENEMY_FRAME, (row + 1) * ENEMY_FRAME))


def hero_frame(motion: str, frame: int, overlay_raincoat: bool = False) -> Image.Image:
    base = Image.open(HERO_DIR / f"hero-{motion}.png").convert("RGBA")
    top = HERO_PROFILE_ROW * HERO_H
    cell = base.crop((frame * HERO_W, top, (frame + 1) * HERO_W, top + HERO_H))
    if overlay_raincoat:
        coat = Image.open(HERO_DIR / f"raincoat-{motion}.png").convert("RGBA")
        cell = cell.copy()
        cell.alpha_composite(coat.crop((frame * HERO_W, top, (frame + 1) * HERO_W, top + HERO_H)))
    return cell


def prop_cell(stage: int, variant: int) -> Image.Image:
    atlas = Image.open(PROPS_PNG).convert("RGBA")
    return atlas.crop((
        variant * PROP_CELL_W, stage * PROP_CELL_H,
        (variant + 1) * PROP_CELL_W, (stage + 1) * PROP_CELL_H,
    ))


def img_tag(uri: str, width: int, alt: str) -> str:
    return (
        f'<img src="{uri}" alt="{alt}" loading="lazy" style="width:{width}px;'
        'image-rendering:pixelated;background:#101014;border:1px solid var(--line);border-radius:3px">'
    )


def build_section() -> str:
    parts: list[str] = [START]
    parts.append('<section class="entry" id="gallery">')
    parts.append('<p class="vol">附 卷</p>')
    parts.append('<h2 class="serif">美术馆 · 实机资源</h2>')
    parts.append(
        '<p class="lede">本页展示的每一张图都直接取自游戏运行时图集，不是概念稿。'
        '2026-07-19 起全部十九种敌怪采用"生图四姿态基底 + 程序合成动作"混合管线'
        '（站立/移动/攻击三格真实姿态 + 受击红闪与残差溶解由程序推导）；'
        '标题画、场景摆设、世界实体与道具图标同为混合管线产物；'
        '主角人偶、《一口气》弹体与道具穿戴上身的形变仍为代码实时绘制。</p>'
    )

    # 标题画
    parts.append('<div class="stage-h"><h3>标题画</h3><span class="cnt">360×640 · 开屏背景</span></div>')
    parts.append('<p style="text-align:center">' + img_tag(file_uri(TITLE_PNG), 300, "标题画 · 人生之夜") + "</p>")

    # 主角
    parts.append('<div class="stage-h"><h3>主角人偶 · 标准身形四态</h3>'
                 '<span class="cnt">40×56 帧 · 4 朝向 × 12 身形档，此处为正面平均档；'
                 '发色/衣着/伤痕由代码在帧上实时改写</span></div>')
    parts.append('<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end">')
    for motion, count in HERO_MOTION_FRAMES.items():
        frames = "".join(img_tag(to_uri(hero_frame(motion, i)), 60, f"主角 {motion} {i}") for i in range(count))
        parts.append(
            '<figure style="margin:0;text-align:center">'
            f'<div style="display:flex;gap:4px">{frames}</div>'
            f'<figcaption class="dim" style="font-size:12px;margin-top:4px">{HERO_MOTION_LABELS[motion]}</figcaption></figure>'
        )
    raincoat = img_tag(to_uri(hero_frame("idle", 0, overlay_raincoat=True)), 60, "父亲的雨衣 穿戴态")
    parts.append(
        '<figure style="margin:0;text-align:center">'
        f'<div style="display:flex;gap:4px">{raincoat}</div>'
        '<figcaption class="dim" style="font-size:12px;margin-top:4px">《父亲的雨衣》穿戴层</figcaption></figure>'
    )
    parts.append("</div>")

    # 敌怪
    parts.append('<div class="stage-h"><h3>敌怪图集 · 十九种 × 五行动作</h3>'
                 '<span class="cnt">32×32 帧 · 站立/移动/攻击/受击/消散 · 生图四姿态基底 + 程序合成动作</span></div>')
    parts.append('<div class="tbl-wrap"><table><thead><tr><th>怪物</th><th>阶段</th>'
                 '<th>站立</th><th>移动</th><th>攻击</th><th>受击</th><th>消散</th></tr></thead><tbody>')
    for asset, name, stage in ENEMIES:
        cells = "".join(
            f'<td>{img_tag(to_uri(enemy_frame(asset, motion, 1 if motion == "death" else 0)), 48, f"{name} {motion}")}</td>'
            for motion in ENEMY_MOTION_ROWS
        )
        parts.append(f"<tr><td>{name}</td><td>{stage}</td>{cells}</tr>")
    parts.append("</tbody></table></div>")

    # 世界实体
    parts.append('<div class="stage-h"><h3>世界实体 · 门与灯</h3>'
                 '<span class="cnt">image2 生图基底 + 程序规整 · 战场可交互物</span></div>')
    entity_atlas = Image.open(ENTITIES_PNG).convert("RGBA")
    tiles = []
    for index, (name, note) in enumerate(ENTITIES):
        cell = entity_atlas.crop((index * ENTITY_CELL_W, 0, (index + 1) * ENTITY_CELL_W, ENTITY_CELL_H))
        tiles.append(
            '<figure style="margin:0;text-align:center;max-width:130px">'
            + img_tag(to_uri(cell), 120, name)
            + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">{name}<br>{note}</figcaption></figure>'
        )
    parts.append(f'<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end">{"".join(tiles)}</div>')

    # 场景摆设
    parts.append('<div class="stage-h"><h3>场景摆设 · 六章二十四件</h3>'
                 '<span class="cnt">image2 生图基底 + 程序规整 · 战场上随奔跑渐变换代</span></div>')
    for stage_index, (stage_name, names) in enumerate(PROP_STAGES):
        tiles = "".join(
            '<figure style="margin:0;text-align:center">'
            + img_tag(to_uri(prop_cell(stage_index, variant)), 76, names[variant])
            + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">{names[variant]}</figcaption></figure>'
            for variant in range(4)
        )
        parts.append(
            f'<h4 style="margin:18px 0 8px">{stage_name}</h4>'
            f'<div style="display:flex;flex-wrap:wrap;gap:14px">{tiles}</div>'
        )

    # 道具图标
    relics = re.findall(r"id: '([a-z0-9-]+)', name: '([^']+)', quality: (\d)", Path("src/relics.ts").read_text(encoding="utf-8"))
    icon_manifest = json.loads(ITEMS_JSON.read_text(encoding="utf-8"))
    icon_atlas = Image.open(ITEMS_PNG).convert("RGBA")
    cell, cols = icon_manifest["cell"], icon_manifest["cols"]
    parts.append('<div class="stage-h"><h3>道具图标 · 七十二件人生物证</h3>'
                 '<span class="cnt">image2 生图基底 + 程序规整 · 奖励卡/当铺/档案页共用</span></div>')
    for quality in (4, 3, 2, 1):
        group = [(item_id, name) for item_id, name, q in relics if int(q) == quality]
        if not group:
            continue
        tiles = []
        for item_id, name in group:
            index = icon_manifest["index"].get(item_id)
            if index is None:
                continue
            icon = icon_atlas.crop((
                (index % cols) * cell, (index // cols) * cell,
                (index % cols + 1) * cell, (index // cols + 1) * cell,
            ))
            tiles.append(
                '<figure style="margin:0;text-align:center;width:86px">'
                + img_tag(to_uri(icon), 64, name)
                + f'<figcaption class="dim" style="font-size:11px;margin-top:4px;line-height:1.35">{name}</figcaption></figure>'
            )
        parts.append(
            f'<h4 style="margin:18px 0 8px">{QUALITY_NAMES[quality]} · {len(group)} 件</h4>'
            f'<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">{"".join(tiles)}</div>'
        )

    # 奥义插画
    combo_manifest = json.loads(Path("src/assets/ui/combo-art.json").read_text(encoding="utf-8"))
    combo_atlas = Image.open("src/assets/ui/combo-art.png").convert("RGBA")
    combo_names = {
        "rain-letter": "那天雨太大，我没有听见", "for-your-own-good": "大人说这都是为你好",
        "returned-letter": "被退回的信", "thought-he-was-cool": "那年他觉得自己很酷",
        "cry-for-help-as-style": "被当成风格的求救", "someone-answered": "这一次有人接了",
        "became-him": "后来我也成了他", "when-everyone-is-free": "等大家有空",
        "this-weight-is-nothing": "这点重量不算什么", "bend-and-stretch": "能屈能伸",
        "stood-the-same-way": "他当年也是这样站着的", "seen-only-when-useful": "我只在有用时被看见",
    }
    parts.append('<div class="stage-h"><h3>奥义插画 · 十二组合</h3>'
                 '<span class="cnt">image2 生图 · 集齐组合的瞬间在战场上浮现 3.4 秒</span></div>')
    combo_tiles = []
    cw, ch, ccols = combo_manifest["cellWidth"], combo_manifest["cellHeight"], combo_manifest["cols"]
    for index, key in enumerate(combo_manifest["keys"]):
        cell = combo_atlas.crop(((index % ccols) * cw, (index // ccols) * ch, (index % ccols + 1) * cw, (index // ccols + 1) * ch))
        combo_tiles.append(
            '<figure style="margin:0;text-align:center;width:240px">'
            + img_tag(to_uri(cell), 232, combo_names.get(key, key))
            + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">《{combo_names.get(key, key)}》</figcaption></figure>'
        )
    parts.append(f'<div style="display:flex;flex-wrap:wrap;gap:16px">{"".join(combo_tiles)}</div>')

    # UI 纹理与饰件
    parts.append('<div class="stage-h"><h3>UI 纹理与饰件</h3>'
                 '<span class="cnt">image2 生图基底 + 程序规整 · 档案纸卡/夜面板自动叠加，文字与磨损仍由代码绘制</span></div>')
    ui_tiles = []
    for filename, name in (
        ("paper-texture.png", "旧档案纸纹理"), ("night-texture.png", "暗夜布纹"),
        ("corner-ornament.png", "档案角花"), ("seal-ornament.png", "无字章饰"),
    ):
        ui_tiles.append(
            '<figure style="margin:0;text-align:center">'
            + img_tag(file_uri(Path("src/assets/ui") / filename), 110, name)
            + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">{name}</figcaption></figure>'
        )
    parts.append(f'<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end">{"".join(ui_tiles)}</div>')

    UI_DIR = Path("src/assets/ui")
    total = sum(p.stat().st_size for p in [TITLE_PNG, PROPS_PNG, ENTITIES_PNG, ITEMS_PNG, *ENEMY_DIR.glob("*.png"), *HERO_DIR.glob("*.png"), *UI_DIR.glob("*-texture.png"), *UI_DIR.glob("*-ornament.png")])
    parts.append(
        f'<p class="dim" style="margin-top:18px">全部运行时栅格资源合计 {total / 1024:.0f} KB'
        '（参赛包体上限 100MB）；其余画面元素——道具外观、弹体、UI 面板——均为代码实时绘制，零图片资产。</p>'
    )
    parts.append("</section>")
    parts.append(END)
    return "\n".join(parts)


def main() -> None:
    html = WIKI.read_text(encoding="utf-8")
    section = build_section()
    if START in html:
        head, rest = html.split(START, 1)
        _, tail = rest.split(END, 1)
        html = head + section + tail
    else:
        anchor = "    <!-- 组合名鉴 -->"
        if anchor not in html:
            raise AssertionError("未找到插入锚点")
        html = html.replace(anchor, section + "\n\n" + anchor, 1)
    WIKI.write_text(html, encoding="utf-8")
    print(f"gallery embedded · wiki now {WIKI.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
