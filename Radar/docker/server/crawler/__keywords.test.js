// Keyword list tests — verifies the v1.2 expanded list (50 keywords across 4
// categories), shape contract, and inline-CJK-pairing invariants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ILLEGAL_PATTERNS, KEYWORD_STATS } from './keywords.js';

// ─── Shape contract ────────────────────────────────────────────────────
test('ILLEGAL_PATTERNS has 4 categories', () => {
  assert.deepEqual(Object.keys(ILLEGAL_PATTERNS).sort(), ['blackhat', 'drugs', 'gambling', 'porn']);
});

test('total keyword count is 49 (v1.2 removed over-broad av)', () => {
  assert.equal(KEYWORD_STATS.total, 49);
});

test('each category has 11-14 keywords (balanced)', () => {
  for (const [cat, count] of Object.entries(KEYWORD_STATS.perCategory)) {
    assert.ok(count >= 11 && count <= 14, `${cat} has ${count} keywords, want 11-14`);
  }
});

test('stats sum equals perCategory sum', () => {
  const sum = Object.values(KEYWORD_STATS.perCategory).reduce((a, b) => a + b, 0);
  assert.equal(sum, KEYWORD_STATS.total);
});

// ─── No duplicate keywords within a category ──────────────────────────
for (const [cat, kws] of Object.entries(ILLEGAL_PATTERNS)) {
  test(`category ${cat} has no duplicate keywords`, () => {
    const seen = new Set();
    for (const kw of kws) {
      assert.ok(!seen.has(kw), `duplicate keyword "${kw}" in ${cat}`);
      seen.add(kw);
    }
  });

  test(`category ${cat} keywords are non-empty strings`, () => {
    for (const kw of kws) {
      assert.equal(typeof kw, 'string');
      assert.ok(kw.length > 0, `empty keyword in ${cat}`);
    }
  });
}

// ─── Cross-category: 菠菜/博彩 only in blackhat (no double-tagging) ───
test('菠菜 lives in blackhat (not gambling — would double-tag)', () => {
  assert.ok(ILLEGAL_PATTERNS.blackhat.includes('菠菜'));
  assert.ok(!ILLEGAL_PATTERNS.gambling.includes('菠菜'));
});

test('博彩 lives in blackhat (not gambling — would double-tag)', () => {
  assert.ok(ILLEGAL_PATTERNS.blackhat.includes('博彩'));
  assert.ok(!ILLEGAL_PATTERNS.gambling.includes('博彩'));
});

// ─── Chinese coverage: each category has ≥6 CN keywords ───────────────
test('each category has ≥6 Chinese keywords (CJK coverage)', () => {
  const cjk = /[\u4e00-\u9fa5]/;
  for (const [cat, kws] of Object.entries(ILLEGAL_PATTERNS)) {
    const cnCount = kws.filter(kw => cjk.test(kw)).length;
    assert.ok(cnCount >= 6, `${cat} has only ${cnCount} CN keywords, want ≥6`);
  }
});

test('porn category covers both adult (成人) and explicit (色情) CN', () => {
  assert.ok(ILLEGAL_PATTERNS.porn.includes('成人'));
  assert.ok(ILLEGAL_PATTERNS.porn.includes('色情'));
});

test('drugs category covers 冰毒 (meth) and 大麻 (cannabis) CN', () => {
  assert.ok(ILLEGAL_PATTERNS.drugs.includes('冰毒'));
  assert.ok(ILLEGAL_PATTERNS.drugs.includes('大麻'));
});

test('gambling category covers 百家乐 (baccarat) and 老虎机 (slots) CN', () => {
  assert.ok(ILLEGAL_PATTERNS.gambling.includes('百家乐'));
  assert.ok(ILLEGAL_PATTERNS.gambling.includes('老虎机'));
});

test('blackhat category covers 刷粉 (fake followers) and 外挂 (cheat) CN', () => {
  assert.ok(ILLEGAL_PATTERNS.blackhat.includes('刷粉'));
  assert.ok(ILLEGAL_PATTERNS.blackhat.includes('外挂'));
});

// ─── English coverage: porn/gambling/drugs have ≥3 EN; blackhat is CN-heavy ──
test('porn/gambling/drugs have ≥3 English keywords (broad coverage)', () => {
  const ascii = /^[\x20-\x7e]+$/;
  for (const cat of ['porn', 'gambling', 'drugs']) {
    const enCount = ILLEGAL_PATTERNS[cat].filter(kw => ascii.test(kw)).length;
    assert.ok(enCount >= 3, `${cat} has only ${enCount} EN keywords, want ≥3`);
  }
});

test('blackhat is CN-heavy (黑灰产 is a Chinese-native industry term set)', () => {
  const cjk = /[\u4e00-\u9fa5]/;
  const cnCount = ILLEGAL_PATTERNS.blackhat.filter(kw => cjk.test(kw)).length;
  // Blackhat 14 keywords all CN — English terms like "trojan" are covered by
  // N-2 (Puppeteer blacklink scan, planned P2-4) which catches the link
  // pattern itself, not the textual keyword.
  assert.ok(cnCount >= 10, `blackhat has only ${cnCount} CN keywords, want ≥10`);
});

test('porn EN keywords: porn + xxx + adult', () => {
  assert.ok(ILLEGAL_PATTERNS.porn.includes('porn'));
  assert.ok(ILLEGAL_PATTERNS.porn.includes('xxx'));
  assert.ok(ILLEGAL_PATTERNS.porn.includes('adult'));
});

test('gambling EN keywords: casino + poker + betting + lottery', () => {
  for (const kw of ['casino', 'poker', 'betting', 'lottery']) {
    assert.ok(ILLEGAL_PATTERNS.gambling.includes(kw));
  }
});

// ─── Match-content integration with detector-like text matching ───────
function matchContent(text) {
  // Replicate detector.js matchContent logic
  const tags = [];
  for (const [category, keywords] of Object.entries(ILLEGAL_PATTERNS)) {
    const matches = keywords.filter(kw => text.includes(kw));
    if (matches.length > 0) tags.push(category + ':' + matches.length);
  }
  return tags;
}

test('matchContent: CN page with 色情+裸聊 → porn:2', () => {
  const tags = matchContent('欢迎来到色情网站，提供裸聊服务');
  assert.deepEqual(tags, ['porn:2']);
});

test('matchContent: EN page with porn+hentai → porn:2', () => {
  const tags = matchContent('Free porn and hentai videos');
  assert.deepEqual(tags, ['porn:2']);
});

test('matchContent: CN gambling page → gambling:2 (赌博+百家乐)', () => {
  const tags = matchContent('在线赌博平台，百家乐游戏');
  assert.ok(tags.includes('gambling:2'));
});

test('matchContent: 菠菜/博彩 only triggers blackhat, not gambling', () => {
  const tags = matchContent('菠菜平台 博彩游戏');
  assert.ok(tags.includes('blackhat:2'));
  assert.ok(!tags.includes('gambling:1'), '菠菜 must not double-tag as gambling');
});

test('matchContent: drug page with 冰毒+大麻+mdma → drugs:3', () => {
  const tags = matchContent('出售冰毒大麻mdma');
  assert.deepEqual(tags, ['drugs:3']);
});

test('matchContent: clean page (no keywords) returns []', () => {
  const tags = matchContent('This is a clean technology blog about web development');
  assert.deepEqual(tags, []);
});

test('matchContent: case-insensitive EN keyword matching', () => {
  // detector.js lowercases the text before calling matchContent
  const tags = matchContent('Porn and XXX videos'.toLowerCase());
  assert.ok(tags.includes('porn:2'));
});

test('matchContent: substring match — "可卡因" inside "出售可卡因中" matches', () => {
  // Behavior under test: detector uses .includes() which is substring match.
  // A "出售可卡因中" page will match. This is intentional — Chinese keywords
  // are not whole-word-matchable without CJK segmentation.
  const tags = matchContent('出售可卡因中');
  assert.deepEqual(tags, ['drugs:1']);
});

test('matchContent: multi-category page → multiple tags', () => {
  // A site that's both porn AND blackhat (common — spam sites mix categories)
  const tags = matchContent('色情裸聊 + 刷粉服务 + 博彩平台');
  assert.ok(tags.includes('porn:2'));
  assert.ok(tags.includes('blackhat:2'));
  // 博彩 is blackhat, NOT gambling — gambling shouldn't be triggered here
  assert.ok(!tags.includes('gambling:1'));
});

test('matchContent: counts unique keyword matches, not occurrences', () => {
  // Use a word that doesn't substring-overlap with another keyword.
  // (Earlier draft used "色情色情色情" which substring-matches both 色情 and 情色 —
  // a known limitation of substring matching on CJK, documented in v1.2 ADR.)
  const tags = matchContent('裸聊裸聊裸聊');
  // '裸聊' is the only matching keyword
  assert.deepEqual(tags, ['porn:1']);
});

test('KNOWN LIMITATION: CJK substring matching causes cross-keyword overlap', () => {
  // "色情" substring-contains "情色" (characters are adjacent in "色情").
  // Both keywords match the same 6-character input, so it counts as 2 unique
  // matches. This is intentional — CJK doesn't have word boundaries and a
  // full segmentation pass would be O(n²) for a 50-keyword list.
  // Mitigation: weight by category, not keyword count, in future v1.3.
  const tags = matchContent('色情色情色情');
  assert.equal(tags.length, 1);
  assert.equal(tags[0], 'porn:2');  // 色情 + 情色 both matched
});

test('matchContent: each category independently counted', () => {
  // 2 porn + 3 gambling + 1 drugs = 3 tags
  const tags = matchContent('色情 约炮 赌博 百家乐 老虎机 冰毒');
  assert.ok(tags.includes('porn:2'));
  assert.ok(tags.includes('gambling:3'));
  assert.ok(tags.includes('drugs:1'));
});

// ─── v1.2 new keywords are present (regression guard) ────────────────
const v12_NEW = {
  porn:    ['裸聊', '一夜情', '约炮'],
  gambling: ['21点', '德州扑克', '时时彩'],
  drugs:   ['可卡因', 'k粉', '摇头丸'],
  blackhat: ['代充', '解封', '黑客', '木马', '病毒'],
};
for (const [cat, kws] of Object.entries(v12_NEW)) {
  test(`v1.2 expansion: ${cat} has new keywords ${kws.join(',')}`, () => {
    for (const kw of kws) {
      assert.ok(ILLEGAL_PATTERNS[cat].includes(kw), `${kw} missing from ${cat}`);
    }
  });
}

// ─── v1.1 keywords are preserved (no regression) ──────────────────────
const v11_KEYWORDS = {
  porn:    ['成人', '色情', 'porn', 'xxx', 'hentai', '黄色', '情色', 'adult'],
  // Note: 'av' was removed in v1.2.QA — it caused false positives on every
  // website with favicon.ico (fa**v**icon contains "av"). A 2-char keyword
  // is too short to be reliable; consider re-adding only when paired with
  // other signals (co-occurrence filter in v1.3).
  gambling: ['赌博', '赌场', '百家乐', '轮盘', '老虎机', 'casino', 'poker', 'betting', 'lottery'],
  drugs:   ['毒品', '冰毒', '大麻', '海洛因', '麻黄碱', 'weed', 'cannabis', 'mdma', 'lsd'],
  blackhat: ['刷粉', '刷单', '刷赞', '刷票', '代刷', '外挂', '私服', '菠菜', '博彩'],
};
for (const [cat, kws] of Object.entries(v11_KEYWORDS)) {
  test(`v1.1 keywords preserved in ${cat}`, () => {
    for (const kw of kws) {
      assert.ok(ILLEGAL_PATTERNS[cat].includes(kw), `v1.1 keyword "${kw}" missing from ${cat}`);
    }
  });
}
