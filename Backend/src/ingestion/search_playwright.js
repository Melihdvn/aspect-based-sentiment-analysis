import { chromium } from 'playwright';

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== '0';
const NAV_TIMEOUT = Number(process.env.SCRAPER_NAV_TIMEOUT_MS || 30000);
const SCRAPE_TIMEOUT = Number(process.env.SCRAPER_TIMEOUT_MS || 30000);
const MAX_SCROLL = Number(process.env.SCRAPER_SCROLL_STEPS || 15);
const UA = process.env.SCRAPER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function handleAmazonConsent(page) {
  const accept = page.locator('#sp-cc-accept, input#sp-cc-accept, button#sp-cc-accept, button[name="accept"], [name="accept"]');
  if (await accept.count()) {
    await accept.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}


async function withPage(fn) {
  const browser = await chromium.launch({ 
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1920, height: 1080 },
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    extraHTTPHeaders: { 
      'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'upgrade-insecure-requests': '1'
    }
  });
  const page = await context.newPage();
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
    if (!t || t.split(' ').length < 5) continue; // min 5 kelime
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
  await page.waitForSelector('span[data-hook="review-body"], .review-text-content span, [data-hook="review-collapsed"]', { timeout: 5000 }).catch(() => {});
  
  const addFromPage = async () => {
    const texts = await page.$$eval(
      'span[data-hook="review-body"] span, span[data-hook="review-body"], .review-text-content span, [data-hook="review-collapsed"] span',
      els => els.map(e => e.innerText)
    );
    collected.push(...texts);
  };
  
  await addFromPage();
  
  // Scroll ve daha fazla yorum yükle
  let prevCount = 0;
  for (let i = 0; i < MAX_SCROLL && collected.length < maxItems; i++) {
    // Sayfayı yavaş yavaş kaydır
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(600);
    
    await addFromPage();
    
    // Yeni yorum gelmiyorsa dur
    if (collected.length === prevCount) break;
    prevCount = collected.length;
  }
  
  return dedupe(collected, maxItems);
}

async function scrapeAmazon(query, maxItems) {
  return withPage(async (page) => {
    await page.goto(`https://www.amazon.com.tr/s?k=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
    const first = page.locator('[data-component-type="s-search-result"] h2 a').first();
    if (await first.count() === 0) return { reviews: [], sources: ['amazon:none'] };
    const href = await first.getAttribute('href');
    const productUrl = href ? new URL(href, 'https://www.amazon.com.tr').toString() : null;
    if (!productUrl) return { reviews: [], sources: ['amazon:none'] };
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    await handleAmazonConsent(page);
    const seeAll = page.locator('a[data-hook="see-all-reviews-link-foot"], a[href*="/product-reviews/"]');
    if (await seeAll.count()) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        seeAll.first().click()
      ]);
    } else {
      const inline = await collectAmazonPageReviews(page, maxItems);
      if (inline.length) return { reviews: inline, sources: ['amazon'] };
      const url = new URL(productUrl);
      url.pathname = url.pathname.replace('/dp/', '/product-reviews/');
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
      await handleAmazonConsent(page);
    }

    const collected = [];
    await page.waitForSelector('span[data-hook="review-body"]', { timeout: 5000 }).catch(() => {});
    for (let pageIdx = 0; pageIdx < MAX_SCROLL && collected.length < maxItems; pageIdx++) {
      await page.waitForTimeout(800);
      const texts = await page.$$eval('span[data-hook="review-body"] span, span[data-hook="review-body"]', els => els.map(e => e.innerText));
      collected.push(...texts);
      const next = page.locator('li.a-last a');
      if (collected.length >= maxItems || (await next.count()) === 0) break;
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        next.click()
      ]);
    }
    return { reviews: dedupe(collected, maxItems), sources: ['amazon'] };
  });
}


async function scrapeAmazonUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['amazon:none'] };
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    await handleAmazonConsent(page);
    
    // Direkt ürün sayfasından yorumları al - login gerektirmez
    const reviews = await collectAmazonPageReviews(page, maxItems);
    return { reviews, sources: ['amazon'] };
  });
}

async function scrapeTrendyol(query, maxItems) {
  return withPage(async (page) => {
    await page.goto(`https://www.trendyol.com/sr?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
    const first = page.locator('div.p-card-wrppr a').first();
    if (await first.count() === 0) return { reviews: [], sources: ['trendyol:none'] };
    const href = await first.getAttribute('href');
    const productUrl = href ? new URL(href, 'https://www.trendyol.com').toString() : null;
    if (!productUrl) return { reviews: [], sources: ['trendyol:none'] };
    const reviewsUrl = productUrl.endsWith('/yorumlar') ? productUrl : `${productUrl}/yorumlar`;
    await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded' });

    const collected = [];
    let prevCount = 0;
    
    for (let i = 0; i < MAX_SCROLL && collected.length < maxItems; i++) {
      // Yorum elementlerini al
      const texts = await page.$$eval(
        '.comment, [data-test-id="review-card"] .comment, [data-testid="comment"], .pr-rnr-com-w .rnr-com-tx, .review-text',
        els => els.map(e => e.innerText)
      );
      collected.push(...texts);
      
      // Yeni yorum gelmiyorsa dur
      if (i > 2 && collected.length === prevCount) break;
      prevCount = collected.length;
      
      // Sayfayı kaydır
      await page.mouse.wheel(0, 1000);
      await page.waitForTimeout(500);
      await page.mouse.wheel(0, 1000);
      await page.waitForTimeout(700);
      
      // Sayfa numarası butonlarına tıkla (varsa)
      const nextPage = page.locator('.rnr-pnr-pgs a.next, .pagination-next, [data-testid="pagination-next"]');
      if (await nextPage.count()) {
        await nextPage.first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(1500);
      }
    }
    
    // JSON verilerinden de yorumları çek
    if (collected.length < maxItems) {
      const jsonTexts = await page.evaluate(() => {
        try {
          const data = window.__NEXT_DATA__ || window.__next_data__ || null;
          const comments = data?.props?.pageProps?.initialState?.product?.reviews?.contents || [];
          return comments.map(c => c.comment || c.text || '').filter(Boolean);
        } catch { return []; }
      });
      collected.push(...jsonTexts);
    }
    return { reviews: dedupe(collected, maxItems), sources: ['trendyol'] };
  });
}

// Doğrudan URL ile Trendyol yorumlarını al
async function scrapeTrendyolUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['trendyol:none'] };
    
    // URL sonuna /yorumlar ekle
    const cleanUrl = productUrl.split('?')[0].split('#')[0];
    const reviewsUrl = cleanUrl.endsWith('/yorumlar') ? cleanUrl : `${cleanUrl}/yorumlar`;
    await page.goto(reviewsUrl, { waitUntil: 'load' });
    
    // Sayfa yüklenmesi için bekle
    await page.waitForTimeout(3000);
    
    // ÖNCELİKLE SAYFA KAYDIR - Lazy loading tetiklenmesi için
    for (let s = 0; s < 5; s++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(400);
    }
    
    // Yorumların yüklenmesini bekle
    await page.waitForTimeout(5000);
    
    // Yorum kartlarının görünmesini bekle
    await page.waitForSelector('[class*="rnr-com-w"], [class*="ReviewCard"], .comment-text', { timeout: 15000 }).catch(() => {});

    const collected = [];
    let prevCount = 0;
    
    for (let i = 0; i < MAX_SCROLL && collected.length < maxItems; i++) {
      // Trendyol yorum selektörleri - görsel analize göre
      const texts = await page.evaluate(() => {
        const reviews = [];
        // Yorum metinlerini al
        document.querySelectorAll('[class*="rnr-com-w"] p, .comment-text, [class*="ReviewCard"] p').forEach(el => {
          const text = el.innerText?.trim();
          if (text && text.length > 15 && !text.includes('Değerlendirme') && !text.includes('Yorum')) {
            reviews.push(text);
          }
        });
        return reviews;
      }).catch(() => []);
      
      collected.push(...texts);
      
      if (i > 4 && collected.length === prevCount) break;
      prevCount = collected.length;
      
      // Sayfayı kaydır
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(800);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(1000);
      
      // Sonraki sayfa butonu varsa tıkla
      const nextBtn = page.locator('[class*="pagination"] li:last-child a:not([class*="disabled"]), button:has-text("Sonraki")');
      if (await nextBtn.count() && await nextBtn.first().isVisible().catch(() => false)) {
        await nextBtn.first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(2500);
      }
    }
    
    // JSON verilerinden de çek (fallback)
    if (collected.length < 10) {
      const jsonTexts = await page.evaluate(() => {
        try {
          const data = window.__NEXT_DATA__ || window.__next_data__ || null;
          const comments = data?.props?.pageProps?.initialState?.product?.reviews?.contents || [];
          return comments.map(c => c.comment || c.text || '').filter(Boolean);
        } catch { return []; }
      });
      collected.push(...jsonTexts);
    }
    return { reviews: dedupe(collected, maxItems), sources: ['trendyol'] };
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
    if (!productUrl) return { reviews: [], sources: ['hepsiburada:none'] };
    
    // URL sonuna -yorumlari ekle
    const cleanUrl = productUrl.split('?')[0].split('#')[0];
    const reviewsUrl = cleanUrl.endsWith('-yorumlari') ? cleanUrl : `${cleanUrl}-yorumlari`;
    await page.goto(reviewsUrl, { waitUntil: 'load' });
    
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

    // DOM scroll ve pagination
    let prevCount = 0;
    let currentPage = 1;
    
    for (let i = 0; i < MAX_SCROLL && collected.length < maxItems; i++) {
      await page.waitForTimeout(800);
      
      // Hepsiburada güncel yorum selektörleri
      const texts = await page.evaluate(() => {
        const reviews = [];
        document.querySelectorAll('[itemprop="reviewBody"], [class*="ReviewCard"] p, .hermes-ReviewCard-module p, p[class*="review"]').forEach(el => {
          const text = el.innerText?.trim();
          if (text && text.length > 20 && !text.includes('yorum') && !text.includes('Değerlendir')) {
            reviews.push(text);
          }
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

export async function scrapeAllSites({ query, maxItems = 200 }) {
  const perSite = Math.max(20, Math.floor(maxItems / 3));
  const tasks = [
    scrapeAmazon(query, perSite).catch((e) => ({ reviews: [], sources: ['amazon:error', String(e?.message || e)] })),
    scrapeTrendyol(query, perSite).catch((e) => ({ reviews: [], sources: ['trendyol:error', String(e?.message || e)] })),
    scrapeHepsiburada(query, perSite).catch((e) => ({ reviews: [], sources: ['hepsiburada:error', String(e?.message || e)] }))
  ];
  const results = await Promise.all(tasks);
  const reviews = results.flatMap(r => r.reviews || []);
  const sources = results.flatMap(r => r.sources || []);
  return { reviews, sources };
}

export { scrapeAmazonUrl, scrapeTrendyolUrl, scrapeHepsiburadaUrl };
