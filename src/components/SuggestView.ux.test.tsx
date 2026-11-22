// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DailyTemperature } from '../lib/weather';
import type { Location } from '../lib/location';
import { stubForecastWith } from '../test/forecastStub';

// 予報 API の答え。fetch の差し替えにつないでいるので、呼ばれた回数は API への問い合わせ回数
const forecastApi = vi.fn<(date: Date, loc: Location) => Promise<DailyTemperature>>();

import { SuggestView } from './SuggestView';
import { SAMPLE_WARDROBE } from '../data/sample';
import type { WearLog } from '../lib/wear';

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

function renderView(wearLog: WearLog = []) {
  return render(<SuggestView wardrobe={SAMPLE_WARDROBE} wearLog={wearLog} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} onChangeWardrobe={() => {}} onImportWearLog={() => {}} />);
}
const articlesText = () => screen.getAllByRole('article').map((a) => a.textContent ?? '');

describe('auto suggestions', () => {
  it('shows outfits without pressing a button and has no suggest button', async () => {
    renderView();
    const outfits = await screen.findAllByRole('article');
    expect(outfits.length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'コーデを提案する' })).toBeNull();
  });

  it('recomputes when the formality segment changes', async () => {
    renderView();
    await screen.findAllByRole('article');
    const before = articlesText();
    const formal = screen.getByRole('button', { name: 'フォーマル' });
    fireEvent.click(formal);
    expect(formal.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(articlesText()).not.toEqual(before));
    expect(screen.queryByRole('combobox', { name: /テイスト/ })).toBeNull();
  });

  it('pages through more outfits with 別の案を見る and back', async () => {
    renderView();
    await screen.findAllByRole('article');
    const first = articlesText();
    fireEvent.click(screen.getByRole('button', { name: '別の案を見る' }));
    await waitFor(() => expect(articlesText()).not.toEqual(first));
    expect(screen.getAllByRole('article')[0].textContent).toContain('#6');
    fireEvent.click(screen.getByRole('button', { name: '前の案に戻る' }));
    await waitFor(() => expect(articlesText()).toEqual(first));
  });
});

describe('always-visible conditions', () => {
  it('shows the status line and keeps the temperature input behind 気温を変える, with no fold', async () => {
    renderView();
    await screen.findByText(/最高 20℃ \/ 最低 12℃/);
    const status = screen.getByTestId('cond-status');
    expect(status.textContent).toContain('東京');
    expect(status.textContent).toContain('ふつうの厚さでよさそう'); // 数字と入れ子括弧の代わりに一言で
    expect(screen.getByText('ふつうの厚さでよさそう').getAttribute('title')).toBe('目安の厚さ 3/5 (春秋 (ふつう))');
    expect(screen.queryByRole('button', { name: /条件を絞る/ })).toBeNull();
    expect(screen.queryByPlaceholderText('例: 18')).toBeNull();
    expect(screen.queryByLabelText(/予報の地点/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '気温を変える' }));
    const temp = screen.getByPlaceholderText('例: 18') as HTMLInputElement;
    expect(temp.value).toBe('20');
    expect(screen.queryByRole('button', { name: '予報に戻す' })).toBeNull();
    fireEvent.change(temp, { target: { value: '12' } });
    expect(status.textContent).toContain('12℃ (手入力)');
    fireEvent.click(screen.getByRole('button', { name: '予報に戻す' }));
    expect((screen.getByPlaceholderText('例: 18') as HTMLInputElement).value).toBe('20');
    expect(screen.queryByRole('button', { name: '予報に戻す' })).toBeNull();
  });

  it('opens the temperature input by itself when the forecast is unavailable', async () => {
    forecastApi.mockRejectedValue(new Error('offline'));
    renderView();
    await screen.findByText(/気温を入力してください/);
    expect(screen.getByPlaceholderText('例: 18')).toBeTruthy();
  });

  it('opens the location choices from the status line', async () => {
    renderView();
    await screen.findByText(/最高 20℃/);
    fireEvent.click(screen.getByRole('button', { name: /地点を変える/ }));
    const select = screen.getByLabelText(/予報の地点/) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'osaka' } });
    await screen.findByText(/大阪/);
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
});

describe('compact outfit cards', () => {
  it('keeps figure, items and the wear button visible but folds reasons and score bars', async () => {
    renderView();
    const [card] = await screen.findAllByRole('article');
    expect(within(card).getByRole('button', { name: 'このコーデを着た' })).toBeTruthy();
    // 根拠 (✓) と内訳のバーは「根拠を見る」の折りたたみの中にあり、最初は閉じている
    const details = within(card).getByText('根拠を見る').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getAllByRole('meter').map((m) => m.getAttribute('aria-label'))).toEqual(['色', '厚さ', 'テイスト', '季節']);
    expect(within(details).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(card).getAllByRole('meter')).toHaveLength(4); // 折りたたみの外にバーは無い
  });
});

describe('colour mode (#67)', () => {
  it('keeps the chooser behind a status-line link, remembers the choice and restates it in the reasons', async () => {
    renderView();
    await screen.findByText(/最高 20℃/);
    // 閉じている間はセグメントが無い (条件欄の高さを増やさない)
    expect(screen.queryByRole('group', { name: '色合わせの基準' })).toBeNull();
    const link = screen.getByRole('button', { name: /^色合わせ: 標準/ });
    fireEvent.click(link);
    const group = screen.getByRole('group', { name: '色合わせの基準' });
    const italian = within(group).getByRole('button', { name: 'イタリア流' });
    expect(italian.getAttribute('title')).toContain('ボルドー');
    fireEvent.click(italian);
    expect(italian.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/紺・グレーの土台に/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^色合わせ: イタリア流/ })).toBeTruthy();
    expect(localStorage.getItem('coordination.colorMode.v1')).toBe('italian');
    await waitFor(() => expect(articlesText().join('')).toMatch(/アズーロ・エ・マローネ|トーン・オン・トーン|グレー × ブラウン/));
  });

  it('restores the remembered mode on the next visit', async () => {
    localStorage.setItem('coordination.colorMode.v1', 'british');
    renderView();
    await screen.findByText(/最高 20℃/);
    expect(screen.getByRole('button', { name: /^色合わせ: イギリス流/ })).toBeTruthy();
  });
});
