# タスク仕様: 2048 デスクトップ版 05 — exe の生成（electron-builder）

`app/`（実装済み）を electron-builder でポータブル exe（1 ファイルで起動できる Windows 実行ファイル）にする。

`node_modules/` に `electron-builder` が導入済みで、必要なツール（nsis など）はこの PC のキャッシュに取得済み。
ビルドは `npm run build`（`electron-builder --win portable`）で行い、1〜2 分かかる。

## 完了条件（すべて満たすこと）

1. 検証コマンド `npm run build && node --test "test/**/*.test.mjs"` が PASS する（`test/build.test.mjs` を含む）
2. `dist/2048.exe`（ポータブル）と `dist/win-unpacked/2048.exe` が生成される
3. `test/` 配下と `src/*.mjs` を変更しない。`package.json` の `devDependencies` を変えない（依存を追加しない）
4. `app/main.cjs` の変更は「`--smoke` で `smoke.json` を書く」追加のみ。既存の `--smoke` の stdout 出力（5 行）は変えない
5. `dist/` は `.gitignore` 済み（生成物はコミットしない）。`.gitignore` を変更しない

## package.json に追加する内容

`scripts.build` はすでに `electron-builder --win portable`。次の `build` フィールドと `author` を追加する。

```json
"author": "osidasi0005",
"build": {
  "appId": "jp.osidasi.game2048",
  "productName": "2048",
  "directories": { "output": "dist" },
  "files": ["app/**/*", "src/**/*", "package.json"],
  "win": {
    "target": [{ "target": "portable", "arch": ["x64"] }],
    "artifactName": "2048.exe",
    "signAndEditExecutable": false
  },
  "electronLanguages": ["en-US", "ja"]
}
```

- `files` に `src/**/*` を含めること（レンダラーが `../src/view.mjs` を import する）
- `signAndEditExecutable: false` は署名ツールのダウンロードと exe のリソース編集を省くため。アイコンは Electron 既定のままでよい

## main.cjs への追加（`--smoke` の結果をファイルにも書く）

ポータブル exe は起動用のラッパーが本体を子プロセスとして起動するため、stdout が呼び出し元に届かない。
そこで `--smoke` のとき、stdout の 5 行に加えて、userData 直下に `smoke.json` を書く:

```json
{ "size": 600, "window": "600x696", "tiles": 16, "best": 0, "hud": "BEST 0" }
```

`app.exit` の**前**に `fs.writeFileSync` で同期的に書くこと。

## 動作確認の手順（テストが行うこと）

- `dist/win-unpacked/2048.exe --smoke --user-data <一時ディレクトリ>` → stdout に SMOKE 行、`smoke.json` が書かれる
- `dist/2048.exe --smoke --user-data <一時ディレクトリ>` → exit 0、`smoke.json` が書かれる（stdout は空でよい）

ポータブル exe は初回起動時に一時フォルダへ展開するため 5〜10 秒かかる。

## やってはいけないこと

- `test/`、`src/*.mjs` の変更、削除。`devDependencies` の変更
- `node_modules/` の中を変更する
- ネットワークアクセス（electron-builder が自動で行うキャッシュ確認は除く）
- `dist/` をコミット対象にする
- `%APPDATA%` の実ファイルへ書く（動作確認は必ず `--user-data` に一時ディレクトリを渡す）
