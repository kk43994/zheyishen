import { readFile } from 'node:fs/promises';

const [wiki, source, manifestText] = await Promise.all([
  readFile('docs/这一身百科.html', 'utf8'),
  readFile('scripts/build_wiki_art_gallery.py', 'utf8'),
  readFile('src/assets/enemies/boss-skills-v1/manifest.json', 'utf8'),
]);

const manifest = JSON.parse(manifestText);
const start = wiki.indexOf('<!-- ART-GALLERY-START -->');
const end = wiki.indexOf('<!-- ART-GALLERY-END -->');
const gallery = start >= 0 && end > start ? wiki.slice(start, end) : '';
const errors = [];
let checks = 0;

const requireToken = (text, token, message) => {
  checks += 1;
  if (!text.includes(token)) errors.push(message);
};
const rejectToken = (text, token, message) => {
  checks += 1;
  if (text.includes(token)) errors.push(message);
};

requireToken(gallery, '敌怪图集 · 六章现役 41 个视觉形态', '百科画廊没有完整列出当前 41 个敌人视觉形态');
requireToken(gallery, '大小 Boss · 专属攻击动画逐帧审阅', '百科缺少大小 Boss 专属攻击逐帧画廊');
requireToken(gallery, '15 个阶段形态 · 39 条独立动作 · 156 帧', '百科 Boss 动画统计与运行时图集不一致');
requireToken(wiki, '六章大小 Boss 当前共 15 个阶段形态、39 条专属动作、156 帧', '百科世界观仍在使用旧 Boss 动画总数');
requireToken(wiki, '仅统计六只章节大 Boss：9 个阶段形态 · 29 条独立动作 · 每条 4 帧', '百科没有明确区分章节大 Boss 子集与大小 Boss 总表');
requireToken(gallery, '统一答案</td><td>少年 · 小 Boss', '百科仍未把统一答案标为少年小 Boss');
requireToken(gallery, '错过的那一班</td><td>青年 · 小 Boss', '百科仍未把末班车标为青年小 Boss');
requireToken(gallery, '还没干的那双鞋</td><td>成年 · 小 Boss', '百科缺少成年小 Boss 湿鞋');
requireToken(gallery, '走马灯</td><td>暮年 · 小 Boss', '百科仍未把走马灯标为暮年小 Boss');

for (const name of [
  '童年《没人相信的怪物》',
  '少年《沉默的父亲》一阶段',
  '少年《沉默的父亲》二阶段',
  '青年《你很优秀》一阶段',
  '青年《你很优秀》二阶段',
  '成年《响个不停》一阶段',
  '成年《响个不停》二阶段',
  '中年《上门催收》',
  '暮年《收灯人》',
  '童年小 Boss《立在墙角的衣架》',
  '少年小 Boss《统一答案》',
  '青年小 Boss《错过的那一班》',
  '成年小 Boss《还没干的那双鞋》',
  '中年小 Boss《不知道是谁的纸箱》',
  '暮年小 Boss《走马灯》',
]) requireToken(gallery, name, `百科 Boss 逐帧画廊缺少：${name}`);

for (const label of [
  '被窝里的影子', '柜门裂开',
  '进去', '站好', '外面冷', '不许看', '都怪你', '我没有哭',
  '我看好你', '这个只有你能做', '退桌', '你怎么看',
  '拍桌', '下班前给我', '优化', '离职', '岗位只有一个',
  '响铃', '接听', '未接', '分裂响铃', '分裂接听', '分裂未接',
  '寄账单', '上门拖拽', '换个门', '点名', '收灯', '吹灯',
  '里面有人吗', '两只袖子', '标准答案', '过程没写', '卷子往后传',
  '开走', '又跟近了', '清点', '转起来', '一生回来',
]) requireToken(gallery, `《${label}》 · 4 帧`, `百科缺少 Boss 专属四帧动作：《${label}》`);

rejectToken(gallery, '统一答案</td><td>少年 Boss', '百科附卷仍把统一答案列为章节 Boss');
rejectToken(gallery, '末班车</td><td>青年 Boss', '百科附卷仍把末班车列为章节 Boss');
rejectToken(gallery, '饭桌上没说完的话</td><td>成年精英', '百科附卷仍展示已撤换的成年精英');
rejectToken(gallery, '沉默的父亲</td><td>成年 Boss', '百科附卷仍把父亲放在成年章');

const actionCaptions = gallery.match(/》 · 4 帧<\/figcaption>/g) ?? [];
checks += 1;
if (actionCaptions.length !== 39) errors.push(`百科应有 39 条 Boss 动作条，实际 ${actionCaptions.length}`);

const assetCount = Object.keys(manifest.assets).length;
const skillCount = Object.keys(manifest.skills).length;
const frameCount = skillCount * 4;
checks += 3;
if (assetCount !== 15) errors.push(`Boss 技能清单阶段形态应为 15，实际 ${assetCount}`);
if (skillCount !== 39) errors.push(`Boss 技能清单动作应为 39，实际 ${skillCount}`);
if (frameCount !== 156) errors.push(`Boss 技能清单帧数应为 156，实际 ${frameCount}`);

requireToken(source, '("praise-chair-p2", "你很优秀 · 起身", "青年 · 章节 Boss 二阶段", 96, 96)', '百科生成源没有保留领导二阶段的独立大尺寸资源');
requireToken(source, '("silent-father-hd", "沉默的父亲", "少年 · 章节 Boss 一阶段", 64, 88)', '百科生成源没有使用父亲一阶段高清资源');
requireToken(source, 'BOSS_SKILL_MANIFEST', '百科生成源没有从 Boss 技能清单构建逐帧画廊');
requireToken(source, 'max-width:100%;height:auto;', 'Boss 四帧动作条缺少移动端宽度约束');

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  enemyVisualForms: 41,
  bossPhaseForms: assetCount,
  bossActions: skillCount,
  bossFrames: frameCount,
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
