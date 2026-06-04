// WebSocket auth helper — v1.2 fix: 9.2.4.
// Use Sec-WebSocket-Protocol header to send the auth token, not the URL
// query string. Tokens in URLs appear in server access logs, browser
// history, and Referer headers; protocol headers are never logged.
//
// Server (ws/handler.js) accepts both forms:
//   - protocol: 'Bearer <token>' (with prefix) → strips to <token>
//   - protocol: '<token>' (bare) → matches directly
//   - query:    ?token=<token> (legacy fallback)
//
// This helper returns the constructor args for `new WebSocket(...)`.

export function buildWebSocketAuthArgs(url, token) {
  if (!token) return [url];
  // Prefer protocol header. Wrap in try/catch because some very old
  // browsers reject unknown subprotocols (newer browsers always accept).
  return [url, [token]];
}

export function buildWebSocketUrlWithTokenFallback(url, token) {
  if (!token) return url;
  // Only called if the protocol-header approach failed. Append as query
  // so server's existing `?token=` check still works.
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
