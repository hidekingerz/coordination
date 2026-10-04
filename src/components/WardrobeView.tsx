import { useMemo, useState } from 'react';
import type { Category, ClothingItem } from '../types';
import { ALL_CATEGORIES, CATEGORY_LABEL } from '../types';
import { ItemCard } from './ItemCard';
import { ItemForm } from './ItemForm';
import { ImportDialog } from './ImportDialog';
import { exportJson, mergeWardrobe, type MergeMode } from '../lib/storage';
import { buildWearStats, statsFor, toDateKey, type WearLog } from '../lib/wear';
import { SAMPLE_WARDROBE } from '../data/sample';
import { brandCounts, filterWardrobe } from '../lib/filter';
import { knownBrands } from '../lib/brand';

interface Props {
  wardrobe: ClothingItem[];
  wearLog: WearLog;
  onChange: (next: ClothingItem[]) => void;
  onWear: (itemIds: string[], date: string) => void;
  onUnwear: (itemIds: string[], date: string) => void;
  onImportWearLog: (log: WearLog) => void;
}

type SortMode = 'category' | 'unworn' | 'recent';

export function WardrobeView({ wardrobe, wearLog, onChange, onWear, onUnwear, onImportWearLog }: Props) {
  const [editing, setEditing] = useState<ClothingItem | null | 'new'>(null);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [brand, setBrand] = useState<string | 'all'>('all');
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [sort, setSort] = useState<SortMode>('category');
  const [lastWear, setLastWear] = useState<{ item: ClothingItem; date: string } | null>(null);
  const today = toDateKey(new Date());
  const stats = useMemo(() => buildWearStats(wearLog, today), [wearLog, today]);

  const brands = useMemo(() => knownBrands(wardrobe), [wardrobe]);
  const brandCount = useMemo(() => brandCounts(wardrobe), [wardrobe]);
  // 選択中のブランドが削除・改名で消えたら「すべて」に戻す
  const activeBrand = brand !== 'all' && !brands.includes(brand) ? 'all' : brand;

  const visible = useMemo(() => {
    return filterWardrobe(wardrobe, { category: filter, brand: activeBrand, query })
      .sort((a, b) => {
        if (sort === 'unworn') {
          // 未着用を先頭に、あとは最後に着た日が古い順
          const da = statsFor(stats, a.id).daysSince ?? Infinity;
          const db = statsFor(stats, b.id).daysSince ?? Infinity;
          if (da !== db) return db - da;
        } else if (sort === 'recent') {
          const da = statsFor(stats, a.id).daysSince ?? Infinity;
          const db = statsFor(stats, b.id).daysSince ?? Infinity;
          if (da !== db) return da - db;
        }
        return ALL_CATEGORIES.indexOf(a.category) - ALL_CATEGORIES.indexOf(b.category);
      });
  }, [wardrobe, filter, activeBrand, query, sort, stats]);

  // 履歴が半数以上にたまるまでは「未着用」を数えない (最初はほぼ全部が未着用で案内にならない)
  const unwornCount = useMemo(() => {
    const established = wardrobe.length > 0 && wardrobe.filter((i) => stats.has(i.id)).length / wardrobe.length >= 0.5;
    return wardrobe.filter((i) => {
      const d = statsFor(stats, i.id).daysSince;
      return d === null ? established : d >= 60;
    }).length;
  }, [wardrobe, stats]);

  const wearToday = (item: ClothingItem) => {
    onWear([item.id], today);
    setLastWear({ item, date: today });
  };
  const undoWear = () => {
    if (!lastWear) return;
    onUnwear([lastWear.item.id], lastWear.date);
    setLastWear(null);
  };

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
    const blob = new Blob([exportJson(wardrobe, wearLog)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wardrobe-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyImport = (items: ClothingItem[], mode: MergeMode, importedLog?: WearLog) => {
    onChange(mergeWardrobe(wardrobe, items, mode));
    if (importedLog?.length) onImportWearLog(importedLog);
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
        <select className="sort" value={sort} onChange={(e) => setSort(e.target.value as SortMode)} title="並び順">
          <option value="category">カテゴリ順</option>
          <option value="unworn">着ていない順</option>
          <option value="recent">最近着た順</option>
        </select>
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

      {brands.length > 0 && (
        <div className="chips filter brands" aria-label="ブランドで絞り込み">
          <button type="button" className={`chip ${activeBrand === 'all' ? 'on' : ''}`} onClick={() => setBrand('all')}>
            全ブランド
          </button>
          {brands.map((b) => (
            <button
              key={b}
              type="button"
              className={`chip ${activeBrand === b ? 'on' : ''}`}
              onClick={() => setBrand(activeBrand === b ? 'all' : b)}
            >
              {b} ({brandCount[b]})
            </button>
          ))}
        </div>
      )}

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

      {wardrobe.length > 0 && unwornCount > 0 && sort !== 'unworn' && (
        <p className="hint">
          2 か月以上着ていない (または未着用の) 服が {unwornCount} 点あります。{' '}
          <button type="button" className="link" onClick={() => setSort('unworn')}>
            着ていない順に並べる
          </button>
        </p>
      )}

      {lastWear && (
        <div className="toast">
          「{lastWear.item.name}」を今日着たとして記録しました。
          <button type="button" className="link" onClick={undoWear}>
            取り消す
          </button>
          <button type="button" className="link" onClick={() => setLastWear(null)}>
            閉じる
          </button>
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
            <ItemCard
              key={item.id}
              item={item}
              onEdit={setEditing}
              onDelete={remove}
              wear={statsFor(stats, item.id)}
              onWearToday={wearToday}
            />
          ))}
        </div>
      )}
    </section>
  );
}
