import { BaseReviewScraper } from './BaseReviewScraper.js';

class HepsiburadaScraper extends BaseReviewScraper {
  constructor(logger) {
    super('hepsiburada', logger);
  }

  async scrape(url, maxItems, traceId) {
    let reviewUrl = url;
    if (!url.includes('-yorumlari')) {
      const clean = url.split('?')[0];
      reviewUrl = `${clean}-yorumlari`;
    }

    return this.executeScrape(reviewUrl, maxItems, traceId, async (page) => {
      // PHASE 1: Primary Extractor - JSON-LD Metadata extraction
      let reviews = await page.evaluate(() => {
        try {
          const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          const found = [];
          for (const s of scripts) {
            const d = JSON.parse(s.textContent);
            if (d && d.review) {
              const items = Array.isArray(d.review) ? d.review : [d.review];
              for (const r of items) {
                const text = r.reviewBody?.trim();
                const author = r.author?.name || '';
                const rating = r.reviewRating?.ratingValue || '';
                if (text && text.length > 5) {
                  found.push({ text, author, rating });
                }
              }
            }
          }
          return found;
        } catch {
          return [];
        }
      });

      if (reviews.length > 0) {
        this.logger.info(`Successfully parsed ${reviews.length} reviews using JSON-LD Primary Extractor`, {
          platform: this.platform,
          traceId
        });
      }

      // PHASE 2: Fallback Extractor - DOM parser (paginated crawling)
      if (reviews.length === 0) {
        this.logger.info(`JSON-LD empty. Initializing DOM Fallback Extractor...`, {
          platform: this.platform,
          traceId
        });
        
        let pageNum = 1;
        const maxPages = 5;
        
        while (reviews.length < maxItems && pageNum <= maxPages) {
          const pageUrl = `${reviewUrl}?sayfa=${pageNum}`;
          if (pageNum > 1) {
            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
            await this.delay(2000);
          }

          const pageReviews = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('[itemprop="description"], .review-text, span[class*="comment"]'))
              .map(el => {
                const text = el.innerText?.trim();
                const container = el.closest('.review-item, [class*="comment"]');
                const author = container?.querySelector('[itemprop="author"], .author-name, span[class*="user"]')?.innerText?.trim() || '';
                const rating = container?.querySelector('[itemprop="reviewRating"], .rating-value')?.innerText?.trim() || '';
                return { text, author, rating };
              })
              .filter(r => r.text && r.text.length > 5);
          });

          if (pageReviews.length === 0) break;
          reviews.push(...pageReviews);
          pageNum++;
        }
      }

      return reviews.slice(0, maxItems);
    });
  }
}

export { HepsiburadaScraper };
