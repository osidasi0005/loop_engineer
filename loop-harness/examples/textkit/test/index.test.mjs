import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as textkit from '../src/index.mjs';

test('index は 3 つの関数と契約の定数を再エクスポートする', () => {
  assert.equal(typeof textkit.slugify, 'function');
  assert.equal(typeof textkit.wordCount, 'function');
  assert.equal(typeof textkit.truncate, 'function');
  assert.equal(textkit.TRUNCATE_DEFAULT_MAX, 20);
});
test('summarize は 1 行の見出しを返す: slug / 単語数 / 切り詰め', () => {
  assert.deepEqual(textkit.summarize('Hello Wonderful World of Text Processing'), {
    slug: 'hello-wonderful-world-of-text-processing',
    words: 6,
    title: 'Hello Wonderful Wor…',
  });
});
