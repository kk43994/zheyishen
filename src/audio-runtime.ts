import { LifeFeedback as BufferedLifeFeedback } from './audio';
import { LifeFeedback as PlatformLifeFeedback } from './audio-platform';

// Production runs in the offline Interactive Space WebView. Native media
// elements load relative assets without forbidden fetch/XHR calls.
export const LifeFeedback = import.meta.env.MODE === 'production'
  ? PlatformLifeFeedback
  : BufferedLifeFeedback;
