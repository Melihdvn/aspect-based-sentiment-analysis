class DomainLimiter {
  constructor() {
    this.limits = {
      amazon: 2,
      trendyol: 3,
      hepsiburada: 2,
      akakce: 3,
      unknown: 2
    };
    
    this.running = {
      amazon: 0,
      trendyol: 0,
      hepsiburada: 0,
      akakce: 0,
      unknown: 0
    };

    this.queues = {
      amazon: [],
      trendyol: [],
      hepsiburada: [],
      akakce: [],
      unknown: []
    };
  }

  async enqueue(platform, taskFn) {
    const p = this.limits[platform] !== undefined ? platform : 'unknown';
    
    return new Promise((resolve, reject) => {
      this.queues[p].push({ taskFn, resolve, reject });
      this._processQueue(p);
    });
  }

  _processQueue(platform) {
    const queue = this.queues[platform];
    const max = this.limits[platform];
    
    while (queue.length > 0 && this.running[platform] < max) {
      const { taskFn, resolve, reject } = queue.shift();
      this.running[platform]++;

      // Execute task with randomized start delay (cooldown/anti-bot protection)
      const startDelay = Math.floor(Math.random() * 800) + 200;
      
      setTimeout(async () => {
        try {
          const res = await taskFn();
          resolve(res);
        } catch (err) {
          reject(err);
        } finally {
          this.running[platform]--;
          this._processQueue(platform);
        }
      }, startDelay);
    }
  }

  // Wrapper with retry budget and exponential backoff
  async executeWithRetry(platform, taskName, taskFn, logger, maxRetries = 3) {
    let delay = 2000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.enqueue(platform, taskFn);
      } catch (err) {
        const isNetworkOrTimeout = err.message?.includes('timeout') || err.message?.includes('Navigation');
        
        logger.warn(`Task "${taskName}" failed (Attempt ${attempt}/${maxRetries}): ${err.message}`, {
          platform,
          retry: attempt,
          error: err.message
        });

        if (attempt === maxRetries) {
          logger.error(`Task "${taskName}" completely failed after ${maxRetries} attempts.`, {
            platform,
            error: err.message
          });
          throw err;
        }

        // Wait with exponential backoff + randomized jitter
        const jitter = Math.floor(Math.random() * 1000);
        const sleepTime = delay * Math.pow(2, attempt - 1) + jitter;
        logger.info(`Sleeping for ${sleepTime}ms before retrying "${taskName}"...`, { platform });
        await new Promise(resolve => setTimeout(resolve, sleepTime));
      }
    }
  }
}

const globalDomainLimiter = new DomainLimiter();
export { DomainLimiter, globalDomainLimiter };
