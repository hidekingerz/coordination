import { describe, expect, it } from 'vitest';
import { SAMPLE_WARDROBE } from '../data/sample';
import { buildConditions } from './season';
import { outfitWarmth, suggestOutfits } from './outfit';

describe('suggestOutfits', () => {
  it('returns up to the limit, sorted by score', () => {
    const res = suggestOutfits(SAMPLE_WARDROBE, { conditions: buildConditions(new Date('2026-10-15')), limit: 5 });
    expect(res.length).toBe(5);
    for (let i = 1; i < res.length; i++) expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
  });

  it('builds complete outfits (top+bottom or onepiece, plus shoes)', () => {
    const res = suggestOutfits(SAMPLE_WARDROBE, { conditions: buildConditions(new Date('2026-10-15')) });
    for (const o of res) {
      const cats = o.items.map((i) => i.category);
      const hasBase = (cats.includes('tops') && cats.includes('bottoms')) || cats.includes('onepiece');
      expect(hasBase).toBe(true);
      expect(cats).toContain('shoes');
    }
  });

  it('includes outerwear in winter and skips heavy coats in summer', () => {
    const winter = suggestOutfits(SAMPLE_WARDROBE, { conditions: buildConditions(new Date('2026-01-15')) });
    expect(winter.every((o) => o.items.some((i) => i.category === 'outer'))).toBe(true);
    const summer = suggestOutfits(SAMPLE_WARDROBE, { conditions: buildConditions(new Date('2026-08-01')) });
    expect(summer.some((o) => o.items.some((i) => i.warmth >= 5))).toBe(false);
    expect(summer[0].breakdown.season).toBeGreaterThan(0.6);
  });

  it('respects a must-include item', () => {
    const res = suggestOutfits(SAMPLE_WARDROBE, {
      conditions: buildConditions(new Date('2026-10-15')),
      mustInclude: ['s-tops-5'],
    });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((o) => o.items.some((i) => i.id === 's-tops-5'))).toBe(true);
  });

  it('favours the requested formality', () => {
    const smart = suggestOutfits(SAMPLE_WARDROBE, {
      conditions: buildConditions(new Date('2026-10-15')),
      formality: 'smart',
    });
    expect(smart[0].items.filter((i) => i.category !== 'accessory').every((i) => i.formality !== 'casual')).toBe(true);
  });

  it('returns nothing when no base garments exist', () => {
    const shoesOnly = SAMPLE_WARDROBE.filter((i) => i.category === 'shoes');
    expect(suggestOutfits(shoesOnly, { conditions: buildConditions(new Date()) })).toEqual([]);
  });

  it('weights outerwear in perceived warmth', () => {
    const tee = SAMPLE_WARDROBE.find((i) => i.id === 's-tops-1')!;
    const denim = SAMPLE_WARDROBE.find((i) => i.id === 's-bottoms-1')!;
    const down = SAMPLE_WARDROBE.find((i) => i.id === 's-outer-2')!;
    expect(outfitWarmth([tee, denim])).toBe(2);
    expect(outfitWarmth([tee, denim, down])).toBeGreaterThan(4);
  });
});
