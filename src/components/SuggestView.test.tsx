// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DailyTemperature } from '../lib/weather';

// 天気 API は呼ばずに、テストごとに結果を差し替える
const getForecast = vi.fn<(date: Date, loc: { name: string }) => Promise<DailyTemperature>>();
vi.mock('../lib/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/weather')>();
  return { ...actual, getForecast: (date: Date, loc: { name: string }) => getForecast(date, loc) };
});

import { SuggestView } from './SuggestView';

function renderView() {
  return render(<SuggestView wardrobe={[]} wearLog={[]} onWear={() => {}} onUnwear={() => {}} />);
}

const tempInput = () => screen.getByPlaceholderText('例: 18') as HTMLInputElement;
const dateInput = () => document.querySelector('input[type=date]') as HTMLInputElement;
const locationSelect = () => screen.getByLabelText('予報の地点') as HTMLSelectElement;

/** 解決タイミングを手で制御できる Promise */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  getForecast.mockReset();
});
afterEach(cleanup);

describe('SuggestView forecast', () => {
  it('fills the temperature with the forecast maximum and shows the source', async () => {
    getForecast.mockResolvedValue({ max: 23.6, min: 17.2 });
    renderView();
    await waitFor(() => expect(tempInput().value).toBe('24'));
    expect(screen.getByText('東京の予報: 最高 24℃ / 最低 17℃')).toBeTruthy();
    expect(getForecast).toHaveBeenCalledTimes(1);
  });

  it('shows an error note and leaves the field empty when the fetch fails', async () => {
    getForecast.mockRejectedValue(new Error('offline'));
    renderView();
    await screen.findByText('予報を取得できませんでした。手入力できます');
    expect(tempInput().value).toBe('');
  });

  it('does not fetch for a date outside the forecast range', async () => {
    getForecast.mockResolvedValue({ max: 20, min: 10 });
    renderView();
    await waitFor(() => expect(tempInput().value).toBe('20'));
    fireEvent.change(dateInput(), { target: { value: '2030-01-01' } });
    await screen.findByText('この日付の予報は取得できません');
    expect(getForecast).toHaveBeenCalledTimes(1);
  });

  it('keeps a manually typed temperature even if the forecast arrives later', async () => {
    const d = deferred<DailyTemperature>();
    getForecast.mockReturnValue(d.promise);
    renderView();
    fireEvent.change(tempInput(), { target: { value: '15' } });
    d.resolve({ max: 25, min: 18 });
    await screen.findByText('東京の予報: 最高 25℃ / 最低 18℃');
    expect(tempInput().value).toBe('15');
  });

  it('clears a forecast-derived temperature when the date changes', async () => {
    getForecast.mockResolvedValue({ max: 22, min: 15 });
    renderView();
    await waitFor(() => expect(tempInput().value).toBe('22'));
    fireEvent.change(dateInput(), { target: { value: '2030-01-01' } });
    expect(tempInput().value).toBe('');
  });

  it('refetches with the new location when it changes and remembers the choice', async () => {
    getForecast.mockResolvedValue({ max: 20, min: 12 });
    renderView();
    await waitFor(() => expect(tempInput().value).toBe('20'));
    fireEvent.change(locationSelect(), { target: { value: 'osaka' } });
    await screen.findByText('大阪の予報: 最高 20℃ / 最低 12℃');
    expect(getForecast).toHaveBeenLastCalledWith(expect.any(Date), expect.objectContaining({ name: '大阪' }));
    expect(JSON.parse(localStorage.getItem('coordination.location.v1') ?? '{}').id).toBe('osaka');
  });
});
