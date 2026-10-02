import { useMemo, useState } from 'react';
import type { ClothingItem, Formality } from '../types';
import { ALL_FORMALITIES, CATEGORY_LABEL, FORMALITY_LABEL, SEASON_LABEL, WARMTH_LABEL } from '../types';
import { buildConditions } from '../lib/season';
import { suggestOutfits, type Outfit } from '../lib/outfit';
import { ItemCard } from './ItemCard';
import { Swatch } from './Swatch';

interface Props {
  wardrobe: ClothingItem[];
}

function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function SuggestView({ wardrobe }: Props) {
  const [dateStr, setDateStr] = useState(todayStr());
  const [tempStr, setTempStr] = useState('');
  const [formality, setFormality] = useState<Formality | ''>('');
  const [mustInclude, setMustInclude] = useState<string>('');
  const [results, setResults] = useState<Outfit[] | null>(null);

  const conditions = useMemo(() => {
    const date = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
    const temp = tempStr.trim() === '' ? undefined : Number(tempStr);
    return buildConditions(Number.isNaN(date.getTime()) ? new Date() : date, temp);
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
              onChange={(e) => setTempStr(e.target.value)}
            />
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
      <div className="outfit-items">
        {items.map((i) => (
          <ItemCard key={i.id} item={i} compact />
        ))}
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
