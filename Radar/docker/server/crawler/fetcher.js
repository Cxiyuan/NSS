import * as cheerio from 'cheerio';

export async function fetchAndParse(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WebCrawler/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
    });
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error(`Non-HTML content type: ${contentType}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim();

  return { html, title };
}
