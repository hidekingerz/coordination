import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClothingItem, Formality } from '../types';
import { buildConditions } from '../lib/season';
import { getForecast, isForecastAvailable, toDateKey } from '../lib/weather';
import { CURRENT_LOCATION_ID, PRESET_LOCATIONS, detectCurrentLocation, loadLocation, saveLocation, type Location } from '../lib/location';
import { FRESHNESS_PRESETS, suggestOutfits, type FreshnessMode, type Outfit } from '../lib/outfit';
import { buildWearStats, daysBetween, type WearLog } from '../lib/wear';
import { SuggestConditions, type DateMode, type ForecastState, type LocatingState } from './SuggestConditions';
import { OutfitCard } from './OutfitCard';

interface Props {
  wardrobe: ClothingItem[];
  wearLog: WearLog;
  onWear: (itemIds: string[], date: string, outfitId?: string) => void;
  onUnwear: (itemIds: string[], date: string) => void;
}

const PAGE_SIZE = 5;
/** 条件が変わってから再計算するまでの待ち時間 (連続操作をまとめる) */
const RECALC_DELAY_MS = 150;

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function shiftedKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function SuggestView({ wardrobe, wearLog, onWear, onUnwear }: Props) {
  // ---- 日付
  const [dateStr, setDateStr] = useState(() => shiftedKey(0));
  const [dateMode, setDateMode] = useState<DateMode>('today');
  const pickDate = (mode: DateMode) => {
    setDateMode(mode);
    if (mode === 'today') setDateStr(shiftedKey(0));
    if (mode === 'tomorrow') setDateStr(shiftedKey(1));
  };

  // ---- 気温と予報
  const [tempStr, setTempStr] = useState('');
  /** 気温欄が予報由来のときだけ、その日の最低気温も条件に入れる */
  const [forecastMin, setForecastMin] = useState<number | undefined>(undefined);
  const [forecast, setForecast] = useState<ForecastState>({ status: 'idle' });
  const [location, setLocation] = useState<Location>(() => loadLocation());
  const [locating, setLocating] = useState<LocatingState>({ status: 'idle' });
  /**
   * 気温欄の値の出所。手入力なら日付を変えるまで予報で上書きしない。
   * 予報由来なら日付を変えた時点で消し、古い日の気温が残らないようにする。
   */
  const tempSource = useRef<'manual' | 'forecast' | null>(null);
  const [tempIsManual, setTempIsManual] = useState(false);

  const applyForecastTemp = (max: number, min: number) => {
    setTempStr(String(Math.round(max)));
    setForecastMin(min);
    tempSource.current = 'forecast';
    setTempIsManual(false);
  };

  useEffect(() => {
    if (tempSource.current === 'forecast') {
      setTempStr('');
      tempSource.current = null;
    }
    setForecastMin(undefined);
    const date = parseDate(dateStr);
    if (!date || !isForecastAvailable(date)) {
      setForecast({ status: 'unavailable' });
      return;
    }
    let cancelled = false;
    setForecast({ status: 'loading' });
    getForecast(date, location)
      .then((data) => {
        if (cancelled) return;
        setForecast({ status: 'ok', data });
        if (tempSource.current !== 'manual') applyForecastTemp(data.max, data.min);
      })
      .catch(() => {
        if (!cancelled) setForecast({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [dateStr, location]);

  const changeTemp = (value: string) => {
    tempSource.current = 'manual';
    setTempIsManual(true);
    setForecastMin(undefined);
    setTempStr(value);
  };
  const resetTemp = () => {
    if (forecast.status === 'ok') applyForecastTemp(forecast.data.max, forecast.data.min);
  };

  /** 位置情報の取得中に別の地点を選んだら、遅れて届いた結果を捨てるための連番 */
  const locateSeq = useRef(0);
  const changeLocation = async (id: string) => {
    const seq = ++locateSeq.current;
    if (id === CURRENT_LOCATION_ID) {
      setLocating({ status: 'busy' });
      try {
        const here = await detectCurrentLocation();
        if (seq !== locateSeq.current) return;
        setLocation(here);
        saveLocation(here);
        setLocating({ status: 'idle' });
      } catch (e) {
        if (seq !== locateSeq.current) return;
        const message = e instanceof Error ? e.message : '位置情報を取得できませんでした';
        console.warn('位置情報の取得に失敗', e);
        setLocating({ status: 'error', message });
      }
      return;
    }
    const preset = PRESET_LOCATIONS.find((l) => l.id === id);
    if (!preset) return;
    setLocation(preset);
    saveLocation(preset);
    setLocating({ status: 'idle' });
  };

  // ---- その他の条件
  const [formality, setFormality] = useState<Formality | ''>('');
  const [mustInclude, setMustInclude] = useState<string[]>([]);
  const [freshness, setFreshness] = useState<FreshnessMode>('balanced');

  const wearStats = useMemo(() => buildWearStats(wearLog, dateStr), [wearLog, dateStr]);
  const recentOutfitIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of wearLog) if (e.outfitId && e.date <= dateStr && daysBetween(e.date, dateStr) < 7) set.add(e.outfitId);
    return set;
  }, [wearLog, dateStr]);

  const conditions = useMemo(() => {
    const temp = tempStr.trim() === '' ? undefined : Number(tempStr);
    return buildConditions(parseDate(dateStr) ?? new Date(), temp, forecastMin);
  }, [dateStr, tempStr, forecastMin]);

  // ---- 提案 (条件が変わるたびに自動で再計算)
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<Outfit[] | null>(null);
  const [stale, setStale] = useState(false);
  const [worn, setWorn] = useState<{ outfit: Outfit; date: string } | null>(null);

  // 条件が変わったら 1 ページ目に戻す
  useEffect(() => setPage(0), [wardrobe, conditions, formality, mustInclude, freshness, wearStats, recentOutfitIds]);

  useEffect(() => {
    if (wardrobe.length === 0) {
      setResults(null);
      return;
    }
    setStale(true);
    const timer = setTimeout(() => {
      const all = suggestOutfits(wardrobe, {
        conditions,
        formality: formality || undefined,
        mustInclude: mustInclude.length ? mustInclude : undefined,
        limit: PAGE_SIZE * (page + 1),
        wearStats: wearLog.length ? wearStats : undefined,
        freshnessWeight: FRESHNESS_PRESETS[freshness],
        recentOutfitIds,
      });
      setResults(all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
      setStale(false);
      setWorn(null);
    }, RECALC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [wardrobe, conditions, formality, mustInclude, freshness, wearStats, recentOutfitIds, wearLog.length, page]);

  const wearOutfit = (outfit: Outfit) => {
    onWear(
      outfit.items.map((i) => i.id),
      dateStr,
      outfit.id,
    );
    setWorn({ outfit, date: dateStr });
  };
  const undoWear = () => {
    if (!worn) return;
    onUnwear(
      worn.outfit.items.map((i) => i.id),
      worn.date,
    );
    setWorn(null);
  };

  const hasMust = mustInclude.some((id) => wardrobe.some((i) => i.id === id));

  return (
    <section className="suggest">
      <SuggestConditions
        wardrobe={wardrobe}
        hasWearLog={wearLog.length > 0}
        conditions={conditions}
        dateMode={dateMode}
        dateStr={dateStr}
        onPickDate={pickDate}
        onChangeDate={setDateStr}
        location={location}
        locating={locating}
        forecast={forecast}
        onChangeLocation={(id) => void changeLocation(id)}
        tempStr={tempStr}
        tempIsManual={tempIsManual}
        onChangeTemp={changeTemp}
        onResetTemp={resetTemp}
        formality={formality}
        onChangeFormality={setFormality}
        freshness={freshness}
        onChangeFreshness={setFreshness}
        mustInclude={mustInclude}
        onChangeMustInclude={setMustInclude}
      />

      {wardrobe.length === 0 && <p className="empty">先にクローゼットへアイテムを登録してください。</p>}

      {results && results.length === 0 && (
        <p className="empty">
          {hasMust
            ? '選んだアイテムを同時に着る組み合わせが作れませんでした。同じカテゴリを複数選んでいないか確認し、指定を減らしてください。'
            : page > 0
              ? 'これ以上の案はありません。'
              : '組み合わせを作れませんでした。トップスとボトムス（またはワンピース）がそれぞれ1点以上必要です。'}
        </p>
      )}

      {worn && (
        <div className="toast">
          #{page * PAGE_SIZE + (results?.findIndex((o) => o.id === worn.outfit.id) ?? 0) + 1} のコーデを {worn.date} に着たとして記録しました。
          <button type="button" className="link" onClick={undoWear}>
            取り消す
          </button>
          <button type="button" className="link" onClick={() => setWorn(null)}>
            閉じる
          </button>
        </div>
      )}

      {results && results.length > 0 && (
        <>
          <div className={`outfits ${stale ? 'stale' : ''}`} aria-busy={stale}>
            {results.map((o, idx) => (
              <OutfitCard
                key={o.id}
                outfit={o}
                rank={page * PAGE_SIZE + idx + 1}
                wearStats={wearLog.length ? wearStats : undefined}
                worn={worn?.outfit.id === o.id}
                onWear={() => wearOutfit(o)}
              />
            ))}
          </div>
          <div className="pager">
            {page > 0 && (
              <button type="button" className="btn" onClick={() => setPage((p) => p - 1)}>
                前の案に戻る
              </button>
            )}
            {results.length === PAGE_SIZE && (
              <button type="button" className="btn" onClick={() => setPage((p) => p + 1)}>
                別の案を見る
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
