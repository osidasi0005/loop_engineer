import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slugify.mjs';

test('小文字化してスペースをハイフンにする', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('記号の連続を 1 つのハイフンにまとめ、先頭末尾のハイフンを除く', () => {
  assert.equal(slugify('  --Hello,   World!--  '), 'hello-world');
});

test('アクセント付き文字を基底文字に落とす', () => {
  assert.equal(slugify('Café au lait'), 'cafe-au-lait');
});

test('空文字列は空文字列', () => {
  assert.equal(slugify(''), '');
});
