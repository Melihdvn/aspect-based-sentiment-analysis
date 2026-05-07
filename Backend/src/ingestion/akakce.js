import { chromium } from 'playwright';

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== '0';
const NAV_TIMEOUT = 30000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function withPage(fn) {
  const browser = await chromium.launch({ 
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR'
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  try {
    return await fn(page);
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Akakçe üzerinden ürün arayıp platform linklerini toplar.
 */
export async function scrapeAkakceForLinks(query) {
  return withPage(async (page) => {
    console.log(`[Akakçe] Aranıyor: ${query}`);
    await page.goto(`https://www.akakce.com/arama/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
    
    // Eğer halihazırda bir ürün detay sayfasındaysak (tek sonuç durumu)
    if (page.url().includes(',fiyatlari') || page.url().includes(',223') || await page.locator('h1').count() > 0 && !page.url().includes('/arama/')) {
      console.log(`[Akakçe] Zaten detay sayfasındayız: ${page.url()}`);
    } else {
      // Tüm ürünleri bul ve aksesuar olmayan ilkini seç
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
    
    await page.waitForTimeout(2000);

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
        // Akakce'de satıcı isimleri listelerde <li> veya <tr> içinde olur.
        // Çok fazla yukarı (6 seviye) çıkmak tablonun tamamını kapsayıp yanlış satıcıları eşleştirebiliyor.
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
  });
}
