/**
 * Parse a keyword input string into search tokens.
 * Quoted phrases are treated as atomic; space-separated words as individual tokens.
 *
 * Examples:
 *   parseKeywords('"machine learning" AI')        → ['machine learning', 'ai']
 *   parseKeywords('北京 上海 "精确匹配"')           → ['北京', '上海', '精确匹配']
 *   parseKeywords('hello world')                   → ['hello', 'world']
 *   parseKeywords('')                              → []
 *   parseKeywords('   ')                           → []
 */
export function parseKeywords(input) {
  const phrases = [];
  const regex = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    const token = match[1] || match[2] || match[3];
    // Skip empty strings and bare quote pairs (e.g. "" or '')
    if (token && token !== '""' && token !== "''") phrases.push(token.toLowerCase());
  }
  return phrases;
}
