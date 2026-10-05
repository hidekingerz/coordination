import type { AccessoryKind, Category, ClothingItem, Sleeve } from '../types';

/** 服の形のバリエーション。トップスは袖丈、アウターは着丈、ボトムスは丈と形を表す */
export type FigureVariant = 'short' | 'regular' | 'long' | 'skirt' | 'sleeveless' | AccessoryKind;

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

/** 描画順の位置。ベルトだけはトップスの上・アウターの下に挟む */
function layerOf(p: FigurePart): number {
  if (p.kind === 'accessory' && p.variant === 'belt') return LAYER_ORDER.indexOf('outer') - 0.5;
  return LAYER_ORDER.indexOf(p.kind);
}

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

/** 小物の種類を名前から推定する語。先に並んだものを優先 */
const ACCESSORY_WORDS: [AccessoryKind, string[]][] = [
  ['belt', ['ベルト', 'belt']],
  ['neck', ['マフラー', 'ストール', 'スカーフ', 'ネックウォーマー', 'scarf', 'stole', 'muffler']],
  ['hat', ['キャップ', 'ハット', '帽', 'ビーニー', 'ベレー', 'cap', 'hat', 'beanie']],
  ['bag', ['バッグ', 'リュック', 'トート', 'ポーチ', 'サコッシュ', 'bag', 'backpack', 'tote']],
  ['necklace', ['ネックレス', 'チョーカー', 'ペンダント', 'necklace', 'choker', 'pendant']],
];

/** 小物の種類。明示指定 > 名前の語。判定できなければ undefined (イラストには描かない) */
export function inferAccessoryKind(item: ClothingItem): AccessoryKind | undefined {
  if (item.accessoryKind) return item.accessoryKind;
  const name = item.name.toLowerCase();
  for (const [kind, words] of ACCESSORY_WORDS) if (words.some((w) => name.includes(w))) return kind;
  return undefined;
}

function variantOf(item: ClothingItem): FigureVariant | undefined {
  switch (item.category) {
    case 'tops':
    case 'onepiece':
      return inferSleeve(item);
    case 'outer':
      return item.warmth >= 5 ? 'long' : 'regular';
    case 'bottoms':
      return item.shape === 'skirt' ? 'skirt' : item.shape === 'shorts' ? 'short' : 'regular';
    case 'accessory':
      return inferAccessoryKind(item);
    default:
      return 'regular';
  }
}

/** コーデのアイテムから、人型イラストに重ねて描くパーツの一覧を作る */
export function buildFigure(items: ClothingItem[]): FigurePart[] {
  const parts = items.flatMap((item) => {
    const variant = variantOf(item);
    // 形が決められない小物は、誤った形で描くより描かない
    if (!variant) return [];
    return [{ kind: item.category, variant, color: item.color, accent: item.subColor, itemId: item.id, name: item.name }];
  });
  return parts.sort((a, b) => layerOf(a) - layerOf(b));
}
