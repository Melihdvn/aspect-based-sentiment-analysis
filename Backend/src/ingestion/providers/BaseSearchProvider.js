import { globalBrowserPool } from '../browser/BrowserPool.js';
import { globalMetrics } from '../metrics/MetricsCollector.js';

class BaseSearchProvider {
  constructor(platform, logger) {
    this.platform = platform;
    this.logger = logger;
  }

  async search(query, traceId) {
    throw new Error('search() must be implemented by derived class');
  }

  async withIsolatedPage(traceId, callback) {
    const startTime = Date.now();
    
    // Acquire a completely isolated context and page for this search task
    const { context, page } = await globalBrowserPool.acquireContextAndPage(this.platform);
    
    try {
      this.logger.info(`SEARCH_STARTED: Starting product search for platform...`, {
        platform: this.platform,
        traceId
      });
      const result = await callback(page);
      
      const duration = Date.now() - startTime;
      globalMetrics.recordScrape(this.platform, duration, 0);
      
      return result;
    } catch (e) {
      globalMetrics.recordPlatformFailure(this.platform);
      this.logger.error(`Search failed: ${e.message}`, {
        platform: this.platform,
        traceId
      });
      throw e;
    } finally {
      // Safely close and dispose of the isolated context
      await globalBrowserPool.releaseContext(context);
    }
  }

  isSponsored(title, htmlContent = '') {
    const lowerTitle = String(title || '').toLowerCase();
    const lowerHtml = String(htmlContent || '').toLowerCase();

    const sponsoredTokens = ['sponsored', 'sponsorlu', 'reklam', 'ad-card', 'sponsored-label'];
    
    for (const token of sponsoredTokens) {
      if (lowerTitle.includes(token) || lowerHtml.includes(token)) {
        return true;
      }
    }
    return false;
  }

  // Safe delay helper using pure Javascript setTimeout (never crashes on page close)
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { BaseSearchProvider };
