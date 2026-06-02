import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseKeywords } from './keywords.js';

describe('parseKeywords', () => {
  it('splits space-separated words into tokens', () => {
    const result = parseKeywords('hello world');
    assert.deepStrictEqual(result, ['hello', 'world']);
  });

  it('treats double-quoted phrase as a single token', () => {
    const result = parseKeywords('"machine learning" AI');
    assert.deepStrictEqual(result, ['machine learning', 'ai']);
  });

  it('treats single-quoted phrase as a single token', () => {
    const result = parseKeywords("'site analysis' tool");
    assert.deepStrictEqual(result, ['site analysis', 'tool']);
  });

  it('mixes quoted phrases with unquoted tokens', () => {
    const result = parseKeywords('北京 "数据抓取" 引擎');
    assert.deepStrictEqual(result, ['北京', '数据抓取', '引擎']);
  });

  it('lowercases all tokens', () => {
    const result = parseKeywords('Hello World "Exact Phrase"');
    assert.deepStrictEqual(result, ['hello', 'world', 'exact phrase']);
  });

  it('returns empty array for empty string', () => {
    assert.deepStrictEqual(parseKeywords(''), []);
  });

  it('returns empty array for whitespace-only string', () => {
    assert.deepStrictEqual(parseKeywords('   '), []);
  });

  it('handles multiple quoted phrases', () => {
    const result = parseKeywords('"first phrase" "second phrase"');
    assert.deepStrictEqual(result, ['first phrase', 'second phrase']);
  });

  it('handles special characters in tokens', () => {
    const result = parseKeywords('C++ "Node.js" .NET');
    assert.deepStrictEqual(result, ['c++', 'node.js', '.net']);
  });

  it('ignores empty quotes', () => {
    const result = parseKeywords('test "" empty');
    assert.deepStrictEqual(result, ['test', 'empty']);
  });
});
