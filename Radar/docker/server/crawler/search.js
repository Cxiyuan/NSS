export async function searchSearxng(query, _apiKey, _cx, count = 10) {
  const baseUrl = process.env.SEARXNG_BASE_URL || 'http://localhost:4000';
  const params = new URLSearchParams({ q: query, format: 'json', count: String(Math.min(count, 10)) });
  const url = `${baseUrl.replace(/\/+$/, '')}/search?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`SearXNG error ${res.status}`);
  const data = await res.json();
  return (data.results || []).map(item => ({
    url: item.url,
    title: item.title,
    snippet: item.content || item.snippet || '',
  }));
}

export function searchEngine(name) {
  return { name: 'searxng', search: (query, _apiKey, _cx) => searchSearxng(query, _apiKey, _cx) };
}
