#!/usr/bin/env bash
# 《这一身》百科 · 分类图鉴页部署 → kelao /opt/zheyishen/wiki-public
#
# 只负责五个分类页、弹体审阅页、两个旧地址跳转页与其资产
# （assets/wiki 动图与切片、assets/voice 语音、wiki-data 词条数据、图标图集、shell js），
# 不碰 index.html——首页仍由 deploy_wiki.sh 全量流程负责，避免与并行会话打架。
# 缓存策略与主脚本一致：css/js 引用盖 ?v=时间戳 绕 Cloudflare 边缘缓存。
# 用法：scripts/deploy_wiki_pages.sh [ssh主机别名，默认 kelao]
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=${1:-kelao}
ROOT=/opt/zheyishen
V=$(date +%Y%m%d%H%M)
PAGES=(chapters items voices world vfx review-projectiles boss bestiary)

for p in "${PAGES[@]}"; do
  [ -f "docs/$p.html" ] || { echo "缺 docs/$p.html，先跑 python3 scripts/build_wiki_codex.py"; exit 1; }
done

echo "① 资产：动图 / 切片 / 语音 / 词条数据 / 图标图集 / shell js"
ssh "$HOST" "mkdir -p $ROOT/wiki-public/assets/wiki $ROOT/wiki-public/assets/voice $ROOT/wiki-public/wiki-data"
rsync -az --delete docs/assets/wiki/ "$HOST":"$ROOT"/wiki-public/assets/wiki/
rsync -az --delete docs/assets/voice/ "$HOST":"$ROOT"/wiki-public/assets/voice/
rsync -az --delete docs/wiki-data/ "$HOST":"$ROOT"/wiki-public/wiki-data/
rsync -az src/assets/items/icons.png "$HOST":"$ROOT"/wiki-public/assets/icons.png
rsync -az docs/wiki-shell-v1.js "$HOST":"$ROOT"/wiki-public/wiki-shell-v1.js

echo "② 分类页、审阅页与旧地址跳转页 · 盖版本戳 v=$V"
for p in "${PAGES[@]}"; do
  tmp=$(mktemp)
  sed -E "s|(href=\"wiki-runtime-v1\.css)\"|\1?v=$V\"|g" "docs/$p.html" \
    | sed 's|href="这一身百科.html"|href="index.html"|g' \
    | sed "s|\.\./src/assets/items/icons\.png|assets/icons.png?v=$V|g" > "$tmp"
  chmod 644 "$tmp"
  rsync -az "$tmp" "$HOST":"$ROOT"/wiki-public/"$p".html
  rm -f "$tmp"
done

echo "③ 线上自检"
for u in "wiki/chapters.html" "wiki/items.html" "wiki/voices.html" "wiki/world.html" "wiki/vfx.html" "wiki/review-projectiles.html" "wiki/boss.html" "wiki/bestiary.html"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://shen.kk666.best/$u?v=$V")
  echo "  $code  $u"
  [ "$code" = "200" ] || { echo "  ✗ 自检失败"; exit 1; }
done
for u in "wiki/boss.html" "wiki/bestiary.html"; do
  body=$(curl -s "https://shen.kk666.best/$u?v=$V")
  case "$body" in *chapters.html*) : ;; *) echo "  ✗ $u 没有跳转到章节志"; exit 1;; esac
done
gif_ct=$(curl -s -o /dev/null -w '%{content_type}' "https://shen.kk666.best/wiki/assets/wiki/gif/boss-skill-8f/father-charge.gif?v=$V")
mp3_ct=$(curl -s -o /dev/null -w '%{content_type}' "https://shen.kk666.best/wiki/assets/voice/father-for-your-good.mp3?v=$V")
review_ct=$(curl -s -o /dev/null -w '%{content_type}' "https://shen.kk666.best/wiki/assets/wiki/img/review-projectile-anim.png?v=$V")
echo "  $gif_ct  gif 样本"
echo "  $mp3_ct  mp3 样本"
echo "  $review_ct  弹体审阅图集"
case "$gif_ct" in image/gif*) : ;; *) echo "  ✗ gif content-type 异常"; exit 1;; esac
case "$mp3_ct" in audio/*) : ;; *) echo "  ✗ mp3 content-type 异常"; exit 1;; esac
case "$review_ct" in image/png*) : ;; *) echo "  ✗ 弹体审阅图集 content-type 异常"; exit 1;; esac
echo "完成 · v=$V · https://shen.kk666.best/wiki/chapters.html"
