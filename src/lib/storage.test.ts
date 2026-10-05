import { describe, expect, it } from 'vitest';
import { parseImport } from './storage';

const base = {
  id: 'x',
  name: 'x',
  category: 'tops',
  color: '#000000',
  seasons: ['spring'],
  warmth: 3,
  formality: 'casual',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('parseImport brand handling', () => {
  it('keeps a string brand', () => {
    const [item] = parseImport(JSON.stringify([{ ...base, brand: 'ユニクロ' }]));
    expect(item.brand).toBe('ユニクロ');
  });

  it('accepts items without a brand', () => {
    const [item] = parseImport(JSON.stringify([base]));
    expect(item.brand).toBeUndefined();
  });

  it('drops a non-string brand instead of rejecting the item', () => {
    const [item] = parseImport(JSON.stringify([{ ...base, brand: 123 }]));
    expect(item.brand).toBeUndefined();
  });
});

import { coerceItem, mergeWardrobe, parseImportDetailed, stableId } from './storage';

describe('parseImportDetailed (lenient, hand-written data)', () => {
  it('accepts japanese labels, color names and comma separated seasons', () => {
    const { items, warnings } = parseImportDetailed(
      JSON.stringify([
        { name: '白のTシャツ', category: 'トップス', color: '白', seasons: '春,夏', warmth: 1, formality: 'カジュアル', tags: 'Tシャツ, 定番' },
      ]),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      category: 'tops',
      color: '#f5f5f0',
      seasons: ['spring', 'summer'],
      warmth: 1,
      formality: 'casual',
      tags: ['Tシャツ', '定番'],
    });
    expect(items[0].id).toMatch(/^g-/);
    expect(warnings).toEqual([]);
  });

  it('fills defaults and reports what it filled', () => {
    const { items, warnings } = parseImportDetailed(JSON.stringify({ items: [{ name: 'なにか', category: 'shoes' }] }));
    expect(items[0]).toMatchObject({ color: '#8a8a8a', seasons: ['spring', 'summer', 'autumn', 'winter'], warmth: 3, formality: 'casual' });
    expect(warnings.join('\n')).toMatch(/色/);
    expect(warnings.join('\n')).toMatch(/季節/);
    expect(warnings.join('\n')).toMatch(/厚さ/);
  });

  it('skips rows without name or category but keeps the rest', () => {
    const { items, warnings } = parseImportDetailed(JSON.stringify([{ name: 'x' }, { name: 'ok', category: 'bottoms', color: '#000' }]));
    expect(items).toHaveLength(1);
    expect(items[0].color).toBe('#000000');
    expect(warnings[0]).toMatch(/スキップ/);
  });

  it('accepts a fenced code block and a BOM', () => {
    const text = '﻿```json\n[{"name":"a","category":"outer","color":"navy"}]\n```';
    expect(parseImportDetailed(text).items[0].color).toBe('#1f2a44');
  });

  it('clamps warmth and understands 通年', () => {
    const r = coerceItem({ name: 'a', category: '靴', color: 'black', warmth: 9, seasons: '通年' })!;
    expect(r.item.warmth).toBe(5);
    expect(r.item.seasons).toHaveLength(4);
  });

  it('rejects text that is not json or has no items', () => {
    expect(() => parseImportDetailed('hello')).toThrow(/JSON/);
    expect(() => parseImportDetailed('{"foo":1}')).toThrow(/items/);
    expect(() => parseImportDetailed('[{"foo":1}]')).toThrow(/有効なアイテム/);
  });
});

describe('stableId / mergeWardrobe', () => {
  it('gives the same id for the same name so re-import overwrites instead of duplicating', () => {
    expect(stableId(['tops', '白T', undefined])).toBe(stableId(['tops', '白T', undefined]));
    expect(stableId(['tops', '白T', undefined])).not.toBe(stableId(['tops', '黒T', undefined]));
    const first = parseImportDetailed('[{"name":"白T","category":"tops","color":"white"}]').items;
    const second = parseImportDetailed('[{"name":"白T","category":"tops","color":"ivory"}]').items;
    const merged = mergeWardrobe(first, second, 'merge');
    expect(merged).toHaveLength(1);
    expect(merged[0].color).toBe('#ece7dc');
  });

  it('replace mode drops existing items', () => {
    const a = { ...base, id: 'a' } as never;
    const b = { ...base, id: 'b' } as never;
    expect(mergeWardrobe([a], [b], 'replace')).toEqual([b]);
    expect(mergeWardrobe([a], [b], 'merge')).toHaveLength(2);
  });
});

describe('parseImport shape handling', () => {
  it('keeps a valid bottoms shape', () => {
    const [item] = parseImport(JSON.stringify([{ ...base, category: 'bottoms', shape: 'skirt' }]));
    expect(item.shape).toBe('skirt');
  });

  it('accepts japanese shape labels in hand-written data', () => {
    const [item] = parseImport(JSON.stringify([{ name: 'a', category: 'ボトムス', 形: 'スカート' }]));
    expect(item.shape).toBe('skirt');
  });

  it('ignores shape on non-bottoms items', () => {
    const [item] = parseImport(JSON.stringify([{ ...base, category: 'tops', shape: 'skirt' }]));
    expect(item.shape).toBeUndefined();
  });

  it('drops an unknown shape value', () => {
    const [item] = parseImport(JSON.stringify([{ ...base, category: 'bottoms', shape: 'kilt' }]));
    expect(item.shape).toBeUndefined();
  });
});

describe('parseImport sleeve handling', () => {
  it('keeps a valid sleeve value and accepts japanese labels', () => {
    expect(parseImport(JSON.stringify([{ ...base, sleeve: 'long' }]))[0].sleeve).toBe('long');
    expect(parseImport(JSON.stringify([{ name: 'a', category: 'トップス', 袖丈: '半袖' }]))[0].sleeve).toBe('short');
    expect(parseImport(JSON.stringify([{ name: 'a', category: 'tops', sleeve: 'ノースリーブ' }]))[0].sleeve).toBe('sleeveless');
  });

  it('drops unknown values and ignores sleeve on bottoms', () => {
    expect(parseImport(JSON.stringify([{ ...base, sleeve: 'medium' }]))[0].sleeve).toBeUndefined();
    expect(parseImport(JSON.stringify([{ ...base, category: 'bottoms', sleeve: 'long' }]))[0].sleeve).toBeUndefined();
  });
});

describe('parseImport accessory kind handling', () => {
  it('keeps a valid kind and accepts japanese labels', () => {
    expect(parseImport(JSON.stringify([{ ...base, category: 'accessory', accessoryKind: 'belt' }]))[0].accessoryKind).toBe('belt');
    expect(parseImport(JSON.stringify([{ name: 'a', category: '小物', 種類: '帽子' }]))[0].accessoryKind).toBe('hat');
    expect(parseImport(JSON.stringify([{ name: 'a', category: 'accessory', accessoryKind: 'マフラー' }]))[0].accessoryKind).toBe('neck');
  });

  it('drops unknown values and ignores the kind on other categories', () => {
    expect(parseImport(JSON.stringify([{ ...base, category: 'accessory', accessoryKind: 'ring' }]))[0].accessoryKind).toBeUndefined();
    expect(parseImport(JSON.stringify([{ ...base, category: 'tops', accessoryKind: 'belt' }]))[0].accessoryKind).toBeUndefined();
  });
});
