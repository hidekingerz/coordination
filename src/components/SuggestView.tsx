import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClothingItem, Formality } from '../types';
import { ALL_FORMALITIES, FORMALITY_LABEL, SEASON_LABEL, WARMTH_LABEL } from '../types';
import { buildConditions } from '../lib/season';
import { getForecast, isForecastAvailable, toDateKey, type DailyTemperature } from '../lib/weather';
import {
  CURRENT_LOCATION_ID,
  PRESET_LOCATIONS,
  detectCurrentLocation,
  loadLocation,
  saveLocation,
  type Location,
} from '../lib/location';
import { FRESHNESS_PRESETS, suggestOutfits, type FreshnessMode, type Outfit } from '../lib/outfit';
import { buildWearStats, daysBetween, statsFor, type WearLog } from '../lib/wear';
import { buildFigure } from '../lib/figure';
import { OutfitFigure } from './OutfitFigure';
import { ItemCard } from './ItemCard';
import { ItemPicker } from './ItemPicker';
import { Swatch } from './Swatch';

interface Props {
  wardrobe: ClothingItem[];
  wearLog: WearLog;
  onWear: (itemIds: string[], date: string, outfitId?: string) => void;
  onUnwear: (itemIds: string[], date: string) => void;
}

const FRESHNESS_LABEL: Record<FreshnessMode, string> = {
  balanced: '最近着た服は控えめに (標準)',
  prefer: '着ていない服を優先',
  off: '考慮しない',
};

type ForecastState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: DailyTemperature }
  | { status: 'unavailable' }
  | { status: 'error' };

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

export function SuggestView({ wardrobe, wearLog, onWear, onUnwear }: Props) {
  const [dateStr, setDateStr] = useState(() => toDateKey(new Date()));
  const [tempStr, setTempStr] = useState('');
  /** 気温欄が予報由来のときだけ、その日の最低気温も条件に入れる */
  const [forecastMin, setForecastMin] = useState<number | undefined>(undefined);
  const [forecast, setForecast] = useState<ForecastState>({ status: 'idle' });
  const [location, setLocation] = useState<Location>(() => loadLocation());
  const [locating, setLocating] = useState<{ status: 'idle' } | { status: 'busy' } | { status: 'error'; message: string }>({
    status: 'idle',
  });
  /**
   * 気温欄の値の出所。手入力なら日付を変えるまで予報で上書きしない。
   * 予報由来なら日付を変えた時点で消し、古い日の気温が残らないようにする。
   */
  const tempSource = useRef<'manual' | 'forecast' | null>(null);

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
        if (tempSource.current !== 'manual') {
          setTempStr(String(Math.round(data.max)));
          setForecastMin(data.min);
          tempSource.current = 'forecast';
        }
      })
      .catch(() => {
        if (!cancelled) setForecast({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [dateStr, location]);

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
  const [formality, setFormality] = useState<Formality | ''>('');
  /** 必ず含めたいアイテムの id (複数可) */
  const [mustInclude, setMustInclude] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [freshness, setFreshness] = useState<FreshnessMode>('balanced');
  const [results, setResults] = useState<Outfit[] | null>(null);
  const [worn, setWorn] = useState<{ outfit: Outfit; date: string } | null>(null);

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

  const run = () => {
    setResults(
      suggestOutfits(wardrobe, {
        conditions,
        formality: formality || undefined,
        mustInclude: mustInclude.length ? mustInclude : undefined,
        limit: 5,
        wearStats: wearLog.length ? wearStats : undefined,
        freshnessWeight: FRESHNESS_PRESETS[freshness],
        recentOutfitIds,
      }),
    );
    setWorn(null);
  };

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

  // 削除されたアイテムが残らないよう、クローゼットに存在するものだけ表示する
  const mustItems = mustInclude.map((id) => wardrobe.find((i) => i.id === id)).filter((i): i is ClothingItem => Boolean(i));

  return (
    <section className="suggest">
      <div className="conditions card">
        <div className="cond-row">
          <label>
            <span>日付</span>
            <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          </label>
          <label>
            <span>
              気温 (℃) <span className="muted">任意</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="例: 18"
              value={tempStr}
              onChange={(e) => {
                tempSource.current = 'manual';
                setForecastMin(undefined);
                setTempStr(e.target.value);
              }}
            />
            <ForecastNote state={forecast} locationName={location.name} />
          </label>
          <label>
            <span>予報の地点</span>
            <select value={location.id} onChange={(e) => void changeLocation(e.target.value)}>
              {PRESET_LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value={CURRENT_LOCATION_ID}>現在地 (位置情報を使う)</option>
            </select>
            {locating.status === 'busy' && <span className="forecast muted">位置情報を取得中… (最大 30 秒。他の地点を選んで中断できます)</span>}
            {locating.status === 'error' && <span className="forecast warn">{locating.message}</span>}
          </label>
          <label>
            <span>テイスト</span>
            <select value={formality} onChange={(e) => setFormality(e.target.value as Formality | '')}>
              <option value="">指定なし</option>
              {ALL_FORMALITIES.map((f) => (
                <option key={f} value={f}>
                  {FORMALITY_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>着用履歴</span>
            <select value={freshness} onChange={(e) => setFreshness(e.target.value as FreshnessMode)} disabled={wearLog.length === 0}>
              {(Object.keys(FRESHNESS_LABEL) as FreshnessMode[]).map((k) => (
                <option key={k} value={k}>
                  {FRESHNESS_LABEL[k]}
                </option>
              ))}
            </select>
            {wearLog.length === 0 && <span className="forecast muted">「このコーデを着た」で記録すると使えます</span>}
          </label>
          <div className="cond-field">
            <span>
              このアイテムを着たい <span className="muted">任意</span>
            </span>
            <div className="must-row">
              <button type="button" className="btn" onClick={() => setPicking(true)} disabled={wardrobe.length === 0}>
                アイテムを選ぶ
              </button>
              {mustItems.length === 0 ? (
                <span className="muted">指定なし</span>
              ) : (
                mustItems.map((i) => (
                  <span key={i.id} className="must-chip" data-testid="must-chip">
                    <Swatch color={i.color} size={12} /> {i.name}
                    <button
                      type="button"
                      className="must-remove"
                      aria-label={`${i.name} を外す`}
                      onClick={() => setMustInclude((prev) => prev.filter((id) => id !== i.id))}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="cond-summary">
          <span className="pill">季節: {SEASON_LABEL[conditions.season]}</span>
          {conditions.acceptableSeasons.length > 1 && (
            <span className="pill muted">
              境目: {conditions.acceptableSeasons.filter((s) => s !== conditions.season).map((s) => SEASON_LABEL[s]).join('・')}の服も候補に
            </span>
          )}
          <span className="pill">目安の厚さ: {conditions.targetWarmth} ({WARMTH_LABEL[conditions.targetWarmth]})</span>
        </div>
        <button type="button" className="btn primary large" onClick={run} disabled={wardrobe.length === 0}>
          コーデを提案する
        </button>
        {wardrobe.length === 0 && <p className="muted">先にクローゼットへアイテムを登録してください。</p>}
      </div>

      {picking && <ItemPicker wardrobe={wardrobe} selected={mustInclude} onChange={setMustInclude} onClose={() => setPicking(false)} />}

      {results && results.length === 0 && (
        <p className="empty">
          {mustItems.length > 0
            ? '選んだアイテムを同時に着る組み合わせが作れませんでした。同じカテゴリを複数選んでいないか確認し、指定を減らしてください。'
            : '組み合わせを作れませんでした。トップスとボトムス（またはワンピース）がそれぞれ1点以上必要です。'}
        </p>
      )}

      {worn && (
        <div className="toast">
          #{(results?.findIndex((o) => o.id === worn.outfit.id) ?? 0) + 1} のコーデを {worn.date} に着たとして記録しました。
          <button type="button" className="link" onClick={undoWear}>
            取り消す
          </button>
          <button type="button" className="link" onClick={() => setWorn(null)}>
            閉じる
          </button>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="outfits">
          {results.map((o, idx) => (
            <OutfitCard
              key={o.id}
              outfit={o}
              rank={idx + 1}
              wearStats={wearLog.length ? wearStats : undefined}
              worn={worn?.outfit.id === o.id}
              onWear={() => wearOutfit(o)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ForecastNote({ state, locationName }: { state: ForecastState; locationName: string }) {
  switch (state.status) {
    case 'loading':
      return <span className="forecast muted">{locationName}の予報を取得中…</span>;
    case 'ok':
      return (
        <span className="forecast muted">
          {locationName}の予報: 最高 {Math.round(state.data.max)}℃ / 最低 {Math.round(state.data.min)}℃
        </span>
      );
    case 'error':
      return <span className="forecast warn">予報を取得できませんでした。手入力できます</span>;
    case 'unavailable':
      return <span className="forecast muted">この日付の予報は取得できません</span>;
    default:
      return null;
  }
}

interface OutfitCardProps {
  outfit: Outfit;
  rank: number;
  wearStats?: ReturnType<typeof buildWearStats>;
  worn: boolean;
  onWear: () => void;
}

function OutfitCard({ outfit, rank, wearStats, worn, onWear }: OutfitCardProps) {
  const pct = (n: number) => Math.round(n * 100);
  const order = ['outer', 'tops', 'onepiece', 'bottoms', 'shoes', 'accessory'];
  const items = [...outfit.items].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  return (
    <article className="outfit card">
      <header>
        <span className="rank">#{rank}</span>
        <div className="palette">
          {items.map((i) => (
            <Swatch key={i.id} color={i.color} size={22} title={`${i.name}`} />
          ))}
        </div>
        <span className="score" title="総合スコア">
          {pct(outfit.score)}点
        </span>
      </header>
      <div className="outfit-main">
        <OutfitFigure parts={buildFigure(outfit.items)} width={110} />
        <div className="outfit-items">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} compact wear={wearStats ? statsFor(wearStats, i.id) : undefined} />
          ))}
        </div>
      </div>
      <ul className="reasons">
        {outfit.reasons.map((r, i) => (
          <li key={i}>✓ {r}</li>
        ))}
        {outfit.warnings.map((w, i) => (
          <li key={`w${i}`} className="warn">
            ⚠ {w}
          </li>
        ))}
      </ul>
      <div className="breakdown">
        <Bar label="色" value={outfit.breakdown.color} />
        <Bar label="厚さ" value={outfit.breakdown.warmth} />
        <Bar label="テイスト" value={outfit.breakdown.formality} />
        <Bar label="季節" value={outfit.breakdown.season} />
        {wearStats && <Bar label="鮮度" value={outfit.breakdown.freshness} />}
      </div>
      <div className="outfit-actions">
        <button type="button" className={`btn small ${worn ? '' : 'primary'}`} onClick={onWear} disabled={worn}>
          {worn ? '記録済み' : 'このコーデを着た'}
        </button>
      </div>
    </article>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="bar-value">{Math.round(value * 100)}</span>
    </div>
  );
}
