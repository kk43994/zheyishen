import { VOICE_CUES, type VoiceCueId, type VoiceTreatment } from './voice-script';

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
  | 'deny';

const VOLUME_KEY = 'zhe-yi-shen:volume';
const LAST_VOLUME_KEY = 'zhe-yi-shen:last-audible-volume';
const AUDIO_CHOICE_KEY = 'zhe-yi-shen:audio-choice';
const HAPTICS_KEY = 'zhe-yi-shen:haptics';
const EFFECTS_VOLUME_KEY = 'zhe-yi-shen:effects-volume';
const AMBIENCE_VOLUME_KEY = 'zhe-yi-shen:ambience-volume';
const VOICE_VOLUME_KEY = 'zhe-yi-shen:voice-volume';

export type AudioMixChannel = 'effects' | 'ambience' | 'voice';

const SFX_FILES: Record<LifeSound, string> = {
  page: 'assets/audio/sfx/page.wav',
  breath: 'assets/audio/sfx/breath.wav',
  hit: 'assets/audio/sfx/hit.wav',
  hurt: 'assets/audio/sfx/hurt.wav',
  coin: 'assets/audio/sfx/coin.wav',
  wear: 'assets/audio/sfx/wear.wav',
  swallow: 'assets/audio/sfx/swallow.wav',
  exhale: 'assets/audio/sfx/exhale.wav',
  boss: 'assets/audio/sfx/boss.wav',
  deny: 'assets/audio/sfx/deny.wav',
};

const AMBIENCE_FILES = [
  'assets/audio/ambience/childhood-room.wav',
  'assets/audio/ambience/classroom.wav',
  'assets/audio/ambience/station.wav',
  'assets/audio/ambience/apartment.wav',
  'assets/audio/ambience/office.wav',
  'assets/audio/ambience/hospital.wav',
] as const;

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

export class LifeFeedback {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private sfxGain?: GainNode;
  private voiceGain?: GainNode;
  private ambienceGain?: GainNode;
  private volume = Math.max(0, Math.min(1, readNumber(VOLUME_KEY, 0.42)));
  private effectsVolume = Math.max(0, Math.min(1, readNumber(EFFECTS_VOLUME_KEY, 1)));
  private ambienceVolume = Math.max(0, Math.min(1, readNumber(AMBIENCE_VOLUME_KEY, 1)));
  private voiceVolume = Math.max(0, Math.min(1, readNumber(VOICE_VOLUME_KEY, 1)));
  private haptics = readBoolean(HAPTICS_KEY, true);
  private readonly lastPlayed = new Map<LifeSound, number>();
  private readonly sfxBuffers = new Map<LifeSound, AudioBuffer>();
  private readonly sfxLoads = new Map<LifeSound, Promise<AudioBuffer>>();
  private readonly unavailableSfx = new Set<LifeSound>();
  private readonly ambienceBuffers = new Map<number, AudioBuffer>();
  private readonly ambienceLoads = new Map<number, Promise<AudioBuffer>>();
  private readonly unavailableAmbience = new Set<number>();
  private readonly lastVoicePlayed = new Map<VoiceCueId, number>();
  private readonly voiceBuffers = new Map<VoiceCueId, AudioBuffer>();
  private readonly voiceLoads = new Map<VoiceCueId, Promise<AudioBuffer>>();
  private readonly unavailableVoices = new Set<VoiceCueId>();
  private activeVoice?: AudioBufferSourceNode;
  private activeVoicePriority = 0;
  private loadingVoicePriority = 0;
  private voiceRequestSerial = 0;
  private queuedVoice?: QueuedVoice;
  private ambienceRequestSerial = 0;
  private requestedAmbience?: number;
  private activeAmbienceStage?: number;
  private activeAmbience?: AudioBufferSourceNode;
  private activeAmbienceLevel?: GainNode;

  unlock(): void {
    if (!this.context && typeof AudioContext !== 'undefined') {
      try {
        this.context = new AudioContext();
        this.masterGain = this.context.createGain();
        this.sfxGain = this.context.createGain();
        this.voiceGain = this.context.createGain();
        this.ambienceGain = this.context.createGain();
        this.masterGain.gain.value = this.volume;
        this.sfxGain.gain.value = this.effectsVolume;
        this.voiceGain.gain.value = this.voiceVolume;
        this.ambienceGain.gain.value = 0.58 * this.ambienceVolume;
        this.sfxGain.connect(this.masterGain);
        this.voiceGain.connect(this.masterGain);
        this.ambienceGain.connect(this.masterGain);
        this.masterGain.connect(this.context.destination);
        for (const sound of Object.keys(SFX_FILES) as LifeSound[]) {
          void this.loadSfx(sound).catch(() => undefined);
        }
      } catch {
        this.context = undefined;
        this.masterGain = undefined;
        this.sfxGain = undefined;
        this.voiceGain = undefined;
        this.ambienceGain = undefined;
      }
    }
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  getVolume(): number {
    return this.volume;
  }

  getMixVolume(channel: AudioMixChannel): number {
    if (channel === 'effects') return this.effectsVolume;
    if (channel === 'ambience') return this.ambienceVolume;
    return this.voiceVolume;
  }

  setMixVolume(channel: AudioMixChannel, value: number): void {
    const next = Math.max(0, Math.min(1, value));
    if (channel === 'effects') this.effectsVolume = next;
    else if (channel === 'ambience') this.ambienceVolume = next;
    else this.voiceVolume = next;
    try {
      const key = channel === 'effects'
        ? EFFECTS_VOLUME_KEY
        : channel === 'ambience' ? AMBIENCE_VOLUME_KEY : VOICE_VOLUME_KEY;
      localStorage.setItem(key, next.toFixed(2));
    } catch {
      // Persistence is optional in restricted webviews.
    }
    if (this.context) {
      const now = this.context.currentTime;
      if (channel === 'effects' && this.sfxGain) this.sfxGain.gain.setTargetAtTime(next, now, 0.02);
      if (channel === 'ambience' && this.ambienceGain) this.ambienceGain.gain.setTargetAtTime(0.58 * next, now, 0.04);
      if (channel === 'voice' && this.voiceGain) this.voiceGain.gain.setTargetAtTime(next, now, 0.02);
    }
  }

  debugState(): {
    context: AudioContextState | 'unavailable';
    sfxReady: number;
    ambienceReady: number;
    requestedAmbience: number | null;
    activeAmbience: number | null;
    voiceReady: number;
    mix: { effects: number; ambience: number; voice: number };
  } {
    return {
      context: this.context?.state ?? 'unavailable',
      sfxReady: this.sfxBuffers.size,
      ambienceReady: this.ambienceBuffers.size,
      requestedAmbience: this.requestedAmbience ?? null,
      activeAmbience: this.activeAmbienceStage ?? null,
      voiceReady: this.voiceBuffers.size,
      mix: {
        effects: this.effectsVolume,
        ambience: this.ambienceVolume,
        voice: this.voiceVolume,
      },
    };
  }

  hasAudioChoice(): boolean {
    try {
      const choice = localStorage.getItem(AUDIO_CHOICE_KEY);
      return choice === 'enabled' || choice === 'muted';
    } catch {
      return false;
    }
  }

  audioEnabled(): boolean {
    return this.volume > 0;
  }

  setAudioEnabled(value: boolean): void {
    const restored = Math.max(0.08, Math.min(1, readNumber(LAST_VOLUME_KEY, 0.42)));
    this.setVolume(value ? (this.volume > 0 ? this.volume : restored) : 0);
    if (value) {
      this.unlock();
      void this.syncAmbience();
    } else {
      this.stopVoice();
      this.stopAmbience(0.18, false);
    }
  }

  setVolume(value: number): void {
    const wasSilent = this.volume <= 0;
    this.volume = Math.max(0, Math.min(1, value));
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    }
    try {
      localStorage.setItem(VOLUME_KEY, this.volume.toFixed(2));
      localStorage.setItem(AUDIO_CHOICE_KEY, this.volume > 0 ? 'enabled' : 'muted');
      if (this.volume > 0) localStorage.setItem(LAST_VOLUME_KEY, this.volume.toFixed(2));
    } catch {
      // Persistence is optional in restricted webviews.
    }
    if (wasSilent && this.volume > 0) {
      this.unlock();
      void this.syncAmbience();
    } else if (!wasSilent && this.volume <= 0) {
      this.stopVoice();
      this.stopAmbience(0.18, false);
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
    if (now - (this.lastPlayed.get(sound) ?? -Infinity) < throttle) return;
    this.lastPlayed.set(sound, now);
    this.unlock();
    if (!this.context || !this.masterGain || this.volume <= 0) return;
    const strength = Math.max(0.45, Math.min(1.45, intensity));
    const buffer = this.sfxBuffers.get(sound);
    if (buffer) {
      this.playSfxBuffer(sound, buffer, strength);
      return;
    }
    void this.loadSfx(sound).catch(() => undefined);
    this.playSynthetic(sound, strength);
  }

  setAmbience(stage?: number): void {
    this.requestedAmbience = stage === undefined
      ? undefined
      : Math.max(0, Math.min(AMBIENCE_FILES.length - 1, Math.floor(stage)));
    this.ambienceRequestSerial += 1;
    if (this.requestedAmbience === undefined) {
      this.stopAmbience(1.1, true);
      return;
    }
    this.unlock();
    void this.syncAmbience();
  }

  private playSfxBuffer(sound: LifeSound, buffer: AudioBuffer, strength: number): void {
    const context = this.context;
    const output = this.sfxGain ?? this.masterGain;
    if (!context || !output) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const baseGain: Record<LifeSound, number> = {
      page: 0.52, breath: 0.34, hit: 0.48, hurt: 0.58, coin: 0.48,
      wear: 0.46, swallow: 0.52, exhale: 0.42, boss: 0.64, deny: 0.5,
    };
    const pitchVariance = sound === 'boss' || sound === 'deny' ? 0 : (Math.random() - 0.5) * 0.045;
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.82, Math.min(1.16, 1 + pitchVariance));
    gain.gain.value = baseGain[sound] * strength;
    source.connect(gain);
    gain.connect(output);
    source.start();
  }

  private playSynthetic(sound: LifeSound, strength: number): void {
    if (sound === 'page') {
      this.tone(132, 96, 0.022 * strength, 'triangle', 112);
      this.tone(176, 72, 0.012 * strength, 'sine', 154, 0.045);
    } else if (sound === 'breath') {
      this.tone(118, 78, 0.012 * strength, 'sine', 78);
    } else if (sound === 'hit') {
      this.tone(92, 42, 0.012 * strength, 'square', 58);
    } else if (sound === 'hurt') {
      this.tone(142, 170, 0.038 * strength, 'sawtooth', 54);
    } else if (sound === 'coin') {
      this.tone(420, 64, 0.024 * strength, 'square', 520);
      this.tone(620, 58, 0.016 * strength, 'square', 540, 0.052);
    } else if (sound === 'wear') {
      this.tone(165, 150, 0.026 * strength, 'triangle', 228);
      this.tone(248, 110, 0.018 * strength, 'sine', 286, 0.07);
    } else if (sound === 'swallow') {
      this.tone(134, 230, 0.034 * strength, 'triangle', 62);
    } else if (sound === 'exhale') {
      this.tone(126, 210, 0.026 * strength, 'sine', 260);
    } else if (sound === 'boss') {
      this.tone(66, 420, 0.052 * strength, 'sawtooth', 44);
      this.tone(49, 520, 0.032 * strength, 'triangle', 41, 0.12);
    } else if (sound === 'deny') {
      this.tone(150, 82, 0.026 * strength, 'square', 112);
      this.tone(112, 100, 0.022 * strength, 'square', 88, 0.075);
    }
  }

  private async loadSfx(sound: LifeSound): Promise<AudioBuffer> {
    const cached = this.sfxBuffers.get(sound);
    if (cached) return cached;
    if (this.unavailableSfx.has(sound)) throw new Error(`sfx unavailable: ${sound}`);
    const pending = this.sfxLoads.get(sound);
    if (pending) return pending;
    const load = this.loadBuffer(SFX_FILES[sound]).then((buffer) => {
      this.sfxBuffers.set(sound, buffer);
      return buffer;
    });
    this.sfxLoads.set(sound, load);
    try {
      return await load;
    } catch (error) {
      this.unavailableSfx.add(sound);
      throw error;
    } finally {
      this.sfxLoads.delete(sound);
    }
  }

  private async loadAmbience(stage: number): Promise<AudioBuffer> {
    const cached = this.ambienceBuffers.get(stage);
    if (cached) return cached;
    if (this.unavailableAmbience.has(stage)) throw new Error(`ambience unavailable: ${stage}`);
    const pending = this.ambienceLoads.get(stage);
    if (pending) return pending;
    const load = this.loadBuffer(AMBIENCE_FILES[stage]!).then((buffer) => {
      this.ambienceBuffers.set(stage, buffer);
      return buffer;
    });
    this.ambienceLoads.set(stage, load);
    try {
      return await load;
    } catch (error) {
      this.unavailableAmbience.add(stage);
      throw error;
    } finally {
      this.ambienceLoads.delete(stage);
    }
  }

  private async loadBuffer(file: string): Promise<AudioBuffer> {
    const context = this.context;
    if (!context) throw new Error('audio context unavailable');
    const response = await fetch(new URL(file, document.baseURI));
    if (!response.ok) throw new Error(`audio asset ${response.status}: ${file}`);
    const bytes = await response.arrayBuffer();
    return context.decodeAudioData(bytes.slice(0));
  }

  private async syncAmbience(): Promise<void> {
    const stage = this.requestedAmbience;
    if (stage === undefined || this.volume <= 0 || stage === this.activeAmbienceStage) return;
    const serial = this.ambienceRequestSerial;
    try {
      const buffer = await this.loadAmbience(stage);
      if (serial !== this.ambienceRequestSerial || stage !== this.requestedAmbience || this.volume <= 0) return;
      const context = this.context;
      const output = this.ambienceGain;
      if (!context || !output) return;
      const previous = this.activeAmbience;
      const previousLevel = this.activeAmbienceLevel;
      const source = context.createBufferSource();
      const level = context.createGain();
      const now = context.currentTime;
      source.buffer = buffer;
      source.loop = true;
      level.gain.setValueAtTime(0.0001, now);
      level.gain.exponentialRampToValueAtTime(1, now + 1.25);
      source.connect(level);
      level.connect(output);
      source.start(now);
      this.activeAmbience = source;
      this.activeAmbienceLevel = level;
      this.activeAmbienceStage = stage;
      if (previous && previousLevel) {
        previousLevel.gain.cancelScheduledValues(now);
        previousLevel.gain.setValueAtTime(Math.max(0.0001, previousLevel.gain.value), now);
        previousLevel.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
        try { previous.stop(now + 1.3); } catch { /* Already stopped. */ }
      }
    } catch {
      // A missing ambience must never block gameplay.
    }
  }

  private stopAmbience(fadeSeconds: number, clearRequest: boolean): void {
    if (clearRequest) this.requestedAmbience = undefined;
    this.ambienceRequestSerial += 1;
    const source = this.activeAmbience;
    const level = this.activeAmbienceLevel;
    const context = this.context;
    this.activeAmbience = undefined;
    this.activeAmbienceLevel = undefined;
    this.activeAmbienceStage = undefined;
    if (!source || !level || !context) return;
    const now = context.currentTime;
    level.gain.cancelScheduledValues(now);
    level.gain.setValueAtTime(Math.max(0.0001, level.gain.value), now);
    level.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
    try { source.stop(now + fadeSeconds + 0.04); } catch { /* Already stopped. */ }
  }

  preloadVoices(ids: readonly VoiceCueId[]): void {
    this.unlock();
    for (const id of ids) void this.loadVoice(id).catch(() => undefined);
  }

  playVoice(id: VoiceCueId, treatment?: VoiceTreatment): void {
    const cue = VOICE_CUES[id];
    const now = performance.now();
    if (now - (this.lastVoicePlayed.get(id) ?? -Infinity) < cue.cooldownMs) return;
    this.unlock();

    const occupyingPriority = Math.max(this.activeVoicePriority, this.loadingVoicePriority);
    if (occupyingPriority > 0) {
      // Priority decides which waiting line survives; only an explicitly marked
      // cue may cut off a sentence that the player is already hearing.
      const canInterrupt = cue.trigger.interrupt;
      if (!canInterrupt) {
        const queuedPriority = this.queuedVoice ? VOICE_CUES[this.queuedVoice.id].trigger.priority : 0;
        if (!this.queuedVoice || cue.trigger.priority > queuedPriority) this.queuedVoice = { id, treatment };
        return;
      }
      this.cancelCurrentVoice(false);
    }

    this.lastVoicePlayed.set(id, now);
    const requestSerial = ++this.voiceRequestSerial;
    this.loadingVoicePriority = cue.trigger.priority;
    void this.loadVoice(id).then((buffer) => {
      if (requestSerial !== this.voiceRequestSerial) return;
      const context = this.context;
      const voiceOutput = this.voiceGain;
      this.loadingVoicePriority = 0;
      if (!context || !voiceOutput || this.volume <= 0) {
        this.playQueuedVoice();
        return;
      }

      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const selected = treatment ?? cue.treatment;
      source.buffer = buffer;
      gain.gain.value = cue.volume;
      this.configureVoiceFilter(filter, selected);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(voiceOutput);

      const sfxOutput = this.sfxGain;
      if (sfxOutput) {
        const time = context.currentTime;
        sfxOutput.gain.cancelScheduledValues(time);
        sfxOutput.gain.setTargetAtTime(0.48 * this.effectsVolume, time, 0.045);
      }
      this.activeVoice = source;
      this.activeVoicePriority = cue.trigger.priority;
      source.onended = () => {
        if (this.activeVoice !== source) return;
        this.activeVoice = undefined;
        this.activeVoicePriority = 0;
        this.restoreSfxGain();
        this.playQueuedVoice();
      };
      source.start();
    }).catch(() => {
      if (requestSerial !== this.voiceRequestSerial) return;
      this.loadingVoicePriority = 0;
      this.playQueuedVoice();
    });
  }

  stopVoice(): void {
    this.queuedVoice = undefined;
    this.cancelCurrentVoice(true);
  }

  private cancelCurrentVoice(clearLoading: boolean): void {
    this.voiceRequestSerial += 1;
    if (clearLoading || this.loadingVoicePriority > 0) this.loadingVoicePriority = 0;
    const source = this.activeVoice;
    this.activeVoice = undefined;
    this.activeVoicePriority = 0;
    if (source) {
      try { source.stop(); } catch { /* Already stopped. */ }
    }
    this.restoreSfxGain();
  }

  private playQueuedVoice(): void {
    const queued = this.queuedVoice;
    this.queuedVoice = undefined;
    if (queued) this.playVoice(queued.id, queued.treatment);
  }

  private restoreSfxGain(): void {
    if (!this.sfxGain || !this.context) return;
    const time = this.context.currentTime;
    this.sfxGain.gain.cancelScheduledValues(time);
    this.sfxGain.gain.setTargetAtTime(this.effectsVolume, time, 0.12);
  }

  private async loadVoice(id: VoiceCueId): Promise<AudioBuffer> {
    const cached = this.voiceBuffers.get(id);
    if (cached) return cached;
    if (this.unavailableVoices.has(id)) throw new Error(`voice unavailable: ${id}`);
    const pending = this.voiceLoads.get(id);
    if (pending) return pending;
    const load = this.loadBuffer(VOICE_CUES[id].file).then((buffer) => {
      this.voiceBuffers.set(id, buffer);
      return buffer;
    });
    this.voiceLoads.set(id, load);
    try {
      return await load;
    } catch (error) {
      this.unavailableVoices.add(id);
      throw error;
    } finally {
      this.voiceLoads.delete(id);
    }
  }

  private configureVoiceFilter(filter: BiquadFilterNode, treatment: VoiceTreatment): void {
    if (treatment === 'phone') {
      filter.type = 'bandpass'; filter.frequency.value = 1700; filter.Q.value = 0.72;
    } else if (treatment === 'pa') {
      filter.type = 'highpass'; filter.frequency.value = 220; filter.Q.value = 0.55;
    } else if (treatment === 'behind-door') {
      filter.type = 'lowpass'; filter.frequency.value = 1050; filter.Q.value = 0.5;
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

  private tone(
    frequency: number,
    durationMs: number,
    gainValue: number,
    type: OscillatorType,
    endFrequency: number,
    delaySeconds = 0,
  ): void {
    const context = this.context;
    const output = this.sfxGain ?? this.masterGain;
    if (!context || !output) return;
    const start = context.currentTime + delaySeconds;
    const end = start + durationMs / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(gainValue, start + Math.min(0.018, durationMs / 4000));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(start);
    oscillator.stop(end + 0.01);
  }
}
