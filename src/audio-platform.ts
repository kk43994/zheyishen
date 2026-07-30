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

interface QueuedVoice {
  id: VoiceCueId;
  treatment?: VoiceTreatment;
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

/** 所有创建过的媒体元素，仅供性能面板统计在播数量（元素本身生命周期不受影响）。 */
const allMediaElements: HTMLAudioElement[] = [];
probeRegisterPlayingCounter(() => allMediaElements.reduce((n, el) => n + (el.paused ? 0 : 1), 0));

function media(file: string): HTMLAudioElement {
  const element = document.createElement('audio');
  element.preload = 'auto';
  element.src = new URL(file, document.baseURI).href;
  allMediaElements.push(element);
  probeElementCreated();
  return element;
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
  private readonly elementFilters = new Map<HTMLAudioElement, BiquadFilterNode>();
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
        const onDone = (buffer: AudioBuffer): void => {
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
      return this.elementFilters.get(element);
    }
    const cached = this.elementFilters.get(element);
    if (cached) return cached;
    try {
      // 每个元素只能建一次 MediaElementSource，重复调用会抛错。
      const source = context.createMediaElementSource(element);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 18_000;
      filter.Q.value = 0;
      source.connect(filter);
      filter.connect(this.outputLimiter ?? context.destination);
      this.elementFilters.set(element, filter);
      return filter;
    } catch {
      // 接不进去就保持原样播放：干声总好过无声。
      return undefined;
    }
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
  private voiceRequestSerial = 0;
  private queuedVoice?: QueuedVoice;
  private requestedAmbience?: number;
  private activeAmbienceStage?: number;
  private activeAmbience?: HTMLAudioElement;
  private requestedMusic?: number;
  private activeMusicTrack?: number;
  private activeMusic?: HTMLAudioElement;
  private musicTension = false;
  private tensionPlayer?: HTMLAudioElement;
  private activeTension?: HTMLAudioElement;

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
    if (first && !sfxEngine.ready('hit')) {
      // 成功走 Web Audio 的话音效池根本不用建——那 30 个 preload='auto' 的元素
      // 本身也在占 WebView 的解码器名额；play() 里另有「引擎没 ready 就退回元素」的兜底。
      for (const sound of Object.keys(SFX_FILES) as LifeSound[]) this.ensureSfxPool(sound);
    }
    this.syncAmbience();
    this.syncMusic();
    this.syncMusicTension();
  }

  private resumeAfterForeground(): void {
    if (!this.unlocked || this.volume <= 0) return;
    this.syncAmbience();
    this.syncMusic();
    this.syncMusicTension();
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
    // 环境音/配乐在静音时会被整条停掉（见 syncAmbience/syncMusic），拉回来必须重新起流，
    // 否则玩家把滑块推回去只会得到永久的安静。
    if (channel === 'ambience' && next > 0) this.syncAmbience();
    if (channel === 'music' && next > 0) {
      this.syncMusic();
      this.syncMusicTension();
    }
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
      this.stopMusic(false);
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
      this.stopMusic(false);
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
        * (this.activeVoice ? VOICE_SFX_DUCK : 1),
    ));
    const baseRate = ['boss', 'boss-warn', 'boss-release', 'boss-hit', 'deny', 'phone', 'train', 'monitor', 'heal', 'lamp'].includes(sound)
      ? 1
      : Math.max(0.92, Math.min(1.08, 1 + (Math.random() - 0.5) * 0.045));
    const rate = material ? baseRate * MATERIAL_TONES[material].rate : baseRate;
    if (sfxEngine.play(sound, gain, rate, material)) {
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
        * (this.activeVoice ? VOICE_SFX_DUCK : 1),
    ));
    player.playbackRate = ['boss', 'boss-warn', 'boss-release', 'boss-hit', 'deny', 'phone', 'train', 'monitor', 'heal', 'lamp'].includes(sound)
      ? 1
      : Math.max(0.92, Math.min(1.08, 1 + (Math.random() - 0.5) * 0.045));
    probePlay(sound);
    void player.play().catch(() => undefined);
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
      player = media(SFX_FILES[sound]);
      this.ambienceEventPlayers.set(sound, player);
    }
    if (!player.paused) player.pause();
    if (player.currentTime !== 0) {
      player.currentTime = 0;
      probeSeek();
    }
    const level = Math.max(0.04, Math.min(0.28, intensity * 0.22));
    this.ambienceEventLevels.set(player, level);
    player.volume = level * this.volume * this.ambienceVolume
      * (this.activeVoice ? VOICE_AMBIENCE_DUCK : 1);
    player.playbackRate = 0.98 + Math.random() * 0.04;
    probePlay(`ambience-${sound}`);
    void player.play().catch(() => undefined);
  }

  setAmbience(stage?: number): void {
    this.requestedAmbience = stage === undefined
      ? undefined
      : Math.max(0, Math.min(AMBIENCE_FILES.length - 1, Math.floor(stage)));
    if (this.requestedAmbience === undefined) {
      this.stopAmbience(true);
      return;
    }
    this.unlock();
    this.syncAmbience();
  }

  setMusic(track?: number): void {
    this.requestedMusic = track === undefined
      ? undefined
      : Math.max(0, Math.min(MUSIC_FILES.length - 1, Math.floor(track)));
    if (this.requestedMusic === undefined) {
      this.stopMusic(true);
      return;
    }
    this.unlock();
    this.syncMusic();
  }

  setMusicTension(active: boolean): void {
    this.musicTension = active;
    if (!active) {
      this.stopMusicTension();
      return;
    }
    this.unlock();
    this.syncMusicTension();
  }

  preloadVoices(ids: readonly VoiceCueId[]): void {
    this.unlock();
    for (const id of ids) this.ensureVoice(id);
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
    stage = 0,
    onProgress?: (done: number, total: number) => void,
    budgetMs = 15000,
  ): Promise<void> {
    const elements: HTMLAudioElement[] = [
      ...voiceIds.map((id) => this.ensureVoice(id)),
      this.ensureAmbience(stage),
      this.ensureMusic(stage),
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
      const queuedPriority = this.queuedVoice ? VOICE_CUES[this.queuedVoice.id].trigger.priority : 0;
      if (!this.queuedVoice || cue.trigger.priority > queuedPriority) this.queuedVoice = { id, treatment };
      return;
    }
    if (this.activeVoicePriority > 0) this.cancelCurrentVoice();

    this.lastVoicePlayed.set(id, now);
    const serial = ++this.voiceRequestSerial;
    const player = this.ensureVoice(id);
    const filter = sfxEngine.elementFilter(player);
    if (filter) configureVoiceFilter(filter, treatment ?? cue.treatment);
    player.pause();
    player.currentTime = 0;
    player.playbackRate = voicePlaybackRate(id, treatment);
    this.activeVoiceBaseVolume = cue.volume;
    this.activeVoice = player;
    this.activeVoicePriority = cue.trigger.priority;
    this.refreshActiveVolumes();
    player.onended = () => {
      if (this.activeVoice !== player || serial !== this.voiceRequestSerial) return;
      this.activeVoice = undefined;
      this.activeVoiceBaseVolume = 0;
      this.activeVoicePriority = 0;
      this.refreshActiveVolumes();
      this.playQueuedVoice();
    };
    void player.play().catch(() => {
      if (serial !== this.voiceRequestSerial) return;
      this.activeVoice = undefined;
      this.activeVoiceBaseVolume = 0;
      this.activeVoicePriority = 0;
      this.refreshActiveVolumes();
      this.playQueuedVoice();
    });
  }

  stopVoice(): void {
    this.queuedVoice = undefined;
    this.cancelCurrentVoice();
  }

  private ensureSfxPool(sound: LifeSound): HTMLAudioElement[] {
    const cached = this.sfxPools.get(sound);
    if (cached) return cached;
    const pool = Array.from({ length: sound === 'hit' || sound === 'breath' ? 4 : 2 }, () => media(SFX_FILES[sound]));
    this.sfxPools.set(sound, pool);
    return pool;
  }

  private ensureVoice(id: VoiceCueId): HTMLAudioElement {
    const cached = this.voicePlayers.get(id);
    if (cached) return cached;
    const player = media(VOICE_CUES[id].playbackFile ?? VOICE_CUES[id].file);
    this.voicePlayers.set(id, player);
    return player;
  }

  private ensureAmbience(stage: number): HTMLAudioElement {
    const cached = this.ambiencePlayers.get(stage);
    if (cached) return cached;
    const player = media(AMBIENCE_FILES[stage]!);
    player.loop = true;
    this.ambiencePlayers.set(stage, player);
    return player;
  }

  private ensureMusic(track: number): HTMLAudioElement {
    const cached = this.musicPlayers.get(track);
    if (cached) return cached;
    const player = media(MUSIC_FILES[track]!);
    player.loop = true;
    this.musicPlayers.set(track, player);
    return player;
  }

  private ensureMusicTension(): HTMLAudioElement {
    if (this.tensionPlayer) return this.tensionPlayer;
    const player = media(MUSIC_TENSION_FILE);
    player.loop = true;
    this.tensionPlayer = player;
    return player;
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
      if (current && current.paused) void current.play().catch(() => undefined);
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
    void player.play().catch(() => undefined);
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
      if (this.activeMusic) this.stopMusic(false);
      return;
    }
    if (track === undefined || this.volume <= 0) return;
    if (track === this.activeMusicTrack && this.activeMusic) {
      sfxEngine.elementFilter(this.activeMusic);
      // 同一曲目：在播就什么都不做；被宿主暂停就原地续播。绝不能走下面的重建流程，
      // 那里第一句 currentTime = 0 会把曲子拉回开头——unlock() 每次播音效都会调到
      // 这里，于是配乐每打一下就从头开始，听感就是「重播截断」。
      if (!this.activeMusic.paused) return;
      void this.activeMusic.play().catch(() => undefined);
      return;
    }
    const previous = this.activeMusic;
    const player = this.ensureMusic(track);
    // 中性滤波器的目的不是改音色，而是把媒体元素接入共享 limiter；
    // 否则章节配乐会绕过峰值保护，和语音、环境、音效在系统输出端直接硬叠。
    sfxEngine.elementFilter(player);
    this.cancelFade(player);
    player.pause();
    player.currentTime = 0;
    player.volume = 0;
    this.activeMusic = player;
    this.activeMusicTrack = track;
    if (previous && previous !== player) this.fadePlayer(previous, 0, 2.1, true);
    void player.play().then(() => {
      if (this.activeMusic !== player || this.activeMusicTrack !== track) return;
      this.fadePlayer(player, this.musicTargetVolume(MUSIC_BUS_GAIN, musicAssetGain(track)), 2.1);
    }).catch(() => {
      // A later user gesture calls unlock again and retries this requested track.
      if (this.activeMusic === player) {
        this.activeMusic = undefined;
        this.activeMusicTrack = undefined;
      }
    });
  }

  private stopMusic(clearRequest: boolean): void {
    if (clearRequest) this.requestedMusic = undefined;
    const player = this.activeMusic;
    this.activeMusic = undefined;
    this.activeMusicTrack = undefined;
    this.stopMusicTension();
    if (player) this.fadePlayer(player, 0, 0.85, true);
  }

  private syncMusicTension(): void {
    // 紧张层挂在配乐总线上，配乐静音时它也不该继续解码。
    if (this.musicVolume <= 0) {
      if (this.activeTension) this.stopMusicTension();
      return;
    }
    if (!this.musicTension || this.volume <= 0) return;
    if (this.activeTension) {
      sfxEngine.elementFilter(this.activeTension);
      if (!this.activeTension.paused) return;
      void this.activeTension.play().catch(() => undefined);
      return;
    }
    const player = this.ensureMusicTension();
    sfxEngine.elementFilter(player);
    this.cancelFade(player);
    player.pause();
    player.currentTime = 0;
    player.volume = 0;
    this.activeTension = player;
    void player.play().then(() => {
      if (this.activeTension !== player || !this.musicTension) return;
      this.fadePlayer(
        player,
        this.musicTargetVolume(TENSION_BUS_GAIN, TENSION_ASSET_GAIN),
        1.15,
      );
    }).catch(() => {
      if (this.activeTension === player) this.activeTension = undefined;
    });
  }

  private stopMusicTension(): void {
    const player = this.activeTension;
    this.activeTension = undefined;
    if (player) this.fadePlayer(player, 0, 0.85, true);
  }

  private musicTargetVolume(busGain: number, assetGain = 1): number {
    return Math.max(0, Math.min(
      1,
      this.volume
        * busGain
        * assetGain
        * this.musicVolume
        * (this.activeVoice ? VOICE_MUSIC_DUCK : 1),
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
        * (this.activeVoice ? VOICE_AMBIENCE_DUCK : 1),
    ));
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
      } else if (resetWhenSilent && target <= 0) {
        player.pause();
        player.currentTime = 0;
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
    player.pause();
    player.currentTime = 0;
  }

  private playQueuedVoice(): void {
    const queued = this.queuedVoice;
    this.queuedVoice = undefined;
    if (queued) this.playVoice(queued.id, queued.treatment);
  }

  private refreshActiveVolumes(): void {
    if (this.activeAmbience) {
      this.activeAmbience.volume = this.ambienceTargetVolume();
    }
    if (this.activeMusic) {
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
          * (this.activeVoice ? VOICE_AMBIENCE_DUCK : 1),
      ));
      if ((this.volume <= 0 || this.ambienceVolume <= 0) && !player.paused) player.pause();
    }
  }
}
