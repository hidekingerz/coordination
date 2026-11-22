// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// 画像の読み込み (Canvas) は jsdom では動かないので、読み込んだ画素だけを差し替える
const loadImageData = vi.fn();
vi.mock('../lib/imageLoad', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/imageLoad')>()), loadImageData: (...a: unknown[]) => loadImageData(...a) }));

import { ImageLoadError } from '../lib/imageLoad';
import { ImageColorPicker } from './ImageColorPicker';

/** 白い背景の中央に、指定した色の四角が 1 つか 2 つある画像の画素 */
function picture(colors: [number, number, number][], w = 32, h = 32) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = x >= 6 && x < 26 && y >= 6 && y < 26;
      const c = inside ? colors[x < 16 || colors.length === 1 ? 0 : 1] : [255, 255, 255];
      data.set([...c, 255], (y * w + x) * 4);
    }
  return { data, width: w, height: h, previewUrl: 'blob:preview' };
}

afterEach(() => {
  cleanup();
  loadImageData.mockReset();
});

function renderPicker(imageUrl = '') {
  const onPick = vi.fn();
  const onExtracted = vi.fn();
  render(<ImageColorPicker imageUrl={imageUrl} onPick={onPick} onExtracted={onExtracted} />);
  return { onPick, onExtracted };
}
const chooseFile = () => {
  const input = screen.getByLabelText('画像ファイル') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'shirt.png', { type: 'image/png' })] } });
};

describe('ImageColorPicker', () => {
  it('extracts the colours of a picked photo, ignoring the plain background, and fills the main colour', async () => {
    loadImageData.mockResolvedValue(picture([[200, 30, 40]]));
    const { onExtracted } = renderPicker();
    chooseFile();
    expect(await screen.findByText(/主色に レッド を入れました/)).toBeTruthy();
    expect(screen.getByText(/背景とみなした色は除いています/)).toBeTruthy();
    const [main, sub] = onExtracted.mock.calls[0];
    expect(main).toMatch(/^#[0-9a-f]{6}$/);
    expect(sub).toBeNull();
  });

  it('also fills the sub colour when a second, clearly different colour covers enough of the item', async () => {
    loadImageData.mockResolvedValue(picture([[200, 30, 40], [30, 40, 120]]));
    const { onExtracted } = renderPicker();
    chooseFile();
    expect(await screen.findByText(/副色に .+ も入れました/)).toBeTruthy();
    expect(onExtracted.mock.calls[0][1]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('lets a candidate be used as the main or the sub colour', async () => {
    loadImageData.mockResolvedValue(picture([[200, 30, 40]]));
    const { onPick } = renderPicker();
    chooseFile();
    const first = (await screen.findAllByRole('listitem'))[0];
    const hex = within(first).getByText(/^#[0-9a-f]{6}$/).textContent!;
    fireEvent.click(screen.getAllByRole('button', { name: '主色に' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '副色に' })[0]);
    expect(onPick.mock.calls).toEqual([
      [hex, 'main'],
      [hex, 'sub'],
    ]);
  });

  it('reads the image URL from the form, and only when one is given', async () => {
    loadImageData.mockResolvedValue(picture([[200, 30, 40]]));
    renderPicker('');
    expect((screen.getByRole('button', { name: '画像URLから抽出' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderPicker(' https://example.com/shirt.jpg ');
    fireEvent.click(screen.getByRole('button', { name: '画像URLから抽出' }));
    await screen.findByText(/主色に .+ を入れました/);
    expect(loadImageData).toHaveBeenCalledWith('https://example.com/shirt.jpg');
  });

  it('shows the reason when the image cannot be read, such as CORS', async () => {
    loadImageData.mockRejectedValue(new ImageLoadError('この画像は配信元の制限 (CORS) で色を取り出せません', 'cors'));
    renderPicker('https://example.com/shirt.jpg');
    fireEvent.click(screen.getByRole('button', { name: '画像URLから抽出' }));
    expect(await screen.findByText(/CORS/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '主色に' })).toBeNull();
  });

  it('says so when no colour can be found', async () => {
    loadImageData.mockResolvedValue({ data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4, previewUrl: 'blob:x' }); // 透明だけ
    renderPicker();
    chooseFile();
    expect(await screen.findByText('色を取り出せませんでした。別の画像を試してください')).toBeTruthy();
  });

  it('opens the file chooser from the button, and frees the previous preview when a new photo is read', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    loadImageData.mockResolvedValueOnce(picture([[200, 30, 40]])).mockResolvedValueOnce({ ...picture([[30, 40, 120]]), previewUrl: 'blob:second' });
    renderPicker();
    const input = screen.getByLabelText('画像ファイル') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: '写真・画像ファイルを選ぶ' }));
    expect(click).toHaveBeenCalled();
    chooseFile();
    await screen.findByText(/主色に レッド を入れました/);
    chooseFile();
    await screen.findByText(/主色に ブルー を入れました|主色に ネイビー を入れました/);
    expect(revoke).toHaveBeenCalledWith('blob:preview');
    revoke.mockRestore();
  });

  it('says the photo is analysed on the device', () => {
    renderPicker();
    expect(screen.getByText(/写真は端末内で解析され、どこにも送信されません/)).toBeTruthy();
  });
});
