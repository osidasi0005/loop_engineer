import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const portableExe = join(root, 'dist', '2048.exe');
const unpackedExe = join(root, 'dist', 'win-unpacked', '2048.exe');

function runExe(exe, userData, timeout) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(exe, ['--smoke', '--user-data', userData], { encoding: 'utf8', timeout, env, windowsHide: true });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

const smokeLines = (stdout) => stdout.split(/\r?\n/).filter((l) => l.startsWith('SMOKE '));
const freshUserData = () => mkdtempSync(join(tmpdir(), 'game2048-exe-'));

test('package.json の build 設定: productName 2048、ポータブル exe の名前は 2048.exe', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.build?.productName, '2048');
  assert.equal(pkg.build?.win?.artifactName, '2048.exe');
  assert.match(pkg.scripts?.build ?? '', /electron-builder/);
});

test('dist/2048.exe（ポータブル）と dist/win-unpacked/2048.exe が生成されている', () => {
  assert.ok(existsSync(portableExe), 'dist/2048.exe がない');
  assert.ok(existsSync(unpackedExe), 'dist/win-unpacked/2048.exe がない');
  assert.ok(statSync(portableExe).size > 50 * 1024 * 1024, 'ポータブル exe が小さすぎる');
});

test('win-unpacked の exe を --smoke で起動すると SMOKE 行を出し、smoke.json も書く', () => {
  const dir = freshUserData();
  const r = runExe(unpackedExe, dir, 60000);
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stderr.slice(-2000)}\n${r.error ?? ''}`);
  const lines = smokeLines(r.stdout);
  assert.ok(lines.includes('SMOKE size=600'), r.stdout);
  assert.ok(lines.includes('SMOKE window=600x696'), r.stdout);
  assert.ok(lines.includes('SMOKE tiles=16'), r.stdout);
  const smoke = JSON.parse(readFileSync(join(dir, 'smoke.json'), 'utf8'));
  assert.equal(smoke.tiles, 16);
  assert.equal(smoke.size, 600);
  assert.equal(smoke.window, '600x696');
});

test('ポータブル exe を --smoke で起動すると終了コード 0 で smoke.json を書く（stdout は取れない）', () => {
  const dir = freshUserData();
  const r = runExe(portableExe, dir, 120000);
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stderr.slice(-2000)}\n${r.error ?? ''}`);
  const smokePath = join(dir, 'smoke.json');
  assert.ok(existsSync(smokePath), 'smoke.json が書かれていない（引数が exe まで届いていない可能性）');
  const smoke = JSON.parse(readFileSync(smokePath, 'utf8'));
  assert.equal(smoke.tiles, 16);
  assert.equal(smoke.size, 600);
});
