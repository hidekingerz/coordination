import { describe, expect, it } from 'vitest';
import type { ClothingItem } from '../types';
import { buildConditions } from './season';
import { suggestOutfits } from './outfit';
import { SAMPLE_WARDROBE } from '../data/sample';

const mk = (id: string, category: ClothingItem['category'], over: Partial<ClothingItem> = {}): ClothingItem => ({
  id,
  name: id,
  category,
  color: '#8a8a8a',
  seasons: ['spring', 'summer', 'autumn', 'winter'],
  warmth: 3,
  formality: 'casual',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('suggestOutfits: no duplicates and score order in small closets', () => {
  // 入れ替え先のアウターが見つからなかったとき、外した案を戻す処理で同じ案が 2 回入っていた
  const closet: ClothingItem[] = [
    mk('t0', 'tops', { color: '#5a3a22', warmth: 1, formality: 'smart' }),
    mk('t1', 'tops', { color: '#5a3a22', warmth: 3 }),
    mk('t2', 'tops', { color: '#c0392b', warmth: 2, formality: 'formal' }),
    mk('t3', 'tops', { color: '#141414', warmth: 5 }),
    mk('t4', 'tops', { color: '#141414', warmth: 2, formality: 'formal' }),
    mk('b0', 'bottoms', { color: '#1f2a44', warmth: 2 }),
    mk('b1', 'bottoms', { color: '#5a3a22', warmth: 1 }),
    mk('b2', 'bottoms', { color: '#8a8a8a', warmth: 4, formality: 'smart' }),
    mk('o0', 'outer', { name: 'ダウン0', color: '#5a3a22', warmth: 5 }),
    mk('s0', 'shoes', { color: '#1f2a44', warmth: 1, formality: 'smart' }),
    mk('a0', 'accessory', { name: 'ベルト0', color: '#e0a020', warmth: 2 }),
  ];

  it('never lists the same outfit twice in the top 5', () => {
    for (const min of [undefined, 7]) {
      const out = suggestOutfits(closet, { conditions: buildConditions(new Date('2026-04-15T12:00:00'), 18, min) });
      expect(new Set(out.map((o) => o.id)).size).toBe(out.length);
    }
  });

  it('returns the top 5 in score order even after the outer swap and the fill-up', () => {
    // トップス 5 / ボトムス 1 / アウター 1 / 靴 1。アウター入りを確保した後の補充で順位が崩れていた
    const small = [
      ...[1, 2, 3, 4, 5].map((n) => mk(`トップス${n}`, 'tops', { color: ['#f5f5f0', '#1f2a44', '#8a8a8a', '#141414', '#d9c4a5'][n - 1] })),
      mk('ボトムス1', 'bottoms', { color: '#1f2a44' }),
      mk('ジャケット1', 'outer', { color: '#1f2a44' }),
      mk('靴1', 'shoes', { color: '#141414' }),
    ];
    const out = suggestOutfits(small, { conditions: buildConditions(new Date('2026-10-15T12:00:00'), 18) });
    const scores = out.map((o) => o.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe('suggestOutfits: excludeIds for the next page', () => {
  it('leaves out the outfits already shown, so page 2 never repeats page 1', () => {
    // サンプル 30 点・1/15・最高 19℃: limit 10 の後半を 2 ページ目にしていたとき、#4 と #6 が同じだった
    const conditions = buildConditions(new Date('2026-01-15T12:00:00'), 19, 12);
    const first = suggestOutfits(SAMPLE_WARDROBE, { conditions, limit: 5 });
    const second = suggestOutfits(SAMPLE_WARDROBE, { conditions, limit: 5, excludeIds: new Set(first.map((o) => o.id)) });
    expect(second.length).toBe(5);
    for (const o of second) expect(first.map((f) => f.id)).not.toContain(o.id);
  });
});

describe('scoreOutfit: every colour-mode deduction reaches the card', () => {
  it('lists both british deductions (navy × black, brown in town) in the outfit warnings', async () => {
    const { scoreOutfit } = await import('./outfit');
    const items = [
      mk('jk', 'outer', { color: '#1f2a44', formality: 'smart' }),
      mk('tp', 'tops', { color: '#111111', formality: 'smart' }),
      mk('pt', 'bottoms', { color: '#5c4a3a', formality: 'smart' }),
    ];
    const o = scoreOutfit(items, { conditions: buildConditions(new Date('2026-10-15T12:00:00'), 18), formality: 'smart', colorMode: 'british' });
    expect(o.warnings.filter((w) => w.startsWith('英国流'))).toHaveLength(2);
  });
});
