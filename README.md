# 这一身

<p align="center">
  <img src="docs/readme/screenshot-title.png" width="280" alt="实机开屏：从第一口气开始" />
</p>

<p align="center">
  <b>这一生，最后都穿成了这一身。</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/平台-抖音互动空间-black?logo=tiktok&logoColor=white" alt="抖音互动空间" />
  <img src="https://img.shields.io/badge/AI-doubao--seed--2.1--turbo-4a6b8a" alt="doubao" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-7.x-646cff?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/渲染-Canvas_2D-e34f26" alt="Canvas 2D" />
  <img src="https://img.shields.io/badge/版本-V0.4-8a6d3b" alt="V0.4" />
  <img src="https://img.shields.io/badge/包体-%3C8MB-2e7d32" alt="包体限制" />
</p>

竖屏、自由走位、自动索敌弹道的 **AI-native 人生构筑 Roguelite**。

核心哲学只有一句：**事情是改不了的，怎么做是可以选择的。** 玩家不能改变已经发生的事，只能在命运事件中左滑「咽下」或右滑「吐出」；走位、回应、五毒（贪嗔痴慢疑）和穿戴道具会共同改变唯一攻击《一口气》——它像一团被人生揉捏的橡皮泥，你捡起什么，它就变成什么形状。

故事是一个男人的成长：关卡是他慢慢长大，怪物是从降生到老死遇到的各种困难，道具是困难留下的事物——可穿戴、可叠加、会改变他的外貌。语气是黑暗童话 + 时代梗 + 灰色幽默：道具初看好笑，细想沉默（《断掉的脊梁骨》《同桌的修眉刀》《我一直在哭》）。

## 实机截图

| 开屏 | AI 出生档案 | 战斗 |
| :---: | :---: | :---: |
| <img src="docs/readme/screenshot-title.png" width="240" /> | <img src="docs/readme/screenshot-origin.png" width="240" /> | <img src="docs/readme/screenshot-combat.png" width="240" /> |

> 中间这张《松塔篓》——林场里给松树缠防虫草绳人家的孩子——是 AI 在截图当下实时生成的，不是预设人物。每一局的出生都是如此。

## 宣传素材

| 3:4 参赛封面 | 16:9 横幅 |
| :---: | :---: |
| <img src="docs/promo/cover-3x4.png" width="240" /> | <img src="docs/promo/banner-16x9.png" width="420" /> |

## 三条设计红线

1. **出生绝无兜底人物。** 每一局的出生故事、童年外号、外貌 DNA、数值底色全部由 AI 实时生成；生成失败就停在重试页，绝不塞示例人物进这一局。代码里的案例只做风格参照。
2. **出生要千奇百怪。** 「家庭底色 × 地域 × 叙事基调 × 外号构词」四个轮盘由代码掷定（种子随机 + 防近局重复），抽定结果交给 AI 执行——把随机性放在有状态的代码里，防止无状态的模型叙事塌缩。
   外号限定为 2–7 个汉字，并通过“喂，___，过来”的人物称谓校验；“数凉席”这类只描述动作的短语不会落档。
3. **AI 慢可以，但要无感加载。** 等待被包装成「出生登记处」的开场叙事遮罩，档案在路上，玩家在读他的人生。

## 核心特性

- **六章人生关卡**（童年至暮年）、无限地图自由走位、自动索敌攻击；环境摆设随年龄在奔跑中平滑渐变（床底立柱 → 课桌 → 齿轮 → 工位 → 床栏）
- **77 件可穿戴人生道具**，叠加改变外貌、弹体形状、颜色、轨迹与生命周期；道具效果遵循「机制即隐喻」——先有隐喻，数值只是它的影子
- **12 个命名组合彩蛋**：集齐特定道具组合触发专属机制，奥义插画在战场上浮现 3.4 秒
- **协同标签系统**：湿×冰、锋利×骨节、重×爆炸等词条化学反应，首次触发以「成双·」句式报幕
- **写实的生成式命运连续剧**：AI 在后台执行「现实事件核心 → 咽下/吐出回应与剧情残留 → 独立现实审稿」，程序再把残留编译成白名单机制；命运触发时同步读取就绪牌，未就绪就立即使用人工保底。玩家亲口说的话沿所选咽/吐方向同步结算，AI 只异步补写不改机制的命运回响
- **当铺 + 随机刷新的留灯间/里屋实体门**（限时存在，走进去触发）：里屋卖代价，留灯间存放被爱过的证据
- **美术管线**：敌怪、主角动作、场景摆设、道具图标、弹体与命中特效、房间内景、六章地面、卡框与结局画面都走「生图基底 + 程序规整」混合管线；形变/穿戴由代码控帧。启动时全部正式美术先限并发完整解码，再动态加载游戏模块；慢设备只看主题化装帧页，任何资源失败都阻断并提供重试，不向评委展示程序化降级画面

<p align="center">
  <img src="src/assets/ui/combo-art.png" width="320" alt="十二组合奥义插画" /><br/>
  <sub>十二组合奥义插画 · 集齐的瞬间在战场上浮现</sub>
</p>

## 在线体验

- **演示站**：https://shen.kk666.best/ （demo 构建，AI 走服务端代理）
- **百科**：https://shen.kk666.best/wiki/ （道具志 / 图鉴 / 美术馆，与实机贴图同源）

## 操作

- **战斗**：虚拟摇杆 / WASD 走位，《一口气》自动索敌攻击
- **命运**：左滑「咽下」，右滑「吐出」；键盘 A/← 与 D/→；也可亲口替他写下回应
- **奖励 / 商城 / 特殊房**：点击选择；数字键 1–3 亦可

## 本地开发

```bash
npm install
cp .env.local.example .env.local
# 只在 .env.local 中填写 ZHEYISHEN_AI_API_KEY；该文件已被 Git 忽略
npm run dev
```

对局 AI 通过 Vite 后台代理调用，浏览器和构建产物拿不到密钥。默认走火山方舟直连 `doubao-seed-2-0-lite-260428`（与抖音互动空间 `tt.callAIChatCompletion` 使用同一模型标识；请求带 `thinking: disabled`，避免大提示词下推理超过代理 42s 超时）。`ai-profiles.local.json` + `scripts/ai-switch.sh` 支持多端点热切换，改完立即生效无需重启 dev。后台日志会明确显示：

```text
[AI] 使用 profile「ark-douyin」· doubao-seed-2-0-lite-260428 @ https://ark.cn-beijing.volces.com/api/v3
[AI] abc123 origin -> doubao-seed-2-0-lite-260428
[AI] abc123 origin <- doubao-seed-2-0-lite-260428 11548ms
```

出生档案没有可游玩的本地保底：未配置、超时、上游失败或输出未通过白名单时，开场停留在重试页（红线 ①）。命运事件保留本地故障保护，避免一局已开始后因临时断网丢档。

## 美术资源管线

VFX、UI、房间、地面、结局与宣传图由同一批处理管线维护。原始生图写入被 Git 忽略的 `output/imagegen/zhe-yi-shen-vfx-ui-v1/raw/`，规整后的运行时资源写入 `src/assets/`，宣传图写入 `docs/promo/`。

```bash
# 断点续跑全部基底；也可在末尾指定 chapter-a 等名字单独重跑
IMAGE2_API_KEY=... IMAGE2_BASE_URL=... python3 scripts/generate_vfx_ui_pack_image2.py

# 抠绿、切格、量化、降采样并生成图集清单
python3 scripts/process_vfx_ui_pack.py

# 将全部实机美术重新嵌入百科「附卷 · 美术馆」
python3 scripts/build_wiki_art_gallery.py
```

## 声音资源管线

游戏使用 16 个固定音效/环境循环和 53 条固定人物语音，运行时不调用 TTS。语音合同逐句记录音色定位、语调、情绪、语速、音高、强度与动作标签，发布前可在 `http://127.0.0.1:5173/voice-review.html` 逐条试听。

```bash
# 拉取并制作 CC0 音效与环境循环
npm run build:sound-assets

# 使用 MiniMax 国内接口生成缺失人物语音
npm run generate:voice

# MiniMax 账户不可用时，用 Kokoro 中文专用模型保留现有成品并补齐缺失项
npm run generate:voice:local

# 用 Whisper 反向转写，检查漏字、错音和异常语速
npm run audit:voice

# 发布前硬校验 16 个声音资源与 53 条语音
npm run validate:sound
npm run validate:voice:strict
```

## 构建与发布

三种构建，各司其职：

| 构建 | 命令 | AI 通道 | 用途 |
| --- | --- | --- | --- |
| 开发 | `npm run dev` | Vite 代理 → 方舟 | 本地迭代 |
| 演示 | `npm run build:demo` | Vite 代理 → 方舟 | 线上演示站，独立输出到 `dist-demo/` |
| 平台 | `npm run package` | 仅 `tt.callAIChatCompletion` | 抖音上传包 |

演示站与平台包禁止共用输出目录：DMIT 只同步 `dist-demo/`，`npm run package` 可以独立重建 `dist/`，不会再覆盖待发布的演示版本。平台包（production 构建）中 Web 请求分支被常量折叠整体剔除，音频由 WebView 原生媒体元素读取包内相对资源，**产物内不含任何 `fetch` 调用**（平台审核红线）。上传包只保留玩家运行时，不包含美术/声音审阅页与生产清单；产物生成于 `release/zhe-yi-shen-mvp.zip`，压缩包根目录直接包含 `index.html`，平台校验上限 8MB。后台单独上传的 300 x 300 图标位于 `docs/promo/app-icon-300.png`，不重复塞入游戏包。

手机打开演示站时默认使用全视口竖屏布局；受浏览器安全规则限制，系统级全屏在玩家第一次触碰游戏时申请，并在支持的浏览器中同时锁定竖屏。iOS Safari 不开放普通网页的自动全屏接口时，仍保持无桌面画框的全视口游玩。

## 文档

- `docs/这一身_游戏开发计划书_V0.4.md` — 设计正典
- `docs/道具攻击方式重设计提案V1.md` — 「机制即隐喻」的道具改型记录
- `docs/沉默的父亲_Boss设计书_V2.md` — Boss 设计
- `docs/互动空间发布验收-v1.md` — 8 MiB 离线包、平台校验器与 MCP 发布前检查
- `docs/这一身百科.html` — 百科（部署即在线版）
