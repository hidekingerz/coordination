/** Open-Meteo の forecast API から指定地点の日別気温を取得する */

import { DEFAULT_LOCATION, locationKey, type Location } from './location';
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
/** forecast API が返せる範囲: 過去 92 日 〜 先 15 日 */
const PAST_DAYS = 92;
const FUTURE_DAYS = 15;

export interface DailyTemperature {
  /** 最高気温 (℃) */
  max: number;
  /** 最低気温 (℃) */
  min: number;
}

export type FetchLike = (input: string) => Promise<Response>;

/** ローカル日付を YYYY-MM-DD にする */
export function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** その日付の予報 (または実績) を API から取れるか */
export function isForecastAvailable(date: Date, today: Date = new Date()): boolean {
  const diffDays = Math.round((startOfDay(date) - startOfDay(today)) / 86_400_000);
  return diffDays >= -PAST_DAYS && diffDays <= FUTURE_DAYS;
}

export function buildForecastUrl(date: Date, loc: Location = DEFAULT_LOCATION): string {
  const key = toDateKey(date);
  const params = new URLSearchParams({
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'Asia/Tokyo',
    start_date: key,
    end_date: key,
  });
  return `${ENDPOINT}?${params.toString()}`;
}

/** API レスポンスから指定日の最高/最低気温を取り出す。無ければ null */
export function parseForecast(json: unknown, dateKey: string): DailyTemperature | null {
  if (!json || typeof json !== 'object') return null;
  const daily = (json as { daily?: unknown }).daily;
  if (!daily || typeof daily !== 'object') return null;
  const d = daily as { time?: unknown; temperature_2m_max?: unknown; temperature_2m_min?: unknown };
  if (!Array.isArray(d.time) || !Array.isArray(d.temperature_2m_max) || !Array.isArray(d.temperature_2m_min)) return null;
  const idx = d.time.indexOf(dateKey);
  if (idx < 0) return null;
  const max = d.temperature_2m_max[idx];
  const min = d.temperature_2m_min[idx];
  if (typeof max !== 'number' || typeof min !== 'number') return null;
  return { max, min };
}

export async function fetchForecast(
  date: Date,
  loc: Location = DEFAULT_LOCATION,
  fetchImpl: FetchLike = (u) => fetch(u),
): Promise<DailyTemperature> {
  const res = await fetchImpl(buildForecastUrl(date, loc));
  if (!res.ok) throw new Error(`天気 API がエラーを返しました (${res.status})`);
  const parsed = parseForecast(await res.json(), toDateKey(date));
  if (!parsed) throw new Error('天気 API の応答に気温がありません');
  return parsed;
}

// ---- キャッシュ ----

const CACHE_KEY = 'coordination.weather.v2';
/** 予報は数時間で更新されるので、同じ日のデータは 6 時間だけ再利用する */
const CACHE_TTL_MS = 6 * 3_600_000;

/** localStorage のうち使う部分だけ。テストや無効時に差し替える */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface CacheEntry extends DailyTemperature {
  fetchedAt: number;
}
type CacheMap = Record<string, CacheEntry>;

export interface GetForecastOptions {
  fetchImpl?: FetchLike;
  /** null を渡すとキャッシュしない */
  storage?: StorageLike | null;
  now?: () => number;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readCache(storage: StorageLike | null): CacheMap {
  if (!storage) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CACHE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as CacheMap) : {};
  } catch {
    return {};
  }
}

function isFreshEntry(e: unknown, now: number): e is CacheEntry {
  if (!e || typeof e !== 'object') return false;
  const c = e as Partial<CacheEntry>;
  return (
    typeof c.max === 'number' &&
    typeof c.min === 'number' &&
    typeof c.fetchedAt === 'number' &&
    now - c.fetchedAt <= CACHE_TTL_MS
  );
}

function writeCache(storage: StorageLike | null, cache: CacheMap, now: number): void {
  if (!storage) return;
  // 期限切れの日付は捨てて肥大化を防ぐ
  const fresh: CacheMap = {};
  for (const [k, v] of Object.entries(cache)) if (isFreshEntry(v, now)) fresh[k] = v;
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(fresh));
  } catch {
    // 保存できなくても取得結果はそのまま返す
  }
}

/** 指定地点の日別気温を取得する。同じ地点・同じ日は 6 時間キャッシュして API 呼び出しを減らす */
export async function getForecast(date: Date, loc: Location, opts: GetForecastOptions = {}): Promise<DailyTemperature> {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ? opts.now() : Date.now();
  const key = `${locationKey(loc)}/${toDateKey(date)}`;

  const cache = readCache(storage);
  const hit = cache[key];
  if (isFreshEntry(hit, now)) return { max: hit.max, min: hit.min };

  const data = await fetchForecast(date, loc, opts.fetchImpl);
  writeCache(storage, { ...cache, [key]: { ...data, fetchedAt: now } }, now);
  return data;
}

/** 東京の予報。既存の呼び出し互換用 */
export const fetchTokyoForecast = (date: Date, fetchImpl?: FetchLike) => fetchForecast(date, DEFAULT_LOCATION, fetchImpl);
export const getTokyoForecast = (date: Date, opts?: GetForecastOptions) => getForecast(date, DEFAULT_LOCATION, opts);
