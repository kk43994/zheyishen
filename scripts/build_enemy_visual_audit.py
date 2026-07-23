#!/usr/bin/env python3
"""Render every actually loaded enemy atlas into one static visual audit."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "art-audit-v1"
FRAME = 32
SCALE = 3
MOTIONS = (("IDLE", 0), ("MOVE", 1), ("ATTACK", 2), ("HURT", 3), ("DEATH", 4))
RUNTIME_ATLASES = (
    ("fear", "src/assets/enemies/fear.png"),
    ("red-mark", "src/assets/enemies/red-mark.png"),
    ("whisper", "src/assets/enemies/whisper.png"),
    ("clockwork", "src/assets/enemies/clockwork.png"),
    ("debt", "src/assets/enemies/debt.png"),
    ("silent-father", "src/assets/enemies/silent-father.png"),
    ("silent-father-p2", "src/assets/enemies/silent-father-p2.png"),
    ("lamp-keeper", "src/assets/enemies/lamp-keeper.png"),
    ("uniform-answer", "src/assets/canonical-v1/enemies/uniform-answer.png"),
    ("cry-moth", "src/assets/enemies/cry-moth.png"),
    ("hunger-shadow", "src/assets/canonical-v1/enemies/hunger-shadow.png"),
    ("closet-dark", "src/assets/enemies/closet-dark.png"),
    ("missed-call", "src/assets/enemies/missed-call.png"),
    ("silence", "src/assets/enemies/silence.png"),
    ("badge-thief", "src/assets/enemies/badge-thief.png"),
    ("debt-collector", "src/assets/enemies/debt-collector.png"),
    ("forgetter", "src/assets/enemies/forgetter.png"),
    ("empty-chair", "src/assets/enemies/empty-chair.png"),
    ("last-bus", "src/assets/enemies/last-bus.png"),
)


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (Path("/System/Library/Fonts/Monaco.ttf"), Path("/System/Library/Fonts/Supplemental/Arial.ttf")):
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    label_w = 132
    motion_w = FRAME * SCALE
    panel_w = label_w + motion_w * len(MOTIONS) + 18
    row_h = motion_w + 28
    header_h = 42
    rows_per_panel = 10
    gap = 20
    canvas = Image.new("RGB", (panel_w * 2 + gap, header_h + rows_per_panel * row_h), "#111116")
    draw = ImageDraw.Draw(canvas)
    entries: list[dict[str, object]] = []
    for panel in range(2):
        panel_x = panel * (panel_w + gap)
        for index, (motion, _row) in enumerate(MOTIONS):
            draw.text((panel_x + label_w + index * motion_w + 8, 13), motion, fill="#AAA297", font=font(10))

    for index, (name, relative) in enumerate(RUNTIME_ATLASES):
        panel = index // rows_per_panel
        row = index % rows_per_panel
        panel_x = panel * (panel_w + gap)
        top = header_h + row * row_h
        draw.rectangle((panel_x, top, panel_x + panel_w - 1, top + row_h - 4), fill="#1B1A20")
        draw.text((panel_x + 8, top + 9), name, fill="#D8D0C1", font=font(11))
        atlas_path = ROOT / relative
        atlas = Image.open(atlas_path).convert("RGBA")
        if atlas.size != (128, 160):
            raise ValueError(f"wrong enemy atlas size: {relative} {atlas.size}")
        motion_metrics: dict[str, object] = {}
        for motion_index, (motion, atlas_row) in enumerate(MOTIONS):
            frame = atlas.crop((0, atlas_row * FRAME, FRAME, (atlas_row + 1) * FRAME))
            bbox = frame.getchannel("A").getbbox()
            if bbox is None:
                raise ValueError(f"empty enemy frame: {name}/{motion}")
            colors = {pixel[:3] for pixel in frame.getdata() if pixel[3]}
            motion_metrics[motion.lower()] = {
                "bbox": list(bbox),
                "size": [bbox[2] - bbox[0], bbox[3] - bbox[1]],
                "opaquePixels": sum(1 for pixel in frame.getdata() if pixel[3]),
                "colors": len(colors),
            }
            enlarged = frame.resize((motion_w, motion_w), Image.Resampling.NEAREST)
            x = panel_x + label_w + motion_index * motion_w
            y = top + 12
            canvas.paste(enlarged.convert("RGB"), (x, y), enlarged.getchannel("A"))
        entries.append({"id": name, "runtimePath": relative, "motions": motion_metrics})

    output_path = OUT / "enemy-runtime-all-19-contact-3x.png"
    canvas.save(output_path, optimize=True)
    (OUT / "enemy-runtime-all-19-manifest.json").write_text(
        json.dumps({"count": len(entries), "runtimePromoted": True, "enemies": entries}, indent=2),
        encoding="utf-8",
    )
    print(f"audited {len(entries)} runtime enemy atlases -> {output_path}")


if __name__ == "__main__":
    main()
