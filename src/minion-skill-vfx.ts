import type { EnemyType } from './types';

type BossOrEliteType =
  | 'silent-father'
  | 'lamp-keeper'
  | 'closet-dark'
  | 'uniform-answer'
  | 'last-bus'
  | 'debt-collector'
  | 'coat-rack'
  | 'whose-box'
  | 'wet-shoes'
  | 'revolving-lantern'
  | 'praise-chair'
  | 'ringing-phone';

export type MinionSkillVfxType = Exclude<EnemyType, BossOrEliteType>;
export type MinionSkillVfxMotion = 'aura' | 'directional' | 'impact' | 'field';
export type MinionSkillVfxPattern =
  | 'breath'
  | 'powder'
  | 'shadow'
  | 'mark'
  | 'whisper'
  | 'machine'
  | 'paper'
  | 'signal'
  | 'silence'
  | 'scan'
  | 'task'
  | 'light'
  | 'heat'
  | 'door'
  | 'queue'
  | 'family'
  | 'medical';

export interface MinionSkillVfxSpec {
  motion: MinionSkillVfxMotion;
  pattern: MinionSkillVfxPattern;
  theme: string;
  core: string;
  debris: string;
  intensity: 1 | 2 | 3;
  radius: number;
  count: number;
  phase: number;
}

/**
 * Every non-boss enemy has an explicit recipe—even passive blockers and
 * decoys. The latter use low intensity so their particles communicate their
 * actual mechanic instead of falsely promising an attack.
 */
const MINION_SKILL_VFX: Record<MinionSkillVfxType, MinionSkillVfxSpec> = {
  fear: {
    motion: 'aura', pattern: 'breath', theme: '#625873', core: '#d9cce1',
    debris: '#332e3e', intensity: 2, radius: 1.75, count: 12, phase: 0.08,
  },
  'red-mark': {
    motion: 'directional', pattern: 'mark', theme: '#e34f62', core: '#ffd6d9',
    debris: '#7e2d3b', intensity: 2, radius: 1.45, count: 14, phase: 0.17,
  },
  whisper: {
    motion: 'aura', pattern: 'whisper', theme: '#ac6f9d', core: '#f3c7df',
    debris: '#5b405d', intensity: 2, radius: 1.7, count: 11, phase: 0.29,
  },
  clockwork: {
    motion: 'impact', pattern: 'machine', theme: '#b59a67', core: '#fff0b9',
    debris: '#685944', intensity: 1, radius: 1.25, count: 9, phase: 0.41,
  },
  debt: {
    motion: 'impact', pattern: 'paper', theme: '#b96069', core: '#ffe2d8',
    debris: '#6b3e43', intensity: 1, radius: 1.35, count: 10, phase: 0.53,
  },
  'cry-moth': {
    motion: 'aura', pattern: 'powder', theme: '#d59abc', core: '#fff0f8',
    debris: '#745268', intensity: 2, radius: 1.85, count: 16, phase: 0.64,
  },
  'hunger-shadow': {
    motion: 'directional', pattern: 'shadow', theme: '#aa9b82', core: '#f3e4c8',
    debris: '#4e4b49', intensity: 3, radius: 1.55, count: 18, phase: 0.76,
  },
  'missed-bus': {
    motion: 'directional', pattern: 'machine', theme: '#e8c451', core: '#fff9cf',
    debris: '#69727a', intensity: 3, radius: 1.65, count: 18, phase: 0.88,
  },
  'missed-call': {
    motion: 'aura', pattern: 'signal', theme: '#67bfd3', core: '#ecffff',
    debris: '#456c78', intensity: 2, radius: 1.8, count: 15, phase: 0.12,
  },
  silence: {
    motion: 'field', pattern: 'silence', theme: '#7f8790', core: '#e0e3e4',
    debris: '#3c4147', intensity: 1, radius: 1.75, count: 8, phase: 0.24,
  },
  'badge-thief': {
    motion: 'impact', pattern: 'signal', theme: '#d17858', core: '#ffe6ad',
    debris: '#70473d', intensity: 2, radius: 1.35, count: 12, phase: 0.36,
  },
  forgetter: {
    motion: 'impact', pattern: 'shadow', theme: '#91899b', core: '#eee8f3',
    debris: '#514d59', intensity: 1, radius: 1.4, count: 10, phase: 0.48,
  },
  'empty-chair': {
    motion: 'field', pattern: 'silence', theme: '#5f5c66', core: '#bdb9c2',
    debris: '#34323a', intensity: 1, radius: 1.2, count: 5, phase: 0.6,
  },
  'others-paper': {
    motion: 'aura', pattern: 'paper', theme: '#d8566a', core: '#ffe3e4',
    debris: '#78414a', intensity: 2, radius: 2, count: 15, phase: 0.72,
  },
  'sign-here': {
    motion: 'field', pattern: 'paper', theme: '#bca36f', core: '#fff2c9',
    debris: '#6f624a', intensity: 1, radius: 1.7, count: 8, phase: 0.84,
  },
  'id-scanner': {
    motion: 'field', pattern: 'scan', theme: '#59d99a', core: '#eafff2',
    debris: '#356f59', intensity: 3, radius: 1.8, count: 18, phase: 0.96,
  },
  'task-simple': {
    motion: 'impact', pattern: 'task', theme: '#819eb2', core: '#e8f5ff',
    debris: '#4d6170', intensity: 2, radius: 1.45, count: 13, phase: 0.11,
  },
  'task-revise': {
    motion: 'aura', pattern: 'task', theme: '#b78ca9', core: '#ffe8f7',
    debris: '#6c4d63', intensity: 2, radius: 1.55, count: 14, phase: 0.23,
  },
  'task-deadline': {
    motion: 'impact', pattern: 'task', theme: '#dc695f', core: '#fff0c8',
    debris: '#765044', intensity: 3, radius: 1.75, count: 18, phase: 0.35,
  },
  'task-sync': {
    motion: 'aura', pattern: 'task', theme: '#6ca99b', core: '#e9fff8',
    debris: '#426b62', intensity: 2, radius: 1.9, count: 16, phase: 0.47,
  },
  'desk-lamp': {
    motion: 'field', pattern: 'light', theme: '#e5c66f', core: '#fff8d4',
    debris: '#726342', intensity: 1, radius: 1.8, count: 9, phase: 0.59,
  },
  'reheated-pot': {
    motion: 'field', pattern: 'heat', theme: '#c77a5f', core: '#ffe2bc',
    debris: '#6d5044', intensity: 2, radius: 1.55, count: 12, phase: 0.71,
  },
  'meeting-door': {
    motion: 'field', pattern: 'door', theme: '#b88b58', core: '#ffe0a6',
    debris: '#5e4939', intensity: 1, radius: 1.7, count: 8, phase: 0.83,
  },
  'checkup-report': {
    motion: 'impact', pattern: 'medical', theme: '#d45d68', core: '#ffe1db',
    debris: '#774249', intensity: 3, radius: 1.65, count: 17, phase: 0.95,
  },
  'queue-screen': {
    motion: 'aura', pattern: 'queue', theme: '#df654c', core: '#ffd4a8',
    debris: '#723c34', intensity: 2, radius: 1.75, count: 14, phase: 0.14,
  },
  'others-family': {
    motion: 'directional', pattern: 'family', theme: '#b58c50', core: '#fff0c2',
    debris: '#615445', intensity: 2, radius: 1.55, count: 13, phase: 0.26,
  },
  'iv-stand': {
    motion: 'directional', pattern: 'medical', theme: '#76b8ae', core: '#eafffb',
    debris: '#496963', intensity: 2, radius: 1.5, count: 12, phase: 0.38,
  },
};

export function isMinionSkillVfxType(type: EnemyType): type is MinionSkillVfxType {
  return type in MINION_SKILL_VFX;
}

export function minionSkillVfxSpec(type: MinionSkillVfxType): MinionSkillVfxSpec {
  return MINION_SKILL_VFX[type];
}
