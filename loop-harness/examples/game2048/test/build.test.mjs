import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const unpackedExe = join(root, 'dist', 'win-unpacked', '2048.exe');
const zipFile = join(root, 'dist', '2048-win-x64.zip');
const electronExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe');

function runExe(exe, userData, timeout) {
  // 未ビルドのときは起動を試みずに即 FAIL（存在しない exe の spawn はエラーになるが、理由を明示する）
  assert.ok(existsSync(exe), `${exe} がない（未ビルド）。起動せずに FAIL にする`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(exe, ['--smoke', '--user-data', userData], { encoding: 'utf8', timeout, env, windowsHide: true });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const smokeLines = (stdout) => stdout.split(/\r?\n/).filter((l) => l.startsWith('SMOKE '));
const freshUserData = () => mkdtempSync(join(tmpdir(), 'game2048-exe-'));

test('package.json の build 設定: productName 2048、dir + zip、asar 整合性リソースの書き込みを無効', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.build?.productName, '2048');
  assert.equal(pkg.build?.disableAsarIntegrity, true);
  const targets = (pkg.build?.win?.target ?? []).map((t) => (typeof t === 'string' ? t : t.target));
  assert.ok(targets.includes('dir'), 'win.target に dir がない');
  assert.ok(targets.includes('zip'), 'win.target に zip がない');
  assert.ok(!targets.includes('portable'), 'portable は Smart App Control でブロックされるので使わない');
  assert.match(pkg.scripts?.build ?? '', /electron-builder/);
});

test('dist/win-unpacked/2048.exe と dist/2048-win-x64.zip が生成されている', () => {
  assert.ok(existsSync(unpackedExe), 'dist/win-unpacked/2048.exe がない');
  assert.ok(existsSync(zipFile), 'dist/2048-win-x64.zip がない');
  assert.ok(statSync(zipFile).size > 50 * 1024 * 1024, 'zip が小さすぎる');
});

test('2048.exe は Electron の署名済みバイナリと同一（改変していないので Smart App Control を通る）', () => {
  assert.equal(sha256(unpackedExe), sha256(electronExe));
});

test('2048.exe を --smoke で起動すると SMOKE 行を出し、smoke.json も書く', () => {
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
