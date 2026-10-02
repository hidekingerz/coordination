export type Category = 'outer' | 'tops' | 'bottoms' | 'onepiece' | 'shoes' | 'accessory';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Formality = 'casual' | 'smart' | 'formal';
export type Warmth = 1 | 2 | 3 | 4 | 5;

export interface ClothingItem {
  id: string;
  name: string;
  /** ブランド名。任意 */
  brand?: string;
  category: Category;
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

export const ALL_CATEGORIES: Category[] = ['outer', 'tops', 'bottoms', 'onepiece', 'shoes', 'accessory'];
export const ALL_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const ALL_FORMALITIES: Formality[] = ['casual', 'smart', 'formal'];
