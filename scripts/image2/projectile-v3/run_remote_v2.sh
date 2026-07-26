#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
remote_root="/root/imagegen-pipeline/projectile-v3"
local_output="$repo_root/output/imagegen/zhe-yi-shen-vfx-ui-v1/raw"

usage() {
  printf 'usage: %s stage | generate TUNNEL_PORT | pull\n' "$0" >&2
  exit 2
}

case "${1:-}" in
  stage)
    ssh dmitkelao 'ssh landing003 "mkdir -p /root/imagegen-pipeline/projectile-v3/input/scripts/image2/projectile-v3 /root/imagegen-pipeline/projectile-v3/input/output/art-style-reference-v1 /root/imagegen-pipeline/projectile-v3/input/output/imagegen/zhe-yi-shen-vfx-ui-v1/raw /root/imagegen-pipeline/projectile-v3/input/docs/item-equipment-v1/items /root/imagegen-pipeline/projectile-v3/output"'
    tar -cf - \
      -C "$repo_root" \
      scripts/image2/projectile-v3/wood-slash-v2.txt \
      output/art-style-reference-v1/canonical-style-board.png \
      output/imagegen/zhe-yi-shen-vfx-ui-v1/raw/proj-breath.png \
      output/imagegen/zhe-yi-shen-vfx-ui-v1/raw/proj-readable-a.png \
      docs/item-equipment-v1/items/02-wooden-sword.png \
      | ssh dmitkelao 'ssh landing003 "tar -xf - -C /root/imagegen-pipeline/projectile-v3/input"'
    ;;
  generate)
    tunnel_port="${2:-}"
    [[ "$tunnel_port" =~ ^[0-9]{4,5}$ ]] || usage
    ssh dmitkelao bash -s -- "$tunnel_port" <<'DMIT_SCRIPT'
set -euo pipefail
umask 077
tunnel_port="$1"
set -a
source /etc/sub2api/sub2api.env
set +a
export PGPASSWORD="$DATABASE_PASSWORD"
owner_key="$(psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_DBNAME" -Atc "select key from api_keys where id = 60 and status = 'active' and deleted_at is null")"
unset PGPASSWORD DATABASE_PASSWORD
trap 'unset owner_key' EXIT
[[ -n "$owner_key" ]] || { printf 'active owner image key is unavailable\n' >&2; exit 3; }
{
  printf '%s\n' "$owner_key"
  cat <<'LANDING_SCRIPT'
set -euo pipefail
umask 077
job_dir="/root/imagegen-pipeline/projectile-v3"
export OPENAI_BASE_URL="http://127.0.0.1:$TUNNEL_PORT/v1"
trap 'unset OPENAI_API_KEY' EXIT
"/root/imagegen-pipeline/venv/bin/python" "/root/imagegen-pipeline/image_gen.py" edit \
  --model gpt-image-2 \
  --quality high \
  --size 1024x1024 \
  --output-format png \
  --no-augment \
  --image "$job_dir/input/output/art-style-reference-v1/canonical-style-board.png" \
  --image "$job_dir/input/output/imagegen/zhe-yi-shen-vfx-ui-v1/raw/proj-breath.png" \
  --image "$job_dir/input/docs/item-equipment-v1/items/02-wooden-sword.png" \
  --image "$job_dir/input/output/imagegen/zhe-yi-shen-vfx-ui-v1/raw/proj-readable-a.png" \
  --prompt-file "$job_dir/input/scripts/image2/projectile-v3/wood-slash-v2.txt" \
  --out "$job_dir/output/proj-wood-slash-v2.png" \
  --force
LANDING_SCRIPT
} | ssh -o ExitOnForwardFailure=yes -R "127.0.0.1:${tunnel_port}:127.0.0.1:18080" landing003 \
  "TUNNEL_PORT='$tunnel_port' bash -c 'IFS= read -r OPENAI_API_KEY; export OPENAI_API_KEY; bash -s'"
DMIT_SCRIPT
    ;;
  pull)
    mkdir -p "$local_output"
    ssh dmitkelao "ssh landing003 'cat $remote_root/output/proj-wood-slash-v2.png'" > "$local_output/proj-wood-slash-v2.png"
    ;;
  *) usage ;;
esac
