import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWardrobeFromSource, loadLastSource, resolveSource, saveLastSource } from './gist';

const ID = '0123456789abcdef0123456789abcdef';
const item = { id: 'a', name: '白T', category: 'tops', color: '#ffffff', seasons: ['summer'], warmth: 1, formality: 'casual' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const text = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain' } });

describe('resolveSource: what counts as a gist id or a URL', () => {
  it('needs 20 to 40 hex digits for a bare id, and nothing else around it', () => {
    expect(resolveSource('a'.repeat(20)).kind).toBe('gist');
    expect(resolveSource('A'.repeat(40)).id).toBe('a'.repeat(40)); // 大文字は小文字にそろえる
    expect(resolveSource('a'.repeat(19)).kind).toBe('raw'); // 短すぎる -> URL として扱う
    expect(resolveSource(`x${ID}`).kind).toBe('raw');
    expect(resolveSource(`${ID}x`).kind).toBe('raw');
  });

  it('adds https:// only when the scheme is missing, and keeps http as given', () => {
    expect(resolveSource('example.com/w.json').url).toBe('https://example.com/w.json');
    expect(resolveSource('http://example.com/w.json').url).toBe('http://example.com/w.json');
    expect(resolveSource('HTTPS://example.com/w.json').url).toBe('https://example.com/w.json');
    expect(resolveSource('example.com:8080/w.json').url).toBe('https://example.com:8080/w.json'); // ポート付きでもスキームとは見ない
    // 途中に :// があっても (リダイレクト先の URL など)、先頭に無ければスキームは無い
    expect(resolveSource('example.com/r?u=https://x.com/w.json').url).toBe('https://example.com/r?u=https://x.com/w.json');
  });

  it('rejects schemes other than http(s)', () => {
    expect(() => resolveSource('ftp://example.com/w.json')).toThrow('http(s) の URL のみ対応しています');
    expect(() => resolveSource('file:///tmp/w.json')).toThrow('http(s) の URL のみ対応しています');
  });

  it('turns only github.com blob URLs into raw, and leaves other GitHub pages alone', () => {
    expect(resolveSource('https://github.com/u/r/tree/main/data').url).toBe('https://github.com/u/r/tree/main/data');
    expect(resolveSource('https://example.com/u/r/blob/main/w.json').url).toBe('https://example.com/u/r/blob/main/w.json');
  });

  it('says what is missing', () => {
    expect(() => resolveSource('   ')).toThrow('URL または Gist の ID を入力してください');
    expect(() => resolveSource('https://exa mple.com')).toThrow('URL の形式が正しくありません');
  });
});

describe('fetchWardrobeFromSource: failures', () => {
  it('explains each HTTP failure', async () => {
    await expect(fetchWardrobeFromSource(ID, async () => json({}, 404))).rejects.toThrow('Gist が見つかりません。URL か ID を確認してください (削除済みの Gist は取得できません)');
    await expect(fetchWardrobeFromSource(ID, async () => json({}, 429))).rejects.toThrow(/利用制限/);
    await expect(fetchWardrobeFromSource(ID, async () => json({}, 500))).rejects.toThrow('取得に失敗しました (HTTP 500)');
    await expect(fetchWardrobeFromSource('https://example.com/w.json', async () => text('', 404))).rejects.toThrow('ファイルが見つかりません (404)');
    await expect(fetchWardrobeFromSource('https://example.com/w.json', async () => text('', 403))).rejects.toThrow(/利用制限/);
  });

  it('wraps a network failure of a raw URL too', async () => {
    await expect(
      fetchWardrobeFromSource('https://example.com/w.json', async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toThrow('ネットワークエラーで取得できませんでした。URL と接続を確認してください');
  });

  it('asks the GitHub API for its JSON format', async () => {
    const fetchImpl = vi.fn(async () => json({ files: { 'w.json': { filename: 'w.json', content: JSON.stringify([item]) } } }));
    await fetchWardrobeFromSource(ID, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(`https://api.github.com/gists/${ID}`, { headers: { Accept: 'application/vnd.github+json' } });
  });

  it('says so when the gist has no files', async () => {
    await expect(fetchWardrobeFromSource(ID, async () => json({ files: {} }))).rejects.toThrow('Gist にファイルがありません');
    await expect(fetchWardrobeFromSource(ID, async () => json({}))).rejects.toThrow('Gist にファイルがありません');
  });

  it('lists why each file could not be read when none can', async () => {
    const files = { 'a.md': { filename: 'a.md', content: '# メモ' }, 'b.json': { filename: 'b.json', content: '[]' }, x: { content: 'x' } };
    const err = await fetchWardrobeFromSource(ID, async () => json({ files })).catch((e: Error) => e.message);
    expect(err).toBe(['Gist 内に読み込めるファイルがありません', 'b.json: 有効なアイテムがありません', 'a.md: JSON として読み取れません', '(無名): JSON として読み取れません'].join('\n'));
  });

  it('tries a .json file before others, whatever order the API lists them in', async () => {
    const files = { 'z.txt': { filename: 'z.txt', content: JSON.stringify([{ ...item, name: 'txt の服' }]) }, 'a.JSON': { filename: 'a.JSON', content: JSON.stringify([item]) } };
    const r = await fetchWardrobeFromSource(ID, async () => json({ files }));
    expect(r.fileName).toBe('a.JSON');
  });

  it('uses the API URL as the source when the gist has no html_url', async () => {
    const r = await fetchWardrobeFromSource(ID, async () => json({ files: { 'w.json': { filename: 'w.json', content: JSON.stringify([item]) } } }));
    expect(r.sourceUrl).toBe(`https://api.github.com/gists/${ID}`);
  });
});

describe('the last used source', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  afterEach(() => vi.unstubAllGlobals());

  it('remembers a source and forgets it when saved empty', () => {
    vi.stubGlobal('localStorage', memory());
    saveLastSource('https://example.com/w.json');
    expect(loadLastSource()).toBe('https://example.com/w.json');
    saveLastSource('');
    expect(loadLastSource()).toBe('');
    expect(localStorage.getItem('coordination.import.lastSource')).toBeNull();
  });

  it('keeps working when storage is not available', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadLastSource()).toBe('');
    expect(() => saveLastSource('x')).not.toThrow();
    expect(() => saveLastSource('')).not.toThrow();
  });
});
