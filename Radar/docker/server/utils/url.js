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

export function getDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length <= 2) return parts.join('.');
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    if (sld.length <= 3 && tld.length <= 3 && parts.length >= 3) {
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
