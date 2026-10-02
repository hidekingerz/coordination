import type { ClothingItem } from '../types';

/** 入力されたブランド名を整える。空なら未設定 (undefined) */
export function normalizeBrand(raw: string | undefined): string | undefined {
  const b = raw?.trim();
  return b ? b : undefined;
}

/** クローゼットに登録済みのブランド名を重複なく、並び順を揃えて返す */
export function knownBrands(items: ClothingItem[]): string[] {
  const set = new Set<string>();
  for (const i of items) if (i.brand) set.add(i.brand);
  return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
}
