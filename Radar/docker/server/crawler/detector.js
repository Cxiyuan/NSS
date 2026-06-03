const SUSPICIOUS_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'top', 'loan',
  'work', 'click', 'download', 'review', 'stream', 'trade',
  'webcam', 'win', 'bid', 'date', 'men',
]);

const ILLEGAL_PATTERNS = {
  porn: [
    '成人', '色情', 'av', 'porn', 'xxx', 'hentai',
    '18禁', '黄色', '情色', 'sex', 'adult',
  ],
  gambling: [
    '赌博', '赌场', '百家乐', '轮盘', '老虎机',
    'casino', 'poker', 'betting', 'lottery',
  ],
  drugs: [
    '毒品', '冰毒', '大麻', '海洛因', '麻黄碱',
    'weed', 'cannabis', 'mdma', 'lsd',
  ],
  blackhat: [
    '刷粉', '刷单', '刷赞', '刷票', '代刷',
    '外挂', '私服', '菠菜', '博彩',
  ],
};

function matchContent(text) {
  const tags = [];
  for (const [category, keywords] of Object.entries(ILLEGAL_PATTERNS)) {
    const matches = keywords.filter(kw => text.includes(kw));
    if (matches.length > 0) {
      tags.push(category + ':' + matches.length);
    }
  }
  return tags;
}

function checkHostReputation(hostname) {
  const tags = [];
  // Free/suspicious TLD
  const parts = hostname.split('.');
  const tld = parts[parts.length - 1];
  if (SUSPICIOUS_TLDS.has(tld)) tags.push('free-tld');
  // Bare IP address
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) tags.push('bare-ip');
  return tags;
}

// ICP cache: domain -> { icp, cachedAt }
const icpCache = new Map();
const ICP_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function checkICP(hostname) {
  // Check cache first
  const cached = icpCache.get(hostname);
  if (cached && Date.now() - cached.cachedAt < ICP_CACHE_TTL) {
    return cached.icp;
  }
  try {
    const baseUrl = process.env.ICP_QUERY_URL || 'http://127.0.0.1:16181';
    const res = await fetch(`${baseUrl}/query/url?search=${encodeURIComponent(hostname)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const icp = data?.icp || data?.data?.icp || null;
    icpCache.set(hostname, { icp, cachedAt: Date.now() });
    return icp;
  } catch {
    return null; // ICP service unavailable
  }
}

export async function detect(url, html) {
  const tags = [];
  try {
    const hostname = new URL(url).hostname.replace(/^\[|\]$/g, '');
    // Host reputation
    tags.push(...checkHostReputation(hostname));
    // Content analysis
    if (html) {
      const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
      tags.push(...matchContent(text));
    }
  } catch {}
  return tags;
}
