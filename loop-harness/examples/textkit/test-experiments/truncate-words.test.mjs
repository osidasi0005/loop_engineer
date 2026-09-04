import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncate } from '../src/truncate.mjs';

test('単語の途中で切らず、直前の単語区切りで切る', () => assert.equal(truncate('Hello Wonderful World', 12), 'Hello…'));
test('区切りの位置がちょうど収まるならそこで切る', () => assert.equal(truncate('Hello Wonderful World', 17), 'Hello Wonderful…'));
test('最大長以内ならそのまま', () => assert.equal(truncate('short text', 20), 'short text'));
