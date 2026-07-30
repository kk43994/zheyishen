#!/usr/bin/env bash
set -euo pipefail

checks=(
  validate:projectiles
  validate:inheritance
  validate:box
  validate:late-bosses
  validate:phone-story
  validate:voice-timeline
  validate:ledger
  validate:previous-life
  validate:breath-specimen
  validate:memory-recall
  validate:fate-background
  validate:ai-robustness
  validate:fate-residue
  validate:fate-age
  validate:fate-randomness
  validate:father-canon
  validate:wiki
  validate:materials
  validate:relic-contracts
  validate:relic-runtime
  validate:scene
  validate:childhood-boss
  validate:collector-boss
  validate:boss-stability
  validate:childhood-enemies
  validate:adulthood-enemies
  validate:school-work-enemies
  validate:youth-commute-enemies
  validate:youth-task-enemies
  validate:middle-age-enemies
  validate:old-age-enemies
  validate:enemy-separation
  validate:runtime-foundations
  validate:art-gate
  validate:mobile
  validate:art
  validate:boss-skills
  validate:sound
  validate:voice:strict
  validate:release-icon
)

for check in "${checks[@]}"; do
  npm run "$check"
done

npm run build
