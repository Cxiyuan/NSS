import { describe, it } from 'node:test';
import assert from 'node:assert';
import { searchGoogle, searchBing, searchEngine } from './search.js';

describe('searchEngine', () => {
  it('returns name property for google', () => {
    assert.strictEqual(searchEngine('google').name, 'google');
  });

  it('returns name property for bing', () => {
    assert.strictEqual(searchEngine('bing').name, 'bing');
  });

  it('throws for unknown engine', () => {
    assert.throws(() => searchEngine('yahoo'), /Unknown search engine/);
  });

  it('searchGoogle returns results array with url and title', async function () {
    if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_CX) {
      this.skip();
    }
    const results = await searchGoogle('test query', process.env.GOOGLE_API_KEY, process.env.GOOGLE_CX);
    assert.ok(Array.isArray(results));
    if (results.length > 0) {
      assert.ok(typeof results[0].url === 'string');
      assert.ok(typeof results[0].title === 'string');
    }
  });

  it('searchBing returns results array with url and title', async function () {
    if (!process.env.BING_API_KEY) {
      this.skip();
    }
    const results = await searchBing('test query', process.env.BING_API_KEY);
    assert.ok(Array.isArray(results));
    if (results.length > 0) {
      assert.ok(typeof results[0].url === 'string');
      assert.ok(typeof results[0].title === 'string');
    }
  });
});
