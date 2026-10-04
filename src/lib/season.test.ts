import { describe, expect, it } from 'vitest';
import { acceptableSeasons, buildConditions, defaultWarmthForSeason, seasonOf, warmthForTemperature } from './season';

describe('seasonOf', () => {
  it('maps months to Japanese seasons', () => {
    expect(seasonOf(new Date('2026-04-10'))).toBe('spring');
    expect(seasonOf(new Date('2026-07-10'))).toBe('summer');
    expect(seasonOf(new Date('2026-10-02'))).toBe('autumn');
    expect(seasonOf(new Date('2026-01-10'))).toBe('winter');
    expect(seasonOf(new Date('2026-12-10'))).toBe('winter');
  });
});

describe('acceptableSeasons', () => {
  it('includes the previous season early in a season', () => {
    expect(acceptableSeasons(new Date('2026-09-05'))).toEqual(['autumn', 'summer']);
  });
  it('includes the next season late in a season', () => {
    expect(acceptableSeasons(new Date('2026-11-25'))).toEqual(['autumn', 'winter']);
  });
  it('is just the season in the middle', () => {
    expect(acceptableSeasons(new Date('2026-10-15'))).toEqual(['autumn']);
  });
});

describe('warmth', () => {
  it('maps temperature to warmth level', () => {
    expect(warmthForTemperature(32)).toBe(1);
    expect(warmthForTemperature(24)).toBe(2);
    expect(warmthForTemperature(18)).toBe(3);
    expect(warmthForTemperature(12)).toBe(4);
    expect(warmthForTemperature(3)).toBe(5);
  });
  it('defaults by season and progress', () => {
    expect(defaultWarmthForSeason('summer')).toBe(1);
    expect(defaultWarmthForSeason('winter')).toBe(5);
    expect(defaultWarmthForSeason('spring', 0.1)).toBe(4);
    expect(defaultWarmthForSeason('spring', 0.9)).toBe(2);
    expect(defaultWarmthForSeason('autumn', 0.1)).toBe(2);
    expect(defaultWarmthForSeason('autumn', 0.9)).toBe(4);
  });
  it('prefers temperature over season default', () => {
    const c = buildConditions(new Date('2026-01-10'), 25);
    expect(c.season).toBe('winter');
    expect(c.targetWarmth).toBe(2);
  });
});

describe('buildConditions with min temperature', () => {
  it('carries the minimum temperature alongside the maximum', () => {
    const c = buildConditions(new Date('2026-10-15T12:00:00'), 20, 9);
    expect(c.temperature).toBe(20);
    expect(c.minTemperature).toBe(9);
    expect(c.targetWarmth).toBe(3);
  });

  it('leaves minTemperature undefined when not given', () => {
    expect(buildConditions(new Date('2026-10-15T12:00:00'), 20).minTemperature).toBeUndefined();
  });
});
