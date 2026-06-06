import puppeteer from 'puppeteer';

// v1.2.QA Sprint 1 A2-6: Puppeteer browser singleton TOCTOU fix.
// Previous bug: two concurrent `launchBrowser()` calls could each see
// `browser === null`, both call `puppeteer.launch()`, and end up with
// TWO browser processes (one leaked). The leaked process holds a Chromium
// instance and ~100MB RAM forever.
//
// Fix: cache the LAUNCH PROMISE, not just the resolved browser. Concurrent
// callers `await` the same promise. If the launch fails, the cached
// promise is rejected, callers can retry (and we reset so the next call
// re-launches).
let browser = null;
let launchPromise = null;

export async function launchBrowser() {
  // v1.2.QA Sprint 1 A2-6: while a launch is in-flight, share its promise
  if (launchPromise) {
    return launchPromise;
  }
  // If a previous browser reference is dead, clean up first
  if (browser) {
    try {
      if (browser.isConnected()) return browser;
    } catch {
      // browser reference is dead; reset
    }
    try { await browser.close(); } catch {}
    browser = null;
  }
  const opts = {};
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  launchPromise = puppeteer.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
    ...opts,
  }).then((b) => {
    browser = b;
    launchPromise = null;  // resolved — release the slot
    // If the browser later disconnects, clear the reference
    b.on('disconnected', () => {
      if (browser === b) browser = null;
    });
    return b;
  }).catch((err) => {
    launchPromise = null;  // failed — let the next call retry
    throw err;
  });
  return launchPromise;
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
  // Also clear any in-flight launch promise so a concurrent fetchWithBrowser
  // doesn't get a stale reference after we close.
  launchPromise = null;
  if (browser) {
    await browser.close();
    browser = null;
  }
}
