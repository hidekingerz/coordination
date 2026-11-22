import { describe, expect, it } from 'vitest';
import { mergeWardrobe, parseImportDetailed } from './storage';

describe('parseImportDetailed: items without id that would get the same id', () => {
  const json = JSON.stringify([
    { name: 'クルーネックT', category: 'トップス', brand: 'ユニクロ', color: '白' },
    { name: 'クルーネックT', category: 'トップス', brand: 'ユニクロ', color: '黒' },
    { name: 'クルーネックT', category: 'トップス', brand: 'ユニクロ', color: 'グレー' },
  ]);

  it('gives each colour variant its own id', () => {
    const { items } = parseImportDetailed(json);
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
  });

  it('keeps the first one on the plain stable id, so re-importing an existing gist does not change it', () => {
    const one = parseImportDetailed(JSON.stringify([{ name: 'クルーネックT', category: 'トップス', brand: 'ユニクロ', color: '白' }]));
    expect(parseImportDetailed(json).items[0].id).toBe(one.items[0].id);
  });

  it('is stable across imports, so re-importing the same JSON does not duplicate', () => {
    const a = parseImportDetailed(json).items.map((i) => i.id);
    const b = parseImportDetailed(json).items.map((i) => i.id);
    expect(b).toEqual(a);
    expect(mergeWardrobe(parseImportDetailed(json).items, parseImportDetailed(json).items, 'merge')).toHaveLength(3);
  });

  it('warns about the rows that were told apart', () => {
    const { warnings } = parseImportDetailed(json);
    expect(warnings.filter((w) => w.includes('同じ名前・カテゴリ・ブランド'))).toHaveLength(2);
  });

  it('does not touch explicit ids', () => {
    const { items } = parseImportDetailed(JSON.stringify([
      { id: 'x', name: 'A', category: 'tops' },
      { id: 'x', name: 'A', category: 'tops', color: '黒' },
    ]));
    expect(items.map((i) => i.id)).toEqual(['x', 'x']);
  });
});

describe('parseImportDetailed: warns about every filled-in field', () => {
  it('says so when the taste was missing and casual was used', () => {
    const { warnings } = parseImportDetailed(JSON.stringify([{ name: '白のレザースニーカー', category: '靴', color: 'white', seasons: '通年' }]));
    expect(warnings.some((w) => w.includes('テイストが無いのでカジュアルにしました'))).toBe(true);
  });
  it('does not warn about the taste when it is given', () => {
    const { warnings } = parseImportDetailed(JSON.stringify([{ name: 'A', category: 'tops', formality: 'きれいめ' }]));
    expect(warnings.some((w) => w.includes('テイスト'))).toBe(false);
  });
});

describe('parseImportDetailed: a row without id that would take the id of a row with one', () => {
  it('tells them apart when the row with id comes first (an exported item, then a new colour typed by hand)', () => {
    const first = parseImportDetailed(JSON.stringify([{ name: 'クルーネックT', category: 'トップス', brand: 'ユニクロ', color: '白' }])).items[0];
    const { items, warnings } = parseImportDetailed(JSON.stringify([first, { name: 'クルーネックT', category: 'トップス', brand: 'ユニクロ', color: '黒' }]));
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
    expect(items[0].id).toBe(first.id);
    expect(warnings.some((w) => w.includes('同じ名前・カテゴリ・ブランド'))).toBe(true);
  });
  it('tells them apart when the row with id comes later', () => {
    const first = parseImportDetailed(JSON.stringify([{ name: 'クルーネックT', category: 'トップス', brand: 'ユニクロ', color: '白' }])).items[0];
    const { items } = parseImportDetailed(JSON.stringify([{ name: 'クルーネックT', category: 'トップス', brand: 'ユニクロ', color: '黒' }, first]));
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
    expect(items[1].id).toBe(first.id);
  });
});
