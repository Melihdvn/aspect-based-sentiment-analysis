import { chromium } from 'playwright';

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== '0';
const NAV_TIMEOUT = Number(process.env.SCRAPER_NAV_TIMEOUT_MS || 15000);
const SCRAPE_TIMEOUT = Number(process.env.SCRAPER_TIMEOUT_MS || 20000);
const MAX_SCROLL = Number(process.env.SCRAPER_SCROLL_STEPS || 3);
const UA = process.env.SCRAPER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function handleAmazonConsent(page) {
  const accept = page.locator('#sp-cc-accept, input#sp-cc-accept, button#sp-cc-accept, button[name="accept"], [name="accept"]');
  if (await accept.count()) {
    await accept.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}


async function withPage(fn) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 900 },
    locale: 'tr-TR',
    extraHTTPHeaders: { 'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8', 'upgrade-insecure-requests': '1' }
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
  await page.waitForSelector('span[data-hook="review-body"], .review-text-content span', { timeout: 5000 }).catch(() => {});
  const addFromPage = async () => {
    const texts = await page.$$eval('span[data-hook="review-body"] span, span[data-hook="review-body"], .review-text-content span', els => els.map(e => e.innerText));
    collected.push(...texts);
  };
  await addFromPage();
  for (let i = 0; i < MAX_SCROLL && collected.length < maxItems; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(600);
    await addFromPage();
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
    for (let i = 0; i < MAX_SCROLL && collected.length < maxItems; i++) {
      const texts = await page.$$eval('.comment, [data-test-id="review-card"] .comment, [data-testid="comment"]', els => els.map(e => e.innerText));
      collected.push(...texts);
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(800);
    }
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

    // JSON-LD i?inde reviewBody alanlar?n? topla
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

    // DOM ?zerindeki review kartlar?
    for (let i = 0; i < MAX_SCROLL && collected.length < maxItems; i++) {
      await page.waitForTimeout(600);
      const texts = await page.$$eval(
        '#hermes-voltran-comments [itemprop="reviewBody"], #hermes-voltran-comments [data-test-id="review"], #hermes-voltran-comments .hermes-ReviewCard-module-KaU17BbDowCWcTZ9zzxw',
        els => els.map(e => e.innerText)
      );
      collected.push(...texts);
      await page.mouse.wheel(0, 1000);
    }

    // Fallback: regex ile reviewBody yakala
    if (collected.length === 0) {
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

export { scrapeAmazonUrl };
