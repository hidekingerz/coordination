# 出力形式 (Coordination アプリの取り込み JSON)

アプリの型は `src/types.ts` の `ClothingItem`。取り込み時の解析は `src/lib/storage.ts` の `parseImportDetailed`。
配列、または `{ "items": [...] }` のどちらでも読める。このスキルでは配列で出す。

| 項目 | 必須 | 値 | 決め方のメモ |
| --- | --- | --- | --- |
| `id` | | 文字列 | `uniqlo-486119-04` のように再現可能な形。無ければアプリが `名前+カテゴリ+ブランド` から安定 id を作る |
| `name` | ○ | 文字列 | 「商品名 (色)」。ブランド名は入れない |
| `brand` | | 文字列 | 正式表記に揃える: ユニクロ / GU / 無印良品 / ZARA / H&M / BEAMS / UNITED ARROWS / nano・universe / GLOBAL WORK / coen / SHIPS / URBAN RESEARCH / Patagonia / THE NORTH FACE / Levi's / Champion / New Balance / Converse / adidas / NIKE / Dr.Martens / Birkenstock |
| `category` | ○ | `outer` `tops` `bottoms` `onepiece` `shoes` `accessory` | 日本語ラベルも通るが正規形で出す |
| `color` | ○ | `#rrggbb` | 主色。色名でも通るが hex で出す |
| `subColor` | | `#rrggbb` | 柄・バイカラーの 2 色目。無ければ省略 (null も可) |
| `seasons` | ○ | `spring` `summer` `autumn` `winter` の配列 | 着る季節。1 つ以上 |
| `warmth` | ○ | 1〜5 の整数 | 1=真夏向け(とても薄い) 2=初夏・残暑 3=春秋 4=晩秋・初冬 5=真冬 |
| `formality` | ○ | `casual` `smart` `formal` | テイスト |
| `tags` | | 文字列配列 | 検索用。アイテム種別・素材・機能名・シルエット |
| `imageUrl` | | URL | 商品画像。一覧カードに表示される |
| `createdAt` | | ISO 日時 | 省略可。アプリが補う |

## アプリ側の色の扱い

`src/lib/color.ts` は hex を HSL に変換し、次をベーシックカラー (どの色とも相性が良い) とみなす:
白 (明度 92% 以上)・黒 (明度 12% 以下)・グレー (彩度 15% 以下)・ネイビー (青系で明度 28% 以下)・
ベージュ (橙〜黄で明るく低彩度)・ブラウン (橙〜黄で暗く低彩度)・カーキ (黄緑で暗く低彩度)。

ベーシックに該当する服は、境界付近の微妙な hex ではなく代表値に寄せると判定が安定する:

| 色 | 代表値 |
| --- | --- |
| 白 / オフ白 | `#f5f5f0` / `#ece7dc` |
| 黒 | `#141414` |
| ライトグレー / グレー / ダークグレー / チャコール | `#c4c4c4` / `#8a8a8a` / `#4a4a4a` / `#3a3a3a` |
| ネイビー | `#1f2a44` |
| ベージュ / キャメル | `#d9c4a5` / `#c6a070` |
| ブラウン / ダークブラウン | `#5a3a22` / `#3e2616` |
| カーキ / オリーブ | `#7a7a55` / `#5a6b3a` |
| デニム (インディゴ) | `#2c3e5c` |

有彩色 (差し色) は実物に近い hex でよい。アプリは色相差で同系色・補色・不調和を判定する。

## Gist での運用

1. gist.github.com で新規 Gist を作り、ファイル名を `wardrobe.json` にして JSON を貼る (secret でよい)
2. アプリの「クローゼット」→「インポート」→ Gist のページ URL を貼って「読み込む」→ プレビュー確認 → 「取り込む」
3. 以後、服を追加したら Gist を編集し、アプリで「読み込む」→「既存に追加 (同じ ID は上書き)」

既存の Gist に追記するときは、Raw URL (`https://gist.githubusercontent.com/<user>/<id>/raw/wardrobe.json`) を
`curl -sL` で取得して配列に追加し、全体を返す。同じ id があれば新しい方で置き換える。
