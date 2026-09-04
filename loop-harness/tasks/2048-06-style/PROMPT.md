# タスク仕様: 2048 デスクトップ版 06 — 見た目の回帰修正（改善ループ）

Electron アプリ（`app/`、実装済み）を実際に起動してスクリーンショットを確認したところ、仕様（04 のペーパー案）と違う点が見つかった。
`test/style.test.mjs` は `test/helpers/probe.cjs` でアプリを非表示ウィンドウに読み込み、**計算済みスタイルと矩形**を読んで照合する。これを通す。

## 完了条件（すべて満たすこと）

1. `node --test "test/**/*.test.mjs"` がすべて PASS する（`test/style.test.mjs` を含む。`npm run build` は不要）
2. 変更するのは `app/style.css`（必要なら `app/renderer.js` / `app/index.html`）だけ。`app/main.cjs` / `app/preload.cjs` は変えない
3. `test/`、`src/*.mjs`、`package.json` を変更しない
4. 直した箇所ごとに「症状 → 原因 → 修正」を進捗メモに書く

## 見つかっている症状

### 症状 A: 2〜16 のタイルが白ではなく墨（黒）で塗られる

仕様は「2〜16: 白地に墨の文字、32〜128: 生成り `#e9e4d6`、256 以上: 墨 `#2a2a2a` 地に紙色 `#fbfaf5` の文字」。
現状は値のあるタイルがすべて墨になっている。原因の見当: `.tile:not(.empty)` のような詳細度の高いセレクタが `.v2` などの単一クラスより強く、後者が負けている。
詳細度をそろえる（例: 既定を `.tile.v2, ...` と同じ強さにする、または値クラスを `.tile.v2` のように 2 クラスで書く）か、既定を別の書き方にすること。

### 症状 B: HUD の SCORE の数字と `BEST 14,320` がくっついている

`.score` の右端と `.best` の左端の間に、盤面幅の 1.5% 以上（600 なら 9px 以上）の隙間を空ける。
`.hud` の `gap` か `.best` の `margin-left` を `calc(var(--size) * 0.02)` 程度にする。

## テストが見ているもの（`test/style.test.mjs`）

- タイルの背景色・文字色・枠線の種類（dashed / solid）と色
- `.v2048` だけ `box-shadow` あり
- 桁数クラスごとの `font-size`（`--size` の 7.5% / 6.5% / 5.5%）
- `.board` が `size` 四方、タイルが正方形で幅 `size × 0.2172`、左余白 `size × 0.0367`
- HUD の隙間、はみ出し。hud → board → foot が重ならずスクロールが出ないこと
- body の背景色 `#fbfaf5`、等幅フォント、`.tile.new` にアニメーション
- `won` の幕の位置・大きさ、`.btn.primary` の色
- `size` 400 でも同じ比率

自分で確認するときは、一時ディレクトリを使って次のように起動できる（`%APPDATA%` には書かないこと）:

```
npx electron test/helpers/probe.cjs 600 "{\"board\":[[2,16,32,128],[256,2048,4096,0],[0,0,0,0],[0,0,0,0]],\"score\":9856,\"best\":14320,\"phase\":\"playing\",\"achieved\":true,\"spawned\":[0,0]}"
```

stdout の `PROBE {...}` 行に計算済みスタイルが出る。

## やってはいけないこと

- `test/`、`src/*.mjs`、`package.json`、`app/main.cjs`、`app/preload.cjs` の変更
- 仕様の色・比率を変えてテストに合わせること（テストが仕様）
- ネットワークアクセス
