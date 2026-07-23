#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
release_dir="$project_dir/release"
archive_name="zhe-yi-shen-mvp.zip"

cd "$project_dir"
python3 scripts/validate_runtime_art.py
python3 scripts/validate_mobile_ui.py
npm run build
bash scripts/run-validator.sh --required index.html --max-size 104857600 dist
mkdir -p "$release_dir"
rm -f "$release_dir/$archive_name"
cd dist
/usr/bin/zip -q -r -X "$release_dir/$archive_name" .
cd "$project_dir"
bash scripts/run-validator.sh --required index.html --max-size 104857600 "$release_dir/$archive_name"
printf '%s\n' "$release_dir/$archive_name"
