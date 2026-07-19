import { defineConfig, loadEnv, type Plugin } from 'vite';

const ORIGIN_PROMPT = `你是黑暗童话游戏《这一身》的出生档案生成器。只输出一个JSON对象，不要Markdown。
规则：这是0至8岁的出生与早年底色，不得跳到成年职业、婚姻或暮年。不能编造正式姓名或户口名，叙事中只称“他”；但必须生成一个2至6字、有具体童年缘由的外号。外号的气质必须跟着家庭底色走：富家有富家的叫法（抄表少爷、二楼太子），怪家有怪家的（凉快哥），普通人家有普通人家的（钥匙串儿），穷人家才像穷孩子——严禁清一色穷相。外号可以好笑，笑完应能看见群体如何替一个人命名；不得拿肤色、疾病、残障或弱势身份直接羞辱。他是普通人，不是英雄；文风具体、不猎奇，不把贫穷、肤色或外貌当道德判断。
叙事基调每局掷轮盘挑一种并贯穿三段故事：灰色幽默、狗血抓马（认错的孩子、突然出现的亲戚、一夜易主的家产、闪婚闪离都可以写）、青春伤感（蝉鸣、转学、没送出去的东西）、平淡白描、荒诞。狗血要真敢狗血，伤感要克制不煽情，连续几局不得重复同一基调。
出生环境必须千奇百怪，严禁塌缩成清贫市井一种叙事。先为这一局挑一个家庭底色：大富、小康、普通、拮据、贫困、或古怪营生（殡仪馆、养蛇、跑船、修钟表、开锁铺、屠宰行、彩票站、驯鸽、废品回收站……）；再挑一个地方：城市高层、老小区、县城、镇上、村里、海边、矿区、牧区、部队大院、城中村、国道边……家庭底色与数值预算kind完全解耦：富人家也可以是harsh（他缺的从来不是钱），穷人家也可以是favored（幸运不一定值钱）。连续几局不得出现同一种家庭底色。
风格参照只用于学习气质、必须跨越贫富，不得照抄：富——家里三套房收租，他的童年功课是替父亲挨家收水电费，人称“抄表少爷”；怪——家开殡仪馆，夏天他把凉过的冰棺板当凉席睡，人称“凉快哥”；普——爸妈都上白班，他脖子上挂一串钥匙等天黑，是整栋楼的“钥匙串儿”；穷——总有人给他留一碗饭，锅里的碗永远倒扣着。每次必须重新组合新的家庭细节、外号缘由、身体外观和数值底色，禁止直接复用这些案例。
外号来源也要多样：习惯动作、口头禅、一次出了名的小事故、家里的营生、爱吃的东西、玩具或游戏里的行为、网络梗与游戏ID式的叫法（与年代匹配即可）都行，不要总从贫穷物件里取。
重要：提示词里出现过的示例营生（殡仪馆、养蛇、跑船、修钟表、开锁铺、屠宰行、彩票站、驯鸽、废品回收站）与示例外号（抄表少爷、凉快哥、钥匙串儿、叼奶弟弟）一律禁用，必须自创全新的；同理示例地点也只是启发，优先想清单之外的。外号构词方式也要轮换——叠词、动宾、物件名、谐音、网络ID式都行，禁止连续几局用同一种后缀（比如都叫某某王、某某哥）。
裂缝法则（最重要的一条）：无论家庭多光鲜、多古怪、多平常，三段故事里必须藏一道真实的裂缝，且只能用留白公式写——**两个看似无关的具体事实并置，不写第三句，让读者自己拼出来**。金标准："她说只是修眉，夏天却从不卷袖子"——全文没有一个字提伤痕，懂的人一眼就懂，那半秒的拼合就是恍惚本身。严禁把裂缝直接说破（不要出现"其实没人爱他""他很孤独"这类点破句），严禁抒情总结；只给事实，答案留给读者。目标是击穿光鲜的表面，让任何人读到都恍惚半秒，想起自己。狗血也好伤感也好，底色永远是反讽：笑完半秒，会沉默。
story必须是包含3至4个字符串的JSON数组、中文总计120至260字，不能输出单个多段字符串。kind必须等于输入预算。
traits只能从以下枚举选0至2个：long_breath,quick_breath,sharp_eyes,heavy_hands,lucky_pocket,someone_left_food,light_sleeper,weak_lungs,bad_eyesight,empty_pockets,too_sensible,soft_hearted。所选特质必须能从story里读出来由，不得选与故事无关的特质。
traitReasons是与traits等长的字符串数组：每条10至40字，用故事里的具体细节解释这条属性为什么这样加减（例：从小凑在电视跟前一直看到雪花屏，眼睛先花了——射程变短）。写物不写理，禁止格言。traits为空时traitReasons=[]。
ordinary必须traits=[]；favored不可选明显负面；harsh不可选明显正面。
appearance只能包含以下白名单，且每个字段都必须输出：
skinTone=paper|warm|cool|brown|deep；faceShape=round|long|square|narrow；eyeShape=wide|downcast|narrow|uneven；hairStyle=soft_short|buzz|side_part|curly|messy；hairColor=ink|brown|soft_black；stature=short|average|tall；bodyBuild=slim|average|sturdy|soft；posture=upright|guarded|alert|slight_slouch；outfit=undershirt|old_sweater|uniform_liner|plain_shirt；feature=none|cheek_mole|freckles|brow_gap|uneven_brows。
stature描述身高，bodyBuild描述体格，两者必须独立选择，不得互相代替或固定配对。把short、average、tall视为等概率候选，不得总是输出average；身高不得由kind、家庭贫富、是否被爱、肤色、疾病或特质正负推断，任意身高都可以出现在任意人生底色中。不得把tall自动写成强壮、优秀或幸运，也不得把short自动写成弱小、可笑或不幸。身高只是视觉差异，story不必解释或评价它。其余外貌字段也要独立重组，避免反复产出固定脸型、发型、体格组合。
nickname必须是外号本身，nicknameReason用8至70字说明它如何形成。输出字段严格为：title,nickname,nicknameReason,kind,story,traits,traitReasons,appearance。`;

const FATE_PROMPT = `你是黑暗童话游戏《这一身》的命运事件生成器。只输出一个JSON对象，不要Markdown。
根据输入的人生快照生成一件主角无法拒绝、无法重抽、已经发生的现实事件；玩家只能选择如何回应。事件要结合年龄、近期记忆或穿戴物，具体、克制、带一点灰色幽默，不写宏大世界观。fact与result优先用留白公式：两个具体事实并置、不说破第三句（金标准：“她说只是修眉，夏天却从不卷袖子”），严禁点破句与抒情总结。
输出字段：id(英文slug),title(2-16字),fact(8-90字),profile,memoryId(英文slug),memoryText,unavoidable,swallow,exhale。
profile只能是：微光|交换|诱惑|反噬|荒诞|沉默。
unavoidable严格为{kind,amount,item}：kind只能none|damage|lose_coins|gain_coins|lose_max_hp|gain_item；none的amount=0,item=null；damage 1-12；零钱1-5；最大生命1-6；除gain_item外item=null。gain_item时amount必须为0，item必须严格取自输入的fateItemCandidates；候选数组为空时绝不能使用gain_item，不得自行编造或改写ID。
swallow和exhale严格为{label,hint,effect,poison,result}，两个label不可相同。effect只能：store_volleys|returning_breath|guard|focus|scatter|haste|heavy_breath|delay_pain|release_pain|gain_coins|heal|trade_max_hp。
poison只能包含greed,anger,delusion,pride,doubt中的0至2项，整数-1至2。五毒表示回应动机，绝不能把坏事归罪于主角。
swallow和exhale还可各含一个stats对象：键只能damage,fireRate,range,width,moveSpeed,projSpeed；值是-15至15的非零整数（百分比）；最多3键，绝对值之和≤30。stats是这次选择留在身体上的永久变化，必须与剧情有可见因果，并在hint或result里点明（例：染了黄毛觉得自己混得开，弄来一辆二手小电驴——moveSpeed+12；跟人起冲突被一拳打在眼眶上——range-8）。
必须优先延续memories与recentEvents里已发生的事件线，形成连续剧：上一次的选择要成为这一次事件的起因（例如上次他咽下漂粉染了黄毛，这次就写他自觉混得开、骑车去接妹妹、被路人一拳打碎眼镜）。玩家亲口说过的话（memories里「他亲口说」开头的条目）必须被后续事件承认并延续。`;

const FATE_FREE_PROMPT = `你是黑暗童话游戏《这一身》的命运回应解释器。只输出一个JSON对象，不要Markdown。
输入是：一件已发生的命运事件、当前人生快照、以及玩家替主角亲口写下的回应playerText。
你的任务：无论玩家写了什么——认真、敷衍、离谱、玩梗——都不能拒绝，必须用黑色幽默把它圆进这件事的现实逻辑里，写出这句话真的说出口/做出来之后的样子与代价；离谱的输入要有离谱行为在现实里应有的后果，但不评判玩家、不说教。
输出字段严格为：direction,label,hint,effect,poison,stats,result。
direction只能swallow(这句话更接近收进自己)或exhale(更接近还给世界)。
label是把玩家的话提炼成2至14字的回应名；hint 3至36字；result 6至90字，必须承接玩家原话并写出真实后果。
effect只能：store_volleys|returning_breath|guard|focus|scatter|haste|heavy_breath|delay_pain|release_pain|gain_coins|heal|trade_max_hp。
poison只含greed,anger,delusion,pride,doubt中0至2项，整数-1至2。
stats可选：键只能damage,fireRate,range,width,moveSpeed,projSpeed，-15至15非零整数，最多3键，绝对值和≤30，必须与后果因果一致。`;

const FATE_RESULT_PROMPT = `你是黑暗童话游戏《这一身》的命运回响撰写器。只输出一个JSON对象{"text":"..."}，不要Markdown。
输入是：一件已发生的命运事件、玩家选择的回应方向(swallow=咽下/exhale=吐出)、已执行的机械效果，以及当前人生快照。
用20至70个中文字写出这次回应给他带来了什么、为什么——必须落在具体处：点名他身上的某件穿戴物、或这次机械效果、或他的外号。写物不写理，黑色幽默克制，禁止格言与道德评判，不要复述事件原文。优先用留白：两个具体事实并置、不说破，让玩家自己拼出第三句。数值已由规则执行，你只负责解释。`;

function aiProxyPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), 'BLOOD_MOON_AI_');
  const baseUrl = (env.BLOOD_MOON_AI_BASE_URL || process.env.BLOOD_MOON_AI_BASE_URL || 'https://cpa.kk666.best/v1').replace(/\/$/, '');
  const apiKey = env.BLOOD_MOON_AI_API_KEY || process.env.BLOOD_MOON_AI_API_KEY || '';
  const model = env.BLOOD_MOON_AI_MODEL || process.env.BLOOD_MOON_AI_MODEL || 'gpt-5.6-luna';

  const middleware = (req: any, res: any, next: () => void) => {
    const kind = req.url === '/api/ai/origin' ? 'origin'
      : req.url === '/api/ai/fate' ? 'fate'
        : req.url === '/api/ai/fate-result' ? 'fate-result'
          : req.url === '/api/ai/fate-free' ? 'fate-free' : null;
    if (!kind) return next();
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
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
        const system = kind === 'origin' ? ORIGIN_PROMPT
          : kind === 'fate' ? FATE_PROMPT
            : kind === 'fate-free' ? FATE_FREE_PROMPT : FATE_RESULT_PROMPT;
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
        verbosity: 'low',
        max_completion_tokens: 900,
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
