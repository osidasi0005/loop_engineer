import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRUNCATE_DEFAULT_MAX, ELLIPSIS, WORD_SEPARATOR } from '../src/contract.mjs';

test('truncate の既定最大長は 20', () => assert.equal(TRUNCATE_DEFAULT_MAX, 20));
test('省略記号は … 1 文字', () => assert.equal(ELLIPSIS, '…'));
test('単語区切りは空白の連続にマッチする正規表現', () => {
  assert.ok(WORD_SEPARATOR instanceof RegExp);
  assert.deepEqual('a  b\tc\nd'.split(WORD_SEPARATOR), ['a', 'b', 'c', 'd']);
});
