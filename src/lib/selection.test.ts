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
