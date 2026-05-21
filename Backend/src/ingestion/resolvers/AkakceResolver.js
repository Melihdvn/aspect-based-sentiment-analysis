import fetch from 'node-fetch';
import { UrlNormalizer } from '../normalization/UrlNormalizer.js';

class AkakceResolver {
  static async resolve(url, traceId, logger) {
    if (!url) return '';
    
    // If it's already a direct merchant link, return it immediately normalized
    if (!url.includes('akakce.com/c/')) {
      return UrlNormalizer.normalize(url);
    }

    try {
      logger.info(`Resolving Akakçe redirect: ${url}`, { platform: 'akakce', traceId });
      
      // Perform a light fetch with redirection disabled or enabled to capture location header
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        redirect: 'manual', // intercept redirect
        timeout: 10000
      });

      let redirectUrl = res.headers.get('location');
      if (redirectUrl) {
        logger.info(`Resolved redirect location header: ${redirectUrl}`, { platform: 'akakce', traceId });
        return UrlNormalizer.normalize(redirectUrl);
      }

      // If manual redirect didn't catch, try following it fully
      const followRes = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });

      if (followRes.url && !followRes.url.includes('akakce.com/c/')) {
        logger.info(`Resolved fully followed redirect: ${followRes.url}`, { platform: 'akakce', traceId });
        return UrlNormalizer.normalize(followRes.url);
      }
      
      return '';
    } catch (e) {
      logger.warn(`Failed resolving redirect URL: ${e.message}`, { platform: 'akakce', traceId });
      return '';
    }
  }
}

export { AkakceResolver };
