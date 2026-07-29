#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
sfx_dir="$project_dir/public/assets/audio/sfx"
ambience_dir="$project_dir/public/assets/audio/ambience"
music_dir="$project_dir/public/assets/audio/music"
ffmpeg_bin="${FFMPEG_BIN:-$(command -v ffmpeg || true)}"

if [[ -z "$ffmpeg_bin" ]]; then
  missing=false
  for source in "$sfx_dir"/*.wav "$ambience_dir"/*.wav "$music_dir"/*.wav; do
    if [[ ! -f "${source%.wav}.mp3" ]]; then
      missing=true
      break
    fi
  done
  if [[ "$missing" == true ]]; then
    printf '%s\n' 'ffmpeg is required to build missing production audio files' >&2
    exit 1
  fi
  printf '%s\n' 'ffmpeg unavailable; using existing production audio files'
  exit 0
fi

for source in "$sfx_dir"/*.wav; do
  target="${source%.wav}.mp3"
  if [[ ! -f "$target" || "$source" -nt "$target" ]]; then
    "$ffmpeg_bin" -nostdin -hide_banner -loglevel error -y \
      -i "$source" -map_metadata -1 -ac 1 -ar 22050 \
      -codec:a libmp3lame -b:a 64k "$target"
  fi
done

for source in "$ambience_dir"/*.wav; do
  target="${source%.wav}.mp3"
  if [[ ! -f "$target" || "$source" -nt "$target" ]]; then
    "$ffmpeg_bin" -nostdin -hide_banner -loglevel error -y \
      -i "$source" -map_metadata -1 -ac 1 -ar 22050 \
      -codec:a libmp3lame -b:a 64k "$target"
  fi
done

for source in "$music_dir"/*.wav; do
  target="${source%.wav}.mp3"
  if [[ ! -f "$target" || "$source" -nt "$target" ]]; then
    "$ffmpeg_bin" -nostdin -hide_banner -loglevel error -y \
      -i "$source" -map_metadata -1 -ac 1 -ar 22050 \
      -codec:a libmp3lame -b:a 32k "$target"
  fi
done

printf '%s\n' 'production audio ready: 13 sfx + 6 ambience loops at 64 kbps + 9 music loops at 32 kbps'
