import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCATION, PRESET_LOCATIONS, loadLocation, locationKey, saveLocation, type Location } from './location';

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
