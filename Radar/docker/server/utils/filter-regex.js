// Filter regex helpers — v1.2 fix: 9.2.5 (extracted from FilterEngine for testability).
// v1.2 also fixes: the original implementation only escaped `.`, allowing
// ReDoS patterns like `(a+)+b` to cause event-loop DoS.

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

// Convert a domain-filter pattern (with optional leading wildcards) into a
// RegExp that matches a hostname. The semantics:
//   "qq.com"            → /^qq\.com$/          (exact)
//   "*.example.com"     → /^(?:.+\.)?example\.com$/  (bare or any subdomain)
//   "*example.com"      → /example\.com$/      (suffix)
// All other regex meta chars in the pattern body are escaped to literal.
export function patternToRegex(pattern) {
  if (pattern.startsWith('*.')) {
    return new RegExp('(?:^.+\\.)?' + escapeRegex(pattern.slice(2)) + '$');
  }
  if (pattern.startsWith('*')) {
    return new RegExp(escapeRegex(pattern.slice(1)) + '$');
  }
  return new RegExp('^' + escapeRegex(pattern) + '$');
}
