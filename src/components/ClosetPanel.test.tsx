// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ClosetPanel, type ClosetPanelProps } from './ClosetPanel';
import { SAMPLE_WARDROBE } from '../data/sample';
import { buildConditions } from '../lib/season';
import { buildWearStats } from '../lib/wear';
import type { ClothingItem } from '../types';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const winter = buildConditions(new Date('2026-01-15T12:00:00')); // acceptableSeasons = ['winter']

/** 既定は折りたたみなので、タブやタイルを見るテストは open: true で開いて描画する */
function renderPanel(over: Partial<ClosetPanelProps> = {}, { open = false } = {}) {
  const props: ClosetPanelProps = {
    wardrobe: SAMPLE_WARDROBE,
    conditions: winter,
    selected: [],
    onToggle: vi.fn(),
    onClear: vi.fn(),
    onEdit: vi.fn(),
    onImport: vi.fn(),
    onLoadSample: vi.fn(),
    ...over,
  };
  render(<ClosetPanel {...props} />);
  if (open && props.wardrobe.length > 0) fireEvent.click(screen.getByRole('button', { name: 'クローゼットから選ぶ' }));
  return props;
}
const renderOpen = (over: Partial<ClosetPanelProps> = {}) => renderPanel(over, { open: true });
const tabs = () => screen.getAllByRole('tab').map((t) => t.textContent);
const tiles = () => screen.queryAllByRole('button', { name: /を選択/ }).map((b) => b.getAttribute('aria-label'));
const filterChip = () => screen.getByRole('button', { name: '今の条件に合う服だけ' });
const search = () => screen.getByPlaceholderText('名前・ブランド・タグで検索');

describe('ClosetPanel tabs and filter', () => {
  it('shows one tab per non-empty category with filtered/total counts, filter on by default', () => {
    renderOpen();
    expect(filterChip().getAttribute('aria-pressed')).toBe('true');
    expect(tabs()).toEqual(['アウター 3/5', 'トップス 3/9', 'ボトムス 3/6', 'ワンピース / セットアップ 1/1', 'シューズ 3/5', '小物 3/4']);
    expect(screen.getByRole('tab', { name: 'アウター 3/5' }).getAttribute('aria-selected')).toBe('true');
    expect(tiles()).toEqual(['ネイビーのステンカラーコート を選択', 'ブラックのダウンジャケット を選択', 'グレーのカーディガン を選択']);
  });

  it('shows every item when the filter is switched off', () => {
    renderOpen();
    fireEvent.click(filterChip());
    expect(filterChip().getAttribute('aria-pressed')).toBe('false');
    expect(tabs()[0]).toBe('アウター 5');
    expect(tiles()).toHaveLength(5);
  });

  it('switches tab on click', () => {
    renderOpen();
    fireEvent.click(screen.getByRole('tab', { name: 'シューズ 3/5' }));
    expect(tiles()).toEqual(['白のレザースニーカー を選択', 'ブラックのローファー を選択', 'ブラウンのブーツ を選択']);
  });

  it('shows a single tab and no crash for a one-category wardrobe', () => {
    renderOpen({ wardrobe: SAMPLE_WARDROBE.filter((i) => i.category === 'tops') });
    expect(tabs()).toEqual(['トップス 3/9']);
    expect(tiles()).toHaveLength(3);
  });

  it('renders all tiles of a 150-item wardrobe without virtualisation', () => {
    const big: ClothingItem[] = [];
    const per = { outer: 20, tops: 45, bottoms: 30, shoes: 20, accessory: 35 } as const;
    for (const [cat, n] of Object.entries(per)) {
      for (let k = 0; k < n; k++) big.push({ ...SAMPLE_WARDROBE[0], id: `${cat}-${k}`, name: `${cat} ${k}`, category: cat as ClothingItem['category'] });
    }
    renderOpen({ wardrobe: big });
    expect(tabs()).toEqual(['アウター 20/20', 'トップス 45/45', 'ボトムス 30/30', 'シューズ 20/20', '小物 35/35']);
    fireEvent.click(screen.getByRole('tab', { name: 'トップス 45/45' }));
    expect(document.querySelectorAll('.closet-grid .closet-tile')).toHaveLength(45);
  });
});

describe('ClosetPanel search', () => {
  // タブは wardrobe にそのカテゴリの服があれば出す。検索で 0 件になっても消えない (件数が 0/N になるだけ)
  it('updates every tab count and jumps to the first category that still has matches', () => {
    renderOpen();
    fireEvent.change(search(), { target: { value: 'ローファー' } });
    expect(tabs()).toEqual(['アウター 0/5', 'トップス 0/9', 'ボトムス 0/6', 'ワンピース / セットアップ 0/1', 'シューズ 1/5', '小物 0/4']);
    expect(screen.getByRole('tab', { name: 'シューズ 1/5' }).getAttribute('aria-selected')).toBe('true');
    expect(tiles()).toEqual(['ブラックのローファー を選択']);
  });

  it('ignores surrounding whitespace and letter case', () => {
    renderOpen();
    fireEvent.click(filterChip()); // T シャツは冬物でないので先にフィルタを外す
    fireEvent.change(search(), { target: { value: '  tシャツ ' } });
    expect(screen.getByRole('tab', { name: 'トップス 2/9' }).getAttribute('aria-selected')).toBe('true');
    expect(tiles()).toEqual(['白の無地Tシャツ を選択', 'ブラックのTシャツ を選択']);
  });

  it('shows the empty message with an escape hatch when only the filter hides matches', () => {
    renderOpen();
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
    const p = renderOpen({ selected: ['s-outer-2'] });
    expect(screen.getByRole('button', { name: 'ブラックのダウンジャケット を選択解除' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'ネイビーのステンカラーコート を選択' }));
    expect(p.onToggle).toHaveBeenCalledWith('s-outer-1');
  });

  it('keeps selected items as chips even when the filter hides them, and clears with すべて外す', () => {
    const p = renderOpen({ selected: ['s-tops-1'] }); // 夏物: 冬のフィルタでは見えない
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
    renderOpen();
    expect(screen.getByText('指定なし')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'すべて外す' })).toBeNull();
  });
});

describe('ClosetPanel order', () => {
  it('orders never-worn first, then longest unworn, and shows the wear label', () => {
    const stats = buildWearStats(
      [
        { itemId: 's-tops-5', date: '2026-01-14' },
        { itemId: 's-tops-6', date: '2026-01-01' },
      ],
      '2026-01-15',
    );
    renderOpen({ wearStats: stats });
    fireEvent.click(screen.getByRole('tab', { name: /トップス/ }));
    expect(tiles()).toEqual(['ネイビーのタートルネック を選択', 'グレーのスウェット を選択', 'ボルドーのニット を選択']);
    expect(screen.getByRole('button', { name: 'ボルドーのニット を選択' }).textContent).toContain('昨日着た');
  });
});

describe('ClosetPanel empty wardrobe', () => {
  it('shows the guidance and three actions instead of tabs', () => {
    const p = renderOpen({ wardrobe: [] });
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
    const p = renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'クローゼットを編集 ›' }));
    expect(p.onEdit).toHaveBeenCalled();
  });
});

describe('ClosetPanel collapsed by default', () => {
  const openButton = () => screen.getByRole('button', { name: 'クローゼットから選ぶ' });

  it('starts collapsed: chips row and open button only, no tabs or tiles', () => {
    renderPanel({ selected: ['s-outer-2'] });
    expect(openButton().getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByTestId('must-chip')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'クローゼットを編集 ›' })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(tiles()).toHaveLength(0);
    expect(screen.queryByPlaceholderText('名前・ブランド・タグで検索')).toBeNull();
  });

  it('opens on click, flips the button to クローゼットを閉じる, and remembers the state', () => {
    renderPanel();
    fireEvent.click(openButton());
    const close = screen.getByRole('button', { name: 'クローゼットを閉じる' });
    expect(close.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
    expect(localStorage.getItem('coordination.closet.open')).toBe('1');

    cleanup();
    renderPanel(); // 次に開いたときも開いたまま
    expect(screen.getByRole('button', { name: 'クローゼットを閉じる' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'クローゼットを閉じる' }));
    expect(localStorage.getItem('coordination.closet.open')).toBe('0');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('shows the empty-wardrobe guidance without a toggle', () => {
    renderPanel({ wardrobe: [] });
    expect(screen.queryByRole('button', { name: 'クローゼットから選ぶ' })).toBeNull();
    expect(screen.getByRole('button', { name: 'サンプルデータを読み込む' })).toBeTruthy();
  });
});

describe('ClosetPanel tile name', () => {
  it('carries the full name in title so a clipped name can still be read', () => {
    renderOpen();
    const tile = screen.getByRole('button', { name: 'ネイビーのステンカラーコート を選択' });
    expect(tile.getAttribute('title')).toBe('ネイビーのステンカラーコート');
    expect(tile.querySelector('strong')?.className).toBe('tile-name');
  });
});

describe('ClosetPanel filter chip', () => {
  it('is styled as an on/off toggle, not a filled primary button', () => {
    renderOpen();
    expect(filterChip().classList.contains('toggle')).toBe(true);
    expect(filterChip().classList.contains('on')).toBe(true);
    fireEvent.click(filterChip());
    expect(filterChip().classList.contains('on')).toBe(false);
  });
});

describe('ClosetPanel sort label', () => {
  it('names the order when wear stats drive it, and stays silent without history', () => {
    renderOpen();
    expect(screen.queryByText('着ていない順')).toBeNull();
    cleanup();
    localStorage.clear(); // 開いた状態を記憶しているので、次の描画でも「クローゼットから選ぶ」から開けるように戻す
    renderOpen({ wearStats: buildWearStats([{ itemId: 's-outer-1', date: '2026-01-14' }], '2026-01-15') });
    expect(screen.getByText('着ていない順')).toBeTruthy();
  });
});

describe('ClosetPanel tab count format', () => {
  it('uses shown/total on every tab while a filter or search is active, and plain totals otherwise', () => {
    renderOpen();
    expect(tabs()).toContain('ワンピース / セットアップ 1/1'); // 減っていなくても分数にそろえる
    fireEvent.click(filterChip());
    expect(tabs()).toEqual(['アウター 5', 'トップス 9', 'ボトムス 6', 'ワンピース / セットアップ 1', 'シューズ 5', '小物 4']);
    fireEvent.change(search(), { target: { value: 'セットアップ' } });
    expect(tabs()).toContain('ワンピース / セットアップ 1/1');
    expect(tabs()[0]).toBe('アウター 0/5');
  });
});

describe('ClosetPanel tab overflow hint', () => {
  const widths = (scroll: number, client: number) => {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scroll });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => client });
  };
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollWidth;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
  });

  it('marks the tab row when it overflows to the right, and clears the mark once scrolled to the end', () => {
    widths(600, 320); // jsdom は寸法を持たないので、はみ出している状態を作る
    renderOpen();
    const wrap = screen.getByRole('tablist').parentElement!;
    expect(wrap.getAttribute('data-more')).toBe('true');
    const list = screen.getByRole('tablist');
    Object.defineProperty(list, 'scrollLeft', { configurable: true, value: 280 });
    fireEvent.scroll(list);
    expect(wrap.getAttribute('data-more')).toBe('false');
  });

  it('shows no mark when every tab fits', () => {
    widths(300, 320);
    renderOpen();
    expect(screen.getByRole('tablist').parentElement!.getAttribute('data-more')).toBe('false');
  });
});
