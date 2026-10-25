/**
 * 作成した JSON をアプリと同じ解析ロジック (src/lib/storage.ts) で検証する。
 * アプリが補完・読み替えする項目を警告として表示するので、取り込み前に直せる。
 *
 * 使い方 (リポジトリのルートで):
 *   npx tsx .claude/skills/wardrobe-from-products/scripts/validate.ts <file.json> [--json]
 */
import { readFileSync } from 'node:fs';
import { parseImportDetailed } from '../../../../src/lib/storage';
import { ACCESSORY_KIND_LABEL, BOTTOMS_SHAPE_LABEL, CATEGORY_LABEL, FORMALITY_LABEL, SEASON_LABEL, SLEEVE_LABEL } from '../../../../src/types';
import { colorLabel } from '../../../../src/lib/color';

// head などにパイプしたときの EPIPE で落ちないようにする
process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EPIPE') process.exit(0);
});

const [file, ...rest] = process.argv.slice(2);
if (!file) {
  console.error('使い方: npx tsx validate.ts <file.json> [--json]');
  process.exit(2);
}
const asJson = rest.includes('--json');

let result;
try {
  result = parseImportDetailed(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`NG: ${(e as Error).message}`);
  process.exit(1);
}

const { items, warnings } = result;
if (asJson) {
  console.log(JSON.stringify({ ok: true, count: items.length, warnings, items }, null, 2));
  process.exit(0);
}

console.log(`OK: ${items.length} 件を解析できました`);
for (const i of items) {
  const brand = i.brand ? ` [${i.brand}]` : '';
  // イラスト用の形。省略時はアプリが名前から推定するので「自動」と表示する
  const figure =
    i.category === 'bottoms'
      ? `形=${i.shape ? BOTTOMS_SHAPE_LABEL[i.shape] : '自動'}`
      : i.category === 'tops' || i.category === 'onepiece'
        ? `袖丈=${i.sleeve ? SLEEVE_LABEL[i.sleeve] : '自動'}`
        : i.category === 'accessory'
          ? `種類=${i.accessoryKind ? ACCESSORY_KIND_LABEL[i.accessoryKind] : '自動'}`
          : '';
  console.log(
    `- ${CATEGORY_LABEL[i.category]}${brand} ${i.name} | ${colorLabel(i.color)} ${i.color}` +
      (i.subColor ? ` / ${colorLabel(i.subColor)}` : '') +
      ` | ${i.seasons.map((s) => SEASON_LABEL[s]).join('・')} | 厚さ${i.warmth} | ${FORMALITY_LABEL[i.formality]}` +
      (i.tags.length ? ` | #${i.tags.join(' #')}` : '') +
      (figure ? ` | ${figure}` : '') +
      ` | id=${i.id}`,
  );
}
if (warnings.length) {
  console.log(`\n警告 ${warnings.length} 件 (アプリが補完した項目。意図どおりか確認してください):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
const dup = items.map((i) => i.id).filter((id, idx, arr) => arr.indexOf(id) !== idx);
if (dup.length) {
  console.log(`\nNG: id が重複しています: ${[...new Set(dup)].join(', ')}`);
  process.exit(1);
}
