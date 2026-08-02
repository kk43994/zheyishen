#!/usr/bin/env python3
"""Transcribe fixed voice assets and compare them with the production script."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import mlx_whisper
from opencc import OpenCC
from pypinyin import Style, lazy_pinyin

TAG_RE = re.compile(r"<#[\d.]+#>|\([a-z-]+\)")
NON_TEXT_RE = re.compile(r"[^\u4e00-\u9fffA-Za-z0-9]+")
DIGIT_RE = re.compile(r"\d+")
DIGITS = "零一二三四五六七八九"
TO_SIMPLIFIED = OpenCC("t2s")
MANUAL_REVIEW_IDS = {
    "hero-became-him",
    # 超短句 ASR 不可靠（散会/发什么呆），MiniMax 余额恢复后重掷再人工听
    "boss-meeting-over",
    "teacher-daydream",
}


def number_to_zh(value: str) -> str:
    number = int(value)
    if number < 10:
        return DIGITS[number]
    if number < 100:
        tens, ones = divmod(number, 10)
        return (DIGITS[tens] if tens > 1 else "") + "十" + (DIGITS[ones] if ones else "")
    return "".join(DIGITS[int(digit)] for digit in value)


def normalize(text: str) -> str:
    text = TO_SIMPLIFIED.convert(text)
    text = TAG_RE.sub("", text)
    text = DIGIT_RE.sub(lambda match: number_to_zh(match.group()), text)
    # Spoken-Chinese equivalences the scorer must not punish: "@" is read
    # aloud as 艾特, and northern erhua drops in transcription (这儿 -> 这).
    text = text.replace("@", "艾特")
    text = NON_TEXT_RE.sub("", text).lower()
    text = re.sub(r"(?<![a-z])at(?![a-z])", "艾特", text)
    return re.sub(r"(这|那|哪)儿", r"\1", text)


def pronunciation_tokens(text: str) -> list[str]:
    return lazy_pinyin(
        text,
        style=Style.TONE3,
        neutral_tone_with_five=True,
        errors=lambda value: list(value),
    )


def edit_distance(left, right) -> int:
    previous = list(range(len(right) + 1))
    for row, left_char in enumerate(left, start=1):
        current = [row]
        for column, right_char in enumerate(right, start=1):
            current.append(min(
                current[-1] + 1,
                previous[column] + 1,
                previous[column - 1] + (left_char != right_char),
            ))
        previous = current
    return previous[-1]


def duration_seconds(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def main() -> None:
    contract = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    root = Path(contract["root"])
    report_path = root / "public/assets/audio/voice/qa-report.json"
    previous = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else []
    report_by_id = {entry["id"]: entry for entry in previous}
    print(f"[voice-qa] loading {contract['model']}", flush=True)
    for index, cue in enumerate(contract["cues"], start=1):
        audio_path = root / "public" / cue["file"]
        result = mlx_whisper.transcribe(
            str(audio_path),
            path_or_hf_repo=contract["model"],
            language="zh",
            task="transcribe",
            temperature=0,
            condition_on_previous_text=False,
            verbose=False,
        )
        expected = normalize(cue["text"])
        transcript = result["text"].strip()
        actual = normalize(transcript)
        breath_tags = {"breath", "inhale", "exhale", "sighs", "gasps"}
        if breath_tags & set(re.findall(r"\(([a-z-]+)\)", cue["text"])):
            # Audible breaths render as filler syllables in ASR; they are the
            # performance working, not a wrong word.
            actual = re.sub(r"^[啊嗯唉]+", "", actual)
        distance = edit_distance(expected, actual)
        cer = distance / max(1, len(expected))
        expected_pronunciation = pronunciation_tokens(expected)
        actual_pronunciation = pronunciation_tokens(actual)
        pronunciation_distance = edit_distance(expected_pronunciation, actual_pronunciation)
        pronunciation_error_rate = pronunciation_distance / max(1, len(expected_pronunciation))
        duration = duration_seconds(audio_path)
        pause_seconds = sum(float(value) for value in re.findall(r"<#([\d.]+)#>", cue["text"]))
        speech_seconds = max(0.1, duration - pause_seconds - 0.2)
        chars_per_second = len(expected) / speech_seconds
        toneless_expected = [token.rstrip("12345") for token in expected_pronunciation]
        toneless_actual = [token.rstrip("12345") for token in actual_pronunciation]
        toneless_error_rate = edit_distance(toneless_expected, toneless_actual) / max(1, len(toneless_expected))
        # ASR tone judgments are unreliable; a tone-only mismatch is not a misreading.
        effective_rate = min(pronunciation_error_rate, toneless_error_rate)
        status = "pass" if effective_rate <= 0.08 else "review" if effective_rate <= 0.2 else "fail"
        if cue["id"] in MANUAL_REVIEW_IDS and status != "pass":
            status = "manual-review"
        entry = {
            "id": cue["id"],
            "expected": expected,
            "transcript": transcript,
            "normalizedTranscript": actual,
            "characterErrorRate": round(cer, 4),
            "pronunciationErrorRate": round(pronunciation_error_rate, 4),
            "durationSeconds": round(duration, 3),
            "charactersPerSecond": round(chars_per_second, 2),
            "status": status,
        }
        report_by_id[cue["id"]] = entry
        print(
            f"[voice-qa] {index:02}/{len(contract['cues']):02} {status:6} "
            f"PER={pronunciation_error_rate:.1%} CER={cer:.1%} {cue['id']}: {transcript}",
            flush=True,
        )
        ordered_report = [report_by_id[cue_id] for cue_id in contract["cueOrder"] if cue_id in report_by_id]
        report_path.write_text(json.dumps(ordered_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    requested = [report_by_id[cue["id"]] for cue in contract["cues"]]
    passed = sum(item["status"] == "pass" for item in requested)
    review = sum(item["status"] == "review" for item in requested)
    manual = sum(item["status"] == "manual-review" for item in requested)
    failed = sum(item["status"] == "fail" for item in requested)
    print(f"[voice-qa] requested: pass {passed}; review {review}; manual {manual}; fail {failed}", flush=True)


if __name__ == "__main__":
    main()
