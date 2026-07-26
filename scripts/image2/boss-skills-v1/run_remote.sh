#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
task_rel="scripts/image2/boss-skills-v1"
remote_root="/root/imagegen-pipeline/boss-skills-v1"
local_output="$repo_root/output/imagegen/zhe-yi-shen-boss-skills-v1/raw"

usage() {
  printf 'usage: %s stage | generate ASSET VERSION TUNNEL_PORT | pull ASSET VERSION\n' "$0" >&2
  exit 2
}

runtime_ref_for() {
  case "$1" in
    closet-dark-skills) printf 'closet-dark-hd.png\n' ;;
    silent-father-p1-skills) printf 'silent-father-hd.png\n' ;;
    silent-father-p2-skills) printf 'silent-father-p2-hd.png\n' ;;
    praise-chair-p1-skills) printf 'praise-chair-p1.png\n' ;;
    praise-chair-p2-skills) printf 'praise-chair-p2.png\n' ;;
    ringing-phone-p1-skills) printf 'ringing-phone-p1.png\n' ;;
    ringing-phone-p2-skills) printf 'ringing-phone-p2.png\n' ;;
    debt-collector-skills) printf 'debt-collector-hd.png\n' ;;
    lamp-keeper-skills) printf 'lamp-keeper-hd.png\n' ;;
    coat-rack-skills) printf 'coat-rack.png\n' ;;
    uniform-answer-skills) printf 'uniform-answer-hd.png\n' ;;
    last-bus-skills) printf 'last-bus-hd.png\n' ;;
    wet-shoes-skills) printf 'wet-shoes.png\n' ;;
    whose-box-skills) printf 'whose-box.png\n' ;;
    revolving-lantern-skills) printf 'revolving-lantern.png\n' ;;
    *) printf 'unsupported asset: %s\n' "$1" >&2; exit 2 ;;
  esac
}

action="${1:-}"
case "$action" in
  stage)
    ssh dmitkelao 'ssh landing003 "mkdir -p /root/imagegen-pipeline/boss-skills-v1/input/scripts/image2/boss-skills-v1 /root/imagegen-pipeline/boss-skills-v1/input/output/art-style-reference-v1 /root/imagegen-pipeline/boss-skills-v1/input/src/assets/enemies /root/imagegen-pipeline/boss-skills-v1/output"'
    tar -cf - \
      -C "$repo_root" \
      "$task_rel/prompts" \
      output/art-style-reference-v1/canonical-style-board.png \
      src/assets/enemies/closet-dark-hd.png \
      src/assets/enemies/silent-father-hd.png \
      src/assets/enemies/silent-father-p2-hd.png \
      src/assets/enemies/praise-chair-p1.png \
      src/assets/enemies/praise-chair-p2.png \
      src/assets/enemies/ringing-phone-p1.png \
      src/assets/enemies/ringing-phone-p2.png \
      src/assets/enemies/debt-collector-hd.png \
      src/assets/enemies/lamp-keeper-hd.png \
      src/assets/enemies/coat-rack.png \
      src/assets/enemies/uniform-answer-hd.png \
      src/assets/enemies/last-bus-hd.png \
      src/assets/enemies/wet-shoes.png \
      src/assets/enemies/whose-box.png \
      src/assets/enemies/revolving-lantern.png \
      | ssh dmitkelao 'ssh landing003 "tar -xf - -C /root/imagegen-pipeline/boss-skills-v1/input"'
    ;;
  generate)
    asset="${2:-}"
    version="${3:-}"
    tunnel_port="${4:-}"
    runtime_ref="$(runtime_ref_for "$asset")"
    [[ "$version" =~ ^v[0-9]+$ ]] || usage
    [[ "$tunnel_port" =~ ^[0-9]{4,5}$ ]] || usage
    ssh dmitkelao bash -s -- "$asset" "$version" "$tunnel_port" "$runtime_ref" <<'DMIT_SCRIPT'
set -euo pipefail
umask 077
asset="$1"
version="$2"
tunnel_port="$3"
runtime_ref="$4"
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
job_dir="/root/imagegen-pipeline/boss-skills-v1"
prompt="$job_dir/input/scripts/image2/boss-skills-v1/prompts/$ASSET.txt"
out="$job_dir/output/$ASSET-$VERSION.png"
export OPENAI_BASE_URL="http://127.0.0.1:$TUNNEL_PORT/v1"
trap 'unset OPENAI_API_KEY' EXIT
"/root/imagegen-pipeline/venv/bin/python" "/root/imagegen-pipeline/image_gen.py" edit \
  --model gpt-image-2 \
  --quality high \
  --size 1024x1024 \
  --output-format png \
  --no-augment \
  --image "$job_dir/input/output/art-style-reference-v1/canonical-style-board.png" \
  --image "$job_dir/input/src/assets/enemies/$RUNTIME_REF" \
  --prompt-file "$prompt" \
  --out "$out" \
  --force
LANDING_SCRIPT
} | ssh -o ExitOnForwardFailure=yes -R "127.0.0.1:${tunnel_port}:127.0.0.1:18080" landing003 \
  "ASSET='$asset' VERSION='$version' TUNNEL_PORT='$tunnel_port' RUNTIME_REF='$runtime_ref' bash -c 'IFS= read -r OPENAI_API_KEY; export OPENAI_API_KEY; bash -s'"
DMIT_SCRIPT
    ;;
  pull)
    asset="${2:-}"
    version="${3:-}"
    runtime_ref_for "$asset" >/dev/null
    [[ "$version" =~ ^v[0-9]+$ ]] || usage
    mkdir -p "$local_output"
    ssh dmitkelao "ssh landing003 'cat $remote_root/output/$asset-$version.png'" > "$local_output/$asset-$version.png"
    ;;
  *) usage ;;
esac
