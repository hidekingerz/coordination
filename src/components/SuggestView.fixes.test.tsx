// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DailyTemperature } from '../lib/weather';
import type { Location } from '../lib/location';
import { stubForecastWith } from '../test/forecastStub';

// 予報 API の答え。fetch の差し替えにつないでいるので、呼ばれた回数は API への問い合わせ回数
const forecastApi = vi.fn<(date: Date, loc: Location) => Promise<DailyTemperature>>();

import App from '../App';
import { SAMPLE_WARDROBE } from '../data/sample';
import type { ClothingItem } from '../types';
import { saveWardrobe } from '../lib/storage';
import { closetTile } from '../test/closet';

const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
/** 提案の再計算 (150ms のデバウンス) が終わるまで待つ */
const settle = async () => {
  await sleep(250);
  await waitFor(() => expect(screen.queryByRole('region', { name: 'コーデ提案', busy: true })).toBeNull());
};

beforeEach(() => {
  stubForecastWith(forecastApi);
  localStorage.clear();
  forecastApi.mockReset();
  forecastApi.mockResolvedValue({ max: 15, min: 8 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
    fireEvent.click(closetTile('グレーのスウェット'));
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
    forecastApi.mockResolvedValue({ max: 30, min: 25 });
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

describe('日付を変えたとき', () => {
  it('drops the manually typed temperature and uses the forecast of the new date', async () => {
    forecastApi.mockImplementation(async (date: Date) => (date.getDate() === new Date().getDate() ? { max: 15, min: 8 } : { max: 28, min: 22 }));
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    await screen.findByText(/最高 15℃/);
    fireEvent.click(screen.getByRole('button', { name: '気温を変える' }));
    fireEvent.change(screen.getByPlaceholderText('例: 18'), { target: { value: '5' } });
    expect(screen.getByTestId('cond-status').textContent).toContain('5℃ (手入力)');
    fireEvent.click(screen.getByRole('button', { name: '明日' }));
    await screen.findByText(/最高 28℃/);
    expect(screen.getByTestId('cond-status').textContent).not.toContain('手入力');
    expect(screen.getByText(/でよさそう/).getAttribute('title')).toContain('目安の厚さ 1/5');
  });

  it('keeps the manual temperature when only the location changes', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    await screen.findByText(/最高 15℃/);
    fireEvent.click(screen.getByRole('button', { name: '気温を変える' }));
    fireEvent.change(screen.getByPlaceholderText('例: 18'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /地点を変える/ }));
    fireEvent.change(screen.getByLabelText('予報の地点'), { target: { value: 'osaka' } });
    await settle();
    expect(screen.getByTestId('cond-status').textContent).toContain('5℃ (手入力)');
  });
});

describe('点数 (着用履歴なし)', () => {
  it('is the weighted sum of the four aspects shown in the breakdown', async () => {
    // 点数が低めになる 2 点だけのクローゼット (差が出やすい)。履歴が無いのに鮮度 10% が混ざると 4 観点の和から離れる
    saveWardrobe([
      { id: 't', name: '黄色のTシャツ', category: 'tops', color: '#e3c94a', seasons: ['summer'], warmth: 1, formality: 'casual', tags: [], createdAt: '' },
      { id: 'b', name: '赤のスラックス', category: 'bottoms', color: '#d62828', seasons: ['summer'], warmth: 1, formality: 'formal', tags: [], createdAt: '' },
    ]);
    render(<App />);
    const card = (await screen.findAllByRole('article'))[0];
    await settle();
    const score = Number(within(card).getByTitle('総合スコア').textContent!.replace('点', ''));
    const [c, w, f, s] = within(card).getAllByRole('meter').map((m) => Number(m.getAttribute('aria-valuenow')));
    expect(Math.abs(score - (c * 0.45 + w * 0.3 + f * 0.15 + s * 0.1))).toBeLessThanOrEqual(1);
  });
});

describe('日付欄を空にして「このコーデを着た」', () => {
  it('records with today, the date the suggestions were made for', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    await screen.findAllByRole('article');
    fireEvent.click(screen.getByRole('button', { name: '日付を指定' }));
    fireEvent.change(screen.getByLabelText('日付を選択'), { target: { value: '' } });
    await settle();
    fireEvent.click(screen.getAllByRole('button', { name: 'このコーデを着た' })[0]);
    const log = JSON.parse(localStorage.getItem('coordination.wearlog.v1') ?? '[]') as { date: string }[];
    expect(log.length).toBeGreaterThan(0);
    for (const e of log) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('編集画面の「今日着た」→「取り消す」', () => {
  it('leaves a record that was already there untouched, so nothing is lost', async () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    saveWardrobe(SAMPLE_WARDROBE);
    const before = [{ itemId: 's-tops-5', date: key, outfitId: 's-tops-5+s-bottoms-2' }];
    localStorage.setItem('coordination.wearlog.v1', JSON.stringify(before));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'クローゼットを編集 ›' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'ボルドーのニット' })).getByRole('button', { name: '今日着た' }));
    // 既に記録がある服は記録し直さない (コーデの記録が服だけの記録に置き換わり、取り消すと消えていた)
    expect(screen.getByText(/「ボルドーのニット」は今日着たとして記録済みです/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '取り消す' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('coordination.wearlog.v1') ?? '[]')).toEqual(before);
  });
});

describe('2 ページ目以降', () => {
  it('keeps the toast when an outfit on page 2 is worn, and stays on page 2', async () => {
    saveWardrobe(SAMPLE_WARDROBE);
    render(<App />);
    await screen.findAllByRole('article');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '別の案を見る' }));
    await settle();
    expect(within(screen.getAllByRole('article')[0]).getByText(/^#\d+$/).textContent).toBe('#6');
    fireEvent.click(screen.getAllByRole('button', { name: 'このコーデを着た' })[0]);
    await settle();
    expect(screen.getByText(/#6 のコーデを .* に着たとして記録しました/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '取り消す' })).toBeTruthy();
  });

  it('never shows an outfit twice across pages (1/15, 19℃, where limit-and-slice used to repeat one)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T10:00:00'));
    try {
      forecastApi.mockResolvedValue({ max: 19, min: 12 });
      saveWardrobe(SAMPLE_WARDROBE);
      render(<App />);
      await screen.findByText(/最高 19℃/);
      await settle();
      const seen: string[] = [];
      for (let p = 0; p < 3; p++) {
        // カードのアイテムは服の名前のグループ (人の絵の部品にも同じ名前があるので重複を除く)
        for (const a of screen.getAllByRole('article')) seen.push([...new Set(within(a).getAllByRole('group').map((g) => g.getAttribute('aria-label')))].sort().join('+'));
        fireEvent.click(screen.getByRole('button', { name: '別の案を見る' }));
        await settle();
      }
      expect(new Set(seen).size).toBe(seen.length);
    } finally {
      vi.useRealTimers();
    }
  });
});
