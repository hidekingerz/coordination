import { describe, expect, it } from 'vitest';
import { hexToHsl, type PaletteEvaluation } from './color';
import { applyColorMode, type ColorMode, type ColorModeContext } from './colorMode';

/** 0.5 の配色に流儀を重ねたときの増減。上下の切り詰めに当たらない値から始める */
const delta = (hexes: string[], mode: ColorMode, ctx: ColorModeContext = {}, base = 0.5) => {
  const b: PaletteEvaluation = { score: base, scheme: '元の配色', families: [] };
  const r = applyColorMode(b, hexes, mode, ctx);
  return { delta: r.score - base, scheme: r.scheme, warnings: r.warnings ?? [] };
};

const NAVY = '#1f2a44';
const BLUE = '#6f9ad1';
const BROWN = '#5c4a3a';
const GRAY = '#808080';
const BEIGE = '#d9c4a5';
const KHAKI = '#5a5f3a';
const BORDEAUX = '#6b1a2a';
const BLACK = '#111111';
const WHITE = '#f5f5f5';
const GREEN = '#3f7f3f';

describe('italian pair bonuses', () => {
  it.each([
    [[NAVY, BROWN], 0.08, 'アズーロ・エ・マローネ'],
    [[BLUE, BROWN], 0.08, 'アズーロ・エ・マローネ'],
    [[NAVY, BORDEAUX], 0.08, 'ネイビー × ボルドー'],
    [[GRAY, BROWN], 0.07, 'グレー × ブラウン'],
    [[BEIGE, NAVY], 0.06, 'ベージュ × ネイビー'],
    [[KHAKI, BROWN], 0.06, 'カーキ × ブラウンのアースカラー'],
  ])('%o adds %f and is named %s', (hexes, bonus, name) => {
    const r = delta(hexes, 'italian');
    expect(r.delta).toBeCloseTo(bonus, 10);
    expect(r.scheme).toBe(name);
  });
});

describe('british pair bonuses and deductions', () => {
  it.each([
    [[NAVY, GRAY], 0.08, '英国調のネイビー × グレー'],
    [[GRAY, BORDEAUX], 0.07, 'グレー × ボルドー'],
    [[NAVY, WHITE], 0.06, 'ネイビー × ホワイト'],
    [[NAVY, BORDEAUX], 0.05, 'ネイビー × ボルドー'],
    [[BLACK, GRAY], 0.04, 'モノトーンの街着'],
  ])('%o adds %f and is named %s', (hexes, bonus, name) => {
    const r = delta(hexes, 'british');
    expect(r.delta).toBeCloseTo(bonus, 10);
    expect(r.scheme).toBe(name);
  });

  it('takes 0.12 off navy × black', () => {
    expect(delta([NAVY, BLACK], 'british').delta).toBeCloseTo(-0.12, 10);
  });

  it('takes 0.10 off brown or khaki in town (smart and formal) and adds 0.06 to earth colours in the country (casual)', () => {
    for (const f of ['smart', 'formal'] as const) {
      expect(delta([BROWN], 'british', { formality: f }).delta).toBeCloseTo(-0.1, 10);
      expect(delta([KHAKI], 'british', { formality: f }).delta).toBeCloseTo(-0.1, 10);
      expect(delta([GREEN], 'british', { formality: f }).delta).toBeCloseTo(0, 10);
    }
    for (const hex of [BROWN, KHAKI, GREEN]) {
      const r = delta([hex], 'british', { formality: 'casual' });
      expect(r.delta).toBeCloseTo(0.06, 10);
      expect(r.scheme).toBe('カントリー調のアースカラー');
    }
    expect(delta([BROWN], 'british').delta).toBeCloseTo(0, 10); // テイストが分からなければどちらもしない
  });
});

describe('combining bonuses', () => {
  it('takes the largest bonus and adds 0.02 for each other one', () => {
    // 黒 × グレー (0.04) と グレー × ボルドー (0.07) -> 0.07 + 0.02
    const r = delta([BLACK, GRAY, BORDEAUX], 'british');
    expect(r.delta).toBeCloseTo(0.09, 10);
    expect(r.scheme).toBe('グレー × ボルドー');
  });

  it('caps the total at 0.10', () => {
    // 紺 × 茶 (0.08)、グレー × 茶 (0.07)、ベージュ × 紺 (0.06) -> 0.08 + 0.04 = 0.12 だが 0.10 まで
    expect(delta([NAVY, BROWN, GRAY, BEIGE], 'italian').delta).toBeCloseTo(0.1, 10);
  });

  it('keeps the final score within 0..1', () => {
    expect(applyColorMode({ score: 0.98, scheme: '', families: [] }, [NAVY, BROWN], 'italian').score).toBe(1);
    expect(applyColorMode({ score: 0.05, scheme: '', families: [] }, [NAVY, BLACK], 'british').score).toBe(0);
  });
});

describe('italian tone on tone', () => {
  // 彩度 0.5、明度 0.5 の青系 (どれも「ブルー」で、定番ペアには入らない)
  const blueAt = (h: number) => {
    const c = 0.5, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = 0.25;
    const [r, g, b] = h < 240 ? [0, x, c] : [x, 0, c];
    return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
  };

  it('adds 0.05 when the accents are within 20° of each other, and not at 21°', () => {
    const a = blueAt(200);
    const within = blueAt(220);
    const beyond = blueAt(221);
    expect(hexToHsl(within).h - hexToHsl(a).h).toBe(20);
    expect(hexToHsl(beyond).h - hexToHsl(a).h).toBe(21);
    const r = delta([a, within], 'italian');
    expect(r.delta).toBeCloseTo(0.05, 10);
    expect(r.scheme).toBe('トーン・オン・トーン');
    expect(delta([a, beyond], 'italian').delta).toBeCloseTo(0, 10);
  });

  it('ignores white, black and gray when judging tone on tone, and needs two coloured items', () => {
    expect(delta([blueAt(200), blueAt(210), WHITE, BLACK, GRAY], 'italian').delta).toBeCloseTo(0.05, 10);
    expect(delta([blueAt(200), WHITE], 'italian').delta).toBeCloseTo(0, 10);
  });

  it('treats lightness 0.12 or less and 0.92 or more as uncoloured', () => {
    // 色相は近いが、片方がほぼ黒 (明度 0.1) なら有彩色は 1 色だけ
    expect(delta([blueAt(200), '#0d1a26'], 'italian').delta).toBeCloseTo(0, 10);
  });
});

describe('italian vivid accent', () => {
  it('takes 0.08 off an accent with saturation above 0.65 only', () => {
    expect(delta(['#e3c94a'], 'italian').delta).toBeCloseTo(-0.08, 10); // 黄 (彩度 0.73)
    expect(delta(['#c8b060'], 'italian').delta).toBeCloseTo(0, 10); // 黄 (彩度 0.48)
  });

  it('does not count very dark or very light colours as vivid', () => {
    expect(delta(['#1a0000'], 'italian').delta).toBeCloseTo(0, 10); // 明度 0.05
    expect(delta(['#fff0f0'], 'italian').delta).toBeCloseTo(0, 10); // 明度 0.97
  });
});

describe('bordeaux', () => {
  it('is a red at lightness 0.35 or less', () => {
    // 8 ビットの色では明度ちょうど 0.35 は作れないので、両側の最も近い色で試す
    expect(delta(['#902230', NAVY], 'italian').scheme).toBe('ネイビー × ボルドー'); // 明度 0.349
    expect(delta(['#912230', NAVY], 'italian').scheme).not.toBe('ネイビー × ボルドー'); // 明度 0.351
  });
});

describe('rules that belong to one mode only', () => {
  const blueAt = (h: number) => {
    const c = 0.5, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = 0.25;
    return '#' + [0, x, c].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
  };
  it('british mode has no tone-on-tone bonus and no vivid-accent deduction', () => {
    const tone = delta([blueAt(200), blueAt(210)], 'british');
    expect(tone.delta).toBeCloseTo(0, 10);
    expect(tone.scheme).toBe('元の配色');
    expect(delta(['#e3c94a'], 'british').delta).toBeCloseTo(0, 10);
  });
  it('uses the larger country bonus over a smaller pair, whatever order the rules are listed in', () => {
    // 黒 × グレー (0.04) より、カントリー調 (0.06) が大きい -> 0.06 + 0.02、名前はカントリー調
    const r = delta([BLACK, GRAY, BROWN], 'british', { formality: 'casual' });
    expect(r.delta).toBeCloseTo(0.08, 10);
    expect(r.scheme).toBe('カントリー調のアースカラー');
  });
});
