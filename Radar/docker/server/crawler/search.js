export async function searchGoogle(query, apiKey, cx, count = 10) {
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: String(Math.min(count, 10)),
  });
  const url = `https://www.googleapis.com/customsearch/v1?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Search API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.items || []).map(item => ({
    url: item.link,
    title: item.title,
    snippet: item.snippet || '',
  }));
}

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

export async function searchBing(query, apiKey, count = 10) {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(count, 10)),
  });
  const url = `https://api.bing.microsoft.com/v7.0/search?${params}`;
  const res = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bing Search API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return ((data.webPages && data.webPages.value) || []).map(item => ({
    url: item.url,
    title: item.name,
    snippet: item.snippet || '',
  }));
}

export function searchEngine(name) {
  switch (name.toLowerCase()) {
    case 'google':
      return { name: 'google', search: (query, apiKey, cx) => searchGoogle(query, apiKey, cx) };
    case 'bing':
      return { name: 'bing', search: (query, apiKey) => searchBing(query, apiKey) };
    case 'searxng':
      return { name: 'searxng', search: (query, apiKey, cx) => searchSearxng(query, apiKey, cx) };
    default:
      throw new Error(`Unknown search engine: ${name}`);
  }
}
