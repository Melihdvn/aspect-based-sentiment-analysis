import { BaseSearchProvider } from './BaseSearchProvider.js';
import { ProductMatcher } from '../matching/ProductMatcher.js';

class AmazonProvider extends BaseSearchProvider {
  constructor(logger) {
    super('amazon', logger);
  }

  async search(query, traceId) {
    return this.withIsolatedPage(traceId, async (page) => {
      this.logger.info(`[AmazonProvider] Searching for "${query}"`, { platform: this.platform, traceId });
      const searchUrl = `https://www.amazon.com.tr/s?k=${encodeURIComponent(query)}`;

      // Use 'load' instead of networkidle — Amazon SPA never truly reaches networkidle
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(1500);

      // CAPTCHA / bot wall check
      const pageTitle = await page.title().catch(() => '');
      if (pageTitle.toLowerCase().includes('robot') || pageTitle.toLowerCase().includes('captcha')) {
        this.logger.warn(`[AmazonProvider] Bot wall detected, skipping`, { platform: this.platform, traceId });
        return [];
      }

      // Single page.evaluate() — ONE call extracts all candidates
      const candidates = await page.evaluate(() => {
        const results = [];
        const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
        for (const card of cards) {
          // Skip sponsored
          const sponsorEl = card.querySelector('.s-label-popover-default, [data-component-type="sp-sponsored-result"]');
          if (sponsorEl) continue;

          const html = card.innerHTML;
          if (html.toLowerCase().includes('sponsorlu') || html.toLowerCase().includes('sponsored')) continue;

          const titleEl = card.querySelector('h2 a span, h2 span');
          const title = titleEl?.innerText?.trim() || '';

          const linkEl = card.querySelector('h2 a');
          const href = linkEl?.getAttribute('href') || '';

          if (title && href) results.push({ title, href });
          if (results.length >= 10) break;
        }
        return results;
      });

      const matches = [];
      for (const { title, href } of candidates) {
        if (ProductMatcher.match(query, title)) {
          const fullUrl = href.startsWith('http') ? href : 'https://www.amazon.com.tr' + href;
          this.logger.info(`MATCH_FOUND [Amazon]: "${title}"`, { platform: this.platform, traceId });
          matches.push(fullUrl);
        }
      }
      return matches;
    });
  }
}

export { AmazonProvider };
