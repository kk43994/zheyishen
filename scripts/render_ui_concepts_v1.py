#!/usr/bin/env python3
"""Render six static UI direction concepts for 《这一身》.

These are approval images only. They intentionally do not touch the runtime.
Every screen is authored at the game's 360x640 logical resolution, uses flat
fills and integer coordinates, and is enlarged only with nearest-neighbour.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Callable, Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "ui-review-v1"
HERO_PATH = ROOT / "output" / "imagegen" / "zhe-yi-shen-hero-style-gate-v2" / "processed" / "style-1" / "front.png"
DOC_PATH = ROOT / "docs" / "这一身百科.html"

W, H = 360, 640
SCALE = 2

P = {
    "night": "#111116",
    "night2": "#1B1A20",
    "night3": "#242329",
    "ink": "#17151A",
    "ink2": "#3E3A3D",
    "paper": "#D8D0C1",
    "paper_light": "#E8E1D3",
    "paper_dim": "#AAA297",
    "paper_shadow": "#786F69",
    "old_red": "#9F3548",
    "old_red_dark": "#642231",
    "yellow": "#C6A44A",
    "yellow_dark": "#75622F",
    "blue": "#71818A",
    "blue_dark": "#38434A",
    "green": "#779887",
}

FONT_SANS = Path("/System/Library/Fonts/STHeiti Medium.ttc")
FONT_SERIF = Path("/System/Library/Fonts/Supplemental/Songti.ttc")


def font(size: int, serif: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_SERIF if serif else FONT_SANS), size=size)


F = {
    "tiny": font(8),
    "small": font(9),
    "body": font(11),
    "body_serif": font(12, True),
    "label": font(12),
    "subtitle": font(15, True),
    "title": font(38, True),
    "hero_title": font(48, True),
    "stamp": font(16, True),
    "poison": font(25, True),
}


class Audit:
    def __init__(self) -> None:
        self.text_boxes: list[tuple[str, tuple[int, int, int, int]]] = []

    def add(self, label: str, box: tuple[int, int, int, int]) -> None:
        self.text_boxes.append((label, box))

    def validate(self) -> list[str]:
        errors: list[str] = []
        for label, (x0, y0, x1, y1) in self.text_boxes:
            if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
                errors.append(f"text overflow: {label!r} -> {(x0, y0, x1, y1)}")
        return errors


def hard_text(
    im: Image.Image,
    audit: Audit,
    xy: tuple[int, int],
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: str,
    *,
    anchor: str = "la",
    max_width: int | None = None,
    label: str | None = None,
) -> tuple[int, int, int, int]:
    """Draw thresholded text so native-resolution glyphs contain no AA pixels."""
    probe = ImageDraw.Draw(im)
    box = probe.textbbox(xy, text, font=fnt, anchor=anchor, stroke_width=0)
    if max_width is not None and box[2] - box[0] > max_width:
        raise ValueError(f"text too wide: {text!r}, {box[2]-box[0]} > {max_width}")
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=fnt, fill=255, anchor=anchor)
    binary = mask.point(lambda p: 255 if p >= 120 else 0, mode="1")
    color = Image.new("RGB", im.size, fill)
    im.paste(color, (0, 0), binary)
    audit.add(label or text, box)
    return box


def wrap_text(text: str, fnt: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        current = ""
        for ch in paragraph:
            trial = current + ch
            if current and fnt.getlength(trial) > width:
                lines.append(current)
                current = ch
            else:
                current = trial
        lines.append(current)
    return lines


def hard_paragraph(
    im: Image.Image,
    audit: Audit,
    xy: tuple[int, int],
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: str,
    *,
    width: int,
    line_height: int,
    max_lines: int | None = None,
) -> int:
    lines = wrap_text(text, fnt, width)
    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
        if lines:
            lines[-1] = lines[-1][:-1] + "…"
    x, y = xy
    for idx, line in enumerate(lines):
        hard_text(im, audit, (x, y + idx * line_height), line, fnt, fill, max_width=width)
    return y + len(lines) * line_height


def line(draw: ImageDraw.ImageDraw, points: Sequence[tuple[int, int]], fill: str, width: int = 1) -> None:
    draw.line(points, fill=fill, width=width, joint="curve")


def ticked_rule(draw: ImageDraw.ImageDraw, y: int, x0: int = 16, x1: int = 344, fill: str = P["paper_shadow"]) -> None:
    draw.line((x0, y, x1, y), fill=fill, width=1)
    for x in range(x0, x1 + 1, 16):
        draw.line((x, y - 2, x, y + 2), fill=fill, width=1)


def jagged_sheet(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str, edge: str) -> None:
    x0, y0, x1, y1 = box
    pts = [
        (x0 + 3, y0), (x1 - 5, y0), (x1 - 5, y0 + 2), (x1, y0 + 2),
        (x1, y1 - 7), (x1 - 3, y1 - 7), (x1 - 3, y1 - 2), (x1 - 8, y1 - 2),
        (x1 - 8, y1), (x0 + 7, y1), (x0 + 7, y1 - 3), (x0, y1 - 3),
        (x0, y0 + 8), (x0 + 3, y0 + 8),
    ]
    draw.polygon(pts, fill=edge)
    inner = [(x + (2 if x < (x0 + x1) // 2 else -2), y + (2 if y < (y0 + y1) // 2 else -2)) for x, y in pts]
    draw.polygon(inner, fill=fill)


def stamp(im: Image.Image, audit: Audit, box: tuple[int, int, int, int], label: str, color: str = P["old_red"]) -> None:
    draw = ImageDraw.Draw(im)
    x0, y0, x1, y1 = box
    draw.rectangle((x0, y0, x1, y1), outline=color, width=2)
    draw.rectangle((x0 + 3, y0 + 3, x1 - 3, y1 - 3), outline=color, width=1)
    hard_text(im, audit, ((x0 + x1) // 2, (y0 + y1) // 2), label, F["stamp"], color, anchor="mm")
    # Missing ink makes the stamp feel physically printed rather than UI-perfect.
    for dx, dy, w in ((4, 5, 5), (17, 2, 3), (30, 12, 5), (8, 21, 4)):
        if x0 + dx + w < x1 and y0 + dy < y1:
            draw.rectangle((x0 + dx, y0 + dy, x0 + dx + w, y0 + dy + 1), fill=P["paper"])


def paste_sprite(im: Image.Image, sprite: Image.Image, xy: tuple[int, int], scale: int = 1, opacity: int = 255) -> None:
    src = sprite.resize((sprite.width * scale, sprite.height * scale), Image.Resampling.NEAREST)
    if opacity < 255:
        alpha = src.getchannel("A").point(lambda p: p * opacity // 255)
        src.putalpha(alpha)
    im.paste(src, xy, src)


def hero_with_raincoat(hero: Image.Image) -> Image.Image:
    out = hero.copy()
    d = ImageDraw.Draw(out)
    # Overlay uses the canonical 40x56 anchor space and leaves face/hair untouched.
    d.polygon([(13, 27), (16, 24), (24, 24), (27, 27), (27, 43), (24, 45), (16, 45), (13, 43)], fill=P["yellow_dark"])
    d.rectangle((15, 27, 25, 43), fill=P["yellow"])
    d.rectangle((13, 29, 15, 41), fill=P["yellow"])
    d.rectangle((25, 29, 27, 41), fill=P["yellow"])
    d.rectangle((19, 27, 20, 43), fill=P["yellow_dark"])
    d.rectangle((16, 24, 24, 26), fill=P["yellow"])
    d.rectangle((17, 25, 23, 26), fill=P["yellow_dark"])
    return out


def aged_hero(hero: Image.Image) -> Image.Image:
    out = Image.new("RGBA", hero.size, (0, 0, 0, 0))
    # Bend the upper body one logical pixel forward without resampling.
    top = hero.crop((0, 0, 40, 34))
    lower = hero.crop((0, 34, 40, 56))
    out.alpha_composite(top, (2, 1))
    out.alpha_composite(lower, (0, 34))
    d = ImageDraw.Draw(out)
    d.rectangle((14, 9, 16, 11), fill=P["paper_dim"])
    d.rectangle((20, 8, 23, 10), fill=P["paper_dim"])
    d.rectangle((25, 11, 27, 13), fill=P["paper_dim"])
    d.line((16, 30, 22, 34), fill=P["paper_shadow"], width=1)
    return out


def heart(draw: ImageDraw.ImageDraw, x: int, y: int, color: str) -> None:
    draw.rectangle((x + 2, y, x + 5, y + 2), fill=color)
    draw.rectangle((x + 8, y, x + 11, y + 2), fill=color)
    draw.rectangle((x, y + 2, x + 13, y + 6), fill=color)
    draw.rectangle((x + 2, y + 7, x + 11, y + 9), fill=color)
    draw.rectangle((x + 4, y + 10, x + 9, y + 11), fill=color)
    draw.rectangle((x + 6, y + 12, x + 7, y + 13), fill=color)


def shield(draw: ImageDraw.ImageDraw, x: int, y: int, color: str) -> None:
    draw.polygon([(x, y), (x + 13, y), (x + 12, y + 8), (x + 7, y + 14), (x + 1, y + 8)], fill=color)
    draw.polygon([(x + 3, y + 3), (x + 10, y + 3), (x + 9, y + 7), (x + 7, y + 10), (x + 4, y + 7)], fill=P["night"])


def coin(draw: ImageDraw.ImageDraw, x: int, y: int, color: str) -> None:
    draw.rectangle((x + 2, y, x + 9, y + 11), fill=color)
    draw.rectangle((x, y + 2, x + 11, y + 9), fill=color)
    draw.rectangle((x + 4, y + 3, x + 7, y + 8), fill=P["night"])


def pixel_arrow(draw: ImageDraw.ImageDraw, x: int, y: int, direction: str, color: str) -> None:
    if direction == "left":
        draw.rectangle((x + 4, y + 4, x + 16, y + 7), fill=color)
        draw.rectangle((x, y + 6, x + 7, y + 9), fill=color)
        draw.rectangle((x + 2, y + 2, x + 5, y + 11), fill=color)
    else:
        draw.rectangle((x, y + 4, x + 12, y + 7), fill=color)
        draw.rectangle((x + 9, y + 6, x + 16, y + 9), fill=color)
        draw.rectangle((x + 11, y + 2, x + 14, y + 11), fill=color)


def draw_title(hero: Image.Image) -> tuple[Image.Image, Audit]:
    im = Image.new("RGB", (W, H), P["night"])
    draw, audit = ImageDraw.Draw(im), Audit()
    # One continuous night containing hints of each life stage.
    draw.rectangle((0, 336, W, H), fill=P["night2"])
    for y in range(350, H, 24):
        draw.line((0, y, W, y), fill=P["night3"], width=1)
    for x in range(-40, W + 40, 40):
        draw.line((x, 336, x - 118, H), fill=P["night3"], width=1)
    # Bed, classroom, station, office and hospital silhouettes share one horizon.
    draw.rectangle((8, 314, 68, 334), fill=P["blue_dark"])
    draw.rectangle((12, 300, 55, 314), outline=P["blue"], width=2)
    draw.rectangle((65, 289, 68, 336), fill=P["blue"])
    for x in (94, 126):
        draw.rectangle((x, 300, x + 24, 304), fill=P["paper_shadow"])
        draw.rectangle((x + 3, 305, x + 5, 336), fill=P["ink2"])
        draw.rectangle((x + 20, 305, x + 22, 336), fill=P["ink2"])
    draw.rectangle((168, 315, 235, 318), fill=P["paper_shadow"])
    draw.rectangle((174, 319, 180, 336), fill=P["ink2"])
    draw.rectangle((224, 319, 230, 336), fill=P["ink2"])
    draw.rectangle((258, 293, 319, 297), fill=P["blue"])
    for x in (264, 284, 304):
        draw.rectangle((x, 298, x + 3, 336), fill=P["blue_dark"])
    draw.rectangle((329, 301, 351, 334), outline=P["paper_shadow"], width=2)
    draw.line((340, 304, 340, 331), fill=P["paper_shadow"], width=1)
    # Streetlamp is the only saturated focus.
    draw.rectangle((273, 184, 277, 436), fill=P["ink2"])
    draw.rectangle((265, 183, 285, 188), fill=P["yellow_dark"])
    draw.rectangle((268, 189, 282, 196), fill=P["yellow"])
    draw.polygon([(267, 197), (283, 197), (323, 454), (227, 454)], fill=P["yellow_dark"])
    draw.rectangle((0, 201, W, 202), fill=P["night3"])
    # Title: 身 stays solid, 生 appears like a one-pixel archival misprint.
    hard_text(im, audit, (180, 93), "这一身", F["hero_title"], P["paper_light"], anchor="mm")
    hard_text(im, audit, (253, 97), "生", F["hero_title"], P["blue_dark"], anchor="mm")
    hard_text(im, audit, (180, 136), "第 0001 号人生档案", F["small"], P["paper_shadow"], anchor="mm")
    paste_sprite(im, hero, (235, 367), 2)
    hard_text(im, audit, (180, 534), "开始这一身", F["subtitle"], P["paper_light"], anchor="mm")
    draw.line((112, 548, 248, 548), fill=P["yellow"], width=2)
    draw.rectangle((174, 562, 186, 564), fill=P["paper_shadow"])
    hard_text(im, audit, (180, 592), "按下名字", F["small"], P["paper_shadow"], anchor="mm")
    return im, audit


def draw_generation(hero: Image.Image) -> tuple[Image.Image, Audit]:
    im = Image.new("RGB", (W, H), P["night"])
    draw, audit = ImageDraw.Draw(im), Audit()
    hard_text(im, audit, (18, 25), "出生登记处", F["subtitle"], P["paper_light"])
    hard_text(im, audit, (342, 26), "档案 0317-B", F["small"], P["blue"], anchor="ra")
    ticked_rule(draw, 48, fill=P["blue_dark"])
    hard_text(im, audit, (18, 72), "有一段人生，正在被写下来。", F["body_serif"], P["paper_dim"])
    rows = [
        ("出生时刻", "03:17"),
        ("出生地点", "临江妇幼 · 七楼"),
        ("家庭", "做生意的父母，很少一起回家"),
        ("身体", "偏瘦 · 左眼散光"),
        ("最早记忆", "保温碗碰到电梯门的声音"),
    ]
    y = 111
    for idx, (key, value) in enumerate(rows):
        color = P["paper_light"] if idx < 4 else P["blue"]
        hard_text(im, audit, (18, y), key, F["small"], P["paper_shadow"])
        hard_text(im, audit, (82, y), value, F["body"], color, max_width=256)
        draw.line((18, y + 18, 342, y + 18), fill=P["night3"], width=1)
        y += 42
    hard_text(im, audit, (18, 329), "外号尚未写完", F["small"], P["paper_shadow"])
    hard_text(im, audit, (18, 350), "“货梯……”", F["subtitle"], P["paper_light"])
    draw.rectangle((99, 348, 101, 367), fill=P["blue"])
    # Person assembly: grid remains visible, filled pixels emerge directly from code.
    grid_x, grid_y, scale = 211, 309, 3
    rgba = hero.convert("RGBA")
    for py in range(hero.height):
        for px in range(hero.width):
            if px % 4 == 0 and py % 4 == 0:
                draw.point((grid_x + px * scale, grid_y + py * scale), fill=P["blue_dark"])
            r, g, b, a = rgba.getpixel((px, py))
            if a and (py < 36 or (px + py * 3) % 11 < 5):
                color = (r, g, b)
                draw.rectangle((grid_x + px * scale, grid_y + py * scale, grid_x + px * scale + 2, grid_y + py * scale + 2), fill=color)
    draw.line((grid_x - 6, grid_y + 49 * scale, grid_x + 126, grid_y + 49 * scale), fill=P["blue"], width=1)
    hard_text(im, audit, (18, 456), "身体参数", F["small"], P["paper_shadow"])
    for idx, (label, value) in enumerate((("高", "6/12"), ("瘦", "8/12"), ("姿", "3/12"), ("发", "09"))):
        x = 18 + idx * 45
        hard_text(im, audit, (x, 478), label, F["small"], P["blue"])
        hard_text(im, audit, (x + 14, 478), value, F["small"], P["paper_dim"])
    draw.rectangle((0, 525, W, H), fill=P["night2"])
    hard_text(im, audit, (18, 549), "这一行出现时，等待已经成为他的童年。", F["body_serif"], P["paper_dim"], max_width=324)
    hard_text(im, audit, (18, 584), "规则引擎已落数", F["small"], P["blue"])
    hard_text(im, audit, (342, 584), "故事仍在生长", F["small"], P["paper_shadow"], anchor="ra")
    draw.rectangle((18, 607, 21, 610), fill=P["blue"])
    draw.rectangle((27, 607, 30, 610), fill=P["blue_dark"])
    draw.rectangle((36, 607, 39, 610), fill=P["blue_dark"])
    return im, audit


def draw_origin(hero: Image.Image) -> tuple[Image.Image, Audit]:
    im = Image.new("RGB", (W, H), P["night"])
    draw, audit = ImageDraw.Draw(im), Audit()
    jagged_sheet(draw, (14, 18, 346, 612), P["paper"], P["ink"])
    hard_text(im, audit, (28, 41), "出生档案", F["subtitle"], P["ink"])
    hard_text(im, audit, (332, 41), "0317-B / 有得有失", F["tiny"], P["ink2"], anchor="ra")
    draw.line((28, 57, 332, 57), fill=P["ink2"], width=2)
    hard_text(im, audit, (28, 82), "外号", F["small"], P["ink2"])
    hard_text(im, audit, (28, 112), "货梯少爷", F["title"], P["ink"])
    stamp(im, audit, (278, 73, 329, 121), "梯")
    paste_sprite(im, hero, (213, 132), 3)
    draw.rectangle((204, 291, 328, 293), fill=P["paper_shadow"])
    hard_text(im, audit, (28, 151), "名字", F["tiny"], P["ink2"])
    hard_text(im, audit, (28, 170), "陆知行", F["label"], P["ink"])
    hard_text(im, audit, (28, 198), "出生", F["tiny"], P["ink2"])
    hard_paragraph(im, audit, (28, 217), "家住江景顶层，父母做跨境生意。家里从不缺东西，唯独总缺一起吃饭的人。", F["body"], P["ink"], width=165, line_height=17, max_lines=4)
    hard_text(im, audit, (28, 301), "外号的来处", F["small"], P["old_red"])
    hard_paragraph(im, audit, (28, 321), "六岁时只敢坐送货的旧电梯。保姆每天端着保温碗陪他下楼，同学便叫他“货梯少爷”。", F["body_serif"], P["ink"], width=300, line_height=19, max_lines=4)
    draw.line((28, 403, 332, 403), fill=P["ink2"], width=1)
    hard_text(im, audit, (28, 427), "特质从哪里来", F["small"], P["ink2"])
    traits = [
        ("生命 +5", "保温碗里总留着一口热汤"),
        ("移速 -4%", "听见普通电梯响就会停一下"),
        ("射程 +6%", "常隔着落地窗看很远的河"),
    ]
    y = 452
    for stat, cause in traits:
        hard_text(im, audit, (28, y), stat, F["label"], P["old_red"] if "+" in stat else P["ink"])
        hard_text(im, audit, (105, y), cause, F["small"], P["ink2"], max_width=222)
        draw.line((28, y + 17, 332, y + 17), fill=P["paper_shadow"], width=1)
        y += 36
    hard_text(im, audit, (180, 580), "按下他的名字，开始这一身", F["body_serif"], P["ink"], anchor="mm")
    draw.rectangle((142, 594, 218, 596), fill=P["old_red"])
    return im, audit


def draw_enemy(draw: ImageDraw.ImageDraw, x: int, y: int, kind: str) -> None:
    if kind == "gear":
        draw.rectangle((x + 6, y, x + 12, y + 18), fill=P["ink2"])
        draw.rectangle((x, y + 6, x + 18, y + 12), fill=P["ink2"])
        draw.rectangle((x + 3, y + 3, x + 15, y + 15), fill=P["paper_shadow"])
        draw.rectangle((x + 7, y + 7, x + 11, y + 11), fill=P["night"])
    else:
        draw.rectangle((x + 2, y + 5, x + 17, y + 18), fill=P["blue_dark"])
        draw.rectangle((x + 5, y, x + 14, y + 20), fill=P["blue_dark"])
        draw.rectangle((x + 6, y + 7, x + 8, y + 9), fill=P["paper_dim"])
        draw.rectangle((x + 12, y + 7, x + 14, y + 9), fill=P["paper_dim"])


def draw_combat(hero: Image.Image) -> tuple[Image.Image, Audit]:
    im = Image.new("RGB", (W, H), P["night2"])
    draw, audit = ImageDraw.Draw(im), Audit()
    # Station terrain, authored as hard 16px tiles.
    for y in range(0, 516, 16):
        for x in range(0, W, 16):
            c = P["night2"] if (x // 16 + y // 16) % 3 else P["night3"]
            draw.rectangle((x, y, x + 15, y + 15), fill=c)
    draw.line((0, 278, W, 278), fill=P["paper_shadow"], width=2)
    draw.line((0, 301, W, 301), fill=P["paper_shadow"], width=2)
    for x in range(-20, W + 20, 24):
        draw.rectangle((x, 278, x + 5, 301), fill=P["ink2"])
    # Life-stage track.
    draw.rectangle((0, 0, W, 50), fill=P["night"])
    hard_text(im, audit, (12, 13), "一关就是一生", F["tiny"], P["paper_shadow"])
    stage_names = "降童少青成中暮死"
    xs = [22 + i * 45 for i in range(8)]
    draw.line((xs[0], 34, xs[-1], 34), fill=P["ink2"], width=1)
    for i, (x, ch) in enumerate(zip(xs, stage_names)):
        color = P["yellow"] if i == 3 else P["paper_shadow"]
        size = 5 if i == 3 else 3
        draw.rectangle((x - size, 34 - size, x + size, 34 + size), fill=color)
        hard_text(im, audit, (x, 47), ch, F["tiny"], color, anchor="mm")
    hard_text(im, audit, (342, 13), "青年 · 齿轮车站", F["tiny"], P["yellow"], anchor="ra")
    # Vital stats are always legible, but not carded.
    heart(draw, 12, 63, P["paper_light"])
    hard_text(im, audit, (31, 63), "48/52", F["label"], P["paper_light"])
    shield(draw, 92, 62, P["blue"])
    hard_text(im, audit, (111, 63), "8", F["label"], P["paper_light"])
    coin(draw, 143, 63, P["yellow"])
    hard_text(im, audit, (161, 63), "13", F["label"], P["paper_light"])
    hard_text(im, audit, (342, 65), "02:47", F["body"], P["paper_dim"], anchor="ra")
    # World entities and current breath.
    draw_enemy(draw, 58, 178, "gear")
    draw_enemy(draw, 294, 207, "whisper")
    draw_enemy(draw, 50, 370, "whisper")
    draw.rectangle((214, 286, 226, 293), fill=P["paper_light"])
    draw.rectangle((222, 283, 231, 296), fill=P["paper_dim"])
    draw.rectangle((227, 286, 240, 293), fill=P["blue"])
    equipped = hero_with_raincoat(hero)
    paste_sprite(im, equipped, (140, 278), 2)
    # Glasses and backpack are readable on the same body rather than in slots.
    draw.rectangle((168, 308, 178, 310), outline=P["paper_dim"], width=1)
    draw.rectangle((181, 308, 191, 310), outline=P["paper_dim"], width=1)
    draw.line((178, 309, 181, 309), fill=P["paper_dim"], width=1)
    draw.rectangle((139, 339, 145, 370), fill=P["blue_dark"])
    # Origin stamp and worn-object index.
    draw.rectangle((10, 447, 52, 495), outline=P["blue"], width=2)
    hard_text(im, audit, (31, 469), "梯", F["poison"], P["paper_light"], anchor="mm")
    hard_text(im, audit, (31, 489), "↑2 ↓1", F["tiny"], P["blue"], anchor="mm")
    hard_text(im, audit, (350, 425), "穿在身上", F["tiny"], P["paper_shadow"], anchor="ra")
    worn = (("雨", P["yellow"]), ("包", P["blue"]), ("镜", P["paper_dim"]))
    for idx, (ch, color) in enumerate(worn):
        y = 445 + idx * 22
        draw.rectangle((322, y - 10, 342, y + 8), outline=P["ink2"], width=1)
        hard_text(im, audit, (332, y), ch, F["small"], color, anchor="mm")
    # Bottom ledger is a full-width band, not a floating card.
    draw.rectangle((0, 516, W, H), fill=P["paper"])
    draw.rectangle((0, 516, W, 520), fill=P["ink"])
    hard_text(im, audit, (14, 541), "《一口气》", F["subtitle"], P["ink"])
    hard_text(im, audit, (346, 541), "所有偏移都有来处", F["tiny"], P["ink2"], anchor="ra")
    stats = (("劲", "1.27", "石头书包 +0.18"), ("速", "0.91", "小号校服 +0.09"), ("程", "1.18", "落地窗 +0.06"))
    for idx, (name, value, cause) in enumerate(stats):
        x = 14 + idx * 116
        hard_text(im, audit, (x, 570), name, F["label"], P["ink2"])
        hard_text(im, audit, (x + 21, 570), value, F["subtitle"], P["ink"])
        hard_text(im, audit, (x, 594), cause, F["tiny"], P["ink2"], max_width=105)
    draw.line((14, 610, 346, 610), fill=P["paper_shadow"], width=1)
    hard_text(im, audit, (14, 625), "形：湿纸 · 重：2 · 回声：1", F["tiny"], P["ink2"])
    hard_text(im, audit, (346, 625), "下次吐息 0.6秒", F["tiny"], P["ink"], anchor="ra")
    return im, audit


def draw_fate(hero: Image.Image) -> tuple[Image.Image, Audit]:
    im = Image.new("RGB", (W, H), P["night"])
    draw, audit = ImageDraw.Draw(im), Audit()
    # Paused world remains barely present, confirming the fact occurs inside the run.
    draw.rectangle((0, 240, W, 242), fill=P["night3"])
    draw.rectangle((84, 207, 116, 211), fill=P["ink2"])
    draw.rectangle((246, 198, 282, 202), fill=P["ink2"])
    paste_sprite(im, hero, (160, 184), 1, opacity=90)
    hard_text(im, audit, (18, 26), "青年末 · 第 4 张事实", F["small"], P["paper_shadow"])
    hard_text(im, audit, (342, 26), "不可跳过", F["small"], P["old_red"], anchor="ra")
    jagged_sheet(draw, (20, 48, 340, 432), P["paper"], P["ink"])
    hard_text(im, audit, (36, 78), "名单上有你的名字", F["subtitle"], P["ink"])
    hard_text(im, audit, (36, 101), "事实 04 / 05", F["tiny"], P["ink2"])
    stamp(im, audit, (248, 67, 324, 108), "事实已盖章")
    hard_paragraph(im, audit, (36, 135), "下午四点，门禁灯忽然变成红色。主管把一张没有抬头的名单推到桌边，第一行是你的名字。", F["body_serif"], P["ink"], width=288, line_height=20, max_lines=4)
    draw.line((36, 225, 324, 225), fill=P["ink2"], width=1)
    hard_text(im, audit, (36, 249), "已经发生", F["small"], P["old_red"])
    hard_text(im, audit, (122, 249), "失去工作 · 工牌异变 · 最大生命 -2", F["body"], P["ink"], max_width=202)
    hard_paragraph(im, audit, (36, 287), "无论怎样回应，这一行都不会被擦掉。", F["body_serif"], P["ink2"], width=288, line_height=18, max_lines=2)
    # Choice directions sit outside the fact sheet; neither pretends to undo it.
    draw.line((180, 457, 180, 595), fill=P["ink2"], width=1)
    pixel_arrow(draw, 18, 473, "left", P["paper_dim"])
    hard_text(im, audit, (43, 470), "咽下", F["subtitle"], P["paper_light"])
    hard_text(im, audit, (18, 505), "先别告诉家里", F["label"], P["paper_light"])
    hard_text(im, audit, (18, 529), "伤害 +6%", F["small"], P["paper_dim"])
    hard_text(im, audit, (18, 547), "8秒后失去4生命", F["small"], P["paper_dim"])
    hard_paragraph(im, audit, (18, 570), "让疼痛晚一点到账。", F["body_serif"], P["paper_shadow"], width=145, line_height=18, max_lines=2)
    pixel_arrow(draw, 324, 473, "right", P["old_red"])
    hard_text(im, audit, (198, 470), "吐出", F["subtitle"], P["old_red"])
    hard_text(im, audit, (198, 505), "问清楚补偿", F["label"], P["paper_light"])
    hard_text(im, audit, (198, 529), "零钱 +6", F["small"], P["paper_dim"])
    hard_text(im, audit, (198, 547), "移速 -4%", F["small"], P["paper_dim"])
    hard_paragraph(im, audit, (198, 570), "把体面换成一张欠条。", F["body_serif"], P["paper_shadow"], width=145, line_height=18, max_lines=2)
    draw.rectangle((18, 615, 342, 617), fill=P["ink2"])
    hard_text(im, audit, (180, 629), "← 咽下        事实不变        吐出 →", F["tiny"], P["paper_shadow"], anchor="mm")
    return im, audit


def draw_result(hero: Image.Image) -> tuple[Image.Image, Audit]:
    im = Image.new("RGB", (W, H), P["night"])
    draw, audit = ImageDraw.Draw(im), Audit()
    hard_text(im, audit, (180, 30), "第 0001 号人生档案 · 已封存", F["tiny"], P["paper_shadow"], anchor="mm")
    hard_text(im, audit, (95, 69), "这一身", F["title"], P["paper_shadow"], anchor="mm")
    pixel_arrow(draw, 165, 60, "right", P["old_red"])
    hard_text(im, audit, (264, 69), "这一生", F["title"], P["paper_light"], anchor="mm")
    draw.rectangle((18, 94, 342, 96), fill=P["old_red_dark"])
    # Timeline is the spine of the result, not a grid of stat cards.
    draw.line((43, 125, 43, 455), fill=P["paper_shadow"], width=2)
    events = [
        (125, "0岁", "被叫作货梯少爷"),
        (176, "7岁", "穿上小号校服"),
        (227, "16岁", "没有寄出的信"),
        (278, "28岁", "第一份工资"),
        (329, "41岁", "父亲留下雨衣"),
        (380, "57岁", "名字还在表格里"),
        (431, "73岁", "交出最后一口气"),
    ]
    for idx, (y, age, event) in enumerate(events):
        c = P["old_red"] if idx == len(events) - 1 else P["paper_dim"]
        draw.rectangle((39, y - 4, 47, y + 4), fill=c)
        hard_text(im, audit, (59, y - 5), age, F["small"], c)
        hard_text(im, audit, (94, y - 5), event, F["body"], P["paper_light"], max_width=152)
    final_hero = aged_hero(hero_with_raincoat(hero))
    pixels = final_hero.load()
    for py in range(final_hero.height):
        for px in range(final_hero.width):
            rgba = pixels[px, py]
            if rgba[:3] == (198, 164, 74):
                pixels[px, py] = (120, 111, 105, rgba[3])
            elif rgba[:3] == (117, 98, 47):
                pixels[px, py] = (62, 58, 61, rgba[3])
    paste_sprite(im, final_hero, (222, 150), 3)
    draw.rectangle((215, 315, 342, 318), fill=P["ink2"])
    hard_text(im, audit, (278, 344), "陆知行 · 73岁", F["label"], P["paper_light"], anchor="mm")
    hard_text(im, audit, (278, 365), "穿戴 9件", F["small"], P["paper_dim"], anchor="mm")
    hard_text(im, audit, (278, 384), "咽下 3 · 吐出 2", F["small"], P["paper_dim"], anchor="mm")
    hard_text(im, audit, (278, 403), "活过 08:12", F["small"], P["paper_dim"], anchor="mm")
    # Delayed poison reveal only appears after the life line ends.
    draw.rectangle((0, 475, W, H), fill=P["paper"])
    draw.rectangle((0, 475, W, 479), fill=P["ink"])
    hard_text(im, audit, (18, 500), "这一身最深的毒", F["small"], P["ink2"])
    hard_text(im, audit, (18, 526), "最后一口气之后", F["tiny"], P["paper_shadow"])
    stamp(im, audit, (190, 493, 250, 553), "疑")
    stamp(im, audit, (268, 493, 328, 553), "痴")
    hard_text(im, audit, (220, 568), "答案总不够确定", F["tiny"], P["ink2"], anchor="mm")
    hard_text(im, audit, (298, 582), "把回音当成未完", F["tiny"], P["ink2"], anchor="mm")
    hard_text(im, audit, (180, 609), "他没有赢，只是终于松了这一口气。", F["body_serif"], P["ink"], anchor="mm")
    hard_text(im, audit, (180, 630), "再活一次", F["small"], P["old_red"], anchor="mm")
    return im, audit


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def pixel_edge_colors(im: Image.Image) -> int:
    return len(set(im.convert("RGB").getdata()))


def main() -> None:
    if not HERO_PATH.exists():
        raise FileNotFoundError(HERO_PATH)
    if not DOC_PATH.exists():
        raise FileNotFoundError(DOC_PATH)
    OUT.mkdir(parents=True, exist_ok=True)
    hero = Image.open(HERO_PATH).convert("RGBA")
    screens: list[tuple[str, str, str, Callable[[Image.Image], tuple[Image.Image, Audit]]]] = [
        ("01-title", "标题", "雨衣黄", draw_title),
        ("02-origin-generation", "AI无感出生生成", "病房蓝灰", draw_generation),
        ("03-origin-dossier", "出生档案", "旧红", draw_origin),
        ("04-combat-hud", "战斗HUD", "雨衣黄", draw_combat),
        ("05-fate", "命运牌", "旧红", draw_fate),
        ("06-result", "结算", "旧红", draw_result),
    ]
    manifest_screens = []
    native_images: list[Image.Image] = []
    all_errors: list[str] = []
    for stem, title, accent, renderer in screens:
        im, audit = renderer(hero)
        if im.size != (W, H):
            all_errors.append(f"{stem}: wrong native size {im.size}")
        errors = audit.validate()
        all_errors.extend(f"{stem}: {error}" for error in errors)
        native = OUT / f"{stem}.png"
        review = OUT / f"{stem}-review-2x.png"
        im.save(native, optimize=True)
        im.resize((W * SCALE, H * SCALE), Image.Resampling.NEAREST).save(review, optimize=True)
        native_images.append(im)
        manifest_screens.append({
            "id": stem,
            "title": title,
            "accent": accent,
            "native": native.name,
            "review2x": review.name,
            "nativeSize": [W, H],
            "reviewSize": [W * SCALE, H * SCALE],
            "uniqueRgbColors": pixel_edge_colors(im),
            "textBoundsChecked": not errors,
            "sha256": sha256(native),
        })

    gutter = 12
    label_h = 24
    overview = Image.new("RGB", (W * 3 + gutter * 4, (H + label_h) * 2 + gutter * 3), P["night"])
    overview_audit = Audit()
    for idx, ((_, title, _, _), screen) in enumerate(zip(screens, native_images)):
        col, row = idx % 3, idx // 3
        x = gutter + col * (W + gutter)
        y = gutter + row * (H + label_h + gutter)
        hard_text(overview, overview_audit, (x, y + 1), f"{idx+1:02d}  {title}", F["small"], P["paper_dim"])
        overview.paste(screen, (x, y + label_h))
    overview_path = OUT / "ui-overview.png"
    overview.save(overview_path, optimize=True)

    manifest = {
        "name": "《这一身》UI静态概念审批 V1",
        "status": "design-review-only",
        "runtimeModified": False,
        "source": str(DOC_PATH.relative_to(ROOT)),
        "heroSource": str(HERO_PATH.relative_to(ROOT)),
        "logicalCanvas": [W, H],
        "pixelRules": [
            "flat fills only",
            "integer coordinates",
            "thresholded binary text masks",
            "nearest-neighbour 2x reviews",
            "no gradients",
            "no rounded cards",
            "one saturated accent per screen",
            "five-poison values hidden until result",
        ],
        "screens": manifest_screens,
        "overview": overview_path.name,
        "validation": {
            "passed": not all_errors,
            "errors": all_errors,
            "screenCount": len(manifest_screens),
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if all_errors:
        raise SystemExit("\n".join(all_errors))
    print(f"Rendered {len(screens)} UI concepts to {OUT}")
    print(f"Overview: {overview_path}")


if __name__ == "__main__":
    main()
