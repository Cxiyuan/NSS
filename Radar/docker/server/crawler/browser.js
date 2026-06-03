import puppeteer from 'puppeteer';

let browser = null;

export async function launchBrowser() {
  // Check if existing browser instance is still alive — reconnect if crashed
  if (browser) {
    try {
      if (browser.isConnected()) return browser;
    } catch {
      // browser reference is dead; reset and re-launch
    }
    try { await browser.close(); } catch {}
    browser = null;
  }
  const opts = {};
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  browser = await puppeteer.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
    ...opts,
  });
  return browser;
}

export async function fetchWithBrowser(url) {
  const b = await launchBrowser();
  const page = await b.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (compatible; WebCrawler/1.0)');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
