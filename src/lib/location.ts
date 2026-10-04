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

export type GeolocationFailureReason = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

const FAILURE_MESSAGE: Record<GeolocationFailureReason, string> = {
  unsupported: 'この環境では位置情報を使えません (http の IP アドレスなど、安全なコンテキストでない可能性があります)',
  denied: '位置情報の利用が許可されていません。アドレスバーのサイト設定から許可してください',
  unavailable: '位置を取得できませんでした。OS の位置情報サービスがブラウザに許可されているか確認してください',
  timeout: '位置情報の取得が時間切れになりました。もう一度お試しください',
};

/** 位置情報の取得失敗。理由とブラウザの生メッセージを持つ */
export class GeolocationFailure extends Error {
  constructor(
    public readonly reason: GeolocationFailureReason,
    /** ブラウザが返したメッセージ (診断用) */
    public readonly detail = '',
  ) {
    super(FAILURE_MESSAGE[reason]);
    this.name = 'GeolocationFailure';
  }
}

function reasonOf(err: GeolocationPositionError): GeolocationFailureReason {
  switch (err.code) {
    case 1:
      return 'denied';
    case 3:
      return 'timeout';
    default:
      return 'unavailable';
  }
}

/** ブラウザの位置情報から現在地を作る。取得できなければ GeolocationFailure で reject */
export function detectCurrentLocation(geo: Geolocation | undefined = globalThis.navigator?.geolocation): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!geo) return reject(new GeolocationFailure('unsupported'));
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          id: CURRENT_LOCATION_ID,
          name: '現在地',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(new GeolocationFailure(reasonOf(err), err.message)),
      // enableHighAccuracy: macOS の Chrome では低精度の要求が Chrome 独自のネットワーク測位に回され、
      // 有線接続などで応答が返らず時間切れになる。高精度なら OS の位置情報サービスが使われ即座に返る。
      // timeout: GPS のないノート PC では Wi-Fi 測位に 10 秒以上かかることがある
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 10 * 60_000 },
    );
  });
}
