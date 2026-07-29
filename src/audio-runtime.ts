import { LifeFeedback as BufferedLifeFeedback } from './audio';
import { LifeFeedback as PlatformLifeFeedback } from './audio-platform';

// 两套实现的音效枚举必须一致；对外只暴露一份，避免调用方从其中一侧引用而漂移。
export type { LifeSound, AudioMixChannel } from './audio-platform';

// Production runs in the offline Interactive Space WebView. Native media
// elements load relative assets without forbidden fetch/XHR calls.
export const LifeFeedback = import.meta.env.MODE === 'production'
  ? PlatformLifeFeedback
  : BufferedLifeFeedback;
