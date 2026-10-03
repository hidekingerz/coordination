import { describe, expect, it } from 'vitest';
import { SAMPLE_WARDROBE } from '../data/sample';
import { buildConditions } from './season';
import { outfitWarmth, scoreOutfit, suggestOutfits } from './outfit';

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

import { buildWearStats, recordWear } from './wear';

describe('suggestOutfits with wear history', () => {
  const conditions = buildConditions(new Date('2026-10-15'));
  const today = '2026-10-15';

  it('is unchanged when no wear stats are given', () => {
    const res = suggestOutfits(SAMPLE_WARDROBE, { conditions });
    expect(res[0].breakdown.freshness).toBe(1);
  });

  it('pushes down an outfit whose items were worn yesterday', () => {
    const base = suggestOutfits(SAMPLE_WARDROBE, { conditions, limit: 3 });
    const top = base[0];
    const wornIds = top.items.filter((i) => i.category === 'tops' || i.category === 'bottoms').map((i) => i.id);
    const log = recordWear([], wornIds, '2026-10-14', top.id);
    const res = suggestOutfits(SAMPLE_WARDROBE, { conditions, limit: 3, wearStats: buildWearStats(log, today) });
    expect(res[0].id).not.toBe(top.id);
    const same = res.find((o) => o.id === top.id) ?? scoreOutfit(top.items, { conditions, wearStats: buildWearStats(log, today) });
    expect(same.breakdown.freshness).toBeLessThan(0.5);
    expect(same.warnings.join(' ')).toMatch(/最近着た/);
  });

  it('explains long-unworn items when prefer mode is on', () => {
    // 全部を直近に着たことにして、1 枚だけ長く着ていない状態を作る
    const log = SAMPLE_WARDROBE.filter((i) => i.id !== 's-tops-7').map((i) => ({ itemId: i.id, date: '2026-10-13' }));
    const res = suggestOutfits(SAMPLE_WARDROBE, {
      conditions,
      wearStats: buildWearStats(log, today),
      freshnessWeight: 0.3,
    });
    expect(res[0].items.some((i) => i.id === 's-tops-7')).toBe(true);
    expect(res[0].reasons.join(' ')).toMatch(/しばらく着ていない/);
  });

  it('does not call everything "long unworn" while history is still sparse', () => {
    const log = recordWear([], ['s-shoes-1'], '2026-10-14');
    const res = suggestOutfits(SAMPLE_WARDROBE, { conditions, wearStats: buildWearStats(log, today), freshnessWeight: 0.3 });
    expect(res.every((o) => !o.reasons.some((r) => r.includes('しばらく着ていない')))).toBe(true);
  });

  it('penalizes repeating the exact outfit worn this week', () => {
    const top = suggestOutfits(SAMPLE_WARDROBE, { conditions })[0];
    const scored = scoreOutfit(top.items, { conditions, wearStats: new Map(), recentOutfitIds: new Set([top.id]) });
    expect(scored.breakdown.freshness).toBe(0.5);
    expect(scored.warnings.join(' ')).toMatch(/最近着ています/);
  });
});
