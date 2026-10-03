import type { Category, ClothingItem, Formality, Season, Warmth } from '../types';
import { ALL_SEASONS } from '../types';
import { normalizeBrand } from './brand';
import { normalizeHex } from './color';

const KEY = 'coordination.wardrobe.v1';

export function loadWardrobe(): ClothingItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isItem).map(sanitize) : [];
  } catch {
    return [];
  }
}

export function saveWardrobe(items: ClothingItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch (e) {
    console.error('保存に失敗しました', e);
  }
}

export function exportJson(items: ClothingItem[]): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items }, null, 2);
}

export interface ImportResult {
  items: ClothingItem[];
  /** 補完・読み替えした内容の説明 (ユーザーに見せる) */
  warnings: string[];
}

export function parseImport(text: string): ClothingItem[] {
  return parseImportDetailed(text).items;
}

/**
 * JSON テキストをクローゼットに変換する。
 * エクスポート形式 ({ items: [...] }) と配列の両方を受け付け、
 * 手書きのデータ向けに日本語ラベルや色名、省略項目も補完する。
 */
export function parseImportDetailed(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(stripJsonNoise(text));
  } catch {
    throw new Error('JSON として読み取れません');
  }
  const arr = Array.isArray(data) ? data : (data as { items?: unknown })?.items;
  if (!Array.isArray(arr)) throw new Error('items 配列が見つかりません');

  const warnings: string[] = [];
  const items: ClothingItem[] = [];
  arr.forEach((raw, idx) => {
    const r = coerceItem(raw, idx);
    if (!r) {
      warnings.push(`${idx + 1}件目: 名前とカテゴリが無いためスキップしました`);
      return;
    }
    items.push(r.item);
    warnings.push(...r.warnings);
  });
  if (items.length === 0) throw new Error('有効なアイテムがありません');
  return { items, warnings };
}

/** BOM やコードフェンス (```json ... ```) を取り除く */
function stripJsonNoise(text: string): string {
  let t = text.replace(/^\uFEFF/, '').trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1];
  return t;
}

const CATEGORY_ALIASES: Record<string, Category> = {
  outer: 'outer', outerwear: 'outer', jacket: 'outer', coat: 'outer',
  アウター: 'outer', コート: 'outer', ジャケット: 'outer', ブルゾン: 'outer', 羽織り: 'outer', 羽織: 'outer',
  tops: 'tops', top: 'tops', shirt: 'tops', knit: 'tops',
  トップス: 'tops', シャツ: 'tops', ニット: 'tops', tシャツ: 'tops', カットソー: 'tops', スウェット: 'tops', パーカー: 'tops',
  bottoms: 'bottoms', bottom: 'bottoms', pants: 'bottoms', skirt: 'bottoms',
  ボトムス: 'bottoms', ボトム: 'bottoms', パンツ: 'bottoms', スカート: 'bottoms', デニム: 'bottoms', ズボン: 'bottoms',
  onepiece: 'onepiece', 'one-piece': 'onepiece', dress: 'onepiece', setup: 'onepiece', suit: 'onepiece',
  ワンピース: 'onepiece', セットアップ: 'onepiece', スーツ: 'onepiece',
  shoes: 'shoes', shoe: 'shoes', sneakers: 'shoes', boots: 'shoes',
  シューズ: 'shoes', 靴: 'shoes', スニーカー: 'shoes', ブーツ: 'shoes', サンダル: 'shoes', ローファー: 'shoes',
  accessory: 'accessory', accessories: 'accessory', bag: 'accessory', hat: 'accessory',
  小物: 'accessory', アクセサリー: 'accessory', アクセ: 'accessory', バッグ: 'accessory', 帽子: 'accessory', マフラー: 'accessory', ベルト: 'accessory',
};

const SEASON_ALIASES: Record<string, Season[]> = {
  spring: ['spring'], 春: ['spring'], sp: ['spring'],
  summer: ['summer'], 夏: ['summer'], su: ['summer'],
  autumn: ['autumn'], fall: ['autumn'], 秋: ['autumn'], au: ['autumn'],
  winter: ['winter'], 冬: ['winter'], wi: ['winter'],
  all: [...ALL_SEASONS], 'all-season': [...ALL_SEASONS], 通年: [...ALL_SEASONS], オールシーズン: [...ALL_SEASONS], 春夏秋冬: [...ALL_SEASONS],
  春夏: ['spring', 'summer'], 秋冬: ['autumn', 'winter'], 春秋: ['spring', 'autumn'],
};

const FORMALITY_ALIASES: Record<string, Formality> = {
  casual: 'casual', カジュアル: 'casual', ラフ: 'casual',
  smart: 'smart', 'smart casual': 'smart', smartcasual: 'smart', きれいめ: 'smart', キレイめ: 'smart', キレイメ: 'smart', 綺麗め: 'smart', オフィス: 'smart',
  formal: 'formal', business: 'formal', フォーマル: 'formal', ビジネス: 'formal', ドレス: 'formal',
};

/** 色名 → 代表的な hex。手書きデータで「ネイビー」のように書けるようにする */
export const COLOR_NAME_ALIASES: Record<string, string> = {
  white: '#f5f5f0', 白: '#f5f5f0', ホワイト: '#f5f5f0', オフホワイト: '#ece7dc', アイボリー: '#ece7dc', ivory: '#ece7dc', 生成り: '#ece7dc', エクリュ: '#ece7dc',
  black: '#141414', 黒: '#141414', ブラック: '#141414',
  gray: '#8a8a8a', grey: '#8a8a8a', グレー: '#8a8a8a', 灰色: '#8a8a8a', チャコール: '#3a3a3a', charcoal: '#3a3a3a', ライトグレー: '#c4c4c4', シルバー: '#c0c0c0', silver: '#c0c0c0',
  navy: '#1f2a44', ネイビー: '#1f2a44', 紺: '#1f2a44',
  beige: '#d9c4a5', ベージュ: '#d9c4a5', キャメル: '#c6a070', camel: '#c6a070', サンド: '#d2b88a',
  brown: '#5a3a22', ブラウン: '#5a3a22', 茶: '#5a3a22', 茶色: '#5a3a22', ダークブラウン: '#3e2616', チョコ: '#3e2616',
  khaki: '#5a6b3a', カーキ: '#5a6b3a', olive: '#5a6b3a', オリーブ: '#5a6b3a',
  denim: '#2c3e5c', デニム: '#2c3e5c', indigo: '#2c3e5c', インディゴ: '#2c3e5c',
  red: '#c0392b', 赤: '#c0392b', レッド: '#c0392b', bordeaux: '#6e1f2e', ボルドー: '#6e1f2e', wine: '#6e1f2e', ワイン: '#6e1f2e', バーガンディ: '#6e1f2e',
  orange: '#e67e22', オレンジ: '#e67e22', テラコッタ: '#b85c38', terracotta: '#b85c38',
  yellow: '#e5c33a', 黄: '#e5c33a', 黄色: '#e5c33a', イエロー: '#e5c33a', mustard: '#d4a826', マスタード: '#d4a826',
  green: '#3f8f4f', 緑: '#3f8f4f', グリーン: '#3f8f4f', ミント: '#9fd8c3', mint: '#9fd8c3',
  blue: '#3b6fb6', 青: '#3b6fb6', ブルー: '#3b6fb6', サックス: '#a9c4e0', ライトブルー: '#a9c4e0', 水色: '#a9c4e0', 'light blue': '#a9c4e0',
  purple: '#7a4fa3', 紫: '#7a4fa3', パープル: '#7a4fa3', ラベンダー: '#b9a6d9', lavender: '#b9a6d9',
  pink: '#e8a9b8', ピンク: '#e8a9b8', 桃: '#e8a9b8',
  gold: '#c9a227', ゴールド: '#c9a227',
};

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, ' ');
}

export function parseColorValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const hex = normalizeHex(raw);
  if (hex) return hex;
  return COLOR_NAME_ALIASES[normKey(raw)] ?? COLOR_NAME_ALIASES[raw.trim()] ?? null;
}

function parseCategory(raw: unknown): Category | null {
  if (typeof raw !== 'string') return null;
  return CATEGORY_ALIASES[normKey(raw)] ?? CATEGORY_ALIASES[raw.trim()] ?? null;
}

function parseSeasons(raw: unknown): Season[] | null {
  const parts: string[] = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string')
    : typeof raw === 'string'
      ? raw.split(/[,、\/・\s]+/)
      : [];
  const out = new Set<Season>();
  for (const p of parts) {
    const hit = SEASON_ALIASES[normKey(p)] ?? SEASON_ALIASES[p.trim()];
    if (hit) hit.forEach((s) => out.add(s));
  }
  if (out.size === 0) return null;
  return ALL_SEASONS.filter((s) => out.has(s));
}

function parseFormality(raw: unknown): Formality | null {
  if (typeof raw !== 'string') return null;
  return FORMALITY_ALIASES[normKey(raw)] ?? FORMALITY_ALIASES[raw.trim()] ?? null;
}

function parseWarmth(raw: unknown): Warmth | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, Math.round(n))) as Warmth;
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(/[,、\s#]+/).map((t) => t.trim()).filter(Boolean);
  return [];
}

/** ID が無いときに名前などから安定した ID を作る (再インポートで重複しないように) */
export function stableId(parts: (string | undefined)[]): string {
  const text = parts.map((p) => p ?? '').join('|');
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return 'g-' + (h >>> 0).toString(36);
}

/** 1 件分の生データを ClothingItem に整える。名前とカテゴリが無ければ null */
export function coerceItem(raw: unknown, index = 0): { item: ClothingItem; warnings: string[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : typeof o.名前 === 'string' ? o.名前.trim() : '';
  const category = parseCategory(o.category ?? o.カテゴリ);
  if (!name || !category) return null;

  const label = `${index + 1}件目「${name}」`;
  const warnings: string[] = [];

  const brand = normalizeBrand(typeof o.brand === 'string' ? o.brand : typeof o.ブランド === 'string' ? o.ブランド : undefined);

  let color = parseColorValue(o.color ?? o.色);
  if (!color) {
    const given = o.color ?? o.色;
    color = '#8a8a8a';
    warnings.push(
      given === undefined ? `${label}: 色が無いのでグレーにしました` : `${label}: 色「${String(given)}」を解釈できずグレーにしました`,
    );
  }
  const subColor = parseColorValue(o.subColor ?? o.副色) ?? undefined;

  let seasons = parseSeasons(o.seasons ?? o.season ?? o.季節);
  if (!seasons) {
    seasons = [...ALL_SEASONS];
    warnings.push(`${label}: 季節が無いので通年にしました`);
  }

  let warmth = parseWarmth(o.warmth ?? o.厚さ);
  if (!warmth) {
    warmth = 3;
    warnings.push(`${label}: 厚さが無いので 3 にしました`);
  }

  let formality = parseFormality(o.formality ?? o.テイスト);
  if (!formality) {
    formality = 'casual';
    if (o.formality !== undefined || o.テイスト !== undefined) warnings.push(`${label}: テイストを解釈できずカジュアルにしました`);
  }

  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : stableId([category, name, brand]);
  const imageUrl = typeof o.imageUrl === 'string' && o.imageUrl.trim() ? o.imageUrl.trim() : undefined;
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString();

  return {
    item: { id, name, brand, category, color, subColor, seasons, warmth, formality, tags: parseTags(o.tags ?? o.タグ), imageUrl, createdAt },
    warnings,
  };
}

export type MergeMode = 'merge' | 'replace';

/** 取り込んだアイテムを既存のクローゼットに反映する */
export function mergeWardrobe(existing: ClothingItem[], incoming: ClothingItem[], mode: MergeMode): ClothingItem[] {
  if (mode === 'replace') return incoming;
  const map = new Map(existing.map((i) => [i.id, i]));
  for (const it of incoming) map.set(it.id, it);
  return [...map.values()];
}

/** 型が合わない任意項目を落として、安全な形に整える */
function sanitize(item: ClothingItem): ClothingItem {
  const brand = typeof item.brand === 'string' ? normalizeBrand(item.brand) : undefined;
  return { ...item, brand };
}

function isItem(x: unknown): x is ClothingItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.category === 'string' &&
    typeof o.color === 'string' &&
    Array.isArray(o.seasons) &&
    typeof o.warmth === 'number' &&
    typeof o.formality === 'string'
  );
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
