// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ItemForm } from './ItemForm';
import { Swatch } from './Swatch';
import { WardrobeView } from './WardrobeView';
import { SAMPLE_WARDROBE } from '../data/sample';

afterEach(cleanup);

describe('accessible names (axe: label / label-title-only / aria-prohibited-attr)', () => {
  it('labels the colour picker and the hex field for both main and sub colour', () => {
    render(<ItemForm initial={{ ...SAMPLE_WARDROBE[0], subColor: '#ffffff' }} onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText('主色を選ぶ')).toBeTruthy();
    expect(screen.getByLabelText('主色 (#rrggbb)')).toBeTruthy();
    expect(screen.getByLabelText('副色を選ぶ')).toBeTruthy();
    expect(screen.getByLabelText('副色 (#rrggbb)')).toBeTruthy();
  });

  it('gives the colour swatch an image role so its label is allowed', () => {
    render(<Swatch color="#1f2a44" title="ネイビー" />);
    expect(screen.getByRole('img', { name: 'ネイビー' })).toBeTruthy();
  });

  it('names the sort select in the edit screen', () => {
    render(<WardrobeView wardrobe={SAMPLE_WARDROBE} wearLog={[]} onChange={vi.fn()} onWear={vi.fn()} onUnwear={vi.fn()} onImportWearLog={vi.fn()} onBack={vi.fn()} />);
    // title だけだと axe の label-title-only になるので、aria-label で名前を付ける
    expect(screen.getByRole('combobox', { name: '並び順' }).getAttribute('aria-label')).toBe('並び順');
  });
});

import { SuggestConditions } from './SuggestConditions';
import { buildConditions } from '../lib/season';
import { DEFAULT_LOCATION } from '../lib/location';

describe('status-line links (axe: label-content-name-mismatch)', () => {
  const renderConditions = () =>
    render(
      <SuggestConditions
        hasWearLog={false}
        conditions={buildConditions(new Date('2026-11-22T12:00:00'), 15, 8)}
        dateMode="today"
        dateStr="2026-11-22"
        onPickDate={() => {}}
        onChangeDate={() => {}}
        location={DEFAULT_LOCATION}
        locating={{ status: 'idle' }}
        forecast={{ status: 'ok', data: { max: 15, min: 8 } }}
        onChangeLocation={() => {}}
        tempStr="15"
        tempIsManual={false}
        onChangeTemp={() => {}}
        onResetTemp={() => {}}
        formality=""
        onChangeFormality={() => {}}
        freshness="balanced"
        onChangeFreshness={() => {}}
        colorMode="standard"
        onChangeColorMode={() => {}}
      />,
    );

  it('shows the colour-mode link as 「色合わせ: 標準 ▾」 and keeps the visible text in its name', () => {
    renderConditions();
    const link = screen.getByRole('button', { name: /^色合わせ: 標準/ });
    expect(link.textContent).toBe('色合わせ: 標準 ▾');
  });

  it('keeps the visible location name at the start of the location link name', () => {
    renderConditions();
    expect(screen.getByRole('button', { name: /^東京/ }).textContent).toBe('東京 ▾');
  });
});

describe('heading order (axe: heading-order)', () => {
  it('uses a level-2 heading in the item form', () => {
    render(<ItemForm onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: 'アイテムを追加' })).toBeTruthy();
  });
});

import { ClosetPanel } from './ClosetPanel';
import { buildWearStats } from '../lib/wear';
import { closetTile } from './closetTestUtils';

describe('closet tiles (axe: label-content-name-mismatch)', () => {
  it('reads out what the tile shows (brand, name, last worn) and leaves the state to aria-pressed', () => {
    const item = { ...SAMPLE_WARDROBE.find((i) => i.id === 's-tops-1')!, seasons: ['spring', 'summer', 'autumn', 'winter'] as const };
    localStorage.setItem('coordination.closet.open', '1');
    render(
      <ClosetPanel
        wardrobe={[{ ...item, seasons: [...item.seasons] }]}
        conditions={buildConditions(new Date('2026-11-22T12:00:00'), 15, 8)}
        wearStats={buildWearStats([{ itemId: 's-tops-1', date: '2026-11-19' }], '2026-11-22')}
        selected={['s-tops-1']}
        onToggle={() => {}}
        onClear={() => {}}
        onEdit={() => {}}
        onImport={() => {}}
        onLoadSample={() => {}}
      />,
    );
    const tile = closetTile('白の無地Tシャツ');
    expect(tile.getAttribute('aria-label')).toBeNull();
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    expect(tile.textContent).toContain('ユニクロ');
    expect(tile.textContent).toContain('3日前');
    localStorage.clear();
  });
});
