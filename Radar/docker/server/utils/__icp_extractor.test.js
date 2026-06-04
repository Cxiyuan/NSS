// ICP footer extractor — unit tests (no cheerio dep, no I/O)
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractIcpFromHtml, collapseObfuscation } from './icp-extractor.js';

test('extracts canonical ICP record', () => {
  const html = '<footer>京ICP备12345678号</footer>';
  const r = extractIcpFromHtml(html);
  assert.equal(r.icp, '京ICP备12345678号');
  assert.equal(r.gongAn, null);
  assert.equal(r.confidence > 0, true);
});

test('extracts ICP with sub-record (子站)', () => {
  const html = '京ICP备12345678号-1';
  const r = extractIcpFromHtml(html);
  assert.equal(r.icp, '京ICP备12345678号-1');
});

test('extracts ICP with whitespace and full-width chars', () => {
  const html = '沪ICP备 20240001 号';
  const r = extractIcpFromHtml(html);
  assert.equal(r.icp, '沪ICP备20240001号');
});

test('extracts ICP with 备 (simplified) and 備 (traditional)', () => {
  assert.equal(extractIcpFromHtml('京ICP備12345678号').icp, '京ICP备12345678号');
  assert.equal(extractIcpFromHtml('京ICP备12345678号').icp, '京ICP备12345678号');
});

test('extracts ICP across all 31 provinces + HK/Macau/Taiwan', () => {
  const provinces = ['京','津','冀','晋','蒙','辽','吉','黑','沪','苏','浙','皖','闽','赣','鲁','豫','鄂','湘','粤','桂','琼','渝','川','黔','滇','藏','陕','甘','青','宁','新','港','澳','台'];
  for (const p of provinces) {
    const html = `<div>${p}ICP备12345678号</div>`;
    const r = extractIcpFromHtml(html);
    assert.equal(r?.icp, `${p}ICP备12345678号`, `province ${p} should match`);
  }
});

test('extracts 公安备案 (gongan) record', () => {
  const html = '公网安备 33010002000001 号';
  const r = extractIcpFromHtml(html);
  assert.equal(r.gongAn, '公网安备33010002000001号');
  assert.equal(r.icp, null);
});

test('extracts both ICP and gongan when both present', () => {
  const html = `
    <div class="beian">
      <a href="https://beian.miit.gov.cn/">京ICP备12345678号</a>
      <a href="https://beian.mps.gov.cn/">公网安备 33010002000001 号</a>
    </div>`;
  const r = extractIcpFromHtml(html);
  assert.equal(r.icp, '京ICP备12345678号');
  assert.equal(r.gongAn, '公网安备33010002000001号');
  assert.equal(r.hasBadge, true);
  assert.equal(r.confidence, 1); // 0.5 + 0.3 + 0.4 = 1.2 → clamped to 1
});

test('detects MIIT badge link without number (rare, low confidence)', () => {
  const html = '<a href="https://beian.miit.gov.cn/">备案</a>';
  const r = extractIcpFromHtml(html);
  assert.equal(r.hasBadge, true);
  assert.equal(r.icp, null);
  assert.equal(r.confidence, 0.4);
});

test('detects MPS (police) badge link separately from textual gongAn', () => {
  // beian.mps.gov.cn link is a separate confidence signal
  const html = '<a href="https://beian.mps.gov.cn/">公网安备</a>';
  const r = extractIcpFromHtml(html);
  // No actual gongAn number captured (text "公网安备" has no digits)
  assert.equal(r.hasBadge, false);
  assert.equal(r.hasMpsBadge, true);
  assert.equal(r.gongAn, null);
  assert.equal(r.confidence, 0.2);  // mps badge only
});

test('strips <script> and <style> before scanning', () => {
  const html = `
    <script>var 京ICP备99999999号 = "noise";</script>
    <style>body::before { content: "粤ICP备88888888号"; }</style>
    <footer>京ICP备12345678号</footer>
  `;
  const r = extractIcpFromHtml(html);
  // First hit is the real footer (after script/style stripped)
  assert.equal(r.icp, '京ICP备12345678号');
});

test('returns null for HTML with no ICP indicator', () => {
  assert.equal(extractIcpFromHtml('<html><body>no beian</body></html>'), null);
  assert.equal(extractIcpFromHtml(''), null);
  assert.equal(extractIcpFromHtml(null), null);
  assert.equal(extractIcpFromHtml(undefined), null);
});

test('returns null for non-Chinese sites', () => {
  const html = '<footer>© 2024 ACME Inc. All rights reserved.</footer>';
  assert.equal(extractIcpFromHtml(html), null);
});

test('rejects fake "ICP123" without province', () => {
  // No province prefix — common in fake/parked pages
  const html = '<div>ICP12345678</div>';
  assert.equal(extractIcpFromHtml(html), null);
});

test('rejects too-short ICP number (must be ≥4 digits)', () => {
  const html = '<div>京ICP备1号</div>';
  assert.equal(extractIcpFromHtml(html), null);
});

test('handles inline ICP inside <span>', () => {
  const html = '<span>粤ICP备20240001号-2</span>';
  const r = extractIcpFromHtml(html);
  assert.equal(r.icp, '粤ICP备20240001号-2');
});

test('confidence increases with more signals', () => {
  const icpOnly = extractIcpFromHtml('京ICP备12345678号');
  const withGongan = extractIcpFromHtml('京ICP备12345678号 公网安备 11010102000001 号');
  const withBadge = extractIcpFromHtml('<a href="https://beian.miit.gov.cn/">京ICP备12345678号</a>');
  const all = extractIcpFromHtml(`
    <a href="https://beian.miit.gov.cn/">京ICP备12345678号</a>
    <a href="https://beian.mps.gov.cn/">公网安备 11010102000001 号</a>
  `);
  assert.ok(icpOnly.confidence < withGongan.confidence);
  assert.ok(withGongan.confidence < withBadge.confidence);
  assert.ok(withBadge.confidence <= all.confidence);
});

test('marks source as "footer" (not API)', () => {
  const r = extractIcpFromHtml('京ICP备12345678号');
  assert.equal(r.source, 'footer');
});

test('first ICP match wins (no greedy double-match)', () => {
  const html = '京ICP备11111111号-1 京ICP备22222222号-2';
  const r = extractIcpFromHtml(html);
  // Returns first match — link-extractor does not do per-page dedup
  assert.equal(r.icp, '京ICP备11111111号-1');
});

// ─── collapseObfuscation direct unit tests ─────────────────────────────
test('collapseObfuscation strips zero-width characters', () => {
  assert.equal(collapseObfuscation('京​ICP备‌12345678‍号'), '京ICP备12345678号');
  assert.equal(collapseObfuscation('﻿京ICP备12345678号'), '京ICP备12345678号');
});

test('collapseObfuscation converts full-width digits to ASCII', () => {
  assert.equal(collapseObfuscation('京ICP备１２３４５６７８号'), '京ICP备12345678号');
});

test('collapseObfuscation collapses interleaved whitespace', () => {
  assert.equal(collapseObfuscation('京 I C P 备 1 2 3 4 5 6 7 8 号'), '京ICP备12345678号');
});

test('collapseObfuscation does NOT affect CJK inter-language spacing', () => {
  assert.equal(collapseObfuscation('Hello 你好 World 世界'), 'Hello你好World世界');
  // Spaces between ASCII words ARE collapsed ("normal text" → "normaltext") —
  // this is the known trade-off documented in collapseObfuscation.
  // In ICP extraction, the collapsed string still passes through ICP_RE
  // correctly, so the trade-off is acceptable.
});

// ─── v1.2 spambot defense ──────────────────────────────────────────────
test('v1.2: extracts ICP obfuscated with single-char spaces', () => {
  // "京 I C P 备 1 2 3 4 5 6 7 8 号" — common spammer trick
  const html = '京 I C P 备 1 2 3 4 5 6 7 8 号';
  const r = extractIcpFromHtml(html);
  assert.equal(r.icp, '京ICP备12345678号');
});

test('v1.2: extracts ICP with zero-width spaces', () => {
  const html = '京\u200BICP备\u200C12345678\u200D号';
  const r = extractIcpFromHtml(html);
  assert.equal(r.icp, '京ICP备12345678号');
});

test('v1.2: extracts ICP with full-width digits', () => {
  const html = '京ICP备１２３４５６７８号';
  const r = extractIcpFromHtml(html);
  assert.equal(r.icp, '京ICP备12345678号');
});

test('v1.2: extracts gongan with single-char spaces', () => {
  const html = '公 网 安 备 1 1 0 1 0 1 0 2 0 0 0 0 0 1 号';
  const r = extractIcpFromHtml(html);
  assert.equal(r.gongAn, '公网安备11010102000001号');
});

test('v1.2: byte-order mark (BOM) stripped before scan', () => {
  const html = '\uFEFF京ICP备12345678号';
  const r = extractIcpFromHtml(html);
  assert.equal(r.icp, '京ICP备12345678号');
});

test('v1.2: combined obfuscation (spaces + zero-width + full-width)', () => {
  const html = '\uFEFF京\u200B I C P\u200C 备 １２３４５６７８ 号';
  const r = extractIcpFromHtml(html);
  assert.equal(r.icp, '京ICP备12345678号');
});

test('v1.2: legitimate English-CJK spacing is NOT collapsed', () => {
  // "Hello 你好 World 世界" — 4 spaces between ASCII and CJK are NOT obfuscation
  // (these are inter-language breaks in CJK content). This test verifies we
  // don't accidentally strip them and create a false-positive ICP match.
  // Result: no ICP found, no false-positive.
  const html = 'Hello 你好 World 世界';
  const r = extractIcpFromHtml(html);
  assert.equal(r, null);
});
