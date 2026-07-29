#!/usr/bin/env python3
"""把全部实机在用的美术资源写进百科各卷对应的位置。

数据源全部取自运行时真实图集（src/assets/**），切帧规则与运行时代码一致。

2026-07-29 拆掉了原来的「附卷 · 美术馆」：那一卷把 166 张图以 base64 内嵌，
一个人占了首页 96% 的体积（8.6MB / 8.9MB），而且美术和它解释的机制隔着十几屏。
现在每个子节直接落到讲这件事的卷里（人偶→世界观、摆设→八章人生、弹体→一口气……），
图落地成 docs/assets/wiki/inline/ 下的外链文件（文件名带内容哈希，改图必换名）。
重复执行会整体替换各卷 ART-BLOCKS:<卷 id> 标记之间的内容。
"""

from __future__ import annotations

import hashlib
import html
import io
import json
import re
from pathlib import Path

from PIL import Image

WIKI = Path("docs/这一身百科.html")
START = "<!-- ART-GALLERY-START -->"
END = "<!-- ART-GALLERY-END -->"
WIKI_DATA_DIR = Path("docs/wiki-data")
WIKI_GIF_DIR = Path("docs/assets/wiki/gif")
INLINE_DIR = Path("docs/assets/wiki/inline")
CANDIDATES_PAGE = Path("docs/art-candidates.html")
USED_INLINE: set[str] = set()

# 子节标题前缀 -> 承接它的卷。SPLIT 要再拆，CANDIDATES 去独立页。
BLOCK_ROUTE = (
    ("一局游戏的核心循环", "DROP"),      # 静态五步已被 §02 的动画影格取代（loop-cine）
    ("标题画", "world"),
    ("主角人偶", "world"),
    ("UI 纹理与饰件", "world"),
    ("场景摆设", "chapters"),
    ("《一口气》弹体", "breath"),
    ("道具图标", "DROP"),          # 与资源总览图标墙、道具志物证墙三重重复
    ("道具与主角体现", "CANDIDATES"),  # 审查拼图是生产档案，正装版看 §07 体现图墙与 items.html
    ("敌怪图集", "beasts"),
    ("大小 Boss", "beasts"),
    ("奥义插画", "combos"),
    ("世界实体", "doors"),
    ("房间内景与六章地面", "SPLIT"),
    ("结局定格", "mottos"),
    ("生产中的美术候选", "CANDIDATES"),
)

# 各卷内的落位顺序（键用前缀，标题里有动态计数）
SECTION_ORDER = {
    "overview": [],
    "world": ["标题画", "主角人偶", "UI 纹理与饰件"],
    "chapters": ["场景摆设", "__GROUNDS__"],
    "breath": ["《一口气》弹体"],
    "items": [],
    "beasts": ["敌怪图集", "大小 Boss"],
    "combos": ["奥义插画"],
    "doors": ["世界实体", "__ROOMS__"],
    "mottos": ["结局定格"],
}

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
    "closet-dark-extra-skills": "童年《没人相信的怪物》· 追加招式",
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
    "closet-hands": "里面还有手", "closet-slam": "门要关了",
    "father-stomp": "进去", "father-stand": "站好", "father-brace": "外面冷",
    "father-charge": "不许看", "father-tantrum": "都怪你", "father-tears": "我没有哭",
    "praise-p1-praise": "我看好你", "praise-p1-delegate": "这个只有你能做",
    "praise-p1-retreat": "退桌", "praise-p1-consult": "你怎么看",
    "praise-p2-slam": "拍桌", "praise-p2-paper": "下班前给我",
    "praise-p2-optimize": "优化", "praise-p2-dismiss": "离职", "praise-p2-one-seat": "岗位只有一个",
    "phone-p1-ring": "响铃", "phone-p1-answer": "接听", "phone-p1-missed": "未接",
    "phone-p2-ring": "分裂响铃", "phone-p2-answer": "分裂接听", "phone-p2-missed": "分裂未接",
    "collector-bill": "寄账单", "collector-drag": "上门拖拽", "collector-relocate": "换个门",
    "keeper-name": "灯来找你", "keeper-strip": "收灯", "keeper-dim": "吹灯",
    "coat-sleeve": "里面有人吗", "coat-double-sleeve": "两只袖子",
    "uniform-standard": "标准答案", "uniform-process": "过程没写", "uniform-pass": "卷子往后传",
    "bus-depart": "开走", "wet-shoes-hurry": "又跟近了", "box-count": "清点",
    "lantern-summon": "转起来", "lantern-summon-fast": "一生回来",
}

ENEMY_TIPS = {
    "cry-moth": "鳞粉预警出现就离开落点，不必追着它绕圈。",
    "fear": "听见吸气就拉开距离，别留在脉冲范围里。",
    "hunger-shadow": "等它锁定方向后横向走，别顺着扑击路线逃。",
    "red-mark": "第一次撞击后还会再扑一次；它后撤时准备横移。",
    "whisper": "它贴身绕圈才会持续伤害，先拉开再处理。",
    "others-paper": "离得越近伤害越快，保持远距用《一口气》拆掉。",
    "sign-here": "离开缠脚范围即可恢复速度，先拉开距离。",
    "id-scanner": "扫描线出现时上下换道，避免被标记后引来怪群。",
    "missed-bus": "车道亮起后立刻上下离开；车只直穿，不会拐弯追你。",
    "task-simple": "第一次击败会分裂，提前留出走位空间清两只子任务。",
    "task-revise": "第一次归零只是“再开一版”，别把下一轮输出交给别的怪。",
    "task-deadline": "优先击杀；八秒内没处理会直接扣走零钱。",
    "task-sync": "它不打人但会把怪潮拉成团，怪多时优先处理。",
    "missed-call": "离开铃声范围会重置扣血节拍，不要在圈内久留。",
    "debt": "移动慢但贴身很痛，保持距离逐只清掉。",
    "silence": "走出沉默场就能恢复速度，多只同场不会重复叠减速。",
    "desk-lamp": "不要站在灯圈里换血；能腾出火力时尽早拆掉。",
    "reheated-pot": "温度快空时走近并站定一秒重新加热，别让全场伤害启动。",
    "badge-thief": "贴身会偷零钱，保持距离优先击杀。",
    "meeting-door": "它不会攻击；离开停步范围就能恢复速度。",
    "checkup-report": "避免接触，否则全部构筑会被封存三秒。",
    "forgetter": "击退对它无效，用持续走位慢慢拉开处理。",
    "empty-chair": "它会替怪物吸走自动攻击，尽早清掉或把真正威胁引到更近。",
    "queue-screen": "走近屏幕可以无伤换位，别一直背着叫号方向逃。",
    "others-family": "它只沿固定路线经过，侧移离开经过范围即可。",
    "iv-stand": "存活越久跑得越快，出现后应尽早击杀。",
}

BOSS_TIPS = {
    "coat-rack": "看红框横移，半血后双袖更宽；别踩袖击留下的湿渍。",
    "closet-dark": "每招都有明确前摇和缺口；半血先处理分裂出的两只小怪。",
    "uniform-answer": "找白色安全带、离开自己三秒前的路径、从推进墙的缺口穿过。",
    "silent-father": "一阶段站在父亲背风侧的干地；二阶段借落地雨衣挡弹，等他发完脾气再输出。",
    "last-bus": "离开锁定车道，等冲刺后的疲惫期追打；假刹车时别急着回位。",
    "praise-chair": "加成和金饼都有后账；清不清小怪会改变二阶段招式威力，没有无代价答案。",
    "wet-shoes": "少原地停留，绕开水脚印，并在它加速前尽快打掉。",
    "ringing-phone": "接电话才能伤到它；挂断会生成未接来电，拖延只会把压力带进二阶段。",
    "whose-box": "被点名的道具只有八秒保卫时间，看到标签立即集火纸箱。",
    "debt-collector": "及时交钱或抢在倒计时结束前击败它；离开《上门》的拖拽圆域。",
    "revolving-lantern": "站到灯影正在出怪的一侧能让伤害翻倍，优先打灯结束怪潮。",
    "lamp-keeper": "它不可击杀；靠近灯光看清战场，逐件归还道具，最后主动放下《一口气》。",
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


def _land(payload: bytes, prefix: str) -> str:
    """把图落地成外链文件。文件名带内容哈希，改图必换名，绕开 CF 边缘缓存。"""
    INLINE_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}-{hashlib.sha1(payload).hexdigest()[:10]}.png"
    target = INLINE_DIR / name
    if not target.exists():
        target.write_bytes(payload)
    USED_INLINE.add(name)
    return (target.relative_to(Path("docs"))).as_posix()


def to_uri(image: Image.Image, prefix: str = "art") -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return _land(buffer.getvalue(), prefix)


def file_uri(path: Path) -> str:
    return _land(path.read_bytes(), path.stem[:24])


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


def gif_tag(path: Path, width: int, alt: str) -> str:
    if not path.exists():
        raise AssertionError(f"百科 GIF 不存在：{path}")
    relative = path.relative_to(Path("docs"))
    return (
        f'<img src="{relative.as_posix()}" alt="{html.escape(alt)}" loading="lazy" '
        f'style="width:{width}px;max-width:100%;height:auto;'
        'image-rendering:pixelated;background:#101014;border:1px solid var(--line);border-radius:3px">'
    )


def canonical_boss_asset(asset: str) -> str:
    return {
        "closet-dark": "closet-dark-hd",
        "uniform-answer": "uniform-answer-hd",
        "silent-father-p1": "silent-father-hd",
        "silent-father-p2": "silent-father-p2-hd",
        "last-bus": "last-bus-hd",
        "debt-collector": "debt-collector-hd",
        "lamp-keeper": "lamp-keeper-hd",
    }.get(asset, asset)


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
    item_data = json.loads((WIKI_DATA_DIR / "items.json").read_text(encoding="utf-8"))
    enemy_data = json.loads((WIKI_DATA_DIR / "enemies.json").read_text(encoding="utf-8"))
    boss_data = json.loads((WIKI_DATA_DIR / "bosses.json").read_text(encoding="utf-8"))
    parts: list[str] = []
    parts.append('<div class="stage-h"><h3>一局游戏的核心循环</h3>'
                 f'<span class="cnt">{len(item_data["items"])} 件道具 · {len(item_data["combos"])} 个组合 · '
                 f'{len(enemy_data)} 个现役普通敌怪 · {len(boss_data)} 个大小 Boss</span></div>')
    parts.append(
        '<div class="core-loop" aria-label="一局游戏的五步循环">'
        '<div class="core-step"><span class="step-no">01 · 出生</span><b>AI 生成主角</b><p>每局都是不同家庭、地域与起点。</p></div>'
        '<div class="core-step"><span class="step-no">02 · 走位</span><b>在怪潮里活下去</b><p>你控制移动，《一口气》自动攻击。</p></div>'
        '<div class="core-step"><span class="step-no">03 · 回应</span><b>咽下、吐出或亲口说</b><p>事情已经发生，回应方式由你选择。</p></div>'
        '<div class="core-step"><span class="step-no">04 · 构筑</span><b>把经历穿上身</b><p>道具同时改变身体与唯一攻击。</p></div>'
        '<div class="core-step"><span class="step-no">05 · 长大</span><b>进入下一段人生</b><p>场景、怪物与问题随年龄改变。</p></div>'
        '</div>'
        '<p class="reader-note"><b>读卡方法：</b>先看动画认出它，再看“会做什么”，最后看“怎么应对”。'
        '精确数值保留在机制说明里，但不再抢占阅读顺序。</p>'
    )
    parts.append('<h4 style="margin:18px 0 8px">普通敌人 · 它做什么，你怎么躲</h4><div class="items">')
    for enemy in enemy_data:
        name = html.escape(enemy["name"])
        stage = html.escape(enemy["stage"])
        mechanic = html.escape(enemy["mechanic"])
        note = html.escape(enemy.get("note") or "")
        tip = html.escape(ENEMY_TIPS[enemy["id"]])
        idle = gif_tag(
            WIKI_GIF_DIR / "enemy" / f'{enemy["atlas"]}-idle.gif',
            enemy["displaySize"],
            f'{enemy["name"]} 待机动画',
        )
        parts.append(
            '<article class="item beast">'
            f'<div class="top"><div class="art">{idle}</div><div><div class="nm">{name}</div>'
            f'<div class="bstat">{stage} · 普通敌人</div></div>'
            f'<span class="q q2">{stage}</span></div>'
            f'<div class="fx"><span class="entry-label">会做什么</span><span class="eff">{mechanic}</span>'
            f'<span class="entry-label">怎么应对</span><span class="pos">{tip}</span>'
            + (f'<span class="entry-label">它来自哪里</span><span class="iron">{note}</span>' if note else "")
            + '</div></article>'
        )
    parts.append('</div>')
    parts.append('<h4 style="margin:18px 0 8px">大小 Boss · 先读规则，再找窗口</h4><div class="items">')
    for boss in boss_data:
        name = html.escape(boss["name"])
        stage = html.escape(boss["stage"])
        phase_images = "".join(
            gif_tag(
                WIKI_GIF_DIR / "enemy" / f'{canonical_boss_asset(phase["asset"])}-idle.gif',
                72,
                f'{boss["name"]} {phase["label"]}',
            )
            for phase in boss["phases"]
        )
        mechanics = html.escape(boss["mechanics"])
        skill_names = " · ".join(html.escape(skill["name"]) for skill in boss["skills"])
        tip = html.escape(BOSS_TIPS[boss["id"]])
        tier = "章节 Boss" if boss["tier"] == "chapter" else "小 Boss"
        parts.append(
            '<article class="item beast">'
            f'<div class="top"><div class="art" style="display:flex;gap:4px">{phase_images}</div>'
            f'<div><div class="nm">{name}</div><div class="bstat">{stage} · {tier}</div></div>'
            f'<span class="q q3">{stage}</span></div>'
            f'<div class="fx"><span class="entry-label">主要招式</span><span class="fl serif">{skill_names}</span>'
            f'<span class="entry-label">核心规则</span><span class="eff">{mechanics}</span>'
            f'<span class="entry-label">通关思路</span><span class="pos">{tip}</span></div></article>'
        )
    parts.append('</div>')

    # 标题画
    parts.append('<div class="stage-h"><h3>标题画</h3><span class="cnt">360×640 · 开屏背景</span></div>')
    parts.append('<p style="text-align:center">' + img_tag(file_uri(TITLE_PNG), 300, "标题画 · 一生在同一片地面上经过") + "</p>")

    # 主角
    parts.append('<div class="stage-h"><h3>主角人偶 · 标准身形四态</h3>'
                 '<span class="cnt">40×56 帧 · 4 朝向 × 12 身形档，此处为正面平均档；'
                 '发色/衣着/伤痕由代码在帧上实时改写</span></div>')
    parts.append('<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end">')
    for motion in HERO_MOTION_FRAMES:
        animation = gif_tag(WIKI_GIF_DIR / "hero" / f"hero-{motion}.gif", 120, f"主角 {motion} 动画")
        raincoat_animation = gif_tag(
            WIKI_GIF_DIR / "hero" / f"hero-{motion}-raincoat.gif",
            120,
            f"主角 {motion} 父亲的雨衣穿戴动画",
        )
        parts.append(
            '<figure style="margin:0;text-align:center">'
            f'<div style="display:flex;gap:4px">{animation}{raincoat_animation}</div>'
            f'<figcaption class="dim" style="font-size:12px;margin-top:4px">'
            f'{HERO_MOTION_LABELS[motion]} · 基础 / 《父亲的雨衣》</figcaption></figure>'
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
            f'<td>{gif_tag(WIKI_GIF_DIR / "enemy" / f"{asset}-{motion}.gif", display_width, f"{name} {motion} 动画")}</td>'
            for motion in ENEMY_MOTION_ROWS
        )
        parts.append(f"<tr><td>{name}</td><td>{stage}</td>{cells}</tr>")
    parts.append("</tbody></table></div>")

    # Boss 专属攻击帧：基础 attack 行不能替代逐招表演，逐条展开 4 帧供审阅。
    skill_manifest = json.loads(BOSS_SKILL_MANIFEST.read_text(encoding="utf-8"))
    skills_by_asset: dict[str, list[tuple[int, str]]] = {}
    for skill_id, spec in skill_manifest["skills"].items():
        skills_by_asset.setdefault(spec["asset"], []).append((spec["row"], skill_id))
    # 追加技能图（*-extra-skills）挂在既有形态名下，不计入阶段形态数。
    form_count = sum(1 for a in skill_manifest["assets"] if not a.endswith("-extra-skills"))
    parts.append('<div class="stage-h"><h3>大小 Boss · 专属攻击动画逐帧审阅</h3>'
                 f'<span class="cnt">{form_count} 个阶段形态 · '
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
            display_width = min(frame_size * 4, 384)
            parts.append(
                '<figure style="margin:0;text-align:center">'
                + gif_tag(
                    WIKI_GIF_DIR / "boss-skill" / f"{skill_id}.gif",
                    display_width,
                    f"{BOSS_SKILL_NAMES[skill_id]} 四帧动画",
                )
                + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">《{BOSS_SKILL_NAMES[skill_id]}》 · 4 帧</figcaption></figure>'
            )
        parts.append('</div>')
    v2_manifest = json.loads((ENEMY_DIR / "boss-skills-v2" / "manifest.json").read_text(encoding="utf-8"))
    parts.append('<h4 style="margin:20px 0 8px">Boss 八帧正式演出</h4>'
                 '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">')
    for skill_id, spec in v2_manifest["skills"].items():
        parts.append(
            '<figure style="margin:0;text-align:center">'
            + gif_tag(
                WIKI_GIF_DIR / "boss-skill-8f" / f"{skill_id}.gif",
                min(spec["frame"] * spec["frames"], 448),
                f'{skill_id} 八帧正式动画',
            )
            + f'<figcaption class="dim" style="font-size:12px;margin-top:4px">{skill_id} · {spec["frames"]} 帧</figcaption></figure>'
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
    projectile_manifest = json.loads(Path("src/assets/vfx/projectile-anim.json").read_text(encoding="utf-8"))
    hit_manifest = json.loads(Path("src/assets/vfx/hits.json").read_text(encoding="utf-8"))
    save_manifest = json.loads(Path("src/assets/vfx/saves.json").read_text(encoding="utf-8"))
    animated_vfx = []
    for form in projectile_manifest["forms"]:
        animated_vfx.append(
            '<figure style="margin:0;text-align:center;width:92px">'
            + gif_tag(WIKI_GIF_DIR / "projectile" / f"{form}.gif", 84, f"{form} 弹体动画")
            + f'<figcaption class="dim" style="font-size:11px;margin-top:4px">{form}</figcaption></figure>'
        )
    for material in hit_manifest["materials"]:
        animated_vfx.append(
            '<figure style="margin:0;text-align:center;width:92px">'
            + gif_tag(WIKI_GIF_DIR / "hit" / f"{material}.gif", 84, f"{material} 命中特效")
            + f'<figcaption class="dim" style="font-size:11px;margin-top:4px">{material}</figcaption></figure>'
        )
    for kind in save_manifest["kinds"]:
        animated_vfx.append(
            '<figure style="margin:0;text-align:center;width:92px">'
            + gif_tag(WIKI_GIF_DIR / "save" / f"{kind}.gif", 84, f"{kind} 免死演出")
            + f'<figcaption class="dim" style="font-size:11px;margin-top:4px">{kind}</figcaption></figure>'
        )
    parts.append('<h4 style="margin:18px 0 8px">弹体、命中与免死 · 实时动画</h4>')
    parts.append(f'<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">{"".join(animated_vfx)}</div>')

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
    for index, name in enumerate(("童年木地板", "少年水磨石", "青年机械地", "成年旧地毯", "中年医院地胶", "暮年苍白院廊")):
        ground_tiles.append(
            '<figure style="margin:0;text-align:center">'
            + img_tag(file_uri(Path("src/assets/world") / f"stage-floor-{index}.png"), 96, name)
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
    return "\n".join(parts)


def split_blocks(section_html: str) -> dict[str, str]:
    """把生成结果按 stage-h 切成子节，键是子节标题。"""
    heads = [(m.start(), m.group(1)) for m in
             re.finditer(r'<div class="stage-h"><h3>([^<]+)</h3>', section_html)]
    if not heads:
        raise AssertionError("生成结果里没有 stage-h 子节")
    blocks: dict[str, str] = {}
    for index, (pos, title) in enumerate(heads):
        end = heads[index + 1][0] if index + 1 < len(heads) else len(section_html)
        blocks[title] = section_html[pos:end].rstrip()
    return blocks


def split_rooms_and_grounds(block: str) -> tuple[str, str]:
    """「房间内景与六章地面」是两组图，房间归两扇门、地面归八章人生。"""
    body = block[block.index("</div>", block.index('<div class="stage-h">')) + len("</div>"):]
    starts = [m.start() for m in re.finditer(r'<div style="display:flex', body)]
    if len(starts) != 2:
        raise AssertionError(f"房间/地面分组数异常：{len(starts)}")
    bounds = starts + [len(body)]
    rooms, grounds = (body[bounds[k]:bounds[k + 1]].strip() for k in range(2))
    rooms_html = (
        '<div class="stage-h"><h3>房间内景</h3>'
        '<span class="cnt">留灯间 / 里屋 / 没有招牌的当铺 · 实机内景</span></div>\n' + rooms
    )
    grounds_html = (
        '<div class="stage-h"><h3>六章地面</h3>'
        '<span class="cnt">童年至暮年 · 六种地表随年龄换代</span></div>\n'
        + grounds.replace("margin-top:16px", "margin-top:0")
    )
    return rooms_html, grounds_html


ENEMY_WALL_ANCHOR = '<h4 style="margin:18px 0 8px">普通敌人 · 它做什么，你怎么躲</h4>'


def split_loop_and_enemies(block: str) -> tuple[str, str]:
    """「一局游戏的核心循环」后面挂着 38 张怪卡，概述留不下——五步留在概述，卡墙归怪物图鉴。"""
    if ENEMY_WALL_ANCHOR not in block:
        raise AssertionError("核心循环块里找不到普通敌人卡墙的分界")
    loop, wall = block.split(ENEMY_WALL_ANCHOR, 1)
    return loop.rstrip(), ENEMY_WALL_ANCHOR + wall


def route(blocks: dict[str, str]) -> tuple[dict[str, list[str]], str]:
    """按内容把子节分派到各卷；返回 (卷 id -> 片段列表, 候选档案片段)。"""
    resolved: dict[str, str] = {}
    candidates_blocks: list[str] = []
    for title, block in blocks.items():
        target = next((sec for prefix, sec in BLOCK_ROUTE if title.startswith(prefix)), None)
        if target is None:
            raise AssertionError(f"子节未归类：{title}")
        if target == "DROP":
            continue
        if target == "CANDIDATES":
            candidates_blocks.append(block)
        elif target == "SPLIT":
            rooms, grounds = split_rooms_and_grounds(block)
            resolved["__ROOMS__"] = rooms
            resolved["__GROUNDS__"] = grounds
        elif target == "SPLIT_LOOP":
            # 卡墙那半（普通敌人/大小 Boss 应对卡）不再上首页：章节志按章承载同一批
            # 词条（含 tips.json 的「怎么应对」），首页只留核心循环那半。
            loop, _wall = split_loop_and_enemies(block)
            resolved["一局游戏的核心循环"] = loop
        else:
            resolved[title] = block

    placed: dict[str, list[str]] = {}
    for section_id, keys in SECTION_ORDER.items():
        chunks = []
        for key in keys:
            match = next((k for k in resolved if k == key or k.startswith(key)), None)
            if match is None:
                raise AssertionError(f"卷 {section_id} 缺子节：{key}")
            chunks.append(resolved.pop(match))
        placed[section_id] = chunks
    if resolved:
        raise AssertionError(f"有子节没有落位：{sorted(resolved)}")
    return placed, "\n".join(candidates_blocks)


def graft(html: str, section_id: str, chunks: list[str]) -> str:
    """把片段写进指定卷的标记之间；标记不存在就在卷末尾建一对。"""
    start = f"<!-- ART-BLOCKS:{section_id}-START -->"
    end = f"<!-- ART-BLOCKS:{section_id}-END -->"
    payload = start + "\n" + "\n".join(chunks) + "\n" + end
    if start in html:
        head, rest = html.split(start, 1)
        _, tail = rest.split(end, 1)
        return head + payload + tail
    anchor = html.find(f'<section class="entry" id="{section_id}"')
    if anchor < 0:
        raise AssertionError(f"找不到卷 {section_id}")
    close = html.find("</section>", anchor)
    if close < 0:
        raise AssertionError(f"卷 {section_id} 没有闭合")
    return html[:close] + "\n" + payload + "\n" + html[close:]


def write_candidates_page(wiki_html: str, block: str) -> None:
    head = wiki_html[:wiki_html.index("</head>") + len("</head>")]
    head = head.replace("<title>", "<title>美术生产档案 · ", 1)
    CANDIDATES_PAGE.write_text(
        head + "\n<body>\n"
        '<div class="topbar" id="wiki-topbar">'
        '<a class="tb-mark serif" href="这一身百科.html">这一身<i>百科</i></a>'
        '<nav class="tb-links" aria-label="快捷卷目"><a href="这一身百科.html">回百科</a></nav>'
        "</div>\n"
        '<main class="wrap">\n<section class="entry" id="candidates">\n'
        '<p class="vol">生产档案</p>\n'
        '<h2 class="serif">美术候选与实机校验</h2>\n'
        '<p class="lede">这一页收的是<b>尚未写入 <code>src/assets</code></b> 的候选稿与同屏比例复核图，'
        "不是现役资源；现役美术已经分散在百科各卷对应的位置。</p>\n"
        + block + "\n</section>\n</main>\n"
        '<script src="wiki-shell-v1.js"></script>\n</body></html>\n',
        encoding="utf-8",
    )


def prune_inline() -> int:
    """删掉本轮没有再引用的落地图，避免 inline 目录只增不减。"""
    removed = 0
    for path in INLINE_DIR.glob("*.png"):
        if path.name not in USED_INLINE:
            path.unlink()
            removed += 1
    return removed


def main() -> None:
    # 百科的道具图标墙走 docs 内副本（本地预览也能出图；线上 deploy 会再覆盖一次同名文件）
    icons_src = Path("src/assets/items/icons.png")
    icons_dst = Path("docs/assets/icons.png")
    payload = icons_src.read_bytes()
    if not icons_dst.exists() or icons_dst.read_bytes() != payload:
        icons_dst.write_bytes(payload)

    html = WIKI.read_text(encoding="utf-8")
    placed, candidates = route(split_blocks(build_section()))

    # 旧版附卷整块删除（含标记），内容改由各卷承接
    if START in html:
        head, rest = html.split(START, 1)
        _, tail = rest.split(END, 1)
        html = head.rstrip("\n") + "\n" + tail.lstrip("\n")
    html = html.replace('<li><a href="#gallery">美术馆</a></li>\n      ', "")
    html = html.replace('<a href="#gallery">实机图鉴</a>', "")

    for section_id, chunks in placed.items():
        html = graft(html, section_id, chunks)

    WIKI.write_text(html, encoding="utf-8")
    write_candidates_page(html, candidates)
    pruned = prune_inline()
    print(
        f"gallery distributed · {len(placed)} 卷承接 · "
        f"落地图 {len(USED_INLINE)} 张 / {sum(p.stat().st_size for p in INLINE_DIR.glob('*.png')) / 1024:.0f} KB"
        + (f" · 清理 {pruned} 张" if pruned else "")
    )
    print(f"wiki now {WIKI.stat().st_size / 1024:.0f} KB · 候选档案 {CANDIDATES_PAGE.name}")


if __name__ == "__main__":
    main()
