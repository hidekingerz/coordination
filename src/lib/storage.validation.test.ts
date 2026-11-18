import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClothingItem } from '../types';
import { colorFamily, normalizeHex } from './color';
import {
  COLOR_NAME_ALIASES,
  coerceItem,
  exportJson,
  loadWardrobe,
  newId,
  parseAccessoryKind,
  parseBottomsShape,
  parseColorValue,
  parseImportDetailed,
  parseOuterLayer,
  parseSleeve,
  saveWardrobe,
  stableId,
} from './storage';

/**
 * 保存データの検証と、手書きデータの読み替えを固定するテスト (#73)。
 * ミューテーションテストで「検査を外しても落ちない」と分かった箇所を塞ぐ。
 */

const KEY = 'coordination.wardrobe.v1';

const valid: ClothingItem = {
  id: 'a',
  name: 'シャツ',
  category: 'tops',
  color: '#ffffff',
  seasons: ['spring'],
  warmth: 2,
  formality: 'smart',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

function stubStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
  return m;
}
const stored = (value: unknown) => stubStorage({ [KEY]: typeof value === 'string' ? value : JSON.stringify(value) });

afterEach(() => vi.unstubAllGlobals());

describe('loadWardrobe / saveWardrobe', () => {
  it('returns an empty closet when nothing is saved, or the data is not an array, or broken', () => {
    stubStorage();
    expect(loadWardrobe()).toEqual([]);
    stored({ items: [valid] });
    expect(loadWardrobe()).toEqual([]);
    stored('{broken');
    expect(loadWardrobe()).toEqual([]);
  });

  it('returns an empty closet when the storage itself is unusable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadWardrobe()).toEqual([]);
  });

  it('round-trips through the wardrobe key', () => {
    const m = stubStorage();
    saveWardrobe([valid]);
    expect([...m.keys()]).toEqual([KEY]);
    expect(loadWardrobe()).toEqual([valid]);
  });

  it.each([
    ['id', 1],
    ['name', null],
    ['category', undefined],
    ['color', 0xffffff],
    ['seasons', 'spring'],
    ['warmth', '2'],
    ['formality', false],
  ])('drops an item whose %s has the wrong type', (field, bad) => {
    stored([{ ...valid, [field]: bad }, { ...valid, id: 'ok' }]);
    expect(loadWardrobe().map((i) => i.id)).toEqual(['ok']);
  });

  it('drops entries that are not objects', () => {
    stored([null, 'シャツ', 3, valid]);
    expect(loadWardrobe()).toEqual([valid]);
  });

  it('trims the brand and drops one that is not a string', () => {
    stored([{ ...valid, brand: '  ユニクロ ' }, { ...valid, id: 'b', brand: 42 }]);
    expect(loadWardrobe().map((i) => i.brand)).toEqual(['ユニクロ', undefined]);
  });

  it('keeps valid optional attributes and drops unknown values', () => {
    stored([
      { ...valid, shape: 'skirt', sleeve: 'long', accessoryKind: 'belt' },
      { ...valid, id: 'b', shape: 'kilt', sleeve: 'medium', accessoryKind: 'ring' },
    ]);
    const [kept, dropped] = loadWardrobe();
    expect([kept.shape, kept.sleeve, kept.accessoryKind]).toEqual(['skirt', 'long', 'belt']);
    expect([dropped.shape, dropped.sleeve, dropped.accessoryKind]).toEqual([undefined, undefined, undefined]);
  });

  it('keeps the outer layer only on outers, and only a known value', () => {
    stored([
      { ...valid, id: 'coat', category: 'outer', outerLayer: 'shell' },
      { ...valid, id: 'odd', category: 'outer', outerLayer: 'cape' },
      { ...valid, id: 'shirt', category: 'tops', outerLayer: 'mid' },
    ]);
    expect(loadWardrobe().map((i) => i.outerLayer)).toEqual(['shell', undefined, undefined]);
  });
});

describe('exportJson', () => {
  it('writes version 2 with the items, indented, and a timestamp', () => {
    const text = exportJson([valid]);
    const data = JSON.parse(text);
    expect(data.version).toBe(2);
    expect(data.items).toEqual([valid]);
    expect(new Date(data.exportedAt).toISOString()).toBe(data.exportedAt);
    expect(text).toContain('\n  "version": 2');
  });

  it('includes the wear log only when there is one', () => {
    expect('wearLog' in JSON.parse(exportJson([valid]))).toBe(false);
    expect('wearLog' in JSON.parse(exportJson([valid], []))).toBe(false);
    const log = [{ itemId: 'a', date: '2026-10-01' }];
    expect(JSON.parse(exportJson([valid], log)).wearLog).toEqual(log);
  });

  it('round-trips items and wear log through the importer', () => {
    const log = [{ itemId: 'a', date: '2026-10-01', outfitId: 'a+b' }];
    const back = parseImportDetailed(exportJson([valid], log));
    expect(back.items).toEqual([{ ...valid, brand: undefined, shape: undefined, sleeve: undefined, accessoryKind: undefined, outerLayer: undefined, subColor: undefined, imageUrl: undefined }]);
    expect(back.wearLog).toEqual(log);
    expect(back.warnings).toEqual([]);
  });
});

describe('parseImportDetailed: structure', () => {
  it('drops broken wear entries, and omits the log when none is left or the input is a bare array', () => {
    const withLog = (wearLog: unknown) => parseImportDetailed(JSON.stringify({ items: [valid], wearLog }));
    expect(withLog([{ itemId: 'a', date: '2026-10-01' }, { itemId: 'a', date: '10/01' }, null]).wearLog).toEqual([{ itemId: 'a', date: '2026-10-01' }]);
    expect('wearLog' in withLog([{ itemId: 'a' }])).toBe(false);
    expect('wearLog' in withLog('2026-10-01')).toBe(false);
    expect('wearLog' in parseImportDetailed(JSON.stringify([valid]))).toBe(false);
  });

  it('numbers skipped rows from 1', () => {
    const r = parseImportDetailed(JSON.stringify([valid, { color: '白' }]));
    expect(r.warnings).toEqual(['2件目: 名前とカテゴリが無いためスキップしました']);
  });

  it('explains what is wrong with the input', () => {
    expect(() => parseImportDetailed('null')).toThrow('items 配列が見つかりません');
    expect(() => parseImportDetailed('{"items": {}}')).toThrow('items 配列が見つかりません');
    expect(() => parseImportDetailed('[{"color": "白"}]')).toThrow('有効なアイテムがありません');
    expect(() => parseImportDetailed('シャツ')).toThrow('JSON として読み取れません');
  });

  it('strips a BOM only at the start, and surrounding whitespace', () => {
    const json = JSON.stringify([{ ...valid, name: 'a﻿b' }]);
    expect(parseImportDetailed(`﻿  ${json}  `).items[0].name).toBe('a﻿b');
  });

  it('accepts a code fence with or without a language, in any case, with spaces around', () => {
    const json = JSON.stringify([valid]);
    for (const text of [`\`\`\`json\n${json}\n\`\`\``, `\`\`\`\n${json}\n\`\`\``, `\`\`\`JSON\n${json}\n\`\`\``, `  \`\`\`json ${json} \`\`\`\n`]) {
      expect(parseImportDetailed(text).items).toHaveLength(1);
    }
  });

  it('does not dig a fence out of surrounding prose', () => {
    const json = JSON.stringify([valid]);
    expect(() => parseImportDetailed(`これです:\n\`\`\`json\n${json}\n\`\`\``)).toThrow('JSON として読み取れません');
    expect(() => parseImportDetailed(`\`\`\`json\n${json}\n\`\`\`\n以上です`)).toThrow('JSON として読み取れません');
  });
});

describe('colour names', () => {
  it('maps every name to a normalised hex', () => {
    for (const [name, hex] of Object.entries(COLOR_NAME_ALIASES)) {
      expect(normalizeHex(hex), name).toBe(hex);
    }
  });

  it.each([
    ['白', 'white'],
    ['アイボリー', 'beige'],
    ['黒', 'black'],
    ['グレー', 'gray'],
    ['チャコール', 'gray'],
    ['紺', 'navy'],
    ['デニム', 'navy'],
    ['ベージュ', 'beige'],
    ['キャメル', 'beige'],
    ['茶', 'brown'],
    ['カーキ', 'khaki'],
    ['ボルドー', 'red'],
    ['オレンジ', 'orange'],
    ['マスタード', 'yellow'],
    ['緑', 'green'],
    ['サックス', 'blue'],
    ['ラベンダー', 'purple'],
    ['ピンク', 'pink'],
  ])('reads %s as a %s', (name, family) => {
    expect(colorFamily(parseColorValue(name)!)).toBe(family);
  });

  it('ignores case, surrounding spaces, and treats runs of spaces or underscores as one space', () => {
    expect(parseColorValue(' Navy ')).toBe('#1f2a44');
    expect(parseColorValue('Light   Blue')).toBe('#a9c4e0');
    expect(parseColorValue('light_blue')).toBe('#a9c4e0');
    expect(parseColorValue('#FFF')).toBe('#ffffff');
  });

  it('returns null for unknown names and non-strings', () => {
    expect(parseColorValue('にじいろ')).toBeNull();
    expect(parseColorValue(0xffffff)).toBeNull();
    expect(parseColorValue(undefined)).toBeNull();
  });
});

describe('coerceItem: reading loose input', () => {
  const read = (raw: Record<string, unknown>, index = 0) => coerceItem({ name: 'シャツ', category: 'tops', color: '白', seasons: '春', warmth: 2, ...raw }, index)!;

  it('rejects anything that is not an object with a name and a category', () => {
    for (const raw of [null, undefined, 'シャツ', 3, {}, { name: 'シャツ' }, { category: 'tops' }, { name: '  ', category: 'tops' }, { name: 'シャツ', category: '謎' }]) {
      expect(coerceItem(raw)).toBeNull();
    }
  });

  it('reads japanese keys', () => {
    const r = coerceItem({ 名前: ' デニム ', カテゴリ: 'ボトムス', 色: 'インディゴ', 副色: '白', 季節: '通年', 厚さ: 3, テイスト: 'ラフ', ブランド: ' リーバイス ', タグ: '定番', 形: 'パンツ' })!;
    expect(r.warnings).toEqual([]);
    expect(r.item).toMatchObject({ name: 'デニム', category: 'bottoms', color: '#2c3e5c', subColor: '#f5f5f0', warmth: 3, formality: 'casual', brand: 'リーバイス', tags: ['定番'], shape: 'pants' });
    expect(r.item.seasons).toEqual(['spring', 'summer', 'autumn', 'winter']);
  });

  it('prefers the english key when both are present', () => {
    expect(read({ name: 'A', 名前: 'B' }).item.name).toBe('A');
  });

  it.each([
    ['Outerwear', 'outer'],
    [' Tシャツ ', 'tops'],
    ['スカート', 'bottoms'],
    ['One-Piece', 'onepiece'],
    ['ローファー', 'shoes'],
    ['アクセ', 'accessory'],
  ])('reads category %s as %s', (raw, category) => {
    expect(read({ category: raw }).item.category).toBe(category);
  });

  it.each([
    ['spring', ['spring']],
    ['sp', ['spring']],
    ['夏', ['summer']],
    ['su', ['summer']],
    ['fall', ['autumn']],
    ['秋', ['autumn']],
    ['au', ['autumn']],
    ['winter', ['winter']],
    ['冬', ['winter']],
    ['wi', ['winter']],
    ['all', ['spring', 'summer', 'autumn', 'winter']],
    ['All-Season', ['spring', 'summer', 'autumn', 'winter']],
    ['オールシーズン', ['spring', 'summer', 'autumn', 'winter']],
    ['春夏秋冬', ['spring', 'summer', 'autumn', 'winter']],
    ['春夏', ['spring', 'summer']],
    ['秋冬', ['autumn', 'winter']],
    ['春秋', ['spring', 'autumn']],
    ['冬・春', ['spring', 'winter']],
    ['春/夏', ['spring', 'summer']],
    ['秋、冬', ['autumn', 'winter']],
    ['春,, 夏  秋', ['spring', 'summer', 'autumn']],
    ['summer autumn', ['summer', 'autumn']],
  ])('reads seasons %s', (raw, seasons) => {
    const r = read({ seasons: raw });
    expect(r.item.seasons).toEqual(seasons);
    expect(r.warnings).toEqual([]);
  });

  it('reads a seasons array, skipping non-strings and unknown labels', () => {
    expect(read({ seasons: ['冬', 1, '謎', 'Spring'] }).item.seasons).toEqual(['spring', 'winter']);
    expect(read({ seasons: undefined, season: '夏' }).item.seasons).toEqual(['summer']);
  });

  it('falls back to all seasons with a warning when none can be read', () => {
    for (const seasons of ['謎', [], 3]) {
      const r = read({ seasons }, 4);
      expect(r.item.seasons).toEqual(['spring', 'summer', 'autumn', 'winter']);
      expect(r.warnings).toEqual(['5件目「シャツ」: 季節が無いので通年にしました']);
    }
  });

  it('reads warmth from a number or a numeric string, rounded and clamped to 1..5', () => {
    expect(read({ warmth: '4' }).item.warmth).toBe(4);
    expect(read({ warmth: 2.6 }).item.warmth).toBe(3);
    expect(read({ warmth: 0 }).item.warmth).toBe(1);
    expect(read({ warmth: 9 }).item.warmth).toBe(5);
    expect(read({ warmth: undefined, 厚さ: 5 }).item.warmth).toBe(5);
  });

  it('falls back to warmth 3 with a warning when it is not a finite number', () => {
    for (const warmth of ['厚い', true, null, Infinity, [4]]) {
      const r = read({ warmth });
      expect(r.item.warmth, String(warmth)).toBe(3);
      expect(r.warnings).toEqual(['1件目「シャツ」: 厚さが無いので 3 にしました']);
    }
  });

  it('says whether the colour was missing or unreadable', () => {
    expect(read({ color: undefined }).warnings).toEqual(['1件目「シャツ」: 色が無いのでグレーにしました']);
    expect(read({ color: 'にじいろ' }).warnings).toEqual(['1件目「シャツ」: 色「にじいろ」を解釈できずグレーにしました']);
    expect(read({ color: undefined, 色: 'にじいろ' }).warnings).toEqual(['1件目「シャツ」: 色「にじいろ」を解釈できずグレーにしました']);
    expect(read({ color: 'にじいろ' }).item.color).toBe('#8a8a8a');
  });

  it('drops an unreadable sub colour without a warning', () => {
    const r = read({ subColor: 'にじいろ' });
    expect(r.item.subColor).toBeUndefined();
    expect(r.warnings).toEqual([]);
    expect(read({ subColor: 'navy' }).item.subColor).toBe('#1f2a44');
  });

  it.each([
    ['Smart_Casual', 'smart'],
    ['きれいめ', 'smart'],
    [' Business ', 'formal'],
    ['ドレス', 'formal'],
    ['カジュアル', 'casual'],
  ])('reads formality %s as %s', (raw, formality) => {
    const r = read({ formality: raw });
    expect(r.item.formality).toBe(formality);
    expect(r.warnings).toEqual([]);
  });

  it('defaults formality to casual, warning only when a value was given', () => {
    expect(read({}).warnings).toEqual([]);
    expect(read({}).item.formality).toBe('casual');
    expect(read({ formality: 'ゆるめ' }).warnings).toEqual(['1件目「シャツ」: テイストを解釈できずカジュアルにしました']);
    expect(read({ テイスト: 'ゆるめ' }).warnings).toEqual(['1件目「シャツ」: テイストを解釈できずカジュアルにしました']);
    expect(read({ formality: 3 }).warnings).toHaveLength(1);
  });

  it('reads tags from an array or a delimited string', () => {
    expect(read({ tags: [' 綿 ', 3, '', '定番'] }).item.tags).toEqual(['綿', '定番']);
    expect(read({ tags: '綿, 定番、長袖 #白  春' }).item.tags).toEqual(['綿', '定番', '長袖', '白', '春']);
    expect(read({ tags: 5 }).item.tags).toEqual([]);
    expect(read({}).item.tags).toEqual([]);
  });

  it('keeps the sleeve on tops and onepieces only', () => {
    expect(read({ sleeve: '半袖' }).item.sleeve).toBe('short');
    expect(read({ category: 'ワンピース', 袖丈: '長袖' }).item.sleeve).toBe('long');
    expect(read({ category: 'ワンピース', 袖: 'ノースリーブ' }).item.sleeve).toBe('sleeveless');
    expect(read({ category: 'outer', sleeve: '半袖' }).item.sleeve).toBeUndefined();
  });

  it('trims a given id and image url, and treats blanks as missing', () => {
    const r = read({ id: ' x-1 ', imageUrl: ' https://example.com/a.jpg ' }).item;
    expect([r.id, r.imageUrl]).toEqual(['x-1', 'https://example.com/a.jpg']);
    const blank = read({ id: '  ', imageUrl: '  ', brand: 'ユニクロ' }).item;
    expect(blank.id).toBe(stableId(['tops', 'シャツ', 'ユニクロ']));
    expect(blank.imageUrl).toBeUndefined();
    expect(read({ id: 7, imageUrl: 7 }).item).toMatchObject({ id: stableId(['tops', 'シャツ', undefined]), imageUrl: undefined });
  });

  it('keeps a given creation time and stamps one otherwise', () => {
    expect(read({ createdAt: '2020-01-01T00:00:00.000Z' }).item.createdAt).toBe('2020-01-01T00:00:00.000Z');
    const stamped = read({}).item.createdAt;
    expect(new Date(stamped).toISOString()).toBe(stamped);
  });
});

describe('attribute labels', () => {
  it('ignore case and surrounding spaces', () => {
    expect(parseBottomsShape(' Shorts ')).toBe('shorts');
    expect(parseSleeve(' LONG ')).toBe('long');
    expect(parseAccessoryKind(' Belt ')).toBe('belt');
    expect(parseOuterLayer(' Shell ')).toBe('shell');
  });

  it('read japanese labels with surrounding spaces', () => {
    expect(parseBottomsShape(' ショーツ ')).toBe('shorts');
    expect(parseSleeve(' タンクトップ ')).toBe('sleeveless');
    expect(parseAccessoryKind(' リュック ')).toBe('bag');
    expect(parseOuterLayer(' 中間着 ')).toBe('mid');
  });

  it('return undefined for unknown labels and non-strings', () => {
    for (const parse of [parseBottomsShape, parseSleeve, parseAccessoryKind, parseOuterLayer]) {
      expect(parse('謎')).toBeUndefined();
      expect(parse(1)).toBeUndefined();
    }
  });
});

describe('stableId', () => {
  it('stays the same across releases, so re-importing overwrites instead of duplicating', () => {
    expect(stableId(['tops', '白シャツ', undefined])).toBe('g-7dd1mm');
    expect(stableId(['outer', 'ネイビージャケット', 'ユニクロ'])).toBe('g-1me0cq8');
  });

  it('separates the parts, and treats a missing part as empty', () => {
    expect(stableId(['a', 'bc'])).not.toBe(stableId(['ab', 'c']));
    expect(stableId(['a', undefined])).toBe(stableId(['a', '']));
    expect(stableId(['a', undefined])).not.toBe(stableId(['a']));
  });
});

describe('newId', () => {
  it('uses crypto.randomUUID when available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
    expect(newId()).toBe('uuid-1');
  });

  it('falls back to a random string when crypto is missing or has no randomUUID', () => {
    for (const crypto of [undefined, {}]) {
      vi.stubGlobal('crypto', crypto);
      const a = newId();
      const b = newId();
      expect(a).toMatch(/^[0-9a-z]{10,}$/);
      expect(a).not.toBe(b);
    }
  });
});
