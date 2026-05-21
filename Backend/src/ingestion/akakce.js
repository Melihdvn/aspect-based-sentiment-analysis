import { withPage } from './search_playwright.js';

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Akakçe üzerinden ürün arayıp platform linklerini toplar.
 */
export async function scrapeAkakceForLinks(query) {
  return withPage(async (page) => {
    console.log(`[Akakçe] Aranıyor: ${query}`);
    await page.goto(`https://www.akakce.com/arama/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
    
    // Zaten detay sayfasındaysak
    if (page.url().includes(',fiyatlari') || page.url().includes(',223') || (await page.locator('h1').count() > 0 && !page.url().includes('/arama/'))) {
      console.log(`[Akakçe] Zaten detay sayfasındayız: ${page.url()}`);
    } else {
      const products = page.locator('li[data-pr] a, .bt_v8, a[href*="/fiyatlari/"]');
      const count = await products.count();
      let firstProduct = null;
      
      for (let i = 0; i < Math.min(count, 5); i++) {
        const p = products.nth(i);
        const pText = (await p.innerText()).toLowerCase();
        const forbidden = ['askı', 'aparat', 'kılıf', 'koruyucu', 'cam', 'kordon', 'çanta', 'kapak'];
        const isAccessory = forbidden.some(word => pText.includes(word)) && !query.toLowerCase().includes('askı') && !query.toLowerCase().includes('aparat');
        
        if (!isAccessory) {
          firstProduct = p;
          break;
        }
      }

      if (!firstProduct) {
        console.warn("[Akakçe] Uygun (aksesuar olmayan) ürün bulunamadı.");
        return {};
      }

      const detailUrl = await firstProduct.getAttribute('href');
      const fullDetailUrl = detailUrl.startsWith('http') ? detailUrl : 'https://www.akakce.com' + detailUrl;
      console.log(`[Akakçe] Ürün detayına gidiliyor: ${fullDetailUrl}`);
      await page.goto(fullDetailUrl, { waitUntil: 'domcontentloaded' });
    }
    
    await delay(2000);

    const links = await page.evaluate(() => {
      const results = {};
      const allLinks = Array.from(document.querySelectorAll('a'));
      const merchantMap = {
        'amazon': 'amazon',
        'trendyol': 'trendyol',
        'hepsiburada': 'hepsiburada',
        'n11': 'n11',
        'pazarama': 'pazarama',
        'ciceksepeti': 'ciceksepeti'
      };

      allLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        const text = (link.innerText || '').toLowerCase();
        
        const isOffer = href.includes('/c/?') || href.includes('/r/?') || href.includes('git=');
        if (!isOffer) return;

        let parent = link.parentElement;
        let merchantName = '';
        
        for (let i = 0; i < 3 && parent; i++) {
          const pText = (parent.innerText || '').toLowerCase();
          const imgs = Array.from(parent.querySelectorAll('img'));
          const altText = imgs.map(img => (img.getAttribute('alt') || img.getAttribute('src') || '').toLowerCase()).join(' ');
          const combined = pText + ' ' + altText + ' ' + text;

          for (const [key, val] of Object.entries(merchantMap)) {
            if (combined.includes(key)) {
              merchantName = val;
              break;
            }
          }
          if (merchantName) break;
          parent = parent.parentElement;
        }

        if (merchantName && !results[merchantName]) {
          results[merchantName] = href.startsWith('http') ? href : 'https://www.akakce.com' + href;
        }
      });
      return results;
    });

    const title = await page.innerText('h1').catch(() => '');
    return { links, title };
  }, 'akakce').catch(e => {
    console.error(`[Akakçe] Error: ${e.message}`);
    return { links: {}, title: '' };
  });
}
