class UrlNormalizer {
  static normalizeAmazon(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      // Amazon URLs have product code as DP /gp/product/ /dp/
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
        // Strip out the extra stuff and keep the canonical ASIN format
        return `https://www.amazon.com.tr/dp/${asin}`;
      }

      // If ASIN not found, strip all search params
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      return url;
    }
  }

  static normalizeTrendyol(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      const paramsToKeep = ['merchantId', 'boutiqueId'];
      const searchParams = new URLSearchParams();
      
      for (const p of paramsToKeep) {
        if (u.searchParams.has(p)) {
          searchParams.set(p, u.searchParams.get(p));
        }
      }

      u.search = searchParams.toString();
      u.hash = '';
      return u.toString().replace(/[\u21B5\s]/g, '');
    } catch {
      return url;
    }
  }

  static normalizeHepsiburada(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      u.search = '';
      u.hash = '';
      const clean = u.toString();
      // Ensure reviews page canonical form if requested
      return clean;
    } catch {
      return url;
    }
  }

  static normalize(url) {
    if (!url) return '';
    const cleanUrl = url.trim().replace(/[\u21B5\r\n\t]/g, '');
    
    if (cleanUrl.includes('amazon.')) {
      return this.normalizeAmazon(cleanUrl);
    }
    if (cleanUrl.includes('trendyol.com')) {
      return this.normalizeTrendyol(cleanUrl);
    }
    if (cleanUrl.includes('hepsiburada.com')) {
      return this.normalizeHepsiburada(cleanUrl);
    }
    return cleanUrl;
  }
}

export { UrlNormalizer };
