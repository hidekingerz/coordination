import { useEffect, useRef, useState } from 'react';
import { colorLabel } from '../lib/color';
import { extractPalette, suggestSubColor, type PaletteEntry } from '../lib/imageColor';
import { loadImageData } from '../lib/imageLoad';
import { Swatch } from './Swatch';

interface Props {
  /** フォームの画像 URL 欄の値。あれば「URL の画像から抽出」が使える */
  imageUrl: string;
  onPick: (hex: string, target: 'main' | 'sub') => void;
  /** 抽出直後に主色 (と条件を満たせば副色) を自動で入れる */
  onExtracted?: (main: string, sub: string | null) => void;
}

export function ImageColorPicker({ imageUrl, onPick, onExtracted }: Props) {
  const [palette, setPalette] = useState<PaletteEntry[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const run = async (source: File | string) => {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const img = await loadImageData(source);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = typeof source === 'string' ? null : img.previewUrl;
      setPreview(img.previewUrl);
      const result = extractPalette(img.data, img.width, img.height);
      if (result.colors.length === 0) {
        setError('色を取り出せませんでした。別の画像を試してください');
        setPalette(null);
        return;
      }
      setPalette(result.colors);
      const sub = suggestSubColor(result.colors);
      onExtracted?.(result.colors[0].hex, sub?.hex ?? null);
      setNote(
        (result.backgroundRemoved ? '背景とみなした色は除いています。' : '背景は除いていません (全体から抽出)。') +
          ` 主色に ${colorLabel(result.colors[0].hex)} を入れました${sub ? `。副色に ${colorLabel(sub.hex)} も入れました` : ''}。違っていれば下の候補から選び直せます`,
      );
    } catch (e) {
      setError((e as Error).message || '画像を読み込めませんでした');
      setPalette(null);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <fieldset className="image-color">
      <legend>画像から色を抽出</legend>
      <div className="import-row">
        <button type="button" className="btn small" onClick={() => fileRef.current?.click()} disabled={loading}>
          写真・画像ファイルを選ぶ
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => run(imageUrl.trim())}
          disabled={loading || !imageUrl.trim()}
          title={imageUrl.trim() ? '画像URL欄の画像から抽出' : '先に下の画像URLを入れてください'}
        >
          画像URLから抽出
        </button>
        {loading && <span className="muted">解析中…</span>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => e.target.files?.[0] && run(e.target.files[0])}
        />
      </div>
      {error && <p className="error">{error}</p>}
      {palette && (
        <div className="palette-result">
          {preview && <img className="palette-preview" src={preview} alt="" />}
          <ul className="palette-list">
            {palette.map((c) => (
              <li key={c.hex}>
                <Swatch color={c.hex} size={22} />
                <span className="palette-name">
                  {colorLabel(c.hex)} <code>{c.hex}</code>
                </span>
                <span className="muted">{Math.round(c.share * 100)}%</span>
                <button type="button" className="btn small" onClick={() => onPick(c.hex, 'main')}>
                  主色に
                </button>
                <button type="button" className="btn small" onClick={() => onPick(c.hex, 'sub')}>
                  副色に
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {note && <p className="muted palette-note">{note}</p>}
      <p className="muted palette-help">写真は端末内で解析され、どこにも送信されません。背景が無地の物撮り写真だと精度が上がります。</p>
    </fieldset>
  );
}
