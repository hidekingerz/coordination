// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DailyTemperature } from './lib/weather';

const getForecast = vi.fn<(date: Date) => Promise<DailyTemperature>>();
vi.mock('./lib/weather', async (importOriginal) => ({ ...(await importOriginal<typeof import('./lib/weather')>()), getForecast: (d: Date) => getForecast(d) }));

import App from './App';
import { SAMPLE_WARDROBE } from './data/sample';
import { saveWardrobe } from './lib/storage';

const log = () => JSON.parse(localStorage.getItem('coordination.wearlog.v1') ?? '[]') as { itemId: string; date: string; outfitId?: string }[];
const settle = async () => {
  await act(() => new Promise<void>((r) => setTimeout(r, 250)));
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
};

beforeEach(() => {
  localStorage.clear();
  getForecast.mockReset();
  getForecast.mockResolvedValue({ max: 15, min: 8 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App: wear history', () => {
  it('saves the outfit worn on the main screen, with the outfit id, and removes it on undo', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    await screen.findAllByRole('article');
    await settle();
    const first = screen.getAllByRole('article')[0];
    // カードのアイテム (服の名前のグループ)。人の絵の部品もグループなので、クローゼットにある名前だけを見る
    const names = within(first).getAllByRole('group').map((g) => g.getAttribute('aria-label')).filter((n) => SAMPLE_WARDROBE.some((i) => i.name === n));
    const unique = [...new Set(names)];
    fireEvent.click(within(first).getByRole('button', { name: 'このコーデを着た' }));
    const saved = log();
    expect(saved.map((e) => SAMPLE_WARDROBE.find((i) => i.id === e.itemId)!.name).sort()).toEqual([...unique].sort());
    expect(new Set(saved.map((e) => e.outfitId)).size).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }));
    expect(log()).toEqual([]);
  });

  it('drops the history of items deleted in the edit screen', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    localStorage.setItem('coordination.wearlog.v1', JSON.stringify([{ itemId: 's-tops-5', date: '2026-11-01' }, { itemId: 's-tops-1', date: '2026-11-01' }]));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'クローゼットを編集 ›' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'ボルドーのニット' })).getByRole('button', { name: '削除' }));
    expect(log().map((e) => e.itemId)).toEqual(['s-tops-1']);
  });

  it('merges a wear history imported into an empty closet', async () => {
    localStorage.setItem('coordination.wearlog.v1', JSON.stringify([{ itemId: 'a', date: '2026-11-01' }]));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Gist / JSON から取り込む' }));
    const json = JSON.stringify({ items: [{ id: 'a', name: 'シャツ', category: 'tops' }, { id: 'b', name: 'パンツ', category: 'bottoms' }], wearLog: [{ itemId: 'b', date: '2026-11-02' }] });
    fireEvent.change(screen.getByPlaceholderText(/白のTシャツ/), { target: { value: json } });
    fireEvent.click(screen.getByRole('button', { name: '貼り付けた内容を読み込む' }));
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));
    await screen.findAllByRole('article');
    expect(log().map((e) => e.itemId).sort()).toEqual(['a', 'b']);
    expect(JSON.parse(localStorage.getItem('coordination.wardrobe.v1')!)).toHaveLength(2);
  });

  it('closes the import dialog on the backdrop without changes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Gist / JSON から取り込む' }));
    fireEvent.click(document.querySelector('.modal-backdrop')!);
    expect(screen.queryByRole('heading', { name: 'クローゼットを取り込む' })).toBeNull();
  });
});

describe('App: smaller paths on the main screen', () => {
  it('closes the 着た note with 閉じる and keeps the record', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    await screen.findAllByRole('article');
    await settle();
    fireEvent.click(screen.getAllByRole('button', { name: 'このコーデを着た' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByText(/着たとして記録しました/)).toBeNull();
    expect(log().length).toBeGreaterThan(0);
  });

  it('clears every chosen item with すべて外す', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    localStorage.setItem('coordination.closet.open', '1');
    render(<App />);
    await screen.findAllByRole('article');
    fireEvent.click(within(screen.getByRole('group', { name: 'クローゼットの服' })).getByRole('button', { name: /ネイビーのステンカラーコート/ }));
    expect(screen.getAllByTestId('must-chip')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'すべて外す' }));
    expect(screen.queryAllByTestId('must-chip')).toHaveLength(0);
  });

  it('closes the import dialog of the empty closet with 閉じる', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Gist / JSON から取り込む' }));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('heading', { name: 'クローゼットを取り込む' })).toBeNull();
  });
});
