import {
  probeElementCreated,
  probePlay,
  probeSeek,
  probeSkippedMuted,
  probeRegisterPlayingCounter,
} from './audio-probe';
import { SFX_INLINE_BASE64 } from './audio-sfx-inline';
import { ambienceProfile, configureAmbienceFilter } from './audio-ambience';
import {
  AMBIENCE_BUS_GAIN,
  DEFAULT_MASTER_VOLUME,
  DEFAULT_MUSIC_VOLUME,
  MUSIC_BUS_GAIN,
  SFX_BUS_GAIN,
  TENSION_ASSET_GAIN,
  TENSION_BUS_GAIN,
  VOICE_AMBIENCE_DUCK,
  VOICE_BEHIND_DOOR_FILTER_Q,
  VOICE_BEHIND_DOOR_LOW_PASS_HZ,
  VOICE_MUSIC_DUCK,
  VOICE_PLAYBACK_GAIN,
  VOICE_SFX_DUCK,
  ambienceAssetGain,
  musicAssetGain,
  sfxMixGain,
  upgradeLegacyMasterVolume,
} from './audio-mix';
import { MATERIAL_TONES, type ItemMaterial } from './item-material';
import { VOICE_CUES, voicePlaybackRate, type VoiceCueId, type VoiceTreatment } from './voice-script';
import { triggerHaptic } from './haptics';

export type LifeSound =
  | 'page'
  | 'breath'
  | 'hit'
  | 'hurt'
  | 'coin'
  | 'wear'
  | 'swallow'
  | 'exhale'
  | 'boss'
  | 'boss-warn'
  | 'boss-release'
  | 'boss-hit'
  | 'deny'
  | 'phone'
  | 'train'
  | 'monitor'
  | 'pickup-paper'
  | 'pickup-cloth'
  | 'pickup-metal'
  | 'pickup-coin'
  | 'shield'
  | 'heal'
  | 'dash'
  | 'door'
  | 'lamp';

const VOLUME_KEY = 'zhe-yi-shen:volume';
const LAST_VOLUME_KEY = 'zhe-yi-shen:last-audible-volume';
const AUDIO_CHOICE_KEY = 'zhe-yi-shen:audio-choice';
const DEFAULT_AUDIO_MIGRATION_KEY = 'zhe-yi-shen:default-audio-v2';
const BALANCED_AUDIO_MIGRATION_KEY = 'zhe-yi-shen:balanced-audio-v3';
const AUDIBLE_MIX_MIGRATION_KEY = 'zhe-yi-shen:restored-mix-v6';
const HAPTICS_KEY = 'zhe-yi-shen:haptics';
const EFFECTS_VOLUME_KEY = 'zhe-yi-shen:effects-volume';
const AMBIENCE_VOLUME_KEY = 'zhe-yi-shen:ambience-volume';
const MUSIC_VOLUME_KEY = 'zhe-yi-shen:music-volume';
const VOICE_VOLUME_KEY = 'zhe-yi-shen:voice-volume';
export type AudioMixChannel = 'effects' | 'ambience' | 'music' | 'voice';

const SFX_FILES: Record<LifeSound, string> = {
  page: 'assets/audio/sfx/page.mp3',
  breath: 'assets/audio/sfx/breath.mp3',
  hit: 'assets/audio/sfx/hit.mp3',
  hurt: 'assets/audio/sfx/hurt.mp3',
  coin: 'assets/audio/sfx/coin.mp3',
  wear: 'assets/audio/sfx/wear.mp3',
  swallow: 'assets/audio/sfx/swallow.mp3',
  exhale: 'assets/audio/sfx/exhale.mp3',
  boss: 'assets/audio/sfx/boss.mp3',
  'boss-warn': 'assets/audio/sfx/boss-warn.mp3',
  'boss-release': 'assets/audio/sfx/boss-release.mp3',
  'boss-hit': 'assets/audio/sfx/boss-hit.mp3',
  deny: 'assets/audio/sfx/deny.mp3',
  phone: 'assets/audio/sfx/phone.mp3',
  train: 'assets/audio/sfx/train.mp3',
  monitor: 'assets/audio/sfx/monitor.mp3',
  // 按材质分化的拾取音（Kenney RPG Audio，CC0；来源见 docs/licenses/README.md）。
  // 77 件道具此前共用同一个 wear 音，纸条和钥匙听起来毫无区别。
  'pickup-paper': 'assets/audio/sfx/pickup-paper.mp3',
  'pickup-cloth': 'assets/audio/sfx/pickup-cloth.mp3',
  'pickup-metal': 'assets/audio/sfx/pickup-metal.mp3',
  'pickup-coin': 'assets/audio/sfx/pickup-coin.mp3',
  shield: 'assets/audio/sfx/shield.mp3',
  heal: 'assets/audio/sfx/heal.mp3',
  dash: 'assets/audio/sfx/dash.mp3',
  door: 'assets/audio/sfx/door.mp3',
  lamp: 'assets/audio/sfx/lamp.mp3',
};

const AMBIENCE_FILES = [
  'assets/audio/ambience/childhood-room.mp3',
  'assets/audio/ambience/classroom.mp3',
  'assets/audio/ambience/station.mp3',
  'assets/audio/ambience/apartment.mp3',
  'assets/audio/ambience/office.mp3',
  'assets/audio/ambience/hospital.mp3',
  'assets/audio/ambience/fate-chamber.mp3',
  'assets/audio/ambience/back-room.mp3',
  'assets/audio/ambience/light-room.mp3',
] as const;

const MUSIC_FILES = [
  'assets/audio/music/first-breath.mp3',
  'assets/audio/music/under-bed.mp3',
  'assets/audio/music/red-marks.mp3',
  'assets/audio/music/missed-train.mp3',
  'assets/audio/music/lukewarm-home.mp3',
  'assets/audio/music/fluorescent-name.mp3',
  'assets/audio/music/last-lamp.mp3',
  'assets/audio/music/after-breath.mp3',
  'assets/audio/music/folded-fate.mp3',
  'assets/audio/music/borrowed-room.mp3',
] as const;

const MUSIC_TENSION_FILE = 'assets/audio/music/pressure.mp3';

/** 温启动要摸的全部音频文件（去重）；总数静态可知，标题页进度条据此合并计算。 */
let audioWarmFileCache: readonly string[] | undefined;
function audioWarmFiles(): readonly string[] {
  audioWarmFileCache ??= [...new Set([
    ...AMBIENCE_FILES,
    ...MUSIC_FILES,
    MUSIC_TENSION_FILE,
    ...Object.values(VOICE_CUES).map((cue) => cue.playbackFile ?? cue.file),
  ])];
  return audioWarmFileCache;
}

/**
 * 用一个临时元素把文件摸到可起播（readyState≥2）再立刻释放：让文件缓存与解复用
 * 管线被走过一遍，正式元素随后创建时起播就快。绝不碰正在播的池子——尤其不能借道
 * ensureMusic：它一看 track 变了就会把当前曲目的循环替补连带进行中的换岗一起收掉。
 */
function touchMediaFile(file: string, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  const element = media(file);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (good: boolean): void => {
      if (settled) return;
      settled = true;
      element.removeEventListener('loadeddata', onData);
      element.removeEventListener('canplaythrough', onData);
      element.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      window.clearTimeout(timer);
      releaseMedia(element);
      resolve(good);
    };
    const onData = (): void => { if (element.readyState >= 2) finish(true); };
    const onError = (): void => finish(false);
    const onAbort = (): void => finish(false);
    const timer = window.setTimeout(() => finish(element.readyState >= 2), timeoutMs);
    element.addEventListener('loadeddata', onData);
    element.addEventListener('canplaythrough', onData);
    element.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { finish(false); return; }
    try { element.load(); } catch { finish(false); }
  });
}

interface QueuedVoice {
  id: VoiceCueId;
  treatment?: VoiceTreatment;
  /** 入席时刻：配合保鲜期判断这句话的语境还在不在。 */
  queuedAt: number;
}

function readNumber(key: string, fallback: number): number {
  try {
    const value = Number.parseFloat(localStorage.getItem(key) ?? '');
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function readInitialVolume(): number {
  let stored = Math.max(0, Math.min(1, readNumber(VOLUME_KEY, DEFAULT_MASTER_VOLUME)));
  try {
    if (localStorage.getItem(DEFAULT_AUDIO_MIGRATION_KEY) !== 'enabled') {
      stored = stored > 0
        ? stored
        : Math.max(0.08, Math.min(1, readNumber(LAST_VOLUME_KEY, DEFAULT_MASTER_VOLUME)));
      localStorage.setItem(DEFAULT_AUDIO_MIGRATION_KEY, 'enabled');
      localStorage.setItem(AUDIO_CHOICE_KEY, 'enabled');
      localStorage.setItem(VOLUME_KEY, stored.toFixed(2));
      localStorage.setItem(LAST_VOLUME_KEY, stored.toFixed(2));
    }
    if (localStorage.getItem(BALANCED_AUDIO_MIGRATION_KEY) !== 'enabled') {
      const balanced = upgradeLegacyMasterVolume(stored);
      localStorage.setItem(BALANCED_AUDIO_MIGRATION_KEY, 'enabled');
      if (balanced !== stored) {
        localStorage.setItem(VOLUME_KEY, balanced.toFixed(2));
        localStorage.setItem(LAST_VOLUME_KEY, balanced.toFixed(2));
      }
      return balanced;
    }
  } catch {
    // Restricted WebViews may not expose persistent storage.
  }
  return stored;
}

/**
 * 同时挂着 src 的人声元素上限。
 *
 * 手机 WebView 的媒体元素/解码器是有限池，量级只有十几个，超了之后 play() 静默失败。
 * 定 8 是因为开场漫画恰好八句；第九句发生时最早一幕已经播完，可以安全 LRU 淘汰。
 * 同时必须给环境、主 BGM、循环替补和紧张层各留一格，使 12 名额的保守 WebView
 * 也不会在切章开嗓时把第九、第十句直接拒播。
 */
const VOICE_PLAYER_BUDGET = 8;
/** 所有挂 src 的常驻媒体总预算；与故障注入采用的保守 WebView 解码器池一致。 */
const PLATFORM_MEDIA_PLAYER_BUDGET = 12;
/** Web Audio 完全不可用时，元素音效也只能占四席；换音效就 LRU 复用这份预算。 */
const FALLBACK_SFX_PLAYER_BUDGET = 4;

/**
 * 候补席座位数。8 座在实际台词密度下基本不会坐满——真正防「过时台词乱入」的
 * 守门员不再是挤座位，而是下面的保鲜期：排队超时的台词说明语境已经过去，
 * 静默作废比迟到乱响强。挤丢只会在极端扎堆时发生，且有计数可查。
 */
const VOICE_QUEUE_LIMIT = 8;

/** 候补台词的保鲜期：超过这个时长还没轮上，语境已经翻篇，作废不播。 */
const VOICE_QUEUE_MAX_AGE_MS = 12_000;

/**
 * 每首配乐原始循环体的起点（秒）。烘过「前奏 + 无缝循环体」的曲子在这登记；
 * 真正换岗位置还要加上母版已烘入的进度，见 musicCrossloopStart。
 */
const MUSIC_LOOP_START: Partial<Record<number, number>> = {
  1: 3, // under-bed：开头 3 秒已烘进结尾（wav 母版未动，随时可重烘）
};

// 与 scripts/build_production_audio.sh 的 bake_loop 参数保持一致。母版末尾已经混入
// loopStart 起的这段内容；运行时必须从“已经听到的位置”继续，不能再跳回 loopStart
// 把它重播一遍。
const MUSIC_BAKED_OVERLAP_SECONDS = 1;
const AMBIENCE_BAKED_OVERLAP_SECONDS = 0.8;
const MUSIC_CROSS_SECONDS = 0.55;
const LOOP_PATROL_LEAD_SECONDS = 0.18;
const AMBIENCE_LOOP_END_SECONDS = 8;
const MUSIC_TENSION_LOOP_END_SECONDS = 18;
const MUSIC_LOOP_END_SECONDS = [18, 18, 18, 18, 18, 18, 18, 18, 57.314, 53.314] as const;
/** 本地包媒体正常应在数十毫秒内起播；给慢 WebView 留余量，但绝不能永久悬空。 */
const MEDIA_PLAY_START_TIMEOUT_MS = 1_800;

function musicLoopBase(track: number): number {
  return MUSIC_LOOP_START[track] ?? 0.02;
}

/** 双元素交叉开始时，曲尾里已烘到 loopStart + (1.0 - 0.55)。 */
function musicCrossloopStart(track: number): number {
  return musicLoopBase(track) + MUSIC_BAKED_OVERLAP_SECONDS - MUSIC_CROSS_SECONDS;
}

/** 所有创建过的媒体元素，仅供性能面板统计在播数量（元素本身生命周期不受影响）。 */
const allMediaElements: HTMLAudioElement[] = [];
probeRegisterPlayingCounter(() => allMediaElements.reduce((n, el) => n + (el.paused ? 0 : 1), 0));

/**
 * 某些移动 WebView 的 play() 会落入第三种失败态：Promise 既不 resolve 也不 reject。
 * 旁白因此永远占着 activeVoicePriority，BGM 则停在“已选曲但没起播”的假状态。
 * 同一元素只允许一个起播事务；超时主动 pause，迟到后才真正响起的 Promise 再掐一次。
 */
const mediaPlayInFlight = new WeakMap<HTMLMediaElement, Promise<void>>();
/**
 * 同一元素超时后可能已经由自愈逻辑重新 play 成功；旧 Promise 再迟到 resolve 时，
 * 只能暂停它自己那一代，绝不能把后来的健康播放一起掐掉。
 */
const mediaPlayGeneration = new WeakMap<HTMLMediaElement, number>();
let mediaPlayTimeoutCount = 0;
let mediaLateStartCount = 0;

function playMediaWithDeadline(
  element: HTMLMediaElement,
  timeoutMs = MEDIA_PLAY_START_TIMEOUT_MS,
): Promise<void> {
  const active = mediaPlayInFlight.get(element);
  if (active) return active;

  const generation = (mediaPlayGeneration.get(element) ?? 0) + 1;
  mediaPlayGeneration.set(element, generation);
  let attempt: Promise<void> | undefined;
  try {
    attempt = element.play();
  } catch (error) {
    return Promise.reject(error);
  }
  // Safari 旧实现曾返回 void；没有 Promise 时只能让 onended/下一次手势继续兜底。
  if (!attempt || typeof attempt.then !== 'function') return Promise.resolve();

  const task = new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      mediaPlayTimeoutCount += 1;
      element.pause();
      reject(new Error('media play start timeout'));
    }, Math.max(100, timeoutMs));
    attempt!.then(() => {
      if (settled) {
        // pause() 理论上会让原 Promise reject；少数宿主仍会迟到 resolve 并突然出声。
        // 若这仍是元素最新一次起播，再掐一次避免幽灵旁白或上一首 BGM 复活；若同一
        // 元素已经由自愈逻辑重新 play 成功，旧回调绝不能暂停那一代健康播放。
        mediaLateStartCount += 1;
        if (mediaPlayGeneration.get(element) === generation) element.pause();
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      if (element.paused) reject(new Error('media play resolved while paused'));
      else resolve();
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    });
  });
  mediaPlayInFlight.set(element, task);
  void task.then(
    () => { if (mediaPlayInFlight.get(element) === task) mediaPlayInFlight.delete(element); },
    () => { if (mediaPlayInFlight.get(element) === task) mediaPlayInFlight.delete(element); },
  );
  return task;
}

function media(file: string): HTMLAudioElement {
  const element = document.createElement('audio');
  element.preload = 'auto';
  element.src = new URL(file, document.baseURI).href;
  allMediaElements.push(element);
  probeElementCreated();
  return element;
}

/**
 * 真正把一个媒体元素还回去。
 *
 * 只是丢掉引用不够：元素只要还挂着 src，WebView 就一直占着解复用器与解码器名额。
 * 必须 removeAttribute('src') + load() 才会释放媒体管线；否则缓存越攒越多，
 * 到了名额上限之后所有 play() 会静默失败——真机整局没有旁白就是这么来的。
 */
function releaseMedia(element: HTMLAudioElement): void {
  if (!element.paused) element.pause();
  element.onended = null;
  element.onerror = null;
  element.onpause = null;
  element.onplaying = null;
  // createMediaElementSource 会让 AudioContext 的图继续持有这个元素。只清 src
  // 释放不了那条引用，六章旁白轮换后仍会积出几十个僵尸节点。
  sfxEngine.releaseElement(element);
  element.removeAttribute('src');
  element.load();
  const index = allMediaElements.indexOf(element);
  if (index >= 0) allMediaElements.splice(index, 1);
}

/**
 * 音效走 Web Audio 而不是 HTMLAudioElement。
 *
 * 元素路径每播一次都要 pause() + currentTime=0（真 seek）+ play()，等于让 WebView 的
 * 媒体管线冲刷缓冲、重定位、重新申请解码器。普攻音效节流仅 55ms，战斗中一秒最多 18 次，
 * 真机实测把帧率打到 25.6 FPS，而且这些开销在媒体栈里、不计入主线程长任务，所以性能面板
 * 会如实报「长任务 0 次」——查了很久才定位到。
 *
 * BufferSource 播放没有 seek、没有解码、没有管线重启，代价是微秒级。
 * 音频数据来自内联 base64（见 audio-sfx-inline.ts），不产生任何网络请求。
 */
/**
 * 找到起声点：第一个振幅超过全曲峰值 2% 的样本。留 3ms 回退量，避免把起音的
 * 极短上升沿削掉导致「咔」声变闷。扫描只在解码后做一次。
 */
function findLeadSilence(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i += 1) {
    const v = Math.abs(data[i]!);
    if (v > peak) peak = v;
  }
  if (peak <= 0) return 0;
  const threshold = peak * 0.02;
  let lead = 0;
  while (lead < data.length && Math.abs(data[lead]!) < threshold) lead += 1;
  const backoff = Math.round(buffer.sampleRate * 0.003);
  return Math.max(0, lead - backoff) / buffer.sampleRate;
}

class SfxEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private outputLimiter?: DynamicsCompressorNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  /**
   * 每种音效同时发声数上限。元素路径天然有这层限制——hit 只有 4 个池化元素，
   * 打快了就复用，而复用要先 pause()，等于把前一声掐掉。Web Audio 每次都是独立
   * BufferSource、彼此不干扰，密集攻击时会真的叠三四声，听感突然变厚变响。
   * 这里显式恢复旧的复音上限，超了就掐掉最早那一声。
   */
  private readonly voices = new Map<string, AudioBufferSourceNode[]>();
  /**
   * 每个音效的起声偏移（秒）。素材开头普遍带一段静音——实测 hit 有 50.3ms、
   * coin 35.2ms、hurt 20.3ms，叠上宿主输出缓冲就是打击感明显「慢半拍」。
   * 不必重导素材：解码后扫一遍波形定位起声点，播放时用 start(when, offset) 跳过。
   */
  private readonly leads = new Map<string, number>();
  private readonly elementFilters = new Map<
    HTMLAudioElement,
    { source: MediaElementAudioSourceNode; filter: BiquadFilterNode }
  >();
  private decoding = false;
  private failed = false;

  /** 必须在用户手势里调用，否则 AudioContext 会停在 suspended。 */
  prime(): void {
    if (this.failed) return;
    if (this.context) {
      // 首次 prime 可能落在非手势上下文里、context 停在 suspended；
      // 之后每次真手势都再试一次恢复，否则音效会永久走兜底或静音。
      if (this.context.state !== 'running') void this.context.resume?.();
      return;
    }
    const Ctor = typeof AudioContext !== 'undefined'
      ? AudioContext
      : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) { this.failed = true; return; }
    try {
      // 不显式要 interactive 的话，部分 Android WebView 会退到 balanced/playback，
      // 输出缓冲翻几倍，听感就是「音效慢半拍」。老实现不吃 options 就退回无参构造。
      try {
        this.context = new Ctor({ latencyHint: 'interactive' });
      } catch {
        this.context = new Ctor();
      }
      this.master = this.context.createGain();
      this.outputLimiter = this.context.createDynamicsCompressor();
      this.master.gain.value = 1;
      this.outputLimiter.threshold.value = -2.5;
      this.outputLimiter.knee.value = 1.5;
      this.outputLimiter.ratio.value = 12;
      this.outputLimiter.attack.value = 0.004;
      this.outputLimiter.release.value = 0.12;
      this.master.connect(this.outputLimiter);
      this.outputLimiter.connect(this.context.destination);
      void this.context.resume?.();
      this.decodeAll();
    } catch {
      // 宿主不给 Web Audio 就整条退回元素路径。
      this.failed = true;
      this.context = undefined;
    }
  }

  private decodeAll(): void {
    const context = this.context;
    if (!context || this.decoding) return;
    this.decoding = true;
    for (const [name, base64] of Object.entries(SFX_INLINE_BASE64)) {
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        // decodeAudioData 的 Promise 形式在旧 WebView 上可能缺失，回调形式两边都吃。
        // 现代 Chromium 在传入回调时仍会同时返回 Promise；两边都会成功，若不做 once，
        // 每个音效会重复执行一次整段波形扫描，启动期 CPU 工作白白翻倍。
        let completed = false;
        const onDone = (buffer: AudioBuffer): void => {
          if (completed) return;
          completed = true;
          this.buffers.set(name, buffer);
          this.leads.set(name, findLeadSilence(buffer));
        };
        const result = context.decodeAudioData(bytes.buffer, onDone, () => undefined);
        if (result && typeof (result as Promise<AudioBuffer>).then === 'function') {
          void (result as Promise<AudioBuffer>).then(onDone).catch(() => undefined);
        }
      } catch {
        // 单个音效解不出来就让它自己退回元素路径，不影响其它音效。
      }
    }
  }

  /**
   * 把语音或环境音元素接进 Web Audio 图，返回它专属的滤波器节点。
   *
   * 生产包此前完全没有滤波器，76 条语音全是干声——电话/广播/门后/回忆/咽下/吐出
   * 零区别，而开发端（audio.ts 走 Web Audio）听着是对的，所以"本地正常、发布就没了"。
   * createMediaElementSource 不需要 ArrayBuffer，因此不碰零网络请求红线。
   *
   * 只在 context 确实 running 时连接：一旦接进图，音频就只走图输出，
   * 若 context 是 suspended，语音会变成完全无声——今天已经在音效上踩过这个坑。
   */
  elementFilter(element: HTMLAudioElement): BiquadFilterNode | undefined {
    const context = this.context;
    if (!context) return undefined;
    if (context.state !== 'running') {
      void context.resume?.();
      return this.elementFilters.get(element)?.filter;
    }
    const cached = this.elementFilters.get(element);
    if (cached) return cached.filter;
    try {
      // 每个元素只能建一次 MediaElementSource，重复调用会抛错。
      const source = context.createMediaElementSource(element);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 18_000;
      filter.Q.value = 0;
      source.connect(filter);
      filter.connect(this.outputLimiter ?? context.destination);
      this.elementFilters.set(element, { source, filter });
      return filter;
    } catch {
      // 接不进去就保持原样播放：干声总好过无声。
      return undefined;
    }
  }

  /** 媒体元素退池时同步拆掉 Web Audio 图，避免 Map 与 AudioContext 双重强引用。 */
  releaseElement(element: HTMLAudioElement): void {
    const graph = this.elementFilters.get(element);
    if (!graph) return;
    this.elementFilters.delete(element);
    try { graph.source.disconnect(); } catch { /* 已断开 */ }
    try { graph.filter.disconnect(); } catch { /* 已断开 */ }
  }

  ready(name: string): boolean {
    return !this.failed && !!this.context && this.buffers.has(name);
  }

  play(name: string, volume: number, rate: number, material?: ItemMaterial): boolean {
    const context = this.context;
    const master = this.master;
    const buffer = this.buffers.get(name);
    if (!context || !master || !buffer) return false;
    // context 没在 running 时，createBufferSource + start() 不会抛异常，只是一声不响。
    // 那样这里返回 true 会让元素兜底路径被跳过，结果是「不卡了，因为根本没播」——
    // 必须先把这一声让给元素路径，同时尝试恢复 context，下一声再走 Web Audio。
    if (context.state !== 'running') {
      void context.resume?.();
      return false;
    }
    try {
      const limit = name === 'hit' || name === 'breath' ? 4 : 2;
      const live = this.voices.get(name) ?? [];
      while (live.length >= limit) {
        const oldest = live.shift();
        try { oldest?.stop(); } catch { /* 可能已自然结束 */ }
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const gain = context.createGain();
      gain.gain.value = volume;
      // 材质音色：玻璃/塑料/肉感没有对应采样，靠音高 + 滤波从既有声音塑形。
      // 有真实采样的材质不会走到这里（调用方直接选了对应的音效文件）。
      const tone = material ? MATERIAL_TONES[material] : undefined;
      if (tone && tone.frequency < 18_000) {
        const filter = context.createBiquadFilter();
        filter.type = tone.filterType;
        filter.frequency.value = tone.frequency;
        filter.Q.value = tone.q;
        source.connect(filter);
        filter.connect(gain);
      } else {
        source.connect(gain);
      }
      gain.connect(master);
      source.onended = () => {
        const list = this.voices.get(name);
        if (list) {
          const at = list.indexOf(source);
          if (at >= 0) list.splice(at, 1);
        }
        try { source.disconnect(); gain.disconnect(); } catch { /* 已断开 */ }
      };
      // 从起声点开始，跳过素材自带的前导静音。
      source.start(0, this.leads.get(name) ?? 0);
      live.push(source);
      this.voices.set(name, live);
      return true;
    } catch {
      return false;
    }
  }

  state(): string {
    if (this.failed) return 'unavailable';
    const context = this.context;
    if (!context) return 'idle';
    // 延迟靠体感说不清，直接把宿主给的两个数打出来：base=输出缓冲，out=端到端。
    const ms = (value?: number) => (typeof value === 'number' ? `${Math.round(value * 1000)}ms` : '?');
    const latency = `base ${ms(context.baseLatency)} · out ${ms(
      (context as AudioContext & { outputLatency?: number }).outputLatency,
    )}`;
    const filtered = this.elementFilters.size;
    const hitLead = this.leads.get('hit');
    const trim = typeof hitLead === 'number' ? ` · hit裁${Math.round(hitLead * 1000)}ms` : '';
    return `${context.state} · ${this.buffers.size}/${Object.keys(SFX_INLINE_BASE64).length} · ${latency}${trim} · 媒体滤波${filtered}`;
  }
}

const sfxEngine = new SfxEngine();
let resumePlatformMedia: (() => void) | undefined;
let platformAudioUnlocked = false;

/** 与 audio.ts 的 configureVoiceFilter 保持逐参数一致，两端听感必须相同。 */
function configureVoiceFilter(filter: BiquadFilterNode, treatment: VoiceTreatment): void {
  if (treatment === 'phone') {
    filter.type = 'bandpass'; filter.frequency.value = 1700; filter.Q.value = 0.72;
  } else if (treatment === 'pa') {
    filter.type = 'highpass'; filter.frequency.value = 220; filter.Q.value = 0.55;
  } else if (treatment === 'behind-door') {
    filter.type = 'lowpass';
    filter.frequency.value = VOICE_BEHIND_DOOR_LOW_PASS_HZ;
    filter.Q.value = VOICE_BEHIND_DOOR_FILTER_Q;
  } else if (treatment === 'memory') {
    filter.type = 'lowpass'; filter.frequency.value = 2450; filter.Q.value = 0.35;
  } else if (treatment === 'swallowed') {
    filter.type = 'lowpass'; filter.frequency.value = 880; filter.Q.value = 0.8;
  } else if (treatment === 'exhaled') {
    filter.type = 'highshelf'; filter.frequency.value = 1800; filter.gain.value = 2.5;
  } else {
    filter.type = 'lowpass'; filter.frequency.value = 18_000; filter.Q.value = 0;
  }
}

// 从后台切回时 AudioContext 会停在 suspended，且不会因为一次点击自动恢复
// （Phaser 的最佳实践文章专门点名过 iOS 上这个行为）。unlock() 不一定在切回后
// 被触发，所以这里显式挂在可见性/焦点事件上补一刀。
if (typeof document !== 'undefined') {
  const resumeIfVisible = (): void => {
    // audio-runtime.ts 会静态引用两套实现；demo 采用 buffered runtime 时，
    // 这里也会注册事件。用户手势前绝不能为未选用的备用实现抢建 AudioContext，
    // 否则移动 WebView 可能把唯一的硬件音频会话留给一个 suspended context。
    if (document.visibilityState !== 'visible' || !platformAudioUnlocked) return;
    sfxEngine.prime();
    resumePlatformMedia?.();
  };
  // 再补一道：任何真实手势都尝试恢复一次。首次 unlock 若落在非手势上下文，
  // 光靠可见性事件救不回来——玩家不切后台就永远静音。
  const primeOnGesture = (): void => {
    if (!platformAudioUnlocked) return;
    sfxEngine.prime();
    resumePlatformMedia?.();
  };
  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
    document.addEventListener(type, primeOnGesture, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', resumeIfVisible);
  window.addEventListener('focus', resumeIfVisible);
  window.addEventListener('pageshow', resumeIfVisible);
}

/** 供性能面板显示音效引擎走的是哪条路。 */
export function sfxEngineState(): string {
  return sfxEngine.state();
}

/**
 * 人声管线诊断，真机性能面板直读——「漫画没旁白」这类只在设备上出现的故障，
 * 靠它一眼分辨卡在哪一环：复活=开局手势里把启动期元素重装/开嗓成功了几条；
 * 自愈=play 被拒后 load 重试救回几条；拒播=重试仍失败、真丢了几句。
 */
let voiceReviveCount = 0;
let voiceHealCount = 0;
let voiceRejectCount = 0;
let voiceDropCount = 0;
let voiceExpireCount = 0;
let voiceZombieCount = 0;
let voiceRuntimeErrorCount = 0;
let ambienceRuntimeErrorCount = 0;
let musicRuntimeErrorCount = 0;
let musicTwinRejectCount = 0;
let tensionRuntimeErrorCount = 0;
let fallbackRuntimeErrorCount = 0;
let ambienceStartRetireCount = 0;
let musicStartRetireCount = 0;
let tensionStartRetireCount = 0;
export function voicePipelineState(): string {
  return `复活 ${voiceReviveCount} · 自愈 ${voiceHealCount} · 拒播 ${voiceRejectCount} · 中途错误 ${voiceRuntimeErrorCount} · 起播超时 ${mediaPlayTimeoutCount} · 迟播拦截 ${mediaLateStartCount} · 挤丢 ${voiceDropCount} · 过期 ${voiceExpireCount} · 僵尸 ${voiceZombieCount}`;
}

export class LifeFeedback {
  private volume = readInitialVolume();
  private effectsVolume = Math.max(0, Math.min(1, readNumber(EFFECTS_VOLUME_KEY, 1)));
  private ambienceVolume = Math.max(0, Math.min(1, readNumber(AMBIENCE_VOLUME_KEY, 1)));
  private musicVolume = Math.max(0, Math.min(1, readNumber(MUSIC_VOLUME_KEY, DEFAULT_MUSIC_VOLUME)));
  private voiceVolume = Math.max(0, Math.min(1, readNumber(VOICE_VOLUME_KEY, 1)));
  private haptics = readBoolean(HAPTICS_KEY, true);
  private unlocked = false;
  private readonly lastPlayed = new Map<LifeSound, number>();
  private lastAmbienceEventPlayed = -Infinity;
  private readonly sfxPools = new Map<LifeSound, HTMLAudioElement[]>();
  private readonly ambienceEventPlayers = new Map<LifeSound, HTMLAudioElement>();
  private readonly ambienceEventLevels = new Map<HTMLAudioElement, number>();
  private readonly ambiencePlayers = new Map<number, HTMLAudioElement>();
  private readonly musicPlayers = new Map<number, HTMLAudioElement>();
  private readonly fadeTokens = new Map<HTMLAudioElement, number>();
  private readonly voicePlayers = new Map<VoiceCueId, HTMLAudioElement>();
  private readonly lastVoicePlayed = new Map<VoiceCueId, number>();
  private activeVoice?: HTMLAudioElement;
  private activeVoiceBaseVolume = 0;
  private activeVoicePriority = 0;
  /** 游戏暂停只挂起当前播放头；与 stopVoice 的“剧情已取消”语义严格分开。 */
  private voiceSuspendedByGame = false;
  private voiceRequestSerial = 0;
  private readonly queuedVoices: QueuedVoice[] = [];
  private requestedAmbience?: number;
  private activeAmbienceStage?: number;
  private activeAmbience?: HTMLAudioElement;
  private requestedMusic?: number;
  private activeMusicTrack?: number;
  private activeMusic?: HTMLAudioElement;
  private musicTension = false;
  private tensionPlayer?: HTMLAudioElement;
  private activeTension?: HTMLAudioElement;
  /** 无手势也要自救两次；再失败就等下一次真实交互，避免坏文件形成永久重试环。 */
  private ambienceStartFailures = 0;
  private musicStartFailures = 0;
  private tensionStartFailures = 0;
  /** 同一个在途 play() 会被多个 sync 调用共享；每个播放代次只允许结算一次失败。 */
  private readonly loopStartFailureGeneration = new WeakMap<HTMLAudioElement, number>();
  /** mp3 元素循环的尾部空隙巡逻定时器（见 ensureLoopPatrol）。 */
  private loopPatrolTimer: number | null = null;
  /** 每个循环元素最近一次被巡逻跳回开头的时刻：防连环 seek。 */
  private readonly loopJumpAt = new WeakMap<HTMLAudioElement, number>();
  /** 每个配乐元素的循环体起点（见 MUSIC_LOOP_START）。 */
  private readonly loopStartByEl = new WeakMap<HTMLAudioElement, number>();
  /**
   * BGM 无缝循环的替补元素。真机上 mp3 的 seek 本身要重启解复用管线（可闻空洞），
   * 巡逻跳回法治不了；正解是同曲双元素：快到尾时替补从循环体起点淡入、主元素
   * 淡出、换岗。任意时刻配乐最多占 2 个媒体名额。
   */
  private musicTwin?: HTMLAudioElement;
  private musicTwinTrack?: number;
  private musicCross?: { from: HTMLAudioElement; to: HTMLAudioElement; endAt: number; durationMs: number };
  private musicSwapAt = 0;
  /** 让仍在等待 play() 的旧换岗回调在停播或换曲后失效。 */
  private musicCrossSerial = 0;
  /** 循环替补的预备定时器：起曲 1.2 秒后就把替补建好、预 seek 到循环点（见 armMusicTwin）。 */
  private musicTwinArmTimer: number | null = null;

  constructor() {
    try {
      if (localStorage.getItem(AUDIBLE_MIX_MIGRATION_KEY) !== 'enabled') {
        this.effectsVolume = 1;
        this.ambienceVolume = 1;
        this.musicVolume = DEFAULT_MUSIC_VOLUME;
        this.voiceVolume = 1;
        localStorage.setItem(EFFECTS_VOLUME_KEY, '1.00');
        localStorage.setItem(AMBIENCE_VOLUME_KEY, '1.00');
        localStorage.setItem(MUSIC_VOLUME_KEY, DEFAULT_MUSIC_VOLUME.toFixed(2));
        localStorage.setItem(VOICE_VOLUME_KEY, '1.00');
        localStorage.setItem(AUDIBLE_MIX_MIGRATION_KEY, 'enabled');
      }
    } catch {
      // Restricted WebViews may not expose persistent storage.
    }
    // The game owns one feedback instance for the lifetime of the page. Keep the
    // foreground hook pointed at that instance so host-paused media loops can
    // resume even when returning to the page is not followed by a game action.
    resumePlatformMedia = () => this.resumeAfterForeground();
  }

  unlock(): void {
    const first = !this.unlocked;
    if (first) {
      this.unlocked = true;
      platformAudioUnlocked = true;
    }
    // prime 每次都要再试一遍，不能只在首次：第一次 unlock 很可能压根不在用户手势里
    // （启动时的标题配乐、断点续局都会走到这儿），那时 AudioContext 只能停在 suspended。
    // 旧写法把 prime 关在 first 分支里，于是之后真正的点击再也不会恢复它——整局静音。
    // prime() 自身幂等：已有 context 时只在 state !== 'running' 时补一次 resume。
    sfxEngine.prime();
    // 这里绝不批量预建音效元素池。旧逻辑在 first && !ready('hit') 时一口气建 30 个
    // preload='auto' 的 <audio>——而 first 那次 unlock 发生在启动 warmup 里，Web Audio
    // 的 buffer 还在异步解码、ready 必然 false，于是每次启动都白建 30 个元素，和开场
    // 漫画那八条人声抢装载通道（真机上人声元素在启动风暴里装载失败＝漫画整段没旁白）。
    // play() 里本有「引擎没 ready 就现场 ensureSfxPool」的兜底，Web Audio 不可用的
    // 机器照样有声，只是第一声晚建几毫秒。
    this.ensureLoopPatrol();
    this.syncAmbience();
    this.syncMusic();
    this.syncMusicTension();
    this.resumeActiveVoice();
  }

  /**
   * 干掉 BGM 的「中断循环感」。mp3 在元素上原生 loop 时，尾部必然带一段编码器
   * 补零静音（几十到几百毫秒），听感就是每一圈结尾咯噔断一下。巡逻以 20Hz 盯着
   * 三个循环元素，快到尾巴时提前跳回开头——每圈只多一次 seek，churn 可忽略；
   * timeupdate 事件只有 ~4Hz，抓不住这个窗口，所以用定时器。seek 失败就让原生
   * loop 兜底，最坏也不比现在差。
   */
  private ensureLoopPatrol(): void {
    if (this.loopPatrolTimer !== null) return;
    this.loopPatrolTimer = window.setInterval(() => {
      if (document.hidden) return;
      const now = performance.now();

      // —— 语音僵尸看门狗 ——
      // 部分 WebView 在「pause() 落在 play 仍在缓冲的窗口」时会缓冲完照播不误，
      // 而 JS 侧 paused 仍是 true 直到下一次交互——表现为多句旁白齐响（少年开局）。
      // 凡是不是当前主播、没被静音、却在出声的池内元素，一律当场掐掉并计数。
      for (const [, element] of this.voicePlayers) {
        if (element === this.activeVoice || element.paused || element.muted) continue;
        element.pause();
        try { if (element.currentTime !== 0) element.currentTime = 0; } catch { /* seek 失败无碍 */ }
        voiceZombieCount += 1;
      }

      // —— BGM 双元素无缝换岗 ——
      const music = this.activeMusic;
      if (this.musicCross) {
        const cross = this.musicCross;
        const k = Math.max(0, Math.min(1, (cross.endAt - now) / cross.durationMs));
        const base = this.musicTargetVolume(MUSIC_BUS_GAIN, musicAssetGain(this.activeMusicTrack ?? 0));
        // 母版曲尾已经烘入同一段循环开头，替补又从烘焙进度之后接着播；两路是
        // 高度相关的同一段声音。这里必须做恒和（线性）换岗，等功率曲线会把中点
        // 叠高约 3 dB，继而让 limiter 每圈泵一下，听感反而像接缝。
        cross.from.volume = base * k;
        cross.to.volume = base * (1 - k);
        if (k <= 0) {
          cross.from.pause();
          try { cross.from.currentTime = this.loopStartByEl.get(cross.from) ?? 0.02; } catch { /* 无碍 */ }
          this.musicCross = undefined;
        }
      } else if (music && !music.paused && music.loop) {
        const loopEnd = MUSIC_LOOP_END_SECONDS[this.activeMusicTrack ?? 0] ?? music.duration;
        if (Number.isFinite(loopEnd) && loopEnd > 2 && now - this.musicSwapAt > 1500) {
          if (music.currentTime > loopEnd - MUSIC_CROSS_SECONDS) {
            this.musicSwapAt = now;
            this.beginMusicCrossloop(music, MUSIC_CROSS_SECONDS);
          }
        }
      }

      // —— 紧张层与环境床仍用提前跳回 ——
      // 母版烘焙已在这个巡逻点前完成淡出/淡入，所以跳转两侧都是同一进度的
      // 纯 head 波形；既绕过 mp3 尾部补零，也不会硬切掉尚未淡尽的 tail。
      const patrolLoops: Array<[HTMLAudioElement | undefined, number, number]> = [
        [
          this.activeTension,
          0.02 + MUSIC_BAKED_OVERLAP_SECONDS - LOOP_PATROL_LEAD_SECONDS,
          MUSIC_TENSION_LOOP_END_SECONDS,
        ],
        [
          this.activeAmbience,
          0.02 + AMBIENCE_BAKED_OVERLAP_SECONDS - LOOP_PATROL_LEAD_SECONDS,
          AMBIENCE_LOOP_END_SECONDS,
        ],
      ];
      for (const [el, resumeAt, loopEnd] of patrolLoops) {
        if (!el || el.paused || !el.loop || el.seeking) continue;
        if (now - (this.loopJumpAt.get(el) ?? 0) < 600) continue;
        if (el.currentTime > loopEnd - LOOP_PATROL_LEAD_SECONDS) {
          this.loopJumpAt.set(el, now);
          try { el.currentTime = resumeAt; } catch { /* 原生 loop 兜底 */ }
        }
      }
    }, 50);
  }

  /**
   * 提前把循环替补建好：元素创建、load、预 seek 到循环点，全部发生在起曲后的
   * 安静期，而不是曲尾换岗那一刻。旧行为是在 currentTime 已经踩进最后 0.55 秒时
   * 才 media() 建元素——首圈换岗要现场「建元素 + 读包 + 起播」，起播晚几百毫秒，
   * 替补还没出声主唱已经进了编码器补零的静音尾巴，听感就是第一圈必咯噔。
   */
  private armMusicTwin(track: number): void {
    if (this.activeMusicTrack !== track) return;
    if (this.musicTwin && this.musicTwinTrack === track) return;
    if (this.musicTwin) this.releaseMediaPlayer(this.musicTwin);
    // 替补是无缝体验优化；十二席已经被真实播放占满时宁可让原生 loop 兜底，
    // 也不能为了双元素换岗挤爆整条媒体栈。
    if (!this.reserveNonVoiceMediaSlots(1)) {
      this.musicTwin = undefined;
      this.musicTwinTrack = undefined;
      return;
    }
    const twin = media(MUSIC_FILES[track]!);
    twin.loop = true;
    twin.onerror = () => this.recoverMusicMediaError(twin, track);
    // 替补一旦接管就会成为主播放器，必须从创建时起走同一条 limiter 图。
    sfxEngine.elementFilter(twin);
    this.musicTwin = twin;
    this.musicTwinTrack = track;
    const loopStart = musicCrossloopStart(track);
    this.loopStartByEl.set(twin, loopStart);
    const seek = (): void => {
      twin.removeEventListener('loadedmetadata', seek);
      if (this.musicTwin !== twin || !twin.paused) return;
      try { twin.currentTime = loopStart; } catch { /* 换岗时还会再 seek 一次 */ }
    };
    if (twin.readyState >= 1) seek();
    else twin.addEventListener('loadedmetadata', seek);
    try { twin.load(); } catch { /* preload=auto 已经在装了 */ }
  }

  private scheduleMusicTwinArm(track: number): void {
    if (this.musicTwinArmTimer !== null) window.clearTimeout(this.musicTwinArmTimer);
    // 1.2 秒：躲开起曲那一下的解码/起播高峰，又远早于最短曲目（18 秒）的第一圈曲尾。
    this.musicTwinArmTimer = window.setTimeout(() => {
      this.musicTwinArmTimer = null;
      this.armMusicTwin(track);
    }, 1200);
  }

  /** 起一次换岗：替补从循环体起点静音起播，交叉淡化后接管 activeMusic 身份。 */
  private beginMusicCrossloop(current: HTMLAudioElement, crossSeconds: number): void {
    const track = this.activeMusicTrack;
    if (track === undefined) return;
    this.armMusicTwin(track);
    const twin = this.musicTwin;
    if (!twin) return;
    // arm 阶段可能发生在 AudioContext 尚未恢复时；换岗前再接一次，确保不绕 limiter。
    sfxEngine.elementFilter(twin);
    const loopStart = this.loopStartByEl.get(current) ?? 0.02;
    // 预备阶段已 seek 过；这里只在位置漂了（>80ms）时再校一次，避免每圈都做真 seek。
    if (Math.abs(twin.currentTime - loopStart) > 0.08) {
      try { twin.currentTime = loopStart; } catch { /* 未就绪则从头，误差极小 */ }
    }
    this.cancelFade(current);
    this.cancelFade(twin);
    twin.volume = 0;
    const serial = ++this.musicCrossSerial;
    void playMediaWithDeadline(twin, crossSeconds * 1000).then(() => {
      // play() 在部分 WebView 上会晚几百毫秒兑现；期间若已停播或换曲，旧替补
      // 绝不能反过来覆盖新 activeMusic，把上一首歌重新放出来。
      if (serial !== this.musicCrossSerial
        || this.activeMusic !== current
        || this.activeMusicTrack !== track
        || this.musicTwin !== twin) {
        twin.pause();
        return;
      }
      // 换岗成功才交接身份：主备互换，旧主淡出后归位待命。
      this.musicTwin = current;
      this.musicTwinTrack = track;
      this.activeMusic = twin;
      this.musicPlayers.set(track, twin);
      this.musicCross = {
        from: current,
        to: twin,
        endAt: performance.now() + crossSeconds * 1000,
        durationMs: crossSeconds * 1000,
      };
    }).catch(() => {
      // 宿主可能只拒绝 play() 而不派发 error。旧逻辑会把这个坏替补永久留在
      // musicTwin，之后每一圈都重试同一个元素，双元素无缝循环从此永久失效。
      // 主播放器仍健康，故这里只退掉替补并错峰重建，当前一圈由原生 loop 兜底。
      if (serial !== this.musicCrossSerial
        || this.activeMusic !== current
        || this.activeMusicTrack !== track
        || this.musicTwin !== twin) return;
      this.musicCrossSerial += 1;
      this.musicTwin = undefined;
      this.musicTwinTrack = undefined;
      musicTwinRejectCount += 1;
      this.releaseMediaPlayer(twin);
      if (!document.hidden) this.scheduleMusicTwinArm(track);
    });
  }


  private resumeAfterForeground(): void {
    if (!this.unlocked || this.volume <= 0) return;
    this.syncAmbience();
    this.syncMusic();
    this.syncMusicTension();
    this.resumeActiveVoice();
  }

  /**
   * 来电、切后台或宿主音频焦点切换会直接 pause 当前旁白，却不会触发 ended。
   * 若只恢复循环轨，activeVoicePriority 会永远占用，后续台词全部堵在候补席。
   * focus/pageshow 与任一后续用户手势都从原播放头续上；期间若剧情已取消这句，
   * serial 守卫立即掐掉迟到起播，不能让旧旁白复活。
   */
  private resumeActiveVoice(): void {
    const player = this.activeVoice;
    if (!player
      || !player.paused
      || this.voiceSuspendedByGame
      || this.volume <= 0
      || this.voiceVolume <= 0) return;
    const serial = this.voiceRequestSerial;
    void playMediaWithDeadline(player).then(() => {
      if (serial !== this.voiceRequestSerial
        || this.activeVoice !== player
        || this.voiceSuspendedByGame) player.pause();
    }).catch(() => {
      // 保留 active 状态，下一次 focus/pageshow 或真实手势继续重试；不能让一次
      // 无手势 autoplay 拒绝就吞掉整句，也不能把候补席永久误判成已经开播。
    });
  }

  getVolume(): number {
    return this.volume;
  }

  getMixVolume(channel: AudioMixChannel): number {
    if (channel === 'effects') return this.effectsVolume;
    if (channel === 'ambience') return this.ambienceVolume;
    if (channel === 'music') return this.musicVolume;
    return this.voiceVolume;
  }

  setMixVolume(channel: AudioMixChannel, value: number): void {
    const next = Math.max(0, Math.min(1, value));
    if (channel === 'effects') this.effectsVolume = next;
    else if (channel === 'ambience') this.ambienceVolume = next;
    else if (channel === 'music') this.musicVolume = next;
    else this.voiceVolume = next;
    try {
      const key = channel === 'effects'
        ? EFFECTS_VOLUME_KEY
        : channel === 'ambience'
          ? AMBIENCE_VOLUME_KEY
          : channel === 'music' ? MUSIC_VOLUME_KEY : VOICE_VOLUME_KEY;
      localStorage.setItem(key, next.toFixed(2));
    } catch {
      // Persistence is optional in restricted webviews.
    }
    this.refreshActiveVolumes();
    // 0 也必须进 sync：只把元素 volume 设成 0 仍会解码，连续切歌后甚至有旧淡出曲
    // 没被 refreshActiveVolumes 覆盖而继续可闻。sync 的 0 分支负责真正停流。
    if (channel === 'ambience') this.syncAmbience();
    if (channel === 'music') {
      this.syncMusic();
      this.syncMusicTension();
    }
    if (channel === 'voice' && next <= 0) this.stopVoice();
    if (channel === 'effects' && next <= 0) this.releaseAllSfxPools();
    if (channel === 'ambience' && next <= 0) this.releaseAmbienceEventPlayers();
  }

  debugState(): {
    context: AudioContextState | 'unavailable';
    sfxReady: number;
    ambienceReady: number;
    requestedAmbience: number | null;
    activeAmbience: number | null;
    musicReady: number;
    requestedMusic: number | null;
    activeMusic: number | null;
    musicTension: boolean;
    voiceReady: number;
    voiceActive: boolean;
    voiceRevives: number;
    voiceHeals: number;
    voiceRejects: number;
    voiceRuntimeErrors: number;
    ambienceRuntimeErrors: number;
    musicRuntimeErrors: number;
    musicTwinRejects: number;
    tensionRuntimeErrors: number;
    fallbackRuntimeErrors: number;
    ambienceStartRetires: number;
    musicStartRetires: number;
    tensionStartRetires: number;
    mediaPlayTimeouts: number;
    mediaLateStarts: number;
    voiceQueued: number;
    mediaReady: number;
    fadeTokens: number;
    fallbackSfxPlayers: number;
    ambienceEventReady: number;
    mix: { effects: number; ambience: number; music: number; voice: number };
    bus: { master: number; effects: number; ambience: number; music: number; tension: number; voice: number };
  } {
    return {
      context: this.unlocked ? 'running' : 'suspended',
      sfxReady: this.sfxPools.size,
      ambienceReady: this.ambiencePlayers.size,
      requestedAmbience: this.requestedAmbience ?? null,
      activeAmbience: this.activeAmbienceStage ?? null,
      musicReady: this.musicPlayers.size,
      requestedMusic: this.requestedMusic ?? null,
      activeMusic: this.activeMusicTrack ?? null,
      musicTension: this.musicTension,
      voiceReady: this.voicePlayers.size,
      voiceActive: Boolean(this.activeVoice),
      voiceRevives: voiceReviveCount,
      voiceHeals: voiceHealCount,
      voiceRejects: voiceRejectCount,
      voiceRuntimeErrors: voiceRuntimeErrorCount,
      ambienceRuntimeErrors: ambienceRuntimeErrorCount,
      musicRuntimeErrors: musicRuntimeErrorCount,
      musicTwinRejects: musicTwinRejectCount,
      tensionRuntimeErrors: tensionRuntimeErrorCount,
      fallbackRuntimeErrors: fallbackRuntimeErrorCount,
      ambienceStartRetires: ambienceStartRetireCount,
      musicStartRetires: musicStartRetireCount,
      tensionStartRetires: tensionStartRetireCount,
      mediaPlayTimeouts: mediaPlayTimeoutCount,
      mediaLateStarts: mediaLateStartCount,
      voiceQueued: this.queuedVoices.length,
      mediaReady: this.voicePlayers.size + this.nonVoiceMediaPlayerCount(),
      fadeTokens: this.fadeTokens.size,
      fallbackSfxPlayers: this.fallbackSfxPlayerCount(),
      ambienceEventReady: this.ambienceEventPlayers.size,
      mix: {
        effects: this.effectsVolume,
        ambience: this.ambienceVolume,
        music: this.musicVolume,
        voice: this.voiceVolume,
      },
      bus: {
        master: this.volume,
        effects: this.volume * SFX_BUS_GAIN * this.effectsVolume,
        ambience: this.activeAmbience?.volume ?? 0,
        music: this.activeMusic?.volume ?? 0,
        tension: this.activeTension?.volume ?? 0,
        voice: this.activeVoice?.volume ?? 0,
      },
    };
  }

  audioEnabled(): boolean {
    return this.volume > 0;
  }

  setAudioEnabled(value: boolean): void {
    const restored = upgradeLegacyMasterVolume(
      Math.max(0.08, Math.min(1, readNumber(LAST_VOLUME_KEY, DEFAULT_MASTER_VOLUME))),
    );
    this.setVolume(value ? (this.volume > 0 ? this.volume : restored) : 0);
    if (value) {
      this.unlock();
      this.syncAmbience();
      this.syncMusic();
      this.syncMusicTension();
    } else {
      this.stopVoice();
      // 关声只是静音，不是「这一章不再需要环境音」。清掉 requestedAmbience 会让
      // 重新开声后 syncAmbience() 直接 return，本章底噪一直缺到下一次 setAmbience()。
      // 与 audio.ts 的 buffered 版保持一致：只有 setAmbience(undefined) 才清请求。
      this.stopAmbience(false);
      this.stopMusic(false, true);
    }
  }

  setVolume(value: number): void {
    const wasSilent = this.volume <= 0;
    this.volume = Math.max(0, Math.min(1, value));
    try {
      localStorage.setItem(VOLUME_KEY, this.volume.toFixed(2));
      localStorage.setItem(AUDIO_CHOICE_KEY, this.volume > 0 ? 'enabled' : 'muted');
      if (this.volume > 0) localStorage.setItem(LAST_VOLUME_KEY, this.volume.toFixed(2));
    } catch {
      // Persistence is optional in restricted webviews.
    }
    this.refreshActiveVolumes();
    if (wasSilent && this.volume > 0) {
      this.unlock();
      this.syncAmbience();
      this.syncMusic();
      this.syncMusicTension();
    } else if (!wasSilent && this.volume <= 0) {
      this.stopVoice();
      this.stopAmbience(false);
      this.stopMusic(false, true);
      this.releaseAllSfxPools();
      this.releaseAmbienceEventPlayers();
    }
  }

  hapticsEnabled(): boolean {
    return this.haptics;
  }

  setHaptics(value: boolean): void {
    this.haptics = value;
    try {
      localStorage.setItem(HAPTICS_KEY, String(value));
    } catch {
      // Persistence is optional in restricted webviews.
    }
    if (value) this.vibrate(10);
  }

  vibrate(pattern: number | number[]): void {
    if (!this.haptics) return;
    triggerHaptic(pattern);
  }

  play(sound: LifeSound, intensity = 1, material?: ItemMaterial): void {
    const now = performance.now();
    const throttle = sound === 'hit' ? 55
      : sound === 'breath' ? 95
        : ['boss-warn', 'boss-release', 'boss-hit'].includes(sound) ? 160
        : ['shield', 'heal', 'dash', 'door', 'lamp'].includes(sound) ? 240
          : 18;
    // 音量 0 时也要真的不播：HTMLAudioElement 即使 volume=0 仍然走完整解码/起播，
    // 在互动空间 WebView 上这份开销照收不误（玩家把「音效」拉到 0 却依然顿帧）。
    if (now - (this.lastPlayed.get(sound) ?? -Infinity) < throttle
      || this.volume <= 0
      || this.effectsVolume <= 0) {
      if (this.volume <= 0 || this.effectsVolume <= 0) probeSkippedMuted();
      return;
    }
    this.lastPlayed.set(sound, now);
    this.unlock();
    const gain = Math.max(0, Math.min(
      2.5,
      SFX_BUS_GAIN * sfxMixGain(sound) * intensity * this.volume * this.effectsVolume
        * (this.voiceDuckingActive() ? VOICE_SFX_DUCK : 1),
    ));
    const baseRate = ['boss', 'boss-warn', 'boss-release', 'boss-hit', 'deny', 'phone', 'train', 'monitor', 'heal', 'lamp'].includes(sound)
      ? 1
      : Math.max(0.92, Math.min(1.08, 1 + (Math.random() - 0.5) * 0.045));
    const rate = material ? baseRate * MATERIAL_TONES[material].rate : baseRate;
    if (sfxEngine.play(sound, gain, rate, material)) {
      // 这个音效已经走 BufferSource；先前解码未就绪时建的元素兜底立即还池。
      this.releaseSfxPool(sound);
      probePlay(sound);
      return;
    }
    const pool = this.ensureSfxPool(sound);
    const player = pool.find((entry) => entry.paused || entry.ended) ?? pool[0];
    if (!player) return;
    // 给 HTMLAudioElement 赋 currentTime 是一次真 seek，移动端 WebView 会冲刷并重建媒体管线；
    // 普攻音效节流仅 55ms，战斗中一秒最多 18 次，足够把帧啃出肉眼可见的顿。已经停在 0 的元素
    // 不需要再 seek，也不需要先 pause 一个本来就暂停的元素。
    if (!player.paused) player.pause();
    if (player.currentTime !== 0) { player.currentTime = 0; probeSeek(); }
    player.volume = Math.max(0, Math.min(
      1,
      SFX_BUS_GAIN
        * sfxMixGain(sound)
        * intensity
        * this.volume
        * this.effectsVolume
        * (this.voiceDuckingActive() ? VOICE_SFX_DUCK : 1),
    ));
    player.playbackRate = ['boss', 'boss-warn', 'boss-release', 'boss-hit', 'deny', 'phone', 'train', 'monitor', 'heal', 'lamp'].includes(sound)
      ? 1
      : Math.max(0.92, Math.min(1.08, 1 + (Math.random() - 0.5) * 0.045));
    probePlay(sound);
    const task = playMediaWithDeadline(player);
    const generation = mediaPlayGeneration.get(player) ?? 0;
    void task.catch(() => {
      // WebView 可能只 reject play()、不派发 error；池头元素仍 paused，旧逻辑下
      // 每一声都会再次选中它，整类音效永久静音。只处理本代失败，避免迟到 reject
      // 误删已经成功复用的同一元素；整池退掉后下一次触发会干净重建。
      if (mediaPlayGeneration.get(player) !== generation || !player.paused) return;
      if (!this.sfxPools.get(sound)?.includes(player)) return;
      fallbackRuntimeErrorCount += 1;
      this.releaseSfxPool(sound);
    });
  }

  /**
   * 平台版的低频场景事件故意走独立、可复用的媒体元素：几十秒才触发一次，
   * 不会形成高频 seek churn，同时能正确跟随环境声滑条与对白 ducking。
   */
  playAmbienceEvent(sound: LifeSound, intensity = 0.3): void {
    const now = performance.now();
    if (now - this.lastAmbienceEventPlayed < 900
      || this.volume <= 0
      || this.ambienceVolume <= 0) return;
    this.lastAmbienceEventPlayed = now;
    this.unlock();
    let player = this.ambienceEventPlayers.get(sound);
    if (!player) {
      // 场景点声最短也相隔数秒，只需保留当前一条；按 sound 永久缓存四条会白占
      // 四个解码器名额，并和 8 句旁白 + BGM/环境叠成 16 条。
      this.releaseAmbienceEventPlayers(sound);
      if (!this.reserveNonVoiceMediaSlots(1)) return;
      const eventPlayer = media(SFX_FILES[sound]);
      eventPlayer.onerror = () => {
        if (this.ambienceEventPlayers.get(sound) !== eventPlayer) return;
        this.ambienceEventPlayers.delete(sound);
        this.ambienceEventLevels.delete(eventPlayer);
        fallbackRuntimeErrorCount += 1;
        this.releaseMediaPlayer(eventPlayer);
      };
      this.ambienceEventPlayers.set(sound, eventPlayer);
      player = eventPlayer;
    }
    if (!player.paused) player.pause();
    if (player.currentTime !== 0) {
      player.currentTime = 0;
      probeSeek();
    }
    const level = Math.max(0.04, Math.min(0.28, intensity * 0.22));
    this.ambienceEventLevels.set(player, level);
    player.volume = level * this.volume * this.ambienceVolume
      * (this.voiceDuckingActive() ? VOICE_AMBIENCE_DUCK : 1);
    player.playbackRate = 0.98 + Math.random() * 0.04;
    probePlay(`ambience-${sound}`);
    const task = playMediaWithDeadline(player);
    const generation = mediaPlayGeneration.get(player) ?? 0;
    void task.catch(() => {
      if (mediaPlayGeneration.get(player) !== generation || !player.paused) return;
      if (this.ambienceEventPlayers.get(sound) !== player) return;
      this.ambienceEventPlayers.delete(sound);
      this.ambienceEventLevels.delete(player);
      fallbackRuntimeErrorCount += 1;
      this.releaseMediaPlayer(player);
    });
  }

  setAmbience(stage?: number): void {
    const next = stage === undefined
      ? undefined
      : Math.max(0, Math.min(AMBIENCE_FILES.length - 1, Math.floor(stage)));
    if (next !== this.requestedAmbience) this.ambienceStartFailures = 0;
    this.requestedAmbience = next;
    if (this.requestedAmbience === undefined) {
      this.stopAmbience(true);
      return;
    }
    this.unlock();
    this.syncAmbience();
  }

  setMusic(track?: number): void {
    const next = track === undefined
      ? undefined
      : Math.max(0, Math.min(MUSIC_FILES.length - 1, Math.floor(track)));
    if (next !== this.requestedMusic) this.musicStartFailures = 0;
    this.requestedMusic = next;
    if (this.requestedMusic === undefined) {
      this.stopMusic(true);
      return;
    }
    this.unlock();
    this.syncMusic();
  }

  setMusicTension(active: boolean): void {
    if (active !== this.musicTension) this.tensionStartFailures = 0;
    this.musicTension = active;
    if (!active) {
      this.stopMusicTension();
      return;
    }
    this.unlock();
    this.syncMusicTension();
  }

  /**
   * 预热必须服从元素池上限。每章的预载表有 14–21 条，六章累计约 99 个元素——
   * 这正是「攒到后面全局没声音」的来源。超过上限地热只会自己挤自己，还白白多做
   * 一轮建元素、释放元素的开销，所以这里直接截到上限：排在前面的是本章最早用到的。
   * 8 格人声 + 环境/BGM/替补/紧张层 4 格，保守上界正好是 12。
   *
   * 同时借道「复活」：本方法有一次调用发生在标题页点「开始呼吸」的手势调用栈里
   * （startRun → preloadVoices），正是给启动期元素解毒的唯一窗口，见 reviveVoice。
   */
  preloadVoices(ids: readonly VoiceCueId[]): void {
    this.unlock();
    // 预载表按“最早开口 → 最晚开口”排列，而 LRU 从 Map 队首淘汰；倒序插入让
    // 最早的台词留在队尾。Web Audio 不可用、元素音效来抢席时，先丢较晚的句子。
    const selected = ids.slice(0, this.voicePlayerBudget());
    for (let index = selected.length - 1; index >= 0; index -= 1) {
      this.reviveVoice(this.ensureVoice(selected[index]!));
    }
  }

  /**
   * 给「启动阶段建出来的人声元素」解毒。真机上开场漫画整段没旁白、而出生档案起
   * 一切正常的分界线，就是元素诞生在第一次用户手势之前还是之后：装帧期风暴里
   * 装载失败的元素 error 会被锁存，部分 WebView 还会拒绝为「无手势期」元素的后续
   * play()。两种毒都能在一次真实手势里洗掉——error 的重新 load()，全部试着无声
   * 开嗓（muted play 后立即 pause 归零）。桌面上元素早就 ready，这里等于空转。
   */
  /** 已开嗓的元素：开嗓一次管一辈子，换章预热不再反复整池 play/pause。 */
  private readonly blessedVoices = new WeakSet<HTMLAudioElement>();

  private reviveVoice(player: HTMLAudioElement): void {
    if (player === this.activeVoice || !player.paused) return;
    if (this.queuedVoices.some((entry) => this.voicePlayers.get(entry.id) === player)) return;
    if (player.error) {
      try { player.load(); } catch { return; }
    } else if (this.blessedVoices.has(player) && player.readyState > 0) {
      return; // 健康且已开嗓：什么都不用做
    }
    // 静音必须用 muted 而不是 volume=0：iOS 的 volume 是只读属性，赋 0 被静默忽略、
    // 照样满音量出声——整池开嗓就成了好几句旁白同时炸出来（真机上的「旁白打架」）。
    player.muted = true;
    void playMediaWithDeadline(player).then(() => {
      if (player !== this.activeVoice) {
        player.pause();
        try { if (player.currentTime !== 0) player.currentTime = 0; } catch { /* seek 失败无碍 */ }
      }
      player.muted = false;
      // 切章很快时，这个无声开嗓可能还没落定，播放器就已被硬上限淘汰。
      // 迟到的 Promise 只负责把自己停干净，不能再把已释放元素记成可复用席位。
      if (![...this.voicePlayers.values()].includes(player)) return;
      this.blessedVoices.add(player);
      voiceReviveCount += 1;
    }).catch(() => {
      player.muted = false;
    });
  }

  /** 「资源预载」的音频温启动进度（见 startAudioWarm）。 */
  private audioWarmDone = 0;
  private audioWarmTotal = 0;
  private audioWarmRunning = false;
  private audioWarmToken = 0;
  /** stopAudioWarm 必须真取消当前 load，而不只是让下一轮循环看见 token 变化。 */
  private audioWarmAbortController?: AbortController;
  /** 无手势自动温启动被 WebView 拒绝过：下一次真实手势里重试一次（见 startAudioWarm）。 */
  private audioWarmBailedWithoutGesture = false;

  audioWarmStatus(): { done: number; total: number; running: boolean } {
    return { done: this.audioWarmDone, total: this.audioWarmTotal, running: this.audioWarmRunning };
  }

  /**
   * 温启动要摸的文件总数（静态已知）。标题页进度条必须一开始就按这个总量合并计算：
   * 之前是「点了按钮 total 才从 0 变 113」，进度百分比在点击瞬间从 100% 跌回 60%，
   * 评委看到的就是「明明显示加载好了」——显示的只是美术那一半。
   */
  audioWarmPlannedTotal(): number {
    return audioWarmFiles().length;
  }

  audioWarmAutoBailed(): boolean {
    return this.audioWarmBailedWithoutGesture;
  }

  /**
   * 串行温启动全部音频：一次只开一个临时元素，缓冲到能起播（readyState≥2）就
   * 立刻释放换下一个。目的不是把 100 多个文件驻留在内存——解码器名额只有十几个，
   * 那是当初「整局没旁白」的事故根源——而是让设备的文件缓存与解复用管线逐个
   * 被摸过一遍，正式播放时起播更快。任意时刻只多占一个媒体名额。
   * 平台若拒绝无播放的冷缓冲（连续 4 个文件毫无进展），诚实作罢，不刷假进度。
   */
  startAudioWarm(auto = false): void {
    if (this.audioWarmRunning) return;
    // 防御旧任务尚未从微任务尾部退出的窗口；abort 会同步释放它的临时媒体元素。
    this.audioWarmAbortController?.abort();
    const abortController = new AbortController();
    this.audioWarmAbortController = abortController;
    this.audioWarmBailedWithoutGesture = false;
    const files = audioWarmFiles();
    this.audioWarmTotal = files.length;
    this.audioWarmDone = 0;
    this.audioWarmRunning = true;
    const token = ++this.audioWarmToken;
    void (async () => {
      let coldMisses = 0;
      let processed = 0;
      // 总预算：单文件 700ms × 113 个的最坏情况是 79 秒，玩家不会等那么久。
      // 40 秒到点就诚实收尾——已摸过的那些照样受益，没摸到的按原路径懒加载。
      const deadline = performance.now() + 40_000;
      for (const file of files) {
        if (token !== this.audioWarmToken) break;
        if (performance.now() > deadline) {
          this.audioWarmDone = this.audioWarmTotal;
          break;
        }
        // 每 6 个让一帧：标题页的呼吸动画和按钮进度条要保持顺滑，
        // 建元素/load() 这些同步调用连着做会把主线程占出可见的顿。
        if (processed % 6 === 5) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        processed += 1;
        const warmed = await touchMediaFile(file, 700, abortController.signal);
        if (token !== this.audioWarmToken) break;
        this.audioWarmDone += 1;
        // 连续摸空才计数；中间只要成功一个就清零——偶发的单文件超时不该
        // 被误判成「这台机器不给冷缓冲」而提前收工。
        coldMisses = warmed ? 0 : coldMisses + 1;
        if (coldMisses >= 4) {
          if (auto) {
            // 自动温启动跑在任何用户手势之前，部分 WebView 此时拒绝冷缓冲。
            // 诚实归零（绝不能伪造「已就绪」——评委那次「显示加载好了、点开始却卡住」
            // 正是假进度的代价），并记账：下一次真实手势里重试一遍。
            this.audioWarmDone = 0;
            this.audioWarmBailedWithoutGesture = true;
          } else {
            // 手势之后仍摸不动：这台 WebView 不给无播放的冷缓冲，剩下的等实际
            // 播放时现场装（文件在本地包内，代价是起播晚半拍，不是卡死）。
            this.audioWarmDone = this.audioWarmTotal;
          }
          break;
        }
      }
      if (token === this.audioWarmToken) {
        this.audioWarmRunning = false;
        if (this.audioWarmAbortController === abortController) {
          this.audioWarmAbortController = undefined;
        }
      }
    })();
  }

  stopAudioWarm(): void {
    this.audioWarmToken += 1;
    this.audioWarmAbortController?.abort();
    this.audioWarmAbortController = undefined;
    this.audioWarmRunning = false;
    // 新一局/退出标题时也要掐掉旧章节的后台预热。它若继续占着一个解码器，
    // 会和开场 8 句旁白 + 环境/BGM/替补/紧张层叠到 13，刚好撞穿保守媒体池。
    this.stageAudioWarmGeneration += 1;
    this.stageAudioWarmAbortController?.abort();
    this.stageAudioWarmAbortController = undefined;
    this.stageAudioWarmTasks.clear();
  }

  /** 每章音频预热已摸过的文件：跨章去重，别把同一份环境床反复摸。 */
  private readonly stageAudioWarmed = new Set<string>();
  /** 章节预热只准一条媒体管线；同章重入共享任务，不并开五条临时解码流。 */
  private stageAudioWarmTail: Promise<void> = Promise.resolve();
  private readonly stageAudioWarmTasks = new Map<number, Promise<void>>();
  private stageAudioWarmGeneration = 0;
  private stageAudioWarmAbortController?: AbortController;

  /**
   * 章节音频预热：把某一章开打要用的环境床、战斗配乐与紧张层提前摸到可起播。
   * 全程走临时元素（touchMediaFile），不碰正在播的池子；单文件 1.5 秒、总预算
   * 5 秒双层超时——这是预热不是闸门，载不动就让路，起播路径自己兜底。
   * 人声不在这里热：人声池有硬上限（VOICE_PLAYER_BUDGET），提前热下一章会把
   * 本章正在用的席位挤掉，那正是「整局没旁白」的旧事故；人声仍走
   * startStage → preloadVoices 的既有节奏。
   */
  warmupStageAudio(stageIndex: number): Promise<void> {
    const stage = Math.max(0, Math.min(AMBIENCE_FILES.length - 1, Math.trunc(stageIndex)));
    const existing = this.stageAudioWarmTasks.get(stage);
    if (existing) return existing;
    const generation = this.stageAudioWarmGeneration;
    const run = async (): Promise<void> => {
      if (generation !== this.stageAudioWarmGeneration) return;
      const abortController = new AbortController();
      this.stageAudioWarmAbortController = abortController;
      try {
        const track = Math.max(0, Math.min(MUSIC_FILES.length - 1, stage + 1));
        // 到真正取得单通道执行权时再过滤；排在前面的章节可能已把共用紧张层摸热。
        const files = [AMBIENCE_FILES[stage]!, MUSIC_FILES[track]!, MUSIC_TENSION_FILE]
          .filter((file) => !this.stageAudioWarmed.has(file));
        const deadline = performance.now() + 5000;
        for (const file of files) {
          if (generation !== this.stageAudioWarmGeneration || abortController.signal.aborted) break;
          // 预热是可选优化，不能为了它撞穿媒体池，更不能挤掉本章即将开口的人声。
          // 当前真实播放与缓存已占满就让路，由正式起播路径自行加载。
          if (this.voicePlayers.size + this.nonVoiceMediaPlayerCount() + 1
            > PLATFORM_MEDIA_PLAYER_BUDGET) break;
          const remaining = deadline - performance.now();
          if (remaining <= 0) break;
          const warmed = await touchMediaFile(
            file,
            Math.min(1500, remaining),
            abortController.signal,
          );
          if (generation !== this.stageAudioWarmGeneration || abortController.signal.aborted) break;
          if (warmed) this.stageAudioWarmed.add(file);
        }
      } finally {
        if (this.stageAudioWarmAbortController === abortController) {
          this.stageAudioWarmAbortController = undefined;
        }
      }
    };
    // 前一项即使被宿主异常打断，也不能把整条预热线永久锁死。
    const task = this.stageAudioWarmTail.then(run, run);
    this.stageAudioWarmTail = task.catch(() => undefined);
    this.stageAudioWarmTasks.set(stage, task);
    const clear = (): void => {
      if (this.stageAudioWarmTasks.get(stage) === task) this.stageAudioWarmTasks.delete(stage);
    };
    void task.then(clear, clear);
    return task;
  }

  /**
   * 这条人声是否已经缓冲到可以从头连着播。
   *
   * 启动时的 warmup 跑在任何用户手势之前，移动 WebView 在那之前根本不会真的去
   * 缓冲——canplaythrough 等不到、超时放行，漫画于是在没数据的情况下开播，
   * 表现就是"前几句没有旁白，过一会儿才有声"。开播前用它兜一道。
   * readyState 3 = HAVE_FUTURE_DATA，够起播了；不必等到 4。
   */
  /**
   * 字幕对表用：这条 cue 正是当前在播的人声时，返回播放头位置（音频文件内秒数），
   * 否则 null。currentTime 量的是文件位置，与 playbackRate 无关，可直接对时间表。
   */
  voicePosition(id: VoiceCueId): number | null {
    const player = this.voicePlayers.get(id);
    if (!player || player !== this.activeVoice || player.paused) return null;
    return player.currentTime;
  }

  voiceBuffered(id: VoiceCueId): boolean {
    // 静音时没有可等的东西；error 锁存时等也白等（播放路径自会重装重试）。
    if (this.volume <= 0 || this.voiceVolume <= 0) return true;
    const player = this.voicePlayers.get(id);
    if (!player) return false;
    if (player.error) return true;
    return player.readyState >= 3;
  }

  /**
   * 进场前把「开局那一段」真正听得到的音频全部缓冲完。
   *
   * 为什么必须等：平台包的人声/环境/配乐走 HTMLAudioElement，第一次起播要现场
   * 读包 + 申请解码器 + 解码——抖音 WebView 的编解码器是有限资源池，这笔开销落在
   * 开场漫画正在打字机推进的那几秒里，就是评委看到的「一进去很卡，等一会儿才顺」。
   * preload='auto' 只是「建议」，不等于就绪，所以这里等到 canplaythrough。
   *
   * 分批而不是一次性全开：同时唤起十几个媒体元素本身就会卡住主线程一下。
   * 每个文件都有独立超时、整体也有预算——载不动绝不能把玩家永远关在加载页外。
   */
  async warmup(
    voiceIds: readonly VoiceCueId[],
    onProgress?: (done: number, total: number) => void,
    budgetMs = 60000,
  ): Promise<void> {
    // 元素数量必须有上限：手机 WebView 能同时持有的媒体元素/解码器名额只有十几个量级，
    // 一次建 100+ 个之后所有 play() 会静默失败（0729-31 真机整局无旁白，就是这么来的）。
    // 只热开场要用的人声，加首章环境音与配乐各一份；后面各章仍走 startStage 逐章加载。
    const selectedVoiceIds = voiceIds.slice(0, this.voicePlayerBudget()).reverse();
    const elements: HTMLAudioElement[] = [
      ...selectedVoiceIds.map((id) => this.ensureVoice(id)),
      this.ensureAmbience(0),
      this.ensureMusic(0),
    ];
    const deadline = performance.now() + budgetMs;
    let done = 0;
    onProgress?.(0, elements.length);
    const ready = (element: HTMLAudioElement): Promise<void> => new Promise((resolve) => {
      // readyState 4 = HAVE_ENOUGH_DATA：已经可以从头播到尾不断流。
      if (element.readyState >= 4) { resolve(); return; }
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        element.removeEventListener('canplaythrough', finish);
        element.removeEventListener('loadeddata', onData);
        element.removeEventListener('error', finish);
        window.clearTimeout(timer);
        resolve();
      };
      // 部分 WebView 对短音频不发 canplaythrough，loadeddata 已经够用。
      const onData = (): void => { if (element.readyState >= 3) finish(); };
      const remaining = Math.max(1200, deadline - performance.now());
      const timer = window.setTimeout(finish, Math.min(6000, remaining));
      element.addEventListener('canplaythrough', finish);
      element.addEventListener('loadeddata', onData);
      element.addEventListener('error', finish);
      try { element.load(); } catch { finish(); }
    });
    for (let index = 0; index < elements.length; index += 3) {
      if (performance.now() >= deadline) break;
      await Promise.all(elements.slice(index, index + 3).map(async (element) => {
        await ready(element);
        done += 1;
        onProgress?.(done, elements.length);
      }));
    }
    onProgress?.(elements.length, elements.length);
  }

  playVoice(id: VoiceCueId, treatment?: VoiceTreatment): void {
    const cue = VOICE_CUES[id];
    const now = performance.now();
    if (now - (this.lastVoicePlayed.get(id) ?? -Infinity) < cue.cooldownMs
      || this.volume <= 0
      || this.voiceVolume <= 0) {
      if (this.volume <= 0 || this.voiceVolume <= 0) probeSkippedMuted();
      return;
    }
    this.unlock();
    if (this.activeVoicePriority > 0 && !cue.trigger.interrupt) {
      this.enqueueVoice(id, treatment);
      return;
    }
    if (this.activeVoicePriority > 0) this.cancelCurrentVoice();

    this.lastVoicePlayed.set(id, now);
    const serial = ++this.voiceRequestSerial;
    const player = this.ensureVoice(id);
    const filter = sfxEngine.elementFilter(player);
    if (filter) configureVoiceFilter(filter, treatment ?? cue.treatment);
    // 给 HTMLAudioElement 赋 currentTime 是一次真 seek：移动 WebView 会冲刷解码缓冲、
    // 重定位解复用器、重新申请解码器。开场漫画连播八句，等于在打字机推进时连做八次
    // 管线重建——音效路径早就避开了这条，人声路径一直没有。已经停在 0 的元素不必再动。
    if (!player.paused) player.pause();
    if (player.currentTime !== 0) player.currentTime = 0;
    // 开嗓流程用 muted 静音；正式起播前必须确保它已复位，否则整句无声。
    player.muted = false;
    player.playbackRate = voicePlaybackRate(id, treatment);
    this.activeVoiceBaseVolume = cue.volume;
    this.activeVoice = player;
    this.activeVoicePriority = cue.trigger.priority;
    this.refreshActiveVolumes();
    let startedAudibly = false;
    const markStarted = (): void => {
      if (serial !== this.voiceRequestSerial || this.activeVoice !== player) return;
      startedAudibly = true;
      // activeVoice 在 play() 前就入席；只有媒体真正进入 playing 后才允许压低背景。
      this.refreshActiveVolumes();
    };
    const abandonVoice = (): void => {
      if (serial !== this.voiceRequestSerial || this.activeVoice !== player) return;
      this.voiceRequestSerial += 1;
      this.lastVoicePlayed.delete(id);
      this.activeVoice = undefined;
      this.activeVoiceBaseVolume = 0;
      this.activeVoicePriority = 0;
      player.onended = null;
      player.onerror = null;
      player.onpause = null;
      player.onplaying = null;
      if (this.voicePlayers.get(id) === player) this.voicePlayers.delete(id);
      this.releaseMediaPlayer(player);
      voiceRejectCount += 1;
      this.refreshActiveVolumes();
      // 暂停页内只清理坏播放器，不偷偷播放候补；玩家解除暂停时再正常出列。
      if (!this.voiceSuspendedByGame) this.playQueuedVoice();
    };
    player.onpause = () => {
      if (serial === this.voiceRequestSerial && this.activeVoice === player) {
        // 宿主只暂停人声而循环轨仍在播时，应立即解除背景闪避。
        this.refreshActiveVolumes();
      }
    };
    player.onplaying = markStarted;
    player.onerror = () => {
      // 首次装载错误仍交给下面两级 load/play 自愈；已经真正开口后再报错，则 ended
      // 不会到达，必须释放主持权和被毒化的媒体元素，否则候补旁白会永久堵死。
      if (!startedAudibly) return;
      voiceRuntimeErrorCount += 1;
      abandonVoice();
    };
    player.onended = () => {
      if (this.activeVoice !== player || serial !== this.voiceRequestSerial) return;
      player.onerror = null;
      player.onpause = null;
      player.onplaying = null;
      this.activeVoice = undefined;
      this.activeVoiceBaseVolume = 0;
      this.activeVoicePriority = 0;
      this.refreshActiveVolumes();
      this.playQueuedVoice();
    };
    void playMediaWithDeadline(player).then(() => {
      if (serial !== this.voiceRequestSerial
        || this.activeVoice !== player
        || this.voiceSuspendedByGame) player.pause();
      else markStarted();
    }).catch(() => {
      if (serial !== this.voiceRequestSerial) return;
      // 玩家/后台暂停期间保留当前播放头，不能 load() 把它洗回零点；解除暂停时
      // resumeActiveVoice 会从原位置继续，并重新获得自己的起播截止线。
      if (this.voiceSuspendedByGame) return;
      // 两级自愈：启动风暴里装载失败的元素 error 被锁存，play() 会一直拒；
      // load() 重置装载后大多能活。300ms 一试，1200ms 再试（慢速缓冲需要时间），
      // 仍失败才放弃——并清掉这条的冷却戳，让后续游戏触发还有机会补一次。
      try { player.load(); } catch { /* 重装失败则直接走放弃分支 */ }
      const giveUp = (): void => {
        if (serial !== this.voiceRequestSerial || this.voiceSuspendedByGame) return;
        abandonVoice();
      };
      window.setTimeout(() => {
        if (serial !== this.voiceRequestSerial || this.voiceSuspendedByGame) return;
        void playMediaWithDeadline(player).then(() => {
          if (this.voiceSuspendedByGame) player.pause();
          else {
            markStarted();
            voiceHealCount += 1;
          }
        }).catch(() => {
          if (serial !== this.voiceRequestSerial || this.voiceSuspendedByGame) return;
          window.setTimeout(() => {
            if (serial !== this.voiceRequestSerial || this.voiceSuspendedByGame) return;
            void playMediaWithDeadline(player).then(() => {
              if (this.voiceSuspendedByGame) player.pause();
              else {
                markStarted();
                voiceHealCount += 1;
              }
            }).catch(giveUp);
          }, 1200);
        });
      }, 300);
    });
  }

  /** 暂停菜单/自动暂停：保留主持权、候补席与播放头，避免恢复后字幕有字却没声。 */
  pauseVoice(): void {
    this.voiceSuspendedByGame = true;
    const player = this.activeVoice;
    if (player && !player.paused) player.pause();
    this.refreshActiveVolumes();
  }

  /** 只恢复由游戏暂停挂起的旁白；显式 stopVoice() 过的旧句绝不会复活。 */
  resumeVoice(): void {
    if (!this.voiceSuspendedByGame) return;
    this.voiceSuspendedByGame = false;
    this.refreshActiveVolumes();
    if (this.activeVoice) this.resumeActiveVoice();
    else this.playQueuedVoice();
  }

  stopVoice(): void {
    this.voiceSuspendedByGame = false;
    this.queuedVoices.length = 0;
    this.cancelCurrentVoice();
  }

  /** 退媒体席位时连同淡化令牌的强引用一起删；否则每次换曲都会永久留一个旧元素。 */
  private releaseMediaPlayer(player: HTMLAudioElement): void {
    this.fadeTokens.delete(player);
    releaseMedia(player);
  }

  private releaseSfxPool(sound: LifeSound): void {
    const pool = this.sfxPools.get(sound);
    if (!pool) return;
    this.sfxPools.delete(sound);
    for (const player of pool) this.releaseMediaPlayer(player);
  }

  private releaseAllSfxPools(): void {
    for (const sound of [...this.sfxPools.keys()]) this.releaseSfxPool(sound);
  }

  private fallbackSfxPlayerCount(): number {
    let count = 0;
    for (const pool of this.sfxPools.values()) count += pool.length;
    return count;
  }

  private evictSfxPools(targetPlayers: number): void {
    let count = this.fallbackSfxPlayerCount();
    for (const sound of [...this.sfxPools.keys()]) {
      if (count <= targetPlayers) break;
      const size = this.sfxPools.get(sound)?.length ?? 0;
      this.releaseSfxPool(sound);
      count -= size;
    }
  }

  private releaseAmbienceEventPlayers(keep?: LifeSound): void {
    for (const [sound, player] of [...this.ambienceEventPlayers]) {
      if (sound === keep) continue;
      this.ambienceEventPlayers.delete(sound);
      this.ambienceEventLevels.delete(player);
      this.releaseMediaPlayer(player);
    }
  }

  /** 当前所有非旁白常驻媒体去重计数；用于与旁白共享十二席硬预算。 */
  private nonVoiceMediaPlayerCount(): number {
    const players = new Set<HTMLAudioElement>();
    for (const pool of this.sfxPools.values()) for (const player of pool) players.add(player);
    for (const player of this.ambienceEventPlayers.values()) players.add(player);
    for (const player of this.ambiencePlayers.values()) players.add(player);
    for (const player of this.musicPlayers.values()) players.add(player);
    if (this.musicTwin) players.add(this.musicTwin);
    if (this.tensionPlayer) players.add(this.tensionPlayer);
    return [...players].filter((player) => player.hasAttribute('src')).length;
  }

  /** 非旁白多占一席，旁白 LRU 就少留一席；活动旁白始终至少保留。 */
  private voicePlayerBudget(extraNonVoice = 0): number {
    return Math.max(1, Math.min(
      VOICE_PLAYER_BUDGET,
      PLATFORM_MEDIA_PLAYER_BUDGET - this.nonVoiceMediaPlayerCount() - extraNonVoice,
    ));
  }

  /** 为可选非旁白媒体腾席；活动旁白不能被截断，腾不出时调用方应放弃可选播放。 */
  private reserveNonVoiceMediaSlots(count: number): boolean {
    const availableForVoices = PLATFORM_MEDIA_PLAYER_BUDGET
      - this.nonVoiceMediaPlayerCount()
      - count;
    const target = Math.max(this.activeVoice ? 1 : 0, Math.min(VOICE_PLAYER_BUDGET, availableForVoices));
    this.evictVoicePlayers(target);
    return this.voicePlayers.size + this.nonVoiceMediaPlayerCount() + count
      <= PLATFORM_MEDIA_PLAYER_BUDGET;
  }

  /** 环境/BGM 属于主混音；极端时先丢可重建的元素音效和点声，也不能让主轨创建失败。 */
  private reserveEssentialMediaSlot(): void {
    if (this.reserveNonVoiceMediaSlots(1)) return;
    this.releaseAllSfxPools();
    this.releaseAmbienceEventPlayers();
    this.reserveNonVoiceMediaSlots(1);
  }

  private ensureSfxPool(sound: LifeSound): HTMLAudioElement[] {
    const cached = this.sfxPools.get(sound);
    if (cached && cached.every((player) => !player.error)) {
      // 命中刷新 LRU；Map 队首永远是最久没用的池。
      this.sfxPools.delete(sound);
      this.sfxPools.set(sound, cached);
      return cached;
    }
    if (cached) this.releaseSfxPool(sound);
    const size = sound === 'hit' || sound === 'breath' ? 4 : 2;
    this.evictSfxPools(FALLBACK_SFX_PLAYER_BUDGET - size);
    if (!this.reserveNonVoiceMediaSlots(size)) return [];
    const pool = Array.from({ length: size }, () => media(SFX_FILES[sound]));
    for (const player of pool) {
      player.onerror = () => {
        if (!this.sfxPools.get(sound)?.includes(player)) return;
        fallbackRuntimeErrorCount += 1;
        // 同一池中的其它元素可能共享宿主解码状态；整池释放，下一次触发再干净重建。
        this.releaseSfxPool(sound);
      };
    }
    this.sfxPools.set(sound, pool);
    return pool;
  }

  /**
   * 人声元素缓存必须封顶并真正释放。
   *
   * 全局有 90 多条人声，原先 ensureVoice 只有 get/set、从不淘汰：打到中后期就攒出
   * 上百个挂着 src 的 <audio>，超过 WebView 的解码器名额之后所有 play() 静默失败
   * （0729-31 真机整局无旁白）。把上限压到「开场漫画八句 + 环境 + 配乐」还留有余量的
   * 量级，用 Map 的插入序当 LRU：命中挪到队尾，超了从队头挑没在播的释放。
   */
  private evictVoicePlayers(target: number): void {
    if (this.voicePlayers.size <= target) return;
    for (const [id, player] of [...this.voicePlayers]) {
      if (this.voicePlayers.size <= target) break;
      // 只有当前真正听得到的旁白不能被抽走。其余 !paused 元素只是 preloadVoices
      // 发起的 muted 开嗓；如果也跳过，连续切章时异步开嗓尚未落定，池会从 8 瞬时
      // 膨胀到十几个并撞穿 WebView 解码器上限。排队项只保存 id，轮到时可重新创建。
      if (player === this.activeVoice) continue;
      this.voicePlayers.delete(id);
      this.releaseMediaPlayer(player);
    }
  }

  private ensureVoice(id: VoiceCueId): HTMLAudioElement {
    const cached = this.voicePlayers.get(id);
    if (cached && !cached.error) {
      // 命中即刷新 LRU 次序（Map 靠插入序，delete + set 等于挪到队尾）
      this.voicePlayers.delete(id);
      this.voicePlayers.set(id, cached);
      return cached;
    }
    if (cached) {
      // error 被锁存的元素留着只会一直拒播：真正释放掉，换个新的重来。
      // 唯一例外是它正是当前 activeVoice（播到一半出错）：release 会摘掉 onended，
      // activeVoicePriority 从此卡死>0，之后所有非打断台词全部进候补席再也轮不上。
      // 正在播的交给 playVoice 的两级自愈去收拾，这里绝不动它。
      if (cached === this.activeVoice) return cached;
      this.voicePlayers.delete(id);
      this.releaseMediaPlayer(cached);
    }
    this.evictVoicePlayers(this.voicePlayerBudget() - 1);
    const player = media(VOICE_CUES[id].playbackFile ?? VOICE_CUES[id].file);
    this.voicePlayers.set(id, player);
    return player;
  }

  /**
   * 环境音一次只可能听得到一份，配乐同理。六章打下来原先会攒满 6 份环境 + 11 首配乐，
   * 白占 17 个解码器名额。换章时把不在播的旧的还回去，常驻量压到各一份。
   */
  private releaseIdleAmbience(keep: number): void {
    for (const [stage, player] of [...this.ambiencePlayers]) {
      if (stage === keep || !player.paused) continue;
      this.ambiencePlayers.delete(stage);
      this.releaseMediaPlayer(player);
    }
  }

  private releaseIdleMusic(keep: number): void {
    for (const [track, player] of [...this.musicPlayers]) {
      if (track === keep || !player.paused) continue;
      this.musicPlayers.delete(track);
      this.releaseMediaPlayer(player);
    }
  }

  /** 活动环境床中途损坏时，释放被宿主锁死的元素并按请求重建；不复用 poisoned src。 */
  private recoverAmbienceMediaError(player: HTMLAudioElement, stage: number): void {
    const wasActive = this.activeAmbience === player && this.activeAmbienceStage === stage;
    if (this.ambiencePlayers.get(stage) === player) this.ambiencePlayers.delete(stage);
    if (wasActive) {
      this.activeAmbience = undefined;
      this.activeAmbienceStage = undefined;
      this.ambienceStartFailures = 0;
    }
    ambienceRuntimeErrorCount += 1;
    this.releaseMediaPlayer(player);
    if (wasActive
      && this.requestedAmbience === stage
      && !document.hidden
      && this.volume > 0
      && this.ambienceVolume > 0) this.syncAmbience();
  }

  /**
   * 主 BGM 中途损坏时，旧主、替补和交叉淡化引用必须一起清空。只换 active 指针会
   * 让坏元素继续留在 musicPlayers，下一次 sync 又把它取出来，最终整局永久静音。
   */
  private recoverMusicMediaError(player: HTMLAudioElement, track: number): void {
    if (this.activeMusic !== player) {
      if (this.musicTwin === player) {
        this.musicCrossSerial += 1;
        this.musicTwin = undefined;
        this.musicTwinTrack = undefined;
        musicRuntimeErrorCount += 1;
        this.releaseMediaPlayer(player);
        if (this.activeMusicTrack === track && !document.hidden) this.scheduleMusicTwinArm(track);
        return;
      }
      if (this.musicPlayers.get(track) === player) this.musicPlayers.delete(track);
      musicRuntimeErrorCount += 1;
      this.releaseMediaPlayer(player);
      return;
    }

    this.musicCrossSerial += 1;
    if (this.musicTwinArmTimer !== null) {
      window.clearTimeout(this.musicTwinArmTimer);
      this.musicTwinArmTimer = null;
    }
    const doomed = new Set<HTMLAudioElement>(this.musicPlayers.values());
    doomed.add(player);
    if (this.musicTwin) doomed.add(this.musicTwin);
    if (this.musicCross) {
      doomed.add(this.musicCross.from);
      doomed.add(this.musicCross.to);
    }
    this.musicPlayers.clear();
    this.activeMusic = undefined;
    this.activeMusicTrack = undefined;
    this.musicTwin = undefined;
    this.musicTwinTrack = undefined;
    this.musicCross = undefined;
    this.musicStartFailures = 0;
    musicRuntimeErrorCount += 1;
    for (const element of doomed) this.releaseMediaPlayer(element);
    if (this.requestedMusic === track
      && !document.hidden
      && this.volume > 0
      && this.musicVolume > 0) this.syncMusic();
  }

  /** 紧张层与 BGM 请求分开保存；坏元素退池后仅在仍需要时重建。 */
  private recoverTensionMediaError(player: HTMLAudioElement): void {
    const wasActive = this.activeTension === player;
    if (wasActive) this.activeTension = undefined;
    if (this.tensionPlayer === player) this.tensionPlayer = undefined;
    this.tensionStartFailures = 0;
    tensionRuntimeErrorCount += 1;
    this.releaseMediaPlayer(player);
    if (wasActive
      && this.musicTension
      && !document.hidden
      && this.volume > 0
      && this.musicVolume > 0) this.syncMusicTension();
  }

  /**
   * 曲目切换只允许「上一首 + 新一首」同时存在。若玩家或剧情在 2.1 秒淡出尚未
   * 结束前再次切歌，更早的曲子已经没有叙事作用，继续播放只会叠成第三、第四层。
   */
  private releaseObsoleteMusicPlayers(keep: ReadonlySet<HTMLAudioElement>): void {
    for (const [track, player] of [...this.musicPlayers]) {
      if (keep.has(player)) continue;
      this.musicPlayers.delete(track);
      this.cancelFade(player);
      player.pause();
      try { player.currentTime = 0; } catch { /* 未就绪无碍 */ }
      this.releaseMediaPlayer(player);
    }
  }

  /**
   * 曲目交叉淡出结束后，把已经没有任何播放身份的旧主轨真正退池。
   *
   * 只 pause/currentTime=0 仍会让元素带着 src 和 Web Audio 图，占掉一个 WebView
   * 解码器名额。回调可能在快速切歌后迟到，因此必须逐一确认它没有重新成为主轨、
   * 循环替补或同曲换岗成员；若它已被重新启用，cancelFade 的代次也会先拦住回调。
   */
  private releaseFadedMusicPlayer(player: HTMLAudioElement): void {
    if (player === this.activeMusic
      || player === this.musicTwin
      || this.musicCross?.from === player
      || this.musicCross?.to === player) return;
    for (const [track, cached] of [...this.musicPlayers]) {
      if (cached === player) this.musicPlayers.delete(track);
    }
    this.releaseMediaPlayer(player);
  }

  private ensureAmbience(stage: number): HTMLAudioElement {
    const cached = this.ambiencePlayers.get(stage);
    if (cached && !cached.error) return cached;
    if (cached) {
      this.ambiencePlayers.delete(stage);
      this.releaseMediaPlayer(cached);
    }
    // syncAmbience 已暂停旧环境床；先释放再创建，避免换章瞬间多占一席。
    this.releaseIdleAmbience(stage);
    this.reserveEssentialMediaSlot();
    const player = media(AMBIENCE_FILES[stage]!);
    player.loop = true;
    player.onerror = () => this.recoverAmbienceMediaError(player, stage);
    this.ambiencePlayers.set(stage, player);
    return player;
  }

  private ensureMusic(track: number): HTMLAudioElement {
    // 换曲时立刻收掉上一首的循环替补和进行中的换岗：旧替补白占一个媒体名额，
    // 进行中的交叉淡化则会让两首歌打架 0.5 秒。
    if (this.musicTwinTrack !== undefined && this.musicTwinTrack !== track) {
      this.musicCrossSerial += 1;
      if (this.musicTwinArmTimer !== null) {
        window.clearTimeout(this.musicTwinArmTimer);
        this.musicTwinArmTimer = null;
      }
      if (this.musicCross) {
        this.musicCross.from.pause();
        this.musicCross = undefined;
      }
      if (this.musicTwin) this.releaseMediaPlayer(this.musicTwin);
      this.musicTwin = undefined;
      this.musicTwinTrack = undefined;
    }
    const cached = this.musicPlayers.get(track);
    if (cached && !cached.error) {
      this.releaseIdleMusic(track);
      return cached;
    }
    if (cached) {
      this.musicPlayers.delete(track);
      this.releaseMediaPlayer(cached);
    }
    this.reserveEssentialMediaSlot();
    const player = media(MUSIC_FILES[track]!);
    player.loop = true;
    player.onerror = () => this.recoverMusicMediaError(player, track);
    this.musicPlayers.set(track, player);
    this.loopStartByEl.set(player, musicCrossloopStart(track));
    this.releaseIdleMusic(track);
    return player;
  }

  private ensureMusicTension(): HTMLAudioElement {
    if (this.tensionPlayer && !this.tensionPlayer.error) return this.tensionPlayer;
    if (this.tensionPlayer) {
      const poisoned = this.tensionPlayer;
      this.tensionPlayer = undefined;
      if (this.activeTension === poisoned) this.activeTension = undefined;
      this.releaseMediaPlayer(poisoned);
    }
    this.reserveEssentialMediaSlot();
    const player = media(MUSIC_TENSION_FILE);
    player.loop = true;
    player.onerror = () => this.recoverTensionMediaError(player);
    this.tensionPlayer = player;
    return player;
  }

  private retryAmbienceStart(player: HTMLAudioElement, stage: number): void {
    // 旧阶段的迟到 reject 不能消耗新阶段的重试额度。
    if (this.requestedAmbience !== stage
      || this.activeAmbience !== player
      || this.ambiencePlayers.get(stage) !== player) return;
    const generation = mediaPlayGeneration.get(player) ?? 0;
    if (this.loopStartFailureGeneration.get(player) === generation) return;
    this.loopStartFailureGeneration.set(player, generation);
    this.ambienceStartFailures += 1;
    if (this.ambienceStartFailures > 2) {
      // 某些 WebView 对坏解码器只拒绝 play()，并不派发 error。继续保留同一元素，
      // 之后每次手势都只会重试这条毒管线。三次失败后真正退池；下一次用户手势
      // 会由 syncAmbience 新建元素，且不会在无手势环境里形成自动重建死循环。
      this.ambiencePlayers.delete(stage);
      this.activeAmbience = undefined;
      this.activeAmbienceStage = undefined;
      this.ambienceStartFailures = 0;
      ambienceStartRetireCount += 1;
      this.releaseMediaPlayer(player);
      return;
    }
    window.setTimeout(() => {
      if (this.requestedAmbience !== stage
        || this.ambiencePlayers.get(stage) !== player
        || this.activeAmbience !== player
        || !player.paused
        || this.volume <= 0
        || this.ambienceVolume <= 0) return;
      this.syncAmbience();
    }, 240 * this.ambienceStartFailures);
  }

  private retryMusicStart(player: HTMLAudioElement, track: number): void {
    // 切歌后旧曲迟到 reject 不得污染新曲的失败计数。
    if (this.requestedMusic !== track || this.musicPlayers.get(track) !== player) return;
    const generation = mediaPlayGeneration.get(player) ?? 0;
    if (this.loopStartFailureGeneration.get(player) === generation) return;
    this.loopStartFailureGeneration.set(player, generation);
    this.musicStartFailures += 1;
    if (this.musicStartFailures > 2) {
      this.musicCrossSerial += 1;
      if (this.musicTwinArmTimer !== null) {
        window.clearTimeout(this.musicTwinArmTimer);
        this.musicTwinArmTimer = null;
      }
      const doomed = new Set<HTMLAudioElement>(this.musicPlayers.values());
      if (this.musicTwin) doomed.add(this.musicTwin);
      if (this.musicCross) {
        doomed.add(this.musicCross.from);
        doomed.add(this.musicCross.to);
      }
      this.musicPlayers.clear();
      this.activeMusic = undefined;
      this.activeMusicTrack = undefined;
      this.musicTwin = undefined;
      this.musicTwinTrack = undefined;
      this.musicCross = undefined;
      this.musicStartFailures = 0;
      musicStartRetireCount += 1;
      for (const element of doomed) this.releaseMediaPlayer(element);
      return;
    }
    window.setTimeout(() => {
      if (this.requestedMusic !== track
        || this.musicPlayers.get(track) !== player
        || this.volume <= 0
        || this.musicVolume <= 0
        || (this.activeMusic && !this.activeMusic.paused)) return;
      this.syncMusic();
    }, 240 * this.musicStartFailures);
  }

  private retryTensionStart(player: HTMLAudioElement): void {
    if (!this.musicTension || this.tensionPlayer !== player) return;
    const generation = mediaPlayGeneration.get(player) ?? 0;
    if (this.loopStartFailureGeneration.get(player) === generation) return;
    this.loopStartFailureGeneration.set(player, generation);
    this.tensionStartFailures += 1;
    if (this.tensionStartFailures > 2) {
      if (this.activeTension === player) this.activeTension = undefined;
      this.tensionPlayer = undefined;
      this.tensionStartFailures = 0;
      tensionStartRetireCount += 1;
      this.releaseMediaPlayer(player);
      return;
    }
    window.setTimeout(() => {
      if (!this.musicTension
        || this.tensionPlayer !== player
        || this.volume <= 0
        || this.musicVolume <= 0
        || (this.activeTension && this.activeTension !== player)
        || !player.paused) return;
      this.syncMusicTension();
    }, 240 * this.tensionStartFailures);
  }

  private syncAmbience(): void {
    const stage = this.requestedAmbience;
    // 拉到 0 就把流停掉，而不是留着一条 volume=0 的循环流继续解码。
    if (this.ambienceVolume <= 0) {
      if (this.activeAmbience) this.stopAmbience(false);
      return;
    }
    if (stage === undefined || this.volume <= 0) return;
    if (stage === this.activeAmbienceStage) {
      // 只比阶段号会漏掉「元素被宿主暂停」这一种情况——WebView 在音频焦点变化
      // （例如新建 AudioContext、来电、切后台）时会 pause 媒体元素，而这里一旦
      // return，环境音就永久沉默。检测到暂停就原地续播，不要 seek 回 0。
      const current = this.activeAmbience;
      // 首次 setAmbience() 可能发生在 AudioContext.resume() 真正完成之前。那次
      // elementFilter() 会安全退回干声；后续任一用户手势都要在这里重试接图，
      // 否则 production 恰好最容易永远漏掉六章滤波，和 buffered 版听感走岔。
      if (current) this.applyAmbienceProfile(current, stage);
      if (current && current.paused) {
        void playMediaWithDeadline(current).then(() => {
          if (this.activeAmbience === current) this.ambienceStartFailures = 0;
          else current.pause();
        }).catch(() => this.retryAmbienceStart(current, stage));
      }
      return;
    }
    const previous = this.activeAmbience;
    if (previous) {
      previous.pause();
      previous.currentTime = 0;
    }
    const player = this.ensureAmbience(stage);
    this.applyAmbienceProfile(player, stage);
    player.currentTime = 0;
    this.activeAmbience = player;
    this.activeAmbienceStage = stage;
    void playMediaWithDeadline(player).then(() => {
      if (this.activeAmbience === player && this.activeAmbienceStage === stage) {
        this.ambienceStartFailures = 0;
      } else player.pause();
    }).catch(() => this.retryAmbienceStart(player, stage));
  }

  private stopAmbience(clearRequest: boolean): void {
    if (clearRequest) this.requestedAmbience = undefined;
    const player = this.activeAmbience;
    this.activeAmbience = undefined;
    this.activeAmbienceStage = undefined;
    if (!player) return;
    player.pause();
    player.currentTime = 0;
  }

  private syncMusic(): void {
    const track = this.requestedMusic;
    // 同 syncAmbience：拉到 0 就停流，不留 volume=0 的循环流继续解码。
    if (this.musicVolume <= 0) {
      this.stopMusic(false, true);
      return;
    }
    if (track === undefined || this.volume <= 0) return;
    if (track === this.activeMusicTrack && this.activeMusic) {
      sfxEngine.elementFilter(this.activeMusic);
      // 替补可能在后台报错，或仅被宿主拒绝 play() 而没有 error 事件。回到前台后
      // syncMusic 会走同曲快路；若不在这里补建，整局都会退回有接缝的原生 loop。
      // 已有定时器时不能反复重排，否则高频音效触发的 unlock 会让 1.2 秒永远到不了。
      if (!this.musicTwin && this.musicTwinArmTimer === null && !document.hidden) {
        this.scheduleMusicTwinArm(track);
      }
      // 同一曲目：在播就什么都不做；被宿主暂停就原地续播。绝不能走下面的重建流程，
      // 那里第一句 currentTime = 0 会把曲子拉回开头——unlock() 每次播音效都会调到
      // 这里，于是配乐每打一下就从头开始，听感就是「重播截断」。
      if (!this.activeMusic.paused) return;
      const player = this.activeMusic;
      void playMediaWithDeadline(player).then(() => {
        if (this.activeMusic === player && this.activeMusicTrack === track) this.musicStartFailures = 0;
      }).catch(() => this.retryMusicStart(player, track));
      return;
    }
    const previous = this.activeMusic;
    const player = this.ensureMusic(track);
    // 快速连续切歌时，前一次的 previous 仍在 2.1 秒淡出。这里只保留这次真正
    // 需要交叉的两条，避免 3–4 首曲子同时可闻并争抢移动端解码器。
    this.releaseObsoleteMusicPlayers(new Set([player, ...(previous ? [previous] : [])]));
    // 中性滤波器的目的不是改音色，而是把媒体元素接入共享 limiter；
    // 否则章节配乐会绕过峰值保护，和语音、环境、音效在系统输出端直接硬叠。
    sfxEngine.elementFilter(player);
    this.cancelFade(player);
    player.pause();
    player.currentTime = 0;
    player.volume = 0;
    this.activeMusic = player;
    this.activeMusicTrack = track;
    if (previous && previous !== player) {
      this.fadePlayer(previous, 0, 2.1, true, () => this.releaseFadedMusicPlayer(previous));
    }
    void playMediaWithDeadline(player).then(() => {
      if (this.activeMusic !== player || this.activeMusicTrack !== track) {
        player.pause();
        return;
      }
      this.musicStartFailures = 0;
      this.fadePlayer(player, this.musicTargetVolume(MUSIC_BUS_GAIN, musicAssetGain(track)), 2.1);
      // 起播稳了就预备循环替补：等到曲尾才建元素，首圈换岗必然来不及。
      this.scheduleMusicTwinArm(track);
    }).catch(() => {
      // A later user gesture calls unlock again and retries this requested track.
      if (this.activeMusic === player) {
        this.activeMusic = undefined;
        this.activeMusicTrack = undefined;
      }
      this.retryMusicStart(player, track);
    });
  }

  private stopMusic(clearRequest: boolean, immediate = false): void {
    if (clearRequest) this.requestedMusic = undefined;
    this.musicCrossSerial += 1;
    if (this.musicTwinArmTimer !== null) {
      window.clearTimeout(this.musicTwinArmTimer);
      this.musicTwinArmTimer = null;
    }
    const player = this.activeMusic;
    const cross = this.musicCross;
    this.musicCross = undefined;
    if (cross) {
      this.cancelFade(cross.from);
      this.cancelFade(cross.to);
      for (const element of [cross.from, cross.to]) {
        if (element === player) continue;
        element.pause();
        try { element.currentTime = this.loopStartByEl.get(element) ?? 0.02; } catch { /* 无碍 */ }
      }
    }
    const twin = this.musicTwin;
    this.musicTwin = undefined;
    this.musicTwinTrack = undefined;
    if (twin && twin !== player) this.releaseMediaPlayer(twin);
    // 除 active 之外，Map 里还可能有正在淡出的上一首。静音/停播必须把它们也
    // 一起收掉，否则用户已经拉到 0，旧曲仍会按原音量继续响到淡出结束。
    this.releaseObsoleteMusicPlayers(new Set(player ? [player] : []));
    this.activeMusic = undefined;
    this.activeMusicTrack = undefined;
    this.stopMusicTension(immediate);
    if (player) {
      if (immediate) {
        this.cancelFade(player);
        player.pause();
        player.volume = 0;
        try { player.currentTime = 0; } catch { /* 未就绪无碍 */ }
      } else this.fadePlayer(
        player,
        0,
        0.85,
        true,
        clearRequest ? () => this.releaseFadedMusicPlayer(player) : undefined,
      );
    }
  }

  private syncMusicTension(): void {
    // 紧张层挂在配乐总线上，配乐静音时它也不该继续解码。
    if (this.musicVolume <= 0) {
      if (this.activeTension) this.stopMusicTension(true);
      return;
    }
    if (!this.musicTension || this.volume <= 0) return;
    if (this.activeTension) {
      sfxEngine.elementFilter(this.activeTension);
      if (!this.activeTension.paused) return;
      const player = this.activeTension;
      void playMediaWithDeadline(player).then(() => {
        if (this.activeTension === player) this.tensionStartFailures = 0;
      }).catch(() => this.retryTensionStart(player));
      return;
    }
    const player = this.ensureMusicTension();
    sfxEngine.elementFilter(player);
    this.cancelFade(player);
    player.pause();
    player.currentTime = 0;
    player.volume = 0;
    this.activeTension = player;
    void playMediaWithDeadline(player).then(() => {
      if (this.activeTension !== player || !this.musicTension) {
        player.pause();
        return;
      }
      this.tensionStartFailures = 0;
      this.fadePlayer(
        player,
        this.musicTargetVolume(TENSION_BUS_GAIN, TENSION_ASSET_GAIN),
        1.15,
      );
    }).catch(() => {
      if (this.activeTension === player) this.activeTension = undefined;
      this.retryTensionStart(player);
    });
  }

  private stopMusicTension(immediate = false): void {
    const player = this.activeTension;
    this.activeTension = undefined;
    if (!player) return;
    if (immediate) {
      this.cancelFade(player);
      player.pause();
      player.volume = 0;
      try { player.currentTime = 0; } catch { /* 未就绪无碍 */ }
    } else {
      this.fadePlayer(player, 0, 0.85, true);
    }
  }

  private musicTargetVolume(busGain: number, assetGain = 1): number {
    return Math.max(0, Math.min(
      1,
      this.volume
        * busGain
        * assetGain
        * this.musicVolume
        * (this.voiceDuckingActive() ? VOICE_MUSIC_DUCK : 1),
    ));
  }

  private ambienceTargetVolume(stage = this.activeAmbienceStage): number {
    if (stage === undefined) return 0;
    return Math.max(0, Math.min(
      1,
      this.volume
        * AMBIENCE_BUS_GAIN
        * ambienceAssetGain(stage)
        * ambienceProfile(stage).level
        * this.ambienceVolume
        * (this.voiceDuckingActive() ? VOICE_AMBIENCE_DUCK : 1),
    ));
  }

  private voiceDuckingActive(): boolean {
    return Boolean(this.activeVoice && !this.activeVoice.paused && !this.voiceSuspendedByGame);
  }

  private applyAmbienceProfile(player: HTMLAudioElement, stage: number): void {
    const profile = ambienceProfile(stage);
    player.playbackRate = profile.playbackRate;
    player.volume = this.ambienceTargetVolume(stage);
    const filter = sfxEngine.elementFilter(player);
    if (filter) configureAmbienceFilter(filter, profile);
  }

  private cancelFade(player: HTMLAudioElement): void {
    this.fadeTokens.set(player, (this.fadeTokens.get(player) ?? 0) + 1);
  }

  private fadePlayer(
    player: HTMLAudioElement,
    target: number,
    durationSeconds: number,
    resetWhenSilent = false,
    onComplete?: () => void,
  ): void {
    const token = (this.fadeTokens.get(player) ?? 0) + 1;
    this.fadeTokens.set(player, token);
    const startedAt = performance.now();
    const startVolume = player.volume;
    const durationMs = Math.max(1, durationSeconds * 1000);
    const step = (now: number) => {
      if (this.fadeTokens.get(player) !== token) return;
      const progress = Math.max(0, Math.min(1, (now - startedAt) / durationMs));
      const eased = progress * progress * (3 - 2 * progress);
      player.volume = Math.max(0, Math.min(1, startVolume + (target - startVolume) * eased));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        if (resetWhenSilent && target <= 0) {
          player.pause();
          player.currentTime = 0;
        }
        onComplete?.();
      }
    };
    requestAnimationFrame(step);
  }

  private cancelCurrentVoice(): void {
    this.voiceRequestSerial += 1;
    const player = this.activeVoice;
    this.activeVoice = undefined;
    this.activeVoiceBaseVolume = 0;
    this.activeVoicePriority = 0;
    this.refreshActiveVolumes();
    if (!player) return;
    player.onended = null;
    player.onerror = null;
    player.onpause = null;
    player.onplaying = null;
    player.pause();
    player.currentTime = 0;
  }

  private enqueueVoice(id: VoiceCueId, treatment?: VoiceTreatment): void {
    if (this.queuedVoices.some((entry) => entry.id === id)) return;
    this.queuedVoices.push({ id, treatment, queuedAt: performance.now() });
    if (this.queuedVoices.length > VOICE_QUEUE_LIMIT) {
      // 满员时挤掉优先级最低的一句（并列挤更晚来的），并记账供性能面板复盘。
      let drop = 0;
      for (let i = 1; i < this.queuedVoices.length; i += 1) {
        if (VOICE_CUES[this.queuedVoices[i]!.id].trigger.priority
          <= VOICE_CUES[this.queuedVoices[drop]!.id].trigger.priority) drop = i;
      }
      this.queuedVoices.splice(drop, 1);
      voiceDropCount += 1;
    }
  }

  private playQueuedVoice(): void {
    // 先清掉过了保鲜期的：它们的语境（那口铃、那句议论）已经翻篇，播出来是穿帮。
    const now = performance.now();
    for (let i = this.queuedVoices.length - 1; i >= 0; i -= 1) {
      if (now - this.queuedVoices[i]!.queuedAt > VOICE_QUEUE_MAX_AGE_MS) {
        this.queuedVoices.splice(i, 1);
        voiceExpireCount += 1;
      }
    }
    // 出列后 playVoice 可能因冷却/静音早退——那条已被消费，但没人再排下一条，
    // 候补席剩下的会干等到下一次 onended 才有机会。这里循环出列，直到真的有
    // 一条开播（activeVoicePriority 抬起来）或队列排空。
    while (this.queuedVoices.length) {
      let pick = 0;
      for (let i = 1; i < this.queuedVoices.length; i += 1) {
        if (VOICE_CUES[this.queuedVoices[i]!.id].trigger.priority
          > VOICE_CUES[this.queuedVoices[pick]!.id].trigger.priority) pick = i;
      }
      const queued = this.queuedVoices.splice(pick, 1)[0]!;
      this.playVoice(queued.id, queued.treatment);
      if (this.activeVoicePriority > 0) return;
    }
  }

  private refreshActiveVolumes(): void {
    if (this.activeAmbience) {
      this.activeAmbience.volume = this.ambienceTargetVolume();
    }
    if (this.musicCross) {
      const now = performance.now();
      const cross = this.musicCross;
      const k = Math.max(0, Math.min(1, (cross.endAt - now) / cross.durationMs));
      const base = this.musicTargetVolume(
        MUSIC_BUS_GAIN,
        musicAssetGain(this.activeMusicTrack ?? 0),
      );
      cross.from.volume = base * k;
      cross.to.volume = base * (1 - k);
    } else if (this.activeMusic) {
      this.cancelFade(this.activeMusic);
      this.activeMusic.volume = this.musicTargetVolume(
        MUSIC_BUS_GAIN,
        musicAssetGain(this.activeMusicTrack ?? 0),
      );
    }
    if (this.activeTension) {
      this.cancelFade(this.activeTension);
      this.activeTension.volume = this.musicTargetVolume(
        TENSION_BUS_GAIN,
        TENSION_ASSET_GAIN,
      );
    }
    if (this.activeVoice) {
      this.activeVoice.volume = Math.max(0, Math.min(
        1,
        this.activeVoiceBaseVolume * VOICE_PLAYBACK_GAIN * this.volume * this.voiceVolume,
      ));
    }
    for (const player of this.ambienceEventPlayers.values()) {
      player.volume = Math.max(0, Math.min(
        1,
        (this.ambienceEventLevels.get(player) ?? 0.08)
          * this.volume
          * this.ambienceVolume
          * (this.voiceDuckingActive() ? VOICE_AMBIENCE_DUCK : 1),
      ));
      if ((this.volume <= 0 || this.ambienceVolume <= 0) && !player.paused) player.pause();
    }
  }
}
