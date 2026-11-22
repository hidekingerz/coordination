// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ClothingItem } from '../types';
import type { WearLog } from '../lib/wear';
import { WardrobeView } from './WardrobeView';
import { SAMPLE_WARDROBE } from '../data/sample';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function renderView(over: { wardrobe?: ClothingItem[]; wearLog?: WearLog } = {}) {
  const props = {
    wardrobe: over.wardrobe ?? SAMPLE_WARDROBE,
    wearLog: over.wearLog ?? [],
    onChange: vi.fn<(next: ClothingItem[]) => void>(),
    onWear: vi.fn<(ids: string[], date: string) => void>(),
    onUnwear: vi.fn<(ids: string[], date: string) => void>(),
    onImportWearLog: vi.fn<(log: WearLog) => void>(),
    onBack: vi.fn(),
  };
  render(<WardrobeView {...props} />);
  return props;
}

/** 名前でカードを探す (カードは服の名前を持つグループ) */
const card = (name: string) => screen.getByRole('group', { name });
/** 編集ボタンのあるカード (= 一覧に出ている服) の名前、表示順 */
const cardNames = () => screen.queryAllByRole('group').filter((g) => within(g).queryByRole('button', { name: '編集' })).map((g) => g.getAttribute('aria-label') ?? '');

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WardrobeView: add, edit, delete', () => {
  it('adds an item from the form', () => {
    const p = renderView();
    fireEvent.click(screen.getByRole('button', { name: '＋ アイテムを追加' }));
    fireEvent.change(screen.getByPlaceholderText('例: 白の無地Tシャツ'), { target: { value: '新しいシャツ' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    const next = p.onChange.mock.calls[0][0];
    expect(next).toHaveLength(SAMPLE_WARDROBE.length + 1);
    expect(next[next.length - 1].name).toBe('新しいシャツ');
    expect(screen.queryByRole('heading', { name: 'アイテムを追加' })).toBeNull(); // フォームは閉じる
  });

  it('edits an item in place, keeping its id', () => {
    const p = renderView();
    fireEvent.click(within(card('ボルドーのニット')).getByRole('button', { name: '編集' }));
    const name = screen.getByDisplayValue('ボルドーのニット');
    fireEvent.change(name, { target: { value: 'ボルドーのニット (改)' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const next = p.onChange.mock.calls[0][0];
    expect(next).toHaveLength(SAMPLE_WARDROBE.length);
    expect(next.find((i) => i.id === 's-tops-5')!.name).toBe('ボルドーのニット (改)');
  });

  it('closes the form without changes on キャンセル and on the backdrop', () => {
    const p = renderView();
    fireEvent.click(screen.getByRole('button', { name: '＋ アイテムを追加' }));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('heading', { name: 'アイテムを追加' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '＋ アイテムを追加' }));
    fireEvent.click(document.querySelector('.modal-backdrop')!);
    expect(screen.queryByRole('heading', { name: 'アイテムを追加' })).toBeNull();
    expect(p.onChange).not.toHaveBeenCalled();
  });

  it('deletes only after the confirmation is accepted', () => {
    const p = renderView();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(within(card('ボルドーのニット')).getByRole('button', { name: '削除' }));
    expect(p.onChange).not.toHaveBeenCalled();
    fireEvent.click(within(card('ボルドーのニット')).getByRole('button', { name: '削除' }));
    expect(confirm).toHaveBeenLastCalledWith('「ボルドーのニット」を削除しますか？');
    expect(p.onChange.mock.calls[0][0].some((i) => i.id === 's-tops-5')).toBe(false);
  });
});

describe('WardrobeView: 今日着た', () => {
  it('records today and can be undone', () => {
    const p = renderView();
    fireEvent.click(within(card('ボルドーのニット')).getByRole('button', { name: '今日着た' }));
    expect(p.onWear).toHaveBeenCalledWith(['s-tops-5'], today());
    expect(screen.getByText(/「ボルドーのニット」を今日着たとして記録しました/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }));
    expect(p.onUnwear).toHaveBeenCalledWith(['s-tops-5'], today());
    expect(screen.queryByText(/記録しました/)).toBeNull();
  });

  it('closes the note with 閉じる without undoing', () => {
    const p = renderView();
    fireEvent.click(within(card('ボルドーのニット')).getByRole('button', { name: '今日着た' }));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByText(/記録しました/)).toBeNull();
    expect(p.onUnwear).not.toHaveBeenCalled();
  });
});

describe('WardrobeView: narrowing and order', () => {
  it('filters by category with counts', () => {
    renderView();
    expect(screen.getByRole('button', { name: `すべて (${SAMPLE_WARDROBE.length})` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'シューズ (5)' }));
    expect(cardNames()).toEqual(SAMPLE_WARDROBE.filter((i) => i.category === 'shoes').map((i) => i.name));
    fireEvent.click(screen.getByRole('button', { name: /^すべて/ }));
    expect(cardNames()).toHaveLength(SAMPLE_WARDROBE.length);
  });

  it('filters by brand, and the same brand again turns it off', () => {
    renderView();
    const group = screen.getByRole('group', { name: 'ブランドで絞り込み' });
    fireEvent.click(within(group).getByRole('button', { name: 'ユニクロ (2)' }));
    expect(cardNames().sort()).toEqual(['ベージュのチノパン', '白の無地Tシャツ'].sort());
    fireEvent.click(within(group).getByRole('button', { name: 'ユニクロ (2)' }));
    expect(cardNames()).toHaveLength(SAMPLE_WARDROBE.length);
  });

  it('searches by name, brand and tag, and says so when nothing matches', () => {
    renderView();
    const search = screen.getByPlaceholderText('名前・ブランド・タグで検索');
    fireEvent.change(search, { target: { value: 'リーバイス' } });
    expect(cardNames()).toEqual(['インディゴデニム']);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('条件に合うアイテムがありません。')).toBeTruthy();
  });

  it('orders by category by default, and by least / most recently worn on request', () => {
    const wearLog = [
      { itemId: 's-shoes-1', date: daysAgo(1) },
      { itemId: 's-outer-2', date: daysAgo(10) },
    ];
    renderView({ wearLog });
    expect(cardNames()[0]).toBe('ネイビーのステンカラーコート');
    const sort = screen.getByRole('combobox', { name: '並び順' });
    fireEvent.change(sort, { target: { value: 'unworn' } });
    const unworn = cardNames();
    expect(unworn.slice(-2)).toEqual(['ブラックのダウンジャケット', '白のレザースニーカー']);
    fireEvent.change(sort, { target: { value: 'recent' } });
    expect(cardNames().slice(0, 2)).toEqual(['白のレザースニーカー', 'ブラックのダウンジャケット']);
  });

  it('suggests the least-worn order once half the closet has a history', () => {
    // 記録が半分未満のうちは、記録の無い服は「未着用」として数えない (60 日以上前に着た服だけ)
    const few = [{ itemId: 's-tops-5', date: daysAgo(70) }];
    renderView({ wearLog: few });
    expect(screen.getByText(/2 か月以上着ていない \(または未着用の\) 服が 1 点あります/)).toBeTruthy();
    cleanup();
    const half = SAMPLE_WARDROBE.slice(0, 15).map((i) => ({ itemId: i.id, date: daysAgo(3) }));
    renderView({ wearLog: half });
    expect(screen.getByText(/服が 15 点あります/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '着ていない順に並べる' }));
    expect((screen.getByRole('combobox', { name: '並び順' }) as HTMLSelectElement).value).toBe('unworn');
    expect(screen.queryByText(/点あります/)).toBeNull();
  });
});

describe('WardrobeView: export, import and the empty closet', () => {
  it('exports the closet and the wear history as a dated JSON file', async () => {
    const wearLog = [{ itemId: 's-tops-5', date: daysAgo(2) }];
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blob = b as Blob;
      return 'blob:x';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^wardrobe-\d{4}-\d{2}-\d{2}\.json$/);
      expect(this.href).toBe('blob:x');
    });
    renderView({ wearLog });
    fireEvent.click(screen.getByRole('button', { name: 'エクスポート' }));
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    const json = JSON.parse(await blob!.text());
    expect(json.items).toHaveLength(SAMPLE_WARDROBE.length);
    expect(json.wearLog).toEqual(wearLog);
  });

  it('disables export for an empty closet and offers import and the sample instead', () => {
    const p = renderView({ wardrobe: [] });
    expect((screen.getByRole('button', { name: 'エクスポート' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/まだアイテムがありません/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'サンプルデータを読み込む' }));
    expect(p.onChange).toHaveBeenCalledWith(SAMPLE_WARDROBE);
    fireEvent.click(screen.getByRole('button', { name: 'Gist / JSON から取り込む' }));
    expect(screen.getByRole('heading', { name: 'クローゼットを取り込む' })).toBeTruthy();
  });

  it('imports pasted JSON with its wear history, merging into the closet', () => {
    const p = renderView();
    fireEvent.click(screen.getByRole('button', { name: 'インポート' }));
    const json = JSON.stringify({ items: [{ id: 'new-1', name: '新しいコート', category: 'outer' }], wearLog: [{ itemId: 'new-1', date: daysAgo(1) }] });
    fireEvent.change(screen.getByPlaceholderText(/白のTシャツ/), { target: { value: json } });
    fireEvent.click(screen.getByRole('button', { name: '貼り付けた内容を読み込む' }));
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));
    const next = p.onChange.mock.calls[0][0];
    expect(next).toHaveLength(SAMPLE_WARDROBE.length + 1);
    expect(p.onImportWearLog).toHaveBeenCalledWith([{ itemId: 'new-1', date: daysAgo(1) }]);
    expect(screen.queryByRole('heading', { name: 'クローゼットを取り込む' })).toBeNull();
  });

  it('goes back to the main screen', () => {
    const p = renderView();
    fireEvent.click(screen.getByRole('button', { name: '← コーデ提案に戻る' }));
    expect(p.onBack).toHaveBeenCalled();
  });
});

describe('WardrobeView: smaller paths', () => {
  it('goes back to all brands with 全ブランド, and when the chosen brand disappears', () => {
    const p = renderView();
    const group = screen.getByRole('group', { name: 'ブランドで絞り込み' });
    fireEvent.click(within(group).getByRole('button', { name: 'ユニクロ (2)' }));
    fireEvent.click(within(group).getByRole('button', { name: '全ブランド' }));
    expect(cardNames()).toHaveLength(SAMPLE_WARDROBE.length);
    fireEvent.click(within(group).getByRole('button', { name: 'リーバイス (1)' }));
    expect(cardNames()).toEqual(['インディゴデニム']);
    cleanup();
    // リーバイスの服が無くなった (削除・改名) ら、絞り込みは「全ブランド」に戻る
    render(<WardrobeView {...p} wardrobe={SAMPLE_WARDROBE.filter((i) => i.brand !== 'リーバイス')} />);
    expect(cardNames()).toHaveLength(SAMPLE_WARDROBE.length - 1);
  });

  it('closes the import dialog with 閉じる and with the backdrop', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'インポート' }));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('heading', { name: 'クローゼットを取り込む' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'インポート' }));
    fireEvent.click(document.querySelector('.modal-backdrop')!);
    expect(screen.queryByRole('heading', { name: 'クローゼットを取り込む' })).toBeNull();
  });
});
