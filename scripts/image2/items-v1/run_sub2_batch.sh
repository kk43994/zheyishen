#!/usr/bin/env bash
set -euo pipefail

pipeline_dir="${PIPELINE_DIR:-/root/imagegen-pipeline}"
prompt_dir="$pipeline_dir/items-v1/prompts"
output_dir="$pipeline_dir/items-v1/output"
input_dir="$pipeline_dir/uniform-v1/input"
concurrency="${1:-4}"
run_mode="${2:-missing}"

: "${OPENAI_API_KEY:?OPENAI_API_KEY must be exported from the sub2 owner-pool auth store}"
: "${OPENAI_BASE_URL:?OPENAI_BASE_URL must point to the sub2 owner-pool endpoint}"

mkdir -p "$output_dir"

run_item_job() {
  local prompt="$1"
  local base output attempt
  base="$(basename "$prompt" .txt)"
  output="$output_dir/$base.png"

  if [[ "$base" == "10-small-uniform" || ( "$run_mode" != "redo" && -s "$output" ) ]]; then
    printf 'SKIP %s\n' "$base"
    return 0
  fi

  for attempt in 1 2 3; do
    printf 'START %s attempt=%s\n' "$base" "$attempt"
    local force_args=()
    if [[ "$run_mode" == "redo" ]]; then
      force_args+=(--force)
    fi
    if "$pipeline_dir/venv/bin/python" "$pipeline_dir/image_gen.py" edit \
      --model gpt-image-2 \
      --quality high \
      --size 1024x1024 \
      --output-format png \
      --no-augment \
      --image "$input_dir/canonical-style-board.png" \
      --image "$input_dir/hero-v2-b-modular-4dir.png" \
      --image "$input_dir/07-hero-v2-b-head-torso-parts.png" \
      --image "$input_dir/08-hero-v2-b-arm-parts.png" \
      --prompt-file "$prompt" \
      "${force_args[@]}" \
      --out "$output"; then
      printf 'DONE %s\n' "$base"
      return 0
    fi
    sleep "$((attempt * 5))"
  done

  printf 'FAILED %s\n' "$base" >&2
  return 1
}

export -f run_item_job
export pipeline_dir output_dir input_dir run_mode

if [[ "$run_mode" == "redo" ]]; then
  while IFS= read -r prompt_name; do
    [[ -n "$prompt_name" ]] && printf '%s\0' "$prompt_dir/$prompt_name"
  done < "$pipeline_dir/items-v1/redo.txt" \
    | xargs -0 -n 1 -P "$concurrency" bash -c 'run_item_job "$1"' _
else
  find "$prompt_dir" -maxdepth 1 -type f -name '*.txt' -print0 \
    | sort -z \
    | xargs -0 -n 1 -P "$concurrency" bash -c 'run_item_job "$1"' _
fi
