// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DailyTemperature } from '../lib/weather';

const getForecast = vi.fn<(date: Date, loc: { name: string }) => Promise<DailyTemperature>>();
vi.mock('../lib/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/weather')>();
  return { ...actual, getForecast: (date: Date, loc: { name: string }) => getForecast(date, loc) };
});

import { SuggestView } from './SuggestView';
import { SAMPLE_WARDROBE } from '../data/sample';
import type { WearLog } from '../lib/wear';

beforeEach(() => {
  localStorage.clear();
  getForecast.mockReset();
  getForecast.mockResolvedValue({ max: 20, min: 12 });
});
afterEach(cleanup);

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
    expect(status.textContent).toMatch(/目安の厚さ: 3/);
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
    getForecast.mockRejectedValue(new Error('offline'));
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
    const details = card.querySelector('details') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
    expect(within(card).getByText('根拠を見る')).toBeTruthy();
    // 根拠 (✓) とバーは details の中
    expect(details.querySelector('.reasons')).toBeTruthy();
    expect(details.querySelector('.breakdown')).toBeTruthy();
  });
});
