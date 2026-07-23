#!/usr/bin/env python3
"""Build review boards for the brighter life-stage lighting and transitions."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/art-lighting-review-v1"
W, H = 360, 640

STAGES = (
    ("童年 · 清晨暖光", "#695D6F", "#403A48", "ground-0.png"),
    ("少年 · 教室白昼", "#71818A", "#46545D", "ground-1.png"),
    ("青年 · 傍晚站台", "#8A7658", "#574936", "ground-2.png"),
    ("成年 · 饭桌灯光", "#718475", "#46594B", "ground-3.png"),
    ("中年 · 过亮日光灯", "#7C8993", "#4D5962", "ground-4.png"),
    ("暮年 · 苍白午后", "#85888B", "#555B61", "ground-5.png"),
)

BRIDGES = (
    "床边灯 → 教室日光灯",
    "红叉纸 → 末班车票",
    "车票 → 家门钥匙",
    "饭桌账单 → 工位表格",
    "日光灯 → 终点路灯",
)


def font(size: int, *, serif: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Songti.ttc") if serif else Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def mix(first: str, second: str, ratio: float) -> tuple[int, int, int]:
    a = tuple(int(first[index:index + 2], 16) for index in (1, 3, 5))
    b = tuple(int(second[index:index + 2], 16) for index in (1, 3, 5))
    return tuple(round(a[channel] + (b[channel] - a[channel]) * ratio) for channel in range(3))


def stage_image(index: int) -> Image.Image:
    _, top, bottom, filename = STAGES[index]
    logical = Image.new("RGB", (180, 320))
    draw = ImageDraw.Draw(logical)
    for row in range(12):
        y0 = 320 * row // 12
        y1 = 320 * (row + 1) // 12
        draw.rectangle((0, y0, 180, y1), fill=mix(top, bottom, row / 11))

    tile = Image.open(ROOT / "src/assets/world" / filename).convert("RGBA")
    texture = Image.new("RGBA", logical.size)
    for y in range(-64, 320, 128):
        for x in range(-64, 180, 128):
            texture.alpha_composite(tile, (x, y))
    texture.putalpha(71)  # Runtime ground layer alpha is 0.28.
    logical = Image.alpha_composite(logical.convert("RGBA"), texture).convert("RGB")

    # Edge falloff is restrained; the playfield remains a readable midtone.
    shade = Image.new("RGBA", logical.size, (0, 0, 0, 0))
    shade_draw = ImageDraw.Draw(shade)
    for band in range(4):
        inset = band * 4
        alpha = 12 + band * 8
        shade_draw.rectangle((inset, inset, 179 - inset, 319 - inset), outline=(8, 8, 12, alpha), width=1)
    logical = Image.alpha_composite(logical.convert("RGBA"), shade)
    return logical.resize((W, H), Image.Resampling.NEAREST).convert("RGB")


def centered(draw: ImageDraw.ImageDraw, text: str, y: int, width: int, fill: str, face: ImageFont.ImageFont) -> None:
    box = draw.textbbox((0, 0), text, font=face)
    draw.text(((width - (box[2] - box[0])) // 2, y), text, fill=fill, font=face)


def lighting_board(images: list[Image.Image]) -> None:
    thumb_w, thumb_h = 240, 427
    label_h = 48
    canvas = Image.new("RGB", (thumb_w * len(images), thumb_h + label_h), "#111116")
    draw = ImageDraw.Draw(canvas)
    for index, image in enumerate(images):
        x = index * thumb_w
        canvas.paste(image.resize((thumb_w, thumb_h), Image.Resampling.NEAREST), (x, 0))
        label = STAGES[index][0]
        box = draw.textbbox((0, 0), label, font=font(13, serif=True))
        draw.text((x + (thumb_w - (box[2] - box[0])) // 2, thumb_h + 14), label, fill="#E8E1D3", font=font(13, serif=True))
        if index:
            draw.line((x, 0, x, canvas.height), fill="#3E3A3D")
    canvas.save(OUT / "stage-lighting-runtime-composite.png", optimize=True)


def transition_preview(old: Image.Image, new: Image.Image, index: int) -> Image.Image:
    image = Image.blend(old, new, 0.56).convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((0, 238, W, 392), fill=(17, 17, 22, 158))
    draw.rectangle((0, 238, 238, 392), fill=(216, 208, 193, 20))
    draw.rectangle((0, 237, 238, 238), fill="#9F3548")
    draw.rectangle((122, 392, W, 393), fill="#AAA297")
    image = Image.alpha_composite(image, overlay)
    draw = ImageDraw.Draw(image)
    centered(draw, f"第 {index + 2} 章 · 人生档案继续", 258, W, "#AAA297", font(8))
    centered(draw, STAGES[index + 1][0].split(" · ")[0] + " · " + ("千眼教室", "齿轮车站", "屋檐下的家", "没有关灯的办公室", "白发荒原")[index], 294, W, "#E8E1D3", font(18, serif=True))
    draw.rectangle((118, 321, 242, 323), fill="#9F3548")
    centered(draw, BRIDGES[index], 365, W, "#C9B77C", font(9))
    return image.convert("RGB")


def transition_board(images: list[Image.Image]) -> None:
    previews = [transition_preview(images[index], images[index + 1], index) for index in range(5)]
    thumb_w, thumb_h = 288, 512
    canvas = Image.new("RGB", (thumb_w * len(previews), thumb_h), "#111116")
    for index, preview in enumerate(previews):
        canvas.paste(preview.resize((thumb_w, thumb_h), Image.Resampling.NEAREST), (index * thumb_w, 0))
    canvas.save(OUT / "natural-chapter-transition-storyboard.png", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    images = [stage_image(index) for index in range(len(STAGES))]
    lighting_board(images)
    transition_board(images)
    print(f"built stage lighting review -> {OUT}")


if __name__ == "__main__":
    main()
