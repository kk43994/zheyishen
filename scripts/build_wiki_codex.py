#!/usr/bin/env python3
"""生成《这一身》百科分类图鉴站（Boss志/敌怪志/道具志/语音馆/世界志/特效馆）。

- 词条数据来自 docs/wiki-data/*.json（由正典提取任务维护）与 docs/voice-canon-v1.js；
- 动图来自 scripts/build_wiki_gifs.py 的产物 docs/assets/wiki/gif/**；
- 静态切片（摆设/实体/组合插画/状态图标等）由本脚本裁切到 docs/assets/wiki/img/**；
- 输出 docs/{boss,bestiary,items,voices,world,vfx}.html，与首页正典同一套夜桌视觉；
- 幂等：重跑整体覆盖。deploy_wiki.sh 负责上线。
"""

from __future__ import annotations

import html as html_mod
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
DATA = DOCS / "wiki-data"
GIF = DOCS / "assets/wiki/gif"
IMG = DOCS / "assets/wiki/img"
VOICE_DIR = DOCS / "assets/voice"

PAGES = [
    ("index.html", "正典"),
    ("boss.html", "Boss志"),
    ("bestiary.html", "敌怪志"),
    ("items.html", "道具志"),
    ("voices.html", "语音馆"),
    ("world.html", "世界志"),
    ("vfx.html", "特效馆"),
]

STAGE_ORDER = ["童年", "少年", "青年", "成年", "中年", "暮年"]

QUALITY = {
    1: ("Ⅰ", "杂物", "q1"), 2: ("Ⅱ", "旧物", "q2"), 3: ("Ⅲ", "心结", "q3"),
    4: ("Ⅳ", "遗物", "q4"), 5: ("Ⅴ", "这一身", "q5"),
}
POOL_LABEL = {"random": "随机池", "inner": "里屋", "lamp": "留灯间", "story": "剧情固定掉落"}

BOSS_BASE_ATLAS = {
    "coat-rack": ["coat-rack"],
    "closet-dark": ["closet-dark-hd"],
    "uniform-answer": ["uniform-answer-hd"],
    "silent-father": ["silent-father-hd", "silent-father-p2-hd"],
    "last-bus": ["last-bus-hd"],
    "praise-chair": ["praise-chair-p1", "praise-chair-p2"],
    "wet-shoes": ["wet-shoes"],
    "ringing-phone": ["ringing-phone-p1", "ringing-phone-p2"],
    "whose-box": ["whose-box"],
    "debt-collector": ["debt-collector-hd"],
    "revolving-lantern": ["revolving-lantern"],
    "lamp-keeper": ["lamp-keeper-hd"],
}
MOTION_LABEL = {"idle": "站立", "move": "移动", "attack": "攻击", "hurt": "受击", "death": "消散"}
TIER_LABEL = {"mini": "小 Boss", "chapter": "章节 Boss", "final": "终 Boss"}

PROJ_NAMES = {
    "breath": "一口气 · 月白雾团", "breath0": "凝实度 · 无形", "breath2": "凝实度 · 凝实",
    "breath3": "凝实度 · 珠光", "marble": "弹珠", "key": "钥匙", "slash": "劈砍",
    "rain": "雨点", "tear": "泪滴", "ice": "冰晶", "laugh": "哈字", "serial": "制式弹",
    "paper": "纸页", "razor": "修眉刀", "lens": "镜片", "sound": "声波", "link": "链接",
    "button": "纽扣", "stone": "石子", "cone": "呵气雾锥", "stamp": "印章",
}
HIT_NAMES = {
    "mist": "雾", "water": "水", "crit": "暴击", "paper": "纸", "wood": "木",
    "stone": "石", "metal": "金属", "ice": "冰", "signal": "信号", "key": "钥匙", "glass": "玻璃",
}
SAVE_NAMES = {"tooth": "乳牙", "photo": "遗照", "shutdown": "关服那天"}
STATUS_NAMES = {
    "freeze": "冻结", "paralyze": "麻痹", "read": "已读挂账", "loop": "单曲循环",
    "wet": "潮湿", "raw": "旧伤", "heavy": "沉重", "control-fatigue": "操控疲劳",
}
SYNERGY_NAMES = {
    "ice": "成双 · 湿×冰 冻结增强", "crack": "成双 · 锋利×骨节 旧伤",
    "collapse": "成双 · 重×爆炸 塌陷", "arc": "成双 · 水×信号 麻痹",
}

PROP_STAGES = [
    ("童年 · 床底王国", ["床柱", "积木", "发条老鼠", "纸船"]),
    ("少年 · 千眼教室", ["连体课桌", "打红叉的试卷", "黑板擦与粉笔", "裂座的奖杯"]),
    ("青年 · 齿轮车站", ["车站长椅", "黄铜齿轮", "站牌", "被丢下的行李箱"]),
    ("成年 · 屋檐下的家", ["折叠饭桌与暖瓶", "晾衣架", "电饭煲", "捆好的纸箱"]),
    ("中年 · 没有关灯的办公室", ["熄屏的工位", "档案柜", "饮水机", "搭着外套的转椅"]),
    ("暮年 · 白发荒原", ["病床栏", "输液架", "搭毯子的扶手椅", "床头柜与水杯"]),
]
ENTITIES = [
    ("留灯间的门", "地图上限时刷新 · 走进去触发"),
    ("里屋的门", "地图上限时刷新 · 走进去触发"),
    ("没有招牌的当铺", "怪潮间隙路边出现"),
    ("终局路灯", "黑暗收拢的圆心 · 收灯人在它底下现身"),
]
FLOOR_NAMES = ["童年木地板", "少年水磨石", "青年机械地", "成年旧地毯", "中年医院地胶", "暮年夜路"]

COMBO_NAMES = {
    "rain-letter": "那天雨太大，我没有听见", "for-your-own-good": "大人说这都是为你好",
    "returned-letter": "被退回的信", "thought-he-was-cool": "那年他觉得自己很酷",
    "cry-for-help-as-style": "被当成风格的求救", "someone-answered": "这一次有人接了",
    "became-him": "后来我也成了他", "when-everyone-is-free": "等大家有空",
    "this-weight-is-nothing": "这点重量不算什么", "bend-and-stretch": "能屈能伸",
    "stood-the-same-way": "他当年也是这样站着的", "seen-only-when-useful": "我只在有用时被看见",
}

ICON_COLS = 8
ICON_CELL = 36
ICON_SCALE = 2


def esc(text: object) -> str:
    return html_mod.escape(str(text)) if text is not None else ""


# ─────────────────────────── 页面骨架 ───────────────────────────

BASE_CSS = """
  :root{
    --paper:#D8D0C1; --paper-2:#AAA297;
    --ink:#17151A; --ink-2:#3E3A3D; --ink-3:#6E675B;
    --oldred:#9F3548; --oldred-soft:#B06961;
    --rainyellow:#C6A44A; --wardblue:#71818A; --moon:#E8E1D3;
    --bg:#111116; --card:#1B1A20; --line:#34323A;
    --fg:#E8E1D3; --fg-2:#D8D0C1; --fg-3:#AAA297;
    --moon-face:#E8E1D3; --moon-halo:rgba(232,225,211,.10);
    --q1:#786F69; --q2:#71818A; --q3:#9F3548; --q4:#C6A44A; --q5:#E8E1D3;
    --positive:#779887; --warning:#B06961;
    --desk:url("assets/desk-texture.png");
  }
  :root[data-theme="light"]{
    --bg:#E9E3D4; --card:#F1ECDF; --line:#C8C0AC;
    --fg:#1A1713; --fg-2:#453F36; --fg-3:#6E675B;
    --oldred:#9E3B33; --oldred-soft:#B0554A;
    --rainyellow:#A8842F; --wardblue:#63737B;
    --moon-face:#E5DCC4; --moon-halo:rgba(110,103,91,.14);
    --q1:#7E7A6E; --q2:#5F7581; --q3:#9E3B33; --q4:#8A6E22; --q5:#8A2F3F;
    --positive:#5c7a63; --warning:#a1554d;
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--fg);
    background-image:linear-gradient(rgba(17,17,22,.90),rgba(17,17,22,.90)),var(--desk);background-attachment:fixed;
    font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;line-height:1.85;font-size:16px;
    -webkit-font-smoothing:antialiased}
  :root[data-theme="light"] body{background-image:none}
  .serif{font-family:"Songti SC","STSong","Noto Serif CJK SC","SimSun",serif}
  .frame{max-width:1180px;margin:0 auto;padding:0 20px}
  header.codex-hero{padding:56px 0 20px;text-align:center}
  header.codex-hero .eyebrow{font-size:12px;letter-spacing:.5em;color:var(--fg-3);text-indent:.5em;margin:0 0 14px}
  header.codex-hero h1{margin:0;font-size:clamp(34px,6vw,52px);font-weight:900;letter-spacing:.08em}
  header.codex-hero .sub{margin:14px auto 0;max-width:720px;color:var(--fg-3);font-size:14px;letter-spacing:.04em}
  main.codex{max-width:1180px;margin:0 auto;padding:8px 20px 90px}
  .sect-h{display:flex;align-items:baseline;gap:14px;border-bottom:1px solid var(--line);margin:44px 0 6px;padding-bottom:8px}
  .sect-h h2{margin:0;font-size:24px;letter-spacing:.06em}
  .sect-h .cnt{font-size:12px;color:var(--fg-3);letter-spacing:.06em}
  .bx{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:22px 24px;margin:22px 0;position:relative;overflow:hidden}
  .bx h3{margin:0;font-size:22px;letter-spacing:.05em}
  .chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .chip{font-size:11px;letter-spacing:.12em;padding:2px 9px;border:1px solid var(--line);border-radius:99px;color:var(--fg-3);white-space:nowrap}
  .chip.red{color:var(--oldred);border-color:var(--oldred)}
  .chip.gold{color:var(--rainyellow);border-color:var(--rainyellow)}
  .chip.blue{color:var(--wardblue);border-color:var(--wardblue)}
  .dim{color:var(--fg-3)}
  .flavor{font-style:normal;color:var(--fg-2);border-left:3px solid var(--oldred);padding:2px 0 2px 12px;margin:10px 0;line-height:1.9}
  .lore{color:var(--fg-3);font-size:13px}
  .g{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}
  figure.anim{margin:0;text-align:center}
  figure.anim img{image-rendering:pixelated;background:#101014;border:1px solid var(--line);border-radius:4px;max-width:100%}
  figure.anim figcaption{font-size:12px;color:var(--fg-3);margin-top:4px;line-height:1.4}
  .shot{max-width:100%;height:auto;image-rendering:pixelated;background:#101014;border:1px solid var(--line);border-radius:4px}
  .vo{display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-bottom:1px dashed var(--line)}
  .vo:last-child{border-bottom:0}
  .vo-play{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--oldred);background:none;
    color:var(--oldred);font-size:13px;cursor:pointer;line-height:1}
  .vo-play:hover{background:var(--oldred);color:var(--moon)}
  .vo-play.on{background:var(--oldred);color:var(--moon)}
  .vo-text{margin:0;font-size:15px;color:var(--fg)}
  .vo-meta{margin:2px 0 0;font-size:12px;color:var(--fg-3);letter-spacing:.03em}
  .ric{display:inline-block;flex:none;width:72px;height:72px;image-rendering:pixelated;
    background-image:var(--icon-sheet);background-size:576px auto;background-repeat:no-repeat;
    background-color:#101014;border:1px solid var(--line);border-radius:6px}
  .item-row{display:flex;gap:16px}
  .item-main{min-width:0;flex:1}
  .portrait{flex:none;image-rendering:pixelated;background:#101014;border:1px solid var(--line);border-radius:6px}
  .boss-head{display:flex;gap:20px;flex-wrap:wrap}
  .boss-info{flex:1;min-width:260px}
  .skill-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-top:10px}
  .skill-card{background:rgba(0,0,0,.14);border:1px solid var(--line);border-radius:8px;padding:12px;text-align:center}
  :root[data-theme="light"] .skill-card{background:rgba(255,255,255,.4)}
  .skill-card img{image-rendering:pixelated;background:#101014;border-radius:4px;max-width:100%}
  .skill-card .nm{display:block;font-weight:700;margin-top:6px}
  .skill-card .desc{font-size:12.5px;color:var(--fg-3);line-height:1.7;margin-top:2px}
  .skill-card .lr{font-size:12px;color:var(--oldred-soft);margin-top:4px}
  .sub-h{margin:26px 0 4px;font-size:16px;letter-spacing:.08em;color:var(--fg-2)}
  .foot{border-top:1px solid var(--line);margin-top:60px;padding:26px 20px 60px;text-align:center;font-size:12px;color:var(--fg-3);letter-spacing:.1em}
  .foot a{color:var(--fg-2)}
  .card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}
  .card-grid .bx{margin:0}
  @media (max-width:640px){.bx{padding:16px}.item-row{flex-direction:row}.card-grid{grid-template-columns:1fr}}
"""

AUDIO_JS = """
(function(){
  'use strict';
  var root=document.documentElement;
  var toggle=document.getElementById('wiki-theme-toggle');
  function cur(){var t=root.getAttribute('data-theme');return t==='dark'||t==='light'?t:'dark';}
  function paint(){if(toggle)toggle.textContent=cur()==='dark'?'☀':'☾';}
  if(toggle){toggle.addEventListener('click',function(){var n=cur()==='dark'?'light':'dark';
    root.setAttribute('data-theme',n);try{localStorage.setItem('wiki-theme',n);}catch(e){}paint();});paint();}
  var audio=new Audio();var curBtn=null;
  function reset(){if(curBtn){curBtn.classList.remove('on');curBtn.textContent='▶';curBtn=null;}}
  audio.addEventListener('ended',reset);
  audio.addEventListener('pause',function(){if(audio.ended)return;reset();});
  document.addEventListener('click',function(e){
    var b=e.target.closest('.vo-play');if(!b)return;
    if(curBtn===b){audio.pause();return;}
    reset();audio.src=b.getAttribute('data-src');audio.play();
    curBtn=b;b.classList.add('on');b.textContent='◼';
  });
})();
"""


def shell(slug: str, title: str, eyebrow: str, sub: str, body: str) -> str:
    on_attr = ' class="on"'
    nav = "".join(
        f'<a href="{href}"{on_attr if href == slug else ""}>{label}</a>'
        for href, label in PAGES
    )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="wiki-runtime-v1.css">
<script>(function(){{try{{var t=localStorage.getItem('wiki-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}}catch(e){{}}}})();</script>
<title>《这一身》百科 · {title}</title>
<style>{BASE_CSS}
  :root{{--icon-sheet:url("../src/assets/items/icons.png")}}
</style>
</head>
<body>

<div class="topbar" id="wiki-topbar">
  <a class="tb-mark serif" href="index.html">这一身<i>百科</i></a>
  <nav class="tb-links" aria-label="图鉴分卷">{nav}</nav>
  <button class="tb-theme" id="wiki-theme-toggle" type="button" title="留灯 / 熄灯" aria-label="切换明暗主题">☾</button>
</div>

<header class="codex-hero">
  <div class="frame">
    <p class="eyebrow">{esc(eyebrow)}</p>
    <h1 class="serif">{esc(title)}</h1>
    <p class="sub">{esc(sub)}</p>
  </div>
</header>

<main class="codex">
{body}
</main>

<div class="foot">这一身 · 百科图鉴 · 全部素材直接取自游戏运行时资源 · <a href="index.html">返回故事线正典</a></div>
<script>{AUDIO_JS}</script>
</body>
</html>
"""


# ─────────────────────────── 数据装载 ───────────────────────────

def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def load_voice_canon() -> list[dict]:
    raw = (DOCS / "voice-canon-v1.js").read_text(encoding="utf-8")
    raw = raw.split("=", 1)[1].strip().rstrip(";")
    return json.loads(raw)


def load_voice_manifest() -> dict[str, dict]:
    data = load_json(ROOT / "public/assets/audio/voice/manifest.json") or []
    return {clip["id"]: clip for clip in data}


def voice_row(clip: dict, manifest: dict[str, dict], show_speaker: bool = True) -> str:
    file = "assets/voice/" + Path(clip["file"]).name
    if not (VOICE_DIR / Path(clip["file"]).name).exists():
        return ""
    meta_bits = []
    if show_speaker and clip.get("speaker"):
        meta_bits.append(esc(clip["speaker"]))
    for key in ("stage", "scene", "trigger"):
        if clip.get(key):
            meta_bits.append(esc(clip[key]))
    dur = manifest.get(clip["id"], {}).get("durationMs")
    if dur:
        meta_bits.append(f"{dur / 1000:.1f}s")
    return (
        f'<div class="vo" id="vo-{esc(clip["id"])}">'
        f'<button class="vo-play" type="button" data-src="{file}" aria-label="播放语音">▶</button>'
        f'<div><p class="vo-text serif">「{esc(clip["text"])}」</p>'
        f'<p class="vo-meta">{" · ".join(meta_bits)}</p></div></div>'
    )


def gif_fig(rel: str, caption: str, width: int | None = None) -> str:
    path = DOCS / "assets/wiki" / rel
    if not path.exists():
        return ""
    w = f' style="width:{width}px"' if width else ""
    return (
        f'<figure class="anim"><img src="assets/wiki/{rel}" alt="{esc(caption)}" loading="lazy"{w}>'
        f"<figcaption>{esc(caption)}</figcaption></figure>"
    )


def motion_strip(atlas_stem: str, width: int | None = None) -> str:
    figs = []
    for motion, label in MOTION_LABEL.items():
        figs.append(gif_fig(f"gif/enemy/{atlas_stem}-{motion}.gif", label, width))
    return '<div class="g">' + "".join(figs) + "</div>"


def icon_span(index: int, name: str) -> str:
    col, row = index % ICON_COLS, index // ICON_COLS
    x, y = col * ICON_CELL * ICON_SCALE, row * ICON_CELL * ICON_SCALE
    return (
        f'<span class="ric" role="img" aria-label="{esc(name)}" '
        f'style="background-position:-{x}px -{y}px"></span>'
    )


# ─────────────────────────── 静态切片 ───────────────────────────

def slice_static_assets() -> None:
    IMG.mkdir(parents=True, exist_ok=True)

    props = Image.open(ROOT / "src/assets/world/props.png").convert("RGBA")
    for si, (_, names) in enumerate(PROP_STAGES):
        for vi, name in enumerate(names):
            cell = props.crop((vi * 40, si * 44, (vi + 1) * 40, (si + 1) * 44))
            cell.resize((cell.width * 2, cell.height * 2), Image.NEAREST).save(IMG / f"prop-{si}-{vi}.png")

    entities = Image.open(ROOT / "src/assets/world/entities.png").convert("RGBA")
    for i in range(len(ENTITIES)):
        cell = entities.crop((i * 64, 0, (i + 1) * 64, 72))
        cell.resize((cell.width * 2, cell.height * 2), Image.NEAREST).save(IMG / f"entity-{i}.png")

    combo = load_json(ROOT / "src/assets/ui/combo-art.json")
    atlas = Image.open(ROOT / "src/assets/ui/combo-art.png").convert("RGBA")
    cw, ch, cols = combo["cellWidth"], combo["cellHeight"], combo["cols"]
    for i, key in enumerate(combo["keys"]):
        cell = atlas.crop(((i % cols) * cw, (i // cols) * ch, (i % cols + 1) * cw, (i // cols + 1) * ch))
        cell.save(IMG / f"combo-{key}.png")

    status = load_json(ROOT / "src/assets/vfx/status.json")
    satlas = Image.open(ROOT / "src/assets/vfx/status.png").convert("RGBA")
    sc, scols = status["cell"], status["cols"]
    for key, idx in status["index"].items():
        cell = satlas.crop(((idx % scols) * sc, (idx // scols) * sc, (idx % scols + 1) * sc, (idx // scols + 1) * sc))
        cell.resize((sc * 5, sc * 5), Image.NEAREST).save(IMG / f"status-{key}.png")

    syn = load_json(ROOT / "src/assets/vfx/synergy.json")
    syatlas = Image.open(ROOT / "src/assets/vfx/synergy.png").convert("RGBA")
    yc = syn["cell"]
    for key, idx in syn["index"].items():
        cell = syatlas.crop((idx * yc, 0, (idx + 1) * yc, yc))
        cell.resize((yc * 4, yc * 4), Image.NEAREST).save(IMG / f"synergy-{key}.png")

    for src, dst in (
        ("src/assets/ui/title-life-clutter.png", "title.png"),
        ("src/assets/ui/ending-table.png", "ending-table.png"),
        ("src/assets/ui/ending-lampman.png", "ending-lampman.png"),
        ("src/assets/ui/chapter-strips.png", "chapter-strips.png"),
        ("src/assets/ui/fate-profiles.png", "fate-profiles.png"),
        ("src/assets/rooms/lamp.png", "room-lamp.png"),
        ("src/assets/rooms/inner.png", "room-inner.png"),
        ("src/assets/rooms/pawn.png", "room-pawn.png"),
        *[(f"src/assets/world/stage-floor-{i}.png", f"floor-{i}.png") for i in range(6)],
    ):
        (IMG / dst).write_bytes((ROOT / src).read_bytes())

    lighting = ROOT / "output/art-lighting-review-v1/processed/stage-lighting-runtime-composite.png"
    if not lighting.exists():
        lighting = ROOT / "output/art-lighting-review-v1/stage-lighting-runtime-composite.png"
    if lighting.exists():
        (IMG / "lighting.png").write_bytes(lighting.read_bytes())


# ─────────────────────────── Boss 志 ───────────────────────────

def build_boss_page(voice_canon: list[dict], vmanifest: dict[str, dict]) -> str | None:
    bosses = load_json(DATA / "bosses.json")
    if not bosses:
        return None
    skill_manifest = load_json(ROOT / "src/assets/enemies/boss-skills-v1/manifest.json")
    v2 = load_json(ROOT / "src/assets/enemies/boss-skills-v2/manifest.json") or {"skills": {}}
    clips_by_id = {c["id"]: c for c in voice_canon}

    toc = []
    entries = []
    for boss in bosses:
        bid = boss["id"]
        tier = TIER_LABEL.get(boss.get("tier", ""), boss.get("tier", ""))
        toc.append(f'<a class="chip" href="#boss-{esc(bid)}">{esc(boss["name"])}</a>')

        portrait = ""
        if boss.get("portrait") and (DOCS / boss["portrait"]).exists():
            portrait = (
                f'<img class="portrait" src="{esc(boss["portrait"])}" alt="{esc(boss["name"])} 立绘" '
                'loading="lazy" style="width:150px;height:auto">'
            )

        info = [f'<div class="chips"><span class="chip red">{esc(boss["stage"])} · {esc(tier)}</span>']
        if boss.get("legacyDrop"):
            info.append(f'<span class="chip gold">传承掉落 · {esc(boss["legacyDrop"])}</span>')
        info.append("</div>")
        info.append(f'<h3 class="serif" style="margin-top:8px">《{esc(boss["name"])}》</h3>')
        if boss.get("battlefield"):
            info.append(f'<p class="dim" style="margin:4px 0 0;font-size:13.5px">战场 · {esc(boss["battlefield"])}</p>')
        if boss.get("mechanics"):
            info.append(f'<p style="margin:10px 0 0;font-size:14.5px">{esc(boss["mechanics"])}</p>')

        base_gifs = []
        for stem in BOSS_BASE_ATLAS.get(bid, []):
            base_gifs.append(motion_strip(stem, width=None))
        design = ""
        if boss.get("designStory"):
            design = f'<p class="sub-h">设计背景</p><div class="flavor serif">{esc(boss["designStory"])}</div>'

        skills_html = []
        for skill in boss.get("skills", []):
            sid = skill["skillId"]
            rel = f"gif/boss-skill-8f/{sid}.gif" if sid in v2.get("skills", {}) else f"gif/boss-skill/{sid}.gif"
            if not (DOCS / "assets/wiki" / rel).exists():
                continue
            lore = f'<span class="lr serif">“{esc(skill["lore"])}”</span>' if skill.get("lore") else ""
            frames = "8 帧" if "8f" in rel else "4 帧"
            skills_html.append(
                '<div class="skill-card">'
                f'<img src="assets/wiki/{rel}" alt="{esc(skill.get("name", sid))} 动画" loading="lazy">'
                f'<span class="nm serif">《{esc(skill.get("name", sid))}》<span class="dim" style="font-weight:400;font-size:11px"> · {frames}</span></span>'
                f'<span class="desc">{esc(skill.get("desc", ""))}</span>{lore}'
                "</div>"
            )

        voices = []
        for cid in boss.get("voiceClips", []):
            clip = clips_by_id.get(cid)
            if clip:
                voices.append(voice_row(clip, vmanifest))
        voice_html = ""
        if voices:
            voice_html = '<p class="sub-h">语音</p>' + "".join(voices)

        lore_lines = ""
        if boss.get("loreLines"):
            rows = "".join(f'<p class="lore serif" style="margin:4px 0">“{esc(line)}”</p>' for line in boss["loreLines"])
            lore_lines = f'<p class="sub-h">隐喻字幕</p>{rows}'

        entries.append(
            f'<section class="bx" id="boss-{esc(bid)}">'
            f'<div class="boss-head"><div>{portrait}</div><div class="boss-info">{"".join(info)}</div></div>'
            f'{design}'
            f'<p class="sub-h">基础形态</p>{"".join(base_gifs)}'
            + (f'<p class="sub-h">招式 · {len(skills_html)} 式</p><div class="skill-grid">{"".join(skills_html)}</div>' if skills_html else "")
            + lore_lines
            + voice_html
            + "</section>"
        )

    body = (
        '<div class="chips" style="margin:6px 0 18px">' + "".join(toc) + "</div>" + "".join(entries)
    )
    return shell(
        "boss.html", "Boss志", "他从降生到老死遇到的最大的困难",
        "十二个大小 Boss · 立绘原图 / 基础形态动图 / 逐招动画 / 设计背景 / 隐喻字幕 / 情境语音，围绕每一个词条聚合。",
        body,
    )


# ─────────────────────────── 敌怪志 ───────────────────────────

def build_bestiary_page() -> str | None:
    enemies = load_json(DATA / "enemies.json")
    if not enemies:
        return None
    by_stage: dict[str, list[dict]] = {}
    for enemy in enemies:
        by_stage.setdefault(enemy["stage"], []).append(enemy)

    sections = []
    for stage in STAGE_ORDER:
        group = by_stage.get(stage)
        if not group:
            continue
        cards = []
        for enemy in group:
            portrait = ""
            if enemy.get("portrait") and (DOCS / enemy["portrait"]).exists():
                portrait = (
                    f'<img class="portrait" src="{esc(enemy["portrait"])}" alt="{esc(enemy["name"])} 立绘" '
                    'loading="lazy" style="width:96px;height:auto">'
                )
            chips = [f'<span class="chip blue">{esc(enemy["stage"])}</span>']
            if enemy.get("alsoStages"):
                chips.append(f'<span class="chip">复用于 {esc("、".join(enemy["alsoStages"]))}</span>')
            if enemy.get("displaySize"):
                chips.append(f'<span class="chip">战场 {enemy["displaySize"]}px</span>')
            note = f'<div class="flavor serif">{esc(enemy["note"])}</div>' if enemy.get("note") else ""
            cards.append(
                f'<section class="bx" id="enemy-{esc(enemy["id"])}">'
                f'<div class="item-row"><div>{portrait}</div><div class="item-main">'
                f'<div class="chips">{"".join(chips)}</div>'
                f'<h3 class="serif" style="margin-top:6px">{esc(enemy["name"])}</h3>'
                f'{note}'
                f'<p style="font-size:14px;margin:8px 0 12px">{esc(enemy.get("mechanic", ""))}</p>'
                f'{motion_strip(enemy["atlas"])}'
                "</div></div></section>"
            )
        sections.append(
            f'<div class="sect-h"><h2 class="serif">{esc(stage)}</h2><span class="cnt">{len(group)} 种</span></div>'
            + "".join(cards)
        )
    body = "".join(sections)
    return shell(
        "bestiary.html", "敌怪志", "从降生到老死遇到的各种困难",
        "六章现役普通怪全图鉴 · 立绘 / 五态循环动图 / 专属机制 / 生活注脚。大小 Boss 见 Boss志。",
        body,
    )


# ─────────────────────────── 道具志 ───────────────────────────

def build_items_page() -> str | None:
    data = load_json(DATA / "items.json")
    if not data:
        return None
    items = data["items"]
    combos = {c["key"]: c for c in data.get("combos", [])}
    name_by_id = {item["id"]: item["name"] for item in items}

    sections = []
    for quality in (5, 4, 3, 2, 1):
        group = [item for item in items if item["quality"] == quality]
        if not group:
            continue
        roman, label, qvar = QUALITY[quality]
        cards = []
        for item in group:
            chips = [f'<span class="chip" style="color:var(--{qvar});border-color:var(--{qvar})">{roman} · {label}</span>']
            pool = POOL_LABEL.get(item.get("pool", ""), item.get("pool", ""))
            if pool:
                chips.append(f'<span class="chip">{esc(pool)}</span>')
            for tag in item.get("tags", []):
                chips.append(f'<span class="chip blue">{esc(tag)}</span>')
            for key in item.get("combos", []):
                cname = combos.get(key, {}).get("name") or COMBO_NAMES.get(key, key)
                chips.append(f'<a class="chip gold" href="#combo-{esc(key)}">组合 · {esc(cname)}</a>')
            manifestation = ""
            if item.get("manifestation") and (DOCS / item["manifestation"]).exists():
                manifestation = (
                    f'<details style="margin-top:10px"><summary class="dim" style="cursor:pointer;font-size:13px">主角体现图</summary>'
                    f'<img class="shot" src="{esc(item["manifestation"])}" alt="{esc(item["name"])} 主角体现" '
                    'loading="lazy" style="margin-top:8px;max-width:520px;width:100%"></details>'
                )
            cards.append(
                f'<section class="bx" id="item-{esc(item["id"])}">'
                f'<div class="item-row">{icon_span(item["iconIndex"], item["name"])}'
                f'<div class="item-main"><div class="chips">{"".join(chips)}</div>'
                f'<h3 class="serif" style="font-size:19px;margin-top:6px">{esc(item["name"])}</h3>'
                f'<div class="flavor serif">{esc(item.get("flavor", ""))}</div>'
                f'<p class="dim" style="font-size:13.5px;margin:8px 0 0">{esc(item.get("mechanic", ""))}</p>'
                f"{manifestation}"
                "</div></div></section>"
            )
        sections.append(
            f'<div class="sect-h"><h2 class="serif">{roman} · {label}</h2><span class="cnt">{len(group)} 件</span></div>'
            f'<div class="card-grid">{"".join(cards)}</div>'
        )

    combo_cards = []
    for key, combo in combos.items():
        members = "、".join(name_by_id.get(m, m) for m in combo.get("members", []))
        art = f'<img class="shot" src="assets/wiki/img/combo-{esc(key)}.png" alt="{esc(combo["name"])} 奥义插画" loading="lazy" style="width:100%;max-width:420px">' \
            if (IMG / f"combo-{key}.png").exists() else ""
        combo_cards.append(
            f'<section class="bx" id="combo-{esc(key)}">{art}'
            f'<h3 class="serif" style="font-size:18px;margin-top:10px">《{esc(combo["name"])}》</h3>'
            f'<p class="dim" style="font-size:13px;margin:6px 0 2px">集齐 · {esc(members)}</p>'
            f'<p style="font-size:14px;margin:4px 0 0">{esc(combo.get("effect", ""))}</p></section>'
        )
    combo_section = (
        '<div class="sect-h"><h2 class="serif">组合名鉴 · 奥义插画</h2>'
        f'<span class="cnt">{len(combo_cards)} 组 · 集齐的瞬间在战场上浮现 3.4 秒</span></div>'
        f'<div class="card-grid">{"".join(combo_cards)}</div>'
    )

    body = "".join(sections) + combo_section
    return shell(
        "items.html", "道具志", "每一件道具，都是他活过的证据",
        f"{len(items)} 件人生物证 · 图标 / 品质 / 获取途径 / 铭文 / 机制 / 主角体现图 / 所属组合。",
        body,
    )


# ─────────────────────────── 语音馆 ───────────────────────────

def build_voices_page(voice_canon: list[dict], vmanifest: dict[str, dict]) -> str:
    groups: dict[str, list[dict]] = {}
    for clip in voice_canon:
        groups.setdefault(clip.get("speaker") or clip.get("role") or "其他", []).append(clip)

    def stage_rank(clips: list[dict]) -> int:
        stages = [STAGE_ORDER.index(c["stage"]) for c in clips if c.get("stage") in STAGE_ORDER]
        return min(stages) if stages else 99

    sections = []
    for speaker, clips in sorted(groups.items(), key=lambda kv: (stage_rank(kv[1]), -len(kv[1]))):
        first = clips[0]
        mclip = vmanifest.get(first["id"], {})
        delivery = mclip.get("delivery", {})
        chips = [f'<span class="chip red">{len(clips)} 条</span>']
        if first.get("role") and first["role"] != speaker:
            chips.append(f'<span class="chip">{esc(first["role"])}</span>')
        if delivery.get("voice"):
            chips.append(f'<span class="chip blue">音色 · {esc(delivery["voice"])}</span>')
        stages = sorted({c["stage"] for c in clips if c.get("stage")}, key=lambda s: STAGE_ORDER.index(s) if s in STAGE_ORDER else 99)
        if stages:
            chips.append(f'<span class="chip">{esc(" / ".join(stages))}</span>')
        perf = f'<p class="dim" style="font-size:13px;margin:6px 0 10px">{esc(first["performance"])}</p>' if first.get("performance") else ""
        rows = "".join(voice_row(c, vmanifest, show_speaker=False) for c in clips)
        sections.append(
            f'<section class="bx" id="speaker-{abs(hash(speaker)) % 99999}">'
            f'<div class="chips">{"".join(chips)}</div>'
            f'<h3 class="serif" style="margin-top:6px">{esc(speaker)}</h3>'
            f"{perf}{rows}</section>"
        )

    total = len(voice_canon)
    body = (
        '<p class="dim" style="font-size:13.5px">全部台词由 MiniMax speech-2.8-hd 离线渲染，'
        "每个具名角色独立选角；点 ▶ 试听，同一时间只播一条。</p>" + "".join(sections)
    )
    return shell(
        "voices.html", "语音馆", "有些话他记了一辈子",
        f"{total} 条情境语音 · 按角色分组 · 台词原文 / 触发情境 / 音色设计一并陈列。",
        body,
    )


# ─────────────────────────── 世界志 ───────────────────────────

def build_world_page() -> str:
    parts = []

    parts.append('<div class="sect-h"><h2 class="serif">主角人偶</h2><span class="cnt">标准身形 · 40×56 帧 · 发色/衣着/伤痕由代码实时改写</span></div>')
    hero_figs = [gif_fig(f"gif/hero/hero-{m}.gif", label) for m, label in
                 (("idle", "站立"), ("walk", "行走"), ("attack", "吐气"), ("hurt", "受击"))]
    hero_figs.append(gif_fig("gif/hero/hero-walk-raincoat.gif", "《父亲的雨衣》穿戴态"))
    parts.append('<section class="bx"><div class="g">' + "".join(hero_figs) + "</div></section>")

    parts.append('<div class="sect-h"><h2 class="serif">开屏与六章地面</h2><span class="cnt">非夜间正典 · 清晨到苍白午后，只有终局入夜</span></div>')
    floors = "".join(
        f'<figure class="anim"><img src="assets/wiki/img/floor-{i}.png" alt="{name}" loading="lazy" style="width:96px">'
        f"<figcaption>{name}</figcaption></figure>"
        for i, name in enumerate(FLOOR_NAMES)
    )
    parts.append(
        '<section class="bx"><div class="g">'
        '<figure class="anim"><img src="assets/wiki/img/title.png" alt="开屏标题画" loading="lazy" style="width:220px"><figcaption>开屏 · 人生之夜</figcaption></figure>'
        + floors + "</div>"
        + (f'<img class="shot" src="assets/wiki/img/lighting.png" alt="六章战场照明" loading="lazy" style="margin-top:16px;width:100%">'
           '<p class="dim" style="font-size:12px;margin:6px 0 0">六章战场照明 · 清晨 / 白昼 / 傍晚 / 饭桌灯 / 日光灯 / 苍白午后</p>'
           if (IMG / "lighting.png").exists() else "")
        + "</section>"
    )

    parts.append('<div class="sect-h"><h2 class="serif">场景摆设 · 六章二十四件</h2><span class="cnt">随奔跑在脚下渐变换代</span></div>')
    for si, (stage_name, names) in enumerate(PROP_STAGES):
        figs = "".join(
            f'<figure class="anim"><img src="assets/wiki/img/prop-{si}-{vi}.png" alt="{name}" loading="lazy" style="width:80px">'
            f"<figcaption>{name}</figcaption></figure>"
            for vi, name in enumerate(names)
        )
        parts.append(f'<p class="sub-h">{stage_name}</p><div class="g">{figs}</div>')

    parts.append('<div class="sect-h"><h2 class="serif">门、灯与房间</h2><span class="cnt">战场可交互实体与三间内景</span></div>')
    ent = "".join(
        f'<figure class="anim"><img src="assets/wiki/img/entity-{i}.png" alt="{name}" loading="lazy" style="width:128px">'
        f"<figcaption>{name}<br><span style='font-size:11px'>{note}</span></figcaption></figure>"
        for i, (name, note) in enumerate(ENTITIES)
    )
    rooms = "".join(
        f'<figure class="anim"><img src="assets/wiki/img/room-{key}.png" alt="{name}" loading="lazy" style="width:170px">'
        f"<figcaption>{name}</figcaption></figure>"
        for key, name in (("lamp", "留灯间 · 加成"), ("inner", "里屋 · 代价"), ("pawn", "没有招牌的当铺"))
    )
    parts.append(f'<section class="bx"><div class="g">{ent}</div><div class="g" style="margin-top:16px">{rooms}</div></section>')

    parts.append('<div class="sect-h"><h2 class="serif">章节题图与命运纹样</h2><span class="cnt">转场与命运牌共用纹样</span></div>')
    parts.append(
        '<section class="bx"><div class="g">'
        '<figure class="anim"><img src="assets/wiki/img/chapter-strips.png" alt="六章转场题图" loading="lazy" style="width:130px"><figcaption>六章转场题图</figcaption></figure>'
        '<figure class="anim"><img src="assets/wiki/img/fate-profiles.png" alt="六类命运纹样" loading="lazy" style="width:300px"><figcaption>六类命运纹样</figcaption></figure>'
        "</div></section>"
    )

    parts.append('<div class="sect-h"><h2 class="serif">结局定格</h2><span class="cnt">人活一口气 · 收灯人一盏灯剥一件道具</span></div>')
    parts.append(
        '<section class="bx"><div class="g">'
        '<figure class="anim"><img src="assets/wiki/img/ending-table.png" alt="物证陈列桌" loading="lazy" style="width:230px"><figcaption>物证陈列桌</figcaption></figure>'
        '<figure class="anim"><img src="assets/wiki/img/ending-lampman.png" alt="路灯下的收灯人" loading="lazy" style="width:230px"><figcaption>路灯下的收灯人</figcaption></figure>'
        + gif_fig("gif/save/tooth.gif", "免死 · 乳牙")
        + gif_fig("gif/save/photo.gif", "免死 · 遗照")
        + gif_fig("gif/save/shutdown.gif", "免死 · 关服那天")
        + "</div></section>"
    )

    return shell(
        "world.html", "世界志", "他可以跑，但逃不出这一生",
        "主角人偶 / 六章地面与照明 / 场景摆设 / 门灯房间 / 章节纹样 / 结局定格，全部为实机运行资源。",
        "".join(parts),
    )


# ─────────────────────────── 特效馆 ───────────────────────────

def build_vfx_page() -> str:
    parts = []
    anim = load_json(ROOT / "src/assets/vfx/projectile-anim.json")

    parts.append('<div class="sect-h"><h2 class="serif">《一口气》弹体 · 飞行形态</h2>'
                 f'<span class="cnt">{len(anim["forms"])} 种形态 · 4 帧 @10fps · 帧动画正典 v5</span></div>')
    breath_keys = [k for k in anim["forms"] if k.startswith("breath")]
    other_keys = [k for k in anim["forms"] if not k.startswith("breath")]
    breath_order = ["breath0", "breath", "breath2", "breath3"]
    breath_figs = "".join(gif_fig(f"gif/projectile/{k}.gif", PROJ_NAMES.get(k, k)) for k in breath_order if k in breath_keys or k == "breath")
    parts.append('<section class="bx"><p class="sub-h">凝实度四态 · 从无形雾到实心珠光</p><div class="g">'
                 + breath_figs + "</div>"
                 '<p class="sub-h">道具改写的弹体形态</p><div class="g">'
                 + "".join(gif_fig(f"gif/projectile/{k}.gif", PROJ_NAMES.get(k, k)) for k in other_keys)
                 + '</div><p class="dim" style="font-size:12.5px;margin:12px 0 0">'
                 '在线逐帧审阅页：<a href="review-projectiles.html" style="color:var(--rainyellow)">弹体审阅 · 21 卡循环</a></p></section>')

    hits = load_json(ROOT / "src/assets/vfx/hits.json")
    parts.append('<div class="sect-h"><h2 class="serif">命中与消散 · 十一种材质</h2>'
                 '<span class="cnt">敌怪材质决定命中反馈 · v2 全生图化</span></div>')
    parts.append('<section class="bx"><div class="g">'
                 + "".join(gif_fig(f"gif/hit/{m}.gif", HIT_NAMES.get(m, m)) for m in hits["materials"])
                 + "</div></section>")

    parts.append('<div class="sect-h"><h2 class="serif">成双协同 · 状态标记</h2>'
                 '<span class="cnt">协同首触发 say「成双·…」一局一次 · 状态图标挂在敌怪头顶</span></div>')
    syn_figs = "".join(
        f'<figure class="anim"><img src="assets/wiki/img/synergy-{k}.png" alt="{label}" loading="lazy">'
        f"<figcaption>{label}</figcaption></figure>"
        for k, label in SYNERGY_NAMES.items() if (IMG / f"synergy-{k}.png").exists()
    )
    status_figs = "".join(
        f'<figure class="anim"><img src="assets/wiki/img/status-{k}.png" alt="{label}" loading="lazy">'
        f"<figcaption>{label}</figcaption></figure>"
        for k, label in STATUS_NAMES.items() if (IMG / f"status-{k}.png").exists()
    )
    parts.append(f'<section class="bx"><div class="g">{syn_figs}</div><div class="g" style="margin-top:16px">{status_figs}</div></section>')

    return shell(
        "vfx.html", "特效馆", "弹是主角的手，不能盖过人",
        "弹体飞行帧动画 / 十一材质命中 / 成双协同 / 状态标记，全部直接裁自运行时图集。",
        "".join(parts),
    )


# ─────────────────────────── 主流程 ───────────────────────────

def main() -> None:
    slice_static_assets()
    voice_canon = load_voice_canon()
    vmanifest = load_voice_manifest()

    outputs: dict[str, str | None] = {
        "boss.html": build_boss_page(voice_canon, vmanifest),
        "bestiary.html": build_bestiary_page(),
        "items.html": build_items_page(),
        "voices.html": build_voices_page(voice_canon, vmanifest),
        "world.html": build_world_page(),
        "vfx.html": build_vfx_page(),
    }
    for name, content in outputs.items():
        if content is None:
            print(f"skip {name}（缺 wiki-data 数据）")
            continue
        (DOCS / name).write_text(content, encoding="utf-8")
        print(f"{name} · {len(content) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
