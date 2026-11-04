import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, ClothingItem } from '../types';
import { ALL_CATEGORIES, CATEGORY_LABEL } from '../types';
import { filterWardrobe } from '../lib/filter';
import { colorLabel } from '../lib/color';
import { Swatch } from './Swatch';

interface Props {
  wardrobe: ClothingItem[];
  /** 開いた時点で選択されているアイテム id */
  selected: string[];
  /** 「決定」で確定した全体のリストを返す。選んでいる途中では呼ばれない */
  onChange: (ids: string[]) => void;
  /** 閉じる (決定・キャンセル・Escape・背景クリックのいずれでも呼ばれる) */
  onClose: () => void;
}

/**
 * 「このアイテムを着たい」の選択画面。
 * クローゼットと同じカードを検索・カテゴリで絞り込みながら、タップで複数選べる。
 * 選択はダイアログ内の下書きとして持ち、「決定」を押したときだけ親に渡す
 * (選ぶたびに裏で提案を計算し直さないため)。決定せずに閉じると下書きは捨てる。
 */
export function ItemPicker({ wardrobe, selected: initial, onChange, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [selected, setSelected] = useState<string[]>(initial);
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

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const commit = () => {
    onChange(selected);
    onClose();
  };

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
            <button type="button" className="btn" onClick={() => setSelected([])}>
              すべて外す
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn primary" onClick={commit}>
            決定
          </button>
        </div>
      </div>
    </div>
  );
}
