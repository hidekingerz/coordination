import { describe, expect, it } from 'vitest';
import type { ClothingItem } from '../types';
import { buildFigure, inferAccessoryKind, inferSleeve } from './figure';

function item(partial: Partial<ClothingItem> & Pick<ClothingItem, 'id' | 'category'>): ClothingItem {
  return {
    name: partial.id,
    color: '#000000',
    seasons: ['spring'],
    warmth: 3,
    formality: 'casual',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('buildFigure', () => {
  it('layers parts from the back (shoes) to the front (accessory) regardless of input order', () => {
    const parts = buildFigure([
      item({ id: 'acc', name: 'グレーのマフラー', category: 'accessory' }),
      item({ id: 'out', category: 'outer' }),
      item({ id: 'top', category: 'tops' }),
      item({ id: 'sho', category: 'shoes' }),
      item({ id: 'bot', category: 'bottoms' }),
    ]);
    expect(parts.map((p) => p.kind)).toEqual(['shoes', 'bottoms', 'tops', 'outer', 'accessory']);
  });

  it('skips categories that are not in the outfit', () => {
    const parts = buildFigure([item({ id: 'one', category: 'onepiece' }), item({ id: 'sho', category: 'shoes' })]);
    expect(parts.map((p) => p.kind)).toEqual(['shoes', 'onepiece']);
  });

  it('carries the item colour, name and id into the part', () => {
    const [part] = buildFigure([item({ id: 'top', name: '白シャツ', category: 'tops', color: '#ffffff' })]);
    expect(part).toMatchObject({ itemId: 'top', name: '白シャツ', color: '#ffffff' });
  });

  it('uses the sub colour as accent and omits accent when absent', () => {
    const [withSub] = buildFigure([item({ id: 'a', category: 'tops', subColor: '#ff0000' })]);
    const [withoutSub] = buildFigure([item({ id: 'b', category: 'tops' })]);
    expect(withSub.accent).toBe('#ff0000');
    expect(withoutSub.accent).toBeUndefined();
  });

  it('draws thin tops with short sleeves and thicker tops with long sleeves', () => {
    const thin = buildFigure([item({ id: 't1', category: 'tops', warmth: 2 })]);
    const thick = buildFigure([item({ id: 't2', category: 'tops', warmth: 3 })]);
    expect(thin[0].variant).toBe('short');
    expect(thick[0].variant).toBe('long');
  });

  it('draws the heaviest outerwear as a long coat, otherwise regular length', () => {
    const coat = buildFigure([item({ id: 'o1', category: 'outer', warmth: 5 })]);
    const jacket = buildFigure([item({ id: 'o2', category: 'outer', warmth: 4 })]);
    expect(coat[0].variant).toBe('long');
    expect(jacket[0].variant).toBe('regular');
  });

  it('draws bottoms and shoes in their regular shape', () => {
    const parts = buildFigure([
      item({ id: 'b', category: 'bottoms', warmth: 1 }),
      item({ id: 's', category: 'shoes', warmth: 5 }),
    ]);
    expect(parts.every((p) => p.variant === 'regular')).toBe(true);
  });
});

describe('buildFigure bottoms shape', () => {
  const bottoms = (id: string, shape?: ClothingItem['shape']) => item({ id, category: 'bottoms', shape });

  it('draws bottoms without a shape as regular pants (existing data)', () => {
    expect(buildFigure([bottoms('b')])[0].variant).toBe('regular');
  });

  it('draws pants as regular, shorts as short and skirts as skirt', () => {
    expect(buildFigure([bottoms('p', 'pants')])[0].variant).toBe('regular');
    expect(buildFigure([bottoms('s', 'shorts')])[0].variant).toBe('short');
    expect(buildFigure([bottoms('k', 'skirt')])[0].variant).toBe('skirt');
  });

  it('ignores shape on non-bottoms items', () => {
    expect(buildFigure([item({ id: 't', category: 'tops', warmth: 3, shape: 'skirt' })])[0].variant).toBe('long');
  });
});

describe('sleeve length', () => {
  const tops = (name: string, p: Partial<ClothingItem> = {}) => item({ id: name, name, category: 'tops', warmth: 3, ...p });

  it('uses an explicit sleeve setting first', () => {
    expect(inferSleeve(tops('Tシャツ', { sleeve: 'long' }))).toBe('long');
    expect(inferSleeve(tops('ニット', { sleeve: 'sleeveless' }))).toBe('sleeveless');
  });

  it('infers short sleeves and sleeveless from the name', () => {
    expect(inferSleeve(tops('白の無地Tシャツ'))).toBe('short');
    expect(inferSleeve(tops('半袖シャツ'))).toBe('short');
    expect(inferSleeve(tops('黒のタンクトップ'))).toBe('sleeveless');
    expect(inferSleeve(tops('キャミソール'))).toBe('sleeveless');
  });

  it('infers long sleeves from the name even when the item is thin', () => {
    for (const n of ['ライトブルーのオックスフォードシャツ', '白のリネンシャツ', 'マスタードのロンT', '長袖カットソー', 'グレーのパーカー', 'ネイビーのタートルネック', 'ブラウス']) {
      expect(inferSleeve(tops(n, { warmth: 1 })), n).toBe('long');
    }
  });

  it('prefers the explicit short-sleeve keyword over long-sleeve ones', () => {
    expect(inferSleeve(tops('半袖シャツ'))).toBe('short');
    expect(inferSleeve(tops('半袖ニット'))).toBe('short');
  });

  it('falls back to warmth when the name gives no hint', () => {
    expect(inferSleeve(tops('なにか', { warmth: 2 }))).toBe('short');
    expect(inferSleeve(tops('なにか', { warmth: 3 }))).toBe('long');
  });

  it('applies to onepiece as well and ignores sleeve on other categories', () => {
    expect(buildFigure([item({ id: 'o', name: 'ノースリーブワンピース', category: 'onepiece' })])[0].variant).toBe('sleeveless');
    expect(buildFigure([item({ id: 'o2', name: 'ニットワンピース', category: 'onepiece', warmth: 4 })])[0].variant).toBe('long');
    expect(buildFigure([item({ id: 'b', category: 'bottoms', sleeve: 'long' })])[0].variant).toBe('regular');
  });
});

describe('accessory kind', () => {
  const acc = (name: string, p: Partial<ClothingItem> = {}) => item({ id: name, name, category: 'accessory', ...p });

  it('uses an explicit kind first', () => {
    expect(inferAccessoryKind(acc('マフラー', { accessoryKind: 'belt' }))).toBe('belt');
  });

  it('infers the kind from the name', () => {
    expect(inferAccessoryKind(acc('ブラウンのレザーベルト'))).toBe('belt');
    expect(inferAccessoryKind(acc('グレーのマフラー'))).toBe('neck');
    expect(inferAccessoryKind(acc('テラコッタのストール'))).toBe('neck');
    expect(inferAccessoryKind(acc('シルクのスカーフ'))).toBe('neck');
    expect(inferAccessoryKind(acc('ブラックのキャップ'))).toBe('hat');
    expect(inferAccessoryKind(acc('ニット帽'))).toBe('hat');
    expect(inferAccessoryKind(acc('黒のトートバッグ'))).toBe('bag');
    expect(inferAccessoryKind(acc('リュック'))).toBe('bag');
    expect(inferAccessoryKind(acc('シルバーのネックレス'))).toBe('necklace');
  });

  it('returns undefined when the name gives no hint', () => {
    expect(inferAccessoryKind(acc('お気に入りの小物'))).toBeUndefined();
  });

  it('draws accessories with their kind as variant and skips unknown ones', () => {
    const parts = buildFigure([acc('ブラウンのレザーベルト'), acc('なぞの小物'), acc('キャップ')]);
    expect(parts.map((p) => `${p.kind}:${p.variant}`)).toEqual(['accessory:belt', 'accessory:hat']);
  });
});

describe('belt layering', () => {
  it('draws a belt under the outerwear but over tops and bottoms', () => {
    const parts = buildFigure([
      item({ id: 'out', category: 'outer' }),
      item({ id: 'belt', name: 'ベルト', category: 'accessory' }),
      item({ id: 'top', category: 'tops' }),
      item({ id: 'bot', category: 'bottoms' }),
    ]);
    expect(parts.map((p) => p.itemId)).toEqual(['bot', 'top', 'belt', 'out']);
  });

  it('still draws other accessories in front of everything', () => {
    const parts = buildFigure([item({ id: 'out', category: 'outer' }), item({ id: 'm', name: 'マフラー', category: 'accessory' })]);
    expect(parts.map((p) => p.itemId)).toEqual(['out', 'm']);
  });
});
