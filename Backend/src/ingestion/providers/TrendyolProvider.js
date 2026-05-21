import { BaseSearchProvider } from './BaseSearchProvider.js';
import { ProductMatcher } from '../matching/ProductMatcher.js';

class TrendyolProvider extends BaseSearchProvider {
  constructor(logger) {
    super('trendyol', logger);
  }

  async search(query, traceId) {
    return this.withIsolatedPage(traceId, async (page) => {
      this.logger.info(`[TrendyolProvider] Searching for "${query}"`, { platform: this.platform, traceId });
      const searchUrl = `https://www.trendyol.com/sr?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(1500);

      // Single page.evaluate() — extract all cards in ONE browser call
      const candidates = await page.evaluate(() => {
        const results = [];
        const cards = document.querySelectorAll('.p-card-wrppr, [data-testid="product-card"], .card-item');
        for (const card of cards) {
          // Skip sponsored
          if (card.innerText.toLowerCase().includes('sponsorlu') ||
              card.innerText.toLowerCase().includes('sponsored')) continue;

          const titleEl = card.querySelector(
            '.prdct-desc-cntnr-ttl, [class*="product-title"], [class*="title"], h3'
          );
          const title = titleEl?.innerText?.trim() || '';

          const linkEl = card.querySelector('a[href*="-p-"]');
          const href = linkEl?.getAttribute('href') || '';

          if (title && href) results.push({ title, href });
          if (results.length >= 10) break;
        }
        return results;
      });

      const matches = [];
      for (const { title, href } of candidates) {
        if (ProductMatcher.match(query, title)) {
          const fullUrl = href.startsWith('http') ? href : 'https://www.trendyol.com' + href;
          this.logger.info(`MATCH_FOUND [Trendyol]: "${title}"`, { platform: this.platform, traceId });
          matches.push(fullUrl);
        }
      }
      return matches;
    });
  }
}

export { TrendyolProvider };
