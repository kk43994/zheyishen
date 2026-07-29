#!/usr/bin/env node
/**
 * 给百科截实机图。
 *
 * 百科里「命运牌」「两扇门」「终局」这些卷原本只有文字——评委读不到画面。
 * 游戏在 DEV 构建里有一整套 audit-screen / audit-room / audit-result 参数，
 * 能直接把某一屏摆好（见 game.ts 约 20290 行），所以这里不点按钮，
 * 只按参数开页、等美术闸门放行、截 canvas。
 *
 * 用法：
 *   npm run dev                       # 另开一个终端，记下端口
 *   node scripts/capture_wiki_screens.mjs [--port 5174] [--only fate,light-room]
 *
 * 产物：docs/assets/screens/<id>.png（360×640 原始像素，不放大）
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const CACHE = `${process.env.HOME}/Library/Caches/ms-playwright`;
const OUT_DIR = 'docs/assets/screens';

/** 每一屏：id / 查询串 / 说明（写进百科图注）/ 额外等待毫秒 */
const SHOTS = [
  { id: 'fate', q: 'audit-screen=fate', wait: 2600, cap: '命运牌 · 事情已经发生，只能选咽下或吐出' },
  { id: 'light-room', q: 'audit-room=light', wait: 1200, cap: '留灯间 · 被爱过的证据，三选一' },
  { id: 'back-room', q: 'audit-room=back', wait: 1200, cap: '里屋 · 强力遗物都带着代价' },
  { id: 'shop', q: 'audit-screen=shop', wait: 1200, cap: '没有招牌的当铺 · 怪潮间隙路边出现' },
  { id: 'boss', q: 'audit-screen=boss', wait: 1600, cap: '章节 Boss 战 · 战场会变成这个 Boss 的现实现场' },
  { id: 'ledger', q: 'audit-screen=ledger', wait: 1200, cap: '《这一身》名册 · 上一世留下的东西会回来' },
  { id: 'lamp-dark', q: 'audit-screen=lamp-dark', wait: 1600, cap: '《灯下》· 他手里那盏灯是场上唯一的光源' },
  { id: 'lamp-seize', q: 'audit-screen=lamp-choice', wait: 1600, cap: '《收灯》· 灯光圈追着你，照满就收走一件' },
  { id: 'result-won', q: 'audit-result=won', wait: 2200, cap: '终局 · 逐件归还之后，由玩家自己放下' },
  { id: 'result-lost', q: 'audit-result=lost', wait: 2200, cap: '人生档案封卷 · 失败也会被记进名册' },
  { id: 'origin-comic', q: 'audit-screen=origin-comic&audit-scene=2&audit-ai=ready', wait: 2000, cap: '开场 · 出生档案由 AI 现场生成，没有兜底人物' },
  { id: 'checkpoint', q: 'audit-screen=checkpoint', wait: 1400, cap: '断点恢复 · 中途断连不丢这一生' },
];

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const port = argOf('port', '5174');
const only = argOf('only', '');
const wanted = only ? new Set(only.split(',').map((s) => s.trim())) : null;

const browser = await chromium.launch({
  executablePath: `${CACHE}/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
});
const ctx = await browser.newContext({
  viewport: { width: 420, height: 780 },
  deviceScaleFactor: 3, // 360×640 的像素画放大三倍才够清楚
});
await mkdir(OUT_DIR, { recursive: true });

const done = [];
const failed = [];
for (const shot of SHOTS) {
  if (wanted && !wanted.has(shot.id)) continue;
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`http://127.0.0.1:${port}/?${shot.q}`, { waitUntil: 'load', timeout: 45000 });
    // art-preload 会先放一张装帧页，等它把 canvas 交出来
    await page.waitForSelector('#game-canvas', { state: 'visible', timeout: 60000 });
    await page.waitForFunction(() => {
      const loading = document.querySelector('#loading');
      return !loading || getComputedStyle(loading).display === 'none' || loading.hidden;
    }, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(shot.wait);
    const canvas = await page.$('#game-canvas');
    if (!canvas) throw new Error('没有 canvas');
    const file = path.join(OUT_DIR, `${shot.id}.png`);
    await canvas.screenshot({ path: file });
    done.push({ ...shot, file });
    console.log(`✓ ${shot.id.padEnd(13)} ${file}${errors.length ? `  (页面报错 ${errors.length} 条)` : ''}`);
  } catch (error) {
    failed.push({ id: shot.id, reason: String(error).split('\n')[0] });
    console.log(`✗ ${shot.id.padEnd(13)} ${String(error).split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

await writeFile(
  path.join(OUT_DIR, 'manifest.json'),
  `${JSON.stringify({ shots: done.map(({ id, cap, file }) => ({ id, caption: cap, file })), failed }, null, 2)}\n`,
  'utf8',
);
await browser.close();
console.log(`\n成功 ${done.length} / 失败 ${failed.length}`);
if (failed.length) process.exitCode = 1;
