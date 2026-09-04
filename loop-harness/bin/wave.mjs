#!/usr/bin/env node
// wave.mjs — 複数タスクを git worktree で並列に回し、ランナーがマージと検証を行う
//
// claude-looper の Wave 構造を取り込んだもの。ただし判断はすべてランナー（このスクリプト）が行い、
// エージェントは各 worktree の中で従来どおり loop.mjs として動くだけで、git もマージも知らない。
//
//   Wave ごとに:
//     1. 未完了タスクごとに worktree とブランチ loop/<id> を HEAD から作る
//     2. 各 worktree で loop.mjs --worktree --commit を並列起動（maxParallel まで）
//     3. 完了（exit 0）したタスクだけを 1 つずつ現在のブランチにマージ。衝突したら abort して未完了扱い
//     4. マージのたびに回帰検証（これまでに完了した全タスクの検証コマンドを累積で実行）
//          PASS → そのまま
//          FAIL → 第 1 段: ランナーが fix タスクを生成し、狭い権限・小さい予算の loop.mjs を本体上で回す。通れば fix をコミット
//                 第 2 段: fix でも通らなければ、そのマージだけを取り消し（reset --hard HEAD^）、失敗出力を進捗メモに添えて差し戻す
//     5. 未完了タスク（未達 / 衝突 / 差し戻し）は worktree の PROGRESS.md だけを取り込む（コードは捨てて記憶だけ残す）
//     6. 未完了が残れば次ラウンド（maxRounds まで）、無ければ次の Wave
//   全 Wave が終わったら統合検証（wave.config.json の verify.command）。FAIL なら fix ループを 1 回だけ試し、それでも FAIL なら失敗扱い
//
//   統合検証を毎 Wave 後に回すと「まだ実装していない後続 Wave のテスト」で落ちるため、
//   途中は完了済みタスクの検証だけを回帰させ、全体のテストは最後にだけ回す（1 回目の試行で学んだ）。
//
// 使い方:  node bin/wave.mjs --wave <名前> [--agent "<cmd>"] [--max-rounds N] [--budget USD]
//                            [--worktree-base <dir>] [--no-fix] [--dry-run] [--keep-worktrees]
//
// Wave は tasks/<名前>/wave.config.json で定義する。

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const tasksDir = join(root, 'tasks');
const loopScript = join(here, 'loop.mjs');

// ---------- 引数 ----------
function fail(msg) {
  console.error(`[wave] ${msg}`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = { wave: null, config: null, agent: null, dryRun: false, keepWorktrees: false, overrides: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) fail(`${a} には値が必要です`);
      return argv[++i];
    };
    if (a === '--wave') out.wave = next();
    else if (a === '--config') out.config = resolve(next());
    else if (a === '--agent') out.agent = next();
    else if (a === '--max-rounds') out.overrides.maxRounds = Number(next());
    else if (a === '--budget') out.overrides.maxCostUsd = Number(next());
    else if (a === '--worktree-base') out.overrides.worktreeBase = resolve(next());
    else if (a === '--no-fix') out.overrides.fixEnabled = false;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--keep-worktrees') out.keepWorktrees = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else fail(`不明な引数: ${a}`);
  }
  return out;
}

function usage() {
  console.log(`使い方: node bin/wave.mjs --wave <名前> [オプション]
  --wave <名前>       tasks/<名前>/wave.config.json を使う
  --config <path>     設定ファイルを直接指定
  --agent "<cmd>"     各タスクの loop.mjs に渡すエージェント起動コマンド（例: "node ../mock-agent-textkit.mjs"）
  --max-rounds <N>    1 Wave あたりの最大ラウンド数を上書き
  --budget <USD>      全タスク合計のコスト上限を上書き
  --worktree-base <dir>  worktree を作る場所（既定: OS の一時ディレクトリ/loop-harness-wt。Windows のパス長制限を避けるため短い場所にする）
  --no-fix            回帰・統合検証が落ちたときの fix ループを使わない（すぐ差し戻す / 失敗終了）
  --dry-run           実行計画だけ表示して終了
  --keep-worktrees    終了後も worktree とブランチを残す（調査用）
`);
}

// ---------- 設定 ----------
function loadConfig(path, overrides) {
  if (!existsSync(path)) fail(`設定ファイルがありません: ${path}`);
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  const base = dirname(path);
  const abs = (p) => (isAbsolute(p) ? p : resolve(base, p));
  cfg.name = cfg.name ?? base.split(/[\\/]/).filter(Boolean).at(-1);
  cfg.repoDir = abs(cfg.repoDir ?? '.');
  cfg.runsDir = abs(cfg.runsDir ?? 'runs');
  cfg.verify = { tailLines: 80, timeoutSec: 300, ...cfg.verify };
  cfg.maxParallel = cfg.maxParallel ?? 4;
  cfg.maxRounds = cfg.maxRounds ?? 3;
  cfg.maxCostUsd = cfg.maxCostUsd ?? 10;
  // 回帰・統合検証が落ちたときの fix ループ。権限を狭め（Write なし = 新規ファイル不可）、反復と予算を小さく絞る
  cfg.fix = {
    enabled: true,
    maxIterations: 2,
    maxCostUsd: 1,
    allowedTools: 'Read,Edit,Glob,Grep,Bash(node:*),PowerShell(node:*)',
    maxTurns: 20,
    protectedPaths: ['test'], // repoDir からの相対。fix がここを変えたら「テストを弱めて通した」とみなし無効にする
    ...cfg.fix,
  };
  // この wave の実行前から完了しているタスク。回帰検証にその検証コマンドを含める（既存コードの上に拡張を載せるとき）
  cfg.regressionTasks = cfg.regressionTasks ?? [];
  // タスクに紐づかない回帰検証コマンド（設計ルールのテストなど）
  cfg.regressionCommands = cfg.regressionCommands ?? [];
  if (typeof overrides.fixEnabled === 'boolean') cfg.fix.enabled = overrides.fixEnabled;
  // worktree の置き場。リポジトリ内の runs/ に置くと Windows でパスが長くなり
  // 「fatal: '$GIT_DIR' too big」で作成に失敗することがあるため、既定は OS の一時ディレクトリ
  cfg.worktreeBase = overrides.worktreeBase ?? (cfg.worktreeBase ? abs(cfg.worktreeBase) : join(tmpdir(), 'loop-harness-wt'));
  if (Number.isFinite(overrides.maxRounds)) cfg.maxRounds = overrides.maxRounds;
  if (Number.isFinite(overrides.maxCostUsd)) cfg.maxCostUsd = overrides.maxCostUsd;
  if (!Array.isArray(cfg.waves) || cfg.waves.length === 0) fail('waves が空です');
  if (!cfg.verify.command) fail('verify.command（統合検証）が設定されていません');
  if (!existsSync(cfg.repoDir)) fail(`repoDir がありません: ${cfg.repoDir}`);
  cfg.waves.forEach((w, i) => {
    w.name = w.name ?? `W${i + 1}`;
    if (!Array.isArray(w.tasks) || w.tasks.length === 0) fail(`Wave "${w.name}" の tasks が空です`);
    for (const id of w.tasks) {
      if (!existsSync(join(tasksDir, id, 'loop.config.json'))) fail(`Wave "${w.name}" のタスクがありません: tasks/${id}/loop.config.json`);
    }
  });
  for (const id of cfg.regressionTasks) {
    if (!existsSync(join(tasksDir, id, 'loop.config.json'))) fail(`regressionTasks のタスクがありません: tasks/${id}/loop.config.json`);
  }
  return cfg;
}

const readTaskConfig = (id) => JSON.parse(readFileSync(join(tasksDir, id, 'loop.config.json'), 'utf8'));

// タスクの進捗メモの、リポジトリ内での相対パス（未完了タスクの記憶を救うために使う）
function taskProgressRelPath(id, toplevel) {
  const c = readTaskConfig(id);
  const p = resolve(join(tasksDir, id), c.progressFile ?? 'PROGRESS.md');
  return isInside(p, toplevel) ? relative(toplevel, p).split('\\').join('/') : null;
}

// タスク自身の検証コマンド（回帰検証で累積して使う）
const taskVerifyCommand = (id) => readTaskConfig(id).verify?.command ?? null;

// ---------- ユーティリティ ----------
const nowStamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const tail = (s, n) => s.split(/\r?\n/).slice(-n).join('\n');
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

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return { code: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim(), error: r.error ? String(r.error) : null };
}
function gitOrFail(args, cwd, what) {
  const r = git(args, cwd);
  if (r.code !== 0) fail(`${what} に失敗: git ${args.join(' ')}\n${r.stderr || r.error}`);
  return r.stdout;
}

function runShell(command, { cwd, timeoutSec }) {
  const started = Date.now();
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: timeoutSec * 1000, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const combined = [r.stdout, r.stderr].filter(Boolean).join('\n');
  return { ok: r.status === 0 && !r.error, code: r.status, ms: Date.now() - started, output: combined.trim() };
}

// 複数の検証コマンドを順に実行し、最初の失敗で止まる
function runCommands(commands, cfg) {
  const results = [];
  for (const command of commands) {
    const v = runShell(command, { cwd: cfg.repoDir, timeoutSec: cfg.verify.timeoutSec });
    results.push({ command, ...v });
    if (!v.ok) break;
  }
  const ok = results.every((r) => r.ok);
  const failed = results.find((r) => !r.ok) ?? null;
  return { ok, results, failed };
}
const formatResults = (results) =>
  results.map((r) => `$ ${r.command}\nexit ${r.code} / ${r.ms}ms\n\n${r.output}\n`).join('\n' + '='.repeat(60) + '\n');

// 並列度を制限して非同期関数を回す
async function runPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// loop.mjs を 1 タスク分、worktree の中で起動する
function runLoop({ id, worktree, runDir, agent }) {
  const args = [loopScript, '--task', id, '--worktree', worktree, '--run-dir', runDir, '--commit'];
  if (agent) args.push('--agent', agent);
  return new Promise((done) => {
    const started = Date.now();
    const chunks = [];
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true });
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    child.on('close', (code) => {
      const output = Buffer.concat(chunks).toString('utf8');
      writeFileSync(join(runDir, 'loop-output.txt'), output);
      let summary = null;
      try {
        summary = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8'));
      } catch {
        // summary が無い = loop.mjs が起動前に失敗した
      }
      done({ id, code, ms: Date.now() - started, summary, output });
    });
  });
}

// ---------- fix ループ（回帰・統合検証が落ちたときの第 1 段） ----------
// ランナーが fix タスク（設定・仕様・進捗メモ）を runs/ 配下に生成し、本体チェックアウト上で loop.mjs を回す。
// 権限を狭め、反復と予算を絞る。通ったかどうかは呼び出し側がもう一度検証して決める（fix の自己申告は使わない）。
function runFixLoop({ cfg, dir, label, title, situation, commands, failed, baseTaskId, agent }) {
  // fix ループ自身の検証はランナーの再検証と同じ全コマンド。落ちた 1 つだけにすると
  // 「それだけ通して完了宣言 → 再検証で別のコマンドが落ちる」になる（本物のエージェントで観察した）
  const verifyCommand = commands.join(' && ');
  mkdirSync(dir, { recursive: true });
  const baseAgent = baseTaskId ? readTaskConfig(baseTaskId).agent : null;
  const agentCfg = baseAgent
    ? { ...baseAgent, args: narrowAgentArgs(baseAgent.args ?? [], cfg.fix) }
    : { command: 'claude', args: ['-p', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', cfg.fix.allowedTools, '--max-turns', String(cfg.fix.maxTurns)], timeoutSec: 1200 };
  const config = {
    taskName: label,
    targetDir: cfg.repoDir,
    promptFile: join(dir, 'PROMPT.md'),
    progressFile: join(dir, 'PROGRESS.md'),
    runsDir: dir,
    verify: { command: verifyCommand, tailLines: cfg.verify.tailLines, timeoutSec: cfg.verify.timeoutSec },
    git: { autoCommit: false },
    agent: agentCfg,
    loop: { maxIterations: cfg.fix.maxIterations, maxCostUsd: cfg.fix.maxCostUsd, stuckWarnAfter: 1, stuckStopAfter: 2 },
  };
  writeFileSync(join(dir, 'loop.config.json'), JSON.stringify(config, null, 2));
  writeFileSync(
    join(dir, 'PROMPT.md'),
    `# 回帰修正: ${title}

${situation}

## 完了条件（すべて満たすこと）

1. 次の検証がすべて PASS する（落ちているのは \`${failed.command}\`。他は現在 PASS しており、壊さないこと）
   \`${verifyCommand}\`
2. \`test/\` を変更しない。テストを弱めたり削除したりしない
3. 新しいファイルを作らない。既存ファイルの最小限の修正で直す
4. export 名やシグネチャ（他モジュールとの契約）を変えない

## 落ちた検証の出力

\`\`\`
${tail(failed.output, cfg.verify.tailLines)}
\`\`\`

## 方針

- まず「直近のマージで何が変わったか」を疑う。\`git diff --name-only HEAD^ HEAD\` で変更ファイルを見る
- 落ちたテストが期待する振る舞いに合わせて、変更されたコードの側を直す
- 直し方が分からない、または大きな変更が必要なら、進捗メモに理由を書いて終了する（ランナーが差し戻す）
- テスト同士が矛盾していて実装側では両立できないと判断した場合も、コードを変えずに進捗メモにその根拠を書いて終了する
`,
  );
  writeFileSync(join(dir, 'PROGRESS.md'), '# 進捗メモ（fix ループ）\n\n');
  const args = [loopScript, '--config', join(dir, 'loop.config.json'), '--run-dir', join(dir, 'run'), '--no-commit'];
  if (agent) args.push('--agent', agent);
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(join(dir, 'loop-output.txt'), (r.stdout ?? '') + (r.stderr ?? ''));
  let summary = null;
  try {
    summary = JSON.parse(readFileSync(join(dir, 'run', 'summary.json'), 'utf8'));
  } catch {
    // 起動前に失敗
  }
  return { status: summary?.status ?? 'launch_failed', iterations: summary?.iteration ?? 0, costUsd: summary?.totalCostUsd ?? 0 };
}

// タスクのエージェント引数を fix 用に狭める（--allowedTools と --max-turns を差し替え）
function narrowAgentArgs(args, fix) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--allowedTools') {
      out.push('--allowedTools', fix.allowedTools);
      i++;
    } else if (args[i] === '--max-turns') {
      out.push('--max-turns', String(fix.maxTurns));
      i++;
    } else out.push(args[i]);
  }
  if (!out.includes('--allowedTools')) out.push('--allowedTools', fix.allowedTools);
  if (!out.includes('--max-turns')) out.push('--max-turns', String(fix.maxTurns));
  return out;
}

// ---------- メイン ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  const cfgPath = args.config ?? (args.wave ? join(tasksDir, args.wave, 'wave.config.json') : null);
  if (!cfgPath) fail('--wave か --config を指定してください');
  const cfg = loadConfig(cfgPath, args.overrides);

  // リポジトリの前提チェック
  const toplevel = gitOrFail(['rev-parse', '--show-toplevel'], cfg.repoDir, 'リポジトリの特定');
  const branch = gitOrFail(['rev-parse', '--abbrev-ref', 'HEAD'], toplevel, 'ブランチの特定');
  if (branch === 'HEAD') fail('detached HEAD では実行できません');
  const dirty = git(['status', '--porcelain'], toplevel).stdout;
  if (dirty && !args.dryRun) fail(`作業ツリーがクリーンではありません。先にコミットするか戻してください:\n${tail(dirty, 10)}`);

  const log = (msg) => console.log(`[wave] ${msg}`);
  log(`${cfg.name}  リポジトリ=${toplevel}  ブランチ=${branch}  並列${cfg.maxParallel}  ラウンド上限${cfg.maxRounds}  予算$${cfg.maxCostUsd}  fix=${cfg.fix.enabled ? 'on' : 'off'}`);
  cfg.waves.forEach((w, i) => console.log(`  Wave ${i + 1} ${w.name}: ${w.tasks.join(', ')}`));
  if (args.dryRun) return console.log('[wave] ドライラン終了');

  const stamp = nowStamp();
  const runDir = join(cfg.runsDir, stamp);
  mkdirSync(runDir, { recursive: true });
  // worktree は短いパスに置く（日時の秒以下を落として短くする）
  const wtBase = join(cfg.worktreeBase, `${cfg.name}-${stamp.slice(0, 16).replace(/\D/g, '')}`);
  mkdirSync(wtBase, { recursive: true });
  log(`worktree=${wtBase}`);
  const state = { name: cfg.name, branch, startedAt: new Date().toISOString(), totalCostUsd: 0, status: 'running', waves: [], merges: [], fixes: [] };
  const summaryPath = join(runDir, 'wave-summary.json');
  const save = () => writeFileSync(summaryPath, JSON.stringify(state, null, 2));

  const cleanup = (id, worktree) => {
    if (args.keepWorktrees) return;
    git(['worktree', 'remove', '--force', worktree], toplevel);
    git(['branch', '-D', `loop/${id}`], toplevel);
  };
  // 本体チェックアウトの repoDir 配下を HEAD の状態に戻す（fix ループの失敗後など）
  const discardWorkingChanges = () => {
    git(['checkout', '--', cfg.repoDir], toplevel);
    git(['clean', '-fd', '--', cfg.repoDir], toplevel);
  };
  // 完了済みタスクの検証コマンドを累積した回帰検証
  const regressionCommands = (wave, extraIds = []) => {
    const done = state.waves.flatMap((w) => Object.entries(w.done).filter(([, d]) => d).map(([id]) => id));
    return wave.verify
      ? [wave.verify]
      : [...new Set([...cfg.regressionCommands, ...[...cfg.regressionTasks, ...done, ...extraIds].map(taskVerifyCommand).filter(Boolean)])];
  };
  // fix が保護パス（既定 test/）を変更していないか。変更していたら「テストを弱めて通した」とみなす
  const fixTouchedProtected = () => {
    const paths = cfg.fix.protectedPaths.map((p) => join(cfg.repoDir, p)).filter((p) => existsSync(p));
    if (paths.length === 0) return null;
    const changed = git(['status', '--porcelain', '--', ...paths], toplevel).stdout;
    return changed || null;
  };
  // 回帰・統合検証が落ちたときの第 1 段: fix ループを回し、もう一度同じ検証で判定する
  const tryFix = ({ label, title, situation, commands, failed, baseTaskId }) => {
    const dir = join(runDir, `fix-${label}`);
    log(`  fix ループ起動（${cfg.fix.maxIterations} 反復・$${cfg.fix.maxCostUsd} まで）→ ${dir}`);
    const fx = runFixLoop({ cfg, dir, label, title, situation, commands, failed, baseTaskId, agent: args.agent });
    state.totalCostUsd += fx.costUsd;
    const protectedChanged = fixTouchedProtected();
    let again = runCommands(commands, cfg);
    writeFileSync(join(dir, 'recheck.txt'), (protectedChanged ? `保護パスが変更された:\n${protectedChanged}\n\n` : '') + formatResults(again.results));
    if (protectedChanged) {
      // テストを弱めて通した可能性があるので、検証結果にかかわらず fix は無効
      again = { ...again, ok: false, failed: again.failed ?? { command: '(保護パスの変更)', output: protectedChanged } };
    }
    const record = { label, fixStatus: fx.status, iterations: fx.iterations, costUsd: fx.costUsd, recheckOk: again.ok, protectedChanged: Boolean(protectedChanged) };
    state.fixes.push(record);
    log(`  fix ループ ${fx.status}（${fx.iterations} 反復、$${fx.costUsd.toFixed(4)}）→ 再検証 ${again.ok ? 'PASS' : 'FAIL'}${protectedChanged ? '（保護パス test/ を変更したため無効）' : ''}`);
    return { ok: again.ok, record, again };
  };

  // 0. ベースライン検証: 回帰検証に含める既存の検証が、マージ前の HEAD で通っているか。
  //    通っていないなら「マージが壊した」と「最初から壊れていた」を区別できないので、ここで止める
  //    （本物の fix エージェントが「マージ前に回帰が通っていたか先に確認すべき」と申し送りしてきたことから追加）
  const baselineCommands = [...new Set([...cfg.regressionCommands, ...cfg.regressionTasks.map(taskVerifyCommand).filter(Boolean)])];
  if (baselineCommands.length > 0) {
    const b = runCommands(baselineCommands, cfg);
    writeFileSync(join(runDir, 'baseline.txt'), formatResults(b.results));
    state.baseline = { ok: b.ok, commands: b.results.map(({ command, ok }) => ({ command, ok })) };
    log(`ベースライン検証 ${b.ok ? 'PASS' : 'FAIL'}（${baselineCommands.length} コマンド）`);
    if (!b.ok) {
      console.log(tail(b.failed.output, cfg.verify.tailLines));
      state.status = 'baseline_failed';
      state.finishedAt = new Date().toISOString();
      save();
      rmSync(wtBase, { recursive: true, force: true });
      log(`終了: ベースライン検証 FAIL（マージ前から既存の検証が落ちている。タスクを回す前に直すこと）  概要=${summaryPath}`);
      process.exit(1);
    }
  }

  outer: for (const [wi, wave] of cfg.waves.entries()) {
    const waveState = { name: wave.name, rounds: [], done: {} };
    state.waves.push(waveState);
    for (const id of wave.tasks) waveState.done[id] = false;

    for (let round = 1; round <= cfg.maxRounds; round++) {
      const pending = wave.tasks.filter((id) => !waveState.done[id]);
      if (pending.length === 0) break;
      log(`━━ Wave ${wi + 1} ${wave.name}  ラウンド ${round}/${cfg.maxRounds}: ${pending.join(', ')}`);
      const roundState = { round, tasks: {} };
      waveState.rounds.push(roundState);

      // 1. worktree を作る
      const jobs = [];
      for (const id of pending) {
        const worktree = join(wtBase, id);
        git(['worktree', 'remove', '--force', worktree], toplevel);
        git(['branch', '-D', `loop/${id}`], toplevel);
        const r = git(['worktree', 'add', '-b', `loop/${id}`, worktree, 'HEAD'], toplevel);
        if (r.code !== 0) {
          // worktree が作れないのは環境の問題（パス長・権限など）で、再試行しても直らない。即停止する
          roundState.tasks[id] = { status: 'worktree_failed', detail: r.stderr };
          state.status = 'worktree_failed';
          state.failedAt = { wave: wave.name, round, id, detail: r.stderr };
          log(`  ${id}: worktree 作成失敗。停止します\n${r.stderr}`);
          save();
          break outer;
        }
        const taskRunDir = join(runDir, `${id}-r${round}`);
        mkdirSync(taskRunDir, { recursive: true });
        jobs.push({ id, worktree, runDir: taskRunDir, agent: args.agent });
      }

      // 2. 並列に loop.mjs を回す
      const results = await runPool(jobs, cfg.maxParallel, async (job) => {
        log(`  ${job.id}: 起動`);
        const r = await runLoop(job);
        const s = r.summary;
        const cost = s?.totalCostUsd ?? 0;
        state.totalCostUsd += cost;
        log(`  ${job.id}: ${s ? s.status : `起動失敗 (exit ${r.code})`}  反復${s?.iteration ?? '-'}回  $${cost.toFixed(4)}  ${Math.round(r.ms / 1000)}s`);
        return { ...job, ...r };
      });

      // 3〜5. 完了したタスクを 1 つずつマージし、そのたびに回帰検証。落ちたら fix → 差し戻し
      for (const r of results) {
        const t = { status: r.summary?.status ?? 'launch_failed', iterations: r.summary?.iteration ?? 0, costUsd: r.summary?.totalCostUsd ?? 0, commit: null };
        roundState.tasks[r.id] = t;
        const ahead = Number(git(['rev-list', '--count', `HEAD..loop/${r.id}`], toplevel).stdout || 0);
        let failureNote = null; // 差し戻し時に進捗メモへ添える説明

        if (t.status !== 'complete') {
          t.merge = 'skipped';
          log(`  ${r.id}: 未完了（${t.status}）→ コードは捨て、進捗メモだけ取り込む`);
        } else if (ahead === 0) {
          t.merge = 'no_changes';
          waveState.done[r.id] = true;
          log(`  ${r.id}: 完了だがコミットなし（変更不要）`);
        } else {
          const m = git(['merge', '--no-ff', '--no-edit', '-m', `wave(${cfg.name}/${wave.name}): ${r.id} をマージ（${ahead} コミット）`, `loop/${r.id}`], toplevel);
          if (m.code !== 0) {
            git(['merge', '--abort'], toplevel);
            t.merge = 'conflict';
            t.detail = tail(m.stdout + '\n' + m.stderr, 8);
            log(`  ${r.id}: マージ衝突 → abort。次ラウンドで再実行`);
          } else {
            const mergeCommit = git(['rev-parse', '--short', 'HEAD'], toplevel).stdout;
            // 4. 回帰検証（このタスクを含めた累積）
            const commands = regressionCommands(wave, [r.id]);
            let reg = runCommands(commands, cfg);
            writeFileSync(join(runDir, `regression-${r.id}-r${round}.txt`), formatResults(reg.results));
            t.regression = { ok: reg.ok, commands: reg.results.map(({ command, ok, code, ms }) => ({ command, ok, code, ms })) };
            log(`  ${r.id}: マージ ${mergeCommit}（${ahead} コミット）→ 回帰検証 ${reg.ok ? 'PASS' : 'FAIL'}（${commands.length} コマンド）`);

            if (!reg.ok && cfg.fix.enabled) {
              // 第 1 段: fix ループ
              const fx = tryFix({
                label: `${r.id}-r${round}`,
                title: `${r.id} のマージ後に回帰検証が失敗`,
                situation: `Wave「${wave.name}」でタスク ${r.id} をマージした直後、これまでに完了したタスクの検証を回帰させたところ失敗した。\n作業ディレクトリは本体チェックアウト（マージ済みの状態）。直近のマージ ${mergeCommit} が原因の可能性が高い。`,
                commands,
                failed: reg.failed,
                baseTaskId: r.id,
              });
              if (fx.ok) {
                git(['add', '-A', '--', cfg.repoDir], toplevel);
                const c = git(['commit', '-q', '-m', `fix(${cfg.name}/${wave.name}): ${r.id} のマージ後の回帰を修正（ランナー起動の fix ループ、${fx.record.iterations} 反復、$${fx.record.costUsd.toFixed(4)}）`], toplevel);
                t.fix = { ...fx.record, commit: c.code === 0 ? git(['rev-parse', '--short', 'HEAD'], toplevel).stdout : null };
                reg = fx.again;
              } else {
                t.fix = fx.record;
                discardWorkingChanges();
              }
            }

            if (reg.ok) {
              t.merge = 'merged';
              t.commit = mergeCommit;
              waveState.done[r.id] = true;
              state.merges.push({ wave: wave.name, round, id: r.id, commit: mergeCommit, commits: ahead, fixed: Boolean(t.fix?.commit) });
            } else {
              // 第 2 段: このマージだけを取り消して差し戻す（HEAD^ = マージ前）
              git(['reset', '-q', '--hard', 'HEAD^'], toplevel);
              t.merge = 'reverted';
              t.detail = tail(reg.failed.output, 12);
              failureNote = `### ランナー: ラウンド ${round} のマージは回帰検証で差し戻し\n` +
                `マージ後に \`${reg.failed.command}\` が失敗した${cfg.fix.enabled ? '（fix ループでも直らなかった）' : ''}。マージは取り消され、コードは破棄された。\n` +
                `次の実行では、他のタスクが担当するファイルや契約（共有定数・interface）を変更していないかを最初に確認すること。\n\`\`\`\n${tail(reg.failed.output, 30)}\n\`\`\`\n`;
              log(`  ${r.id}: 回帰検証 FAIL のためマージを取り消し → 次ラウンドで再実行`);
            }
          }
        }

        // 5. マージされなかったタスクは PROGRESS.md だけを救う（記憶は残し、コードは捨てる）
        if (!waveState.done[r.id] && ahead > 0) {
          const rel = taskProgressRelPath(r.id, toplevel);
          if (rel) {
            const show = git(['show', `loop/${r.id}:${rel}`], toplevel);
            const current = existsSync(join(toplevel, rel)) ? readFileSync(join(toplevel, rel), 'utf8') : '';
            let next = show.code === 0 && show.stdout ? show.stdout.replace(/\r?\n/g, '\n') + '\n' : current;
            if (failureNote) next += `\n${failureNote}`;
            if (next.trim() !== current.trim()) {
              writeFileSync(join(toplevel, rel), next);
              git(['add', '--', rel], toplevel);
              const c = git(['commit', '-q', '-m', `wave(${cfg.name}/${wave.name}): ${r.id} の進捗メモを取り込み（コードは${t.merge === 'reverted' ? '差し戻し' : '未完了のため破棄'}、ラウンド ${round}）`], toplevel);
              t.progressSalvaged = c.code === 0;
            }
          }
        }
        cleanup(r.id, r.worktree);
        save();
      }

      // 6. 停止条件
      if (state.totalCostUsd > cfg.maxCostUsd) {
        state.status = 'budget_exceeded';
        log(`予算超過 $${state.totalCostUsd.toFixed(4)} > $${cfg.maxCostUsd}`);
        break outer;
      }
      const remaining = wave.tasks.filter((id) => !waveState.done[id]);
      if (remaining.length > 0 && round === cfg.maxRounds) {
        state.status = 'max_rounds';
        state.failedAt = { wave: wave.name, round, remaining };
        log(`ラウンド上限。未完了: ${remaining.join(', ')}`);
        break outer;
      }
    }
  }

  // 全 Wave 終了後の統合検証（全体テスト）。ここが真実の源で、エージェントの自己申告は使わない
  if (state.status === 'running') {
    let v = runCommands([cfg.verify.command], cfg);
    writeFileSync(join(runDir, 'integration.txt'), formatResults(v.results));
    log(`統合検証 ${v.ok ? 'PASS' : 'FAIL'}`);
    if (!v.ok && cfg.fix.enabled) {
      const fx = tryFix({
        label: 'integration',
        title: '全 Wave 終了後の統合検証が失敗',
        situation: `全 Wave のタスクをマージし終えた状態で、全体の検証コマンドを実行したところ失敗した。作業ディレクトリは本体チェックアウト。`,
        commands: [cfg.verify.command],
        failed: v.failed,
        baseTaskId: cfg.waves.at(-1).tasks.at(-1),
      });
      if (fx.ok) {
        git(['add', '-A', '--', cfg.repoDir], toplevel);
        git(['commit', '-q', '-m', `fix(${cfg.name}): 統合検証の失敗を修正（ランナー起動の fix ループ、${fx.record.iterations} 反復、$${fx.record.costUsd.toFixed(4)}）`], toplevel);
        v = fx.again;
      } else {
        discardWorkingChanges();
      }
    }
    if (!v.ok) console.log(tail(v.failed.output, cfg.verify.tailLines));
    state.integration = { ok: v.ok };
    state.status = v.ok ? 'complete' : 'integration_failed';
  }
  state.finishedAt = new Date().toISOString();
  save();
  if (!args.keepWorktrees) rmSync(wtBase, { recursive: true, force: true });
  git(['worktree', 'prune'], toplevel);

  const label = {
    complete: '完了（全 Wave のタスクをマージし統合検証 PASS）',
    integration_failed: '統合検証 FAIL（全 Wave 終了後の全体テストが落ちた）',
    budget_exceeded: '予算超過',
    max_rounds: 'ラウンド上限（未完了タスクあり）',
    worktree_failed: 'worktree 作成失敗（環境の問題。--worktree-base で短いパスを指定するなど）',
  }[state.status];
  log(`終了: ${label}  マージ${state.merges.length}件  fix ${state.fixes.length}回  累計$${state.totalCostUsd.toFixed(4)}  概要=${summaryPath}`);
  process.exit(state.status === 'complete' ? 0 : 1);
}

main();
