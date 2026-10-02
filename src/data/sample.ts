import type { ClothingItem } from '../types';

const now = new Date().toISOString();
const mk = (
  id: string,
  name: string,
  category: ClothingItem['category'],
  color: string,
  seasons: ClothingItem['seasons'],
  warmth: ClothingItem['warmth'],
  formality: ClothingItem['formality'],
  tags: string[] = [],
  subColor?: string,
  brand?: string,
): ClothingItem => ({ id, name, brand, category, color, subColor, seasons, warmth, formality, tags, createdAt: now });

export const SAMPLE_WARDROBE: ClothingItem[] = [
  // アウター
  mk('s-outer-1', 'ネイビーのステンカラーコート', 'outer', '#1f2a44', ['autumn', 'winter', 'spring'], 4, 'smart', ['コート']),
  mk('s-outer-2', 'ブラックのダウンジャケット', 'outer', '#111111', ['winter'], 5, 'casual', ['ダウン']),
  mk('s-outer-3', 'ベージュのトレンチコート', 'outer', '#d9c4a5', ['spring', 'autumn'], 3, 'smart', ['トレンチ']),
  mk('s-outer-4', 'オリーブのミリタリージャケット', 'outer', '#5a6b3a', ['spring', 'autumn'], 3, 'casual', ['ブルゾン']),
  mk('s-outer-5', 'グレーのカーディガン', 'outer', '#8a8a8a', ['spring', 'autumn', 'winter'], 2, 'casual', ['ニット']),
  // トップス
  mk('s-tops-1', '白の無地Tシャツ', 'tops', '#f5f5f0', ['spring', 'summer', 'autumn'], 1, 'casual', ['Tシャツ'], undefined, 'ユニクロ'),
  mk('s-tops-2', 'ブラックのTシャツ', 'tops', '#161616', ['spring', 'summer', 'autumn'], 1, 'casual', ['Tシャツ']),
  mk('s-tops-3', 'ライトブルーのオックスフォードシャツ', 'tops', '#a9c4e0', ['spring', 'summer', 'autumn'], 2, 'smart', ['シャツ'], undefined, '無印良品'),
  mk('s-tops-4', '白のリネンシャツ', 'tops', '#f7f3ea', ['summer'], 1, 'smart', ['シャツ', 'リネン']),
  mk('s-tops-5', 'ボルドーのニット', 'tops', '#6e1f2e', ['autumn', 'winter'], 4, 'smart', ['ニット']),
  mk('s-tops-6', 'グレーのスウェット', 'tops', '#9a9a9a', ['autumn', 'winter', 'spring'], 3, 'casual', ['スウェット']),
  mk('s-tops-7', 'マスタードのロンT', 'tops', '#d4a826', ['spring', 'autumn'], 2, 'casual', ['ロンT']),
  mk('s-tops-8', 'ネイビーのタートルネック', 'tops', '#1c2541', ['winter'], 4, 'smart', ['ニット']),
  mk('s-tops-9', 'ボーダーのカットソー', 'tops', '#f2f2f2', ['spring', 'summer'], 1, 'casual', ['ボーダー'], '#1c2541', 'セントジェームス'),
  // ボトムス
  mk('s-bottoms-1', 'インディゴデニム', 'bottoms', '#2c3e5c', ['spring', 'summer', 'autumn', 'winter'], 3, 'casual', ['デニム'], undefined, 'リーバイス'),
  mk('s-bottoms-2', 'ブラックのスラックス', 'bottoms', '#1a1a1a', ['spring', 'autumn', 'winter'], 3, 'smart', ['スラックス']),
  mk('s-bottoms-3', 'ベージュのチノパン', 'bottoms', '#cdb48c', ['spring', 'summer', 'autumn'], 2, 'casual', ['チノ'], undefined, 'ユニクロ'),
  mk('s-bottoms-4', 'グレーのウールパンツ', 'bottoms', '#6b6b6b', ['autumn', 'winter'], 4, 'smart', ['ウール']),
  mk('s-bottoms-5', 'オフホワイトのワイドパンツ', 'bottoms', '#ece7dc', ['spring', 'summer'], 1, 'smart', ['ワイド']),
  mk('s-bottoms-6', 'カーキのショートパンツ', 'bottoms', '#7a7a55', ['summer'], 1, 'casual', ['ショーツ']),
  // ワンピース
  mk('s-onepiece-1', 'ネイビーのセットアップ', 'onepiece', '#202a46', ['spring', 'autumn', 'winter'], 3, 'formal', ['セットアップ']),
  // シューズ
  mk('s-shoes-1', '白のレザースニーカー', 'shoes', '#f4f4f4', ['spring', 'summer', 'autumn', 'winter'], 3, 'casual', ['スニーカー'], undefined, 'アディダス'),
  mk('s-shoes-2', 'ブラックのローファー', 'shoes', '#101010', ['spring', 'autumn', 'winter'], 3, 'smart', ['ローファー']),
  mk('s-shoes-3', 'ブラウンのブーツ', 'shoes', '#4a2f1d', ['autumn', 'winter'], 4, 'smart', ['ブーツ']),
  mk('s-shoes-4', 'ネイビーのキャンバススニーカー', 'shoes', '#24314f', ['spring', 'summer'], 1, 'casual', ['スニーカー'], undefined, 'コンバース'),
  mk('s-shoes-5', 'ブラックのサンダル', 'shoes', '#1a1a1a', ['summer'], 1, 'casual', ['サンダル']),
  // 小物
  mk('s-acc-1', 'ブラウンのレザーベルト', 'accessory', '#5a3a22', ['spring', 'summer', 'autumn', 'winter'], 3, 'smart', ['ベルト']),
  mk('s-acc-2', 'グレーのマフラー', 'accessory', '#9c9c9c', ['winter'], 5, 'casual', ['マフラー']),
  mk('s-acc-3', 'ブラックのキャップ', 'accessory', '#141414', ['spring', 'summer', 'autumn'], 1, 'casual', ['キャップ']),
  mk('s-acc-4', 'テラコッタのストール', 'accessory', '#b85c38', ['autumn', 'winter'], 4, 'smart', ['ストール']),
];
