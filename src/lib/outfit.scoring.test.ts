import { describe, expect, it } from 'vitest';
import { FORMALITY_LABEL, SEASON_LABEL, type ClothingItem } from '../types';
import type { Conditions } from './season';
import { fitsConditions, outfitWarmth, scoreOutfit, suggestOutfits } from './outfit';
import type { WearStatsMap } from './wear';

/**
 * 採点の式・閾値・候補の絞り込みを固定するテスト (#72)。
 * ミューテーションテストで「式を壊しても落ちない」と分かった箇所を、期待値を数値で書いて塞ぐ。
 */

const mk = (id: string, category: ClothingItem['category'], over: Partial<ClothingItem> = {}): ClothingItem => ({
  id,
  name: id,
  category,
  color: '#808080',
  seasons: ['autumn'],
  warmth: 3,
  formality: 'casual',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const cond = (over: Partial<Conditions> = {}): Conditions => ({
  date: new Date('2026-10-15T12:00:00'),
  season: 'autumn',
  acceptableSeasons: ['autumn'],
  targetWarmth: 3,
  ...over,
});

const worn = (entries: Record<string, number>): WearStatsMap =>
  new Map(Object.entries(entries).map(([id, daysSince]) => [id, { lastWorn: '2026-10-01', count: 1, daysSince }]));

const top = mk('top', 'tops');
const bottom = mk('bottom', 'bottoms');
const shoes = mk('shoes', 'shoes');
const ids = (items: ClothingItem[]) => items.map((i) => i.id);

describe('scoreOutfit: total score', () => {
  // 4 要素がすべて 1 未満で互いに違う値になるコーデ
  const items = [
    mk('t', 'tops', { color: '#d62828', warmth: 4 }),
    mk('b', 'bottoms', { color: '#2a9d8f', warmth: 4, formality: 'smart', seasons: ['winter'] }),
  ];
  const conditions = cond({ acceptableSeasons: ['autumn', 'winter'] });

  it('weights colour 0.45, warmth 0.3, formality 0.15 and season 0.1', () => {
    const o = scoreOutfit(items, { conditions });
    const b = o.breakdown;
    expect(new Set([b.color, b.warmth, b.formality, b.season]).size).toBe(4);
    expect(b.warmth).toBeCloseTo(2 / 3, 10);
    expect(b.formality).toBe(0.65);
    expect(b.season).toBeCloseTo(0.7, 10);
    expect(o.score).toBeCloseTo(b.color * 0.45 + b.warmth * 0.3 + b.formality * 0.15 + b.season * 0.1, 10);
    expect(b.freshness).toBe(1);
  });

  it('blends freshness by its weight', () => {
    const base = scoreOutfit(items, { conditions }).score;
    const wearStats = worn({ t: 7 });
    const o = scoreOutfit(items, { conditions, wearStats, freshnessWeight: 0.3 });
    expect(o.breakdown.freshness).toBe(0.75);
    expect(o.score).toBeCloseTo(base * 0.7 + 0.75 * 0.3, 10);
  });

  it('uses weight 0.1 with history and 0 without, and clamps the weight to 0..1', () => {
    const base = scoreOutfit(items, { conditions }).score;
    const wearStats = worn({ t: 7 });
    expect(scoreOutfit(items, { conditions, wearStats }).score).toBeCloseTo(base * 0.9 + 0.75 * 0.1, 10);
    expect(scoreOutfit(items, { conditions, wearStats, freshnessWeight: 2 }).score).toBeCloseTo(0.75, 10);
    expect(scoreOutfit(items, { conditions, wearStats, freshnessWeight: -1 }).score).toBeCloseTo(base, 10);
  });

  it('counts shoes and accessories at half weight in freshness', () => {
    const all = [top, bottom, shoes, mk('acc', 'accessory')];
    // top 0.5 (7日前) ×1, bottom 1 (未着用) ×1, shoes 0 (今日) ×0.5, acc 1 ×0.5 → 2 / 3
    const o = scoreOutfit(all, { conditions: cond(), wearStats: worn({ top: 7, shoes: 0 }), freshnessWeight: 0.3 });
    expect(o.breakdown.freshness).toBeCloseTo(2 / 3, 10);
  });

  it('halves freshness when the same combination was worn recently', () => {
    const wearStats = worn({ top: 7 });
    const o = scoreOutfit([top, bottom], { conditions: cond(), wearStats, freshnessWeight: 0.3, recentOutfitIds: new Set(['bottom+top']) });
    expect(o.breakdown.freshness).toBe(0.375);
    expect(o.warnings).toContain('この組み合わせは最近着ています');
    const other = scoreOutfit([top, bottom], { conditions: cond(), wearStats, freshnessWeight: 0.3, recentOutfitIds: new Set(['x+y']) });
    expect(other.breakdown.freshness).toBe(0.75);
    expect(other.warnings).not.toContain('この組み合わせは最近着ています');
  });

  it('builds the outfit id from sorted item ids', () => {
    expect(scoreOutfit([top, shoes, bottom], { conditions: cond() }).id).toBe('bottom+shoes+top');
  });
});

describe('scoreOutfit: season', () => {
  const conditions = cond({ acceptableSeasons: ['autumn', 'winter'] });
  const inSeason = mk('in', 'tops');
  const neighbour = mk('near', 'bottoms', { seasons: ['winter'] });
  const off = mk('off', 'shoes', { seasons: ['summer'] });

  it('averages the fit and the worst fit half and half', () => {
    expect(scoreOutfit([inSeason, neighbour], { conditions }).breakdown.season).toBeCloseTo(0.8 * 0.5 + 0.6 * 0.5, 10);
    expect(scoreOutfit([inSeason, neighbour, off], { conditions }).breakdown.season).toBeCloseTo((1.6 / 3) * 0.5, 10);
  });

  it('names only the out-of-season items in the warning', () => {
    expect(scoreOutfit([inSeason, neighbour, off], { conditions }).warnings).toContain('季節外れ: off');
    expect(scoreOutfit([inSeason, neighbour], { conditions }).warnings.some((w) => w.startsWith('季節外れ'))).toBe(false);
  });

  it('accepts an item when any of its seasons is acceptable', () => {
    const c = cond({ season: 'winter', acceptableSeasons: ['winter', 'autumn'] });
    expect(fitsConditions(mk('x', 'tops', { seasons: ['summer', 'autumn'] }), c)).toBe(true);
  });
});

describe('scoreOutfit: warmth', () => {
  const pair = (t: ClothingItem['warmth'], b: ClothingItem['warmth']) => [mk('t', 'tops', { warmth: t }), mk('b', 'bottoms', { warmth: b })];
  const warmthOf = (items: ClothingItem[], c = cond()) => scoreOutfit(items, { conditions: c });

  it('drops by a third per step away from the target', () => {
    expect(warmthOf(pair(3, 3)).breakdown.warmth).toBe(1);
    expect(warmthOf(pair(4, 4)).breakdown.warmth).toBeCloseTo(2 / 3, 10);
    expect(warmthOf(pair(2, 2)).breakdown.warmth).toBeCloseTo(2 / 3, 10);
    expect(warmthOf(pair(5, 4)).breakdown.warmth).toBeCloseTo(0.5, 10);
  });

  it('warns "too warm" from a gap of exactly 1.5, not below', () => {
    expect(warmthOf(pair(5, 4)).warnings).toEqual(['暑く感じるかもしれません']);
    expect(warmthOf(pair(4, 4)).warnings).toEqual([]);
    expect(warmthOf(pair(3, 3)).warnings).toEqual([]);
  });

  it('warns "too cold" from a gap of exactly 1.5, not below', () => {
    expect(warmthOf(pair(1, 2)).warnings).toEqual(['寒く感じるかもしれません']);
    expect(warmthOf(pair(2, 2)).warnings).toEqual([]);
  });

  it('scales the score by 0.6 and warns when there is no outer at target 4 or more', () => {
    const o = warmthOf(pair(4, 4), cond({ targetWarmth: 4 }));
    expect(o.breakdown.warmth).toBeCloseTo(0.6, 10);
    expect(o.warnings).toEqual(['アウターがないと寒そうです']);
  });

  it('does not apply the no-outer rule with an outer, or below target 4', () => {
    const withOuter = warmthOf([mk('o', 'outer', { warmth: 4 }), ...pair(4, 4)], cond({ targetWarmth: 4 }));
    // max(4, 4*0.7 + 4*0.3) + 0.5 = 4.5 → 1 - 0.5/3
    expect(withOuter.breakdown.warmth).toBeCloseTo(1 - 0.5 / 3, 10);
    expect(withOuter.warnings).toEqual([]);
    expect(warmthOf(pair(3, 3), cond({ targetWarmth: 3 })).warnings).toEqual([]);
  });

  it('says "just right" from a warmth score of exactly 0.8, with the temperature when known', () => {
    // 朝晩が冷える日のアウターなし: 1 × 0.8
    const chilly = warmthOf(pair(3, 3), cond({ temperature: 20, minTemperature: 10 }));
    expect(chilly.breakdown.warmth).toBe(0.8);
    expect(chilly.reasons).toContain('気温20℃にちょうどよい厚さ');
    expect(warmthOf(pair(3, 3)).reasons).toContain(`${SEASON_LABEL.autumn}の気候にちょうどよい厚さ`);
    expect(warmthOf(pair(4, 4)).reasons.some((r) => r.includes('ちょうどよい厚さ'))).toBe(false);
  });
});

describe('outfitWarmth: edge cases', () => {
  it('treats the thickest outer as the shell when none is a coat', () => {
    const jacket = mk('jacket', 'outer', { warmth: 3, outerLayer: 'mid' });
    const cardigan = mk('cardigan', 'outer', { warmth: 2, outerLayer: 'mid' });
    const body = [mk('t', 'tops', { warmth: 2 }), mk('b', 'bottoms', { warmth: 2 })];
    // shell = jacket(3), 体の層 = [2, 2, cardigan 2] → max(2, 2.1 + 0.6) + 0.5 × 2
    expect(outfitWarmth([cardigan, jacket, ...body])).toBeCloseTo(3.7, 10);
    expect(outfitWarmth([jacket, cardigan, ...body])).toBeCloseTo(3.7, 10);
  });

  it('falls back to the shell alone, or to 3 with nothing to judge', () => {
    expect(outfitWarmth([mk('coat', 'outer', { warmth: 5 })])).toBe(5);
    expect(outfitWarmth([shoes])).toBe(3);
    expect(outfitWarmth([mk('s', 'shoes', { warmth: 1 })])).toBe(3);
  });
});

describe('scoreOutfit: formality', () => {
  const f = (formalities: ClothingItem['formality'][], preferred?: ClothingItem['formality'], extra: ClothingItem[] = []) =>
    scoreOutfit([...formalities.map((x, i) => mk(`i${i}`, i ? 'bottoms' : 'tops', { formality: x })), ...extra], { conditions: cond(), formality: preferred });

  it('scores 1 / 0.65 / 0.2 by how far the tastes are apart', () => {
    expect(f(['casual', 'casual']).breakdown.formality).toBe(1);
    expect(f(['casual', 'smart']).breakdown.formality).toBe(0.65);
    expect(f(['smart', 'formal']).breakdown.formality).toBe(0.65);
    expect(f(['casual', 'formal']).breakdown.formality).toBe(0.2);
  });

  it('ignores accessories', () => {
    const acc = mk('acc', 'accessory', { formality: 'formal' });
    expect(f(['casual', 'casual'], undefined, [acc]).breakdown.formality).toBe(1);
    expect(scoreOutfit([acc], { conditions: cond() }).breakdown.formality).toBe(1);
  });

  it('scales by the distance from the requested taste', () => {
    expect(f(['casual', 'casual'], 'casual').breakdown.formality).toBe(1);
    expect(f(['casual', 'casual'], 'smart').breakdown.formality).toBe(0.5);
    expect(f(['casual', 'casual'], 'formal').breakdown.formality).toBe(0);
    expect(f(['casual', 'smart'], 'smart').breakdown.formality).toBeCloseTo(0.65 * 0.75, 10);
  });

  it('explains a unified taste by the majority, not counting accessories', () => {
    const accs = ['a1', 'a2', 'a3'].map((id) => mk(id, 'accessory', { formality: 'casual' }));
    const o = f(['formal', 'formal'], undefined, accs);
    expect(o.reasons).toContain(`${FORMALITY_LABEL.formal}でテイストが統一`);
    expect(o.warnings).not.toContain('テイストがばらついています');
  });

  it('warns about a scattered taste only when the score is low', () => {
    const scattered = f(['casual', 'formal']);
    expect(scattered.warnings).toContain('テイストがばらついています');
    expect(scattered.reasons.some((r) => r.includes('テイストが統一'))).toBe(false);
    const mixed = f(['casual', 'smart']);
    expect(mixed.warnings).not.toContain('テイストがばらついています');
    expect(mixed.reasons.some((r) => r.includes('テイストが統一'))).toBe(false);
  });
});

describe('scoreOutfit: wear history in reasons and warnings', () => {
  const items = [top, bottom, shoes];
  const run = (stats: Record<string, number>, over = {}) =>
    scoreOutfit(items, { conditions: cond(), wearStats: worn(stats), freshnessWeight: 0.3, ...over });

  it('warns about items worn within two days, not three', () => {
    expect(run({ top: 2 }).warnings.some((w) => w.startsWith('最近着た: top'))).toBe(true);
    expect(run({ top: 3 }).warnings.some((w) => w.startsWith('最近着た'))).toBe(false);
  });

  it('mentions items unworn for two weeks, not thirteen days', () => {
    expect(run({ top: 14, bottom: 5 }).reasons.some((r) => r.startsWith('しばらく着ていない: top'))).toBe(true);
    expect(run({ top: 13, bottom: 5 }).reasons.some((r) => r.startsWith('しばらく着ていない'))).toBe(false);
  });

  it('mentions never-worn items only when asked to', () => {
    expect(run({ top: 5 }).reasons.some((r) => r.startsWith('しばらく着ていない'))).toBe(false);
    expect(run({ top: 5 }, { mentionNeverWorn: true }).reasons.some((r) => r.startsWith('しばらく着ていない: bottom'))).toBe(true);
  });

  it('leaves shoes and accessories out of both', () => {
    const o = run({ top: 5, bottom: 5, shoes: 0 });
    expect(o.warnings.some((w) => w.startsWith('最近着た'))).toBe(false);
    const o2 = run({ top: 5, bottom: 5, shoes: 20 });
    expect(o2.reasons.some((r) => r.startsWith('しばらく着ていない'))).toBe(false);
  });

  it('says nothing about history when the freshness weight is 0', () => {
    const o = run({ top: 0, bottom: 20 }, { freshnessWeight: 0, recentOutfitIds: new Set(['bottom+shoes+top']) });
    expect(o.warnings).toEqual([]);
    expect(o.reasons.some((r) => r.startsWith('しばらく着ていない'))).toBe(false);
  });
});

describe('suggestOutfits: narrowing candidates per category', () => {
  // トップス 9 点から 8 点に絞るとき、どちらが落ちるかで式を確かめる
  const pickedTops = (tops: ClothingItem[], over: Partial<Parameters<typeof suggestOutfits>[1]> = {}, c = cond({ acceptableSeasons: ['autumn', 'winter'] })) => {
    const res = suggestOutfits([...tops, bottom, shoes], { conditions: c, limit: 50, ...over });
    return new Set(res.flatMap((o) => o.items.filter((i) => i.category === 'tops').map((i) => i.id)));
  };
  const fillers = (n: number, over: Partial<ClothingItem> = {}) => Array.from({ length: n }, (_, i) => mk(`f${i}`, 'tops', over));

  it('prefers an in-season item two steps off in warmth (0.8) to a neighbouring-season exact match (0.76)', () => {
    const near = mk('near', 'tops', { seasons: ['winter'] });
    const thick = mk('thick', 'tops', { warmth: 5 });
    const got = pickedTops([near, ...fillers(7), thick]);
    expect(got.has('thick')).toBe(true);
    expect(got.has('near')).toBe(false);
    expect(got.size).toBe(8);
  });

  it('prefers a neighbouring-season exact match (0.76) to an in-season item four steps off (0.6)', () => {
    const c = cond({ acceptableSeasons: ['autumn', 'winter'], targetWarmth: 5 });
    const thin = mk('thin', 'tops', { warmth: 1 });
    const near = mk('near', 'tops', { seasons: ['winter'], warmth: 5 });
    const got = pickedTops([thin, ...fillers(7, { warmth: 5 }), near], {}, c);
    expect(got.has('near')).toBe(true);
    expect(got.has('thin')).toBe(false);
  });

  it('blends freshness into the ranking: a fresh 0.8 fit (0.86) beats an exact fit worn a week ago (0.85)', () => {
    const wornFit = mk('wornFit', 'tops');
    const freshOff = mk('freshOff', 'tops', { warmth: 5 });
    const got = pickedTops([wornFit, ...fillers(7), freshOff], { wearStats: worn({ wornFit: 7 }), freshnessWeight: 0.3 });
    expect(got.has('freshOff')).toBe(true);
    expect(got.has('wornFit')).toBe(false);
  });

  it('keeps fit dominant: an exact fit worn today (0.7) beats a 0.8 fit worn three days ago (0.62)', () => {
    const off3 = mk('off3', 'tops', { warmth: 5 });
    const fitToday = mk('fitToday', 'tops');
    const got = pickedTops([off3, ...fillers(7), fitToday], { wearStats: worn({ off3: 3, fitToday: 0 }), freshnessWeight: 0.3 });
    expect(got.has('fitToday')).toBe(true);
    expect(got.has('off3')).toBe(false);
  });

  it('drops items that fit neither season nor warmth, unless nothing else is left', () => {
    const c = cond({ targetWarmth: 5 });
    const hopeless = mk('hopeless', 'tops', { seasons: ['summer'], warmth: 1 });
    expect(pickedTops([hopeless, mk('ok', 'tops', { warmth: 5 })], {}, c)).toEqual(new Set(['ok']));
    expect(pickedTops([hopeless], {}, c)).toEqual(new Set(['hopeless']));
  });

  it('tries at most four accessories', () => {
    const accs = Array.from({ length: 6 }, (_, i) => mk(`acc${i}`, 'accessory'));
    const res = suggestOutfits([top, bottom, shoes, ...accs], { conditions: cond(), limit: 50 });
    const used = new Set(res.flatMap((o) => ids(o.items)).filter((id) => id.startsWith('acc')));
    expect(used).toEqual(new Set(['acc0', 'acc1', 'acc2', 'acc3']));
    expect(res.length).toBe(5);
  });
});

describe('suggestOutfits: building combinations', () => {
  const jacket = mk('jacket', 'outer', { warmth: 4, outerLayer: 'mid' });
  const coat = mk('coat', 'outer', { warmth: 4, outerLayer: 'shell' });
  const outersOf = (o: { items: ClothingItem[] }) => o.items.filter((i) => i.category === 'outer').length;

  it('offers no outer-less outfit at target 4 when an outer exists', () => {
    const res = suggestOutfits([top, bottom, shoes, jacket], { conditions: cond({ targetWarmth: 4 }), limit: 5 });
    expect(res.map(outersOf)).toEqual([1]);
  });

  it('offers both with and without an outer below target 4', () => {
    const res = suggestOutfits([top, bottom, shoes, jacket], { conditions: cond({ targetWarmth: 3 }), limit: 5 });
    expect(res.map(outersOf).sort()).toEqual([0, 1]);
  });

  it('pairs a jacket under a coat from target 4', () => {
    const res = suggestOutfits([top, bottom, shoes, jacket, coat], { conditions: cond({ targetWarmth: 4 }), limit: 5 });
    expect(res.map(outersOf).sort()).toEqual([1, 1, 2]);
  });

  it('does not pair them on a mild day when only one of the two is requested', () => {
    const res = suggestOutfits([top, bottom, shoes, jacket, coat], { conditions: cond(), limit: 5, mustInclude: ['jacket'] });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((o) => outersOf(o) === 1)).toBe(true);
  });

  it('still suggests outfits without shoes in the closet', () => {
    const res = suggestOutfits([top, bottom], { conditions: cond(), limit: 5 });
    expect(res.map((o) => ids(o.items))).toEqual([['top', 'bottom']]);
  });

  it('mentions never-worn items once half the closet has history', () => {
    const wardrobe = [top, bottom, shoes, mk('acc', 'accessory')];
    const mentions = (stats: Record<string, number>) =>
      suggestOutfits(wardrobe, { conditions: cond(), wearStats: worn(stats), freshnessWeight: 0.3, limit: 1 })[0].reasons.some((r) =>
        r.startsWith('しばらく着ていない: bottom'),
      );
    expect(mentions({ top: 5, shoes: 5 })).toBe(true);
    expect(mentions({ top: 5 })).toBe(false);
  });
});

describe('suggestOutfits: variety', () => {
  const tops = ['t1', 't2', 't3'].map((id) => mk(id, 'tops'));
  const bottoms = ['b1', 'b2', 'b3'].map((id) => mk(id, 'bottoms'));
  const shoeSet = ['s1', 's2', 's3'].map((id) => mk(id, 'shoes'));
  const baseOf = (o: { items: ClothingItem[] }) => ids(o.items.filter((i) => i.category === 'tops' || i.category === 'bottoms')).join('+');

  it('does not repeat a top+bottom pair while other pairs are available', () => {
    const res = suggestOutfits([...tops, ...bottoms, ...shoeSet], { conditions: cond(), limit: 5 });
    expect(res.length).toBe(5);
    expect(new Set(res.map(baseOf)).size).toBe(5);
  });

  it('avoids outfits that differ from a chosen one by a single item while it can', () => {
    const res = suggestOutfits([...tops, ...bottoms, ...shoeSet], { conditions: cond(), limit: 3 });
    for (let i = 0; i < res.length; i++) {
      for (let j = i + 1; j < res.length; j++) {
        const shared = res[i].items.filter((x) => res[j].items.some((y) => y.id === x.id)).length;
        expect(shared).toBeLessThan(2);
      }
    }
  });

  it('falls back to outfits that differ only in shoes when nothing else is left', () => {
    const res = suggestOutfits([top, bottom, ...shoeSet], { conditions: cond(), limit: 3 });
    expect(res.length).toBe(3);
    expect(new Set(res.map((o) => o.id)).size).toBe(3);
  });

  it('does not force outers into the list on a warm day', () => {
    const coat = mk('coat', 'outer', { warmth: 5 });
    const warm = cond({ targetWarmth: 2 });
    const thin = (i: ClothingItem) => ({ ...i, warmth: 2 as const });
    const res = suggestOutfits([...tops.map(thin), ...bottoms.map(thin), ...shoeSet, coat], { conditions: warm, limit: 3 });
    expect(res.length).toBe(3);
    expect(res.every((o) => o.items.every((i) => i.category !== 'outer'))).toBe(true);
  });

  it('keeps two outfits with an outer on a cool day, sorted by score', () => {
    const coat = mk('coat', 'outer', { warmth: 5 });
    const coat2 = mk('coat2', 'outer', { warmth: 5 });
    const res = suggestOutfits([...tops, ...bottoms, ...shoeSet, coat, coat2], { conditions: cond(), limit: 3 });
    expect(res.filter((o) => o.items.some((i) => i.category === 'outer')).length).toBe(2);
    for (let i = 1; i < res.length; i++) expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
  });
});

describe('scoreOutfit: remaining boundaries', () => {
  const chill = (temperature: number, minTemperature: number) =>
    scoreOutfit([top, bottom], { conditions: cond({ temperature, minTemperature }) }).warnings.some((w) => w.startsWith('朝晩は冷えそうです'));

  it('warns about chilly mornings from a range of exactly 10℃ or a minimum of exactly 10℃', () => {
    expect(chill(25, 15)).toBe(true);
    expect(chill(15, 10)).toBe(true);
    expect(chill(20, 10.5)).toBe(false);
  });

  it('counts the sub colour in the palette', () => {
    const plain = scoreOutfit([top, bottom], { conditions: cond() });
    const striped = scoreOutfit([mk('top', 'tops', { subColor: '#d62828' }), mk('bottom', 'bottoms', { subColor: '#2a9d8f' })], { conditions: cond() });
    expect(striped.breakdown.color).toBeLessThan(plain.breakdown.color);
  });

  it('names at most two long-unworn items, accessories excluded', () => {
    const items = [mk('jacket', 'outer'), top, bottom, mk('acc', 'accessory')];
    const o = scoreOutfit(items, { conditions: cond(), wearStats: worn({ jacket: 20, top: 20, bottom: 20, acc: 20 }), freshnessWeight: 0.3 });
    const reason = o.reasons.find((r) => r.startsWith('しばらく着ていない'))!;
    expect(reason).toContain('jacket');
    expect(reason).toContain('top');
    expect(reason).not.toContain('bottom');
    expect(reason).not.toContain('acc');
    const accOnly = scoreOutfit([top, bottom, mk('acc', 'accessory')], { conditions: cond(), wearStats: worn({ top: 5, bottom: 5, acc: 20 }), freshnessWeight: 0.3 });
    expect(accOnly.reasons.some((r) => r.startsWith('しばらく着ていない'))).toBe(false);
  });
});

describe('suggestOutfits: remaining paths', () => {
  it('suggests a onepiece on its own', () => {
    const res = suggestOutfits([mk('dress', 'onepiece'), shoes], { conditions: cond(), limit: 5 });
    expect(res.map((o) => ids(o.items))).toEqual([['dress', 'shoes']]);
  });

  it('keeps a requested item even when it fits neither season nor warmth', () => {
    const hopeless = mk('hopeless', 'tops', { seasons: ['summer'], warmth: 1 });
    const res = suggestOutfits([hopeless, mk('ok', 'tops', { warmth: 5 }), bottom, shoes], {
      conditions: cond({ targetWarmth: 5 }),
      mustInclude: ['hopeless'],
      limit: 5,
    });
    expect(res.length).toBe(1);
    expect(ids(res[0].items)).toContain('hopeless');
  });

  it('caps the fallback at eight items per category', () => {
    const hopeless = Array.from({ length: 9 }, (_, i) => mk(`h${i}`, 'tops', { seasons: ['summer'], warmth: 1 }));
    const res = suggestOutfits([...hopeless, bottom, shoes], { conditions: cond({ targetWarmth: 5 }), limit: 50 });
    const used = new Set(res.flatMap((o) => ids(o.items)).filter((id) => id.startsWith('h')));
    expect(used.size).toBe(8);
    expect(used.has('h8')).toBe(false);
  });

  it('does not repeat a top+bottom pair even when the outer and shoes both differ', () => {
    const many = (prefix: string, category: ClothingItem['category'], over: Partial<ClothingItem> = {}) =>
      [1, 2, 3].map((n) => mk(`${prefix}${n}`, category, over));
    const wardrobe = [
      ...many('o', 'outer', { warmth: 4, outerLayer: 'mid' }),
      ...many('t', 'tops', { warmth: 4 }),
      ...many('b', 'bottoms', { warmth: 4 }),
      ...many('s', 'shoes'),
    ];
    const res = suggestOutfits(wardrobe, { conditions: cond({ targetWarmth: 4 }), limit: 5 });
    const bases = res.map((o) => ids(o.items.filter((i) => i.category === 'tops' || i.category === 'bottoms')).join('+'));
    expect(res.length).toBe(5);
    expect(new Set(bases).size).toBe(5);
  });
});
