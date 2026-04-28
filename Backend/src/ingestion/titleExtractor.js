/**
 * titleExtractor.js
 * Her platformdaki ürün sayfasından başlık çeker ve normalize eder.
 */

/**
 * URL'den ürün ismini tahmin eder.
 * @param {string} url 
 * @returns {string}
 */
export function extractTitleFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    // Slug kısmını bul: hepsiburada'da -p- den öncesi, amazon'da /dp/ den öncesi veya sonrası vb.
    let slug = '';
    if (url.includes('hepsiburada.com')) {
      slug = pathname.split('-p-')[0].split('/').pop();
    } else if (url.includes('trendyol.com')) {
      slug = pathname.split('-p-')[0].split('/').pop();
    } else if (url.includes('amazon.')) {
      const parts = pathname.split('/');
      const dpIdx = parts.indexOf('dp');
      if (dpIdx > 0) slug = parts[dpIdx - 1];
      else slug = parts.pop();
    }
    
    if (!slug) slug = pathname.split('/').pop();
    
    return slug.replace(/-/g, ' ').replace(/\d{5,}/g, '').trim();
  } catch {
    return '';
  }
}

export async function extractTitleFromAmazon(page, url) {
  try {
    await page.waitForSelector('#productTitle, h1.a-size-large, a[data-hook="product-link"], h1', { timeout: 5000 }).catch(() => {});
    const title = await page.evaluate(() => {
      const dpTitle = document.querySelector('#productTitle')?.innerText?.trim();
      if (dpTitle) return dpTitle;
      const reviewTitle = document.querySelector('a[data-hook="product-link"]')?.innerText?.trim();
      if (reviewTitle) return reviewTitle;
      const h1 = document.querySelector('h1.a-size-large, h1')?.innerText?.trim();
      if (h1) {
        let cleanH1 = h1.replace(/^(?:Müşteri Değerlendirmeleri|Customer Reviews|Tüm Değerlendirmeler|All Reviews)\s*:\s*/i, '').trim();
        if (cleanH1.toLowerCase() === 'tüm değerlendirmeler' || cleanH1.toLowerCase() === 'müşteri değerlendirmeleri') return '';
        return cleanH1;
      }
      return '';
    });
    return title || (url ? extractTitleFromUrl(url) : '');
  } catch {
    return url ? extractTitleFromUrl(url) : '';
  }
}

export async function extractTitleFromTrendyol(page, url) {
  try {
    await page.waitForSelector('h1.pr-new-br, h1[class*="product-name"], h1[class*="product-title"], .product-name h1', { timeout: 5000 }).catch(() => {});
    const title = await page.evaluate(() => {
      const h1 = document.querySelector('h1.pr-new-br, h1[class*="product-name"], h1[class*="product-title"], .product-name h1, h1')?.innerText?.trim();
      if (h1) return h1;
      try { return window.__NEXT_DATA__?.props?.pageProps?.product?.name || ''; } catch { return ''; }
    }).catch(() => '');
    return title || (url ? extractTitleFromUrl(url) : '');
  } catch {
    return url ? extractTitleFromUrl(url) : '';
  }
}

export async function extractTitleFromHepsiburada(page, url) {
  try {
    await page.waitForSelector('h1[itemprop="name"], h1.product-name, h1[class*="product"], h1', { timeout: 5000 }).catch(() => {});
    const title = await page.evaluate(() => {
      const h1 = document.querySelector('h1[itemprop="name"], h1.product-name, h1[class*="product"], h1')?.innerText?.trim();
      if (h1) return h1;
      try {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const s of scripts) {
          const d = JSON.parse(s.textContent);
          if (d?.name) return d.name;
        }
      } catch {}
      return '';
    }).catch(() => '');
    return title || (url ? extractTitleFromUrl(url) : '');
  } catch {
    return url ? extractTitleFromUrl(url) : '';
  }
}

export function normalizeTitle(rawTitle) {
  if (!rawTitle) return '';
  let t = rawTitle.trim();
  t = t.replace(/\([^)]{0,60}\)/g, ' ');
  t = t.replace(/\b\d{1,4}\s*(?:GB|TB|MB|mAh|MP|Hz|W|inch|inç|cm|mm)\b/gi, '');
  t = t.replace(/\b(?:siyah|beyaz|gri|gümüş|altın|mavi|kırmızı|yeşil|sarı|mor|turuncu|pembe|titanyum|titanium|platinum|gold|silver|black|white|blue|green|red|yellow|purple|space gr[ae]y|midnight|starlight|alpine|rose|graphite|sierra|pacific)\b/gi, '');
  t = t.replace(/\b(?:nano|esim|dual\s*sim|5g|4g|lte|wifi|wi-fi|bluetooth|nfc)\b/gi, '');
  t = t.replace(/\b[A-Z]{1,3}[-_]?[A-Z0-9]{3,10}\b/g, '');
  t = t.replace(/[:|/\\+\-–—]+/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/[:\-–—\s]+$/, '');
  const words = t.split(' ').filter(Boolean);
  if (words.length > 5) t = words.slice(0, 5).join(' ');
  return t.replace(/[:\-–—\s]+$/, '');
}
