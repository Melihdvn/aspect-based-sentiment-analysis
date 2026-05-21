import { BaseReviewScraper } from './BaseReviewScraper.js';

class TrendyolScraper extends BaseReviewScraper {
  constructor(logger) {
    super('trendyol', logger);
  }

  async scrape(url, maxItems, traceId) {
    let reviewUrl = url;
    if (!url.includes('/yorumlar')) {
      const base = url.split('?')[0];
      if (base.includes('-p-')) {
        reviewUrl = base + '/yorumlar';
      }
    }

    return this.executeScrape(reviewUrl, maxItems, traceId, async (page) => {
      let allReviews = [];
      let lastCount = 0;
      let noGrowthStreak = 0;
      const maxNoGrowth = 4;

      while (allReviews.length < maxItems && noGrowthStreak < maxNoGrowth) {
        // Single page.evaluate() call — no per-element round-trips
        const batch = await page.evaluate(() => {
          const results = [];
          // Trendyol review selectors (multiple fallbacks)
          const containers = document.querySelectorAll(
            'article.comment, .comment, [data-testid="comment"], .rnr-com-w'
          );
          for (const c of containers) {
            const text =
              c.querySelector('.commentText, .rnr-com-tx, [class*="commentText"], [class*="comment-text"], .comment-text')
                ?.innerText?.trim() || '';
            const author =
              c.querySelector('.rnr-com-usr, [class*="username"], .user-name, [class*="authorName"]')
                ?.innerText?.trim() || '';
            const ratingEl = c.querySelector('[class*="star"][class*="full"], [class*="Stars"] span, .rnr-star-full');
            const rating = ratingEl ? ratingEl.closest('[aria-label]')?.getAttribute('aria-label') || '' : '';
            if (text && text.length > 5) {
              results.push({ text, author, rating });
            }
          }
          return results;
        });

        const seen = new Set(allReviews.map(r => r.text));
        for (const r of batch) {
          if (!seen.has(r.text)) {
            allReviews.push(r);
            seen.add(r.text);
          }
        }

        if (allReviews.length > lastCount) {
          noGrowthStreak = 0;
        } else {
          noGrowthStreak++;
        }
        lastCount = allReviews.length;

        // Scroll — pure JS wait, no Playwright networkidle
        await page.evaluate(() => window.scrollBy(0, 1800));
        await this.delay(900);
      }

      this.logger.info(`TrendyolScraper: collected ${allReviews.length} reviews`, { platform: 'trendyol', traceId });
      return allReviews.slice(0, maxItems);
    });
  }
}

export { TrendyolScraper };
