// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.getByRole('button', { name: 'クローゼットから選ぶ' })).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'クローゼットから選ぶ' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'クローゼットから選ぶ' }));
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
    // 消えた id が裏で効き続けて提案が 0 件になってはいけない (再計算が終わるまで待つ)
    await waitFor(() => expect(document.querySelector('.outfits')?.getAttribute('aria-busy')).toBe('false'));
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(screen.queryByText(/組み合わせを作れませんでした/)).toBeNull();
  });
});
