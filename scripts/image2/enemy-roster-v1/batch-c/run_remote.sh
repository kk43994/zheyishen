#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "$0")/../../../.." && pwd)"
batch_rel="scripts/image2/enemy-roster-v1/batch-c"
remote_root="/root/imagegen-pipeline/enemy-roster-v1/batch-c"
local_output="$repo_root/output/imagegen/zhe-yi-shen-enemy-roster-v1/raw/batch-c"

usage() {
  printf 'usage: %s stage | generate ASSET VERSION TUNNEL_PORT | pull ASSET VERSION\n' "$0" >&2
  exit 2
}

validate_asset() {
  case "$1" in
    revolving-lantern|queue-screen|others-family|praise-chair-p1|praise-chair-p2|ringing-phone-p1|ringing-phone-p2) ;;
    *) printf 'unsupported asset: %s\n' "$1" >&2; exit 2 ;;
  esac
}

runtime_ref_for() {
  case "$1" in
    revolving-lantern) printf 'lamp-keeper-hd.png\n' ;;
    queue-screen) printf 'clockwork.png\n' ;;
    others-family) printf 'forgetter.png\n' ;;
    praise-chair-p1|praise-chair-p2) printf 'window-desk.png\n' ;;
    ringing-phone-p1|ringing-phone-p2) printf 'missed-call.png\n' ;;
  esac
}

action="${1:-}"
case "$action" in
  stage)
    ssh dmitkelao 'ssh landing003 "mkdir -p /root/imagegen-pipeline/enemy-roster-v1/batch-c/input /root/imagegen-pipeline/enemy-roster-v1/batch-c/prompts /root/imagegen-pipeline/enemy-roster-v1/batch-c/output"'
    tar -cf - \
      -C "$repo_root" \
      "$batch_rel/prompts" \
      output/art-style-reference-v1/canonical-style-board.png \
      src/assets/enemies/lamp-keeper-hd.png \
      src/assets/enemies/clockwork.png \
      src/assets/enemies/forgetter.png \
      src/assets/enemies/window-desk.png \
      src/assets/enemies/missed-call.png \
      | ssh dmitkelao 'ssh landing003 "tar -xf - -C /root/imagegen-pipeline/enemy-roster-v1/batch-c/input --strip-components=0"'
    ;;
  generate)
    asset="${2:-}"
    version="${3:-}"
    tunnel_port="${4:-}"
    validate_asset "$asset"
    [[ "$version" =~ ^v[0-9]+$ ]] || usage
    [[ "$tunnel_port" =~ ^[0-9]{4,5}$ ]] || usage
    runtime_ref="$(runtime_ref_for "$asset")"

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
owner_key="$(psql \
  -h "$DATABASE_HOST" \
  -p "$DATABASE_PORT" \
  -U "$DATABASE_USER" \
  -d "$DATABASE_DBNAME" \
  -Atc "select key from api_keys where id = 60 and status = 'active' and deleted_at is null")"
unset PGPASSWORD DATABASE_PASSWORD
trap 'unset owner_key' EXIT
if [[ -z "$owner_key" ]]; then
  printf 'active owner image key is unavailable\n' >&2
  exit 3
fi

{
  printf '%s\n' "$owner_key"
  cat <<'LANDING_SCRIPT'
set -euo pipefail
umask 077
pipeline_dir="/root/imagegen-pipeline"
job_dir="$pipeline_dir/enemy-roster-v1/batch-c"
prompt="$job_dir/input/scripts/image2/enemy-roster-v1/batch-c/prompts/$ASSET.txt"
out="$job_dir/output/$ASSET-$VERSION.png"

export OPENAI_BASE_URL="http://127.0.0.1:$TUNNEL_PORT/v1"
trap 'unset OPENAI_API_KEY' EXIT
mkdir -p "$job_dir/output"

image_args=(
  --image "$job_dir/input/output/art-style-reference-v1/canonical-style-board.png"
  --image "$job_dir/input/src/assets/enemies/$RUNTIME_REF"
)
case "$ASSET" in
  praise-chair-p2)
    image_args+=(--image "$job_dir/output/praise-chair-p1-v1.png")
    ;;
  ringing-phone-p2)
    image_args+=(--image "$job_dir/output/ringing-phone-p1-v1.png")
    ;;
esac

"$pipeline_dir/venv/bin/python" "$pipeline_dir/image_gen.py" edit \
  --model gpt-image-2 \
  --quality high \
  --size 1024x1024 \
  --output-format png \
  --no-augment \
  "${image_args[@]}" \
  --prompt-file "$prompt" \
  --out "$out" \
  --force
LANDING_SCRIPT
} | ssh \
  -o ExitOnForwardFailure=yes \
  -R "127.0.0.1:${tunnel_port}:127.0.0.1:18080" \
  landing003 \
  "ASSET='$asset' VERSION='$version' TUNNEL_PORT='$tunnel_port' RUNTIME_REF='$runtime_ref' bash -c 'IFS= read -r OPENAI_API_KEY; export OPENAI_API_KEY; bash -s'"
DMIT_SCRIPT
    ;;
  pull)
    asset="${2:-}"
    version="${3:-}"
    validate_asset "$asset"
    [[ "$version" =~ ^v[0-9]+$ ]] || usage
    mkdir -p "$local_output"
    ssh dmitkelao "ssh landing003 'cat $remote_root/output/$asset-$version.png'" \
      > "$local_output/$asset-$version.png"
    ;;
  *) usage ;;
esac
