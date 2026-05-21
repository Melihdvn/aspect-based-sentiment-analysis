import { chromium } from 'playwright';
import { globalMetrics } from '../metrics/MetricsCollector.js';

/**
 * BrowserPool - Manages a single persistent Chromium browser instance.
 *
 * Design principles:
 * - ONE browser instance shared across all tasks (never recreated during a session)
 * - Each task gets its OWN isolated BrowserContext + Page (no sharing)
 * - Closing a context NEVER affects other running tasks
 * - No page pool / recycling (eliminates all stale-page race conditions)
 */
class BrowserPool {
  constructor() {
    this._browser = null;
    this._launchPromise = null; // serializes concurrent launch calls
  }

  /**
   * Returns the shared browser, launching it exactly once.
   */
  async _getBrowser() {
    // Already alive → return immediately
    if (this._browser?.isConnected()) {
      return this._browser;
    }

    // Another caller is already launching → wait for it
    if (this._launchPromise) {
      return this._launchPromise;
    }

    // We are the first caller → launch
    this._launchPromise = (async () => {
      console.log('[BrowserPool] Launching browser...');
      this._browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--no-first-run',
        ],
      });

      // If the browser ever crashes, clear the reference so the next
      // acquireContextAndPage call will re-launch it cleanly.
      this._browser.on('disconnected', () => {
        console.warn('[BrowserPool] Browser disconnected. Will re-launch on next request.');
        this._browser = null;
        this._launchPromise = null;
      });

      console.log('[BrowserPool] Browser ready.');
      this._launchPromise = null; // release the serialization lock
      return this._browser;
    })();

    return this._launchPromise;
  }

  /**
   * Acquires an **isolated** context + page for one scraping task.
   * The caller MUST call releaseContext(context) in a finally block.
   *
   * @param {string} platform - For resource-blocking metrics tagging.
   * @returns {{ context, page }}
   */
  async acquireContextAndPage(platform = 'unknown') {
    const browser = await this._getBrowser();

    const ua = this._randomUA();
    const context = await browser.newContext({
      userAgent: ua,
      viewport: { width: 1920, height: 1080 },
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
      extraHTTPHeaders: { 
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const page = await context.newPage();

    // Advanced Stealth Evasions
    await page.addInitScript(() => {
      // WebDriver Masking
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // Chrome properties simulation
      window.chrome = { runtime: {} };
      // Fake Plugins
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      // Fake Languages
      Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
      // Permissions Masking
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    await this._blockExpensiveResources(page, platform);
    return { context, page };
  }

  /**
   * Disposes of a task's isolated context.
   * Safe to call even if context is already closed.
   *
   * @param {import('playwright').BrowserContext} context
   */
  async releaseContext(context) {
    if (!context) return;
    await context.close().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  //  Internals
  // ---------------------------------------------------------------------------

  async _blockExpensiveResources(page, platform) {
    await page.route('**/*', (route, request) => {
      const type = request.resourceType();
      const url  = request.url();

      const blocked = type === 'image' || type === 'media' || type === 'font';
      const tracking =
        url.includes('google-analytics') ||
        url.includes('doubleclick')      ||
        url.includes('hotjar')           ||
        url.includes('facebook.com/tr');

      if (blocked || tracking) {
        globalMetrics.recordBlockedResource(platform, type);
        route.abort();
      } else {
        route.continue();
      }
    });
  }

  _randomUA() {
    const UAs = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    ];
    return UAs[Math.floor(Math.random() * UAs.length)];
  }

  async closeAll() {
    if (this._browser) {
      await this._browser.close().catch(() => {});
      this._browser = null;
      this._launchPromise = null;
    }
  }
}

// --------------------------------------------------------------------------
// Singleton – one pool for the entire process lifetime.
// --------------------------------------------------------------------------
const globalBrowserPool = new BrowserPool();

// Graceful shutdown on SIGTERM / SIGINT so Chromium doesn't linger.
const _shutdown = async () => {
  console.log('[BrowserPool] Shutting down...');
  await globalBrowserPool.closeAll();
  process.exit(0);
};
process.once('SIGTERM', _shutdown);
process.once('SIGINT',  _shutdown);

export { BrowserPool, globalBrowserPool };
