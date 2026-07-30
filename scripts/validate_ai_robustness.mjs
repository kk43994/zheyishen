import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { parseFirstAIJson } from '../src/ai-json.ts';
import { validateOriginProfile } from '../src/origins.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ai = read('src/ai.ts');
const game = read('src/game.ts');
const checkpoint = read('src/run-checkpoint.ts');
const prompts = read('src/ai-prompts.ts');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `找不到区段起点：${start}`);
  assert.notEqual(to, -1, `找不到区段终点：${end}`);
  return source.slice(from, to);
}

for (const [content, expected] of [
  ['说明[非JSON]，最终答案：{"ok":true}', { ok: true }],
  ['先给格式 {字段:值}，结果是 {"ok":true}', { ok: true }],
  ['前缀 {"result":"他说：{\\"够了\\"}"} 尾巴', { result: '他说：{"够了"}' }],
]) {
  assert.deepEqual(parseFirstAIJson(content), expected, `没有跳过无效 JSON 包装：${content}`);
}

const validOrigin = {
  title: '铜铃响过三次',
  nickname: '小铜铃',
  nicknameReason: '他总能在店门铜铃响起前认出来的是谁，邻居便这样叫他。',
  kind: 'ordinary',
  story: [
    '他出生在县城照相馆楼上的小屋，父亲白天修相机，晚上把账本压在奶粉罐下面。门口铜铃一响，他总比大人先抬头。',
    '三岁那年他能隔着楼板分清熟客脚步，母亲让他别乱喊名字。父亲把最后一卷彩色胶卷锁进抽屉，第二天橱窗仍贴着全家福优惠。',
    '邻居后来都叫他小铜铃。停电的夏夜，父亲抱他下楼乘凉，只说风快来了；楼上冲洗间的水龙头却整夜没有关。',
  ],
  traits: [],
  traitReasons: [],
  appearance: {
    skinTone: 'warm',
    faceShape: 'round',
    eyeShape: 'wide',
    hairStyle: 'soft_short',
    hairColor: 'ink',
    stature: 'average',
    bodyBuild: 'average',
    posture: 'alert',
    outfit: 'plain_shirt',
    feature: 'brow_gap',
  },
};

assert(validateOriginProfile(validOrigin, 'ordinary', { strictAI: true }), '完整出生档案未通过严格校验');
assert.equal(
  validateOriginProfile({ ...validOrigin, story: validOrigin.story.slice(0, 1) }, 'ordinary', { strictAI: true }),
  null,
  '严格校验接受了不足三段的出生故事',
);
assert.equal(
  validateOriginProfile({ ...validOrigin, story: validOrigin.story.join('\n\n') }, 'ordinary', { strictAI: true }),
  null,
  '严格校验把单个多段字符串静默改成了 story 数组',
);
assert.equal(
  validateOriginProfile({ ...validOrigin, nickname: undefined }, 'ordinary', { strictAI: true }),
  null,
  '严格校验接受了缺少外号的出生档案',
);
assert(
  validateOriginProfile({ ...validOrigin, traitReasons: undefined }, 'ordinary', { strictAI: true }),
  '纯展示字段 traitReasons 缺失不应卡死开局',
);
assert.equal(
  validateOriginProfile({ ...validOrigin, kind: 'harsh' }, 'ordinary', { strictAI: true })?.kind,
  'ordinary',
  '模型回填错 kind 时没有沿用程序预先抽定的预算',
);
assert(
  validateOriginProfile({
    ...validOrigin,
    appearance: { ...validOrigin.appearance, stature: 'tall' },
  }, 'ordinary', { strictAI: true }),
  '外观展示字段偏差不应卡死开局',
);
const shortButUsableStory = [
  '退潮后的滩涂软得能吞掉雨靴，他家的营生是帮失主捞掉进海的螺苗筐，父亲总在腰上拴根浮绳往浪里走。',
  '他蹲在礁石缝捡碎贝壳串成串，每串都留着一个没穿孔的白螺，摆在门口木板上晒。',
  '家里矮柜摆着满满一排带编号的塑料瓶，瓶里泡着半瓶从海里捞上来的旧钥匙。',
];
assert.equal(shortButUsableStory.join('').length, 119, '119 字回归样本长度被意外修改');
assert(
  validateOriginProfile({ ...validOrigin, story: shortButUsableStory }, 'ordinary', { strictAI: true }),
  '只差一字的完整出生故事不应整份作废',
);
assert(
  validateOriginProfile({
    ...validOrigin,
    nickname: '等一下',
    nicknameReason: '他刚会说话就总拦着要出门的大人喊等一下，大院孩子追着这样叫开了。',
  }, 'ordinary', { strictAI: true }),
  '提示词允许的口头禅外号不应被动作外号规则误杀',
);
assert.equal(
  validateOriginProfile({
    ...validOrigin,
    story: validOrigin.story.map((entry) => entry.replaceAll('他', '你')),
  }, 'ordinary', { strictAI: true }),
  null,
  '把主角整体改成第二人称仍被接受',
);
assert.equal(
  validateOriginProfile({
    ...validOrigin,
    story: [`${validOrigin.story[0]}户口本上正式写着张伟。`, ...validOrigin.story.slice(1)],
  }, 'ordinary', { strictAI: true }),
  null,
  '出生档案编造正式姓名仍被接受',
);
assert.equal(
  validateOriginProfile({
    ...validOrigin,
    story: [
      validOrigin.story[0],
      validOrigin.story[1],
      '五岁那年父亲去世，邻居仍旧叫他小铜铃。照相馆的卷帘门每天照常升起，柜台后面那把椅子却一直没有人坐。',
    ],
  }, 'ordinary', { strictAI: true }),
  null,
  '严格校验接受了父亲童年去世的正典冲突',
);
assert(
  validateOriginProfile({
    title: '旧档案',
    kind: 'ordinary',
    story: ['他出生在一间旧屋里，窗外的灯每天亮到很晚，很久都没人关。'],
    traits: [],
  }, 'ordinary'),
  '兼容模式不能读取旧版宽松出生档案',
);

assert.match(
  checkpoint,
  /playerText:\s*playerText\s*\|\|\s*undefined/,
  '存档回执恢复没有保留玩家原话',
);
assert.match(checkpoint, /returnedItemIds:\s*ItemId\[\]/, '断点合同没有保存已归还物证');
assert.match(game, /returnedItemIds:\s*\[\.\.\.this\.returnedItemIds\]/, '断点快照没有写入已归还物证');
assert.match(game, /this\.returnedItemIds\s*=\s*\[\.\.\.checkpoint\.returnedItemIds\]/, '读档没有恢复已归还物证');
const lampSpawn = section(game, 'if (this.darkActive && !this.lampSpawned)', '} else if (this.stageBossDefeated');
assert(!lampSpawn.includes('beginLifeSummary('), '人生封卷仍在终局结算前生成');
const endRun = section(game, '  private endRun(', '  private nearestEnemy(');
assert(endRun.includes('this.beginLifeSummary(true)'), '终局没有从已结算快照生成封卷');
assert(endRun.includes('this.prefetchedFate?.controller?.abort()'), '终局没有取消尚未消费的普通命运预取');
assert(endRun.includes("this.aiFateState = 'idle'"), '终局取消命运预取后没有复位 AI 状态');
assert(game.includes('this.returnedItemIds.push(strippedId)'), '封卷没有记录实际归还的物证');
assert(prompts.includes('用260至340个中文字'), '人生封卷仍是百字摘要，没有使用完整一页的篇幅目标');
assert(ai.includes('for (let attempt = 0; attempt < 2; attempt += 1)'), '人生封卷没有在总时限内自动重写一次');
assert(ai.includes('const LIFE_SUMMARY_SOFT_MIN_CHARS = 250'), '人生封卷缺少短首稿的软扩写阈值');
assert(ai.includes("reportAIValidation('life-summary', true, '封卷扩写未完成，已保留事实正确的首稿')"), '封卷软扩写失败后没有保留可用首稿');
assert(game.includes('buildLocalLifeSummary(payload)'), '人生封卷连续失败后没有本地完整保底');
assert(game.includes("'这一生 · 本地封卷'"), '本地封卷没有如实标记内容来源');
assert(
  !prompts.includes('scene严格为{"time":"周三早自习","place":"教学楼三层教室第三排","people":"他、前排女生、班主任"}'),
  '命运牌场景仍被错误锁死为少年校园，其他五章会全部降级',
);
assert(prompts.includes('与snapshot.age、chapter一致'), '命运牌 scene 没有绑定当前人生阶段');
const auditResult = section(game, "const auditResult = auditParams.get('audit-result');", "const auditScreen = auditParams.get('audit-screen');");
assert(auditResult.includes('this.origin = {'), '评审快速结局没有出生档案，人生回响页会永久空白');
assert(auditResult.indexOf('this.origin = {') < auditResult.indexOf('this.endRun(auditResult'), '评审出生档案没有在结局封卷前注入');
assert(ai.includes('FATE_PIPELINE_TOTAL_TIMEOUT_MS'), '普通命运牌缺少整条链路总时限');
assert(ai.includes('FREE_FATE_TOTAL_TIMEOUT_MS'), '亲口回应缺少整条链路总时限');
assert(!game.includes('retryAt'), '亲口回应仍存在相乘的外层退避重试');
assert(
  /if \(review\?\.valid === true\)/.test(ai),
  '普通命运牌没有要求现实审稿明确通过',
);
assert(
  /try \{\s*api\(options\);\s*\} catch/.test(ai),
  '平台 SDK 同步异常没有进入统一清理路径',
);

const vite = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
});
try {
  const aiModule = await vite.ssrLoadModule('/src/ai.ts');
  const nativeWindow = globalThis.window;
  globalThis.window = {
    setTimeout,
    clearTimeout,
    tt: {
      callAIChatCompletion() {
        throw new Error('sync-platform-boom');
      },
    },
  };
  await assert.rejects(
    aiModule.callPlatformAI('origin', {}, 30),
    /sync-platform-boom/,
    '平台同步异常没有传回调用方',
  );
  assert.equal(aiModule.readAIDiagnostic().status, 'failed', '平台同步异常没有记为 failed');
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(aiModule.readAIDiagnostic().status, 'failed', '已清理的同步异常被迟到定时器覆盖成 timeout');

  globalThis.window.tt.callAIChatCompletion = (options) => {
    options.onSSE?.();
    options.onSSE?.({ eventName: 'message', data: null });
    options.onSSE?.({
      eventName: 'message',
      data: JSON.stringify({ choices: [{ delta: { content: '{"ok":' } }] }),
    });
    options.onSSE?.({
      eventName: 'message',
      data: JSON.stringify({ choices: [{ delta: { content: 'true}' } }] }),
    });
    options.complete?.();
  };
  assert.deepEqual(
    await aiModule.callPlatformAI('fate-result', {}, 100),
    { ok: true },
    '平台流式分片没有在 complete 后组装为完整 JSON',
  );

  const summaryPayload = {
    nickname: '小铜铃',
    items: ['父亲的雨衣'],
    returnedItems: ['旧纽扣'],
    receipts: [{ direction: 'swallow' }],
    keeperSlain: true,
  };
  const validSummary = '小铜铃从县城照相馆楼上的小屋出发，门口的铃总比他先认出熟人。少年时他咽下《没寄出的信》里那句解释，把父亲的雨衣一直带到中年；旧纽扣却在收灯人的光里交还。晚年他又吐出一次拒绝，桌边的人把手收了回去。他最后没有绕开那盏灯，雨衣留在肩上，铜铃声停在合页之外。';
  assert(aiModule.validateLifeSummaryText(validSummary, summaryPayload), '合格终局封卷未通过合同校验');
  assert(
    aiModule.validateLifeSummaryText(validSummary.replace('父亲的雨衣', '旧雨衣'), summaryPayload),
    '封卷使用自然简称“旧雨衣”仍被逐字匹配误杀',
  );
  assert(
    !aiModule.validateLifeSummaryText(
      validSummary.replaceAll('父亲的雨衣', '旧外套').replaceAll('旧纽扣', '那件东西').replaceAll('雨衣', '外套'),
      summaryPayload,
    ),
    '封卷完全没有带回任何本局物证仍被接受',
  );
  assert(
    !aiModule.validateLifeSummaryText(
      validSummary.replace('没有绕开那盏灯', '杀死收灯人以后离开'),
      { ...summaryPayload, keeperSlain: false },
    ),
    '未击杀收灯人的结局被 AI 改写后仍获接受',
  );
  const localSummary = aiModule.buildLocalLifeSummary({
    nickname: '小铜铃',
    nicknameReason: '门口的铃总比他先认出熟人。',
    title: '照相馆楼上的小孩',
    originStory: [
      '他小时候住在县城照相馆楼上的小屋，父亲总把雨衣挂在门后。',
      '他长大后仍会在关门前等一等，确认最后一个人已经走过楼梯。',
    ],
    reachedAge: '晚年',
    items: ['父亲的雨衣', '出租屋唯一的钥匙'],
    returnedItems: ['旧纽扣'],
    receipts: [
      {
        direction: 'swallow',
        label: '先收起来',
        fact: '复诊那天，他接过报告，把它折进外套口袋。',
        result: '回家后，那张纸一直没有再拿出来。',
      },
      {
        direction: 'exhale',
        label: '打给女儿',
        fact: '失眠的夜里，他翻到一张缺人的生日合照。',
        result: '电话接通以后，他约好下次补拍一张。',
      },
    ],
    won: true,
    keeperSlain: false,
    endedBy: '主动放下最后一口气',
  });
  assert(localSummary.length >= 180 && localSummary.length <= 380, '本地封卷篇幅不可读');
  assert(localSummary.includes('小铜铃') && localSummary.includes('父亲的雨衣'), '本地封卷丢失身份或物证');
  assert(!localSummary.includes('undefined'), '本地封卷泄漏空字段');

  const fateResultPayload = {
    event: { id: 'event', title: '事件', fact: '已经发生的事实' },
    direction: 'exhale',
    response: {
      label: '递回去',
      effect: 'none',
      result: '结果',
      removeItemId: 'fathers-raincoat',
    },
    snapshot: {},
  };
  assert(
    aiModule.validateAIFateResultText(
      '他把父亲的雨衣叠好放回桌边，对面的人停了一下，最终把伸出的手收了回去。',
      fateResultPayload,
    ),
    '合格命运回响未通过合同校验',
  );
  assert(
    !aiModule.validateAIFateResultText('他把东西递了回去，对面的人把手收回。', fateResultPayload),
    '失去道具却未点名的命运回响仍被接受',
  );
  assert(
    aiModule.validateAIFateResultText(
      '小铜铃把旧雨衣叠好放回桌边，对面的人停了一下，最终把伸出的手收了回去。',
      fateResultPayload,
    ),
    '使用外号的合法第三人称回响被误杀',
  );
  assert(
    !aiModule.validateAIFateResultText(
      '你把父亲的雨衣递了回去，他停了一下，最终把伸出的手收了回去。',
      fateResultPayload,
    ),
    '主角写成“你”却借 NPC 的“他”通过了校验',
  );
  assert(
    !aiModule.validateAIFateResultText(
      '他正要放下父亲的雨衣，校长忽然进门撤销处分，对面的人随即收回手。',
      fateResultPayload,
    ),
    '命运回响凭空新增输入中不存在的角色',
  );

  const checkpointModule = await vite.ssrLoadModule('/src/run-checkpoint.ts');
  const checkpointEvent = {
    id: 'checkpoint_event',
    title: '饭桌旁的空位',
    fact: '一个冬天的晚上，他在家中饭桌旁等到菜凉，照料他的人把另一副碗筷收回了柜子。',
    scene: { time: '一个冬天的晚上', place: '家中饭桌旁', people: '他和照料他的人' },
    profile: '沉默',
    memoryId: 'remember_checkpoint_event',
    memoryText: '他在饭桌旁等到菜凉',
    unavoidable: { kind: 'none', amount: 0, item: null },
    swallow: {
      label: '把碗收好',
      hint: '只留下记忆',
      effect: 'none',
      poison: {},
      result: '他把自己的碗洗净放回柜子，桌边的人没有再把另一副碗筷拿出来。',
    },
    exhale: {
      label: '问那是谁的',
      hint: '只留下记忆',
      effect: 'none',
      poison: {},
      result: '他指着空位问了一遍，桌边的人停下手，只把柜门轻轻合上。',
    },
    source: 'local',
  };
  const parsedCheckpoint = checkpointModule.parseRunCheckpoint({
    version: 2,
    savedAt: Date.now(),
    screen: 'battle',
    runSeed: 17,
    rngState: 17,
    encounterIndex: 0,
    requestedOriginKind: 'ordinary',
    origin: {
      title: '旧档案',
      kind: 'ordinary',
      story: ['他出生在一间旧屋里，窗外的灯每天亮到很晚，很久都没人关。'],
      traits: [],
    },
    hero: { hp: 80, maxHp: 80, block: 0, coins: 4 },
    items: ['fathers-raincoat'],
    returnedItemIds: ['loose-button'],
    fateReceipts: [{
      event: checkpointEvent,
      direction: 'exhale',
      result: checkpointEvent.exhale.result,
      echo: '他问完以后，柜门合上了。',
      playerText: '那个位置留给谁',
    }],
  });
  assert(parsedCheckpoint, 'AI 状态断点行为样本无法恢复');
  assert.equal(parsedCheckpoint.fateReceipts[0]?.playerText, '那个位置留给谁', '断点往返丢失玩家原话');
  assert.deepEqual(parsedCheckpoint.returnedItemIds, ['loose-button'], '断点往返丢失已归还物证');
  globalThis.window = nativeWindow;
} finally {
  await vite.close();
}

console.log(JSON.stringify({
  valid: true,
  jsonRecovery: 3,
  originContract: 'strict for new AI output; compatible for old checkpoints',
  checkpointPlayerText: 'preserved',
  lifeSummary: 'terminal snapshot only',
  freeFate: 'single outer task with total deadline',
  platformSyncThrow: 'cleaned and diagnosed',
  platformStream: 'assembled on complete',
  generatedTextContracts: 'behavior-tested',
}, null, 2));
