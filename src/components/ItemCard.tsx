import type { ClothingItem } from '../types';
import { BOTTOMS_SHAPE_LABEL, CATEGORY_LABEL, FORMALITY_LABEL, SEASON_LABEL } from '../types';
import { colorLabel } from '../lib/color';
import { describeLastWorn, type WearStats } from '../lib/wear';
import { Swatch } from './Swatch';

interface Props {
  item: ClothingItem;
  onEdit?: (item: ClothingItem) => void;
  onDelete?: (item: ClothingItem) => void;
  /** 着用状況。渡すと「3日前 / 未着用」と着用回数を表示する */
  wear?: WearStats;
  /** 「今日着た」ボタン */
  onWearToday?: (item: ClothingItem) => void;
  compact?: boolean;
}

function wearClass(wear: WearStats): string {
  if (wear.daysSince === null) return 'never';
  if (wear.daysSince <= 2) return 'recent';
  if (wear.daysSince >= 60) return 'stale';
  return '';
}

export function ItemCard({ item, onEdit, onDelete, wear, onWearToday, compact }: Props) {
  return (
    <div className={`item-card ${compact ? 'compact' : ''}`}>
      <div className="item-visual" style={{ background: item.color }}>
        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : null}
        {item.subColor ? <span className="item-subcolor" style={{ background: item.subColor }} /> : null}
      </div>
      <div className="item-body">
        <div className="item-title">
          <span className="item-category">
            {item.category === 'bottoms' && item.shape ? BOTTOMS_SHAPE_LABEL[item.shape] : CATEGORY_LABEL[item.category]}
            {item.brand ? <span className="item-brand"> · {item.brand}</span> : null}
          </span>
          <strong>{item.name}</strong>
        </div>
        <div className="item-meta">
          <span>
            <Swatch color={item.color} size={12} /> {colorLabel(item.color)}
            {item.subColor ? (
              <>
                {' / '}
                <Swatch color={item.subColor} size={12} /> {colorLabel(item.subColor)}
              </>
            ) : null}
          </span>
          {!compact && (
            <>
              <span>{item.seasons.map((s) => SEASON_LABEL[s]).join('・') || '季節未設定'}</span>
              <span>厚さ {item.warmth}/5</span>
              <span>{FORMALITY_LABEL[item.formality]}</span>
              {item.tags.length ? <span className="tags">{item.tags.map((t) => `#${t}`).join(' ')}</span> : null}
            </>
          )}
          {wear && (
            <span className={`wear ${wearClass(wear)}`} title={wear.lastWorn ? `最後に着た日: ${wear.lastWorn}` : '着用記録なし'}>
              {describeLastWorn(wear)}
              {wear.count > 0 && !compact ? ` · ${wear.count}回` : ''}
            </span>
          )}
        </div>
        {(onEdit || onDelete || onWearToday) && (
          <div className="item-actions">
            {onWearToday && (
              <button type="button" className="btn small" onClick={() => onWearToday(item)} title="今日この服を着たことを記録">
                今日着た
              </button>
            )}
            {onEdit && (
              <button type="button" className="btn small" onClick={() => onEdit(item)}>
                編集
              </button>
            )}
            {onDelete && (
              <button type="button" className="btn small danger" onClick={() => onDelete(item)}>
                削除
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
