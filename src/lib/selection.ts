import type { ClothingItem } from '../types';
import { inferOuterLayer } from './figure';

/**
 * 「着たい服」の枠。同じ枠には 1 点しか入れない。
 * アウターだけは中間着 (ジャケット・カーディガン) と外套 (コート・ダウン) が別の枠。
 * 提案ロジック (suggestOutfits) が「中間着 + 外套」の重ね着を作れるので、その組み合わせは残す。
 */
export function selectionSlot(item: ClothingItem): string {
  return item.category === 'outer' ? `outer:${inferOuterLayer(item)}` : item.category;
}

/**
 * 「着たい服」のトグル。同じ服ならば外し、同じ枠の服をすでに選んでいればその位置で置き換える。
 * 1 枠 1 点にするのは、同じ枠の服を 2 点同時には着られず、提案が 0 件になるため。
 * クローゼットに無い id は触らない (消すのは SuggestView の pruning の仕事)。
 */
export function toggleMustInclude(cur: string[], id: string, wardrobe: ClothingItem[]): string[] {
  if (cur.includes(id)) return cur.filter((x) => x !== id);
  const byId = (x: string) => wardrobe.find((i) => i.id === x);
  const item = byId(id);
  if (!item) return [...cur, id];
  const slot = selectionSlot(item);
  const sameSlot = (x: string) => {
    const other = byId(x);
    return other !== undefined && selectionSlot(other) === slot;
  };
  const at = cur.findIndex(sameSlot);
  if (at < 0) return [...cur, id];
  return cur.map((x, k) => (k === at ? id : x)).filter((x) => x === id || !sameSlot(x));
}
