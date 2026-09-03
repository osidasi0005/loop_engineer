// mock-agent.mjs — Claude を呼ばずにループの動きを確認するための偽エージェント
//
// ランナーと同じ契約で動く:
//   - stdin からプロンプトを受け取る
//   - 作業ディレクトリ（cwd）でファイルを書く
//   - stdout に claude -p --output-format json と同じ形の JSON を返す
//
// 振る舞い（わざと 1 回失敗して、ループが失敗を拾って直す様子を見せる）:
//   検証 FAIL & src/slugify.mjs が無い → 不完全な実装を書く
//   検証 FAIL & src/slugify.mjs がある → 検証出力を見て正しい実装に直す
//   検証 PASS                          → 完了条件を確認し、完了マーカーを返す

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';

const prompt = readFileSync(0, 'utf8');
const iteration = Number(prompt.match(/反復 (\d+)\//)?.[1] ?? 0);
const verifyPassed = /検証: PASS/.test(prompt);
const doneMarker = prompt.match(/末尾に (<promise>[^<]+<\/promise>)/)?.[1] ?? '<promise>COMPLETE</promise>';
const progressFile = process.env.LOOP_PROGRESS_FILE;

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
  note([
    `やったこと: 失敗していたテスト（${failing.join(' / ') || '不明'}）を直した`,
    '分かったこと: 先頭末尾のハイフン除去と NFD 正規化によるアクセント除去が抜けていた',
    '次にやるべきこと: 検証が通ったら完了条件を確認する',
  ]);
  result = `失敗していたケースを修正しました: ${failing.join(', ')}`;
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
