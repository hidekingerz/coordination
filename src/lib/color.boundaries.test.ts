import { describe, expect, it } from 'vitest';
import { colorFamilyOfHsl, evaluatePalette, hexToHsl, isNeutral, normalizeHex, pairScore, type HSL } from './color';

const hsl = (h: number, s: number, l: number): HSL => ({ h, s, l });

/** HSL から #rrggbb を作る。色相の境界を試すので、hexToHsl で読み戻した色相が狙いどおりかも確かめる */
function hexOf(h: number, s = 0.5, l = 0.5): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
  if (hexToHsl(hex).h !== h) throw new Error(`hexOf(${h}) は色相 ${hexToHsl(hex).h} になった`);
  return hex;
}

describe('isNeutral: the edges of white, black and gray', () => {
  it.each([
    ['white at 0.92', hsl(0, 0.8, 0.92), true],
    ['just below white', hsl(0, 0.8, 0.919), false],
    ['black at 0.12', hsl(0, 0.8, 0.12), true],
    ['just above black', hsl(0, 0.8, 0.121), false],
    ['gray at saturation 0.15', hsl(0, 0.15, 0.5), true],
    ['just above gray', hsl(0, 0.151, 0.5), false],
  ])('%s', (_name, c, expected) => expect(isNeutral(c)).toBe(expected));
});

describe('isNeutral: navy, beige, brown and khaki ranges', () => {
  it.each([
    // ネイビー: 色相 200〜260、明度 0.28 以下
    ['navy hue 200', hsl(200, 0.5, 0.28), true],
    ['hue 199 is not navy', hsl(199, 0.5, 0.28), false],
    ['navy hue 260', hsl(260, 0.5, 0.28), true],
    ['hue 261 is not navy', hsl(261, 0.5, 0.28), false],
    ['navy too light at 0.281', hsl(230, 0.5, 0.281), false],
    // ベージュ: 色相 20〜60、明度 0.6 以上、彩度 0.5 以下 (ブラウンにもカーキにも入らない色で試す)
    ['beige hue 20', hsl(20, 0.5, 0.61), true],
    ['hue 19 above brown lightness is not beige', hsl(19, 0.5, 0.61), false],
    ['beige hue 60', hsl(60, 0.5, 0.61), true],
    ['hue 61 is not beige', hsl(61, 0.5, 0.61), false],
    ['beige lightness 0.6', hsl(58, 0.5, 0.6), true],
    ['too dark for beige at 0.599', hsl(58, 0.5, 0.599), false],
    ['beige saturation 0.5', hsl(58, 0.5, 0.7), true],
    ['too vivid for beige at 0.501', hsl(58, 0.501, 0.7), false],
    // ブラウン: 色相 15 以上 55 未満、明度 0.6 以下、彩度 0.6 以下
    ['brown hue 15', hsl(15, 0.6, 0.4), true],
    ['hue 14 is not brown', hsl(14, 0.6, 0.4), false],
    ['brown hue 54', hsl(54, 0.6, 0.4), true],
    ['hue 55 is not brown (and too vivid for khaki)', hsl(55, 0.6, 0.4), false],
    ['brown lightness 0.6', hsl(30, 0.6, 0.6), true],
    ['too light for brown at 0.601', hsl(30, 0.6, 0.601), false],
    ['too vivid for brown at 0.601', hsl(30, 0.601, 0.4), false],
    // カーキ: 色相 55〜110、明度 0.5 以下、彩度 0.45 以下
    ['khaki hue 110', hsl(110, 0.45, 0.5), true],
    ['hue 111 is not khaki', hsl(111, 0.45, 0.5), false],
    ['too light for khaki at 0.501', hsl(80, 0.45, 0.501), false],
    ['too vivid for khaki at 0.451', hsl(80, 0.451, 0.5), false],
  ])('%s', (_name, c, expected) => expect(isNeutral(c)).toBe(expected));
});

describe('colorFamilyOfHsl: every boundary', () => {
  it.each([
    [hsl(0, 0.8, 0.92), 'white'],
    [hsl(0, 0.8, 0.919), 'pink'], // 白の手前。赤の色相で明るいのでピンク
    [hsl(0, 0.8, 0.12), 'black'],
    [hsl(0, 0.8, 0.121), 'red'],
    [hsl(0, 0.15, 0.5), 'gray'],
    [hsl(0, 0.151, 0.5), 'red'],
    [hsl(230, 0.5, 0.28), 'navy'],
    [hsl(58, 0.5, 0.7), 'beige'],
    [hsl(30, 0.5, 0.4), 'brown'],
    [hsl(54, 0.45, 0.5), 'brown'],
    [hsl(55, 0.45, 0.5), 'khaki'],
    // 色相の区切り (彩度を高くしてベーシックカラーに入らないようにする)
    [hsl(14, 0.8, 0.5), 'red'],
    [hsl(15, 0.8, 0.5), 'orange'],
    [hsl(44, 0.8, 0.5), 'orange'],
    [hsl(45, 0.8, 0.5), 'yellow'],
    [hsl(69, 0.8, 0.5), 'yellow'],
    [hsl(70, 0.8, 0.5), 'green'],
    [hsl(169, 0.8, 0.5), 'green'],
    [hsl(170, 0.8, 0.5), 'blue'],
    [hsl(259, 0.8, 0.5), 'blue'],
    [hsl(260, 0.8, 0.5), 'purple'],
    [hsl(299, 0.8, 0.5), 'purple'],
    [hsl(300, 0.8, 0.5), 'pink'],
    [hsl(334, 0.8, 0.5), 'pink'],
    [hsl(335, 0.8, 0.5), 'red'],
    // 赤の色相で明るいものはピンク
    [hsl(0, 0.8, 0.7), 'red'],
    [hsl(0, 0.8, 0.701), 'pink'],
    [hsl(340, 0.8, 0.701), 'pink'],
  ])('%o is %s', (c, family) => expect(colorFamilyOfHsl(c)).toBe(family));
});

describe('pairScore: hue-distance boundaries between two accents', () => {
  // 彩度 0.5 なので「両方鮮やか」の減点はかからない
  const at = (d: number) => pairScore(hexOf(180), hexOf(180 + d));
  it.each([
    [15, 'monochrome', 0.9],
    [16, 'analogous', 0.85],
    [45, 'analogous', 0.85],
    [46, 'clash', 0.35],
    [99, 'clash', 0.35],
    [100, 'triadic', 0.6],
    [149, 'triadic', 0.6],
    [150, 'complementary', 0.72],
  ])('distance %i is %s (%f)', (d, relation, score) => {
    const r = at(d);
    expect(r.relation).toBe(relation);
    expect(r.score).toBeCloseTo(score, 10);
  });

  it('takes 0.15 off (0.075 for monochrome) only when both colours are vivid (saturation above 0.65)', () => {
    const vivid = (h: number) => hexOf(h, 0.8, 0.5);
    expect(pairScore(vivid(180), vivid(190)).score).toBeCloseTo(0.9 - 0.075, 10);
    expect(pairScore(vivid(180), vivid(210)).score).toBeCloseTo(0.85 - 0.15, 10);
    expect(pairScore(vivid(180), vivid(330)).score).toBeCloseTo(0.72 - 0.15, 10);
    expect(pairScore(vivid(180), vivid(300)).score).toBeCloseTo(0.6 - 0.15, 10);
    expect(pairScore(vivid(180), vivid(260)).score).toBeCloseTo(0.35, 10); // 相性が悪い組は減点しない
    expect(pairScore(vivid(180), hexOf(190)).score).toBeCloseTo(0.9, 10); // 片方だけ鮮やか
    expect(pairScore(hexOf(180), vivid(190)).score).toBeCloseTo(0.9, 10);
  });

  it('scores basic colours 0.85 together and 0.92 with an accent', () => {
    expect(pairScore('#1f2a44', '#f5f5f0')).toEqual({ relation: 'neutral-neutral', score: 0.85 });
    expect(pairScore('#1f2a44', hexOf(0))).toEqual({ relation: 'neutral-accent', score: 0.92 });
    expect(pairScore(hexOf(0), '#1f2a44')).toEqual({ relation: 'neutral-accent', score: 0.92 });
  });
});

describe('evaluatePalette: the overall formula', () => {
  it('blends the pair average (70%) with the worst pair (30%)', () => {
    // 白・紺 (0.85)、白・赤 (0.92)、紺・赤 (0.92) -> 平均 0.8967、最悪 0.85
    const r = evaluatePalette(['#f5f5f0', '#1f2a44', hexOf(0)]);
    expect(r.score).toBeCloseTo(((0.85 + 0.92 + 0.92) / 3) * 0.7 + 0.85 * 0.3, 10);
  });

  it('adds 0.03 when every colour is a basic colour', () => {
    expect(evaluatePalette(['#f5f5f0', '#1f2a44']).score).toBeCloseTo(0.85 + 0.03, 10);
  });

  it('takes 0.2 off for three or more accent families, but not for two', () => {
    const two = [hexOf(0), hexOf(120)]; // 赤と緑: 色相差 120 (0.6)
    expect(evaluatePalette(two).score).toBeCloseTo(0.6, 10);
    const three = [hexOf(0), hexOf(120), hexOf(240)]; // 赤・緑・青: すべて 120 離れている
    expect(evaluatePalette(three).score).toBeCloseTo(0.6 - 0.2, 10);
  });

  it('scores a single colour 0.9', () => {
    expect(evaluatePalette([hexOf(0)]).score).toBe(0.9);
    expect(evaluatePalette(['#1f2a44', '#1F2A44']).score).toBe(0.9);
  });
});

describe('evaluatePalette: which scheme name is chosen', () => {
  const NAVY = '#1f2a44';
  const WHITE = '#f5f5f0';
  it.each([
    ['basic colours only', [NAVY, WHITE], 'モノトーン / ベーシック'],
    ['one basic colour', [NAVY], 'モノトーン'],
    ['one accent', [hexOf(0)], 'ワントーン'],
    ['shades of one accent family', [hexOf(0), hexOf(8)], 'ワントーン'],
    ['basics plus one accent family', [NAVY, hexOf(0)], 'ベーシック + 差し色'],
    ['two families with a complementary pair', [hexOf(0), hexOf(180)], '補色でメリハリ'],
    ['two neighbouring families', [hexOf(160), hexOf(190)], '類似色でまとめた配色'],
    ['neighbouring families with a basic colour', [NAVY, hexOf(160), hexOf(190)], '類似色でまとめた配色'],
    ['two families that clash', [hexOf(0), hexOf(70)], '色数が多めの配色'],
    ['two families only 10° apart (red and orange)', [hexOf(10, 0.8), hexOf(20, 0.8)], '類似色でまとめた配色'],
    ['neighbours plus a family a third away', [hexOf(0, 0.8), hexOf(30, 0.8), hexOf(130, 0.8)], 'マルチカラー'],
    ['two families a third of the wheel apart', [hexOf(0), hexOf(120)], 'マルチカラー'],
  ])('%s -> %s', (_name, hexes, scheme) => expect(evaluatePalette(hexes).scheme).toBe(scheme));
});

describe('normalizeHex and hexToHsl edge cases', () => {
  it('accepts 3 and 6 digits with or without # and surrounding spaces', () => {
    expect(normalizeHex(' #ABC ')).toBe('#aabbcc');
    expect(normalizeHex('A1B2C3')).toBe('#a1b2c3');
  });
  it('rejects anything else', () => {
    for (const s of ['#abcd', '#abcdefg', 'xabcdef', 'abcdefx', '#ab', '', '#ggg']) expect(normalizeHex(s), s).toBeNull();
  });
  it('reads black, white and grays without a hue', () => {
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 });
    expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 1 });
    expect(hexToHsl('#808080').s).toBe(0);
  });
  it('wraps negative hues into 0..360', () => {
    expect(hexToHsl('#ff0080').h).toBe(330);
  });
});
