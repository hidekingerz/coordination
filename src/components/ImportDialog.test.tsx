// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ClothingItem } from '../types';
import type { WearLog } from '../lib/wear';
import { ImportDialog } from './ImportDialog';

const ITEM = { name: '白のTシャツ', category: 'トップス' };
const JSON_TEXT = JSON.stringify([ITEM]);
const GIST = 'https://gist.github.com/someone/0123456789abcdef0123456789abcdef';

type FetchArgs = [url: string, init?: RequestInit];
let fetchMock: ReturnType<typeof vi.fn<(...a: FetchArgs) => Promise<Response>>>;
const ok = (body: unknown, text = typeof body === 'string' ? body : JSON.stringify(body)) =>
  ({ ok: true, status: 200, text: async () => text, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) }) as unknown as Response;
const status = (code: number) => ({ ok: false, status: code, text: async () => '', json: async () => ({}) }) as unknown as Response;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(async () => ok(JSON_TEXT));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog(existingCount = 0) {
  const onApply = vi.fn<(items: ClothingItem[], mode: 'merge' | 'replace', wearLog?: WearLog) => void>();
  const onClose = vi.fn();
  render(<ImportDialog existingCount={existingCount} onApply={onApply} onClose={onClose} />);
  return { onApply, onClose };
}
const urlBox = () => screen.getByPlaceholderText('https://gist.github.com/you/0123abcd...');
const pasteBox = () => screen.getByPlaceholderText(/白のTシャツ/);
const load = () => fireEvent.click(screen.getByRole('button', { name: '読み込む' }));
const apply = () => fireEvent.click(screen.getByRole('button', { name: '取り込む' }));

describe('ImportDialog: pasted JSON', () => {
  it('shows a preview and replaces an empty closet without asking how', () => {
    const { onApply } = renderDialog(0);
    expect((screen.getByRole('button', { name: '取り込む' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '貼り付けた内容を読み込む' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(pasteBox(), { target: { value: JSON_TEXT } });
    fireEvent.click(screen.getByRole('button', { name: '貼り付けた内容を読み込む' }));
    expect(screen.getByRole('heading', { name: /1 件を読み込みました/ }).textContent).toContain('貼り付けた JSON');
    expect(screen.queryByRole('radio')).toBeNull();
    apply();
    expect(onApply.mock.calls[0][1]).toBe('replace');
    expect(onApply.mock.calls[0][0][0].name).toBe('白のTシャツ');
  });

  it('asks whether to merge or replace when the closet has items, merging by default', () => {
    const { onApply } = renderDialog(30);
    fireEvent.change(pasteBox(), { target: { value: JSON_TEXT } });
    fireEvent.click(screen.getByRole('button', { name: '貼り付けた内容を読み込む' }));
    const merge = screen.getByRole('radio', { name: /既存 30 件に追加/ }) as HTMLInputElement;
    expect(merge.checked).toBe(true);
    apply();
    expect(onApply.mock.calls[0][1]).toBe('merge');
    fireEvent.click(screen.getByRole('radio', { name: /既存を置き換え/ }));
    apply();
    expect(onApply.mock.calls[1][1]).toBe('replace');
    fireEvent.click(screen.getByRole('radio', { name: /既存 30 件に追加/ }));
    apply();
    expect(onApply.mock.calls[2][1]).toBe('merge');
  });

  it('shows an error for broken JSON and keeps 取り込む disabled', () => {
    renderDialog();
    fireEvent.change(pasteBox(), { target: { value: '{ 壊れている' } });
    fireEvent.click(screen.getByRole('button', { name: '貼り付けた内容を読み込む' }));
    expect(screen.getByText('JSON として読み取れません')).toBeTruthy();
    expect((screen.getByRole('button', { name: '取り込む' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists the first 5 warnings and shows the rest on request', () => {
    renderDialog();
    const rows = Array.from({ length: 3 }, (_, i) => ({ name: `服${i + 1}`, category: 'tops' })); // 1 行 3 件 (色・季節・テイスト) の補完
    fireEvent.change(pasteBox(), { target: { value: JSON.stringify(rows) } });
    fireEvent.click(screen.getByRole('button', { name: '貼り付けた内容を読み込む' }));
    expect(screen.getByText(/補完した項目があります \(\d+ 件\)/)).toBeTruthy();
    const listed = () => screen.getAllByText(/件目「服\d」/).length;
    expect(listed()).toBe(5);
    fireEvent.click(screen.getByRole('button', { name: 'すべて表示' }));
    expect(listed()).toBeGreaterThan(5);
    expect(screen.queryByRole('button', { name: 'すべて表示' })).toBeNull();
  });

  it('lists the first 8 items and counts the rest, and mentions an included wear history', () => {
    const { onApply } = renderDialog();
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, name: `服${i + 1}`, category: 'tops', color: '白', seasons: '通年', warmth: 3, formality: 'casual' }));
    const wearLog = [{ itemId: 'x0', date: '2026-11-20' }];
    fireEvent.change(pasteBox(), { target: { value: JSON.stringify({ items, wearLog }) } });
    fireEvent.click(screen.getByRole('button', { name: '貼り付けた内容を読み込む' }));
    expect(screen.getByText('ほか 2 件')).toBeTruthy();
    expect(screen.getByText('着用履歴 1 件も取り込みます。')).toBeTruthy();
    apply();
    expect(onApply.mock.calls[0][2]).toEqual(wearLog);
  });
});

describe('ImportDialog: a file', () => {
  it('opens the file chooser from ファイルを選ぶ', () => {
    renderDialog();
    const input = screen.getByLabelText('JSON ファイル') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'ファイルを選ぶ' }));
    expect(click).toHaveBeenCalled();
  });

  it('reads the chosen file and names it in the preview', async () => {
    renderDialog();
    const input = screen.getByLabelText('JSON ファイル') as HTMLInputElement;
    const file = new File([JSON_TEXT], 'closet.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    expect((await screen.findByRole('heading', { name: /1 件を読み込みました/ })).textContent).toContain('ファイル: closet.json');
  });

  it('shows an error when the file is not usable', async () => {
    renderDialog();
    const input = screen.getByLabelText('JSON ファイル') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['[]'], 'empty.json')] } });
    expect(await screen.findByText('有効なアイテムがありません')).toBeTruthy();
  });
});

describe('ImportDialog: Gist and URLs', () => {
  it('loads a gist page URL through the API and prefers the .json file', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ html_url: GIST, files: { 'notes.md': { filename: 'notes.md', content: '# メモ' }, 'closet.json': { filename: 'closet.json', content: JSON_TEXT } } }),
    );
    const { onApply } = renderDialog();
    fireEvent.change(urlBox(), { target: { value: GIST } });
    load();
    expect((await screen.findByRole('heading', { name: /1 件を読み込みました/ })).textContent).toContain('Gist: closet.json');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/gists/0123456789abcdef0123456789abcdef');
    apply();
    expect(onApply).toHaveBeenCalled();
    expect(localStorage.getItem('coordination.import.lastSource')).toBe(GIST);
  });

  it('loads with the Enter key and shows 取得中… while waiting', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderDialog();
    fireEvent.change(urlBox(), { target: { value: 'https://example.com/closet.json' } });
    fireEvent.keyDown(urlBox(), { key: 'Enter' });
    expect(screen.getByRole('button', { name: '取得中…' })).toBeTruthy();
    resolve(ok(JSON_TEXT));
    expect(await screen.findByRole('heading', { name: /1 件を読み込みました/ })).toBeTruthy();
  });

  it('falls back to a general message when the failure has none', async () => {
    fetchMock.mockResolvedValueOnce(ok('[]'));
    renderDialog();
    fireEvent.change(urlBox(), { target: { value: 'https://example.com/a.json' } });
    load();
    expect(await screen.findByText('有効なアイテムがありません')).toBeTruthy();
  });

  it('shows the error when the gist is missing', async () => {
    fetchMock.mockResolvedValueOnce(status(404));
    renderDialog();
    fireEvent.change(urlBox(), { target: { value: GIST } });
    load();
    expect(await screen.findByText(/Gist が見つかりません/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '取り込む' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('fills the box with the last used source and does not remember pasted text', async () => {
    localStorage.setItem('coordination.import.lastSource', GIST);
    renderDialog();
    expect((urlBox() as HTMLInputElement).value).toBe(GIST);
    cleanup();
    localStorage.clear();
    renderDialog();
    fireEvent.change(pasteBox(), { target: { value: JSON_TEXT } });
    fireEvent.click(screen.getByRole('button', { name: '貼り付けた内容を読み込む' }));
    apply();
    expect(localStorage.getItem('coordination.import.lastSource')).toBeNull();
  });

  it('remembers the URL that was actually loaded, not what is typed in the box afterwards', async () => {
    renderDialog();
    fireEvent.change(urlBox(), { target: { value: 'https://example.com/a.json' } });
    load();
    await screen.findByText(/1 件を読み込みました/);
    fireEvent.change(urlBox(), { target: { value: 'https://example.com/never-loaded.json' } });
    apply();
    expect(localStorage.getItem('coordination.import.lastSource')).toBe('https://example.com/a.json');
  });

  it('forgets the loaded URL when a later load fails', async () => {
    renderDialog();
    fireEvent.change(urlBox(), { target: { value: 'https://example.com/a.json' } });
    load();
    await screen.findByText(/1 件を読み込みました/);
    fetchMock.mockResolvedValueOnce(status(500));
    fireEvent.change(urlBox(), { target: { value: 'https://example.com/b.json' } });
    load();
    await waitFor(() => expect(screen.queryByText(/1 件を読み込みました/)).toBeNull());
    expect(screen.getByText(/取得に失敗しました \(HTTP 500\)/)).toBeTruthy();
  });
});

describe('ImportDialog: closing', () => {
  it('closes with 閉じる', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('uses a level-2 heading so the dialog does not skip a level after the page h1', () => {
    renderDialog();
    expect(screen.getByRole('heading', { level: 2, name: 'クローゼットを取り込む' })).toBeTruthy();
  });
});
