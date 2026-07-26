#!/usr/bin/env python3
"""Build the review-only static art catalog and validate its contracts.

The script never imports assets into the runtime and never rewrites source art.
It reads the TypeScript source-of-truth sets plus the existing review manifests,
then emits one machine-readable catalog and one human-readable README.

Required collections fail the command on genuine missing-file, set, slicing,
alpha, crop, or anchor errors. Optional A/C and manifestation-card expansions
remain pending until their manifests declare a complete set matching source truth.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output/art-review-static/full-art-v1"
CATALOG_PATH = OUTPUT_DIR / "static-art-catalog.json"
README_PATH = OUTPUT_DIR / "README.md"

TYPES_PATH = ROOT / "src/types.ts"
RELICS_PATH = ROOT / "src/relics.ts"
ART_DIRECTION_PATH = OUTPUT_DIR / "ART-DIRECTION.md"

TARGET_TEXT_ITEM_COUNT = 71
HERO_FRAME = (40, 56)
HERO_ROOT = (20, 49)
HERO_DIRECTIONS = ("front", "back", "left", "right")
EXPECTED_STAGE_KEYS = ("childhood", "school", "station", "home", "office", "late")


def relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def path_pair(path: Path) -> dict[str, str]:
    return {
        "relative": relative(path),
        "absolute": str(path.resolve()),
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def result(status: str, message: str, **details: Any) -> dict[str, Any]:
    value: dict[str, Any] = {"status": status, "message": message}
    value.update(details)
    return value


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {relative(path)}")
    return value


def parse_union(type_name: str) -> list[str]:
    source = TYPES_PATH.read_text(encoding="utf-8")
    match = re.search(
        rf"export\s+type\s+{re.escape(type_name)}\s*=\s*(.*?);",
        source,
        re.DOTALL,
    )
    if not match:
        raise ValueError(f"cannot find export type {type_name} in {relative(TYPES_PATH)}")
    values = re.findall(r"'([^']+)'", match.group(1))
    if not values or len(values) != len(set(values)):
        raise ValueError(f"invalid or duplicate {type_name} values: {values}")
    return values


def parse_relic_ids() -> list[str]:
    values = re.findall(r"\bid:\s*'([^']+)'", RELICS_PATH.read_text(encoding="utf-8"))
    if not values or len(values) != len(set(values)):
        raise ValueError(f"invalid or duplicate relic ids in {relative(RELICS_PATH)}")
    return values


def file_record(
    path: Path,
    *,
    expected_size: tuple[int, int] | None = None,
    alpha_policy: str = "not_applicable",
    role: str | None = None,
) -> dict[str, Any]:
    record: dict[str, Any] = {
        "role": role,
        "path": path_pair(path),
        "exists": path.is_file(),
        "bytes": path.stat().st_size if path.is_file() else None,
        "sha256": sha256(path) if path.is_file() else None,
        "dimensions": None,
        "mode": None,
        "checks": {
            "dimensions": result("not_applicable", "not an image or no fixed size contract"),
            "alpha": result("not_applicable", "no alpha contract"),
            "crop": result("not_applicable", "collection-level crop contract"),
            "anchor": result("not_applicable", "no anchor contract"),
        },
    }
    if not path.is_file():
        record["checks"]["dimensions"] = result("not_run", "file is missing")
        record["checks"]["alpha"] = result("not_run", "file is missing")
        return record
    if path.suffix.lower() != ".png":
        return record

    with Image.open(path) as image:
        width, height = image.size
        mode = image.mode
        has_alpha = "A" in image.getbands() or "transparency" in image.info
        rgba = image.convert("RGBA")
        alpha_values = set(rgba.getchannel("A").getdata())
        bbox = rgba.getchannel("A").getbbox()

    record["dimensions"] = {"width": width, "height": height}
    record["mode"] = mode
    if expected_size is None:
        record["checks"]["dimensions"] = result("pass", "dimensions recorded")
    elif (width, height) == expected_size:
        record["checks"]["dimensions"] = result(
            "pass", "matches expected dimensions", expected=list(expected_size)
        )
    else:
        record["checks"]["dimensions"] = result(
            "fail",
            "dimension mismatch",
            expected=list(expected_size),
            actual=[width, height],
        )

    binary = alpha_values <= {0, 255}
    opaque = alpha_values == {255}
    alpha_details = {
        "hasAlphaChannel": has_alpha,
        "binary": binary,
        "opaque": opaque,
        "valueCount": len(alpha_values),
    }
    if alpha_policy == "binary":
        record["checks"]["alpha"] = result(
            "pass" if binary else "fail",
            "binary alpha" if binary else "partial alpha values found",
            **alpha_details,
        )
    elif alpha_policy == "opaque":
        record["checks"]["alpha"] = result(
            "pass" if opaque else "fail",
            "opaque review image" if opaque else "unexpected transparent pixels",
            **alpha_details,
        )
    else:
        record["checks"]["alpha"] = result(
            "not_applicable", "alpha recorded without a pass/fail contract", **alpha_details
        )

    if bbox is None:
        record["checks"]["crop"] = result("fail", "image has no visible pixels")
    else:
        record["checks"]["crop"] = result(
            "informational",
            "whole-image visible bounds; cell crop is checked by the owning collection",
            bbox=list(bbox),
            touchesImageEdge=(bbox[0] == 0 or bbox[1] == 0 or bbox[2] == width or bbox[3] == height),
        )
    return record


def check_is_pass(check: dict[str, Any]) -> bool:
    return check.get("status") in {"pass", "not_applicable", "informational"}


def grid_record(
    path: Path,
    *,
    cell: tuple[int, int],
    columns: int,
    rows: int,
    root_y: int | None,
    no_edge_clip: bool,
    role: str,
    cell_count: int | None = None,
) -> dict[str, Any]:
    expected_size = (cell[0] * columns, cell[1] * rows)
    record = file_record(
        path,
        expected_size=expected_size,
        alpha_policy="binary",
        role=role,
    )
    record["grid"] = {
        "cell": list(cell),
        "columns": columns,
        "rows": rows,
        "cellCount": cell_count if cell_count is not None else columns * rows,
        "slotCount": columns * rows,
    }
    if not path.is_file() or record["checks"]["dimensions"]["status"] != "pass":
        record["checks"]["crop"] = result("not_run", "grid file missing or dimensions invalid")
        record["checks"]["anchor"] = result("not_run", "grid file missing or dimensions invalid")
        return record

    with Image.open(path) as source:
        image = source.convert("RGBA")
    cells: list[dict[str, Any]] = []
    empty: list[int] = []
    clipped: list[int] = []
    root_mismatch: list[int] = []
    for row in range(rows):
        for column in range(columns):
            index = row * columns + column
            if cell_count is not None and index >= cell_count:
                continue
            crop = image.crop(
                (
                    column * cell[0],
                    row * cell[1],
                    (column + 1) * cell[0],
                    (row + 1) * cell[1],
                )
            )
            bbox = crop.getchannel("A").getbbox()
            if bbox is None:
                empty.append(index)
            else:
                if no_edge_clip and (
                    bbox[0] <= 0
                    or bbox[1] <= 0
                    or bbox[2] >= cell[0]
                    or bbox[3] >= cell[1]
                ):
                    clipped.append(index)
                if root_y is not None and bbox[3] - 1 != root_y:
                    root_mismatch.append(index)
            cells.append({"index": index, "column": column, "row": row, "bbox": list(bbox) if bbox else None})

    crop_ok = not empty and not clipped
    record["checks"]["crop"] = result(
        "pass" if crop_ok else "fail",
        "all logical cells are non-empty and inside their crop"
        if crop_ok
        else "empty or edge-clipped logical cells found",
        emptyCellIndices=empty,
        clippedCellIndices=clipped,
    )
    if root_y is None:
        record["checks"]["anchor"] = result("not_applicable", "this grid has no root anchor")
    else:
        record["checks"]["anchor"] = result(
            "pass" if not root_mismatch else "fail",
            f"all visible cells end at root y={root_y}"
            if not root_mismatch
            else f"some cells do not end at root y={root_y}",
            rootY=root_y,
            mismatchedCellIndices=root_mismatch,
        )
    record["cells"] = cells
    return record


def summarize_checks(files: Iterable[dict[str, Any]], check_name: str) -> dict[str, Any]:
    statuses = [file["checks"][check_name]["status"] for file in files if file.get("exists")]
    failures = [
        file["path"]["relative"]
        for file in files
        if file.get("exists") and not check_is_pass(file["checks"][check_name])
    ]
    applicable = [status for status in statuses if status not in {"not_applicable", "informational"}]
    if failures:
        return result("fail", f"{len(failures)} file(s) failed {check_name}", files=failures)
    if not applicable:
        return result("not_applicable", f"no {check_name} contract for this collection")
    return result("pass", f"all {len(applicable)} applicable file(s) passed {check_name}")


def finish_collection(
    *,
    key: str,
    label: str,
    required: bool,
    counts: dict[str, Any],
    files: list[dict[str, Any]],
    checks: dict[str, Any],
    local_errors: list[str],
    local_pending: list[str] | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    pending = local_pending or []
    status = "error" if local_errors else "pending" if pending else "complete"
    value: dict[str, Any] = {
        "key": key,
        "label": label,
        "required": required,
        "status": status,
        "counts": counts,
        "checks": checks,
        "files": files,
        "errors": local_errors,
        "pending": pending,
    }
    if details:
        value.update(details)
    return value


def require_file(path: Path, errors: list[str]) -> None:
    if not path.is_file():
        errors.append(f"missing required file: {relative(path)}")


def require_file_checks(record: dict[str, Any], errors: list[str]) -> None:
    if not record["exists"]:
        errors.append(f"missing required file: {record['path']['relative']}")
        return
    for check_name in ("dimensions", "alpha", "crop", "anchor"):
        check = record["checks"][check_name]
        if not check_is_pass(check):
            errors.append(
                f"{record['path']['relative']} {check_name}: {check.get('message', check.get('status'))}"
            )


def manifest_artifact_records(manifest_path: Path, artifacts: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    for key, artifact in artifacts.items():
        if not isinstance(artifact, dict) or not isinstance(artifact.get("path"), str):
            errors.append(f"invalid artifact record {key} in {relative(manifest_path)}")
            continue
        path = manifest_path.parent / artifact["path"]
        record = file_record(
            path,
            alpha_policy="opaque" if "approval" in key or key in {"raincoat", "rigid"} else "binary",
            role=key,
        )
        records.append(record)
        if not path.is_file():
            errors.append(f"missing manifest artifact: {relative(path)}")
            continue
        expected_hash = artifact.get("sha256")
        if expected_hash and record["sha256"] != expected_hash:
            errors.append(f"sha256 mismatch: {relative(path)}")
        expected_bytes = artifact.get("bytes")
        if expected_bytes is not None and record["bytes"] != expected_bytes:
            errors.append(f"byte-size mismatch: {relative(path)}")
    return records, errors


def build_hero_master() -> dict[str, Any]:
    errors: list[str] = []
    manifest_path = ROOT / "output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/manifest.json"
    master_path = ROOT / "output/imagegen/zhe-yi-shen-hero-style-gate-v2/processed/style-1-4dir.png"
    review_path = ROOT / "output/art-review-static/01-hero-mother-4dir.png"
    manifest_record = file_record(manifest_path, role="source manifest")
    master_record = grid_record(
        master_path,
        cell=HERO_FRAME,
        columns=4,
        rows=1,
        root_y=HERO_ROOT[1],
        no_edge_clip=True,
        role="approved transparent four-direction mother",
    )
    review_record = file_record(review_path, alpha_policy="opaque", role="approval board")
    files = [manifest_record, master_record, review_record]
    for path in (manifest_path, master_path, review_path):
        require_file(path, errors)
    require_file_checks(master_record, errors)
    if manifest_path.is_file():
        manifest = load_json(manifest_path)
        if manifest.get("logical_size") != list(HERO_FRAME):
            errors.append("approved mother manifest logical_size is not 40x56")
        if manifest.get("root") != list(HERO_ROOT):
            errors.append("approved mother manifest root is not (20,49)")
        if manifest.get("directions") != list(HERO_DIRECTIONS):
            errors.append("approved mother direction order mismatch")
    return finish_collection(
        key="heroApprovedMother",
        label="Approved hero mother",
        required=True,
        counts={"directionsExpected": 4, "directionsActual": 4 if master_path.is_file() else 0},
        files=files,
        checks={name: summarize_checks([master_record], name) for name in ("alpha", "crop", "anchor")},
        local_errors=errors,
        details={"slicing": {"cell": list(HERO_FRAME), "columns": list(HERO_DIRECTIONS), "root": list(HERO_ROOT)}},
    )


def build_hero_actions() -> dict[str, Any]:
    errors: list[str] = []
    base = ROOT / "output/art-review-static/hero-actions-v4"
    manifest_path = base / "manifest.json"
    motion_columns = {"idle": 2, "walk": 4, "attack": 4, "hurt": 2}
    files: list[dict[str, Any]] = [file_record(manifest_path, role="action manifest")]
    transparent: list[dict[str, Any]] = []
    frame_count = 0
    for motion, columns in motion_columns.items():
        record = grid_record(
            base / f"style1-{motion}-4dir.png",
            cell=HERO_FRAME,
            columns=columns,
            rows=4,
            root_y=HERO_ROOT[1],
            no_edge_clip=True,
            role=f"{motion} transparent frames",
        )
        transparent.append(record)
        files.append(record)
        frame_count += columns * 4
        require_file_checks(record, errors)
        files.append(file_record(base / f"hero-{motion}-frames.png", alpha_policy="opaque", role=f"{motion} approval board"))
    files.append(file_record(base / "hero-actions-contact.png", alpha_policy="opaque", role="all-action contact sheet"))
    require_file(manifest_path, errors)
    for record in files:
        if (record["role"] and "approval" in record["role"]) or record["role"] == "all-action contact sheet":
            if not record["exists"]:
                errors.append(f"missing required file: {record['path']['relative']}")
    if manifest_path.is_file():
        manifest = load_json(manifest_path)
        if manifest.get("runtime_modified") is not False or manifest.get("gif_generated") is not False:
            errors.append("hero action v4 manifest is not review-only/no-GIF")
        if manifest.get("unchanged_frame_count", 0) + manifest.get("changed_side_walk_frames", 0) != frame_count:
            errors.append("hero action v4 manifest frame count does not equal sliced frame count")
    return finish_collection(
        key="heroActionsV4",
        label="Hero actions v4",
        required=True,
        counts={"motions": 4, "directions": 4, "frames": frame_count},
        files=files,
        checks={name: summarize_checks(transparent, name) for name in ("alpha", "crop", "anchor")},
        local_errors=errors,
        details={
            "slicing": {
                "cell": list(HERO_FRAME),
                "rowOrder": list(HERO_DIRECTIONS),
                "frameColumnsByMotion": motion_columns,
                "root": list(HERO_ROOT),
            }
        },
    )


def build_profiles() -> dict[str, Any]:
    errors: list[str] = []
    base = ROOT / "output/imagegen/zhe-yi-shen-hero-style1-static-profiles-review-v1"
    manifest_path = base / "manifest.json"
    manifest_record = file_record(manifest_path, role="profile manifest")
    body_record = grid_record(
        base / "style1-profile-body-atlas.png",
        cell=HERO_FRAME,
        columns=4,
        rows=12,
        root_y=HERO_ROOT[1],
        no_edge_clip=True,
        role="12-profile body atlas",
    )
    files: list[dict[str, Any]] = [manifest_record, body_record]
    require_file(manifest_path, errors)
    require_file_checks(body_record, errors)
    profile_order: list[str] = []
    if manifest_path.is_file():
        manifest = load_json(manifest_path)
        profile_order = manifest.get("profile_order", [])
        if len(profile_order) != 12 or len(set(profile_order)) != 12:
            errors.append("profile manifest must contain 12 unique profiles")
        if manifest.get("direction_order") != list(HERO_DIRECTIONS):
            errors.append("profile direction order mismatch")
        if manifest.get("frame") != {"width": 40, "height": 56, "root": [20, 49]}:
            errors.append("profile frame/root contract mismatch")
        artifact_records, artifact_errors = manifest_artifact_records(manifest_path, manifest.get("artifacts", {}))
        files.extend(record for record in artifact_records if record["path"]["relative"] != body_record["path"]["relative"])
        errors.extend(artifact_errors)
        validation = manifest.get("validation", {})
        if validation.get("profile_count") != 12:
            errors.append("profile validation count is not 12")
    overlay_records = [
        record
        for record in files
        if record.get("dimensions") == {"width": 160, "height": 672}
        and record["path"]["relative"] != body_record["path"]["relative"]
    ]
    for record in overlay_records:
        if record["checks"]["alpha"]["status"] != "pass":
            errors.append(f"non-binary profile atlas: {record['path']['relative']}")
    return finish_collection(
        key="heroProfiles12",
        label="Twelve body profiles",
        required=True,
        counts={"profilesExpected": 12, "profilesActual": len(profile_order), "directions": 4, "bodyCells": 48},
        files=files,
        checks={name: summarize_checks([body_record, *overlay_records], name) for name in ("alpha", "crop", "anchor")},
        local_errors=errors,
        details={
            "profileOrder": profile_order,
            "slicing": {"cell": list(HERO_FRAME), "columns": list(HERO_DIRECTIONS), "rows": profile_order, "root": list(HERO_ROOT)},
        },
    )


def build_item_semantics(item_ids: list[str]) -> dict[str, Any]:
    errors: list[str] = []
    json_path = OUTPUT_DIR / "items/item-manifestation-spec.json"
    markdown_path = OUTPUT_DIR / "items/item-manifestation-spec.md"
    files = [file_record(json_path, role="machine-readable semantic spec"), file_record(markdown_path, role="human-readable semantic spec")]
    for path in (json_path, markdown_path):
        require_file(path, errors)
    entries: list[dict[str, Any]] = []
    if json_path.is_file():
        manifest = load_json(json_path)
        entries = manifest.get("items", [])
        actual_ids = [entry.get("id") for entry in entries if isinstance(entry, dict)]
        missing = sorted(set(item_ids) - set(actual_ids))
        extra = sorted(set(actual_ids) - set(item_ids))
        duplicates = sorted({value for value in actual_ids if actual_ids.count(value) > 1})
        if missing or extra or duplicates or len(entries) != len(item_ids):
            errors.append(f"item semantic set mismatch: missing={missing} extra={extra} duplicates={duplicates}")
        required_fields = (
            "realityReference",
            "pickupIconPrompt",
            "heroAppearanceChange",
            "projectileOrImpactChange",
            "changeCategories",
            "directionVisibility",
        )
        incomplete = [
            entry.get("id", f"index-{index}")
            for index, entry in enumerate(entries)
            if not isinstance(entry, dict) or any(not entry.get(field) for field in required_fields)
        ]
        if incomplete:
            errors.append(f"item semantic entries missing required fields: {incomplete}")
    na = result("not_applicable", "text specification; no raster contract")
    return finish_collection(
        key="itemManifestationSemantics",
        label="Item manifestation semantics",
        required=True,
        counts={
            "targetTextCount": TARGET_TEXT_ITEM_COUNT,
            "sourceTruthCount": len(item_ids),
            "specCount": len(entries),
        },
        files=files,
        checks={"alpha": na, "crop": na, "anchor": na},
        local_errors=errors,
        details={
            "countResolution": f"target text says {TARGET_TEXT_ITEM_COUNT}; source truth has {len(item_ids)}; catalog keeps all source items",
            "itemIds": item_ids,
        },
    )


def build_item_icons(item_ids: list[str]) -> dict[str, Any]:
    errors: list[str] = []
    base = OUTPUT_DIR / "items"
    manifest_path = base / "item-icons-manifest.json"
    atlas_path = base / "item-icons-atlas.png"
    atlas_rows = (len(item_ids) + 7) // 8
    manifest_record = file_record(manifest_path, role="item icon manifest")
    atlas_record = grid_record(
        atlas_path,
        cell=(32, 32),
        columns=8,
        rows=atlas_rows,
        root_y=None,
        no_edge_clip=False,
        role=f"{len(item_ids)}-item transparent atlas",
        cell_count=len(item_ids),
    )
    files: list[dict[str, Any]] = [manifest_record, atlas_record]
    require_file(manifest_path, errors)
    require_file_checks(atlas_record, errors)
    manifest_items: list[dict[str, Any]] = []
    contact_count = 0
    if manifest_path.is_file():
        manifest = load_json(manifest_path)
        manifest_items = manifest.get("items", [])
        if manifest.get("logical_icon") != {"width": 32, "height": 32, "alpha": "binary"}:
            errors.append("item icon logical contract is not 32x32 binary alpha")
        if manifest.get("item_count") != len(item_ids):
            errors.append("item icon manifest count does not match source truth")
        contact_count = int(manifest.get("contact_pages", 0))
    manifest_ids = [entry.get("id") for entry in manifest_items if isinstance(entry, dict)]
    icon_paths = sorted((base / "icons").glob("*.png")) if (base / "icons").is_dir() else []
    file_ids = [path.stem for path in icon_paths]
    for label, actual_ids in (("manifest", manifest_ids), ("files", file_ids)):
        missing = sorted(set(item_ids) - set(actual_ids))
        extra = sorted(set(actual_ids) - set(item_ids))
        if missing or extra or len(actual_ids) != len(item_ids):
            errors.append(f"item icon {label} set mismatch: missing={missing} extra={extra}")
    if manifest_ids and manifest_ids != item_ids:
        errors.append("item icon manifest order differs from src/relics.ts; atlas cell mapping is not authoritative")

    item_records: list[dict[str, Any]] = []
    icon_file_records: list[dict[str, Any]] = []
    for index, item_id in enumerate(item_ids):
        path = base / "icons" / f"{item_id}.png"
        record = file_record(path, expected_size=(32, 32), alpha_policy="binary", role=f"pickup icon {item_id}")
        if path.is_file():
            with Image.open(path) as source:
                bbox = source.convert("RGBA").getchannel("A").getbbox()
            crop_ok = bool(
                bbox
                and bbox[0] > 0
                and bbox[1] > 0
                and bbox[2] < 32
                and bbox[3] < 32
            )
            record["checks"]["crop"] = result(
                "pass" if crop_ok else "fail",
                "visible icon stays inside its logical cell" if crop_ok else "empty icon or edge clipping risk",
                bbox=list(bbox) if bbox else None,
            )
        record["checks"]["anchor"] = result("not_applicable", "pickup icons are centered UI art, not world-rooted sprites")
        icon_file_records.append(record)
        require_file_checks(record, errors)
        source_entry = next((entry for entry in manifest_items if entry.get("id") == item_id), {})
        item_records.append(
            {
                "index": index + 1,
                "id": item_id,
                "atlasCell": [index % 8, index // 8],
                "atlasRect": [(index % 8) * 32, (index // 8) * 32, 32, 32],
                "file": record,
                "manifestBbox": source_entry.get("bbox"),
                "manifestOpaquePixels": source_entry.get("opaque_pixels"),
                "manifestPaletteColors": source_entry.get("palette_colors"),
            }
        )
    files.extend(icon_file_records)
    for index in range(1, contact_count + 1):
        contact_path = base / f"item-icons-contact-{index:02d}.png"
        contact = file_record(contact_path, alpha_policy="opaque", role=f"contact page {index}")
        files.append(contact)
        require_file(contact_path, errors)

    return finish_collection(
        key="itemPickupIcons",
        label="Base pickup icons",
        required=True,
        counts={"expected": len(item_ids), "manifest": len(manifest_items), "files": len(icon_paths), "contactPages": contact_count},
        files=files,
        checks={name: summarize_checks([atlas_record, *icon_file_records], name) for name in ("alpha", "crop", "anchor")},
        local_errors=errors,
        details={
            "slicing": {"logicalCell": [32, 32], "atlasColumns": 8, "atlasRows": atlas_rows, "itemOrder": item_ids},
            "items": item_records,
        },
    )


def build_ac_reference() -> dict[str, Any]:
    errors: list[str] = []
    base = OUTPUT_DIR / "items/ac-style-fixed"
    manifest_path = base / "manifest.json"
    files: list[dict[str, Any]] = [file_record(manifest_path, role="A/C reference manifest")]
    item_count = 0
    if manifest_path.is_file():
        manifest = load_json(manifest_path)
        item_count = int(manifest.get("item_count", 0))
        sprite_paths = sorted((base / "sprites").glob("*.png"))
        for path in sprite_paths:
            files.append(file_record(path, expected_size=(64, 64), alpha_policy="binary", role=f"A/C fixed sprite {path.stem}"))
        files.append(file_record(base / "item-icons-ac-fixed-64.png", alpha_policy="binary", role="A/C fixed atlas"))
        files.append(file_record(base / "item-icons-ac-fixed-preview.png", alpha_policy="opaque", role="A/C fixed preview"))
        if item_count != 16 or len(sprite_paths) != 16:
            errors.append(f"A/C fixed reference expected 16 sprites, found manifest={item_count} files={len(sprite_paths)}")
    else:
        errors.append(f"missing A/C fixed reference manifest: {relative(manifest_path)}")
    return finish_collection(
        key="itemAcReference16",
        label="A/C approved reference subset",
        required=True,
        counts={"expected": 16, "actual": item_count},
        files=files,
        checks={name: summarize_checks(files, name) for name in ("alpha", "crop", "anchor")},
        local_errors=errors,
    )


def build_optional_ac_complete(item_ids: list[str]) -> dict[str, Any]:
    base = OUTPUT_DIR / "items/ac-style-complete-v1"
    manifest_path = base / "item-icons-ac-manifest.json"
    pending: list[str] = []
    files: list[dict[str, Any]] = [file_record(manifest_path, role="A/C complete manifest")]
    item_count = 0
    generated_count = 0
    source_order: list[str] = []
    item_entries: list[dict[str, Any]] = []
    atlas_rows = (len(item_ids) + 7) // 8
    slicing: dict[str, Any] = {"logicalCell": [64, 64], "atlasColumns": 8, "atlasRows": atlas_rows}
    if not manifest_path.is_file():
        pending.append(f"waiting for {relative(manifest_path)}")
    else:
        try:
            manifest = load_json(manifest_path)
            item_count = int(manifest.get("item_count", 0))
            generated_count = int(manifest.get("generated_count", 0))
            source_order = manifest.get("source_order", [])
            item_entries = manifest.get("items", [])
            sprite_paths = sorted((base / "sprites").glob("*.png")) if (base / "sprites").is_dir() else []
            sprite_ids = [path.stem for path in sprite_paths]
            for path in sprite_paths:
                record = file_record(path, expected_size=(64, 64), alpha_policy="binary", role=f"A/C complete sprite {path.stem}")
                if path.is_file():
                    with Image.open(path) as source:
                        bbox = source.convert("RGBA").getchannel("A").getbbox()
                    crop_ok = bool(bbox and bbox[0] > 0 and bbox[1] > 0 and bbox[2] < 64 and bbox[3] < 64)
                    record["checks"]["crop"] = result(
                        "pass" if crop_ok else "fail",
                        "A/C sprite stays inside its exact 64x64 cell"
                        if crop_ok
                        else "A/C sprite is empty or touches its crop edge",
                        bbox=list(bbox) if bbox else None,
                    )
                record["checks"]["anchor"] = result(
                    "not_applicable", "pickup icons are centered UI art, not world-rooted sprites"
                )
                files.append(record)
            atlas_path = base / "item-icons-ac-atlas.png"
            atlas_record = grid_record(
                atlas_path,
                cell=(64, 64),
                columns=8,
                rows=atlas_rows,
                root_y=None,
                no_edge_clip=False,
                role="A/C complete atlas",
                cell_count=len(item_ids),
            )
            files.append(atlas_record)
            for path in sorted(base.glob("item-icons-ac-approval-*.png")):
                files.append(file_record(path, alpha_policy="opaque", role="A/C approval page"))
            set_ok = set(source_order) == set(item_ids) and len(source_order) == len(item_ids)
            files_ok = set(sprite_ids) == set(item_ids) and len(sprite_ids) == len(item_ids)
            entries_ok = len(item_entries) == len(item_ids) and {entry.get("id") for entry in item_entries} == set(item_ids)
            raster_records = [record for record in files if record.get("role", "").startswith("A/C complete sprite ")]
            rasters_clean = all(
                record["checks"]["dimensions"]["status"] == "pass"
                and record["checks"]["alpha"]["status"] == "pass"
                and record["checks"]["crop"]["status"] == "pass"
                for record in raster_records
            )
            atlas_clean = all(
                check_is_pass(atlas_record["checks"][name])
                for name in ("dimensions", "alpha", "crop")
            )
            if (
                item_count != len(item_ids)
                or not set_ok
                or not files_ok
                or not entries_ok
                or not rasters_clean
                or not atlas_clean
            ):
                pending.append(
                    f"A/C complete batch is present but incomplete; rerun after manifest, {len(item_ids)} clean sprites, source_order, items, and atlas agree"
                )
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            pending.append(f"A/C complete manifest is still being written: {exc}")
    checks = {name: summarize_checks(files, name) for name in ("alpha", "crop", "anchor")}
    return finish_collection(
        key="itemAcComplete",
        label="A/C complete pickup icon expansion",
        required=False,
        counts={"expected": len(item_ids), "manifest": item_count, "generated": generated_count},
        files=files,
        checks=checks,
        local_errors=[],
        local_pending=pending,
        details={"sourceOrder": source_order, "slicing": slicing, "items": item_entries},
    )


def build_optional_manifestation_cards(item_ids: list[str]) -> dict[str, Any]:
    candidate_manifests = [
        OUTPUT_DIR / "items/manifestations-v1/manifest.json",
        OUTPUT_DIR / "items/item-manifestation-render-v1/manifest.json",
        OUTPUT_DIR / "items/item-manifestation-cards-v1/manifest.json",
    ]
    manifest_path = next((path for path in candidate_manifests if path.is_file()), candidate_manifests[0])
    files = [file_record(manifest_path, role="item manifestation render manifest")]
    pending: list[str] = []
    count = 0
    item_order: list[str] = []
    card_records: list[dict[str, Any]] = []
    if not manifest_path.is_file():
        pending.append(f"waiting for the {len(item_ids)}-item manifestation approval-card renderer output")
    else:
        try:
            manifest = load_json(manifest_path)
            entries = manifest.get("items", manifest.get("entries", []))
            item_order = manifest.get("item_order", [])
            entry_ids = [entry.get("id") for entry in entries if isinstance(entry, dict)]
            ids = item_order or entry_ids
            count = int(manifest.get("item_count", len(ids)))
            card_paths = [
                manifest_path.parent / "cards" / f"{index:02d}-{item_id}.png"
                for index, item_id in enumerate(item_ids, start=1)
            ]
            for path in card_paths:
                record = file_record(path, alpha_policy="opaque", role=f"manifestation card {path.stem}")
                card_records.append(record)
                files.append(record)
            artifacts = manifest.get("artifacts", {})
            if isinstance(artifacts, dict):
                artifact_records, _ = manifest_artifact_records(manifest_path, artifacts)
                known_paths = {record["path"]["relative"] for record in files}
                files.extend(
                    record
                    for record in artifact_records
                    if record["path"]["relative"] not in known_paths
                )
            cards_clean = all(record["exists"] and record["checks"]["alpha"]["status"] == "pass" for record in card_records)
            if count != len(item_ids) or ids != item_ids or not cards_clean:
                pending.append("manifestation render batch is present but does not yet cover all source ItemIds")
            for path in sorted(manifest_path.parent.glob("*.png")):
                files.append(file_record(path, alpha_policy="binary" if "atlas" in path.name else "opaque", role="manifestation render artifact"))
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            pending.append(f"manifestation render manifest is still being written: {exc}")
    return finish_collection(
        key="itemManifestationCards",
        label="Item manifestation approval cards",
        required=False,
        counts={"expected": len(item_ids), "actual": count},
        files=files,
        checks={name: summarize_checks(files, name) for name in ("alpha", "crop", "anchor")},
        local_errors=[],
        local_pending=pending,
        details={"itemOrder": item_order, "cards": [record["path"] for record in card_records]},
    )


def build_enemies(enemy_types: list[str]) -> dict[str, Any]:
    errors: list[str] = []
    base = ROOT / "output/imagegen/zhe-yi-shen-enemy-static-catalog-v2"
    manifest_path = base / "manifest.json"
    atlas_path = base / "enemy-static-front-side-atlas.png"
    approval_path = base / "enemy-static-approval-10x.png"
    files = [
        file_record(manifest_path, role="enemy manifest"),
        file_record(atlas_path, expected_size=(64, 32 * (len(enemy_types) + 1)), alpha_policy="binary", role="enemy transparent atlas"),
        file_record(approval_path, alpha_policy="opaque", role="enemy approval board"),
    ]
    for path in (manifest_path, atlas_path, approval_path):
        require_file(path, errors)
    entries: list[dict[str, Any]] = []
    crop_failures: list[str] = []
    anchor_failures: list[str] = []
    alpha_ok = files[1]["checks"]["alpha"]["status"] == "pass"
    if manifest_path.is_file():
        manifest = load_json(manifest_path)
        entries = manifest.get("entries", [])
        canonical = [entry.get("id") for entry in entries if not entry.get("variant_of")]
        missing = sorted(set(enemy_types) - set(canonical))
        extra = sorted(set(canonical) - set(enemy_types))
        if missing or extra or len(canonical) != len(enemy_types):
            errors.append(f"enemy source/catalog set mismatch: missing={missing} extra={extra}")
        if len(enemy_types) != 25 or len(entries) != 26:
            errors.append(f"enemy counts must be 25 EnemyType / 26 atlas rows, got {len(enemy_types)} / {len(entries)}")
        phase_variants = [entry for entry in entries if entry.get("variant_of")]
        if len(phase_variants) != 1 or phase_variants[0].get("id") != "silent-father-p2":
            errors.append("enemy phase variant must be exactly silent-father-p2")
        inventory = manifest.get("inventory", {})
        if inventory.get("enemy_type_count") != len(enemy_types) or inventory.get("atlas_entry_count") != len(entries):
            errors.append("enemy manifest inventory counts disagree with source/entries")
        if atlas_path.is_file() and files[1]["checks"]["dimensions"]["status"] == "pass":
            with Image.open(atlas_path) as source:
                atlas = source.convert("RGBA")
            for row, entry in enumerate(entries):
                views = entry.get("views", {})
                for column, view_name in enumerate(("front", "side")):
                    cell = atlas.crop((column * 32, row * 32, (column + 1) * 32, (row + 1) * 32))
                    bbox = cell.getchannel("A").getbbox()
                    expected_bbox = views.get(view_name, {}).get("bbox")
                    key = f"{entry.get('id')}/{view_name}"
                    if bbox is None or (expected_bbox is not None and list(bbox) != expected_bbox):
                        crop_failures.append(key)
                    elif bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= 32 or bbox[3] >= 32:
                        crop_failures.append(key)
                    anchors = entry.get("anchors", {})
                    root = anchors.get("root")
                    if not isinstance(root, list) or len(root) != 2 or not (0 <= root[0] < 32 and 0 <= root[1] < 32):
                        anchor_failures.append(key)
                    elif anchors.get("root_kind") == "ground" and bbox and bbox[3] - 1 != root[1]:
                        anchor_failures.append(key)
    crop_check = result(
        "pass" if entries and not crop_failures else "fail",
        f"all {len(entries) * 2} enemy views match manifest bboxes and stay inside 32x32 cells"
        if entries and not crop_failures
        else "enemy cell crop mismatches found",
        failures=crop_failures,
    )
    anchor_check = result(
        "pass" if entries and not anchor_failures else "fail",
        "all enemy roots are valid; grounded sprites end on their declared root"
        if entries and not anchor_failures
        else "enemy root mismatches found",
        failures=anchor_failures,
    )
    if crop_check["status"] != "pass":
        errors.append("enemy atlas crop validation failed")
    if anchor_check["status"] != "pass":
        errors.append("enemy atlas anchor validation failed")
    if not alpha_ok:
        errors.append("enemy atlas binary alpha validation failed")
    files[1]["checks"]["crop"] = crop_check
    files[1]["checks"]["anchor"] = anchor_check
    return finish_collection(
        key="enemies25Rows26",
        label="Enemy static catalog",
        required=True,
        counts={"enemyTypes": len(enemy_types), "atlasRows": len(entries), "phaseVariants": sum(bool(entry.get("variant_of")) for entry in entries)},
        files=files,
        checks={"alpha": files[1]["checks"]["alpha"], "crop": crop_check, "anchor": anchor_check},
        local_errors=errors,
        details={
            "enemyTypes": enemy_types,
            "rowOrder": [entry.get("id") for entry in entries],
            "slicing": {"cell": [32, 32], "columns": ["front", "side"], "rows": len(entries)},
            "entries": entries,
        },
    )


def build_scenes() -> dict[str, Any]:
    errors: list[str] = []
    base = ROOT / "output/imagegen/zhe-yi-shen-scene-static-assets-review-v1"
    manifest_path = base / "manifest.json"
    files: list[dict[str, Any]] = [file_record(manifest_path, role="scene manifest")]
    require_file(manifest_path, errors)
    stages: dict[str, Any] = {}
    special: dict[str, Any] = {}
    if manifest_path.is_file():
        manifest = load_json(manifest_path)
        stages = manifest.get("stages", {})
        if manifest.get("stage_order") != list(EXPECTED_STAGE_KEYS) or set(stages) != set(EXPECTED_STAGE_KEYS):
            errors.append("scene stage set/order mismatch")
        artifact_records, artifact_errors = manifest_artifact_records(manifest_path, manifest.get("artifacts", {}))
        files.extend(artifact_records)
        errors.extend(artifact_errors)
        validation = manifest.get("validation", {})
        stage_validation = validation.get("stages", {})
        for stage_key in EXPECTED_STAGE_KEYS:
            stage = stage_validation.get(stage_key, {})
            tiles = stage.get("tiles", [])
            landmarks = stage.get("landmarks", [])
            if len(tiles) != 4 or not all(
                tile.get("size") == [32, 32]
                and tile.get("binary_alpha") is True
                and tile.get("seamless_x") is True
                and tile.get("seamless_y") is True
                for tile in tiles
            ):
                errors.append(f"invalid stage tile validation: {stage_key}")
            if len(landmarks) != 4 or not all(
                landmark.get("size") == [32, 32]
                and landmark.get("binary_alpha") is True
                and landmark.get("no_edge_clip") is True
                for landmark in landmarks
            ):
                errors.append(f"invalid stage landmark validation: {stage_key}")
        special = validation.get("special", {})
        if len(special) != 9 or not all(
            record.get("binary_alpha") is True and record.get("no_edge_clip") is True
            for record in special.values()
        ):
            errors.append("scene special object validation must contain 9 clean sprites")
        atlas_contracts = {
            "scene-ground-tiles-atlas.png": ((128, 192), "binary"),
            "scene-landmarks-atlas.png": ((128, 192), "binary"),
            "scene-special-plinths-atlas.png": ((192, 32), "binary"),
            "scene-special-tall-atlas.png": ((128, 64), "binary"),
        }
        for name, (size, alpha_policy) in atlas_contracts.items():
            record = next((value for value in files if Path(value["path"]["relative"]).name == name), None)
            if record is None:
                record = file_record(base / name, expected_size=size, alpha_policy=alpha_policy, role="scene atlas")
                files.append(record)
            elif record.get("dimensions") != {"width": size[0], "height": size[1]}:
                errors.append(f"scene atlas dimension mismatch: {name}")
    alpha_failures = [record["path"]["relative"] for record in files if record["exists"] and record["path"]["relative"].endswith(".png") and record["checks"]["alpha"]["status"] == "fail"]
    if alpha_failures:
        errors.append(f"scene alpha failures: {alpha_failures}")
    crop_ok = not any("tile validation" in error or "landmark validation" in error or "special object" in error for error in errors)
    crop_check = result(
        "pass" if crop_ok else "fail",
        "six stage rows are seamless; landmarks and nine special sprites avoid unintended clipping"
        if crop_ok
        else "scene tile/landmark/special crop validation failed",
    )
    return finish_collection(
        key="scenes6AndSpecial",
        label="Six stage scenes and special objects",
        required=True,
        counts={"stages": len(stages), "groundTiles": len(stages) * 4, "landmarks": len(stages) * 4, "specialObjects": len(special)},
        files=files,
        checks={
            "alpha": summarize_checks(files, "alpha"),
            "crop": crop_check,
            "anchor": result("not_applicable", "scene placement uses explicit atlas cells/rects rather than a shared character root"),
        },
        local_errors=errors,
        details={"stageOrder": list(stages), "specialObjects": list(special)},
    )


def build_vfx_ui() -> dict[str, Any]:
    errors: list[str] = []
    base = ROOT / "output/imagegen/zhe-yi-shen-breath-vfx-ui-static-v1"
    manifest_path = base / "manifest.json"
    atlas_path = base / "breath-vfx-ui-transparent-atlas.png"
    approval_path = base / "breath-vfx-ui-approval.png"
    files = [
        file_record(manifest_path, role="VFX/UI manifest"),
        file_record(atlas_path, expected_size=(416, 208), alpha_policy="binary", role="VFX/UI transparent atlas"),
        file_record(approval_path, alpha_policy="opaque", role="VFX/UI approval board"),
    ]
    for path in (manifest_path, atlas_path, approval_path):
        require_file(path, errors)
    sprites: list[dict[str, Any]] = []
    crop_failures: list[str] = []
    anchor_failures: list[str] = []
    duplicate_keys: list[str] = []
    if manifest_path.is_file():
        manifest = load_json(manifest_path)
        sprites = manifest.get("sprites", [])
        if manifest.get("inventory", {}).get("sprite_count") != 100 or len(sprites) != 100:
            errors.append(f"VFX/UI sprite count must be 100, got manifest={manifest.get('inventory', {}).get('sprite_count')} records={len(sprites)}")
        keys: list[str] = []
        if atlas_path.is_file() and files[1]["checks"]["dimensions"]["status"] == "pass":
            with Image.open(atlas_path) as source:
                atlas = source.convert("RGBA")
            for index, sprite in enumerate(sprites):
                key = "/".join(
                    str(sprite.get(field, "")) for field in ("category", "id", "state")
                ).rstrip("/")
                keys.append(key)
                rect = sprite.get("atlas_rect")
                size = sprite.get("size")
                anchor = sprite.get("anchor")
                if not (
                    isinstance(rect, list)
                    and len(rect) == 4
                    and isinstance(size, list)
                    and len(size) == 2
                    and rect[2:] == size
                    and rect[0] >= 0
                    and rect[1] >= 0
                    and rect[0] + rect[2] <= atlas.width
                    and rect[1] + rect[3] <= atlas.height
                ):
                    crop_failures.append(key or f"index-{index}")
                    continue
                crop = atlas.crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]))
                bbox = crop.getchannel("A").getbbox()
                if bbox is None or (sprite.get("bbox") is not None and list(bbox) != sprite.get("bbox")):
                    crop_failures.append(key or f"index-{index}")
                if not (
                    isinstance(anchor, list)
                    and len(anchor) == 2
                    and 0 <= anchor[0] < size[0]
                    and 0 <= anchor[1] < size[1]
                ):
                    anchor_failures.append(key or f"index-{index}")
        duplicate_keys = sorted({key for key in keys if keys.count(key) > 1})
        if duplicate_keys:
            errors.append(f"duplicate VFX/UI sprite keys: {duplicate_keys}")
    crop_check = result(
        "pass" if len(sprites) == 100 and not crop_failures else "fail",
        "all 100 sprite rects are in-bounds, non-empty, and match manifest bboxes"
        if len(sprites) == 100 and not crop_failures
        else "VFX/UI sprite rect or bbox failures found",
        failures=crop_failures,
    )
    anchor_check = result(
        "pass" if len(sprites) == 100 and not anchor_failures else "fail",
        "all 100 sprite anchors are inside their logical rects"
        if len(sprites) == 100 and not anchor_failures
        else "VFX/UI anchor failures found",
        failures=anchor_failures,
    )
    if files[1]["checks"]["alpha"]["status"] != "pass":
        errors.append("VFX/UI atlas binary alpha validation failed")
    if crop_check["status"] != "pass":
        errors.append("VFX/UI crop validation failed")
    if anchor_check["status"] != "pass":
        errors.append("VFX/UI anchor validation failed")
    files[1]["checks"]["crop"] = crop_check
    files[1]["checks"]["anchor"] = anchor_check
    return finish_collection(
        key="breathVfxUi100",
        label="One-breath VFX and UI sprites",
        required=True,
        counts={"expected": 100, "actual": len(sprites)},
        files=files,
        checks={"alpha": files[1]["checks"]["alpha"], "crop": crop_check, "anchor": anchor_check},
        local_errors=errors,
        details={"slicing": {"atlas": [416, 208], "variableRects": True}, "sprites": sprites},
    )


def markdown_path(record: dict[str, Any]) -> str:
    path = record["path"]
    return f"`{path['relative']}`<br><small>{path['absolute']}</small>"


def check_badge(check: dict[str, Any]) -> str:
    return str(check.get("status", "unknown"))


def write_readme(catalog: dict[str, Any]) -> None:
    collections = catalog["collections"]
    lines = [
        "# 《这一身》静态美术总目录",
        "",
        f"- 生成时间：`{catalog['generatedAt']}`",
        f"- 仓库根目录：`{ROOT}`",
        f"- 总状态：**{catalog['summary']['status']}**",
        "- 本目录仅用于静态审批；脚本不改 runtime、不生成 GIF、不替换 `src/assets`。",
        "",
        "## 真源结论",
        "",
        f"- `ItemId`：目标文字写 {TARGET_TEXT_ITEM_COUNT}，`src/types.ts` / `src/relics.ts` 实际一致为 **{catalog['sourceTruth']['items']['count']}**；总目录保留全部源码项。",
        f"- `EnemyType`：`src/types.ts` 实际 **{catalog['sourceTruth']['enemies']['count']}**；敌人图集另含 `silent-father-p2` 一个阶段变体，因此为 **{catalog['sourceTruth']['enemies']['count'] + 1}** 行。",
        "- 主角固定逻辑格：`40x56`，脚底根点 `(20,49)`；方向顺序 `front / back / left / right`。",
        "",
        "## 完整性总览",
        "",
        "| 资产组 | 状态 | 数量 | Alpha | 裁切 | 锚点 |",
        "|---|---|---:|---|---|---|",
    ]
    for collection in collections.values():
        count_text = ", ".join(f"{key}={value}" for key, value in collection["counts"].items())
        lines.append(
            f"| {collection['label']} | **{collection['status']}** | {count_text} | "
            f"{check_badge(collection['checks']['alpha'])} | {check_badge(collection['checks']['crop'])} | {check_badge(collection['checks']['anchor'])} |"
        )

    lines.extend(["", "## 主文件路径", ""])
    for collection in collections.values():
        lines.extend([f"### {collection['label']} ({collection['status']})", ""])
        if not collection["files"]:
            lines.append("- 无已发现文件。")
        else:
            lines.extend([
                "| 角色 | 相对路径 / 绝对路径 | 尺寸 | Alpha |",
                "|---|---|---:|---|",
            ])
            for record in collection["files"]:
                # The JSON contains every per-item file. Keep the README readable by
                # listing manifests, atlases, boards, and up to four representative sprites.
                role = record.get("role") or "file"
                if role.startswith("pickup icon ") or role.startswith("A/C complete sprite "):
                    continue
                dimensions = record.get("dimensions")
                size = f"{dimensions['width']}x{dimensions['height']}" if dimensions else "-"
                lines.append(
                    f"| {role} | {markdown_path(record)} | {size} | {record['checks']['alpha']['status']} |"
                )
        lines.append("")

    base_icons = collections.get("itemPickupIcons", {})
    if base_icons.get("items"):
        lines.extend([
            f"## {len(base_icons['items'])} 件拾取图逐项路径",
            "",
            "完整逐像素检查记录也在 `static-art-catalog.json`。",
            "",
            "图集坐标均为零基；矩形格式固定为 `[x,y,w,h]`。",
            "",
            "| # | ItemId | 图集格 / 矩形 | 相对路径 | 绝对路径 | 尺寸 | Alpha | 裁切 |",
            "|---:|---|---|---|---|---:|---|---|",
        ])
        for item in base_icons["items"]:
            record = item["file"]
            dimensions = record.get("dimensions") or {}
            size = f"{dimensions.get('width', '?')}x{dimensions.get('height', '?')}"
            lines.append(
                f"| {item['index']} | `{item['id']}` | `{item['atlasCell']}` / `{item['atlasRect']}` | "
                f"`{record['path']['relative']}` | `{record['path']['absolute']}` | {size} | "
                f"{record['checks']['alpha']['status']} | {record['checks']['crop']['status']} |"
            )

    lines.extend(["", "## 未完成项", ""])
    if catalog["pending"]:
        lines.extend(f"- {entry}" for entry in catalog["pending"])
    else:
        lines.append("- 无。")
    lines.extend(["", "## 错误", ""])
    if catalog["errors"]:
        lines.extend(f"- {entry}" for entry in catalog["errors"])
    else:
        lines.append("- 无。")
    lines.extend(
        [
            "",
            "## 复跑",
            "",
            "```bash",
            "python3 scripts/build_static_art_catalog.py",
            "```",
            "",
            "退出码仅在必需文件、真源集合或已承诺的切片/Alpha/锚点合同出错时为非零；A/C 与审批卡扩展未完成只显示 `pending`。",
            "",
        ]
    )
    README_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    item_type_ids = parse_union("ItemId")
    relic_ids = parse_relic_ids()
    enemy_types = parse_union("EnemyType")

    source_errors: list[str] = []
    if set(item_type_ids) != set(relic_ids) or len(item_type_ids) != len(relic_ids):
        source_errors.append(
            "ItemId/relic source mismatch: "
            f"typesOnly={sorted(set(item_type_ids) - set(relic_ids))} "
            f"relicsOnly={sorted(set(relic_ids) - set(item_type_ids))}"
        )
    item_ids = relic_ids

    collections_in_order = [
        build_hero_master(),
        build_hero_actions(),
        build_profiles(),
        build_item_semantics(item_ids),
        build_item_icons(item_ids),
        build_ac_reference(),
        build_optional_ac_complete(item_ids),
        build_optional_manifestation_cards(item_ids),
        build_enemies(enemy_types),
        build_scenes(),
        build_vfx_ui(),
    ]
    collections = {collection["key"]: collection for collection in collections_in_order}

    errors = list(source_errors)
    pending: list[str] = []
    for collection in collections_in_order:
        if collection["required"]:
            errors.extend(f"{collection['key']}: {message}" for message in collection["errors"])
        pending.extend(f"{collection['key']}: {message}" for message in collection["pending"])

    warnings = []
    if len(item_ids) != TARGET_TEXT_ITEM_COUNT:
        warnings.append(
            f"target text says {TARGET_TEXT_ITEM_COUNT} items; source truth contains {len(item_ids)}; source truth wins"
        )
    status = "error" if errors else "complete_with_pending_extensions" if pending else "complete"
    catalog = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "repository": str(ROOT),
        "scope": "static art approval catalog only; no runtime mutation",
        "coordinateConvention": {
            "origin": "top-left",
            "indices": "zero-based",
            "rectFormat": ["x", "y", "width", "height"],
            "heroRoot": list(HERO_ROOT),
        },
        "sourceTruth": {
            "items": {
                "typesPath": path_pair(TYPES_PATH),
                "relicsPath": path_pair(RELICS_PATH),
                "targetTextCount": TARGET_TEXT_ITEM_COUNT,
                "count": len(item_ids),
                "ids": item_ids,
                "typesOrder": item_type_ids,
                "setsMatch": not source_errors,
            },
            "enemies": {
                "typesPath": path_pair(TYPES_PATH),
                "count": len(enemy_types),
                "ids": enemy_types,
                "phaseVariantRows": ["silent-father-p2"],
            },
            "artDirection": path_pair(ART_DIRECTION_PATH),
        },
        "summary": {
            "status": status,
            "collectionCount": len(collections),
            "completeCollections": sum(collection["status"] == "complete" for collection in collections_in_order),
            "pendingCollections": sum(collection["status"] == "pending" for collection in collections_in_order),
            "errorCollections": sum(collection["status"] == "error" for collection in collections_in_order),
            "requiredCollections": sum(collection["required"] for collection in collections_in_order),
        },
        "collections": collections,
        "warnings": warnings,
        "pending": pending,
        "errors": errors,
    }
    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_readme(catalog)
    print(json.dumps({
        "catalog": relative(CATALOG_PATH),
        "readme": relative(README_PATH),
        "status": status,
        "collections": catalog["summary"],
        "pending": len(pending),
        "errors": len(errors),
    }, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
