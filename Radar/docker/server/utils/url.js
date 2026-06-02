export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase();
    u.protocol = u.protocol.toLowerCase();
    u.hash = '';
    if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) {
      u.port = '';
    }
    let result = u.toString();
    if (result.endsWith('/') && u.pathname === '/') {
      result = result.slice(0, -1);
    }
    return result;
  } catch {
    return null;
  }
}

// Known two-part TLDs (public suffix list subset) — used by getDomain
// to correctly identify registrable domains vs subdomains
const TWO_PART_TLDS = new Set([
  'co.uk', 'ac.uk', 'gov.uk', 'org.uk', 'net.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'sch.uk',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ed.jp',
  'co.kr', 'or.kr', 'ne.kr', 'go.kr', 'ac.kr',
  'co.nz', 'net.nz', 'org.nz',
  'co.in', 'net.in', 'org.in', 'ac.in', 'gov.in',
  'com.br', 'org.br', 'net.br', 'gov.br',
  'com.mx', 'org.mx', 'gob.mx',
  'com.ar', 'net.ar', 'org.ar', 'gov.ar',
  'co.il', 'org.il', 'ac.il', 'gov.il',
  'com.sg', 'edu.sg', 'gov.sg', 'org.sg',
  'com.hk', 'edu.hk', 'gov.hk', 'org.hk', 'net.hk',
  'co.th', 'or.th', 'ac.th', 'go.th', 'net.th',
  'co.za', 'ac.za', 'gov.za', 'org.za', 'net.za',
  'com.tw', 'edu.tw', 'gov.tw', 'org.tw', 'net.tw',
  'co.ve', 'com.ve', 'edu.ve', 'gob.ve', 'org.ve', 'net.ve',
]);

export function getDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length <= 2) return parts.join('.');
    // Check if the last two parts form a known two-part TLD (e.g. co.uk)
    const lastTwo = parts.slice(-2).join('.');
    if (TWO_PART_TLDS.has(lastTwo) && parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch {
    return null;
  }
}

export function isSameDomain(urlA, urlB) {
  return getDomain(urlA) === getDomain(urlB);
}

export function resolveUrl(href, baseUrl) {
  try {
    const url = new URL(href, baseUrl);
    let result = url.toString();
    // Strip trailing slash when pathname is root-only
    if (result.endsWith('/') && url.pathname === '/') {
      result = result.slice(0, -1);
    }
    return result;
  } catch {
    return null;
  }
}
