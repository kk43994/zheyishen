#!/usr/bin/env python3
"""Blind-transcribe pronunciation candidates and promote the best passing take."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

import mlx_whisper

from voice_asr_audit import duration_seconds, edit_distance, normalize, pronunciation_tokens

MODEL = "mlx-community/whisper-large-v3-turbo-4bit"


def main() -> None:
    root = Path(sys.argv[1])
    candidate_dir = root / "tmp/voice-candidates"
    candidates = json.loads((candidate_dir / "manifest.json").read_text(encoding="utf-8"))
    production_manifest_path = root / "public/assets/audio/voice/manifest.json"
    production_entries = json.loads(production_manifest_path.read_text(encoding="utf-8"))
    production_by_id = {entry["id"]: entry for entry in production_entries}
    report = []

    for index, candidate in enumerate(candidates, start=1):
        path = root / candidate["file"]
        result = mlx_whisper.transcribe(
            str(path), path_or_hf_repo=MODEL, language="zh", task="transcribe",
            temperature=0, condition_on_previous_text=False, verbose=False,
        )
        expected = normalize(candidate["text"])
        actual = normalize(result["text"])
        expected_pronunciation = pronunciation_tokens(expected)
        actual_pronunciation = pronunciation_tokens(actual)
        error_rate = edit_distance(expected_pronunciation, actual_pronunciation) / max(1, len(expected_pronunciation))
        item = {**candidate, "transcript": result["text"].strip(), "pronunciationErrorRate": round(error_rate, 4)}
        report.append(item)
        print(f"[voice-candidate-qa] {index:02}/{len(candidates):02} PER={error_rate:.1%} {candidate['id']} {candidate['name']}: {item['transcript']}", flush=True)

    selected = {}
    for cue_id in sorted({candidate["id"] for candidate in candidates}):
        choices = [candidate for candidate in report if candidate["id"] == cue_id]
        best = min(choices, key=lambda item: (item["pronunciationErrorRate"], item["priority"]))
        if best["pronunciationErrorRate"] > 0.08:
            print(f"[voice-candidate-qa] no passing candidate for {cue_id}", flush=True)
            continue
        source = root / best["file"]
        destination = root / "public/assets/audio/voice" / f"{cue_id}.mp3"
        shutil.copyfile(source, destination)
        payload = destination.read_bytes()
        entry = production_by_id[cue_id]
        entry.update({
            "voiceId": best["voiceId"],
            "durationMs": round(duration_seconds(destination) * 1000),
            "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
            "renderMode": "candidate-optimized",
            "candidateText": best["text"],
            "candidateQa": {"transcript": best["transcript"], "pronunciationErrorRate": best["pronunciationErrorRate"]},
        })
        selected[cue_id] = best
        print(f"[voice-candidate-qa] promoted {cue_id}: {best['name']} ({best['voiceId']})", flush=True)

    production_manifest_path.write_text(json.dumps(production_entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (candidate_dir / "qa-report.json").write_text(json.dumps({"selected": selected, "candidates": report}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
