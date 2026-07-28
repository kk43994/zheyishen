import './voice-review.css';
import { VOICE_CUE_IDS, VOICE_CUES, type VoiceCue, type VoiceCueId } from './voice-script';

type AssetState = 'checking' | 'ready' | 'missing';
type ReviewView = 'sounds' | 'voices';
type ReviewDecision = 'pending' | 'approved' | 'revise' | 'hold';

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
  durationMs?: number;
  bytes?: number;
  assetRevision?: number;
  reviewFile?: string;
  reviewDurationMs?: number;
  layers?: Array<{
    file: string;
    voiceId?: string;
    purpose: string;
  }>;
  postprocess?: string;
}

interface VoiceQaEntry {
  id: VoiceCueId;
  expected?: string;
  transcript: string;
  pronunciationErrorRate: number;
  durationSeconds?: number;
  charactersPerSecond?: number;
  status: 'pass' | 'review' | 'manual-review' | 'fail';
}

interface ReviewRecord {
  decision: ReviewDecision;
  note: string;
  updatedAt: string;
  reviewedRevision?: number;
  previousDecision?: Exclude<ReviewDecision, 'pending'>;
}

const REVIEW_STORAGE_KEY = 'zhe-yi-shen:voice-review:v2';
const REVIEW_AUTOPLAY_KEY = 'zhe-yi-shen:voice-review:auto-next';
const REVIEW_VOLUME_KEY = 'zhe-yi-shen:voice-review:volume';
const stageLabels = ['童年', '少年', '青年', '成年', '中年', '暮年'] as const;
const treatmentLabels = {
  clear: '近声',
  phone: '电话',
  pa: '广播',
  'behind-door': '门后',
  memory: '回忆',
  swallowed: '咽下',
  exhaled: '吐出',
} as const;
const emotionLabels = {
  calm: '克制',
  happy: '愉快',
  sad: '低落',
  fearful: '不安',
  surprised: '意外',
  angry: '愤怒',
  disgusted: '厌恶',
} as const;
const tagLabels = {
  'clear-throat': '清嗓',
  breath: '换气',
  inhale: '吸气',
  exhale: '呼气',
  pause: '定长停顿',
} as Record<string, string>;
const decisionLabels: Record<ReviewDecision, string> = {
  pending: '未审核',
  approved: '通过',
  revise: '需重做',
  hold: '待定',
};
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
const voiceManifest = new Map<VoiceCueId, VoiceManifestEntry>();
const voiceQa = new Map<VoiceCueId, VoiceQaEntry>();
const reviews = loadReviews();
let activeId: VoiceCueId | null = null;
let activeSoundId: string | null = null;
let selectedId: VoiceCueId = VOICE_CUE_IDS[0]!;
let activeView: ReviewView = new URLSearchParams(window.location.search).get('view') === 'sounds' ? 'sounds' : 'voices';
let soundManifest: SoundManifest | null = null;

function readStoredNumber(key: string, fallback: number): number {
  try {
    const value = Number.parseFloat(localStorage.getItem(key) ?? '');
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function loadReviews(): Map<VoiceCueId, ReviewRecord> {
  try {
    const parsed = JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) ?? '{}') as Record<string, ReviewRecord>;
    return new Map(VOICE_CUE_IDS.flatMap((id) => {
      const record = parsed[id];
      return record && ['pending', 'approved', 'revise', 'hold'].includes(record.decision)
        ? [[id, record] as const]
        : [];
    }));
  } catch {
    return new Map();
  }
}

function reviewFor(id: VoiceCueId): ReviewRecord {
  return reviews.get(id) ?? { decision: 'pending', note: '', updatedAt: '' };
}

function assetRevisionFor(id: VoiceCueId): number {
  return voiceManifest.get(id)?.assetRevision ?? 0;
}

function syncReviewRevisions(): void {
  let changed = false;
  for (const id of VOICE_CUE_IDS) {
    const record = reviews.get(id);
    if (!record || record.decision === 'pending') continue;
    const assetRevision = assetRevisionFor(id);
    const reviewedRevision = record.reviewedRevision ?? 0;
    if (assetRevision <= reviewedRevision) continue;
    reviews.set(id, {
      ...record,
      decision: 'pending',
      previousDecision: record.decision,
      updatedAt: new Date().toISOString(),
    });
    changed = true;
  }
  if (changed) persistReviews();
}

function persistReviews(): void {
  try {
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(Object.fromEntries(reviews)));
  } catch {
    // The page remains usable when storage is unavailable.
  }
}

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
  return new URL(voiceManifest.get(cue.id)?.reviewFile ?? cue.file, document.baseURI).href;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

root.innerHTML = `
  <div class="voice-shell">
    <header class="voice-head">
      <div>
        <p class="voice-kicker">VOICE PRODUCTION REVIEW · 逐条审听</p>
        <h1>《这一身》配音审核台</h1>
        <p class="voice-summary">从第 1 条开始依次试听，判断音色、语气、停顿、发音和场景是否成立。审核结果与备注自动保存在这台电脑上。</p>
      </div>
      <div class="voice-counts" aria-label="配音审核统计">
        <span><strong data-count="all">${VOICE_CUE_IDS.length}</strong><br>总条目</span>
        <span><strong data-count="reviewed">0</strong><br>已审核</span>
        <span><strong data-count="approved">0</strong><br>已通过</span>
        <span><strong data-count="revise">0</strong><br>需处理</span>
      </div>
    </header>

    <nav class="review-tabs" aria-label="审听类别">
      <button type="button" data-view="voices">固定语音 <span>${VOICE_CUE_IDS.length}</span></button>
      <button type="button" data-view="sounds">音效与环境 <span data-sound-count>16</span></button>
    </nav>

    <section data-panel="voices">
      <div class="voice-toolbar" aria-label="语音筛选">
        <input type="search" data-filter="search" aria-label="搜索台词、人物或场景" placeholder="搜索台词、人物或场景" />
        <select data-filter="stage" aria-label="按人生阶段筛选">
          <option value="">全部阶段</option>
          ${[...stageLabels, '结局'].map((stage) => `<option>${stage}</option>`).join('')}
        </select>
        <select data-filter="asset" aria-label="按资产状态筛选">
          <option value="">全部资产</option>
          <option value="ready">可试听</option>
          <option value="missing">待生成</option>
        </select>
        <select data-filter="review" aria-label="按审核结论筛选">
          <option value="">全部结论</option>
          <option value="pending">只看未审核</option>
          <option value="approved">已通过</option>
          <option value="revise">需重做</option>
          <option value="hold">待定</option>
        </select>
        <label class="volume-control">音量
          <input data-volume type="range" min="0" max="1" value="${readStoredNumber(REVIEW_VOLUME_KEY, 0.82)}" step="0.01" />
        </label>
      </div>

      <section class="review-overview" aria-label="审核进度">
        <div>
          <strong data-progress-copy>0 / ${VOICE_CUE_IDS.length} 已审核</strong>
          <span>快捷键：空格播放 · A 通过 · R 重做 · H 待定 · ← → 切换</span>
        </div>
        <div class="review-progress-track"><span data-review-progress></span></div>
        <div class="review-overview-actions">
          <label><input type="checkbox" data-auto-next /> 标记后自动播放下一条</label>
          <button type="button" data-unreviewed>从未审核继续</button>
          <button type="button" data-export>导出审核记录</button>
        </div>
      </section>

      <section class="review-stage" data-review-stage aria-live="polite"></section>

      <div class="queue-head">
        <div>
          <p class="voice-kicker">REVIEW QUEUE</p>
          <h2>审核队列</h2>
        </div>
        <span data-filter-count>${VOICE_CUE_IDS.length} 条</span>
      </div>
      <section class="voice-list" aria-live="polite"></section>
    </section>

    <section class="sound-panel" data-panel="sounds">
      <div class="sound-list" aria-live="polite"></div>
    </section>
  </div>
`;

const searchInput = root.querySelector<HTMLInputElement>('[data-filter="search"]')!;
const stageSelect = root.querySelector<HTMLSelectElement>('[data-filter="stage"]')!;
const assetSelect = root.querySelector<HTMLSelectElement>('[data-filter="asset"]')!;
const reviewSelect = root.querySelector<HTMLSelectElement>('[data-filter="review"]')!;
const volumeInput = root.querySelector<HTMLInputElement>('[data-volume]')!;
const autoNextInput = root.querySelector<HTMLInputElement>('[data-auto-next]')!;
const list = root.querySelector<HTMLElement>('.voice-list')!;
const soundList = root.querySelector<HTMLElement>('.sound-list')!;
const reviewStage = root.querySelector<HTMLElement>('[data-review-stage]')!;
autoNextInput.checked = (() => {
  try {
    return localStorage.getItem(REVIEW_AUTOPLAY_KEY) !== 'false';
  } catch {
    return true;
  }
})();

function matchingVoiceIds(): VoiceCueId[] {
  const query = searchInput.value.trim().toLowerCase();
  const stage = stageSelect.value;
  const asset = assetSelect.value;
  const review = reviewSelect.value as ReviewDecision | '';
  return VOICE_CUE_IDS.filter((id) => {
    const cue = VOICE_CUES[id];
    const record = reviewFor(id);
    const qa = voiceQa.get(id);
    const haystack = [
      id,
      cue.text,
      cue.context.scene,
      cue.context.speaker,
      cue.trigger.condition,
      cue.purpose,
      cue.delivery.voice,
      cue.delivery.tone,
      cue.delivery.emotion,
      qa?.transcript ?? '',
      record.note,
      ...cue.delivery.tags,
    ].join(' ').toLowerCase();
    return (!query || haystack.includes(query))
      && (!stage || stageLabel(cue) === stage)
      && (!asset || states.get(id) === asset)
      && (!review || record.decision === review);
  });
}

function updateCounts(): void {
  const records = VOICE_CUE_IDS.map(reviewFor);
  const reviewed = records.filter((record) => record.decision !== 'pending').length;
  const approved = records.filter((record) => record.decision === 'approved').length;
  const revise = records.filter((record) => record.decision === 'revise').length;
  const hold = records.filter((record) => record.decision === 'hold').length;
  root!.querySelector<HTMLElement>('[data-count="reviewed"]')!.textContent = String(reviewed);
  root!.querySelector<HTMLElement>('[data-count="approved"]')!.textContent = String(approved);
  root!.querySelector<HTMLElement>('[data-count="revise"]')!.textContent = String(revise + hold);
  root!.querySelector<HTMLElement>('[data-progress-copy]')!.textContent =
    `${reviewed} / ${VOICE_CUE_IDS.length} 已审核 · ${revise} 条需重做 · ${hold} 条待定`;
  root!.querySelector<HTMLElement>('[data-review-progress]')!.style.width =
    `${(reviewed / VOICE_CUE_IDS.length) * 100}%`;
}

function setView(view: ReviewView): void {
  activeView = view;
  for (const panel of root!.querySelectorAll<HTMLElement>('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== view;
  }
  for (const button of root!.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    button.dataset.active = String(button.dataset.view === view);
  }
  if (view === 'sounds') {
    audio.pause();
    renderTransport();
  }
}

function selectVoice(id: VoiceCueId, options: { autoplay?: boolean; scroll?: boolean } = {}): void {
  selectedId = id;
  setView('voices');
  renderReviewStage();
  renderList();
  if (options.scroll) reviewStage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (options.autoplay && states.get(id) === 'ready') void playVoice(id);
}

function goRelative(offset: number, autoplay = false): void {
  const matching = matchingVoiceIds();
  if (!matching.length) return;
  const current = matching.indexOf(selectedId);
  const nextIndex = current < 0
    ? 0
    : Math.max(0, Math.min(matching.length - 1, current + offset));
  selectVoice(matching[nextIndex]!, { autoplay, scroll: true });
}

function stopAudio(clearSelection = false): void {
  audio.pause();
  audio.loop = false;
  audio.currentTime = 0;
  if (clearSelection) {
    audio.removeAttribute('src');
    audio.load();
    activeId = null;
    activeSoundId = null;
  }
  renderTransport();
  renderList();
  renderSounds();
}

async function playVoice(id: VoiceCueId): Promise<void> {
  const cue = VOICE_CUES[id];
  if (activeId !== id || activeSoundId !== null) {
    audio.pause();
    audio.loop = false;
    audio.src = assetUrl(cue);
    audio.currentTime = 0;
  }
  audio.volume = Number(volumeInput.value);
  activeId = id;
  activeSoundId = null;
  selectedId = id;
  renderReviewStage();
  renderList();
  try {
    await audio.play();
    renderTransport();
  } catch {
    states.set(id, 'missing');
    activeId = null;
    renderReviewStage();
    renderList();
    updateCounts();
  }
}

async function toggleSelectedVoice(): Promise<void> {
  if (states.get(selectedId) !== 'ready') return;
  if (activeId === selectedId && !audio.paused) {
    audio.pause();
    renderTransport();
    renderList();
    return;
  }
  await playVoice(selectedId);
}

async function playSound(id: string, entry: SoundManifestEntry, loop: boolean): Promise<void> {
  audio.pause();
  audio.src = new URL(`assets/audio/${entry.file}`, document.baseURI).href;
  audio.currentTime = 0;
  audio.volume = Number(volumeInput.value);
  audio.loop = loop;
  activeId = null;
  activeSoundId = id;
  renderSounds();
  try {
    await audio.play();
    renderSounds();
  } catch {
    stopAudio(true);
  }
}

function markReview(id: VoiceCueId, decision: ReviewDecision): void {
  const current = reviewFor(id);
  reviews.set(id, {
    ...current,
    decision,
    updatedAt: new Date().toISOString(),
    reviewedRevision: assetRevisionFor(id),
    previousDecision: undefined,
  });
  persistReviews();
  updateCounts();
  renderReviewStage();
  renderList();
  if (decision !== 'pending' && autoNextInput.checked) {
    const allIds = matchingVoiceIds();
    const currentIndex = allIds.indexOf(id);
    const next = allIds.slice(currentIndex + 1).find((candidate) => reviewFor(candidate).decision === 'pending')
      ?? VOICE_CUE_IDS.slice(VOICE_CUE_IDS.indexOf(id) + 1).find((candidate) => reviewFor(candidate).decision === 'pending');
    if (next) selectVoice(next, { autoplay: true, scroll: true });
  }
}

function saveNote(id: VoiceCueId, note: string): void {
  const current = reviewFor(id);
  reviews.set(id, {
    ...current,
    note,
    updatedAt: new Date().toISOString(),
  });
  persistReviews();
}

function renderTransport(): void {
  const playButton = reviewStage.querySelector<HTMLButtonElement>('[data-toggle-play]');
  const seek = reviewStage.querySelector<HTMLInputElement>('[data-seek]');
  const time = reviewStage.querySelector<HTMLElement>('[data-time]');
  if (!playButton || !seek || !time) return;
  const isCurrent = activeId === selectedId;
  playButton.textContent = isCurrent && !audio.paused ? '暂停' : isCurrent && audio.currentTime > 0 ? '继续播放' : '播放这一条';
  const duration = Number.isFinite(audio.duration) && isCurrent
    ? audio.duration
    : (voiceManifest.get(selectedId)?.reviewDurationMs ?? voiceManifest.get(selectedId)?.durationMs ?? 0) / 1000;
  const current = isCurrent ? audio.currentTime : 0;
  seek.max = String(Math.max(0.01, duration));
  seek.value = String(Math.min(current, duration));
  seek.disabled = states.get(selectedId) !== 'ready';
  time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

function renderReviewStage(): void {
  const cue = VOICE_CUES[selectedId];
  const record = reviewFor(selectedId);
  const qa = voiceQa.get(selectedId);
  const manifest = voiceManifest.get(selectedId);
  const assetState = states.get(selectedId) ?? 'checking';
  const matching = matchingVoiceIds();
  const position = matching.indexOf(selectedId);
  const globalPosition = VOICE_CUE_IDS.indexOf(selectedId);
  const deliveryLabels = [
    cue.delivery.voice,
    `语调 · ${cue.delivery.tone}`,
    `情绪 · ${emotionLabels[cue.delivery.emotion]}`,
    `语速 · ${cue.delivery.speed.toFixed(2)}x`,
    `音高 · ${cue.delivery.pitch > 0 ? '+' : ''}${cue.delivery.pitch}`,
    `强度 · ${cue.delivery.intensity === 'low' ? '轻' : '中'}`,
    ...cue.delivery.tags.map((tag) => `动作 · ${tagLabels[tag] ?? tag}`),
  ];
  const qaStatus = qa?.status === 'pass' ? 'qa-pass' : 'qa-review';
  const qaLabel = qa?.status === 'pass' ? '机器质检通过' : qa ? '机器提示人工复核' : '质检载入中';
  const previousDecision = record.previousDecision ? decisionLabels[record.previousDecision] : '';
  reviewStage.dataset.decision = record.decision;
  reviewStage.innerHTML = `
    <div class="review-stage-topline">
      <button type="button" data-previous ${position <= 0 ? 'disabled' : ''}>← 上一条</button>
      <span>筛选队列 ${position >= 0 ? position + 1 : '—'} / ${matching.length} · 全部 ${globalPosition + 1} / ${VOICE_CUE_IDS.length}</span>
      <button type="button" data-next ${position < 0 || position >= matching.length - 1 ? 'disabled' : ''}>下一条 →</button>
    </div>
    <div class="review-stage-source">
      <div>
        <span class="stage-stamp">${stageLabel(cue)}</span>
        <p>${cue.context.scene} · ${cue.context.speaker}</p>
        <small>${selectedId}</small>
      </div>
      <span class="review-decision ${record.decision}">${decisionLabels[record.decision]}</span>
    </div>
    ${record.previousDecision ? `
      <div class="revision-notice">
        <strong>第二版已更新</strong>
        <span>原结论：${previousDecision}。原备注已保留，请重新试听后确认。</span>
      </div>
    ` : ''}
    <blockquote>“${cleanSpeech(cue.text)}”</blockquote>
    <div class="audio-transport">
      <button type="button" class="transport-main" data-toggle-play ${assetState !== 'ready' ? 'disabled' : ''}>播放这一条</button>
      <button type="button" data-replay ${assetState !== 'ready' ? 'disabled' : ''}>从头重播</button>
      <input type="range" data-seek min="0" max="1" step="0.01" value="0" aria-label="播放进度" />
      <span data-time>0:00 / ${formatTime((manifest?.reviewDurationMs ?? manifest?.durationMs ?? 0) / 1000)}</span>
      <span class="asset-pill ${assetState}">${assetState === 'ready' ? `音频就绪${manifest?.assetRevision ? ` · 第 ${manifest.assetRevision + 1} 版` : ''}` : assetState === 'missing' ? '音频缺失' : '正在核对'}</span>
    </div>
    <div class="review-detail-grid">
      <section>
        <h3>表演合同</h3>
        <div class="voice-delivery">${deliveryLabels.map((label) => `<span>${label}</span>`).join('')}</div>
        <p>${cue.performance}</p>
      </section>
      <section>
        <h3>剧情与触发</h3>
        <p>${cue.trigger.required ? '必然语音' : '隐藏语音'} · P${cue.trigger.priority} · ${treatmentLabels[cue.treatment]}</p>
        <p>${cue.trigger.condition}</p>
        <p class="review-purpose">${cue.purpose}</p>
      </section>
      <section class="qa-panel ${qaStatus}">
        <h3>${qaLabel}</h3>
        <p>${qa ? `ASR：${qa.transcript}` : '正在读取反向转写结果。'}</p>
        <small>${qa
          ? `发音差异 ${Math.round(qa.pronunciationErrorRate * 100)}%${qa.charactersPerSecond ? ` · ${qa.charactersPerSecond.toFixed(2)} 字/秒` : ''}`
          : ''}</small>
      </section>
      <section>
        <h3>成品信息</h3>
        <p>${manifest?.provider ?? '—'} · ${manifest?.model ?? '—'}</p>
        <p>${manifest?.voiceId ?? '音色信息载入中'}</p>
        <small>${manifest?.reviewDurationMs || manifest?.durationMs
          ? `${((manifest.reviewDurationMs ?? manifest.durationMs ?? 0) / 1000).toFixed(2)} 秒${manifest.reviewFile ? ' · 已合成审听版' : ''}`
          : '—'}</small>
        ${manifest?.postprocess ? `<small>${manifest.postprocess}</small>` : ''}
      </section>
    </div>
    <div class="review-form">
      <div class="decision-buttons" role="group" aria-label="审核结论">
        <button type="button" data-decision="approved" class="${record.decision === 'approved' ? 'selected' : ''}">通过 <kbd>A</kbd></button>
        <button type="button" data-decision="revise" class="${record.decision === 'revise' ? 'selected' : ''}">需重做 <kbd>R</kbd></button>
        <button type="button" data-decision="hold" class="${record.decision === 'hold' ? 'selected' : ''}">待定 <kbd>H</kbd></button>
        ${record.decision !== 'pending' ? '<button type="button" data-decision="pending">撤回结论</button>' : ''}
      </div>
      <label>
        审核备注
        <textarea data-review-note rows="3" placeholder="例如：父亲声线对，但“你忙吧”句尾还要再收一点。"></textarea>
      </label>
    </div>
  `;
  const note = reviewStage.querySelector<HTMLTextAreaElement>('[data-review-note]')!;
  note.value = record.note;
  note.addEventListener('input', () => saveNote(selectedId, note.value));
  reviewStage.querySelector<HTMLButtonElement>('[data-previous]')!.addEventListener('click', () => goRelative(-1));
  reviewStage.querySelector<HTMLButtonElement>('[data-next]')!.addEventListener('click', () => goRelative(1));
  reviewStage.querySelector<HTMLButtonElement>('[data-toggle-play]')!.addEventListener('click', () => { void toggleSelectedVoice(); });
  reviewStage.querySelector<HTMLButtonElement>('[data-replay]')!.addEventListener('click', () => {
    if (activeId === selectedId) audio.currentTime = 0;
    void playVoice(selectedId);
  });
  reviewStage.querySelector<HTMLInputElement>('[data-seek]')!.addEventListener('input', (event) => {
    if (activeId !== selectedId) return;
    audio.currentTime = Number((event.target as HTMLInputElement).value);
    renderTransport();
  });
  for (const button of reviewStage.querySelectorAll<HTMLButtonElement>('[data-decision]')) {
    button.addEventListener('click', () => markReview(selectedId, button.dataset.decision as ReviewDecision));
  }
  renderTransport();
}

function renderList(): void {
  const matching = matchingVoiceIds();
  root!.querySelector<HTMLElement>('[data-filter-count]')!.textContent = `${matching.length} 条`;
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
    const record = reviewFor(id);
    const qa = voiceQa.get(id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'voice-card';
    card.dataset.selected = String(id === selectedId);
    card.dataset.decision = record.decision;
    card.dataset.status = states.get(id) ?? 'checking';
    const number = document.createElement('span');
    number.className = 'queue-number';
    number.textContent = String(VOICE_CUE_IDS.indexOf(id) + 1).padStart(2, '0');
    const copy = document.createElement('span');
    copy.className = 'queue-copy';
    const source = document.createElement('strong');
    source.textContent = `${stageLabel(cue)} · ${cue.context.scene} · ${cue.context.speaker}`;
    const line = document.createElement('span');
    line.textContent = `“${cleanSpeech(cue.text)}”`;
    const meta = document.createElement('small');
    meta.textContent = [
      qa && qa.status !== 'pass' ? 'ASR 待复核' : '',
      record.note ? `备注：${record.note}` : cue.delivery.tone,
    ].filter(Boolean).join(' · ');
    copy.append(source, line, meta);
    const status = document.createElement('span');
    status.className = `review-decision ${record.decision}`;
    status.textContent = decisionLabels[record.decision];
    const playing = document.createElement('span');
    playing.className = 'queue-playing';
    playing.textContent = activeId === id && !audio.paused ? '正在播放' : states.get(id) === 'ready' ? '可试听' : '缺音频';
    card.append(number, copy, playing, status);
    card.addEventListener('click', () => selectVoice(id, { scroll: true }));
    list.append(card);
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
    {
      title: '六章环境循环',
      entries: Object.entries(soundManifest.ambience).map(([stage, entry]) => {
        const id = entry.file.split('/').pop()?.replace(/\.(wav|mp3)$/, '') ?? stage;
        return [id, entry] as [string, SoundManifestEntry];
      }),
      loop: true,
    },
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
      button.textContent = activeSoundId === id && !audio.paused ? '停止' : '试听';
      button.addEventListener('click', () => {
        if (activeSoundId === id && !audio.paused) stopAudio();
        else void playSound(id, entry, group.loop);
      });
      card.append(copy, button);
      grid.append(card);
    }
    section.append(title, grid);
    soundList.append(section);
  }
}

function applyFilters(): void {
  const matching = matchingVoiceIds();
  if (matching.length && !matching.includes(selectedId)) selectedId = matching[0]!;
  renderReviewStage();
  renderList();
}

function continueUnreviewed(): void {
  searchInput.value = '';
  stageSelect.value = '';
  assetSelect.value = '';
  reviewSelect.value = 'pending';
  const next = VOICE_CUE_IDS.find((id) => reviewFor(id).decision === 'pending');
  if (next) selectVoice(next, { scroll: true });
  else applyFilters();
}

function exportReviews(): void {
  const payload = {
    project: '这一身',
    exportedAt: new Date().toISOString(),
    summary: {
      total: VOICE_CUE_IDS.length,
      approved: VOICE_CUE_IDS.filter((id) => reviewFor(id).decision === 'approved').length,
      revise: VOICE_CUE_IDS.filter((id) => reviewFor(id).decision === 'revise').length,
      hold: VOICE_CUE_IDS.filter((id) => reviewFor(id).decision === 'hold').length,
      pending: VOICE_CUE_IDS.filter((id) => reviewFor(id).decision === 'pending').length,
    },
    entries: VOICE_CUE_IDS.map((id) => ({
      id,
      stage: stageLabel(VOICE_CUES[id]),
      scene: VOICE_CUES[id].context.scene,
      speaker: VOICE_CUES[id].context.speaker,
      text: cleanSpeech(VOICE_CUES[id].text),
      ...reviewFor(id),
    })),
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `这一身-配音审核-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function probe(id: VoiceCueId): Promise<void> {
  const response = await fetch(assetUrl(VOICE_CUES[id]), { headers: { Range: 'bytes=0-2' } }).catch(() => null);
  const type = response?.headers.get('content-type') ?? '';
  states.set(id, response?.ok && (type.includes('audio') || type.includes('mpeg')) ? 'ready' : 'missing');
}

for (const input of [searchInput, stageSelect, assetSelect, reviewSelect]) {
  input.addEventListener(input === searchInput ? 'input' : 'change', applyFilters);
}
volumeInput.addEventListener('input', () => {
  audio.volume = Number(volumeInput.value);
  try {
    localStorage.setItem(REVIEW_VOLUME_KEY, volumeInput.value);
  } catch {
    // Optional persistence.
  }
});
autoNextInput.addEventListener('change', () => {
  try {
    localStorage.setItem(REVIEW_AUTOPLAY_KEY, String(autoNextInput.checked));
  } catch {
    // Optional persistence.
  }
});
root.querySelector<HTMLButtonElement>('[data-unreviewed]')!.addEventListener('click', continueUnreviewed);
root.querySelector<HTMLButtonElement>('[data-export]')!.addEventListener('click', exportReviews);
for (const button of root.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  button.addEventListener('click', () => setView(button.dataset.view as ReviewView));
}
audio.addEventListener('timeupdate', renderTransport);
audio.addEventListener('loadedmetadata', renderTransport);
audio.addEventListener('play', () => {
  renderTransport();
  renderList();
});
audio.addEventListener('pause', () => {
  renderTransport();
  renderList();
  renderSounds();
});
audio.addEventListener('ended', () => {
  if (!audio.loop) {
    audio.currentTime = 0;
    renderTransport();
    renderList();
  }
});
window.addEventListener('keydown', (event) => {
  if (activeView !== 'voices') return;
  const target = event.target as HTMLElement | null;
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    void toggleSelectedVoice();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    goRelative(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    goRelative(1);
  } else if (event.key.toLowerCase() === 'a') {
    markReview(selectedId, 'approved');
  } else if (event.key.toLowerCase() === 'r') {
    markReview(selectedId, 'revise');
  } else if (event.key.toLowerCase() === 'h') {
    markReview(selectedId, 'hold');
  }
});

updateCounts();
renderReviewStage();
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
    syncReviewRevisions();
  }
  if (voiceQaResponse.ok) {
    const entries = await voiceQaResponse.json() as VoiceQaEntry[];
    for (const entry of entries) voiceQa.set(entry.id, entry);
  }
  const soundCount = soundManifest
    ? Object.keys(soundManifest.sfx).length + Object.keys(soundManifest.ambience).length
    : 0;
  root!.querySelector<HTMLElement>('[data-sound-count]')!.textContent = String(soundCount);
  updateCounts();
  renderReviewStage();
  renderList();
  renderSounds();
  document.documentElement.dataset.ready = 'true';
})();
