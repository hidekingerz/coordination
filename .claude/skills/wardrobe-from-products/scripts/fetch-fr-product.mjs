#!/usr/bin/env node
/**
 * ユニクロ / GU (Fast Retailing 系) の商品 API から、クローゼット登録に必要な情報を取り出す。
 * 依存なし。Node 18+ の fetch を使う。
 *
 * 使い方:
 *   node fetch-fr-product.mjs <商品URL | 商品番号 (E486119-000 / 486119) | 検索語> [--brand uniqlo|gu] [--limit N]
 *   例: node fetch-fr-product.mjs https://www.uniqlo.com/jp/ja/products/E486119-000/00
 *       node fetch-fr-product.mjs "スウェットパーカ" --brand gu --limit 3
 *
 * 出力: 整形した JSON を stdout に出す。商品 1 件ごとに、名前・価格・性別・カテゴリ階層・素材・
 *        カラー一覧 (コード / 名前 / 推定 hex / 色チップ画像 / 商品画像) を含む。
 */

const HOSTS = {
  uniqlo: 'https://www.uniqlo.com/jp',
  gu: 'https://www.gu-global.com/jp',
};

/** FR の色名 → 代表 hex。アプリ側の色判定 (color.ts) と相性のよい値にしてある */
const COLOR_HEX = {
  WHITE: '#f5f5f5',
  'OFF WHITE': '#ece7dc',
  NATURAL: '#e8e0cf',
  IVORY: '#ece7dc',
  CREAM: '#f1e9d2',
  'LIGHT GRAY': '#c4c4c4',
  GRAY: '#8a8a8a',
  'DARK GRAY': '#4a4a4a',
  CHARCOAL: '#3a3a3a',
  BLACK: '#141414',
  NAVY: '#1f2a44',
  'DARK NAVY': '#16203a',
  BLUE: '#3b6fb6',
  'LIGHT BLUE': '#a9c4e0',
  'DARK BLUE': '#2b4a7e',
  GREEN: '#3f8f4f',
  'LIGHT GREEN': '#8fcf9a',
  'DARK GREEN': '#2f4f3a',
  OLIVE: '#5a6b3a',
  KHAKI: '#7a7a55',
  BEIGE: '#d9c4a5',
  'LIGHT BEIGE': '#e8dcc5',
  'DARK BEIGE': '#bda27e',
  BROWN: '#5a3a22',
  'LIGHT BROWN': '#a07850',
  'DARK BROWN': '#3e2616',
  WINE: '#6e1f2e',
  RED: '#c0392b',
  'DARK RED': '#8b1e1e',
  PINK: '#e8a9b8',
  'LIGHT PINK': '#f3cfd8',
  'DARK PINK': '#c96a85',
  ORANGE: '#e67e22',
  'DARK ORANGE': '#b85c38',
  'LIGHT ORANGE': '#f2b07a',
  YELLOW: '#e5c33a',
  'LIGHT YELLOW': '#f1dd8a',
  'DARK YELLOW': '#d4a826',
  MUSTARD: '#d4a826',
  PURPLE: '#7a4fa3',
  'LIGHT PURPLE': '#b9a6d9',
  'DARK PURPLE': '#4e2f6e',
};

function guessHex(name) {
  if (!name) return null;
  const n = name.toUpperCase().trim();
  if (COLOR_HEX[n]) return COLOR_HEX[n];
  // "LIGHT XXX" / "DARK XXX" の未知の組み合わせはベース色から推定
  const m = n.match(/^(LIGHT|DARK)\s+(.+)$/);
  if (m && COLOR_HEX[m[2]]) return shade(COLOR_HEX[m[2]], m[1] === 'LIGHT' ? 0.35 : -0.35);
  return null;
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function parseArgs(argv) {
  const out = { brand: null, limit: 5, query: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--brand') out.brand = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]) || 5;
    else if (!out.query) out.query = a;
  }
  return out;
}

/** 入力から { brand, productId, priceGroup } または { brand, keyword } を決める */
function resolve(input, brandOpt) {
  const text = (input ?? '').trim();
  if (!text) throw new Error('商品 URL・商品番号・検索語のいずれかを指定してください');
  let brand = brandOpt;
  let m;
  try {
    const u = new URL(text);
    if (u.hostname.includes('uniqlo.com')) brand = 'uniqlo';
    else if (u.hostname.includes('gu-global.com')) brand = 'gu';
    else throw new Error(`ユニクロ / GU 以外の URL です: ${u.hostname}`);
    m = u.pathname.match(/products\/(E\d{6}-\d{3})(?:\/(\d{2}))?/);
    if (!m) throw new Error('URL から商品番号 (E123456-000) を読み取れませんでした');
    return { brand, productId: m[1], priceGroup: m[2] ?? '00' };
  } catch (e) {
    if (e instanceof TypeError) {
      /* URL ではない */
    } else throw e;
  }
  if ((m = text.match(/^(E?)(\d{6})(?:-(\d{3}))?$/i))) {
    return { brand: brand ?? 'uniqlo', productId: `E${m[2]}-${m[3] ?? '000'}`, priceGroup: '00' };
  }
  return { brand: brand ?? 'uniqlo', keyword: text };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const json = await res.json();
  if (json.status && json.status !== 'ok') throw new Error(`API error: ${JSON.stringify(json).slice(0, 200)}`);
  return json.result ?? json;
}

function productUrl(brand, productId, colorCode) {
  return `${HOSTS[brand]}/ja/products/${productId}/00${colorCode ? `?colorDisplayCode=${colorCode}` : ''}`;
}

function normalizeDetail(brand, d) {
  const colors = (d.colors ?? []).map((c) => {
    const code = c.displayCode;
    return {
      code,
      name: c.name,
      // 色名からの推定値。微妙な色 (WINE と RED など) は chipImage を見て確認する
      hex: guessHex(c.name),
      chipImage: d.images?.chip?.[code] ?? null,
      image: d.images?.main?.[code]?.image ?? null,
      productUrl: productUrl(brand, d.productId, code),
    };
  });
  const bc = d.breadcrumbs ?? {};
  return {
    brand: brand === 'gu' ? 'GU' : 'ユニクロ',
    productId: d.productId,
    name: d.name,
    price: d.prices?.base?.value ?? null,
    gender: d.genderName ?? d.genderCategory ?? null,
    category: {
      class: bc.class ? `${bc.class.name} (${bc.class.locale})` : null,
      category: bc.category ? `${bc.category.name} (${bc.category.locale})` : null,
      subcategory: bc.subcategory ? `${bc.subcategory.name} (${bc.subcategory.locale})` : null,
    },
    composition: d.composition ?? null,
    designDetail: stripHtml(d.designDetail),
    description: stripHtml(d.longDescription ?? d.shortDescription),
    colors,
    url: productUrl(brand, d.productId),
  };
}

function stripHtml(s) {
  return s ? s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : null;
}

async function fetchDetail(brand, productId, priceGroup) {
  const base = `${HOSTS[brand]}/api/commerce/v5/ja/products`;
  const detail = await getJson(`${base}/${productId}/price-groups/${priceGroup}/details?includeModelSize=false&httpFailure=true`);
  return normalizeDetail(brand, detail);
}

async function main() {
  const { brand: brandOpt, limit, query } = parseArgs(process.argv.slice(2));
  const target = resolve(query, brandOpt);
  if (target.productId) {
    const item = await fetchDetail(target.brand, target.productId, target.priceGroup);
    console.log(JSON.stringify([item], null, 2));
    return;
  }
  const base = `${HOSTS[target.brand]}/api/commerce/v5/ja/products`;
  const s = await getJson(`${base}?q=${encodeURIComponent(target.keyword)}&limit=${limit}&httpFailure=true`);
  const hits = (s.items ?? []).slice(0, limit);
  if (hits.length === 0) {
    console.error(`「${target.keyword}」に一致する商品がありません (${target.brand})`);
    process.exit(2);
  }
  const results = [];
  for (const h of hits) {
    try {
      results.push(await fetchDetail(target.brand, h.productId, h.priceGroup ?? '00'));
    } catch (e) {
      results.push({ productId: h.productId, name: h.name, error: String(e.message ?? e) });
    }
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
