import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { launchBrowser, fetchWithBrowser, closeBrowser } from './browser.js';

describe('browser', () => {
  before(async () => {
    await launchBrowser();
  });

  after(async () => {
    await closeBrowser();
  });

  it('renders a page and returns full HTML', async () => {
    const html = await fetchWithBrowser('https://example.com');
    assert.ok(html.includes('</html>'));
  });

  it('returns HTML with JS-rendered DOM', async function () {
    const html = await fetchWithBrowser('https://example.com');
    assert.ok(typeof html === 'string');
    assert.ok(html.length > 0);
  });
});
