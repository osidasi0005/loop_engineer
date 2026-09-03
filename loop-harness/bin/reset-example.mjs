// reset-example.mjs — 例題タスク slugify を初期状態に戻す
//   examples/slugify/src/slugify.mjs を削除、tasks/slugify/PROGRESS.md を初期化、runs/slugify/ を空にする
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(root, 'examples', 'slugify', 'src', 'slugify.mjs'), { force: true });
mkdirSync(join(root, 'examples', 'slugify', 'src'), { recursive: true });
rmSync(join(root, 'runs', 'slugify'), { recursive: true, force: true });
mkdirSync(join(root, 'runs', 'slugify'), { recursive: true });
writeFileSync(
  join(root, 'tasks', 'slugify', 'PROGRESS.md'),
  `# 進捗メモ

このファイルは反復をまたぐ唯一の「記憶」です。
エージェントは毎回ここを読み、作業の最後に追記します。ランナーも検証結果を 1 行ずつ追記します。

`,
);
console.log('例題をリセットしました（examples/slugify/src/slugify.mjs 削除、tasks/slugify/PROGRESS.md 初期化、runs/slugify/ 空）');
