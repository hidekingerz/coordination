// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DailyTemperature } from '../lib/weather';
import type { Location } from '../lib/location';
import { stubForecastWith } from '../test/forecastStub';

// 天気 API は呼ばずに、テストごとに結果を差し替える
// 予報 API の答え。fetch の差し替えにつないでいるので、呼ばれた回数は API への問い合わせ回数
const forecastApi = vi.fn<(date: Date, loc: Location) => Promise<DailyTemperature>>();

import { SuggestView } from './SuggestView';
import { closetTile } from './closetTestUtils';

function renderView() {
  return render(<SuggestView wardrobe={[]} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} onChangeWardrobe={() => {}} onImportWearLog={() => {}} />);
}

const openCloset = () => fireEvent.click(screen.getByRole('button', { name: 'クローゼットから選ぶ' }));
/** 気温の入力欄。隠れていれば「気温を変える」で開く */
const tempInput = () => {
  const existing = screen.queryByPlaceholderText('例: 18') as HTMLInputElement | null;
  if (existing) return existing;
  fireEvent.click(screen.getByRole('button', { name: '気温を変える' }));
  return screen.getByPlaceholderText('例: 18') as HTMLInputElement;
};
const dateInput = () => screen.getByLabelText('日付を選択') as HTMLInputElement;
// ラベル内に取得中の注記が入ることがあるので部分一致で探す
const locationSelect = () => {
  // ステータス行の地点ボタンを押すと選択肢が出る
  const existing = screen.queryByLabelText(/予報の地点/) as HTMLSelectElement | null;
  if (existing) return existing;
  fireEvent.click(screen.getByRole('button', { name: /地点を変える/ }));
  return screen.getByLabelText(/予報の地点/) as HTMLSelectElement;
};

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
  stubForecastWith(forecastApi);
  localStorage.clear();
  forecastApi.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SuggestView forecast', () => {
  it('fills the temperature with the forecast maximum and shows the source', async () => {
    forecastApi.mockResolvedValue({ max: 23.6, min: 17.2 });
    renderView();
    await waitFor(() => expect(tempInput().value).toBe('24'));
    expect(screen.getByText(/最高 24℃ \/ 最低 17℃/)).toBeTruthy();
    expect(screen.getByTestId('cond-status').textContent).toContain('東京');
    expect(forecastApi).toHaveBeenCalledTimes(1);
  });

  it('shows an error note and leaves the field empty when the fetch fails', async () => {
    forecastApi.mockRejectedValue(new Error('offline'));
    renderView();
    await screen.findByText(/予報を取得できませんでした。気温を入力してください/);
    // 予報が無いときは「気温を変える」を押さなくても入力欄が開いている
    expect((screen.getByPlaceholderText('例: 18') as HTMLInputElement).value).toBe('');
  });

  it('does not fetch for a date outside the forecast range', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 10 });
    renderView();
    await waitFor(() => expect(tempInput().value).toBe('20'));
    fireEvent.click(screen.getByRole('button', { name: '日付を指定' }));
    fireEvent.change(dateInput(), { target: { value: '2030-01-01' } });
    await screen.findByText('この日付の予報は取得できません');
    expect(forecastApi).toHaveBeenCalledTimes(1);
  });

  it('keeps a manually typed temperature even if the forecast arrives later', async () => {
    const d = deferred<DailyTemperature>();
    forecastApi.mockReturnValue(d.promise);
    renderView();
    fireEvent.change(tempInput(), { target: { value: '15' } });
    d.resolve({ max: 25, min: 18 });
    // 予報が届いても手入力が優先され、ステータスには手入力であることが出る。予報に戻すボタンで戻せる
    await screen.findByRole('button', { name: '予報に戻す' });
    expect(screen.getByTestId('cond-status').textContent).toContain('15℃ (手入力)');
    expect(tempInput().value).toBe('15');
  });

  it('clears a forecast-derived temperature when the date changes', async () => {
    forecastApi.mockResolvedValue({ max: 22, min: 15 });
    renderView();
    await waitFor(() => expect(tempInput().value).toBe('22'));
    fireEvent.click(screen.getByRole('button', { name: '日付を指定' }));
    fireEvent.change(dateInput(), { target: { value: '2030-01-01' } });
    expect(tempInput().value).toBe('');
  });

  it('refetches with the new location when it changes and remembers the choice', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 12 });
    renderView();
    await waitFor(() => expect(tempInput().value).toBe('20'));
    fireEvent.change(locationSelect(), { target: { value: 'osaka' } });
    await screen.findByText(/最高 20℃ \/ 最低 12℃/);
    expect(screen.getByTestId('cond-status').textContent).toContain('大阪');
    expect(forecastApi).toHaveBeenLastCalledWith(expect.any(Date), expect.objectContaining({ name: '大阪' }));
    expect(JSON.parse(localStorage.getItem('coordination.location.v1') ?? '{}').id).toBe('osaka');
  });
});

describe('SuggestView current location', () => {
  it('lets the user pick a preset while locating and ignores the late geolocation result', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 12 });
    let resolveGeo!: (pos: GeolocationPosition) => void;
    const geo = {
      getCurrentPosition: (ok: PositionCallback) => {
        resolveGeo = ok;
      },
    } as unknown as Geolocation;
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });

    renderView();
    await waitFor(() => expect(tempInput().value).toBe('20'));
    fireEvent.change(locationSelect(), { target: { value: 'current' } });
    expect(screen.getByText(/位置情報を取得中/)).toBeTruthy();
    expect(locationSelect().disabled).toBe(false);

    fireEvent.change(locationSelect(), { target: { value: 'osaka' } });
    await screen.findByText(/最高 20℃ \/ 最低 12℃/);
    expect(screen.getByTestId('cond-status').textContent).toContain('大阪');

    resolveGeo({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/位置情報を取得中/)).toBeNull();
    expect(screen.getByTestId('cond-status').textContent).toContain('大阪');
    expect(JSON.parse(localStorage.getItem('coordination.location.v1') ?? '{}').id).toBe('osaka');
  });
});

describe('SuggestView closet tiles', () => {
  it('adds a tile to the chips and the suggestions when pressed, and removes it from the chip', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 12 });
    const { SAMPLE_WARDROBE } = await import('../data/sample');
    render(<SuggestView wardrobe={SAMPLE_WARDROBE} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} onChangeWardrobe={() => {}} onImportWearLog={() => {}} />);
    await waitFor(() => expect(tempInput().value).toBe('20'));
    expect(screen.queryByRole('button', { name: 'アイテムを選ぶ' })).toBeNull();

    openCloset();
    fireEvent.click(screen.getByRole('button', { name: '今の条件に合う服だけ' })); // 季節に左右されないよう全件表示
    fireEvent.click(screen.getByRole('tab', { name: /トップス/ }));
    fireEvent.click(closetTile('ライトブルーのオックスフォードシャツ'));
    fireEvent.click(screen.getByRole('tab', { name: /シューズ/ }));
    fireEvent.click(closetTile('ブラックのローファー'));

    const chips = screen.getAllByTestId('must-chip');
    expect(chips.map((c) => c.textContent)).toEqual([expect.stringContaining('オックスフォードシャツ'), expect.stringContaining('ローファー')]);
    await waitFor(() => expect(screen.getByRole('region', { name: 'コーデ提案', busy: false })).toBeTruthy());
    const outfits = screen.getAllByRole('article');
    expect(outfits.length).toBeGreaterThan(0);
    for (const o of outfits) {
      expect(within(o).getAllByText(/オックスフォードシャツ/).length).toBeGreaterThan(0);
      expect(within(o).getAllByText(/ブラックのローファー/).length).toBeGreaterThan(0);
    }
    fireEvent.click(within(chips[1]).getByRole('button', { name: /外す/ }));
    expect(screen.getAllByTestId('must-chip')).toHaveLength(1);
  });

  it('recomputes right after a tile is pressed, and two quick presses both land', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 12 });
    const { SAMPLE_WARDROBE } = await import('../data/sample');
    render(<SuggestView wardrobe={SAMPLE_WARDROBE} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} onChangeWardrobe={() => {}} onImportWearLog={() => {}} />);
    await waitFor(() => expect(tempInput().value).toBe('20'));
    await screen.findAllByRole('article');
    openCloset();
    fireEvent.click(screen.getByRole('button', { name: '今の条件に合う服だけ' }));
    fireEvent.click(screen.getByRole('tab', { name: /トップス/ }));
    fireEvent.click(closetTile('白の無地Tシャツ'));
    expect(screen.getByRole('region', { name: 'コーデ提案' }).getAttribute('aria-busy')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: /ボトムス/ }));
    fireEvent.click(closetTile('インディゴデニム'));
    expect(screen.getAllByTestId('must-chip')).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole('region', { name: 'コーデ提案', busy: false })).toBeTruthy());
  });
});

describe('SuggestView must-include conflicts', () => {
  it('explains that the chosen items cannot be worn together instead of the generic empty message', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 12 });
    const { SAMPLE_WARDROBE } = await import('../data/sample');
    render(<SuggestView wardrobe={SAMPLE_WARDROBE} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} onChangeWardrobe={() => {}} onImportWearLog={() => {}} />);
    await waitFor(() => expect(tempInput().value).toBe('20'));
    openCloset();
    fireEvent.click(screen.getByRole('button', { name: '今の条件に合う服だけ' }));
    // 同じカテゴリは置き換えになるので、両立しない組み合わせはセットアップ + トップスで作る
    fireEvent.click(screen.getByRole('tab', { name: /ワンピース/ }));
    fireEvent.click(closetTile('ネイビーのセットアップ'));
    fireEvent.click(screen.getByRole('tab', { name: /トップス/ }));
    fireEvent.click(closetTile('白の無地Tシャツ'));
    expect(await screen.findByText(/選んだアイテムを同時に着る組み合わせ/)).toBeTruthy();
    expect(screen.queryByText(/トップスとボトムス（またはワンピース）がそれぞれ1点以上必要/)).toBeNull();
  });

  it('replaces the chip when a second item of the same category is pressed', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 12 });
    const { SAMPLE_WARDROBE } = await import('../data/sample');
    render(<SuggestView wardrobe={SAMPLE_WARDROBE} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} onChangeWardrobe={() => {}} onImportWearLog={() => {}} />);
    await waitFor(() => expect(tempInput().value).toBe('20'));
    openCloset();
    fireEvent.click(screen.getByRole('button', { name: '今の条件に合う服だけ' }));
    fireEvent.click(screen.getByRole('tab', { name: /トップス/ }));
    fireEvent.click(closetTile('白の無地Tシャツ'));
    fireEvent.click(closetTile('ブラックのTシャツ'));
    const chips = screen.getAllByTestId('must-chip').map((c) => c.textContent);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toContain('ブラックのTシャツ');
    expect(closetTile('白の無地Tシャツ').getAttribute('aria-pressed')).toBe('false');
    await waitFor(() => expect(screen.getByRole('region', { name: 'コーデ提案', busy: false })).toBeTruthy());
    expect(screen.queryByText(/選んだアイテムを同時に着る組み合わせ/)).toBeNull();
  });

  it('keeps a cardigan and a coat together so the layered outfit is suggested', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 12 });
    const { SAMPLE_WARDROBE } = await import('../data/sample');
    render(<SuggestView wardrobe={SAMPLE_WARDROBE} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} onChangeWardrobe={() => {}} onImportWearLog={() => {}} />);
    await waitFor(() => expect(tempInput().value).toBe('20'));
    openCloset();
    fireEvent.click(screen.getByRole('button', { name: '今の条件に合う服だけ' }));
    fireEvent.click(closetTile('グレーのカーディガン'));
    fireEvent.click(closetTile('ネイビーのステンカラーコート'));
    expect(screen.getAllByTestId('must-chip')).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole('region', { name: 'コーデ提案', busy: false })).toBeTruthy());
    const first = screen.getAllByRole('article')[0].textContent ?? '';
    expect(first).toContain('グレーのカーディガン');
    expect(first).toContain('ネイビーのステンカラーコート');
  });
});

describe('SuggestView date shortcuts', () => {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  it('defaults to today, switches to tomorrow with the shortcut and refetches the forecast', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 12 });
    renderView();
    await waitFor(() => expect(tempInput().value).toBe('20'));
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    expect(screen.getByRole('button', { name: '今日' }).getAttribute('aria-pressed')).toBe('true');
    // 既定ではカレンダー入力は隠れている
    expect(screen.queryByLabelText('日付を選択')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '明日' }));
    expect(screen.getByRole('button', { name: '明日' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(forecastApi).toHaveBeenCalledTimes(2));
    const passed = forecastApi.mock.calls[1][0];
    expect(key(passed)).toBe(key(tomorrow));
  });

  it('shows the calendar input only when "日付を指定" is chosen, and marks it active for other dates', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 12 });
    renderView();
    await waitFor(() => expect(tempInput().value).toBe('20'));
    fireEvent.click(screen.getByRole('button', { name: '日付を指定' }));
    const input = screen.getByLabelText('日付を選択') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '2030-01-01' } });
    expect(screen.getByRole('button', { name: '日付を指定' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '今日' }).getAttribute('aria-pressed')).toBe('false');
    // 今日に戻すとカレンダーは閉じる
    fireEvent.click(screen.getByRole('button', { name: '今日' }));
    expect(screen.queryByLabelText('日付を選択')).toBeNull();
  });
});

describe('SuggestView empty wardrobe', () => {
  it('offers import and sample data in place, without the old registration hint', async () => {
    forecastApi.mockResolvedValue({ max: 20, min: 12 });
    const onChangeWardrobe = vi.fn();
    render(
      <SuggestView wardrobe={[]} wearLog={[]} onWear={() => {}} onUnwear={() => {}} onEdit={() => {}} onChangeWardrobe={onChangeWardrobe} onImportWearLog={() => {}} />,
    );
    expect(screen.queryByText('先にクローゼットへアイテムを登録してください。')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gist / JSON から取り込む' }));
    expect(screen.getByRole('heading', { name: 'クローゼットを取り込む' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'サンプルデータを読み込む' }));
    expect(onChangeWardrobe).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 's-tops-1' })]));
  });
});
