/**
 * 世界坐标危险带。
 *
 * 少年章《统一答案》的《标准答案》（三条判分线，只有一条是对的）与
 * 《卷子往后传》（一整排推过来，留一个缺口）都建立在它上面。
 *
 * 必须用**世界坐标**，不能用屏幕坐标：主角固定绘制在屏幕 (180, 310)，
 * 屏幕空间的水平带会永远命中他，玩家无论怎么走位都躲不开。
 */

export interface DangerBand {
  /** 带中心的世界 y */
  y: number;
  /** 带的厚度（总高） */
  height: number;
  /** 沿 x 的中心与半宽；半宽足够大即视为横贯全场 */
  centerX: number;
  halfWidth: number;
  /** 前摇剩余秒数：>0 时只预警不伤人 */
  warn: number;
  /** 生效剩余秒数 */
  active: number;
  /** 命中伤害 */
  damage: number;
  /**
   * 安全带：《标准答案》里唯一"对"的那一条。
   * 视觉上颜色略浅，不造成伤害——玩家要认出它并站进去。
   */
  safe: boolean;
  /** 纵向扫动速度，用于《卷子往后传》整排推进 */
  vy: number;
  color: string;
  /** `stamp` 用于路径重放：离散红叉印，不能连成判分线或网格。 */
  visual: 'band' | 'stamp';
  /** 已经打过玩家一次，避免同一条带每帧连续结算 */
  hit: boolean;
}

export interface DangerBandSpec {
  y: number;
  height: number;
  centerX: number;
  halfWidth?: number;
  warn?: number;
  active?: number;
  damage?: number;
  safe?: boolean;
  vy?: number;
  color?: string;
  visual?: 'band' | 'stamp';
}

export function createDangerBand(spec: DangerBandSpec): DangerBand {
  return {
    y: spec.y,
    height: spec.height,
    centerX: spec.centerX,
    halfWidth: spec.halfWidth ?? 460,
    warn: spec.warn ?? 1,
    active: spec.active ?? 0.5,
    damage: spec.damage ?? 6,
    safe: spec.safe ?? false,
    vy: spec.vy ?? 0,
    color: spec.color ?? '#c46672',
    visual: spec.visual ?? 'band',
    hit: false,
  };
}

/** 推进一帧。返回仍然存活的带。 */
export function updateDangerBands(bands: DangerBand[], dt: number): DangerBand[] {
  for (const band of bands) {
    if (band.warn > 0) band.warn = Math.max(0, band.warn - dt);
    else {
      band.active -= dt;
      band.y += band.vy * dt;
    }
  }
  return bands.filter((band) => band.warn > 0 || band.active > 0);
}

/** 生效中的带是否罩住了这个点。安全带永远返回 false。 */
export function dangerBandHits(band: DangerBand, x: number, y: number): boolean {
  if (band.safe || band.warn > 0 || band.active <= 0 || band.hit) return false;
  if (Math.abs(y - band.y) > band.height / 2) return false;
  return Math.abs(x - band.centerX) <= band.halfWidth;
}

/**
 * 画一条带。前摇期只画描边与斜纹，生效期填色。
 * 传入的 ctx 已经处于世界坐标（调用方做过 translate）。
 */
export function renderDangerBand(ctx: CanvasRenderingContext2D, band: DangerBand): void {
  const top = band.y - band.height / 2;
  const left = band.centerX - band.halfWidth;
  const width = band.halfWidth * 2;
  ctx.save();
  if (band.visual === 'stamp') {
    const active = band.warn <= 0 && band.active > 0;
    const inset = active ? 1 : 3;
    const alpha = active ? 0.78 : 0.38 + Math.min(0.32, band.warn * 0.22);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = band.color;
    ctx.lineWidth = active ? 3 : 2;
    ctx.strokeRect(left + inset, top + inset, width - inset * 2, band.height - inset * 2);
    ctx.beginPath();
    ctx.moveTo(left + 5, top + 5);
    ctx.lineTo(left + width - 5, top + band.height - 5);
    ctx.moveTo(left + width - 5, top + 5);
    ctx.lineTo(left + 5, top + band.height - 5);
    ctx.stroke();
    if (active) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = band.color;
      ctx.fillRect(left + 2, top + 2, width - 4, band.height - 4);
    }
    ctx.restore();
    return;
  }
  if (band.warn > 0) {
    // 前摇：贴花语言——上下浓、中间透的纵向渐变 + 连续双层边线。
    // 安全带必须**看得出来是一条带**，否则玩家只能靠躲开红的去推断，
    // 读不出"哪条是对的"——那就不是《标准答案》，只是躲弹幕。
    const gradient = ctx.createLinearGradient(0, top, 0, top + band.height);
    gradient.addColorStop(0, band.color + (band.safe ? '55' : '44'));
    gradient.addColorStop(0.5, band.color + (band.safe ? '2e' : '14'));
    gradient.addColorStop(1, band.color + (band.safe ? '55' : '44'));
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(left, top, width, band.height);
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#171013';
    ctx.lineWidth = 4;
    ctx.strokeRect(left, top, width, band.height);
    ctx.globalAlpha = band.safe ? 0.9 : 0.68;
    ctx.strokeStyle = band.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, width, band.height);
  } else if (band.active > 0 && !band.safe) {
    ctx.globalAlpha = 0.46;
    ctx.fillStyle = band.color;
    ctx.fillRect(left, top, width, band.height);
    ctx.globalAlpha = 0.92;
    ctx.fillRect(left, top, width, 2);
    ctx.fillRect(left, top + band.height - 2, width, 2);
  } else if (band.active > 0 && band.safe) {
    // 安全带生效时只留一道很浅的边，提示"这条是对的"
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = band.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, width, band.height);
  }
  ctx.restore();
}
