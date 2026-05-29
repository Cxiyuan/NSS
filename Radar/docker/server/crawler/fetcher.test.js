import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchAndParse } from './fetcher.js';

describe('fetchAndParse', () => {
  it('returns html and title for a valid URL', async () => {
    const result = await fetchAndParse('https://example.com');
    assert.ok(result.html.includes('</html>') || result.html.includes('<html'));
    assert.ok(typeof result.title === 'string');
  });

  it('returns pageTitle from <title> tag', async () => {
    const result = await fetchAndParse('https://example.com');
    assert.ok(result.title.length > 0);
  });

  it('throws on invalid URL', async () => {
    await assert.rejects(
      () => fetchAndParse('not-a-valid-url'),
      /Invalid URL|Failed to fetch/
    );
  });
});
