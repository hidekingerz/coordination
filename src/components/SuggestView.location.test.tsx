// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DailyTemperature } from '../lib/weather';
import type { Location } from '../lib/location';

const getForecast = vi.fn<(date: Date, loc: Location) => Promise<DailyTemperature>>();
vi.mock('../lib/weather', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/weather')>()), getForecast: (d: Date, l: Location) => getForecast(d, l) }));
const detect = vi.fn<() => Promise<Location>>();
vi.mock('../lib/location', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/location')>()), detectCurrentLocation: () => detect() }));

import { GeolocationFailure } from '../lib/location';
import { SuggestView } from './SuggestView';
import { SAMPLE_WARDROBE } from '../data/sample';

beforeEach(() => {
  localStorage.clear();
  getForecast.mockReset();
  getForecast.mockImplementation(async (_d, l) => (l.id === 'osaka' ? { max: 22, min: 15 } : { max: 15, min: 8 }));
  detect.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderView = () =>
  render(<SuggestView wardrobe={SAMPLE_WARDROBE} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} onChangeWardrobe={() => {}} onImportWearLog={() => {}} />);
const status = () => screen.getByTestId('cond-status').textContent ?? '';
const openLocation = () => fireEvent.click(screen.getByRole('button', { name: /地点を変える/ }));
const choose = (value: string) => fireEvent.change(screen.getByLabelText('予報の地点'), { target: { value } });

describe('SuggestView: forecast location', () => {
  it('switches to a preset city, fetches its forecast and remembers it', async () => {
    renderView();
    await screen.findByText(/最高 15℃/);
    openLocation();
    choose('osaka');
    expect(await screen.findByText(/最高 22℃ \/ 最低 15℃/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^大阪/ })).toBeTruthy();
    expect(screen.queryByLabelText('予報の地点')).toBeNull(); // 選んだら閉じる
    expect(JSON.parse(localStorage.getItem('coordination.location.v1')!).id).toBe('osaka');
  });

  it('uses the current position when it can be found', async () => {
    detect.mockResolvedValue({ id: 'current', name: '現在地', latitude: 43, longitude: 141 });
    renderView();
    await screen.findByText(/最高 15℃/);
    openLocation();
    choose('current');
    await waitFor(() => expect(getForecast.mock.calls[getForecast.mock.calls.length - 1][1].id).toBe('current'));
    expect(screen.getByRole('button', { name: /^現在地/ })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('coordination.location.v1')!).latitude).toBe(43);
  });

  it('says it is waiting for the position, then explains a failure and keeps the old city', async () => {
    let reject!: (e: Error) => void;
    detect.mockReturnValue(new Promise((_r, j) => (reject = j)));
    renderView();
    await screen.findByText(/最高 15℃/);
    openLocation();
    choose('current');
    expect(screen.getByText(/位置情報を取得中/)).toBeTruthy();
    await act(async () => reject(new GeolocationFailure('denied')));
    expect(screen.getByText(/位置情報の利用が許可されていません/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^東京/ })).toBeTruthy();
  });

  it('uses a general message when the failure is not an Error', async () => {
    detect.mockRejectedValue('denied');
    renderView();
    await screen.findByText(/最高 15℃/);
    openLocation();
    choose('current');
    expect(await screen.findByText('位置情報を取得できませんでした')).toBeTruthy();
  });

  it('ignores a late position after another city was chosen', async () => {
    let resolve!: (l: Location) => void;
    detect.mockReturnValue(new Promise((r) => (resolve = r)));
    renderView();
    await screen.findByText(/最高 15℃/);
    openLocation();
    choose('current');
    choose('osaka');
    await screen.findByText(/最高 22℃/);
    await act(async () => resolve({ id: 'current', name: '現在地', latitude: 43, longitude: 141 }));
    expect(screen.getByRole('button', { name: /^大阪/ })).toBeTruthy();
  });
});

describe('SuggestView: forecast states', () => {
  it('says the forecast is loading until it arrives', async () => {
    let resolve!: (t: DailyTemperature) => void;
    getForecast.mockReturnValue(new Promise((r) => (resolve = r)));
    renderView();
    expect(status()).toContain('予報を取得中…');
    await act(async () => resolve({ max: 18, min: 10 }));
    expect(status()).toContain('最高 18℃ / 最低 10℃');
  });

  it('notes that the manual temperature is in use while a forecast exists', async () => {
    renderView();
    await screen.findByText(/最高 15℃/);
    fireEvent.click(screen.getByRole('button', { name: '気温を変える' }));
    expect(screen.getByText('予報の最高気温を使っています')).toBeTruthy();
  });
});
