#!/usr/bin/env python3
"""Build review atlases from the selected Image2 enemy sheets.

This script writes only under output/. Formal promotion is a separate audited
step, so rebuilding the review bundle never overwrites runtime assets.
"""

from __future__ import annotations

import hashlib
import html
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
TASK_DIR = ROOT / "scripts/image2/enemy-roster-v1"
ROSTER_PATH = TASK_DIR / "roster.json"
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-enemy-roster-v1"
RAW_DIR = OUT_DIR / "raw"
CANDIDATE_DIR = OUT_DIR / "candidate-atlases"
PREVIEW_DIR = OUT_DIR / "previews"
REVIEW_DIR = ROOT / "output/art-audit-loop/new-enemy-roster-v1"

MOTIONS = ("idle", "move", "attack", "hurt", "death")
MOTION_COUNTS = {"idle": 2, "move": 4, "attack": 2, "hurt": 2, "death": 4}
CLEAR = (0, 0, 0, 0)
HURT_DARK = (100, 34, 49)
HURT = (176, 47, 67)


@dataclass(frozen=True)
class Spec:
    asset: str
    name: str
    stage: str
    kind: str
    frame: int
    batch: str


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_specs() -> list[Spec]:
    payload = json.loads(ROSTER_PATH.read_text(encoding="utf-8"))
    if payload.get("status") != "approved-and-promoted" or payload.get("promotionAllowed") is not True:
        raise AssertionError("enemy roster approval record is missing")
    return [
        Spec(
            asset=entry["id"],
            name=entry["name"],
            stage=entry["stage"],
            kind=entry["kind"],
            frame=int(entry["frame"]),
            batch=entry["batch"],
        )
        for entry in payload["assets"]
    ]


def selected_source(spec: Spec) -> Path:
    exact = RAW_DIR / f"batch-{spec.batch}" / f"{spec.asset}-selected.png"
    if exact.is_file():
        return exact
    matches = sorted((RAW_DIR / f"batch-{spec.batch}").glob(f"**/{spec.asset}-selected.png"))
    if len(matches) != 1:
        raise FileNotFoundError(f"expected one selected source for {spec.asset}, found {len(matches)}")
    return matches[0]


def is_magenta_key(image: Image.Image) -> bool:
    result = image.convert("RGBA")
    corners = (
        result.getpixel((0, 0)),
        result.getpixel((result.width - 1, 0)),
        result.getpixel((0, result.height - 1)),
        result.getpixel((result.width - 1, result.height - 1)),
    )
    average = tuple(sum(pixel[channel] for pixel in corners) / len(corners) for channel in range(3))
    return average[0] > 180 and average[2] > 180 and average[1] < 100


def strip_chroma(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    magenta_key = is_magenta_key(result)
    cleaned = []
    for red, green, blue, alpha in result.getdata():
        if magenta_key:
            exact_key = red >= 220 and blue >= 220 and green <= 70
            spill = red > 110 and blue > 110 and min(red, blue) > green * 1.45
        else:
            exact_key = green >= 230 and red <= 45 and blue <= 45
            spill = green > 80 and green > red * 1.28 and green > blue * 1.28 and max(red, blue) < 150
        cleaned.append(CLEAR if exact_key or spill or alpha <= 16 else (red, green, blue, alpha))
    result.putdata(cleaned)
    return result


def remove_logical_specks(sprite: Image.Image) -> Image.Image:
    """Remove isolated one-pixel debris after reduction, preserving real groups."""
    result = sprite.copy()
    pixels = result.load()
    width, height = result.size
    remove: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] == 0:
                continue
            neighbors = 0
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    if (nx != x or ny != y) and pixels[nx, ny][3] > 0:
                        neighbors += 1
            if neighbors == 0:
                remove.append((x, y))
    for x, y in remove:
        pixels[x, y] = CLEAR
    return result


def remove_logical_chroma(sprite: Image.Image, magenta_key: bool) -> Image.Image:
    result = sprite.copy()
    cleaned = []
    for red, green, blue, alpha in result.getdata():
        if not alpha:
            cleaned.append(CLEAR)
            continue
        if magenta_key:
            residue = red > 140 and blue > 140 and min(red, blue) > green * 1.35
        else:
            residue = green > 110 and green > red * 1.25 and green > blue * 1.25
        cleaned.append(CLEAR if residue else (red, green, blue, 255))
    result.putdata(cleaned)
    return result


def quantize(sprite: Image.Image, colors: int) -> Image.Image:
    quantized = sprite.quantize(
        colors=colors,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    ).convert("RGBA")
    pixels = []
    for red, green, blue, alpha in quantized.getdata():
        pixels.append((red, green, blue, 255) if alpha > 120 else CLEAR)
    quantized.putdata(pixels)
    return quantized


def extract_quadrants(source: Path, spec: Spec) -> list[Image.Image]:
    source_image = Image.open(source)
    magenta_key = is_magenta_key(source_image)
    sheet = strip_chroma(source_image)
    half_w, half_h = sheet.width // 2, sheet.height // 2
    quadrants: list[Image.Image] = []
    for index in range(4):
        column, row = index % 2, index // 2
        cell = sheet.crop((column * half_w, row * half_h, (column + 1) * half_w, (row + 1) * half_h))
        bbox = cell.getchannel("A").point(lambda value: 255 if value > 120 else 0).getbbox()
        if bbox is None:
            raise ValueError(f"empty source quadrant: {spec.asset}/{index}")
        sprite = cell.crop(bbox)
        max_size = spec.frame - 4
        ratio = min(max_size / sprite.width, max_size / sprite.height)
        size = (max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio)))
        colors = 24 if spec.frame >= 64 else 18 if spec.frame == 48 else 14
        logical = quantize(sprite.resize(size, Image.Resampling.NEAREST), colors)
        logical = remove_logical_chroma(logical, magenta_key)
        quadrants.append(remove_logical_specks(logical))
    return quadrants


def place(sprite: Image.Image, frame: int, dx: int = 0, dy: int = 0) -> Image.Image:
    result = Image.new("RGBA", (frame, frame), CLEAR)
    x = max(1, min(frame - sprite.width - 1, frame // 2 - sprite.width // 2 + dx))
    y = max(1, min(frame - sprite.height - 1, frame - sprite.height - 2 + dy))
    result.alpha_composite(sprite, (x, y))
    return result


def shift(source: Image.Image, dx: int, dy: int) -> Image.Image:
    result = Image.new("RGBA", source.size, CLEAR)
    result.alpha_composite(source, (dx, dy))
    return result


def red_flash(source: Image.Image, strength: float) -> Image.Image:
    result = source.copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if not alpha:
                continue
            target = HURT if (x + y) % 3 else HURT_DARK
            pixels[x, y] = (
                round(red + (target[0] - red) * strength),
                round(green + (target[1] - green) * strength),
                round(blue + (target[2] - blue) * strength),
                255,
            )
    return result


def dissolve(source: Image.Image, threshold: int, drop: int) -> Image.Image:
    result = Image.new("RGBA", source.size, CLEAR)
    src = source.load()
    dst = result.load()
    for y in range(source.height):
        for x in range(source.width):
            pixel = src[x, y]
            if not pixel[3]:
                continue
            residue = (x * 17 + y * 31 + x * y * 7 + x * x * 3 + y * y * 5) % 23
            if residue < threshold:
                continue
            target_y = y + drop + ((x // 5) % 2)
            if target_y < source.height - 1:
                dst[x, target_y] = pixel
    return result


def build_frames(source: Path, spec: Spec) -> dict[str, list[Image.Image]]:
    idle_sprite, move_sprite, attack_sprite, hurt_sprite = extract_quadrants(source, spec)
    idle = place(idle_sprite, spec.frame)
    move = place(move_sprite, spec.frame)
    attack = place(attack_sprite, spec.frame)
    hurt = place(hurt_sprite, spec.frame)
    return {
        "idle": [idle, shift(idle, 0, -1)],
        "move": [shift(move, -1, 0), shift(idle, 0, -1), shift(move, 1, 0), idle],
        "attack": [idle, attack],
        "hurt": [red_flash(hurt, 0.38), shift(red_flash(hurt, 0.52), 1, 0)],
        "death": [dissolve(hurt, threshold, index) for index, threshold in enumerate((0, 6, 13, 20))],
    }


def validate_frame(frame: Image.Image, label: str, magenta_key: bool) -> dict[str, object]:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty candidate frame: {label}")
    if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= frame.width or bbox[3] >= frame.height:
        raise AssertionError(f"candidate frame touches edge: {label}: {bbox}")
    alpha = set(frame.getchannel("A").getdata())
    if alpha - {0, 255}:
        raise AssertionError(f"partial alpha: {label}")
    if any(pixel != CLEAR for pixel in frame.getdata() if pixel[3] == 0):
        raise AssertionError(f"dirty transparent RGB: {label}")
    visible = [pixel for pixel in frame.getdata() if pixel[3]]
    if magenta_key:
        residue = sum(1 for red, green, blue, _ in visible if red > 140 and blue > 140 and min(red, blue) > green * 1.35)
        residue_label = "magenta"
    else:
        residue = sum(1 for red, green, blue, _ in visible if green > 110 and green > red * 1.25 and green > blue * 1.25)
        residue_label = "green"
    if residue:
        raise AssertionError(f"{residue_label} residue: {label}: {residue}")
    return {"bbox": list(bbox), "opaquePixels": len(visible), "colors": len(set(visible))}


def build_atlas(source: Path, spec: Spec) -> tuple[Path, dict[str, object]]:
    frames = build_frames(source, spec)
    magenta_key = is_magenta_key(Image.open(source))
    atlas = Image.new("RGBA", (spec.frame * 4, spec.frame * len(MOTIONS)), CLEAR)
    validation: dict[str, object] = {}
    for row, motion in enumerate(MOTIONS):
        motion_frames = frames[motion]
        if len(motion_frames) != MOTION_COUNTS[motion]:
            raise AssertionError(f"wrong frame count: {spec.asset}/{motion}")
        validation[motion] = []
        for column, frame in enumerate(motion_frames):
            validation[motion].append(validate_frame(frame, f"{spec.asset}/{motion}/{column}", magenta_key))
            atlas.alpha_composite(frame, (column * spec.frame, row * spec.frame))
    path = CANDIDATE_DIR / f"{spec.asset}.png"
    atlas.save(path, optimize=True)
    preview = Image.new("RGBA", (spec.frame * 5, spec.frame), CLEAR)
    representatives = [frames[motion][-1 if motion in ("attack", "hurt", "death") else 0] for motion in MOTIONS]
    for index, frame in enumerate(representatives):
        preview.alpha_composite(frame, (index * spec.frame, 0))
    preview.save(PREVIEW_DIR / f"{spec.asset}.png", optimize=True)
    return path, validation


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    )
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size, index=2 if bold and path.name == "PingFang.ttc" else 0)
    return ImageFont.load_default()


def fit(source: Image.Image, size: tuple[int, int], nearest: bool = False) -> Image.Image:
    canvas = Image.new("RGBA", size, CLEAR)
    ratio = min(size[0] / source.width, size[1] / source.height)
    scaled = source.resize(
        (max(1, round(source.width * ratio)), max(1, round(source.height * ratio))),
        Image.Resampling.NEAREST if nearest else Image.Resampling.LANCZOS,
    )
    canvas.alpha_composite(scaled, ((size[0] - scaled.width) // 2, (size[1] - scaled.height) // 2))
    return canvas


def make_review_pages(entries: list[dict[str, object]], specs: list[Spec]) -> list[str]:
    spec_by_id = {spec.asset: spec for spec in specs}
    pages: list[str] = []
    for page_index in range(2):
        page_entries = entries[page_index * 10 : (page_index + 1) * 10]
        card_w, card_h = 700, 228
        canvas = Image.new("RGB", (card_w * 2 + 36, card_h * 5 + 62), "#111116")
        draw = ImageDraw.Draw(canvas)
        draw.text((18, 14), f"《这一身》新增敌人 Image2 候选审核 · {page_index + 1}/2", fill="#e8e1d3", font=font(24, True))
        for index, entry in enumerate(page_entries):
            row, column = divmod(index, 2)
            x, y = 14 + column * card_w, 54 + row * card_h
            spec = spec_by_id[str(entry["id"])]
            draw.rounded_rectangle((x, y, x + card_w - 10, y + card_h - 8), radius=5, fill="#1b1a20", outline="#4a454b")
            draw.text((x + 12, y + 9), f"{spec.stage} · {spec.name}", fill="#e8e1d3", font=font(18, True))
            draw.text((x + 12, y + 34), f"{spec.asset} · {spec.kind} · {spec.frame}px", fill="#aaa297", font=font(12))
            source = Image.open(str(entry["source"])).convert("RGBA")
            source_thumb = fit(source, (170, 160))
            canvas.paste(source_thumb.convert("RGB"), (x + 12, y + 58), source_thumb.getchannel("A"))
            preview = Image.open(str(entry["preview"])).convert("RGBA")
            target_frame = 82
            preview_strip = Image.new("RGBA", (target_frame * 5, target_frame), CLEAR)
            for motion_index in range(5):
                cell = preview.crop((motion_index * spec.frame, 0, (motion_index + 1) * spec.frame, spec.frame))
                preview_strip.alpha_composite(fit(cell, (target_frame, target_frame), nearest=True), (motion_index * target_frame, 0))
            panel = Image.new("RGBA", preview_strip.size, (11, 11, 15, 255))
            panel.alpha_composite(preview_strip)
            canvas.paste(panel.convert("RGB"), (x + 205, y + 80))
            for motion_index, label in enumerate(("待机", "移动", "攻击", "受击", "死亡")):
                draw.text((x + 205 + motion_index * target_frame + 20, y + 174), label, fill="#aaa297", font=font(11))
        filename = f"new-enemy-review-{page_index + 1}.png"
        canvas.save(REVIEW_DIR / filename, optimize=True)
        pages.append(filename)
    return pages


def make_html(entries: list[dict[str, object]], specs: list[Spec]) -> None:
    cards = []
    entry_by_id = {str(entry["id"]): entry for entry in entries}
    for spec in specs:
        entry = entry_by_id[spec.asset]
        source_rel = Path(str(entry["source"])).relative_to(REVIEW_DIR.parent.parent.parent)
        preview_rel = Path(str(entry["preview"])).relative_to(REVIEW_DIR.parent.parent.parent)
        cards.append(
            f'<article><h2>{html.escape(spec.stage)} · {html.escape(spec.name)}</h2>'
            f'<p><code>{html.escape(spec.asset)}</code> · {html.escape(spec.kind)} · {spec.frame}px</p>'
            f'<div><figure><img src="../../../{source_rel.as_posix()}" alt="{html.escape(spec.name)} Image2 source"><figcaption>Image2 2x2 source</figcaption></figure>'
            f'<figure><img class="pixel" src="../../../{preview_rel.as_posix()}" alt="{html.escape(spec.name)} processed states"><figcaption>待机 / 移动 / 攻击 / 受击 / 死亡</figcaption></figure></div></article>'
        )
    document = """<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>新增敌人美术确认</title>
<style>body{margin:0;background:#111116;color:#e8e1d3;font:14px system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:24px}header{border-bottom:1px solid #4a454b;margin-bottom:16px}h1{font-size:26px}header p,article p,figcaption,.scale-review p{color:#aaa297}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}article{border:1px solid #4a454b;background:#1b1a20;padding:12px;border-radius:5px}h2{font-size:18px;margin:0 0 4px}article>div{display:grid;grid-template-columns:1fr 1.25fr;gap:10px}figure{margin:0;background:#0b0b0f;padding:8px}img{width:100%;height:260px;object-fit:contain}.pixel{image-rendering:pixelated}figcaption{text-align:center;padding-top:5px}.scale-review{margin-top:28px;border-top:1px solid #4a454b;padding-top:20px}.scale-review h2{font-size:22px}.scale-review div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.scale-review img{height:auto;background:#0b0b0f;border:1px solid #4a454b;image-rendering:auto}@media(max-width:760px){.cards,.scale-review div{grid-template-columns:1fr}article>div{grid-template-columns:1fr}img{height:220px}}</style>
<main><header><h1>《这一身》新增敌人美术确认与接入记录</h1><p>20 套候选已获用户视觉确认并接入正式运行时，promotionAllowed=true。</p></header><section class="cards">""" + "".join(cards) + """</section><section class="scale-review"><h2>批准的实际游戏尺寸</h2><p>按当前世界像素尺寸与 35×49 主角并排；正式运行时使用同一组显示尺寸。</p><div><img src="runtime-scale-review-1.png" alt="敌人实际世界尺寸第一张"><img src="runtime-scale-review-2.png" alt="敌人实际世界尺寸第二张"></div></section></main>"""
    (REVIEW_DIR / "index.html").write_text(document, encoding="utf-8")


def main() -> None:
    specs = load_specs()
    CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, object]] = []
    for spec in specs:
        source = selected_source(spec)
        atlas, validation = build_atlas(source, spec)
        preview = PREVIEW_DIR / f"{spec.asset}.png"
        entries.append({
            "id": spec.asset,
            "name": spec.name,
            "stage": spec.stage,
            "kind": spec.kind,
            "frame": [spec.frame, spec.frame],
            "source": str(source),
            "sourceSha256": sha256(source),
            "atlas": str(atlas),
            "atlasSha256": sha256(atlas),
            "preview": str(preview),
            "validation": validation,
            "promotionAllowed": True,
        })
    pages = make_review_pages(entries, specs)
    make_html(entries, specs)
    manifest = {
        "schemaVersion": 1,
        "status": "approved-and-promoted",
        "promotionAllowed": True,
        "sourceModel": "gpt-image-2",
        "pipeline": "Image2 2x2 source -> border-key chroma removal -> nearest pixel reduction -> review-only motion atlas",
        "motions": MOTION_COUNTS,
        "entries": entries,
        "reviewPages": pages,
        "reviewHtml": "index.html",
    }
    (REVIEW_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"built {len(entries)} review-only candidate atlases")
    print(REVIEW_DIR / "index.html")


if __name__ == "__main__":
    main()
