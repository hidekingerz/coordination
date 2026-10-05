import { useEffect, useState } from 'react';
import type { BottomsShape, Category, ClothingItem, Formality, Season, Sleeve, Warmth } from '../types';
import {
  ALL_BOTTOMS_SHAPES,
  ALL_CATEGORIES,
  ALL_FORMALITIES,
  ALL_SEASONS,
  ALL_SLEEVES,
  BOTTOMS_SHAPE_LABEL,
  CATEGORY_LABEL,
  FORMALITY_LABEL,
  SEASON_LABEL,
  SLEEVE_LABEL,
  WARMTH_LABEL,
} from '../types';
import { colorLabel, normalizeHex } from '../lib/color';
import { newId } from '../lib/storage';
import { ImageColorPicker } from './ImageColorPicker';
import { knownBrands, normalizeBrand } from '../lib/brand';

interface Props {
  initial?: ClothingItem;
  /** 登録済みブランドの候補を出すために使う */
  wardrobe?: ClothingItem[];
  onSubmit: (item: ClothingItem) => void;
  onCancel: () => void;
}

const PRESET_COLORS: { label: string; hex: string }[] = [
  { label: '白', hex: '#f5f5f0' },
  { label: '黒', hex: '#141414' },
  { label: 'グレー', hex: '#8a8a8a' },
  { label: 'ネイビー', hex: '#1f2a44' },
  { label: 'ベージュ', hex: '#d9c4a5' },
  { label: 'ブラウン', hex: '#5a3a22' },
  { label: 'カーキ', hex: '#5a6b3a' },
  { label: 'デニム', hex: '#2c3e5c' },
  { label: 'ボルドー', hex: '#6e1f2e' },
  { label: 'マスタード', hex: '#d4a826' },
  { label: 'サックス', hex: '#a9c4e0' },
  { label: 'ピンク', hex: '#e8a9b8' },
];

export function ItemForm({ initial, wardrobe = [], onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [category, setCategory] = useState<Category>(initial?.category ?? 'tops');
  const [shape, setShape] = useState<BottomsShape>(initial?.shape ?? 'pants');
  /** '' は自動 (名前と厚さから推定) */
  const [sleeve, setSleeve] = useState<Sleeve | ''>(initial?.sleeve ?? '');
  const [color, setColor] = useState(initial?.color ?? '#f5f5f0');
  const [hasSub, setHasSub] = useState(Boolean(initial?.subColor));
  const [subColor, setSubColor] = useState(initial?.subColor ?? '#1f2a44');
  const [seasons, setSeasons] = useState<Season[]>(initial?.seasons ?? ['spring', 'autumn']);
  const [warmth, setWarmth] = useState<Warmth>(initial?.warmth ?? 3);
  const [formality, setFormality] = useState<Formality>(initial?.formality ?? 'casual');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setError(null), [name, color, seasons]);

  const toggleSeason = (s: Season) =>
    setSeasons((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('名前を入力してください');
    const hex = normalizeHex(color);
    if (!hex) return setError('色は #rrggbb 形式で入力してください');
    const sub = hasSub ? normalizeHex(subColor) : null;
    if (hasSub && !sub) return setError('副色は #rrggbb 形式で入力してください');
    if (seasons.length === 0) return setError('季節を1つ以上選んでください');
    onSubmit({
      id: initial?.id ?? newId(),
      name: name.trim(),
      brand: normalizeBrand(brand),
      category,
      shape: category === 'bottoms' ? shape : undefined,
      sleeve: (category === 'tops' || category === 'onepiece') && sleeve ? sleeve : undefined,
      color: hex,
      subColor: sub ?? undefined,
      seasons: ALL_SEASONS.filter((s) => seasons.includes(s)),
      warmth,
      formality,
      tags: tags
        .split(/[,、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      imageUrl: imageUrl.trim() || undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
  };

  return (
    <form className="item-form" onSubmit={handleSubmit}>
      <h3>{initial ? 'アイテムを編集' : 'アイテムを追加'}</h3>

      <label>
        名前
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 白の無地Tシャツ" autoFocus />
      </label>

      <label>
        <span>
          ブランド <span className="muted">(任意)</span>
        </span>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} list="brand-options" placeholder="例: ユニクロ" />
        <datalist id="brand-options">
          {knownBrands(wardrobe).map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </label>

      <label>
        カテゴリ
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      {(category === 'tops' || category === 'onepiece') && (
        <label>
          袖丈
          <select value={sleeve} onChange={(e) => setSleeve(e.target.value as Sleeve | '')}>
            <option value="">自動 (名前から判断)</option>
            {ALL_SLEEVES.map((sl) => (
              <option key={sl} value={sl}>
                {SLEEVE_LABEL[sl]}
              </option>
            ))}
          </select>
        </label>
      )}

      {category === 'bottoms' && (
        <label>
          形
          <select value={shape} onChange={(e) => setShape(e.target.value as BottomsShape)}>
            {ALL_BOTTOMS_SHAPES.map((sh) => (
              <option key={sh} value={sh}>
                {BOTTOMS_SHAPE_LABEL[sh]}
              </option>
            ))}
          </select>
        </label>
      )}

      <ImageColorPicker
        imageUrl={imageUrl}
        onPick={(hex, target) => {
          if (target === 'main') setColor(hex);
          else {
            setSubColor(hex);
            setHasSub(true);
          }
        }}
        onExtracted={(main, sub) => {
          setColor(main);
          if (sub) {
            setSubColor(sub);
            setHasSub(true);
          }
        }}
      />

      <fieldset>
        <legend>
          主色 <span className="muted">({colorLabel(color)})</span>
        </legend>
        <div className="color-row">
          <input type="color" value={normalizeHex(color) ?? '#000000'} onChange={(e) => setColor(e.target.value)} />
          <input className="hex" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#rrggbb" />
        </div>
        <div className="presets">
          {PRESET_COLORS.map((p) => (
            <button
              key={p.hex}
              type="button"
              className="preset"
              style={{ background: p.hex }}
              title={p.label}
              onClick={() => setColor(p.hex)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>
          <label className="inline">
            <input type="checkbox" checked={hasSub} onChange={(e) => setHasSub(e.target.checked)} /> 副色あり (柄・配色切替など)
          </label>
        </legend>
        {hasSub && (
          <div className="color-row">
            <input type="color" value={normalizeHex(subColor) ?? '#000000'} onChange={(e) => setSubColor(e.target.value)} />
            <input className="hex" value={subColor} onChange={(e) => setSubColor(e.target.value)} />
            <span className="muted">{colorLabel(subColor)}</span>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>着る季節</legend>
        <div className="chips">
          {ALL_SEASONS.map((s) => (
            <label key={s} className={`chip ${seasons.includes(s) ? 'on' : ''}`}>
              <input type="checkbox" checked={seasons.includes(s)} onChange={() => toggleSeason(s)} />
              {SEASON_LABEL[s]}
            </label>
          ))}
        </div>
      </fieldset>

      <label>
        厚さ・暖かさ: {warmth} — {WARMTH_LABEL[warmth]}
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={warmth}
          onChange={(e) => setWarmth(Number(e.target.value) as Warmth)}
        />
      </label>

      <label>
        テイスト
        <select value={formality} onChange={(e) => setFormality(e.target.value as Formality)}>
          {ALL_FORMALITIES.map((f) => (
            <option key={f} value={f}>
              {FORMALITY_LABEL[f]}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>
          タグ <span className="muted">(カンマ区切り)</span>
        </span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="例: Tシャツ, お気に入り" />
      </label>

      <label>
        <span>
          画像URL <span className="muted">(任意)</span>
        </span>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="btn primary">
          {initial ? '保存' : '追加'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
