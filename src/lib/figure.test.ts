import { describe, expect, it } from 'vitest';
import type { ClothingItem } from '../types';
import { buildFigure } from './figure';

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
      item({ id: 'acc', category: 'accessory' }),
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

  it('draws bottoms, onepiece, shoes and accessory in their regular shape', () => {
    const parts = buildFigure([
      item({ id: 'b', category: 'bottoms', warmth: 1 }),
      item({ id: 'o', category: 'onepiece', warmth: 5 }),
      item({ id: 's', category: 'shoes', warmth: 5 }),
      item({ id: 'a', category: 'accessory', warmth: 1 }),
    ]);
    expect(parts.every((p) => p.variant === 'regular')).toBe(true);
  });
});
