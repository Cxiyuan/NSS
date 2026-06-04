// Blacklink pattern detection — pure functions, no cheerio dependency.
// Extracted from link-extractor.js so it's unit-testable locally without npm install.
// All consumers go through detectBlacklinkFromAttrs().

// CSS patterns that hide an element from users but keep it in the DOM
// (and thus visible to search engine crawlers). These are the canonical
// techniques SEO spammers use for blacklinks.
const HIDDEN_CSS_PATTERNS = [
  /display\s*:\s*none/i,
  /display\s*:\s*none\s*!important/i,             // CSS specificity override
  /visibility\s*:\s*hidden/i,
  /opacity\s*:\s*0(?:\.0+)?(?:[\s;}!]|$)/i,      // 0 / 0.0 / 0% (just the 0 form)
  /width\s*:\s*0(?:px|rem|em|%)?(?:\s|;|}|$)/i, // 0 / 0px / 0% (avoid matching "10px")
  /height\s*:\s*0(?:px|rem|em|%)?(?:\s|;|}|$)/i,
  /font-size\s*:\s*0(?:px|rem|em|%)?(?:\s|;|}|$)/i,
  /line-height\s*:\s*0(?:px|rem|em|%)?(?:\s|;|}|$)/i,
  /text-indent\s*:\s*-\s*\d{3,}px/i,             // -9999px
  // v1.2: allow semicolons to appear between position:absolute and offset values
  // Real-world CSS: `position:absolute;left:-9999px` — the offset is in a
  // separate declaration. We allow any combination of `;` and whitespace
  // between the position declaration and the offset.
  //
  // v1.2.6: also match `position:fixed` (same off-screen technique) — SEO
  // spammers use `fixed` + negative offsets to escape the viewport, identical
  // to `absolute` semantically.
  /position\s*:\s*(?:absolute|fixed)[\s;]*(?:[^;}]*?;)?\s*(?:left|top|right|bottom)\s*:\s*-\s*\d{3,}px/i,
  /clip(?:-path)?\s*:\s*(?:rect|inset)\s*\(\s*0/i,
  // v1.2: allow optional length units (0px, 0rem, 0em) on the zero argument
  // Real-world CSS: `transform:scale(0px)` / `transform:translate(0px, -9999px)`
  /transform\s*:\s*(?:scale|translate)\s*\(\s*0(?:px|rem|em|%)?(?:\.0+)?\s*[,\)]/i,
  /z-index\s*:\s*-\s*\d{3,}/i,                  // -9999
  // v1.2.7: overflow:hidden is benign by itself, but combined with
  // height:0 or max-height:0 it creates a "collapsed" container that
  // hides any content (links, text) from view. We flag the combination
  // by looking for overflow:hidden AND a zero-size constraint in the same
  // declaration block, in either order.
  /overflow\s*:\s*hidden[\s;]+(?:[^;}]*?(?:height|width|max-height|max-width)\s*:\s*0(?:px|rem|em|%)?(?:\s|;|}|$))/i,
  /((?:height|width|max-height|max-width)\s*:\s*0(?:px|rem|em|%)?(?:\s|;|}|$)[\s;]+(?:[^;}]*?)overflow\s*:\s*hidden)/i,
];

// Class / id names that are common in known blacklink schemes
// (collapses cleanly to 0 false-positive for legitimate classes)
const SUSPICIOUS_CLASS_RE = /\b(?:seo[-_]?spam|black[-_]?link|hidden[-_]?link|sponsored|affiliate|paid[-_]?link|ad[-_]?slot)\b/i;

// Pure-function blacklink detection on raw HTML attribute values.
// Returns null if no blacklink signal, or { reason: string } otherwise.
// `attrs` is { style?, class?, id? } — only these three are inspected.
export function detectBlacklinkFromAttrs(attrs) {
  const inline = attrs.style || '';
  if (inline) {
    for (const pat of HIDDEN_CSS_PATTERNS) {
      const m = inline.match(pat);
      if (m) {
        return { reason: 'css-hide:' + m[0].trim().slice(0, 64) };
      }
    }
  }
  const cls = attrs.class || '';
  const id  = attrs.id   || '';
  if (SUSPICIOUS_CLASS_RE.test(cls) || SUSPICIOUS_CLASS_RE.test(id)) {
    return { reason: 'class:' + (cls || id) };
  }
  return null;
}
