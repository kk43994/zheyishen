/**
 * 游戏运行时唯一的混音标尺。
 *
 * 素材不会天然处在同一响度：配乐约为 -18…-25 LUFS，环境循环约为
 * -29…-38 LUFS，短音效还会因持续时间过短而无法可靠使用 LUFS 衡量。
 * 因此这里同时保存声部总线与逐素材补偿；audio.ts / audio-platform.ts
 * 必须共同读取，避免“开发环境正常、正式包忽大忽小”。
 */
export const VOICE_PLAYBACK_GAIN = 1.18;
export const VOICE_SFX_DUCK = 0.58;
export const VOICE_AMBIENCE_DUCK = 0.82;
export const VOICE_MUSIC_DUCK = 0.55;

/**
 * “门后”要保留空间距离，但不能牺牲中文辅音的可懂度。
 * 旧值 1050Hz 会把“灯、明天、上学”等字头削得发糊；2400Hz
 * 仍明显比直达声暗，同时能让手机扬声器听清台词。
 */
export const VOICE_BEHIND_DOOR_LOW_PASS_HZ = 2400;
export const VOICE_BEHIND_DOOR_FILTER_Q = 0.35;

/**
 * 0.42 是旧版素材未经统一校准时留下的总音量。分轨校准后若继续沿用，
 * 手机扬声器会把场景声和短音效压到近似静音；0.68 给整体补回约 4.2 dB，
 * 相对混音仍由下方各总线与素材增益决定。
 */
export const DEFAULT_MASTER_VOLUME = 0.68;
export const LEGACY_MASTER_VOLUME = 0.42;
export const DEFAULT_MUSIC_VOLUME = 0.42;

export function upgradeLegacyMasterVolume(volume: number): number {
  return Math.abs(volume - LEGACY_MASTER_VOLUME) <= 0.005
    ? DEFAULT_MASTER_VOLUME
    : volume;
}

/**
 * 默认 68% 总音量下的目标：
 * - 对白保持此前确认的主体响度
 * - 配乐有效振幅约为主对白的三分之一，平时约 -33 LUFS
 * - 环境床约 -35…-37 LUFS
 * - 紧张层比主配乐约低 3 dB
 *
 * 对白期间环境仅退约 1.7 dB，保留空间；配乐退约 5.2 dB。
 */
export const SFX_BUS_GAIN = 1;
export const AMBIENCE_BUS_GAIN = 1.35;
export const MUSIC_BUS_GAIN = 0.8;
export const TENSION_BUS_GAIN = 0.56;

/**
 * 将十条配乐的素材响度拉到约 -20 LUFS 的共同参考点。
 * 数组顺序必须与两套运行时的 MUSIC_FILES 一致。
 */
const MUSIC_ASSET_GAINS = [
  0.82, // first-breath      -18.3 LUFS
  0.90, // under-bed         -19.1 LUFS; forward music-box timbre, level-matched to -20 LUFS
  0.86, // red-marks         -18.7 LUFS
  0.94, // missed-train      -19.5 LUFS
  0.81, // lukewarm-home     -18.2 LUFS
  0.97, // fluorescent-name  -19.7 LUFS
  1.02, // last-lamp         -20.2 LUFS
  0.83, // after-breath      -18.4 LUFS
  1.75, // folded-fate       -24.9 LUFS
  1.74, // borrowed-room     -24.8 LUFS
] as const;

/** pressure 素材约 -24.9 LUFS，补到与章节配乐相同的参考点。 */
export const TENSION_ASSET_GAIN = 1.75;

/**
 * 环境循环先校正素材本身的 8.7 dB 偏差，再由 audio-ambience.ts 的
 * profile.level 保留章节空间远近；特殊房间仍会比六章主场景更轻。
 */
const AMBIENCE_ASSET_GAINS = [
  0.57, // childhood-room -> 约 -35 LUFS
  1.24, // classroom      -> 约 -31.3 LUFS，旧课堂素材需高于配乐床才可辨
  1.18, // station        -> 约 -35 LUFS
  1.56, // apartment      -> 约 -35 LUFS
  0.8,  // office         -> 约 -35 LUFS
  1.51, // hospital       -> 约 -35 LUFS
  1.8,  // fate-chamber   -> 约 -37 LUFS
  1.63, // back-room      -> 约 -37 LUFS
  1.26, // light-room     -> 约 -37 LUFS
] as const;

/**
 * 短音效按“可感知主体 + 峰值”校正，不用不适合瞬态素材的单一 LUFS。
 * 重点压住过响的 Boss/拾取峰值，同时抬起电话、预警、治疗等玩法提示。
 */
const SFX_MIX_GAINS: Readonly<Record<string, number>> = {
  page: 0.5,
  breath: 1,
  hit: 0.64,
  hurt: 0.58,
  coin: 0.9,
  wear: 0.7,
  swallow: 0.8,
  exhale: 0.82,
  boss: 0.5,
  'boss-warn': 1.7,
  'boss-release': 0.9,
  'boss-hit': 0.74,
  deny: 0.5,
  phone: 2,
  train: 1.4,
  monitor: 1.6,
  'pickup-paper': 0.28,
  'pickup-cloth': 0.7,
  'pickup-metal': 0.8,
  'pickup-coin': 0.28,
  shield: 0.9,
  heal: 2.2,
  dash: 0.55,
  door: 0.75,
  lamp: 0.95,
};

export function musicAssetGain(track: number): number {
  return MUSIC_ASSET_GAINS[Math.max(0, Math.min(MUSIC_ASSET_GAINS.length - 1, Math.floor(track)))] ?? 1;
}

export function ambienceAssetGain(stage: number): number {
  return AMBIENCE_ASSET_GAINS[
    Math.max(0, Math.min(AMBIENCE_ASSET_GAINS.length - 1, Math.floor(stage)))
  ] ?? 1;
}

export function sfxMixGain(sound: string): number {
  return SFX_MIX_GAINS[sound] ?? 0.5;
}
