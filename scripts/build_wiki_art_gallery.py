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
REVIEW_ART = (
    (
        Path("output/art-lighting-review-v1/processed/stage-lighting-runtime-composite.png")
        if Path("output/art-lighting-review-v1/processed/stage-lighting-runtime-composite.png").exists()
        else Path("output/art-lighting-review-v1/stage-lighting-runtime-composite.png"),
        "六章战场照明 · 非夜间版本",
        "清晨 / 白昼 / 傍晚 / 饭桌灯 / 日光灯 / 苍白午后 · 深墨只留给轮廓与终局",
    ),
    (
        Path("output/art-lighting-review-v1/natural-chapter-transition-storyboard.png"),
        "五段章节过场 · 连续衔接板",
        "世界与主角不消失 · 地面持续溶解 · 现实处境与心声 · 4.2 秒人生片段",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-ground-tiles-v2/processed/ground-tiles-v2-contact.png"),
        "六章 Image2 地面 v2 · 单块候选",
        "旧木板 / 教室水磨石 / 站台铺面 / 出租屋旧地砖 / 办公地胶 / 苍白院廊",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-ground-tiles-v2/processed/ground-tiles-v2-tiled-contact.png"),
        "六章 Image2 地面 v2 · 3×3 平铺检查",
        "128×128 · 20 色 · 对边精确一致 · 无透视与固定大物件",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-ground-tiles-v2/processed/ground-tiles-v2-scene-composite.png"),
        "六章 Image2 地面 v2 · 人物与多尺度摆设组合",
        "大件 1.30–1.45 / 中件 0.96–1.18 / 小件 0.74–0.90 · 场景簇摆放",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-plinth-style-gate-v1/processed/plinth-style-gate-contact-8x.png"),
        "特殊房道具台 · 三套视觉语言",
        "12 个 48×32 候选 · 旧家具 / 档案机关 / 末班车站",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-special-threshold-style-gate-v1/processed/special-threshold-style-gate-contact-8x.png"),
        "特殊房门槛资产 · 三套视觉语言",
        "商人 / 留灯间门 / 里屋门 / 奖励光柱 · 32×64 单元",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-special-threshold-style-gate-v1/processed/special-room-composite-preview-4x.png"),
        "特殊房实机比例组合预览",
        "使用当前主角与地面图集组合 · 未替换运行时",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-special-threshold-corrections-v1/processed/last-line-corrections-contact-8x.png"),
        "末班车站 · 定点修正版",
        "紧凑商人 / 窄里屋门 / 不被绿幕吞掉的奖励光柱 / 空台面",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-special-room-backgrounds-v2/processed/special-room-current-vs-candidate-contact.png"),
        "特殊房全屏背景 v2 · 现役对照",
        "留灯间 / 人生档案封存室 / 失物估价处 · 360×640 候选，尚未替换",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-special-room-backgrounds-v2/processed/special-room-v2-safe-zone-contact.png"),
        "特殊房全屏背景 v2 · 移动端安全区",
        "标题 / 中央道具悬浮 / 底部代价与操作区均已做构图复核",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-ending-backgrounds-v2/processed/ending-backgrounds-current-vs-candidate.png"),
        "结算背景 v2 · 现役对照",
        "失败是人生档案封卷；真结局只留下路灯、钥匙与雨衣，不再烘焙第二个人物",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-ending-backgrounds-v2/processed/ending-backgrounds-v2-result-previews.png"),
        "结算背景 v2 · 实机叠层",
        "70% 暗幕 / 标题变字 / 页签 / 模块化最终主角 / 时间线 / 再活一次按钮",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-environment-surprises-reference-v1/processed/environment-surprises-contact-5x.png"),
        "六章环境惊喜 · 静态激活帧",
        "床下眼睛 / 批改红叉 / 末班车 / 未接来电 / 空转椅 / 路灯轮椅",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-environment-surprises-reference-v1/processed/environment-surprises-scene-preview-3x.png"),
        "六章环境惊喜 · 实机比例预览",
        "96×48 边缘覆盖层 · 与当前主角及六章地面同屏复核",
    ),
)

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


def review_img_tag(path: Path, alt: str) -> str:
    return (
        f'<img src="{file_uri(path)}" alt="{alt}" loading="lazy" style="width:100%;max-width:980px;'
        'height:auto;image-rendering:pixelated;background:#101014;border:1px solid var(--line);border-radius:3px">'
    )


def build_section() -> str:
    parts: list[str] = [START]
    parts.append('<section class="entry" id="gallery">')
    parts.append('<p class="vol">附 卷</p>')
    parts.append('<h2 class="serif">美术馆 · 实机资源</h2>')
    parts.append(
        '<p class="lede">除文末明确标注“未接入”的生产候选外，本页主体全部直接取自游戏运行时图集，不是概念稿。'
        '2026-07-20 起全部十九种敌怪采用"生图四姿态基底 + 程序合成动作"混合管线'
        '（站立/移动/攻击三格真实姿态 + 受击红闪与残差溶解由程序推导）；'
        '标题画、场景摆设、世界实体、道具图标、弹体、命中特效、房间、地面、卡框与结局画面同为混合管线产物；'
        '主角人偶与道具穿戴上身的形变仍由代码实时绘制。</p>'
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
    cn_digits = '〇一二三四五六七八九'
    icon_total = len(icon_manifest['index'])
    cn_count = ('' if icon_total < 20 else cn_digits[icon_total // 10]) + '十' + (cn_digits[icon_total % 10] if icon_total % 10 else '')
    parts.append(f'<div class="stage-h"><h3>道具图标 · {cn_count}件人生物证</h3>'
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

    # 战斗 VFX
    parts.append('<div class="stage-h"><h3>《一口气》弹体与战斗特效</h3>'
                 '<span class="cnt">弹体凝实度/形态、四材质命中、免死演出、成双协同、敌怪状态标记</span></div>')
    vfx_tiles = []
    for path, name, width in (
        (Path("src/assets/vfx/projectiles.png"), "弹体图集", 300),
        (Path("src/assets/vfx/hits.png"), "命中与消散", 220),
        (Path("src/assets/vfx/saves.png"), "免死演出", 240),
        (Path("src/assets/vfx/synergy.png"), "成双协同", 220),
        (Path("src/assets/vfx/status.png"), "状态标记", 200),
    ):
        vfx_tiles.append(
            '<figure style="margin:0;text-align:center">'
            + img_tag(file_uri(path), width, name)
            + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">{name}</figcaption></figure>'
        )
    parts.append(f'<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end">{"".join(vfx_tiles)}</div>')

    # 房间与地面
    parts.append('<div class="stage-h"><h3>房间内景与六章地面</h3>'
                 '<span class="cnt">留灯间 / 里屋 / 当铺 · 童年至暮年六种地表</span></div>')
    room_tiles = []
    for filename, name in (("lamp.png", "留灯间"), ("inner.png", "里屋"), ("pawn.png", "没有招牌的当铺")):
        room_tiles.append(
            '<figure style="margin:0;text-align:center">'
            + img_tag(file_uri(Path("src/assets/rooms") / filename), 150, name)
            + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">{name}</figcaption></figure>'
        )
    parts.append(f'<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end">{"".join(room_tiles)}</div>')
    ground_tiles = []
    for index, name in enumerate(("童年木地板", "少年水磨石", "青年机械地", "成年旧地毯", "中年医院地胶", "暮年夜路")):
        ground_tiles.append(
            '<figure style="margin:0;text-align:center">'
            + img_tag(file_uri(Path("src/assets/world") / f"ground-{index}.png"), 96, name)
            + f'<figcaption class="dim" style="font-size:11px;margin-top:4px">{name}</figcaption></figure>'
        )
    parts.append(f'<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-top:16px">{"".join(ground_tiles)}</div>')

    # UI 纹理与饰件
    parts.append('<div class="stage-h"><h3>UI 纹理与饰件</h3>'
                 '<span class="cnt">纸卡、品质框、面板、按钮、档案饰件、五毒、摇杆、章节与命运纹样</span></div>')
    ui_tiles = []
    for filename, name, width in (
        ("paper-texture.png", "旧档案纸纹理", 110), ("night-texture.png", "暗夜布纹", 110),
        ("record-frames.png", "品质Ⅰ-Ⅳ档案框", 110), ("panel-frame.png", "面板框", 90),
        ("button-frame.png", "按钮框", 150), ("archive-deco.png", "胶带/回形针/邮戳/骑缝章", 180),
        ("poison.png", "五毒图腾", 220), ("joystick.png", "虚拟摇杆", 150),
        ("chapter-strips.png", "六章转场题图", 110), ("fate-profiles.png", "六类命运纹样", 260),
    ):
        ui_tiles.append(
            '<figure style="margin:0;text-align:center">'
            + img_tag(file_uri(Path("src/assets/ui") / filename), width, name)
            + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">{name}</figcaption></figure>'
        )
    parts.append(f'<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end">{"".join(ui_tiles)}</div>')

    parts.append('<div class="stage-h"><h3>结局定格</h3>'
                 '<span class="cnt">物证陈列桌 / 路灯下的收灯人</span></div>')
    ending_tiles = []
    for filename, name in (("ending-table.png", "物证陈列桌"), ("ending-lampman.png", "收灯人")):
        ending_tiles.append(
            '<figure style="margin:0;text-align:center">'
            + img_tag(file_uri(Path("src/assets/ui") / filename), 180, name)
            + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">{name}</figcaption></figure>'
        )
    parts.append(f'<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end">{"".join(ending_tiles)}</div>')

    # 生产候选：保留静态评审链路，不与运行时资产混淆
    parts.append('<div class="stage-h"><h3>生产中的美术候选与实机校验</h3>'
                 '<span class="cnt">Image2 参考图编辑 + 固定网格切片 · 静态评审通过后才可接入</span></div>')
    parts.append(
        '<p class="lede">这一批不是宣传海报，而是按真实槽位与实机叠层生产的可用资产。'
        '战场照明已撤销“整局发生在夜里”的错误前提：前五章用清晨、白昼、傍晚、饭桌灯、日光灯与苍白午后区分年龄，只有收灯人终局进入夜色；'
        '章节过场不切黑屏，地面与摆设在玩家脚下继续溶解，并在 4.2 秒内依次呈现现实处境、主角心声与生活物件接棒；'
        '六章地面 v2 使用 Image2 分章生成材质，再经 128×128 降采样、20 色限色和对边融合成为真正可平铺图块；背景物件按大中小三档缩放并组成生活场景簇，不再均匀撒点；'
        '三套小型资产语言分别测试“旧家具与生活遗物”“人生档案与机关”“末班车站与失物”；'
        '全屏背景 v2 则把留灯间、里屋和当铺分别落实为普通小屋、档案封存室和失物估价处；'
        '结算背景 v2 把失败解释为档案封卷，把真结局解释为有人刚刚照看过的一盏普通路灯；'
        '所有图均已去绿底、限色、清理透明 RGB 并在当前主角旁以真实精灵比例复核。'
        '当前建议以档案机关作为全局骨架，留灯间借用旧家具的暖意，青年章节保留末班车站变体。</p>'
    )
    for path, name, note in REVIEW_ART:
        if not path.exists():
            continue
        parts.append(
            '<figure style="margin:18px 0;text-align:center">'
            + review_img_tag(path, name)
            + f'<figcaption class="dim" style="font-size:12px;margin-top:6px">{name}<br>{note}</figcaption></figure>'
        )
    parts.append(
        '<p class="dim">状态：候选，尚未写入 <code>src/assets</code>。'
        '末班车站初稿中过宽的商人、里屋门与过淡光柱已采用单格定点补图修正，'
        '三张全屏房间与两张结算背景也已通过移动端安全区检查；'
        '正式接入前仍需作者选择整套或混合方案。</p>'
    )

    total = sum(path.stat().st_size for path in Path("src/assets").rglob("*.png"))
    parts.append(
        f'<p class="dim" style="margin-top:18px">全部运行时栅格资源合计 {total / 1024:.0f} KB'
        '（参赛包体上限 100MB）；所有图集均保留程序绘制或基础色块兜底，贴图未加载时不会阻断游玩。</p>'
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
