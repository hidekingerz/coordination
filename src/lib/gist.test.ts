import { describe, expect, it } from 'vitest';
import { fetchWardrobeFromSource, resolveSource } from './gist';

const ID = '0123456789abcdef0123456789abcdef';

describe('resolveSource', () => {
  it('accepts a bare gist id', () => {
    expect(resolveSource(` ${ID} `)).toEqual({ kind: 'gist', id: ID, url: `https://api.github.com/gists/${ID}` });
  });
  it('accepts a gist page url with or without user, and with a revision', () => {
    expect(resolveSource(`https://gist.github.com/someone/${ID}`).id).toBe(ID);
    expect(resolveSource(`https://gist.github.com/${ID}`).id).toBe(ID);
    expect(resolveSource(`gist.github.com/someone/${ID}/abcdef1234567890abcdef1234567890abcdef12#file-x-json`).id).toBe(ID);
  });
  it('fetches raw gist urls directly', () => {
    const url = `https://gist.githubusercontent.com/someone/${ID}/raw/wardrobe.json`;
    expect(resolveSource(url)).toEqual({ kind: 'raw', url });
  });
  it('turns a github blob url into a raw url', () => {
    expect(resolveSource('https://github.com/u/r/blob/main/data/w.json')).toEqual({
      kind: 'raw',
      url: 'https://raw.githubusercontent.com/u/r/main/data/w.json',
    });
  });
  it('rejects garbage', () => {
    expect(() => resolveSource('')).toThrow();
    expect(() => resolveSource('not a url at all')).toThrow();
    expect(() => resolveSource('https://gist.github.com/someone/')).toThrow(/ID/);
  });
});

const item = { id: 'a', name: '白T', category: 'tops', color: '#ffffff', seasons: ['summer'], warmth: 1, formality: 'casual' };

function response(body: unknown, status = 200, asText = false): Response {
  const text = asText ? String(body) : JSON.stringify(body);
  return new Response(text, { status, headers: { 'content-type': asText ? 'text/plain' : 'application/json' } });
}

describe('fetchWardrobeFromSource', () => {
  it('reads the json file of a gist via the api', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return response({
        html_url: `https://gist.github.com/x/${ID}`,
        files: {
          'README.md': { filename: 'README.md', content: '# memo' },
          'wardrobe.json': { filename: 'wardrobe.json', content: JSON.stringify({ items: [item] }) },
        },
      });
    };
    const r = await fetchWardrobeFromSource(ID, fetchImpl);
    expect(calls).toEqual([`https://api.github.com/gists/${ID}`]);
    expect(r.items).toHaveLength(1);
    expect(r.fileName).toBe('wardrobe.json');
    expect(r.sourceUrl).toBe(`https://gist.github.com/x/${ID}`);
  });

  it('falls back to raw_url when the api truncates the file', async () => {
    const fetchImpl = async (url: string) => {
      if (url.startsWith('https://api.github.com/'))
        return response({ files: { 'w.json': { filename: 'w.json', content: '', truncated: true, raw_url: 'https://raw/w.json' } } });
      if (url === 'https://raw/w.json') return response(JSON.stringify([item]), 200, true);
      throw new Error('unexpected ' + url);
    };
    const r = await fetchWardrobeFromSource(`https://gist.github.com/x/${ID}`, fetchImpl);
    expect(r.items[0].name).toBe('白T');
  });

  it('tries other files when the first is not wardrobe json', async () => {
    const fetchImpl = async () =>
      response({ files: { 'a.json': { filename: 'a.json', content: '{"foo":1}' }, 'b.txt': { filename: 'b.txt', content: JSON.stringify([item]) } } });
    const r = await fetchWardrobeFromSource(ID, fetchImpl);
    expect(r.fileName).toBe('b.txt');
  });

  it('explains 404 and rate limits', async () => {
    await expect(fetchWardrobeFromSource(ID, async () => response({}, 404))).rejects.toThrow(/見つかりません/);
    await expect(fetchWardrobeFromSource(ID, async () => response({}, 403))).rejects.toThrow(/制限/);
  });

  it('reads a raw url as plain json', async () => {
    const r = await fetchWardrobeFromSource('https://example.com/w.json', async () => response(JSON.stringify([item]), 200, true));
    expect(r.items).toHaveLength(1);
    expect(r.sourceUrl).toBe('https://example.com/w.json');
  });

  it('wraps network failures', async () => {
    await expect(
      fetchWardrobeFromSource(ID, async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toThrow(/ネットワーク/);
  });
});
