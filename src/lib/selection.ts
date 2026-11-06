import type { ClothingItem } from '../types';

/**
 * 「着たい服」のトグル。同じ服ならば外し、同じカテゴリの服をすでに選んでいればその位置で置き換える。
 * 1 カテゴリ 1 点にするのは、同じカテゴリを 2 点同時には着られず、提案が 0 件になるため。
 * クローゼットに無い id は触らない (消すのは SuggestView の pruning の仕事)。
 */
export function toggleMustInclude(cur: string[], id: string, wardrobe: ClothingItem[]): string[] {
  if (cur.includes(id)) return cur.filter((x) => x !== id);
  const cat = wardrobe.find((i) => i.id === id)?.category;
  const sameCat = (x: string) => cat !== undefined && wardrobe.find((i) => i.id === x)?.category === cat;
  const at = cur.findIndex(sameCat);
  if (at < 0) return [...cur, id];
  return cur.map((x, k) => (k === at ? id : x)).filter((x) => x === id || !sameCat(x));
}
