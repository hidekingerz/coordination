import { describe, expect, it } from 'vitest';
import type { ClothingItem } from '../types';
import { brandCounts, filterWardrobe } from './filter';

function item(id: string, p: Partial<ClothingItem> = {}): ClothingItem {
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
    ...p,
  };
}

const wardrobe = [
  item('t1', { name: '白T', brand: 'ユニクロ', tags: ['定番'] }),
  item('t2', { name: '黒T', brand: '無印良品' }),
  item('b1', { name: 'チノパン', category: 'bottoms', brand: 'ユニクロ' }),
  item('s1', { name: 'スニーカー', category: 'shoes' }),
];

describe('filterWardrobe', () => {
  it('returns everything when no filter is set', () => {
    expect(filterWardrobe(wardrobe, { category: 'all', brand: 'all', query: '' })).toHaveLength(4);
  });

  it('filters by brand', () => {
    const r = filterWardrobe(wardrobe, { category: 'all', brand: 'ユニクロ', query: '' });
    expect(r.map((i) => i.id)).toEqual(['t1', 'b1']);
  });

  it('combines brand and category filters', () => {
    const r = filterWardrobe(wardrobe, { category: 'tops', brand: 'ユニクロ', query: '' });
    expect(r.map((i) => i.id)).toEqual(['t1']);
  });

  it('matches the query against name, brand and tags, ignoring case and surrounding spaces', () => {
    const q = (query: string) => filterWardrobe(wardrobe, { category: 'all', brand: 'all', query }).map((i) => i.id);
    expect(q('  白t ')).toEqual(['t1']);
    expect(q('無印')).toEqual(['t2']);
    expect(q('定番')).toEqual(['t1']);
  });

  it('excludes items without a brand when a brand is selected', () => {
    const r = filterWardrobe(wardrobe, { category: 'shoes', brand: 'ユニクロ', query: '' });
    expect(r).toEqual([]);
  });
});

describe('brandCounts', () => {
  it('counts items per brand, ignoring items without a brand', () => {
    expect(brandCounts(wardrobe)).toEqual({ ユニクロ: 2, 無印良品: 1 });
  });

  it('returns an empty object when no item has a brand', () => {
    expect(brandCounts([item('x')])).toEqual({});
  });
});
