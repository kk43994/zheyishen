import {
  probeElementCreated,
  probePlay,
  probeSeek,
  probeSkippedMuted,
  probeRegisterPlayingCounter,
} from './audio-probe';
import { SFX_INLINE_BASE64 } from './audio-sfx-inline';
import { VOICE_CUES, voicePlaybackRate, type VoiceCueId, type VoiceTreatment } from './voice-script';

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
  | 'deny'
  | 'phone'
  | 'train'
  | 'monitor';

const VOLUME_KEY = 'zhe-yi-shen:volume';
const LAST_VOLUME_KEY = 'zhe-yi-shen:last-audible-volume';
const AUDIO_CHOICE_KEY = 'zhe-yi-shen:audio-choice';
const DEFAULT_AUDIO_MIGRATION_KEY = 'zhe-yi-shen:default-audio-v2';
const HAPTICS_KEY = 'zhe-yi-shen:haptics';
const EFFECTS_VOLUME_KEY = 'zhe-yi-shen:effects-volume';
const AMBIENCE_VOLUME_KEY = 'zhe-yi-shen:ambience-volume';
const MUSIC_VOLUME_KEY = 'zhe-yi-shen:music-volume';
const VOICE_VOLUME_KEY = 'zhe-yi-shen:voice-volume';
const VOICE_PLAYBACK_GAIN = 1.6;
const VOICE_SFX_DUCK = 0.42;
const VOICE_AMBIENCE_DUCK = 0.42;
const VOICE_MUSIC_DUCK = 0.26;
const MUSIC_BUS_GAIN = 0.34;
const TENSION_BUS_GAIN = 0.24;

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
  deny: 'assets/audio/sfx/deny.mp3',
  phone: 'assets/audio/sfx/phone.mp3',
  train: 'assets/audio/sfx/train.mp3',
  monitor: 'assets/audio/sfx/monitor.mp3',
};

const SFX_GAIN: Record<LifeSound, number> = {
  page: 0.52,
  breath: 0.52,
  hit: 0.48,
  hurt: 0.58,
  coin: 0.48,
  wear: 0.46,
  swallow: 0.52,
  exhale: 0.42,
  boss: 0.64,
  deny: 0.5,
  phone: 0.66,
  train: 0.65,
  monitor: 0.45,
};

const AMBIENCE_FILES = [
  'assets/audio/ambience/childhood-room.mp3',
  'assets/audio/ambience/classroom.mp3',
  'assets/audio/ambience/station.mp3',
  'assets/audio/ambience/apartment.mp3',
  'assets/audio/ambience/office.mp3',
  'assets/audio/ambience/hospital.mp3',
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
  const stored = Math.max(0, Math.min(1, readNumber(VOLUME_KEY, 0.42)));
  try {
    if (localStorage.getItem(DEFAULT_AUDIO_MIGRATION_KEY) !== 'enabled') {
      const restored = stored > 0
        ? stored
        : Math.max(0.08, Math.min(1, readNumber(LAST_VOLUME_KEY, 0.42)));
      localStorage.setItem(DEFAULT_AUDIO_MIGRATION_KEY, 'enabled');
      localStorage.setItem(AUDIO_CHOICE_KEY, 'enabled');
      localStorage.setItem(VOLUME_KEY, restored.toFixed(2));
      localStorage.setItem(LAST_VOLUME_KEY, restored.toFixed(2));
      return restored;
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
      this.master.gain.value = 1;
      this.master.connect(this.context.destination);
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

  ready(name: string): boolean {
    return !this.failed && !!this.context && this.buffers.has(name);
  }

  play(name: string, volume: number, rate: number): boolean {
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
      source.connect(gain);
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
    const hitLead = this.leads.get('hit');
    const trim = typeof hitLead === 'number' ? ` · hit裁${Math.round(hitLead * 1000)}ms` : '';
    return `${context.state} · ${this.buffers.size}/${Object.keys(SFX_INLINE_BASE64).length} · ${latency}${trim}`;
  }
}

const sfxEngine = new SfxEngine();

// 从后台切回时 AudioContext 会停在 suspended，且不会因为一次点击自动恢复
// （Phaser 的最佳实践文章专门点名过 iOS 上这个行为）。unlock() 不一定在切回后
// 被触发，所以这里显式挂在可见性/焦点事件上补一刀。
if (typeof document !== 'undefined') {
  const resumeIfVisible = (): void => {
    if (document.visibilityState === 'visible') sfxEngine.prime();
  };
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
  private musicVolume = Math.max(0, Math.min(1, readNumber(MUSIC_VOLUME_KEY, 0.78)));
  private voiceVolume = Math.max(0, Math.min(1, readNumber(VOICE_VOLUME_KEY, 1)));
  private haptics = readBoolean(HAPTICS_KEY, true);
  private unlocked = false;
  private readonly lastPlayed = new Map<LifeSound, number>();
  private readonly sfxPools = new Map<LifeSound, HTMLAudioElement[]>();
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

  unlock(): void {
    if (!this.unlocked) {
      this.unlocked = true;
      // 必须在用户手势里建 AudioContext。成功的话音效池根本不用建——那 30 个
      // preload='auto' 的元素本身也在占 WebView 的解码器名额。
      sfxEngine.prime();
      if (!sfxEngine.ready('hit')) {
        for (const sound of Object.keys(SFX_FILES) as LifeSound[]) this.ensureSfxPool(sound);
      }
    }
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
    mix: { effects: number; ambience: number; music: number; voice: number };
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
      mix: {
        effects: this.effectsVolume,
        ambience: this.ambienceVolume,
        music: this.musicVolume,
        voice: this.voiceVolume,
      },
    };
  }

  audioEnabled(): boolean {
    return this.volume > 0;
  }

  setAudioEnabled(value: boolean): void {
    const restored = Math.max(0.08, Math.min(1, readNumber(LAST_VOLUME_KEY, 0.42)));
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
    if (!this.haptics || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Haptics are best effort only.
    }
  }

  play(sound: LifeSound, intensity = 1): void {
    const now = performance.now();
    const throttle = sound === 'hit' ? 55 : sound === 'breath' ? 95 : 18;
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
      1,
      SFX_GAIN[sound] * intensity * this.volume * this.effectsVolume
        * (this.activeVoice ? VOICE_SFX_DUCK : 1),
    ));
    const rate = ['boss', 'deny', 'phone', 'train', 'monitor'].includes(sound)
      ? 1
      : Math.max(0.92, Math.min(1.08, 1 + (Math.random() - 0.5) * 0.045));
    if (sfxEngine.play(sound, gain, rate)) {
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
      SFX_GAIN[sound]
        * intensity
        * this.volume
        * this.effectsVolume
        * (this.activeVoice ? VOICE_SFX_DUCK : 1),
    ));
    player.playbackRate = ['boss', 'deny', 'phone', 'train', 'monitor'].includes(sound)
      ? 1
      : Math.max(0.92, Math.min(1.08, 1 + (Math.random() - 0.5) * 0.045));
    probePlay(sound);
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
      if (current && current.paused) void current.play().catch(() => undefined);
      return;
    }
    const previous = this.activeAmbience;
    if (previous) {
      previous.pause();
      previous.currentTime = 0;
    }
    const player = this.ensureAmbience(stage);
    player.volume = Math.max(0, Math.min(
      1,
      this.volume
        * 0.58
        * this.ambienceVolume
        * (this.activeVoice ? VOICE_AMBIENCE_DUCK : 1),
    ));
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
      // 同一曲目：在播就什么都不做；被宿主暂停就原地续播。绝不能走下面的重建流程，
      // 那里第一句 currentTime = 0 会把曲子拉回开头——unlock() 每次播音效都会调到
      // 这里，于是配乐每打一下就从头开始，听感就是「重播截断」。
      if (!this.activeMusic.paused) return;
      void this.activeMusic.play().catch(() => undefined);
      return;
    }
    const previous = this.activeMusic;
    const player = this.ensureMusic(track);
    this.cancelFade(player);
    player.pause();
    player.currentTime = 0;
    player.volume = 0;
    this.activeMusic = player;
    this.activeMusicTrack = track;
    if (previous && previous !== player) this.fadePlayer(previous, 0, 2.1, true);
    void player.play().then(() => {
      if (this.activeMusic !== player || this.activeMusicTrack !== track) return;
      this.fadePlayer(player, this.musicTargetVolume(MUSIC_BUS_GAIN), 2.1);
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
      if (!this.activeTension.paused) return;
      void this.activeTension.play().catch(() => undefined);
      return;
    }
    const player = this.ensureMusicTension();
    this.cancelFade(player);
    player.pause();
    player.currentTime = 0;
    player.volume = 0;
    this.activeTension = player;
    void player.play().then(() => {
      if (this.activeTension !== player || !this.musicTension) return;
      this.fadePlayer(player, this.musicTargetVolume(TENSION_BUS_GAIN), 1.15);
    }).catch(() => {
      if (this.activeTension === player) this.activeTension = undefined;
    });
  }

  private stopMusicTension(): void {
    const player = this.activeTension;
    this.activeTension = undefined;
    if (player) this.fadePlayer(player, 0, 0.85, true);
  }

  private musicTargetVolume(busGain: number): number {
    return Math.max(0, Math.min(
      1,
      this.volume
        * busGain
        * this.musicVolume
        * (this.activeVoice ? VOICE_MUSIC_DUCK : 1),
    ));
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
      this.activeAmbience.volume = Math.max(0, Math.min(
        1,
        this.volume
          * 0.58
          * this.ambienceVolume
          * (this.activeVoice ? VOICE_AMBIENCE_DUCK : 1),
      ));
    }
    if (this.activeMusic) {
      this.cancelFade(this.activeMusic);
      this.activeMusic.volume = this.musicTargetVolume(MUSIC_BUS_GAIN);
    }
    if (this.activeTension) {
      this.cancelFade(this.activeTension);
      this.activeTension.volume = this.musicTargetVolume(TENSION_BUS_GAIN);
    }
    if (this.activeVoice) {
      this.activeVoice.volume = Math.max(0, Math.min(
        1,
        this.activeVoiceBaseVolume * VOICE_PLAYBACK_GAIN * this.volume * this.voiceVolume,
      ));
    }
  }
}
