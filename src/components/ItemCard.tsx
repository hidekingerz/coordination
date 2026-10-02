import type { ClothingItem } from '../types';
import { CATEGORY_LABEL, FORMALITY_LABEL, SEASON_LABEL } from '../types';
import { colorLabel } from '../lib/color';
import { Swatch } from './Swatch';

interface Props {
  item: ClothingItem;
  onEdit?: (item: ClothingItem) => void;
  onDelete?: (item: ClothingItem) => void;
  compact?: boolean;
}

export function ItemCard({ item, onEdit, onDelete, compact }: Props) {
  return (
    <div className={`item-card ${compact ? 'compact' : ''}`}>
      <div className="item-visual" style={{ background: item.color }}>
        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : null}
        {item.subColor ? <span className="item-subcolor" style={{ background: item.subColor }} /> : null}
      </div>
      <div className="item-body">
        <div className="item-title">
          <span className="item-category">
            {CATEGORY_LABEL[item.category]}
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
        </div>
        {(onEdit || onDelete) && (
          <div className="item-actions">
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
