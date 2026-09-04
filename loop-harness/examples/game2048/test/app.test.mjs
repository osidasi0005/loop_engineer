import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const appDir = join(root, 'app');
const read = (name) => readFileSync(join(appDir, name), 'utf8');

// electron パッケージは require すると実行ファイルのパス（文字列）を返す
const electronPath = createRequire(import.meta.url)('electron');

/**
 * `electron . --smoke --user-data <dir>` を起動し、stdout / exit code を返す。
 * ELECTRON_RUN_AS_NODE が親環境に残っていると Electron が素の Node として動くので必ず外す。
 */
function runSmoke(userData) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electronPath, [root, '--smoke', '--user-data', userData], {
    encoding: 'utf8',
    timeout: 45000,
    env,
    windowsHide: true,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

const smokeLines = (stdout) => stdout.split(/\r?\n/).filter((l) => l.startsWith('SMOKE '));
const freshUserData = () => mkdtempSync(join(tmpdir(), 'game2048-'));

// ---------- 静的チェック ----------
test('app/ に必要なファイルがそろっている', () => {
  for (const f of ['main.cjs', 'preload.cjs', 'index.html', 'renderer.js', 'style.css']) {
    assert.ok(existsSync(join(appDir, f)), `app/${f} がない`);
  }
});

test('app/ のファイルは外部 URL を参照しない（オフラインで完結）', () => {
  for (const f of readdirSync(appDir)) {
    if (!/\.(html|css|js|cjs)$/.test(f)) continue;
    const text = read(f);
    assert.ok(!/https?:\/\//.test(text), `app/${f} に http(s):// がある`);
  }
});

test('index.html は renderer.js を ES モジュールとして読み込み、style.css を使う', () => {
  const html = read('index.html');
  assert.match(html, /<script[^>]*type="module"[^>]*src="\.\/renderer\.js"/);
  assert.match(html, /<link[^>]*href="\.\/style\.css"/);
  assert.match(html, /id="app"/);
});

test('renderer.js は src/view.mjs と src/game.mjs を import する', () => {
  const js = read('renderer.js');
  assert.match(js, /from\s+['"]\.\.\/src\/view\.mjs['"]/);
  assert.match(js, /from\s+['"]\.\.\/src\/game\.mjs['"]/);
});

test('style.css は --size を基準に組まれ、reduced-motion に対応する', () => {
  const css = read('style.css');
  assert.match(css, /var\(--size\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.tile\.new/);
});

test('main.cjs は固定サイズ・最大化不可・contextIsolation のウィンドウを作る', () => {
  const js = read('main.cjs');
  assert.match(js, /resizable:\s*false/);
  assert.match(js, /maximizable:\s*false/);
  assert.match(js, /contextIsolation:\s*true/);
  assert.match(js, /nodeIntegration:\s*false/);
  assert.match(js, /setApplicationMenu\(null\)/);
});

test('preload.cjs は contextBridge で desktop API を公開する', () => {
  const js = read('preload.cjs');
  assert.match(js, /contextBridge/);
  assert.match(js, /exposeInMainWorld\(\s*['"]desktop['"]/);
});

// ---------- スモーク（実際に Electron を起動する） ----------
test('smoke: 初回起動は size 600、窓は 600x696、タイル 16 個、settings.json を書き出す', () => {
  const dir = freshUserData();
  const r = runSmoke(dir);
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stderr.slice(-2000)}\n${r.error ?? ''}`);
  const lines = smokeLines(r.stdout);
  assert.ok(lines.includes('SMOKE size=600'), r.stdout);
  assert.ok(lines.includes('SMOKE window=600x696'), r.stdout);
  assert.ok(lines.includes('SMOKE tiles=16'), r.stdout);
  assert.ok(lines.includes('SMOKE best=0'), r.stdout);
  assert.ok(lines.includes('SMOKE hud=BEST 0'), r.stdout);
  const settings = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
  assert.equal(settings.size, 600);
});

test('smoke: settings.json の size と best.json の best が反映される', () => {
  const dir = freshUserData();
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ size: 400 }));
  writeFileSync(join(dir, 'best.json'), JSON.stringify({ best: 777 }));
  const r = runSmoke(dir);
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stderr.slice(-2000)}`);
  const lines = smokeLines(r.stdout);
  assert.ok(lines.includes('SMOKE size=400'), r.stdout);
  assert.ok(lines.includes('SMOKE window=400x464'), r.stdout);
  assert.ok(lines.includes('SMOKE tiles=16'), r.stdout);
  assert.ok(lines.includes('SMOKE best=777'), r.stdout);
  assert.ok(lines.includes('SMOKE hud=BEST 777'), r.stdout);
});

test('smoke: 範囲外の size は 600 に戻すが、ファイルは書き換えない', () => {
  const dir = freshUserData();
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ size: 50 }));
  const r = runSmoke(dir);
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stderr.slice(-2000)}`);
  const lines = smokeLines(r.stdout);
  assert.ok(lines.includes('SMOKE size=600'), r.stdout);
  assert.ok(lines.includes('SMOKE window=600x696'), r.stdout);
  assert.equal(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).size, 50);
});
