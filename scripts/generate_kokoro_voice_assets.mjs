import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { loadVoiceContract } from './load_voice_contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PYTHON = resolve(ROOT, 'tmp/kokoro-venv/bin/python');
const CONTRACT_PATH = resolve(ROOT, 'tmp/kokoro-voice-contract.json');
const force = process.argv.includes('--force');
const forceLocal = process.argv.includes('--force-local');
const onlyArg = process.argv.find((argument) => argument.startsWith('--only='));
const onlyIds = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null;

const pythonInfo = await stat(PYTHON).catch(() => null);
if (!pythonInfo?.isFile()) {
  throw new Error('Kokoro environment missing. Run: /opt/homebrew/bin/python3.11 -m venv tmp/kokoro-venv && tmp/kokoro-venv/bin/pip install kokoro "misaki[zh]" soundfile');
}

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
  force,
  forceLocal,
  repoId: 'hexgrad/Kokoro-82M-v1.1-zh',
  cueOrder: VOICE_CUE_IDS,
  cues: requestedIds.map((id) => VOICE_CUES[id]),
}, null, 2)}\n`, 'utf8');

const worker = spawn(PYTHON, [resolve(ROOT, 'scripts/kokoro_tts_worker.py'), CONTRACT_PATH], {
  cwd: ROOT,
  stdio: 'inherit',
});
const exitCode = await new Promise((resolveExit, reject) => {
  worker.once('error', reject);
  worker.once('exit', (code, signal) => resolveExit(signal ? 1 : (code ?? 1)));
});
if (exitCode !== 0) throw new Error(`Kokoro worker failed with exit code ${exitCode}`);

const manifest = JSON.parse(await readFile(resolve(ROOT, 'public/assets/audio/voice/manifest.json'), 'utf8'));
console.info(`[voice-local] manifest now contains ${manifest.length}/${VOICE_CUE_IDS.length} assets`);
