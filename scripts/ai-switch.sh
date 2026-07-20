#!/usr/bin/env bash
# AI 模型/端点热切换：改 ai-profiles.local.json 的 active 字段，代理每次请求实时读取，无需重启 dev。
# 用法：
#   scripts/ai-switch.sh                    # 列出全部 profile 与当前激活项
#   scripts/ai-switch.sh ark                # 切换到 ark
#   scripts/ai-switch.sh add 名称 baseUrl apiKey model [备注]
set -euo pipefail
cd "$(dirname "$0")/.."
FILE=ai-profiles.local.json

if [ ! -f "$FILE" ]; then
  echo "缺少 $FILE" >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  python3 - "$FILE" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1]))
active = d.get('active')
for name, p in d['profiles'].items():
    mark = '→' if name == active else ' '
    key = p['apiKey']
    print(f"{mark} {name:10s} {p['model']:24s} {p['baseUrl']}  ({key[:10]}…)  {p.get('note','')}")
EOF
  exit 0
fi

if [ "$1" = "add" ]; then
  python3 - "$FILE" "$2" "$3" "$4" "$5" "${6:-}" <<'EOF'
import json, sys
path, name, base, key, model = sys.argv[1:6]
note = sys.argv[6] if len(sys.argv) > 6 else ''
d = json.load(open(path))
d['profiles'][name] = {'baseUrl': base, 'apiKey': key, 'model': model, 'note': note}
json.dump(d, open(path, 'w'), ensure_ascii=False, indent=2)
print(f'已添加 profile: {name}')
EOF
  exit 0
fi

python3 - "$FILE" "$1" <<'EOF'
import json, sys
path, target = sys.argv[1], sys.argv[2]
d = json.load(open(path))
if target not in d['profiles']:
    print(f'未知 profile: {target}；可选: {", ".join(d["profiles"])}', file=sys.stderr)
    sys.exit(1)
d['active'] = target
json.dump(d, open(path, 'w'), ensure_ascii=False, indent=2)
p = d['profiles'][target]
print(f'已切换 → {target}: {p["model"]} @ {p["baseUrl"]}（dev 服务器无需重启）')
EOF
