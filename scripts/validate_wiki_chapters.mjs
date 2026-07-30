import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (file) => readFile(resolve(root, file), 'utf8');
const readJson = async (file) => JSON.parse(await read(file));
const errors = [];

const [
  chapters,
  home,
  shell,
  items,
  voices,
  world,
  vfx,
  candidates,
  projectileReview,
  legacyBoss,
  legacyBestiary,
  voiceCanonSource,
  enemies,
  bosses,
] = await Promise.all([
  read('docs/chapters.html'),
  read('docs/这一身百科.html'),
  read('docs/wiki-shell-v1.js'),
  read('docs/items.html'),
  read('docs/voices.html'),
  read('docs/world.html'),
  read('docs/vfx.html'),
  read('docs/art-candidates.html'),
  read('docs/review-projectiles.html'),
  read('docs/boss.html'),
  read('docs/bestiary.html'),
  read('docs/voice-canon-v1.js'),
  readJson('docs/wiki-data/enemies.json'),
  readJson('docs/wiki-data/bosses.json'),
]);
const voiceCanon = JSON.parse(voiceCanonSource.split('=', 2)[1].trim().replace(/;$/, ''));

const requireToken = (text, token, message) => {
  if (!text.includes(token)) errors.push(message);
};
const rejectToken = (text, token, message) => {
  if (text.includes(token)) errors.push(message);
};

requireToken(chapters, '<title>《这一身》百科 · 章节志</title>', '章节志标题缺失');
requireToken(chapters, 'id="chapter-finale"', '章节志缺少终局');
requireToken(home, 'href="chapters.html"', '百科首页没有章节志入口');
requireToken(home, 'class="judge-glance"', '百科首页缺少评委三十秒速读');
requireToken(home, '他一生没有换过武器，只是这一口气一直在变', '评委速读没有讲清核心机制');
requireToken(home, '前一件事，会留在后一件事里', '评委速读没有讲清 AI 与程序边界');
requireToken(home, '得到的，穿在身上；失去的，也穿在身上', '评委速读没有讲清道具反讽与终局反转');
requireToken(home, 'AI 原生特色玩法 · 命运档案柜', '百科首页缺少 AI 原生特色玩法档案柜');
requireToken(home, 'AI 决定这次给什么；程序检查能不能给', 'AI 特色玩法缺少生成与程序裁决边界');
requireToken(home, '亲口说 · 第三句话', 'AI 特色玩法缺少亲口说机制');
requireToken(home, '故事决定选哪个出生特质；程序决定这个特质究竟加减多少', 'AI 特色玩法缺少出生故事到确定属性的边界');
requireToken(home, '77 件道具 · 可交互物证池', '百科首页缺少可点击的 77 件道具池');
requireToken(home, 'assets/wiki/img/ai-fate-director-v1.png', '百科首页缺少 AI 命运导演总览图');
for (const proof of ['6', '77', '38', '21', '354', '164', '84 + 168']) {
  requireToken(home, `<b>${proof}</b>`, `评委速读缺少完成度证据：${proof}`);
}
requireToken(shell, "['chapters.html', '章节志']", '共享顶栏没有章节志入口');
requireToken(candidates, 'href="这一身百科.html"', '生产档案本地返回链接没有指向百科正典文件');
requireToken(vfx, 'href="review-projectiles.html"', '特效馆缺少弹体逐帧审阅入口');
requireToken(projectileReview, 'href="vfx.html"', '弹体审阅页缺少返回特效馆入口');
requireToken(projectileReview, `${Object.keys((await readJson('src/assets/vfx/projectile-anim.json')).forms).length} 形态 × 4 帧`, '弹体审阅页形态数量过期');
requireToken(legacyBoss, 'location.replace("chapters.html" + location.hash)', '旧 Boss 志没有保留 hash 跳转');
requireToken(legacyBestiary, 'location.replace("chapters.html" + location.hash)', '旧敌怪志没有保留 hash 跳转');

for (const legacy of ['boss.html', 'bestiary.html']) {
  rejectToken(chapters, legacy, `章节志仍引用旧分页：${legacy}`);
  rejectToken(home, legacy, `百科首页仍引用旧分页：${legacy}`);
  rejectToken(shell, legacy, `共享顶栏仍引用旧分页：${legacy}`);
}

const chapterIds = [...chapters.matchAll(/<section class="chapter(?: finale)?" id="([^"]+)"/g)]
  .map((match) => match[1]);
const expectedChapterIds = [
  'chapter-childhood',
  'chapter-school',
  'chapter-youth',
  'chapter-adulthood',
  'chapter-middle-age',
  'chapter-old-age',
  // 跨章线索已按作者裁决拆进各章的「这一章之外」，不再是独立附录。
  'chapter-finale',
];
if (JSON.stringify(chapterIds) !== JSON.stringify(expectedChapterIds)) {
  errors.push(`章节顺序不正确：${chapterIds.join(', ')}`);
}

const enemyIds = [...chapters.matchAll(/id="enemy-([^"]+)" data-threat="ordinary"/g)]
  .map((match) => match[1]);
const bossIds = [...chapters.matchAll(/id="boss-([^"]+)" data-threat="[^"]+"/g)]
  .map((match) => match[1]);
const expectedEnemyIds = enemies.map((enemy) => enemy.id);
const expectedBossIds = bosses.map((boss) => boss.id);
for (const id of expectedEnemyIds) {
  if (!enemyIds.includes(id)) errors.push(`章节志缺少普通怪：${id}`);
}
for (const id of expectedBossIds) {
  if (!bossIds.includes(id)) errors.push(`章节志缺少 Boss：${id}`);
}
if (enemyIds.length !== expectedEnemyIds.length || new Set(enemyIds).size !== enemyIds.length) {
  errors.push(`章节志普通怪应唯一收录 ${expectedEnemyIds.length} 个，实际 ${enemyIds.length}`);
}
if (bossIds.length !== expectedBossIds.length || new Set(bossIds).size !== bossIds.length) {
  errors.push(`章节志 Boss 应唯一收录 ${expectedBossIds.length} 个，实际 ${bossIds.length}`);
}

const navPages = ['这一身百科.html', 'chapters.html', 'items.html', 'voices.html', 'world.html', 'vfx.html'];
for (const page of navPages) {
  requireToken(chapters, `href="${page}"`, `章节志顶栏缺少：${page}`);
}
for (let index = 0; index < 6; index += 1) {
  requireToken(chapters, `assets/wiki/img/floor-${index}.png`, `章节志缺少第 ${index + 1} 章地面`);
  for (let prop = 0; prop < 4; prop += 1) {
    requireToken(
      chapters,
      `assets/wiki/img/prop-${index}-${prop}.png`,
      `章节志缺少第 ${index + 1} 章摆设 ${prop + 1}`,
    );
  }
}

const sitePages = new Map([
  ['章节志', chapters],
  ['道具志', items],
  ['语音馆', voices],
  ['世界志', world],
  ['特效馆', vfx],
  ['生产档案', candidates],
  ['弹体审阅', projectileReview],
  ['旧 Boss 志', legacyBoss],
  ['旧敌怪志', legacyBestiary],
]);
const localAssets = new Set();
for (const [label, html] of sitePages) {
  const pageAssets = [...html.matchAll(/(?:src|data-src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.startsWith('data:') && !/^https?:/.test(path));
  for (const relative of new Set(pageAssets)) {
    localAssets.add(relative);
    try {
      await access(resolve(root, 'docs', relative.split('?')[0]));
    } catch {
      errors.push(`${label}引用的本地资产不存在：${relative}`);
    }
  }

  const hrefTargets = [...html.matchAll(/href="([^"#?]+\.html)(?:\?[^"]*)?"/g)]
    .map((match) => match[1]);
  for (const relative of new Set(hrefTargets)) {
    try {
      await access(resolve(root, 'docs', relative));
    } catch {
      errors.push(`${label}导航目标不存在：${relative}`);
    }
  }
}

for (const asset of [
  'docs/assets/wiki/img/review-projectile-anim.png',
  'docs/assets/wiki/img/review-hits.png',
  'docs/assets/wiki/font/fusion-bold-pixel-12px-proportional-zh_hans.otf.woff2',
  'docs/assets/wiki/font/fusion-bold-pixel-OFL.txt',
]) {
  try {
    await access(resolve(root, asset));
  } catch {
    errors.push(`弹体审阅运行时图集不存在：${asset}`);
  }
}

const voiceIds = [...voices.matchAll(/class="vo" id="vo-([^"]+)"/g)].map((match) => match[1]);
const voiceButtons = [...voices.matchAll(/class="vo-play"/g)].length;
const comboEffects = [...items.matchAll(/class="combo-effect-text"/g)].length;
if (comboEffects !== 12) {
  errors.push(`道具志应有 12 条虹彩奥义加成，实际 ${comboEffects}`);
}
if (voiceIds.length !== voiceCanon.length || new Set(voiceIds).size !== voiceIds.length) {
  errors.push(`语音馆应唯一陈列 ${voiceCanon.length} 条，实际 ${voiceIds.length}`);
}
if (voiceButtons !== voiceCanon.length) {
  errors.push(`语音馆应有 ${voiceCanon.length} 个试听按钮，实际 ${voiceButtons}`);
}
for (const clip of voiceCanon) {
  requireToken(voices, `id="vo-${clip.id}"`, `语音馆缺少台词：${clip.id}`);
  const filename = clip.file.split('/').at(-1);
  requireToken(voices, `data-src="assets/voice/${filename}"`, `语音馆缺少试听资源：${clip.id}`);
  try {
    await access(resolve(root, 'docs/assets/voice', filename));
  } catch {
    errors.push(`百科语音副本不存在：${filename}`);
  }
}

const speakerGroups = new Map();
for (const clip of voiceCanon) {
  const speaker = clip.speaker || clip.role || '其他';
  if (!speakerGroups.has(speaker)) speakerGroups.set(speaker, []);
  speakerGroups.get(speaker).push(clip);
}
for (const speaker of speakerGroups.keys()) {
  const expected = createHash('sha256').update(speaker).digest('hex').slice(0, 12);
  requireToken(voices, `id="speaker-${expected}"`, `语音角色锚点不稳定：${speaker}`);
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  chapters: chapterIds.length,
  ordinaryEnemies: enemyIds.length,
  bosses: bossIds.length,
  voices: voiceIds.length,
  localAssets: localAssets.size,
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
