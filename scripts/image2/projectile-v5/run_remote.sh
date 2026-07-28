#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
remote_root="/root/imagegen-pipeline/projectile-v5"
candidate_rel="output/imagegen/zhe-yi-shen-vfx-ui-v1/candidates/projectile-v5"
local_output="$repo_root/$candidate_rel"

usage() {
  printf 'usage: %s stage | generate | generate-anim | generate-style | pull\n' "$0" >&2
  exit 2
}

case "${1:-}" in
  stage)
    ssh dmitkelao "ssh landing003 'mkdir -p $remote_root/input/$candidate_rel'"
    tar -cf - \
      -C "$repo_root" \
      scripts/image2/projectile-v5 \
      scripts/run_image2_reference_batch.py \
      output/art-style-reference-v1/canonical-style-board.png \
      output/imagegen/zhe-yi-shen-vfx-ui-v1/raw/proj-breath.png \
      output/imagegen/zhe-yi-shen-vfx-ui-v1/raw/proj-readable-a.png \
      output/imagegen/zhe-yi-shen-vfx-ui-v1/candidates/projectile-v5/proj-forms.png \
      output/imagegen/zhe-yi-shen-vfx-ui-v1/candidates/projectile-v5/proj-readable-a.png \
      output/imagegen/zhe-yi-shen-vfx-ui-v1/candidates/projectile-v5/proj-wood-slash-v2.png \
      src/assets/world/stage-floor-2.png \
      src/assets/vfx/projectiles.png \
      docs/item-equipment-v1/items/01-loose-button.png \
      docs/item-equipment-v1/items/02-wooden-sword.png \
      docs/item-equipment-v1/items/04-stone-schoolbag.png \
      docs/item-equipment-v1/items/06-eyebrow-razor.png \
      docs/item-equipment-v1/items/08-front-desk-letter.png \
      docs/item-equipment-v1/items/09-cracked-glasses.png \
      docs/item-equipment-v1/items/11-only-key.png \
      docs/item-equipment-v1/items/14-fathers-raincoat.png \
      docs/item-equipment-v1/items/16-baby-tooth.png \
      docs/item-equipment-v1/items/28-five-ha.png \
      docs/item-equipment-v1/items/31-marble.png \
      docs/item-equipment-v1/items/32-always-crying.png \
      docs/item-equipment-v1/items/35-retracted-voice.png \
      docs/item-equipment-v1/items/38-bargain-link.png \
      docs/item-equipment-v1/items/46-name-sold.png \
      docs/item-equipment-v1/items/58-typing-indicator.png \
      docs/item-equipment-v1/items/61-ai-chat.png \
      docs/item-equipment-v1/items/64-friend-verify.png \
      docs/item-equipment-v1/items/70-shop-freezer.png \
      docs/item-equipment-v1/items/74-breath-on-glass.png \
      | ssh dmitkelao "ssh landing003 'tar -xf - -C $remote_root/input'"
    ;;
  generate|generate-anim|generate-style)
    jobs_name="jobs.jsonl"
    [[ "$1" == "generate-anim" ]] && jobs_name="anim-jobs.jsonl"
    [[ "$1" == "generate-style" ]] && jobs_name="style-jobs.jsonl"
    ssh dmitkelao bash -s -- "$jobs_name" <<'DMIT_SCRIPT'
set -euo pipefail
umask 077
jobs_name="$1"
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
export OPENAI_BASE_URL="https://cpa.kk666.best/v1"
"/root/imagegen-pipeline/venv/bin/python" "/root/imagegen-pipeline/projectile-v5/input/scripts/run_image2_reference_batch.py" \
  --jobs "/root/imagegen-pipeline/projectile-v5/input/scripts/image2/projectile-v5/$JOBS_NAME" \
  --root "/root/imagegen-pipeline/projectile-v5/input" \
  --image-gen "/root/imagegen-pipeline/image_gen.py" \
  --python "/root/imagegen-pipeline/venv/bin/python" \
  --out-dir "/root/imagegen-pipeline/projectile-v5/input/output/imagegen/zhe-yi-shen-vfx-ui-v1/candidates/projectile-v5" \
  --max-attempts 2
LANDING_SCRIPT
} | ssh landing003 \
  "JOBS_NAME='$jobs_name' bash -c 'IFS= read -r OPENAI_API_KEY; export OPENAI_API_KEY; trap \"unset OPENAI_API_KEY\" EXIT; bash -s'"
DMIT_SCRIPT
    ;;
  pull)
    mkdir -p "$local_output"
    ssh dmitkelao "ssh landing003 'tar -cf - -C $remote_root/input/$candidate_rel .'" \
      | tar -xf - -C "$local_output"
    ;;
  *) usage ;;
esac
