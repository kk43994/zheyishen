#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
validator_source="$project_dir/reference/platform/interact-creation/scripts/h5-validator"
validator_temp_dir="$(mktemp -d)"
trap 'rm -rf "$validator_temp_dir"' EXIT

cp "$validator_source" "$validator_temp_dir/h5-validator.cjs"
node "$validator_temp_dir/h5-validator.cjs" "$@"
