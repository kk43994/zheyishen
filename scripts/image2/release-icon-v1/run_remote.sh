#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
task_rel="scripts/image2/release-icon-v1"
remote_root="/root/imagegen-pipeline/release-icon-v1"
local_output="$repo_root/output/imagegen/zhe-yi-shen-release-icon-v1/raw"

usage() {
  printf 'usage: %s stage | generate VERSION TUNNEL_PORT | pull VERSION\n' "$0" >&2
  exit 2
}

action="${1:-}"
case "$action" in
  stage)
    ssh dmitkelao 'ssh landing003 "mkdir -p /root/imagegen-pipeline/release-icon-v1/input/scripts/image2/release-icon-v1 /root/imagegen-pipeline/release-icon-v1/input/output/imagegen/zhe-yi-shen-title-cover-v1 /root/imagegen-pipeline/release-icon-v1/input/output/art-style-reference-v1 /root/imagegen-pipeline/release-icon-v1/output"'
    tar -cf - \
      -C "$repo_root" \
      "$task_rel/prompt.txt" \
      output/imagegen/zhe-yi-shen-title-cover-v1/title-cover-raw.png \
      output/art-style-reference-v1/canonical-style-board.png \
      | ssh dmitkelao 'ssh landing003 "tar -xf - -C /root/imagegen-pipeline/release-icon-v1/input"'
    ;;
  generate)
    version="${2:-}"
    tunnel_port="${3:-}"
    [[ "$version" =~ ^v[0-9]+$ ]] || usage
    [[ "$tunnel_port" =~ ^[0-9]{4,5}$ ]] || usage
    ssh dmitkelao bash -s -- "$version" "$tunnel_port" <<'DMIT_SCRIPT'
set -euo pipefail
umask 077
version="$1"
tunnel_port="$2"
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
job_dir="/root/imagegen-pipeline/release-icon-v1"
export OPENAI_BASE_URL="http://127.0.0.1:$TUNNEL_PORT/v1"
trap 'unset OPENAI_API_KEY' EXIT
"/root/imagegen-pipeline/venv/bin/python" "/root/imagegen-pipeline/image_gen.py" edit \
  --model gpt-image-2 \
  --quality high \
  --size 1024x1024 \
  --output-format png \
  --no-augment \
  --image "$job_dir/input/output/imagegen/zhe-yi-shen-title-cover-v1/title-cover-raw.png" \
  --image "$job_dir/input/output/art-style-reference-v1/canonical-style-board.png" \
  --prompt-file "$job_dir/input/scripts/image2/release-icon-v1/prompt.txt" \
  --out "$job_dir/output/release-icon-$VERSION.png" \
  --force
LANDING_SCRIPT
} | ssh -o ExitOnForwardFailure=yes -R "127.0.0.1:${tunnel_port}:127.0.0.1:18080" landing003 \
  "VERSION='$version' TUNNEL_PORT='$tunnel_port' bash -c 'IFS= read -r OPENAI_API_KEY; export OPENAI_API_KEY; bash -s'"
DMIT_SCRIPT
    ;;
  pull)
    version="${2:-}"
    [[ "$version" =~ ^v[0-9]+$ ]] || usage
    mkdir -p "$local_output"
    ssh dmitkelao "ssh landing003 'cat $remote_root/output/release-icon-$version.png'" > "$local_output/release-icon-$version.png"
    ;;
  *) usage ;;
esac
