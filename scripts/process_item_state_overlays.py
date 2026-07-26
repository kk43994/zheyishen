#!/usr/bin/env python3
"""Publish approved multi-phase Image2 item overlays at exact hero-frame scale."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


THIRD_PILL_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/44-third-pill/v1/"
    "44-third-pill-v1.png"
)
THIRD_PILL_PROMPT = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/44-third-pill/v1/prompt-v1.txt"
)
THIRD_PILL_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/44-third-pill/selection.json"
)
AUTO_RENEW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/37-auto-renew/v1/"
    "37-auto-renew-v1-logical-vfx.png"
)
AUTO_RENEW_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/37-auto-renew/v1/"
    "37-auto-renew-v1.png"
)
AUTO_RENEW_PROMPT = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/37-auto-renew/v1/prompt-v1.txt"
)
AUTO_RENEW_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/37-auto-renew/selection.json"
)
SHOP_FREEZER_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/70-shop-freezer-74-breath/v4/"
    "70-shop-freezer-overlay-4dir-40x56.png"
)
SHOP_FREEZER_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-items-image2-v1/raw/70-shop-freezer.png"
)
SHOP_FREEZER_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/70-shop-freezer-74-breath/selection.json"
)
PREGNANCY_TEST_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/55-pregnancy-test/v1/"
    "55-pregnancy-test-v1.png"
)
PREGNANCY_TEST_PROP_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/55-pregnancy-test/v1/"
    "rigid-overlay-4dir-40x56.png"
)
PREGNANCY_TEST_SHADOW_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/55-pregnancy-test/v1/"
    "child-shadow-overlay-4dir-40x56.png"
)
PREGNANCY_TEST_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/55-pregnancy-test/selection.json"
)
CRACKED_GLASSES_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/09-cracked-glasses/v2.1/source.png"
)
CRACKED_GLASSES_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/09-cracked-glasses/v2.1/"
    "face-overlay-40x56.png"
)
CRACKED_GLASSES_PROMPT = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/09-cracked-glasses/v2.1/prompt.txt"
)
CRACKED_GLASSES_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/09-cracked-glasses/selection.json"
)
DIVORCE_DRAFT_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/41-divorce-draft/v1/"
    "41-divorce-draft-v1.png"
)
DIVORCE_DRAFT_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/41-divorce-draft/v1.1/"
    "41-divorce-draft-v1.1-overlay-4dir-40x56.png"
)
DIVORCE_DRAFT_PROMPT = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/41-divorce-draft/v1/prompt-v1.txt"
)
DIVORCE_DRAFT_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/41-divorce-draft/selection.json"
)
GOODNIGHT_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/63-goodnight-2h/v1/source.png"
)
GOODNIGHT_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/63-goodnight-2h/v1.4/"
    "ground-shadow-overlay-40x56.png"
)
GOODNIGHT_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/63-goodnight-2h/selection.json"
)
SLOW_WATCH_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/18-slow-watch/v1/source.png"
)
SLOW_WATCH_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/18-slow-watch/v1.1/"
    "freeze-overlay-4action-4dir-40x56.png"
)
SLOW_WATCH_PROMPT = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/18-slow-watch/v1.1/prompt.txt"
)
SLOW_WATCH_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/18-slow-watch/selection.json"
)
BROKEN_SPINE_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/22-broken-spine/v2.1/source.png"
)
BROKEN_SPINE_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/22-broken-spine/v2.1/"
    "old-scar-decal-4action-4dir-40x56.png"
)
BROKEN_SPINE_PROMPT = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/22-broken-spine/v2.1/prompt.txt"
)
BROKEN_SPINE_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/22-broken-spine/selection.json"
)
MOMO_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/60-momo-avatar/v2.1/source.png"
)
MOMO_SAFE_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/60-momo-avatar/v2.1/"
    "safe-headpiece-overlay-40x56.png"
)
MOMO_THREATENED_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/60-momo-avatar/v2.1/"
    "threatened-headpiece-overlay-40x56.png"
)
MOMO_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/60-momo-avatar/selection.json"
)
EYE_EXERCISE_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/67-eye-exercise/v1/source.png"
)
EYE_EXERCISE_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/67-eye-exercise/v1/"
    "press-overlay-4action-4dir-40x56.png"
)
EYE_EXERCISE_PROMPT = Path(
    "scripts/image2/art-loop-v1/67-eye-exercise/prompt-v1.txt"
)
EYE_EXERCISE_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/67-eye-exercise/selection.json"
)
SERVER_SHUTDOWN_RAW_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/71-server-shutdown/v1/source.png"
)
SERVER_SHUTDOWN_STANDBY_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/71-server-shutdown/v1/"
    "shutdown-standby-overlay-40x56.png"
)
SERVER_SHUTDOWN_TRIGGER_OVERLAY = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/71-server-shutdown/v1/"
    "shutdown-trigger-overlay-4f-4dir.png"
)
SERVER_SHUTDOWN_PROMPT = Path(
    "scripts/image2/art-loop-v1/71-server-shutdown/prompt-trigger-v1-draft.txt"
)
SERVER_SHUTDOWN_SELECTION = Path(
    "output/imagegen/zhe-yi-shen-art-loop-v1/71-server-shutdown/selection.json"
)
ATLAS = Path("src/assets/items/state-overlays.png")
MANIFEST = Path("src/assets/items/state-overlays.json")

CELL_W = 40
CELL_H = 56
DIRECTIONS = ("front", "left", "back", "right")
THIRD_PILL_PHASES = ("rage", "crash")
AUTO_RENEW_PHASES = ("stub", "two", "three", "four")
SHOP_FREEZER_PHASES = ("drag",)
PREGNANCY_TEST_PHASES = ("shadow", "prop")
CRACKED_GLASSES_PHASES = ("fitted",)
DIVORCE_DRAFT_PHASES = ("fitted",)
GOODNIGHT_PHASES = ("shadow",)
SLOW_WATCH_PHASES = ("freeze-idle", "freeze-walk", "freeze-attack", "freeze-hurt")
BROKEN_SPINE_PHASES = ("scar-idle", "scar-walk", "scar-attack", "scar-hurt")
MOMO_PHASES = ("safe", "threatened")
EYE_EXERCISE_PHASES = ("press-idle", "press-walk", "press-attack", "press-hurt")
SERVER_SHUTDOWN_PHASES = ("standby", "appear", "leap", "guard", "disconnect")
PALETTE_COLORS = 10


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def strip_green(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    rgb = array[..., :3].astype(np.uint16)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    keyed = (
        (green > 96)
        & (green * 100 > red * 135)
        & (green * 100 > blue * 135)
    ) | (
        (green > 60)
        & (green * 100 > red * 120)
        & (green * 100 > blue * 120)
        & (np.maximum(red, blue) < 120)
    )
    near_key = np.asarray(
        Image.fromarray((keyed.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(5))
    ) > 0
    strongest_other = np.maximum(red, blue)
    edge_spill = (
        ~keyed
        & near_key
        & (green > 70)
        & (green > strongest_other + 10)
    )
    array[..., 1][edge_spill] = strongest_other[edge_spill].astype(np.uint8)
    array[..., 3][keyed] = 0
    array[..., :3][keyed] = 0
    return Image.fromarray(array)


def hard_quantize(image: Image.Image) -> Image.Image:
    array = np.asarray(image.convert("RGBA")).copy()
    opaque = array[..., 3] >= 96
    if not opaque.any():
        raise ValueError("empty state overlay cell")
    samples = Image.fromarray(array[..., :3][opaque].reshape((1, -1, 3)).astype(np.uint8))
    reduced = samples.quantize(
        colors=PALETTE_COLORS,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    array[..., :3] = 0
    array[..., :3][opaque] = np.asarray(reduced).reshape((-1, 3))
    array[..., 3] = np.where(opaque, 255, 0).astype(np.uint8)
    return Image.fromarray(array)


def main() -> None:
    third_pill_selection = json.loads(THIRD_PILL_SELECTION.read_text(encoding="utf-8"))
    if (
        third_pill_selection.get("status") != "approved"
        or third_pill_selection.get("selectedVersion") != "v1"
    ):
        raise ValueError("third-pill Image2 selection is not approved v1")
    auto_renew_selection = json.loads(AUTO_RENEW_SELECTION.read_text(encoding="utf-8"))
    if (
        auto_renew_selection.get("status") != "approved"
        or auto_renew_selection.get("selectedVersion") != "v1"
    ):
        raise ValueError("auto-renew Image2 selection is not approved v1")
    cracked_glasses_selection = json.loads(
        CRACKED_GLASSES_SELECTION.read_text(encoding="utf-8")
    )
    if (
        cracked_glasses_selection.get("status") != "approved"
        or cracked_glasses_selection.get("selectedVersion") != "v2.1"
        or not cracked_glasses_selection.get("integrationAllowed")
    ):
        raise ValueError("cracked-glasses Image2 selection is not approved v2.1")
    divorce_draft_selection = json.loads(
        DIVORCE_DRAFT_SELECTION.read_text(encoding="utf-8")
    )
    if (
        divorce_draft_selection.get("status") != "approved"
        or divorce_draft_selection.get("selectedVersion") != "v1.1"
        or not divorce_draft_selection.get("integrationAllowed")
    ):
        raise ValueError("divorce-draft Image2 selection is not approved v1.1")
    goodnight_selection = json.loads(GOODNIGHT_SELECTION.read_text(encoding="utf-8"))
    if (
        goodnight_selection.get("status") != "approved"
        or goodnight_selection.get("selectedVersion") != "v1.4"
    ):
        raise ValueError("goodnight-2h Image2 selection is not approved v1.4")
    slow_watch_selection = json.loads(SLOW_WATCH_SELECTION.read_text(encoding="utf-8"))
    if (
        slow_watch_selection.get("status") != "approved"
        or slow_watch_selection.get("selectedVersion") != "v1.1"
        or slow_watch_selection.get("selectedPhase") != "freeze"
        or not slow_watch_selection.get("integrationAllowed")
    ):
        raise ValueError("slow-watch Image2 selection is not approved v1.1 freeze")
    broken_spine_selection = json.loads(BROKEN_SPINE_SELECTION.read_text(encoding="utf-8"))
    if (
        broken_spine_selection.get("status") != "approved"
        or broken_spine_selection.get("selectedVersion") != "v2.1"
        or broken_spine_selection.get("selectedArtifact") != "body-attached-old-scar-decal"
        or not broken_spine_selection.get("integrationAllowed")
    ):
        raise ValueError("broken-spine Image2 selection is not approved v2.1 scar decal")
    momo_selection = json.loads(MOMO_SELECTION.read_text(encoding="utf-8"))
    if (
        momo_selection.get("status") != "approved"
        or momo_selection.get("selectedVersion") != "v2.1"
        or not momo_selection.get("integrationAllowed")
    ):
        raise ValueError("momo-avatar Image2 selection is not approved v2.1")
    eye_exercise_selection = json.loads(EYE_EXERCISE_SELECTION.read_text(encoding="utf-8"))
    if (
        eye_exercise_selection.get("status") not in {"approved-local-art-not-integrated", "approved-integrated"}
        or eye_exercise_selection.get("selectedVersion") != "v1"
        or not eye_exercise_selection.get("integrationAllowed")
    ):
        raise ValueError("eye-exercise Image2 selection is not approved v1")
    server_shutdown_selection = json.loads(SERVER_SHUTDOWN_SELECTION.read_text(encoding="utf-8"))
    if (
        server_shutdown_selection.get("status") not in {"approved-local-art-not-integrated", "approved-integrated"}
        or server_shutdown_selection.get("selectedVersion") != "v1"
        or not server_shutdown_selection.get("integrationAllowed")
    ):
        raise ValueError("server-shutdown Image2 selection is not approved v1")
    for path in (
        THIRD_PILL_SOURCE,
        THIRD_PILL_PROMPT,
        THIRD_PILL_SELECTION,
        AUTO_RENEW_SOURCE,
        AUTO_RENEW_RAW_SOURCE,
        AUTO_RENEW_PROMPT,
        AUTO_RENEW_SELECTION,
        SHOP_FREEZER_OVERLAY,
        SHOP_FREEZER_RAW_SOURCE,
        SHOP_FREEZER_SELECTION,
        PREGNANCY_TEST_RAW_SOURCE,
        PREGNANCY_TEST_PROP_OVERLAY,
        PREGNANCY_TEST_SHADOW_OVERLAY,
        PREGNANCY_TEST_SELECTION,
        CRACKED_GLASSES_RAW_SOURCE,
        CRACKED_GLASSES_OVERLAY,
        CRACKED_GLASSES_PROMPT,
        CRACKED_GLASSES_SELECTION,
        DIVORCE_DRAFT_RAW_SOURCE,
        DIVORCE_DRAFT_OVERLAY,
        DIVORCE_DRAFT_PROMPT,
        DIVORCE_DRAFT_SELECTION,
        GOODNIGHT_RAW_SOURCE,
        GOODNIGHT_OVERLAY,
        GOODNIGHT_SELECTION,
        SLOW_WATCH_RAW_SOURCE,
        SLOW_WATCH_OVERLAY,
        SLOW_WATCH_PROMPT,
        SLOW_WATCH_SELECTION,
        BROKEN_SPINE_RAW_SOURCE,
        BROKEN_SPINE_OVERLAY,
        BROKEN_SPINE_PROMPT,
        BROKEN_SPINE_SELECTION,
        MOMO_RAW_SOURCE,
        MOMO_SAFE_OVERLAY,
        MOMO_THREATENED_OVERLAY,
        MOMO_SELECTION,
        EYE_EXERCISE_RAW_SOURCE,
        EYE_EXERCISE_OVERLAY,
        EYE_EXERCISE_PROMPT,
        EYE_EXERCISE_SELECTION,
        SERVER_SHUTDOWN_RAW_SOURCE,
        SERVER_SHUTDOWN_STANDBY_OVERLAY,
        SERVER_SHUTDOWN_TRIGGER_OVERLAY,
        SERVER_SHUTDOWN_PROMPT,
        SERVER_SHUTDOWN_SELECTION,
    ):
        if not path.is_file():
            raise FileNotFoundError(path)

    foreground = strip_green(Image.open(THIRD_PILL_SOURCE))
    source_cell_w = foreground.width // len(DIRECTIONS)
    source_cell_h = foreground.height // len(THIRD_PILL_PHASES)
    item_rows = {
        "third-pill": {"row": 0, "phases": list(THIRD_PILL_PHASES)},
        "auto-renew": {"row": 2, "phases": list(AUTO_RENEW_PHASES)},
        "shop-freezer": {"row": 6, "phases": list(SHOP_FREEZER_PHASES)},
        "pregnancy-test": {"row": 7, "phases": list(PREGNANCY_TEST_PHASES)},
        "cracked-glasses": {"row": 9, "phases": list(CRACKED_GLASSES_PHASES)},
        "divorce-draft": {"row": 10, "phases": list(DIVORCE_DRAFT_PHASES)},
        "goodnight-2h": {"row": 11, "phases": list(GOODNIGHT_PHASES)},
        "slow-watch": {"row": 12, "phases": list(SLOW_WATCH_PHASES)},
        "broken-spine": {"row": 16, "phases": list(BROKEN_SPINE_PHASES)},
        "momo-avatar": {"row": 20, "phases": list(MOMO_PHASES)},
        "eye-exercise": {"row": 22, "phases": list(EYE_EXERCISE_PHASES)},
        "server-shutdown": {"row": 26, "phases": list(SERVER_SHUTDOWN_PHASES)},
    }
    row_count = sum(len(item["phases"]) for item in item_rows.values())
    atlas = Image.new(
        "RGBA",
        (CELL_W * len(DIRECTIONS), CELL_H * row_count),
        (0, 0, 0, 0),
    )
    cells: dict[str, dict[str, object]] = {}
    for phase_index, phase in enumerate(THIRD_PILL_PHASES):
        for direction_index, direction in enumerate(DIRECTIONS):
            source_cell = foreground.crop((
                direction_index * source_cell_w,
                phase_index * source_cell_h,
                (direction_index + 1) * source_cell_w,
                (phase_index + 1) * source_cell_h,
            ))
            cell = hard_quantize(source_cell.resize((CELL_W, CELL_H), Image.Resampling.NEAREST))
            atlas.alpha_composite(cell, (direction_index * CELL_W, phase_index * CELL_H))
            visible = [pixel for pixel in cell.getdata() if pixel[3]]
            cells[f"{phase}:{direction}"] = {
                "visiblePixels": len(visible),
                "colors": len({pixel[:3] for pixel in visible}),
            }

    auto_renew = Image.open(AUTO_RENEW_SOURCE).convert("RGBA")
    if auto_renew.size != (CELL_W * len(AUTO_RENEW_PHASES), CELL_H):
        raise ValueError(f"auto-renew logical VFX has unexpected size {auto_renew.size}")
    for phase_index, phase in enumerate(AUTO_RENEW_PHASES):
        source_cell = auto_renew.crop((
            phase_index * CELL_W,
            0,
            (phase_index + 1) * CELL_W,
            CELL_H,
        ))
        cell = hard_quantize(source_cell)
        for direction_index, direction in enumerate(DIRECTIONS):
            target_y = (item_rows["auto-renew"]["row"] + phase_index) * CELL_H
            atlas.alpha_composite(cell, (direction_index * CELL_W, target_y))
            visible = [pixel for pixel in cell.getdata() if pixel[3]]
            cells[f"auto-renew:{phase}:{direction}"] = {
                "visiblePixels": len(visible),
                "colors": len({pixel[:3] for pixel in visible}),
            }

    shop_freezer = Image.open(SHOP_FREEZER_OVERLAY).convert("RGBA")
    if shop_freezer.size != (CELL_W * len(DIRECTIONS), CELL_H):
        raise ValueError(f"shop-freezer logical overlay has unexpected size {shop_freezer.size}")
    # The approved postprocess uses front/back/left/right; runtime atlas uses front/left/back/right.
    source_direction_index = {"front": 0, "left": 2, "back": 1, "right": 3}
    for direction_index, direction in enumerate(DIRECTIONS):
        source_index = source_direction_index[direction]
        source_cell = shop_freezer.crop((
            source_index * CELL_W,
            0,
            (source_index + 1) * CELL_W,
            CELL_H,
        ))
        cell = hard_quantize(source_cell)
        target_y = item_rows["shop-freezer"]["row"] * CELL_H
        atlas.alpha_composite(cell, (direction_index * CELL_W, target_y))
        visible = [pixel for pixel in cell.getdata() if pixel[3]]
        cells[f"shop-freezer:drag:{direction}"] = {
            "visiblePixels": len(visible),
            "colors": len({pixel[:3] for pixel in visible}),
        }

    for phase_index, (phase, overlay_path) in enumerate((
        ("shadow", PREGNANCY_TEST_SHADOW_OVERLAY),
        ("prop", PREGNANCY_TEST_PROP_OVERLAY),
    )):
        overlay = Image.open(overlay_path).convert("RGBA")
        if overlay.size != (CELL_W * len(DIRECTIONS), CELL_H):
            raise ValueError(f"pregnancy-test {phase} overlay has unexpected size {overlay.size}")
        for direction_index, direction in enumerate(DIRECTIONS):
            source_index = source_direction_index[direction]
            source_cell = overlay.crop((
                source_index * CELL_W,
                0,
                (source_index + 1) * CELL_W,
                CELL_H,
            ))
            cell = hard_quantize(source_cell)
            target_y = (item_rows["pregnancy-test"]["row"] + phase_index) * CELL_H
            atlas.alpha_composite(cell, (direction_index * CELL_W, target_y))
            visible = [pixel for pixel in cell.getdata() if pixel[3]]
            cells[f"pregnancy-test:{phase}:{direction}"] = {
                "visiblePixels": len(visible),
                "colors": len({pixel[:3] for pixel in visible}),
            }

    cracked_glasses = Image.open(CRACKED_GLASSES_OVERLAY).convert("RGBA")
    if cracked_glasses.size != (CELL_W * len(DIRECTIONS), CELL_H):
        raise ValueError(
            f"cracked-glasses logical overlay has unexpected size {cracked_glasses.size}"
        )
    for direction_index, direction in enumerate(DIRECTIONS):
        source_cell = cracked_glasses.crop((
            direction_index * CELL_W,
            0,
            (direction_index + 1) * CELL_W,
            CELL_H,
        ))
        cell = hard_quantize(source_cell)
        target_y = item_rows["cracked-glasses"]["row"] * CELL_H
        atlas.alpha_composite(cell, (direction_index * CELL_W, target_y))
        visible = [pixel for pixel in cell.getdata() if pixel[3]]
        cells[f"cracked-glasses:fitted:{direction}"] = {
            "visiblePixels": len(visible),
            "colors": len({pixel[:3] for pixel in visible}),
        }

    divorce_draft = Image.open(DIVORCE_DRAFT_OVERLAY).convert("RGBA")
    if divorce_draft.size != (CELL_W * len(DIRECTIONS), CELL_H):
        raise ValueError(
            f"divorce-draft logical overlay has unexpected size {divorce_draft.size}"
        )
    for direction_index, direction in enumerate(DIRECTIONS):
        source_index = source_direction_index[direction]
        source_cell = divorce_draft.crop((
            source_index * CELL_W,
            0,
            (source_index + 1) * CELL_W,
            CELL_H,
        ))
        if source_cell.getchannel("A").getbbox() is None:
            cell = source_cell
        else:
            cell = hard_quantize(source_cell)
        target_y = item_rows["divorce-draft"]["row"] * CELL_H
        atlas.alpha_composite(cell, (direction_index * CELL_W, target_y))
        visible = [pixel for pixel in cell.getdata() if pixel[3]]
        cells[f"divorce-draft:fitted:{direction}"] = {
            "visiblePixels": len(visible),
            "colors": len({pixel[:3] for pixel in visible}),
        }

    goodnight = Image.open(GOODNIGHT_OVERLAY).convert("RGBA")
    if goodnight.size != (CELL_W * len(DIRECTIONS), CELL_H):
        raise ValueError(f"goodnight-2h logical overlay has unexpected size {goodnight.size}")
    for direction_index, direction in enumerate(DIRECTIONS):
        source_cell = goodnight.crop((
            direction_index * CELL_W,
            0,
            (direction_index + 1) * CELL_W,
            CELL_H,
        ))
        cell = hard_quantize(source_cell)
        target_y = item_rows["goodnight-2h"]["row"] * CELL_H
        atlas.alpha_composite(cell, (direction_index * CELL_W, target_y))
        visible = [pixel for pixel in cell.getdata() if pixel[3]]
        cells[f"goodnight-2h:shadow:{direction}"] = {
            "visiblePixels": len(visible),
            "colors": len({pixel[:3] for pixel in visible}),
        }

    slow_watch = Image.open(SLOW_WATCH_OVERLAY).convert("RGBA")
    if slow_watch.size != (CELL_W * len(DIRECTIONS), CELL_H * len(SLOW_WATCH_PHASES)):
        raise ValueError(f"slow-watch logical overlay has unexpected size {slow_watch.size}")
    for phase_index, phase in enumerate(SLOW_WATCH_PHASES):
        for direction_index, direction in enumerate(DIRECTIONS):
            source_cell = slow_watch.crop((
                direction_index * CELL_W,
                phase_index * CELL_H,
                (direction_index + 1) * CELL_W,
                (phase_index + 1) * CELL_H,
            ))
            cell = hard_quantize(source_cell)
            target_y = (item_rows["slow-watch"]["row"] + phase_index) * CELL_H
            atlas.alpha_composite(cell, (direction_index * CELL_W, target_y))
            visible = [pixel for pixel in cell.getdata() if pixel[3]]
            cells[f"slow-watch:{phase}:{direction}"] = {
                "visiblePixels": len(visible),
                "colors": len({pixel[:3] for pixel in visible}),
            }

    broken_spine = Image.open(BROKEN_SPINE_OVERLAY).convert("RGBA")
    if broken_spine.size != (CELL_W * len(DIRECTIONS), CELL_H * len(BROKEN_SPINE_PHASES)):
        raise ValueError(f"broken-spine logical overlay has unexpected size {broken_spine.size}")
    for phase_index, phase in enumerate(BROKEN_SPINE_PHASES):
        for direction_index, direction in enumerate(DIRECTIONS):
            source_cell = broken_spine.crop((
                direction_index * CELL_W,
                phase_index * CELL_H,
                (direction_index + 1) * CELL_W,
                (phase_index + 1) * CELL_H,
            ))
            cell = source_cell if source_cell.getchannel("A").getbbox() is None else hard_quantize(source_cell)
            target_y = (item_rows["broken-spine"]["row"] + phase_index) * CELL_H
            atlas.alpha_composite(cell, (direction_index * CELL_W, target_y))
            visible = [pixel for pixel in cell.getdata() if pixel[3]]
            cells[f"broken-spine:{phase}:{direction}"] = {
                "visiblePixels": len(visible),
                "colors": len({pixel[:3] for pixel in visible}),
            }

    for phase_index, (phase, overlay_path) in enumerate((
        ("safe", MOMO_SAFE_OVERLAY),
        ("threatened", MOMO_THREATENED_OVERLAY),
    )):
        overlay = Image.open(overlay_path).convert("RGBA")
        if overlay.size != (CELL_W * len(DIRECTIONS), CELL_H):
            raise ValueError(f"momo-avatar {phase} overlay has unexpected size {overlay.size}")
        for direction_index, direction in enumerate(DIRECTIONS):
            source_cell = overlay.crop((
                direction_index * CELL_W,
                0,
                (direction_index + 1) * CELL_W,
                CELL_H,
            ))
            cell = source_cell
            target_y = (item_rows["momo-avatar"]["row"] + phase_index) * CELL_H
            atlas.alpha_composite(cell, (direction_index * CELL_W, target_y))
            visible = [pixel for pixel in cell.getdata() if pixel[3]]
            cells[f"momo-avatar:{phase}:{direction}"] = {
                "visiblePixels": len(visible),
                "colors": len({pixel[:3] for pixel in visible}),
            }

    eye_exercise = Image.open(EYE_EXERCISE_OVERLAY).convert("RGBA")
    if eye_exercise.size != (
        CELL_W * len(DIRECTIONS),
        CELL_H * len(EYE_EXERCISE_PHASES),
    ):
        raise ValueError(f"eye-exercise logical overlay has unexpected size {eye_exercise.size}")
    for phase_index, phase in enumerate(EYE_EXERCISE_PHASES):
        for direction_index, direction in enumerate(DIRECTIONS):
            source_cell = eye_exercise.crop((
                direction_index * CELL_W,
                phase_index * CELL_H,
                (direction_index + 1) * CELL_W,
                (phase_index + 1) * CELL_H,
            ))
            if source_cell.getchannel("A").getbbox() is None:
                raise ValueError(f"eye-exercise {phase}/{direction} overlay is empty")
            target_y = (item_rows["eye-exercise"]["row"] + phase_index) * CELL_H
            atlas.alpha_composite(source_cell, (direction_index * CELL_W, target_y))
            visible = [pixel for pixel in source_cell.getdata() if pixel[3]]
            cells[f"eye-exercise:{phase}:{direction}"] = {
                "visiblePixels": len(visible),
                "colors": len({pixel[:3] for pixel in visible}),
            }

    server_standby = Image.open(SERVER_SHUTDOWN_STANDBY_OVERLAY).convert("RGBA")
    if server_standby.size != (CELL_W * len(DIRECTIONS), CELL_H):
        raise ValueError(f"server-shutdown standby overlay has unexpected size {server_standby.size}")
    server_trigger = Image.open(SERVER_SHUTDOWN_TRIGGER_OVERLAY).convert("RGBA")
    if server_trigger.size != (CELL_W * len(DIRECTIONS), CELL_H * 4):
        raise ValueError(f"server-shutdown trigger overlay has unexpected size {server_trigger.size}")
    for phase_index, phase in enumerate(SERVER_SHUTDOWN_PHASES):
        source = server_standby if phase == "standby" else server_trigger
        source_row = 0 if phase == "standby" else phase_index - 1
        for direction_index, direction in enumerate(DIRECTIONS):
            source_cell = source.crop((
                direction_index * CELL_W,
                source_row * CELL_H,
                (direction_index + 1) * CELL_W,
                (source_row + 1) * CELL_H,
            ))
            if source_cell.getchannel("A").getbbox() is None:
                raise ValueError(f"server-shutdown {phase}/{direction} overlay is empty")
            target_y = (item_rows["server-shutdown"]["row"] + phase_index) * CELL_H
            atlas.alpha_composite(source_cell, (direction_index * CELL_W, target_y))
            visible = [pixel for pixel in source_cell.getdata() if pixel[3]]
            cells[f"server-shutdown:{phase}:{direction}"] = {
                "visiblePixels": len(visible),
                "colors": len({pixel[:3] for pixel in visible}),
            }

    array = np.asarray(atlas)
    transparent = array[..., 3] == 0
    if np.any(array[..., :3][transparent]):
        raise ValueError("state overlay atlas contains non-zero transparent RGB")
    red, green, blue, alpha = [array[..., index].astype(np.int16) for index in range(4)]
    spill = (
        (alpha > 0)
        & (green > 150)
        & (green - np.maximum(red, blue) > 35)
    )
    if spill.any():
        raise ValueError(f"state overlay atlas contains {int(spill.sum())} green-spill pixels")

    ATLAS.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS, optimize=True)
    MANIFEST.write_text(
        json.dumps({
            "version": 2,
            "model": "gpt-image-2",
            "route": "DMIT sub2 owner pool",
            "cell": {"width": CELL_W, "height": CELL_H},
            "directions": list(DIRECTIONS),
            "rowCount": row_count,
            "items": item_rows,
            "sources": {
                "third-pill": {
                    "source": str(THIRD_PILL_SOURCE),
                    "sourceSha256": sha256(THIRD_PILL_SOURCE),
                    "prompt": str(THIRD_PILL_PROMPT),
                    "promptSha256": sha256(THIRD_PILL_PROMPT),
                    "selection": str(THIRD_PILL_SELECTION),
                    "selectionSha256": sha256(THIRD_PILL_SELECTION),
                },
                "auto-renew": {
                    "source": str(AUTO_RENEW_RAW_SOURCE),
                    "sourceSha256": sha256(AUTO_RENEW_RAW_SOURCE),
                    "logicalSource": str(AUTO_RENEW_SOURCE),
                    "logicalSourceSha256": sha256(AUTO_RENEW_SOURCE),
                    "prompt": str(AUTO_RENEW_PROMPT),
                    "promptSha256": sha256(AUTO_RENEW_PROMPT),
                    "selection": str(AUTO_RENEW_SELECTION),
                    "selectionSha256": sha256(AUTO_RENEW_SELECTION),
                },
                "shop-freezer": {
                    "source": str(SHOP_FREEZER_RAW_SOURCE),
                    "sourceSha256": sha256(SHOP_FREEZER_RAW_SOURCE),
                    "logicalSource": str(SHOP_FREEZER_OVERLAY),
                    "logicalSourceSha256": sha256(SHOP_FREEZER_OVERLAY),
                    "selection": str(SHOP_FREEZER_SELECTION),
                    "selectionSha256": sha256(SHOP_FREEZER_SELECTION),
                },
                "pregnancy-test": {
                    "source": str(PREGNANCY_TEST_RAW_SOURCE),
                    "sourceSha256": sha256(PREGNANCY_TEST_RAW_SOURCE),
                    "propSource": str(PREGNANCY_TEST_PROP_OVERLAY),
                    "propSourceSha256": sha256(PREGNANCY_TEST_PROP_OVERLAY),
                    "shadowSource": str(PREGNANCY_TEST_SHADOW_OVERLAY),
                    "shadowSourceSha256": sha256(PREGNANCY_TEST_SHADOW_OVERLAY),
                    "selection": str(PREGNANCY_TEST_SELECTION),
                    "selectionSha256": sha256(PREGNANCY_TEST_SELECTION),
                },
                "cracked-glasses": {
                    "source": str(CRACKED_GLASSES_RAW_SOURCE),
                    "sourceSha256": sha256(CRACKED_GLASSES_RAW_SOURCE),
                    "logicalSource": str(CRACKED_GLASSES_OVERLAY),
                    "logicalSourceSha256": sha256(CRACKED_GLASSES_OVERLAY),
                    "prompt": str(CRACKED_GLASSES_PROMPT),
                    "promptSha256": sha256(CRACKED_GLASSES_PROMPT),
                    "selection": str(CRACKED_GLASSES_SELECTION),
                    "selectionSha256": sha256(CRACKED_GLASSES_SELECTION),
                },
                "divorce-draft": {
                    "source": str(DIVORCE_DRAFT_RAW_SOURCE),
                    "sourceSha256": sha256(DIVORCE_DRAFT_RAW_SOURCE),
                    "logicalSource": str(DIVORCE_DRAFT_OVERLAY),
                    "logicalSourceSha256": sha256(DIVORCE_DRAFT_OVERLAY),
                    "prompt": str(DIVORCE_DRAFT_PROMPT),
                    "promptSha256": sha256(DIVORCE_DRAFT_PROMPT),
                    "selection": str(DIVORCE_DRAFT_SELECTION),
                    "selectionSha256": sha256(DIVORCE_DRAFT_SELECTION),
                },
                "goodnight-2h": {
                    "source": str(GOODNIGHT_RAW_SOURCE),
                    "sourceSha256": sha256(GOODNIGHT_RAW_SOURCE),
                    "logicalSource": str(GOODNIGHT_OVERLAY),
                    "logicalSourceSha256": sha256(GOODNIGHT_OVERLAY),
                    "selection": str(GOODNIGHT_SELECTION),
                    "selectionSha256": sha256(GOODNIGHT_SELECTION),
                },
                "slow-watch": {
                    "source": str(SLOW_WATCH_RAW_SOURCE),
                    "sourceSha256": sha256(SLOW_WATCH_RAW_SOURCE),
                    "logicalSource": str(SLOW_WATCH_OVERLAY),
                    "logicalSourceSha256": sha256(SLOW_WATCH_OVERLAY),
                    "prompt": str(SLOW_WATCH_PROMPT),
                    "promptSha256": sha256(SLOW_WATCH_PROMPT),
                    "selection": str(SLOW_WATCH_SELECTION),
                    "selectionSha256": sha256(SLOW_WATCH_SELECTION),
                },
                "broken-spine": {
                    "source": str(BROKEN_SPINE_RAW_SOURCE),
                    "sourceSha256": sha256(BROKEN_SPINE_RAW_SOURCE),
                    "logicalSource": str(BROKEN_SPINE_OVERLAY),
                    "logicalSourceSha256": sha256(BROKEN_SPINE_OVERLAY),
                    "prompt": str(BROKEN_SPINE_PROMPT),
                    "promptSha256": sha256(BROKEN_SPINE_PROMPT),
                    "selection": str(BROKEN_SPINE_SELECTION),
                    "selectionSha256": sha256(BROKEN_SPINE_SELECTION),
                },
                "momo-avatar": {
                    "source": str(MOMO_RAW_SOURCE),
                    "sourceSha256": sha256(MOMO_RAW_SOURCE),
                    "safeSource": str(MOMO_SAFE_OVERLAY),
                    "safeSourceSha256": sha256(MOMO_SAFE_OVERLAY),
                    "threatenedSource": str(MOMO_THREATENED_OVERLAY),
                    "threatenedSourceSha256": sha256(MOMO_THREATENED_OVERLAY),
                    "selection": str(MOMO_SELECTION),
                    "selectionSha256": sha256(MOMO_SELECTION),
                },
                "eye-exercise": {
                    "source": str(EYE_EXERCISE_RAW_SOURCE),
                    "sourceSha256": sha256(EYE_EXERCISE_RAW_SOURCE),
                    "logicalSource": str(EYE_EXERCISE_OVERLAY),
                    "logicalSourceSha256": sha256(EYE_EXERCISE_OVERLAY),
                    "prompt": str(EYE_EXERCISE_PROMPT),
                    "promptSha256": sha256(EYE_EXERCISE_PROMPT),
                    "selection": str(EYE_EXERCISE_SELECTION),
                    "selectionSha256": sha256(EYE_EXERCISE_SELECTION),
                },
                "server-shutdown": {
                    "source": str(SERVER_SHUTDOWN_RAW_SOURCE),
                    "sourceSha256": sha256(SERVER_SHUTDOWN_RAW_SOURCE),
                    "standbySource": str(SERVER_SHUTDOWN_STANDBY_OVERLAY),
                    "standbySourceSha256": sha256(SERVER_SHUTDOWN_STANDBY_OVERLAY),
                    "triggerSource": str(SERVER_SHUTDOWN_TRIGGER_OVERLAY),
                    "triggerSourceSha256": sha256(SERVER_SHUTDOWN_TRIGGER_OVERLAY),
                    "prompt": str(SERVER_SHUTDOWN_PROMPT),
                    "promptSha256": sha256(SERVER_SHUTDOWN_PROMPT),
                    "selection": str(SERVER_SHUTDOWN_SELECTION),
                    "selectionSha256": sha256(SERVER_SHUTDOWN_SELECTION),
                },
            },
            "atlas": str(ATLAS),
            "atlasSha256": sha256(ATLAS),
            "cells": cells,
        }, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"atlas": str(ATLAS), "rows": row_count, "cells": len(cells)}, indent=2))


if __name__ == "__main__":
    main()
