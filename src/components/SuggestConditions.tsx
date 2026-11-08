import { useState } from 'react';
import { ALL_FORMALITIES, FORMALITY_LABEL, SEASON_LABEL, WARMTH_LABEL, type Warmth } from '../types';

/** 条件バーの一言。「目安の厚さ: 2 (初夏・残暑 (薄い))」は数字と入れ子括弧で何をすればよいか分からなかった */
const WARMTH_HINT: Record<Warmth, string> = {
  1: 'とても薄手',
  2: '薄手',
  3: 'ふつうの厚さ',
  4: '厚手',
  5: 'とても厚手',
};
import type { Formality } from '../types';
import type { Conditions } from '../lib/season';
import type { DailyTemperature } from '../lib/weather';
import { CURRENT_LOCATION_ID, PRESET_LOCATIONS, type Location } from '../lib/location';
import type { FreshnessMode } from '../lib/outfit';
import { ALL_COLOR_MODES, COLOR_MODES, type ColorMode } from '../lib/colorMode';

export type DateMode = 'today' | 'tomorrow' | 'custom';

export type ForecastState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: DailyTemperature }
  | { status: 'unavailable' }
  | { status: 'error' };

export type LocatingState = { status: 'idle' } | { status: 'busy' } | { status: 'error'; message: string };

interface Props {
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
  // テイスト・履歴
  formality: Formality | '';
  onChangeFormality: (f: Formality | '') => void;
  freshness: FreshnessMode;
  onChangeFreshness: (f: FreshnessMode) => void;
  // 色合わせの基準 (好みとして記憶される)
  colorMode: ColorMode;
  onChangeColorMode: (m: ColorMode) => void;
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
  /** [値, 表示名, (任意) ホバーで出す 1 行説明] */
  options: [T, string, string?][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, text, title]) => (
        <button key={v} type="button" className={`seg ${value === v ? 'on' : ''}`} aria-pressed={value === v} title={title} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * 提案の条件。日付・テイスト・地点・予報・(履歴があれば) 着用履歴の扱いを全部その場に出す。
 * 気温の手入力だけは「気温を変える」で開く (手入力中と予報が取れないときは最初から開いている)。
 */
export function SuggestConditions(p: Props) {
  const [tempOpen, setTempOpen] = useState(false);
  const [choosingLocation, setChoosingLocation] = useState(false);
  const [choosingColorMode, setChoosingColorMode] = useState(false);

  const showTemp = tempOpen || p.tempIsManual || p.forecast.status === 'error' || p.forecast.status === 'unavailable';
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
        {p.hasWearLog && (
          <div className="cond-field">
            <span>最近着た服の扱い</span>
            <Segmented label="着用履歴" value={p.freshness} options={FRESHNESS_SEGMENTS} onChange={p.onChangeFreshness} />
          </div>
        )}
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
        <button type="button" className="link" aria-expanded={showTemp} onClick={() => setTempOpen((v) => !v)}>
          気温を変える
        </button>
        <span className="pill">{SEASON_LABEL[c.season]}</span>
        {c.acceptableSeasons.length > 1 && (
          <span className="pill muted">
            {c.acceptableSeasons.filter((s) => s !== c.season).map((s) => SEASON_LABEL[s]).join('・')}の服も候補
          </span>
        )}
        <span className="pill" title={`目安の厚さ ${c.targetWarmth}/5 (${WARMTH_LABEL[c.targetWarmth]})`}>
          {WARMTH_HINT[c.targetWarmth]}でよさそう
        </span>
        {/* 毎日変える条件ではなく好みなので、地点と同じく押したときだけ開く (条件欄の高さを増やさない) */}
        <button
          type="button"
          className="link"
          aria-label={`色合わせの基準を変える (現在: ${COLOR_MODES[p.colorMode].label})`}
          aria-expanded={choosingColorMode}
          onClick={() => setChoosingColorMode((v) => !v)}
        >
          {/* 「色合わせ: 標準 ▾」だと 375px で状態行が 1 行増えて提案が 27px 下がる。「配色: 標準 ▾」なら厚さピルの行に収まる */}
          配色: {COLOR_MODES[p.colorMode].label} ▾
        </button>
      </div>
      {choosingColorMode && (
        <div className="cond-colormode">
          <Segmented
            label="色合わせの基準"
            value={p.colorMode}
            options={ALL_COLOR_MODES.map((m) => [m, COLOR_MODES[m].label, COLOR_MODES[m].description] as [ColorMode, string, string])}
            onChange={p.onChangeColorMode}
          />
          <span className="muted">{COLOR_MODES[p.colorMode].description}</span>
        </div>
      )}
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

      {showTemp && (
        <div className="temp-row">
          <label className="muted" htmlFor="cond-temp">
            気温 (℃)
          </label>
          <input id="cond-temp" type="number" inputMode="decimal" placeholder="例: 18" value={p.tempStr} onChange={(e) => p.onChangeTemp(e.target.value)} />
          {p.tempIsManual && p.forecast.status === 'ok' && (
            <button type="button" className="btn small" onClick={p.onResetTemp}>
              予報に戻す
            </button>
          )}
          {!p.tempIsManual && p.forecast.status === 'ok' && <span className="muted">予報の最高気温を使っています</span>}
        </div>
      )}
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
      return <span className="forecast warn">予報を取得できませんでした。気温を入力してください</span>;
    case 'unavailable':
      return <span className="forecast muted">この日付の予報は取得できません</span>;
    default:
      return null;
  }
}
