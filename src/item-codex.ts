// 《物证册》：游戏内道具图鉴。零新增美术——图标走 icons.png 精灵图，
// 收录状态由名册(zys-ledger-v1)与本册存档共同推导；DOM 抽屉层不进 canvas。
import iconManifest from './assets/items/icons.json';
import { comboArtAtlas } from './combo-art';
import { ITEM_DEFINITIONS, ITEM_IDS } from './relics';
import { readLifeLedger } from './run-ledger';
import type { ItemDefinition, ItemId } from './types';

const CODEX_KEY = 'zys-codex-v1';
const ICONS_URL = new URL('./assets/items/icons.png', import.meta.url).href;

interface CodexFirstRecord {
  life: number;
  nickname: string;
}

interface CodexStore {
  lives: number;
  first: Partial<Record<ItemId, CodexFirstRecord>>;
}

export interface CodexComboInfo {
  name: string;
  artKey: string;
  items: readonly ItemId[];
  line: string;
}

export interface CodexOpenOptions {
  combos: readonly CodexComboInfo[];
  /** 未收录剪影允许透出的唯一线索：来源（如"里屋"）。 */
  sourceHint: (id: ItemId) => string;
  /** 本局跨人生首次收录的道具（格子上盖红点「新」）。 */
  freshIds?: readonly ItemId[];
  playPageSound?: () => void;
  onClose?: () => void;
}

let cachedStore: CodexStore | null = null;

function sanitizeStore(value: unknown): CodexStore | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { lives?: unknown; first?: unknown };
  if (typeof raw.lives !== 'number' || !Number.isFinite(raw.lives)) return null;
  const first: CodexStore['first'] = {};
  if (raw.first && typeof raw.first === 'object') {
    for (const [id, entry] of Object.entries(raw.first as Record<string, unknown>)) {
      if (!ITEM_IDS.includes(id as ItemId)) continue;
      const record = entry as { life?: unknown; nickname?: unknown };
      if (typeof record.life !== 'number' || !Number.isFinite(record.life)) continue;
      first[id as ItemId] = {
        life: Math.max(0, Math.floor(record.life)),
        nickname: typeof record.nickname === 'string' ? record.nickname.slice(0, 32) : '',
      };
    }
  }
  return { lives: Math.max(0, Math.floor(raw.lives)), first };
}

/** 名册早于物证册存在；首次加载时用名册倒推每件的初遇世数。 */
function seedFromLedger(): CodexStore {
  const store: CodexStore = { lives: 0, first: {} };
  const ledger = readLifeLedger();
  store.lives = ledger.length;
  const oldestFirst = [...ledger].reverse();
  oldestFirst.forEach((entry, index) => {
    for (const id of entry.items) {
      if (!store.first[id]) store.first[id] = { life: index + 1, nickname: entry.nickname };
    }
  });
  return store;
}

function loadStore(): CodexStore {
  if (cachedStore) return cachedStore;
  try {
    const raw = window.localStorage.getItem(CODEX_KEY);
    const parsed = raw ? sanitizeStore(JSON.parse(raw)) : null;
    cachedStore = parsed ?? seedFromLedger();
  } catch {
    cachedStore = seedFromLedger();
  }
  saveStore();
  return cachedStore;
}

function saveStore(): void {
  if (!cachedStore) return;
  try {
    window.localStorage.setItem(CODEX_KEY, JSON.stringify(cachedStore));
  } catch {
    // 受限 WebView 里收录进度丢失不阻断游玩。
  }
}

/** 得到道具时登记初遇；返回 true 表示这是跨越所有人生的第一次收录。 */
export function recordItemAcquired(id: ItemId, nickname: string): boolean {
  const store = loadStore();
  if (store.first[id]) return false;
  store.first[id] = { life: store.lives + 1, nickname: nickname.slice(0, 32) };
  saveStore();
  return true;
}

export function notifyCodexRunEnded(): void {
  const store = loadStore();
  store.lives += 1;
  saveStore();
}

export function codexCollectedCount(): number {
  return Object.keys(loadStore().first).length;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  ));
}

function firstRecordText(record: CodexFirstRecord | undefined): string {
  if (!record) return '';
  if (record.life <= 0) return '很久以前第一次得到';
  const who = record.nickname ? `「${escapeHtml(record.nickname)}」` : '他';
  return `第 ${record.life} 世，${who}第一次得到`;
}

const QUALITY_ORDER = [1, 2, 3, 4, 5] as const;

function qualityLabel(quality: number): string {
  const sample = ITEM_IDS.map((id) => ITEM_DEFINITIONS[id]).find((item) => item.quality === quality);
  return sample ? `${'ⅠⅡⅢⅣⅤ'[quality - 1]} · ${sample.qualityName}` : String(quality);
}

function iconStyle(id: ItemId, display: number): string {
  const index = (iconManifest.index as Record<string, number>)[id] ?? 0;
  const scale = display / iconManifest.cell;
  const col = index % iconManifest.cols;
  const row = Math.floor(index / iconManifest.cols);
  return `width:${display}px;height:${display}px;background-image:url('${ICONS_URL}');`
    + `background-size:${iconManifest.cols * iconManifest.cell * scale}px ${iconManifest.rows * iconManifest.cell * scale}px;`
    + `background-position:${-col * display}px ${-row * display}px;`;
}

let overlay: HTMLElement | null = null;

export function closeItemCodex(): void {
  overlay?.remove();
  overlay = null;
}

export function isItemCodexOpen(): boolean {
  return overlay !== null;
}

export function openItemCodex(options: CodexOpenOptions): void {
  if (overlay) return;
  const store = loadStore();
  const collected = new Set<ItemId>(Object.keys(store.first) as ItemId[]);

  const root = document.createElement('section');
  root.id = 'item-codex';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '物证册');
  overlay = root;

  const total = ITEM_IDS.length;
  const owned = ITEM_IDS.filter((id) => collected.has(id)).length;

  const header = document.createElement('header');
  header.className = 'cdx-head';
  header.innerHTML = `
    <button type="button" class="cdx-close" aria-label="合上物证册">合上</button>
    <h1>物证册</h1>
    <span class="cdx-progress">${owned} / ${total}</span>
    <nav class="cdx-tabs">
      <button type="button" class="cdx-tab active" data-tab="items">道具</button>
      <button type="button" class="cdx-tab" data-tab="combos">奥义</button>
    </nav>`;
  root.appendChild(header);

  const body = document.createElement('div');
  body.className = 'cdx-body';
  root.appendChild(body);

  const itemsPage = document.createElement('div');
  itemsPage.className = 'cdx-page';
  for (const quality of QUALITY_ORDER) {
    const ids = ITEM_IDS.filter((id) => ITEM_DEFINITIONS[id].quality === quality);
    if (!ids.length) continue;
    const done = ids.every((id) => collected.has(id) || quality === 5);
    const section = document.createElement('section');
    section.className = 'cdx-band';
    const stamp = done && ids.every((id) => collected.has(id)) ? '<i class="cdx-stamp">满</i>' : '';
    section.innerHTML = `<h2>${qualityLabel(quality)}${quality === 5 ? '<small>人生必经，不设剪影</small>' : ''}${stamp}</h2>`;
    const grid = document.createElement('div');
    grid.className = 'cdx-grid';
    for (const id of ids) {
      const item = ITEM_DEFINITIONS[id];
      const has = collected.has(id);
      const visible = has || quality === 5;
      const fresh = options.freshIds?.includes(id) ?? false;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `cdx-cell${visible ? '' : ' locked'}${has ? '' : ' unowned'}${fresh ? ' fresh' : ''}`;
      cell.dataset.item = id;
      cell.setAttribute('aria-label', visible ? item.name : '未收录的物证');
      cell.innerHTML = `<span class="cdx-ico" style="${iconStyle(id, 44)}"></span>`;
      cell.addEventListener('click', () => showCard(item, has));
      grid.appendChild(cell);
    }
    section.appendChild(grid);
    itemsPage.appendChild(section);
  }
  const footer = document.createElement('p');
  footer.className = 'cdx-foot';
  footer.textContent = '完整档案：shen.kk666.best/wiki';
  itemsPage.appendChild(footer);
  body.appendChild(itemsPage);

  const combosPage = document.createElement('div');
  combosPage.className = 'cdx-page';
  combosPage.hidden = true;
  for (const combo of options.combos) {
    const unlocked = combo.items.every((id) => collected.has(id));
    const row = document.createElement('article');
    row.className = `cdx-combo${unlocked ? '' : ' locked'}`;
    const parts = combo.items
      .map((id) => (collected.has(id) ? ITEM_DEFINITIONS[id].name : '？？？'))
      .join(' × ');
    row.innerHTML = `<h3>${unlocked ? combo.name : `？？？（${combo.items.filter((id) => collected.has(id)).length}/${combo.items.length}）`}</h3>
      <p class="cdx-combo-items">${parts}</p>${unlocked ? `<p class="cdx-combo-line">${combo.line}</p>` : ''}`;
    if (unlocked) {
      const art = comboArtAtlas.slice(combo.artKey);
      if (art) {
        const shot = art.cloneNode(false) as HTMLCanvasElement;
        shot.getContext('2d')?.drawImage(art, 0, 0);
        shot.className = 'cdx-combo-art';
        row.insertBefore(shot, row.firstChild);
      }
    }
    combosPage.appendChild(row);
  }
  body.appendChild(combosPage);

  const card = document.createElement('aside');
  card.className = 'cdx-card';
  card.hidden = true;
  root.appendChild(card);

  function showCard(item: ItemDefinition, has: boolean): void {
    options.playPageSound?.();
    card.hidden = false;
    if (!has && item.quality !== 5) {
      card.innerHTML = `
        <span class="cdx-ico big locked" style="${iconStyle(item.id, 72)}"></span>
        <h3>？？？</h3>
        <p class="cdx-hint">${options.sourceHint(item.id)}</p>`;
      return;
    }
    const record = loadStore().first[item.id];
    card.innerHTML = `
      <span class="cdx-ico big" style="${iconStyle(item.id, 72)}"></span>
      <h3>${item.name}</h3>
      <p class="cdx-flavor">${item.flavor}</p>
      <p class="cdx-effect"><b>${item.summary}</b> · ${item.positive}${item.negative === '没有负面作用' ? '' : ` · ${item.negative}`}</p>
      <p class="cdx-meta">${qualityLabel(item.quality)}${record ? ` · ${firstRecordText(record)}` : has ? '' : ' · 本世必经'}</p>`;
  }

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.cdx-close')) {
      options.playPageSound?.();
      closeItemCodex();
      options.onClose?.();
      return;
    }
    const tab = target.closest<HTMLElement>('.cdx-tab');
    if (tab) {
      options.playPageSound?.();
      for (const button of root.querySelectorAll('.cdx-tab')) button.classList.toggle('active', button === tab);
      itemsPage.hidden = tab.dataset.tab !== 'items';
      combosPage.hidden = tab.dataset.tab !== 'combos';
      card.hidden = true;
      return;
    }
    if (!target.closest('.cdx-cell') && !target.closest('.cdx-card')) card.hidden = true;
  });

  document.body.appendChild(root);
}
