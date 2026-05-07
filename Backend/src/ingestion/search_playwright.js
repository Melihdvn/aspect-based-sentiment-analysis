import { chromium } from 'playwright';
import {
  extractTitleFromAmazon,
  extractTitleFromTrendyol,
  extractTitleFromHepsiburada,
  normalizeTitle
} from './titleExtractor.js';

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== '0';
const NAV_TIMEOUT = Number(process.env.SCRAPER_NAV_TIMEOUT_MS || 30000);
const SCRAPE_TIMEOUT = Number(process.env.SCRAPER_TIMEOUT_MS || 30000);
const MAX_SCROLL = Number(process.env.SCRAPER_SCROLL_STEPS || 30);
const UA = process.env.SCRAPER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function handleAmazonConsent(page) {
  const accept = page.locator('#sp-cc-accept, input#sp-cc-accept, button#sp-cc-accept, button[name="accept"], [name="accept"]');
  if (await accept.count()) {
    await accept.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}


export async function withPage(fn) {
  const browser = await chromium.launch({ 
    headless: HEADLESS,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certifcate-errors',
      '--ignore-certifcate-errors-spki-list',
      '--user-agent=' + UA
    ]
  });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    extraHTTPHeaders: { 
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    }
  });
  const page = await context.newPage();
  // Gelişmiş Stealth Evasions
  await page.addInitScript(() => {
    // Webdriver maskeleme
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // Chrome eklentileri varmış gibi davran
    window.chrome = { runtime: {} };
    // Plugin listesini doldur
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    // Diller
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
    // Permissions maskeleme
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  page.setDefaultTimeout(SCRAPE_TIMEOUT);
  try {
    return await fn(page);
  } finally {
    await context.close();
    await browser.close();
  }
}

function cleanText(t) {
  return String(t || '')
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function dedupe(list, maxItems) {
  const seen = new Set();
  const out = [];
  for (const txt of list) {
    const t = cleanText(txt);
    if (!t || t.split(' ').length < 2) continue; // min 2 kelime
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: t });
    if (out.length >= maxItems) break;
  }
  return out;
}


async function collectAmazonPageReviews(page, maxItems) {
  const collected = [];
  const selectors = [
    'span[data-hook="review-body"]',
    '#cm-cr-dp-review-list',
    '.review-text-content',
    '.a-expander-content.reviewText',
    '[data-hook="review-collapsed"]',
    '.review-text',
    '.commentText',
    '.comment-content',
    '[class*="review-body"]',
    '[class*="comment-text"]',
    '.rnr-com-w'
  ];
  
  await page.waitForSelector('body');
  await page.waitForTimeout(3000); // Sayfa otursun
  
  const addFromPage = async () => {
    // 1. Regex ile kaynağı tara (En garantisi)
    const html = await page.content();
    const regexList = [
      /"reviewBody"\s*:\s*"([^"]{10,2500})"/g,
      /"comment"\s*:\s*"([^"]{10,2500})"/g,
      /"text"\s*:\s*"([^"]{10,2500})"/g
    ];
    
    regexList.forEach(reg => {
      let m; while ((m = reg.exec(html)) && collected.length < maxItems) {
        let txt = m[1].replace(/\\n/g, ' ').replace(/\\u[\dA-F]{4}/gi, (match) => String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))).trim();
        if (txt.length > 10) collected.push(txt);
      }
    });

    // 2. Selector ile DOM'u tara
    const fromDOM = await page.evaluate((selList) => {
      const found = [];
      selList.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const t = (el.innerText || el.textContent || '').trim();
          if (t && t.length > 10) found.push(t);
        });
      });
      return found;
    }, selectors);
    collected.push(...fromDOM);
  };

  // Kademeli Agresif Scroll
  for (let i = 0; i < 8; i++) {
    await page.evaluate((step) => window.scrollTo(0, step * 800), i + 1);
    await page.waitForTimeout(1000);
    await addFromPage();
    if (collected.length >= maxItems) break;
  }
  
  return dedupe(collected, maxItems);
}

async function scrapeAmazon(query, maxItems) {
  return withPage(async (page) => {
    console.log(`[Amazon] Aranıyor: ${query}`);
    await page.goto(`https://www.amazon.com.tr/s?k=${encodeURIComponent(query)}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000); // Cloudflare/Bot kontrolü için bekleme süresini artır
    
    const title = await page.title();
    if (title.includes('Robot') || title.includes('CAPTCHA') || title.includes('Attention Required')) {
      console.warn('[Amazon] Arama sayfasında bot korumasına yakalandı!');
      return { reviews: [], sources: ['amazon:bot'] };
    }

    const first = page.locator('[data-component-type="s-search-result"] h2 a, .s-result-item h2 a, a.a-link-normal.s-no-outline, .s-product-image-container a').first();
    if (await first.count() === 0) return { reviews: [], sources: ['amazon:none'] };
    const href = await first.getAttribute('href');
    const productUrl = href ? new URL(href, 'https://www.amazon.com.tr').toString() : null;
    return scrapeAmazonUrl(productUrl, maxItems);
  });
}

async function scrapeAmazonUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['amazon:none'] };
    
    console.log(`[Amazon] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'load', timeout: 60000 }).catch(e => console.error(`[Amazon] Goto hatası: ${e.message}`));
    
    await page.waitForTimeout(5000);
    await handleAmazonConsent(page);
    
    if (productUrl.includes('akakce') || productUrl.includes('cimri')) {
      console.log('[Amazon] Yönlendirme bekleniyor...');
      await page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
    await handleAmazonConsent(page);
    
    const title = await page.title();
    if (title.includes('Robot') || title.includes('CAPTCHA') || title.includes('Attention Required')) {
      console.warn('[Amazon] Bot korumasına yakalandı!');
      return { reviews: [], sources: ['amazon:bot'] };
    }

    // ADIM 1: Önce mevcut (ana) sayfadaki "En iyi yorumları" topla (Fallback için)
    console.log('[Amazon] Ana sayfadaki yorumlar toplanıyor...');
    const inlineReviews = await collectAmazonPageReviews(page, 10);
    
    // ADIM 2: Tüm yorumlar sayfasına gitmeye çalış (Bot koruması riski var)
    const seeAll = page.locator('a[data-hook="see-all-reviews-link-foot"], a[href*="/product-reviews/"], a:has-text("Tüm yorumları gör")');
    if (await seeAll.count()) {
      console.log('[Amazon] "Tüm yorumları gör" sayfasına geçiş deneniyor...');
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
          seeAll.first().click()
        ]);
        
        const fullReviews = [];
        for (let p = 0; p < MAX_SCROLL && fullReviews.length < maxItems; p++) {
          const pageReviews = await collectAmazonPageReviews(page, maxItems - fullReviews.length);
          fullReviews.push(...pageReviews);
          if (fullReviews.length >= maxItems) break;
          
          // Amazon numaralandırılmış sayfalar (Sonraki sayfa)
          const nextBtn = page.locator('li.a-last a, ul.a-pagination li:last-child a');
          if (await nextBtn.count() && await nextBtn.first().isVisible().catch(() => false)) {
            console.log(`[Amazon] Sonraki yorum sayfasına geçiliyor...`);
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
              nextBtn.first().click({ timeout: 3000 }).catch(() => {})
            ]);
            await page.waitForTimeout(2000);
            
            // Login duvarına çarptık mı?
            if (page.url().includes('signin') || page.url().includes('login')) {
               console.warn('[Amazon] Giriş yapma zorunluluğu nedeniyle sonraki sayfalar alınamadı.');
               break;
            }
          } else {
            break;
          }
        }
        
        if (fullReviews.length > 0) {
          console.log(`[Amazon] Toplam ${fullReviews.length} yorum toplandı.`);
          return { reviews: fullReviews, sources: ['amazon'] };
        }
      } catch (err) {
        console.warn('[Amazon] "Tüm yorumlar" sayfası hatası (Muhtemelen login zorunluluğu). Ana sayfa verisi kullanılacak.');
      }
    }
    
    // Eğer tüm yorumlar sayfasına gidilemediyse veya boşsa ana sayfadaki 10 yorumu dön
    if (inlineReviews.length > 0) {
      console.log(`[Amazon] Sadece ana sayfadan ${inlineReviews.length} yorum alındı.`);
      return { reviews: inlineReviews, sources: ['amazon:inline'] };
    }
  });
}

async function scrapeTrendyol(query, maxItems) {
  return withPage(async (page) => {
    console.log(`[Trendyol] Aranıyor: ${query}`);
    await page.goto(`https://www.trendyol.com/sr?q=${encodeURIComponent(query)}`, { waitUntil: 'load', timeout: 60000 });
    
    // Cloudflare veya yüklenme için bekle
    await page.waitForTimeout(5000);
    await page.waitForSelector('.p-card-wrppr, [data-testid="product-card"], a[href*="-p-"]', { timeout: 10000 }).catch(() => {});

    const title = await page.title();
    if (title.includes('Attention Required') || title.includes('Robot') || title.includes('CAPTCHA')) {
      console.warn('[Trendyol] Arama sayfasında bot korumasına yakalandı!');
      return { reviews: [], sources: ['trendyol:bot'] };
    }

    const first = page.locator('.p-card-wrppr a, .p-card-chldrn-cntnr a, [data-testid="product-card"] a, .card-item a, .product-card a, a[href*="-p-"]').first();
    if (await first.count() === 0) {
      console.warn('[Trendyol] Ürün bulunamadı (Selector eşleşmedi).');
      return { reviews: [], sources: ['trendyol:none'] };
    }
    const href = await first.getAttribute('href');
    const productUrl = href ? new URL(href, 'https://www.trendyol.com').toString() : null;
    return scrapeTrendyolUrl(productUrl, maxItems);
  });
}

// Doğrudan URL ile Trendyol yorumlarını al
async function scrapeTrendyolUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['trendyol:none'] };
    
    console.log(`[Trendyol] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    // Eğer Akakçe/Cimri üzerinden gelmişsek yönlendirmeyi bekle
    if (productUrl.includes('akakce') || productUrl.includes('cimri')) {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    }

    const currentUrl = page.url().trim().replace(/[\u21B5\s]/g, '');
    const urlObj = new URL(currentUrl);
    if (!urlObj.pathname.endsWith('/yorumlar')) {
      const path = urlObj.pathname.replace(/\/$/, '');
      urlObj.pathname = path + '/yorumlar';
    }
    const reviewsUrl = urlObj.toString();
    
    if (page.url() !== reviewsUrl) {
      await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }
    
    await page.waitForTimeout(2000);
    
    // Lazy loading
    for (let s = 0; s < 5; s++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(400);
    }
    
    await page.waitForSelector('.review-comment, [class*="rnr-com-w"], .comment-text', { timeout: 10000 }).catch(() => {});

    const collected = new Set();
    let prevSize = 0;
    
    for (let i = 0; i < MAX_SCROLL && collected.size < maxItems; i++) {
      const texts = await page.evaluate(() => {
        const sel = '.review-comment, [class*="rnr-com-tx"], .comment-text, [class*="ReviewCard"] p, .rnr-com-w p, .comment-text span, .rnr-com-tx';
        return Array.from(document.querySelectorAll(sel))
          .map(el => el.innerText?.trim())
          .filter(t => t && t.length > 10 && !t.includes('Değerlendirme') && !t.includes('Yorum'));
      }).catch(() => []);
      
      texts.forEach(t => collected.add(t));
      
      if (collected.size < 5) {
        const html = await page.content();
        const matches = html.match(/"comment":"([^"]{20,600})"/g);
        if (matches) {
          matches.forEach(m => {
            const text = m.replace(/"comment":"/, '').replace(/"$/, '').replace(/\\u([0-9a-fA-F]{4})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
            if (text.length > 20) collected.add(text);
          });
        }
      }

      if (i > 3 && collected.size === prevSize) {
        // Scroll çalışmıyorsa numaralandırılmış sayfalar (1, 2, 3) veya Sonraki butonu olabilir
        const nextBtn = page.locator('.pagination a.next, a.next-page, [data-testid="pagination-next"], a:has-text("Sonraki"), a:has-text("›"), .pr-pg-nx');
        if (await nextBtn.count() && await nextBtn.first().isVisible().catch(() => false)) {
          console.log(`[Trendyol] Sonraki yorum sayfasına geçiliyor...`);
          await nextBtn.first().click().catch(() => {});
          await page.waitForTimeout(2000);
          continue;
        }
        break;
      }
      prevSize = collected.size;
      
      await page.mouse.wheel(0, 1000);
      await page.waitForTimeout(800);
    }
    
    const finalReviews = Array.from(collected).slice(0, maxItems).map(t => ({ text: t, platform: 'trendyol' }));
    return { reviews: finalReviews, sources: ['trendyol'] };
  });
}

async function scrapeHepsiburada(query, maxItems) {
  return withPage(async (page) => {
    await page.goto(`https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
    const first = page.locator('a[href*="-p-"]').first();
    if (await first.count() === 0) return { reviews: [], sources: ['hepsiburada:none'] };
    const href = await first.getAttribute('href');
    const productUrl = href ? new URL(href, 'https://www.hepsiburada.com').toString() : null;
    if (!productUrl) return { reviews: [], sources: ['hepsiburada:none'] };
    const reviewsUrl = productUrl.includes('-yorumlari') ? productUrl : `${productUrl}-yorumlari`;
    await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded' });

    const collected = [];

    // JSON-LD içinde reviewBody alanlarını topla
    const jsonTexts = await page.evaluate(() => {
      try {
        const found = [];
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => s.textContent || '');
        for (const txt of scripts) {
          const trimmed = txt.trim();
          if (!trimmed.includes("\"@type\":\"Review\"")) continue;
          let parsed;
          try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
          const items = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
          for (const it of items) {
            if (it && it.reviewBody) found.push(it.reviewBody);
            if (Array.isArray(it?.review)) {
              for (const r of it.review) { if (r?.reviewBody) found.push(r.reviewBody); }
            }
          }
        }
        return found;
      } catch { return []; }
    });
    collected.push(...jsonTexts);

    // DOM üzerindeki review kartları - daha fazla scroll ve pagination
    let prevCount = 0;
    for (let i = 0; i < MAX_SCROLL && collected.length < maxItems; i++) {
      await page.waitForTimeout(500);
      const texts = await page.$$eval(
        '#hermes-voltran-comments [itemprop="reviewBody"], #hermes-voltran-comments [data-test-id="review"], .hermes-ReviewCard-module-KaU17BbDowCWcTZ9zzxw, .review-item-text, .hb-review-text',
        els => els.map(e => e.innerText)
      );
      collected.push(...texts);
      
      // Yeni yorum gelmiyorsa dur
      if (i > 2 && collected.length === prevCount) break;
      prevCount = collected.length;
      
      // Sayfayı kaydır
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(400);
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(500);
      
      // Sonraki sayfa butonu varsa tıkla
      const nextPage = page.locator('.pagination-next, [data-test-id="pagination-next"], .hb-pagination a.next');
      if (await nextPage.count()) {
        await nextPage.first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(1500);
      }
    }

    // Fallback: regex ile reviewBody yakala
    if (collected.length < 10) {
      const scraped = await page.evaluate(() => {
        const out = [];
        const html = document.documentElement.innerHTML;
        const regex = /"reviewBody"\s*:\s*"([^"]{5,800})"/g;
        let m; while ((m = regex.exec(html)) && out.length < 200) out.push(m[1]);
        return out;
      });
      collected.push(...scraped);
    }

    return { reviews: dedupe(collected, maxItems), sources: ['hepsiburada'] };
  });
}

// Doğrudan URL ile Hepsiburada yorumlarını al
async function scrapeHepsiburadaUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    console.log(`[Hepsiburada] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    
    if (productUrl.includes('akakce') || productUrl.includes('cimri')) {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    }

    const currentUrl = page.url();
    const cleanUrl = currentUrl.split('?')[0].split('#')[0];
    const reviewsUrl = cleanUrl.endsWith('-yorumlari') ? cleanUrl : `${cleanUrl}-yorumlari`;
    
    if (page.url() !== reviewsUrl) {
      await page.goto(reviewsUrl, { waitUntil: 'load' });
    }
    
    // Sayfa yüklenmesi için bekle
    await page.waitForTimeout(2000);
    
    // Yorum elementlerinin yüklenmesini bekle
    await page.waitForSelector('[itemprop="reviewBody"], [class*="ReviewCard"], .hermes-ReviewCard-module, p', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const collected = [];

    // JSON-LD içinde reviewBody alanlarını topla
    const jsonTexts = await page.evaluate(() => {
      try {
        const found = [];
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => s.textContent || '');
        for (const txt of scripts) {
          const trimmed = txt.trim();
          // Daha genel bir arama: reviewBody içeren her JSON-LD'yi işle
          if (!trimmed.includes("reviewBody")) continue;
          let parsed;
          try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
          
          const extract = (obj) => {
            if (!obj) return;
            if (obj.reviewBody) found.push(obj.reviewBody);
            if (Array.isArray(obj)) obj.forEach(extract);
            else if (typeof obj === 'object') Object.values(obj).forEach(extract);
          };
          extract(parsed);
        }
        return found;
      } catch { return []; }
    });
    collected.push(...jsonTexts);

    // DOM scroll ve pagination
    let prevCount = 0;
    let currentPage = 1;
    
    for (let i = 0; i < MAX_SCROLL && collected.length < maxItems; i++) {
      await page.waitForTimeout(800);
      
      // Hepsiburada güncel yorum selektörleri
      const texts = await page.evaluate(() => {
        const reviews = [];
        const selectors = [
          '[itemprop="reviewBody"]', 
          '[class*="ReviewCard"] p', 
          '.hermes-ReviewCard-module p', 
          'p[class*="review"]',
          '.review-text',
          '.review-content'
        ];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            const text = el.innerText?.trim();
            if (text && text.length > 10 && !text.includes('Hepsiburada') && !text.includes('Yorum')) {
              reviews.push(text);
            }
          });
        });
        return reviews;
      }).catch(() => []);
      
      collected.push(...texts);
      
      if (i > 5 && collected.length === prevCount) {
        // Yeni yorum gelmiyorsa sonraki sayfaya geç
        currentPage++;
        const nextBtn = page.locator('li.next a, [class*="pagination"] a:has-text("›"), button:has-text("Sonraki"), a:has-text("Sonraki")');
        if (await nextBtn.count() && await nextBtn.first().isVisible().catch(() => false)) {
          await nextBtn.first().click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(2500);
          continue;
        } else {
          break;
        }
      }
      prevCount = collected.length;
      
      // Sayfayı kaydır
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(600);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(700);
    }

    // Fallback regex
    if (collected.length < 20) { 
      const scraped = await page.evaluate(() => {
        const out = [];
        const html = document.documentElement.innerHTML;
        const regex = /"reviewBody"\s*:\s*"([^"]{5,800})"/g;
        let m; while ((m = regex.exec(html)) && out.length < 200) out.push(m[1]);
        return out;
      });
      collected.push(...scraped);
    }

    return { reviews: dedupe(collected, maxItems), sources: ['hepsiburada'] };
  });
}

// N11 Yorum Kazıyıcı
async function scrapeN11Url(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['n11:none'] };
    console.log(`[N11] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    
    // Yorumlar sekmesini bul ve tıkla (veya URL'den git)
    const reviewsTab = page.locator('#reviews-tab, a[href="#reviews"]');
    if (await reviewsTab.count()) {
      await reviewsTab.first().click().catch(() => {});
    }
    
    await page.waitForTimeout(2000);
    const collected = [];
    for (let i = 0; i < 3 && collected.length < maxItems; i++) {
      const texts = await page.evaluate(() => {
        const found = [];
        // Selector bazlı toplama
        document.querySelectorAll('.commentText, .review-text, .comment-content, .review-item, [class*="review"] p').forEach(el => {
          const t = el.innerText?.trim();
          if (t && t.length > 10) found.push(t);
        });
        
        // Regex bazlı toplama (Eğer az yorum varsa)
        if (found.length < 5) {
          const html = document.documentElement.innerHTML;
          const regex = /"reviewBody"\s*:\s*"([^"]{10,1000})"/g;
          let m; while ((m = regex.exec(html)) && found.length < 50) found.push(m[1]);
        }
        return found;
      });
      collected.push(...texts);
      const next = page.locator('.pagination a.next, a.next-page, [data-testid="pagination-next"]');
      if (collected.length >= maxItems || (await next.count()) === 0) break;
      await next.first().click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    console.log(`[N11] ${collected.length} yorum toplandı.`);
    return { reviews: dedupe(collected, maxItems), sources: ['n11'] };
  });
}

// Pazarama Yorum Kazıyıcı
async function scrapePazaramaUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['pazarama:none'] };
    console.log(`[Pazarama] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Pazarama'da yorumlar sekmesine tıklama gerekebilir
    const tab = page.locator('button:has-text("Yorumlar"), [data-testid="reviews-tab"]');
    if (await tab.count()) {
      await tab.first().click().catch(() => {});
      await page.waitForTimeout(2000);
    }

    const collected = [];
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(800);
    }
    
    const texts = await page.evaluate(() => {
      const found = [];
      document.querySelectorAll('.comment-text, [class*="ReviewCard"] p, .comment, .review-content').forEach(el => {
        const t = el.innerText?.trim();
        if (t && t.length > 10) found.push(t);
      });
      return found;
    });
    collected.push(...texts);
    console.log(`[Pazarama] ${collected.length} yorum toplandı.`);
    return { reviews: dedupe(collected, maxItems), sources: ['pazarama'] };
  });
}

// Çiçeksepeti Yorum Kazıyıcı
async function scrapeCiceksepetiUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['ciceksepeti:none'] };
    console.log(`[Çiçeksepeti] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    
    const collected = [];
    const texts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.product-review-text, .comment-body, .review-text'))
        .map(el => el.innerText?.trim())
        .filter(t => t && t.length > 10);
    });
    collected.push(...texts);
    console.log(`[Çiçeksepeti] ${collected.length} yorum toplandı.`);
    return { reviews: dedupe(collected, maxItems), sources: ['ciceksepeti'] };
  });
}

/**
 * Tüm siteleri kazır. Eğer links objesi verilmişse (Akakçe/Cimri'den gelen),
 * arama yapmak yerine doğrudan o linkleri kullanır.
 */
export async function scrapeAllSites({ query, maxItems = 200, links = {} }) {
  const platforms = [
    { 
      id: 'amazon', 
      fn: async (url) => {
        let res = url ? await scrapeAmazonUrl(url, maxItems) : { reviews: [] };
        if (!res.reviews || res.reviews.length === 0) {
          console.log(`[Amazon] Link başarısız veya boş, arama yapılıyor...`);
          res = await scrapeAmazon(query, maxItems);
        }
        return res;
      }
    },
    { 
      id: 'trendyol', 
      fn: async (url) => {
        let res = url ? await scrapeTrendyolUrl(url, maxItems) : { reviews: [] };
        if (!res.reviews || res.reviews.length === 0) {
          console.log(`[Trendyol] Link başarısız veya boş, arama yapılıyor...`);
          res = await scrapeTrendyol(query, maxItems);
        }
        return res;
      }
    },
    { 
      id: 'hepsiburada', 
      fn: (url) => url ? scrapeHepsiburadaUrl(url, maxItems) : scrapeHepsiburada(query, maxItems) 
    },
    { id: 'n11', fn: (url) => url ? scrapeN11Url(url, maxItems) : Promise.resolve({ reviews: [], sources: [] }) },
    { id: 'pazarama', fn: (url) => url ? scrapePazaramaUrl(url, maxItems) : Promise.resolve({ reviews: [], sources: [] }) },
    { id: 'ciceksepeti', fn: (url) => url ? scrapeCiceksepetiUrl(url, maxItems) : Promise.resolve({ reviews: [], sources: [] }) }
  ];
  
  const tasks = platforms.map(p => 
    p.fn(links[p.id]).catch(e => ({ reviews: [], sources: [`${p.id}:error`, String(e?.message || e)] }))
  );

  const results = await Promise.all(tasks);
  
  const allReviews = [];
  const allSources = [];
  const perPlatform = {};

  results.forEach((res, idx) => {
    const platformId = platforms[idx].id;
    const taggedReviews = (res.reviews || []).map(r => ({ ...r, platform: platformId }));
    allReviews.push(...taggedReviews);
    allSources.push(...(res.sources || []));
    perPlatform[platformId] = taggedReviews.length;
  });

  return { reviews: allReviews, sources: allSources, perPlatform };
}

export { scrapeAmazonUrl, scrapeTrendyolUrl, scrapeHepsiburadaUrl };
