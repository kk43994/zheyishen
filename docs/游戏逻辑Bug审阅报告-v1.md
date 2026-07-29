# 游戏逻辑 Bug 审阅报告 v1（2026-07-29）

三路并行猎手（战斗数值状态机 / 新增代码对抗复查 / 边界竞态）+ 主会话逐条复核。
所有 P0 项均经二次人工核实 file:line；一条 agent 误报（"道具 76 vs 77"）已复核否决——实际 77/77 完全对齐。

## P0 —— 玩家实际受损或整局卡死（7 项，全部确认）

### P0-1 断点恢复家族（同一根因：checkpoint 字段/流程覆盖不全）
| 子项 | 现象 | 证据 |
|---|---|---|
| a. 奖励页白拿第二件 | 拾取动画 0.85s 内被杀进程→恢复后同一页可再选另一件（acquireItem 先发货、动画后建档、恢复时 rewardAcquire 丢弃但 choices 原样还原） | game.ts:8844-8851, 2023-2025 |
| b. 恢复后整章 per-stage 初始化没跑 | 从 shop/itemReward/specialRoom 恢复只改 state 不调 startStage → **雨衣免伤、乳牙免死、环境音、小张盟友、OD失真等全部静默失灵** | game.ts:2055-2074, 2867-2870 |
| c. 里程碑二次触发 | battle 恢复时 startStage(true) 清掉 eliteSpawned 等标记而 battleTime 已过阈值 → 精英/Boss 重刷（**可无限刷道具**）、物证台/摊位/门/终章命运牌全部再来一次 | game.ts:2057-2058, 2693, 3444/3478/3511-3533 |
| d. 好话叠层不入档 | 最高 +96% 伤/攻速、+60% 移速恢复后归零（razorScars/drankLayers 等同因） | game.ts:4407/4410/3127; run-checkpoint.ts 无字段 |
| e. voiceCuesSeen 不入档 | 恢复后本章已过阈值语音一帧齐射，字幕互相覆盖 | game.ts:2219-2221 唯一清空点 |
| f. xiaoZhangHelpedAt 不入档 | 恢复局里小张加班台词 100% 哑火 | game.ts:1892 vs 3642 |

**修法方向**：一次性把 checkpoint schema 补全（praise 三层+SpawnCount、里程碑标记组、voiceCuesSeen、xiaoZhangHelpedAt、rewardTakenIds），恢复路径统一走 startStage(true) 后再覆写状态。

### P0-2 「亲口回应」后台任务变僵尸，锁死整局自由输入
closeFreeInput() 无条件 fateFreeRequestId+1，而每张新命运牌必经 presentPendingFate→closeFreeInput；AI 回执晚到即被静默丢弃，且任务卡在 requesting 永不重发——**本局所有后续命运牌的自由输入全部被「上一句话还在落成」挡死**，checkpoint 还会把死任务带进下一次恢复。game.ts:3137, 8580, 3274-3277, 3150-3154, 3305-3311。**已复核确认。**

### P0-3 全局 error/unhandledrejection 处理器把普通异常伪装成资源错误并盖全屏
main.ts:91-92 的兜底整局在线；game.ts 多处 void promise 无 catch（3269-3302 回调里跑 resolveFate/acquireItem 全家桶）；frame() 无 try/catch 且 rAF 在末行——任意一次逻辑异常＝游戏永久静止＋「美术或运行资源校验失败，请重新装订」的误导文案。**已复核确认（main.ts 原文核对）。**

### P0-4 物证册开着时键盘穿透遮罩，在不透明册子背后把整局跑起来
window keydown 无 DOM 覆盖层守卫；Space/Enter 在 title/result 态直接 startRun 且不 preventDefault；isItemCodexOpen/closeItemCodex 零引用（已复核 grep）；纯键盘用户无法关册。game.ts:1531/1596/1602。

### P0-5 精英与 Boss 同帧死亡 → 一整份奖励被静默吞掉（含章节「这一身」固定掉落）
第一次死亡改 state 后，第二次死亡撞上 `state === 'battle'` 守卫整体跳过（已复核 7250）；矿泉水对峙伤害等在 state 守卫之前结算的路径同样能触发。修法：击杀奖励改队列帧末消费。

### P0-6 《响个不停》响铃中被打死 → 幽灵来电箭头 + 「站定回忆」整章失效
死亡处理不清 phoneRinging/phoneCalls/phoneAnswer；11822 的边缘箭头无 Boss 存活守卫；9670 的回忆闸门被残留值恒压。附带：finishPhoneAnswer 漏清 phoneAnswer。

### P0-7 checkpoint 写失败后每帧全量 JSON.stringify 重试
配额满/隐私模式下 60fps 序列化+抛异常，中低端机掉帧；且 captureCheckpoint 的多数组拷贝本就无条件每帧执行（签名比对应前置）。game.ts:3820, 1933-1961; run-checkpoint.ts:508-519。

## P1 —— 明确的错误，但损害有限（9 项）

1. **8 处直呼语音无字幕**（好话×4、你怎么看、免死×4 处调用）违反"静音玩家看得懂"正典；**result 态字幕通道整体关闭**——战败/通关两条旁白对静音玩家全丢（game.ts:9840 主动 return）。
2. **scheduleVoice 无章节/状态围栏**：会议台词可在暮年病房、结算页响起（game.ts:2592-2602, 3821）。
3. **package.sh 转码循环两口子**：无 mp3 匹配时字面量喂 ffmpeg、裸调 ffmpeg 不认 FFMPEG_BIN——失败时 30 项门禁白跑且报错误导（package.sh:56-59 对比 build_production_audio.sh:6-22）。
4. **《再来一局》美术未就绪重入丢 skipRest**：不该回血的续局回了 6 点血（game.ts:2988→3013→4045→3027）。
5. **areaDamage 遍历中 push**：《这个很简单》分裂子怪被同一发 AoE 当帧二次命中秒杀，机制被抵消（game.ts:7425-7427, 7170-7181）。
6. **自由输入弹窗键盘泄漏**：焦点在按钮上时 a/d 在遮罩后结算命运牌、玩家写的话静默丢失；Esc 在遮罩下开暂停面板（game.ts:3203-3207 只挡了 input）。
7. **audio.ts AMBIENCE_FILES 仍指向 .wav**：只因 dev 引擎不进正式包才没炸——但 dev 与 demo 构建都会走它，而 wav 母版仍在 public，dev 正常；一旦有人清 wav 母版即断。改成 mp3 与生产对齐（顺带消除 dev/prod 听感分叉）。
8. **物证册「红章新」三态没实现**（承诺三态实为两态，codexNewCount 只是裸计数无 id 集合）；readInitialVolume 迁移标记先写后写值的半写窗口。
9. **fateIncomingStart 恒为 -1**：「命运将至」战场预告是从未渲染过的死代码；pendingFateOpen 同函数内同步消费，"延到安全帧翻牌"机制没生效（已复核 8563-8566）。

## P2 —— 低危/卫生（8 项）

DPR 只在构造器取一次（外接屏/缩放变化画面糊）；桌面 blur 不暂停（标签可见但窗口失焦时挨打）；iOS 回前台音频等下一次触摸才恢复；old-door-lock 弹体空场永生占弹池（疑似刻意演出，缺超时兜底）；8 帧优先时挤压拉伸仍按 4 帧索引（视觉微错位）；keeper-name-8f.png 死资源进包 24KB；图鉴 innerHTML 未转义（仅 self-XSS，nickname 32 字符可控）；DEV 审计钩子污染本机收录记录（「试射员」入册）。

## 复核否决的误报（记录在案防止重查）

- ~~道具 76 vs 77 不一致~~：实测 ITEM_DEFINITIONS=77、icons.json=77、双向差集为空；
- ~~一次伤害连吃多个免死道具~~：四分支首个命中即 hp=1，后续判定自然失效；
- ~~切后台跳帧吞计时器~~：dt 硬夹 0.05 + 固定步长 + visibilitychange 清 lastTime，安全；
- ~~物证册 DOM 泄漏~~：监听挂 root 上随节点回收，重入有守卫；
- ~~SFX 增益表双引擎不一致~~：十项逐一相等；
- ~~弹体继承递归爆炸~~：splitDepth/分支深度/折返次数全部封死，衰减系数全正。

## 建议修复批次

- **第一批（数据损害与卡死）**：P0-1 checkpoint schema 补全（一次修六个子项）、P0-2 僵尸任务、P0-5 奖励队列、P0-6 电话清理；
- **第二批（崩溃面与守卫）**：P0-3 异常处理（frame try/catch + promise catch + 兜底文案分流）、P0-4 键盘守卫、P1-2/3/6；
- **第三批（表现与卫生）**：P1 其余 + P2 择做。
