import { describe, expect, it } from 'vitest';
import type { ClothingItem } from '../types';
import { SAMPLE_WARDROBE } from '../data/sample';
import { buildConditions } from './season';
import { outfitWarmth, scoreOutfit, suggestOutfits, type Outfit } from './outfit';

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

describe('morning/evening chill warning', () => {
  const date = new Date('2026-10-15T12:00:00');
  const noOuter = (o: { items: { category: string }[] }) => !o.items.some((i) => i.category === 'outer');

  it('warns on outfits without outerwear when the daily range is 10℃ or more', () => {
    const res = suggestOutfits(SAMPLE_WARDROBE, { conditions: buildConditions(date, 22, 11) });
    const bare = res.filter(noOuter);
    expect(bare.length).toBeGreaterThan(0);
    for (const o of bare) expect(o.warnings.some((w) => w.includes('朝晩') && w.includes('11℃'))).toBe(true);
  });

  it('warns on outfits without outerwear when the minimum is 10℃ or lower even with a small range', () => {
    // 冷える日はアウターなしが上位に残りにくくなったので、組み合わせを直接採点して確かめる
    const byId = (id: string) => SAMPLE_WARDROBE.find((i) => i.id === id)!;
    const bare = scoreOutfit([byId('s-tops-5'), byId('s-bottoms-4'), byId('s-shoes-2')], { conditions: buildConditions(date, 17, 9) });
    expect(bare.warnings.some((w) => w.includes('朝晩'))).toBe(true);
  });

  it('does not warn when outerwear is included', () => {
    const res = suggestOutfits(SAMPLE_WARDROBE, { conditions: buildConditions(date, 22, 11) });
    const withOuter = res.filter((o) => !noOuter(o));
    for (const o of withOuter) expect(o.warnings.some((w) => w.includes('朝晩'))).toBe(false);
  });

  it('does not warn when the range is small and the minimum is mild, or when min is unknown', () => {
    const mild = suggestOutfits(SAMPLE_WARDROBE, { conditions: buildConditions(date, 24, 18) });
    const unknown = suggestOutfits(SAMPLE_WARDROBE, { conditions: buildConditions(date, 24) });
    for (const o of [...mild, ...unknown]) expect(o.warnings.some((w) => w.includes('朝晩'))).toBe(false);
  });
});

describe('layering and variety (jacket-centric wardrobe)', () => {
  const mk = (id: string, category: ClothingItem['category'], warmth: ClothingItem['warmth'], color = '#8a8a8a'): ClothingItem => ({
    id,
    name: id,
    category,
    color,
    seasons: ['spring', 'autumn', 'winter'],
    warmth,
    formality: 'smart',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  // 薄手シャツが多く、ジャケットは厚さ 3 という持ち主を想定
  const wardrobe: ClothingItem[] = [
    mk('shirt-a', 'tops', 2, '#f5f5f0'),
    mk('shirt-b', 'tops', 2, '#a9c4e0'),
    mk('shirt-c', 'tops', 2, '#1f2a44'),
    mk('wool-shirt', 'tops', 3, '#141414'),
    mk('knit-polo', 'tops', 3, '#141414'),
    mk('knit-gray', 'tops', 3, '#8a8a8a'),
    mk('pants-a', 'bottoms', 3, '#4a4a4a'),
    mk('pants-b', 'bottoms', 3, '#5a3a22'),
    mk('pants-c', 'bottoms', 3, '#d9c4a5'),
    mk('jacket-a', 'outer', 3, '#1f2a44'),
    mk('jacket-b', 'outer', 3, '#8b5a2b'),
    mk('shoes', 'shoes', 3, '#141414'),
  ];
  const date = new Date('2026-10-25T12:00:00');

  it('models layering: an outer over a thin shirt raises perceived warmth toward the target', () => {
    const shirt = mk('s', 'tops', 2);
    const pants = mk('p', 'bottoms', 3);
    const jacket = mk('j', 'outer', 3);
    expect(outfitWarmth([shirt, pants])).toBe(2.5);
    const layered = outfitWarmth([shirt, pants, jacket]);
    expect(layered).toBeGreaterThan(3);
    expect(layered).toBeLessThan(3.5);
  });

  it('suggests at least two outfits with an outer on a cool day when jackets are available', () => {
    const res = suggestOutfits(wardrobe, { conditions: buildConditions(date, 19), limit: 5 });
    expect(res.filter((o) => o.items.some((i) => i.category === 'outer')).length).toBeGreaterThanOrEqual(2);
  });

  it('does not repeat the same top more than twice in the top five', () => {
    const res = suggestOutfits(wardrobe, { conditions: buildConditions(date, 19), limit: 5 });
    const counts = new Map<string, number>();
    for (const o of res) for (const i of o.items) if (i.category === 'tops') counts.set(i.id, (counts.get(i.id) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it('does not repeat the same outer more than twice in the top five', () => {
    // 厚さ 2 のジャケットが目標にぴったり合う日でも、同じジャケットばかりにならない
    // 目標 3 にぴったり合う薄手ジャケットは 1 着だけ。上限が無ければこれが全件に入る
    const w = [...wardrobe, mk('jacket-light', 'outer', 2, '#d9cfc0')];
    const res = suggestOutfits(w, { conditions: buildConditions(date, 18, 9), limit: 5 });
    const counts = new Map<string, number>();
    for (const o of res) for (const i of o.items) if (i.category === 'outer') counts.set(i.id, (counts.get(i.id) ?? 0) + 1);
    expect(res.filter((o) => o.items.some((i) => i.category === 'outer')).length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it('lowers the warmth score of outer-less outfits when mornings are chilly', () => {
    const byId = (id: string) => wardrobe.find((i) => i.id === id)!;
    const items = [byId('wool-shirt'), byId('pants-a'), byId('shoes')]; // アウターなし
    const mild = scoreOutfit(items, { conditions: buildConditions(date, 19, 14) });
    const chilly = scoreOutfit(items, { conditions: buildConditions(date, 19, 8) });
    expect(chilly.breakdown.warmth).toBeLessThan(mild.breakdown.warmth);
    const withOuter = scoreOutfit([...items, byId('jacket-a')], { conditions: buildConditions(date, 19, 8) });
    expect(withOuter.breakdown.warmth).toBeGreaterThan(chilly.breakdown.warmth);
  });
});

describe('two outer layers (jacket under a coat)', () => {
  const mk = (id: string, category: ClothingItem['category'], warmth: ClothingItem['warmth'], color = '#8a8a8a'): ClothingItem => ({
    id,
    name: id,
    category,
    color,
    seasons: ['autumn', 'winter'],
    warmth,
    formality: 'smart',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  // 名前から jacket = 中間着、coat = 外套と推定される
  const wardrobe: ClothingItem[] = [
    mk('shirt-a', 'tops', 2, '#f5f5f0'),
    mk('shirt-b', 'tops', 2, '#a9c4e0'),
    mk('knit-a', 'tops', 3, '#141414'),
    mk('knit-b', 'tops', 3, '#8a8a8a'),
    mk('pants-a', 'bottoms', 3, '#4a4a4a'),
    mk('pants-b', 'bottoms', 3, '#5a3a22'),
    mk('pants-c', 'bottoms', 3, '#d9c4a5'),
    mk('jacket-a', 'outer', 3, '#1f2a44'),
    mk('jacket-b', 'outer', 3, '#8b5a2b'),
    mk('coat-a', 'outer', 4, '#141414'),
    mk('coat-b', 'outer', 5, '#8a8a8a'),
    mk('coat-c', 'outer', 4, '#d9c4a5'),
    mk('shoes', 'shoes', 3, '#141414'),
  ];
  const date = new Date('2026-12-10T12:00:00');
  const outers = (o: Outfit) => o.items.filter((i) => i.category === 'outer');
  const byId = (id: string) => wardrobe.find((i) => i.id === id)!;

  it('counts the mid layer as body warmth and adds a bonus per layer', () => {
    const shirt = mk('s', 'tops', 2);
    const pants = mk('p', 'bottoms', 3);
    const jacket = mk('jacket', 'outer', 3);
    const coat = mk('coat', 'outer', 4);
    const coatOnly = outfitWarmth([shirt, pants, coat]);
    const both = outfitWarmth([shirt, pants, jacket, coat]);
    expect(both).toBeGreaterThan(coatOnly);
    // 体の平均 (2+3+3)/3 と外套 4 の加重平均 3.6 に、2 層分のボーナス 1.0
    expect(both).toBeCloseTo(4.6, 5);
    expect(outfitWarmth([shirt, pants, jacket, mk('coat5', 'outer', 5)])).toBe(5);
    // 並び順に依存しない
    expect(outfitWarmth([coat, jacket, pants, shirt])).toBe(both);
  });

  it('suggests a jacket under a coat on a cold day', () => {
    const res = suggestOutfits(wardrobe, { conditions: buildConditions(date, 6), limit: 5 });
    const layered = res.filter((o) => outers(o).length === 2);
    expect(layered.length).toBeGreaterThanOrEqual(1);
    for (const o of layered) {
      expect(outers(o).map((i) => i.id.split('-')[0]).sort()).toEqual(['coat', 'jacket']);
    }
  });

  it('never pairs two outers on a mild day, even deep in the ranking', () => {
    const res = suggestOutfits(wardrobe, { conditions: buildConditions(date, 19), limit: 200 });
    expect(res.length).toBeGreaterThan(5);
    for (const o of res) expect(outers(o).length).toBeLessThanOrEqual(1);
  });

  it('pairs them on a mild day when both are requested as must-include', () => {
    const res = suggestOutfits(wardrobe, { conditions: buildConditions(date, 19), limit: 5, mustInclude: ['jacket-a', 'coat-a'] });
    expect(res.length).toBeGreaterThan(0);
    for (const o of res) expect(outers(o).map((i) => i.id).sort()).toEqual(['coat-a', 'jacket-a']);
  });

  it('never pairs two mids or two shells', () => {
    const res = suggestOutfits(wardrobe, { conditions: buildConditions(date, 6), limit: 5, mustInclude: ['jacket-a', 'jacket-b'] });
    expect(res).toEqual([]);
  });

  it('counts each outer of a pair toward the same-outer limit', () => {
    const res = suggestOutfits(wardrobe, { conditions: buildConditions(date, 6), limit: 5 });
    const counts = new Map<string, number>();
    for (const o of res) for (const i of outers(o)) counts.set(i.id, (counts.get(i.id) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it('explains the layering in the reasons', () => {
    const o = scoreOutfit([byId('shirt-a'), byId('pants-a'), byId('jacket-a'), byId('coat-a'), byId('shoes')], {
      conditions: buildConditions(date, 6),
    });
    expect(o.reasons.some((r) => r.includes('jacket-a') && r.includes('coat-a') && r.includes('重ね'))).toBe(true);
  });
});

describe('diversity when an item is forced (mustInclude)', () => {
  const mk = (id: string, category: ClothingItem['category'], warmth: ClothingItem['warmth'], color: string): ClothingItem => ({
    id,
    name: id,
    category,
    color,
    seasons: ['autumn', 'winter'],
    warmth,
    formality: 'smart',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  // 名前から jacket = 中間着、coat = 外套と推定される
  const wardrobe: ClothingItem[] = [
    mk('knit-a', 'tops', 4, '#141414'),
    mk('knit-b', 'tops', 4, '#cfc5b5'),
    mk('knit-c', 'tops', 3, '#5a3a22'),
    mk('shirt-a', 'tops', 2, '#a9c4e0'),
    mk('pants-a', 'bottoms', 3, '#141414'),
    mk('pants-b', 'bottoms', 3, '#4a4a4a'),
    mk('pants-c', 'bottoms', 3, '#d9c4a5'),
    mk('pants-d', 'bottoms', 3, '#1f2a44'),
    mk('jacket-a', 'outer', 3, '#141414'),
    mk('jacket-b', 'outer', 3, '#1f2a44'),
    mk('jacket-c', 'outer', 3, '#8b5a2b'),
    mk('coat-a', 'outer', 5, '#141414'),
    mk('coat-b', 'outer', 4, '#1f2a44'),
    mk('boots', 'shoes', 4, '#141414'),
    mk('loafers', 'shoes', 3, '#5a3a22'),
    mk('belt-a', 'accessory', 3, '#141414'),
    mk('belt-b', 'accessory', 3, '#5a3a22'),
  ];
  // 真冬 (目標の厚さ 5): 外套ありが基本で、中間着 + 外套の 2 層も候補になる
  const conditions = buildConditions(new Date('2026-01-15T09:00:00'), 5, 0);
  const outerIds = (o: Outfit) => o.items.filter((i) => i.category === 'outer').map((i) => i.id);
  const baseKey = (o: Outfit) =>
    o.items
      .filter((i) => i.category === 'tops' || i.category === 'bottoms')
      .map((i) => i.id)
      .sort()
      .join('+');

  it('still varies the outerwear when a top is forced', () => {
    const results = suggestOutfits(wardrobe, { conditions, limit: 5, mustInclude: ['knit-a'] });
    expect(results).toHaveLength(5);
    const counts = new Map<string, number>();
    for (const o of results) for (const id of outerIds(o)) counts.set(id, (counts.get(id) ?? 0) + 1);
    // 指定していないアウターは 2 回まで (MAX_SAME_OUTER) で、3 種類以上出る
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    expect(counts.size).toBeGreaterThanOrEqual(3);
  });

  it('does not repeat the same top+bottom when an outer is forced', () => {
    const results = suggestOutfits(wardrobe, { conditions, limit: 5, mustInclude: ['coat-a'] });
    expect(results).toHaveLength(5);
    expect(new Set(results.map(baseKey)).size).toBe(5);
  });
});
