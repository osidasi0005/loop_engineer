import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce, render, keyToAction, formatScore } from '../src/view.mjs';
import { slide, spawn, createRng, canMove } from '../src/game.mjs';

const EMPTY = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
const base = (over = {}) => ({
  board: EMPTY(),
  score: 0,
  best: 0,
  phase: 'playing',
  achieved: false,
  spawned: null,
  ...over,
});

// spawn 後の盤面から「新しく置かれたマス」を探す（テスト側の再現用）
function findSpawned(before, after) {
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      if (before[r][c] === 0 && after[r][c] !== 0) return [r, c];
    }
  }
  return null;
}

// rng の呼び出し回数を数えるラッパー
function countingRng(seed) {
  const inner = createRng(seed);
  const fn = () => {
    fn.calls += 1;
    return inner();
  };
  fn.calls = 0;
  return fn;
}

// ---------- formatScore ----------
test('formatScore: 3 桁ごとにカンマ', () => {
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(999), '999');
  assert.equal(formatScore(1000), '1,000');
  assert.equal(formatScore(9856), '9,856');
  assert.equal(formatScore(1234567), '1,234,567');
});

// ---------- createGame ----------
test('createGame: 空盤面に spawn を 2 回、score 0、best は引数、phase playing', () => {
  const expected = (() => {
    const rng = createRng(42);
    return spawn(spawn(EMPTY(), rng), rng);
  })();
  const s = createGame(createRng(42), 14320);
  assert.deepEqual(s.board, expected);
  assert.equal(s.score, 0);
  assert.equal(s.best, 14320);
  assert.equal(s.phase, 'playing');
  assert.equal(s.achieved, false);
  assert.equal(s.spawned, null);
});

test('createGame: best を省略すると 0', () => {
  assert.equal(createGame(createRng(1)).best, 0);
});

// ---------- reduce: 移動 ----------
test('reduce(move): slide → spawn、score 加算、spawned は新しく置かれたマス', () => {
  const board = [
    [2, 2, 0, 0],
    [0, 4, 0, 4],
    [0, 0, 0, 0],
    [8, 0, 0, 0],
  ];
  const s = base({ board, score: 100, best: 500 });
  const next = reduce(s, 'left', createRng(7));

  const rng = createRng(7);
  const slid = slide(board, 'left');
  const expectedBoard = spawn(slid.board, rng);
  assert.deepEqual(next.board, expectedBoard);
  assert.equal(next.score, 100 + slid.gained);
  assert.equal(next.best, 500);
  assert.equal(next.phase, 'playing');
  assert.equal(next.achieved, false);
  assert.deepEqual(next.spawned, findSpawned(slid.board, expectedBoard));
});

test('reduce(move): 4 方向すべてが game.mjs の slide と一致する', () => {
  const board = [
    [2, 0, 2, 4],
    [0, 4, 0, 4],
    [2, 0, 0, 2],
    [0, 8, 8, 0],
  ];
  for (const dir of ['left', 'right', 'up', 'down']) {
    const next = reduce(base({ board }), dir, createRng(11));
    const rng = createRng(11);
    const slid = slide(board, dir);
    assert.deepEqual(next.board, spawn(slid.board, rng), dir);
    assert.equal(next.score, slid.gained, dir);
  }
});

test('reduce(move): 入力の状態を変更しない', () => {
  const s = base({ board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] });
  const snapshot = JSON.stringify(s);
  reduce(s, 'left', createRng(3));
  assert.equal(JSON.stringify(s), snapshot);
});

test('reduce(move): 動かない手は同じオブジェクトを返し、rng を消費しない', () => {
  const s = base({ board: [[2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] });
  const rng = countingRng(5);
  const next = reduce(s, 'left', rng);
  assert.equal(next, s);
  assert.equal(rng.calls, 0);
});

test('reduce(move): score が best を超えたら best も更新する', () => {
  const s = base({ board: [[4, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 100, best: 104 });
  const next = reduce(s, 'left', createRng(1));
  assert.equal(next.score, 108);
  assert.equal(next.best, 108);
});

// ---------- reduce: 勝ち ----------
test('reduce: 初めて 2048 ができたら phase won、achieved true', () => {
  const s = base({ board: [[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 1000, best: 1000 });
  const won = reduce(s, 'left', createRng(2));
  assert.equal(won.phase, 'won');
  assert.equal(won.achieved, true);
  assert.equal(won.board[0][0], 2048);
  assert.equal(won.score, 3048);
  assert.equal(won.best, 3048);
});

test('reduce: won 中の移動は無視（同じオブジェクト、rng 消費なし）、continue で playing に戻る', () => {
  const s = base({ board: [[2048, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], phase: 'won', achieved: true });
  const rng = countingRng(9);
  assert.equal(reduce(s, 'left', rng), s);
  assert.equal(reduce(s, 'down', rng), s);
  assert.equal(rng.calls, 0);
  const cont = reduce(s, 'continue', rng);
  assert.equal(cont.phase, 'playing');
  assert.equal(cont.achieved, true);
  assert.deepEqual(cont.board, s.board);
  assert.equal(rng.calls, 0);
});

test('reduce: 続行後に 4096 を作っても won にはならない', () => {
  const s = base({ board: [[2048, 2048, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], achieved: true });
  const next = reduce(s, 'left', createRng(4));
  assert.equal(next.board[0][0], 4096);
  assert.equal(next.phase, 'playing');
  assert.equal(next.achieved, true);
});

test('reduce: playing 中の continue は同じオブジェクトを返す', () => {
  const s = base({ board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] });
  assert.equal(reduce(s, 'continue', createRng(1)), s);
});

test('reduce: won で continue したとき動けなければ over になる', () => {
  const stuck = [
    [2, 4, 8, 16],
    [16, 8, 4, 2],
    [2, 4, 8, 16],
    [16, 32, 4, 2048],
  ];
  const s = base({ board: stuck, phase: 'won', achieved: true });
  assert.equal(reduce(s, 'continue', createRng(1)).phase, 'over');
});

// ---------- reduce: 負け ----------
test('reduce: 移動後に動けなくなったら phase over', () => {
  const board = [
    [2, 4, 8, 16],
    [16, 8, 4, 2],
    [2, 4, 8, 16],
    [0, 16, 32, 4],
  ];
  const rng = () => 0.5; // 空きは 1 つなので位置は決まり、0.5 < 0.9 で 2 が置かれる
  const next = reduce(base({ board, score: 41220, best: 41220 }), 'left', rng);
  assert.deepEqual(next.board[3], [16, 32, 4, 2]);
  assert.equal(canMove(next.board), false);
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.spawned, [3, 3]);
});

test('reduce: over 中は移動も continue も無視、new で best を引き継いだ新しいゲーム', () => {
  const stuck = [
    [2, 4, 8, 16],
    [16, 8, 4, 2],
    [2, 4, 8, 16],
    [16, 32, 4, 2],
  ];
  const s = base({ board: stuck, score: 500, best: 900, phase: 'over', achieved: true });
  const rng = countingRng(21);
  assert.equal(reduce(s, 'up', rng), s);
  assert.equal(reduce(s, 'continue', rng), s);
  assert.equal(rng.calls, 0);
  const fresh = reduce(s, 'new', createRng(21));
  assert.deepEqual(fresh, createGame(createRng(21), 900));
  assert.equal(fresh.achieved, false);
});

test('reduce: playing 中の new も best を引き継ぐ', () => {
  const s = base({ board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 300, best: 300 });
  const fresh = reduce(s, 'new', createRng(8));
  assert.equal(fresh.best, 300);
  assert.equal(fresh.score, 0);
});

test('reduce: quit は同じオブジェクトを返し、不明な操作は例外', () => {
  const s = base();
  assert.equal(reduce(s, 'quit', createRng(1)), s);
  assert.throws(() => reduce(s, 'jump', createRng(1)));
});

// ---------- keyToAction ----------
test('keyToAction: 矢印・WASD・N・Enter・Q/Esc の対応', () => {
  const table = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    n: 'new', N: 'new',
    Enter: 'continue',
    q: 'quit', Q: 'quit', Escape: 'quit',
  };
  for (const [key, action] of Object.entries(table)) {
    assert.equal(keyToAction(key), action, key);
  }
  assert.equal(keyToAction('x'), null);
  assert.equal(keyToAction(' '), null);
  assert.equal(keyToAction('Tab'), null);
});

// ---------- render ----------
const tileLines = (board, spawned) => {
  const lines = [];
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const v = board[r][c];
      if (v === 0) {
        lines.push('<div class="tile empty"></div>');
      } else {
        const isNew = spawned && spawned[0] === r && spawned[1] === c;
        lines.push(`<div class="tile v${v} d${String(v).length}${isNew ? ' new' : ''}">${v}</div>`);
      }
    }
  }
  return lines;
};

test('render(playing): hud / boardwrap / board / 16 タイル / foot の順、末尾改行なし', () => {
  const board = [
    [2, 0, 4, 0],
    [0, 0, 0, 0],
    [16, 128, 0, 2048],
    [0, 0, 0, 0],
  ];
  const s = base({ board, score: 12, best: 14320, spawned: [0, 2] });
  const expected = [
    '<div class="hud"><span class="label">SCORE</span><span class="score">12</span><span class="best">BEST 14,320</span></div>',
    '<div class="boardwrap">',
    '<div class="board">',
    '<div class="tile v2 d1">2</div>',
    '<div class="tile empty"></div>',
    '<div class="tile v4 d1 new">4</div>',
    '<div class="tile empty"></div>',
    '<div class="tile empty"></div>',
    '<div class="tile empty"></div>',
    '<div class="tile empty"></div>',
    '<div class="tile empty"></div>',
    '<div class="tile v16 d2">16</div>',
    '<div class="tile v128 d3">128</div>',
    '<div class="tile empty"></div>',
    '<div class="tile v2048 d4">2048</div>',
    '<div class="tile empty"></div>',
    '<div class="tile empty"></div>',
    '<div class="tile empty"></div>',
    '<div class="tile empty"></div>',
    '</div>',
    '</div>',
    '<div class="foot"><span>ARROWS / WASD: MOVE</span><span>N: NEW · Q: QUIT</span></div>',
  ].join('\n');
  assert.equal(render(s), expected);
});

test('render(playing, achieved): SCORE の中に star、spawned が null なら new なし', () => {
  const board = [
    [2, 4, 32, 2],
    [0, 16, 64, 8],
    [0, 2, 128, 256],
    [0, 0, 2048, 4096],
  ];
  const s = base({ board, score: 38904, best: 38904, achieved: true, spawned: null });
  const expected = [
    '<div class="hud"><span class="label">SCORE<span class="star">★</span></span><span class="score">38,904</span><span class="best">BEST 38,904</span></div>',
    '<div class="boardwrap">',
    '<div class="board">',
    ...tileLines(board, null),
    '</div>',
    '</div>',
    '<div class="foot"><span>ARROWS / WASD: MOVE</span><span>N: NEW · Q: QUIT</span></div>',
  ].join('\n');
  assert.equal(render(s), expected);
  assert.ok(!render(s).includes(' new'));
});

test('render(won): board の後ろに veil won、foot は ENTER: CONTINUE / N: NEW', () => {
  const board = [
    [2, 8, 16, 2],
    [4, 32, 128, 4],
    [0, 64, 512, 32],
    [0, 0, 256, 2048],
  ];
  const s = base({ board, score: 20312, best: 20312, phase: 'won', achieved: true, spawned: [2, 0] });
  const expected = [
    '<div class="hud"><span class="label">SCORE<span class="star">★</span></span><span class="score">20,312</span><span class="best">BEST 20,312</span></div>',
    '<div class="boardwrap">',
    '<div class="board">',
    ...tileLines(board, null),
    '</div>',
    '<div class="veil won"><div class="title">2048!</div><button class="btn primary" data-action="continue">続ける　Enter</button><button class="btn" data-action="new">新しいゲーム　N</button></div>',
    '</div>',
    '<div class="foot"><span>ENTER: CONTINUE</span><span>N: NEW</span></div>',
  ].join('\n');
  assert.equal(render(s), expected);
});

test('render(over): veil over に得点、best と同点なら「・最高記録」、foot は N: NEW / Q: QUIT', () => {
  const board = [
    [2, 8, 2, 4],
    [4, 16, 64, 8],
    [8, 32, 128, 256],
    [2, 4, 2048, 4096],
  ];
  const s = base({ board, score: 41220, best: 41220, phase: 'over', achieved: true, spawned: [3, 0] });
  const expected = [
    '<div class="hud"><span class="label">SCORE<span class="star">★</span></span><span class="score">41,220</span><span class="best">BEST 41,220</span></div>',
    '<div class="boardwrap">',
    '<div class="board">',
    ...tileLines(board, null),
    '</div>',
    '<div class="veil over"><div class="title">Game Over</div><div class="sub">41,220 点・最高記録</div><button class="btn primary" data-action="new">もう一度　N</button></div>',
    '</div>',
    '<div class="foot"><span>N: NEW</span><span>Q: QUIT</span></div>',
  ].join('\n');
  assert.equal(render(s), expected);
});

test('render(over): best に届かなければ「・最高記録」を付けない、achieved false なら star なし', () => {
  const board = [
    [2, 8, 2, 4],
    [4, 16, 64, 8],
    [8, 32, 128, 256],
    [2, 4, 8, 4],
  ];
  const s = base({ board, score: 1500, best: 9000, phase: 'over', achieved: false, spawned: null });
  const out = render(s);
  assert.ok(out.includes('<div class="sub">1,500 点</div>'));
  assert.ok(!out.includes('最高記録'));
  assert.ok(!out.includes('star'));
  assert.ok(out.startsWith('<div class="hud"><span class="label">SCORE</span>'));
});

test('render(over): 得点 0 なら「最高記録」を付けない', () => {
  const board = [
    [2, 8, 2, 4],
    [4, 16, 64, 8],
    [8, 32, 128, 256],
    [2, 4, 8, 4],
  ];
  const s = base({ board, score: 0, best: 0, phase: 'over' });
  assert.ok(render(s).includes('<div class="sub">0 点</div>'));
});

test('render は純関数で入力を変更しない', () => {
  const s = base({ board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], spawned: [0, 0] });
  const snapshot = JSON.stringify(s);
  render(s);
  assert.equal(JSON.stringify(s), snapshot);
});
