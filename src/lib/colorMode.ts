import type { Formality } from '../types';
import { colorFamily, evaluatePalette, hexToHsl, hueDistance, normalizeHex, type ColorFamily, type PaletteEvaluation } from './color';

/**
 * 色合わせの基準 (流儀)。色相環の一般理論で採点する「標準」に、
 * 定番の配色への加点・避けたい配色への減点をデータとして重ねる。
 * 設計: docs/superpowers/specs/2026-11-08-color-mode-design.md
 */
export type ColorMode = 'standard' | 'italian' | 'british';

/** 色ファミリーに、定番配色の照合で区別が要る「ボルドー」(暗い赤) を足したもの */
type Tone = ColorFamily | 'bordeaux';

interface PairRule {
  a: Tone;
  b: Tone;
  bonus: number;
  /** 理由文の先頭に出す配色名 */
  name: string;
}
interface AvoidRule {
  a: Tone;
  b: Tone;
  penalty: number;
  warning: string;
}
interface FormalityRule {
  /** smart / formal のときに減点する色 */
  town: { tones: Tone[]; penalty: number; warning: string };
  /** casual のときに加点する色 */
  country: { tones: Tone[]; bonus: number; name: string };
}

export interface ColorModeDef {
  label: string;
  description: string;
  pairs: PairRule[];
  /** 同じ色相の濃淡でまとめた配色 (トーン・オン・トーン) への加点。0 なら見ない */
  toneOnToneBonus: number;
  /** 彩度 0.65 超の差し色があるときの減点。0 なら見ない */
  vividAccentPenalty: number;
  avoid: AvoidRule[];
  formality?: FormalityRule;
}

const AZZURRO_E_MARRONE = 'アズーロ・エ・マローネ';

export const COLOR_MODES: Record<ColorMode, ColorModeDef> = {
  standard: {
    label: '標準',
    description: '色相環の相性とベーシックカラーで判定します',
    pairs: [],
    toneOnToneBonus: 0,
    vividAccentPenalty: 0,
    avoid: [],
  },
  italian: {
    label: 'イタリア流',
    description: '紺・グレーの土台に茶やボルドーを合わせ、同系色の濃淡を好みます。鮮やかな差し色は控えめに',
    pairs: [
      // ベーシック同士 0.85 に足して、ベーシック + 鮮やかな差し色 (0.92 − 0.08) を上回る大きさ。
      // 0.1 にすると実データの上位がほぼ全部 100 点に張り付いて差が見えなくなった
      { a: 'navy', b: 'brown', bonus: 0.08, name: AZZURRO_E_MARRONE },
      { a: 'blue', b: 'brown', bonus: 0.08, name: AZZURRO_E_MARRONE },
      { a: 'navy', b: 'bordeaux', bonus: 0.08, name: 'ネイビー × ボルドー' },
      { a: 'gray', b: 'brown', bonus: 0.07, name: 'グレー × ブラウン' },
      { a: 'beige', b: 'navy', bonus: 0.06, name: 'ベージュ × ネイビー' },
      { a: 'khaki', b: 'brown', bonus: 0.06, name: 'カーキ × ブラウンのアースカラー' },
    ],
    toneOnToneBonus: 0.05,
    vividAccentPenalty: 0.08,
    avoid: [],
  },
  british: {
    label: 'イギリス流',
    description: '街着は紺・グレー・黒、茶やアースカラーは週末 (カジュアル) に。紺と黒は合わせません',
    pairs: [
      { a: 'navy', b: 'gray', bonus: 0.08, name: '英国調のネイビー × グレー' },
      { a: 'gray', b: 'bordeaux', bonus: 0.07, name: 'グレー × ボルドー' },
      { a: 'navy', b: 'white', bonus: 0.06, name: 'ネイビー × ホワイト' },
      { a: 'navy', b: 'bordeaux', bonus: 0.05, name: 'ネイビー × ボルドー' },
      { a: 'black', b: 'gray', bonus: 0.04, name: 'モノトーンの街着' },
    ],
    toneOnToneBonus: 0,
    vividAccentPenalty: 0,
    avoid: [{ a: 'navy', b: 'black', penalty: 0.12, warning: '英国流では紺と黒は合わせません' }],
    formality: {
      town: { tones: ['brown', 'khaki'], penalty: 0.1, warning: '英国流では街着に茶・アースカラーより黒・グレーが無難です' },
      country: { tones: ['brown', 'khaki', 'green', 'yellow', 'orange'], bonus: 0.06, name: 'カントリー調のアースカラー' },
    },
  },
};

export const ALL_COLOR_MODES: ColorMode[] = ['standard', 'italian', 'british'];

export interface ColorModeContext {
  /** 条件の「テイスト」指定か、コーデの多数派のテイスト。イギリス流の街/田舎の判定に使う */
  formality?: Formality;
}

export interface ModedPaletteEvaluation extends PaletteEvaluation {
  /** 避けたい配色だったときの注意。提案カードの ⚠ 行に出す */
  warning?: string;
}

/** ボルドーの明度の上限。これ以下の red はボルドーとして照合する */
const BORDEAUX_MAX_L = 0.35;
/** トーン・オン・トーンとみなす色相差 */
const TONE_HUE_RANGE = 20;
/** 「鮮やかな差し色」とみなす彩度 */
const VIVID_S = 0.65;

function toneOf(hex: string): Tone {
  const fam = colorFamily(hex);
  if (fam === 'red' && hexToHsl(hex).l <= BORDEAUX_MAX_L) return 'bordeaux';
  return fam;
}

const hasPair = (tones: Set<Tone>, a: Tone, b: Tone) => a !== b && tones.has(a) && tones.has(b);

/** 無彩色 (白・黒・グレー) を除いた、色相のある色だけでトーン・オン・トーンか判定する */
function isToneOnTone(hexes: string[]): boolean {
  const chromatic = hexes.map(hexToHsl).filter((c) => c.s > 0.15 && c.l > 0.12 && c.l < 0.92);
  if (chromatic.length < 2) return false;
  for (let i = 0; i < chromatic.length; i++) {
    for (let j = i + 1; j < chromatic.length; j++) {
      if (hueDistance(chromatic[i].h, chromatic[j].h) > TONE_HUE_RANGE) return false;
    }
  }
  return true;
}

/** 標準の評価にモードの加点・減点を重ねる。standard はそのまま返す */
export function applyColorMode(base: PaletteEvaluation, hexes: string[], mode: ColorMode, ctx: ColorModeContext = {}): ModedPaletteEvaluation {
  const def = COLOR_MODES[mode];
  if (mode === 'standard') return { ...base, warning: undefined };

  const uniq = Array.from(new Set(hexes.map((h) => normalizeHex(h) ?? h)));
  const tones = new Set(uniq.map(toneOf));
  const hsls = uniq.map(hexToHsl);

  const bonuses: { bonus: number; name: string }[] = def.pairs.filter((p) => hasPair(tones, p.a, p.b));
  if (def.toneOnToneBonus > 0 && isToneOnTone(uniq)) bonuses.push({ bonus: def.toneOnToneBonus, name: 'トーン・オン・トーン' });
  const country = def.formality?.country;
  if (country && ctx.formality === 'casual' && country.tones.some((t) => tones.has(t))) bonuses.push({ bonus: country.bonus, name: country.name });
  bonuses.sort((x, y) => y.bonus - x.bonus);

  let score = base.score;
  let scheme = base.scheme;
  if (bonuses.length) {
    // 一番大きい加点を採用し、2 件目以降はまとまりの良さとして小さく足す。
    // 合計に上限を置くのは、定番ペアが 3〜4 件重なると色が 1.0 に張り付き、上位の差が消えるため
    score += Math.min(MAX_MODE_BONUS, bonuses[0].bonus + EXTRA_PAIR_BONUS * (bonuses.length - 1));
    scheme = bonuses[0].name;
  }

  const warnings: string[] = [];
  if (def.vividAccentPenalty > 0 && hsls.some((c) => c.s > VIVID_S && c.l > 0.12 && c.l < 0.92)) score -= def.vividAccentPenalty;
  for (const a of def.avoid) {
    if (hasPair(tones, a.a, a.b)) {
      score -= a.penalty;
      warnings.push(a.warning);
    }
  }
  const town = def.formality?.town;
  if (town && (ctx.formality === 'smart' || ctx.formality === 'formal') && town.tones.some((t) => tones.has(t))) {
    score -= town.penalty;
    warnings.push(town.warning);
  }

  return { ...base, score: Math.max(0, Math.min(1, score)), scheme, warning: warnings[0] };
}

/** 2 件目以降の定番ペアに足す加点 */
const EXTRA_PAIR_BONUS = 0.02;
/** 1 コーデに足すモード加点の上限 */
const MAX_MODE_BONUS = 0.1;

/** evaluatePalette とモード適用をまとめたもの */
export function evaluatePaletteIn(hexes: string[], mode: ColorMode, ctx: ColorModeContext = {}): ModedPaletteEvaluation {
  return applyColorMode(evaluatePalette(hexes), hexes, mode, ctx);
}

// ---- 記憶

const KEY = 'coordination.colorMode.v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function isColorMode(x: unknown): x is ColorMode {
  return typeof x === 'string' && (ALL_COLOR_MODES as string[]).includes(x);
}

export function loadColorMode(storage: StorageLike | null = defaultStorage()): ColorMode {
  try {
    const v = storage?.getItem(KEY);
    return isColorMode(v) ? v : 'standard';
  } catch {
    return 'standard';
  }
}

export function saveColorMode(mode: ColorMode, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(KEY, mode);
  } catch {
    // 保存できなくても動作には影響しない
  }
}
