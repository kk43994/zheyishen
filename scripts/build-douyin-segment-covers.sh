#!/bin/zsh
set -euo pipefail

project_root="${0:A:h:h}"
raw_dir="$project_root/docs/promo/douyin-segments-v1/raw"
out_dir="$project_root/docs/promo/douyin-segments-v1/final-1080x2280"
font_file="/System/Library/Fonts/Supplemental/Arial Unicode.ttf"

mkdir -p "$out_dir"

render_cover() {
  local input_file="$1"
  local output_file="$2"
  local number="$3"
  local title="$4"
  local title_size="$5"
  local underline_y="$6"

  magick "$input_file" \
    -resize '1080x2280^' \
    -gravity center \
    -extent 1080x2280 \
    -fill 'rgba(4,6,9,0.56)' \
    -draw 'rectangle 0,0 1080,670' \
    -font "$font_file" \
    -gravity north \
    -pointsize 40 \
    -fill '#050608' \
    -stroke '#050608' \
    -strokewidth 7 \
    -annotate +0+104 "《这一身》开发揭秘 · $number" \
    -fill '#c84d57' \
    -stroke '#c84d57' \
    -strokewidth 1.5 \
    -annotate +0+104 "《这一身》开发揭秘 · $number" \
    -pointsize "$title_size" \
    -interline-spacing 16 \
    -fill '#050608' \
    -stroke '#050608' \
    -strokewidth 13 \
    -annotate +0+210 "$title" \
    -fill '#f2e4c4' \
    -stroke '#f2e4c4' \
    -strokewidth 3 \
    -annotate +0+210 "$title" \
    -gravity northwest \
    -fill '#c84d57' \
    -stroke none \
    -draw "rectangle 330,$underline_y 750,$((underline_y + 12))" \
    -strip \
    "$output_file"
}

render_cover "$raw_dir/01-boss-buffs-turn-debuff.png" "$out_dir/01-老板画的饼全变成DEBUFF.png" "01" $'老板画的饼\n全变成了 DEBUFF' 108 502
render_cover "$raw_dir/02-xiao-zhang-betrayal.png" "$out_dir/02-我帮了小张他却背刺了我.png" "02" $'我帮了小张\n他却背刺了我' 116 510
render_cover "$raw_dir/03-four-phones.png" "$out_dir/03-四个电话同时响了.png" "03" $'四个电话\n同时响了' 126 525
render_cover "$raw_dir/04-sad-items.png" "$out_dir/04-这些道具笑着笑着就沉默了.png" "04" $'这些道具\n笑着笑着\n就沉默了' 106 625
render_cover "$raw_dir/05-bent-spine.png" "$out_dir/05-男人的脊梁真的被生活压弯了.png" "05" $'男人的脊梁\n真的被生活压弯了' 102 505
render_cover "$raw_dir/06-one-time-companion.png" "$out_dir/06-童年的伙伴只会救你一次.png" "06" $'童年的伙伴\n只会救你一次' 112 510
render_cover "$raw_dir/07-father-raincoat-9x19.png" "$out_dir/07-父亲脱下雨衣里面还是个孩子.png" "07" $'父亲脱下雨衣\n里面还是个孩子' 104 505
render_cover "$raw_dir/08-lamp-keeper.png" "$out_dir/08-你的一生被一件件收走.png" "08" $'你的一生\n被一件件收走' 116 510
render_cover "$raw_dir/09-ai-life-wilderness.png" "$out_dir/09-AI让每一把都活出不同人生.png" "09" $'AI 让你每一把\n都活出不同人生' 104 505

magick identify "$out_dir"/*.png
