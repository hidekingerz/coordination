#!/usr/bin/env node
/**
 * ユニクロ / GU 以外のブランドの商品ページから、服データ作成に必要な手がかりを抜き出す。
 * 依存なし。ページを取得して、タイトル・meta・JSON-LD・選択肢 (色/サイズ)・商品画像・
 * 「素材」「カラー」などのキーワード周辺の本文を JSON で出す。
 *
 * 使い方: node fetch-page.mjs <商品ページURL> [--html out.html]
 *   - 取得できれば JSON を stdout に出す (exit 0)
 *   - 403/503/タイムアウトなら理由を stderr に出して exit 3 (→ ユーザーに貼り付けを頼む)
 *   - 本文が極端に短い (JS 描画) ときも exit 3
 *
 * 小規模ブランドの公式 EC (gallipoli.jp など) は普通の HTML を返すことが多い。
 * 大手モール (ZOZOTOWN) や一部ブランドはボット対策で弾かれるので、1 回試して駄目なら粘らない。
 */
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const KEYWORDS = ['素材', '混率', '品質', 'カラー', '色', 'サイズ', '商品番号', '品番', '原産', '生産国', '商品説明', '特長', '仕様'];

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//.test(a));
const htmlOut = args.includes('--html') ? args[args.indexOf('--html') + 1] : null;
if (!url) {
  console.error('使い方: node fetch-page.mjs <商品ページURL> [--html out.html]');
  process.exit(2);
}

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function textOf(html) {
  const noScript = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ');
  return decode(noScript.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function meta(html) {
  const out = {};
  for (const m of html.matchAll(/<meta\s+[^>]*?(?:property|name)=["']([^"']+)["'][^>]*?content=["']([^"']*)["'][^>]*>/gi)) {
    const k = m[1].toLowerCase();
    if (/^(og:title|og:description|og:image|description|product:price:amount|product:brand|twitter:image)$/.test(k) && !out[k]) out[k] = decode(m[2]);
  }
  for (const m of html.matchAll(/<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']([^"']+)["'][^>]*>/gi)) {
    const k = m[2].toLowerCase();
    if (/^(og:title|og:description|og:image|description|product:price:amount|product:brand|twitter:image)$/.test(k) && !out[k]) out[k] = decode(m[1]);
  }
  return out;
}

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const nodes = Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j];
      for (const n of nodes) if (n && /Product|Offer/i.test(String(n['@type']))) out.push(n);
    } catch {
      /* 壊れた JSON-LD は無視 */
    }
  }
  return out;
}

function options(html) {
  const groups = [];
  for (const sel of html.matchAll(/<select[^>]*>([\s\S]*?)<\/select>/gi)) {
    const vals = [...sel[1].matchAll(/<option[^>]*>([^<]*)<\/option>/gi)]
      .map((o) => decode(o[1]).trim())
      .filter((v) => v && !/選択|選んで|select/i.test(v));
    if (vals.length) groups.push(vals);
  }
  // ラジオ/ボタン型の色選択 (label や data-color 属性)
  const dataColors = [...html.matchAll(/data-(?:color|colour|color-name)=["']([^"']+)["']/gi)].map((m) => decode(m[1]));
  const uniq = (arr) => [...new Set(arr)];
  return { selects: groups.map(uniq), dataColors: uniq(dataColors) };
}

function images(html, pageUrl) {
  const code = (pageUrl.match(/(?:pcode|code|id|item|goods|product)[=_/-]?([A-Za-z0-9-]{4,})/i) || [])[1];
  const all = [...html.matchAll(/(?:src|href|content|data-src|data-original)=["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi)].map((m) => {
    try {
      return new URL(decode(m[1]), pageUrl).toString();
    } catch {
      return null;
    }
  });
  const uniq = [...new Set(all.filter(Boolean))];
  const withCode = code ? uniq.filter((u) => u.includes(code)) : [];
  return { productCodeGuess: code ?? null, productImages: (withCode.length ? withCode : uniq).slice(0, 40) };
}

function contexts(text) {
  const out = {};
  for (const kw of KEYWORDS) {
    const hits = [];
    let idx = 0;
    while (hits.length < 3) {
      const i = text.indexOf(kw, idx);
      if (i < 0) break;
      hits.push(text.slice(Math.max(0, i - 40), i + 160));
      idx = i + kw.length + 160;
    }
    if (hits.length) out[kw] = hits;
  }
  return out;
}

const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 20000);
let res;
try {
  res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8' }, redirect: 'follow', signal: ctrl.signal });
} catch (e) {
  console.error(`取得できませんでした (${e.name === 'AbortError' ? 'タイムアウト' : e.message})。商品名・色・素材の貼り付けを頼んでください。`);
  process.exit(3);
} finally {
  clearTimeout(timer);
}
if (!res.ok) {
  console.error(`HTTP ${res.status}。ボット対策の可能性が高いので、商品名・色・素材の貼り付けを頼んでください。`);
  process.exit(3);
}
const html = await res.text();
if (htmlOut) writeFileSync(htmlOut, html);
const text = textOf(html);
if (text.length < 400) {
  console.error(`本文がほとんどありません (${text.length} 文字)。JavaScript 描画のページです。商品名・色・素材の貼り付けを頼んでください。`);
  process.exit(3);
}
const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
console.log(
  JSON.stringify(
    {
      url: res.url,
      title: titleM ? decode(titleM[1]).trim() : null,
      meta: meta(html),
      jsonLd: jsonLd(html),
      options: options(html),
      images: images(html, res.url),
      contexts: contexts(text),
      textLength: text.length,
    },
    null,
    2,
  ),
);
