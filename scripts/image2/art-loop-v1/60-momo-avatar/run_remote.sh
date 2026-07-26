#!/usr/bin/env bash
set -euo pipefail
umask 077

version="${1:-v1}"
pipeline_dir="/root/imagegen-pipeline"
job_dir="$pipeline_dir/art-loop-v1/60-momo-avatar"
output_dir="$job_dir/output/$version"

set -a
source /etc/sub2api/sub2api.env
set +a
export PGPASSWORD="$DATABASE_PASSWORD"
OPENAI_API_KEY="$(psql \
  -h "$DATABASE_HOST" \
  -p "$DATABASE_PORT" \
  -U "$DATABASE_USER" \
  -d "$DATABASE_DBNAME" \
  -Atc "select key from api_keys where id = 60 and status = 'active' and deleted_at is null")"
export OPENAI_API_KEY
export OPENAI_BASE_URL="http://127.0.0.1:18080/v1"
trap 'unset OPENAI_API_KEY PGPASSWORD' EXIT

if [[ -z "$OPENAI_API_KEY" ]]; then
  printf 'active owner image key is unavailable\n' >&2
  exit 3
fi

mkdir -p "$output_dir"

image_args=(
  --image "$job_dir/input/01-approved-four-direction-heads.png"
  --image "$job_dir/input/02-approved-momo-icon.png"
  --image "$job_dir/input/03-current-failed-momo-heads.png"
  --image "$job_dir/input/04-canonical-style-board.png"
)

if [[ "$version" != "v1" ]]; then
  previous_version="v$((10#${version#v} - 1))"
  previous_output="$job_dir/output/$previous_version/60-momo-avatar-$previous_version.png"
  if [[ ! -f "$previous_output" ]]; then
    printf 'previous candidate is unavailable: %s\n' "$previous_output" >&2
    exit 4
  fi
  image_args+=(--image "$previous_output")
fi

"$pipeline_dir/venv/bin/python" "$pipeline_dir/image_gen.py" edit \
  --model gpt-image-2 \
  --quality high \
  --size 1024x1024 \
  --output-format png \
  --no-augment \
  "${image_args[@]}" \
  --prompt-file "$job_dir/prompt-$version.txt" \
  --out "$output_dir/60-momo-avatar-$version.png" \
  --force
