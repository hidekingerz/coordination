// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageLoadError, loadImageData } from './imageLoad';

/**
 * jsdom の Image は画像を読まないので、src を入れたときの結果を差し替える。
 * behaviour(src, crossOrigin) が 'load' なら onload、'error' なら onerror を呼ぶ
 */
let behaviour: (src: string, crossOrigin: string | null) => 'load' | 'error';
let size = { w: 400, h: 200 };
let getImageData: () => ImageData;
const drawn: { w: number; h: number }[] = [];

class FakeImage {
  crossOrigin: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = size.w;
  naturalHeight = size.h;
  set src(v: string) {
    const r = behaviour(v, this.crossOrigin);
    queueMicrotask(() => (r === 'load' ? this.onload?.() : this.onerror?.()));
  }
}

beforeEach(() => {
  size = { w: 400, h: 200 };
  drawn.length = 0;
  behaviour = () => 'load';
  getImageData = () => ({ data: new Uint8ClampedArray(4) }) as ImageData;
  vi.stubGlobal('Image', FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { drawImage: () => drawn.push({ w: this.width, h: this.height }), getImageData: () => getImageData() } as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadImageData', () => {
  it('shrinks the image so the longer side is at most maxSide', async () => {
    const r = await loadImageData('https://example.com/a.jpg', 96);
    expect([r.width, r.height]).toEqual([96, 48]);
    expect(drawn).toEqual([{ w: 96, h: 48 }]);
    expect(r.previewUrl).toBe('https://example.com/a.jpg');
  });

  it('never enlarges a small image', async () => {
    size = { w: 40, h: 20 };
    const r = await loadImageData('https://example.com/a.jpg', 96);
    expect([r.width, r.height]).toEqual([40, 20]);
  });

  it('loads a file through an object URL, without asking for CORS', async () => {
    const seen: (string | null)[] = [];
    behaviour = (_src, co) => {
      seen.push(co);
      return 'load';
    };
    const r = await loadImageData(new File(['x'], 'a.png'));
    expect(r.previewUrl).toBe('blob:file');
    expect(seen).toEqual([null]);
  });

  it('asks for CORS on a URL, and tells a CORS refusal apart from a missing image', async () => {
    behaviour = (_src, co) => (co === 'anonymous' ? 'error' : 'load');
    await expect(loadImageData('https://example.com/a.jpg')).rejects.toMatchObject({ kind: 'cors' });
    behaviour = () => 'error';
    await expect(loadImageData('https://example.com/missing.jpg')).rejects.toMatchObject({ kind: 'network' });
  });

  it('frees the object URL when a file cannot be read', async () => {
    behaviour = () => 'error';
    await expect(loadImageData(new File(['x'], 'broken.png'))).rejects.toBeInstanceOf(ImageLoadError);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file');
  });

  it('reports CORS when the pixels cannot be read from a tainted canvas', async () => {
    getImageData = () => {
      throw new DOMException('tainted', 'SecurityError');
    };
    await expect(loadImageData('https://example.com/a.jpg')).rejects.toMatchObject({ kind: 'cors' });
    await expect(loadImageData(new File(['x'], 'a.png'))).rejects.toMatchObject({ kind: 'cors' });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file');
  });

  it('reports a decode error when the canvas has no 2D context', async () => {
    (HTMLCanvasElement.prototype.getContext as unknown as { mockImplementation: (f: () => null) => void }).mockImplementation(() => null);
    await expect(loadImageData('https://example.com/a.jpg')).rejects.toMatchObject({ kind: 'decode' });
  });
});
