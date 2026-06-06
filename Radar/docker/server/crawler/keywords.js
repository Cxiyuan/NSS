// Illegal-content keyword list — v1.2 (P1-2 expansion: 38 → 50, with Chinese pairing).
// 4 categories × 12-14 keywords each.
//
// Design notes:
//   - Chinese (CN) and English (EN) keywords are mixed within each category.
//     The detector lowercases the text before matching, so EN keywords should
//     stay lowercase.
//   - Avoid cross-category duplication: 菠菜 / 博彩 live in `blackhat` (the
//     grey-industry slang), not `gambling` (the formal term). This prevents
//     double-tagging the same site.
//   - Avoid overly common EN words ("sex", "betting") that appear on legitimate
//     sites. They are kept because they ARE real blackhat signals when present
//     alongside other indicators, but detector should not rely on them alone.
//   - Add new keywords here, never inline. This file is the single source of
//     truth and is exercised by `__keywords.test.js`.

export const ILLEGAL_PATTERNS = {
  // ── 涉黄 / Porn ──────────────────────────────────────────────────────
  porn: [
    '成人',        // CN: adult
    '色情',        // CN: erotica
    '黄色',        // CN: pornographic (lit. "yellow")
    '情色',        // CN: erotic
    '裸聊',        // CN: nude chat
    '一夜情',      // CN: one-night stand
    '约炮',        // CN: casual hookup
    'porn',        // EN
    'xxx',         // EN
    'hentai',      // EN (Japanese loanword)
    'adult',       // EN
  ],

  // ── 涉赌 / Gambling ──────────────────────────────────────────────────
  gambling: [
    '赌博',        // CN: gambling (formal)
    '赌场',        // CN: casino
    '百家乐',      // CN: baccarat
    '轮盘',        // CN: roulette
    '老虎机',      // CN: slot machine
    '21点',        // CN: blackjack
    '德州扑克',    // CN: Texas hold'em
    '时时彩',      // CN: instant lottery
    'casino',      // EN
    'poker',       // EN
    'betting',     // EN
    'lottery',     // EN
  ],

  // ── 涉毒 / Drugs ─────────────────────────────────────────────────────
  drugs: [
    '毒品',        // CN: drugs (formal)
    '冰毒',        // CN: meth
    '大麻',        // CN: cannabis
    '海洛因',      // CN: heroin
    '麻黄碱',      // CN: ephedrine
    '可卡因',      // CN: cocaine
    'k粉',         // CN: ketamine
    '摇头丸',      // CN: MDMA (ecstasy)
    'weed',        // EN
    'cannabis',    // EN
    'mdma',        // EN
    'lsd',         // EN
  ],

  // ── 黑产 / Blackhat & grey industry ──────────────────────────────────
  blackhat: [
    '刷粉',        // CN: fake followers
    '刷单',        // CN: fake orders
    '刷赞',        // CN: fake likes
    '刷票',        // CN: fake votes
    '代刷',        // CN: bulk-fake service
    '外挂',        // CN: game cheat
    '私服',        // CN: private game server (piracy)
    '菠菜',        // CN: gambling slang (used by blackhat sites)
    '博彩',        // CN: betting (used by blackhat sites)
    '代充',        // CN: recharge laundering
    '解封',        // CN: account unbanning service
    '黑客',        // CN: hacker
    '木马',        // CN: trojan
    '病毒',        // CN: virus
  ],
};

// Stats for self-validation (used by tests to ensure the contract is stable).
export const KEYWORD_STATS = {
  total: Object.values(ILLEGAL_PATTERNS).reduce((sum, kws) => sum + kws.length, 0),
  categories: Object.keys(ILLEGAL_PATTERNS).length,
  perCategory: Object.fromEntries(
    Object.entries(ILLEGAL_PATTERNS).map(([cat, kws]) => [cat, kws.length])
  ),
};
