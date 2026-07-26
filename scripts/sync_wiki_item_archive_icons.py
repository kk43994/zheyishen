#!/usr/bin/env python3
"""Replace every legacy wiki archive drawing with its canonical atlas icon."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path


WIKI = Path("docs/这一身百科.html")
RUNTIME_STATUS = Path("docs/wiki-runtime-status-v1.js")
ICON_MANIFEST = Path("src/assets/items/icons.json")
ARCHIVE_START = '<div class="stage-h" id="wiki-item-archive">'
ARCHIVE_END = '<!-- 怪物图鉴 -->'


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKC", value).lower()
    return re.sub(r"[\s\"'“”‘’《》]", "", text)


def load_runtime_items() -> list[dict[str, object]]:
    source = RUNTIME_STATUS.read_text(encoding="utf-8")
    match = re.fullmatch(r"\s*window\.WIKI_RUNTIME_STATUS_V1\s*=\s*(\{.*\});\s*", source, re.DOTALL)
    if not match:
        raise AssertionError("unable to parse wiki runtime status")
    report = json.loads(match.group(1))
    items = report.get("items")
    if not isinstance(items, list) or len(items) != 77:
        raise AssertionError(f"expected 77 runtime items, got {len(items) if isinstance(items, list) else 0}")
    return items


def main() -> None:
    html = WIKI.read_text(encoding="utf-8")
    start = html.index(ARCHIVE_START)
    end = html.index(ARCHIVE_END, start)
    archive = html[start:end]

    items = load_runtime_items()
    icon_manifest = json.loads(ICON_MANIFEST.read_text(encoding="utf-8"))
    icon_index = icon_manifest.get("index", {})
    by_name = {normalize(str(item["name"])): item for item in items}
    if len(by_name) != 77:
        raise AssertionError("runtime item names must normalize to 77 unique keys")

    chunks = re.split(r'(?=<div class="item"(?:\s[^>]*)?>)', archive)
    linked_ids: set[str] = set()
    output: list[str] = []
    for chunk in chunks:
        if not re.match(r'<div class="item"(?:\s[^>]*)?>', chunk):
            output.append(chunk)
            continue

        name_match = re.search(r'<div class="nm">([^<]+)</div>', chunk)
        if not name_match:
            raise AssertionError("archive item card is missing its name")
        archive_name = name_match.group(1)
        item = by_name.get(normalize(archive_name))
        if not item:
            raise AssertionError(f"archive item has no runtime match: {archive_name}")

        item_id = str(item["id"])
        item_number = int(item["index"])
        atlas_index = icon_index.get(item_id)
        if atlas_index != item_number - 1:
            raise AssertionError(f"icon index mismatch for {item_id}: {atlas_index}")
        if item_id in linked_ids:
            raise AssertionError(f"archive item is duplicated: {item_id}")
        linked_ids.add(item_id)

        col = atlas_index % 8
        row = atlas_index // 8
        icon = (
            '<div class="art"><span class="archive-item-icon" aria-hidden="true" '
            f'style="--icon-col:{col};--icon-row:{row}"></span></div>'
        )
        chunk = re.sub(
            r'<div class="item"(?:\s[^>]*)?>',
            f'<div class="item" data-item-id="{item_id}" data-item-index="{item_number}">',
            chunk,
            count=1,
        )
        chunk, count = re.subn(
            r'(<div class="item"[^>]*><div class="top">).*?(<div><div class="nm">)',
            r"\1" + icon + r"\2",
            chunk,
            count=1,
            flags=re.DOTALL,
        )
        if count != 1:
            raise AssertionError(f"unable to replace archive art for {archive_name}")
        output.append(chunk)

    archive = "".join(output)
    if len(linked_ids) != 77:
        raise AssertionError(f"expected 77 linked archive items, got {len(linked_ids)}")
    if archive.count('class="archive-item-icon"') != 77:
        raise AssertionError("archive icon replacement is incomplete")
    if '<svg' in archive:
        raise AssertionError("archive still contains legacy SVG art")

    WIKI.write_text(html[:start] + archive + html[end:], encoding="utf-8")
    print("linked 77 canonical atlas icons into the narrative appearance archive")


if __name__ == "__main__":
    main()
