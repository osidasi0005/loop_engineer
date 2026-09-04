import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordCount } from '../src/wordcount.mjs';

test('空白区切りの単語を数える', () => assert.equal(wordCount('one two three'), 3));
test('連続する空白や改行も 1 つの区切り', () => assert.equal(wordCount('a  b\n\tc'), 3));
test('先頭末尾の空白は数えない', () => assert.equal(wordCount('  a b  '), 2));
test('空文字と空白だけは 0', () => {
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('   \n '), 0);
});
