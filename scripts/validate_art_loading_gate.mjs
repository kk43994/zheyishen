import fs from 'node:fs';
import path from 'node:path';

const main = fs.readFileSync('src/main.ts', 'utf8');
const preload = fs.readFileSync('src/art-preload.ts', 'utf8');
const runtime = fs.readFileSync('src/art-runtime.ts', 'utf8');
const game = fs.readFileSync('src/game.ts', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const style = fs.readFileSync('src/style.css', 'utf8');
const errors = [];
let checks = 0;

function requireToken(source, token, message) {
  checks += 1;
  if (!source.includes(token)) errors.push(message);
}

function rejectToken(source, token, message) {
  checks += 1;
  if (source.includes(token)) errors.push(message);
}

rejectToken(main, "import { ZheYiShenGame } from './game'", '游戏模块仍会在美术闸门前静态启动');
requireToken(main, 'await preloadAllProductionArt', '没有在启动游戏前等待全部六章正式美术');
requireToken(main, "await import('./game')", '全部正式美术完成后没有动态启动游戏模块');
requireToken(main, 'requestAnimationFrame(() => requestAnimationFrame', '没有保留两帧给运行时图集建立首屏缓存');
requireToken(main, 'if (loading) loading.hidden = true', '完整美术完成后没有关闭装帧页');
requireToken(main, '正式画面不会降级', '资源失败页没有明确禁止降级展示');
requireToken(main, "auditParams.get('audit-art-fail') === '1'", '缺少美术失败阻断审阅入口');
rejectToken(main, 'warmProductionArtForStage(1)', '游戏仍会在进入后才预热少年章');
rejectToken(main, 'preloadRemainingProductionArt()', '游戏仍会在进入后才后台装订后续人生');

const preloadAt = main.indexOf('await preloadAllProductionArt');
const importAt = main.indexOf("await import('./game')");
const hideAt = main.indexOf('if (loading) loading.hidden = true');
checks += 1;
if (!(preloadAt >= 0 && importAt > preloadAt && hideAt > importAt)) {
  errors.push('启动顺序不是“全部正式美术 -> 游戏模块 -> 首帧缓存 -> 隐藏装帧页”');
}

requireToken(preload, "'./assets/**/*.png'", '美术闸门没有覆盖运行时 PNG 目录');
requireToken(preload, "import artWeights from './art-loading-weights.json'", '进度条没有按 PNG 解码像素量加权');
requireToken(preload, "priority: ArtLoadPriority", '分阶段加载没有接入统一优先级');
requireToken(preload, 'preloadAllProductionArt', '没有暴露全部正式美术硬门禁');
requireToken(preload, "loadEntries(ART_ENTRIES, 'critical', 'all'", '全部正式美术没有在启动前使用关键队列解码');
requireToken(preload, 'STAGE_TOKENS', '没有按章节声明美术预热边界');
requireToken(preload, 'isBootArt', '没有单独声明首屏与童年关键美术');
requireToken(preload, 'warmProductionArtForStage', '没有暴露下一章美术预热入口');
requireToken(preload, 'throw new ProductionArtError', '美术失败仍可能放行游戏');
requireToken(runtime, "const image = new Image()", '统一美术运行时没有创建唯一图片对象');
requireToken(runtime, 'MAX_CRITICAL_CONCURRENCY = 3', '关键美术图片解码并发没有限制为三路');
requireToken(runtime, 'MAX_DEFERRED_CONCURRENCY = 1', '后台美术没有限制为单通道解码');
requireToken(runtime, "await task.image.decode()", '只等文件读取，没有等待图片完成解码');
requireToken(runtime, 'backgroundPausedUntil', '战斗掉帧时不会暂停非关键美术预热');
requireToken(runtime, 'let gameplayActive = false', '美术运行时没有记录战斗活动状态');
requireToken(game, "setArtGameplayActive(this.state === 'battle'", '主循环没有在战斗移动期间冻结后台图片解码');
requireToken(game, 'reportArtFrameDuration(time - this.lastTime)', '主循环没有向美术预热器反馈帧压力');
requireToken(game, 'warmProductionArtForStage(this.encounterIndex + 1)', '章节开始时没有提高下一章美术优先级');
requireToken(game, 'productionArtStageReady(nextStageIndex)', '章节过场结束前没有再次确认下一章正式美术');
requireToken(game, 'this.transitionTimer = 0.35', '低速解码时没有把玩家安全留在章节过场');

requireToken(html, 'data-art-progress', '装帧页没有进度条');
requireToken(html, '六章正式美术全部装订完成后才进入，不展示程序化降级画面', '装帧页没有明确完整美术硬门禁');
requireToken(style, '.loading-card', '装帧页缺少正式视觉样式');

function listPngs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listPngs(fullPath);
    return entry.isFile() && entry.name.endsWith('.png') ? [fullPath] : [];
  });
}

const gatedAssets = listPngs('src/assets').filter((file) => (
  !path.basename(file).startsWith('preview-')
  && (
    !file.includes(path.join('src', 'assets', 'canonical-v1'))
    || file === path.join('src', 'assets', 'canonical-v1', 'enemies', 'uniform-answer.png')
    || file === path.join('src', 'assets', 'canonical-v1', 'enemies', 'hunger-shadow.png')
  )
));
checks += 1;
if (gatedAssets.length < 120) errors.push(`美术闸门覆盖数量异常：${gatedAssets.length}`);

const sourceFilesWithImageCreation = fs.readdirSync('src')
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => fs.readFileSync(path.join('src', file), 'utf8').includes('new Image()'));
checks += 1;
if (sourceFilesWithImageCreation.join(',') !== 'art-runtime.ts') {
  errors.push(`仍有模块绕过统一美术队列创建图片：${sourceFilesWithImageCreation.join(',')}`);
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  gatedAssets: gatedAssets.length,
  policy: 'all runtime art must download and decode before game import; failure blocks instead of degrading',
  errors,
}, null, 2));
if (errors.length) process.exit(1);
