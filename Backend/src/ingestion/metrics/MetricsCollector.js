class MetricsCollector {
  constructor() {
    this.metrics = {
      scrapeDuration: {},
      reviewsCollected: {},
      retries: {},
      blockedResources: {},
      failedSelectors: {},
      timeoutRecoveries: {},
      platformFailureCount: {}
    };
  }

  recordScrape(platform, durationMs, reviewsCount) {
    if (!this.metrics.scrapeDuration[platform]) this.metrics.scrapeDuration[platform] = [];
    this.metrics.scrapeDuration[platform].push(durationMs);

    if (!this.metrics.reviewsCollected[platform]) this.metrics.reviewsCollected[platform] = 0;
    this.metrics.reviewsCollected[platform] += reviewsCount;
  }

  recordRetry(platform) {
    if (!this.metrics.retries[platform]) this.metrics.retries[platform] = 0;
    this.metrics.retries[platform]++;
  }

  recordBlockedResource(platform, resourceType) {
    if (!this.metrics.blockedResources[platform]) this.metrics.blockedResources[platform] = {};
    if (!this.metrics.blockedResources[platform][resourceType]) this.metrics.blockedResources[platform][resourceType] = 0;
    this.metrics.blockedResources[platform][resourceType]++;
  }

  recordFailedSelector(platform, selector) {
    if (!this.metrics.failedSelectors[platform]) this.metrics.failedSelectors[platform] = {};
    if (!this.metrics.failedSelectors[platform][selector]) this.metrics.failedSelectors[platform][selector] = 0;
    this.metrics.failedSelectors[platform][selector]++;
  }

  recordTimeoutRecovery(platform) {
    if (!this.metrics.timeoutRecoveries[platform]) this.metrics.timeoutRecoveries[platform] = 0;
    this.metrics.timeoutRecoveries[platform]++;
  }

  recordPlatformFailure(platform) {
    if (!this.metrics.platformFailureCount[platform]) this.metrics.platformFailureCount[platform] = 0;
    this.metrics.platformFailureCount[platform]++;
  }

  getSummary(platform) {
    const durations = this.metrics.scrapeDuration[platform] || [];
    const avgDuration = durations.length ? (durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const totalReviews = this.metrics.reviewsCollected[platform] || 0;
    const totalDurationSec = durations.reduce((a, b) => a + b, 0) / 1000;
    const speed = totalDurationSec > 0 ? (totalReviews / totalDurationSec) : 0;

    return {
      averageDurationMs: avgDuration.toFixed(2),
      totalReviewsCollected: totalReviews,
      reviewsPerSecond: speed.toFixed(2),
      retriesTriggered: this.metrics.retries[platform] || 0,
      blockedResources: this.metrics.blockedResources[platform] || {},
      failedSelectors: this.metrics.failedSelectors[platform] || {},
      timeoutRecoveries: this.metrics.timeoutRecoveries[platform] || 0,
      platformFailureCount: this.metrics.platformFailureCount[platform] || 0
    };
  }
}

// Global instance for sharing metrics
const globalMetrics = new MetricsCollector();
export { MetricsCollector, globalMetrics };
