import { build } from 'esbuild';
import { strict as assert } from 'node:assert';

const bundled = await build({
  entryPoints: ['src/fate.ts'],
  absWorkingDir: process.cwd(),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
});
const source = bundled.outputFiles[0]?.text;
assert(source, 'failed to bundle src/fate.ts');
const fate = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const snapshot = {
  runSeed: 7,
  chapterIndex: 1,
  chapter: '少年 · 千眼教室',
  age: '少年',
  stageFocus: '第一次学会把话留在身上',
  stageBossMeaning: '被注视',
  hp: 30,
  maxHp: 30,
  coins: 2,
  items: [],
  attack: {},
  poisons: { greed: 0, anger: 0, delusion: 0, pride: 0, doubt: 0 },
  memories: [],
  recentEvents: [],
  fateItemCandidates: ['loose-button'],
  swallowCount: 0,
  exhaleCount: 0,
};

const memoryResponse = {
  label: '把纸留下',
  poison: {},
  result: '他把那张纸仍留在桌角，转身离开。',
  residue: {
    carrier: 'memory',
    motif: 'echo',
    intensity: 'normal',
    evidence: '那张纸仍留在桌角',
    recipeId: 'memory_only',
  },
};

const eventWith = (
  profile,
  swallow,
  fact = '放学后，他在教室里收到一张没有署名的纸。',
) => ({
  id: `residue-case-${({ 微光: 'glow', 交换: 'trade', 诱惑: 'lure', 反噬: 'backlash', 荒诞: 'absurd', 沉默: 'silence' })[profile]}`,
  title: '回执测试',
  fact,
  scene: { time: '放学后', place: '学校教室里', people: '他和留下纸的人' },
  profile,
  memoryId: `residue-memory-${({ 微光: 'glow', 交换: 'trade', 诱惑: 'lure', 反噬: 'backlash', 荒诞: 'absurd', 沉默: 'silence' })[profile]}`,
  memoryText: '收到过一张没有署名的纸',
  unavoidable: { kind: 'none', amount: 0, item: null },
  swallow,
  exhale: memoryResponse,
  source: 'gpt',
});

const compiled = fate.validateFateEvent(eventWith('反噬', {
  label: '练习呼吸',
  hint: '模型伪造的提示',
  effect: 'trade_max_hp',
  stats: { damage: 999 },
  poison: { doubt: 1 },
  result: '他从此每天在楼梯口练习呼吸，脚步比铃声先到。',
  residue: {
    carrier: 'habit',
    motif: 'haste',
    intensity: 'normal',
    evidence: '从此每天在楼梯口练习呼吸',
    recipeId: 'hurried_breath',
  },
}), snapshot, { requireResidue: true });
assert(compiled, 'valid residue should compile');
assert.equal(compiled.swallow.effect, 'haste', 'program recipe must override model effect');
assert.equal(compiled.swallow.hint, '攻击间隔缩短', 'program recipe must own the hint');
assert.equal(compiled.swallow.stats, undefined, 'model stats must be discarded');

const abstractEvidence = fate.validateFateEvent(eventWith('反噬', {
  label: '忽然勇敢',
  poison: {},
  result: '他说完以后忽然勇敢起来，身体也不再发抖。',
  residue: {
    carrier: 'body',
    motif: 'guard',
    intensity: 'normal',
    evidence: '忽然勇敢起来',
    recipeId: 'guarded_breath',
  },
}), snapshot, { requireResidue: true });
assert(abstractEvidence, 'an otherwise valid response may safely fall back to memory');
assert.equal(abstractEvidence.swallow.effect, 'none', 'abstract emotion must not become a body mechanic');
assert.equal(abstractEvidence.swallow.settlement.recipeId, 'memory_only');
assert.equal(abstractEvidence.swallow.settlement.carrier, 'memory');

const looseButtonFact = '放学后，老师在教室里把校服上掉下来的纽扣放在讲台上，等他认领。';
const itemBranch = fate.validateFateEvent(eventWith('交换', {
  label: '收下纽扣',
  poison: {},
  result: '老师把校服上掉下来的纽扣递给他，他收下后装进口袋。',
  residue: {
    carrier: 'item',
    motif: 'possession',
    intensity: 'normal',
    evidence: '校服上掉下来的纽扣递给他',
    recipeId: 'keep_item:loose-button',
    candidateItemId: 'loose-button',
  },
}, looseButtonFact), snapshot, { requireResidue: true });
assert(itemBranch, 'candidate item branch should compile');
assert.equal(itemBranch.swallow.gainItemId, 'loose-button');
assert.equal(itemBranch.swallow.effect, 'none');

const inventedItem = fate.validateFateEvent(eventWith('交换', {
  label: '收下木剑',
  poison: {},
  result: '老师把床底下的木剑递给他，他收下以后离开。',
  residue: {
    carrier: 'item',
    motif: 'possession',
    intensity: 'normal',
    evidence: '床底下的木剑递给他',
    recipeId: 'keep_item:wooden-sword',
    candidateItemId: 'wooden-sword',
  },
}, '放学后，老师在教室里把床底下的木剑放在讲台上，等他认领。'), snapshot, { requireResidue: true });
assert.equal(inventedItem, null, 'item outside the run candidates must be rejected');

const wild = fate.validateFateEvent(eventWith('反噬', {
  label: '只留一口气',
  poison: { anger: 1 },
  result: '他从此练成只呼出一口巨大的气，随后要扶墙很久。',
  residue: {
    carrier: 'habit',
    motif: 'weight',
    intensity: 'wild',
    evidence: '从此练成只呼出一口巨大的气',
    recipeId: 'one_giant_breath',
  },
}), snapshot, { requireResidue: true });
assert(wild, 'wild recipe should compile for a compatible profile');
assert.equal(wild.swallow.stats.damage, 100);
assert.equal(wild.swallow.stats.fireRate, -45);

const forbiddenWild = fate.validateFateEvent(eventWith('微光', {
  label: '只留一口气',
  poison: {},
  result: '他从此练成只呼出一口巨大的气，随后要扶墙很久。',
  residue: {
    carrier: 'habit',
    motif: 'weight',
    intensity: 'wild',
    evidence: '从此练成只呼出一口巨大的气',
    recipeId: 'one_giant_breath',
  },
}), snapshot, { requireResidue: true });
assert.equal(forbiddenWild, null, 'profile must gate wild and rule-breaking recipes');

const ownedSnapshot = {
  ...snapshot,
  items: [{
    id: 'loose-button',
    name: '校服上掉下来的纽扣',
    summary: '规律地多射一发',
    positive: '每第3轮攻击额外+1弹',
    negative: '没有负面作用',
  }],
};
assert.equal(
  fate.validateFateEvent(eventWith('交换', itemBranch.swallow, looseButtonFact), ownedSnapshot, { requireResidue: true }),
  null,
  'a live generation must not grant an owned fate item again',
);
assert(
  fate.validateFateEvent(
    eventWith('交换', itemBranch.swallow, looseButtonFact),
    ownedSnapshot,
    { requireResidue: true, allowAlreadyOwnedFateItem: true },
  ),
  'historical receipts may contain an item that is now owned',
);

const budget = fate.buildFateMechanicBudget(snapshot, '反噬', looseButtonFact);
assert(budget.recipes.some((recipe) => recipe.recipeId === 'one_giant_breath'));
assert(budget.recipes.some((recipe) => recipe.recipeId === 'keep_item:loose-button'));
assert(budget.recipes.every((recipe) => !Object.hasOwn(recipe, 'stats')), 'AI budget must not expose raw stat values');
const budgetWithoutItemInFact = fate.buildFateMechanicBudget(snapshot, '反噬', '老师只在讲台上留了一张纸。');
assert(
  budgetWithoutItemInFact.recipes.every((recipe) => !recipe.recipeId.startsWith('keep_item:')),
  'an item recipe must stay hidden until the core fact places that item in the scene',
);
const apologyBudget = fate.buildFreeFateMechanicBudget(
  snapshot,
  '反噬',
  '老师在教室讲台前念出他的错误答案，全班笑了几声，他盯着练习本上的红叉。',
  '对不起老师',
);
assert(
  apologyBudget.recipes.some((recipe) => recipe.recipeId === 'one_giant_breath')
    && apologyBudget.recipes.some((recipe) => recipe.recipeId === 'memory_only'),
  'free response budget must keep both attribute/mechanic outcomes and the honest memory fallback',
);
assert.notEqual(apologyBudget.preferredRecipeId, 'memory_only', 'free response budget should rotate a concrete reward preference');
const futureHabitBudget = fate.buildFreeFateMechanicBudget(
  snapshot,
  '反噬',
  '老师在教室讲台前念出他的错误答案，全班笑了几声，他盯着练习本上的红叉。',
  '我以后每次都把错题重做一遍',
);
assert(
  futureHabitBudget.recipes.some((recipe) => recipe.recipeId === 'hurried_breath'),
  'an explicit continuing habit may open habit recipes',
);
const noRepeatBudget = fate.buildFreeFateMechanicBudget(
  { ...snapshot, recentFateRecipes: ['returning_breath'] },
  '反噬',
  '老师在教室讲台前念出他的错误答案，全班笑了几声，他盯着练习本上的红叉。',
  '我以后每次都把错题重做一遍',
);
assert(
  noRepeatBudget.recipes.every((recipe) => recipe.recipeId !== 'returning_breath'),
  'recently settled recipes must be removed from the next free-response budget',
);
assert.notEqual(noRepeatBudget.preferredRecipeId, 'returning_breath', 'a blocked recent recipe cannot remain preferred');
const candidateCatalog = fate.buildFateCandidateItemCatalog(snapshot);
assert.deepEqual(candidateCatalog, [{
  id: 'loose-button',
  name: '校服上掉下来的纽扣',
  summary: '规律地多射一发',
  acquisition: '实物转移：result必须写明递给、交给、收下、带走、穿戴或放进口袋',
}]);

const accountSnapshot = { ...snapshot, fateItemCandidates: ['auto-renew'] };
const accountFact = '客服让他在手机上确认自动续费到明年的会员页面，状态仍是待开通。';
const accountBranch = fate.validateFateEvent(eventWith('交换', {
  label: '保存续费回执',
  poison: { doubt: 1 },
  result: '客服确认「自动续费到明年的会员」已经开通，他保存了页面回执。',
  residue: {
    carrier: 'item',
    motif: 'possession',
    intensity: 'normal',
    evidence: '自动续费到明年的会员」已经开通',
    recipeId: 'keep_item:auto-renew',
    candidateItemId: 'auto-renew',
  },
}, accountFact), accountSnapshot, { requireResidue: true });
assert(accountBranch, 'non-physical items should compile from an explicit account-state transfer');
assert.equal(accountBranch.swallow.gainItemId, 'auto-renew');

const vagueAccountBranch = fate.validateFateEvent(eventWith('交换', {
  label: '看见续费记录',
  poison: {},
  result: '他看见页面上写着自动续费到明年的会员，随后关掉了手机。',
  residue: {
    carrier: 'item',
    motif: 'possession',
    intensity: 'normal',
    evidence: '写着自动续费到明年的会员',
    recipeId: 'keep_item:auto-renew',
    candidateItemId: 'auto-renew',
  },
}, accountFact), accountSnapshot, { requireResidue: true });
assert.equal(vagueAccountBranch, null, 'merely seeing an account item must not grant it');

const hardCoinResource = fate.validateFateEvent(eventWith('反噬', {
  label: '把找零收下',
  poison: { greed: 1 },
  result: '他接过收银员递来的五毛硬币塞进裤兜，随后离开便利店。',
  residue: {
    carrier: 'resource',
    motif: 'recovery',
    intensity: 'normal',
    evidence: '接过收银员递来的五毛硬币塞进裤兜',
    recipeId: 'returned_change',
  },
}), snapshot, { requireResidue: true });
assert(hardCoinResource, 'concrete coin evidence should compile as a resource settlement');
assert.equal(hardCoinResource.swallow.effect, 'gain_coins');

console.log('fate residue compiler: ok');
