import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { parseFirstAIJson } from './src/ai-json';
import { AI_SYSTEM_PROMPTS } from './src/ai-prompts';

interface AiProfile { baseUrl: string; apiKey: string; model: string }
// 2026-07-29：本地/demo 与平台包对齐到 lite（平台 src/ai.ts 已全线 lite）。
// 此前这里是 `const ORIGIN_AI_MODEL = 'doubao-seed-2-0-pro-260215'`，且覆盖判断没有按
// kind 收窄——只要 active profile 的 model 含 doubao，**全部**六条链路（出生/命运/选项/
// 亲口回应/审稿/回响）都被换成 pro，profile 里写的 model 根本不作数。本地验收与平台
// 表现对不上就是这么来的。现在模型完全由 active profile 决定。
// 要退回强制 pro：把下面这行改回 'doubao-seed-2-0-pro-260215'。
const FORCED_DOUBAO_MODEL: string | null = null;

// ai-profiles.local.json 热切换：scripts/ai-switch.sh 改 active 后立即生效，无需重启。
let profileCache: { mtimeMs: number; profile: AiProfile } | null = null;
function loadActiveProfile(fallback: AiProfile): AiProfile {
  try {
    const stat = statSync('ai-profiles.local.json');
    if (!profileCache || profileCache.mtimeMs !== stat.mtimeMs) {
      const parsed = JSON.parse(readFileSync('ai-profiles.local.json', 'utf8'));
      const active = parsed.profiles?.[parsed.active];
      if (!active?.baseUrl || !active?.apiKey || !active?.model) throw new Error('invalid profile');
      profileCache = {
        mtimeMs: stat.mtimeMs,
        profile: { baseUrl: String(active.baseUrl).replace(/\/$/, ''), apiKey: active.apiKey, model: active.model },
      };
      console.info(`[AI] 使用 profile「${parsed.active}」· ${active.model} @ ${active.baseUrl}`);
    }
    return profileCache.profile;
  } catch {
    return fallback;
  }
}

function aiProxyPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '');
  const fallback: AiProfile = {
    baseUrl: (env.ZHEYISHEN_AI_BASE_URL || process.env.ZHEYISHEN_AI_BASE_URL || env.BLOOD_MOON_AI_BASE_URL || process.env.BLOOD_MOON_AI_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, ''),
    apiKey: env.ZHEYISHEN_AI_API_KEY || process.env.ZHEYISHEN_AI_API_KEY || env.BLOOD_MOON_AI_API_KEY || process.env.BLOOD_MOON_AI_API_KEY || '',
    model: env.ZHEYISHEN_AI_MODEL || process.env.ZHEYISHEN_AI_MODEL || env.BLOOD_MOON_AI_MODEL || process.env.BLOOD_MOON_AI_MODEL || 'doubao-seed-2-0-lite-260428',
  };

  const middleware = (req: any, res: any, next: () => void) => {
    // 路由从 AI_SYSTEM_PROMPTS 推导，不再手写清单——「人生封卷」上线时这里漏加了
    // life-summary，本地/demo 的封卷 404 了整整一版都没人发现。提示词表就是唯一事实源。
    const kindFromUrl = req.url?.startsWith('/api/ai/') ? req.url.slice('/api/ai/'.length) : '';
    const kind = (Object.keys(AI_SYSTEM_PROMPTS) as Array<keyof typeof AI_SYSTEM_PROMPTS>)
      .find((name) => name === kindFromUrl) ?? null;
    if (!kind) return next();
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    const { baseUrl, apiKey, model: profileModel } = loadActiveProfile(fallback);
    const model = FORCED_DOUBAO_MODEL && profileModel.includes('doubao')
      ? FORCED_DOUBAO_MODEL
      : profileModel;
    if (!baseUrl || !apiKey) {
      console.info(`[AI] ${kind} skipped · backend not configured`);
      return sendJson(res, 503, { ok: false, error: 'ai_not_configured' });
    }

    void (async () => {
      const requestId = Math.random().toString(36).slice(2, 8);
      const started = Date.now();
      try {
        const body = await readJsonBody(req, 64 * 1024);
        const payload = body;
        if (!payload || typeof payload !== 'object') return sendJson(res, 400, { ok: false, error: 'invalid_payload' });
        const system = AI_SYSTEM_PROMPTS[kind];
        console.info(`[AI] ${requestId} ${kind} -> ${model}`);
        const upstream = await callChatCompletion(
          baseUrl,
          apiKey,
          model,
          system,
          payload,
          kind === 'fate-review' ? 0.1
            : kind === 'fate' ? 0.55
            : kind === 'fate-options' ? 0.45
              : kind === 'fate-free' ? 0.55
              : undefined,
          kind === 'fate' ? 700
          : kind === 'fate-options' ? 1000
            : kind === 'fate-free' ? 760
              : kind === 'fate-review' ? 220 : 900,
          // 与 src/ai.ts 的客户端等待窗对齐：origin 100s / 封卷 90s / 其余 60s。
          // 旧的 55s 硬超时盖住了外面的 100s/90s，慢响应在代理里先被掐断。
          kind === 'origin' ? 100_000 : kind === 'life-summary' ? 90_000 : 60_000,
        );
        console.info(`[AI] ${requestId} ${kind} <- ${model} ${Date.now() - started}ms`);
        return sendJson(res, 200, { ok: true, data: upstream, model });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[AI] ${requestId} ${kind} failed ${Date.now() - started}ms · ${message}`);
        return sendJson(res, 502, { ok: false, error: message.slice(0, 180) });
      }
    })();
  };

  return {
    name: 'zhe-yi-shen-ai-proxy',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

async function callChatCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  payload: unknown,
  temperature = 0.9,
  maxTokens = 900,
  timeoutMs = 60_000,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `输入JSON：${JSON.stringify(payload)}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: maxTokens,
        temperature,
        // doubao 深度思考默认开启，origin 大提示词下推理超 42s 必超时；关闭后实测 ~12s 且 JSON 合规
        ...(model.includes('doubao') ? { thinking: { type: 'disabled' } } : {}),
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`upstream_${response.status}: ${raw.slice(0, 120)}`);
    const envelope = JSON.parse(raw);
    const content = envelope?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('upstream_missing_content');
    return parseFirstAIJson(content);
  } finally {
    clearTimeout(timeout);
  }
}

function readJsonBody(req: any, limit: number): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > limit) reject(new Error('payload_too_large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res: any, status: number, payload: unknown): void {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default defineConfig(({ mode }) => ({
  base: './',
  publicDir: 'public',
  plugins: [aiProxyPlugin(mode)],
  preview: {
    allowedHosts: ['shen.kk666.best'],
  },
  build: {
    target: 'safari13',
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: mode === 'production'
        ? { game: resolve(import.meta.dirname, 'index.html') }
        : {
            game: resolve(import.meta.dirname, 'index.html'),
            itemArtReview: resolve(import.meta.dirname, 'item-art-review.html'),
            voiceReview: resolve(import.meta.dirname, 'voice-review.html'),
          },
    },
  },
}));
