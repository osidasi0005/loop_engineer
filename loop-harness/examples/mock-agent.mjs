// mock-agent.mjs — Claude を呼ばずにループの動きを確認するための偽エージェント
//
// ランナーと同じ契約で動く:
//   - stdin からプロンプトを受け取る
//   - 作業ディレクトリ（cwd）でファイルを書く
//   - stdout に claude -p --output-format json と同じ形の JSON を返す
//
// 振る舞い（わざと 1 回失敗して、ループが失敗を拾って直す様子を見せる）:
//   検証 FAIL & src/slugify.mjs が無い → 不完全な実装を書く
//   検証 FAIL & src/slugify.mjs がある → 検証出力を見て正しい実装に直し、検証コマンドを自分で実行して
//                                        PASS なら完了条件を確認して完了マーカーを返す（ランナーが次の反復で確定する）
//   検証 PASS                          → 完了条件を確認し、完了マーカーを返す（本物の Claude が反復 2 で
//                                        マーカーを書かなかったときに通る経路。モックの筋書きでは通らない）
//   MOCK_SPEC_ISSUE=1                  → 仕様の抜けを <spec-issue> で報告する経路も見せる

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const prompt = readFileSync(0, 'utf8');
const iteration = Number(prompt.match(/反復 (\d+)\//)?.[1] ?? 0);
const verifyPassed = /検証: PASS/.test(prompt);
const doneMarker = prompt.match(/末尾に (<promise>[^<]+<\/promise>)/)?.[1] ?? '<promise>COMPLETE</promise>';
const verifyCommand = prompt.match(/直前の検証結果（コマンド: `([^`]+)`）/)?.[1] ?? null;
const progressFile = process.env.LOOP_PROGRESS_FILE;
const specIssue = process.env.MOCK_SPEC_ISSUE === '1'
  ? '\n\n<spec-issue>仕様は「先頭末尾のハイフンを除去」とだけ書いているが、テストは「連続するハイフンも 1 つにまとめる」ことを期待している。テストに合わせて実装した。仕様に明記した方がよい。</spec-issue>'
  : '';

// 検証コマンドを自分で実行する（本物のエージェントが「直した → 自分でテストを回す」に相当）
function selfVerify() {
  if (!verifyCommand) return false;
  const r = spawnSync(verifyCommand, { shell: true, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return r.status === 0;
}

const naive = `/** 文字列を URL スラッグに変換する（暫定版） */
export function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
`;

const correct = `/**
 * 文字列を URL スラッグに変換する。
 * 小文字化・アクセント除去・非英数字の連続をハイフン 1 つに・先頭末尾のハイフン除去。
 */
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
`;

function note(lines) {
  if (!progressFile) return;
  appendFileSync(progressFile, `\n### 反復 ${iteration}\n${lines.map((l) => `- ${l}`).join('\n')}\n`);
}

let result;
if (verifyPassed) {
  note(['やったこと: 完了条件 1〜4 を確認（テスト PASS、依存なし、test/ 未変更、JSDoc あり）', '次にやるべきこと: なし']);
  result = `完了条件をすべて確認しました。\n\n${doneMarker}`;
} else if (!existsSync('src/slugify.mjs')) {
  mkdirSync('src', { recursive: true });
  writeFileSync('src/slugify.mjs', naive);
  note(['やったこと: src/slugify.mjs に最初の実装を書いた', '分かったこと: テストが import エラーだったので、まず関数を存在させた', '次にやるべきこと: テストを回して落ちるケースを直す']);
  result = 'slugify の初版を実装しました。次の検証で落ちるケースがあれば直します。';
} else {
  // node:test の失敗行 「✖ テスト名 (12.3ms)」 からテスト名を拾う（TAP 形式の not ok にも対応）
  const failing = [
    ...new Set(
      [...prompt.matchAll(/^\s*(?:✖|not ok \d+ -) (.+?)(?: \(\d[\d.]*m?s\))?\s*$/gm)]
        .map((m) => m[1].trim())
        .filter((name) => !/\.test\.mjs$/.test(name) && !/^failing tests:$/.test(name)),
    ),
  ];
  writeFileSync('src/slugify.mjs', correct);
  const passed = selfVerify();
  if (passed) {
    note([
      `やったこと: 失敗していたテスト（${failing.join(' / ') || '不明'}）を直し、検証コマンドを自分で実行して PASS を確認。完了条件 1〜4 を確認（テスト PASS、依存なし、test/ 未変更、JSDoc あり）`,
      '分かったこと: 先頭末尾のハイフン除去と NFD 正規化によるアクセント除去が抜けていた',
      '次にやるべきこと: なし（ランナーの検証で確定を待つ）',
    ]);
    result = `失敗していたケースを修正し、検証コマンドを自分で実行して PASS しました: ${failing.join(', ')}\n完了条件をすべて確認しました。${specIssue}\n\n${doneMarker}`;
  } else {
    note([
      `やったこと: 失敗していたテスト（${failing.join(' / ') || '不明'}）を直した（自分で実行した検証はまだ FAIL）`,
      '分かったこと: 先頭末尾のハイフン除去と NFD 正規化によるアクセント除去が抜けていた',
      '次にやるべきこと: 検証が通ったら完了条件を確認する',
    ]);
    result = `失敗していたケースを修正しました: ${failing.join(', ')}${specIssue}`;
  }
}

process.stdout.write(
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result,
    num_turns: 1,
    total_cost_usd: 0,
    session_id: `mock-${iteration}`,
  }),
);
