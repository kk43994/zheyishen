import { readFileSync, statSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { AI_SYSTEM_PROMPTS } from './src/ai-prompts';

interface AiProfile { baseUrl: string; apiKey: string; model: string }

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
  const env = loadEnv(mode, process.cwd(), 'BLOOD_MOON_AI_');
  const fallback: AiProfile = {
    baseUrl: (env.BLOOD_MOON_AI_BASE_URL || process.env.BLOOD_MOON_AI_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, ''),
    apiKey: env.BLOOD_MOON_AI_API_KEY || process.env.BLOOD_MOON_AI_API_KEY || '',
    model: env.BLOOD_MOON_AI_MODEL || process.env.BLOOD_MOON_AI_MODEL || 'doubao-seed-evolving',
  };

  const middleware = (req: any, res: any, next: () => void) => {
    const kind = req.url === '/api/ai/origin' ? 'origin'
      : req.url === '/api/ai/fate' ? 'fate'
        : req.url === '/api/ai/fate-result' ? 'fate-result'
          : req.url === '/api/ai/fate-free' ? 'fate-free' : null;
    if (!kind) return next();
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    const { baseUrl, apiKey, model } = loadActiveProfile(fallback);
    if (!baseUrl || !apiKey) {
      console.info(`[AI] ${kind} skipped · backend not configured`);
      return sendJson(res, 503, { ok: false, error: 'ai_not_configured' });
    }

    void (async () => {
      const requestId = Math.random().toString(36).slice(2, 8);
      const started = Date.now();
      try {
        const body = await readJsonBody(req, 64 * 1024);
        const payload = kind === 'fate' ? body?.snapshot : body;
        if (!payload || typeof payload !== 'object') return sendJson(res, 400, { ok: false, error: 'invalid_payload' });
        const system = AI_SYSTEM_PROMPTS[kind];
        console.info(`[AI] ${requestId} ${kind} -> ${model}`);
        const upstream = await callChatCompletion(baseUrl, apiKey, model, system, payload);
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

async function callChatCompletion(baseUrl: string, apiKey: string, model: string, system: string, payload: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 42000);
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
        max_tokens: 900,
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
    return JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
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
  },
}));
