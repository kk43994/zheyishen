/**
 * 每局状态重置门禁。
 *
 * 起因：2026-07-29 一天之内犯了三次同一个错误——新加一个字段，忘了在 startRun/startStage
 * 里把它清零。这类 bug 不会报错、不会在开发时暴露，**只有玩到第二局才现形**：
 *   - stageBossDefeated 没按章重置 → 第二章开局即跳关
 *   - lifeSummary 没按局重置       → 第二局显示上一局的人生封卷
 *   - devPanelOpen 没按局重置      → 开着面板被打死，结局页被面板盖住
 *
 * 靠人记得多写一行赋值来防这种事，今天已经证明不可靠。这里改由机器把关：
 * 带简单初值的可变私有字段，要么在 startRun/startStage 里被重置，
 * 要么进豁免名单并写明理由。加了新字段却两样都没做 → 打包直接失败。
 *
 * 只认「带简单字面量初值的可变私有字段」（布尔/数字/字符串/undefined）——
 * 每局状态几乎都长这样；Map/Set/数组/复杂对象另有清理方式，不在管辖范围。
 *
 * 注意范围必须覆盖**带内容的字符串**与**任意数字**：最初只认 false/true/0/-1/''/undefined，
 * 结果 lifeSummaryState = 'idle' 这种根本进不了候选，负向测试直接漏抓——
 * 一个从不报警的门禁等于没有。
 */
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/game.ts', import.meta.url), 'utf8');
const lines = source.split('\n');

/**
 * 显式豁免：这些字段**不属于**每局状态，所以不该在 startRun/startStage 里重置。
 * 每一条都要写清楚为什么——没有理由的豁免等于把门禁关掉。
 */
const EXEMPT = new Map([
  // —— 帧循环内部：由 frame() 每帧自己维护，重置反而会打乱时基 ——
  ['accumulator', '固定步长累加器，frame() 自己维护'],
  ['lastTime', '上一帧时间戳，frame() 自己维护'],
  ['visualTime', '视觉时钟，只增不减，用于动画相位'],
  ['devSnapshotAt', 'DEV 快照节流时间戳'],
  ['frameErrorCount', '单帧异常计数，跨局累计才有诊断价值'],

  // —— 审阅钩子：由 URL 参数在启动时设定，重置等于把钩子关掉 ——
  ['auditAutoMove', '审阅参数，启动时设定'],
  ['auditBossArtActive', '审阅参数，启动时设定'],
  ['auditEndurance', '审阅参数，启动时设定'],
  ['auditFirstRunGuide', '审阅参数，启动时设定'],
  ['auditFreezeOriginComic', '审阅参数，启动时设定'],

  // —— 输入状态：由指针/键盘事件驱动，另有 resetMovementInput / resetFateInput ——
  ['pointerDown', '指针状态，由事件驱动'],
  ['pointerInside', '指针状态，由事件驱动'],
  ['pointerX', '指针状态，由事件驱动'],
  ['pointerY', '指针状态，由事件驱动'],
  ['joyBaseX', '摇杆基点，由 resetMovementInput 清理'],
  ['joyBaseY', '摇杆基点，由 resetMovementInput 清理'],
  ['pausePointerId', '暂停长按指针，由 resetPauseHold 清理'],
  ['pauseEndHoldStarted', '暂停长按计时，由 resetPauseHold 清理'],

  // —— 命运牌局部状态：由 openFate / closeFate 管理 ——
  ['fateAnim', '命运牌入场动画，openFate 设定'],
  ['fateExitTimer', '命运牌退场计时，resolveFate 设定'],
  ['fateResultMinTimer', '命运牌结果最短停留，resolveFate 设定'],
  ['fateFreeWaiting', '亲口说等待态，openFreeInput/closeFreeInput 管理'],
  ['fateFreeWaitElapsed', '亲口说等待计时，同上'],
  ['fateFreeRequestId', '亲口说请求令牌，单调递增用于作废旧请求'],
  ['fateGenerationId', '命运生成令牌，单调递增用于作废旧请求'],
  ['originRequestId', '出生请求令牌，单调递增用于作废旧请求'],
  ['runSerial', '对局序号，单调递增——重置会让旧请求被误认为当前局'],

  // —— 房间/商店/奖励的局部焦点：进入各自界面时设定 ——
  ['shopFocus', '商店焦点，openShop 设定'],
  ['itemRewardFocus', '奖励焦点，openItemReward 设定'],
  ['specialRoomHoldIndex', '特殊房间长按，openSpecialRoom 设定'],
  ['specialRoomHoldStarted', '特殊房间长按计时，同上'],
  ['specialRoomLeaveFocused', '特殊房间离开焦点，同上'],
  ['specialRoomPointerId', '特殊房间指针，同上'],

  // —— 结局页：由 endRun 设定，此时新一局尚未开始 ——
  ['resultWon', 'endRun 设定'],
  ['resultStartedAt', 'endRun 设定'],

  // —— 界面局部偏好与构造期常量 ——
  ['specialRoomKind', '房间种类，openSpecialRoom 设定'],
  ['auditTimeScale', '审阅倍速，启动参数设定'],
  ['devPanelTab', '开发面板当前页，纯 UI 偏好'],
  ['devPanelQuality', '开发面板品质档，纯 UI 偏好'],
  ['renderScale', '由 CSS 显示尺寸与 DPR 决定的渲染倍率，重置会毁掉画布缩放'],

  // —— 其它有明确归属的 ——
  ['darkCX', '终局黑暗圆心，进入终局时设定'],
  ['darkCY', '终局黑暗圆心，进入终局时设定'],
  ['checkpointWriteBackoffUntil', '存档写入退避，跨局沿用才有意义'],
  ['waitingForStageArt', '美术预载等待，startStage 前置流程设定'],
  ['pendingStageEndSkipRest', '章末跳过标记，章节结算流程设定'],
  ['xiaoZhangHelpedAt', '小张援助时间戳，章节内设定'],
]);

function resetsIn(fnName) {
  const start = lines.findIndex((line) => line.includes(`private ${fnName}(`));
  if (start < 0) throw new Error(`找不到函数 ${fnName}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}private [a-zA-Z]/.test(lines[i])) { end = i; break; }
  }
  const body = lines.slice(start, end).join('\n');
  return new Set([...body.matchAll(/this\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g)].map((m) => m[1]));
}

/**
 * 重置面 = startRun / startStage 本身，**外加它们调用的 reset* 辅助函数**。
 * 不跟进这一层的话，经由 resetMovementInput / resetFateInput 清理的字段会被误报——
 * 它们确实是每局状态，只是清理动作被抽成了函数。
 */
function collectResets(entryNames) {
  const seen = new Set();
  const covered = new Set();
  const queue = [...entryNames];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const start = lines.findIndex((line) => line.includes(`private ${name}(`));
    if (start < 0) continue;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^ {2}private [a-zA-Z]/.test(lines[i])) { end = i; break; }
    }
    const body = lines.slice(start, end).join('\n');
    for (const match of body.matchAll(/this\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g)) covered.add(match[1]);
    // 只跟进名字以 reset 开头的辅助函数：它们的职责就是清理状态。
    for (const match of body.matchAll(/this\.(reset[A-Za-z0-9_]*)\(/g)) queue.push(match[1]);
  }
  return covered;
}

const covered = collectResets(['startRun', 'startStage']);

const candidates = new Map();
for (const line of lines) {
  const match = line.match(
    /^ {2}private (?!readonly )([a-zA-Z_][a-zA-Z0-9_]*)\??\s*(?::\s*[^=]+)?=\s*(false|true|-?\d+(?:\.\d+)?|'[^']*'|undefined)\s*;/,
  );
  if (match) candidates.set(match[1], match[2]);
}

const missing = [...candidates.keys()].filter((name) => !covered.has(name) && !EXEMPT.has(name));
const staleExempt = [...EXEMPT.keys()].filter((name) => !candidates.has(name));

const errors = [];
for (const name of missing) {
  errors.push(
    `每局状态未重置：private ${name} = ${candidates.get(name)} —— `
    + '要么在 startRun/startStage 里清零，要么加进 validate_run_state_reset.mjs 的 EXEMPT 并写明理由。'
    + '（漏掉不会报错，只会在第二局悄悄串上一局的数据）',
  );
}
for (const name of staleExempt) {
  errors.push(`豁免名单已过期：${name} 已不再是带简单初值的私有字段，请从 EXEMPT 移除`);
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(JSON.stringify({
  valid: true,
  candidates: candidates.size,
  resetInStartRunOrStage: candidates.size - EXEMPT.size,
  exempt: EXEMPT.size,
  policy: '带简单初值的可变私有字段必须在 startRun/startStage 重置，或显式豁免并写明理由',
}, null, 2));
