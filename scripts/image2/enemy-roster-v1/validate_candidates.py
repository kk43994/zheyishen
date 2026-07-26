#!/usr/bin/env python3
"""Validate review-only enemy candidates without touching formal assets."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
TASK_DIR = ROOT / "scripts/image2/enemy-roster-v1"
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-enemy-roster-v1"
REVIEW_DIR = ROOT / "output/art-audit-loop/new-enemy-roster-v1"
MOTION_COUNTS = {"idle": 2, "move": 4, "attack": 2, "hurt": 2, "death": 4}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_selected_map() -> dict[str, str]:
    selected: dict[str, str] = {}
    for batch in ("a", "b"):
        payload = json.loads((TASK_DIR / f"batch-{batch}/manifest.json").read_text(encoding="utf-8"))
        for asset in payload["assets"]:
            selected[asset["id"]] = asset["selectedFrom"]
    payload = json.loads((OUT_DIR / "raw/batch-c/manifest.json").read_text(encoding="utf-8"))
    for job in payload["jobs"]:
        selected[job["assetId"]] = job["raw"]
    return selected


def validate() -> None:
    roster = json.loads((TASK_DIR / "roster.json").read_text(encoding="utf-8"))
    integration = json.loads((TASK_DIR / "integration-plan.json").read_text(encoding="utf-8"))
    review = json.loads((REVIEW_DIR / "manifest.json").read_text(encoding="utf-8"))
    assert roster["status"] == "approved-and-promoted"
    assert roster["promotionAllowed"] is True
    assert integration["promotionAllowed"] is True
    assert integration["status"] == "approved-and-promoted"
    assert review["promotionAllowed"] is True
    assert review["status"] == "approved-and-promoted"
    assert review["motions"] == MOTION_COUNTS

    specs = {asset["id"]: asset for asset in roster["assets"]}
    integration_entries = {entry["assetId"]: entry for entry in integration["entries"]}
    entries = {entry["id"]: entry for entry in review["entries"]}
    selected_map = load_selected_map()
    assert len(specs) == len(entries) == len(selected_map) == len(integration_entries) == 20
    assert set(specs) == set(entries) == set(selected_map) == set(integration_entries)
    assert len({entry["runtimePath"] for entry in integration_entries.values()}) == 20
    runtime_phases = {
        (entry["runtimeType"], entry["phase"])
        for entry in integration_entries.values()
        if entry["phase"] is not None
    }
    assert runtime_phases == {
        ("praise-chair", 1), ("praise-chair", 2),
        ("ringing-phone", 1), ("ringing-phone", 2),
    }

    atlas_files = set((OUT_DIR / "candidate-atlases").glob("*.png"))
    preview_files = set((OUT_DIR / "previews").glob("*.png"))
    assert len(atlas_files) == len(preview_files) == 20

    for asset_id, spec in specs.items():
        batch_dir = OUT_DIR / "raw" / f"batch-{spec['batch']}"
        selected = batch_dir / f"{asset_id}-selected.png"
        accepted_raw = batch_dir / selected_map[asset_id]
        assert selected.is_file() and accepted_raw.is_file()
        assert Image.open(selected).size == (1254, 1254)
        assert digest(selected) == digest(accepted_raw) == entries[asset_id]["sourceSha256"]

        frame = int(spec["frame"])
        atlas_path = OUT_DIR / "candidate-atlases" / f"{asset_id}.png"
        preview_path = OUT_DIR / "previews" / f"{asset_id}.png"
        atlas = Image.open(atlas_path).convert("RGBA")
        preview = Image.open(preview_path).convert("RGBA")
        assert atlas.size == (frame * 4, frame * 5)
        assert preview.size == (frame * 5, frame)
        assert digest(atlas_path) == entries[asset_id]["atlasSha256"]

        assert set(atlas.getchannel("A").getdata()) <= {0, 255}
        assert all(pixel == (0, 0, 0, 0) for pixel in atlas.getdata() if pixel[3] == 0)
        for row, (motion, count) in enumerate(MOTION_COUNTS.items()):
            for column in range(count):
                cell = atlas.crop((column * frame, row * frame, (column + 1) * frame, (row + 1) * frame))
                assert cell.getchannel("A").getbbox(), f"empty frame: {asset_id}/{motion}/{column}"

    for page in review["reviewPages"]:
        image = Image.open(REVIEW_DIR / page)
        assert image.size == (1436, 1202)
    assert review["runtimeScalePages"] == ["runtime-scale-review-1.png", "runtime-scale-review-2.png"]
    for page in review["runtimeScalePages"]:
        image = Image.open(REVIEW_DIR / page)
        assert image.size == (876, 1318)

    print("PASS: 20 selected sources, 20 atlases, 20 previews, 4 review boards")
    print("PASS: selected sources preserve accepted 1254x1254 Image2 PNG bytes")
    print("PASS: binary alpha, clean transparent RGB, complete motion cells")
    print("PASS: 20-entry integration plan covers 18 runtime identities and 4 phase routes")
    print("PASS: user approval is recorded and promotionAllowed=true")


if __name__ == "__main__":
    validate()
