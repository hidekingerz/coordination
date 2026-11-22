// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ImportDialog } from './ImportDialog';

const JSON_TEXT = JSON.stringify([{ name: '白のTシャツ', category: 'トップス' }]);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON_TEXT, json: async () => ({}) }) as unknown as Response));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ImportDialog: the remembered source', () => {
  it('remembers the URL that was actually loaded, not what is typed in the box afterwards', async () => {
    render(<ImportDialog existingCount={0} onApply={() => {}} onClose={() => {}} />);
    const box = screen.getByPlaceholderText('https://gist.github.com/you/0123abcd...');
    fireEvent.change(box, { target: { value: 'https://example.com/a.json' } });
    fireEvent.click(screen.getByRole('button', { name: '読み込む' }));
    await screen.findByText(/1 件を読み込みました/);
    fireEvent.change(box, { target: { value: 'https://example.com/never-loaded.json' } });
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));
    expect(localStorage.getItem('coordination.import.lastSource')).toBe('https://example.com/a.json');
  });

  it('uses a level-2 heading so the dialog does not skip a level after the page h1', () => {
    render(<ImportDialog existingCount={0} onApply={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: 'クローゼットを取り込む' })).toBeTruthy();
  });
});
