#!/usr/bin/env bash
set -euo pipefail

base="${1:?icon basename is required}"
version="${2:-v1}"
pipeline_dir="/root/imagegen-pipeline"
icon_dir="$pipeline_dir/icons-v2"

case "$base" in
  05-bleach-powder) old_ref="bleach-old-16x.png" ;;
  06-eyebrow-razor) old_ref="razor-old-16x.png" ;;
  25-flash-escape) old_ref="flash-old-16x.png" ;;
  52-hair-in-takeout) old_ref="hair-old-16x.png" ;;
  *) printf 'unknown icon job: %s\n' "$base" >&2; exit 2 ;;
esac

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

output_dir="$icon_dir/output/$version"
mkdir -p "$output_dir"

if [[ "$base" == "06-eyebrow-razor" ]]; then
  image_args=(
    --image "$pipeline_dir/uniform-v1/input/canonical-style-board.png"
    --image "$icon_dir/input/razor-physical-ref-v4.png"
  )
else
  image_args=(
    --image "$pipeline_dir/uniform-v1/input/canonical-style-board.png"
    --image "$icon_dir/input/$old_ref"
    --image "$icon_dir/input/$base.png"
  )
fi

"$pipeline_dir/venv/bin/python" "$pipeline_dir/image_gen.py" edit \
  --model gpt-image-2 \
  --quality high \
  --size 1024x1024 \
  --output-format png \
  --no-augment \
  "${image_args[@]}" \
  --prompt-file "$icon_dir/prompts/$base.txt" \
  --out "$output_dir/$base.png" \
  --force
