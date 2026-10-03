/**
 * 画像の画素から服の色 (主色・副色の候補) を取り出す。
 * 外部ライブラリ無し。ブラウザでも Node (テスト) でも動くよう、画素配列だけを受け取る。
 *
 * 商品写真や自撮りを想定した工夫:
 * - 外周が一様な色 (白背景の物撮りなど) なら、外周からつながっているその色の領域を背景として除く
 *   (色の近さだけで消すと、服の中の白いプリントや縞まで消えてしまう)
 * - 中央ほど重みを付ける (服は中央に写りがち)
 * - 32 段階/チャンネルのヒストグラム → 代表色の候補 → 数回の k-means で色をまとめる
 */

export interface PaletteEntry {
  hex: string;
  /** 0-1。服とみなした画素のうちこの色が占める割合 */
  share: number;
}

export interface PaletteResult {
  colors: PaletteEntry[];
  /** 外周の色を背景として除いたか */
  backgroundRemoved: boolean;
  /** 除いた後に残った画素の割合 (0-1) */
  keptRatio: number;
}

export interface PaletteOptions {
  /** 返す色数の上限 */
  maxColors?: number;
  /** 背景除去を試みるか */
  removeBackground?: boolean;
}

type RGB = [number, number, number];

function dist(a: RGB, b: RGB): number {
  // 人の目は緑に敏感なので少し重みを付ける (簡易的な知覚距離)
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.4;
}

function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** 外周の画素から背景色を推定する。一様でなければ null */
function estimateBackground(px: Uint8ClampedArray, w: number, h: number): RGB | null {
  const ring = Math.max(1, Math.round(Math.min(w, h) * 0.06));
  const samples: RGB[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
      const i = (y * w + x) * 4;
      if (px[i + 3] < 128) continue;
      samples.push([px[i], px[i + 1], px[i + 2]]);
    }
  }
  if (samples.length < 8) return null;
  const mean: RGB = [0, 0, 0];
  for (const s of samples) {
    mean[0] += s[0];
    mean[1] += s[1];
    mean[2] += s[2];
  }
  mean[0] /= samples.length;
  mean[1] /= samples.length;
  mean[2] /= samples.length;
  let spread = 0;
  for (const s of samples) spread += dist(s, mean);
  spread /= samples.length;
  // 外周の色がばらついていたら (屋外写真など) 背景とはみなさない
  return spread < 40 ? mean : null;
}

/** 背景色とみなす近さ。物撮りの背景のムラ (JPEG ノイズや薄い影) はこの範囲に収まることが多い */
const BG_TOLERANCE = 36;

/**
 * 外周から背景色でつながっている画素を塗りつぶして背景マスクを作る。
 * 服に囲まれた同系色 (白シャツの白ボタン、縞の白) は外周とつながらないので残る。
 */
function floodBackground(px: Uint8ClampedArray, w: number, h: number, bg: RGB): Uint8Array {
  const mask = new Uint8Array(w * h);
  const queue: number[] = [];
  const isBg = (idx: number) => {
    const i = idx * 4;
    if (px[i + 3] < 128) return true; // 透明も背景扱い
    return dist([px[i], px[i + 1], px[i + 2]], bg) < BG_TOLERANCE;
  };
  const push = (x: number, y: number) => {
    const idx = y * w + x;
    if (mask[idx] || !isBg(idx)) return;
    mask[idx] = 1;
    queue.push(idx);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (queue.length) {
    const idx = queue.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return mask;
}

interface Bin {
  w: number;
  r: number;
  g: number;
  b: number;
}

function buildHistogram(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  bgMask: Uint8Array | null,
): { bins: Map<number, Bin>; total: number; kept: number; considered: number } {
  const bins = new Map<number, Bin>();
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy) || 1;
  let total = 0;
  let kept = 0;
  let considered = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 128) continue;
      considered++;
      const c: RGB = [px[i], px[i + 1], px[i + 2]];
      if (bgMask && bgMask[y * w + x]) continue;
      kept++;
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxD;
      const weight = 1.5 - d; // 中央 1.5 … 端 0.5
      const key = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
      const bin = bins.get(key);
      if (bin) {
        bin.w += weight;
        bin.r += c[0] * weight;
        bin.g += c[1] * weight;
        bin.b += c[2] * weight;
      } else {
        bins.set(key, { w: weight, r: c[0] * weight, g: c[1] * weight, b: c[2] * weight });
      }
      total += weight;
    }
  }
  return { bins, total, kept, considered };
}

function clusterBins(bins: Bin[], total: number, maxColors: number): PaletteEntry[] {
  if (bins.length === 0) return [];
  const means = bins.map((b) => [b.r / b.w, b.g / b.w, b.b / b.w] as RGB);
  const order = bins.map((_, i) => i).sort((a, b) => bins[b].w - bins[a].w);

  // 代表色の種: 重い順に、既存の種から十分離れたものを選ぶ
  const seeds: RGB[] = [];
  for (const i of order) {
    if (seeds.length >= maxColors * 2) break;
    if (seeds.every((s) => dist(s, means[i]) >= 48)) seeds.push([...means[i]]);
  }

  // k-means を数回
  let assign = new Array<number>(bins.length).fill(0);
  for (let iter = 0; iter < 4; iter++) {
    assign = means.map((m) => {
      let best = 0;
      let bd = Infinity;
      seeds.forEach((s, k) => {
        const d = dist(s, m);
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      return best;
    });
    const acc = seeds.map(() => ({ w: 0, r: 0, g: 0, b: 0 }));
    bins.forEach((b, i) => {
      const a = acc[assign[i]];
      a.w += b.w;
      a.r += b.r;
      a.g += b.g;
      a.b += b.b;
    });
    acc.forEach((a, k) => {
      if (a.w > 0) seeds[k] = [a.r / a.w, a.g / a.w, a.b / a.w];
    });
  }

  // 近い種をまとめ、割合を出す
  const weights = seeds.map(() => 0);
  bins.forEach((b, i) => (weights[assign[i]] += b.w));
  const merged: { c: RGB; w: number }[] = [];
  seeds
    .map((c, k) => ({ c, w: weights[k] }))
    .sort((a, b) => b.w - a.w)
    .forEach((s) => {
      const near = merged.find((m) => dist(m.c, s.c) < 32);
      if (near) {
        const tw = near.w + s.w;
        near.c = [
          (near.c[0] * near.w + s.c[0] * s.w) / tw,
          (near.c[1] * near.w + s.c[1] * s.w) / tw,
          (near.c[2] * near.w + s.c[2] * s.w) / tw,
        ];
        near.w = tw;
      } else merged.push({ c: [...s.c], w: s.w });
    });

  return merged
    .filter((m) => m.w / total >= 0.03)
    .sort((a, b) => b.w - a.w)
    .slice(0, maxColors)
    .map((m) => ({ hex: toHex(m.c), share: m.w / total }));
}

/**
 * RGBA の画素配列からパレットを作る。
 * @param px  Canvas の getImageData().data と同じ並び (RGBA, 左上から)
 */
export function extractPalette(px: Uint8ClampedArray, width: number, height: number, opts: PaletteOptions = {}): PaletteResult {
  const maxColors = opts.maxColors ?? 5;
  const tryRemove = opts.removeBackground ?? true;
  const bg = tryRemove ? estimateBackground(px, width, height) : null;
  const mask = bg ? floodBackground(px, width, height, bg) : null;
  let { bins, total, kept, considered } = buildHistogram(px, width, height, mask);
  let backgroundRemoved = mask !== null;
  // 白いシャツを白背景で撮ると全部が背景扱いになる。残りが少なすぎたら除去をやめる
  if (bg && considered > 0 && kept / considered < 0.08) {
    ({ bins, total, kept, considered } = buildHistogram(px, width, height, null));
    backgroundRemoved = false;
  }
  const colors = clusterBins([...bins.values()], total, maxColors);
  return { colors, backgroundRemoved, keptRatio: considered ? kept / considered : 0 };
}

/** 2 色目を副色として提案してよいか (面積が十分で、主色と見た目が違う) */
export function suggestSubColor(palette: PaletteEntry[]): PaletteEntry | null {
  if (palette.length < 2) return null;
  const [main, second] = palette;
  if (second.share < 0.2) return null;
  const toRgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  return dist(toRgb(main.hex), toRgb(second.hex)) >= 60 ? second : null;
}
