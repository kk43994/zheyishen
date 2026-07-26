import './voice-review.css';
import { VOICE_CUE_IDS, VOICE_CUES, type VoiceCue, type VoiceCueId } from './voice-script';

type AssetState = 'checking' | 'ready' | 'missing';
type ReviewView = 'sounds' | 'voices';

interface SoundManifestEntry {
  file: string;
  seconds: number;
  origin?: string;
  source?: {
    title: string;
    creator: string;
    landing: string;
    license: string;
  };
}

interface SoundManifest {
  sfx: Record<string, SoundManifestEntry>;
  ambience: Record<string, SoundManifestEntry>;
}

interface VoiceManifestEntry {
  id: VoiceCueId;
  provider?: string;
  model?: string;
  voiceId?: string;
}

interface VoiceQaEntry {
  id: VoiceCueId;
  transcript: string;
  pronunciationErrorRate: number;
  status: 'pass' | 'review' | 'manual-review' | 'fail';
}

const stageLabels = ['童年', '少年', '青年', '成年', '中年', '暮年'] as const;
const treatmentLabels = {
  clear: '近声', phone: '电话', pa: '广播', 'behind-door': '门后', memory: '回忆', swallowed: '咽下', exhaled: '吐出',
} as const;
const emotionLabels = {
  calm: '克制', happy: '愉快', sad: '低落', fearful: '不安', surprised: '意外', angry: '愤怒', disgusted: '厌恶',
} as const;
const tagLabels = {
  'clear-throat': '清嗓', breath: '换气', inhale: '吸气', exhale: '呼气', pause: '定长停顿',
} as Record<string, string>;
const soundLabels: Record<string, { name: string; purpose: string }> = {
  page: { name: '纸页翻动', purpose: '开始、过场与界面确认' },
  breath: { name: '短促呼吸', purpose: '自动攻击，不使用枪响' },
  hit: { name: '闷钝命中', purpose: '普通敌人受击' },
  hurt: { name: '身体受伤', purpose: '主角承受伤害' },
  coin: { name: '零钱落袋', purpose: '拾取零钱与奖励' },
  wear: { name: '穿戴物证', purpose: '道具进入这一身' },
  swallow: { name: '咽下', purpose: '命运选择向内收回' },
  exhale: { name: '吐出', purpose: '命运选择向外说出' },
  boss: { name: '低频压迫', purpose: '首领登场与危险预告' },
  deny: { name: '拒绝反馈', purpose: '余额不足或操作无效' },
  'childhood-room': { name: '童年 · 雨夜房间', purpose: '雨、房间低频与远处滴落' },
  classroom: { name: '少年 · 教室', purpose: '日光灯、纸笔与安静人声空间' },
  station: { name: '青年 · 末班站台', purpose: '风道、轨道低鸣与提示音' },
  apartment: { name: '成年 · 租住房', purpose: '冰箱、钟表与没有坐齐的饭桌' },
  office: { name: '中年 · 办公室', purpose: '空调、日光灯与零星键盘声' },
  hospital: { name: '暮年 · 病房走廊', purpose: '设备低鸣与远处监护提示' },
};

const root = document.querySelector<HTMLElement>('#voice-review');
if (!root) throw new Error('missing voice review root');

const audio = new Audio();
audio.preload = 'metadata';
const states = new Map<VoiceCueId, AssetState>(VOICE_CUE_IDS.map((id) => [id, 'checking']));
let activeId: VoiceCueId | null = null;
let activeSoundId: string | null = null;
let activeView: ReviewView = new URLSearchParams(window.location.search).get('view') === 'voices' ? 'voices' : 'sounds';
let soundManifest: SoundManifest | null = null;
const voiceManifest = new Map<VoiceCueId, VoiceManifestEntry>();
const voiceQa = new Map<VoiceCueId, VoiceQaEntry>();

function cleanSpeech(text: string): string {
  return text
    .replace(/<#[\d.]+#>/g, ' ')
    .replace(/\([a-z-]+\)/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function stageLabel(cue: VoiceCue): string {
  return cue.stage === 'ending' ? '结局' : stageLabels[cue.stage];
}

function assetUrl(cue: VoiceCue): string {
  return new URL(cue.file, document.baseURI).href;
}

root.innerHTML = `
  <div class="voice-shell">
    <header class="voice-head">
      <div>
        <p class="voice-kicker">VOICE PRODUCTION REVIEW · FIXED ASSETS</p>
        <h1>《这一身》声音审听台</h1>
        <p class="voice-summary">逐条检查现实口径、声源位置、表演要求与触发标准。这里试听发布包里的固定源文件；电话、广播、门后和人生回声效果仍由游戏运行时处理。</p>
      </div>
      <div class="voice-counts" aria-label="语音资产统计">
        <span><strong data-count="all">45</strong><br>合同</span>
        <span><strong data-count="ready">0</strong><br>可试听</span>
        <span><strong data-count="missing">45</strong><br>待生成</span>
      </div>
    </header>
    <nav class="review-tabs" aria-label="审听类别">
      <button type="button" data-view="sounds">音效与环境 <span>16</span></button>
      <button type="button" data-view="voices">固定语音 <span>45</span></button>
    </nav>
    <section class="sound-panel" data-panel="sounds">
      <div class="sound-list" aria-live="polite"></div>
    </section>
    <section class="voice-toolbar" data-panel="voices" aria-label="语音筛选">
      <input type="search" aria-label="搜索台词、人物或场景" placeholder="搜索台词、人物或场景" />
      <select aria-label="按人生阶段筛选"><option value="">全部阶段</option>${[...stageLabels, '结局'].map((stage) => `<option>${stage}</option>`).join('')}</select>
      <select aria-label="按资产状态筛选"><option value="">全部资产</option><option value="ready">可试听</option><option value="missing">待生成</option></select>
      <label class="volume-control">音量 <input type="range" min="0" max="1" value="0.72" step="0.01" /></label>
    </section>
    <div class="now-playing" data-active="false"><span data-now-copy></span><button type="button" data-stop>停止</button></div>
    <section class="voice-list" data-panel="voices" aria-live="polite"></section>
  </div>
`;

const searchInput = root.querySelector<HTMLInputElement>('input[type="search"]')!;
const selects = root.querySelectorAll<HTMLSelectElement>('select');
const stageSelect = selects[0]!;
const statusSelect = selects[1]!;
const volumeInput = root.querySelector<HTMLInputElement>('input[type="range"]')!;
const list = root.querySelector<HTMLElement>('.voice-list')!;
const soundList = root.querySelector<HTMLElement>('.sound-list')!;
const nowPlaying = root.querySelector<HTMLElement>('.now-playing')!;
const nowCopy = root.querySelector<HTMLElement>('[data-now-copy]')!;

function updateCounts(): void {
  const ready = [...states.values()].filter((state) => state === 'ready').length;
  root!.querySelector<HTMLElement>('[data-count="all"]')!.textContent = String(VOICE_CUE_IDS.length);
  root!.querySelector<HTMLElement>('[data-count="ready"]')!.textContent = String(ready);
  root!.querySelector<HTMLElement>('[data-count="missing"]')!.textContent = String(VOICE_CUE_IDS.length - ready);
}

function stopAudio(): void {
  audio.pause();
  audio.loop = false;
  audio.removeAttribute('src');
  audio.load();
  activeId = null;
  activeSoundId = null;
  nowPlaying.dataset.active = 'false';
  renderList();
  renderSounds();
}

async function play(id: VoiceCueId): Promise<void> {
  const cue = VOICE_CUES[id];
  audio.pause();
  audio.loop = false;
  audio.src = assetUrl(cue);
  audio.volume = Number(volumeInput.value);
  activeId = id;
  activeSoundId = null;
  nowCopy.textContent = `${cue.context.scene} · ${cue.context.speaker}：“${cleanSpeech(cue.text)}”`;
  nowPlaying.dataset.active = 'true';
  renderList();
  try {
    await audio.play();
  } catch {
    states.set(id, 'missing');
    stopAudio();
    updateCounts();
  }
}

async function playSound(id: string, entry: SoundManifestEntry, loop: boolean): Promise<void> {
  audio.pause();
  audio.src = new URL(`assets/audio/${entry.file}`, document.baseURI).href;
  audio.volume = Number(volumeInput.value);
  audio.loop = loop;
  activeId = null;
  activeSoundId = id;
  const label = soundLabels[id] ?? { name: id, purpose: '' };
  nowCopy.textContent = `${label.name} · ${label.purpose}`;
  nowPlaying.dataset.active = 'true';
  renderSounds();
  try {
    await audio.play();
  } catch {
    stopAudio();
  }
}

function renderSounds(): void {
  soundList.replaceChildren();
  if (!soundManifest) {
    const loading = document.createElement('div');
    loading.className = 'empty-state';
    loading.textContent = '正在核对声音资产。';
    soundList.append(loading);
    return;
  }
  const groups: Array<{ title: string; entries: Array<[string, SoundManifestEntry]>; loop: boolean }> = [
    { title: '操作与战斗音效', entries: Object.entries(soundManifest.sfx), loop: false },
    { title: '六章环境循环', entries: Object.entries(soundManifest.ambience).map(([stage, entry]) => {
      const id = entry.file.split('/').pop()?.replace(/\.wav$/, '') ?? stage;
      return [id, entry] as [string, SoundManifestEntry];
    }), loop: true },
  ];
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'sound-group';
    const title = document.createElement('h2');
    title.textContent = group.title;
    const grid = document.createElement('div');
    grid.className = 'sound-grid';
    for (const [id, entry] of group.entries) {
      const label = soundLabels[id] ?? { name: id, purpose: entry.file };
      const card = document.createElement('article');
      card.className = 'sound-card';
      const copy = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = label.name;
      const purpose = document.createElement('span');
      purpose.textContent = label.purpose;
      const meta = document.createElement('small');
      meta.textContent = `${entry.seconds.toFixed(2)} 秒 · ${entry.file}`;
      copy.append(name, purpose, meta);
      if (entry.source) {
        const source = document.createElement('a');
        source.href = entry.source.landing;
        source.target = '_blank';
        source.rel = 'noreferrer';
        source.textContent = `${entry.source.creator} · ${entry.source.license}`;
        source.title = entry.source.title;
        copy.append(source);
      } else {
        const source = document.createElement('small');
        source.textContent = '项目自制设计音';
        copy.append(source);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'play-button';
      button.textContent = activeSoundId === id ? '正在播放' : '试听';
      button.addEventListener('click', () => { void playSound(id, entry, group.loop); });
      card.append(copy, button);
      grid.append(card);
    }
    section.append(title, grid);
    soundList.append(section);
  }
}

function setView(view: ReviewView): void {
  activeView = view;
  for (const panel of root!.querySelectorAll<HTMLElement>('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== view;
  }
  for (const button of root!.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    button.dataset.active = String(button.dataset.view === view);
  }
}

function renderList(): void {
  const query = searchInput.value.trim().toLowerCase();
  const stage = stageSelect.value;
  const status = statusSelect.value;
  const matching = VOICE_CUE_IDS.filter((id) => {
    const cue = VOICE_CUES[id];
    const haystack = [id, cue.text, cue.context.scene, cue.context.speaker, cue.trigger.condition, cue.purpose,
      cue.delivery.voice, cue.delivery.tone, cue.delivery.emotion, ...cue.delivery.tags].join(' ').toLowerCase();
    return (!query || haystack.includes(query))
      && (!stage || stageLabel(cue) === stage)
      && (!status || states.get(id) === status);
  });
  list.replaceChildren();
  if (!matching.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '没有符合当前筛选条件的语音。';
    list.append(empty);
    return;
  }
  for (const id of matching) {
    const cue = VOICE_CUES[id];
    const state = states.get(id) ?? 'checking';
    const card = document.createElement('article');
    card.className = 'voice-card';
    card.dataset.priority = String(cue.trigger.priority);
    card.dataset.status = state;
    const source = document.createElement('div');
    source.className = 'voice-source';
    const sourceStrong = document.createElement('strong');
    sourceStrong.textContent = `${stageLabel(cue)} · ${cue.context.scene}`;
    source.append(sourceStrong, document.createTextNode(`${cue.context.speaker} · ${id}`));
    const copy = document.createElement('div');
    const line = document.createElement('p');
    line.className = 'voice-line';
    line.textContent = `“${cleanSpeech(cue.text)}”`;
    const meta = document.createElement('p');
    meta.className = 'voice-meta';
    meta.textContent = `${cue.trigger.required ? '必然' : '隐藏'} P${cue.trigger.priority} · ${treatmentLabels[cue.treatment]} · ${cue.trigger.condition} · ${cue.performance}`;
    const delivery = document.createElement('div');
    delivery.className = 'voice-delivery';
    const deliveryLabels = [
      cue.delivery.voice,
      `语调 · ${cue.delivery.tone}`,
      `情绪 · ${emotionLabels[cue.delivery.emotion]}`,
      `语速 · ${cue.delivery.speed.toFixed(2)}x`,
      `音高 · ${cue.delivery.pitch > 0 ? '+' : ''}${cue.delivery.pitch}`,
      `强度 · ${cue.delivery.intensity === 'low' ? '轻' : '中'}`,
      ...cue.delivery.tags.map((tag) => `动作 · ${tagLabels[tag] ?? tag}`),
    ];
    for (const label of deliveryLabels) {
      const chip = document.createElement('span');
      chip.textContent = label;
      delivery.append(chip);
    }
    const qa = voiceQa.get(id);
    if (qa) {
      const qaChip = document.createElement('span');
      qaChip.className = qa.status === 'pass' ? 'qa-pass' : 'qa-review';
      qaChip.textContent = qa.status === 'pass'
        ? `质检 · 发音通过 ${Math.round(qa.pronunciationErrorRate * 100)}%`
        : `质检 · 人工复核 ${Math.round(qa.pronunciationErrorRate * 100)}%`;
      qaChip.title = `ASR 转写：${qa.transcript}`;
      delivery.append(qaChip);
    }
    const purpose = document.createElement('p');
    purpose.className = 'voice-purpose';
    purpose.textContent = cue.purpose;
    copy.append(line, delivery, meta, purpose);
    const actions = document.createElement('div');
    actions.className = 'voice-actions';
    const stateLabel = document.createElement('span');
    stateLabel.className = `voice-status ${state === 'ready' ? 'ready' : ''}`;
    stateLabel.textContent = state === 'checking' ? '核对中' : state === 'ready' ? '资产就绪' : '待生成';
    const manifest = voiceManifest.get(id);
    if (manifest?.provider) stateLabel.textContent += ` · ${manifest.provider}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'play-button';
    button.disabled = state !== 'ready';
    button.textContent = activeId === id ? '正在播放' : '试听';
    button.addEventListener('click', () => { void play(id); });
    actions.append(stateLabel, button);
    card.append(source, copy, actions);
    list.append(card);
  }
}

async function probe(id: VoiceCueId): Promise<void> {
  const response = await fetch(assetUrl(VOICE_CUES[id]), { headers: { Range: 'bytes=0-2' } }).catch(() => null);
  const type = response?.headers.get('content-type') ?? '';
  states.set(id, response?.ok && (type.includes('audio') || type.includes('mpeg')) ? 'ready' : 'missing');
}

searchInput.addEventListener('input', renderList);
stageSelect.addEventListener('change', renderList);
statusSelect.addEventListener('change', renderList);
volumeInput.addEventListener('input', () => { audio.volume = Number(volumeInput.value); });
root.querySelector<HTMLButtonElement>('[data-stop]')!.addEventListener('click', stopAudio);
for (const button of root.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  button.addEventListener('click', () => setView(button.dataset.view as ReviewView));
}
audio.addEventListener('ended', () => { if (!audio.loop) stopAudio(); });

renderList();
renderSounds();
setView(activeView);
void (async () => {
  const [manifestResponse, voiceManifestResponse, voiceQaResponse] = await Promise.all([
    fetch(new URL('assets/audio/sound-manifest.json', document.baseURI)),
    fetch(new URL('assets/audio/voice/manifest.json', document.baseURI)),
    fetch(new URL('assets/audio/voice/qa-report.json', document.baseURI)),
    Promise.all(VOICE_CUE_IDS.map(probe)),
  ]);
  if (manifestResponse.ok) soundManifest = await manifestResponse.json() as SoundManifest;
  if (voiceManifestResponse.ok) {
    const entries = await voiceManifestResponse.json() as VoiceManifestEntry[];
    for (const entry of entries) voiceManifest.set(entry.id, entry);
  }
  if (voiceQaResponse.ok) {
    const entries = await voiceQaResponse.json() as VoiceQaEntry[];
    for (const entry of entries) voiceQa.set(entry.id, entry);
  }
  updateCounts();
  renderList();
  renderSounds();
  document.documentElement.dataset.ready = 'true';
})();
