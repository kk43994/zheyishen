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
const DEFAULT_AUDIO_MIGRATION_KEY = 'zhe-yi-shen:default-audio-v2';
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

const SFX_GAIN: Record<LifeSound, number> = {
  page: 0.52,
  breath: 0.34,
  hit: 0.48,
  hurt: 0.58,
  coin: 0.48,
  wear: 0.46,
  swallow: 0.52,
  exhale: 0.42,
  boss: 0.64,
  deny: 0.5,
};

const AMBIENCE_FILES = [
  'assets/audio/ambience/childhood-room.mp3',
  'assets/audio/ambience/classroom.mp3',
  'assets/audio/ambience/station.mp3',
  'assets/audio/ambience/apartment.mp3',
  'assets/audio/ambience/office.mp3',
  'assets/audio/ambience/hospital.mp3',
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

function media(file: string): HTMLAudioElement {
  const element = document.createElement('audio');
  element.preload = 'auto';
  element.src = new URL(file, document.baseURI).href;
  return element;
}

export class LifeFeedback {
  private volume = readInitialVolume();
  private effectsVolume = Math.max(0, Math.min(1, readNumber(EFFECTS_VOLUME_KEY, 1)));
  private ambienceVolume = Math.max(0, Math.min(1, readNumber(AMBIENCE_VOLUME_KEY, 1)));
  private voiceVolume = Math.max(0, Math.min(1, readNumber(VOICE_VOLUME_KEY, 1)));
  private haptics = readBoolean(HAPTICS_KEY, true);
  private unlocked = false;
  private readonly lastPlayed = new Map<LifeSound, number>();
  private readonly sfxPools = new Map<LifeSound, HTMLAudioElement[]>();
  private readonly ambiencePlayers = new Map<number, HTMLAudioElement>();
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

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const sound of Object.keys(SFX_FILES) as LifeSound[]) this.ensureSfxPool(sound);
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
    this.refreshActiveVolumes();
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
      context: this.unlocked ? 'running' : 'suspended',
      sfxReady: this.sfxPools.size,
      ambienceReady: this.ambiencePlayers.size,
      requestedAmbience: this.requestedAmbience ?? null,
      activeAmbience: this.activeAmbienceStage ?? null,
      voiceReady: this.voicePlayers.size,
      mix: {
        effects: this.effectsVolume,
        ambience: this.ambienceVolume,
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
    } else {
      this.stopVoice();
      this.stopAmbience(true);
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
    } else if (!wasSilent && this.volume <= 0) {
      this.stopVoice();
      this.stopAmbience(false);
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
    if (now - (this.lastPlayed.get(sound) ?? -Infinity) < throttle || this.volume <= 0) return;
    this.lastPlayed.set(sound, now);
    this.unlock();
    const pool = this.ensureSfxPool(sound);
    const player = pool.find((entry) => entry.paused || entry.ended) ?? pool[0];
    if (!player) return;
    player.pause();
    player.currentTime = 0;
    player.volume = Math.max(0, Math.min(1, SFX_GAIN[sound] * intensity * this.volume * this.effectsVolume));
    player.playbackRate = sound === 'boss' || sound === 'deny'
      ? 1
      : Math.max(0.92, Math.min(1.08, 1 + (Math.random() - 0.5) * 0.045));
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

  preloadVoices(ids: readonly VoiceCueId[]): void {
    this.unlock();
    for (const id of ids) this.ensureVoice(id);
  }

  playVoice(id: VoiceCueId, treatment?: VoiceTreatment): void {
    const cue = VOICE_CUES[id];
    const now = performance.now();
    if (now - (this.lastVoicePlayed.get(id) ?? -Infinity) < cue.cooldownMs || this.volume <= 0) return;
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
    player.playbackRate = treatment === 'swallowed' ? 0.96 : treatment === 'exhaled' ? 1.02 : 1;
    this.activeVoiceBaseVolume = cue.volume;
    player.volume = Math.max(0, Math.min(1, this.activeVoiceBaseVolume * this.volume * this.voiceVolume));
    this.activeVoice = player;
    this.activeVoicePriority = cue.trigger.priority;
    player.onended = () => {
      if (this.activeVoice !== player || serial !== this.voiceRequestSerial) return;
      this.activeVoice = undefined;
      this.activeVoiceBaseVolume = 0;
      this.activeVoicePriority = 0;
      this.playQueuedVoice();
    };
    void player.play().catch(() => {
      if (serial !== this.voiceRequestSerial) return;
      this.activeVoice = undefined;
      this.activeVoiceBaseVolume = 0;
      this.activeVoicePriority = 0;
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

  private syncAmbience(): void {
    const stage = this.requestedAmbience;
    if (stage === undefined || this.volume <= 0 || stage === this.activeAmbienceStage) return;
    const previous = this.activeAmbience;
    if (previous) {
      previous.pause();
      previous.currentTime = 0;
    }
    const player = this.ensureAmbience(stage);
    player.volume = Math.max(0, Math.min(1, this.volume * 0.58 * this.ambienceVolume));
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

  private cancelCurrentVoice(): void {
    this.voiceRequestSerial += 1;
    const player = this.activeVoice;
    this.activeVoice = undefined;
    this.activeVoiceBaseVolume = 0;
    this.activeVoicePriority = 0;
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
    if (this.activeAmbience) this.activeAmbience.volume = Math.max(0, Math.min(1, this.volume * 0.58 * this.ambienceVolume));
    if (this.activeVoice) {
      this.activeVoice.volume = Math.max(0, Math.min(1, this.activeVoiceBaseVolume * this.volume * this.voiceVolume));
    }
  }
}
