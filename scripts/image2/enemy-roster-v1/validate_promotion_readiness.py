#!/usr/bin/env python3
"""Read-only gate for the approved and promoted enemy roster."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TASK_DIR = ROOT / "scripts/image2/enemy-roster-v1"
OUT_DIR = ROOT / "output/imagegen/zhe-yi-shen-enemy-roster-v1"


def main() -> None:
    plan = json.loads((TASK_DIR / "integration-plan.json").read_text(encoding="utf-8"))
    assert plan["status"] == "approved-and-promoted"
    assert plan["promotionAllowed"] is True
    renderer = (ROOT / "src/enemy-pixel.ts").read_text(encoding="utf-8")
    wiki = (ROOT / "docs/这一身百科.html").read_text(encoding="utf-8")

    entries = plan["entries"]
    assert len(entries) == 20
    paths = [entry["runtimePath"] for entry in entries]
    assert len(paths) == len(set(paths))
    identities = Counter(entry["runtimeType"] for entry in entries)
    assert len(identities) == 18
    assert identities["praise-chair"] == identities["ringing-phone"] == 2
    assert all(count == 1 for identity, count in identities.items() if identity not in {"praise-chair", "ringing-phone"})

    phase_routes = {
        (entry["runtimeType"], entry["phase"], entry["assetId"])
        for entry in entries if entry["phase"] is not None
    }
    assert phase_routes == {
        ("praise-chair", 1, "praise-chair-p1"),
        ("praise-chair", 2, "praise-chair-p2"),
        ("ringing-phone", 1, "ringing-phone-p1"),
        ("ringing-phone", 2, "ringing-phone-p2"),
    }

    missing_candidates: list[str] = []
    missing_targets: list[str] = []
    changed_targets: list[str] = []
    missing_routes: list[str] = []
    leaked_proxies: list[str] = []
    unexpected_targets: list[str] = []
    for entry in entries:
        runtime_type = entry["runtimeType"]
        proxy = entry["currentProxy"]
        asset_id = entry["assetId"]
        source = OUT_DIR / "candidate-atlases" / f"{asset_id}.png"
        target = ROOT / entry["runtimePath"]
        if not source.is_file():
            missing_candidates.append(asset_id)
        if not target.is_file():
            missing_targets.append(entry["runtimePath"])
        elif source.is_file() and source.read_bytes() != target.read_bytes():
            changed_targets.append(entry["runtimePath"])
        if entry["phase"] is None and f"'{runtime_type}': '{asset_id}'" not in renderer:
            missing_routes.append(f"{runtime_type}->{asset_id}")
        if f"'{runtime_type}': '{proxy}'" in renderer and proxy != asset_id:
            leaked_proxies.append(f"{runtime_type}->{proxy}")
        if not entry["runtimePath"].endswith(f"/{asset_id}.png"):
            unexpected_targets.append(entry["runtimePath"])

    assert not missing_candidates, f"missing candidate atlases: {missing_candidates}"
    assert not missing_targets, f"missing promoted atlases: {missing_targets}"
    assert not changed_targets, f"formal atlas differs from approved candidate: {changed_targets}"
    assert not missing_routes, f"dedicated runtime route missing: {missing_routes}"
    assert not leaked_proxies, f"old proxy mapping remains: {leaked_proxies}"
    assert not unexpected_targets, f"unexpected formal target paths: {unexpected_targets}"
    assert "enemy.type === 'praise-chair') return (enemy.phase ?? 1) === 2 ? 'praise-chair-p2' : 'praise-chair-p1'" in renderer
    assert "enemy.type === 'ringing-phone') return (enemy.phase ?? 1) === 2 ? 'ringing-phone-p2' : 'ringing-phone-p1'" in renderer
    for stale_copy in ("待独立管线图", "当前明确标记为占位", "衣架暂复用", "走马灯暂复用", "暂复用空椅"):
        assert stale_copy not in wiki, f"stale encyclopedia proxy copy: {stale_copy}"
    for entry in entries:
        asset_id = entry["assetId"]
        assert f"enemy-portraits-v1/{asset_id}.png" in wiki or asset_id in {"praise-chair-p1", "ringing-phone-p1"}

    print("PASS: 20 formal atlases exactly match the approved candidates")
    print("PASS: 18 runtime identities and four phase routes are dedicated")
    print("PASS: all old proxy mappings and placeholder copy are removed")
    print("PROMOTED: runtime, boss phases, portraits, and encyclopedia are synchronized")


if __name__ == "__main__":
    main()
