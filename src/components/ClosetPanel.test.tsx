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
    for (const [cat, n] of Object.entries(per)) {
      for (let k = 0; k < n; k++) big.push({ ...SAMPLE_WARDROBE[0], id: `${cat}-${k}`, name: `${cat} ${k}`, category: cat as ClothingItem['category'] });
    }
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
    const stats = buildWearStats(
      [
        { itemId: 's-tops-5', date: '2026-01-14' },
        { itemId: 's-tops-6', date: '2026-01-01' },
      ],
      '2026-01-15',
    );
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
