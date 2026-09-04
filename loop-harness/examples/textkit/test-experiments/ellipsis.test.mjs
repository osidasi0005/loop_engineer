import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELLIPSIS } from '../src/contract.mjs';
import { truncate } from '../src/truncate.mjs';

test('省略記号は ASCII の 3 文字 ...', () => assert.equal(ELLIPSIS, '...'));
test('truncate は 3 文字の省略記号込みで最大長に収める', () => assert.equal(truncate('abcdefghij', 6), 'abc...'));
test('最大長以内ならそのまま', () => assert.equal(truncate('short', 10), 'short'));
