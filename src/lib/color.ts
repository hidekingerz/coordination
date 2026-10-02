/** 色の解析・分類・相性スコアリング */

export interface HSL {
  /** 0-360 */
  h: number;
  /** 0-1 */
  s: number;
  /** 0-1 */
  l: number;
}

export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return '#' + s.split('').map((c) => c + c).join('').toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s.toLowerCase();
  return null;
}

export function hexToHsl(hex: string): HSL {
  const n = normalizeHex(hex) ?? '#000000';
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return { h, s, l };
}

/**
 * ベーシックカラー (白・黒・グレー・ネイビー・ベージュ・ブラウン等) か。
 * ベーシックカラーはどの色とも合わせやすいとみなす。
 */
export function isNeutral(hsl: HSL): boolean {
  if (hsl.l >= 0.92 || hsl.l <= 0.12) return true; // 白 / 黒
  if (hsl.s <= 0.15) return true; // グレー系
  // ネイビー (暗い青)
  if (hsl.h >= 200 && hsl.h <= 260 && hsl.l <= 0.28) return true;
  // ベージュ・エクリュ (明るく彩度の低い暖色)
  if (hsl.h >= 20 && hsl.h <= 60 && hsl.l >= 0.6 && hsl.s <= 0.5) return true;
  // ブラウン (暗めで彩度の低い橙〜黄)
  if (hsl.h >= 15 && hsl.h < 55 && hsl.l <= 0.4 && hsl.s <= 0.6) return true;
  // カーキ・オリーブ (暗めで彩度の低い黄緑)
  if (hsl.h >= 55 && hsl.h <= 110 && hsl.l <= 0.5 && hsl.s <= 0.45) return true;
  return false;
}

export type ColorFamily =
  | 'white'
  | 'black'
  | 'gray'
  | 'navy'
  | 'beige'
  | 'brown'
  | 'khaki'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink';

export const COLOR_FAMILY_LABEL: Record<ColorFamily, string> = {
  white: 'ホワイト',
  black: 'ブラック',
  gray: 'グレー',
  navy: 'ネイビー',
  beige: 'ベージュ',
  brown: 'ブラウン',
  khaki: 'カーキ',
  red: 'レッド',
  orange: 'オレンジ',
  yellow: 'イエロー',
  green: 'グリーン',
  blue: 'ブルー',
  purple: 'パープル',
  pink: 'ピンク',
};

export function colorFamily(hex: string): ColorFamily {
  const hsl = hexToHsl(hex);
  if (hsl.l >= 0.92) return 'white';
  if (hsl.l <= 0.12) return 'black';
  if (hsl.s <= 0.15) return 'gray';
  if (hsl.h >= 200 && hsl.h <= 260 && hsl.l <= 0.28) return 'navy';
  if (hsl.h >= 20 && hsl.h <= 60 && hsl.l >= 0.6 && hsl.s <= 0.5) return 'beige';
  if (hsl.h >= 15 && hsl.h < 55 && hsl.l <= 0.4 && hsl.s <= 0.6) return 'brown';
  if (hsl.h >= 55 && hsl.h <= 110 && hsl.l <= 0.5 && hsl.s <= 0.45) return 'khaki';
  const h = hsl.h;
  if (h < 15 || h >= 335) return hsl.l > 0.7 ? 'pink' : 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 260) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

export function colorLabel(hex: string): string {
  return COLOR_FAMILY_LABEL[colorFamily(hex)];
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export type Relation =
  | 'neutral-neutral'
  | 'neutral-accent'
  | 'monochrome'
  | 'analogous'
  | 'complementary'
  | 'triadic'
  | 'clash';

export interface PairResult {
  relation: Relation;
  /** 0-1 */
  score: number;
}

/** 2色の相性を評価する */
export function pairScore(hexA: string, hexB: string): PairResult {
  const a = hexToHsl(hexA);
  const b = hexToHsl(hexB);
  const na = isNeutral(a);
  const nb = isNeutral(b);

  if (na && nb) return { relation: 'neutral-neutral', score: 0.85 };
  if (na || nb) return { relation: 'neutral-accent', score: 0.92 };

  const d = hueDistance(a.h, b.h);
  const bothVivid = a.s > 0.65 && b.s > 0.65;
  const vividPenalty = bothVivid ? 0.15 : 0;

  if (d <= 15) return { relation: 'monochrome', score: 0.9 - vividPenalty / 2 };
  if (d <= 45) return { relation: 'analogous', score: 0.85 - vividPenalty };
  if (d >= 150) return { relation: 'complementary', score: 0.72 - vividPenalty };
  if (d >= 100) return { relation: 'triadic', score: 0.6 - vividPenalty };
  return { relation: 'clash', score: 0.35 };
}

export interface PaletteEvaluation {
  /** 0-1 */
  score: number;
  /** 配色の説明 (例: "ベーシック+差し色") */
  scheme: string;
  /** 使われている色ファミリー */
  families: ColorFamily[];
}

/** 複数色の配色全体を評価する */
export function evaluatePalette(hexes: string[]): PaletteEvaluation {
  const uniq = Array.from(new Set(hexes.map((h) => normalizeHex(h) ?? h)));
  const families = Array.from(new Set(uniq.map(colorFamily)));
  const hsls = uniq.map(hexToHsl);
  const accents = hsls.filter((c) => !isNeutral(c));
  const accentFamilies = new Set(uniq.filter((h) => !isNeutral(hexToHsl(h))).map(colorFamily));

  if (uniq.length <= 1) {
    return { score: 0.9, scheme: accents.length ? 'ワントーン' : 'モノトーン', families };
  }

  let sum = 0;
  let count = 0;
  let worst = 1;
  const relations: Relation[] = [];
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const r = pairScore(uniq[i], uniq[j]);
      sum += r.score;
      count++;
      worst = Math.min(worst, r.score);
      relations.push(r.relation);
    }
  }
  // 平均と最悪値の両方を見る (1組でも相性が悪いと目立つ)
  let score = count ? sum / count : 0.9;
  score = score * 0.7 + worst * 0.3;

  // アクセントカラーの数による調整 (3色以上の差し色は難しい)
  if (accentFamilies.size >= 3) score -= 0.2;
  else if (accentFamilies.size === 0) score += 0.03;

  let scheme: string;
  if (accents.length === 0) scheme = 'モノトーン / ベーシック';
  else if (accentFamilies.size === 1 && accents.length === uniq.length) scheme = 'ワントーン';
  else if (accentFamilies.size === 1) scheme = 'ベーシック + 差し色';
  else if (relations.includes('complementary')) scheme = '補色でメリハリ';
  else if (relations.every((r) => r === 'monochrome' || r === 'analogous' || r.startsWith('neutral')))
    scheme = '類似色でまとめた配色';
  else if (relations.includes('clash')) scheme = '色数が多めの配色';
  else scheme = 'マルチカラー';

  return { score: Math.max(0, Math.min(1, score)), scheme, families };
}
