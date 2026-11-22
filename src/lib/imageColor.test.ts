import { describe, expect, it } from 'vitest';
import { extractPalette, suggestSubColor } from './imageColor';

type RGB = [number, number, number];

/** テスト用の画像を作る: 塗り関数で各画素の色を決める */
function makeImage(w: number, h: number, paint: (x: number, y: number) => RGB): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  return px;
}

function hexDist(a: string, b: string): number {
  const p = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return Math.abs(p(a, 1) - p(b, 1)) + Math.abs(p(a, 3) - p(b, 3)) + Math.abs(p(a, 5) - p(b, 5));
}

describe('extractPalette', () => {
  it('finds a navy garment on a white background and drops the background', () => {
    const px = makeImage(60, 80, (x, y) => (x > 12 && x < 48 && y > 10 && y < 70 ? [31, 42, 68] : [250, 250, 250]));
    const r = extractPalette(px, 60, 80);
    expect(r.backgroundRemoved).toBe(true);
    expect(r.colors[0].share).toBeGreaterThan(0.9);
    expect(hexDist(r.colors[0].hex, '#1f2a44')).toBeLessThan(12);
    expect(r.colors.some((c) => hexDist(c.hex, '#fafafa') < 12)).toBe(false);
  });

  it('keeps a white shirt on a white background instead of deleting everything', () => {
    const px = makeImage(60, 80, (x, y) => (x > 12 && x < 48 && y > 10 && y < 70 ? [245, 245, 240] : [252, 252, 252]));
    const r = extractPalette(px, 60, 80);
    expect(r.backgroundRemoved).toBe(false);
    expect(hexDist(r.colors[0].hex, '#f5f5f0')).toBeLessThan(30);
  });

  it('keeps white areas enclosed by the garment (buttons, prints) while removing the outside', () => {
    const px = makeImage(60, 80, (x, y) => {
      if (!(x > 12 && x < 48 && y > 10 && y < 70)) return [250, 250, 250];
      if (x > 22 && x < 38 && y > 25 && y < 55) return [250, 250, 250]; // 服の中の白いプリント
      return [31, 42, 68];
    });
    const r = extractPalette(px, 60, 80);
    expect(r.backgroundRemoved).toBe(true);
    expect(r.colors.some((c) => hexDist(c.hex, '#fafafa') < 12)).toBe(true);
    expect(hexDist(r.colors[0].hex, '#1f2a44')).toBeLessThan(12);
  });

  it('separates the two colours of a striped top', () => {
    const px = makeImage(60, 80, (x, y) => {
      if (!(x > 8 && x < 52 && y > 8 && y < 72)) return [255, 255, 255];
      // 服の輪郭は実写では影や縫い目で背景と色が変わる。1px のグレーで模す
      if (x === 9 || x === 51 || y === 9 || y === 71) return [150, 150, 150];
      return Math.floor(y / 6) % 2 === 0 ? [240, 240, 240] : [28, 37, 65];
    });
    const r = extractPalette(px, 60, 80);
    expect(r.colors.length).toBeGreaterThanOrEqual(2);
    const sub = suggestSubColor(r.colors);
    expect(sub).not.toBeNull();
    const hexes = r.colors.slice(0, 2).map((c) => c.hex);
    expect(hexes.some((h) => hexDist(h, '#1c2541') < 20)).toBe(true);
    expect(hexes.some((h) => hexDist(h, '#f0f0f0') < 20)).toBe(true);
  });

  it('does not treat a busy background as removable', () => {
    const px = makeImage(60, 80, (x, y) => {
      if (x > 15 && x < 45 && y > 15 && y < 65) return [180, 40, 50];
      return [(x * 37) % 256, (y * 91) % 256, ((x + y) * 13) % 256];
    });
    const r = extractPalette(px, 60, 80);
    expect(r.backgroundRemoved).toBe(false);
    // 中央重みのおかげで赤が最上位に来る
    expect(hexDist(r.colors[0].hex, '#b42832')).toBeLessThan(30);
  });

  it('ignores transparent pixels and merges near-identical shades', () => {
    const px = makeImage(40, 40, (x) => (x % 2 ? [90, 90, 90] : [94, 92, 91]));
    for (let i = 3; i < px.length; i += 4) if (i < 40 * 4 * 10) px[i] = 0; // 上 10 行を透明に
    const r = extractPalette(px, 40, 40, { removeBackground: false });
    expect(r.colors).toHaveLength(1);
    expect(r.colors[0].share).toBeCloseTo(1, 5);
  });

  it('reports a cut-out photo with a transparent background as background removed', () => {
    // 切り抜き画像 (外周が透明) の真ん中に紺の服
    const px = makeImage(40, 40, () => [31, 42, 68]);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (x < 8 || x >= 32 || y < 4 || y >= 36) px[(y * 40 + x) * 4 + 3] = 0;
    const r = extractPalette(px, 40, 40);
    expect(r.colors).toHaveLength(1);
    expect(hexDist(r.colors[0].hex, '#1f2a44')).toBeLessThan(12);
  });

  it('reports one colour for a garment shaded in two close tones (a fold or a heather)', () => {
    // 左右で少し違う赤 (距離 20 程度)。別の色として 2 つ出さず、1 色にまとめる
    const px = makeImage(40, 40, (x, y) => (x < 4 || x >= 36 || y < 4 || y >= 36 ? [255, 255, 255] : x < 20 ? [200, 30, 40] : [214, 40, 52]));
    const r = extractPalette(px, 40, 40);
    expect(r.backgroundRemoved).toBe(true);
    expect(r.colors).toHaveLength(1);
    expect(hexDist(r.colors[0].hex, '#cf232e')).toBeLessThan(30);
    expect(r.colors[0].share).toBeCloseTo(1, 5);
  });

  it('reports one colour for a garment with a smooth gradient, not several close ones', () => {
    // 左から右へ少しずつ明るくなる赤。色の候補は何本かに分かれるが、互いに近いので 1 色にまとめて返す
    const px = makeImage(60, 30, (x) => [160 + x, 20 + Math.round(x / 2), 30 + Math.round(x / 2)]);
    const r = extractPalette(px, 60, 30, { removeBackground: false });
    expect(r.colors).toHaveLength(1);
    expect(r.colors[0].share).toBeCloseTo(1, 5);
  });

  it('treats transparent pixels on the edge as background together with the plain backdrop', () => {
    // 白い背景の一部が透明 (切り抜きの途中) でも、つながった背景として除く
    const px = makeImage(40, 40, (x, y) => (x < 6 || x >= 34 || y < 6 || y >= 34 ? [250, 250, 250] : [31, 42, 68]));
    for (let x = 0; x < 40; x++) px[x * 4 + 3] = 0; // 上の 1 行を透明に
    const r = extractPalette(px, 40, 40);
    expect(r.backgroundRemoved).toBe(true);
    expect(r.colors).toHaveLength(1);
    expect(hexDist(r.colors[0].hex, '#1f2a44')).toBeLessThan(12);
  });

  it('keeps at most maxColors colours, largest first, and drops colours under 3%', () => {
    // 6 本の縦縞 (幅を変えて面積に差をつける) と、1 列だけの細い線
    const stripes: [number, RGB][] = [[12, [200, 30, 40]], [9, [30, 40, 160]], [7, [40, 150, 60]], [5, [230, 200, 40]], [4, [120, 40, 140]], [2, [20, 20, 20]], [1, [240, 120, 20]]];
    const columns: RGB[] = stripes.flatMap(([n, c]) => Array.from({ length: n }, () => c));
    const px = makeImage(columns.length, 30, (x) => columns[x]);
    const r = extractPalette(px, columns.length, 30, { removeBackground: false, maxColors: 4 });
    expect(r.colors).toHaveLength(4);
    const shares = r.colors.map((c) => c.share);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
    const all = extractPalette(px, columns.length, 30, { removeBackground: false, maxColors: 10 });
    expect(all.colors.every((c) => c.share >= 0.03)).toBe(true);
    expect(all.colors.some((c) => hexDist(c.hex, '#f07814') < 40)).toBe(false); // 1 列 (2.5%) のオレンジは出さない
  });

  it('suggestSubColor rejects a tiny or similar second colour', () => {
    expect(suggestSubColor([{ hex: '#000000', share: 0.9 }, { hex: '#ffffff', share: 0.1 }])).toBeNull();
    expect(suggestSubColor([{ hex: '#808080', share: 0.6 }, { hex: '#8a8a8a', share: 0.4 }])).toBeNull();
    expect(suggestSubColor([{ hex: '#808080', share: 0.6 }, { hex: '#1f2a44', share: 0.4 }])?.hex).toBe('#1f2a44');
  });
});
