import type { Season, Warmth } from '../types';

/** 日付から季節を判定 (日本の一般的な区分) */
export function seasonOf(date: Date): Season {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/**
 * 季節内の進行度 (0=季節の始まり, 1=終わり) を返す。
 * 境目の月は隣の季節の服も許容するために使う。
 */
export function seasonProgress(date: Date): number {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const startMonth: Record<Season, number> = { spring: 3, summer: 6, autumn: 9, winter: 12 };
  const s = seasonOf(date);
  const offset = ((m - startMonth[s] + 12) % 12) * 30 + d;
  return Math.min(1, offset / 92);
}

/** 季節の境目に近いとき、隣接する季節も「許容季節」として返す */
export function acceptableSeasons(date: Date): Season[] {
  const s = seasonOf(date);
  const p = seasonProgress(date);
  const order: Season[] = ['spring', 'summer', 'autumn', 'winter'];
  const idx = order.indexOf(s);
  const result: Season[] = [s];
  if (p < 0.25) result.push(order[(idx + 3) % 4]);
  if (p > 0.75) result.push(order[(idx + 1) % 4]);
  return result;
}

/** 気温 (℃) から目標とする服の厚さを決める */
export function warmthForTemperature(celsius: number): Warmth {
  if (celsius >= 27) return 1;
  if (celsius >= 22) return 2;
  if (celsius >= 16) return 3;
  if (celsius >= 9) return 4;
  return 5;
}

/** 気温が不明なときの季節ごとの目安 */
export function defaultWarmthForSeason(season: Season, progress = 0.5): Warmth {
  switch (season) {
    case 'summer':
      return 1;
    case 'winter':
      return 5;
    case 'spring':
      // 3月は厚め、5月は薄め
      return progress < 0.33 ? 4 : progress > 0.66 ? 2 : 3;
    case 'autumn':
      // 9月は薄め、11月は厚め
      return progress < 0.33 ? 2 : progress > 0.66 ? 4 : 3;
  }
}

export interface Conditions {
  date: Date;
  season: Season;
  acceptableSeasons: Season[];
  targetWarmth: Warmth;
  temperature?: number;
}

export function buildConditions(date: Date, temperature?: number): Conditions {
  const season = seasonOf(date);
  const targetWarmth =
    temperature !== undefined && !Number.isNaN(temperature)
      ? warmthForTemperature(temperature)
      : defaultWarmthForSeason(season, seasonProgress(date));
  return {
    date,
    season,
    acceptableSeasons: acceptableSeasons(date),
    targetWarmth,
    temperature,
  };
}
