// SSRF guard — blocks private/loopback/link-local addresses and DNS names
// that resolve to them. v1.2 fix: 9.2.1 + 9.2.2 — used at BOTH task
// creation (routes/tasks.js) AND external fetch in worker.js.
//
// Returns true for hosts that should be rejected, false for legitimate public
// hosts. Caller should reject with HTTP 400 / log / mark as blocked.
//
// What is blocked:
//   - localhost + .localhost, ip6-localhost, ip6-loopback, broadcasthost
//   - IPv4 loopback (127.0.0.0/8)
//   - IPv4 private (RFC 1918: 10/8, 172.16/12, 192.168/16)
//   - IPv4 link-local (169.254/16) + CGNAT (100.64/10) + 0.0.0.0/8
//   - IPv4 reserved/documentation/multicast (192.0.0/24, 192.0.2/24, 198.18/15, 224/4, 240/4)
//   - IPv6 loopback (::1), unspecified (::), link-local (fe80/10)
//   - IPv6 unique-local (fc00::/7), multicast (ff00::/8)
//   - IPv4-mapped IPv6 (::ffff:*) — Node normalizes these
//
// What is NOT blocked (legitimate public hosts):
//   - Public IPv4 / IPv6
//   - Public DNS names (baidu.com, github.com, etc.)
//   - Cloud provider internal DNS (e.g. .internal.) — out of scope; deploy-side
export function isBlockedHost(host) {
  if (!host) return true;
  // WHATWG URL returns IPv6 hostname WITH brackets, e.g. '[fe80::1]'
  // Strip them before testing
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  // 1) Hostname aliases that always point to the local machine
  if (h === 'localhost' || h === 'localhost.' || h.endsWith('.localhost') ||
      h === 'ip6-localhost' || h === 'ip6-loopback' ||
      h === 'broadcasthost' || h === '0.0.0.0') {
    return true;
  }
  // 2) IPv4 loopback (127.0.0.0/8)
  if (/^127\./.test(h)) return true;
  // 3) IPv4 private ranges (RFC 1918)
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  // 4) IPv4 link-local (169.254/16)
  if (/^169\.254\./.test(h)) return true;
  // 5) IPv4 carrier-grade NAT (100.64/10)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  // 6) IPv4 reserved / documentation / multicast
  if (/^0\./.test(h)) return true;
  if (/^192\.0\.0\./.test(h) || /^192\.0\.2\./.test(h)) return true;
  if (/^198\.(18|19)\./.test(h)) return true;
  if (/^2(2[4-9]|[3-5]\d)\./.test(h)) return true;            // 224.0.0.0/4 multicast
  if (/^240\./.test(h) || h === '255.255.255.255') return true; // 240/4 reserved + broadcast
  // 7) IPv6
  if (h === '::1' || h === '::') return true;
  if (/^fe[89ab][0-9a-f]?:/i.test(h)) return true;
  if (/^fc[0-9a-f]{2}:/i.test(h) || /^fd[0-9a-f]{2}:/i.test(h)) return true;
  if (/^ff[0-9a-f]{2}:/i.test(h)) return true;
  // 8) IPv4-mapped IPv6
  if (/^::ffff:/i.test(h)) return true;
  return false;
}
