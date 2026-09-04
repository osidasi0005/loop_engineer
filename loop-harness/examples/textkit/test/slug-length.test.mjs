import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slugify.mjs';

test('スラッグは最大 50 文字に切り詰められる', () => assert.equal(slugify('a'.repeat(60)).length, 50));
test('切り詰めた末尾にハイフンを残さない', () => {
  const s = slugify('word '.repeat(20));
  assert.ok(s.length <= 50);
  assert.equal(s.endsWith('-'), false);
});
test('50 文字以内はそのまま', () => assert.equal(slugify('Hello World'), 'hello-world'));
