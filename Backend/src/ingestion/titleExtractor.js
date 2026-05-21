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
    let slug = '';
    let brand = '';
    
    if (url.includes('trendyol.com')) {
      const parts = pathname.split('/');
      if (parts.length > 2) {
        brand = parts[1];
        slug = parts[2].split('-p-')[0];
      } else {
        slug = pathname.split('-p-')[0].split('/').pop();
      }
    } else if (url.includes('hepsiburada.com')) {
      slug = pathname.split('-p-')[0].split('/').pop();
    } else if (url.includes('amazon.')) {
      const parts = pathname.split('/');
      const dpIdx = parts.indexOf('dp');
      if (dpIdx > 0) slug = parts[dpIdx - 1];
      else slug = parts.pop();
    }
    
    if (!slug) slug = pathname.split('/').pop();
    
    let title = slug.replace(/-/g, ' ').replace(/\d{5,}/g, '').trim();
    if (brand) {
      brand = brand.replace(/-/g, ' ').trim();
      if (!title.toLowerCase().startsWith(brand.toLowerCase())) {
        title = brand + ' ' + title;
      }
    }
    return title;
  } catch {
    return '';
  }
}

export function combineDOMTitleWithUrlInfo(domTitle, url) {
  if (!domTitle || !url) return domTitle || '';
  
  let brandFromUrl = '';
  try {
    const u = new URL(url);
    const pathname = u.pathname;
    
    if (url.includes('trendyol.com')) {
      const parts = pathname.split('/');
      if (parts.length > 2 && parts[1] !== 'sr' && parts[1] !== 'p') {
        brandFromUrl = parts[1];
      }
    } else if (url.includes('hepsiburada.com')) {
      const slug = pathname.split('-p-')[0].split('/').pop();
      if (slug) {
        brandFromUrl = slug.split('-')[0];
      }
    } else if (url.includes('amazon.')) {
      const parts = pathname.split('/');
      const dpIdx = parts.indexOf('dp');
      const slug = dpIdx > 0 ? parts[dpIdx - 1] : parts.pop();
      if (slug) {
        brandFromUrl = slug.split('-')[0];
      }
    }
  } catch {}

  if (brandFromUrl) {
    const cleanBrand = brandFromUrl.replace(/-/g, ' ').trim();
    if (cleanBrand.length > 1) {
      const lowerTitle = domTitle.toLowerCase();
      const lowerBrand = cleanBrand.toLowerCase();
      if (!lowerTitle.includes(lowerBrand)) {
        return cleanBrand + ' ' + domTitle;
      }
    }
  }
  
  return domTitle;
}

export async function extractTitleFromAmazon(page, url) {
  try {
    await page.waitForSelector('#productTitle, h1.a-size-large, a[data-hook="product-link"], h1', { timeout: 5000 }).catch(() => {});
    const title = await page.evaluate(() => {
      let brand = document.querySelector('#bylineInfo, a#bylineInfo, #brand')?.innerText?.trim() || '';
      if (brand) {
        brand = brand.replace(/^(?:Marka|Brand|Visit the|Ziyaret edin)\s*:\s*/i, '')
                     .replace(/\s*(?:Mağazasını Ziyaret Edin|Store|Mağazası)\s*$/i, '')
                     .trim();
      }
      
      const dpTitle = document.querySelector('#productTitle')?.innerText?.trim();
      let name = '';
      if (dpTitle) name = dpTitle;
      else {
        const reviewTitle = document.querySelector('a[data-hook="product-link"]')?.innerText?.trim();
        if (reviewTitle) name = reviewTitle;
        else {
          const h1 = document.querySelector('h1.a-size-large, h1')?.innerText?.trim();
          if (h1) {
            let cleanH1 = h1.replace(/^(?:Müşteri Değerlendirmeleri|Customer Reviews|Tüm Değerlendirmeler|All Reviews)\s*:\s*/i, '').trim();
            if (cleanH1.toLowerCase() !== 'tüm değerlendirmeler' && cleanH1.toLowerCase() !== 'müşteri değerlendirmeleri') {
              name = cleanH1;
            }
          }
        }
      }

      if (brand && name) {
        const lowerName = name.toLowerCase();
        const lowerBrand = brand.toLowerCase();
        if (!lowerName.startsWith(lowerBrand)) {
          return brand + ' ' + name;
        }
      }
      return name || brand || '';
    });
    const finalTitle = title || (url ? extractTitleFromUrl(url) : '');
    return combineDOMTitleWithUrlInfo(finalTitle, url);
  } catch {
    const finalTitle = url ? extractTitleFromUrl(url) : '';
    return combineDOMTitleWithUrlInfo(finalTitle, url);
  }
}

export async function extractTitleFromTrendyol(page, url) {
  try {
    await page.waitForSelector('h1.pr-new-br, h1[class*="product-name"], h1[class*="product-title"], .product-name h1', { timeout: 5000 }).catch(() => {});
    const title = await page.evaluate(() => {
      const brand = document.querySelector('h1.pr-new-br a, .product-brand-name a, a.product-brand-name, [data-testid="brand-name"], .product-brand')?.innerText?.trim() || '';
      const h1 = document.querySelector('h1.pr-new-br span, h1[class*="product-name"], h1[class*="product-title"], .product-name h1, h1')?.innerText?.trim() || '';
      
      let name = h1;
      if (!name) {
        try { name = window.__NEXT_DATA__?.props?.pageProps?.product?.name || ''; } catch { name = ''; }
      }

      if (brand && name) {
        const lowerName = name.toLowerCase();
        const lowerBrand = brand.toLowerCase();
        if (!lowerName.startsWith(lowerBrand)) {
          return brand + ' ' + name;
        }
      }
      return name || brand || '';
    }).catch(() => '');
    const finalTitle = title || (url ? extractTitleFromUrl(url) : '');
    return combineDOMTitleWithUrlInfo(finalTitle, url);
  } catch {
    const finalTitle = url ? extractTitleFromUrl(url) : '';
    return combineDOMTitleWithUrlInfo(finalTitle, url);
  }
}

export async function extractTitleFromHepsiburada(page, url) {
  try {
    await page.waitForSelector('h1[itemprop="name"], h1.product-name, h1[class*="product"], h1', { timeout: 5000 }).catch(() => {});
    const title = await page.evaluate(() => {
      const brand = document.querySelector('span.brand-name, [itemprop="brand"], .product-brand-name, .product-brand')?.innerText?.trim() || '';
      let name = document.querySelector('h1[itemprop="name"], h1.product-name, h1[class*="product"], h1')?.innerText?.trim() || '';
      
      if (!name) {
        try {
          const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const s of scripts) {
            const d = JSON.parse(s.textContent);
            if (d?.name) { name = d.name; break; }
          }
        } catch {}
      }

      if (brand && name) {
        const lowerName = name.toLowerCase();
        const lowerBrand = brand.toLowerCase();
        if (!lowerName.startsWith(lowerBrand)) {
          return brand + ' ' + name;
        }
      }
      return name || brand || '';
    }).catch(() => '');
    const finalTitle = title || (url ? extractTitleFromUrl(url) : '');
    return combineDOMTitleWithUrlInfo(finalTitle, url);
  } catch {
    const finalTitle = url ? extractTitleFromUrl(url) : '';
    return combineDOMTitleWithUrlInfo(finalTitle, url);
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

export function isTitleMatch(target, scraped) {
  if (!target || !scraped) return false;
  const t = target.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const s = scraped.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  
  const ignore = ['ve', 'ile', 'mouse', 'oyuncu', 'kablosuz', 'gaming', 'optik', 'sarjli', 'kablolu', 'renk', 'siyah', 'beyaz', 'fiyati', 'fiyatlari'];
  const tWords = t.split(/\s+/).filter(w => w.length >= 2 && !ignore.includes(w));
  const sWords = s.split(/\s+/).filter(w => w.length >= 2 && !ignore.includes(w));

  if (tWords.length === 0 || sWords.length === 0) return false;

  // En azından markanın (ilk kelime) eşleşmesi kritik
  const firstWordMatch = sWords.includes(tWords[0]) || tWords.includes(sWords[0]);
  
  let matches = 0;
  for (const w of tWords) {
    if (sWords.includes(w)) matches++;
  }
  
  // Önemli kelimelerin en az %50'si veya en az 2 tanesi eşleşmeli
  const ratio = matches / tWords.length;
  return firstWordMatch && (ratio >= 0.5 || matches >= 2);
}
