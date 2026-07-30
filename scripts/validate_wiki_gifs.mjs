import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (file) => readFile(resolve(root, file));
const readJson = async (file) => JSON.parse((await read(file)).toString('utf8'));
const errors = [];

const [wiki, chapters, projectileManifest, hitManifest, saveManifest, bossV1, bossV2, items, enemies, bosses] =
  await Promise.all([
    read('docs/这一身百科.html').then((buffer) => buffer.toString('utf8')),
    read('docs/chapters.html').then((buffer) => buffer.toString('utf8')),
    readJson('src/assets/vfx/projectile-anim.json'),
    readJson('src/assets/vfx/hits.json'),
    readJson('src/assets/vfx/saves.json'),
    readJson('src/assets/enemies/boss-skills-v1/manifest.json'),
    readJson('src/assets/enemies/boss-skills-v2/manifest.json'),
    readJson('docs/wiki-data/items.json'),
    readJson('docs/wiki-data/enemies.json'),
    readJson('docs/wiki-data/bosses.json'),
  ]);

const expected = {
  projectile: projectileManifest.forms.map((form) => `projectile/${form}.gif`),
  hit: hitManifest.materials.map((material) => `hit/${material}.gif`),
  save: saveManifest.kinds.map((kind) => `save/${kind}.gif`),
  hero: ['idle', 'walk', 'attack', 'hurt'].flatMap((motion) => [
    `hero/hero-${motion}.gif`,
    `hero/hero-${motion}-raincoat.gif`,
  ]),
  bossV1: Object.keys(bossV1.skills).map((id) => `boss-skill/${id}.gif`),
  bossV2: Object.keys(bossV2.skills).map((id) => `boss-skill-8f/${id}.gif`),
};

const requiredRelativeFiles = Object.values(expected).flat();
for (const relative of requiredRelativeFiles) {
  const file = `docs/assets/wiki/gif/${relative}`;
  let buffer;
  try {
    buffer = await read(file);
  } catch {
    errors.push(`missing GIF: ${relative}`);
    continue;
  }
  const signature = buffer.subarray(0, 6).toString('ascii');
  if (!['GIF87a', 'GIF89a'].includes(signature)) errors.push(`invalid GIF signature: ${relative}`);
  if (buffer.length < 128) errors.push(`GIF is unexpectedly small: ${relative}`);
  if (!wiki.includes(`assets/wiki/gif/${relative}`)) errors.push(`wiki does not reference GIF: ${relative}`);
}

const projectileFiles = (await readdir(resolve(root, 'docs/assets/wiki/gif/projectile')))
  .filter((file) => file.endsWith('.gif'))
  .sort();
const expectedProjectileFiles = projectileManifest.forms.map((form) => `${form}.gif`).sort();
if (JSON.stringify(projectileFiles) !== JSON.stringify(expectedProjectileFiles)) {
  errors.push('projectile GIF set does not exactly match projectile-anim manifest forms');
}

const gifReferences = [...wiki.matchAll(/assets\/wiki\/gif\/[^"']+\.gif/g)].map((match) => match[0]);
if (new Set(gifReferences).size < 280) {
  errors.push(`wiki must visibly use the generated animation library, got ${new Set(gifReferences).size} unique GIF references`);
}

if (items.items?.length !== 77 || items.combos?.length !== 12) {
  errors.push(`wiki item data must contain 77 items and 12 combos`);
}
if (enemies.length !== 26) errors.push(`wiki enemy data must contain 26 current ordinary enemies`);
if (bosses.length !== 12) errors.push(`wiki boss data must contain 12 current bosses`);

const unique = (values) => new Set(values).size === values.length;
if (!unique(items.items.map((item) => item.id))) errors.push('wiki item data contains duplicate ids');
if (!unique(enemies.map((enemy) => enemy.id))) errors.push('wiki enemy data contains duplicate ids');
if (!unique(bosses.map((boss) => boss.id))) errors.push('wiki boss data contains duplicate ids');

const itemIds = new Set(items.items.map((item) => item.id));
for (const combo of items.combos) {
  for (const member of combo.members) {
    if (!itemIds.has(member)) errors.push(`combo ${combo.key} references unknown item ${member}`);
  }
}

const bossSkillIds = new Set(Object.keys(bossV1.skills));
for (const boss of bosses) {
  for (const skill of boss.skills) {
    if (!bossSkillIds.has(skill.skillId)) {
      errors.push(`boss ${boss.id} references unknown skill ${skill.skillId}`);
    }
    const relative = skill.skillId in bossV2.skills
      ? `boss-skill-8f/${skill.skillId}.gif`
      : `boss-skill/${skill.skillId}.gif`;
    if (!chapters.includes(`assets/wiki/gif/${relative}`)) {
      errors.push(`chapters does not reference current boss skill GIF: ${relative}`);
    }
  }
}

for (const enemy of enemies) {
  for (const motion of ['idle', 'move', 'attack', 'hurt', 'death']) {
    const relative = `enemy/${enemy.atlas}-${motion}.gif`;
    if (!chapters.includes(`assets/wiki/gif/${relative}`)) {
      errors.push(`chapters does not reference ordinary enemy GIF: ${relative}`);
    }
  }
}

const chapterEnemyGifs = new Set(
  [...chapters.matchAll(/assets\/wiki\/gif\/enemy\/[^"']+\.gif/g)].map((match) => match[0]),
);
if (chapterEnemyGifs.size !== 205) {
  errors.push(`chapters must reference 205 current enemy/Boss motion GIFs, got ${chapterEnemyGifs.size}`);
}

console.log(JSON.stringify({
  valid: errors.length === 0,
  expectedAnimatedAssets: requiredRelativeFiles.length,
  uniqueGifReferences: new Set(gifReferences).size,
  itemEntries: items.items.length,
  enemyEntries: enemies.length,
  bossEntries: bosses.length,
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
