import { BaseSearchProvider } from './BaseSearchProvider.js';
import { ProductMatcher } from '../matching/ProductMatcher.js';
import { AkakceResolver } from '../resolvers/AkakceResolver.js';

class AkakceProvider extends BaseSearchProvider {
  constructor(logger) {
    super('akakce', logger);
  }

  async search(query, traceId) {
    return this.withIsolatedPage(traceId, async (page) => {
      this.logger.info(`Searching Akakçe for "${query}"`, { platform: this.platform, traceId });
      const searchUrl = `https://www.akakce.com/arama/?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(3000);

      // Get up to 10 product details pages from Akakçe search results
      const productLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('li.p-c_v8 a, .srp-list a, .s_pr_v8 a'))
          .map(el => {
            const title = el.getAttribute('title') || el.innerText || '';
            const href = el.getAttribute('href') || '';
            return { title, href };
          })
          .filter(p => p.href && p.href.includes('.html'))
          .slice(0, 10);
      });

      this.logger.info(`Found ${productLinks.length} raw search candidates on Akakçe`, { platform: this.platform, traceId });

      const resolvedMerchantLinks = {
        amazon: [],
        trendyol: [],
        hepsiburada: []
      };

      for (const candidate of productLinks) {
        const fullTitle = candidate.title;
        const isMatch = ProductMatcher.match(query, fullTitle);

        if (!isMatch) {
          this.logger.info(`Skipped non-matching product on Akakçe: "${fullTitle}"`, { platform: this.platform, traceId });
          continue;
        }

        const candidateUrl = candidate.href.startsWith('http') ? candidate.href : 'https://www.akakce.com' + candidate.href;
        this.logger.info(`MATCH_FOUND: Found matching Akakçe product page: "${fullTitle}" -> ${candidateUrl}`, {
          platform: this.platform,
          traceId
        });

        // Open details page to extract sales platforms
        await page.goto(candidateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await this.delay(2000);

        const rawSalesLinks = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('span.v_v8 a, .m-p_v8 a, a[class*="price"]'))
            .map(el => el.getAttribute('href'))
            .filter(href => href && href.startsWith('/c/?z='));
        });

        this.logger.info(`Found ${rawSalesLinks.length} redirect links on product page`, { platform: this.platform, traceId });

        // Resolve each redirect link
        for (const relativeRedirect of rawSalesLinks) {
          const redirectUrl = 'https://www.akakce.com' + relativeRedirect;
          const resolvedUrl = await AkakceResolver.resolve(redirectUrl, traceId, this.logger);
          
          if (resolvedUrl) {
            if (resolvedUrl.includes('amazon.com.tr') || resolvedUrl.includes('amazon.com')) {
              resolvedMerchantLinks.amazon.push(resolvedUrl);
            } else if (resolvedUrl.includes('trendyol.com')) {
              resolvedMerchantLinks.trendyol.push(resolvedUrl);
            } else if (resolvedUrl.includes('hepsiburada.com')) {
              resolvedMerchantLinks.hepsiburada.push(resolvedUrl);
            }
          }
        }
      }

      // Deduplicate arrays
      for (const p of Object.keys(resolvedMerchantLinks)) {
        resolvedMerchantLinks[p] = Array.from(new Set(resolvedMerchantLinks[p]));
      }

      this.logger.info(`Completed Akakçe discovery. Discovered links:`, {
        platform: this.platform,
        traceId,
        discovered: resolvedMerchantLinks
      });

      return resolvedMerchantLinks;
    });
  }
}

export { AkakceProvider };
