import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..');
const CACHE_DIR = resolve(ROOT, 'tmp/audio-curation/raw');
const OUTPUT_DIR = resolve(ROOT, 'public/assets/audio');
const refresh = process.argv.includes('--refresh');

const sources = {
  page: {
    title: 'Page Turn', creator: 'davidbain', openverseId: 'ae81dc37-a10f-46f3-8619-9af22a898885',
    url: 'https://cdn.freesound.org/previews/136/136778_2207512-hq.mp3',
    landing: 'https://freesound.org/people/davidbain/sounds/136778',
    sha256: 'bc0ff6820f91f8f161f6be5532c21377b54ddc07d5a8eb1eb3db5ef0055eb417',
  },
  wear: {
    title: 'Put on Raincoat with zipper', creator: 'NachtmahrTV', openverseId: '0d007838-a9a7-43ef-9ef5-bf6c1c2228c4',
    url: 'https://cdn.freesound.org/previews/618/618114_5620304-hq.mp3',
    landing: 'https://freesound.org/people/NachtmahrTV/sounds/618114',
    sha256: 'be0ef029896c984fcac9da86e3523afd4f01b5cc79007ea2768b7173e8ee9f6b',
  },
  breath: {
    title: 'Deep Inhale & Exhale 1', creator: 'EverydayEldritch.com', openverseId: '1279607c-2721-44a4-bb60-aaf913251015',
    url: 'https://cdn.freesound.org/previews/615/615047_13501316-hq.mp3',
    landing: 'https://freesound.org/people/EverydayEldritch.com/sounds/615047',
    sha256: '687a8fac54be7f6dc1c5b3c234a2ca12403c69361503aedd9e234953774edbf3',
  },
  swallow: {
    title: 'Liquid Swallow, Gulp, Throat', creator: 'NicholasJudy567', openverseId: 'f5d76b63-14e3-4c46-a82d-09c91f0d4443',
    url: 'https://cdn.freesound.org/previews/673/673738_14595554-hq.mp3',
    landing: 'https://freesound.org/people/NicholasJudy567/sounds/673738',
    sha256: 'b01dcfaf4c60bebca59dcacc1d26b5ff5a51c47ab668ec50896ea0c2316a0ce3',
  },
  hit: {
    title: 'Blocking Arm With Hand', creator: 'mmasonghi', openverseId: 'd07f5bb7-a1fe-4d3a-89ad-ee86c548955b',
    url: 'https://cdn.freesound.org/previews/321/321810_5501856-hq.mp3',
    landing: 'https://freesound.org/people/mmasonghi/sounds/321810',
    sha256: 'c187bcd1d83998a6854e7a0d95103580c796e1474410ca55d83641de454389d4',
  },
  hurt: {
    title: 'body_hit', creator: 'insanity54', openverseId: '2651c4ac-55bc-480b-86a1-c31dd3004f92',
    url: 'https://cdn.freesound.org/previews/276/276600_464940-hq.mp3',
    landing: 'https://freesound.org/people/insanity54/sounds/276600',
    sha256: '81f5997c3dc672d5a5dd259044ba16f8012da0fc402b6903ef42dc27bcaa36fb',
  },
  coin: {
    title: 'Natural Metal Coin Sound 3', creator: 'The-Sacha-Rush', openverseId: '64620b18-f5cb-4e6d-bdc8-8972917d9d19',
    url: 'https://cdn.freesound.org/previews/400/400113_685248-hq.mp3',
    landing: 'https://freesound.org/people/The-Sacha-Rush/sounds/400113',
    sha256: 'a8e6a0277fdd929d5a432860627e044b4437067f38dbc88c556b902493f31bf8',
  },
  childhood: {
    title: 'INT Rainy ambience (rain heard from inside a room)', creator: 'Sayuri_Odin', openverseId: 'b746d546-707c-4662-a010-6bc4e001a615',
    url: 'https://cdn.freesound.org/previews/216/216134_3259827-hq.mp3',
    landing: 'https://freesound.org/people/Sayuri_Odin/sounds/216134',
    sha256: '3da42a205347c7b5a44e81830a471895836636cda505a37644ddc8161bdf8699',
  },
  classroom: {
    title: 'Classroom Ambience - High School Class', creator: 'okieactor', openverseId: 'b3572f02-df33-44ce-aca0-07bff0c6d8d2',
    url: 'https://cdn.freesound.org/previews/417/417041_7107077-hq.mp3',
    landing: 'https://freesound.org/people/okieactor/sounds/417041',
    sha256: 'e3c94b9678d37134111a7d08f8c843be8c3caa489e192a62a9ad3a5c2a94795b',
  },
  station: {
    title: 'Underground Train Station Ambience', creator: 'florianreichelt', openverseId: '325fa360-02a0-47f0-ad0d-157024c1c23a',
    url: 'https://cdn.freesound.org/previews/451/451720_6253486-hq.mp3',
    landing: 'https://freesound.org/people/florianreichelt/sounds/451720',
    sha256: 'c4325a997efdf4997e9e03b4049c30f74f676f0aa592a640f169831a67609909',
  },
  apartment: {
    title: 'Room Tone Apartment Small Bachelor', creator: 'leonelmail', openverseId: '63e63843-1c05-47b3-a270-6c21d6ff0135',
    url: 'https://cdn.freesound.org/previews/329/329568_4437257-hq.mp3',
    landing: 'https://freesound.org/people/leonelmail/sounds/329568',
    sha256: '7fed2f5ab6ea19de51f0de71e31e124dee7399364d8e5821b87c31fdb4a9b0fb',
  },
  office: {
    title: 'Office Room Tone', creator: 'holidayparade', openverseId: '214e7b59-acbb-4ee1-9d28-7bf3180f8950',
    url: 'https://cdn.freesound.org/previews/278/278154_3282716-hq.mp3',
    landing: 'https://freesound.org/people/holidayparade/sounds/278154',
    sha256: 'dac00a4a8148270bdde8dfcc5fd5f06303852d9b3faa6bbce517a27df4293af1',
  },
  hospital: {
    title: 'Fluorescent lamps in hospital 03', creator: 'Daphne_in_Wonderland', openverseId: '475227e0-dfa2-4477-aef9-ee94fab66c96',
    url: 'https://cdn.freesound.org/previews/383/383484_667113-hq.mp3',
    landing: 'https://freesound.org/people/Daphne_in_Wonderland/sounds/383484',
    sha256: 'ddfa6fec50da89662e4d283f03547e49c83427c9a0f303ed4eb1ccbd0256819a',
  },
};

const sfxRecipes = {
  page: { source: 'page', trim: '0.08:1.68', loudness: -22 },
  breath: { source: 'breath', trim: '1.52:2.22', loudness: -27, atempo: 1.35 },
  hit: { source: 'hit', trim: '0:0.31', loudness: -19 },
  hurt: { source: 'hurt', trim: '0.18:0.69', loudness: -20 },
  coin: { source: 'coin', trim: '0:0.53', loudness: -22 },
  wear: { source: 'wear', trim: '5.8:8.6', loudness: -23 },
  swallow: { source: 'swallow', trim: '0.09:0.42', loudness: -23 },
  exhale: { source: 'breath', trim: '1.34:2.80', loudness: -26 },
};

const ambienceRecipes = {
  'childhood-room': { source: 'childhood', offset: 0.8, lowpass: 9200 },
  classroom: { source: 'classroom', offset: 10, lowpass: 6400 },
  station: { source: 'station', offset: 5, lowpass: 7600 },
  apartment: { source: 'apartment', offset: 10, lowpass: 7200 },
  office: { source: 'office', offset: 8, lowpass: 6500 },
  hospital: { source: 'hospital', offset: 4, lowpass: 8200 },
};

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fetchSource(id) {
  const source = sources[id];
  const path = resolve(CACHE_DIR, `${id}.mp3`);
  let bytes = refresh ? null : await readFile(path).catch(() => null);
  if (!bytes) {
    const response = await fetch(source.url, { headers: { 'user-agent': 'zhe-yi-shen-audio-curation/1.0' } });
    if (!response.ok) throw new Error(`download failed ${response.status}: ${id}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  const actual = hash(bytes);
  if (actual !== source.sha256) throw new Error(`source checksum changed: ${id} (${actual})`);
  return path;
}

async function renderSfx(id, recipe) {
  const input = await fetchSource(recipe.source);
  const output = resolve(OUTPUT_DIR, 'sfx', `${id}.wav`);
  const [start, end] = recipe.trim.split(':').map(Number);
  const duration = (end - start) / (recipe.atempo ?? 1);
  const filters = [
    `atrim=start=${start}:end=${end}`, 'asetpts=PTS-STARTPTS',
    ...(recipe.atempo ? [`atempo=${recipe.atempo}`] : []),
    'highpass=f=75', 'lowpass=f=10500',
    `afade=t=in:st=0:d=${Math.min(0.012, duration / 8).toFixed(3)}`,
    `afade=t=out:st=${Math.max(0, duration - Math.min(0.08, duration / 4)).toFixed(3)}:d=${Math.min(0.08, duration / 4).toFixed(3)}`,
    `loudnorm=I=${recipe.loudness}:TP=-3:LRA=8`,
  ].join(',');
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-af', filters, '-ar', '22050', '-ac', '1', '-c:a', 'pcm_s16le', output]);
  return { output, sourceId: recipe.source };
}

async function renderAmbience(id, recipe) {
  const input = await fetchSource(recipe.source);
  const output = resolve(OUTPUT_DIR, 'ambience', `${id}.wav`);
  const filter = [
    `[0:a]atrim=start=${recipe.offset}:duration=9,asetpts=PTS-STARTPTS,highpass=f=55,lowpass=f=${recipe.lowpass},loudnorm=I=-31:TP=-8:LRA=7,asplit=3[h0][m0][t0]`,
    '[h0]atrim=start=0:end=1,asetpts=PTS-STARTPTS[h]',
    '[m0]atrim=start=1:end=8,asetpts=PTS-STARTPTS[m]',
    '[t0]atrim=start=8:end=9,asetpts=PTS-STARTPTS[t]',
    '[t][h]acrossfade=d=1:c1=tri:c2=tri[x]',
    '[m][x]concat=n=2:v=0:a=1[out]',
  ].join(';');
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-filter_complex', filter, '-map', '[out]', '-ar', '22050', '-ac', '1', '-c:a', 'pcm_s16le', output]);
  return { output, sourceId: recipe.source };
}

async function wavDuration(path) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path]);
  return Number(Number.parseFloat(stdout).toFixed(3));
}

function sourceRecord(sourceId) {
  const source = sources[sourceId];
  return {
    title: source.title,
    creator: source.creator,
    provider: 'Freesound via Openverse',
    openverseId: source.openverseId,
    landing: source.landing,
    license: 'CC0-1.0',
    sourceSha256: source.sha256,
  };
}

await mkdir(CACHE_DIR, { recursive: true });
await mkdir(resolve(OUTPUT_DIR, 'sfx'), { recursive: true });
await mkdir(resolve(OUTPUT_DIR, 'ambience'), { recursive: true });
const previous = JSON.parse(await readFile(resolve(OUTPUT_DIR, 'sound-manifest.json'), 'utf8'));
for (const id of ['boss', 'deny']) {
  if (previous.sfx[id] && !previous.sfx[id].source) {
    previous.sfx[id].origin = 'project-authored-procedural';
  }
}

for (const [id, recipe] of Object.entries(sfxRecipes)) {
  const rendered = await renderSfx(id, recipe);
  const bytes = await readFile(rendered.output);
  previous.sfx[id] = {
    file: `sfx/${id}.wav`, seconds: await wavDuration(rendered.output), origin: 'curated-field-recording',
    sha256: hash(bytes), source: sourceRecord(rendered.sourceId),
  };
  console.info(`[sound] curated sfx ${id}`);
}

for (const [id, recipe] of Object.entries(ambienceRecipes)) {
  const rendered = await renderAmbience(id, recipe);
  const bytes = await readFile(rendered.output);
  const stage = Object.entries(previous.ambience).find(([, entry]) => entry.file.endsWith(`/${id}.wav`))?.[0];
  if (stage === undefined) throw new Error(`ambience stage missing from manifest: ${id}`);
  previous.ambience[stage] = {
    file: `ambience/${id}.wav`, seconds: await wavDuration(rendered.output), origin: 'curated-field-recording',
    sha256: hash(bytes), source: sourceRecord(rendered.sourceId),
  };
  console.info(`[sound] curated ambience ${id}`);
}

previous.license = 'Mixed project-authored procedural audio and curated CC0 field recordings; see each asset source.';
previous.generatedAt = new Date().toISOString();
await writeFile(resolve(OUTPUT_DIR, 'sound-manifest.json'), `${JSON.stringify(previous, null, 2)}\n`, 'utf8');
console.info('[sound] curated pack complete');
