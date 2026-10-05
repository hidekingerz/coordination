export type Category = 'outer' | 'tops' | 'bottoms' | 'onepiece' | 'shoes' | 'accessory';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Formality = 'casual' | 'smart' | 'formal';
export type Warmth = 1 | 2 | 3 | 4 | 5;
/** ボトムスの形。イラストの描き分けに使う */
export type BottomsShape = 'pants' | 'shorts' | 'skirt';
/** トップス・ワンピースの袖丈。イラストの描き分けに使う */
export type Sleeve = 'short' | 'long' | 'sleeveless';
/** 小物の種類。イラストで描く位置と形に使う */
export type AccessoryKind = 'neck' | 'belt' | 'hat' | 'bag' | 'necklace';

export interface ClothingItem {
  id: string;
  name: string;
  /** ブランド名。任意 */
  brand?: string;
  category: Category;
  /** ボトムスの形。未設定はパンツとして扱う */
  shape?: BottomsShape;
  /** 袖丈。未設定なら名前と厚さから推定する */
  sleeve?: Sleeve;
  /** 小物の種類。未設定なら名前から推定し、判定できなければイラストには描かない */
  accessoryKind?: AccessoryKind;
  /** 主色 (#rrggbb) */
  color: string;
  /** 副色 (#rrggbb)。柄物などで任意 */
  subColor?: string;
  seasons: Season[];
  /** 1=真夏向け(薄い) … 5=真冬向け(厚い) */
  warmth: Warmth;
  formality: Formality;
  tags: string[];
  imageUrl?: string;
  createdAt: string;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  outer: 'アウター',
  tops: 'トップス',
  bottoms: 'ボトムス',
  onepiece: 'ワンピース / セットアップ',
  shoes: 'シューズ',
  accessory: '小物',
};

export const SEASON_LABEL: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
};

export const FORMALITY_LABEL: Record<Formality, string> = {
  casual: 'カジュアル',
  smart: 'きれいめ',
  formal: 'フォーマル',
};

export const WARMTH_LABEL: Record<Warmth, string> = {
  1: '真夏 (とても薄い)',
  2: '初夏・残暑 (薄い)',
  3: '春秋 (ふつう)',
  4: '晩秋・初冬 (厚め)',
  5: '真冬 (とても厚い)',
};

export const BOTTOMS_SHAPE_LABEL: Record<BottomsShape, string> = {
  pants: 'パンツ',
  shorts: 'ショートパンツ',
  skirt: 'スカート',
};

export const ALL_BOTTOMS_SHAPES: BottomsShape[] = ['pants', 'shorts', 'skirt'];

export const SLEEVE_LABEL: Record<Sleeve, string> = {
  short: '半袖',
  long: '長袖',
  sleeveless: '袖なし',
};

export const ALL_SLEEVES: Sleeve[] = ['short', 'long', 'sleeveless'];

export const ACCESSORY_KIND_LABEL: Record<AccessoryKind, string> = {
  neck: 'マフラー / ストール',
  belt: 'ベルト',
  hat: '帽子',
  bag: 'バッグ',
  necklace: 'ネックレス',
};

export const ALL_ACCESSORY_KINDS: AccessoryKind[] = ['neck', 'belt', 'hat', 'bag', 'necklace'];

export const ALL_CATEGORIES: Category[] = ['outer', 'tops', 'bottoms', 'onepiece', 'shoes', 'accessory'];
export const ALL_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const ALL_FORMALITIES: Formality[] = ['casual', 'smart', 'formal'];
