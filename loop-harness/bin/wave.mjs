#!/usr/bin/env node
// wave.mjs — 複数タスクを git worktree で並列に回し、ランナーがマージと統合検証を行う
//
// claude-looper の Wave 構造を取り込んだもの。ただし判断はすべてランナー（このスクリプト）が行い、
// エージェントは各 worktree の中で従来どおり loop.mjs として動くだけで、git もマージも知らない。
//
//   Wave ごとに:
//     1. 未完了タスクごとに worktree とブランチ loop/<id> を HEAD から作る
//     2. 各 worktree で loop.mjs --worktree --commit を並列起動（maxParallel まで）
//     3. 完了（exit 0）したタスクだけを 1 つずつ現在のブランチにマージ。衝突したら abort して未完了扱い
//     4. 未完了タスクは worktree の PROGRESS.md だけを取り込む（コードは捨てて記憶だけ残す）
//     5. マージが 1 つでもあれば回帰検証（これまでに完了した全タスクの検証コマンドを累積で実行）。FAIL なら停止
//     6. 未完了が残れば次ラウンド（maxRounds まで）、無ければ次の Wave
//   全 Wave が終わったら統合検証（wave.config.json の verify.command）を実行。FAIL なら失敗扱い
//
//   統合検証を毎 Wave 後に回すと「まだ実装していない後続 Wave のテスト」で落ちるため、
//   途中は完了済みタスクの検証だけを回帰させ、全体のテストは最後にだけ回す（1 回目の試行で学んだ）。
//
// 使い方:  node bin/wave.mjs --wave <名前> [--agent "<cmd>"] [--max-rounds N] [--budget USD]
//                            [--dry-run] [--keep-worktrees]
//
// Wave は tasks/<名前>/wave.config.json で定義する。

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
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
  log(`${cfg.name}  リポジトリ=${toplevel}  ブランチ=${branch}  並列${cfg.maxParallel}  ラウンド上限${cfg.maxRounds}  予算$${cfg.maxCostUsd}`);
  cfg.waves.forEach((w, i) => console.log(`  Wave ${i + 1} ${w.name}: ${w.tasks.join(', ')}`));
  if (args.dryRun) return console.log('[wave] ドライラン終了');

  const stamp = nowStamp();
  const runDir = join(cfg.runsDir, stamp);
  mkdirSync(runDir, { recursive: true });
  // worktree は短いパスに置く（日時の秒以下を落として短くする）
  const wtBase = join(cfg.worktreeBase, `${cfg.name}-${stamp.slice(0, 16).replace(/\D/g, '')}`);
  mkdirSync(wtBase, { recursive: true });
  log(`worktree=${wtBase}`);
  const state = { name: cfg.name, branch, startedAt: new Date().toISOString(), totalCostUsd: 0, status: 'running', waves: [], merges: [] };
  const summaryPath = join(runDir, 'wave-summary.json');
  const save = () => writeFileSync(summaryPath, JSON.stringify(state, null, 2));

  const cleanup = (id, worktree) => {
    if (args.keepWorktrees) return;
    git(['worktree', 'remove', '--force', worktree], toplevel);
    git(['branch', '-D', `loop/${id}`], toplevel);
  };

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

      // 3. 完了したタスクだけを直列にマージ
      let mergedCount = 0;
      for (const r of results) {
        const t = { status: r.summary?.status ?? 'launch_failed', iterations: r.summary?.iteration ?? 0, costUsd: r.summary?.totalCostUsd ?? 0, commit: null };
        roundState.tasks[r.id] = t;
        const ahead = Number(git(['rev-list', '--count', `HEAD..loop/${r.id}`], toplevel).stdout || 0);
        if (t.status === 'complete') {
          if (ahead === 0) {
            t.merge = 'no_changes';
            waveState.done[r.id] = true;
            log(`  ${r.id}: 完了だがコミットなし（変更不要）`);
          } else {
            const m = git(['merge', '--no-ff', '--no-edit', '-m', `wave(${cfg.name}/${wave.name}): ${r.id} をマージ（${ahead} コミット）`, `loop/${r.id}`], toplevel);
            if (m.code === 0) {
              t.merge = 'merged';
              t.commit = git(['rev-parse', '--short', 'HEAD'], toplevel).stdout;
              waveState.done[r.id] = true;
              mergedCount++;
              state.merges.push({ wave: wave.name, round, id: r.id, commit: t.commit, commits: ahead });
              log(`  ${r.id}: マージ ${t.commit}（${ahead} コミット）`);
            } else {
              git(['merge', '--abort'], toplevel);
              t.merge = 'conflict';
              t.detail = tail(m.stdout + '\n' + m.stderr, 8);
              log(`  ${r.id}: マージ衝突 → abort。次ラウンドで再実行`);
            }
          }
        } else {
          t.merge = 'skipped';
          log(`  ${r.id}: 未完了（${t.status}）→ コードは捨て、進捗メモだけ取り込む`);
        }

        // 4. マージされなかったタスクは PROGRESS.md だけを救う（記憶は残し、コードは捨てる）
        if (!waveState.done[r.id] && ahead > 0) {
          const rel = taskProgressRelPath(r.id, toplevel);
          if (rel) {
            const show = git(['show', `loop/${r.id}:${rel}`], toplevel);
            const current = existsSync(join(toplevel, rel)) ? readFileSync(join(toplevel, rel), 'utf8') : '';
            if (show.code === 0 && show.stdout && show.stdout.trim() !== current.trim()) {
              writeFileSync(join(toplevel, rel), show.stdout.replace(/\r?\n/g, '\n') + '\n');
              git(['add', '--', rel], toplevel);
              const c = git(['commit', '-q', '-m', `wave(${cfg.name}/${wave.name}): ${r.id} の進捗メモを取り込み（コードは未完了のため破棄、ラウンド ${round}）`], toplevel);
              t.progressSalvaged = c.code === 0;
            }
          }
        }
        cleanup(r.id, r.worktree);
      }
      save();

      // 5. 回帰検証（マージが 1 つでもあれば）: これまでに完了した全タスクの検証コマンドを累積で回す。
      //    Wave 単位で verify が指定されていればそれを使う。全体の統合検証は全 Wave 終了後にだけ行う
      if (mergedCount > 0) {
        const completedSoFar = state.waves.flatMap((w) => Object.entries(w.done).filter(([, d]) => d).map(([id]) => id));
        const commands = wave.verify ? [wave.verify] : [...new Set(completedSoFar.map(taskVerifyCommand).filter(Boolean))];
        const results = [];
        let allOk = true;
        for (const command of commands) {
          const v = runShell(command, { cwd: cfg.repoDir, timeoutSec: cfg.verify.timeoutSec });
          results.push({ command, ok: v.ok, code: v.code, ms: v.ms, output: v.output });
          if (!v.ok) {
            allOk = false;
            break;
          }
        }
        writeFileSync(
          join(runDir, `regression-w${wi + 1}-r${round}.txt`),
          results.map((r) => `$ ${r.command}\nexit ${r.code} / ${r.ms}ms\n\n${r.output}\n`).join('\n' + '='.repeat(60) + '\n'),
        );
        roundState.regression = { ok: allOk, commands: results.map(({ command, ok, code, ms }) => ({ command, ok, code, ms })) };
        log(`  回帰検証 ${allOk ? 'PASS' : 'FAIL'}（完了済み ${completedSoFar.length} タスク / ${commands.length} コマンド）`);
        if (!allOk) {
          console.log(tail(results.at(-1).output, cfg.verify.tailLines));
          state.status = 'regression_failed';
          state.failedAt = { wave: wave.name, round };
          break outer;
        }
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
    const v = runShell(cfg.verify.command, { cwd: cfg.repoDir, timeoutSec: cfg.verify.timeoutSec });
    writeFileSync(join(runDir, 'integration.txt'), `$ ${cfg.verify.command}\nexit ${v.code} / ${v.ms}ms\n\n${v.output}`);
    state.integration = { ok: v.ok, code: v.code, ms: v.ms };
    log(`統合検証 ${v.ok ? 'PASS' : 'FAIL'} (exit ${v.code}, ${v.ms}ms)`);
    if (!v.ok) console.log(tail(v.output, cfg.verify.tailLines));
    state.status = v.ok ? 'complete' : 'integration_failed';
  }
  state.finishedAt = new Date().toISOString();
  save();
  if (!args.keepWorktrees) rmSync(wtBase, { recursive: true, force: true });
  git(['worktree', 'prune'], toplevel);

  const label = {
    complete: '完了（全 Wave のタスクをマージし統合検証 PASS）',
    regression_failed: '回帰検証 FAIL（マージ後に完了済みタスクの検証が落ちた）',
    integration_failed: '統合検証 FAIL（全 Wave 終了後の全体テストが落ちた）',
    budget_exceeded: '予算超過',
    max_rounds: 'ラウンド上限（未完了タスクあり）',
    worktree_failed: 'worktree 作成失敗（環境の問題。--worktree-base で短いパスを指定するなど）',
  }[state.status];
  log(`終了: ${label}  マージ${state.merges.length}件  累計$${state.totalCostUsd.toFixed(4)}  概要=${summaryPath}`);
  process.exit(state.status === 'complete' ? 0 : 1);
}

main();
