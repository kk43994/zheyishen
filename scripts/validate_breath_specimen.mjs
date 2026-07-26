import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = (path) => readFile(resolve(process.cwd(), path), 'utf8');
const [game, canon, plan, wiki, packageJson] = await Promise.all([
  read('src/game.ts'),
  read('docs/六章Boss编排与传承线-v1.md'),
  read('docs/升级计划最新.md'),
  read('docs/这一身百科.html'),
  read('package.json'),
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
  ['const specimen = this.currentBreathSpecimen()', '封卷页没有读取最终一口气配方'],
  ['this.computeAttackVector()', '标本没有复用本局最终攻击向量'],
  ['this.computeProjectileVisual()', '标本没有复用运行时弹体视觉裁决'],
  ['this.drawBreathSpecimen(', '封卷页没有绘制静态标本'],
  ['this.drawBreathSpecimenSprite(', '标本缺少独立静态弹体绘制'],
  ['projectileAtlas.tintedNamed(spriteName, visual.materialTint, tintStrength)', '标本没有复用正式弹体图集'],
  ['PROJECTILE_FORM_DISPLAY_SIZE[visual.form]', '战斗弹体与标本没有共用尺寸曲线'],
  ['你这一辈子，最后攒成了这么一团气。', '封卷页缺少正典结算句'],
  ['PROJECTILE_FORM_LABELS[visual.form]', '标本缺少最终外形标签'],
  ['PROJECTILE_TRAIL_LABELS[visual.trail]', '标本缺少唯一尾迹标签'],
  ["visual.materials.map((material) => PROJECTILE_MATERIAL_LABELS[material])", '标本缺少生效材质标签'],
  ['flags.map((flag) => PROJECTILE_FLAG_LABELS[flag])', '标本缺少生效机制标签'],
  ["['芯', visual.coreColor], ['质', visual.materialTint], ['缘', visual.edgeColor]", '标本缺少芯、质、缘三枚颜色色板'],
  ["this.hasProjectileTrigger('three-day-visible')", '标本没有标记环绕派生'],
  ['INHERITED_PROJECTILE_ITEM_IDS.some', '标本没有标记继承回声类派生弹'],
  ['breathSpecimen: this.state === \'result\'', '审阅状态没有暴露标本数据'],
  ["if (!visual.materials.includes('water')) visual.materials.push('water')", '雨衣情书湿润组合仍漏记水材质'],
]) requireToken(game, token, message);

for (const flag of ['pierce', 'returning', 'homing', 'split', 'area', 'orbit', 'echo']) {
  requireToken(game, `${flag}: '`, `标本标签表缺少 ${flag}`);
}

for (const [source, label] of [[canon, '正典'], [plan, '升级计划'], [wiki, '百科']]) {
  requireToken(source, '一口气标本', `${label}没有记录一口气标本`);
  requireToken(source, '你这一辈子，最后攒成了这么一团气。', `${label}缺少标本正典句`);
}

requireToken(packageJson, 'validate:breath-specimen', 'package scripts 缺少标本独立校验');
rejectToken(canon, '| 31 | 新增机制 | 结算', '正典仍把一口气标本标成未完成');
rejectToken(plan, '结算一口气标本（P6）', '升级计划待办仍包含已经完成的一口气标本');

console.log(JSON.stringify({
  valid: errors.length === 0,
  checks,
  source: 'final attack vector + final projectile visual',
  specimen: 'one form + one trail + material colors + every active typed flag',
  audit: '?audit=1&audit-result=won&tab=seal',
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
