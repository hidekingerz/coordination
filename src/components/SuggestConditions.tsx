import { useState } from 'react';
import type { ClothingItem, Formality } from '../types';
import { ALL_FORMALITIES, FORMALITY_LABEL, SEASON_LABEL, WARMTH_LABEL } from '../types';
import type { Conditions } from '../lib/season';
import type { DailyTemperature } from '../lib/weather';
import { CURRENT_LOCATION_ID, PRESET_LOCATIONS, type Location } from '../lib/location';
import type { FreshnessMode } from '../lib/outfit';
import { ItemPicker } from './ItemPicker';
import { Swatch } from './Swatch';

export type DateMode = 'today' | 'tomorrow' | 'custom';

export type ForecastState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: DailyTemperature }
  | { status: 'unavailable' }
  | { status: 'error' };

export type LocatingState = { status: 'idle' } | { status: 'busy' } | { status: 'error'; message: string };

interface Props {
  wardrobe: ClothingItem[];
  hasWearLog: boolean;
  conditions: Conditions;
  // 日付
  dateMode: DateMode;
  dateStr: string;
  onPickDate: (mode: DateMode) => void;
  onChangeDate: (dateStr: string) => void;
  // 地点と予報
  location: Location;
  locating: LocatingState;
  forecast: ForecastState;
  onChangeLocation: (id: string) => void;
  // 気温
  tempStr: string;
  tempIsManual: boolean;
  onChangeTemp: (value: string) => void;
  onResetTemp: () => void;
  // テイスト・履歴・必須アイテム
  formality: Formality | '';
  onChangeFormality: (f: Formality | '') => void;
  freshness: FreshnessMode;
  onChangeFreshness: (f: FreshnessMode) => void;
  mustInclude: string[];
  onChangeMustInclude: (ids: string[]) => void;
}

const FRESHNESS_SEGMENTS: [FreshnessMode, string][] = [
  ['off', '気にしない'],
  ['balanced', '控えめ'],
  ['prefer', '着ていない服を優先'],
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" className={`seg ${value === v ? 'on' : ''}`} aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * 提案の条件。よく使う「日付・テイスト」と地点・予報のステータスを常時表示し、
 * 例外的な調整 (気温の手入力、着たいアイテム、着用履歴) は「条件を絞る」に畳む。
 */
export function SuggestConditions(p: Props) {
  const [open, setOpen] = useState(false);
  const [choosingLocation, setChoosingLocation] = useState(false);
  const [picking, setPicking] = useState(false);

  const mustItems = p.mustInclude.map((id) => p.wardrobe.find((i) => i.id === id)).filter((i): i is ClothingItem => Boolean(i));
  const overrides = (p.tempIsManual ? 1 : 0) + (mustItems.length > 0 ? 1 : 0) + (p.hasWearLog && p.freshness !== 'balanced' ? 1 : 0);
  const c = p.conditions;

  return (
    <div className="conditions card">
      <div className="cond-top">
        <div className="cond-field">
          <span>日付</span>
          <div className="date-row">
            <Segmented
              label="日付"
              value={p.dateMode}
              options={[
                ['today', '今日'],
                ['tomorrow', '明日'],
                ['custom', '日付を指定'],
              ]}
              onChange={p.onPickDate}
            />
            {p.dateMode === 'custom' ? (
              <input type="date" value={p.dateStr} onChange={(e) => p.onChangeDate(e.target.value)} aria-label="日付を選択" />
            ) : (
              <span className="muted">{p.dateStr.replace(/-/g, '/')}</span>
            )}
          </div>
        </div>
        <div className="cond-field">
          <span>テイスト</span>
          <Segmented
            label="テイスト"
            value={p.formality}
            options={[['', '指定なし'], ...ALL_FORMALITIES.map((f) => [f, FORMALITY_LABEL[f]] as [Formality, string])]}
            onChange={p.onChangeFormality}
          />
        </div>
      </div>

      <div className="cond-status" data-testid="cond-status">
        <button
          type="button"
          className="link location"
          aria-label={`地点を変える (現在: ${p.location.name})`}
          aria-expanded={choosingLocation}
          onClick={() => setChoosingLocation((v) => !v)}
        >
          {p.location.name} ▾
        </button>
        <ForecastText state={p.forecast} manual={p.tempIsManual} tempStr={p.tempStr} />
        <span className="pill">{SEASON_LABEL[c.season]}</span>
        {c.acceptableSeasons.length > 1 && (
          <span className="pill muted">
            {c.acceptableSeasons.filter((s) => s !== c.season).map((s) => SEASON_LABEL[s]).join('・')}の服も候補
          </span>
        )}
        <span className="pill">
          目安の厚さ: {c.targetWarmth} ({WARMTH_LABEL[c.targetWarmth]})
        </span>
      </div>
      {choosingLocation && (
        <div className="cond-location">
          <select
            aria-label="予報の地点"
            value={p.location.id}
            onChange={(e) => {
              p.onChangeLocation(e.target.value);
              if (e.target.value !== CURRENT_LOCATION_ID) setChoosingLocation(false);
            }}
          >
            {PRESET_LOCATIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value={CURRENT_LOCATION_ID}>現在地 (位置情報を使う)</option>
          </select>
          {p.locating.status === 'busy' && <span className="forecast muted">位置情報を取得中… (最大 30 秒。他の地点を選んで中断できます)</span>}
          {p.locating.status === 'error' && <span className="forecast warn">{p.locating.message}</span>}
        </div>
      )}

      <button type="button" className="link toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? '▴' : '▸'} 条件を絞る{overrides > 0 ? ` (${overrides})` : ''}
      </button>

      {open && (
        <div className="cond-more">
          <div className="cond-field">
            <span>
              気温 (℃) <span className="muted">予報の最高気温を使っています。変えたいときだけ入力</span>
            </span>
            <div className="temp-row">
              <input type="number" inputMode="decimal" placeholder="例: 18" value={p.tempStr} onChange={(e) => p.onChangeTemp(e.target.value)} />
              {p.tempIsManual && p.forecast.status === 'ok' && (
                <button type="button" className="btn small" onClick={p.onResetTemp}>
                  予報に戻す
                </button>
              )}
            </div>
          </div>
          <div className="cond-field">
            <span>
              このアイテムを着たい <span className="muted">任意・複数可</span>
            </span>
            <div className="must-row">
              <button type="button" className="btn" onClick={() => setPicking(true)} disabled={p.wardrobe.length === 0}>
                アイテムを選ぶ
              </button>
              {mustItems.length === 0 ? (
                <span className="muted">指定なし</span>
              ) : (
                mustItems.map((i) => (
                  <span key={i.id} className="must-chip" data-testid="must-chip">
                    <Swatch color={i.color} size={12} /> {i.name}
                    <button
                      type="button"
                      className="must-remove"
                      aria-label={`${i.name} を外す`}
                      onClick={() => p.onChangeMustInclude(p.mustInclude.filter((id) => id !== i.id))}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
          {p.hasWearLog && (
            <div className="cond-field">
              <span>最近着た服の扱い</span>
              <Segmented label="着用履歴" value={p.freshness} options={FRESHNESS_SEGMENTS} onChange={p.onChangeFreshness} />
            </div>
          )}
        </div>
      )}

      {picking && <ItemPicker wardrobe={p.wardrobe} selected={p.mustInclude} onChange={p.onChangeMustInclude} onClose={() => setPicking(false)} />}
    </div>
  );
}

function ForecastText({ state, manual, tempStr }: { state: ForecastState; manual: boolean; tempStr: string }) {
  if (manual && tempStr.trim() !== '') return <span className="forecast">気温 {tempStr}℃ (手入力)</span>;
  switch (state.status) {
    case 'loading':
      return <span className="forecast muted">予報を取得中…</span>;
    case 'ok':
      return (
        <span className="forecast">
          最高 {Math.round(state.data.max)}℃ / 最低 {Math.round(state.data.min)}℃
        </span>
      );
    case 'error':
      return <span className="forecast warn">予報を取得できませんでした。「条件を絞る」から気温を入力できます</span>;
    case 'unavailable':
      return <span className="forecast muted">この日付の予報は取得できません</span>;
    default:
      return null;
  }
}
