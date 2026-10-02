import { describe, expect, it } from 'vitest';
import { colorFamily, evaluatePalette, hexToHsl, isNeutral, normalizeHex, pairScore } from './color';

describe('normalizeHex', () => {
  it('accepts 3 and 6 digit forms', () => {
    expect(normalizeHex('#FFF')).toBe('#ffffff');
    expect(normalizeHex('1f2a44')).toBe('#1f2a44');
    expect(normalizeHex('red')).toBeNull();
  });
});

describe('hexToHsl', () => {
  it('converts primary colors', () => {
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(hexToHsl('#00ff00').h).toBe(120);
    expect(hexToHsl('#0000ff').h).toBe(240);
    expect(hexToHsl('#808080').s).toBe(0);
  });
});

describe('isNeutral / colorFamily', () => {
  it('treats basics as neutral', () => {
    expect(isNeutral(hexToHsl('#ffffff'))).toBe(true);
    expect(isNeutral(hexToHsl('#111111'))).toBe(true);
    expect(isNeutral(hexToHsl('#8a8a8a'))).toBe(true);
    expect(isNeutral(hexToHsl('#1f2a44'))).toBe(true); // navy
    expect(isNeutral(hexToHsl('#d9c4a5'))).toBe(true); // beige
    expect(isNeutral(hexToHsl('#5a3a22'))).toBe(true); // brown
  });
  it('treats vivid colors as accents', () => {
    expect(isNeutral(hexToHsl('#ff0000'))).toBe(false);
    expect(isNeutral(hexToHsl('#d4a826'))).toBe(false); // mustard
    expect(isNeutral(hexToHsl('#6e1f2e'))).toBe(false); // bordeaux
  });
  it('names families', () => {
    expect(colorFamily('#1f2a44')).toBe('navy');
    expect(colorFamily('#d9c4a5')).toBe('beige');
    expect(colorFamily('#cdb48c')).toBe('beige'); // チノパン
    expect(colorFamily('#d4a826')).toBe('yellow'); // マスタードは差し色
    expect(colorFamily('#6e1f2e')).toBe('red');
    expect(colorFamily('#a9c4e0')).toBe('blue');
    expect(colorFamily('#e8a9b8')).toBe('pink');
    expect(colorFamily('#5a6b3a')).toBe('khaki');
    expect(isNeutral(hexToHsl('#5a6b3a'))).toBe(true);
    expect(colorFamily('#7a7a55')).toBe('khaki');
  });
});

describe('pairScore', () => {
  it('ranks neutral + accent highest', () => {
    const na = pairScore('#ffffff', '#6e1f2e');
    const nn = pairScore('#ffffff', '#111111');
    const clash = pairScore('#ff0000', '#00c800');
    const analog = pairScore('#ff0000', '#ff6600');
    expect(na.relation).toBe('neutral-accent');
    expect(nn.relation).toBe('neutral-neutral');
    expect(clash.relation).toBe('triadic');
    expect(analog.relation).toBe('analogous');
    expect(na.score).toBeGreaterThan(nn.score);
    expect(nn.score).toBeGreaterThan(clash.score);
  });
  it('detects clashing hues', () => {
    expect(pairScore('#ff0000', '#ffd400').relation).toBe('clash');
  });
});

describe('evaluatePalette', () => {
  it('scores monotone and basic+accent well', () => {
    const mono = evaluatePalette(['#ffffff', '#111111', '#8a8a8a']);
    expect(mono.scheme).toBe('モノトーン / ベーシック');
    expect(mono.score).toBeGreaterThan(0.8);
    const accent = evaluatePalette(['#ffffff', '#1f2a44', '#6e1f2e']);
    expect(accent.scheme).toBe('ベーシック + 差し色');
    expect(accent.score).toBeGreaterThan(0.8);
  });
  it('penalizes many accents', () => {
    const busy = evaluatePalette(['#ff0000', '#00c800', '#0000ff', '#ffd400']);
    expect(busy.score).toBeLessThan(0.5);
  });
});
