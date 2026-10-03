/** ブラウザで画像 (ファイル or URL) を小さく描画して画素を取り出す */

export interface LoadedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** プレビュー用の URL (File のときは objectURL。使い終わったら revoke する) */
  previewUrl: string;
}

export class ImageLoadError extends Error {
  constructor(
    message: string,
    public readonly kind: 'cors' | 'decode' | 'network',
  ) {
    super(message);
  }
}

function loadElement(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageLoadError('画像を読み込めませんでした。URL が正しいか、画像が公開されているか確認してください', 'network'));
    img.src = src;
  });
}

/**
 * 画像を最大 maxSide px に縮小して画素を返す。
 * URL の場合は CORS 許可が必要。許可されていない画像は取り出せない (キャンバスが汚染される) ので、
 * その場合は ImageLoadError('cors') を投げる。
 */
export async function loadImageData(source: File | string, maxSide = 96): Promise<LoadedImage> {
  const isFile = typeof source !== 'string';
  const url = isFile ? URL.createObjectURL(source) : source;
  let img: HTMLImageElement;
  try {
    img = await loadElement(url, !isFile);
  } catch (e) {
    if (isFile) {
      URL.revokeObjectURL(url);
      throw e;
    }
    // crossOrigin 付きで失敗した URL が素の読み込みなら通るなら、画像は存在するが CORS 不許可
    const plain = await loadElement(url, false).catch(() => null);
    if (plain) {
      throw new ImageLoadError(
        'この画像は配信元の制限 (CORS) で色を取り出せません。画像をダウンロードして「写真・画像ファイルを選ぶ」から読み込んでください',
        'cors',
      );
    }
    throw e;
  }
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ImageLoadError('この環境では画像を解析できません', 'decode');
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    return { data, width: w, height: h, previewUrl: url };
  } catch {
    if (isFile) URL.revokeObjectURL(url);
    throw new ImageLoadError(
      'この画像は配信元の制限 (CORS) で色を取り出せません。画像をダウンロードして「ファイルを選ぶ」から読み込んでください',
      'cors',
    );
  }
}
