import { globalBrowserPool } from '../browser/BrowserPool.js';
import { globalMetrics } from '../metrics/MetricsCollector.js';
import { globalDomainLimiter } from '../queue/DomainLimiter.js';

class BaseReviewScraper {
  constructor(platform, logger) {
    this.platform = platform;
    this.logger = logger;
  }

  async scrape(url, maxItems, traceId) {
    throw new Error('scrape() must be implemented by derived class');
  }

  async executeScrape(url, maxItems, traceId, scrapeCallback) {
    const startTime = Date.now();
    
    this.logger.info(`SCRAPE_STARTED: Beginning review ingestion for: ${url}`, {
      platform: this.platform,
      traceId
    });

    const taskFn = async () => {
      // 1. Each attempt acquires a completely fresh, isolated browser context and page
      const { context, page } = await globalBrowserPool.acquireContextAndPage(this.platform);
      
      try {
        // Safe navigation with timeout recovery
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Pure JS crawler delay (never throws when context closes)
        const delay = Math.floor(Math.random() * 1000) + 500;
        await this.delay(delay);

        // Check for CAPTCHA/bot detection
        const hasCaptcha = await this.detectCaptcha(page);
        if (hasCaptcha) {
          this.logger.warn(`CAPTCHA_DETECTED: Captcha blocked scrape. Fresh context retry triggered...`, {
            platform: this.platform,
            traceId
          });
          globalMetrics.recordPlatformFailure(this.platform);
          throw new Error('CAPTCHA_DETECTED');
        }

        // Run platform-specific reviews extractor callback
        const reviews = await scrapeCallback(page);
        
        const duration = Date.now() - startTime;
        globalMetrics.recordScrape(this.platform, duration, reviews.length);
        
        this.logger.info(`SCRAPE_FINISHED: Successfully scraped ${reviews.length} reviews.`, {
          platform: this.platform,
          traceId,
          durationMs: duration
        });

        return reviews;
      } catch (e) {
        globalMetrics.recordPlatformFailure(this.platform);
        throw e;
      } finally {
        // 2. Safe, task-level context teardown
        await globalBrowserPool.releaseContext(context);
      }
    };

    // Integrate with domain rate limiter and exponential retries
    try {
      return await globalDomainLimiter.executeWithRetry(
        this.platform,
        `Scrape ${this.platform} reviews`,
        taskFn,
        this.logger,
        3
      );
    } catch {
      return [];
    }
  }

  async detectCaptcha(page) {
    const pageText = await page.innerText('body').catch(() => '');
    const captchaKeywords = [
      'captcha',
      'robot değil',
      'not a robot',
      'security check',
      'automated access',
      'verify you are a human',
      'sıra dışı trafik',
      'bot detection'
    ];
    
    for (const kw of captchaKeywords) {
      if (pageText.toLowerCase().includes(kw)) {
        return true;
      }
    }
    return false;
  }

  // Safe timeout helper using native Javascript setTimeout
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { BaseReviewScraper };
