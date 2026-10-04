/** 着用履歴。服データ (ClothingItem) とは別に持ち、提案の「鮮度」に使う */

export interface WearEntry {
  itemId: string;
  /** 着た日 (YYYY-MM-DD, ローカル日付) */
  date: string;
  /** 「このコーデを着た」で記録したときの組み合わせ ID */
  outfitId?: string;
}

export type WearLog = WearEntry[];

const KEY = 'coordination.wearlog.v1';

export function loadWearLog(): WearLog {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function saveWearLog(log: WearLog): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch (e) {
    console.error('着用履歴の保存に失敗しました', e);
  }
}

export function isEntry(x: unknown): x is WearEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.itemId === 'string' && typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date);
}

export function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 指定日に着たことを記録する。同じ服を同じ日に二重には記録しない */
export function recordWear(log: WearLog, itemIds: string[], date: string, outfitId?: string): WearLog {
  const next = log.filter((e) => !(e.date === date && itemIds.includes(e.itemId)));
  for (const itemId of itemIds) next.push({ itemId, date, ...(outfitId ? { outfitId } : {}) });
  return next;
}

/** 指定日の記録を取り消す (直前の「着た」を戻す用) */
export function removeWear(log: WearLog, itemIds: string[], date: string): WearLog {
  return log.filter((e) => !(e.date === date && itemIds.includes(e.itemId)));
}

/** 2 つの履歴を合わせる (同じ服・同じ日は 1 件に) */
export function mergeWearLogs(a: WearLog, b: WearLog): WearLog {
  const seen = new Set<string>();
  const out: WearLog = [];
  for (const e of [...a, ...b]) {
    const k = `${e.itemId}|${e.date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** クローゼットから消えた服の履歴を落とす */
export function pruneWearLog(log: WearLog, existingIds: Set<string>): WearLog {
  return log.filter((e) => existingIds.has(e.itemId));
}

export function daysBetween(fromKey: string, toKey: string): number {
  const f = new Date(fromKey + 'T00:00:00');
  const t = new Date(toKey + 'T00:00:00');
  return Math.round((t.getTime() - f.getTime()) / 86_400_000);
}

export interface WearStats {
  /** 最後に着た日。未着用なら null */
  lastWorn: string | null;
  /** 着た回数 */
  count: number;
  /** 基準日から見て最後に着てから何日か。未着用なら null */
  daysSince: number | null;
}

export type WearStatsMap = Map<string, WearStats>;

/** 基準日 (提案する日) から見た各アイテムの着用状況 */
export function buildWearStats(log: WearLog, todayKey: string): WearStatsMap {
  const map: WearStatsMap = new Map();
  for (const e of log) {
    // 基準日より未来の記録は見ない (過去の日付で提案するとき用)
    if (e.date > todayKey) continue;
    const cur = map.get(e.itemId);
    if (!cur) {
      map.set(e.itemId, { lastWorn: e.date, count: 1, daysSince: daysBetween(e.date, todayKey) });
    } else {
      cur.count++;
      if (e.date > (cur.lastWorn ?? '')) {
        cur.lastWorn = e.date;
        cur.daysSince = daysBetween(e.date, todayKey);
      }
    }
  }
  return map;
}

export function statsFor(stats: WearStatsMap | undefined, itemId: string): WearStats {
  return stats?.get(itemId) ?? { lastWorn: null, count: 0, daysSince: null };
}

/** 着てから日が浅いほど低く、2 週間以上空く (または未着用) と 1 になる */
export const FRESH_HORIZON_DAYS = 14;

export function freshnessScore(daysSince: number | null): number {
  if (daysSince === null) return 1;
  if (daysSince <= 0) return 0;
  return Math.min(1, daysSince / FRESH_HORIZON_DAYS);
}

/** 「3日前」「未着用」のような表示用の文字列 */
export function describeLastWorn(stats: WearStats): string {
  if (stats.daysSince === null) return '未着用';
  if (stats.daysSince === 0) return '今日着た';
  if (stats.daysSince === 1) return '昨日着た';
  if (stats.daysSince < 30) return `${stats.daysSince}日前`;
  if (stats.daysSince < 365) return `${Math.floor(stats.daysSince / 30)}か月前`;
  return `${Math.floor(stats.daysSince / 365)}年以上前`;
}

/** 同じ組み合わせを直近に着ていたか */
export function outfitWornWithin(log: WearLog, outfitId: string, todayKey: string, days: number): boolean {
  return log.some((e) => e.outfitId === outfitId && e.date <= todayKey && daysBetween(e.date, todayKey) < days);
}
