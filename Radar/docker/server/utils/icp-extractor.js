// ICP record extractor — pure functions, no cheerio dependency.
//
// Beian.miit.gov.cn ToS prohibits scraping, but the record number itself is
// publicly displayed in every site's footer as required by law. We extract the
// record number from HTML text — we do NOT contact beian.miit.gov.cn.
//
// Two record types are required in China:
//   1) 工信部 ICP 备案号: "京ICP备12345678号" / "沪ICP备20240001号-1"
//   2) 公安备案号:        "公网安备 33010002000001 号"
//
// Both must appear on every Chinese site. The 工信部 number is what regulators
// care about for compliance; the 公安 number is the second-stage approval.

// Province names (max 3 chars per official list) — used as a sanity check
// that the captured digits are not random "ICP123" noise.
const PROVINCE_RE = '(?:京|津|冀|晋|蒙|辽|吉|黑|沪|苏|浙|皖|闽|赣|鲁|豫|鄂|湘|粤|桂|琼|渝|川|蜀|黔|滇|藏|陕|甘|青|宁|新|港|澳|台)';

// 工信部备案号: <province>ICP<备|证><digits>号 optionally with sub-record "-<n>"
// Examples:
//   京ICP备12345678号
//   沪ICP备 20240001 号
//   粤ICP备20240001号-1
//   浙ICP备2024xxxxxx号-2
//   京ICP证030173号 (增值电信业务经营许可证，与 ICP 备同等法律效力)
// v1.2.QA: 接受 ICP证 (经营许可号), x/X 占位符, 蜀(四川)
// ([備备证]) captures the type char so output preserves it (not hardcoded 备)
const ICP_RE = new RegExp(
  `(${PROVINCE_RE})ICP\\s*([備备证])\\s*([\\dxX]{4,12})\\s*(?:号(?:[\\s\\-_/]*(\\d{1,4}))?)?`,
  'g'
);

// 公安备案号: "公网安备 33010002000001 号" / "公网安备33010002000001号"
const GONGAN_RE = new RegExp('公网安备\\s*(\\d{6,20})\\s*号?', 'g');

// 备案徽章链接 (highly reliable signal — official badge links to beian.miit.gov.cn)
const BEIAN_BADGE_RE = /beian\.miit\.gov\.cn/i;

// 公安徽章链接 (separate from textual 公网安备 to avoid double-counting)
const POLICE_BADGE_RE = /beian\.mps\.gov\.cn/i;

export function extractIcpFromHtml(html) {
  if (!html || typeof html !== 'string') return null;

  // Collect href attributes BEFORE stripping tags (so badge links are detected).
  // The official beian badges point to beian.miit.gov.cn / beian.mps.gov.cn.
  const hrefs = html.match(/\bhref\s*=\s*["']([^"']+)["']/gi) || [];
  const hrefBlob = hrefs.join(' ');

  const rawText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // v1.2 spambot defense: collapse obfuscation tricks before scanning.
  // Spammers split ICP numbers with spaces, zero-width chars, or full-width
  // digits to evade naïve `/\d+/` matching. We strip:
  //   - U+200B zero-width space, U+200C/D zero-width non-joiner/joiner
  //   - U+FEFF byte-order mark
  //   - Regular whitespace between CJK chars and digits (e.g. "京 ICP 备 1 2 3 号")
  //   - Full-width digits (U+FF10-U+FF19) → ASCII digits
  const text = collapseObfuscation(rawText).replace(/<[^>]+>/g, ' ');

  // Reset stateful regexes (they have /g flag)
  ICP_RE.lastIndex = 0;
  GONGAN_RE.lastIndex = 0;

  const icpMatch = ICP_RE.exec(text);
  let icp = null;
  if (icpMatch) {
    const [, province, type, number, sub] = icpMatch;
    // Normalize type: 備(繁)→备(简), preserve证 as-is
    const icpType = type === '備' ? '备' : type;
    icp = sub
      ? `${province}ICP${icpType}${number}号-${sub}`
      : `${province}ICP${icpType}${number}号`;
  }

  const gongAnMatch = GONGAN_RE.exec(text);
  const gongAn = gongAnMatch ? `公网安备${gongAnMatch[1]}号` : null;

  const hasBadge = BEIAN_BADGE_RE.test(hrefBlob) || BEIAN_BADGE_RE.test(text);
  const hasMpsBadge = POLICE_BADGE_RE.test(hrefBlob);

  if (!icp && !gongAn && !hasBadge && !hasMpsBadge) return null;

  return {
    icp,                 // 工信部备案号, e.g. "京ICP备12345678号", or null
    gongAn,              // 公安备案号, e.g. "公网安备33010002000001号", or null
    source: 'footer',    // always 'footer' for this extractor
    hasBadge,            // boolean — official MIIT badge anchor detected
    hasMpsBadge,         // boolean — official MPS badge anchor detected
    confidence: computeConfidence(icp, gongAn, hasBadge, hasMpsBadge),
  };
}

function computeConfidence(icp, gongAn, hasBadge, hasMpsBadge) {
  let score = 0;
  if (icp) score += 0.5;
  if (gongAn) score += 0.3;
  if (hasBadge) score += 0.4;
  if (hasMpsBadge) score += 0.2;
  return Math.min(1, Math.round(score * 100) / 100);
}

// v1.2: collapse common ICP-record obfuscation tricks that spammers use to
// evade the regex. We strip zero-width chars + full-width digits, and we
// collapse whitespace between CJK and ASCII characters so that
// "京 I C P 备 1 2 3 4 5 6 7 8 号" (with single-char splits) becomes
// "京ICP备12345678号" (or close enough to match).
//
// Iterated: e.g. "I C P" needs 2 passes to collapse to "ICP".
// Known trade-off: legitimate "He llo" (rare typo) also collapses to "Hello".
// In CJK-heavy footer text, the false-positive risk is negligible.
export function collapseObfuscation(html) {
  let result = html
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')        // zero-width chars
    .replace(/[\uFF10-\uFF19]/g, ch =>                  // full-width digits → ASCII
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // 4 passes is enough to collapse "I C P 备" → "ICP备" (2 passes for ICP,
  // 1 more for 备, 1 buffer).
  for (let i = 0; i < 4; i++) {
    const before = result;
      result = result
      .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')  // CJK → CJK
      .replace(/([\u4e00-\u9fa5])\s+([A-Za-z0-9])/g, '$1$2')      // CJK → ASCII
      .replace(/([A-Za-z0-9])\s+([\u4e00-\u9fa5])/g, '$1$2')      // ASCII → CJK
      .replace(/([A-Za-z0-9])\s+(?=[A-Za-z0-9])/g, '$1');         // any ASCII alnum pair
    if (result === before) break;
  }
  return result;
}
