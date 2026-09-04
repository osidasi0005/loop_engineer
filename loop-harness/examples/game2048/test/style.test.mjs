import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const probe = join(root, 'test', 'helpers', 'probe.cjs');
const electronPath = createRequire(import.meta.url)('electron');

/** probe.cjs を起動し、PROBE 行の JSON を返す */
function runProbe(size, state) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electronPath, [probe, String(size), JSON.stringify(state)], {
    encoding: 'utf8',
    timeout: 45000,
    env,
    windowsHide: true,
  });
  const line = (r.stdout ?? '').split(/\r?\n/).find((l) => l.startsWith('PROBE '));
  assert.ok(line, `PROBE 行が無い (exit ${r.status})\n${(r.stderr ?? '').slice(-1500)}`);
  const data = JSON.parse(line.slice(6));
  assert.ok(!data.error, `probe エラー: ${data.error}`);
  return data;
}

const INK = 'rgb(42, 42, 42)';
const PAPER = 'rgb(251, 250, 245)';
const WHITE = 'rgb(255, 255, 255)';
const CREAM = 'rgb(233, 228, 214)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const px = (s) => parseFloat(s);
const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} (期待 ${expected}±${tol})`);

const SIZE = 600;
const PLAYING = {
  board: [
    [2, 16, 32, 128],
    [256, 2048, 4096, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  score: 9856,
  best: 14320,
  phase: 'playing',
  achieved: true,
  spawned: [0, 0],
};

let p;
before(() => {
  p = runProbe(SIZE, PLAYING);
});

test('タイルの 3 段階: 2〜16 は白、32〜128 は生成り、256 以上は墨に白文字', () => {
  assert.equal(p.v2['background-color'], WHITE, 'v2 の背景');
  assert.equal(p.v2.color, INK, 'v2 の文字');
  assert.equal(p.v16['background-color'], WHITE, 'v16 の背景');
  assert.equal(p.v32['background-color'], CREAM, 'v32 の背景');
  assert.equal(p.v128['background-color'], CREAM, 'v128 の背景');
  assert.equal(p.v128.color, INK, 'v128 の文字');
  assert.equal(p.v256['background-color'], INK, 'v256 の背景');
  assert.equal(p.v256.color, PAPER, 'v256 の文字');
  assert.equal(p.v4096['background-color'], INK, 'v4096 の背景');
  assert.equal(p.v4096.color, PAPER, 'v4096 の文字');
});

test('空きマスは点線枠で塗りなし、値のあるマスは実線の墨枠', () => {
  assert.equal(p.empty['background-color'], TRANSPARENT);
  assert.equal(p.empty['border-style'], 'dashed');
  assert.equal(p.v2['border-style'], 'solid');
  assert.equal(p.v2['border-color'], INK);
  assert.equal(p.v256['border-style'], 'solid');
});

test('2048 だけ二重枠（box-shadow あり）、他は無し', () => {
  assert.notEqual(p.v2048['box-shadow'], 'none');
  assert.equal(p.v256['box-shadow'], 'none');
  assert.equal(p.v4096['box-shadow'], 'none');
});

test('数字の大きさは桁数ごとに盤面幅の比率（1〜2 桁 7.5%、3 桁 6.5%、4 桁 5.5%）', () => {
  near(px(p.v2['font-size']), SIZE * 0.075, 1, 'd1');
  near(px(p.v16['font-size']), SIZE * 0.075, 1, 'd2');
  near(px(p.v128['font-size']), SIZE * 0.065, 1, 'd3');
  near(px(p.v2048['font-size']), SIZE * 0.055, 1, 'd4');
});

test('盤面は size 四方、タイルは正方形で 4 列が盤面に収まる', () => {
  near(p.board.rect.width, SIZE, 1, '盤面の幅');
  near(p.board.rect.height, SIZE, 1, '盤面の高さ');
  near(p.v16.rect.width, p.v16.rect.height, 1, 'タイルが正方形');
  near(p.v16.rect.width, SIZE * 0.2172, 2, 'タイルの幅');
  near(p.v2.rect.left, SIZE * 0.0367, 1, '左余白');
});

test('HUD: SCORE の数字と BEST の間に隙間があり、はみ出さない', () => {
  const gap = p.best.rect.left - p.score.rect.right;
  assert.ok(gap >= SIZE * 0.015, `score と best の隙間が狭い: ${gap}px`);
  assert.ok(p.best.rect.right <= SIZE - SIZE * 0.03 + 1, `best が右余白に食い込む: ${p.best.rect.right}`);
  assert.ok(p.label.rect.left >= SIZE * 0.03, `label が左余白に食い込む: ${p.label.rect.left}`);
  assert.ok(p.score.rect.bottom <= p.hud.rect.bottom + 1, 'score が hud からはみ出す');
  assert.ok(p.hud.rect.top >= 0);
});

test('縦の積み上げ: hud → board → foot が重ならず、クライアント領域に収まる（スクロール無し）', () => {
  assert.ok(p.board.rect.top >= p.hud.rect.bottom - 1, 'board が hud に重なる');
  assert.ok(p.foot.rect.top >= p.board.rect.bottom - 1, 'foot が board に重なる');
  assert.ok(p.foot.rect.bottom <= p.inner[1] + 1, `foot が窓の下からはみ出す: ${p.foot.rect.bottom} > ${p.inner[1]}`);
  assert.ok(p.scrollWidth <= p.inner[0], `横スクロールが発生: ${p.scrollWidth} > ${p.inner[0]}`);
  assert.ok(p.scrollHeight <= p.inner[1], `縦スクロールが発生: ${p.scrollHeight} > ${p.inner[1]}`);
});

test('紙の色と等幅フォント、出現アニメーション', () => {
  assert.equal(p.body['background-color'], PAPER);
  assert.match(p.body['font-family'], /Cascadia Mono|Consolas|monospace/);
  assert.ok(p.newTile, '.tile.new が無い');
  assert.notEqual(p.newTile['animation-name'], 'none', '出現アニメーションが無い');
});

test('幕（won）: 盤面の余白の内側に重なり、タイトルとボタンが見える', () => {
  const won = runProbe(SIZE, { ...PLAYING, phase: 'won', spawned: null });
  assert.ok(won.veil, 'veil が無い');
  near(won.veil.rect.left, SIZE * 0.0367, 1, 'veil 左');
  near(won.veil.rect.top, won.board.rect.top + SIZE * 0.0367, 1, 'veil 上');
  near(won.veil.rect.width, SIZE * (1 - 0.0367 * 2), 2, 'veil 幅');
  near(px(won.title['font-size']), SIZE * 0.10, 1, 'title');
  assert.equal(won.btn['background-color'], INK);
  assert.equal(won.btn.color, PAPER);
  assert.ok(won.btn.rect.top > won.title.rect.bottom - 1, 'ボタンがタイトルの下にある');
});

test('size 400 でも比率が保たれる', () => {
  const q = runProbe(400, PLAYING);
  near(q.board.rect.width, 400, 1, '盤面');
  near(px(q.v2['font-size']), 400 * 0.075, 1, 'd1');
  assert.ok(q.scrollHeight <= q.inner[1], '縦スクロール');
  assert.equal(q.v2['background-color'], WHITE);
});
