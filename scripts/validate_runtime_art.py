#!/usr/bin/env python3
"""Fail packaging when a runtime art atlas is malformed or a generated manifest is stale."""

from __future__ import annotations

import json
import hashlib
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


def sha256(relative: str) -> str:
    digest = hashlib.sha256()
    with (ROOT / relative).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    if len(relic_ids) != 77 or len(set(relic_ids)) != len(relic_ids):
        fail(f"unexpected relic declarations: total={len(relic_ids)} unique={len(set(relic_ids))}")
    if set(indexes) != set(relic_ids):
        missing = sorted(set(relic_ids) - set(indexes))
        extra = sorted(set(indexes) - set(relic_ids))
        fail(f"item icon coverage mismatch: missing={missing} extra={extra}")
    mapped = sorted(int(value) for value in indexes.values())
    if mapped != list(range(len(indexes))):
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
    motion_frames = {"idle": 2, "walk": 4, "attack": 4, "hurt": 2}
    for family in ("hero", "raincoat", "uniform", "hair-mask"):
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


def validate_hero_renderer() -> None:
    source = (ROOT / "src/hero-pixel.ts").read_text(encoding="utf-8")
    forbidden = ("getOutlineFrame(", "outlineCache", "#d8cbb5", "主角像素轮廓画布")
    leaked = [token for token in forbidden if token in source]
    if leaked:
        fail(f"hero must not add a light outer outline at runtime: {leaked}")

    typing_required = (
        "typingIndicatorDots?: 0 | 1 | 2 | 3;",
        "const typingDots = state.typingIndicatorDots ?? 0;",
        "if (typingDots > 0)",
    )
    missing = [token for token in typing_required if token not in source]
    if missing:
        fail(f"typing indicator must render timed periods directly above the hero: {missing}")

    slots = (ROOT / "src/hero-item-slots.ts").read_text(encoding="utf-8")
    if "'typing-indicator': { kind: 'effect', lane: 'transient' }" not in slots:
        fail("typing indicator must remain a transient head effect, not persistent equipment")
    equipment_renderer = (ROOT / "src/hero-item-pixel.ts").read_text(encoding="utf-8")
    if "typing-indicator" in equipment_renderer:
        fail("typing indicator must not restore the old phone equipment rendering")

    runtime_art = read_json("src/assets/items/runtime-art-consumers.json")
    typing_record = next(
        (record for record in runtime_art.get("items", []) if record.get("id") == "typing-indicator"),
        None,
    )
    if not typing_record or typing_record.get("persistentHero") is not False:
        fail("typing indicator runtime-art record must be non-persistent")
    if typing_record.get("heroConsumer") != "image2-projectile-trigger-preview":
        fail("typing indicator runtime-art record must use the attack-trigger preview channel")


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
    for relative, frame in (
        ("src/assets/enemies/closet-dark-hd.png", 48),
        ("src/assets/enemies/uniform-answer-hd.png", 48),
        ("src/assets/enemies/last-bus-hd.png", 64),
        ("src/assets/enemies/silent-father-hd.png", 64),
        ("src/assets/enemies/silent-father-p2-hd.png", 64),
        ("src/assets/enemies/debt-collector-hd.png", 48),
        ("src/assets/enemies/lamp-keeper-hd.png", 64),
    ):
        validate_character_atlas(
            relative,
            frame_size=(frame, frame),
            frame_counts=[2, 4, 2, 2, 4],
        )


def validate_new_enemy_roster() -> None:
    plan = read_json("scripts/image2/enemy-roster-v1/integration-plan.json")
    review = read_json("output/art-audit-loop/new-enemy-roster-v1/manifest.json")
    if plan.get("status") != "approved-and-promoted" or plan.get("promotionAllowed") is not True:
        fail("new enemy integration plan must record approved promotion")
    entries = plan.get("entries", [])
    review_entries = {entry.get("id"): entry for entry in review.get("entries", [])}
    if len(entries) != 20 or len(review_entries) != 20:
        fail(f"new enemy roster must contain 20 stage assets: plan={len(entries)} review={len(review_entries)}")

    renderer = (ROOT / "src/enemy-pixel.ts").read_text(encoding="utf-8")
    for entry in entries:
        asset = entry["assetId"]
        frame = int(entry["frame"])
        display = int(entry["display"])
        runtime = entry["runtimePath"]
        candidate = review_entries.get(asset)
        if candidate is None:
            fail(f"new enemy review entry missing: {asset}")
        validate_character_atlas(runtime, frame_size=(frame, frame), frame_counts=[2, 4, 2, 2, 4])
        validate_transparent_rgb(runtime)
        atlas = image(runtime).convert("RGBA")
        if set(atlas.getchannel("A").getdata()) - {0, 255}:
            fail(f"new enemy atlas has partial alpha: {runtime}")
        if sha256(runtime) != candidate.get("atlasSha256"):
            fail(f"promoted enemy atlas differs from approved candidate: {asset}")
        url_token = f"'{asset}': new URL('./assets/enemies/{asset}.png'"
        if url_token not in renderer:
            fail(f"new enemy runtime URL missing: {asset}")
        if f"'{asset}': {display}" not in renderer:
            fail(f"new enemy display size missing: {asset} -> {display}")

    direct_routes = {
        entry["runtimeType"]: entry["assetId"]
        for entry in entries if entry.get("phase") is None
    }
    for runtime_type, asset in direct_routes.items():
        if f"'{runtime_type}': '{asset}'" not in renderer:
            fail(f"new enemy identity route missing: {runtime_type} -> {asset}")
    required_phase_routes = (
        "enemy.type === 'praise-chair') return (enemy.phase ?? 1) === 2 ? 'praise-chair-p2' : 'praise-chair-p1'",
        "enemy.type === 'ringing-phone') return (enemy.phase ?? 1) === 2 ? 'ringing-phone-p2' : 'ringing-phone-p1'",
    )
    missing_phase_routes = [token for token in required_phase_routes if token not in renderer]
    if missing_phase_routes:
        fail(f"new enemy boss phase routing missing: {missing_phase_routes}")

    forbidden_proxies = (
        "'coat-rack': 'closet-clothes'", "'others-paper': 'wall-ranking'",
        "'wet-shoes': 'empty-chair'", "'revolving-lantern': 'lamp-keeper'",
        "'praise-chair': 'window-desk'", "'ringing-phone': 'missed-call'",
        "'sign-here': 'red-mark'", "'id-scanner': 'clockwork'",
        "'task-simple': 'whisper'", "'task-revise': 'whisper'",
        "'task-deadline': 'whisper'", "'task-sync': 'whisper'",
        "'desk-lamp': 'empty-chair'", "'reheated-pot': 'father-silence'",
        "'meeting-door': 'debt-collector'", "'checkup-report': 'red-mark'",
        "'queue-screen': 'clockwork'", "'others-family': 'forgetter'",
        "PLACEHOLDER_ENEMY_TYPES",
    )
    leaked = [token for token in forbidden_proxies if token in renderer]
    if leaked:
        fail(f"new enemy proxy or placeholder mapping leaked back into runtime: {leaked}")


def validate_stage_elites() -> None:
    asset_library = (
        "closet-clothes", "wall-ranking", "window-desk",
        "father-silence", "whose-box", "iv-stand",
    )
    manifest = read_json("output/imagegen/zhe-yi-shen-stage-elites-v1/manifest.json")
    source = manifest.get("source")
    source_manifest = manifest.get("sourceManifest")
    if not isinstance(source, str) or not (ROOT / source).is_file():
        fail(f"missing stage-elite Image2 prop source: {source}")
    if not isinstance(source_manifest, str) or not (ROOT / source_manifest).is_file():
        fail(f"missing stage-elite source manifest: {source_manifest}")
    if manifest.get("sourceSha256") != sha256(source):
        fail("stale stage-elite Image2 source hash")
    entries = manifest.get("entries", [])
    if [entry.get("id") for entry in entries] != list(asset_library):
        fail("stage-elite Image2 library must retain the six processed life-object atlases")
    if manifest.get("motions") != ["idle", "move", "attack", "hurt", "death"]:
        fail("stage-elite motion contract changed")
    for entry in entries:
        elite_id = entry["id"]
        runtime = entry.get("runtime")
        expected_runtime = f"src/assets/enemies/{elite_id}.png"
        if runtime != expected_runtime:
            fail(f"wrong stage-elite runtime path {elite_id}: {runtime}")
        if entry.get("frame") != [48, 48] or entry.get("size") != [192, 240]:
            fail(f"wrong stage-elite frame contract {elite_id}")
        validate_character_atlas(runtime, frame_size=(48, 48), frame_counts=[2, 4, 2, 2, 4])
        validate_transparent_rgb(runtime)
        if entry.get("sha256") != sha256(runtime):
            fail(f"stale stage-elite runtime hash {elite_id}")

    game_source = (ROOT / "src/game.ts").read_text(encoding="utf-8")
    life_stage = (ROOT / "src/life-stage.ts").read_text(encoding="utf-8")
    renderer = (ROOT / "src/enemy-pixel.ts").read_text(encoding="utf-8")
    stage_contract = (
        ("coat-rack", "coat-rack"),
        ("uniform-answer", "uniform-answer-hd"),
        ("last-bus", "last-bus-hd"),
        ("wet-shoes", "wet-shoes"),
        ("whose-box", "whose-box"),
        ("revolving-lantern", "revolving-lantern"),
    )
    for elite_id, asset_id in stage_contract:
        if f"eliteType: '{elite_id}'" not in game_source or f"eliteType: '{elite_id}'" not in life_stage:
            fail(f"current stage-elite chapter contract missing: {elite_id}")
        if f"'{elite_id}': '{asset_id}'" not in renderer:
            fail(f"current stage-elite art mapping missing: {elite_id} -> {asset_id}")
        if f"'{elite_id}': {{ name:" not in game_source:
            fail(f"current stage-elite stat spec missing: {elite_id}")
    if "&& !majorThreatAlive" not in game_source or "!minorEliteAlive && !this.eliteSpawned" not in game_source:
        fail("stage-elite encounter pacing must pause waves and gate the chapter boss")


def validate_boss_art_hierarchy() -> None:
    expected = {
        "closet-dark-hd": (48, 96),
        "uniform-answer-hd": (48, 96),
        "last-bus-hd": (64, 128),
        "silent-father-hd": (64, 128),
        "silent-father-p2-hd": (64, 96),
        "debt-collector-hd": (48, 96),
        "lamp-keeper-hd": (64, 128),
    }
    manifest = read_json("output/imagegen/zhe-yi-shen-boss-hd-v1/manifest.json")
    assets = manifest.get("assets", {})
    if set(assets) != set(expected):
        fail(f"boss HD manifest mismatch: expected={sorted(expected)} actual={sorted(assets)}")
    for asset, (frame, display) in expected.items():
        entry = assets[asset]
        if entry.get("frame") != [frame, frame] or entry.get("display") != [display, display]:
            fail(f"wrong boss hierarchy spec {asset}: frame={entry.get('frame')} display={entry.get('display')}")
        for key in ("source", "runtime"):
            relative = entry.get(key)
            if not isinstance(relative, str) or not (ROOT / relative).is_file():
                fail(f"missing boss {key} for {asset}: {relative}")

    father_p2 = require_size("src/assets/enemies/silent-father-p2-hd.png", (256, 320)).convert("RGBA")
    father_p2_skills = require_size(
        "src/assets/enemies/boss-skills-v1/silent-father-p2-skills.png", (256, 192),
    ).convert("RGBA")
    base_idle = father_p2.crop((0, 0, 64, 64))
    skill_idle = father_p2_skills.crop((0, 0, 64, 64))
    if base_idle.tobytes() != skill_idle.tobytes():
        fail("silent father phase two base and skill atlases no longer depict the same revealed boy")
    father_p2_entry = assets["silent-father-p2-hd"]
    if father_p2_entry.get("source") != "src/assets/enemies/boss-skills-v1/silent-father-p2-skills.png":
        fail("silent father phase two base has regressed to the retired hooded-adult source")

    life_stage = (ROOT / "src/life-stage.ts").read_text(encoding="utf-8")
    bosses = set(re.findall(r"\bbossType:\s*'([^']+)'", life_stage))
    canonical_bosses = {"closet-dark", "silent-father", "praise-chair", "ringing-phone", "debt-collector", "lamp-keeper"}
    if bosses != canonical_bosses:
        fail(f"unexpected chapter boss roster: {sorted(bosses)}")

    renderer = (ROOT / "src/enemy-pixel.ts").read_text(encoding="utf-8")
    required_tokens = (
        "'uniform-answer': 'uniform-answer-hd'",
        "'last-bus': 'last-bus-hd'",
        "'missed-bus': 'last-bus'",
        "'praise-chair': 'praise-chair-p1'",
        "'ringing-phone': 'ringing-phone-p1'",
        "enemy.type === 'praise-chair') return (enemy.phase ?? 1) === 2 ? 'praise-chair-p2' : 'praise-chair-p1'",
        "enemy.type === 'ringing-phone') return (enemy.phase ?? 1) === 2 ? 'ringing-phone-p2' : 'ringing-phone-p1'",
        "enemy.type === 'red-mark' && enemy.elite) return 'uniform-answer'",
    )
    missing = [token for token in required_tokens if token not in renderer]
    if missing:
        fail(f"boss/minion art hierarchy wiring regressed: {missing}")


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


def validate_stage_backgrounds() -> None:
    relative = "output/imagegen/zhe-yi-shen-stage-clutter-floors-v1/manifest.json"
    manifest = read_json(relative)
    stages = manifest.get("stages", [])
    if len(stages) != 6 or [entry.get("stage") for entry in stages] != list(range(6)):
        fail("stage background manifest must contain ordered stages 0..5")
    source_hashes = set()
    runtime_hashes = set()
    for index, entry in enumerate(stages):
        source = entry.get("source")
        prompt = entry.get("prompt")
        runtime = entry.get("runtime")
        for key, value in (("source", source), ("prompt", prompt), ("runtime", runtime)):
            if not isinstance(value, str) or not (ROOT / value).is_file():
                fail(f"missing stage {index} background {key}: {value}")
        expected_runtime = f"src/assets/world/stage-floor-{index}.png"
        if runtime != expected_runtime:
            fail(f"wrong stage {index} runtime path: {runtime}")
        require_size(runtime, (360, 640))
        source_hash = sha256(source)
        runtime_hash = sha256(runtime)
        if entry.get("sourceSha256") != source_hash or entry.get("runtimeSha256") != runtime_hash:
            fail(f"stale stage {index} background hashes")
        source_hashes.add(source_hash)
        runtime_hashes.add(runtime_hash)
    if len(source_hashes) != 6 or len(runtime_hashes) != 6:
        fail("six chapter backgrounds must be genuinely distinct files")
    if (ROOT / "src/assets/world/life-clutter-floor.png").exists():
        fail("rejected single all-life background must not return to runtime assets")


def validate_title_cover() -> None:
    relative = "output/imagegen/zhe-yi-shen-title-cover-v1/manifest.json"
    manifest = read_json(relative)
    for key in ("source", "prompt", "runtime"):
        value = manifest.get(key)
        if not isinstance(value, str) or not (ROOT / value).is_file():
            fail(f"missing title cover {key}: {value}")
    if manifest.get("runtime") != "src/assets/ui/title-life-clutter.png":
        fail("title cover must stay isolated from the six chapter backgrounds")
    require_size(manifest["runtime"], (360, 640))
    if manifest.get("sourceSha256") != sha256(manifest["source"]):
        fail("stale title cover source hash")
    if manifest.get("runtimeSha256") != sha256(manifest["runtime"]):
        fail("stale title cover runtime hash")


def validate_stamp_buttons() -> None:
    relative = "output/imagegen/zhe-yi-shen-red-stamp-buttons-v1/manifest.json"
    manifest = read_json(relative)
    for key in ("source", "prompt", "runtime"):
        value = manifest.get(key)
        if not isinstance(value, str) or not (ROOT / value).is_file():
            fail(f"missing red-stamp button {key}: {value}")
    if manifest.get("frameSize") != [384, 120]:
        fail(f"red-stamp buttons must retain clear high-resolution frames: {manifest.get('frameSize')}")
    if manifest.get("states") != ["normal", "hover", "pressed", "disabled"]:
        fail("red-stamp button state contract changed")
    runtime = manifest["runtime"]
    atlas = require_size(runtime, (384, 480)).convert("RGBA")
    for row, state in enumerate(manifest["states"]):
        frame = atlas.crop((0, row * 120, 384, (row + 1) * 120))
        if frame.getchannel("A").getbbox() is None:
            fail(f"empty red-stamp button state: {state}")
    if manifest.get("sourceSha256") != sha256(manifest["source"]):
        fail("stale red-stamp source hash")
    if manifest.get("runtimeSha256") != sha256(runtime):
        fail("stale red-stamp runtime hash")


def validate_archive_ui() -> None:
    game_source = (ROOT / "src/game.ts").read_text(encoding="utf-8")
    theme_source = (ROOT / "src/ui-theme.ts").read_text(encoding="utf-8")
    texture_source = (ROOT / "src/ui-textures.ts").read_text(encoding="utf-8")
    start = game_source.find("private drawBreathActionButton(")
    end = game_source.find("private renderTitleLifePath(", start)
    button_source = game_source[start:end] if start >= 0 and end > start else ""
    if not button_source or "drawStampButtonFrame" not in button_source:
        fail("command buttons must consume the Image2 red-stamp atlas")
    if "ctx.fillRect(rect.x, rect.y, rect.width, rect.height)" in button_source:
        fail("red-stamp command buttons must keep transparent interiors")
    if "button-stamp-states.png" not in texture_source or "imageSmoothingEnabled = true" not in texture_source:
        fail("clear high-resolution red-stamp renderer is not wired")
    if "Fusion Pixel" in theme_source or "Ark Pixel" in theme_source:
        fail("archive UI text must use clear CJK fonts rather than coarse pixel fonts")
    for token in ('"PingFang SC"', '"Songti SC"'):
        if token not in theme_source:
            fail(f"missing clear parchment UI font: {token}")


def validate_battlefield_background() -> None:
    game_source = (ROOT / "src/game.ts").read_text(encoding="utf-8")
    forbidden = (
        "renderGroundDecals(",
        "renderProps(",
        "renderVignette(",
        "ctx.fillRect(18, 456, 324, 2)",
        "ctx.fillRect(18, 468, 324, 1)",
        "const sweep = ((t * 42",
        "createPattern(",
        "lifeClutterFloor",
    )
    leaked = [token for token in forbidden if token in game_source]
    if leaked:
        fail(f"world-grid battlefield decorations must stay removed: {leaked}")
    required = (
        "this.renderStageClutterFloor(next, blend);",
        "stageClutterFloors.frame(this.encounterIndex)",
        "stageClutterFloors.frame(this.encounterIndex + 1)",
        "ctx.globalAlpha = 1 - transition",
        "ctx.globalAlpha = transition",
        "this.renderLifePropClusters(stage, next, blend);",
        "private drawEmergingLifeProp(",
    )
    missing = [token for token in required if token not in game_source]
    if missing:
        fail(f"six-stage background or prop-growth wiring regressed: {missing}")


def main() -> None:
    validate_battlefield_background()
    validate_stage_backgrounds()
    validate_title_cover()
    validate_stamp_buttons()
    validate_archive_ui()
    validate_grid("src/assets/items/icons.png", "src/assets/items/icons.json", allow_unmapped_empty=True)
    validate_item_coverage()
    validate_hero()
    validate_hero_renderer()
    validate_enemies()
    validate_new_enemy_roster()
    validate_stage_elites()
    validate_boss_art_hierarchy()
    for family in ("projectiles", "hits", "saves", "synergy", "status"):
        validate_grid(f"src/assets/vfx/{family}.png", f"src/assets/vfx/{family}.json")
    for family in ("archive-deco", "poison", "joystick", "fate-profiles"):
        validate_grid(f"src/assets/ui/{family}.png", f"src/assets/ui/{family}.json")
    validate_combo()

    # title-life-night 与 ground-0..5 是旧夜间时代资产，2026-07-26 归档至
    # output/imagegen/legacy-night-era/（与「非夜间」正典冲突且未被运行时引用）
    fixed_sizes = {
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
        "src/assets/ui/button-stamp-states.png": (384, 480),
        "src/assets/ui/title-life-clutter.png": (360, 640),
        "src/assets/ui/chapter-strips.png": (96, 312),
        "src/assets/world/props.png": (160, 264),
        "src/assets/world/entities.png": (256, 72),
        "src/assets/rooms/lamp.png": (360, 640),
        "src/assets/rooms/inner.png": (360, 640),
        "src/assets/rooms/pawn.png": (360, 640),
        "src/assets/ui/ending-table.png": (360, 640),
        "src/assets/ui/ending-lampman.png": (360, 640),
        **{f"src/assets/world/stage-floor-{index}.png": (360, 640) for index in range(6)},
    }
    for relative, expected in fixed_sizes.items():
        require_size(relative, expected)

    transparent_assets = [
        "src/assets/ui/corner-ornament.png", "src/assets/ui/seal-ornament.png",
        "src/assets/ui/record-frames.png", "src/assets/ui/panel-frame.png",
        "src/assets/ui/button-frame.png", "src/assets/ui/torn-edge.png",
        "src/assets/ui/button-stamp-states.png",
        "src/assets/ui/receipt-edge.png", "src/assets/ui/archive-deco.png",
        "src/assets/ui/poison.png", "src/assets/ui/joystick.png",
        "src/assets/vfx/projectiles.png", "src/assets/vfx/projectile-anim.png", "src/assets/vfx/hits.png",
        "src/assets/vfx/saves.png", "src/assets/vfx/synergy.png", "src/assets/vfx/status.png",
    ]
    for relative in transparent_assets:
        validate_transparent_rgb(relative)

    for relative in (
        "src/assets/ui/paper-texture.png", "src/assets/ui/night-texture.png",
        "src/assets/ui/desk-texture.png", "src/assets/ui/static-texture.png",
    ):
        validate_seam(relative)

    validate_generation_manifests()
    print("runtime art: valid")


if __name__ == "__main__":
    main()
