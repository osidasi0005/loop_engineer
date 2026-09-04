import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncate } from '../src/truncate.mjs';
import { TRUNCATE_DEFAULT_MAX, ELLIPSIS } from '../src/contract.mjs';

test('最大長以内ならそのまま', () => assert.equal(truncate('short', 10), 'short'));
test('超えたら最大長に収めて末尾を省略記号にする', () => assert.equal(truncate('abcdefghij', 5), 'abcd' + ELLIPSIS));
test('既定の最大長は契約の定数', () => {
  const long = 'x'.repeat(TRUNCATE_DEFAULT_MAX + 5);
  assert.equal(truncate(long).length, TRUNCATE_DEFAULT_MAX);
  assert.ok(truncate(long).endsWith(ELLIPSIS));
});
test('ちょうど最大長ならそのまま', () => assert.equal(truncate('abcde', 5), 'abcde'));
