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
// 抖音互动中心那把令牌只授权两个模型（其余 404/403），所以这里断言「取值在授权范围内
// 且出生与后台一致」，而不是写死某一个 ID——换模型是产品裁决，不该每次都撞门禁。
const PLATFORM_ALLOWED_MODELS = ['doubao-seed-2-0-pro-260215', 'doubao-seed-2-0-lite-260428'];
const modelOf = (field) => (ai.match(new RegExp(`${field}: '([^']+)'`)) || [])[1];
const originModel = modelOf('origin');
const defaultModel = modelOf('default');
assert(PLATFORM_ALLOWED_MODELS.includes(originModel), `出生档案模型不在授权范围内：${originModel}`);
assert(PLATFORM_ALLOWED_MODELS.includes(defaultModel), `后台命运链路模型不在授权范围内：${defaultModel}`);
assert(originModel === defaultModel, `出生与后台命运链路必须用同一模型：${originModel} vs ${defaultModel}`);
// 原合同写死 stream:false 来保证「不出现半截 JSON」。但 doubao 默认深度思考，origin 实测
// 要跑 52.6 秒，非流式等于让平台网关憋 50 秒不吐字节，网关先断，回来的是 errorType F 的
// `platform server error`——为了防半截 JSON 反而让出生 100% 失败。这里改为守住真正的不变量：
// 可以流式，但只允许在 done/[DONE]/complete 之后交付，且交付前必须过 JSON 解析。
assert(ai.includes('const useStream = true'), '推理模型必须走流式；非流式会在思考期被平台网关掐断');
assert(platformCall.includes('streamedText += chunk'), '流式分片必须累积，不能边收边交付');
assert(
  platformCall.includes("event?.eventName === 'done'")
    && platformCall.includes("normalizePlatformSSEData(event?.data) === '[DONE]'")
    && platformCall.includes('resolveText(streamedText)'),
  '流式只能在 done/[DONE] 之后交付，避免半截 JSON 被判成生成失败',
);
assert(platformCall.includes('resolve(parseFirstAIJson(text))'), '交付前必须由 JSON 解析拦住半截内容');
assert(platformCall.includes("thinking: { type: 'disabled' }"), '必须尝试关闭深度思考（平台不透传也无害）');

const readTimeout = (name) => {
  const hit = ai.match(new RegExp(`const ${name} = ([\\d_]+)`));
  assert(hit, `找不到超时常量 ${name}`);
  return Number(hit[1].replace(/_/g, ''));
};
// 实测（思考开）：origin 52.6s；fate 17.8s / fate-options 23.4s / fate-free 24.7s / fate-review 19.6s。
// 用阈值而不是等值，后续按实测微调不会再撞门禁。
const originTimeout = readTimeout('ORIGIN_AI_TIMEOUT_MS');
assert(originTimeout >= 90_000, `出生等待窗必须 ≥90 秒，当前 ${originTimeout}ms`);
const fateTimeout = readTimeout('FATE_AI_TIMEOUT_MS');
assert(fateTimeout >= 45_000, `命运链路等待窗必须 ≥45 秒，当前 ${fateTimeout}ms`);
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
assert(index.includes('<span class="ai-generated-label">本作剧情虚构由AI生成</span>'), '加载首屏缺少剧情虚构与 AI 生成显式标识');
assert(style.includes('.ai-generated-label') && style.includes('font-size: 13px'), '首屏 AI 标识字号没有保持紧凑可读');
assert(
  style.includes('left: 50%') && style.includes('bottom: 10px') && style.includes('background: none'),
  '加载首屏 AI 标识没有按漫画风格收纳在底部',
);
assert(
  game.includes("ctx.font = `13px ${UI_FONT_STACK}`")
    && game.includes("ctx.fillText('本作剧情虚构由AI生成', 180, 619)"),
  '正式标题页缺少位于底部且紧凑可读的剧情虚构与 AI 生成标识',
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
    origin: originModel,
    background: defaultModel,
  },
  transport: 'SSE stream; delivered only after done/[DONE]/complete, gated by JSON parse',
  thinking: 'requested disabled; platform may drop the param, timeouts sized for the slow path',
  timeouts: { origin: originTimeout, fate: fateTimeout },
  keyBoundary: 'platform account configuration; never bundled',
  textInput: 'kept by product decision; player chooses swallow or exhale',
  disclosure: 'loading screen + title screen + generation status',
}, null, 2));
