// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DailyTemperature } from '../lib/weather';

const getForecast = vi.fn<(date: Date) => Promise<DailyTemperature>>();
vi.mock('../lib/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/weather')>();
  return { ...actual, getForecast: (date: Date) => getForecast(date) };
});

import App from '../App';
import { SAMPLE_WARDROBE } from '../data/sample';
import type { ClothingItem } from '../types';
import { saveWardrobe } from '../lib/storage';

const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
/** 提案の再計算 (150ms のデバウンス) が終わるまで待つ */
const settle = async () => {
  await sleep(250);
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
};

beforeEach(() => {
  localStorage.clear();
  getForecast.mockReset();
  getForecast.mockResolvedValue({ max: 15, min: 8 });
});
afterEach(cleanup);

describe('「このコーデを着た」のトースト', () => {
  it('stays after the recalculation that the new wear record triggers, so it can be undone', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    await screen.findAllByRole('article');
    await settle();
    fireEvent.click(screen.getAllByRole('button', { name: 'このコーデを着た' })[0]);
    await settle();
    expect(screen.getByText(/#1 のコーデを .* に着たとして記録しました/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }));
    expect(JSON.parse(localStorage.getItem('coordination.wearlog.v1') ?? '[]')).toEqual([]);
  });

  it('closes when the conditions change', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    await screen.findAllByRole('article');
    await settle();
    fireEvent.click(screen.getAllByRole('button', { name: 'このコーデを着た' })[0]);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'きれいめ' }));
    await settle();
    expect(screen.queryByText(/着たとして記録しました/)).toBeNull();
  });
});

describe('案が尽きたページ', () => {
  // トップス 1 × ボトムス 1 × 靴 5 = ちょうど 5 件
  const five: ClothingItem[] = [
    ...SAMPLE_WARDROBE.filter((i) => i.id === 's-tops-6' || i.id === 's-bottoms-1'),
    ...SAMPLE_WARDROBE.filter((i) => i.category === 'shoes').map((s) => ({ ...s, seasons: ['spring', 'summer', 'autumn', 'winter'] as ClothingItem['seasons'] })),
  ];

  it('shows 「これ以上の案はありません。」 and a way back', async () => {
    saveWardrobe(five);
    render(<App />);
    await screen.findAllByRole('article');
    await settle();
    expect(screen.getAllByRole('article')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: '別の案を見る' }));
    await settle();
    expect(screen.getByText('これ以上の案はありません。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '前の案に戻る' }));
    await settle();
    expect(screen.getAllByRole('article')).toHaveLength(5);
  });

  it('says 「これ以上の案はありません。」 on a later page even when items are chosen', async () => {
    saveWardrobe(five);
    localStorage.setItem('coordination.closet.open', '1');
    render(<App />);
    await screen.findAllByRole('article');
    fireEvent.click(screen.getByRole('tab', { name: /^トップス/ }));
    fireEvent.click(screen.getByRole('button', { name: 'グレーのスウェット を選択' }));
    await settle();
    expect(screen.getAllByRole('article')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: '別の案を見る' }));
    await settle();
    expect(screen.getByText('これ以上の案はありません。')).toBeTruthy();
    expect(screen.queryByText(/同時に着る組み合わせが作れませんでした/)).toBeNull();
  });
});

describe('気温の手入力を消したとき', () => {
  it('goes back to the forecast for both the status line and the conditions', async () => {
    getForecast.mockResolvedValue({ max: 30, min: 25 });
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    await screen.findByText(/最高 30℃/);
    fireEvent.click(screen.getByRole('button', { name: '気温を変える' }));
    const input = screen.getByPlaceholderText('例: 18') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.change(input, { target: { value: '' } });
    await settle();
    expect(screen.getByTestId('cond-status').textContent).toContain('最高 30℃ / 最低 25℃');
    expect(screen.getByText(/でよさそう/).getAttribute('title')).toContain('目安の厚さ 1/5');
  });
});
