import { useMemo, useState } from 'react';
import type { Category, ClothingItem } from '../types';
import { ALL_CATEGORIES, CATEGORY_LABEL } from '../types';
import { ItemCard } from './ItemCard';
import { ItemForm } from './ItemForm';
import { ImportDialog } from './ImportDialog';
import { exportJson, mergeWardrobe, type MergeMode } from '../lib/storage';
import { SAMPLE_WARDROBE } from '../data/sample';

interface Props {
  wardrobe: ClothingItem[];
  onChange: (next: ClothingItem[]) => void;
}

export function WardrobeView({ wardrobe, onChange }: Props) {
  const [editing, setEditing] = useState<ClothingItem | null | 'new'>(null);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return wardrobe
      .filter((i) => filter === 'all' || i.category === filter)
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          (i.brand?.toLowerCase().includes(q) ?? false) ||
          i.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => ALL_CATEGORIES.indexOf(a.category) - ALL_CATEGORIES.indexOf(b.category));
  }, [wardrobe, filter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of wardrobe) c[i.category] = (c[i.category] ?? 0) + 1;
    return c;
  }, [wardrobe]);

  const upsert = (item: ClothingItem) => {
    const exists = wardrobe.some((i) => i.id === item.id);
    onChange(exists ? wardrobe.map((i) => (i.id === item.id ? item : i)) : [...wardrobe, item]);
    setEditing(null);
  };

  const remove = (item: ClothingItem) => {
    if (confirm(`「${item.name}」を削除しますか？`)) onChange(wardrobe.filter((i) => i.id !== item.id));
  };

  const download = () => {
    const blob = new Blob([exportJson(wardrobe)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wardrobe-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyImport = (items: ClothingItem[], mode: MergeMode) => {
    onChange(mergeWardrobe(wardrobe, items, mode));
    setImporting(false);
  };

  return (
    <section className="wardrobe">
      <div className="toolbar">
        <button type="button" className="btn primary" onClick={() => setEditing('new')}>
          ＋ アイテムを追加
        </button>
        <input
          className="search"
          placeholder="名前・ブランド・タグで検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="spacer" />
        <button type="button" className="btn" onClick={download} disabled={!wardrobe.length}>
          エクスポート
        </button>
        <button type="button" className="btn" onClick={() => setImporting(true)}>
          インポート
        </button>
      </div>

      <div className="chips filter">
        <button type="button" className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          すべて ({wardrobe.length})
        </button>
        {ALL_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip ${filter === c ? 'on' : ''}`}
            onClick={() => setFilter(c)}
          >
            {CATEGORY_LABEL[c]} ({counts[c] ?? 0})
          </button>
        ))}
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <ItemForm
              initial={editing === 'new' ? undefined : editing}
              wardrobe={wardrobe}
              onSubmit={upsert}
              onCancel={() => setEditing(null)}
            />
          </div>
        </div>
      )}

      {importing && (
        <div className="modal-backdrop" onClick={() => setImporting(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <ImportDialog existingCount={wardrobe.length} onApply={applyImport} onClose={() => setImporting(false)} />
          </div>
        </div>
      )}

      {wardrobe.length === 0 ? (
        <div className="empty">
          <p>まだアイテムがありません。手持ちの服を登録するか、Gist / JSON から取り込むか、サンプルデータで試してみてください。</p>
          <button type="button" className="btn" onClick={() => setImporting(true)}>
            Gist / JSON から取り込む
          </button>{' '}
          <button type="button" className="btn" onClick={() => onChange(SAMPLE_WARDROBE)}>
            サンプルデータを読み込む
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="muted">条件に合うアイテムがありません。</p>
      ) : (
        <div className="grid">
          {visible.map((item) => (
            <ItemCard key={item.id} item={item} onEdit={setEditing} onDelete={remove} />
          ))}
        </div>
      )}
    </section>
  );
}
