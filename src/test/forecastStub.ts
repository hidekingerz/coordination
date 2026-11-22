import { vi } from 'vitest';
import { PRESET_LOCATIONS, CURRENT_LOCATION_ID, type Location } from '../lib/location';

export interface ForecastStubAnswer {
  max: number;
  min: number;
}

/** 予報 API への 1 回の問い合わせ (URL から読み取った値) */
export interface ForecastRequest {
  date: string;
  latitude: number;
  longitude: number;
}

/**
 * 天気予報 API (Open-Meteo) への fetch を差し替える。アプリの内部の関数ではなく、外への問い合わせを差し替えるので、
 * 予報の取得方法を作り替えてもテストはそのまま使える。
 * answer が返した値を、問い合わせた日付の最高・最低気温として返す。'error' なら 500、Promise ならその解決を待つ。
 * 他の URL は fallback (無ければ 404) に回す。
 */
export function stubForecast(
  answer: (req: ForecastRequest) => ForecastStubAnswer | 'error' | Promise<ForecastStubAnswer | 'error'>,
  fallback?: (url: string, init?: RequestInit) => Promise<Response>,
) {
  const requests: ForecastRequest[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== 'api.open-meteo.com') {
      return fallback ? fallback(url.href, init) : ({ ok: false, status: 404, json: async () => ({}), text: async () => '' } as unknown as Response);
    }
    const req = { date: url.searchParams.get('start_date') ?? '', latitude: Number(url.searchParams.get('latitude')), longitude: Number(url.searchParams.get('longitude')) };
    requests.push(req);
    const a = await answer(req);
    if (a === 'error') return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    const body = { daily: { time: [req.date], temperature_2m_max: [a.max], temperature_2m_min: [a.min] } };
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests, fetchMock };
}

/** いつ問い合わせても同じ気温を返す */
export const always = (max: number, min: number) => () => ({ max, min });

/** 後から解決できる答え (取得中の表示を確かめる用) */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}


/** 問い合わせの緯度経度から地点を引き戻す (プリセットに無ければ現在地) */
export function locationAt(latitude: number, longitude: number): Location {
  return PRESET_LOCATIONS.find((l) => l.latitude === latitude && l.longitude === longitude) ?? { id: CURRENT_LOCATION_ID, name: '現在地', latitude, longitude };
}

/**
 * 「予報 API の答え」をテストごとに決めるためのモック関数を、fetch の差し替えにつなぐ。
 * api(date, location) が返した値が API の応答になり、reject すれば API がエラーを返したことになる。
 * api の呼び出し回数 = API への問い合わせ回数 (キャッシュに当たった分は数えない)
 */
export function stubForecastWith(api: (date: Date, loc: Location) => Promise<ForecastStubAnswer>) {
  return stubForecast(async (req) => {
    try {
      return await api(new Date(`${req.date}T12:00:00`), locationAt(req.latitude, req.longitude));
    } catch {
      return 'error';
    }
  });
}
