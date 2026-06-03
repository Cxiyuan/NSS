import { describe, it } from 'node:test';
import assert from 'node:assert';
import { searchEngine } from './search.js';

describe('searchEngine', () => {
  it('returns searxng name property', () => {
    assert.strictEqual(searchEngine('anything').name, 'searxng');
  });
});
