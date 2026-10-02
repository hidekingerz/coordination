import type { ClothingItem } from '../types';
import { normalizeBrand } from './brand';

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

export function parseImport(text: string): ClothingItem[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(arr)) throw new Error('items 配列が見つかりません');
  const items = arr.filter(isItem).map(sanitize);
  if (items.length === 0) throw new Error('有効なアイテムがありません');
  return items;
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
