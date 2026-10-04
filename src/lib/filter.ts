import type { Category, ClothingItem } from '../types';

export interface WardrobeFilter {
  category: Category | 'all';
  brand: string | 'all';
  /** 名前・ブランド・タグに対する部分一致。大文字小文字は区別しない */
  query: string;
}

/** クローゼットをカテゴリ・ブランド・検索語で絞り込む (並び順は変えない) */
export function filterWardrobe(items: ClothingItem[], f: WardrobeFilter): ClothingItem[] {
  const q = f.query.trim().toLowerCase();
  return items.filter(
    (i) =>
      (f.category === 'all' || i.category === f.category) &&
      (f.brand === 'all' || i.brand === f.brand) &&
      (!q ||
        i.name.toLowerCase().includes(q) ||
        (i.brand?.toLowerCase().includes(q) ?? false) ||
        i.tags.some((t) => t.toLowerCase().includes(q))),
  );
}

/** ブランドごとの登録数。ブランド未設定のアイテムは数えない */
export function brandCounts(items: ClothingItem[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const i of items) if (i.brand) c[i.brand] = (c[i.brand] ?? 0) + 1;
  return c;
}
