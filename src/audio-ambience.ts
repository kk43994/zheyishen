/**
 * 六章与三个特殊场景共用同一套轻量声场参数。
 *
 * 每章仍只解码一条既有循环：一个 BiquadFilter + 克制的速率/电平差异足以把
 * 雨夜卧室、教室、站台等空间拉开，同时不增加 production WebView 的媒体流、
 * 网络请求或循环接缝。这里是 buffered / platform 两套音频实现的唯一参数源。
 */
export interface AmbienceProfile {
  readonly label: string;
  readonly playbackRate: number;
  readonly level: number;
  readonly filter: {
    readonly type: BiquadFilterType;
    readonly frequency: number;
    readonly q: number;
    readonly gain?: number;
  };
}

export const AMBIENCE_PROFILES: readonly AmbienceProfile[] = [
  {
    label: '雨夜卧室 · 温暖近窗',
    playbackRate: 0.994,
    level: 0.96,
    filter: { type: 'lowpass', frequency: 4_200, q: 0.2 },
  },
  {
    label: '教室 · 人声较亮',
    playbackRate: 1.004,
    level: 1,
    filter: { type: 'highpass', frequency: 95, q: 0.25 },
  },
  {
    label: '地下站台 · 保留低频',
    playbackRate: 0.998,
    level: 0.92,
    filter: { type: 'lowshelf', frequency: 180, q: 0, gain: 2.2 },
  },
  {
    label: '住处 · 隔墙收窄',
    playbackRate: 0.996,
    level: 0.88,
    filter: { type: 'lowpass', frequency: 3_100, q: 0.25 },
  },
  {
    label: '办公室 · 冷硬开阔',
    playbackRate: 1.003,
    level: 0.82,
    filter: { type: 'highpass', frequency: 125, q: 0.35 },
  },
  {
    label: '医院 · 空走廊',
    playbackRate: 0.997,
    level: 0.82,
    filter: { type: 'peaking', frequency: 780, q: 0.55, gain: -2 },
  },
  {
    label: '命运事件 · 纸页悬空',
    playbackRate: 0.995,
    level: 0.66,
    filter: { type: 'lowpass', frequency: 2_800, q: 0.3 },
  },
  {
    label: '里屋 · 木响与远脚步',
    playbackRate: 0.992,
    level: 0.72,
    filter: { type: 'lowpass', frequency: 3_300, q: 0.4 },
  },
  {
    label: '留灯间 · 灯芯近响',
    playbackRate: 1.002,
    level: 0.68,
    filter: { type: 'highpass', frequency: 135, q: 0.25 },
  },
] as const;

export function ambienceProfile(stage: number): AmbienceProfile {
  const index = Math.max(0, Math.min(AMBIENCE_PROFILES.length - 1, Math.floor(stage)));
  return AMBIENCE_PROFILES[index]!;
}

export function configureAmbienceFilter(
  filter: BiquadFilterNode,
  profile: AmbienceProfile,
): void {
  filter.type = profile.filter.type;
  filter.frequency.value = profile.filter.frequency;
  filter.Q.value = profile.filter.q;
  filter.gain.value = profile.filter.gain ?? 0;
}
