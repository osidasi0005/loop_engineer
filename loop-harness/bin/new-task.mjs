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
//   --force            既存のタスクフォルダを上書き

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
  --force            既存のタスクフォルダを上書き

作業対象パスは絶対パスか、このコマンドを実行した場所からの相対パスで指定する。
設定ファイルには tasks/<名前>/ からの相対パスに変換して書き込む。`);
}

// ---------- 引数 ----------
const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  usage();
  process.exit(argv.length === 0 ? 2 : 0);
}

const positional = [];
const opts = { tools: 'Read,Edit,Write,Glob,Grep,Bash(node:*),PowerShell(node:*)', max: 8, budget: 3, force: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    if (i + 1 >= argv.length) fail(`${a} には値が必要です`);
    return argv[++i];
  };
  if (a === '--tools') opts.tools = next();
  else if (a === '--max') opts.max = Number(next());
  else if (a === '--budget') opts.budget = Number(next());
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
  verify: { command: verifyCommand, tailLines: 80, timeoutSec: 300 },
  // true にすると反復ごとにランナーが git commit する（--commit でも有効化できる）
  git: { autoCommit: false },
  agent: {
    command: 'claude',
    args: [
      '-p',
      '--output-format', 'json',
      '--permission-mode', 'acceptEdits',
      '--allowedTools', opts.tools,
      '--max-turns', '40',
    ],
    timeoutSec: 1800,
  },
  loop: {
    maxIterations: opts.max,
    maxCostUsd: opts.budget,
    stuckWarnAfter: 2,
    stuckStopAfter: 4,
    doneMarker: '<promise>COMPLETE</promise>',
  },
};

const prompt = `# タスク仕様: ${name}

（このタスクで何を作るかを 1〜2 行で書く）

## 完了条件（すべて満たすこと）

1. \`${verifyCommand}\` がすべて PASS する
2. 依存パッケージを追加しない（追加する場合はここに許可するものを列挙する）
3. テストファイルを変更しない
4. （検証コマンドで判定できない条件はここに書く。エージェントが完了宣言の前に自分で確認する）

## 仕様の詳細

- （入力・出力・振る舞いを箇条書きで。曖昧な語は避け、例を添える）
-

## やってはいけないこと

- テストファイルの変更、削除
- ネットワークアクセス
- 仕様に無いファイルの作成・削除（進捗メモへの追記は除く）
`;

const progress = `# 進捗メモ

このファイルは反復をまたぐ唯一の「記憶」です。
エージェントは毎回ここを読み、作業の最後に追記します。ランナーも検証結果を 1 行ずつ追記します。

`;

mkdirSync(taskDir, { recursive: true });
mkdirSync(join(root, 'runs', name), { recursive: true });
writeFileSync(join(taskDir, 'loop.config.json'), JSON.stringify(config, null, 2) + '\n');
writeFileSync(join(taskDir, 'PROMPT.md'), prompt);
writeFileSync(join(taskDir, 'PROGRESS.md'), progress);

console.log(`[new-task] 作成しました: ${taskDir}
  作業対象:     ${targetAbs}
  検証コマンド: ${verifyCommand}
  許可ツール:   ${opts.tools}

次にやること:
  1. tasks/${name}/PROMPT.md を書く（完了条件を検証コマンドで判定できる形に）
  2. node bin/loop.mjs --task ${name} --verify-only   で検証コマンドが動くか確認
  3. node bin/loop.mjs --task ${name} --max 3 --budget 1   で小さく回す`);
