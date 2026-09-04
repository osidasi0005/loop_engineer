// mock-agent-textkit.mjs — wave.mjs の動作確認用の偽エージェント（textkit 例題専用）
//
// ランナーとの契約は mock-agent.mjs と同じ（stdin にプロンプト、cwd で作業、stdout に JSON）。
// プロンプト中の仕様ファイルのパス（tasks/<id>/PROMPT.md）からタスクを判別し、決まった実装を書く。
//
//   textkit-03-wordcount は 1 回目をわざと間違え、worktree 内の反復で直る様子を見せる。
//   MOCK_CONFLICT=1 を付けると 03 と 04 が同じ src/CHANGELOG.md に別内容を書き、マージ衝突を起こす。
//   衝突したタスクは次のラウンドで新しい HEAD から再実行され、そのときは既存の行に追記して衝突を避ける。
//   MOCK_BREAK=1 を付けると 04 が契約（WORD_SEPARATOR）を壊す。04 自身のテストは通るが回帰検証で 01 のテストが落ち、
//   ランナーの fix ループが起動する。fix のモックは契約を元に戻す。
//   MOCK_BREAK=2 は同じ破壊をするが fix のモックは何もしない → 差し戻し経路に入る。
//   差し戻し後の再実行では、進捗メモに「差し戻し」の記録があるのを見て契約を壊さない。
//   MOCK_BREAK=3 は =2 と同じだが、差し戻し後の再実行で 04 が <blocked> を申告する → wave は 04 を再実行せずに止める。

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';

const prompt = readFileSync(0, 'utf8');
const iteration = Number(prompt.match(/反復 (\d+)\//)?.[1] ?? 0);
const verifyPassed = /検証: PASS/.test(prompt);
const doneMarker = prompt.match(/末尾に (<promise>[^<]+<\/promise>)/)?.[1] ?? '<promise>COMPLETE</promise>';
const isFix = /^# 回帰修正:/m.test(prompt);
const taskId = isFix ? 'fix' : (prompt.match(/tasks[\\/]([^\\/\s)]+)[\\/]PROMPT\.md/)?.[1] ?? 'unknown');
const progressFile = process.env.LOOP_PROGRESS_FILE;
const conflict = process.env.MOCK_CONFLICT === '1';
const breakMode = process.env.MOCK_BREAK ?? '';
const wasReverted = /差し戻し/.test(prompt); // 進捗メモに差し戻しの記録がある = 前ラウンドで契約を壊した

const contractSource = `/** truncate の既定最大長 */
export const TRUNCATE_DEFAULT_MAX = 20;
/** 切り詰め時に末尾へ付ける省略記号 */
export const ELLIPSIS = '…';
/** 単語の区切り（空白の連続） */
export const WORD_SEPARATOR = /\\s+/;
`;

function note(lines) {
  if (!progressFile) return;
  appendFileSync(progressFile, `\n### 反復 ${iteration}\n${lines.map((l) => `- ${l}`).join('\n')}\n`);
}
function write(file, body) {
  mkdirSync('src', { recursive: true });
  writeFileSync(file, body);
}
function changelog(line) {
  const f = 'src/CHANGELOG.md';
  if (existsSync(f)) appendFileSync(f, `- ${line}\n`);
  else writeFileSync(f, `# 変更履歴\n\n- ${line}\n`);
}

const impl = {
  'textkit-01-contract': () => {
    write('src/contract.mjs', contractSource);
    return ['やったこと: src/contract.mjs に定数 3 つを定義', '次にやるべきこと: 検証が通ったら完了条件を確認'];
  },
  // ランナーが生成した fix タスク。MOCK_BREAK=1 なら契約を戻して直す。=2 なら直せずに終わる（差し戻し経路の確認用）。
  // =2 のときは本物の fix エージェントと同じく、仕様の矛盾を <spec-issue> で報告し、<blocked> で「実装側では直せない」と申告する
  // （loop.mjs はこれで即停止し、fix の 2 反復目を回さない）
  fix: () => {
    if (breakMode === '2' || breakMode === '3') {
      extra =
        '\n\n<spec-issue>test/contract.test.mjs:12 は WORD_SEPARATOR が /\\s+/ であることを要求し、textkit-04-truncate の仕様は単一スペースを要求している。同じ定数に別の値を求めており実装側では両立できない。</spec-issue>' +
        '\n<blocked>test/contract.test.mjs:12 と textkit-04-truncate の仕様が同じ定数 WORD_SEPARATOR に別の値を要求しており、test/ 変更禁止の下では直せない。人間が契約を決める必要がある。</blocked>';
      return ['やったこと: 原因を調べたが、契約の変更が必要に見えるため修正しなかった', '次にやるべきこと: 差し戻して元タスクで直す'];
    }
    write('src/contract.mjs', contractSource);
    return ['やったこと: src/contract.mjs の WORD_SEPARATOR を /\\s+/ に戻した', '分かったこと: 直近のマージが契約を単一スペースに変えていた', '次にやるべきこと: 再検証'];
  },
  'textkit-02-slugify': () => {
    write(
      'src/slugify.mjs',
      `/** スラッグの最大文字数（slugify 固有のため、このモジュールに置く） */
const MAX_SLUG_LENGTH = 50;

/** 文字列を URL スラッグに変換する（小文字化・アクセント除去・非英数字をハイフンに）。50 文字を超えたら切り詰め、末尾のハイフンを除く */
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}
`,
    );
    return ['やったこと: src/slugify.mjs を実装', '次にやるべきこと: 検証が通ったら完了条件を確認'];
  },
  'textkit-03-wordcount': () => {
    if (!existsSync('src/wordcount.mjs')) {
      write(
        'src/wordcount.mjs',
        `import { WORD_SEPARATOR } from './contract.mjs';
/** 単語数を数える（暫定版） */
export function wordCount(text) {
  return text.split(WORD_SEPARATOR).length;
}
`,
      );
      if (conflict) changelog('wordCount を追加（暫定）');
      return ['やったこと: src/wordcount.mjs の初版', '次にやるべきこと: 落ちるケースを直す'];
    }
    write(
      'src/wordcount.mjs',
      `import { WORD_SEPARATOR } from './contract.mjs';
/** 単語数を数える。空白だけなら 0 */
export function wordCount(text) {
  const t = text.trim();
  return t === '' ? 0 : t.split(WORD_SEPARATOR).length;
}
`,
    );
    return [
      'やったこと: 空文字と先頭末尾の空白の扱いを直した',
      '分かったこと: trim してから分割しないと空要素を数えてしまう',
      '次にやるべきこと: 検証が通ったら完了条件を確認',
    ];
  },
  'textkit-04-truncate': () => {
    write(
      'src/truncate.mjs',
      `import { TRUNCATE_DEFAULT_MAX, ELLIPSIS } from './contract.mjs';
/** 最大長を超える文字列を、省略記号込みで最大長に収める */
export function truncate(text, max = TRUNCATE_DEFAULT_MAX) {
  if (text.length <= max) return text;
  return text.slice(0, max - ELLIPSIS.length) + ELLIPSIS;
}
`,
    );
    if (conflict) changelog('truncate を追加');
    if (breakMode === '3' && wasReverted) {
      // 差し戻された後、本物のエージェントがしたのと同じく「同じ変更の再投入はしない」と <blocked> で申告する
      // （wave はこのタスクを再実行せずに止める）。コードは書かない
      extra = '\n\n<blocked>ラウンド 1 で仕様どおり実装した結果が回帰検証で差し戻された。仕様（WORD_SEPARATOR を単一スペースに）と test/contract.test.mjs が矛盾しており、同じ変更を再投入しても同じ結果になる。人間が契約を決める必要がある。</blocked>';
      return ['やったこと: 差し戻しの記録を読み、同じ変更は再投入しなかった', '次にやるべきこと: 人間が契約（WORD_SEPARATOR）を決める'];
    }
    if (breakMode && !wasReverted) {
      // 契約を壊す（自分のテストには影響しない）。差し戻された後の再実行では壊さない
      write('src/contract.mjs', contractSource.replace('/\\s+/', '/ /'));
      return ['やったこと: src/truncate.mjs を実装。ついでに contract.mjs の WORD_SEPARATOR を単一スペースに「整理」した', '次にやるべきこと: 検証が通ったら完了条件を確認'];
    }
    return ['やったこと: src/truncate.mjs を実装' + (wasReverted ? '（前回の差し戻しを踏まえ、contract.mjs には触れていない）' : ''), '次にやるべきこと: 検証が通ったら完了条件を確認'];
  },
  'textkit-05-index': () => {
    write(
      'src/index.mjs',
      `export { slugify } from './slugify.mjs';
export { wordCount } from './wordcount.mjs';
export { truncate } from './truncate.mjs';
export { TRUNCATE_DEFAULT_MAX, ELLIPSIS, WORD_SEPARATOR } from './contract.mjs';
import { slugify } from './slugify.mjs';
import { wordCount } from './wordcount.mjs';
import { truncate } from './truncate.mjs';

/** 見出し用の要約: slug / 単語数 / 切り詰めたタイトル */
export function summarize(text) {
  return { slug: slugify(text), words: wordCount(text), title: truncate(text) };
}
`,
    );
    return ['やったこと: src/index.mjs で再エクスポートと summarize を実装', '次にやるべきこと: 検証が通ったら完了条件を確認'];
  },
};

let result;
let extra = ''; // fix モックが <spec-issue> / <blocked> を足すための置き場
if (verifyPassed) {
  note(['やったこと: 完了条件を確認（テスト PASS、依存なし、test/ 未変更、JSDoc あり）', '次にやるべきこと: なし']);
  result = `完了条件をすべて確認しました。\n\n${doneMarker}`;
} else if (impl[taskId]) {
  note(impl[taskId]());
  result = `${taskId} を実装しました。${extra}`;
} else {
  note([`分かったこと: タスク ${taskId} の実装を知らない（モックの対象外）`]);
  result = `モックはタスク ${taskId} を扱えません。`;
}

process.stdout.write(
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result,
    num_turns: 1,
    total_cost_usd: 0,
    session_id: `mock-${taskId}-${iteration}`,
  }),
);
