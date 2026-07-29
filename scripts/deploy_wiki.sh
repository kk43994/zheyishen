#!/usr/bin/env bash
# 《这一身》百科部署 → kelao (179.255.108.248) /opt/zheyishen
#
# 为什么这么做：
# - nginx 的 /wiki/ 只从 wiki-public/ 出文件，所以 runtime css/js/敌怪图必须复制进去，
#   只 cp index.html 会让线上静默退化成纯静态版（2026-07-25 之前就是这个状态）。
# - shen.kk666.best 过 Cloudflare，css/js/png 默认边缘缓存 4 小时且 404 也会被缓存，
#   没有可用的 CF API token，所以每次部署给资源引用盖 ?v=时间戳 强制绕缓存。
# 用法：scripts/deploy_wiki.sh [ssh主机别名，默认 kelao]
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=${1:-kelao}
ROOT=/opt/zheyishen
V=$(date +%Y%m%d%H%M)
WIKI=docs/这一身百科.html

[ -f "$WIKI" ] || { echo "找不到 $WIKI"; exit 1; }

echo "⓪ 重建并校验百科"
npm run validate:wiki

echo "① rsync docs/ → $HOST:$ROOT/docs/"
rsync -az --delete docs/ "$HOST":"$ROOT"/docs/

echo "② wiki-public 运行时文件与图集"
ssh "$HOST" "set -e; cd $ROOT
  cp docs/*-v1.js wiki-public/
  mkdir -p wiki-public/assets wiki-public/wiki-data
  rsync -a docs/assets/ wiki-public/assets/
  rsync -a --delete docs/wiki-data/ wiki-public/wiki-data/
  rsync -a --delete docs/enemy-portraits-v1/ wiki-public/enemy-portraits-v1/
  rsync -a --delete docs/item-manifestations-v1/ wiki-public/item-manifestations-v1/"

echo "③ 道具图标图集（/src 反代是 clash-sub 假 200，必须内置到 wiki-public/assets）"
rsync -az src/assets/items/icons.png "$HOST":"$ROOT"/wiki-public/assets/icons.png

echo "④ 盖版本戳 v=$V 并上传 css 与 index.html"
tmp_css=$(mktemp)
sed "s|\.\./src/assets/items/icons\.png|assets/icons.png?v=$V|g" docs/wiki-runtime-v1.css > "$tmp_css"
chmod 644 "$tmp_css"
rsync -az "$tmp_css" "$HOST":"$ROOT"/wiki-public/wiki-runtime-v1.css
rm -f "$tmp_css"

tmp_html=$(mktemp)
sed -E "s/(href=\"wiki-runtime-v1\.css|src=\"[a-z0-9-]+-v1\.js)\"/\1?v=$V\"/g" "$WIKI" \
  | sed -E "s/(src=\"enemy-portraits-v1\/[^\"?]+\.png)\"/\1?v=$V\"/g" \
  | sed "s|\.\./src/assets/items/icons\.png|assets/icons.png?v=$V|g" > "$tmp_html"
chmod 644 "$tmp_html"
rsync -az "$tmp_html" "$HOST":"$ROOT"/wiki-public/index.html
rm -f "$tmp_html"

# 美术候选与校验（不是现役资源，从卷目单独进）
tmp_cand=$(mktemp)
sed -E "s/(href=\"wiki-runtime-v1\.css|src=\"[a-z0-9-]+-v1\.js)\"/\1?v=$V\"/g" docs/art-candidates.html \
  | sed "s|\.\./src/assets/items/icons\.png|assets/icons.png?v=$V|g" > "$tmp_cand"
chmod 644 "$tmp_cand"
rsync -az "$tmp_cand" "$HOST":"$ROOT"/wiki-public/art-candidates.html
rm -f "$tmp_cand"

echo "⑤ 线上自检"
for u in "wiki/" "wiki/art-candidates.html" "wiki/wiki-runtime-v1.css?v=$V" "wiki/wiki-runtime-ui-v1.js?v=$V" "wiki/wiki-shell-v1.js?v=$V" "wiki/wiki-runtime-status-v1.js?v=$V"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://shen.kk666.best/$u")
  echo "  $code  $u"
  [ "$code" = "200" ] || { echo "  ✗ 自检失败"; exit 1; }
done
ct=$(curl -s -o /dev/null -w '%{content_type}' "https://shen.kk666.best/wiki/assets/icons.png?v=$V")
echo "  $ct  wiki/assets/icons.png?v=$V"
case "$ct" in image/png*) : ;; *) echo "  ✗ 图集 content-type 异常"; exit 1;; esac
echo "完成 · v=$V · https://shen.kk666.best/wiki/"
