#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
ambience_dir="$project_dir/public/assets/audio/ambience"
ffmpeg_bin="${FFMPEG_BIN:-$(command -v ffmpeg || true)}"

if [[ -z "$ffmpeg_bin" ]]; then
  missing=false
  for source in "$ambience_dir"/*.wav; do
    if [[ ! -f "${source%.wav}.mp3" ]]; then
      missing=true
      break
    fi
  done
  if [[ "$missing" == true ]]; then
    printf '%s\n' 'ffmpeg is required to build missing production ambience files' >&2
    exit 1
  fi
  printf '%s\n' 'ffmpeg unavailable; using existing production ambience files'
  exit 0
fi

for source in "$ambience_dir"/*.wav; do
  target="${source%.wav}.mp3"
  if [[ ! -f "$target" || "$source" -nt "$target" ]]; then
    "$ffmpeg_bin" -nostdin -hide_banner -loglevel error -y \
      -i "$source" -map_metadata -1 -ac 1 -ar 22050 \
      -codec:a libmp3lame -b:a 64k "$target"
  fi
done

printf '%s\n' 'production ambience ready: 6 mono MP3 loops at 64 kbps'
