import type { ClothingItem, Formality, Warmth } from '../types';
import { FORMALITY_LABEL, SEASON_LABEL } from '../types';
import { COLOR_FAMILY_LABEL, evaluatePalette } from './color';
import type { Conditions } from './season';

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

  const score = palette.score * 0.45 + warmth.score * 0.3 + formality * 0.15 + season * 0.1;

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
  if (formality >= 0.9) reasons.push(`${FORMALITY_LABEL[dominantFormality(items)]}でテイストが統一`);
  else if (formality < 0.4) warnings.push('テイストがばらついています');
  if (offSeason.length) warnings.push(`季節外れ: ${offSeason.map((i) => i.name).join('、')}`);

  return {
    id: items
      .map((i) => i.id)
      .sort()
      .join('+'),
    items,
    score,
    breakdown: { color: palette.score, warmth: warmth.score, formality, season },
    scheme: palette.scheme,
    reasons,
    warnings,
  };
}

/** 候補を季節・厚さの適合度で絞って組み合わせ爆発を防ぐ */
function pickCandidates(items: ClothingItem[], c: Conditions, limit: number): ClothingItem[] {
  const scored = items
    .map((i) => ({
      i,
      s: seasonFit(i, c) * 0.6 + (1 - Math.abs(i.warmth - c.targetWarmth) / 4) * 0.4,
    }))
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

  const byCat = (cat: ClothingItem['category']) => {
    const all = wardrobe.filter((i) => i.category === cat);
    const forced = all.filter((i) => must.has(i.id));
    if (forced.length) return forced;
    return pickCandidates(all, conditions, PER_CAT);
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

