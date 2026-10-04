import type { ClothingItem, Formality, Warmth } from '../types';
import { FORMALITY_LABEL, SEASON_LABEL } from '../types';
import { COLOR_FAMILY_LABEL, evaluatePalette } from './color';
import type { Conditions } from './season';
import { describeLastWorn, freshnessScore, statsFor, type WearStatsMap } from './wear';

export interface Outfit {
  id: string;
  items: ClothingItem[];
  /** 総合スコア 0-1 */
  score: number;
  breakdown: {
    color: number;
    warmth: number;
    formality: number;
    season: number;
    /** 着用履歴から見た新鮮さ。履歴を使わないときは 1 */
    freshness: number;
  };
  scheme: string;
  reasons: string[];
  warnings: string[];
}

export interface SuggestOptions {
  conditions: Conditions;
  /** 希望するフォーマル度。未指定なら制限なし */
  formality?: Formality;
  /** 返す提案数 */
  limit?: number;
  /** 必ず含めたいアイテム (例: 今日はこのトップスを着たい) */
  mustInclude?: string[];
  /** 着用状況 (buildWearStats の結果)。渡すと最近着た服を下げ、着ていない服を上げる */
  wearStats?: WearStatsMap;
  /** 鮮度の重み 0〜1。既定は履歴ありなら 0.1、なしなら 0 */
  freshnessWeight?: number;
  /** 直近に同じ組み合わせを着ていたら下げるための組み合わせ ID の集合 */
  recentOutfitIds?: Set<string>;
  /**
   * 「未着用」を提案理由として挙げるか。履歴が少ないうちはほぼ全部が未着用で理由にならないので、
   * suggestOutfits がクローゼットの半数以上に記録があるときだけ true にする
   */
  mentionNeverWorn?: boolean;
}

/** 履歴が「たまった」とみなす、記録のあるアイテムの割合 */
export const HISTORY_ESTABLISHED_RATIO = 0.5;

/** 鮮度の重みのプリセット */
export const FRESHNESS_PRESETS = {
  off: 0,
  balanced: 0.1,
  prefer: 0.3,
} as const;
export type FreshnessMode = keyof typeof FRESHNESS_PRESETS;

function resolveFreshnessWeight(opts: SuggestOptions): number {
  if (opts.freshnessWeight !== undefined) return Math.max(0, Math.min(1, opts.freshnessWeight));
  return opts.wearStats ? FRESHNESS_PRESETS.balanced : 0;
}

/** コーデ全体の鮮度。小物は印象に残りにくいので軽く見る */
function freshnessOf(items: ClothingItem[], stats: WearStatsMap | undefined): number {
  if (!stats) return 1;
  let sum = 0;
  let wsum = 0;
  for (const i of items) {
    const w = i.category === 'accessory' || i.category === 'shoes' ? 0.5 : 1;
    sum += freshnessScore(statsFor(stats, i.id).daysSince) * w;
    wsum += w;
  }
  return wsum ? sum / wsum : 1;
}

const FORMALITY_RANK: Record<Formality, number> = { casual: 0, smart: 1, formal: 2 };

function seasonFit(item: ClothingItem, c: Conditions): number {
  if (item.seasons.includes(c.season)) return 1;
  if (item.seasons.some((s) => c.acceptableSeasons.includes(s))) return 0.6;
  return 0;
}

/** 服の組み合わせ全体の体感的な厚さを求める */
export function outfitWarmth(items: ClothingItem[]): number {
  const outer = items.find((i) => i.category === 'outer');
  const body = items.filter((i) => i.category === 'tops' || i.category === 'onepiece' || i.category === 'bottoms');
  if (body.length === 0) return outer?.warmth ?? 3;
  const bodyAvg = body.reduce((a, i) => a + i.warmth, 0) / body.length;
  if (!outer) return bodyAvg;
  // アウターは体感を大きく左右する。アウターの厚さを重視した加重平均
  return Math.max(bodyAvg, outer.warmth * 0.7 + bodyAvg * 0.3);
}

function warmthScore(items: ClothingItem[], target: Warmth): { score: number; warning?: string } {
  const w = outfitWarmth(items);
  const diff = Math.abs(w - target);
  const score = Math.max(0, 1 - diff / 3);
  let warning: string | undefined;
  if (w - target >= 1.5) warning = '暑く感じるかもしれません';
  else if (target - w >= 1.5) warning = '寒く感じるかもしれません';
  if (target >= 4 && !items.some((i) => i.category === 'outer')) {
    return { score: score * 0.6, warning: 'アウターがないと寒そうです' };
  }
  return { score, warning };
}

/** 日較差がこれ以上なら朝晩の冷え込みを注意する */
const CHILL_RANGE = 10;
/** 最低気温がこれ以下なら日較差に関係なく注意する */
const CHILL_MIN = 10;

/**
 * アウターのないコーデで、朝晩が冷えそうなときの注意。
 * 最高気温で厚さを決めているため、最低気温との差が大きい日に羽織りを勧める。
 */
function chillWarning(items: ClothingItem[], c: Conditions): string | undefined {
  if (c.temperature === undefined || c.minTemperature === undefined) return undefined;
  if (items.some((i) => i.category === 'outer')) return undefined;
  const range = c.temperature - c.minTemperature;
  if (range < CHILL_RANGE && c.minTemperature > CHILL_MIN) return undefined;
  return `朝晩は冷えそうです (最低 ${Math.round(c.minTemperature)}℃)。羽織りがあると安心です`;
}

function formalityScore(items: ClothingItem[], preferred?: Formality): number {
  const ranks = items.filter((i) => i.category !== 'accessory').map((i) => FORMALITY_RANK[i.formality]);
  if (ranks.length === 0) return 1;
  const spread = Math.max(...ranks) - Math.min(...ranks);
  let score = spread === 0 ? 1 : spread === 1 ? 0.65 : 0.2;
  if (preferred) {
    const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    const dist = Math.abs(avg - FORMALITY_RANK[preferred]);
    score *= Math.max(0, 1 - dist / 2);
  }
  return score;
}

function dominantFormality(items: ClothingItem[]): Formality {
  const counts: Record<Formality, number> = { casual: 0, smart: 0, formal: 0 };
  for (const i of items) if (i.category !== 'accessory') counts[i.formality]++;
  return (Object.keys(counts) as Formality[]).sort((a, b) => counts[b] - counts[a])[0];
}

export function scoreOutfit(items: ClothingItem[], opts: SuggestOptions): Outfit {
  const { conditions } = opts;
  const colors = items.flatMap((i) => (i.subColor ? [i.color, i.subColor] : [i.color]));
  const palette = evaluatePalette(colors);
  const warmth = warmthScore(items, conditions.targetWarmth);
  const formality = formalityScore(items, opts.formality);
  const fits = items.map((i) => seasonFit(i, conditions));
  // 平均と最低値の両方を見る (1点でも季節外れだと違和感が出る)
  const season = (fits.reduce((a, b) => a + b, 0) / fits.length) * 0.5 + Math.min(...fits) * 0.5;
  const offSeason = items.filter((_, idx) => fits[idx] === 0);

  const outfitId = items
    .map((i) => i.id)
    .sort()
    .join('+');
  const fw = resolveFreshnessWeight(opts);
  let freshness = freshnessOf(items, opts.wearStats);
  const repeated = opts.recentOutfitIds?.has(outfitId) ?? false;
  if (repeated) freshness *= 0.5;
  const base = palette.score * 0.45 + warmth.score * 0.3 + formality * 0.15 + season * 0.1;
  const score = base * (1 - fw) + freshness * fw;

  const reasons: string[] = [];
  const warnings: string[] = [];
  reasons.push(`${palette.scheme}（${palette.families.map((f) => COLOR_FAMILY_LABEL[f]).join('・')}）`);
  if (warmth.score >= 0.8) {
    reasons.push(
      conditions.temperature !== undefined
        ? `気温${conditions.temperature}℃にちょうどよい厚さ`
        : `${SEASON_LABEL[conditions.season]}の気候にちょうどよい厚さ`,
    );
  }
  if (warmth.warning) warnings.push(warmth.warning);
  const chill = chillWarning(items, conditions);
  if (chill) warnings.push(chill);
  if (formality >= 0.9) reasons.push(`${FORMALITY_LABEL[dominantFormality(items)]}でテイストが統一`);
  else if (formality < 0.4) warnings.push('テイストがばらついています');
  if (offSeason.length) warnings.push(`季節外れ: ${offSeason.map((i) => i.name).join('、')}`);
  if (opts.wearStats && fw > 0) {
    const main = items.filter((i) => i.category !== 'accessory' && i.category !== 'shoes');
    const longUnworn = main.filter((i) => {
      const d = statsFor(opts.wearStats, i.id).daysSince;
      return d === null ? opts.mentionNeverWorn === true : freshnessScore(d) >= 1;
    });
    const recent = main.filter((i) => (statsFor(opts.wearStats, i.id).daysSince ?? 99) <= 2);
    if (longUnworn.length) {
      reasons.push(
        `しばらく着ていない: ${longUnworn
          .slice(0, 2)
          .map((i) => `${i.name} (${describeLastWorn(statsFor(opts.wearStats, i.id))})`)
          .join('、')}`,
      );
    }
    if (recent.length) {
      warnings.push(`最近着た: ${recent.map((i) => `${i.name} (${describeLastWorn(statsFor(opts.wearStats, i.id))})`).join('、')}`);
    }
    if (repeated) warnings.push('この組み合わせは最近着ています');
  }

  return {
    id: outfitId,
    items,
    score,
    breakdown: { color: palette.score, warmth: warmth.score, formality, season, freshness },
    scheme: palette.scheme,
    reasons,
    warnings,
  };
}

/** 候補を季節・厚さ (と鮮度) の適合度で絞って組み合わせ爆発を防ぐ */
function pickCandidates(items: ClothingItem[], c: Conditions, limit: number, stats?: WearStatsMap, fw = 0): ClothingItem[] {
  const scored = items
    .map((i) => {
      const fit = seasonFit(i, c) * 0.6 + (1 - Math.abs(i.warmth - c.targetWarmth) / 4) * 0.4;
      const fresh = stats ? freshnessScore(statsFor(stats, i.id).daysSince) : 1;
      return { i, s: fit * (1 - fw) + fresh * fw };
    })
    .filter((x) => x.s > 0.15)
    .sort((a, b) => b.s - a.s);
  const picked = scored.slice(0, limit).map((x) => x.i);
  // 絞り込みで全滅したら季節を無視して返す (何も提案できないより良い)
  return picked.length ? picked : items.slice(0, limit);
}

export function suggestOutfits(wardrobe: ClothingItem[], opts: SuggestOptions): Outfit[] {
  const { conditions } = opts;
  const limit = opts.limit ?? 5;
  const must = new Set(opts.mustInclude ?? []);
  const PER_CAT = 8;
  const fw = resolveFreshnessWeight(opts);
  if (opts.wearStats && opts.mentionNeverWorn === undefined) {
    const withHistory = wardrobe.filter((i) => opts.wearStats!.has(i.id)).length;
    opts = { ...opts, mentionNeverWorn: wardrobe.length > 0 && withHistory / wardrobe.length >= HISTORY_ESTABLISHED_RATIO };
  }

  const byCat = (cat: ClothingItem['category']) => {
    const all = wardrobe.filter((i) => i.category === cat);
    const forced = all.filter((i) => must.has(i.id));
    if (forced.length) return forced;
    return pickCandidates(all, conditions, PER_CAT, opts.wearStats, fw);
  };

  const outers = byCat('outer');
  const tops = byCat('tops');
  const bottoms = byCat('bottoms');
  const onepieces = byCat('onepiece');
  const shoes = byCat('shoes');
  const accessories = byCat('accessory');

  // ベースの組み合わせ: トップス+ボトムス or ワンピース
  const bases: ClothingItem[][] = [];
  if (!(must.size && [...must].some((id) => onepieces.some((o) => o.id === id)))) {
    for (const t of tops) for (const b of bottoms) bases.push([t, b]);
  }
  if (!(must.size && [...must].some((id) => tops.concat(bottoms).some((o) => o.id === id)))) {
    for (const o of onepieces) bases.push([o]);
  }
  if (bases.length === 0) return [];

  // アウター: 寒いときは必須寄り、暖かいときは「なし」も候補
  const outerOptions: (ClothingItem | null)[] =
    conditions.targetWarmth >= 4 && outers.length ? [...outers] : [null, ...outers];
  const shoeOptions: (ClothingItem | null)[] = shoes.length ? shoes : [null];
  const accessoryOptions: (ClothingItem | null)[] = [null, ...accessories.slice(0, 4)];

  const results: Outfit[] = [];
  for (const base of bases) {
    for (const outer of outerOptions) {
      for (const shoe of shoeOptions) {
        for (const acc of accessoryOptions) {
          const items = [outer, ...base, shoe, acc].filter((x): x is ClothingItem => x !== null);
          if (must.size && ![...must].every((id) => items.some((i) => i.id === id))) continue;
          results.push(scoreOutfit(items, opts));
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);

  // 多様性: 似すぎる提案 (共通アイテムが多い) を避ける
  const chosen: Outfit[] = [];
  const usedTopBottom = new Map<string, number>();
  for (const o of results) {
    if (chosen.length >= limit) break;
    const key = o.items
      .filter((i) => i.category === 'tops' || i.category === 'bottoms' || i.category === 'onepiece')
      .map((i) => i.id)
      .sort()
      .join('+');
    if ((usedTopBottom.get(key) ?? 0) >= 1) continue;
    const tooSimilar = chosen.some((c) => {
      const shared = c.items.filter((ci) => o.items.some((oi) => oi.id === ci.id)).length;
      return shared >= Math.min(c.items.length, o.items.length) - 1;
    });
    if (tooSimilar) continue;
    chosen.push(o);
    usedTopBottom.set(key, 1);
  }
  // 足りなければ残りから補充
  for (const o of results) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(o)) chosen.push(o);
  }
  return chosen;
}

