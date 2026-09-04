#!/usr/bin/env node
// new-task.mjs — タスクの雛形を tasks/<名前>/ に生成する
//
// 使い方:
//   node bin/new-task.mjs <名前> <作業対象パス> "<検証コマンド>" [オプション]
//
// 例:
//   node bin/new-task.mjs my-api ../my-api "npm test && npx tsc --noEmit"
//   node bin/new-task.mjs etl C:\work\etl "pytest -q" --tools "Read,Edit,Write,Glob,Grep,Bash(pytest:*),Bash(python:*)"
//
// オプション:
//   --tools "<一覧>"   --allowedTools に渡す一覧（既定は node 向け）
//   --max <N>          最大反復回数（既定 8）
//   --budget <USD>     累計コスト上限（既定 3）
//   --setup "<cmd>"    反復 1 の前に 1 回だけ実行する環境準備コマンド（例: "npm install"）
//   --artifacts "<glob,...>"  検証が生成する画像などを反復ごとに runs/ へ写す glob（例: "shots/*.png"）
//   --electron         Electron アプリ向けの雛形（見た目を数値で照合するプローブと存在チェック付きスモーク）
//   --force            既存のタスクフォルダを上書き
//
// git は内側のエージェントに渡さない（loop.mjs が --disallowedTools を常に付ける）。
// 許可したい場合は loop.config.json の agent.allowGit を true にする。

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tasksDir = join(root, 'tasks');

function fail(msg) {
  console.error(`[new-task] ${msg}`);
  process.exit(2);
}

function usage() {
  console.log(`使い方: node bin/new-task.mjs <名前> <作業対象パス> "<検証コマンド>" [オプション]
  --tools "<一覧>"   --allowedTools に渡すツール一覧
                     既定: Read,Edit,Write,Glob,Grep,Bash(node:*),PowerShell(node:*)
  --max <N>          最大反復回数（既定 8）
  --budget <USD>     累計コスト上限（既定 3）
  --setup "<cmd>"    反復 1 の前に 1 回だけ実行する環境準備コマンド（例: "npm install"）。失敗したらループを始めない
  --artifacts "<glob,...>"  検証が生成する画像などを反復ごとに runs/<日時>/artifacts/ へ写す glob（例: "shots/*.png"）
  --electron         Electron アプリ向けの雛形。test/helpers/probe.cjs（計算済みスタイルと矩形を JSON で出す）と
                     存在チェック付きスモークテストの雛形を作業対象の test/ に置き、--tools に npx / npm を足す
  --force            既存のタスクフォルダを上書き

作業対象パスは絶対パスか、このコマンドを実行した場所からの相対パスで指定する。
設定ファイルには tasks/<名前>/ からの相対パスに変換して書き込む。
内側のエージェントには git を渡さない（loop.mjs が --disallowedTools を常に付ける。agent.allowGit: true で解除）。`);
}

// ---------- 引数 ----------
const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  usage();
  process.exit(argv.length === 0 ? 2 : 0);
}

const positional = [];
const opts = { tools: null, max: 8, budget: 3, force: false, setup: null, artifacts: [], electron: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    if (i + 1 >= argv.length) fail(`${a} には値が必要です`);
    return argv[++i];
  };
  if (a === '--tools') opts.tools = next();
  else if (a === '--max') opts.max = Number(next());
  else if (a === '--budget') opts.budget = Number(next());
  else if (a === '--setup') opts.setup = next();
  else if (a === '--artifacts') opts.artifacts = next().split(',').map((s) => s.trim()).filter(Boolean);
  else if (a === '--electron') opts.electron = true;
  else if (a === '--force') opts.force = true;
  else if (a.startsWith('--')) fail(`不明なオプション: ${a}`);
  else positional.push(a);
}

const [name, targetArg, verifyCommand] = positional;
if (!name || !targetArg || !verifyCommand) {
  usage();
  fail('名前・作業対象パス・検証コマンドの 3 つが必要です');
}
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) fail(`タスク名に使えるのは英数字と . _ - です: ${name}`);
if (!Number.isFinite(opts.max) || opts.max < 1) fail('--max は 1 以上の数値');
if (!Number.isFinite(opts.budget) || opts.budget <= 0) fail('--budget は 0 より大きい数値');
// Electron 系はテストが npx electron を起動するので、エージェントにも npx / npm を許可する（git は loop.mjs が禁止する）
if (!opts.tools) {
  opts.tools = opts.electron
    ? 'Read,Edit,Write,Glob,Grep,Bash(node:*),Bash(npx:*),Bash(npm:*),PowerShell(node:*),PowerShell(npx:*),PowerShell(npm:*)'
    : 'Read,Edit,Write,Glob,Grep,Bash(node:*),PowerShell(node:*)';
}

// ---------- パス ----------
const taskDir = join(tasksDir, name);
const targetAbs = isAbsolute(targetArg) ? targetArg : resolve(process.cwd(), targetArg);
if (!existsSync(targetAbs)) fail(`作業対象がありません: ${targetAbs}`);
if (existsSync(taskDir) && !opts.force) fail(`タスクは既にあります: ${taskDir}（上書きするなら --force）`);

const toPosix = (p) => p.split('\\').join('/');
const relTarget = toPosix(relative(taskDir, targetAbs)) || '.';
const relRuns = toPosix(relative(taskDir, join(root, 'runs', name)));

// ---------- 生成 ----------
const config = {
  targetDir: relTarget,
  promptFile: './PROMPT.md',
  progressFile: './PROGRESS.md',
  runsDir: relRuns,
  // artifacts: 検証が生成した画像などを反復ごとに runs/<日時>/artifacts/iter-NN/ へ写す（判定には使わない）
  verify: { command: verifyCommand, tailLines: 80, timeoutSec: opts.electron ? 600 : 300, artifacts: opts.artifacts },
  // setup.command: 反復 1 の前に 1 回だけ実行する環境準備（npm install など）。失敗したらループを始めない
  setup: { command: opts.setup, timeoutSec: 900 },
  // true にすると反復ごとにランナーが git commit する（--commit でも有効化できる）
  git: { autoCommit: false },
  agent: {
    command: 'claude',
    args: [
      '-p',
      '--output-format', 'json',
      '--permission-mode', 'acceptEdits',
      '--allowedTools', opts.tools,
      '--max-turns', opts.electron ? '60' : '40',
    ],
    timeoutSec: opts.electron ? 2400 : 1800,
    // 内側のエージェントに git を渡すなら true（既定は loop.mjs が --disallowedTools "Bash(git:*),PowerShell(git:*)" を付ける）
    allowGit: false,
  },
  loop: {
    maxIterations: opts.max,
    maxCostUsd: opts.budget,
    stuckWarnAfter: 2,
    stuckStopAfter: 4,
    doneMarker: '<promise>COMPLETE</promise>',
  },
};

// 雛形は「エージェントが他のドキュメントや既存コードを読まずに実装できる」粒度を目指す。
// 見出しの並びは claude-looper の Planner が書く設計ドキュメントに合わせた（docs/research/ の評価ノート参照）。
const prompt = `# タスク仕様: ${name}

（このタスクで何を作るかを 1〜2 行で書く。Wave 構成なら「Wave N（契約 / 並列実装 / 統合）」も書く）

## 完了条件（すべて満たすこと）

1. \`${verifyCommand}\` がすべて PASS する
2. 依存パッケージを追加しない（追加する場合はここに許可するものを列挙する）
3. テストファイルを変更しない
4. （検証コマンドで判定できない条件はここに書く。エージェントが完了宣言の前に自分で確認する）

## 作成するファイル

- \`src/xxx.mjs\`（作業対象からの相対パスで。このタスクが作る・変えるファイルをすべて列挙する）

## 型定義・シグネチャ

\`\`\`js
export function xxx(input: string): number   // 引数・戻り値・export 名をここで確定させる
\`\`\`

## 仕様

- （入力・出力・振る舞いを箇条書きで。曖昧な語は避け、例を添える）
- （処理に順序があるなら番号付きで書く）

## import 先（既存コード）

- \`./yyy.mjs\` → \`FOO\`, \`bar\`（このタスクでは変更しないファイル。名前を変えない）

## 実装パターン

- （参考にする既存コードの場所。例: 「\`src/slugify.mjs\` と同じ純関数のスタイル」）

## 注意事項

- （ハマりやすい点、特殊な実装が必要な箇所）
${opts.electron ? `- 見た目の仕様は「クラス名を付ける」ではなく「計算済みの色と寸法」で書く（例: \`.tile.v2\` の背景は \`rgb(255, 255, 255)\`、
  盤面は幅 \`--size\` の正方形、hud → board → foot が重ならずクライアント領域に収まる）。テストは \`test/helpers/probe.cjs\` で同じ値を照合する
- 環境（\`npm install\`、ビルドツールの取得）はループの前に人間が済ませる（\`setup.command\`）。エージェントはネットワークに出られない
` : ''}
## やってはいけないこと

- テストファイルの変更、削除
- ネットワークアクセス
- 「作成するファイル」以外への新規ファイル作成・削除（進捗メモへの追記は除く）
- 他のタスクが担当するファイルの作成・変更
`;

const progress = `# 進捗メモ

このファイルは反復をまたぐ唯一の「記憶」です。
エージェントは毎回ここを読み、作業の最後に追記します。ランナーも検証結果を 1 行ずつ追記します。

`;

// ---------- Electron 向けの雛形（--electron） ----------
// 2048 デスクトップ版で「構造のテストは全部通ったのに画面ではタイルが墨で塗られていた」ことから、
// UI の仕様とテストは「クラス名」ではなく「計算済みの色と寸法」で書く。そのための検出器がプローブ。
// スモークは Electron を起動する前にファイルの存在を assert する（未実装のときに 45 秒 × 本数のタイムアウトを待たない）。
const probeTemplate = `// probe.cjs — HTML を非表示ウィンドウで読み込み、指定したセレクタの計算済みスタイルと矩形を
// JSON で 1 行（PROBE {...}）出力する Electron のメインスクリプト。テストから spawnSync で起動する。
//
// 使い方: electron test/helpers/probe.cjs <html の相対パス> <幅> <高さ> [<セレクタ,セレクタ,...>]
//   例:   electron test/helpers/probe.cjs app/index.html 600 700 ".tile.v2,.hud,#app"
//
// 出力の形:
//   { inner: [幅, 高さ], scrollWidth, scrollHeight,
//     elements: { "<セレクタ>": { rect: {left,right,top,bottom,width,height}, "background-color": "rgb(...)", ... } | null } }
// 色・寸法・重なり・はみ出し（scrollWidth > inner[0]）・スクロールの有無まで数値で照合できる。
// 状態を作ってから測りたいときは、SCRIPT を書き換えて render 関数を呼ぶなどする（2048 の例: examples/game2048/test/helpers/probe.cjs）。
const { app, BrowserWindow } = require('electron');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const html = process.argv[2] || 'app/index.html';
const width = Number(process.argv[3] || 800);
const height = Number(process.argv[4] || 600);
const selectors = (process.argv[5] || 'body').split(',').map((s) => s.trim()).filter(Boolean);
const PROPS = ['background-color', 'color', 'border-style', 'border-color', 'font-size', 'font-weight', 'font-family', 'box-shadow', 'opacity', 'display', 'overflow'];

function fail(msg) {
  process.stdout.write(\`PROBE \${JSON.stringify({ error: String(msg) })}\\n\`);
  app.exit(1);
}
process.on('unhandledRejection', fail);

app.whenReady().then(async () => {
  const preload = path.join(root, 'app', 'preload.cjs');
  const win = new BrowserWindow({
    width, height, useContentSize: true, show: false,
    webPreferences: { preload: require('fs').existsSync(preload) ? preload : undefined, contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => fail(\`did-fail-load \${code} \${desc}\`));
  await win.loadFile(path.join(root, html));
  await new Promise((r) => setTimeout(r, 400)); // 初期描画とアニメーションの終了を待つ

  const SCRIPT = \`
    (() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const out = { rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } };
        for (const p of \${JSON.stringify(PROPS)}) out[p] = cs.getPropertyValue(p);
        return out;
      };
      const elements = {};
      for (const sel of \${JSON.stringify(selectors)}) elements[sel] = pick(sel);
      return {
        inner: [window.innerWidth, window.innerHeight],
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        elements,
      };
    })()\`;
  try {
    const result = await win.webContents.executeJavaScript(SCRIPT);
    process.stdout.write(\`PROBE \${JSON.stringify(result)}\\n\`);
    app.exit(0);
  } catch (e) {
    fail(e && e.message ? e.message : e);
  }
});
`;

const smokeTemplate = `// smoke.test.mjs — Electron を実際に起動する検証の雛形（存在チェック → 起動 → 計算済みスタイルの照合）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const probe = join(root, 'test', 'helpers', 'probe.cjs');
// electron パッケージは require すると実行ファイルのパス（文字列）を返す
const electronPath = createRequire(import.meta.url)('electron');

// 起動する前に「起動に必要なファイル」の存在を assert する。
// 未実装の状態で Electron を起動すると 1 本ごとにタイムアウト（45 秒）まで待つ。存在チェックなら数秒で FAIL になる。
const REQUIRED = ['app/main.cjs', 'app/index.html'];
function assertAppExists() {
  for (const f of REQUIRED) assert.ok(existsSync(join(root, f)), \`\${f} がない（未実装）\`);
}

/** probe.cjs を起動し、PROBE 行の JSON を返す */
function runProbe(html, width, height, selectors) {
  assertAppExists();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // 親環境に残っていると Electron が素の Node として動く
  const r = spawnSync(electronPath, [probe, html, String(width), String(height), selectors.join(',')], {
    encoding: 'utf8', timeout: 45000, env, windowsHide: true,
  });
  const line = (r.stdout ?? '').split(/\\r?\\n/).find((l) => l.startsWith('PROBE '));
  assert.ok(line, \`PROBE 行が無い (exit \${r.status})\\n\${(r.stderr ?? '').slice(-1500)}\`);
  const data = JSON.parse(line.slice(6));
  assert.ok(!data.error, \`probe エラー: \${data.error}\`);
  return data;
}

test('smoke: 起動に必要なファイルがそろっている', () => {
  assertAppExists();
});

test('smoke: 画面がクライアント領域に収まる（横にも縦にもスクロールしない）', () => {
  const p = runProbe('app/index.html', 800, 600, ['body']);
  assert.ok(p.scrollWidth <= p.inner[0], \`横にはみ出している: scrollWidth \${p.scrollWidth} > \${p.inner[0]}\`);
  assert.ok(p.scrollHeight <= p.inner[1], \`縦にはみ出している: scrollHeight \${p.scrollHeight} > \${p.inner[1]}\`);
});

// 見た目の仕様は「クラス名がある」ではなく「計算済みの色と寸法」で照合する（例）:
// test('タイル 2 は白地に墨の文字', () => {
//   const p = runProbe('app/index.html', 600, 700, ['.tile.v2']);
//   assert.equal(p.elements['.tile.v2']['background-color'], 'rgb(255, 255, 255)');
//   assert.equal(p.elements['.tile.v2'].color, 'rgb(42, 42, 42)');
// });
`;

mkdirSync(taskDir, { recursive: true });
mkdirSync(join(root, 'runs', name), { recursive: true });
writeFileSync(join(taskDir, 'loop.config.json'), JSON.stringify(config, null, 2) + '\n');
writeFileSync(join(taskDir, 'PROMPT.md'), prompt);
writeFileSync(join(taskDir, 'PROGRESS.md'), progress);

const created = [];
if (opts.electron) {
  // 作業対象の test/ に雛形を置く。既存ファイルは上書きしない（人間が書いたテストを壊さない）
  for (const [rel, body] of [
    ['test/helpers/probe.cjs', probeTemplate],
    ['test/smoke.test.mjs', smokeTemplate],
  ]) {
    const p = join(targetAbs, rel);
    if (existsSync(p)) continue;
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
    created.push(rel);
  }
}

console.log(`[new-task] 作成しました: ${taskDir}
  作業対象:     ${targetAbs}
  検証コマンド: ${verifyCommand}
  許可ツール:   ${opts.tools}${opts.setup ? `\n  環境準備:     ${opts.setup}（反復 1 の前に 1 回）` : ''}${opts.artifacts.length ? `\n  成果物:       ${opts.artifacts.join(', ')} → runs/<日時>/artifacts/iter-NN/` : ''}${created.length ? `\n  雛形:         ${created.join(', ')}（作業対象の test/ に生成。仕様に合わせて書き換える）` : ''}

次にやること:
  1. tasks/${name}/PROMPT.md を書く（完了条件を検証コマンドで判定できる形に${opts.electron ? '。UI は計算済みの色と寸法で' : ''}）
  2. node bin/loop.mjs --task ${name} --verify-only   で検証コマンドが動くか確認${opts.setup ? '（環境準備は本番のループで走る。先に手で 1 回試しておく）' : ''}
  3. node bin/loop.mjs --task ${name} --max 3 --budget 1   で小さく回す`);
