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
const HAPTICS_KEY = 'zhe-yi-shen:haptics';

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
  private volume = Math.max(0, Math.min(1, readNumber(VOLUME_KEY, 0.42)));
  private haptics = readBoolean(HAPTICS_KEY, true);
  private readonly lastPlayed = new Map<LifeSound, number>();

  unlock(): void {
    if (!this.context && typeof AudioContext !== 'undefined') {
      try {
        this.context = new AudioContext();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.context.destination);
      } catch {
        this.context = undefined;
        this.masterGain = undefined;
      }
    }
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  getVolume(): number {
    return this.volume;
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    }
    try {
      localStorage.setItem(VOLUME_KEY, this.volume.toFixed(2));
    } catch {
      // Persistence is optional in restricted webviews.
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

  private tone(
    frequency: number,
    durationMs: number,
    gainValue: number,
    type: OscillatorType,
    endFrequency: number,
    delaySeconds = 0,
  ): void {
    const context = this.context;
    const output = this.masterGain;
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
