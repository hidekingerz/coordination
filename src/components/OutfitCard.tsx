import type { Outfit } from '../lib/outfit';
import { buildFigure } from '../lib/figure';
import { statsFor, type WearStatsMap } from '../lib/wear';
import { OutfitFigure } from './OutfitFigure';
import { ItemCard } from './ItemCard';
import { Swatch } from './Swatch';

interface Props {
  outfit: Outfit;
  rank: number;
  wearStats?: WearStatsMap;
  worn: boolean;
  onWear: () => void;
}

const ORDER = ['outer', 'tops', 'onepiece', 'bottoms', 'shoes', 'accessory'];

/** 提案 1 件。イラストとアイテムを主役にし、根拠とスコアの内訳は折りたたむ */
export function OutfitCard({ outfit, rank, wearStats, worn, onWear }: Props) {
  const pct = (n: number) => Math.round(n * 100);
  const items = [...outfit.items].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
  return (
    <article className="outfit card">
      <header>
        <span className="rank">#{rank}</span>
        <div className="palette">
          {items.map((i) => (
            <Swatch key={i.id} color={i.color} size={22} title={i.name} />
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
      {outfit.warnings.length > 0 && (
        <ul className="reasons warnings">
          {outfit.warnings.map((w, i) => (
            <li key={i} className="warn">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
      <details className="outfit-details">
        <summary>根拠を見る</summary>
        <ul className="reasons">
          {outfit.reasons.map((r, i) => (
            <li key={i}>✓ {r}</li>
          ))}
        </ul>
        <div className="breakdown">
          <Bar label="色" value={outfit.breakdown.color} />
          <Bar label="厚さ" value={outfit.breakdown.warmth} />
          <Bar label="テイスト" value={outfit.breakdown.formality} />
          <Bar label="季節" value={outfit.breakdown.season} />
          {wearStats && <Bar label="鮮度" value={outfit.breakdown.freshness} />}
        </div>
      </details>
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
