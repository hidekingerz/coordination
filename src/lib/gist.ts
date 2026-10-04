/** GitHub Gist (または任意の URL) からクローゼットの JSON を取得する */
import { parseImportDetailed, type ImportResult } from './storage';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface GistSource {
  kind: 'gist' | 'raw';
  /** 実際に取得する URL */
  url: string;
  /** kind === 'gist' のときの Gist ID */
  id?: string;
}

const GIST_ID = /^[0-9a-f]{20,40}$/i;
const API = 'https://api.github.com/gists/';

/**
 * ユーザーが貼った文字列を取得先に変換する。
 * - Gist の ID だけ
 * - https://gist.github.com/{user}/{id}
 * - https://gist.githubusercontent.com/{user}/{id}/raw/... (raw URL)
 * - https://github.com/{user}/{repo}/blob/{branch}/path.json (raw に変換)
 * - その他の https URL (そのまま取得)
 */
export function resolveSource(input: string): GistSource {
  const text = input.trim();
  if (!text) throw new Error('URL または Gist の ID を入力してください');
  if (GIST_ID.test(text)) return { kind: 'gist', id: text.toLowerCase(), url: API + text.toLowerCase() };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error('URL の形式が正しくありません');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('http(s) の URL のみ対応しています');

  const segments = url.pathname.split('/').filter(Boolean);

  if (url.hostname === 'gist.github.com') {
    const id = segments.find((s) => GIST_ID.test(s));
    if (!id) throw new Error('Gist の URL から ID を読み取れませんでした');
    return { kind: 'gist', id: id.toLowerCase(), url: API + id.toLowerCase() };
  }

  if (url.hostname === 'github.com' && segments[2] === 'blob') {
    // github.com/{user}/{repo}/blob/{branch}/{path} -> raw.githubusercontent.com/{user}/{repo}/{branch}/{path}
    const [user, repo, , ...rest] = segments;
    return { kind: 'raw', url: `https://raw.githubusercontent.com/${user}/${repo}/${rest.join('/')}` };
  }

  return { kind: 'raw', url: url.toString() };
}

interface GistFile {
  filename?: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

export interface GistImportResult extends ImportResult {
  /** 読み込んだファイル名 (Gist のとき) */
  fileName?: string;
  /** 取得元の URL */
  sourceUrl: string;
}

function describeHttpError(status: number, kind: GistSource['kind']): string {
  if (status === 404) {
    return kind === 'gist'
      ? 'Gist が見つかりません。URL か ID を確認してください (削除済みの Gist は取得できません)'
      : 'ファイルが見つかりません (404)';
  }
  if (status === 403 || status === 429) {
    return 'GitHub API の利用制限に達しました。しばらく待つか、Gist の「Raw」ボタンの URL を貼ってください';
  }
  return `取得に失敗しました (HTTP ${status})`;
}

async function fetchText(url: string, kind: GistSource['kind'], fetchImpl: FetchLike): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch {
    throw new Error('ネットワークエラーで取得できませんでした。URL と接続を確認してください');
  }
  if (!res.ok) throw new Error(describeHttpError(res.status, kind));
  return res.text();
}

/** Gist / URL からクローゼットを読み込む */
export async function fetchWardrobeFromSource(
  input: string,
  fetchImpl: FetchLike = (u, init) => fetch(u, init),
): Promise<GistImportResult> {
  const source = resolveSource(input);

  if (source.kind === 'raw') {
    const text = await fetchText(source.url, 'raw', fetchImpl);
    return { ...parseImportDetailed(text), sourceUrl: source.url };
  }

  let res: Response;
  try {
    res = await fetchImpl(source.url, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    throw new Error('ネットワークエラーで取得できませんでした。URL と接続を確認してください');
  }
  if (!res.ok) throw new Error(describeHttpError(res.status, 'gist'));
  const json = (await res.json()) as { files?: Record<string, GistFile>; html_url?: string };
  const files = Object.values(json.files ?? {}).filter((f): f is GistFile => Boolean(f));
  if (files.length === 0) throw new Error('Gist にファイルがありません');

  // .json を優先し、それ以外も順に試す
  const ordered = [...files].sort((a, b) => Number(isJsonName(b.filename)) - Number(isJsonName(a.filename)));
  const failures: string[] = [];
  for (const file of ordered) {
    try {
      const text =
        file.truncated && file.raw_url ? await fetchText(file.raw_url, 'raw', fetchImpl) : (file.content ?? '');
      const parsed = parseImportDetailed(text);
      return { ...parsed, fileName: file.filename, sourceUrl: json.html_url ?? source.url };
    } catch (e) {
      failures.push(`${file.filename ?? '(無名)'}: ${(e as Error).message}`);
    }
  }
  throw new Error(`Gist 内に読み込めるファイルがありません\n${failures.join('\n')}`);
}

function isJsonName(name?: string): boolean {
  return /\.json$/i.test(name ?? '');
}

/** 直近に使った取得元を覚えておく */
const LAST_SOURCE_KEY = 'coordination.import.lastSource';

export function loadLastSource(): string {
  try {
    return localStorage.getItem(LAST_SOURCE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastSource(value: string): void {
  try {
    if (value) localStorage.setItem(LAST_SOURCE_KEY, value);
    else localStorage.removeItem(LAST_SOURCE_KEY);
  } catch {
    /* 保存できなくても動作には影響しない */
  }
}

