import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, voice, stages, design, canon, plan, wiki, packageJson, wikiGallery, staticCatalog] = await Promise.all([
  read('src/game.ts'),
  read('src/voice-script.ts'),
  read('src/life-stage.ts'),
  read('docs/沉默的父亲_Boss设计书_V2.md'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
  read('package.json'),
  read('scripts/build_wiki_art_gallery.py'),
  read('scripts/render_enemy_static_catalog_v2.py'),
]);

const errors = [];
let checks = 0;
const requireToken = (source, token, message) => {
  checks += 1;
  if (!source.includes(token)) errors.push(message);
};
const rejectToken = (source, token, message) => {
  checks += 1;
  if (source.includes(token)) errors.push(message);
};

for (const [token, message] of [
  ["'silent-father': '雨声先到，父亲后到。他还站着。'", '父亲出场与名称下方文案没有同时落地'],
  ["this.eliteAlertKind = 'boss'", '章节 Boss 横幅仍可能被误报成精英'],
  ["this.eliteAlertKind === 'boss' ? '章节首领' : '精英逼近'", '大小 Boss 横幅没有按身份显示'],
  ['const panelY = this.eliteAlertTime > 0 ? 132 : 96', 'Boss 横幅与剧情字幕仍占同一条屏幕轨道'],
  ["this.caption = '雨衣倒下去，里面有人哭得喘不上气。'", '父亲转阶段文案不符合设计书'],
  ["this.caption = '他说没有哭，手背却一直在擦脸。'", '父亲二阶段短句没有落地'],
  ["this.playVoiceOnce('boss-father-phase-two')", '父亲二阶段短句仍没有对应语音'],
  ['fatherP2 && this.fatherSecondPhaseLineShown && (enemy.mechTimer ?? 0) >= 3.4', '父亲二阶段第一招仍可能抢在动作短句前开始'],
  ['enemy.mechTimer = 2.2', '父亲二阶段短句后缺少首次攻击节奏'],
  ["'silent-father': '雨衣留下了。话还是没说。'", '父亲击败页没有使用设计书原句'],
  ["'雨衣留下了。话还是没说。'", '父亲固定掉落页没有使用设计书原句'],
  ['enemy.windupTimer = 1.05', '父亲转阶段没有停住普通更新约一秒'],
  ['enemy.attackKind = undefined', '父亲转阶段没有取消旧攻击'],
  ['enemy.mechTimer = 0', '父亲转阶段没有清空旧攻击计时'],
  ['private showFatherAttackNameOnce(name: string)', '父亲招式名缺少只显示一次的门禁'],
  // 只断言「父亲战不走通用字幕」这半句本身；前面的 null 守卫（elite 可能为空——
  // 章节时长到点但 Boss 还没生成时也会进这一支）允许存在。
  ["elite.type !== 'silent-father'", '父亲战仍会在超时时混入通用“还没有结束”字幕'],
  ["this.showFatherAttackNameOnce(move === 0 ? '进去。' : '站好。')", '父亲一阶段招式名没有进入首次门禁'],
  ["if (move === 1) this.playVoiceOnce('boss-father-stand')", '父亲一阶段《站好》仍然只有无声字幕'],
  ["this.showFatherAttackNameOnce('不许看')", '《不许看》没有进入首次门禁'],
  ["this.showFatherAttackNameOnce('都怪你')", '《都怪你》没有进入首次门禁'],
  ["this.showFatherAttackNameOnce('我没有哭')", '《我没有哭》没有进入首次门禁'],
  ['private schoolEliteDefeatedAt = 0', '少年放学声音仍使用含义错误的大 Boss 时间锚点'],
  ["enemy.type === 'uniform-answer' && this.schoolEliteDefeatedAt <= 0", '统一答案死亡没有成为放学声音锚点'],
  ["'uniform-answer': 'father-for-your-good'", '父亲旧句没有在统一答案击败后出现'],
  ["3: 'hero-became-him'", '成年章入场没有回收主角内化的旧句'],
  ["if (speedBefore <= 18) this.playVoiceOnce('self-stand-straight')", '湿鞋第一次追近没有触发主角旧句'],
  ["else if (speedBefore <= 22) this.playVoiceOnce('self-for-your-good')", '湿鞋第二次追近没有触发主角旧句'],
  ["if (action === 'father')", '缺少父亲实机测试入口'],
  ['this.encounterIndex = 1', '父亲测试入口没有进入少年章'],
  ['this.rewardSpawnedAt = this.encounterIndex', '父亲测试入口仍会同时生成少年物证台'],
  ['father.x = this.heroX + 96', '父亲测试入口没有把 Boss 放进移动端可审阅区域'],
  ['this.shotTimer = 999', '父亲测试入口仍会自动射击并提前打死审阅对象'],
  ['this.screenTransition = undefined', '父亲测试入口仍会残留标题换屏'],
  ["if (action === 'father-phase2')", '缺少父亲真实转阶段测试入口'],
  ['this.damageEnemy(father, father.maxHp * 0.02', '父亲转阶段测试仍在直接伪造阶段'],
  ["'silent-father': { type: 'silent-father', stage: 1, phase: 1 }", '父亲一阶段美术审阅入口没有进入少年章'],
  ["'silent-father-p2': { type: 'silent-father', stage: 1, phase: 2 }", '父亲二阶段美术审阅入口没有进入少年章'],
  ['private fatherChargeGeometry(enemy: EnemyUnit, angle: number)', '《不许看》缺少渲染与结算共用的几何函数'],
  ['reach: travel + (blockedByCoat ? 0 : FATHER_CHARGE_HIT_OVERHANG)', '雨衣截停后的冲锋危险带仍可能延伸到雨衣后方'],
  ['const charge = this.fatherChargeGeometry(enemy, chargeAngle);', '《不许看》结算没有读取共享几何'],
  ['heroAlong > charge.start && heroAlong < charge.reach && heroPerp < charge.band', '《不许看》命中没有读取共享前后缘与半宽'],
  ['const chargeGeometry = this.fatherChargeGeometry(enemy, enemy.attackAngle);', '《不许看》前摇没有读取共享几何'],
  ['private fatherTantrumCoatGap(ring:', '《都怪你》缺少雨衣与雨圈交点计算'],
  ['const coatGap = this.fatherTantrumCoatGap(ring);', '《都怪你》预警没有真实切开雨衣缺口'],
  ['FATHER_COAT_SHELTER_RADIUS', '雨衣安全角缺少共享半径'],
  ['Math.abs(heroDist - ring.radius) < FATHER_TANTRUM_RING_HALF_WIDTH', '《都怪你》结算没有使用命名圆环半宽'],
  ["telegraphVariant === 'silent-father-coat'", '缺少雨衣截停冲锋的实机审阅入口'],
  ["telegraphVariant === 'silent-father-tantrum'", '缺少雨衣切开雨圈的实机审阅入口'],
] ) requireToken(game, token, message);

for (const [token, message] of [
  ["trigger('boss_defeat', '统一答案被击败'", '父亲旧句的语音合同没有绑定统一答案'],
  ["trigger('stage_enter', '成年章入场，主角第一次听见自己说出旧句'", '成年主角开场回声合同不正确'],
  ["trigger('stand_still', '成年章第一次停步让湿鞋追近'", '第一条成年回声合同不正确'],
  ["trigger('stand_still', '成年章第二次停步让湿鞋追近'", '第二条成年回声合同不正确'],
  ["'hero-became-him': { scene: '屋檐下的家', speaker: '他自己' }", '成年主角回声场景或声源不正确'],
  ["'father-for-your-good': { scene: '放学后的校门口', speaker: '父亲' }", '父亲旧句的场景或声源不正确'],
  ["trigger('boss_phase', '沉默的父亲雨衣倒下、二阶段短句落下', true, 3, true)", '父亲二阶段语音没有绑定到必播阶段触发'],
] ) requireToken(voice, token, message);

for (const source of [design, canon, plan, wiki]) {
  for (const line of [
    '雨声先到，父亲后到。',
    '他还站着。',
    '雨衣倒下去，里面有人哭得喘不上气。',
    '他说没有哭，手背却一直在擦脸。',
    '雨衣留下了。话还是没说。',
  ]) requireToken(source, line, `正典材料缺少父亲原句：${line}`);
}

requireToken(stages, "bossName: '沉默的父亲'", '少年章正典 Boss 名称不正确');
requireToken(stages, "bossMeaning: '他把受过的委屈变成命令；雨里那双湿鞋也是真的。'", '少年章父亲含义仍在误用统一答案的解释');
requireToken(stages, "bossName: '响个不停'", '成年章正典 Boss 名称不正确');
requireToken(packageJson, 'validate:father-canon', 'package scripts 缺少父亲正典独立校验');
requireToken(canon, '五个会显示的攻击名各只显示一次，《外面冷》按设计不显示名字', '六章正典没有写清父亲招式名例外');
requireToken(plan, '五个会显示的攻击名各只显示一次，《外面冷》按设计不显示名字', '升级计划没有写清父亲招式名例外');
requireToken(wiki, '<tr><td>沉默的父亲</td><td>少年 · 章节 Boss 一阶段</td>', '百科敌人图鉴仍未把父亲一阶段放进少年章');
requireToken(wiki, '<tr><td>沉默的父亲 · 雨衣落下</td><td>少年 · 章节 Boss 二阶段</td>', '百科敌人图鉴仍未把父亲二阶段放进少年章');
requireToken(wikiGallery, '("silent-father-hd", "沉默的父亲", "少年 · 章节 Boss 一阶段", 64, 88)', '百科画廊生成源仍未使用少年父亲一阶段高清资源');
requireToken(wikiGallery, '("silent-father-p2-hd", "沉默的父亲 · 雨衣落下", "少年 · 章节 Boss 二阶段", 64, 76)', '百科画廊生成源仍未使用少年父亲二阶段高清资源');
requireToken(staticCatalog, 'EnemySpec("silent-father", "沉默的父亲", "少年", "boss", 300, 24, 30, 9)', '敌人静态图鉴生成源仍把父亲放在成年章或标成精英');
requireToken(staticCatalog, '"silent-father-p2", "沉默的父亲·裂甲", "少年", "phase_variant"', '敌人静态图鉴生成源仍把父亲二阶段放在成年章');

for (const [token, message] of [
  ["'silent-father': 'hero-became-him'", '父亲 Boss 仍在播放成年主角语音'],
  ["'silent-father': 'father-for-your-good'", '父亲 Boss 击败仍在播放统一答案后的旧句'],
  ["'silent-father': ['他刚说完", '父亲 Boss 仍混入旧版血量心声'],
  ["this.say('里面是两个没有学会说话的男孩')", '转阶段仍在输出解释性旧句'],
  ['bossDefeatedAt', '旧的大 Boss 时间锚点仍残留'],
  ['if (!hitCoat && heroAlong', '雨衣在远处挡住冲锋时仍让雨衣前整段错误免伤'],
] ) rejectToken(game, token, message);
rejectToken(voice, '沉默的自己登场前', '语音合同仍把成年主角回声绑到已删除 Boss');
rejectToken(design, '所属章节：成年 · 屋檐下的家', '父亲设计书仍把 Boss 归到成年章');
rejectToken(stages, "bossMeaning: '标准答案背后，是一句没有解释的“都是为你好”。'", '父亲 Boss 含义仍在复用统一答案文案');
rejectToken(canon, '| 25 | 文案 | 少年章 Boss 四句', '六章正典仍把父亲文案标为未完成');
rejectToken(plan, '| 25 | 文案 | 少年章 Boss 四句', '升级计划仍把父亲文案标为未完成');
rejectToken(wiki, '<tr><td>沉默的父亲</td><td>成年 Boss</td>', '百科敌人图鉴仍残留成年父亲');
rejectToken(wiki, '<tr><td>沉默的父亲 · 裂开</td><td>成年 Boss 二阶段</td>', '百科敌人图鉴仍残留成年父亲二阶段');

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  father: '少年章校门口：统一答案后的父亲旧句 -> 二阶段年幼父亲否认哭泣 -> 击败后雨衣原句落幕',
  adultEcho: '成年入场与湿鞋追近由主角音色回收旧句',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
