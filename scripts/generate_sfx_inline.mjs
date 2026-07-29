/**
 * 把音效烘成 base64 常量，供 Web Audio 直接 decodeAudioData。
 *
 * 为什么必须内联：互动空间包体有「零网络请求」的审核红线，Web Audio 拿不到
 * ArrayBuffer 就只能退回 HTMLAudioElement；而元素路径每次播放都要
 * pause + seek + play 重启媒体管线，在 WebView 上是实测的顿帧源。
 * base64 走 atob 解码，不产生任何 fetch/XHR。
 *
 * 音效总量仅 300KB（hit.mp3 只有 4KB），内联后 JS 增加约 400KB，可接受。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SFX_DIR = 'public/assets/audio/sfx';
const OUT = 'src/audio-sfx-inline.ts';

/**
 * 只内联「高频重复」的音效。顿帧来自反复重启媒体管线，偶发一次性音（火车、电话、
 * 心电监护）根本不产生 churn，却是体积最大的三个（128/32/28KB）。包体有 8MB 硬上限
 * （平台上传接口实测拒收 8,388,608 字节以上），把它们排除掉既省空间又不损失收益。
 * 被排除的音效自动走 HTMLAudioElement 兜底路径。
 */
const INLINE_DENYLIST = new Set(['train', 'phone', 'monitor']);

const files = readdirSync(SFX_DIR)
  .filter((f) => f.endsWith('.mp3'))
  .filter((f) => !INLINE_DENYLIST.has(f.replace(/\.mp3$/, '')))
  .sort();
if (files.length === 0) throw new Error(`${SFX_DIR} 里没有找到音效文件`);

let totalBytes = 0;
const entries = files.map((file) => {
  const buf = readFileSync(join(SFX_DIR, file));
  totalBytes += buf.length;
  return `  '${file.replace(/\.mp3$/, '')}': '${buf.toString('base64')}',`;
});

writeFileSync(OUT, `// 由 scripts/generate_sfx_inline.mjs 生成，请勿手改。
// 源：${SFX_DIR}（${files.length} 个文件，${(totalBytes / 1024).toFixed(0)}KB）
// 目的：让 Web Audio 在零网络请求的前提下拿到 ArrayBuffer，避开 HTMLAudioElement
// 每次播放都要 pause+seek+play 重启媒体管线造成的顿帧。

export const SFX_INLINE_BASE64: Record<string, string> = {
${entries.join('\n')}
};
`);

console.log(JSON.stringify({
  valid: true,
  files: files.length,
  sourceKB: Math.round(totalBytes / 1024),
  base64KB: Math.round((totalBytes * 4 / 3) / 1024),
  out: OUT,
}, null, 2));
