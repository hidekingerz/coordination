/** 天気予報を取る地点 */
export interface Location {
  /** プリセットの id、または現在地なら 'current' */
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export const PRESET_LOCATIONS: Location[] = [
  { id: 'sapporo', name: '札幌', latitude: 43.0618, longitude: 141.3545 },
  { id: 'sendai', name: '仙台', latitude: 38.2682, longitude: 140.8694 },
  { id: 'tokyo', name: '東京', latitude: 35.6762, longitude: 139.6503 },
  { id: 'nagoya', name: '名古屋', latitude: 35.1815, longitude: 136.9066 },
  { id: 'osaka', name: '大阪', latitude: 34.6937, longitude: 135.5023 },
  { id: 'hiroshima', name: '広島', latitude: 34.3853, longitude: 132.4553 },
  { id: 'fukuoka', name: '福岡', latitude: 33.5904, longitude: 130.4017 },
  { id: 'naha', name: '那覇', latitude: 26.2124, longitude: 127.6809 },
];

export const DEFAULT_LOCATION: Location = PRESET_LOCATIONS.find((l) => l.id === 'tokyo')!;

export const CURRENT_LOCATION_ID = 'current';

const KEY = 'coordination.location.v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function isLocation(x: unknown): x is Location {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.latitude === 'number' &&
    Number.isFinite(o.latitude) &&
    typeof o.longitude === 'number' &&
    Number.isFinite(o.longitude)
  );
}

/** 保存された地点を返す。無い・壊れている場合は東京 */
export function loadLocation(storage: StorageLike | null = defaultStorage()): Location {
  if (!storage) return DEFAULT_LOCATION;
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (!isLocation(parsed)) return DEFAULT_LOCATION;
    const { id, name, latitude, longitude } = parsed;
    return { id, name, latitude, longitude };
  } catch {
    return DEFAULT_LOCATION;
  }
}

export function saveLocation(loc: Location, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(loc));
  } catch {
    // 保存できなくても動作は続ける
  }
}

/** キャッシュなどで地点を同一視するためのキー。現在地は小数 2 桁 (約 1km) で丸める */
export function locationKey(loc: Location): string {
  return `${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`;
}

/** ブラウザの位置情報から現在地を作る。取得できなければ reject */
export function detectCurrentLocation(geo: Geolocation | undefined = globalThis.navigator?.geolocation): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!geo) return reject(new Error('この環境では位置情報を取得できません'));
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          id: CURRENT_LOCATION_ID,
          name: '現在地',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(new Error(err.message || '位置情報を取得できませんでした')),
      { timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  });
}
