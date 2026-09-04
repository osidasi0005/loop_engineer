// spec-issues.mjs — エージェントが <spec-issue>…</spec-issue> で報告した「仕様の抜け・矛盾」の抽出とまとめ
//
// loop.mjs と wave.mjs の両方が使う。
//   extractSpecIssues(text)   応答から指摘を抜き出す
//   groupSpecIssues(issues)   同じ場所（ファイル:行）を指している指摘を 1 つにまとめる
//
// まとめ方: 指摘の本文から `path/to/file.ext:12` の形の参照を拾い、参照を 1 つでも共有する指摘同士を同じグループにする
// （連結成分）。参照が無い指摘は本文の先頭 60 文字を正規化したものをキーにする。
// textkit-revert の本物の実行では 14 件のうち実質 5 件程度だった（同じ矛盾を反復 1 と 2、タスクと fix ループが繰り返す）。
// まとめは「見落とさない」ための表示上の工夫で、元の指摘はすべて summary.json に残す。

export function extractSpecIssues(text) {
  return [...String(text ?? '').matchAll(/<spec-issue>([\s\S]*?)<\/spec-issue>/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
}

// `src/contract.mjs:4`、`test/contract.test.mjs:6-7`、`test\index.test.mjs:15` などを拾う。行番号は範囲の先頭だけを使う
const REF_RE = /([A-Za-z0-9_][A-Za-z0-9_./\\-]*\.(?:mjs|cjs|js|ts|tsx|jsx|json|md|css|html|py|rs|go|java|yml|yaml|toml)):(\d+)/g;

export function refsOf(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(REF_RE)) out.add(`${m[1].split('\\').join('/')}:${m[2]}`);
  return [...out].sort();
}

const textKey = (text) =>
  String(text ?? '')
    .replace(/[*`#\s]+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 60);

// issues: [{ source?, iteration, text }]
// 戻り値: [{ refs, count, sources: ['source 反復 N', …], text（代表: 最も長い本文）, issues }]
export function groupSpecIssues(issues) {
  const parent = issues.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[b] = a;
  };
  const byRef = new Map();
  const byKey = new Map();
  issues.forEach((issue, i) => {
    const refs = refsOf(issue.text);
    if (refs.length) {
      for (const r of refs) {
        if (byRef.has(r)) union(i, byRef.get(r));
        else byRef.set(r, i);
      }
    } else {
      const k = textKey(issue.text);
      if (byKey.has(k)) union(i, byKey.get(k));
      else byKey.set(k, i);
    }
  });
  const groups = new Map();
  issues.forEach((issue, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(issue);
  });
  return [...groups.values()].map((members) => {
    const refs = [...new Set(members.flatMap((m) => refsOf(m.text)))].sort();
    const rep = members.reduce((a, b) => (String(b.text).length > String(a.text).length ? b : a));
    const sources = [...new Set(members.map((m) => `${m.source ? `${m.source} ` : ''}反復 ${m.iteration}`))];
    return { refs, count: members.length, sources, text: rep.text, issues: members };
  });
}

// 端末表示用: 1 行にたたみ、長ければ切る
export const oneLine = (text, max = 400) => {
  const s = String(text ?? '').replace(/\s*\n\s*/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

// 終了時の列挙（loop.mjs / wave.mjs 共通）。log は 1 行を出す関数
export function printSpecIssues(issues, log, { fullPath } = {}) {
  if (!issues.length) return;
  const groups = groupSpecIssues(issues);
  const summary = groups.length < issues.length ? `${issues.length} 件（同じ場所への指摘をまとめると ${groups.length} 件）` : `${issues.length} 件`;
  log(`仕様への指摘 ${summary}（エージェントが <spec-issue> で報告。仕様を見直してから再実行する${fullPath ? `。全文は ${fullPath}` : ''}）:`);
  for (const g of groups) {
    const where = g.refs.length ? ` ${g.refs.join(', ')}` : '';
    log(`  - [${g.sources.join(' / ')}]${where}`);
    log(`    ${oneLine(g.text)}`);
  }
}
