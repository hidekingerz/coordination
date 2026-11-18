import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildWearStats,
  describeLastWorn,
  freshnessScore,
  isEntry,
  loadWearLog,
  outfitWornWithin,
  recordWear,
  removeWear,
  saveWearLog,
  toDateKey,
  type WearLog,
} from './wear';

/** 着用履歴の検証と境界値を固定するテスト (#73) */

const KEY = 'coordination.wearlog.v1';

function stubStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
  return m;
}

afterEach(() => vi.unstubAllGlobals());

describe('isEntry', () => {
  it('accepts an item id with a YYYY-MM-DD date, with or without an outfit id', () => {
    expect(isEntry({ itemId: 'a', date: '2026-10-01' })).toBe(true);
    expect(isEntry({ itemId: 'a', date: '2026-10-01', outfitId: 'a+b' })).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'a|2026-10-01'],
    ['a number', 20261001],
    ['no item id', { date: '2026-10-01' }],
    ['a numeric item id', { itemId: 1, date: '2026-10-01' }],
    ['no date', { itemId: 'a' }],
    ['a numeric date', { itemId: 'a', date: 20261001 }],
    ['a slashed date', { itemId: 'a', date: '2026/10/01' }],
    ['a date with a time', { itemId: 'a', date: '2026-10-01T00:00' }],
    ['a date with a prefix', { itemId: 'a', date: 'x2026-10-01' }],
    ['a short date', { itemId: 'a', date: '2026-1-1' }],
  ])('rejects %s', (_label, value) => {
    expect(isEntry(value)).toBe(false);
  });
});

describe('loadWearLog / saveWearLog', () => {
  const log: WearLog = [{ itemId: 'a', date: '2026-10-01' }];

  it('returns an empty log when nothing is saved, or the data is not an array, or broken', () => {
    stubStorage();
    expect(loadWearLog()).toEqual([]);
    stubStorage({ [KEY]: JSON.stringify({ log }) });
    expect(loadWearLog()).toEqual([]);
    stubStorage({ [KEY]: '[broken' });
    expect(loadWearLog()).toEqual([]);
  });

  it('returns an empty log when the storage itself is unusable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadWearLog()).toEqual([]);
  });

  it('round-trips through the wear log key, dropping broken entries', () => {
    const m = stubStorage();
    saveWearLog(log);
    expect([...m.keys()]).toEqual([KEY]);
    expect(loadWearLog()).toEqual(log);
    m.set(KEY, JSON.stringify([...log, { itemId: 'b' }, null]));
    expect(loadWearLog()).toEqual(log);
  });
});

describe('recording', () => {
  it('formats a local date with zero padding', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('replaces only the same item on the same day', () => {
    const log: WearLog = [
      { itemId: 'a', date: '2026-10-01' },
      { itemId: 'a', date: '2026-10-02' },
      { itemId: 'b', date: '2026-10-02' },
    ];
    expect(recordWear(log, ['a'], '2026-10-02')).toEqual([
      { itemId: 'a', date: '2026-10-01' },
      { itemId: 'b', date: '2026-10-02' },
      { itemId: 'a', date: '2026-10-02' },
    ]);
  });

  it('stores the outfit id only when given', () => {
    expect(recordWear([], ['a'], '2026-10-02')).toEqual([{ itemId: 'a', date: '2026-10-02' }]);
    expect(recordWear([], ['a'], '2026-10-02', 'a+b')).toEqual([{ itemId: 'a', date: '2026-10-02', outfitId: 'a+b' }]);
  });

  it('removes only the given items on the given day', () => {
    const log: WearLog = [
      { itemId: 'a', date: '2026-10-01' },
      { itemId: 'a', date: '2026-10-02' },
      { itemId: 'b', date: '2026-10-02' },
    ];
    expect(removeWear(log, ['a'], '2026-10-02')).toEqual([
      { itemId: 'a', date: '2026-10-01' },
      { itemId: 'b', date: '2026-10-02' },
    ]);
  });
});

describe('stats and labels', () => {
  it('takes the latest date as last worn whatever the order of the log', () => {
    const today = '2026-10-10';
    const newerFirst = buildWearStats([{ itemId: 'a', date: '2026-10-08' }, { itemId: 'a', date: '2026-10-03' }], today);
    const olderFirst = buildWearStats([{ itemId: 'a', date: '2026-10-03' }, { itemId: 'a', date: '2026-10-08' }], today);
    for (const stats of [newerFirst, olderFirst]) {
      expect(stats.get('a')).toEqual({ lastWorn: '2026-10-08', count: 2, daysSince: 2 });
    }
  });

  it('never scores freshness below 0', () => {
    expect(freshnessScore(-3)).toBe(0);
    expect(freshnessScore(7)).toBe(0.5);
  });

  it('switches from days to months at 30 and to years at 365', () => {
    const label = (daysSince: number) => describeLastWorn({ lastWorn: 'x', count: 1, daysSince });
    expect(label(29)).toBe('29日前');
    expect(label(30)).toBe('1か月前');
    expect(label(364)).toBe('12か月前');
    expect(label(365)).toBe('1年以上前');
    expect(label(800)).toBe('2年以上前');
  });

  it('counts an outfit as worn within the window from today back, excluding the window edge and the future', () => {
    const log: WearLog = [{ itemId: 'a', date: '2026-10-05', outfitId: 'a+b' }];
    expect(outfitWornWithin(log, 'a+b', '2026-10-05', 7)).toBe(true);
    expect(outfitWornWithin(log, 'a+b', '2026-10-11', 7)).toBe(true);
    expect(outfitWornWithin(log, 'a+b', '2026-10-12', 7)).toBe(false);
    expect(outfitWornWithin(log, 'a+b', '2026-10-04', 7)).toBe(false);
    expect(outfitWornWithin(log, 'x+y', '2026-10-05', 7)).toBe(false);
  });
});
