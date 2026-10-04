# ブランド別メモ

## 自動取得できる: ユニクロ / GU

同じ Fast Retailing の API (`/jp/api/commerce/v5/ja/products`) で、ログイン不要・CORS 不要で取れる。
`scripts/fetch-fr-product.mjs` が検索・詳細の両方を叩く。

- 商品 URL は `https://www.uniqlo.com/jp/ja/products/E486119-000/00` や `.../E486119-000/00?colorDisplayCode=04`。
  `E` + 6 桁 + `-000` が商品番号、`?colorDisplayCode=` が色コード。GU は `www.gu-global.com` で同じ構造。
- 商品番号だけ (`486119`) でも引ける。GU なら `--brand gu`。
- 色コードは FR 共通で、00 系=白, 0x=グレー〜黒 (09=BLACK), 1x=ピンク〜赤〜ワイン, 2x=オレンジ, 3x=ベージュ〜ブラウン, 4x=イエロー, 5x=グリーン〜オリーブ, 6x=ブルー〜ネイビー (69=NAVY), 7x=パープル。
  名前が同じ GRAY でも 03 と 04 で濃さが違うことがあるので、最終的には `chipImage` で確認。
- `category.class` の英語名 (`tops`, `outerwear`, `pants`, `dresses`, `shoes`, `accessories`) をそのまま category の手がかりにする。
  `tops` の中に「カーディガン」「フリース」が入っていることがあるので、アイテム名で outer に振り直す。
- `designDetail` の「トップスフィット: 普通 / ゆったり」「透け感」は tags に使える。
- 機能名と warmth: エアリズム=1, ドライEX=1, ヒートテック=4, 極暖=5, 超極暖=5, ウルトラライトダウン=4 (薄手だが保温), シームレスダウン=5, ハイブリッドダウン=5, フリース (ファーリー)=4, スウェット=3, 感動パンツ=2〜3 (smart), スマートアンクルパンツ=3 (smart), ワイドフィットチノ=3, セルビッジデニム=3。
  GU: ヘビーウェイト=+1, ドライ=1, シェフパンツ=3 (casual), タックワイドパンツ=3 (smart), ダブルフェイス=4。

## 普通の HTML が取れる (fetch-page.mjs でそのまま読める)

- GALLIPOLI (gallipoli.jp): `product-detail/?pcode=550675` 形式。タイトルが商品名、本文に「素材 ［表地］麻100％」、`<select>` に色展開、
  色別画像は `shop.gallipoli.jp/pic-labo/llimg/<pcode>s<色コード>.jpg` で画像下部に「101:ホワイト」のラベル付き。
  シャツ専業ブランドなので category は tops、カッタウェイカラーなど襟の表現があれば formality は smart。
- 一般に、自社ドメインで運営する小〜中規模ブランドの EC (カラーミー / futureshop / EC-CUBE / Shopify 系) は取れることが多い。
  Shopify 系は商品 URL に `.json` を付ける (`/products/<handle>.json`) と構造化データが取れる。

## 取得できないことが多い (ボット対策 / JS 描画)

この環境からの `curl` / `WebFetch` では、ZOZOTOWN (403)、UNITED ARROWS (403)、GLOBAL WORK などアダストリア系 (403)、H&M (403)、
無印良品 (応答なし)、BEAMS (応答なし) が確認済み。ZARA / Patagonia / THE NORTH FACE (goldwin) はトップは返るが商品ページは JS 描画で中身が薄い。

1 回試して駄目なら、次の 4 点をそのまま貼ってもらう:

> 商品ページから次をコピーして貼ってください:
> 1. 商品名 (例: 洗いざらしオックスボタンダウンシャツ)
> 2. 買った色 (ページの色名でも「白っぽいベージュ」でも可)
> 3. 素材 (「綿100%」「ポリエステル65% レーヨン35%」など。無ければ省略可)
> 4. 種類が分かりにくいものは一言 (「羽織り用のカーディガン」「通勤用のパンツ」)

価格・サイズ・レビューは要らない。画像を添付してもらえれば色の確認に使える。

## ブランドの表記ゆれ

`brand` は正式表記に揃える (検索と「同じブランドの服」の集計で効く)。

| 入力されがちな表記 | 揃える表記 |
| --- | --- |
| UNIQLO, uniqlo, ユニクロ, ユニクロU, UNIQLO U, ユニクロ:C | ユニクロ (ラインは tags に `ユニクロU` など) |
| gu, ジーユー | GU |
| MUJI, 無印, むじ | 無印良品 |
| zara, ザラ | ZARA |
| H&M, エイチアンドエム, HM | H&M |
| ビームス, BEAMS PLUS, ビームスプラス | BEAMS (ラインは tags) |
| ユナイテッドアローズ, UA, green label relaxing, グリーンレーベル | UNITED ARROWS (green label relaxing は tags) |
| ナノユニバース, nano universe | nano・universe |
| グローバルワーク | GLOBAL WORK |
| アーバンリサーチ, URBAN RESEARCH DOORS | URBAN RESEARCH (DOORS は tags) |
| シップス | SHIPS |
| ノースフェイス, ザ・ノース・フェイス, TNF | THE NORTH FACE |
| パタゴニア | Patagonia |
| リーバイス | Levi's |
| ニューバランス, NB | New Balance |
| コンバース | Converse |
| ナイキ | NIKE |
| アディダス | adidas |
| ドクターマーチン, マーチン | Dr.Martens |
| ビルケン, ビルケンシュトック | Birkenstock |

無印良品のシリーズ名と warmth: 洗いざらしオックス=2 (smart), 太番手天竺=1〜2, ヤク混=4, ラムウール=4, 再生ウール=4, 撥水ステンカラーコート=3, ノーカラーダウン=5, 鹿の子ポロ=1, インド綿=1, 二重ガーゼ=1, フランネル=3。
