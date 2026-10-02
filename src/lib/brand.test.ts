import { describe, expect, it } from 'vitest';
import type { ClothingItem } from '../types';
import { knownBrands, normalizeBrand } from './brand';

function item(id: string, brand?: string): ClothingItem {
  return {
    id,
    name: id,
    category: 'tops',
    color: '#000000',
    seasons: ['spring'],
    warmth: 3,
    formality: 'casual',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    brand,
  };
}

describe('normalizeBrand', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeBrand('  ユニクロ  ')).toBe('ユニクロ');
  });

  it('returns undefined for empty or whitespace-only input', () => {
    expect(normalizeBrand('')).toBeUndefined();
    expect(normalizeBrand('   ')).toBeUndefined();
    expect(normalizeBrand(undefined)).toBeUndefined();
  });
});

describe('knownBrands', () => {
  it('lists each brand once, sorted, ignoring items without a brand', () => {
    const brands = knownBrands([item('a', '無印良品'), item('b'), item('c', 'ユニクロ'), item('d', '無印良品')]);
    expect(brands).toEqual(['ユニクロ', '無印良品']);
  });

  it('returns an empty list for an empty wardrobe', () => {
    expect(knownBrands([])).toEqual([]);
  });
});
