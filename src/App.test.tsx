// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DailyTemperature } from './lib/weather';
import type { Location } from './lib/location';
import { stubForecastWith } from './test/forecastStub';

// 予報 API の答え。fetch の差し替えにつないでいるので、呼ばれた回数は API への問い合わせ回数
const forecastApi = vi.fn<(date: Date, loc: Location) => Promise<DailyTemperature>>();

import App from './App';
import { SAMPLE_WARDROBE } from './data/sample';
import { saveWardrobe } from './lib/storage';
import { closetTile } from './test/closet';

beforeEach(() => {
  stubForecastWith(forecastApi);
  localStorage.clear();
  forecastApi.mockReset();
  forecastApi.mockResolvedValue({ max: 20, min: 12 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App single screen', () => {
  it('has no tab navigation and shows conditions, closet and suggestions together', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    // ヘッダーはアプリ名と説明だけ。画面を切り替えるナビやボタンは無い
    const header = screen.getByRole('banner');
    expect(within(header).queryByRole('navigation')).toBeNull();
    expect(within(header).queryAllByRole('button')).toHaveLength(0);
    expect(within(header).queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull(); // クローゼットを開くまでタブも無い
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
    fireEvent.click(closetTile('ブラックのローファー'));
    expect(screen.getAllByTestId('must-chip')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'クローゼットを編集 ›' }));
    expect(screen.getByRole('button', { name: '＋ アイテムを追加' })).toBeTruthy();
    // メイン画面は見えなくなる (隠れた要素はロールで探しても出てこない)
    expect(screen.queryByRole('region', { name: 'クローゼット' })).toBeNull();
    expect(screen.queryByRole('button', { name: '明日' })).toBeNull();

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
    fireEvent.click(closetTile('ブラックのローファー'));
    fireEvent.click(screen.getByRole('button', { name: 'クローゼットを編集 ›' }));
    // 隠れたメイン画面の提案カードはロールでは見えないので、見えているのは編集画面のカードだけ
    fireEvent.click(within(screen.getByRole('group', { name: 'ブラックのローファー' })).getByRole('button', { name: '削除' }));
    fireEvent.click(screen.getByRole('button', { name: '← コーデ提案に戻る' }));
    expect(screen.queryAllByTestId('must-chip')).toHaveLength(0);
    // 消えた id が裏で効き続けて提案が 0 件になってはいけない (再計算が終わるまで待つ)
    await waitFor(() => expect(screen.getByRole('region', { name: 'コーデ提案', busy: false })).toBeTruthy());
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(screen.queryByText(/組み合わせを作れませんでした/)).toBeNull();
  });
});
