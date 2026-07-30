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
const onlyArg = process.argv.find((argument) => argument.startsWith('--only='));
const only = onlyArg
  ? new Set(onlyArg.slice('--only='.length).split(',').map((id) => id.trim()).filter(Boolean))
  : undefined;
const requested = (id) => !only || only.has(id);

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
  rainWindow: {
    title: 'Rain on window', creator: 'Nickisawsome74', freesoundId: 669621,
    url: 'https://cdn.freesound.org/previews/669/669621_7738466-hq.mp3',
    landing: 'https://freesound.org/people/Nickisawsome74/sounds/669621/',
    sha256: 'ab13fdc468bcc1cbd26f6fea712b6ed28881dc22935dec6ff1b19f62a4cd3e26',
  },
  classroomTalk: {
    title: 'classrom-talk_01.wav', creator: 'finalobserver',
    openverseId: 'b9034e93-a2e7-474c-8d24-15dd2a814529', freesoundId: 330732,
    url: 'https://cdn.freesound.org/previews/330/330732_4991814-hq.mp3',
    landing: 'https://freesound.org/people/finalobserver/sounds/330732/',
    sha256: '219f32428a642fb5595f5ee3d7845d46420047e7785d6d7062a46081daaa2509',
  },
  trainArrival: {
    title: 'Subway arriving', creator: 'sean_sd2007', freesoundId: 354128,
    url: 'https://cdn.freesound.org/previews/354/354128_3278999-hq.mp3',
    landing: 'https://freesound.org/people/sean_sd2007/sounds/354128/',
    sha256: 'fa39e88f6a78ac59df6d8c54eb00067baf39a5ef5966ac9e87dc99847aeca321',
  },
  phoneRing: {
    title: 'Phone Ringing Sound.wav', creator: 'fspera', freesoundId: 528111,
    url: 'https://cdn.freesound.org/previews/528/528111_11684955-hq.mp3',
    landing: 'https://freesound.org/people/fspera/sounds/528111/',
    sha256: 'c77e494addd87c493084ed6ce0f15efc3435ad39486eab6612abcead613a4626',
  },
  officeTyping: {
    title: 'Office Ambience', creator: 'BeaconStudio', freesoundId: 862604,
    url: 'https://cdn.freesound.org/previews/862/862604_18689440-hq.mp3',
    landing: 'https://freesound.org/people/BeaconStudio/sounds/862604/',
    sha256: '204669d890d5e072832c8bca80dadafacc1c12435992d7b29a3b4f424b9882a3',
  },
  monitor: {
    title: 'Hospital heart monitor beeps', creator: 'vestibule-door', freesoundId: 668978,
    url: 'https://cdn.freesound.org/previews/668/668978_14100561-hq.mp3',
    landing: 'https://freesound.org/people/vestibule-door/sounds/668978/',
    sha256: '8a9b03cac07bba8aa377064a0f528f5b71bc6b1281acaa28f7963ba7e63542ad',
  },
  shieldBlock: {
    title: 'magicShield_block.wav', creator: 'rafaelzimrp',
    openverseId: '3d87a8c3-3f3f-49d2-8b4c-729657396a5c', freesoundId: 570853,
    url: 'https://cdn.freesound.org/previews/570/570853_12068810-hq.mp3',
    landing: 'https://freesound.org/people/rafaelzimrp/sounds/570853',
    sha256: '9206903a53a564582a619a733b547057e262cd0d08cfc6d8dfa16d0063052a93',
  },
  healingChime: {
    title: 'Improvement/Healing Chime', creator: 'Raclure',
    openverseId: 'd9f771d2-1b35-4e57-917b-06d50b01f424', freesoundId: 483608,
    url: 'https://cdn.freesound.org/previews/483/483608_6436863-hq.mp3',
    landing: 'https://freesound.org/people/Raclure/sounds/483608',
    sha256: '3f9a202caf70aba302e22e4dcc4574dc7c7fe7cb26b94c0bf672a9bf8badf1a1',
  },
  dashWhoosh: {
    title: 'Whoosh / Dash (2)', creator: 'Kastenfrosch',
    openverseId: 'ac83eed8-568e-44b0-a3ae-d65f7be59441', freesoundId: 521996,
    url: 'https://cdn.freesound.org/previews/521/521996_311243-hq.mp3',
    landing: 'https://freesound.org/people/Kastenfrosch/sounds/521996',
    sha256: 'f1e25babf7531d7f9d8294034f24264a7d274322167ab75301fc4a488c55f618',
  },
  quickDoor: {
    title: 'Squeaky door opened quickly.wav', creator: 'CastIronCarousel',
    openverseId: '3d8244bd-055f-41b4-88f8-c8e9cc47899d', freesoundId: 216878,
    url: 'https://cdn.freesound.org/previews/216/216878_4049088-hq.mp3',
    landing: 'https://freesound.org/people/CastIronCarousel/sounds/216878',
    sha256: 'ee762d0f6101d474a09836fd4e2c1bcc5bb400caf81461f4c22708a0ba60663e',
  },
  oilLantern: {
    title: 'Oil Lantern Open and Close', creator: 'ImAFoley',
    openverseId: '5258461b-005e-4c4d-b746-533c4bc35b21', freesoundId: 516740,
    url: 'https://cdn.freesound.org/previews/516/516740_7117640-hq.mp3',
    landing: 'https://freesound.org/people/ImAFoley/sounds/516740',
    sha256: '75bebb27e6b8c1eb776770d26ac4e8b18f459897b6bba250c0e6d442286f7b5e',
  },
  bossWarning: {
    title: 'Beep warning', creator: 'SamsterBirdies', freesoundId: 467882,
    url: 'https://cdn.freesound.org/previews/467/467882_5487341-hq.mp3',
    landing: 'https://freesound.org/people/SamsterBirdies/sounds/467882',
    sha256: 'cb606e539a3ecfb06e652b497b554acffc3a1beadb5097ad7cad869eecc8bdd4',
  },
  bossRelease: {
    title: 'Whoosh', creator: 'thatkellytrna', freesoundId: 445229,
    url: 'https://cdn.freesound.org/previews/445/445229_7179420-hq.mp3',
    landing: 'https://freesound.org/people/thatkellytrna/sounds/445229',
    sha256: '9cf2d7787272f27fccaf06c9db2eb9b3051d04dfe55b210bb44edbcd94b172d6',
  },
  bossImpact: {
    title: 'thud.wav', creator: 'OtisJames', freesoundId: 215162,
    url: 'https://cdn.freesound.org/previews/215/215162_4027196-hq.mp3',
    landing: 'https://freesound.org/people/OtisJames/sounds/215162',
    sha256: '75bdc3c309fd2403a6f3091d79b9a8bb5ed49762a957e7f6704999be8020d31f',
  },
  foldedFate: {
    title: 'Creepy Ambient Loop (v2)', creator: 'epb9000', provider: 'OpenGameArt', format: 'ogg',
    url: 'https://opengameart.org/sites/default/files/creepyloop-v2_0.ogg',
    landing: 'https://opengameart.org/content/creepy-ambient-loop',
    sha256: '609bd62e824d77df3d35af26064bfd824cb6fce95cb9637c467fb80b717d6050',
  },
  borrowedRoom: {
    title: 'Dark Place (loop)', creator: 'SkyleTheFrench', provider: 'OpenGameArt', format: 'ogg',
    url: 'https://opengameart.org/sites/default/files/dark_place.ogg',
    landing: 'https://opengameart.org/content/dark-place-loop',
    sha256: 'c78a433139ace4a050b5d4a1b9b94bcf1f04d059345c849c7c234a2fe0eda102',
  },
  fatePaper: {
    title: 'Book_1(pages, paper, rustle).WAV', creator: 'o_ciz',
    openverseId: '487b5d03-6d40-46dd-9e0e-a1419219fb5f', freesoundId: 475431,
    url: 'https://cdn.freesound.org/previews/475/475431_7009965-hq.mp3',
    landing: 'https://freesound.org/people/o_ciz/sounds/475431',
    sha256: 'a055f734f6429b4c134b3530e268c9c3cfed8c0d31abf92db8832ad51aca1b73',
  },
  backWood: {
    title: 'wood creaks', creator: 'seth-m',
    openverseId: '2eb447ed-b9cc-4438-98dc-1ea6411ac6ae', freesoundId: 269722,
    url: 'https://cdn.freesound.org/previews/269/269722_3366749-hq.mp3',
    landing: 'https://freesound.org/people/seth-m/sounds/269722',
    sha256: '91dab86519aad2843bdfb48872db5ae310e7e162cb3bebf3077ae2464ffd5fb8',
  },
  corridorSteps: {
    title: 'STEPS IN CORRIDOR.wav', creator: 'colo777',
    openverseId: '4cc6cdf7-2219-42b1-a4e7-13b4cf550c50', freesoundId: 251435,
    url: 'https://cdn.freesound.org/previews/251/251435_4510103-hq.mp3',
    landing: 'https://freesound.org/people/colo777/sounds/251435',
    sha256: '4b54e0c8388fa28f50a9d6066aaf70bc3ba49d4673966f623846500d1da67c0e',
  },
  candleWick: {
    title: 'Candle wood wick flame mono 01.wav', creator: 'roisin.gleeson',
    openverseId: '87d33cb2-53ee-4e88-a646-670ec3d6a87f', freesoundId: 680476,
    url: 'https://cdn.freesound.org/previews/680/680476_12896641-hq.mp3',
    landing: 'https://freesound.org/people/roisin.gleeson/sounds/680476',
    sha256: '029125f44935a8bce56b0f6c5cd52742927a31b3ffd0cb38f366563b1613106c',
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
  phone: { source: 'phoneRing', trim: '0:3.75', loudness: -24 },
  train: { source: 'trainArrival', trim: '62:73', loudness: -27 },
  monitor: { source: 'monitor', trim: '0:3.323', loudness: -26 },
  shield: { source: 'shieldBlock', trim: '0:1.85', loudness: -21 },
  heal: { source: 'healingChime', trim: '0:0.632', loudness: -23 },
  dash: { source: 'dashWhoosh', trim: '0:0.26', loudness: -21 },
  door: { source: 'quickDoor', trim: '0:2.44', loudness: -24 },
  lamp: { source: 'oilLantern', trim: '3.65:4.54', loudness: -23 },
  'boss-warn': { source: 'bossWarning', trim: '0:1.716', loudness: -25 },
  'boss-release': { source: 'bossRelease', trim: '0:1.322', loudness: -23 },
  'boss-hit': { source: 'bossImpact', trim: '0:0.171', loudness: -19 },
};

const ambienceRecipes = {
  'childhood-room': { source: 'rainWindow', offset: 6, lowpass: 10500, loudness: -25 },
  classroom: { source: 'classroom', offset: 10, lowpass: 6400 },
  station: { source: 'station', offset: 5, lowpass: 7600 },
  apartment: { source: 'apartment', offset: 10, lowpass: 7200 },
  office: { source: 'officeTyping', offset: 12, lowpass: 8500, loudness: -22 },
  hospital: { source: 'hospital', offset: 4, lowpass: 8200 },
  'fate-chamber': {
    source: 'fatePaper', offset: 44, lowpass: 6200, loudness: -34, stage: '6',
  },
  'back-room': {
    source: 'corridorSteps', offset: 1, lowpass: 5200, loudness: -35, stage: '7',
    secondarySource: 'backWood', secondaryOffset: 0, secondaryGain: 0.42,
  },
  'light-room': {
    source: 'candleWick', offset: 20, lowpass: 9000, loudness: -32, stage: '8',
  },
};

const musicRecipes = {
  'folded-fate': { source: 'foldedFate', loudness: -20 },
  'borrowed-room': { source: 'borrowedRoom', loudness: -20 },
};

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fetchSource(id) {
  const source = sources[id];
  const path = resolve(CACHE_DIR, `${id}.${source.format ?? 'mp3'}`);
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
  const secondaryInput = recipe.secondarySource
    ? await fetchSource(recipe.secondarySource)
    : undefined;
  const output = resolve(OUTPUT_DIR, 'ambience', `${id}.wav`);
  const sceneInput = secondaryInput
    ? [
      `[0:a]atrim=start=${recipe.offset}:duration=9,asetpts=PTS-STARTPTS,highpass=f=55,lowpass=f=${recipe.lowpass},loudnorm=I=${recipe.loudness ?? -31}:TP=-8:LRA=7[p]`,
      `[1:a]atrim=start=${recipe.secondaryOffset ?? 0}:duration=9,asetpts=PTS-STARTPTS,highpass=f=85,lowpass=f=4300,loudnorm=I=-35:TP=-9:LRA=7,volume=${recipe.secondaryGain ?? 0.4},apad=whole_dur=9,atrim=duration=9[s]`,
      '[p][s]amix=inputs=2:duration=longest:normalize=0[scene]',
    ]
    : [
      `[0:a]atrim=start=${recipe.offset}:duration=9,asetpts=PTS-STARTPTS,highpass=f=55,lowpass=f=${recipe.lowpass},loudnorm=I=${recipe.loudness ?? -31}:TP=-8:LRA=7[scene]`,
    ];
  const filter = [
    ...sceneInput,
    '[scene]asplit=3[h0][m0][t0]',
    '[h0]atrim=start=0:end=1,asetpts=PTS-STARTPTS[h]',
    '[m0]atrim=start=1:end=8,asetpts=PTS-STARTPTS[m]',
    '[t0]atrim=start=8:end=9,asetpts=PTS-STARTPTS[t]',
    '[t][h]acrossfade=d=1:c1=tri:c2=tri[x]',
    '[m][x]concat=n=2:v=0:a=1[out]',
  ].join(';');
  const inputArgs = ['-i', input, ...(secondaryInput ? ['-i', secondaryInput] : [])];
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', ...inputArgs,
    '-filter_complex', filter, '-map', '[out]',
    '-ar', '22050', '-ac', '1', '-c:a', 'pcm_s16le', output,
  ]);
  return {
    output,
    sourceId: recipe.source,
    secondarySourceId: recipe.secondarySource,
  };
}

async function renderMusic(id, recipe) {
  const input = await fetchSource(recipe.source);
  const output = resolve(OUTPUT_DIR, 'music', `${id}.wav`);
  const sourceDuration = await wavDuration(input);
  const seam = 1.5;
  const tailStart = sourceDuration - seam;
  const filter = [
    `[0:a]highpass=f=35,lowpass=f=10500,loudnorm=I=${recipe.loudness}:TP=-5:LRA=8,asplit=3[h0][m0][t0]`,
    `[h0]atrim=start=0:end=${seam},asetpts=PTS-STARTPTS[h]`,
    `[m0]atrim=start=${seam}:end=${tailStart},asetpts=PTS-STARTPTS[m]`,
    `[t0]atrim=start=${tailStart}:end=${sourceDuration},asetpts=PTS-STARTPTS[t]`,
    `[t][h]acrossfade=d=${seam}:c1=tri:c2=tri[x]`,
    '[m][x]concat=n=2:v=0:a=1[out]',
  ].join(';');
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', input,
    '-filter_complex', filter, '-map', '[out]',
    '-ar', '22050', '-ac', '1', '-c:a', 'pcm_s16le', output,
  ]);
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
    ...(source.openverseId ? { openverseId: source.openverseId } : {}),
    ...(source.freesoundId ? { freesoundId: source.freesoundId } : {}),
    provider: source.provider ?? (source.openverseId ? 'Freesound via Openverse' : 'Freesound'),
    landing: source.landing,
    license: 'CC0-1.0',
    sourceSha256: source.sha256,
  };
}

await mkdir(CACHE_DIR, { recursive: true });
await mkdir(resolve(OUTPUT_DIR, 'sfx'), { recursive: true });
await mkdir(resolve(OUTPUT_DIR, 'ambience'), { recursive: true });
await mkdir(resolve(OUTPUT_DIR, 'music'), { recursive: true });
const previous = JSON.parse(await readFile(resolve(OUTPUT_DIR, 'sound-manifest.json'), 'utf8'));
for (const id of ['boss', 'deny']) {
  if (previous.sfx[id] && !previous.sfx[id].source) {
    previous.sfx[id].origin = 'project-authored-procedural';
  }
}

for (const [id, recipe] of Object.entries(sfxRecipes)) {
  if (!requested(id)) continue;
  const rendered = await renderSfx(id, recipe);
  const bytes = await readFile(rendered.output);
  previous.sfx[id] = {
    file: `sfx/${id}.wav`, seconds: await wavDuration(rendered.output), origin: 'curated-field-recording',
    sha256: hash(bytes), source: sourceRecord(rendered.sourceId),
  };
  console.info(`[sound] curated sfx ${id}`);
}

for (const [id, recipe] of Object.entries(ambienceRecipes)) {
  if (!requested(id)) continue;
  const rendered = await renderAmbience(id, recipe);
  const bytes = await readFile(rendered.output);
  const stage = recipe.stage
    ?? Object.entries(previous.ambience).find(([, entry]) => entry.file.endsWith(`/${id}.wav`))?.[0];
  if (stage === undefined) throw new Error(`ambience stage missing from manifest: ${id}`);
  previous.ambience[stage] = {
    file: `ambience/${id}.wav`, seconds: await wavDuration(rendered.output), origin: 'curated-field-recording',
    sha256: hash(bytes), source: sourceRecord(rendered.sourceId),
    ...(rendered.secondarySourceId
      ? { additionalSources: [sourceRecord(rendered.secondarySourceId)] }
      : {}),
  };
  console.info(`[sound] curated ambience ${id}`);
}

for (const [id, recipe] of Object.entries(musicRecipes)) {
  if (!requested(id)) continue;
  const rendered = await renderMusic(id, recipe);
  const bytes = await readFile(rendered.output);
  previous.music[id] = {
    file: `music/${id}.wav`,
    seconds: await wavDuration(rendered.output),
    origin: 'curated-cc0-music',
    role: 'narrative-bgm',
    sha256: hash(bytes),
    source: sourceRecord(rendered.sourceId),
  };
  console.info(`[sound] curated music ${id}`);
}

previous.license = 'Mixed project-authored procedural audio and curated CC0 audio; see each asset source.';
previous.generatedAt = new Date().toISOString();
await writeFile(resolve(OUTPUT_DIR, 'sound-manifest.json'), `${JSON.stringify(previous, null, 2)}\n`, 'utf8');
console.info('[sound] curated pack complete');
