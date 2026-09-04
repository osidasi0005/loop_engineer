#!/usr/bin/env node
// loop.mjs — ループエンジニアリングのランナー
//
// 「AI を賢くする」のではなく「AI を回す構造」を設計する。
//   0. （反復 1 の前に 1 回だけ）setup.command で環境を整える。失敗したらループを始めない
//   1. 外部検証（テスト等）を実行し、真実はここから取る
//   2. 仕様 + 進捗メモ + 検証結果 で毎回新鮮なプロンプトを組み立てる
//   3. エージェント（既定: claude -p）を 1 回だけ走らせる
//   4. 停止条件（完了 / 上限 / 予算 / スタック / エラー）を判定して次の反復へ
//
// 使い方:  node bin/loop.mjs [--task <名前> | --config <path>] [--max N] [--budget USD]
//                            [--agent "コマンド文字列"] [--commit | --no-commit] [--verify-only]
//
// タスクは tasks/<名前>/loop.config.json で定義する。--task も --config も省略した場合、
// tasks/ にタスクが 1 つだけならそれを使う。

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync, copyFileSync, globSync, statSync } from 'node:fs';
import { resolve, dirname, join, isAbsolute, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extractSpecIssues, groupSpecIssues, printSpecIssues } from './lib/spec-issues.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const tasksDir = join(root, 'tasks');

// ---------- 引数 ----------
function parseArgs(argv) {
  const out = { config: null, task: null, overrides: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) fail(`${a} には値が必要です`);
      return argv[++i];
    };
    if (a === '--config') out.config = resolve(next());
    else if (a === '--task') out.task = next();
    else if (a === '--max') out.overrides.maxIterations = Number(next());
    else if (a === '--budget') out.overrides.maxCostUsd = Number(next());
    else if (a === '--agent') out.overrides.agentCommand = next();
    else if (a === '--commit') out.overrides.autoCommit = true;
    else if (a === '--no-commit') out.overrides.autoCommit = false;
    else if (a === '--worktree') out.overrides.worktree = resolve(next());
    else if (a === '--run-dir') out.overrides.runDir = resolve(next());
    else if (a === '--verify-only') out.verifyOnly = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else fail(`不明な引数: ${a}`);
  }
  return out;
}

function fail(msg) {
  console.error(`[loop] ${msg}`);
  process.exit(2);
}

function usage() {
  console.log(`使い方: node bin/loop.mjs [オプション]
  --task <名前>     tasks/<名前>/loop.config.json を使う（tasks/ に 1 つだけなら省略可）
  --config <path>   設定ファイルを直接指定
  --max <N>         最大反復回数を上書き
  --budget <USD>    累計コスト上限を上書き
  --agent "<cmd>"   エージェント起動コマンドを上書き（作業ディレクトリで実行される。例: "node ../mock-agent.mjs"）
  --commit          反復ごとにランナーが git commit する（進捗メモのブロックを本文に入れる）
  --no-commit       設定で有効でも自動コミットしない
  --worktree <dir>  作業対象を含むリポジトリのトップレベルを <dir>（git worktree）に差し替える
                    targetDir と progressFile を worktree 内の同じ相対位置へ写す（wave.mjs が使う）
  --run-dir <dir>   ログの出力先を指定する（既定は runsDir/<日時>）
  --verify-only     検証コマンドだけ実行して終了

登録済みタスク: ${listTasks().join(', ') || '(なし)'}
`);
}

function listTasks() {
  if (!existsSync(tasksDir)) return [];
  return readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(tasksDir, d.name, 'loop.config.json')))
    .map((d) => d.name);
}

function resolveConfigPath(args) {
  if (args.config) return args.config;
  if (args.task) {
    const p = join(tasksDir, args.task, 'loop.config.json');
    if (!existsSync(p)) fail(`タスク "${args.task}" がありません（${p}）。登録済み: ${listTasks().join(', ') || '(なし)'}`);
    return p;
  }
  const tasks = listTasks();
  if (tasks.length === 1) return join(tasksDir, tasks[0], 'loop.config.json');
  if (tasks.length === 0) fail(`tasks/ にタスクがありません。tasks/<名前>/loop.config.json を作成してください`);
  fail(`タスクが複数あります。--task で選んでください: ${tasks.join(', ')}`);
}

// ---------- 設定 ----------
function loadConfig(path, overrides) {
  if (!existsSync(path)) fail(`設定ファイルがありません: ${path}`);
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  const base = dirname(path);
  const abs = (p) => (isAbsolute(p) ? p : resolve(base, p));
  cfg.targetDir = abs(cfg.targetDir ?? '.');
  cfg.promptFile = abs(cfg.promptFile ?? 'PROMPT.md');
  cfg.progressFile = abs(cfg.progressFile ?? 'PROGRESS.md');
  cfg.runsDir = abs(cfg.runsDir ?? 'runs');
  cfg.verify = { tailLines: 60, timeoutSec: 300, artifacts: [], ...cfg.verify };
  if (typeof cfg.verify.artifacts === 'string') cfg.verify.artifacts = [cfg.verify.artifacts];
  // verify.command は文字列 1 つか配列。配列なら各コマンドを独立に実行し、全部の結果を見せる
  // （`a && b` のように連結すると先頭の失敗で止まり、後続の失敗が見えない。fix ループの本物のエージェントが指摘した）
  cfg.verify.commands = (Array.isArray(cfg.verify.command) ? cfg.verify.command : [cfg.verify.command]).filter(Boolean);
  cfg.verify.label = cfg.verify.commands.length > 1 ? cfg.verify.commands.map((c) => `\`${c}\``).join(' / ') : `\`${cfg.verify.commands[0] ?? ''}\``;
  // setup: 反復 1 の前に 1 回だけ実行する環境準備（npm install など）。失敗したらループを始めない
  cfg.setup = { command: null, timeoutSec: 900, ...cfg.setup };
  cfg.agent = { command: 'claude', args: ['-p', '--output-format', 'json'], timeoutSec: 1800, allowGit: false, ...cfg.agent };
  cfg.loop = {
    maxIterations: 10,
    maxCostUsd: 5,
    stuckWarnAfter: 2,
    stuckStopAfter: 4,
    doneMarker: '<promise>COMPLETE</promise>',
    // エージェントが「自分の権限では直せない」と申告するタグ。理由を囲んで書く。ランナーはループを止めて人間に返す
    blockedTag: 'blocked',
    ...cfg.loop,
  };
  cfg.git = { autoCommit: false, subjectPrefix: 'loop', ...cfg.git };
  cfg.taskName = cfg.taskName ?? base.split(/[\\/]/).filter(Boolean).at(-1);
  if (Number.isFinite(overrides.maxIterations)) cfg.loop.maxIterations = overrides.maxIterations;
  if (Number.isFinite(overrides.maxCostUsd)) cfg.loop.maxCostUsd = overrides.maxCostUsd;
  if (typeof overrides.autoCommit === 'boolean') cfg.git.autoCommit = overrides.autoCommit;
  if (overrides.agentCommand) {
    // 文字列コマンドはそのままシェルに渡す（stdin でプロンプトを受け取る前提）
    cfg.agent = { ...cfg.agent, command: overrides.agentCommand, args: [] };
  }
  if (isClaudeAgent(cfg.agent) && !cfg.agent.allowGit) cfg.agent.args = withGitDisallowed(cfg.agent.args);
  if (!cfg.verify.commands.length) fail('verify.command が設定されていません');
  if (!existsSync(cfg.promptFile)) fail(`仕様ファイルがありません: ${cfg.promptFile}`);
  if (!existsSync(cfg.targetDir)) fail(`対象ディレクトリがありません: ${cfg.targetDir}`);
  if (overrides.worktree) remapIntoWorktree(cfg, overrides.worktree);
  // 進捗メモが作業ディレクトリの外（wave の fix ループでは runs/ 配下）にあると、acceptEdits では書き込みが拒否されることがある。
  // claude には --add-dir で進捗メモのディレクトリを許可する（worktree への写しの後に計算する）
  if (isClaudeAgent(cfg.agent)) cfg.agent.args = withProgressDirAllowed(cfg.agent.args, cfg);
  cfg.runDirOverride = overrides.runDir ?? null;
  return cfg;
}

function withProgressDirAllowed(args, cfg) {
  const dir = dirname(cfg.progressFile);
  if (isInside(dir, cfg.targetDir)) return args;
  const i = args.indexOf('--add-dir');
  if (i >= 0) {
    // 既に --add-dir があれば、その値の並び（可変長）に足す。同じディレクトリなら何もしない
    let j = i + 1;
    while (j < args.length && !String(args[j]).startsWith('--')) j++;
    if (args.slice(i + 1, j).some((d) => normPath(d) === normPath(dir))) return args;
    return [...args.slice(0, j), dir, ...args.slice(j)];
  }
  // --add-dir は可変長なので末尾に置く（後ろの引数を飲み込まないように）
  return [...args, '--add-dir', dir];
}

// --worktree: 作業対象を含むリポジトリのトップレベルを worktree に差し替える。
// targetDir と progressFile だけを写し、runsDir は写さない（worktree を消してもログが残るように）。
function remapIntoWorktree(cfg, worktree) {
  if (!existsSync(worktree)) fail(`worktree がありません: ${worktree}`);
  const top = runGit(['rev-parse', '--show-toplevel'], cfg.targetDir);
  if (top.code !== 0 || !top.stdout) fail(`--worktree を使うには作業対象が git リポジトリ内である必要があります: ${cfg.targetDir}`);
  const toplevel = top.stdout;
  const remap = (p) => (isInside(p, toplevel) ? join(worktree, relative(toplevel, p)) : p);
  cfg.originalTargetDir = cfg.targetDir;
  cfg.targetDir = remap(cfg.targetDir);
  cfg.progressFile = remap(cfg.progressFile);
  cfg.worktree = worktree;
  if (!existsSync(cfg.targetDir)) fail(`worktree 内に作業対象がありません: ${cfg.targetDir}`);
}

// ---------- 内側のエージェントから git を隠す ----------
// コミットするのはランナー。プロジェクトの .claude/settings.json の許可リスト（例: Bash(git commit *)）は
// claude -p で起動した内側のエージェントにも効くため、--allowedTools に git を書いていなくても
// エージェントが自分でコミットしてしまう（2048 デスクトップ版の開発で起きた）。
// そこで claude を起動するときは常に --disallowedTools で git を明示的に禁止する。
// 設定で agent.allowGit: true と書いたときだけ外す。
const GIT_DISALLOWED = ['Bash(git:*)', 'PowerShell(git:*)'];

function isClaudeAgent(agent) {
  return /^claude(\.exe|\.cmd)?$/i.test(basename(String(agent.command ?? '').trim()));
}

// 既に --disallowedTools があればその値に git のパターンを足す（重複させない）。無ければ追加する
function withGitDisallowed(args) {
  const out = [...args];
  const i = out.indexOf('--disallowedTools');
  if (i >= 0 && i + 1 < out.length) {
    const have = String(out[i + 1]).split(',').map((s) => s.trim()).filter(Boolean);
    for (const p of GIT_DISALLOWED) if (!have.includes(p)) have.push(p);
    out[i + 1] = have.join(',');
  } else {
    out.push('--disallowedTools', GIT_DISALLOWED.join(','));
  }
  return out;
}

// ---------- ユーティリティ ----------
const nowStamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const tail = (s, n) => s.split(/\r?\n/).slice(-n).join('\n');
const quote = (a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const readOr = (p, fallback = '') => (existsSync(p) ? readFileSync(p, 'utf8') : fallback);

function runShell(command, { cwd, input, timeoutSec, env }) {
  const started = Date.now();
  const r = spawnSync(command, {
    cwd,
    input,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
    windowsHide: true,
  });
  return {
    code: r.status,
    signal: r.signal,
    timedOut: r.error?.code === 'ETIMEDOUT',
    error: r.error && r.error.code !== 'ETIMEDOUT' ? String(r.error) : null,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    ms: Date.now() - started,
  };
}

// ---------- 検証 ----------
function runVerify(cfg) {
  // 複数コマンドは独立に全部実行する（先頭が落ちても後続を回す）。PASS は全部 exit 0 のとき
  const results = cfg.verify.commands.map((command) => {
    const r = runShell(command, { cwd: cfg.targetDir, timeoutSec: cfg.verify.timeoutSec });
    const combined = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
    return { command, ok: r.code === 0 && !r.timedOut && !r.error, code: r.code, timedOut: r.timedOut, error: r.error, ms: r.ms, output: combined };
  });
  const multi = results.length > 1;
  const combined = multi
    ? results.map((r) => `$ ${r.command}\n[${r.ok ? 'PASS' : 'FAIL'} exit ${r.code ?? 'n/a'}${r.timedOut ? ' timeout' : ''}]\n${r.output}`).join('\n\n')
    : results[0].output;
  const firstFail = results.find((r) => !r.ok) ?? null;
  // 複数のときは各コマンドの末尾を残す（1 つの末尾だけ切ると先頭のコマンドの結果が消える）
  const per = Math.max(10, Math.floor(cfg.verify.tailLines / results.length));
  const output = multi
    ? results.map((r) => `$ ${r.command}\n[${r.ok ? 'PASS' : 'FAIL'} exit ${r.code ?? 'n/a'}${r.timedOut ? ' timeout' : ''}]\n${tail(r.output, per)}`).join('\n\n')
    : tail(combined, cfg.verify.tailLines);
  return {
    ok: !firstFail,
    code: firstFail ? firstFail.code : 0,
    timedOut: results.some((r) => r.timedOut),
    error: firstFail?.error ?? null,
    ms: results.reduce((s, r) => s + r.ms, 0),
    output,
    failed: results.filter((r) => !r.ok).map((r) => r.command),
    // 経過時間などの数値の揺らぎを除いてハッシュ化（スタック検知用）
    hash: sha(combined.replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ')),
  };
}

// ---------- 検証が生成した成果物（スクリーンショット等）の保存 ----------
// verify.artifacts（targetDir からの相対 glob）に一致したファイルを runs/<日時>/artifacts/iter-NN/ にコピーする。
// 人間がループ終了後に反復ごとの画像を並べて見るためのもので、ループの判定には使わない
// （画像の良し悪しは自動で判定しない。判定に使いたければテストに落とす）。
function collectArtifacts(cfg, runDir, n) {
  if (!cfg.verify.artifacts.length) return [];
  let matched = [];
  try {
    matched = globSync(cfg.verify.artifacts, { cwd: cfg.targetDir, exclude: (name) => name === 'node_modules' });
  } catch (e) {
    console.log(`[${n}] 成果物の検索に失敗: ${e.message}`);
    return [];
  }
  const dest = join(runDir, 'artifacts', `iter-${String(n).padStart(2, '0')}`);
  const saved = [];
  for (const rel of matched) {
    const src = join(cfg.targetDir, rel);
    if (!existsSync(src) || !statSync(src).isFile()) continue;
    const to = join(dest, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(src, to);
    saved.push(rel.split('\\').join('/'));
  }
  return saved;
}

// ---------- ループ前の環境準備 ----------
// エージェントはネットワーク禁止なので、npm install などは反復 1 の前にランナーが 1 回だけ行う。
// 結果は runs/<日時>/setup.md に残す（進捗メモにもコミットにも残らない「環境の準備」を記録に残すため）。
function runSetup(cfg, runDir) {
  const r = runShell(cfg.setup.command, { cwd: cfg.targetDir, timeoutSec: cfg.setup.timeoutSec });
  const ok = r.code === 0 && !r.timedOut && !r.error;
  const combined = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
  const body = `# 環境準備（反復 1 の前に 1 回だけ実行）

- コマンド: \`${cfg.setup.command}\`
- 作業ディレクトリ: ${cfg.targetDir}
- 結果: ${ok ? 'OK' : 'FAIL'} / exit ${r.code ?? 'n/a'}${r.timedOut ? ' / timeout' : ''}${r.error ? ` / ${r.error}` : ''} / ${r.ms}ms
- 実行日時: ${new Date().toISOString()}

\`\`\`
${tail(combined, 200) || '(出力なし)'}
\`\`\`
`;
  writeFileSync(join(runDir, 'setup.md'), body);
  return { ok, code: r.code, timedOut: r.timedOut, error: r.error, ms: r.ms, output: tail(combined, 20) };
}

// ---------- プロンプト組み立て ----------
function buildPrompt(cfg, state, verify) {
  const spec = readFileSync(cfg.promptFile, 'utf8').trim();
  const progress = readOr(cfg.progressFile, '(まだ記録なし)').trim();
  const n = state.iteration;
  const max = cfg.loop.maxIterations;

  const verifyBlock = verify.ok
    ? `検証: PASS（exit ${verify.code}, ${verify.ms}ms）\n\`\`\`\n${verify.output || '(出力なし)'}\n\`\`\``
    : `検証: FAIL（exit ${verify.code ?? 'n/a'}${verify.timedOut ? ', timeout' : ''}）\n\`\`\`\n${verify.output || verify.error || '(出力なし)'}\n\`\`\``;

  let stuckBlock = '';
  if (!verify.ok && state.sameFailureCount >= cfg.loop.stuckWarnAfter) {
    stuckBlock = `
## 警告: 同じ失敗が ${state.sameFailureCount + 1} 回連続しています
前回までのアプローチは機能していません。同じ修正を繰り返さず、
- 失敗の原因を仮説として進捗メモに書き出してから、
- これまでと異なる方法で直してください。
失敗の原因がコードではなく環境（依存パッケージの欠落、権限、ネットワーク、外部ツールの不在）にあると判断したら、
無理に回避せず、進捗メモにその根拠を書き、最終メッセージに <${cfg.loop.blockedTag}>理由</${cfg.loop.blockedTag}> を書いて終了してください。
ランナーはループを止めて人間に返します。環境の問題は人間が直します。
あと ${cfg.loop.stuckStopAfter - state.sameFailureCount} 回同じ失敗が続くとループは停止します。
`;
  }

  const rulesPass = `検証はすでに成功しています。仕様の完了条件を 1 つずつ確認し、
すべて満たしていれば最終メッセージの末尾に ${cfg.loop.doneMarker} と書いてください。
満たしていない条件があれば、その条件を満たす作業を行い、マーカーは書かないでください。`;
  // FAIL 起点でも、エージェントが自分で検証を回して PASS し、完了条件を全部確認したなら宣言してよい。
  // 完了判定は次の反復でランナーが検証して行うので、「宣言だけの反復」を 1 回分省ける（費用 約 3 割減）。
  const rulesFail = `検証が失敗しています。失敗を直すための最も重要な 1 つの作業に集中してください。
直した後、検証コマンド ${cfg.verify.label} を自分で実行して PASS し、さらに仕様の完了条件を 1 つずつ確認して
すべて満たしていれば、最終メッセージの末尾に ${cfg.loop.doneMarker} と書いてよいです（次の反復でランナーが検証して確定します）。
自分で検証していない、または満たしていない条件があるなら、マーカーは書かないでください。`;

  return `# 自律ループ 反復 ${n}/${max}

あなたは外側のランナーによって繰り返し起動されています。前回の会話は覚えていません。
このメッセージに含まれる「仕様」「進捗メモ」「検証結果」だけが引き継がれる情報です。
作業ディレクトリ: ${cfg.targetDir}

## 仕様（${cfg.promptFile}）
${spec}

## 進捗メモ（${cfg.progressFile}）
${progress}

## 直前の検証結果（コマンド: ${cfg.verify.label}${cfg.verify.commands.length > 1 ? '。それぞれ独立に実行し、すべて exit 0 で PASS' : ''}）
${verifyBlock}
${stuckBlock}
## この反復のルール
1. ${verify.ok ? rulesPass : rulesFail}
2. 作業の最後に ${cfg.progressFile} へ次の形式で 1 ブロック追記する:
   \`### 反復 ${n}\` / やったこと / 分かったこと / 次にやるべきこと
3. 仕様に書かれていないファイルの削除や外部への送信は行わない。
4. 検証コマンドは自分で実行してもよいが、最終判断はランナーの検証結果に従う。
5. 仕様の抜け・曖昧さ・テストとの矛盾に気づいたら、最終メッセージに <spec-issue>…</spec-issue> で囲んで 1 件ずつ書く
   （どこが・なぜ・どう解釈して進めたか）。ランナーが拾って人間に見せる。仕様やテストは変えない。
6. 自分の権限では直せない原因で先に進めない（環境の問題、テスト同士の矛盾、仕様と変更禁止のファイルの矛盾）と判断したら、
   コードを変えずに進捗メモに根拠を書き、最終メッセージに <${cfg.loop.blockedTag}>理由</${cfg.loop.blockedTag}> を書いて終了する。
   ランナーはループを止めて人間に返す。直せるものを直さずに使わないこと。
`;
}

// 応答から <blocked>理由</blocked> を抜き出す（エージェントが「自分では直せない」と申告した）
function extractBlocked(text, tag) {
  const m = String(text ?? '').match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

// ---------- エージェント ----------
function runAgent(cfg, prompt) {
  const cmd = [cfg.agent.command, ...cfg.agent.args.map(quote)].join(' ');
  const r = runShell(cmd, {
    cwd: cfg.targetDir,
    input: prompt,
    timeoutSec: cfg.agent.timeoutSec,
    env: { LOOP_PROGRESS_FILE: cfg.progressFile, LOOP_PROMPT_FILE: cfg.promptFile },
  });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout.trim());
  } catch {
    // JSON でなければプレーンテキストとして扱う
  }
  const result = parsed && typeof parsed === 'object' ? String(parsed.result ?? '') : r.stdout;
  return {
    command: cmd,
    code: r.code,
    timedOut: r.timedOut,
    error: r.error,
    ms: r.ms,
    isError: Boolean(parsed?.is_error) || r.code !== 0 || r.timedOut || Boolean(r.error),
    costUsd: Number(parsed?.total_cost_usd ?? 0) || 0,
    turns: Number(parsed?.num_turns ?? 0) || 0,
    sessionId: parsed?.session_id ?? null,
    result,
    stderr: r.stderr,
  };
}

// ---------- git（反復ごとの自動コミット） ----------
// エージェントではなくランナーがコミットする。エージェントに git を触らせると
// 「コミットしたから完了」と誤認する余地が生まれるため、記録は外側で取る。
function runGit(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return { code: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim(), error: r.error ? String(r.error) : null };
}

// パス比較用の正規化（git は / 区切りで返す。Windows は大文字小文字を区別しない）
const normPath = (p) => {
  let s = resolve(p).split('\\').join('/');
  if (process.platform === 'win32') s = s.toLowerCase();
  return s.replace(/\/+$/, '');
};
const isInside = (child, parent) => {
  const c = normPath(child);
  const p = normPath(parent);
  return c === p || c.startsWith(p + '/');
};

// 自動コミットが使える状態かを起動時に判定する。使えなければ理由を返す
function detectRepo(cfg) {
  const top = runGit(['rev-parse', '--show-toplevel'], cfg.targetDir);
  if (top.code !== 0 || !top.stdout) return { ok: false, reason: `作業対象が git リポジトリ内ではありません: ${cfg.targetDir}` };
  const toplevel = top.stdout;
  if (!isInside(cfg.progressFile, toplevel)) {
    return { ok: false, reason: `進捗メモが作業対象と同じリポジトリにありません: ${cfg.progressFile}` };
  }
  return { ok: true, toplevel };
}

// PROGRESS.md から「### 反復 N」のブロックを取り出す（次の ### 見出しまで）
function extractProgressBlock(progressText, n) {
  const re = new RegExp(`^###\\s*反復\\s*${n}\\b[^\\n]*\\n([\\s\\S]*?)(?=^###\\s|(?![\\s\\S]))`, 'm');
  const m = progressText.match(re);
  return m ? m[1].trim() : '';
}

// 人間が同じリポジトリで git を触っている最中だと .git/index.lock で失敗する。
// 短い間隔で数回再試行し、それでも駄目ならステージを戻して（自分が add した分だけ）理由を返す。
// 戻さないと、エージェントの差分が人間の次のコミットに混ざる（実際に起きた）。
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const gitReason = (r) => r.stderr || r.error || `exit ${r.code}`;
const isLockError = (r) => /index\.lock|Unable to create|Another git process/i.test(`${r.stderr}\n${r.error}`);

function runGitRetry(args, cwd, { tries = 5, waitMs = 700 } = {}) {
  let r = runGit(args, cwd);
  for (let i = 1; i < tries && r.code !== 0 && (isLockError(r) || !r.stderr); i++) {
    sleepMs(waitMs);
    r = runGit(args, cwd);
  }
  return r;
}

function commitIteration(cfg, repo, runDir, n, { verify, agent, saidDone }) {
  const cwd = repo.toplevel;
  const paths = ['--', cfg.targetDir, cfg.progressFile];
  const unstage = () => runGit(['reset', '-q', ...paths], cwd);
  const add = runGitRetry(['add', '-A', ...paths], cwd);
  if (add.code !== 0) {
    unstage();
    return { ok: false, reason: `git add 失敗: ${gitReason(add)}（ステージを戻した）` };
  }
  const staged = runGit(['diff', '--cached', '--quiet'], cwd);
  if (staged.code === 0) return { ok: false, reason: '差分なし' };

  const block = extractProgressBlock(readOr(cfg.progressFile), n);
  const subject = `${cfg.git.subjectPrefix}(${cfg.taskName}): 反復 ${n} 検証 ${verify.ok ? 'PASS' : 'FAIL'} → エージェント ${agent.turns} ターン${saidDone ? ' 完了宣言' : ''}${agent.isError ? ' エラー' : ''}`;
  const body = block || `(進捗メモに「### 反復 ${n}」のブロックがありません)\n検証: ${verify.ok ? 'PASS' : 'FAIL'} exit ${verify.code}`;
  const trailers = [
    `Loop-Task: ${cfg.taskName}`,
    `Loop-Iteration: ${n}`,
    `Loop-Verify: ${verify.ok ? 'PASS' : 'FAIL'}`,
    `Loop-Cost-Usd: ${agent.costUsd.toFixed(4)}`,
    `Loop-Run: ${runDir.split(/[\\/]/).at(-1)}`,
  ];
  const message = `${subject}\n\n${body}\n\n${trailers.join('\n')}\n`;
  const msgFile = join(runDir, `commit-${String(n).padStart(2, '0')}.txt`);
  writeFileSync(msgFile, message);

  const commit = runGitRetry(['commit', '-q', '-F', msgFile], cwd);
  if (commit.code !== 0) {
    unstage();
    return { ok: false, reason: `git commit 失敗: ${gitReason(commit)}（ステージを戻した。差分は作業ツリーに残っている）` };
  }
  const sha = runGit(['rev-parse', '--short', 'HEAD'], cwd).stdout;
  return { ok: true, sha, subject };
}

// ---------- ログ ----------
function writeIterationLog(runDir, n, { prompt, verify, agent, artifacts = [], specIssues = [] }) {
  const file = join(runDir, `iter-${String(n).padStart(2, '0')}.md`);
  const stderrBlock = agent.stderr.trim()
    ? `\n### stderr\n\`\`\`\n${tail(agent.stderr.trim(), 40)}\n\`\`\`\n`
    : '';
  const artifactsBlock = artifacts.length
    ? `- 成果物（artifacts/iter-${String(n).padStart(2, '0')}/）: ${artifacts.join(', ')}\n`
    : '';
  const specBlock = specIssues.length
    ? `\n### 仕様への指摘（spec-issue）\n${specIssues.map((s) => `- ${s.replace(/\n/g, '\n  ')}`).join('\n')}\n`
    : '';
  const body = `# 反復 ${n}

## 検証（エージェント実行前）
- 結果: ${verify.ok ? 'PASS' : 'FAIL'} / exit ${verify.code} / ${verify.ms}ms / hash ${verify.hash}
${artifactsBlock}\`\`\`
${verify.output}
\`\`\`

## エージェントに渡したプロンプト
\`\`\`markdown
${prompt}
\`\`\`

## エージェントの応答
- コマンド: \`${agent.command}\`
- exit ${agent.code} / ${agent.ms}ms / ${agent.turns} ターン / $${agent.costUsd.toFixed(4)}${agent.sessionId ? ` / session ${agent.sessionId}` : ''}${agent.isError ? ' / **ERROR**' : ''}
\`\`\`
${agent.result.trim()}
\`\`\`
${specBlock}${stderrBlock}`;
  writeFileSync(file, body);
  return file;
}

// ---------- メイン ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  const cfg = loadConfig(resolveConfigPath(args), args.overrides);

  if (args.verifyOnly) {
    const v = runVerify(cfg);
    console.log(`[verify] ${v.ok ? 'PASS' : 'FAIL'} (exit ${v.code}, ${v.ms}ms)\n${v.output}`);
    process.exit(v.ok ? 0 : 1);
  }

  const runDir = cfg.runDirOverride ?? join(cfg.runsDir, nowStamp());
  mkdirSync(runDir, { recursive: true });
  if (!existsSync(cfg.progressFile)) writeFileSync(cfg.progressFile, '# 進捗メモ\n\n');

  const state = {
    iteration: 0,
    totalCostUsd: 0,
    sameFailureCount: 0, // 直前と同じ失敗が「連続で何回繰り返されたか」
    lastFailureHash: null,
    agentSaidDone: false,
    status: 'running',
    iterations: [],
    specIssues: [], // エージェントが <spec-issue> で報告した仕様の抜け・矛盾（{ iteration, text }）
    specIssueGroups: [], // 同じ場所への指摘をまとめたもの（終了時に作る）
    blocked: null, // エージェントが <blocked> で申告した「自分では直せない理由」（{ iteration, reason }）
    setup: null,
  };
  const summaryPath = join(runDir, 'summary.json');
  const saveSummary = () =>
    writeFileSync(summaryPath, JSON.stringify({ config: cfg, ...state }, null, 2));

  console.log(`[loop] 開始  対象=${cfg.targetDir}  最大${cfg.loop.maxIterations}回  予算$${cfg.loop.maxCostUsd}  ログ=${runDir}`);
  if (isClaudeAgent(cfg.agent)) console.log(`[loop] 内側のエージェントの git: ${cfg.agent.allowGit ? '許可（agent.allowGit）' : '禁止（--disallowedTools）'}`);

  // 0. 環境準備（反復 1 の前に 1 回だけ）。失敗したらループを始めない
  if (cfg.setup.command) {
    console.log(`[loop] 環境準備: ${cfg.setup.command}`);
    const s = runSetup(cfg, runDir);
    state.setup = { ok: s.ok, code: s.code, ms: s.ms };
    console.log(`[loop] 環境準備 ${s.ok ? 'OK' : 'FAIL'} (exit ${s.code}, ${s.ms}ms)  記録=${join(runDir, 'setup.md')}`);
    if (!s.ok) {
      state.status = 'setup_failed';
      saveSummary();
      console.log(`${s.output}\n[loop] 終了: 環境準備に失敗（ループは開始していません。環境の問題は人間が直してください）  概要=${summaryPath}`);
      process.exit(1);
    }
  }

  let repo = null;
  if (cfg.git.autoCommit) {
    const d = detectRepo(cfg);
    if (d.ok) {
      repo = d;
      console.log(`[loop] 自動コミット有効  リポジトリ=${repo.toplevel}`);
    } else {
      console.log(`[loop] 自動コミット無効: ${d.reason}`);
    }
  }

  while (state.iteration < cfg.loop.maxIterations) {
    state.iteration += 1;
    const n = state.iteration;

    // 1. 検証（真実の源）
    const verify = runVerify(cfg);
    const artifacts = collectArtifacts(cfg, runDir, n);
    console.log(`[${n}] 検証 ${verify.ok ? 'PASS' : 'FAIL'} (exit ${verify.code}, ${verify.ms}ms)${artifacts.length ? `  成果物 ${artifacts.length} 件` : ''}`);

    // 2. 完了判定: 検証 PASS かつ 前回エージェントが完了を宣言
    if (verify.ok && state.agentSaidDone) {
      state.status = 'complete';
      state.iterations.push({ n, verify: { ok: true, hash: verify.hash }, agent: null, artifacts });
      break;
    }

    // 3. スタック検知（失敗内容が変わらない）
    if (!verify.ok) {
      state.sameFailureCount = verify.hash === state.lastFailureHash ? state.sameFailureCount + 1 : 0;
      state.lastFailureHash = verify.hash;
      if (state.sameFailureCount >= cfg.loop.stuckStopAfter) {
        state.status = 'stuck';
        console.log(`[${n}] 同じ失敗が ${state.sameFailureCount + 1} 回連続。停止します。`);
        break;
      }
    } else {
      state.sameFailureCount = 0;
      state.lastFailureHash = null;
    }

    // 4. エージェント実行
    const prompt = buildPrompt(cfg, state, verify);
    const agent = runAgent(cfg, prompt);
    state.totalCostUsd += agent.costUsd;
    state.agentSaidDone = agent.result.includes(cfg.loop.doneMarker);
    const specIssues = extractSpecIssues(agent.result);
    for (const text of specIssues) state.specIssues.push({ iteration: n, text });
    const blockedReason = extractBlocked(agent.result, cfg.loop.blockedTag);
    if (blockedReason && !state.agentSaidDone) state.blocked = { iteration: n, reason: blockedReason };
    const logFile = writeIterationLog(runDir, n, { prompt, verify, agent, artifacts, specIssues });
    appendFileSync(
      cfg.progressFile,
      `\n- [ランナー] 反復 ${n}: 検証 ${verify.ok ? 'PASS' : 'FAIL'} → エージェント ${agent.turns} ターン / $${agent.costUsd.toFixed(4)}${state.agentSaidDone ? ' / 完了宣言あり' : ''}${agent.isError ? ' / エラー' : ''}\n`,
    );
    // 反復の記録をコミットに残す（進捗メモへの追記の後に行い、差分とメモの状態を一致させる）
    let commit = null;
    if (repo) {
      const c = commitIteration(cfg, repo, runDir, n, { verify, agent, saidDone: state.agentSaidDone });
      commit = c.ok ? c.sha : null;
      appendFileSync(logFile, `\n## コミット\n${c.ok ? `- ${c.sha} ${c.subject}` : `- なし（${c.reason}）`}\n`);
      if (!c.ok && c.reason !== '差分なし') console.log(`[${n}] 自動コミット失敗: ${c.reason}`);
    }
    state.iterations.push({
      n,
      verify: { ok: verify.ok, code: verify.code, hash: verify.hash },
      agent: { code: agent.code, ms: agent.ms, turns: agent.turns, costUsd: agent.costUsd, isError: agent.isError, saidDone: state.agentSaidDone },
      commit,
      artifacts,
      specIssues,
      log: logFile,
    });
    saveSummary();
    console.log(
      `[${n}] エージェント ${agent.isError ? 'ERROR' : 'OK'} ${agent.ms}ms $${agent.costUsd.toFixed(4)} 累計$${state.totalCostUsd.toFixed(4)}${state.agentSaidDone ? ' 完了宣言あり（次の検証で確認）' : ''}${commit ? ` コミット ${commit}` : ''}${specIssues.length ? ` 仕様への指摘 ${specIssues.length} 件` : ''}`,
    );

    // 5. 停止条件
    if (agent.isError) {
      state.status = 'agent_error';
      console.log(`[${n}] エージェントがエラー終了。${agent.timedOut ? 'タイムアウト。' : ''}${tail(agent.stderr.trim(), 5)}`);
      break;
    }
    if (state.blocked) {
      // エージェントが「自分の権限では直せない」と申告した。反復を重ねても同じ結論になるので止めて人間に返す
      // （textkit-revert の本物の実行では、fix ループが 2 反復とも同じ診断をして予算上限で止まっていた）
      state.status = 'blocked';
      console.log(`[${n}] エージェントが「自分では直せない」と申告。ループを止めて人間に返します。\n    理由: ${state.blocked.reason.replace(/\s*\n\s*/g, ' ')}`);
      break;
    }
    if (state.totalCostUsd > cfg.loop.maxCostUsd) {
      state.status = 'budget_exceeded';
      console.log(`[${n}] 予算超過 $${state.totalCostUsd.toFixed(4)} > $${cfg.loop.maxCostUsd}`);
      break;
    }
  }

  if (state.status === 'running') {
    // 上限に達した。最後にもう一度検証して完了かどうか見る
    const v = runVerify(cfg);
    state.status = v.ok && state.agentSaidDone ? 'complete' : 'max_iterations';
  }
  saveSummary();

  const label = {
    complete: '完了（検証 PASS + エージェントの完了宣言）',
    stuck: 'スタック（同じ失敗の繰り返し）',
    agent_error: 'エージェントエラー',
    budget_exceeded: '予算超過',
    max_iterations: '最大反復回数に到達（未完了）',
    blocked: 'エージェントが「自分では直せない」と申告（人間の判断待ち）',
  }[state.status];
  if (state.status === 'stuck') {
    console.log('[loop] 同じ失敗が続く原因が環境（依存パッケージ・権限・ネットワーク・外部ツール）にあるなら、ループでは直りません。人間が直してから再実行してください。');
  }
  state.specIssueGroups = groupSpecIssues(state.specIssues).map(({ refs, count, sources, text }) => ({ refs, count, sources, text }));
  saveSummary();
  printSpecIssues(state.specIssues, (line) => console.log(`[loop] ${line}`), { fullPath: summaryPath });
  console.log(`[loop] 終了: ${label}  反復${state.iteration}回  累計$${state.totalCostUsd.toFixed(4)}  概要=${summaryPath}`);
  process.exit(state.status === 'complete' ? 0 : 1);
}

main();
