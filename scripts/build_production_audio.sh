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

# ── 循环体烘焙 ──
# 无感循环的内容层条件：接缝两侧必须是同一段材料。把「循环点起往后 X 秒」的内容
# 等功率(hsin)烘进曲尾最后 X 秒——曲尾淡出的同时循环点材料淡入，跳回循环点那一刻
# 听到的正是刚刚已经在响的东西。运行时的双元素换岗（audio-platform ensureLoopPatrol）
# 只负责盖住 mp3 编码器的补零间隙，调性连续必须在这里烘出来。
# 循环点表与 src/audio-platform.ts 的 MUSIC_LOOP_START 一致：under-bed 有 3 秒前奏，
# 其余曲目与全部环境床从 0.02 循环。
ffprobe_bin="${FFPROBE_BIN:-$(command -v ffprobe || true)}"

bake_loop() { # bake_loop <wav> <mp3> <bitrate> <loop_start> <overlap> [fade_duration]
  local source="$1" target="$2" bitrate="$3" ls="$4" x="$5" fade_duration="${6:-$5}"
  if [[ -z "$ffprobe_bin" ]]; then
    # 没有 ffprobe 拿不到时长：退回直编（与旧行为一致），循环靠运行时换岗兜底。
    "$ffmpeg_bin" -nostdin -hide_banner -loglevel error -y \
      -i "$source" -map_metadata -1 -ac 1 -ar 22050 \
      -codec:a libmp3lame -b:a "$bitrate" "$target"
    return
  fi
  local duration main_end head_end
  duration="$("$ffprobe_bin" -v error -show_entries format=duration -of csv=p=0 "$source")"
  main_end="$(awk "BEGIN{printf \"%.4f\", $duration - $x}")"
  head_end="$(awk "BEGIN{printf \"%.4f\", $ls + $x}")"
  if awk "BEGIN{exit !($main_end <= $head_end)}"; then
    # 曲子太短烘不开：直编。
    "$ffmpeg_bin" -nostdin -hide_banner -loglevel error -y \
      -i "$source" -map_metadata -1 -ac 1 -ar 22050 \
      -codec:a libmp3lame -b:a "$bitrate" "$target"
    return
  fi
  "$ffmpeg_bin" -nostdin -hide_banner -loglevel error -y \
    -i "$source" -filter_complex \
    "[0:a]atrim=end=${main_end},asetpts=PTS-STARTPTS[main];\
[0:a]atrim=start=${main_end},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${fade_duration}:curve=hsin[tail];\
[0:a]atrim=start=${ls}:end=${head_end},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fade_duration}:curve=hsin[head];\
[tail][head]amix=inputs=2:duration=first:normalize=0[seam];\
[main][seam]concat=n=2:v=0:a=1[out]" \
    -map "[out]" -map_metadata -1 -ac 1 -ar 22050 \
    -codec:a libmp3lame -b:a "$bitrate" "$target"
}

for source in "$ambience_dir"/*.wav; do
  target="${source%.wav}.mp3"
  if [[ ! -f "$target" || "$source" -nt "$target" || "$0" -nt "$target" ]]; then
    # 平台在曲尾前 0.18s 提前 seek；交叉淡化须在该点前完成，使跳转两侧都是
    # 同一段纯 head 波形，而不是突然切掉尚未淡尽的 tail。
    bake_loop "$source" "$target" 96k 0.02 0.8 0.62
  fi
done

for source in "$music_dir"/*.wav; do
  target="${source%.wav}.mp3"
  loop_start=0.02
  fade_duration=1.0
  [[ "$(basename "$source")" == "under-bed.wav" ]] && loop_start=3
  # pressure 是单元素紧张层，同样在曲尾前 0.18s seek；其余十首主配乐走双元素
  # 0.55s 换岗，保留完整 1.0s 烘焙淡化。
  [[ "$(basename "$source")" == "pressure.wav" ]] && fade_duration=0.82
  if [[ ! -f "$target" || "$source" -nt "$target" || "$0" -nt "$target" ]]; then
    # 64k：96k 曾把 11 首配乐撑到 3.28MB，整包 8,846,263 字节超出平台 8,388,608 硬限
    # （2026-07-29 实测 413）。64k 单声道对这批暗色氛围曲仍是历史出货 32k 的两倍质量。
    bake_loop "$source" "$target" 64k "$loop_start" 1.0 "$fade_duration"
  fi
done

sfx_count="$(find "$sfx_dir" -maxdepth 1 -name '*.mp3' | wc -l | tr -d ' ')"
ambience_count="$(find "$ambience_dir" -maxdepth 1 -name '*.mp3' | wc -l | tr -d ' ')"
music_count="$(find "$music_dir" -maxdepth 1 -name '*.mp3' | wc -l | tr -d ' ')"
printf 'production audio ready: %s sfx + %s ambience loops at 96 kbps + %s music loops at 64 kbps\n' \
  "$sfx_count" "$ambience_count" "$music_count"
