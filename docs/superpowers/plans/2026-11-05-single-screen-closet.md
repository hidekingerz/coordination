# クローゼットとコーデ提案の 1 画面化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** タブを無くし、条件バー → クローゼット (タブ付きグリッド) → コーデ提案を 1 画面にして、服を押すとその服入りの提案がすぐ出るようにする。編集は別画面に移す。

**Architecture:** 新しい `ClosetPanel` 部品が「着たい服」の選択 UI になり、`SuggestView` が持つ既存の `mustInclude` state をトグルする (再計算は既存のデバウンス処理のまま)。`SuggestConditions` から折りたたみと `ItemPicker` を取り除き常時表示にする。`App` はタブの代わりに `view: 'main' | 'edit'` を持ち、`SuggestView` は `hidden` で隠して条件を保つ。

**Tech Stack:** Vite + React 18 + TypeScript、Vitest + jsdom + @testing-library/react。スタイルは `src/styles.css` の既存 CSS 変数。

**Spec:** `docs/superpowers/specs/2026-11-05-single-screen-closet-design.md`

## Global Constraints

- 提案ロジック (`src/lib/outfit.ts` の `suggestOutfits` / `scoreOutfit` / `pickDiverse`) は変えない。`fitsConditions` の追加のみ。
- 提案カード (`OutfitCard`, `OutfitFigure`) と編集画面 (`WardrobeView`) の機能・見た目は変えない (`onBack` の追加と並び替え関数の差し替えのみ)。
- 既存のテスト ID・クラス名を維持: `data-testid="cond-status"`, `data-testid="must-chip"`, `.must-chip`, `.must-remove`, `.outfits` + `aria-busy`, placeholder `例: 18`, 地点ボタン `地点を変える`。
- 文言 (仕様で固定): 「今の条件に合う服だけ」「クローゼットを編集 ›」「← コーデ提案に戻る」「気温を変える」「予報に戻す」「すべて外す」「指定なし」「条件に合う服がありません。」「『今の条件に合う服だけ』を外すと N 点」「予報を取得できませんでした。気温を入力してください」。タブ件数は「トップス 14/45」(減っているとき) / 「トップス 45」(減っていないとき)。
- `wardrobe-import.json`, `myCloth/`, `.superpowers/` はコミットしない。
- 各タスクの最後に `npm test` と `npm run typecheck` が通ること。
- コミットメッセージは日本語。末尾に次を付ける:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_01ByoMjmCWJUtoDaAbY9nEdx`。

## Review Focus

- 編集画面で「着たい服」に入っている服を削除して戻ったとき、チップに幽霊が残らない → Task 7 のテスト。
- 検索語の前後の空白と大文字小文字 (「 ローファー 」「tシャツ」) でも一致する → Task 3 のテスト。
- カテゴリが 1 つしか無いクローゼット (トップスだけ) でもタブが 1 つ出て壊れない → Task 3 のテスト。
- 150 点のクローゼットで全タイルが描画され、タブ件数が正しい (仮想化しない) → Task 3 のテスト。
- タイルを続けて 2 回押しても 2 つともチップに入り、再計算が 1 回にまとまる (既存のデバウンス) → Task 4 のテスト。

---

### Task 0: ブランチと設計書のコミット

**Files:**
- Modify: `.gitignore` (作業ツリーに未コミットの `.superpowers/` 追加がある)
- Commit: `docs/superpowers/specs/2026-11-05-single-screen-closet-design.md`, `docs/superpowers/plans/2026-11-05-single-screen-closet.md`

- [ ] **Step 1: ブランチを切る**

Run: `git checkout -b feat/single-screen-closet`

- [ ] **Step 2: `.gitignore` と設計書・計画書をコミット**

```bash
git add .gitignore docs/superpowers
git commit -m "クローゼットとコーデ提案の 1 画面化の設計書と計画を追加"
```

---

### Task 1: `fitsConditions` (季節で「今の条件に合う」判定)

**Files:**
- Modify: `src/lib/outfit.ts` (`seasonFit` の直後)
- Test: `src/lib/outfit.test.ts`

**Interfaces:**
- Produces: `export function fitsConditions(item: ClothingItem, c: Conditions): boolean` — `seasonFit(item, c) > 0` と同値。服の `seasons` に `c.season` か `c.acceptableSeasons` のいずれかが含まれれば true。

- [ ] **Step 1: 失敗するテストを書く** (`src/lib/outfit.test.ts` 末尾に追記)

```ts
describe('fitsConditions', () => {
  const winterMid = buildConditions(new Date('2026-01-15T12:00:00')); // 冬のまん中: acceptableSeasons は winter だけ
  const earlyMarch = buildConditions(new Date('2026-03-05T12:00:00')); // 春の初め: winter も候補
  const mk = (seasons: Season[]): ClothingItem => ({ id: 'x', name: 'x', category: 'tops', color: '#000', seasons, warmth: 3, formality: 'casual', tags: [], createdAt: '' });

  it('accepts an item for the current season', () => {
    expect(fitsConditions(mk(['winter']), winterMid)).toBe(true);
  });
  it('accepts an item that only matches a neighbouring acceptable season', () => {
    expect(fitsConditions(mk(['winter']), earlyMarch)).toBe(true);
  });
  it('rejects an item with no acceptable season', () => {
    expect(fitsConditions(mk(['summer']), winterMid)).toBe(false);
    expect(fitsConditions(mk(['summer']), earlyMarch)).toBe(false);
  });
});
```

`Season` 型と `buildConditions`、`fitsConditions` を import に足す。

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/lib/outfit.test.ts -t fitsConditions`
Expected: FAIL (`fitsConditions` is not a function / export が無い)

- [ ] **Step 3: `fitsConditions` を実装** (`src/lib/outfit.ts`、`seasonFit` の直後に export。JSDoc に「クローゼットの『今の条件に合う服だけ』フィルタの判定」と書く)

- [ ] **Step 4: 通ることを確認**

Run: `npx vitest run src/lib/outfit.test.ts`
Expected: PASS (既存テストも含め全件)

- [ ] **Step 5: コミット**

```bash
git add src/lib/outfit.ts src/lib/outfit.test.ts
git commit -m "季節で「今の条件に合う服」を判定する fitsConditions を追加"
```

---

### Task 2: `compareUnworn` (最近着ていない順の比較関数)

**Files:**
- Modify: `src/lib/wear.ts` (`statsFor` の直後)
- Modify: `src/components/WardrobeView.tsx:38-52` (`sort === 'unworn'` の分岐を置き換え)
- Test: `src/lib/wear.test.ts`

**Interfaces:**
- Produces: `export function compareUnworn(stats: WearStatsMap): (a: ClothingItem, b: ClothingItem) => number` — 未着用 (`daysSince === null`) を先頭、次に `daysSince` が大きい順。同点は 0 (安定ソートで配列順が残る)。

- [ ] **Step 1: 失敗するテストを書く** (`src/lib/wear.test.ts` 末尾に追記)

```ts
describe('compareUnworn', () => {
  const mk = (id: string): ClothingItem => ({ id, name: id, category: 'tops', color: '#000', seasons: ['winter'], warmth: 3, formality: 'casual', tags: [], createdAt: '' });
  const items = [mk('worn-1d'), mk('never-a'), mk('worn-14d'), mk('never-b')];
  const stats = buildWearStats(
    [{ itemId: 'worn-1d', date: '2026-01-14' }, { itemId: 'worn-14d', date: '2026-01-01' }],
    '2026-01-15',
  );

  it('puts never-worn items first, then the longest-unworn, keeping array order on ties', () => {
    const sorted = [...items].sort(compareUnworn(stats));
    expect(sorted.map((i) => i.id)).toEqual(['never-a', 'never-b', 'worn-14d', 'worn-1d']);
  });

  it('returns 0 for two never-worn items so callers can add their own tie-break', () => {
    expect(compareUnworn(stats)(mk('p'), mk('q'))).toBe(0);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/lib/wear.test.ts -t compareUnworn`
Expected: FAIL (`compareUnworn` が export されていない)

- [ ] **Step 3: `compareUnworn` を実装** (`src/lib/wear.ts`)。`WardrobeView` の `sort === 'unworn'` 分岐を `const u = compareUnworn(stats)(a, b); if (u !== 0) return u;` に置き換え、カテゴリ順の tie-break はそのまま残す。`recent` 分岐は触らない。

- [ ] **Step 4: 通ることを確認**

Run: `npm test`
Expected: PASS (全件。`WardrobeView` の並びは規則が同じなので既存テストは変わらない)

- [ ] **Step 5: コミット**

```bash
git add src/lib/wear.ts src/lib/wear.test.ts src/components/WardrobeView.tsx
git commit -m "「最近着ていない順」の比較関数 compareUnworn を切り出す"
```

---

### Task 3: `ClosetPanel` 部品

**Files:**
- Create: `src/components/ClosetPanel.tsx`
- Modify: `src/styles.css` (末尾に `.closet*` を追加、600px 以下の指定も)
- Test: `src/components/ClosetPanel.test.tsx`

**Interfaces:**
- Consumes: `fitsConditions` (Task 1), `compareUnworn` (Task 2), `filterWardrobe` (`src/lib/filter.ts`), `describeLastWorn` / `statsFor` (`src/lib/wear.ts`), `Swatch`, `CATEGORY_LABEL` / `ALL_CATEGORIES` (`src/types.ts`)
- Produces:

```ts
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
export function ClosetPanel(p: ClosetPanelProps): JSX.Element
```

DOM の約束 (テストと CSS が依存する):
- ルート: `<section className="closet card" aria-label="クローゼット">`
- ヘッダー: 「着たい服:」+ チップ (`span.must-chip[data-testid=must-chip]` に `Swatch` + 名前 + `button.must-remove[aria-label="<名前> を外す"]`)、0 点なら `span.muted` の「指定なし」、1 点以上なら `button.link` 「すべて外す」。右端に `button.link` 「クローゼットを編集 ›」。
- 検索: `input.search[placeholder="名前・ブランド・タグで検索"]`。
- フィルタ: `button.chip[aria-pressed]` 「今の条件に合う服だけ」。初期 `aria-pressed="true"`。
- タブ: `div.closet-tabs[role=tablist]` の中に `button.closet-tab[role=tab][aria-selected]`。服のあるカテゴリだけ `ALL_CATEGORIES` 順。ラベルは `${CATEGORY_LABEL[c]} ${shown}/${total}` (shown < total のとき) または `${CATEGORY_LABEL[c]} ${total}`。
- グリッド: `div.closet-grid` の中に `button.closet-tile[aria-pressed][aria-label="<名前> を選択" | "<名前> を選択解除"]`。中身は `span.item-visual` (背景色 + `img alt=""`)、`strong` 名前、`wearStats` があれば `span.wear` に `describeLastWorn`。
- 0 件: `p.muted` 「条件に合う服がありません。」。フィルタをオフにすれば出る服が全カテゴリ合わせて N 点あれば続けて `button.link` 「『今の条件に合う服だけ』を外すと N 点」。押すとフィルタをオフにし、該当のある最初のカテゴリへタブを移す (検索の自動移動と同じ規則。チップのトグルだけでは移らない)。
- 空のクローゼット: `div.empty` に「まだアイテムがありません。手持ちの服を登録するか、Gist / JSON から取り込むか、サンプルデータで試してみてください。」と `button.btn` 3 つ「Gist / JSON から取り込む」「サンプルデータを読み込む」「アイテムを追加」(それぞれ `onImport`, `onLoadSample`, `onEdit`)。検索・タブ・グリッドは出さない。

内部の決め事:
- 「見える服」= `filterWardrobe(wardrobe, { category: tab, brand: 'all', query })` に、フィルタがオンなら `fitsConditions` を AND。タブ件数も同じ規則 (カテゴリだけ変えて数える)。
- 並び: `wearStats` があれば `compareUnworn(wearStats)` で安定ソート。無ければ配列順。
- タブの初期値: 服のある最初のカテゴリ。選んでいたカテゴリの服が 0 点になった (削除された) ときも同じ規則で先頭に戻す。
- 検索欄の onChange で、新しい検索語での現在タブの件数が 0 かつ他に 1 点以上あるカテゴリがあれば、その最初のカテゴリへ `setTab`。フィルタのトグルでは移さない。
- 選択中の服はフィルタ・検索・タブに関係なくチップに出す (`wardrobe` に存在するものだけ)。

- [ ] **Step 1: 失敗するテストを書く** (`src/components/ClosetPanel.test.tsx`)

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ClosetPanel, type ClosetPanelProps } from './ClosetPanel';
import { SAMPLE_WARDROBE } from '../data/sample';
import { buildConditions } from '../lib/season';
import { buildWearStats } from '../lib/wear';
import type { ClothingItem } from '../types';

afterEach(cleanup);

const winter = buildConditions(new Date('2026-01-15T12:00:00')); // acceptableSeasons = ['winter']

function renderPanel(over: Partial<ClosetPanelProps> = {}) {
  const props: ClosetPanelProps = {
    wardrobe: SAMPLE_WARDROBE, conditions: winter, selected: [],
    onToggle: vi.fn(), onClear: vi.fn(), onEdit: vi.fn(), onImport: vi.fn(), onLoadSample: vi.fn(), ...over,
  };
  render(<ClosetPanel {...props} />);
  return props;
}
const tabs = () => screen.getAllByRole('tab').map((t) => t.textContent);
const tiles = () => screen.queryAllByRole('button', { name: /を選択/ }).map((b) => b.getAttribute('aria-label'));
const filterChip = () => screen.getByRole('button', { name: '今の条件に合う服だけ' });
const search = () => screen.getByPlaceholderText('名前・ブランド・タグで検索');

describe('ClosetPanel tabs and filter', () => {
  it('shows one tab per non-empty category with filtered/total counts, filter on by default', () => {
    renderPanel();
    expect(filterChip().getAttribute('aria-pressed')).toBe('true');
    expect(tabs()).toEqual(['アウター 3/5', 'トップス 3/9', 'ボトムス 3/6', 'ワンピース / セットアップ 1', 'シューズ 3/5', '小物 3/4']);
    expect(screen.getByRole('tab', { name: 'アウター 3/5' }).getAttribute('aria-selected')).toBe('true');
    expect(tiles()).toEqual(['ネイビーのステンカラーコート を選択', 'ブラックのダウンジャケット を選択', 'グレーのカーディガン を選択']);
  });

  it('shows every item when the filter is switched off', () => {
    renderPanel();
    fireEvent.click(filterChip());
    expect(filterChip().getAttribute('aria-pressed')).toBe('false');
    expect(tabs()[0]).toBe('アウター 5');
    expect(tiles()).toHaveLength(5);
  });

  it('switches tab on click', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'シューズ 3/5' }));
    expect(tiles()).toEqual(['白のレザースニーカー を選択', 'ブラックのローファー を選択', 'ブラウンのブーツ を選択']);
  });

  it('shows a single tab and no crash for a one-category wardrobe', () => {
    renderPanel({ wardrobe: SAMPLE_WARDROBE.filter((i) => i.category === 'tops') });
    expect(tabs()).toEqual(['トップス 3/9']);
    expect(tiles()).toHaveLength(3);
  });

  it('renders all tiles of a 150-item wardrobe without virtualisation', () => {
    const big: ClothingItem[] = [];
    const per = { outer: 20, tops: 45, bottoms: 30, shoes: 20, accessory: 35 } as const;
    for (const [cat, n] of Object.entries(per)) for (let k = 0; k < n; k++) big.push({ ...SAMPLE_WARDROBE[0], id: `${cat}-${k}`, name: `${cat} ${k}`, category: cat as ClothingItem['category'] });
    renderPanel({ wardrobe: big });
    expect(tabs()).toEqual(['アウター 20', 'トップス 45', 'ボトムス 30', 'シューズ 20', '小物 35']);
    fireEvent.click(screen.getByRole('tab', { name: 'トップス 45' }));
    expect(document.querySelectorAll('.closet-grid .closet-tile')).toHaveLength(45);
  });
});

describe('ClosetPanel search', () => {
  // タブは wardrobe にそのカテゴリの服があれば出す。検索で 0 件になっても消えない (件数が 0/N になるだけ)
  it('updates every tab count and jumps to the first category that still has matches', () => {
    renderPanel();
    fireEvent.change(search(), { target: { value: 'ローファー' } });
    expect(tabs()).toEqual(['アウター 0/5', 'トップス 0/9', 'ボトムス 0/6', 'ワンピース / セットアップ 0/1', 'シューズ 1/5', '小物 0/4']);
    expect(screen.getByRole('tab', { name: 'シューズ 1/5' }).getAttribute('aria-selected')).toBe('true');
    expect(tiles()).toEqual(['ブラックのローファー を選択']);
  });

  it('ignores surrounding whitespace and letter case', () => {
    renderPanel();
    fireEvent.click(filterChip()); // T シャツは冬物でないので先にフィルタを外す
    fireEvent.change(search(), { target: { value: '  tシャツ ' } });
    expect(screen.getByRole('tab', { name: 'トップス 2/9' }).getAttribute('aria-selected')).toBe('true');
    expect(tiles()).toEqual(['白の無地Tシャツ を選択', 'ブラックのTシャツ を選択']);
  });

  it('shows the empty message with an escape hatch when only the filter hides matches', () => {
    renderPanel();
    fireEvent.change(search(), { target: { value: 'サンダル' } });
    expect(screen.getByText('条件に合う服がありません。')).toBeTruthy();
    // 逃げ道のリンクはフィルタを外した上で、該当のある最初のカテゴリへ移る
    fireEvent.click(screen.getByRole('button', { name: '「今の条件に合う服だけ」を外すと 1 点' }));
    expect(filterChip().getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('tab', { name: 'シューズ 1/5' }).getAttribute('aria-selected')).toBe('true');
    expect(tiles()).toEqual(['ブラックのサンダル を選択']);
  });
});

describe('ClosetPanel selection', () => {
  it('calls onToggle with the item id and marks selected tiles pressed', () => {
    const p = renderPanel({ selected: ['s-outer-2'] });
    expect(screen.getByRole('button', { name: 'ブラックのダウンジャケット を選択解除' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'ネイビーのステンカラーコート を選択' }));
    expect(p.onToggle).toHaveBeenCalledWith('s-outer-1');
  });

  it('keeps selected items as chips even when the filter hides them, and clears with すべて外す', () => {
    const p = renderPanel({ selected: ['s-tops-1'] }); // 夏物: 冬のフィルタでは見えない
    const chips = screen.getAllByTestId('must-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain('白の無地Tシャツ');
    fireEvent.click(screen.getByRole('tab', { name: /トップス/ }));
    expect(tiles()).not.toContain('白の無地Tシャツ を選択解除');
    fireEvent.click(within(chips[0]).getByRole('button', { name: '白の無地Tシャツ を外す' }));
    expect(p.onToggle).toHaveBeenCalledWith('s-tops-1');
    fireEvent.click(screen.getByRole('button', { name: 'すべて外す' }));
    expect(p.onClear).toHaveBeenCalled();
  });

  it('shows 指定なし and no clear button when nothing is selected', () => {
    renderPanel();
    expect(screen.getByText('指定なし')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'すべて外す' })).toBeNull();
  });
});

describe('ClosetPanel order', () => {
  it('orders never-worn first, then longest unworn, and shows the wear label', () => {
    const stats = buildWearStats([{ itemId: 's-tops-5', date: '2026-01-14' }, { itemId: 's-tops-6', date: '2026-01-01' }], '2026-01-15');
    renderPanel({ wearStats: stats });
    fireEvent.click(screen.getByRole('tab', { name: /トップス/ }));
    expect(tiles()).toEqual(['ネイビーのタートルネック を選択', 'グレーのスウェット を選択', 'ボルドーのニット を選択']);
    expect(screen.getByRole('button', { name: 'ボルドーのニット を選択' }).textContent).toContain('昨日着た');
  });
});

describe('ClosetPanel empty wardrobe', () => {
  it('shows the guidance and three actions instead of tabs', () => {
    const p = renderPanel({ wardrobe: [] });
    expect(screen.getByText(/まだアイテムがありません/)).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Gist / JSON から取り込む' }));
    fireEvent.click(screen.getByRole('button', { name: 'サンプルデータを読み込む' }));
    fireEvent.click(screen.getByRole('button', { name: 'アイテムを追加' }));
    expect(p.onImport).toHaveBeenCalled();
    expect(p.onLoadSample).toHaveBeenCalled();
    expect(p.onEdit).toHaveBeenCalled();
  });

  it('routes クローゼットを編集 to onEdit', () => {
    const p = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'クローゼットを編集 ›' }));
    expect(p.onEdit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/ClosetPanel.test.tsx`
Expected: FAIL (モジュール `./ClosetPanel` が無い)

- [ ] **Step 3: `ClosetPanel` を実装** (`src/components/ClosetPanel.tsx`、上の DOM の約束と内部の決め事どおり。state は `tab`, `query`, `fitOnly` の 3 つ)

- [ ] **Step 4: CSS を追加** (`src/styles.css` 末尾)

```css
/* クローゼット (メイン画面) */
.closet { margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
.closet-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.closet-head .spacer { flex: 1; }
.closet-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.closet-tools .search { flex: 1; min-width: 160px; }
.closet-tabs { display: flex; gap: 4px; overflow-x: auto; white-space: nowrap; border-bottom: 1px solid var(--border); }
.closet-tab { background: none; border: none; border-bottom: 2px solid transparent; padding: 6px 10px; color: var(--muted); cursor: pointer; font: inherit; font-size: 0.9rem; }
.closet-tab[aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
.closet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; max-height: 240px; overflow-y: auto; padding: 2px; }
.closet-tile { display: flex; flex-direction: column; gap: 4px; text-align: left; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 6px; cursor: pointer; color: var(--text); font: inherit; font-size: 0.8rem; }
.closet-tile:hover { border-color: var(--accent); }
.closet-tile[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent) inset; }
.closet-tile .item-visual { flex: none; width: 100%; height: 56px; }
.closet-tile strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.closet-tile .wear { color: var(--muted); font-size: 0.75rem; }
@media (max-width: 600px) {
  .closet-grid { grid-template-columns: repeat(3, 1fr); max-height: 300px; }
}
```

- [ ] **Step 5: 通ることを確認**

Run: `npx vitest run src/components/ClosetPanel.test.tsx && npm run typecheck`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/components/ClosetPanel.tsx src/components/ClosetPanel.test.tsx src/styles.css
git commit -m "タブ付きグリッドで着たい服を選ぶ ClosetPanel を追加"
```

---

### Task 4: `SuggestView` に `ClosetPanel` を組み込み、`ItemPicker` を廃止

**Files:**
- Modify: `src/components/SuggestView.tsx` (条件バーの直後に `ClosetPanel`。props に `onEdit` 追加)
- Modify: `src/components/SuggestConditions.tsx` (「このアイテムを着たい」の `cond-field`、`mustItems`、`picking` state、`ItemPicker` import、props `mustInclude` / `onChangeMustInclude` / `wardrobe` を削除。`overrides` の計算から must の項を外す)
- Delete: `src/components/ItemPicker.tsx`, `src/components/ItemPicker.test.tsx`
- Modify: `src/styles.css` (`.modal.picker` 〜 `.picker-check` の 12 行を削除)
- Modify: `src/App.tsx` (`SuggestView` に `onEdit={() => {}}` を一時的に渡す。Task 7 で本物にする)
- Test: `src/components/SuggestView.test.tsx`, `src/components/SuggestView.ux.test.tsx`

**Interfaces:**
- Consumes: `ClosetPanel` (Task 3)
- Produces: `SuggestView` props に `onEdit: () => void` を追加。`ClosetPanel` へは `selected={mustInclude}`, `onToggle={(id) => setMustInclude((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])}`, `onClear={() => setMustInclude([])}`, `wearStats={wearLog.length ? wearStats : undefined}`, `conditions`。`onImport` / `onLoadSample` は Task 6 まで no-op (`() => {}`)。

- [ ] **Step 1: 既存テストを新しい操作に書き換える**

`src/components/SuggestView.test.tsx`:
- `renderView` と各 `render(<SuggestView …/>)` に `onEdit={() => {}}` を足す。
- describe `SuggestView must-include picker` を次に置き換え:

```tsx
describe('SuggestView closet tiles', () => {
  it('adds a tile to the chips and the suggestions when pressed, and removes it from the chip', async () => {
    getForecast.mockResolvedValue({ max: 20, min: 12 });
    const { SAMPLE_WARDROBE } = await import('../data/sample');
    render(<SuggestView wardrobe={SAMPLE_WARDROBE} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} />);
    await waitFor(() => expect(tempInput().value).toBe('20'));
    expect(screen.queryByRole('button', { name: 'アイテムを選ぶ' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '今の条件に合う服だけ' })); // 季節に左右されないよう全件表示
    fireEvent.click(screen.getByRole('tab', { name: /トップス/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ライトブルーのオックスフォードシャツ を選択' }));
    fireEvent.click(screen.getByRole('tab', { name: /シューズ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ブラックのローファー を選択' }));

    const chips = screen.getAllByTestId('must-chip');
    expect(chips.map((c) => c.textContent)).toEqual([expect.stringContaining('オックスフォードシャツ'), expect.stringContaining('ローファー')]);
    await waitFor(() => expect(document.querySelector('.outfits')?.getAttribute('aria-busy')).toBe('false'));
    const outfits = screen.getAllByRole('article');
    expect(outfits.length).toBeGreaterThan(0);
    for (const o of outfits) {
      expect(within(o).getAllByText(/オックスフォードシャツ/).length).toBeGreaterThan(0);
      expect(within(o).getAllByText(/ブラックのローファー/).length).toBeGreaterThan(0);
    }
    fireEvent.click(within(chips[1]).getByRole('button', { name: /外す/ }));
    expect(screen.getAllByTestId('must-chip')).toHaveLength(1);
  });

  it('recomputes right after a tile is pressed, and two quick presses both land', async () => {
    getForecast.mockResolvedValue({ max: 20, min: 12 });
    const { SAMPLE_WARDROBE } = await import('../data/sample');
    render(<SuggestView wardrobe={SAMPLE_WARDROBE} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} />);
    await waitFor(() => expect(tempInput().value).toBe('20'));
    await screen.findAllByRole('article');
    fireEvent.click(screen.getByRole('button', { name: '今の条件に合う服だけ' }));
    fireEvent.click(screen.getByRole('tab', { name: /トップス/ }));
    fireEvent.click(screen.getByRole('button', { name: '白の無地Tシャツ を選択' }));
    expect(document.querySelector('.outfits')?.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'グレーのスウェット を選択' }));
    expect(screen.getAllByTestId('must-chip')).toHaveLength(2);
    await waitFor(() => expect(document.querySelector('.outfits')?.getAttribute('aria-busy')).toBe('false'));
  });
});
```

- describe `SuggestView must-include picker does not search until 決定` は削除 (仕様が逆になった)。
- describe `SuggestView must-include conflicts` の中の `ensureMore(); … 決定` 5 行を、フィルタを外し → トップスタブ → 「白の無地Tシャツ を選択」「ブラックのTシャツ を選択」を押す形に置き換える。

`src/components/SuggestView.ux.test.tsx`:
- `renderView` に `onEdit={() => {}}` を足す。
- `expands the fine-tuning panel and counts active overrides in the toggle` の中の「アイテムを選ぶ … 決定 … (2)」の 4 行を削除し、`(1)` の確認までにする (折りたたみ自体は Task 5 で消す)。

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/SuggestView.test.tsx src/components/SuggestView.ux.test.tsx`
Expected: FAIL (`tab` ロールや「〜 を選択」ボタンが無い)

- [ ] **Step 3: 組み込みと削除を実装**

`SuggestView`: `<SuggestConditions …/>` の直後に `<ClosetPanel …/>`。`wardrobe.length === 0` のときの「先にクローゼットへ…」は Task 6 で消すので今は残す。`SuggestConditions` から must 関連を外す。`ItemPicker` の 2 ファイルと CSS を削除。`App.tsx` に `onEdit={() => {}}`。

- [ ] **Step 4: 通ることを確認**

Run: `npm test && npm run typecheck`
Expected: PASS。`ItemPicker.test.tsx` が無くなるのでテスト数は減る。

- [ ] **Step 5: コミット**

```bash
git add -A src/components src/App.tsx src/styles.css
git commit -m "クローゼットのタイルから着たい服を選べるようにし、ItemPicker を廃止"
```

---

### Task 5: 条件バーの折りたたみを無くす

**Files:**
- Modify: `src/components/SuggestConditions.tsx`
- Test: `src/components/SuggestView.test.tsx`, `src/components/SuggestView.ux.test.tsx`

**Interfaces:**
- `SuggestConditions` の props は変えない (`hasWearLog`, 気温, 鮮度はそのまま)。
- DOM: `button.link[aria-expanded]` 「気温を変える」(ステータス行 `cond-status` の中、予報テキストの直後)。押すと `div.temp-row` (既存の数値入力 + 「予報に戻す」) がステータス行の下に出る。`tempIsManual` が true、`forecast.status` が `'error'` か `'unavailable'` のときは最初から開いている (state の初期値ではなく、`open || tempIsManual || forecast.status === 'error' || forecast.status === 'unavailable'` で表示を決める)。鮮度セグメントは `hasWearLog` のとき `cond-top` の 3 番目の `cond-field` として常時表示。「条件を絞る」ボタン、`cond-more`、`overrides` を削除。エラー文言を「予報を取得できませんでした。気温を入力してください」に変更。

- [ ] **Step 1: テストを書き換える**

`SuggestView.test.tsx`:
- `ensureMore` を削除し、`tempInput` を次にする:

```tsx
const tempInput = () => {
  const existing = screen.queryByPlaceholderText('例: 18') as HTMLInputElement | null;
  if (existing) return existing;
  fireEvent.click(screen.getByRole('button', { name: '気温を変える' }));
  return screen.getByPlaceholderText('例: 18') as HTMLInputElement;
};
```

- `shows an error note and leaves the field empty when the fetch fails`: `await screen.findByText(/予報を取得できませんでした。気温を入力してください/)` にし、続けて `expect((screen.getByPlaceholderText('例: 18') as HTMLInputElement).value).toBe('')` (クリックせずに出ていること)。

`SuggestView.ux.test.tsx` の describe `two-tier conditions` を `always-visible conditions` に改名し、中を次にする (地点のテストはそのまま残す):

```tsx
  it('shows the status line and keeps the temperature input behind 気温を変える, with no fold', async () => {
    renderView();
    await screen.findByText(/最高 20℃ \/ 最低 12℃/);
    const status = screen.getByTestId('cond-status');
    expect(status.textContent).toContain('東京');
    expect(status.textContent).toMatch(/目安の厚さ: 3/);
    expect(screen.queryByRole('button', { name: /条件を絞る/ })).toBeNull();
    expect(screen.queryByPlaceholderText('例: 18')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '気温を変える' }));
    const temp = screen.getByPlaceholderText('例: 18') as HTMLInputElement;
    expect(temp.value).toBe('20');
    fireEvent.change(temp, { target: { value: '12' } });
    expect(status.textContent).toContain('12℃ (手入力)');
    fireEvent.click(screen.getByRole('button', { name: '予報に戻す' }));
    expect((screen.getByPlaceholderText('例: 18') as HTMLInputElement).value).toBe('20');
    expect(screen.queryByRole('button', { name: '予報に戻す' })).toBeNull();
  });

  it('opens the temperature input by itself when the forecast is unavailable', async () => {
    getForecast.mockRejectedValue(new Error('offline'));
    renderView();
    await screen.findByText(/気温を入力してください/);
    expect(screen.getByPlaceholderText('例: 18')).toBeTruthy();
  });

  it('shows the wear-history segment without any toggle, only when there is history', async () => {
    renderView();
    await screen.findAllByRole('article');
    expect(screen.queryByRole('button', { name: '着ていない服を優先' })).toBeNull();
    cleanup();
    renderView([{ itemId: 's-tops-1', date: '2026-10-01' }, { itemId: 's-bottoms-1', date: '2026-10-01' }]);
    await screen.findAllByRole('article');
    const prefer = screen.getByRole('button', { name: '着ていない服を優先' });
    fireEvent.click(prefer);
    expect(prefer.getAttribute('aria-pressed')).toBe('true');
  });
```

(`expands the fine-tuning panel…` と `lets the user return a manually typed temperature…` は上の 1 本目に統合したので削除。)

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/SuggestView.test.tsx src/components/SuggestView.ux.test.tsx`
Expected: FAIL (「気温を変える」が無い / 「条件を絞る」がまだある)

- [ ] **Step 3: `SuggestConditions` を書き換える** (上の DOM どおり。`.link.toggle` と `.cond-more` の CSS も削除し、`.temp-row` に `margin-top: 8px` を足す)

- [ ] **Step 4: 通ることを確認**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/SuggestConditions.tsx src/components/SuggestView.test.tsx src/components/SuggestView.ux.test.tsx src/styles.css
git commit -m "条件バーの「条件を絞る」折りたたみを無くし、気温の手入力をその場で開けるようにする"
```

---

### Task 6: 空のクローゼットをメイン画面で扱う

**Files:**
- Modify: `src/components/SuggestView.tsx` (props 追加、`ImportDialog` の表示、サンプル読み込み、「先にクローゼットへ…」の削除)
- Modify: `src/App.tsx` (新しい props を渡す)
- Test: `src/components/SuggestView.test.tsx`

**Interfaces:**
- Produces: `SuggestView` props に `onChangeWardrobe: (next: ClothingItem[]) => void` と `onImportWearLog: (log: WearLog) => void` を追加。`ClosetPanel` の `onImport` で `importing` state を true にし、`WardrobeView` と同じ `modal-backdrop` + `ImportDialog` (`existingCount={wardrobe.length}`, `onApply` は `mergeWardrobe` → `onChangeWardrobe`、`importedLog` があれば `onImportWearLog`) を出す。`onLoadSample` は `onChangeWardrobe(SAMPLE_WARDROBE)`。
- `App.tsx` は `changeWardrobe` と `importWearLog` をそのまま渡す。

- [ ] **Step 1: 失敗するテストを書く** (`SuggestView.test.tsx` に describe 追加。`renderView` ほか既存の render 呼び出しに `onChangeWardrobe={() => {}} onImportWearLog={() => {}}` を足す)

```tsx
describe('SuggestView empty wardrobe', () => {
  it('offers import and sample data in place, without the old registration hint', async () => {
    getForecast.mockResolvedValue({ max: 20, min: 12 });
    const onChangeWardrobe = vi.fn();
    render(<SuggestView wardrobe={[]} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} onChangeWardrobe={onChangeWardrobe} onImportWearLog={() => {}} />);
    expect(screen.queryByText('先にクローゼットへアイテムを登録してください。')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gist / JSON から取り込む' }));
    expect(screen.getByRole('heading', { name: 'クローゼットを取り込む' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'サンプルデータを読み込む' }));
    expect(onChangeWardrobe).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 's-tops-1' })]));
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components/SuggestView.test.tsx -t "empty wardrobe"`
Expected: FAIL (props が無い / ボタンが無い)

- [ ] **Step 3: 実装** (`SuggestView` と `App.tsx`)

- [ ] **Step 4: 通ることを確認**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/SuggestView.tsx src/components/SuggestView.test.tsx src/App.tsx
git commit -m "クローゼットが空でもメイン画面から取り込みとサンプル読み込みができるようにする"
```

---

### Task 7: `App` のタブを無くし、編集画面を別画面にする

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/WardrobeView.tsx` (`onBack` prop と先頭の戻るボタン)
- Modify: `src/styles.css` (`.tabs` 〜 `.tabs button.on` と `.count` を削除。`.back-row { margin-bottom: 12px; }` を追加)
- Test: `src/App.test.tsx` (新規)

**Interfaces:**
- `App`: `const [view, setView] = useState<'main' | 'edit'>('main')`。`<main>` の中に `<div hidden={view !== 'main'}><SuggestView … onEdit={() => setView('edit')} /></div>` と `{view === 'edit' && <WardrobeView … onBack={() => setView('main')} />}`。ヘッダーの `nav.tabs` を削除。初期 view はクローゼットが空でも `'main'`。
- `WardrobeView` props に `onBack: () => void` を追加。`section.wardrobe` の先頭に `<div className="back-row"><button type="button" className="btn" onClick={onBack}>← コーデ提案に戻る</button></div>`。

- [ ] **Step 1: 失敗するテストを書く** (`src/App.test.tsx`)

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DailyTemperature } from './lib/weather';

const getForecast = vi.fn<(date: Date) => Promise<DailyTemperature>>();
vi.mock('./lib/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/weather')>();
  return { ...actual, getForecast: (date: Date) => getForecast(date) };
});

import App from './App';
import { SAMPLE_WARDROBE } from './data/sample';
import { saveWardrobe } from './lib/storage';

beforeEach(() => {
  localStorage.clear();
  getForecast.mockReset();
  getForecast.mockResolvedValue({ max: 20, min: 12 });
});
afterEach(cleanup);

describe('App single screen', () => {
  it('has no tab navigation and shows conditions, closet and suggestions together', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    expect(document.querySelector('nav.tabs')).toBeNull();
    expect(screen.queryByRole('button', { name: 'コーデ提案' })).toBeNull();
    expect(screen.getByTestId('cond-status')).toBeTruthy();
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
    await screen.findAllByRole('article');
  });

  it('starts on the main screen even when the wardrobe is empty', () => {
    render(<App />);
    expect(screen.getByText(/まだアイテムがありません/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '← コーデ提案に戻る' })).toBeNull();
  });

  it('keeps the chosen item and date when going to the edit screen and back', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    await screen.findAllByRole('article');
    fireEvent.click(screen.getByRole('button', { name: '明日' }));
    fireEvent.click(screen.getByRole('button', { name: '今の条件に合う服だけ' }));
    fireEvent.click(screen.getByRole('tab', { name: /シューズ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ブラックのローファー を選択' }));
    expect(screen.getAllByTestId('must-chip')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'クローゼットを編集 ›' }));
    expect(screen.getByRole('button', { name: '＋ アイテムを追加' })).toBeTruthy();
    expect(screen.getByTestId('cond-status').closest('[hidden]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '← コーデ提案に戻る' }));
    expect(screen.queryByRole('button', { name: '＋ アイテムを追加' })).toBeNull();
    expect(screen.getByRole('button', { name: '明日' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByTestId('must-chip')[0].textContent).toContain('ローファー');
  });

  it('drops the chip when the chosen item is deleted on the edit screen', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await screen.findAllByRole('article');
    fireEvent.click(screen.getByRole('button', { name: '今の条件に合う服だけ' }));
    fireEvent.click(screen.getByRole('tab', { name: /シューズ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ブラックのローファー を選択' }));
    fireEvent.click(screen.getByRole('button', { name: 'クローゼットを編集 ›' }));
    // 隠れたメイン画面にも同じ名前があるので、編集画面の中だけを見る
    const wardrobe = within(document.querySelector('.wardrobe') as HTMLElement);
    const card = wardrobe.getByText('ブラックのローファー').closest('.item-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: '削除' }));
    fireEvent.click(screen.getByRole('button', { name: '← コーデ提案に戻る' }));
    expect(screen.queryAllByTestId('must-chip')).toHaveLength(0);
  });
});
```

(`within` を import に足す。`ItemCard` の削除ボタンの文言は「削除」。)

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL (タブのボタンがまだある / 「クローゼットを編集 ›」で編集画面に行かない)

- [ ] **Step 3: `App` と `WardrobeView` を実装**

チップの幽霊は、`ClosetPanel` が `selected` のうち `wardrobe` に存在する id だけをチップにする (Task 3 の決め事) ので、`SuggestView` 側で `mustInclude` を掃除する必要はない。テストが落ちる場合だけ、`SuggestView` に `useEffect(() => setMustInclude((cur) => cur.filter((id) => wardrobe.some((i) => i.id === id))), [wardrobe])` を足す。

- [ ] **Step 4: 通ることを確認**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS / ビルド成功

- [ ] **Step 5: コミット**

```bash
git add src/App.tsx src/App.test.tsx src/components/WardrobeView.tsx src/styles.css
git commit -m "タブをやめ、クローゼットの編集を別画面にする"
```

---

### Task 8: 実機確認、スクリーンショット、README

**Files:**
- Modify: `README.md` (「画面」の表と「できること」の コーデ提案 / 着用履歴 / Gist の行、「クローゼット画面の『インポート』から」の記述)
- Replace: `docs/screenshots/suggest.png`, `docs/screenshots/wardrobe.png`

- [ ] **Step 1: 開発サーバーで 2 つの幅を確認**

Run: `npm run dev` (既に 5199 で動いていればそれを使う)。Playwright MCP で `http://localhost:5199` を開き、サンプルデータを読み込んでから:
- 1200px: 条件バー → クローゼット → 提案 の順で 1 画面に並び、クローゼットの高さがタブを切り替えても変わらないこと。
- 375px: `document.documentElement.scrollWidth <= 375` (横スクロール無し)。タブが横スクロールし、グリッドが 3 列であること。
- 「クローゼットを編集 ›」→ 編集画面 → 「← コーデ提案に戻る」で条件が保たれること。
Expected: すべて目視で OK。崩れがあれば CSS を直して再確認 (直した CSS は Step 4 のコミットに含める)。

- [ ] **Step 2: スクリーンショットを撮り直す**

1200px でメイン画面を `docs/screenshots/suggest.png`、編集画面を `docs/screenshots/wardrobe.png` に保存 (既存ファイルを上書き)。`outfit-reasons.png` は提案カードが変わらないのでそのまま。

- [ ] **Step 3: README を直す**

- 「画面」の表の見出しを「メイン画面 (クローゼットとコーデ提案)」「クローゼットの編集」にし、alt を新しい画面の説明にする。
- 「できること」の **コーデ提案** の行: 「条件を絞る」の文を「クローゼットのタイルを押すと、その服を入れたコーデに切り替わる。気温の手入力は『気温を変える』から」に。
- **着用履歴** の行: 「今日着た」は編集画面にある旨を足す。
- 「Gist / JSON からクローゼットを取り込む」節: 「クローゼット画面の『インポート』から」→「クローゼットが空のときはメイン画面の『Gist / JSON から取り込む』、服があるときは『クローゼットを編集 ›』→『インポート』から」。
- プロジェクト構成の一覧に `components/ClosetPanel.tsx` を足し、`ItemPicker.tsx` を消す (一覧に載っていれば)。

- [ ] **Step 4: コミット**

```bash
git add README.md docs/screenshots src/styles.css
git commit -m "1 画面化に合わせて README とスクリーンショットを更新"
```

- [ ] **Step 5: 仕上げ**

`npm test && npm run typecheck && npm run build` を最後にもう一度通し、ブランチを push して PR を作る (ユーザーの通常フロー: PR → チェック待ち → 管理者バイパスのマージはユーザーに確認)。
