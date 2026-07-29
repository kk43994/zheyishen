/**
 * 音频开销计数器。互动空间 WebView 里的媒体解码/起播/seek 不计入主线程长任务
 * （真机上量到过「长任务 0 次 / 0ms」却只有 25.6 FPS），所以光看性能面板的长任务
 * 一栏永远发现不了音频问题。这里单独把它数出来，交给「性能物证」面板显示。
 *
 * 只做计数，不参与播放逻辑；平台版音频实现（audio-platform.ts）负责写入。
 */

interface AudioProbeState {
  /** 累计创建的 HTMLAudioElement 个数（创建后基本不会释放）。 */
  elements: number;
  /** 当前正在播放的元素个数，由采样时回调统计。 */
  playing: () => number;
  /** play() 调用累计次数。 */
  playCalls: number;
  /** currentTime 赋值（真 seek）累计次数。 */
  seeks: number;
  /** 因通道静音而被跳过的播放次数——用来验证静音短路是否真的生效。 */
  skippedMuted: number;
}

const state: AudioProbeState = {
  elements: 0,
  playing: () => 0,
  playCalls: 0,
  seeks: 0,
  skippedMuted: 0,
};

export function probeElementCreated(): void {
  state.elements += 1;
}

export function probePlay(): void {
  state.playCalls += 1;
}

export function probeSeek(): void {
  state.seeks += 1;
}

export function probeSkippedMuted(): void {
  state.skippedMuted += 1;
}

export function probeRegisterPlayingCounter(fn: () => number): void {
  state.playing = fn;
}

export interface AudioProbeReport {
  elements: number;
  playing: number;
  playCalls: number;
  seeks: number;
  skippedMuted: number;
  /** 距上次读取的每秒速率，读取时重置。 */
  playsPerSecond: number;
  seeksPerSecond: number;
}

let lastReadAt = 0;
let lastPlayCalls = 0;
let lastSeeks = 0;

export function readAudioProbe(now: number): AudioProbeReport {
  const elapsed = lastReadAt ? Math.max(0.001, (now - lastReadAt) / 1000) : 0;
  const playsPerSecond = elapsed ? (state.playCalls - lastPlayCalls) / elapsed : 0;
  const seeksPerSecond = elapsed ? (state.seeks - lastSeeks) / elapsed : 0;
  lastReadAt = now;
  lastPlayCalls = state.playCalls;
  lastSeeks = state.seeks;
  return {
    elements: state.elements,
    playing: state.playing(),
    playCalls: state.playCalls,
    seeks: state.seeks,
    skippedMuted: state.skippedMuted,
    playsPerSecond,
    seeksPerSecond,
  };
}
