#!/usr/bin/env python3
"""Generate pronunciation candidates for short Kokoro lines without touching production."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch
from kokoro import KModel, KPipeline

from kokoro_tts_worker import encode_mp3, synthesize

CANDIDATES = {
    "father-childhood-walk": [
        ("same-period", "zm_009", "走吧。"),
        ("same-exclaim", "zm_009", "走吧！"),
        ("same-ellipsis", "zm_009", "走吧……"),
        ("alternate-period", "zm_012", "走吧。"),
        ("alternate-020", "zm_020", "走吧。"),
        ("alternate-025", "zm_025", "走吧。"),
        ("alternate-029", "zm_029", "走吧。"),
        ("alternate-010", "zm_010", "走吧。"),
    ],
    "self-stand-straight": [
        ("same-period", "zm_020", "站好。"),
        ("same-exclaim", "zm_020", "站好！"),
        ("same-separated", "zm_020", "站，好。"),
        ("alternate-period", "zm_029", "站好。"),
    ],
    "lamp-pockets-empty": [
        ("same-period", "zm_010", "口袋空了。再看看手里。"),
        ("same-comma", "zm_010", "口袋空了，再看看手里。"),
        ("same-ellipsis", "zm_010", "口袋空了……再看看手里。"),
        ("alternate-period", "zm_012", "口袋空了。再看看手里。"),
    ],
    "hero-not-busy": [
        ("same-029", "zm_029", "没事。<#0.42#>不忙。"),
        ("alternate-020", "zm_020", "没事。<#0.42#>不忙。"),
        ("alternate-025", "zm_025", "没事。<#0.42#>不忙。"),
        ("alternate-012", "zm_012", "没事。<#0.42#>不忙。"),
        ("alternate-009", "zm_009", "没事。<#0.42#>不忙。"),
        ("alternate-010", "zm_010", "没事。<#0.42#>不忙。"),
        ("alternate-011", "zm_011", "没事。<#0.42#>不忙。"),
    ],
}


def main() -> None:
    contract = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    root = Path(contract["root"])
    cues = {cue["id"]: cue for cue in contract["cues"]}
    output_dir = root / "tmp/voice-candidates"
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata = []

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = KModel(repo_id="hexgrad/Kokoro-82M-v1.1-zh").to(device).eval()
    pipeline = KPipeline(lang_code="z", repo_id="hexgrad/Kokoro-82M-v1.1-zh", model=model)
    for cue_id, candidates in CANDIDATES.items():
        if cue_id not in cues:
            continue
        cue = cues[cue_id]
        for priority, (name, voice_id, text) in enumerate(candidates):
            candidate = {**cue, "text": text}
            audio = synthesize(pipeline, candidate, voice_id)
            path = output_dir / f"{cue_id}--{name}.mp3"
            encode_mp3(audio, path)
            metadata.append({
                "id": cue_id,
                "name": name,
                "priority": priority,
                "voiceId": voice_id,
                "text": text,
                "file": str(path.relative_to(root)),
            })
            print(f"[voice-candidate] {cue_id} {name} {voice_id}: {text}", flush=True)
    (output_dir / "manifest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
