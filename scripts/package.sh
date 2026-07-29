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
rm -f dist/assets/audio/sfx/*.wav

# 语音发布档降码率：public 里保留 64k 母版，进包统一转 56k 单声道（听感差异
# 可忽略，省约 300KB——8MB 硬限下的常备腾挪位）。
ffmpeg_bin="${FFMPEG_BIN:-ffmpeg}"
if ! command -v "$ffmpeg_bin" >/dev/null 2>&1; then
  printf '%s\n' "package.sh: ffmpeg unavailable (set FFMPEG_BIN); voice bitrate downscale is required for the release budget" >&2
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
  "$ffmpeg_bin" -hide_banner -loglevel error -y -i "$voice_file" -ac 1 -b:a 56k "${voice_file%.mp3}.tmp.mp3"
  mv "${voice_file%.mp3}.tmp.mp3" "$voice_file"
done

npm run validate:release-budget
bash scripts/run-validator.sh --required index.html --max-size 8388608 dist
mkdir -p "$release_dir"
rm -f "$release_dir/$archive_name"
cd dist
/usr/bin/zip -q -r -X "$release_dir/$archive_name" .
cd "$project_dir"
bash scripts/run-validator.sh --required index.html --max-size 8388608 "$release_dir/$archive_name"
npm run sync:release-metadata
printf '%s\n' "$release_dir/$archive_name"
