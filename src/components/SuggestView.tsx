import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClothingItem, Formality } from '../types';
import { ALL_FORMALITIES, CATEGORY_LABEL, FORMALITY_LABEL, SEASON_LABEL, WARMTH_LABEL } from '../types';
import { buildConditions } from '../lib/season';
import { getTokyoForecast, isForecastAvailable, toDateKey, type DailyTemperature } from '../lib/weather';
import { suggestOutfits, type Outfit } from '../lib/outfit';
import { buildFigure } from '../lib/figure';
import { OutfitFigure } from './OutfitFigure';
import { ItemCard } from './ItemCard';
import { Swatch } from './Swatch';

interface Props {
  wardrobe: ClothingItem[];
}

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

export function SuggestView({ wardrobe }: Props) {
  const [dateStr, setDateStr] = useState(() => toDateKey(new Date()));
  const [tempStr, setTempStr] = useState('');
  const [forecast, setForecast] = useState<ForecastState>({ status: 'idle' });
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
    const date = parseDate(dateStr);
    if (!date || !isForecastAvailable(date)) {
      setForecast({ status: 'unavailable' });
      return;
    }
    let cancelled = false;
    setForecast({ status: 'loading' });
    getTokyoForecast(date)
      .then((data) => {
        if (cancelled) return;
        setForecast({ status: 'ok', data });
        if (tempSource.current !== 'manual') {
          setTempStr(String(Math.round(data.max)));
          tempSource.current = 'forecast';
        }
      })
      .catch(() => {
        if (!cancelled) setForecast({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [dateStr]);
  const [formality, setFormality] = useState<Formality | ''>('');
  const [mustInclude, setMustInclude] = useState<string>('');
  const [results, setResults] = useState<Outfit[] | null>(null);

  const conditions = useMemo(() => {
    const temp = tempStr.trim() === '' ? undefined : Number(tempStr);
    return buildConditions(parseDate(dateStr) ?? new Date(), temp);
  }, [dateStr, tempStr]);

  const run = () => {
    setResults(
      suggestOutfits(wardrobe, {
        conditions,
        formality: formality || undefined,
        mustInclude: mustInclude ? [mustInclude] : undefined,
        limit: 5,
      }),
    );
  };

  const pickable = wardrobe.filter((i) => i.category !== 'accessory');

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
                setTempStr(e.target.value);
              }}
            />
            <ForecastNote state={forecast} />
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
            <span>
              このアイテムを着たい <span className="muted">任意</span>
            </span>
            <select value={mustInclude} onChange={(e) => setMustInclude(e.target.value)}>
              <option value="">指定なし</option>
              {pickable.map((i) => (
                <option key={i.id} value={i.id}>
                  [{CATEGORY_LABEL[i.category]}] {i.name}
                </option>
              ))}
            </select>
          </label>
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

      {results && results.length === 0 && (
        <p className="empty">
          組み合わせを作れませんでした。トップスとボトムス（またはワンピース）がそれぞれ1点以上必要です。
        </p>
      )}

      {results && results.length > 0 && (
        <div className="outfits">
          {results.map((o, idx) => (
            <OutfitCard key={o.id} outfit={o} rank={idx + 1} />
          ))}
        </div>
      )}
    </section>
  );
}

function ForecastNote({ state }: { state: ForecastState }) {
  switch (state.status) {
    case 'loading':
      return <span className="forecast muted">東京の予報を取得中…</span>;
    case 'ok':
      return (
        <span className="forecast muted">
          東京の予報: 最高 {Math.round(state.data.max)}℃ / 最低 {Math.round(state.data.min)}℃
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

function OutfitCard({ outfit, rank }: { outfit: Outfit; rank: number }) {
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
            <ItemCard key={i.id} item={i} compact />
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
