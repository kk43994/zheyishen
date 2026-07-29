/**
 * 道具材质分类。
 *
 * 77 件道具共用同一个 `wear` 拾取音，听起来全都一样——纸条和钥匙、碗和雨衣
 * 没有任何区别。补素材要等外部授权，但音色差异其实不必靠新素材：
 * 同一段采样换音高、过不同的滤波器，纸/布/金属/玻璃/塑料就能分得开。
 *
 * 这里只负责「这件东西是什么做的」，具体怎么变声由 audio-platform 的 SfxEngine 决定。
 * 分类走名称关键词，命中不了的落到 OVERRIDES；两者都没有就按品质给一个中性音色。
 */
import type { ItemId } from './types';

export type ItemMaterial = 'paper' | 'cloth' | 'metal' | 'glass' | 'plastic' | 'flesh' | 'neutral';

/**
 * 关键词表。顺序即优先级——先匹配到的赢，所以更具体的词要排在更宽泛的词前面
 * （「手机」必须排在「机」之前，否则「打印机」会被判成塑料）。
 */
const KEYWORD_RULES: Array<[ItemMaterial, readonly string[]]> = [
  ['paper', ['信', '纸', '卡', '照', '书', '本', '票', '单', '条', '证', '册', '报', '通知', '协议', '简历', '合同', '试卷', '作业', '奖状']],
  ['glass', ['碗', '镜', '瓶', '杯', '灯泡', '屏', '玻璃', '眼镜', '镜片']],
  ['metal', ['钥匙', '刀', '牌', '架', '锁', '针', '链', '扣', '硬币', '零钱', '勺', '铁', '钢', '螺丝', '发卡']],
  ['plastic', ['手机', '耳机', '充电', '塑料', '袋', '瓶盖', '遥控', '电子', '键盘', '鼠标', '光盘', '磁带']],
  ['cloth', ['衣', '雨衣', '袜', '巾', '帽', '围', '被', '枕', '布', '鞋', '带', '包', '兜', '毛']],
  ['flesh', ['牙', '发', '手', '影子', '气', '呼吸', '心', '血', '泪', '汗']],
];

/**
 * 关键词判错时的显式覆盖。名称里的字未必反映实物材质——
 * 「一直没有换的家门锁」按关键词是金属（对），但「少了一个人的合照」里的「照」
 * 是纸没错，而「当年最强的那张脸」这类抽象物就得人工指定。
 */
const OVERRIDES: Partial<Record<ItemId, ItemMaterial>> = {
  // 关键词撞车：名字里的字不等于实物材质
  'slow-watch': 'metal',        // 「手」表 —— 撞了 flesh 的「手」
  'bargain-link': 'neutral',    // 砍一「刀」的「链」接 —— 是个链接，不是金属
  'red-packet': 'paper',        // 红「包」 —— 撞了 cloth 的「包」
  'ruma-msg': 'neutral',        // 朋友发来的「在吗」 —— 撞了 flesh 的「发」
  'gym-card': 'plastic',        // 年「卡」 —— 实物是塑料卡不是纸
  // 名字里没有材质线索，但实物很明确
  'iphone-17-pro-max': 'glass',
  'unsent-phone': 'plastic',
  'snow-screen': 'glass',
};

export function itemMaterialOf(id: ItemId, name: string): ItemMaterial {
  const override = OVERRIDES[id];
  if (override) return override;
  for (const [material, keywords] of KEYWORD_RULES) {
    if (keywords.some((keyword) => name.includes(keyword))) return material;
  }
  return 'neutral';
}

/**
 * 每种材质的发声塑形：音高倍率 + 滤波类型 + 截止频率。
 *
 * 取值的想法是「这东西被拿起来时是什么动静」：
 * 纸轻而脆，抬高音高并砍掉低频；布是闷的，低通压掉高频；
 * 金属亮而长，高频抬起来；玻璃比金属更尖更窄；塑料介于纸与金属之间但更钝。
 */
export interface MaterialTone {
  rate: number;
  filterType: BiquadFilterType;
  frequency: number;
  q: number;
}

export const MATERIAL_TONES: Record<ItemMaterial, MaterialTone> = {
  paper: { rate: 1.18, filterType: 'highpass', frequency: 900, q: 0.7 },
  cloth: { rate: 0.9, filterType: 'lowpass', frequency: 1400, q: 0.6 },
  metal: { rate: 1.32, filterType: 'highshelf', frequency: 2600, q: 0.9 },
  glass: { rate: 1.46, filterType: 'bandpass', frequency: 3200, q: 1.6 },
  plastic: { rate: 1.06, filterType: 'lowpass', frequency: 2600, q: 0.8 },
  flesh: { rate: 0.82, filterType: 'lowpass', frequency: 1000, q: 0.5 },
  neutral: { rate: 1, filterType: 'lowpass', frequency: 18_000, q: 0 },
};
