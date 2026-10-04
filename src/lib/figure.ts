import type { Category, ClothingItem } from '../types';

/** 服の形のバリエーション。トップスは袖丈、アウターは着丈、ボトムスは丈と形を表す */
export type FigureVariant = 'short' | 'regular' | 'long' | 'skirt';

export interface FigurePart {
  kind: Category;
  variant: FigureVariant;
  /** 主色 */
  color: string;
  /** 副色 (襟・袖口などのアクセントに使う) */
  accent?: string;
  itemId: string;
  name: string;
}

/** 奥 (靴) から手前 (小物) への描画順 */
const LAYER_ORDER: Category[] = ['shoes', 'bottoms', 'tops', 'onepiece', 'outer', 'accessory'];

function variantOf(item: ClothingItem): FigureVariant {
  switch (item.category) {
    case 'tops':
      return item.warmth <= 2 ? 'short' : 'long';
    case 'outer':
      return item.warmth >= 5 ? 'long' : 'regular';
    case 'bottoms':
      return item.shape === 'skirt' ? 'skirt' : item.shape === 'shorts' ? 'short' : 'regular';
    default:
      return 'regular';
  }
}

/** コーデのアイテムから、人型イラストに重ねて描くパーツの一覧を作る */
export function buildFigure(items: ClothingItem[]): FigurePart[] {
  return [...items]
    .sort((a, b) => LAYER_ORDER.indexOf(a.category) - LAYER_ORDER.indexOf(b.category))
    .map((item) => ({
      kind: item.category,
      variant: variantOf(item),
      color: item.color,
      accent: item.subColor,
      itemId: item.id,
      name: item.name,
    }));
}
