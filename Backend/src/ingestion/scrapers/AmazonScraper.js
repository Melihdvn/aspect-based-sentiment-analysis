import { BaseReviewScraper } from './BaseReviewScraper.js';

class AmazonScraper extends BaseReviewScraper {
  constructor(logger) {
    super('amazon', logger);
  }

  async scrape(url, maxItems, traceId) {
    let reviewUrl = url;
    try {
      const u = new URL(url);
      const pathname = u.pathname;
      const parts = pathname.split('/');
      let asin = '';
      
      const dpIdx = parts.indexOf('dp');
      if (dpIdx !== -1 && parts[dpIdx + 1]) {
        asin = parts[dpIdx + 1];
      } else {
        const gpIdx = parts.indexOf('product');
        if (gpIdx !== -1 && parts[gpIdx + 1]) {
          asin = parts[gpIdx + 1];
        }
      }

      if (asin) {
        reviewUrl = `https://www.amazon.com.tr/product-reviews/${asin}/ref=cm_cr_arp_d_viewopt_sr?ie=UTF8&reviewerType=all_reviews&sortBy=recent`;
      }
    } catch {}

    return this.executeScrape(reviewUrl, maxItems, traceId, async (page) => {
      let reviews = [];
      let pageNum = 1;
      const maxPages = 5;

      while (reviews.length < maxItems && pageNum <= maxPages) {
        const pageUrl = `${reviewUrl}&pageNumber=${pageNum}`;
        if (pageNum > 1) {
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await this.delay(2000);
        }

        const pageReviews = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('[data-hook="review-body"], .review-text'))
            .map(el => {
              const text = el.innerText?.trim();
              const container = el.closest('.review, [id^="customer_review-"]');
              const author = container?.querySelector('.a-profile-name')?.innerText?.trim() || '';
              const ratingEl = container?.querySelector('[data-hook="review-star-rating"], .review-rating');
              const rating = ratingEl?.innerText?.trim() || '';
              return { text, author, rating };
            })
            .filter(r => r.text && r.text.length > 5);
        });

        if (pageReviews.length === 0) break;
        reviews.push(...pageReviews);
        pageNum++;
      }

      return reviews.slice(0, maxItems);
    });
  }
}

export { AmazonScraper };
