import { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, ClothingItem } from '../types';
import { ALL_CATEGORIES, CATEGORY_LABEL } from '../types';
import type { Conditions } from '../lib/season';
import { filterWardrobe } from '../lib/filter';
import { fitsConditions } from '../lib/outfit';
import { compareUnworn, describeLastWorn, statsFor, type WearStatsMap } from '../lib/wear';
import { Swatch } from './Swatch';

export interface ClosetPanelProps {
  wardrobe: ClothingItem[];
  conditions: Conditions;
  /** 着用履歴があるときだけ渡す。並び替えとタイルの「3日前」表示に使う */
  wearStats?: WearStatsMap;
  /** 着たい服の id (SuggestView の mustInclude) */
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  onEdit: () => void;
  /** クローゼットが空のときの案内から呼ぶ */
  onImport: () => void;
  onLoadSample: () => void;
}

const OPEN_KEY = 'coordination.closet.open';

/** 既定は閉じる。提案を初画面に出すため、開いた人だけ次回も開いたままにする */
function loadOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
function saveOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // 保存できなくても動作には影響しない
  }
}

/**
 * メイン画面のクローゼット。カテゴリをタブにして 1 段だけ見せ、タイルを押すと「着たい服」に入る。
 * 検索と「今の条件に合う服だけ」で候補を減らし、高さ固定のグリッドの中をスクロールする。
 * 既定では「着たい服」の行だけ見せて折りたたみ、コーデ提案がすぐ下に見えるようにする。
 */
export function ClosetPanel(p: ClosetPanelProps) {
  const { wardrobe, conditions, wearStats, selected } = p;
  const [open, setOpen] = useState(loadOpen);
  const [query, setQuery] = useState('');
  const [fitOnly, setFitOnly] = useState(true);
  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    saveOpen(next);
  };

  /** 服のあるカテゴリ (ALL_CATEGORIES 順)。検索で 0 件になっても消さない */
  const categories = useMemo(() => ALL_CATEGORIES.filter((c) => wardrobe.some((i) => i.category === c)), [wardrobe]);
  const [tabState, setTab] = useState<Category | null>(null);
  // 選んでいたカテゴリの服が無くなったときも、服のある最初のカテゴリに戻す
  const tab: Category | null = tabState && categories.includes(tabState) ? tabState : (categories[0] ?? null);

  /** 検索とフィルタに合う服 (カテゴリは問わない) */
  const matches = (q: string, fit: boolean) =>
    filterWardrobe(wardrobe, { category: 'all', brand: 'all', query: q }).filter((i) => !fit || fitsConditions(i, conditions));

  const visibleAll = useMemo(() => matches(query, fitOnly), [wardrobe, conditions, query, fitOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const countOf = (items: ClothingItem[], c: Category) => items.filter((i) => i.category === c).length;
  const totals = useMemo(() => Object.fromEntries(categories.map((c) => [c, countOf(wardrobe, c)])) as Record<Category, number>, [wardrobe, categories]);

  const visible = useMemo(() => {
    const items = visibleAll.filter((i) => i.category === tab);
    return wearStats ? [...items].sort(compareUnworn(wearStats)) : items;
  }, [visibleAll, tab, wearStats]);

  /** 該当のある最初のカテゴリへタブを移す (今のタブに該当があれば動かさない) */
  const jumpIfEmpty = (items: ClothingItem[]) => {
    if (tab && countOf(items, tab) > 0) return;
    const first = categories.find((c) => countOf(items, c) > 0);
    if (first) setTab(first);
  };
  const changeQuery = (q: string) => {
    setQuery(q);
    jumpIfEmpty(matches(q, fitOnly));
  };
  const dropFilterAndJump = () => {
    setFitOnly(false);
    jumpIfEmpty(matches(query, false));
  };

  /** タブ列が右にはみ出しているか。スマホで 4 つ目以降のカテゴリが隠れていることを右端のフェードで伝える */
  const tabsRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const updateMore = () => {
    const el = tabsRef.current;
    if (el) setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };
  useEffect(() => {
    updateMore();
    const el = tabsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateMore);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, categories.length]);

  const selectedItems = selected.map((id) => wardrobe.find((i) => i.id === id)).filter((i): i is ClothingItem => Boolean(i));
  /** フィルタを外せば出てくる服の数 (全カテゴリ)。0 件表示の逃げ道に使う */
  const hiddenByFilter = fitOnly && visibleAll.length === 0 ? matches(query, false).length : 0;

  /** フィルタか検索が効いている間は全タブを「見えている数/総数」にそろえる (減っていないタブだけ形式が違うと読みにくい) */
  const narrowing = fitOnly || query.trim() !== '';
  const tabLabel = (c: Category) => {
    const shown = countOf(visibleAll, c);
    const total = totals[c];
    return `${CATEGORY_LABEL[c]} ${narrowing ? `${shown}/${total}` : total}`;
  };

  return (
    <section className="closet card" aria-label="クローゼット">
      <div className="closet-head">
        <span>着たい服:</span>
        {selectedItems.length === 0 ? (
          // 開いているときは「押せる」ことを伝える。閉じているときは短く「指定なし」
          <span className="muted">{open && wardrobe.length > 0 ? '下の服をタップすると、その服を使ったコーデを提案します' : '指定なし'}</span>
        ) : (
          selectedItems.map((i) => (
            <span key={i.id} className="must-chip" data-testid="must-chip">
              <Swatch color={i.color} size={12} /> {i.name}
              <button type="button" className="must-remove" aria-label={`${i.name} を外す`} onClick={() => p.onToggle(i.id)}>
                ×
              </button>
            </span>
          ))
        )}
        {selectedItems.length > 0 && (
          <button type="button" className="link" onClick={p.onClear}>
            すべて外す
          </button>
        )}
        {wardrobe.length > 0 && (
          <button type="button" className="link" aria-expanded={open} onClick={toggleOpen}>
            {open ? 'クローゼットを閉じる' : 'クローゼットから選ぶ'}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="link" onClick={p.onEdit}>
          クローゼットを編集 ›
        </button>
      </div>

      {wardrobe.length === 0 ? (
        <div className="empty">
          <p>まだアイテムがありません。手持ちの服を登録するか、Gist / JSON から取り込むか、サンプルデータで試してみてください。</p>
          <button type="button" className="btn" onClick={p.onImport}>
            Gist / JSON から取り込む
          </button>{' '}
          <button type="button" className="btn" onClick={p.onLoadSample}>
            サンプルデータを読み込む
          </button>{' '}
          <button type="button" className="btn" onClick={p.onEdit}>
            アイテムを追加
          </button>
        </div>
      ) : !open ? null : (
        <>
          <div className="closet-tools">
            <input className="search" placeholder="名前・ブランド・タグで検索" value={query} onChange={(e) => changeQuery(e.target.value)} />
            <button type="button" className={`chip toggle ${fitOnly ? 'on' : ''}`} aria-pressed={fitOnly} onClick={() => setFitOnly((v) => !v)}>
              今の条件に合う服だけ
            </button>
            {wearStats && (
              <span className="closet-order muted" title="未着用を先頭に、最後に着た日が古い順。「今日着た」を押すと並びが変わります">
                着ていない順
              </span>
            )}
          </div>
          <div className="closet-tabs-wrap" data-more={moreRight}>
            <div className="closet-tabs" role="tablist" aria-label="カテゴリ" ref={tabsRef} onScroll={updateMore}>
              {categories.map((c) => (
                <button key={c} type="button" role="tab" className="closet-tab" aria-selected={tab === c} onClick={() => setTab(c)}>
                  {tabLabel(c)}
                </button>
              ))}
            </div>
          </div>
          {visible.length === 0 ? (
            <p className="muted">
              条件に合う服がありません。
              {hiddenByFilter > 0 && (
                <>
                  {' '}
                  <button type="button" className="link" onClick={dropFilterAndJump}>
                    「今の条件に合う服だけ」を外すと {hiddenByFilter} 点
                  </button>
                </>
              )}
            </p>
          ) : (
            <div className="closet-grid">
              {visible.map((item) => {
                const on = selected.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="closet-tile"
                    aria-pressed={on}
                    aria-label={`${item.name} を${on ? '選択解除' : '選択'}`}
                    title={item.name}
                    onClick={() => p.onToggle(item.id)}
                  >
                    <span className="item-visual" style={{ background: item.color }}>
                      {item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}
                    </span>
                    <strong className="tile-name">{item.name}</strong>
                    {wearStats && <span className="wear">{describeLastWorn(statsFor(wearStats, item.id))}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
