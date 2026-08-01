#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
release_dir="$project_dir/release"
archive_name="zhe-yi-shen-mvp.zip"

cd "$project_dir"
npm run build:production-audio
npm run validate:sound
npm run validate:release-icon
python3 scripts/validate_runtime_art.py
npm run validate:boss-skills
python3 scripts/validate_mobile_ui.py
npm run validate:projectiles
npm run validate:late-bosses
npm run validate:phone-story
npm run validate:voice-timeline
npm run validate:ledger
npm run validate:fate-background
npm run validate:fate-residue
npm run validate:fate-age
npm run validate:fate-randomness
npm run validate:interactive-ai
npm run validate:scene
npm run validate:wiki-boss-gallery
npm run validate:enemy-separation
npm run validate:runtime-foundations
npm run validate:art-gate
npm run validate:childhood-boss
npm run validate:childhood-enemies
npm run validate:adulthood-enemies
npm run validate:school-work-enemies
npm run validate:youth-commute-enemies
npm run validate:youth-task-enemies
npm run validate:collector-boss
npm run validate:middle-age-enemies
npm run validate:old-age-enemies
npm run build

# Review-only pages and production metadata are useful locally but must not
# enter the offline Interactive Space package.
rm -f \
  dist/item-art-review.html \
  dist/voice-review.html \
  dist/assets/icons.png \
  dist/assets/audio/sound-manifest.json \
  dist/assets/audio/voice/manifest.json \
  dist/assets/audio/voice/qa-report.json
rm -rf dist/assets/audio/voice-concepts
rm -rf dist/assets/audio/voice-review
rm -f dist/assets/audio/ambience/*.wav
rm -f dist/assets/audio/music/*.wav
rm -f dist/assets/audio/sfx/*.wav

# 图片无损瘦身：PNG → 无损 WebP，只接受像素级完全一致的结果，并改写产物引用。
# 放在这里而不是改源码——src 里 226 处 .png 引用与美术门禁 72 处路径断言都不必动。
python3 scripts/optimize_release_assets.py dist

# 平台包硬上限 8 MiB：public 里保留声音母版，只压缩 dist 副本。
# 对白 24 kbps 单声道（22.05 kHz）——用户两次裁决「不需要那么清楚的语音、可以再差一点」，
# 换更短的首次加载与更小的解码开销；配乐与环境音都在人声后方，同为 24 kbps 单声道。
# 环境音此前压根没被转码过（570KB 原始码率进包），是最划算的一刀。
# 三者都不改变时长、响度、混音增益或任何触发内容。
ffmpeg_bin="${FFMPEG_BIN:-ffmpeg}"
if ! command -v "$ffmpeg_bin" >/dev/null 2>&1; then
  printf '%s\n' "package.sh: ffmpeg unavailable (set FFMPEG_BIN); release audio downscale is required for the platform budget" >&2
  exit 1
fi
shopt -s nullglob
voice_files=(dist/assets/audio/voice/*.mp3)
shopt -u nullglob
if [ "${#voice_files[@]}" -eq 0 ]; then
  printf '%s\n' 'package.sh: no voice mp3 files found in dist; build output is incomplete' >&2
  exit 1
fi
for voice_file in "${voice_files[@]}"; do
  case "$voice_file" in
    # 收灯人成品混音（远近双声场）不重压：24k 单声道会把叠声压塌，而五个文件合计
    # 只有 ~131KB。它们是运行时 playbackFile 实际引用的文件，必须原样随包。
    *.ethereal-v2.mp3) continue ;;
  esac
  "$ffmpeg_bin" -nostdin -hide_banner -loglevel error -y -i "$voice_file" \
    -map_metadata -1 -ac 1 -ar 22050 -codec:a libmp3lame -b:a 24k \
    "${voice_file%.mp3}.tmp.mp3"
  mv "${voice_file%.mp3}.tmp.mp3" "$voice_file"
done

shopt -s nullglob
music_files=(dist/assets/audio/music/*.mp3)
shopt -u nullglob
if [ "${#music_files[@]}" -eq 0 ]; then
  printf '%s\n' 'package.sh: no music mp3 files found in dist; build output is incomplete' >&2
  exit 1
fi
for music_file in "${music_files[@]}"; do
  "$ffmpeg_bin" -nostdin -hide_banner -loglevel error -y -i "$music_file" \
    -map_metadata -1 -ac 1 -ar 22050 -codec:a libmp3lame -b:a 24k \
    "${music_file%.mp3}.tmp.mp3"
  mv "${music_file%.mp3}.tmp.mp3" "$music_file"
done

shopt -s nullglob
ambience_files=(dist/assets/audio/ambience/*.mp3)
shopt -u nullglob
if [ "${#ambience_files[@]}" -eq 0 ]; then
  printf '%s\n' 'package.sh: no ambience mp3 files found in dist; build output is incomplete' >&2
  exit 1
fi
for ambience_file in "${ambience_files[@]}"; do
  "$ffmpeg_bin" -nostdin -hide_banner -loglevel error -y -i "$ambience_file" \
    -map_metadata -1 -ac 1 -ar 22050 -codec:a libmp3lame -b:a 24k \
    "${ambience_file%.mp3}.tmp.mp3"
  mv "${ambience_file%.mp3}.tmp.mp3" "$ambience_file"
done

npm run validate:release-budget
bash scripts/run-validator.sh --required index.html --max-size 20971520 dist
mkdir -p "$release_dir"
rm -f "$release_dir/$archive_name"
cd dist
/usr/bin/zip -q -r -X "$release_dir/$archive_name" .
cd "$project_dir"
bash scripts/run-validator.sh --required index.html --max-size 20971520 "$release_dir/$archive_name"
npm run sync:release-metadata
printf '%s\n' "$release_dir/$archive_name"
