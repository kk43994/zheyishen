export type HapticPattern = number | number[];
export type HapticMode = 'vibration-api' | 'ios-switch' | 'unavailable';

let iosSwitch: HTMLInputElement | null = null;
let lastIOSPulseAt = -Infinity;
const iosPatternTimers = new Set<number>();

function appleOSMajorVersion(): number {
  const osMatch = navigator.userAgent.match(/OS (\d+)[_.]/i);
  if (osMatch?.[1]) return Number.parseInt(osMatch[1], 10);
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    const safariMatch = navigator.userAgent.match(/Version\/(\d+)/i);
    if (safariMatch?.[1]) return Number.parseInt(safariMatch[1], 10);
  }
  return 0;
}

function supportsIOSSwitchHaptics(): boolean {
  const appleTouch = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return appleTouch && appleOSMajorVersion() >= 18;
}

function ensureIOSSwitch(): HTMLInputElement | null {
  if (!supportsIOSSwitchHaptics()) return null;
  if (iosSwitch?.isConnected) return iosSwitch;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  input.className = 'ios-haptic-switch';
  document.body.appendChild(input);
  iosSwitch = input;
  return input;
}

function pulseIOSSwitch(): boolean {
  const now = performance.now();
  if (now - lastIOSPulseAt < 45) return false;
  const input = ensureIOSSwitch();
  if (!input) return false;
  lastIOSPulseAt = now;
  input.click();
  return true;
}

function scheduleIOSPattern(pattern: HapticPattern): boolean {
  const sequence = (Array.isArray(pattern) ? pattern : [pattern])
    .map((value) => Math.max(0, Math.min(1000, Math.round(value))));
  if (sequence.length === 0 || sequence.every((value) => value === 0)) return false;
  const first = pulseIOSSwitch();
  let elapsed = 0;
  let emitted = 1;
  for (let index = 0; index < sequence.length - 1 && emitted < 5; index += 2) {
    elapsed += (sequence[index] ?? 0) + (sequence[index + 1] ?? 0);
    if (index + 2 >= sequence.length || elapsed > 2400) break;
    const timer = window.setTimeout(() => {
      iosPatternTimers.delete(timer);
      pulseIOSSwitch();
    }, elapsed);
    iosPatternTimers.add(timer);
    emitted += 1;
  }
  return first;
}

export function hapticMode(): HapticMode {
  if (typeof navigator.vibrate === 'function') return 'vibration-api';
  if (supportsIOSSwitchHaptics()) return 'ios-switch';
  return 'unavailable';
}

export function triggerHaptic(pattern: HapticPattern): boolean {
  if (typeof navigator.vibrate === 'function') {
    try {
      if (navigator.vibrate(pattern)) return true;
    } catch {
      // Fall through to the Apple switch control where available.
    }
  }
  return scheduleIOSPattern(pattern);
}

export function cancelHaptics(): void {
  for (const timer of iosPatternTimers) window.clearTimeout(timer);
  iosPatternTimers.clear();
  if (typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(0);
    } catch {
      // Haptics are best effort only.
    }
  }
}
