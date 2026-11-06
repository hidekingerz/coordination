import { describe, expect, it } from 'vitest';
import type { ClothingItem } from '../types';
import {
  buildWearStats,
  compareUnworn,
  describeLastWorn,
  freshnessScore,
  mergeWearLogs,
  outfitWornWithin,
  pruneWearLog,
  recordWear,
  removeWear,
} from './wear';

describe('recordWear / removeWear', () => {
  it('records each item once per day and can undo', () => {
    let log = recordWear([], ['a', 'b'], '2026-10-03', 'a+b');
    log = recordWear(log, ['a'], '2026-10-03');
    expect(log).toHaveLength(2);
    expect(log.find((e) => e.itemId === 'b')?.outfitId).toBe('a+b');
    log = removeWear(log, ['a', 'b'], '2026-10-03');
    expect(log).toEqual([]);
  });
  it('merges without duplicates and prunes deleted items', () => {
    const a = recordWear([], ['a'], '2026-10-01');
    const b = recordWear([], ['a', 'z'], '2026-10-01');
    const merged = mergeWearLogs(a, b);
    expect(merged).toHaveLength(2);
    expect(pruneWearLog(merged, new Set(['a']))).toHaveLength(1);
  });
});

describe('buildWearStats / freshness', () => {
  const log = [
    { itemId: 'today', date: '2026-10-03' },
    { itemId: 'week', date: '2026-09-26' },
    { itemId: 'week', date: '2026-09-01' },
    { itemId: 'old', date: '2026-06-01' },
    { itemId: 'future', date: '2026-12-01' },
  ];
  const stats = buildWearStats(log, '2026-10-03');
  it('computes last worn, count and days since, ignoring future entries', () => {
    expect(stats.get('today')).toEqual({ lastWorn: '2026-10-03', count: 1, daysSince: 0 });
    expect(stats.get('week')).toEqual({ lastWorn: '2026-09-26', count: 2, daysSince: 7 });
    expect(stats.get('old')?.daysSince).toBe(124);
    expect(stats.get('future')).toBeUndefined();
  });
  it('scores freshness from 0 (today) to 1 (two weeks or never)', () => {
    expect(freshnessScore(0)).toBe(0);
    expect(freshnessScore(7)).toBeCloseTo(0.5);
    expect(freshnessScore(14)).toBe(1);
    expect(freshnessScore(400)).toBe(1);
    expect(freshnessScore(null)).toBe(1);
  });
  it('describes last worn in Japanese', () => {
    expect(describeLastWorn({ lastWorn: null, count: 0, daysSince: null })).toBe('未着用');
    expect(describeLastWorn({ lastWorn: 'x', count: 1, daysSince: 0 })).toBe('今日着た');
    expect(describeLastWorn({ lastWorn: 'x', count: 1, daysSince: 1 })).toBe('昨日着た');
    expect(describeLastWorn({ lastWorn: 'x', count: 1, daysSince: 12 })).toBe('12日前');
    expect(describeLastWorn({ lastWorn: 'x', count: 1, daysSince: 70 })).toBe('2か月前');
  });
  it('detects an outfit worn within the window', () => {
    const l = recordWear([], ['a', 'b'], '2026-10-01', 'a+b');
    expect(outfitWornWithin(l, 'a+b', '2026-10-03', 7)).toBe(true);
    expect(outfitWornWithin(l, 'a+b', '2026-10-20', 7)).toBe(false);
    expect(outfitWornWithin(l, 'a+c', '2026-10-03', 7)).toBe(false);
  });
});

describe('compareUnworn', () => {
  const mk = (id: string): ClothingItem => ({ id, name: id, category: 'tops', color: '#000', seasons: ['winter'], warmth: 3, formality: 'casual', tags: [], createdAt: '' });
  const items = [mk('worn-1d'), mk('never-a'), mk('worn-14d'), mk('never-b')];
  const stats = buildWearStats(
    [{ itemId: 'worn-1d', date: '2026-01-14' }, { itemId: 'worn-14d', date: '2026-01-01' }],
    '2026-01-15',
  );

  it('puts never-worn items first, then the longest-unworn, keeping array order on ties', () => {
    const sorted = [...items].sort(compareUnworn(stats));
    expect(sorted.map((i) => i.id)).toEqual(['never-a', 'never-b', 'worn-14d', 'worn-1d']);
  });

  it('returns 0 for two never-worn items so callers can add their own tie-break', () => {
    expect(compareUnworn(stats)(mk('p'), mk('q'))).toBe(0);
  });
});
