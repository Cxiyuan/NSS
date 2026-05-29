import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractLinks } from './link-extractor.js';

const html = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/style.css">
  <link rel="canonical" href="https://example.com/canonical">
  <meta http-equiv="refresh" content="5;url=https://example.com/redirect">
</head>
<body>
  <a href="/page1">Page 1</a>
  <a href="https://external.com/link">External</a>
  <img src="/img/logo.png" data-href="/hidden1">
  <iframe src="https://embed.com/frame"></iframe>
  <form action="/submit"></form>
  <div data-url="/data-link"></div>
  <!-- Check out https://commented-out.com/page -->
  <script>
    var url = "https://script-url.com/api";
    window.location.href = "https://location-href.com/go";
    location.assign('https://location-assign.com/target');
    fetch("https://fetch-url.com/data");
    var bg = 'url("/bg.jpg")';
  </script>
  <style>
    .bg { background: url(https://css-bg.com/image.png); }
  </style>
</body>
</html>`;

describe('extractLinks', () => {
  it('extracts explicit <a href> links', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/page1'));
  });

  it('extracts external links', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://external.com/link'));
  });

  it('extracts <img src>', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/img/logo.png'));
  });

  it('extracts <link href>', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/style.css'));
  });

  it('extracts <iframe src>', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://embed.com/frame'));
  });

  it('extracts <form action>', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/submit'));
  });

  it('extracts data-url and data-href attributes', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/hidden1'));
    assert.ok(links.some(l => l.url === 'https://example.com/data-link'));
  });

  it('extracts HTML comment URLs', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://commented-out.com/page'));
  });

  it('extracts script string URLs', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://script-url.com/api'));
  });

  it('extracts location.href / location.assign', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://location-href.com/go'));
    assert.ok(links.some(l => l.url === 'https://location-assign.com/target'));
  });

  it('extracts CSS url() values', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://css-bg.com/image.png'));
  });

  it('extracts meta refresh URL', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/redirect'));
  });

  it('deduplicates identical URLs', () => {
    const html2 = '<a href="/dup">One</a><a href="/dup">Two</a>';
    const links = extractLinks(html2, 'https://example.com');
    const dups = links.filter(l => l.url === 'https://example.com/dup');
    assert.strictEqual(dups.length, 1);
  });

  it('returns link_type metadata', () => {
    const links = extractLinks(html, 'https://example.com');
    const imgLink = links.find(l => l.url === 'https://example.com/img/logo.png');
    assert.strictEqual(imgLink.linkType, 'img');
    const commentLink = links.find(l => l.url === 'https://commented-out.com/page');
    assert.strictEqual(commentLink.linkType, 'comment');
    const scriptLink = links.find(l => l.url === 'https://script-url.com/api');
    assert.strictEqual(scriptLink.linkType, 'script');
  });

  it('skips mailto: and javascript: links', () => {
    const html3 = '<a href="mailto:a@b.com">Email</a><a href="javascript:void(0)">JS</a><a href="/real">Real</a>';
    const links = extractLinks(html3, 'https://example.com');
    const urls = links.map(l => l.url);
    assert.ok(!urls.some(u => u.startsWith('mailto:')));
    assert.ok(!urls.some(u => u.startsWith('javascript:')));
    assert.ok(urls.some(u => u.includes('/real')));
  });
});
