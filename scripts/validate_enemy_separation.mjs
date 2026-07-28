import { separateCircularBodies } from '../src/enemy-separation.ts';

const errors = [];

const pair = [
  { x: 0, y: 0, radius: 10, dead: false },
  { x: 8, y: 0, radius: 10, dead: false },
];
const pairChecks = separateCircularBodies(pair);
const expectedDistance = 20 * 0.72;
const actualDistance = Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
if (pairChecks !== 1) errors.push(`两体场景应检查 1 对，实际 ${pairChecks}`);
if (Math.abs(actualDistance - expectedDistance) > 1e-6) {
  errors.push(`软分离距离漂移：期望 ${expectedDistance}，实际 ${actualDistance}`);
}

const sparse = Array.from({ length: 200 }, (_, index) => ({
  x: (index % 20) * 96,
  y: Math.floor(index / 20) * 96,
  radius: 14,
  dead: false,
}));
const sparseChecks = separateCircularBodies(sparse);
const allPairs = sparse.length * (sparse.length - 1) / 2;
if (sparseChecks >= allPairs * 0.15) {
  errors.push(`空间分桶没有有效削减候选对：${sparseChecks}/${allPairs}`);
}

const dead = [
  { x: 0, y: 0, radius: 20, dead: true },
  { x: 1, y: 0, radius: 20, dead: false },
];
if (separateCircularBodies(dead) !== 0) errors.push('死亡敌人仍进入分离候选');

console.log(JSON.stringify({
  valid: errors.length === 0,
  pairChecks,
  sparseChecks,
  allPairs,
  reduction: `${((1 - sparseChecks / allPairs) * 100).toFixed(1)}%`,
  errors,
}, null, 2));

if (errors.length) process.exitCode = 1;
