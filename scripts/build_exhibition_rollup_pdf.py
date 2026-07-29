#!/usr/bin/env python3
"""Build the 80x200cm exhibition roll-up from real encyclopedia assets."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "zhe-yi-shen-rollup-wiki-style-v2.pdf"

PAGE_W = 80 * cm
PAGE_H = 200 * cm
SAFE_X = 4 * cm
CONTENT_W = PAGE_W - SAFE_X * 2
CONTENT_TOP = PAGE_H - 16 * cm
CONTENT_BOTTOM = 22 * cm

# Keep the print palette identical to the encyclopedia frontend.
INK = HexColor("#E8E1D3")
PAPER = HexColor("#D8D0C1")
GOLD = HexColor("#C6A44A")
GOLD_DIM = HexColor("#756333")
MUTED = HexColor("#AAA297")
BLUE = HexColor("#71818A")
OLD_RED = HexColor("#9F3548")
OLD_RED_SOFT = HexColor("#B06961")
DEEP = HexColor("#101014")
PANEL = HexColor("#1B1A20")
PANEL_2 = HexColor("#201F26")
LINE = HexColor("#34323A")
BG = HexColor("#111116")
FONT_SERIF = "Songti"
FONT_SANS = "STHeiti"
FONT_DISPLAY = "STHeitiMedium"

OPENING_CUES = [
    ("01", "人出生的时候，先哭一声。\n那是他来到世上，领到的第一口气。"),
    ("02", "有人出生时，门外站满了人；\n有人哭了很久，才有人推门。\n芸芸众生，来处不同。"),
    ("03", "后来大人教他争气，\n也教他忍气。"),
    ("04", "后来他们各自长大，\n也各自遇见，各自躲不过的事。"),
    ("05", "受了委屈，咽下去叫懂事；\n吐出来，又有人说他不懂事。\n每种选择，都有所得，也有所失。"),
    ("06", "有些气成了脾气，\n有些气撑成了骨气，\n还有一些，一直留在身体里。"),
    ("07", "得到的，穿在身上；失去的，也穿在身上。\n芸芸众生，各有各的这一身。"),
    ("08", "这一身并非生来如此，\n而是被这一生，一件件穿成的。\n现在，轮到你了。"),
]

BOSSES = [
    ("coat-rack.png", "立在墙角的衣架", "童年 · 小Boss"),
    ("closet-dark.png", "没人相信的怪物", "童年 · 章节Boss"),
    ("uniform-answer.png", "统一答案", "少年 · 小Boss"),
    ("silent-father.png", "沉默的父亲", "少年 · 章节Boss"),
    ("last-bus.png", "末班车", "青年 · 小Boss"),
    ("praise-chair.png", "你很优秀", "青年 · 章节Boss"),
    ("wet-shoes.png", "还没干的那双鞋", "成年 · 小Boss"),
    ("ringing-phone.png", "响个不停", "成年 · 章节Boss"),
    ("whose-box.png", "不知道是谁的纸箱", "中年 · 小Boss"),
    ("debt-collector.png", "上门催收", "中年 · 章节Boss"),
    ("revolving-lantern.png", "走马灯", "暮年 · 小Boss"),
    ("lamp-keeper.png", "收灯人", "暮年 · 章节Boss"),
]


def path(*parts: str) -> Path:
    return ROOT.joinpath(*parts)


def draw_round_panel(
    canvas: Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    fill: Color = PANEL,
    stroke: Color = LINE,
    radius: float = 0.36 * cm,
    alpha: float = 0.97,
) -> None:
    canvas.saveState()
    canvas.setFillAlpha(alpha)
    canvas.setStrokeAlpha(0.9)
    canvas.setFillColor(fill)
    canvas.setStrokeColor(stroke)
    canvas.setLineWidth(0.55)
    canvas.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    canvas.restoreState()


def draw_image_contain(
    canvas: Canvas,
    image_path: Path,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    pad: float = 0,
) -> None:
    with Image.open(image_path) as image:
        iw, ih = image.size
    scale = min((w - 2 * pad) / iw, (h - 2 * pad) / ih)
    dw, dh = iw * scale, ih * scale
    canvas.drawImage(
        str(image_path),
        x + (w - dw) / 2,
        y + (h - dh) / 2,
        width=dw,
        height=dh,
        preserveAspectRatio=True,
        mask="auto",
    )


def draw_image_cover(
    canvas: Canvas,
    image_path: Path,
    x: float,
    y: float,
    w: float,
    h: float,
) -> None:
    with Image.open(image_path) as image:
        iw, ih = image.size
    scale = max(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    canvas.saveState()
    clip = canvas.beginPath()
    clip.rect(x, y, w, h)
    canvas.clipPath(clip, stroke=0, fill=0)
    canvas.drawImage(
        str(image_path),
        x + (w - dw) / 2,
        y + (h - dh) / 2,
        width=dw,
        height=dh,
        preserveAspectRatio=True,
        mask="auto",
    )
    canvas.restoreState()


def draw_lines(
    canvas: Canvas,
    lines: Iterable[str],
    x: float,
    top: float,
    *,
    font: str = FONT_SANS,
    size: float = 16,
    leading: float | None = None,
    color: Color = PAPER,
) -> None:
    if leading is None:
        leading = size * 1.38
    canvas.setFont(font, size)
    canvas.setFillColor(color)
    cursor = top
    for line in lines:
        canvas.drawString(x, cursor, line)
        cursor -= leading


def draw_section_title(
    canvas: Canvas,
    y: float,
    index: str,
    title: str,
    meta: str,
) -> None:
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.8)
    canvas.line(SAFE_X, y - 0.25 * cm, PAGE_W - SAFE_X, y - 0.25 * cm)
    canvas.setFillColor(OLD_RED)
    canvas.roundRect(SAFE_X, y - 0.11 * cm, 1.55 * cm, 0.98 * cm, 0.20 * cm, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 15)
    canvas.setFillColor(INK)
    canvas.drawCentredString(SAFE_X + 0.775 * cm, y + 0.12 * cm, index)
    canvas.setFont(FONT_SERIF, 31)
    canvas.setFillColor(INK)
    canvas.drawString(SAFE_X + 2.15 * cm, y - 0.03 * cm, title)
    canvas.setFont(FONT_SANS, 15)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(PAGE_W - SAFE_X, y + 0.08 * cm, meta)


def draw_background(canvas: Canvas) -> None:
    canvas.setFillColor(BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # The wiki uses a dark desk texture under its cards.
    texture = path("docs", "assets", "desk-texture.png")
    canvas.saveState()
    canvas.setFillAlpha(0.11)
    tile = 9.6 * cm
    for tx in range(0, 9):
        for ty in range(0, 22):
            canvas.drawImage(
                str(texture),
                tx * tile,
                ty * tile,
                width=tile,
                height=tile,
                preserveAspectRatio=True,
                mask="auto",
            )
    canvas.restoreState()

    # Keep the masthead field quiet: the wiki relies on typography and cards,
    # not a large illustration behind its page title.


def draw_chip(
    canvas: Canvas,
    x: float,
    y: float,
    text: str,
    *,
    color: Color = MUTED,
    width: float | None = None,
) -> float:
    canvas.setFont(FONT_SANS, 10.5)
    if width is None:
        width = max(2.5 * cm, canvas.stringWidth(text, FONT_SANS, 10.5) + 1.1 * cm)
    canvas.setStrokeColor(color)
    canvas.setLineWidth(0.55)
    canvas.roundRect(x, y, width, 0.9 * cm, 0.45 * cm, fill=0, stroke=1)
    canvas.setFillColor(color)
    canvas.drawCentredString(x + width / 2, y + 0.24 * cm, text)
    return width


def build_pdf() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(
        TTFont(FONT_SERIF, "/System/Library/Fonts/Supplemental/Songti.ttc", subfontIndex=0)
    )
    pdfmetrics.registerFont(
        TTFont(FONT_SANS, "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=0)
    )
    pdfmetrics.registerFont(
        TTFont(FONT_DISPLAY, "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=0)
    )
    canvas = Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    canvas.setTitle("《这一身》易拉宝 · 百科前端风格美术资源陈列")
    canvas.setAuthor("《这一身》项目组")
    draw_background(canvas)

    # Official top safety band: background may continue, but no critical copy.
    canvas.saveState()
    canvas.setFillAlpha(0.18)
    canvas.setFillColor(DEEP)
    canvas.rect(0, PAGE_H - 16 * cm, PAGE_W, 16 * cm, fill=1, stroke=0)
    canvas.restoreState()

    # Encyclopedia masthead, kept below the official top safety band.
    title_top = PAGE_H - 21.6 * cm
    canvas.setFont(FONT_SANS, 15)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(PAGE_W / 2, title_top + 3.7 * cm, "他 从 降 生 到 老 死 遇 到 的 最 大 的 困 难")
    canvas.setFont(FONT_SERIF, 126)
    canvas.setFillColor(INK)
    canvas.drawCentredString(PAGE_W / 2, title_top, "这一身")
    canvas.setFont("Helvetica", 24)
    canvas.setFillColor(GOLD)
    canvas.drawCentredString(PAGE_W / 2, title_top - 2.15 * cm, "AI-NATIVE  LIFE-BUILD  ROGUELITE")
    canvas.setFont(FONT_SERIF, 25)
    canvas.setFillColor(PAPER)
    canvas.drawCentredString(PAGE_W / 2, title_top - 4.45 * cm, "事情是改不了的，怎么做是可以选择的。")

    nav_y = title_top - 6.65 * cm
    nav_labels = [
        ("正典", OLD_RED),
        ("Boss志", OLD_RED_SOFT),
        ("敌怪志", BLUE),
        ("道具志", GOLD),
        ("语音馆", MUTED),
        ("世界志", BLUE),
        ("特效馆", GOLD),
    ]
    nav_widths = [3.5 * cm, 4.3 * cm, 4.3 * cm, 4.3 * cm, 4.3 * cm, 4.3 * cm, 4.3 * cm]
    total_nav = sum(nav_widths) + 0.55 * cm * (len(nav_widths) - 1)
    nav_x = (PAGE_W - total_nav) / 2
    for (label, color), chip_w in zip(nav_labels, nav_widths):
        draw_chip(canvas, nav_x, nav_y, label, color=color, width=chip_w)
        nav_x += chip_w + 0.55 * cm

    # 02 Opening comic.
    opening_y = title_top - 9.2 * cm
    draw_section_title(canvas, opening_y, "01", "开场漫画 · 八幕", "从第一口气，到轮到你")
    grid_top = opening_y - 1.4 * cm
    gap = 0.7 * cm
    col_w = (CONTENT_W - gap) / 2
    row_h = 5.25 * cm
    for idx, (number, copy) in enumerate(OPENING_CUES):
        col = idx % 2
        row = idx // 2
        x = SAFE_X + col * (col_w + gap)
        y = grid_top - (row + 1) * row_h
        draw_round_panel(canvas, x, y, col_w, row_h - 0.45 * cm, fill=PANEL, alpha=0.98)
        canvas.setFillColor(OLD_RED if idx in (0, 4, 7) else LINE)
        canvas.rect(x, y + 0.45 * cm, 0.16 * cm, row_h - 1.35 * cm, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.setFillColor(OLD_RED_SOFT)
        canvas.drawString(x + 0.55 * cm, y + row_h - 1.20 * cm, number)
        draw_lines(
            canvas,
            copy.splitlines(),
            x + 2.0 * cm,
            y + row_h - 1.16 * cm,
            size=15.5,
            leading=0.86 * cm,
            color=INK if number == "08" else PAPER,
        )

    # 03 Real game screens.
    screen_y = grid_top - 4 * row_h - 1.1 * cm
    draw_section_title(canvas, screen_y, "02", "实机 · 一口气跑完一生", "AI出生 / 自由走位 / 收灯终局")
    screen_top = screen_y - 1.2 * cm
    screen_h = 27.2 * cm
    screen_gap = 0.75 * cm
    screen_w = (CONTENT_W - 2 * screen_gap) / 3
    screen_assets = [
        (path("docs", "assets", "screenshot-origin.png"), "每局AI现写出生档案"),
        (path("docs", "assets", "screenshot-combat.png"), "自由走位 ·《一口气》自动索敌"),
        (path("docs", "assets", "ending-lampman.png"), "最后一盏灯 · 逐件归还这一身"),
    ]
    for idx, (asset, caption) in enumerate(screen_assets):
        x = SAFE_X + idx * (screen_w + screen_gap)
        y = screen_top - screen_h
        draw_round_panel(canvas, x, y, screen_w, screen_h, fill=DEEP)
        draw_image_cover(canvas, asset, x + 0.25 * cm, y + 2.4 * cm, screen_w - 0.5 * cm, screen_h - 2.7 * cm)
        canvas.setFont(FONT_SERIF, 16)
        canvas.setFillColor(PAPER)
        canvas.drawCentredString(x + screen_w / 2, y + 1.0 * cm, caption)

    # 04 Boss gallery.
    boss_y = screen_top - screen_h - 1.45 * cm
    draw_section_title(canvas, boss_y, "03", "十二位大小Boss", "六章 · 六小Boss · 六章节Boss · 41招")
    boss_top = boss_y - 1.25 * cm
    boss_gap = 0.45 * cm
    boss_w = (CONTENT_W - boss_gap * 5) / 6
    boss_h = 8.1 * cm
    for idx, (filename, name, stage) in enumerate(BOSSES):
        col = idx % 6
        row = idx // 6
        x = SAFE_X + col * (boss_w + boss_gap)
        y = boss_top - (row + 1) * boss_h
        draw_round_panel(canvas, x, y, boss_w, boss_h - 0.35 * cm, fill=PANEL)
        draw_image_contain(
            canvas,
            path("docs", "enemy-portraits-v1", filename),
            x + 0.25 * cm,
            y + 2.5 * cm,
            boss_w - 0.5 * cm,
            boss_h - 2.7 * cm,
            pad=0.15 * cm,
        )
        canvas.setFont(FONT_SERIF, 12.5)
        canvas.setFillColor(INK)
        canvas.drawCentredString(x + boss_w / 2, y + 1.45 * cm, name)
        canvas.setFont(FONT_SANS, 9.5)
        canvas.setFillColor(OLD_RED_SOFT if "章节" in stage else GOLD)
        canvas.drawCentredString(x + boss_w / 2, y + 0.62 * cm, stage)

    # 05 World and mechanics.
    world_y = boss_top - 2 * boss_h - 1.25 * cm
    draw_section_title(canvas, world_y, "04", "世界与核心机制", "六章场景 / 一口气 / 五毒 / 两扇门")
    world_top = world_y - 1.25 * cm
    world_h = 16.2 * cm
    left_w = 34 * cm
    middle_w = 18 * cm
    right_w = CONTENT_W - left_w - middle_w - 1.4 * cm
    x_left = SAFE_X
    x_mid = x_left + left_w + 0.7 * cm
    x_right = x_mid + middle_w + 0.7 * cm
    y_world = world_top - world_h

    draw_round_panel(canvas, x_left, y_world, left_w, world_h, fill=PANEL)
    canvas.setFont(FONT_SERIF, 14)
    canvas.setFillColor(INK)
    canvas.drawString(x_left + 0.55 * cm, y_world + world_h - 1.25 * cm, "六章光线与连续生活空间")
    draw_image_contain(
        canvas,
        path("docs", "assets", "wiki", "img", "lighting.png"),
        x_left + 0.45 * cm,
        y_world + 7.0 * cm,
        left_w - 0.9 * cm,
        world_h - 8.8 * cm,
    )
    props = [path("docs", "assets", "wiki", "img", f"prop-{stage}-{slot}.png") for stage in range(6) for slot in range(4)]
    prop_size = 1.25 * cm
    for idx, asset in enumerate(props):
        col = idx % 12
        row = idx // 12
        draw_image_contain(
            canvas,
            asset,
            x_left + 0.6 * cm + col * 2.65 * cm,
            y_world + 1.0 * cm + (1 - row) * 2.65 * cm,
            prop_size,
            prop_size,
        )

    draw_round_panel(canvas, x_mid, y_world, middle_w, world_h, fill=PANEL)
    canvas.setFont(FONT_SERIF, 14)
    canvas.setFillColor(INK)
    canvas.drawString(x_mid + 0.5 * cm, y_world + world_h - 1.25 * cm, "一口气 · 命运 · 五毒")
    draw_image_contain(canvas, path("docs", "assets", "projectiles.png"), x_mid + 0.5 * cm, y_world + 9.2 * cm, middle_w - 1.0 * cm, 4.6 * cm)
    canvas.setFont(FONT_SANS, 10.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(x_mid + 0.5 * cm, y_world + 8.7 * cm, "21种飞行形态 · 11种命中材质")
    draw_image_contain(canvas, path("docs", "assets", "fate-profiles.png"), x_mid + 0.65 * cm, y_world + 5.8 * cm, middle_w - 1.3 * cm, 2.1 * cm)
    canvas.setFont(FONT_SANS, 10.5)
    canvas.drawString(x_mid + 0.5 * cm, y_world + 5.25 * cm, "微光 · 交换 · 诱惑 · 反噬 · 荒诞 · 沉默")
    draw_image_contain(canvas, path("docs", "assets", "poison.png"), x_mid + 1.8 * cm, y_world + 1.7 * cm, middle_w - 3.6 * cm, 2.4 * cm)
    canvas.drawString(x_mid + 0.5 * cm, y_world + 1.05 * cm, "贪 · 嗔 · 痴 · 慢 · 疑")

    draw_round_panel(canvas, x_right, y_world, right_w, world_h, fill=PANEL)
    canvas.setFont(FONT_SERIF, 14)
    canvas.setFillColor(INK)
    canvas.drawString(x_right + 0.5 * cm, y_world + world_h - 1.25 * cm, "三间内景")
    room_assets = [
        (path("docs", "assets", "pawn.png"), "当铺"),
        (path("docs", "assets", "lamp.png"), "留灯间"),
        (path("docs", "assets", "inner.png"), "里屋"),
    ]
    room_gap = 0.35 * cm
    room_w = (right_w - 1.0 * cm - 2 * room_gap) / 3
    for idx, (asset, label) in enumerate(room_assets):
        rx = x_right + 0.5 * cm + idx * (room_w + room_gap)
        draw_image_cover(canvas, asset, rx, y_world + 2.0 * cm, room_w, world_h - 4.2 * cm)
        canvas.setFillColor(PAPER)
        canvas.setFont(FONT_SANS, 10)
        canvas.drawCentredString(rx + room_w / 2, y_world + 1.15 * cm, label)

    # 06 Items and combo art.
    item_y = y_world - 1.35 * cm
    draw_section_title(canvas, item_y, "05", "七十七件人生物证 · 十二组奥义", "得到的，穿在身上；失去的，也穿在身上")
    item_top = item_y - 1.25 * cm
    item_h = 19.0 * cm
    item_left_w = 26.5 * cm
    item_mid_w = 20.5 * cm
    item_right_w = CONTENT_W - item_left_w - item_mid_w - 1.4 * cm
    y_item = item_top - item_h
    xi = SAFE_X
    xc = xi + item_left_w + 0.7 * cm
    xe = xc + item_mid_w + 0.7 * cm

    draw_round_panel(canvas, xi, y_item, item_left_w, item_h, fill=PANEL)
    canvas.setFont(FONT_SERIF, 14)
    canvas.setFillColor(INK)
    canvas.drawString(xi + 0.55 * cm, y_item + item_h - 1.25 * cm, "77件道具图标 · 五层人生痕迹")
    draw_image_contain(canvas, path("src", "assets", "items", "icons.png"), xi + 0.8 * cm, y_item + 0.8 * cm, item_left_w - 1.6 * cm, item_h - 2.6 * cm)

    draw_round_panel(canvas, xc, y_item, item_mid_w, item_h, fill=PANEL)
    canvas.setFont(FONT_SERIF, 14)
    canvas.setFillColor(INK)
    canvas.drawString(xc + 0.55 * cm, y_item + item_h - 1.25 * cm, "12组命名组合 · 奥义插画")
    draw_image_contain(canvas, path("docs", "assets", "combo-art.png"), xc + 0.65 * cm, y_item + 0.8 * cm, item_mid_w - 1.3 * cm, item_h - 2.7 * cm)

    draw_round_panel(canvas, xe, y_item, item_right_w, item_h, fill=PANEL)
    canvas.setFont(FONT_SERIF, 14)
    canvas.setFillColor(INK)
    canvas.drawString(xe + 0.55 * cm, y_item + item_h - 1.25 * cm, "美术体量")
    metrics = [
        ("6", "段连续人生"),
        ("77", "件可穿戴道具"),
        ("12", "位大小Boss"),
        ("41", "招专属动作"),
        ("26", "种普通敌怪"),
        ("80+", "条剧情配音"),
    ]
    metric_gap = 0.35 * cm
    metric_h = (item_h - 3.1 * cm - metric_gap * 5) / 6
    for idx, (value, label) in enumerate(metrics):
        my = y_item + item_h - 2.25 * cm - (idx + 1) * metric_h - idx * metric_gap
        canvas.setFillColor(HexColor("#201F26"))
        canvas.roundRect(xe + 0.55 * cm, my, item_right_w - 1.1 * cm, metric_h, 0.18 * cm, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 22)
        canvas.setFillColor(GOLD)
        canvas.drawString(xe + 1.0 * cm, my + metric_h * 0.34, value)
        canvas.setFont(FONT_SANS, 11.5)
        canvas.setFillColor(PAPER)
        canvas.drawString(xe + 4.0 * cm, my + metric_h * 0.38, label)

    # 07 QR handoff.
    qr_y = y_item - 1.35 * cm
    draw_section_title(canvas, qr_y, "06", "试玩与完整百科", "游戏 / Boss志 / 敌怪志 / 道具志 / 语音馆 / 世界志 / 特效馆")
    qr_top = qr_y - 1.15 * cm
    qr_h = 12.2 * cm
    y_qr = qr_top - qr_h
    draw_round_panel(canvas, SAFE_X, y_qr, CONTENT_W, qr_h, fill=PANEL, stroke=OLD_RED)
    qr_size = 8.7 * cm
    qr_left_x = SAFE_X + 3.3 * cm
    qr_right_x = PAGE_W - SAFE_X - 3.3 * cm - qr_size
    draw_image_contain(canvas, path("docs", "promo", "exhibition-2026", "qr-game.png"), qr_left_x, y_qr + 1.7 * cm, qr_size, qr_size)
    draw_image_contain(canvas, path("docs", "promo", "exhibition-2026", "qr-wiki.png"), qr_right_x, y_qr + 1.7 * cm, qr_size, qr_size)
    canvas.setFont(FONT_SERIF, 18)
    canvas.setFillColor(INK)
    canvas.drawCentredString(qr_left_x + qr_size / 2, y_qr + 0.8 * cm, "扫码试玩 · 从第一口气开始")
    canvas.drawCentredString(qr_right_x + qr_size / 2, y_qr + 0.8 * cm, "打开百科 · 看见这一身的全部证据")

    center_x = PAGE_W / 2
    canvas.setFont(FONT_SERIF, 29)
    canvas.setFillColor(INK)
    canvas.drawCentredString(center_x, y_qr + 7.9 * cm, "现在，轮到你了。")
    canvas.setFont(FONT_SANS, 16)
    canvas.setFillColor(PAPER)
    canvas.drawCentredString(center_x, y_qr + 5.7 * cm, "自由走位 · 自动索敌 · AI命运 · 穿戴构筑")
    canvas.setFont(FONT_SANS, 13)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(center_x, y_qr + 3.7 * cm, "shen.kk666.best")

    # Official bottom safety band.
    canvas.saveState()
    canvas.setFillAlpha(0.18)
    canvas.setFillColor(DEEP)
    canvas.rect(0, 0, PAGE_W, CONTENT_BOTTOM, fill=1, stroke=0)
    canvas.restoreState()

    canvas.showPage()
    canvas.save()
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
