import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../textkit/src/contract.mjs';

test('契約モジュールが export するのは 3 つの定数だけ（追加は設計判断が必要。モジュール固有の定数はそのモジュールに置く）', () => {
  assert.deepEqual(Object.keys(contract).sort(), ['ELLIPSIS', 'TRUNCATE_DEFAULT_MAX', 'WORD_SEPARATOR']);
});
