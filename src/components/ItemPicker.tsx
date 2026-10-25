import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, ClothingItem } from '../types';
import { ALL_CATEGORIES, CATEGORY_LABEL } from '../types';
import { filterWardrobe } from '../lib/filter';
import { colorLabel } from '../lib/color';
import { Swatch } from './Swatch';

interface Props {
  wardrobe: ClothingItem[];
  /** 選択中のアイテム id */
  selected: string[];
  /** 選択が変わるたびに全体のリストを返す */
  onChange: (ids: string[]) => void;
  onClose: () => void;
}

/**
 * 「このアイテムを着たい」の選択画面。
 * クローゼットと同じカードを検索・カテゴリで絞り込みながら、タップで複数選べる。
 */
export function ItemPicker({ wardrobe, selected, onChange, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);

  const visible = useMemo(() => filterWardrobe(wardrobe, { category, brand: 'all', query }), [wardrobe, category, query]);
  const counts = useMemo(() => {
    const c: Partial<Record<Category, number>> = {};
    for (const i of wardrobe) c[i.category] = (c[i.category] ?? 0) + 1;
    return c;
  }, [wardrobe]);

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal picker"
        role="dialog"
        aria-modal="true"
        aria-label="着たいアイテムを選ぶ"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="picker-head">
          <h3>着たいアイテムを選ぶ</h3>
          <span className="muted">{selected.length} 点選択中</span>
        </div>
        <input
          className="search"
          placeholder="名前・ブランド・タグで検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          <button type="button" className={`chip ${category === 'all' ? 'on' : ''}`} onClick={() => setCategory('all')}>
            すべて ({wardrobe.length})
          </button>
          {ALL_CATEGORIES.filter((c) => counts[c]).map((c) => (
            <button key={c} type="button" className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c]} ({counts[c]})
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="muted">条件に合うアイテムがありません。</p>
        ) : (
          <div className="picker-grid">
            {visible.map((item) => {
              const on = selected.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`picker-card ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  aria-label={`${item.name} を${on ? '選択解除' : '選択'}`}
                  onClick={() => toggle(item.id)}
                >
                  <span className="item-visual" style={{ background: item.color }}>
                    {item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}
                  </span>
                  <span className="picker-body">
                    <span className="item-category">
                      {CATEGORY_LABEL[item.category]}
                      {item.brand ? ` · ${item.brand}` : ''}
                    </span>
                    <strong>{item.name}</strong>
                    <span className="muted">
                      <Swatch color={item.color} size={10} /> {colorLabel(item.color)}
                    </span>
                  </span>
                  <span className="picker-check" aria-hidden="true">
                    {on ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="form-actions">
          {selected.length > 0 && (
            <button type="button" className="btn" onClick={() => onChange([])}>
              すべて外す
            </button>
          )}
          <button type="button" className="btn primary" onClick={onClose}>
            決定
          </button>
        </div>
      </div>
    </div>
  );
}
