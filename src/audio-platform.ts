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
  breath: 0.34,
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
      for (const sound of Object.keys(SFX_FILES) as LifeSound[]) this.ensureSfxPool(sound);
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
      this.stopAmbience(true);
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
    if (now - (this.lastPlayed.get(sound) ?? -Infinity) < throttle || this.volume <= 0) return;
    this.lastPlayed.set(sound, now);
    this.unlock();
    const pool = this.ensureSfxPool(sound);
    const player = pool.find((entry) => entry.paused || entry.ended) ?? pool[0];
    if (!player) return;
    player.pause();
    player.currentTime = 0;
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
    if (stage === undefined || this.volume <= 0 || stage === this.activeAmbienceStage) return;
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
    if (track === undefined || this.volume <= 0) return;
    if (track === this.activeMusicTrack && this.activeMusic && !this.activeMusic.paused) return;
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
    if (!this.musicTension || this.volume <= 0) return;
    if (this.activeTension && !this.activeTension.paused) return;
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
