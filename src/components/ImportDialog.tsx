import { useRef, useState } from 'react';
import type { ClothingItem } from '../types';
import { CATEGORY_LABEL } from '../types';
import { fetchWardrobeFromSource, loadLastSource, saveLastSource } from '../lib/gist';
import { parseImportDetailed, type ImportResult, type MergeMode } from '../lib/storage';
import type { WearLog } from '../lib/wear';
import { Swatch } from './Swatch';

interface Props {
  existingCount: number;
  onApply: (items: ClothingItem[], mode: MergeMode, wearLog?: WearLog) => void;
  onClose: () => void;
}

interface Preview extends ImportResult {
  label: string;
}

export function ImportDialog({ existingCount, onApply, onClose }: Props) {
  const [source, setSource] = useState(() => loadLastSource());
  const [pasted, setPasted] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<MergeMode>('merge');
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fail = (e: unknown) => {
    setPreview(null);
    setError((e as Error).message || '読み込みに失敗しました');
  };

  const loadFromSource = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWardrobeFromSource(source);
      setPreview({ ...r, label: r.fileName ? `Gist: ${r.fileName}` : r.sourceUrl });
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  };

  const loadFromText = () => {
    setError(null);
    try {
      setPreview({ ...parseImportDetailed(pasted), label: '貼り付けた JSON' });
    } catch (e) {
      fail(e);
    }
  };

  const loadFromFile = async (file: File) => {
    setError(null);
    try {
      setPreview({ ...parseImportDetailed(await file.text()), label: `ファイル: ${file.name}` });
    } catch (e) {
      fail(e);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const apply = () => {
    if (!preview) return;
    if (preview.label.startsWith('Gist') || preview.label.startsWith('http')) saveLastSource(source.trim());
    onApply(preview.items, existingCount ? mode : 'replace', preview.wearLog);
  };

  const warningsToShow = preview ? (showAllWarnings ? preview.warnings : preview.warnings.slice(0, 5)) : [];

  return (
    <div className="import-dialog">
      <h3>クローゼットを取り込む</h3>

      <section className="import-section">
        <h4>Gist / URL から</h4>
        <p className="muted">
          Gist のページ URL、Gist の ID、Raw の URL のいずれでも読み込めます。Secret gist も URL があれば取得できます。
        </p>
        <div className="import-row">
          <input
            type="url"
            placeholder="https://gist.github.com/you/0123abcd..."
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && loadFromSource()}
          />
          <button type="button" className="btn primary" onClick={loadFromSource} disabled={loading || !source.trim()}>
            {loading ? '取得中…' : '読み込む'}
          </button>
        </div>
      </section>

      <section className="import-section">
        <h4>JSON を貼り付け</h4>
        <textarea
          rows={5}
          placeholder='[{"name":"白のTシャツ","category":"トップス","color":"白","seasons":"春,夏","warmth":1}]'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="import-row end">
          <button type="button" className="btn" onClick={loadFromText} disabled={!pasted.trim()}>
            貼り付けた内容を読み込む
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            ファイルを選ぶ
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,text/plain"
            hidden
            onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])}
          />
        </div>
      </section>

      {error && <p className="error import-error">{error}</p>}

      {preview && (
        <section className="import-preview">
          <h4>
            {preview.items.length} 件を読み込みました <span className="muted">({preview.label})</span>
          </h4>
          {preview.wearLog?.length ? <p className="muted">着用履歴 {preview.wearLog.length} 件も取り込みます。</p> : null}
          <ul className="preview-list">
            {preview.items.slice(0, 8).map((i) => (
              <li key={i.id}>
                <Swatch color={i.color} size={12} /> <span className="muted">{CATEGORY_LABEL[i.category]}</span> {i.name}
              </li>
            ))}
            {preview.items.length > 8 && <li className="muted">ほか {preview.items.length - 8} 件</li>}
          </ul>
          {preview.warnings.length > 0 && (
            <div className="warnings">
              <p>⚠ 補完した項目があります ({preview.warnings.length} 件)。取り込み後に編集できます。</p>
              <ul>
                {warningsToShow.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              {preview.warnings.length > 5 && !showAllWarnings && (
                <button type="button" className="link" onClick={() => setShowAllWarnings(true)}>
                  すべて表示
                </button>
              )}
            </div>
          )}
          {existingCount > 0 && (
            <div className="chips">
              <label className={`chip ${mode === 'merge' ? 'on' : ''}`}>
                <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                既存 {existingCount} 件に追加 (同じ ID は上書き)
              </label>
              <label className={`chip ${mode === 'replace' ? 'on' : ''}`}>
                <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                既存を置き換え
              </label>
            </div>
          )}
        </section>
      )}

      <div className="form-actions">
        <button type="button" className="btn primary" onClick={apply} disabled={!preview}>
          取り込む
        </button>
        <button type="button" className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
