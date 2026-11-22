// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DailyTemperature } from '../lib/weather';
import { stubForecastWith } from '../test/forecastStub';
import type { Location } from '../lib/location';

// 予報 API の答え。fetch の差し替えにつないでいるので、呼ばれた回数は API への問い合わせ回数
const forecastApi = vi.fn<(date: Date, loc: Location) => Promise<DailyTemperature>>();
/**
 * ブラウザの位置情報 (navigator.geolocation) の答え。座標で解決すれば成功、
 * { code } で reject すれば失敗 (1: 許可されていない、2: 取得できない、3: 時間切れ)
 */
const detect = vi.fn<() => Promise<{ latitude: number; longitude: number }>>();
const fakeGeolocation = {
  getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => {
    detect().then(
      (coords) => ok({ coords } as GeolocationPosition),
      (e: { code: number }) => fail({ code: e.code, message: 'test' } as GeolocationPositionError),
    );
  },
} as unknown as Geolocation;

import { SuggestView } from './SuggestView';
import { SAMPLE_WARDROBE } from '../data/sample';

beforeEach(() => {
  stubForecastWith(forecastApi);
  localStorage.clear();
  forecastApi.mockReset();
  forecastApi.mockImplementation(async (_d, l) => (l.id === 'osaka' ? { max: 22, min: 15 } : { max: 15, min: 8 }));
  detect.mockReset();
  Object.defineProperty(navigator, 'geolocation', { value: fakeGeolocation, configurable: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    detect.mockResolvedValue({ latitude: 43, longitude: 141 });
    renderView();
    await screen.findByText(/最高 15℃/);
    openLocation();
    choose('current');
    await waitFor(() => expect(forecastApi.mock.calls[forecastApi.mock.calls.length - 1][1].id).toBe('current'));
    expect(screen.getByRole('button', { name: /^現在地/ })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('coordination.location.v1')!).latitude).toBe(43);
  });

  it('says it is waiting for the position, then explains a failure and keeps the old city', async () => {
    let reject!: (e: { code: number }) => void;
    detect.mockReturnValue(new Promise((_r, j) => (reject = j)));
    renderView();
    await screen.findByText(/最高 15℃/);
    openLocation();
    choose('current');
    expect(screen.getByText(/位置情報を取得中/)).toBeTruthy();
    await act(async () => reject({ code: 1 }));
    expect(screen.getByText(/位置情報の利用が許可されていません/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^東京/ })).toBeTruthy();
  });

  it('explains a time-out', async () => {
    detect.mockRejectedValue({ code: 3 });
    renderView();
    await screen.findByText(/最高 15℃/);
    openLocation();
    choose('current');
    expect(await screen.findByText(/位置情報の取得が時間切れになりました/)).toBeTruthy();
  });

  it('ignores a late position after another city was chosen', async () => {
    let resolve!: (c: { latitude: number; longitude: number }) => void;
    detect.mockReturnValue(new Promise((r) => (resolve = r)));
    renderView();
    await screen.findByText(/最高 15℃/);
    openLocation();
    choose('current');
    choose('osaka');
    await screen.findByText(/最高 22℃/);
    await act(async () => resolve({ latitude: 43, longitude: 141 }));
    expect(screen.getByRole('button', { name: /^大阪/ })).toBeTruthy();
  });
});

describe('SuggestView: forecast states', () => {
  it('says the forecast is loading until it arrives', async () => {
    let resolve!: (t: DailyTemperature) => void;
    forecastApi.mockReturnValue(new Promise((r) => (resolve = r)));
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
