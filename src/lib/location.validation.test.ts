import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOCATION, GeolocationFailure, PRESET_LOCATIONS, detectCurrentLocation, loadLocation, saveLocation } from './location';

/** 保存した地点の検証を固定するテスト (#73) */

const KEY = 'coordination.location.v1';
const kyoto = { id: 'current', name: '現在地', latitude: 35.01, longitude: 135.77 };

const memoryStorage = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const loadRaw = (raw: string) => loadLocation(memoryStorage({ [KEY]: raw }));

afterEach(() => vi.unstubAllGlobals());

describe('saved location', () => {
  it('is stored under the location key', () => {
    const s = memoryStorage();
    saveLocation(kyoto, s);
    expect([...s.m.keys()]).toEqual([KEY]);
    expect(loadLocation(s)).toEqual(kyoto);
  });

  it('drops extra fields', () => {
    expect(loadRaw(JSON.stringify({ ...kyoto, accuracy: 20 }))).toEqual(kyoto);
  });

  it.each([
    ['null', 'null'],
    ['a string', '"tokyo"'],
    ['a number', '35'],
    ['a numeric id', JSON.stringify({ ...kyoto, id: 1 })],
    ['no name', JSON.stringify({ ...kyoto, name: undefined })],
    ['a latitude string', JSON.stringify({ ...kyoto, latitude: '35.01' })],
    ['an infinite latitude', '{"id":"current","name":"現在地","latitude":1e999,"longitude":135.77}'],
    ['no longitude', JSON.stringify({ ...kyoto, longitude: undefined })],
    ['an infinite longitude', '{"id":"current","name":"現在地","latitude":35.01,"longitude":-1e999}'],
  ])('falls back to the default for %s', (_label, raw) => {
    expect(loadRaw(raw)).toEqual(DEFAULT_LOCATION);
  });

  it('uses localStorage when no storage is passed, and the default when there is none', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadLocation()).toEqual(DEFAULT_LOCATION);
    const s = memoryStorage();
    vi.stubGlobal('localStorage', s);
    saveLocation(kyoto);
    expect(loadLocation()).toEqual(kyoto);
  });
});

describe('presets', () => {
  it('lists the eight cities from north to south', () => {
    expect(PRESET_LOCATIONS.map((l) => [l.id, l.name])).toEqual([
      ['sapporo', '札幌'],
      ['sendai', '仙台'],
      ['tokyo', '東京'],
      ['nagoya', '名古屋'],
      ['osaka', '大阪'],
      ['hiroshima', '広島'],
      ['fukuoka', '福岡'],
      ['naha', '那覇'],
    ]);
  });
});

describe('GeolocationFailure', () => {
  it('carries a name, an explanation and an empty detail by default', () => {
    const e = new GeolocationFailure('unsupported');
    expect(e.name).toBe('GeolocationFailure');
    expect(e.detail).toBe('');
    expect(e.message).toContain('位置情報を使えません');
  });

  it('accepts a cached position up to ten minutes old', async () => {
    let options: PositionOptions | undefined;
    const geo = {
      getCurrentPosition: (ok: PositionCallback, _err: PositionErrorCallback, opts?: PositionOptions) => {
        options = opts;
        ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
      },
    } as unknown as Geolocation;
    await detectCurrentLocation(geo);
    expect(options?.maximumAge).toBe(600_000);
  });
});
