#!/usr/bin/env python3
"""Build and optionally promote dedicated boss skill atlases."""

from __future__ import annotations

import argparse
import json
import shutil
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
TASK_DIR = ROOT / "scripts/image2/boss-skills-v1"
RAW_DIR = ROOT / "output/imagegen/zhe-yi-shen-boss-skills-v1/raw"
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-boss-skills-v1"
CANDIDATE_DIR = OUT_DIR / "candidate-atlases"
PREVIEW_DIR = OUT_DIR / "previews"
FORMAL_DIR = ROOT / "src/assets/enemies/boss-skills-v1"
CLEAR = (0, 0, 0, 0)


def strip_key(image: Image.Image, key: str) -> Image.Image:
    result = image.convert("RGBA")
    cleaned = []
    for red, green, blue, alpha in result.getdata():
        if key == "magenta":
            keyed = min(red, blue) > 35 and min(red, blue) > green * 1.55 and abs(red - blue) < 70
        else:
            keyed = green > 30 and green > red * 1.32 and green > blue * 1.32 and max(red, blue) < 175
        cleaned.append(CLEAR if keyed or alpha < 20 else (red, green, blue, 255))
    result.putdata(cleaned)
    return result


def meaningful_components(image: Image.Image, preserve_cluster: bool = False) -> Image.Image:
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.tobytes()
    seen = bytearray(width * height)
    components: list[tuple[list[int], bool]] = []
    for start, value in enumerate(pixels):
        if value == 0 or seen[start]:
            continue
        queue = deque([start])
        seen[start] = 1
        component: list[int] = []
        touches_edge = False
        while queue:
            index = queue.popleft()
            component.append(index)
            x, y = index % width, index // width
            touches_edge = touches_edge or x in (0, width - 1) or y in (0, height - 1)
            if x > 0:
                neighbor = index - 1
                if pixels[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    queue.append(neighbor)
            if x + 1 < width:
                neighbor = index + 1
                if pixels[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    queue.append(neighbor)
            if y > 0:
                neighbor = index - width
                if pixels[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    queue.append(neighbor)
            if y + 1 < height:
                neighbor = index + width
                if pixels[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    queue.append(neighbor)
        components.append((component, touches_edge))
    if not components:
        raise AssertionError("empty chroma-key cell")
    # Generated 2x2 sheets can contain white separators. Remove only broad,
    # near-white edge components; real effects such as chains may also touch an edge.
    source = image.load()

    def is_separator(component: list[int], touches_edge: bool) -> bool:
        if not touches_edge:
            return False
        xs = [index % width for index in component]
        ys = [index // width for index in component]
        spans_sheet = max(xs) - min(xs) >= width * 0.75 or max(ys) - min(ys) >= height * 0.75
        if not spans_sheet:
            return False
        near_white = 0
        for index in component:
            red, green, blue, _ = source[index % width, index // width]
            if min(red, green, blue) > 185 and max(red, green, blue) - min(red, green, blue) < 42:
                near_white += 1
        return near_white / len(component) > 0.6

    components = [
        component
        for component, touches_edge in components
        if not is_separator(component, touches_edge)
    ]
    if not components:
        raise AssertionError("only edge-touching components remain after chroma key")
    components.sort(key=len, reverse=True)
    threshold = max(8, len(components[0]) // (500 if preserve_cluster else 350))
    keep: set[int] = set()
    for component in components:
        if len(component) >= threshold:
            keep.update(component)
    output = Image.new("RGBA", image.size, CLEAR)
    target = output.load()
    for index in keep:
        x, y = index % width, index // width
        target[x, y] = source[x, y]
    return output


def extract_poses(source: Path, frame: int, key: str, preserve_cluster: bool = False) -> list[Image.Image]:
    sheet = strip_key(Image.open(source).convert("RGBA"), key)
    half_w, half_h = sheet.width // 2, sheet.height // 2
    poses = []
    for index in range(4):
        col, row = index % 2, index // 2
        cell = sheet.crop((col * half_w, row * half_h, (col + 1) * half_w, (row + 1) * half_h))
        cell = meaningful_components(cell, preserve_cluster)
        bbox = cell.getchannel("A").getbbox()
        if bbox is None:
            raise AssertionError(f"empty pose {source.name}:{index}")
        cell = cell.crop(bbox)
        max_size = max(8, frame - 6)
        scale = min(max_size / cell.width, max_size / cell.height)
        cell = cell.resize((max(1, round(cell.width * scale)), max(1, round(cell.height * scale))), Image.Resampling.NEAREST)
        canvas = Image.new("RGBA", (frame, frame), CLEAR)
        canvas.alpha_composite(cell, ((frame - cell.width) // 2, frame - cell.height - 3))
        poses.append(canvas)
    return poses


def validate_frame(frame: Image.Image, label: str) -> None:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None:
        raise AssertionError(f"empty frame: {label}")
    if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= frame.width or bbox[3] >= frame.height:
        raise AssertionError(f"frame touches edge: {label} {bbox}")
    if set(frame.getchannel("A").getdata()) - {0, 255}:
        raise AssertionError(f"partial alpha: {label}")


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (Path("/System/Library/Fonts/PingFang.ttc"), Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")):
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--promote", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((TASK_DIR / "manifest.json").read_text(encoding="utf-8"))
    CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    if args.promote:
        FORMAL_DIR.mkdir(parents=True, exist_ok=True)
    review_cards = []
    runtime_manifest = {"schemaVersion": 1, "assets": {}, "skills": {}}
    for asset in manifest["assets"]:
        asset_id = asset["id"]
        source = RAW_DIR / f"{asset_id}-{asset.get('version', 'v1')}.png"
        if not source.is_file():
            raise FileNotFoundError(source)
        frame = int(asset["frame"])
        poses = extract_poses(source, frame, asset["key"], asset_id == "ringing-phone-p2-skills")
        skills = asset["skills"]
        atlas = Image.new("RGBA", (frame * 4, frame * len(skills)), CLEAR)
        for row, skill in enumerate(skills):
            for column, pose_index in enumerate(skill["sequence"]):
                pose = poses[int(pose_index)]
                validate_frame(pose, f"{asset_id}/{skill['id']}/{column}")
                atlas.alpha_composite(pose, (column * frame, row * frame))
            runtime_manifest["skills"][skill["id"]] = {
                "asset": asset_id,
                "row": row,
                "loop": bool(skill.get("loop", False)),
            }
        atlas_path = CANDIDATE_DIR / f"{asset_id}.png"
        atlas.save(atlas_path, optimize=True)
        if args.promote:
            shutil.copy2(atlas_path, FORMAL_DIR / atlas_path.name)
        runtime_manifest["assets"][asset_id] = {
            "frame": frame,
            "rows": len(skills),
            "display": int(asset["display"]),
        }
        preview = Image.new("RGBA", (frame * 4, frame * len(skills)), (12, 12, 16, 255))
        preview.alpha_composite(atlas)
        preview_path = PREVIEW_DIR / f"{asset_id}.png"
        preview.save(preview_path, optimize=True)
        review_cards.append((asset["name"], preview_path, frame, len(skills)))
    (OUT_DIR / "manifest.json").write_text(json.dumps(runtime_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.promote:
        shutil.copy2(OUT_DIR / "manifest.json", FORMAL_DIR / "manifest.json")
    card_width, card_height = 480, 280
    review_columns = 3
    review_rows = max(1, (len(review_cards) + review_columns - 1) // review_columns)
    review = Image.new("RGB", (card_width * review_columns, card_height * review_rows + 50), "#111116")
    draw = ImageDraw.Draw(review)
    draw.text((16, 12), "Boss skill atlases: four frames per dedicated action", fill="#eee7d8", font=font(22))
    for index, (name, path, frame, rows) in enumerate(review_cards):
        x = (index % review_columns) * card_width
        y = 50 + (index // review_columns) * card_height
        draw.rectangle((x + 8, y + 8, x + card_width - 8, y + card_height - 8), fill="#1b1a20", outline="#4a454b")
        draw.text((x + 18, y + 18), name, fill="#eee7d8", font=font(16))
        sprite = Image.open(path).convert("RGBA")
        scale = min((card_width - 36) / sprite.width, (card_height - 58) / sprite.height)
        sprite = sprite.resize((round(sprite.width * scale), round(sprite.height * scale)), Image.Resampling.NEAREST)
        review.paste(sprite.convert("RGB"), (x + (card_width - sprite.width) // 2, y + 48), sprite.getchannel("A"))
    review.save(OUT_DIR / "boss-skill-review.png", optimize=True)
    print(f"built {len(review_cards)} boss skill atlases with {len(runtime_manifest['skills'])} action rows")
    if args.promote:
        print(f"promoted to {FORMAL_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
