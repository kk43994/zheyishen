#!/usr/bin/env python3
"""Validate complete one-source-per-item Image2 coverage and runtime publication."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

from process_item_icon_image2_v2 import SELECTIONS_PATH as ICON_SELECTIONS_PATH, process_icon


CONTRACT_PATH = Path("src/assets/items/equipment-art.json")
PROMPT_MANIFEST_PATH = Path("scripts/image2/items-v1/manifest.json")
AUDIT_PATH = Path("scripts/image2/items-v1/audit.json")
SPRITE_MANIFEST_PATH = Path("src/assets/items/equipment-sprites.json")
SPRITE_ATLAS_PATH = Path("src/assets/items/equipment-sprites.png")
PALETTE_MANIFEST_PATH = Path("src/assets/items/source-palettes.json")
CONSUMER_MANIFEST_PATH = Path("src/assets/items/runtime-art-consumers.json")
ICON_MANIFEST_PATH = Path("src/assets/items/icons.json")
ICON_ATLAS_PATH = Path("src/assets/items/icons.png")
RAW_DIR = Path("output/imagegen/zhe-yi-shen-items-image2-v1/raw")
UNIFORM_SOURCE = Path(
    "output/imagegen/zhe-yi-shen-uniform-image2-v1/raw/small-uniform-anatomy-source.png"
)
PROFILE_MANIFEST_PATH = Path("output/imagegen/zhe-yi-shen-hero-style1-profiles/manifest.json")
STATE_OVERLAY_MANIFEST_PATH = Path("src/assets/items/state-overlays.json")
STATE_OVERLAY_ATLAS_PATH = Path("src/assets/items/state-overlays.png")
PART_MASK_DIR = Path("src/assets/hero-style1-profiles")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    prompt_manifest = json.loads(PROMPT_MANIFEST_PATH.read_text(encoding="utf-8"))
    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    sprite_manifest = json.loads(SPRITE_MANIFEST_PATH.read_text(encoding="utf-8"))
    palette_manifest = json.loads(PALETTE_MANIFEST_PATH.read_text(encoding="utf-8"))
    consumer_manifest = json.loads(CONSUMER_MANIFEST_PATH.read_text(encoding="utf-8"))
    icon_manifest = json.loads(ICON_MANIFEST_PATH.read_text(encoding="utf-8"))
    profile_manifest = json.loads(PROFILE_MANIFEST_PATH.read_text(encoding="utf-8"))
    state_overlay_manifest = json.loads(STATE_OVERLAY_MANIFEST_PATH.read_text(encoding="utf-8"))
    errors: list[str] = []

    items = contract.get("items", [])
    if contract.get("itemCount") != 77 or len(items) != 77:
        errors.append("equipment contract must contain 77 items")
    if prompt_manifest.get("itemCount") != 77 or len(prompt_manifest.get("items", [])) != 77:
        errors.append("Image2 prompt manifest must contain 77 items")
    if audit.get("reviewedThrough") != 76:
        errors.append("Image2 visual audit must review through item index 76")
    if audit.get("redo"):
        errors.append(f"Image2 visual audit still has redo items: {sorted(audit['redo'])}")

    runtime_records = {record["id"]: record for record in sprite_manifest.get("items", [])}
    source_palettes = palette_manifest.get("items", {})
    consumers = {record["id"]: record for record in consumer_manifest.get("items", [])}
    prompt_records = {record["id"]: record for record in prompt_manifest.get("items", [])}
    if len(runtime_records) != 77:
        errors.append(f"runtime source records must contain 77 items, got {len(runtime_records)}")
    if len(prompt_records) != 77:
        errors.append(f"prompt records must contain 77 items, got {len(prompt_records)}")
    if palette_manifest.get("itemCount") != 77 or len(source_palettes) != 77:
        errors.append(f"source palette records must contain 77 items, got {len(source_palettes)}")
    if consumer_manifest.get("itemCount") != 77 or len(consumers) != 77:
        errors.append(f"runtime consumers must contain 77 items, got {len(consumers)}")

    approved = 0
    for item in items:
        item_id = item["id"]
        index = int(item["index"])
        prompt_record = prompt_records.get(item_id)
        runtime_record = runtime_records.get(item_id)
        palette_record = source_palettes.get(item_id)
        consumer = consumers.get(item_id)
        if not prompt_record:
            errors.append(f"{item_id}: missing prompt record")
            continue
        prompt_path = Path("scripts/image2/items-v1") / prompt_record["prompt"]
        if not prompt_path.is_file():
            errors.append(f"{item_id}: missing prompt file {prompt_path}")
        else:
            prompt_text = prompt_path.read_text(encoding="utf-8").rstrip("\n")
            expected_prompt_sha = hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()
            if prompt_record.get("promptSha256") != expected_prompt_sha:
                errors.append(f"{item_id}: prompt hash is stale")
            canon_lines = (
                f"Canon appearance: {item['look']}",
                f"Canon hero manifestation: {item['hero']}",
                f"Canon irony/event: {item['irony']}",
                f"Runtime production channels: {', '.join(item.get('production', []))}",
            )
            for canon_line in canon_lines:
                if canon_line not in prompt_text:
                    errors.append(f"{item_id}: prompt omits canon field {canon_line!r}")
        expected_prompt_status = (
            "superseded-by-uniform-v1" if item_id == "small-uniform" else "source-approved"
        )
        if prompt_record.get("status") != expected_prompt_status:
            errors.append(
                f"{item_id}: prompt status is {prompt_record.get('status')!r}, "
                f"expected {expected_prompt_status!r}"
            )
        if not runtime_record:
            errors.append(f"{item_id}: missing runtime record")
            continue
        if not palette_record:
            errors.append(f"{item_id}: missing source-derived palette")
            continue
        if not consumer:
            errors.append(f"{item_id}: missing runtime art consumer")
            continue
        if "programmatic-only" in " ".join(consumer.get("consumers", [])):
            errors.append(f"{item_id}: programmatic-only consumer is forbidden")
        if not str(consumer.get("heroConsumer", "")).startswith("image2-"):
            errors.append(f"{item_id}: hero consumer is not source-backed")
        if consumer.get("sourceSha256") != palette_record.get("sourceSha256"):
            errors.append(f"{item_id}: consumer source hash does not match palette source")
        production = set(item.get("production", []))
        consumer_modes = set(consumer.get("consumers", []))
        required_by_production = {
            "projectile": "image2-projectile-atlas",
            "morph": "anatomy-part-morph",
            "decal": "anatomy-part-decal",
            "aura": "source-palette-aura",
            "event": "image2-event-composite",
        }
        for production_mode, consumer_mode in required_by_production.items():
            if production_mode in production and consumer_mode not in consumer_modes:
                errors.append(f"{item_id}: {production_mode} production lacks {consumer_mode}")
        for role in ("ink", "dark", "dominant", "accent", "light"):
            color = palette_record.get(role)
            if not isinstance(color, str) or len(color) != 7 or not color.startswith("#"):
                errors.append(f"{item_id}: invalid source palette color {role}={color!r}")

        if item_id == "small-uniform":
            if runtime_record.get("status") != "custom-fitted-uniform-v1":
                errors.append("small-uniform: missing custom fitted source status")
            if not UNIFORM_SOURCE.is_file():
                errors.append(f"small-uniform: missing source {UNIFORM_SOURCE}")
            else:
                if palette_record.get("sourceSha256") != sha256(UNIFORM_SOURCE):
                    errors.append("small-uniform: source-derived palette hash is stale")
                approved += 1
            continue

        source = RAW_DIR / f"{index + 1:02d}-{item_id}.png"
        if not source.is_file():
            errors.append(f"{item_id}: missing Image2 source {source}")
            continue
        with Image.open(source) as image:
            if image.width < 1024 or image.height < 1024:
                errors.append(f"{item_id}: source is too small ({image.width}x{image.height})")
        if runtime_record.get("status") != "source-approved":
            errors.append(f"{item_id}: runtime status is {runtime_record.get('status')!r}")
        elif runtime_record.get("sourceSha256") != sha256(source):
            errors.append(f"{item_id}: runtime source hash is stale")
        else:
            approved += 1
        palette_source = (
            Path(state_overlay_manifest["sources"]["third-pill"]["source"])
            if item_id == "third-pill"
            else source
        )
        if palette_record.get("sourceSha256") != sha256(palette_source):
            errors.append(f"{item_id}: source-derived palette hash is stale")
        directions = runtime_record.get("directions", {})
        if set(directions) != {"front", "left", "back", "right"}:
            errors.append(f"{item_id}: incomplete four-direction source metadata")
        else:
            for direction, metadata in directions.items():
                if metadata.get("width", 0) <= 0 or metadata.get("height", 0) <= 0:
                    errors.append(f"{item_id}/{direction}: empty runtime sprite")
                if metadata.get("colors", 99) > 8:
                    errors.append(f"{item_id}/{direction}: exceeds 8 source colors")

    with Image.open(SPRITE_ATLAS_PATH) as atlas:
        expected = (
            int(sprite_manifest["cell"]["width"]) * 4,
            int(sprite_manifest["cell"]["height"]) * 77,
        )
        if atlas.size != expected:
            errors.append(f"equipment sprite atlas is {atlas.size}, expected {expected}")

    with Image.open(ICON_ATLAS_PATH).convert("RGBA") as icons:
        expected = (
            int(icon_manifest["cell"]) * int(icon_manifest["cols"]),
            int(icon_manifest["cell"]) * int(icon_manifest["rows"]),
        )
        if icons.size != expected:
            errors.append(f"icon atlas is {icons.size}, expected {expected}")
        cell = int(icon_manifest["cell"])
        columns = int(icon_manifest["cols"])
        for item_id, index in icon_manifest["index"].items():
            left = (int(index) % columns) * cell
            top = (int(index) // columns) * cell
            if icons.crop((left, top, left + cell, top + cell)).getchannel("A").getbbox() is None:
                errors.append(f"{item_id}: icon cell is empty")
        pixels = list(icons.getdata())
        chroma_spill = sum(
            alpha > 0 and green > 160 and green * 100 > red * 140 and green * 100 > blue * 140
            for red, green, blue, alpha in pixels
        )
        if chroma_spill:
            errors.append(f"dedicated icon atlas contains {chroma_spill} chroma-key spill pixels")
        icon_selections = json.loads(ICON_SELECTIONS_PATH.read_text(encoding="utf-8"))
        for record in icon_selections.get("items", []):
            item_id = record["id"]
            if "approved" not in record.get("reviewStatus", ""):
                errors.append(f"{item_id}: dedicated icon override is not approved")
                continue
            if item_id not in icon_manifest["index"]:
                errors.append(f"{item_id}: dedicated icon override has no atlas index")
                continue
            index = int(icon_manifest["index"][item_id])
            left = (index % columns) * cell
            top = (index // columns) * cell
            installed = icons.crop((left, top, left + cell, top + cell))
            expected_icon = process_icon(Path(record["source"]))
            if installed.tobytes() != expected_icon.tobytes():
                errors.append(f"{item_id}: approved dedicated icon override is not installed")

    item_asset_builder = Path("scripts/process_item_image2_assets.py").read_text(encoding="utf-8")
    if "icon_atlas.save(ICON_ATLAS_PATH" in item_asset_builder:
        errors.append("four-direction equipment pipeline must not overwrite the dedicated icon atlas")

    implementations = {
        "image2-rigid-four-direction-atlas": (
            Path("src/hero-item-pixel.ts"), "drawImage2Equipment("
        ),
        "image2-fitted-uniform-anatomy-atlas": (
            Path("src/hero-pixel.ts"), "sliceUniform("
        ),
        "image2-fitted-raincoat-palette-atlas": (
            Path("src/hero-pixel.ts"), "sliceRaincoat("
        ),
        "image2-palette-body-mutation": (
            Path("src/hero-item-mutations.ts"), "sourceDerivedPaint("
        ),
        "image2-palette-event-effect": (
            Path("src/hero-item-mutations.ts"), "sourceDerivedPaint("
        ),
        "image2-state-overlay-atlas": (
            Path("src/hero-pixel.ts"), "itemStateOverlayAtlas.slice("
        ),
        "image2-event-composite": (
            Path("src/hero-item-mutations.ts"), "sourceDerivedPaint("
        ),
        "image2-projectile-trigger-preview": (
            Path("src/game.ts"), "projectileAtlas.tintedNamed("
        ),
    }
    for consumer_name, (implementation, signature) in implementations.items():
        if not any(record.get("heroConsumer") == consumer_name for record in consumers.values()):
            errors.append(f"runtime consumer class is unused: {consumer_name}")
            continue
        if signature not in implementation.read_text(encoding="utf-8"):
            errors.append(f"runtime consumer {consumer_name} is not implemented in {implementation}")

    overlay_sources = state_overlay_manifest.get("sources", {})
    for item_id, source_record in overlay_sources.items():
        for path_key, hash_key in (
            ("source", "sourceSha256"),
            ("logicalSource", "logicalSourceSha256"),
            ("propSource", "propSourceSha256"),
            ("shadowSource", "shadowSourceSha256"),
            ("prompt", "promptSha256"),
            ("selection", "selectionSha256"),
        ):
            if path_key not in source_record:
                continue
            source_path = Path(source_record[path_key])
            if not source_path.is_file():
                errors.append(f"{item_id} state overlay is missing {path_key}: {source_path}")
            elif source_record.get(hash_key) != sha256(source_path):
                errors.append(f"{item_id} state overlay {path_key} hash is stale")
    if state_overlay_manifest.get("atlasSha256") != sha256(STATE_OVERLAY_ATLAS_PATH):
        errors.append("state overlay atlas hash is stale")
    with Image.open(STATE_OVERLAY_ATLAS_PATH).convert("RGBA") as state_atlas:
        expected = (
            int(state_overlay_manifest["cell"]["width"]) * 4,
            int(state_overlay_manifest["cell"]["height"]) * int(state_overlay_manifest["rowCount"]),
        )
        if state_atlas.size != expected:
            errors.append(f"state overlay atlas is {state_atlas.size}, expected {expected}")
        if any(pixel[:3] != (0, 0, 0) for pixel in state_atlas.getdata() if pixel[3] == 0):
            errors.append("state overlay transparent RGB is not zero")
    required_overlay_phases = {
        "third-pill": ["rage", "crash"],
        "auto-renew": ["stub", "two", "three", "four"],
        "shop-freezer": ["drag"],
        "pregnancy-test": ["shadow", "prop"],
        "cracked-glasses": ["fitted"],
        "divorce-draft": ["fitted"],
        "goodnight-2h": ["shadow"],
        "slow-watch": ["freeze-idle", "freeze-walk", "freeze-attack", "freeze-hurt"],
    }
    for item_id, phases in required_overlay_phases.items():
        item_record = state_overlay_manifest.get("items", {}).get(item_id, {})
        if item_record.get("phases") != phases:
            errors.append(f"{item_id}: state overlay phases are stale")

    projectile_consumers = sum(
        "image2-projectile-atlas" in record.get("consumers", [])
        for record in consumers.values()
    )
    if projectile_consumers != 35:
        errors.append(f"projectile runtime consumers must contain 35 items, got {projectile_consumers}")

    uniform_profile = profile_manifest.get("uniform_image2", {})
    if uniform_profile.get("source_sha256") != sha256(UNIFORM_SOURCE):
        errors.append("small-uniform fitted atlas does not match its Image2 source")
    raincoat_source = RAW_DIR / "14-fathers-raincoat.png"
    raincoat_profile = profile_manifest.get("raincoat_image2", {})
    if raincoat_profile.get("source_sha256") != sha256(raincoat_source):
        errors.append("fathers-raincoat fitted atlas does not match its Image2 source")
    part_mask_contract = profile_manifest.get("part_mask", {})
    if set(part_mask_contract.get("colors", {})) != {
        "head", "upper", "left_arm", "right_arm", "left_leg", "right_leg"
    }:
        errors.append("runtime anatomy part mask must expose all six body parts")
    for motion, frames in {"idle": 2, "walk": 4, "attack": 4, "hurt": 2}.items():
        path = PART_MASK_DIR / f"part-mask-{motion}.png"
        if not path.is_file():
            errors.append(f"missing runtime anatomy part atlas: {path}")
            continue
        with Image.open(path) as mask:
            expected = (40 * frames, 56 * 4 * 12)
            if mask.size != expected:
                errors.append(f"{path}: size is {mask.size}, expected {expected}")
    hero_pixel_source = Path("src/hero-pixel.ts").read_text(encoding="utf-8")
    for item_id in (
        "stone-schoolbag", "small-uniform", "broken-spine", "third-pill",
        "held-pee", "pregnancy-test", "summer-run",
    ):
        generic_part_morph = f"id === '{item_id}'" in hero_pixel_source
        dedicated_item_morph = f"state.items.includes('{item_id}')" in hero_pixel_source
        if not generic_part_morph and not dedicated_item_morph:
            errors.append(f"{item_id}: missing anatomy-part morph implementation")
    if "slicePartMask(" not in hero_pixel_source:
        errors.append("runtime hero renderer does not consume the anatomy part atlas")

    report = {
        "valid": not errors,
        "itemCount": len(items),
        "approvedImage2Sources": approved,
        "runtimeSourceConsumers": len(consumers),
        "sourceDerivedPalettes": len(source_palettes),
        "runtimeConsumerSummary": consumer_manifest.get("summary", {}),
        "anatomyPartAtlases": 4,
        "newItemSources": len(list(RAW_DIR.glob("*.png"))),
        "customFittedSources": 1 if UNIFORM_SOURCE.is_file() else 0,
        "resolvedSecondPass": len(audit.get("resolvedV2", {})),
        "redoRemaining": len(audit.get("redo", {})),
        "spriteAtlas": f"{sprite_manifest['cell']['width'] * 4}x{sprite_manifest['cell']['height'] * 77}",
        "errors": errors,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
