#!/usr/bin/env python3
"""Fail packaging when a runtime art atlas is malformed or a generated manifest is stale."""

from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    raise AssertionError(message)


def read_json(relative: str) -> dict:
    path = ROOT / relative
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001
        fail(f"invalid JSON {relative}: {error}")


def image(relative: str) -> Image.Image:
    path = ROOT / relative
    if not path.is_file():
        fail(f"missing art {relative}")
    return Image.open(path)


def require_size(relative: str, expected: tuple[int, int]) -> Image.Image:
    current = image(relative)
    if current.size != expected:
        fail(f"wrong size {relative}: {current.size}, expected {expected}")
    return current


def validate_grid(png: str, manifest_path: str, *, allow_unmapped_empty: bool = False) -> None:
    manifest = read_json(manifest_path)
    cell = int(manifest["cell"])
    cols = int(manifest["cols"])
    rows = int(manifest["rows"])
    atlas = require_size(png, (cell * cols, cell * rows)).convert("RGBA")
    mapped = set(int(value) for value in manifest.get("index", {}).values())
    indexes = mapped if allow_unmapped_empty and mapped else set(range(cols * rows))
    for index in indexes:
        if index < 0 or index >= cols * rows:
            fail(f"out-of-range index {index} in {manifest_path}")
        left = (index % cols) * cell
        top = (index // cols) * cell
        if atlas.crop((left, top, left + cell, top + cell)).getchannel("A").getbbox() is None:
            fail(f"empty mapped cell {index} in {png}")


def validate_item_coverage() -> None:
    manifest = read_json("src/assets/items/icons.json")
    indexes = manifest.get("index", {})
    relic_source = (ROOT / "src/relics.ts").read_text(encoding="utf-8")
    relic_ids = re.findall(r"\bid:\s*'([^']+)'", relic_source)
    if len(relic_ids) != 74 or len(set(relic_ids)) != len(relic_ids):
        fail(f"unexpected relic declarations: total={len(relic_ids)} unique={len(set(relic_ids))}")
    if set(indexes) != set(relic_ids):
        missing = sorted(set(relic_ids) - set(indexes))
        extra = sorted(set(indexes) - set(relic_ids))
        fail(f"item icon coverage mismatch: missing={missing} extra={extra}")
    mapped = sorted(int(value) for value in indexes.values())
    if mapped != list(range(len(relic_ids))):
        fail("item icon indexes must be unique and contiguous from zero")


def validate_character_atlas(
    relative: str,
    *,
    frame_size: tuple[int, int],
    frame_counts: list[int],
    row_groups: int = 1,
) -> None:
    frame_w, frame_h = frame_size
    cols = max(frame_counts)
    rows = len(frame_counts) * row_groups
    atlas = require_size(relative, (frame_w * cols, frame_h * rows)).convert("RGBA")
    for group in range(row_groups):
        for row, frame_count in enumerate(frame_counts):
            atlas_row = group * len(frame_counts) + row
            for col in range(frame_count):
                left = col * frame_w
                top = atlas_row * frame_h
                if atlas.crop((left, top, left + frame_w, top + frame_h)).getchannel("A").getbbox() is None:
                    fail(f"empty animation frame {relative}: group={group} row={row} col={col}")


def validate_hero() -> None:
    motion_frames = {"idle": 2, "walk": 4, "attack": 2, "hurt": 2}
    for family in ("hero", "raincoat", "hair-mask"):
        for motion, frames in motion_frames.items():
            relative = f"src/assets/hero-style1-profiles/{family}-{motion}.png"
            atlas = require_size(relative, (40 * frames, 56 * 4 * 12)).convert("RGBA")
            for row in range(4 * 12):
                for col in range(frames):
                    left = col * 40
                    top = row * 56
                    if atlas.crop((left, top, left + 40, top + 56)).getchannel("A").getbbox() is None:
                        fail(f"empty hero frame {relative}: row={row} col={col}")

    offsets = read_json("src/assets/hero-style1-profiles/rig-motion-offsets.json")
    expected_parts = {"head", "face", "neck", "chest", "back", "leftHand", "rightHand", "waist", "feet", "shadow"}
    for direction in ("front", "back", "left", "right"):
        if direction not in offsets:
            fail(f"missing hero direction offsets: {direction}")
        for motion, count in motion_frames.items():
            frames = offsets[direction].get(motion, [])
            if len(frames) != count:
                fail(f"wrong hero offset count {direction}/{motion}: {len(frames)}, expected {count}")
            for index, frame in enumerate(frames):
                if set(frame) != expected_parts:
                    fail(f"wrong hero offset parts {direction}/{motion}/{index}")


def validate_enemies() -> None:
    runtime_atlases = (
        "src/assets/enemies/fear.png",
        "src/assets/enemies/red-mark.png",
        "src/assets/enemies/whisper.png",
        "src/assets/enemies/clockwork.png",
        "src/assets/enemies/debt.png",
        "src/assets/enemies/silent-father.png",
        "src/assets/enemies/silent-father-p2.png",
        "src/assets/enemies/lamp-keeper.png",
        "src/assets/canonical-v1/enemies/uniform-answer.png",
        "src/assets/enemies/cry-moth.png",
        "src/assets/canonical-v1/enemies/hunger-shadow.png",
        "src/assets/enemies/closet-dark.png",
        "src/assets/enemies/missed-call.png",
        "src/assets/enemies/silence.png",
        "src/assets/enemies/badge-thief.png",
        "src/assets/enemies/debt-collector.png",
        "src/assets/enemies/forgetter.png",
        "src/assets/enemies/empty-chair.png",
        "src/assets/enemies/last-bus.png",
    )
    for relative in runtime_atlases:
        validate_character_atlas(
            relative,
            frame_size=(32, 32),
            frame_counts=[2, 4, 2, 2, 4],
        )


def validate_combo() -> None:
    manifest = read_json("src/assets/ui/combo-art.json")
    keys = manifest.get("keys", [])
    missing = manifest.get("missing", [])
    if len(keys) != 12 or missing:
        fail(f"combo atlas incomplete: keys={len(keys)} missing={missing}")
    cols = int(manifest["cols"])
    cell_w = int(manifest["cellWidth"])
    cell_h = int(manifest["cellHeight"])
    rows = (len(keys) + cols - 1) // cols
    atlas = require_size("src/assets/ui/combo-art.png", (cell_w * cols, cell_h * rows)).convert("RGBA")
    for index, key in enumerate(keys):
        left = (index % cols) * cell_w
        top = (index // cols) * cell_h
        if atlas.crop((left, top, left + cell_w, top + cell_h)).getbbox() is None:
            fail(f"empty combo cell {key}")


def validate_transparent_rgb(relative: str) -> None:
    current = image(relative).convert("RGBA")
    dirty = sum(1 for red, green, blue, alpha in current.getdata() if alpha == 0 and (red or green or blue))
    if dirty:
        fail(f"transparent RGB residue in {relative}: {dirty} pixels")


def validate_seam(relative: str) -> None:
    current = image(relative).convert("RGB")
    width, height = current.size
    if list(current.crop((0, 0, 1, height)).getdata()) != list(current.crop((width - 1, 0, width, height)).getdata()):
        fail(f"left/right texture seam in {relative}")
    if list(current.crop((0, 0, width, 1)).getdata()) != list(current.crop((0, height - 1, width, height)).getdata()):
        fail(f"top/bottom texture seam in {relative}")


def validate_generation_manifests() -> None:
    for relative in (
        "output/imagegen/zhe-yi-shen-ui-hybrid-v1/manifest.json",
        "output/imagegen/zhe-yi-shen-combo-art-v1/manifest.json",
    ):
        manifest_path = ROOT / relative
        manifest = read_json(relative)
        runtime = manifest.get("runtime", [])
        entries = runtime if isinstance(runtime, list) else [runtime]
        for entry in entries:
            for key in ("file", "manifest"):
                value = entry.get(key)
                if value and not (manifest_path.parent / value).resolve().is_file():
                    fail(f"stale {key} path in {relative}: {value}")
        sources = manifest.get("source", [])
        for source in sources if isinstance(sources, list) else [sources]:
            if source and not (manifest_path.parent / source).is_file():
                fail(f"missing generation source in {relative}: {source}")


def main() -> None:
    validate_grid("src/assets/items/icons.png", "src/assets/items/icons.json", allow_unmapped_empty=True)
    validate_item_coverage()
    validate_hero()
    validate_enemies()
    for family in ("projectiles", "hits", "saves", "synergy", "status"):
        validate_grid(f"src/assets/vfx/{family}.png", f"src/assets/vfx/{family}.json")
    for family in ("archive-deco", "poison", "joystick", "fate-profiles"):
        validate_grid(f"src/assets/ui/{family}.png", f"src/assets/ui/{family}.json")
    validate_combo()

    fixed_sizes = {
        "src/assets/ui/title-life-night.png": (360, 640),
        "src/assets/ui/paper-texture.png": (192, 192),
        "src/assets/ui/night-texture.png": (192, 192),
        "src/assets/ui/desk-texture.png": (192, 192),
        "src/assets/ui/static-texture.png": (192, 192),
        "src/assets/ui/corner-ornament.png": (24, 23),
        "src/assets/ui/seal-ornament.png": (47, 56),
        "src/assets/ui/torn-edge.png": (160, 14),
        "src/assets/ui/receipt-edge.png": (160, 14),
        "src/assets/ui/record-frames.png": (128, 224),
        "src/assets/ui/panel-frame.png": (120, 160),
        "src/assets/ui/button-frame.png": (96, 30),
        "src/assets/ui/chapter-strips.png": (96, 312),
        "src/assets/world/props.png": (160, 264),
        "src/assets/world/entities.png": (256, 72),
        "src/assets/rooms/lamp.png": (360, 640),
        "src/assets/rooms/inner.png": (360, 640),
        "src/assets/rooms/pawn.png": (360, 640),
        "src/assets/ui/ending-table.png": (360, 640),
        "src/assets/ui/ending-lampman.png": (360, 640),
        **{f"src/assets/world/ground-{index}.png": (128, 128) for index in range(6)},
    }
    for relative, expected in fixed_sizes.items():
        require_size(relative, expected)

    transparent_assets = [
        "src/assets/ui/corner-ornament.png", "src/assets/ui/seal-ornament.png",
        "src/assets/ui/record-frames.png", "src/assets/ui/panel-frame.png",
        "src/assets/ui/button-frame.png", "src/assets/ui/torn-edge.png",
        "src/assets/ui/receipt-edge.png", "src/assets/ui/archive-deco.png",
        "src/assets/ui/poison.png", "src/assets/ui/joystick.png",
        "src/assets/vfx/projectiles.png", "src/assets/vfx/hits.png",
        "src/assets/vfx/saves.png", "src/assets/vfx/synergy.png", "src/assets/vfx/status.png",
    ]
    for relative in transparent_assets:
        validate_transparent_rgb(relative)

    for relative in (
        "src/assets/ui/paper-texture.png", "src/assets/ui/night-texture.png",
        "src/assets/ui/desk-texture.png", "src/assets/ui/static-texture.png",
        *(f"src/assets/world/ground-{index}.png" for index in range(6)),
    ):
        validate_seam(relative)

    validate_generation_manifests()
    print("runtime art: valid")


if __name__ == "__main__":
    main()
