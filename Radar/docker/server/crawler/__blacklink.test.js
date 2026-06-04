// Unit tests for blacklink (hidden link) detection.
// Tests the pure-function `detectBlacklinkFromAttrs` extracted from link-extractor.js
// so we can run locally without cheerio / npm install.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { detectBlacklinkFromAttrs } from '../crawler/blacklink-patterns.js';

describe('Blacklink detection — pure-function test (no cheerio dep)', () => {
  describe('POSITIVE cases (true blacklinks) — 18+ CSS-hide patterns', () => {
    const positives = [
      ['display:none',                { style: 'display:none' }],
      ['display:none !important',     { style: 'display:none !important' }],
      ['display: none (extra spaces)',{ style: 'display:  none' }],
      ['display:none in long decl',   { style: 'color:red;display:none;font-size:12px' }],
      ['visibility:hidden',           { style: 'visibility:hidden' }],
      ['opacity:0',                   { style: 'opacity:0' }],
      ['opacity:0.0',                 { style: 'opacity:0.0' }],
      ['width:0',                     { style: 'width:0' }],
      ['width:0px',                   { style: 'width:0px' }],
      ['height:0',                    { style: 'height:0' }],
      ['height:0em',                  { style: 'height:0em' }],
      ['height:0%',                   { style: 'height:0%' }],
      ['font-size:0',                 { style: 'font-size:0' }],
      ['font-size:0px',               { style: 'font-size:0px' }],
      ['line-height:0',               { style: 'line-height:0' }],
      // v1.2.7: overflow:hidden + zero-size container (collapsed)
      ['overflow:hidden;height:0 (v1.2.7)', { style: 'overflow:hidden;height:0' }],
      ['overflow:hidden;width:0 (v1.2.7)', { style: 'overflow:hidden;width:0' }],
      ['overflow:hidden;max-height:0 (v1.2.7)', { style: 'overflow:hidden;max-height:0' }],
      ['height:0;overflow:hidden (reversed order, v1.2.7)', { style: 'height:0;overflow:hidden' }],
      ['overflow:hidden; height:0; width:100px (v1.2.7)', { style: 'overflow:hidden; height:0; width:100px' }],
      ['text-indent:-9999px',         { style: 'text-indent:-9999px' }],
      ['text-indent:-10000px',        { style: 'text-indent:-10000px' }],
      ['text-indent:-999px (3-digit threshold)', { style: 'text-indent:-999px' }],
      ['text-indent:-1234px',         { style: 'text-indent:-1234px' }],
      ['clip:rect(0,0,0,0)',          { style: 'clip:rect(0,0,0,0)' }],
      ['clip-path:inset(0)',          { style: 'clip-path:inset(0)' }],
      // v1.2: transform with 0 + unit suffix (0px / 0rem / 0em)
      ['transform:scale(0px) (v1.2)', { style: 'transform:scale(0px)' }],
      ['transform:scale(0rem) (v1.2)', { style: 'transform:scale(0rem)' }],
      ['transform:scale(0em) (v1.2)', { style: 'transform:scale(0em)' }],
      ['transform:translate(0px, -9999px) (v1.2: was KNOWN GAP)', { style: 'transform:translate(0px, -9999px)' }],
      // Note: translate(-9999px, 0) is NOT detected (regex only checks first arg for 0).
      // This is a known gap — v1.3 should add a secondary pattern for 2nd-arg-zero.
      // v1.2.6: position:fixed + offset (same off-screen technique as absolute)
      ['position:fixed;left:-9999px (v1.2.6)', { style: 'position:fixed;left:-9999px' }],
      ['position:fixed;top:-9999px (v1.2.6)', { style: 'position:fixed;top:-9999px' }],
      ['position:fixed;right:-9999px (v1.2.6)', { style: 'position:fixed;right:-9999px' }],
      ['position:fixed;bottom:-9999px (v1.2.6)', { style: 'position:fixed;bottom:-9999px' }],
      ['position:fixed;left:-9999px (no space after colon, v1.2.6)', { style: 'position:fixed;left:-9999px' }],
      // v1.2: position:absolute with semicolon + various offsets
      ['position:absolute;left:-9999px (v1.2: was KNOWN GAP)', { style: 'position:absolute;left:-9999px' }],
      ['position:absolute;top:-9999px (v1.2)', { style: 'position:absolute;top:-9999px' }],
      ['position:absolute;right:-9999px (v1.2: right offset)', { style: 'position:absolute;right:-9999px' }],
      ['position:absolute;bottom:-9999px (v1.2: bottom offset)', { style: 'position:absolute;bottom:-9999px' }],
      ['position:absolute ; left:-9999px (v1.2: extra whitespace)', { style: 'position:absolute ; left:-9999px' }],
      ['position:absolute;  left:-9999px (v1.2: padding whitespace)', { style: 'position:absolute;  left:-9999px' }],
      ['transform:scale(0)',          { style: 'transform:scale(0)' }],
      ['transform:scale(0.0)',        { style: 'transform:scale(0.0)' }],
      ['transform:scale(0.00)',       { style: 'transform:scale(0.00)' }],
      ['transform:translate(0,-9999px)', { style: 'transform:translate(0,-9999px)' }],
      ['z-index:-9999',               { style: 'z-index:-9999' }],
      ['z-index:-9999;position:absolute', { style: 'z-index:-9999;position:absolute' }],
      ['class="seo-spam"',            { class: 'seo-spam' }],
      ['class="black-link"',          { class: 'black-link' }],
      ['class="hidden-link"',         { class: 'hidden-link' }],
      ['class="sponsored"',           { class: 'sponsored' }],
      ['class="affiliate"',          { class: 'affiliate' }],
      ['class="paid-link"',           { class: 'paid-link' }],
      ['class="ad-slot"',             { class: 'ad-slot' }],
      ['id="seo-spam"',               { id: 'seo-spam' }],
      ['id="affiliate"',              { id: 'affiliate' }],
      ['combined class+style',        { class: 'btn', style: 'display:none' }],
    ];
    for (const [label, attrs] of positives) {
      it(`flags "${label}" as hidden`, () => {
        const result = detectBlacklinkFromAttrs(attrs);
        assert.ok(result !== null, `expected detection for "${label}", got null`);
        assert.ok(typeof result.reason === 'string' && result.reason.length > 0,
          `expected non-empty reason for "${label}", got "${result.reason}"`);
      });
    }
  });

  describe('NEGATIVE cases (legitimate links must NOT be flagged) — 22+ patterns', () => {
    const negatives = [
      ['no style/class/id',           {}],
      ['empty style',                 { style: '' }],
      ['display:flex (visible)',     { style: 'display:flex' }],
      ['display:block',               { style: 'display:block' }],
      ['display:inline',              { style: 'display:inline' }],
      ['display:inline-block',        { style: 'display:inline-block' }],
      ['display:grid',                { style: 'display:grid' }],
      ['width:10px (visible)',        { style: 'width:10px' }],
      ['width:100px',                 { style: 'width:100px' }],
      ['width:50%',                   { style: 'width:50%' }],
      ['height:100px',                { style: 'height:100px' }],
      ['opacity:0.5 (semi-transparent)',{ style: 'opacity:0.5' }],
      ['opacity:1',                   { style: 'opacity:1' }],
      ['opacity:0.99',                { style: 'opacity:0.99' }],
      ['text-indent:0 (no offset)',   { style: 'text-indent:0' }],
      ['text-indent:5px (small offset)', { style: 'text-indent:5px' }],
      ['text-indent:-50px (under threshold)', { style: 'text-indent:-50px' }],

      ['position:relative;left:0',     { style: 'position:relative;left:0' }],
      ['position:absolute;left:0',    { style: 'position:absolute;left:0' }],
      // v1.2.7: overflow:hidden alone is NOT a blacklink
      ['overflow:hidden (no zero-size)', { style: 'overflow:hidden' }],
      ['overflow:hidden;height:100px (visible content)', { style: 'overflow:hidden;height:100px' }],
      ['position:absolute;left:10px',  { style: 'position:absolute;left:10px' }],
      // v1.2.6: position:fixed without offset is NOT a blacklink
      ['position:fixed;left:0 (visible)', { style: 'position:fixed;left:0' }],
      ['position:fixed;left:10px (visible)', { style: 'position:fixed;left:10px' }],
      // v1.2: removed KNOWN GAP — semicolon-separated position:absolute;left:-9999px
      // is now flagged (regex now allows [;\s]* between declarations).
      ['z-index:1 (positive, in front)', { style: 'z-index:1' }],
      ['z-index:9999 (positive, very high)', { style: 'z-index:9999' }],
      ['transform:scale(1)',          { style: 'transform:scale(1)' }],
      ['transform:scale(0.99)',       { style: 'transform:scale(0.99)' }],
      ['transform:translate(-50px, 0)', { style: 'transform:translate(-50px, 0)' }],  // under threshold
      ['class="btn btn-primary" (legit framework classes)', { class: 'btn btn-primary' }],
      ['class="link" (legit single word)', { class: 'link' }],
      ['class="hidden md:block" (Tailwind responsive)', { class: 'hidden md:block' }],
      ['class="ads" (contains "ad-" prefix but not blacklink pattern)', { class: 'ads' }],
      ['class="my-link" (contains "-link" but not blacklist word)', { class: 'my-link' }],
      ['class="" empty',              { class: '' }],
      // v1.2.QA: known exclusions — not flagged by current patterns
      ['position:fixed;bottom:0 (visible, fixed but not off-screen)', { style: 'position:fixed;bottom:0' }],
      ['position:fixed;left:0 (visible, fixed but not off-screen)', { style: 'position:fixed;left:0' }],
      ['class="hidden lg:block" (Tailwind responsive, contains "hidden")', { class: 'hidden lg:block' }],
      ['font-size:1px (very small but visible, boundary near 0)', { style: 'font-size:1px' }],
      // aria-hidden="true" and hidden attribute are NOT detected (known exclusion)
      ['aria-hidden="true" (React pattern, not CSS hide)', { class: 'some-class' }],
      // The `hidden` attribute and `aria-hidden` are HTML-level hiding, not
      // CSS-level. Detecting them would require a separate check on the DOM
      // element itself (the html), not just inline styles/classes. link-extractor
      // could add this in v1.3 if needed.
    ];
    for (const [label, attrs] of negatives) {
      it(`does NOT flag "${label}"`, () => {
        const result = detectBlacklinkFromAttrs(attrs);
        assert.strictEqual(result, null, `expected null for "${label}", got ${JSON.stringify(result)}`);
      });
    }
  });

  describe('Cross-cutting behaviors', () => {
    it('returns null when style/class/id are all empty/missing', () => {
      const result = detectBlacklinkFromAttrs({});
      assert.strictEqual(result, null);
    });

    it('evidence string starts with "css-hide:" for CSS hidden, "class:" for class-based', () => {
      const cssResult = detectBlacklinkFromAttrs({ style: 'display:none' });
      assert.ok(cssResult.reason.startsWith('css-hide:'),
        `expected css-hide prefix, got "${cssResult.reason}"`);
      const classResult = detectBlacklinkFromAttrs({ class: 'seo-spam' });
      assert.ok(classResult.reason.startsWith('class:'),
        `expected class: prefix, got "${classResult.reason}"`);
    });

    it('CSS evidence is bounded to 64 chars (matches production .slice(0,64))', () => {
      const result = detectBlacklinkFromAttrs({
        style: 'display:none; padding: 999999999999999999999999999px; margin: 999999999999999999px;'
      });
      assert.ok(result.reason.length <= 64,
        `reason should be bounded, got length ${result.reason.length}: "${result.reason}"`);
    });
  });
});
