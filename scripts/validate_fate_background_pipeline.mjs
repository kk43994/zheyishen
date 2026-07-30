import { strict as assertValue } from 'node:assert';
import { readFileSync } from 'node:fs';
import { parseFirstAIJson } from '../src/ai-json.ts';

const game = readFileSync(new URL('../src/game.ts', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../src/ai.ts', import.meta.url), 'utf8');
const fate = readFileSync(new URL('../src/fate.ts', import.meta.url), 'utf8');
const checkpoint = readFileSync(new URL('../src/run-checkpoint.ts', import.meta.url), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`找不到校验区段：${start}`);
  return source.slice(from, to);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const openFate = section(game, '  private openFate(', '  private presentPendingFate(');
assert(!/\bawait\b/.test(openFate), 'openFate 触发路径不得等待 Promise');
assert(!/generateAIFate\s*\(/.test(openFate), 'openFate 触发路径不得发起 AI 请求');
assert(!/spawnPause\s*=/.test(openFate), 'openFate 不得为了等待 AI 暂停刷怪');
assert(/this\.presentPendingFate\(\)/.test(openFate), 'openFate 必须在当前调用栈同步展示命运牌');
assert(/controller\?\.abort\(\)/.test(openFate), '触发时必须取消仍在进行的可取消预取');

const prepareFate = section(game, '  private prepareFate(', '  private restorePreparedFate(');
assert(/generateAIFate\s*\(/.test(prepareFate), 'prepareFate 必须在后台启动 AI 预取');
assert(/status:\s*'warming'/.test(prepareFate), '预取必须先建立 warming 槽');
assert(/slot\.status\s*=/.test(prepareFate), 'AI 结果必须只发布到预取槽');
assert(/controller\.signal/.test(prepareFate), '后台预取必须携带取消信号');

const generateAIFate = section(ai, 'export async function generateAIFate(', 'export async function generateAIFreeFate(');
assert(/attempt <= 3/.test(generateAIFate), '命运牌后台生成最多允许三轮定向尝试');
assert(!/styleFateNarrative\s*\(/.test(generateAIFate), '文学化不得串在命运牌就绪关键链上');
assert(!/mechanicBudget/.test(generateAIFate), '普通命运选项奖励不得再依赖机械证据预算');
assert(/review\?\.valid\s*===\s*true/.test(generateAIFate), '普通命运牌必须由现实审稿明确通过');

const startRun = section(game, '  private startRun(', '  private retryOrigin(');
assert(/this\.runSerial\s*\+=\s*1/.test(startRun), '新局必须推进 runSerial');
assert(/this\.fateGenerationId\s*\+=\s*1/.test(startRun), '新局必须作废旧命运请求');

const submitFreeResponse = section(game, '  private submitFreeResponse(', '  private continueAfterQueuedFate(');
assert(!/\bawait\b/.test(submitFreeResponse), '亲口回应不得等待 AI');
assert(/this\.continueAfterQueuedFate\(\)/.test(submitFreeResponse), '亲口回应提交后必须先恢复游戏');
assert(/this\.launchBackgroundFateTask\(task\)/.test(submitFreeResponse), '亲口回应必须启动后台回执任务');
assert(!/this\.resolveFate\(/.test(submitFreeResponse), '亲口回应提交时不得提前兑现奖励');

const presentBackgroundResult = section(game, '  private maybePresentBackgroundFateResult(', '  private applyFateStats(');
assert(/this\.state !== 'battle'/.test(presentBackgroundResult), '后台回执只能在安全战斗画面弹出');
assert(/this\.fateResultReturn = 'battle'/.test(presentBackgroundResult), '后台回执关闭后必须回到战斗');
assert(/this\.resolveFate\(task\.direction,\s*response\)/.test(presentBackgroundResult), '奖励只能在正式回执弹出时兑现');

const resolveFate = section(game, '  private resolveFate(', '  private applyFateResponseEffect(');
assert(/this\.applyFateStats\(response\.stats\)/.test(resolveFate), 'AI 属性增减必须在正式回执中兑现');
assert(/this\.acquireItem\(response\.gainItemId\)/.test(resolveFate), 'AI 获得道具必须在正式回执中兑现');
assert(/this\.removeFateItem\(response\.removeItemId\)/.test(resolveFate), 'AI 失去道具必须在正式回执中兑现');
assert(/this\.queueFateEchoCaptions\(text\)/.test(resolveFate), 'AI 命运回响必须分段进入字幕队列');
assert(!/this\.captionTime\s*=\s*7/.test(resolveFate), 'AI 命运回响不得再整段固定显示 7 秒');
const removeFateItem = section(game, '  private removeFateItem(', '  private adjustPoisons(');
assert(/this\.items\s*=\s*this\.items\.filter/.test(removeFateItem), '失去道具必须真实移出物品栏');
const splitFateEchoCaption = section(game, '  private splitFateEchoCaption(', '  private queueFateEchoCaptions(');
assert(/28/.test(splitFateEchoCaption), '命运回响每段必须限制为适合两行字幕的长度');
assert(/pages\.join\(''\)\s*===\s*normalized/.test(splitFateEchoCaption), '命运回响分页前后必须保证原文完整');
const queueFateEchoCaptions = section(game, '  private queueFateEchoCaptions(', '  private showNextFateEchoCaption(');
assert(/fateEchoCaptionQueue\.push\(\.\.\.chunks\)/.test(queueFateEchoCaptions), '后到的命运回响不得覆盖尚未播完的字幕');
const showNextFateEchoCaption = section(game, '  private showNextFateEchoCaption(', '  private screenTransitionKind(');
assert(/4\.6,\s*6\.2/.test(showNextFateEchoCaption), '命运回响每段必须保证 4.6 至 6.2 秒阅读时间');
const renderCaption = section(game, '  private renderCaption(', '  /** 免死演出');
assert(/showingFateEcho/.test(renderCaption), '命运回响必须使用独立字幕状态');
assert(/drawOutlinedWrapTextComplete/.test(renderCaption), '命运回响不得使用会添加省略号的普通字幕断行');
const wrapLinesComplete = section(game, '  private wrapLinesComplete(', '  private wrapText(');
assert(!/…/.test(wrapLinesComplete) && !/fitText/.test(wrapLinesComplete), '命运回响完整断行不得主动添加省略号');

const generateAIFreeFate = section(ai, 'export async function generateAIFreeFate(', 'export async function generateAIFateResult(');
assert(/attempt <= 2/.test(generateAIFreeFate), '亲口回应单轮后台生成必须带两次格式重写');
assert(/FREE_FATE_TOTAL_TIMEOUT_MS/.test(generateAIFreeFate), '亲口回应必须受整条链路总时限约束');
assert(!/mechanicBudget/.test(generateAIFreeFate), '亲口回应奖励不得再依赖机械证据预算');
assert(/validateFreeFateResponse/.test(generateAIFreeFate), '亲口回应必须经过文本与奖励白名单编译器');
assert(!/机械证据被降级，正在重写/.test(generateAIFreeFate), '安全降级为只留记忆后不得整稿退回');
assert(/review\?\.valid\s*!==\s*false/.test(generateAIFreeFate), '二次审稿无返回时不得否决已通过本地硬校验的回执');
assert(/event:\s*\{\s*id:\s*payload\.event\.id/.test(generateAIFreeFate), '亲口回应只能把事件事实核心发给模型');
assert(!/requestAI\('fate-free',\s*\{\s*\.\.\.payload/.test(generateAIFreeFate), '不得把本地保底分支及预设奖励泄露给亲口回应模型');

assert(/receipt\.echo\s*=\s*text/.test(game), '异步回响必须写入回执展示槽');
assert(!/this\.memories\.push\(text\)/.test(game), '异步回响不得写入正典 memories');
assert(/allowAlreadyOwnedFateItem/.test(fate), '命运道具需要已结算回执验证模式');
assert(
  checkpoint.match(/allowAlreadyOwnedFateItem:\s*true/g)?.length >= 2,
  '历史回执和当前命运牌都必须允许已经结算的命运道具',
);
assert(/preparedFate\?:\s*CheckpointPreparedFate/.test(checkpoint), '断点必须能够保存已就绪命运牌');
assert(/pendingFreeFate\?:\s*CheckpointPendingFreeFate/.test(checkpoint), '断点必须保存尚未兑现的亲口回应');
assert(/playerText:\s*playerText\s*\|\|\s*undefined/.test(checkpoint), '断点恢复必须保留已结算回执里的玩家原话');
assert(/fateResultReturn\?:\s*'destination'\s*\|\s*'battle'/.test(checkpoint), '断点必须防止后台回执二次推进关卡');
assert(
  /AI 正在按这一身生成命运卡[\s\S]{0,500}generateAIFate\(auditSnapshot\)/.test(game),
  'ai-fate 审查入口必须真实调用 AI，不能伪装成本地保底',
);

assertValue.deepEqual(
  parseFirstAIJson('前缀\n{"result":"他说：{\\"够了\\"}","ok":true} trailing'),
  { result: '他说：{"够了"}', ok: true },
  'AI JSON 容错必须忽略前后废话并正确处理字符串内花括号',
);

console.log('命运牌后台生成与零等待约束通过');
