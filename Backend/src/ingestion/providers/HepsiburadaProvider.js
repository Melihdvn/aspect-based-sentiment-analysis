import { BaseSearchProvider } from './BaseSearchProvider.js';
import { ProductMatcher } from '../matching/ProductMatcher.js';

class HepsiburadaProvider extends BaseSearchProvider {
  constructor(logger) {
    super('hepsiburada', logger);
  }

  async search(query, traceId) {
    return this.withIsolatedPage(traceId, async (page) => {
      this.logger.info(`[HepsiburadaProvider] Searching for "${query}"`, { platform: this.platform, traceId });
      const searchUrl = `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(1500);

      // Single page.evaluate() — extract all candidates in ONE browser call
      const candidates = await page.evaluate(() => {
        const results = [];
        const cards = document.querySelectorAll(
          'li[class*="productListContent-item"], [data-test-id="product-card"], li[data-sku-id]'
        );
        for (const card of cards) {
          if (card.innerText.toLowerCase().includes('sponsorlu') ||
              card.innerText.toLowerCase().includes('sponsored')) continue;

          const titleEl = card.querySelector(
            '[data-test-id="product-card-name"], h3, [class*="title"], [class*="name"]'
          );
          const title = titleEl?.innerText?.trim() || '';

          const linkEl = card.querySelector('a');
          const href = linkEl?.getAttribute('href') || '';

          if (title && href) results.push({ title, href });
          if (results.length >= 10) break;
        }
        return results;
      });

      const matches = [];
      for (const { title, href } of candidates) {
        if (ProductMatcher.match(query, title)) {
          const fullUrl = href.startsWith('http') ? href : 'https://www.hepsiburada.com' + href;
          this.logger.info(`MATCH_FOUND [Hepsiburada]: "${title}"`, { platform: this.platform, traceId });
          matches.push(fullUrl);
        }
      }
      return matches;
    });
  }
}

export { HepsiburadaProvider };
