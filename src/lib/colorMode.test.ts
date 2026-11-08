import { describe, expect, it } from 'vitest';
import { evaluatePalette } from './color';
import { COLOR_MODES, applyColorMode, evaluatePaletteIn, loadColorMode, saveColorMode, type ColorMode } from './colorMode';

const NAVY = '#1f2a44';
const SAX = '#6f9ad1';
const BROWN = '#5c4a3a';
const CAMEL = '#c19a6b';
const GRAY = '#808080';
const BLACK = '#111111';
const WHITE = '#f5f5f5';
const RED = '#d62828';
const BORDEAUX = '#6b1a2a';
const YELLOW = '#e3c94a';
const KHAKI = '#5a5f3a';

describe('colorMode: standard', () => {
  it('returns the plain palette evaluation unchanged', () => {
    for (const hexes of [[NAVY, BROWN], [NAVY, RED], [GRAY, YELLOW, BLACK]]) {
      expect(evaluatePaletteIn(hexes, 'standard')).toEqual({ ...evaluatePalette(hexes), warning: undefined });
    }
  });
});

describe('colorMode: italian', () => {
  it('names navy × brown アズーロ・エ・マローネ and lifts it above navy × bright red', () => {
    const azzurro = evaluatePaletteIn([NAVY, BROWN], 'italian');
    const red = evaluatePaletteIn([NAVY, RED], 'italian');
    expect(azzurro.scheme).toBe('アズーロ・エ・マローネ');
    expect(azzurro.score).toBeGreaterThan(red.score);
    // 標準ではベーシック同士 (0.85) < ベーシック + 差し色 (0.92) だった
    expect(evaluatePalette([NAVY, BROWN]).score).toBeLessThan(evaluatePalette([NAVY, RED]).score);
  });
  it('treats light blue (azzurro) × camel the same way', () => {
    expect(evaluatePaletteIn([SAX, CAMEL], 'italian').scheme).toBe('アズーロ・エ・マローネ');
  });
  it('distinguishes bordeaux from bright red', () => {
    expect(evaluatePaletteIn([NAVY, BORDEAUX], 'italian').scheme).toBe('ネイビー × ボルドー');
    expect(evaluatePaletteIn([NAVY, RED], 'italian').scheme).not.toBe('ネイビー × ボルドー');
  });
  it('penalises a vivid accent', () => {
    expect(evaluatePaletteIn([NAVY, YELLOW], 'italian').score).toBeLessThan(evaluatePalette([NAVY, YELLOW]).score);
  });
  it('rewards tone on tone', () => {
    const r = evaluatePaletteIn([NAVY, '#2b3a5c', '#3d4f7a'], 'italian');
    expect(r.scheme).toBe('トーン・オン・トーン');
    expect(r.score).toBeGreaterThan(evaluatePalette([NAVY, '#2b3a5c', '#3d4f7a']).score);
  });
  it('adds a smaller bonus for a second matching pair, capped at 1', () => {
    const one = evaluatePaletteIn([NAVY, BROWN], 'italian').score;
    const two = evaluatePaletteIn([NAVY, BROWN, GRAY], 'italian').score;
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThanOrEqual(1);
  });
});

describe('colorMode: british', () => {
  it('names navy × gray as the town classic', () => {
    expect(evaluatePaletteIn([NAVY, GRAY], 'british').scheme).toBe('英国調のネイビー × グレー');
  });
  it('penalises navy × black with a warning', () => {
    const r = evaluatePaletteIn([NAVY, BLACK], 'british');
    expect(r.score).toBeLessThan(evaluatePalette([NAVY, BLACK]).score);
    expect(r.warning).toContain('紺と黒');
  });
  it('lowers brown in town (smart) and lifts earth colours in the country (casual)', () => {
    const base = evaluatePalette([NAVY, BROWN]).score;
    const town = evaluatePaletteIn([NAVY, BROWN], 'british', { formality: 'smart' });
    const country = evaluatePaletteIn([NAVY, BROWN], 'british', { formality: 'casual' });
    expect(town.score).toBeLessThan(base);
    expect(town.warning).toContain('街');
    expect(country.score).toBeGreaterThan(base);
    expect(country.scheme).toBe('カントリー調のアースカラー');
  });
  it('does not touch khaki × white without a formality context beyond the pair table', () => {
    expect(evaluatePaletteIn([KHAKI, WHITE], 'british').score).toBe(evaluatePalette([KHAKI, WHITE]).score);
  });
});

describe('colorMode: definitions and storage', () => {
  it('exposes a label and a one-line description for every mode', () => {
    for (const m of Object.keys(COLOR_MODES) as ColorMode[]) {
      expect(COLOR_MODES[m].label.length).toBeGreaterThan(0);
      expect(COLOR_MODES[m].description.length).toBeGreaterThan(0);
    }
    expect(COLOR_MODES.standard.label).toBe('標準');
  });
  it('applyColorMode never returns a score outside 0..1', () => {
    const base = evaluatePalette([NAVY, BROWN, GRAY, BORDEAUX]);
    const r = applyColorMode(base, [NAVY, BROWN, GRAY, BORDEAUX], 'italian');
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
  it('round-trips through storage and falls back to standard on junk', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadColorMode(storage)).toBe('standard');
    saveColorMode('british', storage);
    expect(loadColorMode(storage)).toBe('british');
    store.set('coordination.colorMode.v1', 'french');
    expect(loadColorMode(storage)).toBe('standard');
  });
});
