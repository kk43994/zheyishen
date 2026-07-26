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
python3 scripts/validate_mobile_ui.py
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
rm -f dist/assets/audio/ambience/*.wav

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
