#!/usr/bin/env python3
"""发布包末尾的无损瘦身：把 dist 里的 PNG 换成无损 WebP，并改写产物里的引用。

为什么放在 dist 而不是改源码：src 里有 226 处 `.png` 引用、美术门禁里另有 72 处锁着
具体 png 路径、生图管线产出的也是 png。在源码层换扩展名等于把这三摊全推一遍；
而发布包只需要「浏览器拿到的字节更小」，与源码格式无关。

安全边界（一条都不放）：
- 只接受**像素级完全一致**的 WebP（两边都解成 RGBA 逐字节比对），alpha 也算像素；
  差一个字节就放弃这张，保留原 PNG。
- 只替换带构建哈希的文件名（`name-XXXXXXXX.png`）。import.meta.glob 的**键**是无哈希的
  源路径（`./assets/world/stage-floor-0.png`），运行时按键查表——键必须原样留着，
  只改作为 URL 的值。
- WebP 比 PNG 大或省得可以忽略（<2%）就不换：白替换一次就是白担一次风险。

用法：python3 scripts/optimize_release_assets.py dist [--dry-run]
"""
from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

# 带构建哈希的资源名才动：Vite 产物是 `basename-8位哈希.png`
HASHED_PNG = re.compile(r"^(?P<stem>.+)-(?P<hash>[A-Za-z0-9_-]{8})\.png$")
REWRITE_SUFFIXES = {".html", ".js", ".css", ".json", ".webmanifest"}
MIN_GAIN_RATIO = 0.02


def rgba_bytes(path: Path) -> bytes:
    with Image.open(path) as image:
        image.load()
        return image.convert("RGBA").tobytes()


def encode_lossless_webp(source: Path, destination: Path) -> bool:
    result = subprocess.run(
        ["cwebp", "-quiet", "-lossless", "-z", "9", "-m", "6", str(source), "-o", str(destination)],
        capture_output=True,
    )
    return result.returncode == 0 and destination.exists() and destination.stat().st_size > 0


def main() -> int:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
    dry_run = "--dry-run" in sys.argv
    if not target.is_dir():
        print(f"[assets] 目标目录不存在：{target}")
        return 1
    if subprocess.run(["which", "cwebp"], capture_output=True).returncode != 0:
        # 没装 cwebp 不该让打包失败：包只是没瘦下来，仍然可用。
        print("[assets] 跳过：没有找到 cwebp（brew install webp）")
        return 0

    renames: dict[str, str] = {}
    saved = 0
    skipped_bigger = 0
    skipped_mismatch = 0

    with tempfile.TemporaryDirectory() as scratch:
        for png in sorted(target.rglob("*.png")):
            match = HASHED_PNG.match(png.name)
            if not match:
                continue
            candidate = Path(scratch) / f"{png.stem}.webp"
            if not encode_lossless_webp(png, candidate):
                continue
            png_bytes = png.stat().st_size
            webp_bytes = candidate.stat().st_size
            if webp_bytes >= png_bytes * (1 - MIN_GAIN_RATIO):
                skipped_bigger += 1
                continue
            try:
                if rgba_bytes(png) != rgba_bytes(candidate):
                    skipped_mismatch += 1
                    continue
            except Exception as error:  # 解码不了就当校验失败，保留原图
                print(f"[assets] 校验失败保留原图：{png.name}（{error}）")
                skipped_mismatch += 1
                continue
            webp = png.with_suffix(".webp")
            if not dry_run:
                webp.write_bytes(candidate.read_bytes())
                png.unlink()
            renames[png.name] = webp.name
            saved += png_bytes - webp_bytes

    if not renames:
        print("[assets] 没有可无损替换的 PNG")
        return 0

    rewritten = 0
    for path in sorted(target.rglob("*")):
        if not path.is_file() or path.suffix not in REWRITE_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        updated = text
        for old, new in renames.items():
            updated = updated.replace(old, new)
        if updated != text:
            if not dry_run:
                path.write_text(updated, encoding="utf-8")
            rewritten += 1

    # 引用漏改就是运行时 404，而美术闸门会把整局拦在加载页——必须当场发现。
    stale = []
    for path in sorted(target.rglob("*")):
        if not path.is_file() or path.suffix not in REWRITE_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for old in renames:
            if old in text:
                stale.append(f"{path.name} -> {old}")
    if stale:
        print("[assets] 还有引用指向被替换掉的 PNG：")
        for item in stale[:10]:
            print(f"  {item}")
        return 1

    print(
        f"[assets] 无损 WebP 替换 {len(renames)} 张，省 {saved} 字节 ({saved / 1024:.0f}KB)；"
        f"改写 {rewritten} 个产物文件；WebP 更大而跳过 {skipped_bigger} 张，"
        f"像素校验不过 {skipped_mismatch} 张{'（dry-run，未落盘）' if dry_run else ''}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
