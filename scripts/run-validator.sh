#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
validator_source="$project_dir/reference/platform/interact-creation/scripts/h5-validator"
validator_temp_dir="$(mktemp -d)"
trap 'rm -rf "$validator_temp_dir"' EXIT

cp "$validator_source" "$validator_temp_dir/h5-validator.cjs"
validator_log="$validator_temp_dir/h5-validator.log"
validator_args=("$@")

has_output=false
for argument in "$@"; do
  if [[ "$argument" == "--output" || "$argument" == "-o" ]]; then
    has_output=true
    break
  fi
done

scan_path="${@: -1}"
if [[ "$has_output" == false && "$scan_path" == *.zip ]]; then
  validator_args+=(--output "$validator_temp_dir/extracted")
fi

set +e
SCAN_H5_CLI=1 node "$validator_temp_dir/h5-validator.cjs" "${validator_args[@]}" 2>&1 | tee "$validator_log"
validator_status=${PIPESTATUS[0]}
set -e

if (( validator_status != 0 )); then
  exit "$validator_status"
fi

# h5-validator 1.0.1 reports block errors in its output but still exits 0.
if grep -q '校验失败' "$validator_log"; then
  exit 1
fi
