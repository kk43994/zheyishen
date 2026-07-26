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
BOSS_SKILL_DIR = ENEMY_DIR / "boss-skills-v1"
BOSS_SKILL_MANIFEST = BOSS_SKILL_DIR / "manifest.json"
HERO_DIR = Path("src/assets/hero-style1-profiles")
TITLE_PNG = Path("src/assets/ui/title-life-clutter.png")
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

ITEM_REVIEW_ART = (
    (Path("output/art-audit-loop/wiki-item-review/items-01-12.png"), "道具 01-12"),
    (Path("output/art-audit-loop/wiki-item-review/items-13-24.png"), "道具 13-24"),
    (Path("output/art-audit-loop/wiki-item-review/items-25-36.png"), "道具 25-36"),
    (Path("output/art-audit-loop/wiki-item-review/items-37-48.png"), "道具 37-48"),
    (Path("output/art-audit-loop/wiki-item-review/items-49-60.png"), "道具 49-60"),
    (Path("output/art-audit-loop/wiki-item-review/items-61-72.png"), "道具 61-72"),
    (Path("output/art-audit-loop/wiki-item-review/items-73-77.png"), "道具 73-77"),
)

FOCUSED_ITEM_REVIEW_ART = (
    (
        Path("output/art-audit-loop/runtime-integration/broken-spine-card-warp-scar.png"),
        "22 断掉的脊梁骨 · 已锁定",
        "整个人驼背前倾，旧伤贴着后背；没有外挂骨头、额外横杠或第三肢体。",
    ),
    (
        Path("output/art-audit-loop/runtime-integration/momo-avatar-card-v2.1.png"),
        "60 momo的头像 · 小恐龙头套",
        "主角直接戴圆头粉色小恐龙头套；身体、衣服和四肢保持原样。",
    ),
    (
        Path("output/art-audit-loop/runtime-integration/eye-exercise-card-v1.png"),
        "67 眼保健操 · 轮刮眼眶触发态",
        "触发半秒时替换原双臂，拇指与食指贴着眼眶形成受压弧环；不是悬空眼睛或望远镜。",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-art-loop-v1/71-server-shutdown/v1/shutdown-standby-review-12x.png"),
        "71 关服那天 · 常驻小伙伴",
        "一个有头身的小伙伴贴着影子慢半拍跟随，不画成屏幕或设备。",
    ),
    (
        Path("output/imagegen/zhe-yi-shen-art-loop-v1/71-server-shutdown/v1/shutdown-trigger-review-12x.png"),
        "71 关服那天 · 替挡与断线",
        "致命伤时依次出现、跃出、替挡、断线；结束后本局永久清空，不留残骸。",
    ),
)

ENEMY_FRAME = 32
ENEMY_MOTION_ROWS = {"idle": 0, "move": 1, "attack": 2, "hurt": 3, "death": 4}
HERO_W, HERO_H = 40, 56
HERO_MOTION_FRAMES = {"idle": 2, "walk": 4, "attack": 2, "hurt": 2}
HERO_PROFILE_ROW = (1 * 4 + 1) * 4  # 平均身高 x 平均体格, front 朝向
PROP_CELL_W, PROP_CELL_H = 40, 44

# 图鉴顺序：按当前 LIFE_STAGE_CANON；同一视觉在多章复用时只列一次。
# (asset, name, stage/role, source frame, review display width)
ENEMIES = [
    ("cry-moth", "哭蛾", "童年", 32, 48),
    ("hunger-shadow", "空奶瓶", "童年", 32, 48),
    ("fear", "床下的呼吸", "童年", 32, 48),
    ("coat-rack", "立在墙角的衣架", "童年 · 小 Boss", 48, 64),
    ("closet-dark-hd", "没人相信的怪物", "童年 · 章节 Boss", 48, 80),
    ("red-mark", "红叉", "少年", 32, 48),
    ("whisper", "他们都在说", "少年／中年", 32, 48),
    ("others-paper", "别人的那张", "少年", 32, 48),
    ("sign-here", "要签字的那一栏", "少年", 32, 48),
    ("uniform-answer-hd", "统一答案", "少年 · 小 Boss", 48, 64),
    ("silent-father-hd", "沉默的父亲", "少年 · 章节 Boss 一阶段", 64, 88),
    ("silent-father-p2-hd", "沉默的父亲 · 雨衣落下", "少年 · 章节 Boss 二阶段", 64, 76),
    ("id-scanner", "证件扫描框", "青年", 32, 48),
    ("last-bus", "错过的车", "青年", 32, 48),
    ("task-simple", "这个很简单", "青年", 32, 48),
    ("task-revise", "顺手改一下", "青年", 32, 48),
    ("task-deadline", "下班前要", "青年", 32, 48),
    ("task-sync", "拉个会同步", "青年", 32, 48),
    ("last-bus-hd", "错过的那一班", "青年 · 小 Boss", 64, 72),
    ("praise-chair-p1", "你很优秀", "青年 · 章节 Boss 一阶段", 64, 80),
    ("praise-chair-p2", "你很优秀 · 起身", "青年 · 章节 Boss 二阶段", 96, 96),
    ("missed-call", "未接来电", "成年", 32, 48),
    ("debt", "下个月账单", "成年／中年／暮年", 32, 48),
    ("silence", "没人说话", "成年", 32, 48),
    ("desk-lamp", "总亮着的台灯", "成年", 32, 48),
    ("reheated-pot", "热了三遍的饭", "成年", 32, 48),
    ("wet-shoes", "还没干的那双鞋", "成年 · 小 Boss", 48, 64),
    ("ringing-phone-p1", "响个不停", "成年 · 章节 Boss 一阶段", 64, 80),
    ("ringing-phone-p2", "响个不停 · 分裂", "成年 · 章节 Boss 二阶段", 64, 80),
    ("badge-thief", "注销工牌", "中年", 32, 48),
    ("meeting-door", "开不完的会", "中年", 32, 48),
    ("checkup-report", "体检报告", "中年", 32, 48),
    ("whose-box", "不知道是谁的纸箱", "中年 · 小 Boss", 48, 64),
    ("debt-collector-hd", "上门催收", "中年 · 章节 Boss", 48, 80),
    ("forgetter", "忘记名字的人", "暮年", 32, 48),
    ("empty-chair", "空椅子", "暮年", 32, 48),
    ("queue-screen", "叫不到号的屏幕", "暮年", 32, 48),
    ("others-family", "别人家的家属", "暮年", 32, 48),
    ("iv-stand", "滴完的输液架", "暮年", 48, 48),
    ("revolving-lantern", "走马灯", "暮年 · 小 Boss", 48, 64),
    ("lamp-keeper-hd", "收灯人", "暮年 · 终 Boss", 64, 88),
]

BOSS_FORM_NAMES = {
    "closet-dark-skills": "童年《没人相信的怪物》",
    "silent-father-p1-skills": "少年《沉默的父亲》一阶段",
    "silent-father-p2-skills": "少年《沉默的父亲》二阶段",
    "praise-chair-p1-skills": "青年《你很优秀》一阶段",
    "praise-chair-p2-skills": "青年《你很优秀》二阶段",
    "ringing-phone-p1-skills": "成年《响个不停》一阶段",
    "ringing-phone-p2-skills": "成年《响个不停》二阶段",
    "debt-collector-skills": "中年《上门催收》",
    "lamp-keeper-skills": "暮年《收灯人》",
    "coat-rack-skills": "童年小 Boss《立在墙角的衣架》",
    "uniform-answer-skills": "少年小 Boss《统一答案》",
    "last-bus-skills": "青年小 Boss《错过的那一班》",
    "wet-shoes-skills": "成年小 Boss《还没干的那双鞋》",
    "whose-box-skills": "中年小 Boss《不知道是谁的纸箱》",
    "revolving-lantern-skills": "暮年小 Boss《走马灯》",
}

BOSS_SKILL_NAMES = {
    "closet-shadow": "被窝里的影子", "closet-split": "柜门裂开",
    "father-stomp": "进去", "father-stand": "站好", "father-brace": "外面冷",
    "father-charge": "不许看", "father-tantrum": "都怪你", "father-tears": "我没有哭",
    "praise-p1-praise": "我看好你", "praise-p1-delegate": "这个只有你能做",
    "praise-p1-retreat": "退桌", "praise-p1-consult": "你怎么看",
    "praise-p2-slam": "拍桌", "praise-p2-paper": "下班前给我",
    "praise-p2-optimize": "优化", "praise-p2-dismiss": "离职", "praise-p2-one-seat": "岗位只有一个",
    "phone-p1-ring": "响铃", "phone-p1-answer": "接听", "phone-p1-missed": "未接",
    "phone-p2-ring": "分裂响铃", "phone-p2-answer": "分裂接听", "phone-p2-missed": "分裂未接",
    "collector-bill": "寄账单", "collector-drag": "上门拖拽", "collector-relocate": "换个门",
    "keeper-name": "点名", "keeper-strip": "收灯", "keeper-dim": "吹灯",
    "coat-sleeve": "里面有人吗", "coat-double-sleeve": "两只袖子",
    "uniform-standard": "标准答案", "uniform-process": "过程没写", "uniform-pass": "卷子往后传",
    "bus-depart": "开走", "wet-shoes-hurry": "又跟近了", "box-count": "清点",
    "lantern-summon": "转起来", "lantern-summon-fast": "一生回来",
}

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


def enemy_frame(asset: str, motion: str, frame: int, frame_size: int) -> Image.Image:
    atlas = Image.open(ENEMY_DIR / f"{asset}.png").convert("RGBA")
    row = ENEMY_MOTION_ROWS[motion]
    return atlas.crop((frame * frame_size, row * frame_size, (frame + 1) * frame_size, (row + 1) * frame_size))


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


def boss_strip_tag(image: Image.Image, width: int, alt: str) -> str:
    return (
        f'<img src="{to_uri(image)}" alt="{alt}" loading="lazy" style="width:{width}px;max-width:100%;height:auto;'
        'image-rendering:pixelated;background:#101014;border:1px solid var(--line);border-radius:3px">'
    )


def review_img_tag(path: Path, alt: str) -> str:
    with Image.open(path) as image:
        width, height = image.size
    return (
        f'<img src="{file_uri(path)}" alt="{alt}" loading="lazy" width="{width}" height="{height}" '
        'style="width:100%;max-width:980px;'
        'height:auto;image-rendering:pixelated;background:#101014;border:1px solid var(--line);border-radius:3px">'
    )


def build_section() -> str:
    parts: list[str] = [START]
    parts.append('<section class="entry" id="gallery">')
    parts.append('<p class="vol">附 卷</p>')
    parts.append('<h2 class="serif">美术馆 · 实机资源</h2>')
    parts.append(
        '<p class="lede">除文末明确标注“未接入”的生产候选外，本页主体全部直接取自游戏运行时图集，不是概念稿。'
        '六章现役敌怪、六只小 Boss 与六只章节 Boss 均采用"Image2 基底 + 程序合成动作"混合管线'
        '（站立/移动/攻击三格真实姿态 + 受击红闪与残差溶解由程序推导）；'
        '标题画、场景摆设、世界实体、道具图标、弹体、命中特效、房间、地面、卡框与结局画面同为混合管线产物；'
        '主角基础身体由图集与部位遮罩驱动，道具体现由 Image2 四向/状态层与整数部位形变实时组合。</p>'
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

    # 道具在主角身上的实机体现
    parts.append('<div class="stage-h"><h3>道具与主角体现 · 七十七件</h3>'
                 '<span class="cnt">77/77 有运行态消费者 · 四方向 × 常态/动作/触发态审查</span></div>')
    parts.append(
        '<p class="lede">下列图片来自同一份运行时审查页。每张卡左侧的小图只作为道具身份参考；'
        '右侧四方向与动作格才是主角实际显示。只在触发瞬间出现的道具会明确标成触发态，常态不强行悬挂无关物件。</p>'
    )
    for path, title in ITEM_REVIEW_ART:
        if not path.exists():
            continue
        parts.append(
            '<figure style="margin:16px 0;text-align:center">'
            + review_img_tag(path, title)
            + f'<figcaption class="dim" style="font-size:12px;margin-top:6px">{title} · 实机审查页</figcaption></figure>'
        )

    parts.append('<h4 style="margin:24px 0 8px">本轮高优先级修正</h4>')
    for path, title, note in FOCUSED_ITEM_REVIEW_ART:
        if not path.exists():
            continue
        parts.append(
            '<figure style="margin:16px 0;text-align:center">'
            + review_img_tag(path, title)
            + f'<figcaption class="dim" style="font-size:12px;margin-top:6px"><b>{title}</b><br>{note}</figcaption></figure>'
        )

    # 敌怪
    parts.append(f'<div class="stage-h"><h3>敌怪图集 · 六章现役 {len(ENEMIES)} 个视觉形态</h3>'
                 '<span class="cnt">普通怪 32px，小 Boss 48–64px，章节 Boss 48–96px 源帧 · 此表按战斗层级差异化显示</span></div>')
    parts.append('<div class="tbl-wrap"><table><thead><tr><th>怪物</th><th>阶段</th>'
                 '<th>站立</th><th>移动</th><th>攻击</th><th>受击</th><th>消散</th></tr></thead><tbody>')
    for asset, name, stage, frame_size, display_width in ENEMIES:
        cells = "".join(
            f'<td>{img_tag(to_uri(enemy_frame(asset, motion, 1 if motion == "death" else 0, frame_size)), display_width, f"{name} {motion}")}</td>'
            for motion in ENEMY_MOTION_ROWS
        )
        parts.append(f"<tr><td>{name}</td><td>{stage}</td>{cells}</tr>")
    parts.append("</tbody></table></div>")

    # Boss 专属攻击帧：基础 attack 行不能替代逐招表演，逐条展开 4 帧供审阅。
    skill_manifest = json.loads(BOSS_SKILL_MANIFEST.read_text(encoding="utf-8"))
    skills_by_asset: dict[str, list[tuple[int, str]]] = {}
    for skill_id, spec in skill_manifest["skills"].items():
        skills_by_asset.setdefault(spec["asset"], []).append((spec["row"], skill_id))
    parts.append('<div class="stage-h"><h3>大小 Boss · 专属攻击动画逐帧审阅</h3>'
                 f'<span class="cnt">{len(skill_manifest["assets"])} 个阶段形态 · '
                 f'{len(skill_manifest["skills"])} 条独立动作 · {len(skill_manifest["skills"]) * 4} 帧</span></div>')
    parts.append(
        '<p class="lede">下列每一行都直接裁自运行时 <code>boss-skills-v1</code> 图集。'
        '四格分别承担起势、蓄力、结算与回收；基础图集的通用“攻击”帧只作兜底，不能冒充这些招式。'
        '跨图身份同样是门禁：《谁的纸箱》四帧保留工椅、五星脚与轮子，《走马灯》四帧保留红边纸灯与灯面奔马；'
        '人生阶段怪由运行时单独召唤，不烘进 48px 灯体动作帧。'
        '所有通用直线前摇都以结算前 Boss 坐标锁定：红框起止与命中带共用同一组几何参数，Boss 位移只在判定后发生。'
        '非直线招式同样不得另画假范围：《上门》固定显示 280px 拖行圆域，末班车显示完整车身扫掠，'
        '《拍桌子》保留 230px 外边界，《不许看》与《都怪你》会按落地雨衣真实截断危险带和雨圈。</p>'
    )
    for asset, asset_spec in skill_manifest["assets"].items():
        atlas = Image.open(BOSS_SKILL_DIR / f"{asset}.png").convert("RGBA")
        frame_size = asset_spec["frame"]
        parts.append(f'<h4 style="margin:20px 0 8px">{BOSS_FORM_NAMES[asset]}</h4>')
        parts.append('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">')
        for row, skill_id in sorted(skills_by_asset.get(asset, [])):
            strip = atlas.crop((0, row * frame_size, frame_size * 4, (row + 1) * frame_size))
            display_width = min(frame_size * 4, 384)
            parts.append(
                '<figure style="margin:0;text-align:center">'
                + boss_strip_tag(strip, display_width, f"{BOSS_SKILL_NAMES[skill_id]} 四帧动画")
                + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">《{BOSS_SKILL_NAMES[skill_id]}》 · 4 帧</figcaption></figure>'
            )
        parts.append('</div>')

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
