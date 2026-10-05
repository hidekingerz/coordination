import type { Category, ClothingItem, Sleeve } from '../types';

/** 服の形のバリエーション。トップスは袖丈、アウターは着丈、ボトムスは丈と形を表す */
export type FigureVariant = 'short' | 'regular' | 'long' | 'skirt' | 'sleeveless';

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

/** 名前に含まれていれば袖なしと判断する語 */
const SLEEVELESS_WORDS = ['タンクトップ', 'ノースリーブ', 'キャミ', 'ベスト', 'ジレ', 'sleeveless', 'tank'];
/** 名前に含まれていれば半袖と判断する語 (長袖の語より優先) */
const SHORT_WORDS = ['半袖', 'tシャツ', 'ポロ', '半そで', 'short sleeve', 't-shirt', 'tee'];
/** 名前に含まれていれば長袖と判断する語 */
const LONG_WORDS = [
  '長袖', 'ロンt', 'ロングスリーブ', 'シャツ', 'ブラウス', 'ニット', 'セーター', 'スウェット', 'トレーナー',
  'パーカー', 'タートル', 'カーディガン', 'long sleeve', 'sweater', 'hoodie', 'knit',
];

/**
 * 袖丈を決める。明示指定 > 名前の語 > 厚さ (1〜2 なら半袖) の順。
 * 「半袖シャツ」のように半袖と長袖の語が同居する場合は半袖を優先する。
 */
export function inferSleeve(item: ClothingItem): Sleeve {
  if (item.sleeve) return item.sleeve;
  const name = item.name.toLowerCase();
  if (SLEEVELESS_WORDS.some((w) => name.includes(w))) return 'sleeveless';
  if (SHORT_WORDS.some((w) => name.includes(w))) return 'short';
  if (LONG_WORDS.some((w) => name.includes(w))) return 'long';
  return item.warmth <= 2 ? 'short' : 'long';
}

function variantOf(item: ClothingItem): FigureVariant {
  switch (item.category) {
    case 'tops':
    case 'onepiece':
      return inferSleeve(item);
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
