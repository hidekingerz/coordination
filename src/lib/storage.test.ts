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
