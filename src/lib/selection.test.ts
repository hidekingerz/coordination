import { describe, expect, it } from 'vitest';
import { toggleMustInclude } from './selection';
import { SAMPLE_WARDROBE } from '../data/sample';

const w = SAMPLE_WARDROBE;
// s-outer-1 / s-outer-2 はアウター、s-tops-1 はトップス

describe('toggleMustInclude', () => {
  it('adds an unselected item', () => {
    expect(toggleMustInclude([], 's-outer-1', w)).toEqual(['s-outer-1']);
  });

  it('removes an already selected item', () => {
    expect(toggleMustInclude(['s-outer-1', 's-tops-1'], 's-outer-1', w)).toEqual(['s-tops-1']);
  });

  it('replaces a selected item of the same category in place', () => {
    expect(toggleMustInclude(['s-outer-1', 's-tops-1'], 's-outer-2', w)).toEqual(['s-outer-2', 's-tops-1']);
  });

  it('keeps items of other categories', () => {
    expect(toggleMustInclude(['s-tops-1'], 's-outer-1', w)).toEqual(['s-tops-1', 's-outer-1']);
  });

  it('leaves ids that are no longer in the wardrobe alone (pruning is the caller\'s job)', () => {
    expect(toggleMustInclude(['gone', 's-outer-1'], 's-outer-2', w)).toEqual(['gone', 's-outer-2']);
  });
});

describe('toggleMustInclude outer layers', () => {
  // s-outer-1 ステンカラーコート / s-outer-3 トレンチコート は外套、s-outer-4 ミリタリージャケット / s-outer-5 カーディガン は中間着
  it('lets a mid layer and a shell coexist so the layered outfit stays selectable', () => {
    expect(toggleMustInclude(['s-outer-5'], 's-outer-1', w)).toEqual(['s-outer-5', 's-outer-1']);
  });

  it('replaces only the same layer: a second shell swaps the shell and keeps the cardigan', () => {
    expect(toggleMustInclude(['s-outer-5', 's-outer-1'], 's-outer-3', w)).toEqual(['s-outer-5', 's-outer-3']);
  });

  it('replaces a mid layer with another mid layer', () => {
    expect(toggleMustInclude(['s-outer-1', 's-outer-5'], 's-outer-4', w)).toEqual(['s-outer-1', 's-outer-4']);
  });
});
