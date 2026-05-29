import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeUrl, getDomain, isSameDomain, resolveUrl } from './url.js';

describe('normalizeUrl', () => {
  it('removes trailing slash', () => {
    assert.strictEqual(normalizeUrl('https://example.com/'), 'https://example.com');
  });
  it('removes hash fragment', () => {
    assert.strictEqual(normalizeUrl('https://example.com/page#section'), 'https://example.com/page');
  });
  it('lowercases protocol and host', () => {
    assert.strictEqual(normalizeUrl('HTTP://Example.COM/Path'), 'http://example.com/Path');
  });
  it('removes default ports', () => {
    assert.strictEqual(normalizeUrl('https://example.com:443/path'), 'https://example.com/path');
    assert.strictEqual(normalizeUrl('http://example.com:80/path'), 'http://example.com/path');
  });
  it('returns null for invalid URLs', () => {
    assert.strictEqual(normalizeUrl('not-a-url'), null);
    assert.strictEqual(normalizeUrl(''), null);
  });
});

describe('getDomain', () => {
  it('extracts domain from URL', () => {
    assert.strictEqual(getDomain('https://www.example.com/path?q=1'), 'example.com');
  });
  it('handles subdomains', () => {
    assert.strictEqual(getDomain('https://a.b.example.com'), 'example.com');
  });
  it('handles co.uk style TLDs with public suffix heuristic', () => {
    assert.strictEqual(getDomain('https://www.example.co.uk'), 'example.co.uk');
  });
});

describe('isSameDomain', () => {
  it('same domain returns true', () => {
    assert.ok(isSameDomain('https://example.com/a', 'https://example.com/b'));
  });
  it('subdomain vs apex returns true', () => {
    assert.ok(isSameDomain('https://www.example.com', 'https://example.com'));
  });
  it('different domains returns false', () => {
    assert.strictEqual(isSameDomain('https://example.com', 'https://other.com'), false);
  });
});

describe('resolveUrl', () => {
  it('resolves relative path against base', () => {
    assert.strictEqual(resolveUrl('/about', 'https://example.com/page'), 'https://example.com/about');
  });
  it('resolves absolute URL unchanged', () => {
    assert.strictEqual(resolveUrl('https://other.com', 'https://example.com'), 'https://other.com');
  });
  it('resolves protocol-relative URL', () => {
    assert.strictEqual(resolveUrl('//cdn.example.com/lib.js', 'https://example.com'), 'https://cdn.example.com/lib.js');
  });
  it('resolves relative path without leading slash', () => {
    assert.strictEqual(resolveUrl('about', 'https://example.com/page/'), 'https://example.com/page/about');
  });
});
