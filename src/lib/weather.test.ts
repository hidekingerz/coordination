import { describe, expect, it } from 'vitest';
import { buildForecastUrl, fetchTokyoForecast, getTokyoForecast, isForecastAvailable, parseForecast, toDateKey } from './weather';

const today = new Date('2026-10-03T12:00:00');

describe('toDateKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(toDateKey(new Date('2026-01-05T09:00:00'))).toBe('2026-01-05');
  });
});

describe('isForecastAvailable', () => {
  it('covers today through 15 days ahead', () => {
    expect(isForecastAvailable(today, today)).toBe(true);
    expect(isForecastAvailable(new Date('2026-10-18T12:00:00'), today)).toBe(true);
    expect(isForecastAvailable(new Date('2026-10-19T12:00:00'), today)).toBe(false);
  });

  it('covers up to 92 days in the past', () => {
    expect(isForecastAvailable(new Date('2026-07-03T12:00:00'), today)).toBe(true);
    expect(isForecastAvailable(new Date('2026-07-02T12:00:00'), today)).toBe(false);
  });
});

describe('buildForecastUrl', () => {
  it('requests daily max/min for Tokyo on the given date', () => {
    const url = new URL(buildForecastUrl(today));
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('35.6762');
    expect(url.searchParams.get('longitude')).toBe('139.6503');
    expect(url.searchParams.get('daily')).toBe('temperature_2m_max,temperature_2m_min');
    expect(url.searchParams.get('timezone')).toBe('Asia/Tokyo');
    expect(url.searchParams.get('start_date')).toBe('2026-10-03');
    expect(url.searchParams.get('end_date')).toBe('2026-10-03');
  });
});

describe('parseForecast', () => {
  const body = {
    daily: { time: ['2026-10-03'], temperature_2m_max: [24.1], temperature_2m_min: [17.3] },
  };

  it('extracts max and min for the requested date', () => {
    expect(parseForecast(body, '2026-10-03')).toEqual({ max: 24.1, min: 17.3 });
  });

  it('returns null when the date is missing or values are not numbers', () => {
    expect(parseForecast(body, '2026-10-04')).toBeNull();
    expect(parseForecast({ daily: { time: ['2026-10-03'], temperature_2m_max: [null], temperature_2m_min: [1] } }, '2026-10-03')).toBeNull();
    expect(parseForecast({}, '2026-10-03')).toBeNull();
    expect(parseForecast(null, '2026-10-03')).toBeNull();
  });
});

describe('fetchTokyoForecast', () => {
  it('fetches the forecast URL and returns the parsed temperatures', async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({ daily: { time: ['2026-10-03'], temperature_2m_max: [24.1], temperature_2m_min: [17.3] } }),
        { status: 200 },
      );
    };
    const result = await fetchTokyoForecast(today, fakeFetch);
    expect(result).toEqual({ max: 24.1, min: 17.3 });
    expect(calls).toEqual([buildForecastUrl(today)]);
  });

  it('throws on a non-OK response', async () => {
    const fakeFetch = async () => new Response('nope', { status: 500 });
    await expect(fetchTokyoForecast(today, fakeFetch)).rejects.toThrow();
  });

  it('throws when the body has no usable data', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ daily: { time: [] } }), { status: 200 });
    await expect(fetchTokyoForecast(today, fakeFetch)).rejects.toThrow();
  });
});

describe('getTokyoForecast (cached)', () => {
  // 要求された日付をそのまま返す偽 API
  const makeFetch = (calls: string[]) => async (input: string) => {
    calls.push(input);
    const day = new URL(input).searchParams.get('start_date');
    const body = JSON.stringify({ daily: { time: [day], temperature_2m_max: [24.1], temperature_2m_min: [17.3] } });
    return new Response(body, { status: 200 });
  };
  const memoryStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const t0 = new Date('2026-10-03T08:00:00').getTime();

  it('fetches once and serves the second call from the cache', async () => {
    const calls: string[] = [];
    const storage = memoryStorage();
    const a = await getTokyoForecast(today, { fetchImpl: makeFetch(calls), storage, now: () => t0 });
    const b = await getTokyoForecast(today, { fetchImpl: makeFetch(calls), storage, now: () => t0 + 60_000 });
    expect(a).toEqual({ max: 24.1, min: 17.3 });
    expect(b).toEqual(a);
    expect(calls).toHaveLength(1);
  });

  it('caches per date', async () => {
    const calls: string[] = [];
    const storage = memoryStorage();
    await getTokyoForecast(today, { fetchImpl: makeFetch(calls), storage, now: () => t0 });
    await getTokyoForecast(new Date('2026-10-04T12:00:00'), { fetchImpl: makeFetch(calls), storage, now: () => t0 });
    expect(calls).toHaveLength(2);
  });

  it('refetches once the cached entry is older than 6 hours', async () => {
    const calls: string[] = [];
    const storage = memoryStorage();
    await getTokyoForecast(today, { fetchImpl: makeFetch(calls), storage, now: () => t0 });
    await getTokyoForecast(today, { fetchImpl: makeFetch(calls), storage, now: () => t0 + 6 * 3_600_000 + 1 });
    expect(calls).toHaveLength(2);
  });

  it('falls back to fetching when the storage is unusable', async () => {
    const calls: string[] = [];
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const res = await getTokyoForecast(today, { fetchImpl: makeFetch(calls), storage: broken, now: () => t0 });
    expect(res).toEqual({ max: 24.1, min: 17.3 });
    expect(calls).toHaveLength(1);
  });

  it('ignores corrupted cache contents', async () => {
    const calls: string[] = [];
    const storage = memoryStorage();
    storage.setItem('coordination.weather.v1', '{not json');
    const res = await getTokyoForecast(today, { fetchImpl: makeFetch(calls), storage, now: () => t0 });
    expect(res).toEqual({ max: 24.1, min: 17.3 });
    expect(calls).toHaveLength(1);
  });
});
