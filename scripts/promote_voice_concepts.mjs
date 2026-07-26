import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadVoiceContract } from './load_voice_contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const CONCEPT_DIR = resolve(ROOT, 'public/assets/audio/voice-concepts');
const OUTPUT_DIR = resolve(ROOT, 'public/assets/audio/voice');
const MANIFEST_PATH = resolve(OUTPUT_DIR, 'manifest.json');
const promotions = {
  'narrator-custom-ordinary': 'narrator-opening',
  'father-custom-ordinary': 'father-adult-phone',
  'teacher-last-row': 'teacher-last-row',
  'boy-family-not-here': 'classmate-family-late',
};

const concepts = JSON.parse(await readFile(resolve(CONCEPT_DIR, 'manifest.json'), 'utf8'));
const { VOICE_CUES, VOICE_CUE_IDS } = await loadVoiceContract(ROOT);
const previous = JSON.parse(await readFile(MANIFEST_PATH, 'utf8').catch(() => '[]'));
const manifestById = new Map(previous.map((entry) => [entry.id, entry]));
await mkdir(OUTPUT_DIR, { recursive: true });

for (const [conceptId, cueId] of Object.entries(promotions)) {
  const concept = concepts.find((entry) => entry.id === conceptId);
  const cue = VOICE_CUES[cueId];
  if (!concept || !cue) throw new Error(`missing promotion source: ${conceptId} -> ${cueId}`);
  if (concept.text !== cue.text) throw new Error(`concept text differs from contract: ${conceptId} -> ${cueId}`);
  const source = resolve(CONCEPT_DIR, `${conceptId}.mp3`);
  const destination = resolve(ROOT, 'public', cue.file);
  await copyFile(source, destination);
  const info = await stat(destination);
  manifestById.set(cueId, {
    id: cueId,
    file: cue.file,
    role: cue.role,
    voiceId: concept.voiceId,
    model: concept.model,
    durationMs: concept.durationMs,
    bytes: info.size,
    sourceConcept: conceptId,
  });
  console.info(`[voice] promoted ${conceptId} -> ${cueId}`);
}

const manifest = VOICE_CUE_IDS.flatMap((id) => manifestById.has(id) ? [manifestById.get(id)] : []);
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
