import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ai = read('src/ai.ts');
const prompts = read('src/ai-prompts.ts');
const game = read('src/game.ts');
const index = read('index.html');
const style = read('src/style.css');
const vite = read('vite.config.ts');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`找不到校验区段：${start}`);
  return source.slice(from, to);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const platformCall = section(ai, 'function callPlatformAI(', 'async function performAIRequest(');
for (const token of [
  "type: 'text'",
  'stream: useStream',
  'model,',
  'messages:',
  'onSSE:',
  'success:',
  'fail:',
  'complete:',
]) assert(platformCall.includes(token), `平台 AI 调用缺少 ${token}`);
assert(ai.includes("origin: 'doubao-seed-2-0-pro-260215'"), '出生档案没有使用 Seed 2.0 Pro');
assert(ai.includes("default: 'doubao-seed-2-0-pro-260215'"), '后台命运链路没有统一使用 Seed 2.0 Pro');
assert(ai.includes('const useStream = false'), '出生档案必须使用平台完整响应，避免半截 JSON 被判成生成失败');
assert(ai.includes('const ORIGIN_AI_TIMEOUT_MS = 55_000'), '出生档案没有为扫码环境保留 55 秒回调时间');
assert(ai.includes("requestAI('origin', { runSeed, kind, requestNonce, wheels }, ORIGIN_AI_TIMEOUT_MS"), '出生档案没有使用统一等待窗');
assert(game.includes('ORIGIN_COMIC_SKIP_RECT'), 'AI 出生完成后没有可见的提前翻页入口');
assert(game.includes('private finishOriginComicEarly()'), 'AI 出生完成后不能提前结束漫画');
assert(game.includes("this.aiOriginState === 'gpt' && this.origin"), '提前翻页没有受 AI 完成状态保护');
assert(game.includes('private returnToTitleFromOrigin()'), '出生失败页没有回到封面的动作');
assert(game.includes("this.drawBreathActionButton(ORIGIN_ERROR_CODEX_RECT, '打开物证册'"), '出生失败页没有物证册入口');

const requestSwitch = section(ai, 'async function performAIRequest(', 'function classifyAIError(');
assert(
  requestSwitch.indexOf('window.tt?.callAIChatCompletion') < requestSwitch.indexOf('window.fetch'),
  '生产环境必须优先调用 tt.callAIChatCompletion',
);
assert(requestSwitch.includes("import.meta.env.DEV || import.meta.env.MODE === 'demo'"), 'HTTP 代理必须只留在开发或 demo 构建');

const freeInput = section(game, '  private openFreeInput(', '  private submitFreeResponse(');
assert(/createElement\(['"]input/.test(freeInput), '亲口说必须保留玩家文字输入控件');
assert(freeInput.includes("submit('swallow')") && freeInput.includes("submit('exhale')"), '玩家输入后必须可选择咽下或吐出方向');
assert(!/\.onclick\s*=|\.onkeydown\s*=/.test(freeInput), '输入交互必须使用 addEventListener');
assert(!ai.includes('fate-lines') && !prompts.includes("'fate-lines':") && !vite.includes('/api/ai/fate-lines'), '不得保留四句 AI 台词生成链路');
assert(game.includes("this.say('这句话已经说出口 · 回执会在后台写完')"), '提交后必须立即进入后台回执流程');
assert(index.includes('<span class="ai-generated-label">AI生成内容</span>'), '加载首屏缺少 AI 生成显式标识');
assert(style.includes('.ai-generated-label') && style.includes('font-size: 18px'), '首屏 AI 标识尺寸不符合最短边 5%');
assert(
  style.includes('left: 50%') && style.includes('bottom: 10px') && style.includes('background: none'),
  '加载首屏 AI 标识没有按漫画风格收纳在底部',
);
assert(
  game.includes("ctx.font = `18px ${UI_FONT_STACK}`")
    && game.includes("ctx.fillText('AI生成内容', 180, 620)"),
  '正式标题页缺少位于底部且满足最短边 5% 的 AI 生成标识',
);
assert(game.includes('private drawAIDiagnosticBadge('), '平台 AI 诊断没有使用紧凑状态徽标');
assert(game.includes('AI正在生成回执'), '后台回执没有显式标明 AI 生成');
assert(ai.includes("publishAIDiagnostic(kind, 'platform', 'calling'"), '平台 AI 请求没有记录已发出状态');
assert(ai.includes("publishAIDiagnostic(kind, 'platform', 'returned'"), '平台 AI 成功回调没有可见诊断状态');
assert(ai.includes("publishAIDiagnostic(kind, 'platform', 'failed'"), '平台 AI 失败没有记录错误码');
assert(game.includes('this.originAIDiagnosticLine()'), '出生档案页没有显示平台 AI 诊断状态');

console.log(JSON.stringify({
  valid: true,
  platformAPI: 'tt.callAIChatCompletion',
  models: {
    origin: 'doubao-seed-2-0-pro-260215',
    background: 'doubao-seed-2-0-pro-260215',
  },
  keyBoundary: 'platform account configuration; never bundled',
  textInput: 'kept by product decision; player chooses swallow or exhale',
  disclosure: 'loading screen + title screen + generation status',
}, null, 2));
