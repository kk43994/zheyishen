#!/usr/bin/env bash
set -euo pipefail

version="${1:-v1}"
pipeline_dir="/root/imagegen-pipeline"
job_dir="$pipeline_dir/art-loop-v1/09-cracked-glasses"
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

if [[ -z "$OPENAI_API_KEY" ]]; then
  printf 'active owner image key is unavailable\n' >&2
  exit 3
fi

mkdir -p "$output_dir"

extra_images=()
if [[ "$version" == "v2" ]]; then
  extra_images+=(--image "$job_dir/input/03-rejected-v1-visor-source.png")
fi

"$pipeline_dir/venv/bin/python" "$pipeline_dir/image_gen.py" edit \
  --model gpt-image-2 \
  --quality high \
  --size 1024x1024 \
  --output-format png \
  --no-augment \
  --image "$job_dir/input/01-approved-four-direction-heads.png" \
  --image "$job_dir/input/02-rejected-cracked-glasses.png" \
  "${extra_images[@]}" \
  --prompt-file "$job_dir/prompt-$version.txt" \
  --out "$output_dir/09-cracked-glasses-$version.png" \
  --force
