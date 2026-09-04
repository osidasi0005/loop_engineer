import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slugify.mjs';

test('小文字化してハイフン区切りにする', () => assert.equal(slugify('Hello World'), 'hello-world'));
test('記号の連続を 1 つのハイフンにまとめ、先頭末尾のハイフンを除く', () =>
  assert.equal(slugify('  Hello,   World!!  '), 'hello-world'));
test('アクセント付き文字を基底文字に落とす', () => assert.equal(slugify('Crème Brûlée'), 'creme-brulee'));
test('空文字は空文字', () => assert.equal(slugify(''), ''));
