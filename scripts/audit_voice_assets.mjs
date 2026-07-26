import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { loadVoiceContract } from './load_voice_contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PYTHON = resolve(ROOT, 'tmp/asr-venv/bin/python');
const CONTRACT_PATH = resolve(ROOT, 'tmp/voice-audit-contract.json');
const onlyArg = process.argv.find((argument) => argument.startsWith('--only='));
const onlyIds = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null;
const { VOICE_CUES, VOICE_CUE_IDS, validateVoiceScript } = await loadVoiceContract(ROOT);
validateVoiceScript();

const requestedIds = VOICE_CUE_IDS.filter((id) => !onlyIds || onlyIds.has(id));
if (onlyIds) {
  const unknown = [...onlyIds].filter((id) => !VOICE_CUES[id]);
  if (unknown.length) throw new Error(`unknown voice cue ids: ${unknown.join(', ')}`);
}

await mkdir(resolve(ROOT, 'tmp'), { recursive: true });
await writeFile(CONTRACT_PATH, `${JSON.stringify({
  root: ROOT,
  model: process.env.VOICE_ASR_MODEL || 'mlx-community/whisper-large-v3-turbo-4bit',
  cueOrder: VOICE_CUE_IDS,
  cues: requestedIds.map((id) => VOICE_CUES[id]),
}, null, 2)}\n`, 'utf8');

const worker = spawn(PYTHON, [resolve(ROOT, 'scripts/voice_asr_audit.py'), CONTRACT_PATH], {
  cwd: ROOT,
  stdio: 'inherit',
});
const exitCode = await new Promise((resolveExit, reject) => {
  worker.once('error', reject);
  worker.once('exit', (code, signal) => resolveExit(signal ? 1 : (code ?? 1)));
});
if (exitCode !== 0) throw new Error(`voice ASR audit failed with exit code ${exitCode}`);
