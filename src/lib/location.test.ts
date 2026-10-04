import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCATION,
  GeolocationFailure,
  PRESET_LOCATIONS,
  detectCurrentLocation,
  loadLocation,
  locationKey,
  saveLocation,
  type Location,
} from './location';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('PRESET_LOCATIONS', () => {
  it('includes Tokyo as the default and has unique ids', () => {
    expect(DEFAULT_LOCATION.id).toBe('tokyo');
    expect(PRESET_LOCATIONS.some((l) => l.id === 'tokyo')).toBe(true);
    expect(new Set(PRESET_LOCATIONS.map((l) => l.id)).size).toBe(PRESET_LOCATIONS.length);
  });
});

describe('loadLocation / saveLocation', () => {
  it('returns the default when nothing is saved', () => {
    expect(loadLocation(memoryStorage())).toEqual(DEFAULT_LOCATION);
  });

  it('round-trips a saved location', () => {
    const storage = memoryStorage();
    const osaka = PRESET_LOCATIONS.find((l) => l.id === 'osaka')!;
    saveLocation(osaka, storage);
    expect(loadLocation(storage)).toEqual(osaka);
  });

  it('keeps a custom (geolocated) location with its coordinates', () => {
    const storage = memoryStorage();
    const here: Location = { id: 'current', name: '現在地', latitude: 34.1, longitude: 135.2 };
    saveLocation(here, storage);
    expect(loadLocation(storage)).toEqual(here);
  });

  it('falls back to the default on corrupted or incomplete data', () => {
    const storage = memoryStorage();
    storage.setItem('coordination.location.v1', '{broken');
    expect(loadLocation(storage)).toEqual(DEFAULT_LOCATION);
    storage.setItem('coordination.location.v1', JSON.stringify({ id: 'x', name: 'no coords' }));
    expect(loadLocation(storage)).toEqual(DEFAULT_LOCATION);
  });

  it('tolerates an unusable storage', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadLocation(broken)).toEqual(DEFAULT_LOCATION);
    expect(() => saveLocation(DEFAULT_LOCATION, broken)).not.toThrow();
  });
});

describe('locationKey', () => {
  it('rounds coordinates so nearby geolocations share a cache key', () => {
    expect(locationKey({ id: 'current', name: '現在地', latitude: 35.68123, longitude: 139.76789 })).toBe('35.68,139.77');
    expect(locationKey({ id: 'current', name: '現在地', latitude: 35.68401, longitude: 139.76601 })).toBe('35.68,139.77');
  });
});

describe('detectCurrentLocation', () => {
  const fakeGeo = (behaviour: (ok: PositionCallback, err: PositionErrorCallback) => void) =>
    ({ getCurrentPosition: behaviour }) as unknown as Geolocation;
  const geoError = (code: number, message = '') =>
    ({ code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;

  it('resolves to a current location with the reported coordinates', async () => {
    const geo = fakeGeo((ok) => ok({ coords: { latitude: 34.1, longitude: 135.2 } } as GeolocationPosition));
    await expect(detectCurrentLocation(geo)).resolves.toEqual({ id: 'current', name: '現在地', latitude: 34.1, longitude: 135.2 });
  });

  it('reports why it failed so the UI can explain it', async () => {
    const cases: [number, string, string][] = [
      [1, 'denied', '許可されていません'],
      [2, 'unavailable', '取得できませんでした'],
      [3, 'timeout', '時間切れ'],
    ];
    for (const [code, reason, text] of cases) {
      const geo = fakeGeo((_ok, err) => err(geoError(code, 'raw browser message')));
      const e = (await detectCurrentLocation(geo).catch((x) => x)) as GeolocationFailure;
      expect(e).toBeInstanceOf(GeolocationFailure);
      expect(e.reason).toBe(reason);
      expect(e.message).toContain(text);
      expect(e.detail).toBe('raw browser message');
    }
  });

  it('reports unsupported when the API is missing', async () => {
    const e = (await detectCurrentLocation(undefined).catch((x) => x)) as GeolocationFailure;
    expect(e.reason).toBe('unsupported');
  });
});

describe('detectCurrentLocation options', () => {
  it('asks for high accuracy: on macOS Chrome, low-accuracy requests go to a network provider that may never answer', async () => {
    let options: PositionOptions | undefined;
    const geo = {
      getCurrentPosition: (ok: PositionCallback, _err: PositionErrorCallback, opts?: PositionOptions) => {
        options = opts;
        ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
      },
    } as unknown as Geolocation;
    await detectCurrentLocation(geo);
    expect(options?.enableHighAccuracy).toBe(true);
  });

  it('waits up to 30 seconds because Wi-Fi positioning on laptops can be slow', async () => {
    let options: PositionOptions | undefined;
    const geo = {
      getCurrentPosition: (ok: PositionCallback, _err: PositionErrorCallback, opts?: PositionOptions) => {
        options = opts;
        ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
      },
    } as unknown as Geolocation;
    await detectCurrentLocation(geo);
    expect(options?.timeout).toBe(30_000);
  });
});
