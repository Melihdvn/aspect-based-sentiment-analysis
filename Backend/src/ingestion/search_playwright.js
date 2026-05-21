import { globalBrowserPool } from './browser/BrowserPool.js';
import {
  extractTitleFromAmazon,
  extractTitleFromTrendyol,
  extractTitleFromHepsiburada,
  normalizeTitle
} from './titleExtractor.js';

const NAV_TIMEOUT = Number(process.env.SCRAPER_NAV_TIMEOUT_MS || 30000);
const SCRAPE_TIMEOUT = Number(process.env.SCRAPER_TIMEOUT_MS || 30000);

// Helper: Custom sleep/delay
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Helper: Active redirect chain resolver
async function waitForRedirectToResolve(page, originalUrl) {
  if (!originalUrl.includes('akakce') && !originalUrl.includes('cimri')) {
    return;
  }
  console.log(`[Redirect] Resolving redirect chain for: ${originalUrl}`);
  for (let i = 0; i < 20; i++) {
    const url = page.url();
    if (!url.includes('akakce') && !url.includes('cimri') && url.startsWith('http')) {
      console.log(`[Redirect] Redirect resolved to: ${url}`);
      return;
    }
    await delay(500);
  }
  console.warn(`[Redirect] Warning: Timeout resolving redirect. URL: ${page.url()}`);
}

// ---------------------------------------------------------------------------
//  withPage - Isolated context acquisition
// ---------------------------------------------------------------------------
export async function withPage(fn, platform = 'unknown') {
  const { context, page } = await globalBrowserPool.acquireContextAndPage(platform);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  page.setDefaultTimeout(SCRAPE_TIMEOUT);
  try {
    return await fn(page);
  } finally {
    await globalBrowserPool.releaseContext(context);
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
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
    if (!t || t.split(' ').length < 2) continue; // min 2 words
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: t });
    if (out.length >= maxItems) break;
  }
  return out;
}

async function handleAmazonConsent(page) {
  const accept = page.locator('#sp-cc-accept, input#sp-cc-accept, button#sp-cc-accept, button[name="accept"], [name="accept"]');
  if (await accept.count()) {
    await accept.first().click({ timeout: 2000 }).catch(() => { });
    await delay(300);
  }
}

// ---------------------------------------------------------------------------
//  Amazon Review Extraction
// ---------------------------------------------------------------------------
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
  await delay(1000);

  const addFromPage = async () => {
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

  for (let i = 0; i < 5; i++) {
    await page.evaluate((step) => window.scrollTo(0, step * 700), i + 1);
    await delay(400);
    await addFromPage();
    if (collected.length >= maxItems) break;
  }

  return dedupe(collected, maxItems);
}

export async function scrapeAmazon(query, maxItems) {
  return withPage(async (page) => {
    console.log(`[Amazon] Aranıyor: ${query}`);
    await page.goto(`https://www.amazon.com.tr/s?k=${encodeURIComponent(query)}`, { waitUntil: 'load', timeout: 60000 });
    await delay(3500);

    const title = await page.title();
    if (title.includes('Robot') || title.includes('CAPTCHA') || title.includes('Attention Required')) {
      console.warn('[Amazon] Bot wall detected in search page!');
      return { reviews: [], sources: ['amazon:bot'] };
    }

    const first = page.locator('[data-component-type="s-search-result"] h2 a, .s-result-item h2 a, a.a-link-normal.s-no-outline, .s-product-image-container a').first();
    if (await first.count() === 0) return { reviews: [], sources: ['amazon:none'] };
    const href = await first.getAttribute('href');
    const productUrl = href ? new URL(href, 'https://www.amazon.com.tr').toString() : null;
    return scrapeAmazonUrl(productUrl, maxItems);
  }, 'amazon');
}

export async function scrapeAmazonUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['amazon:none'] };

    console.log(`[Amazon] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'load', timeout: 60000 }).catch(e => console.error(`[Amazon] Goto error: ${e.message}`));

    await delay(3000);
    await handleAmazonConsent(page);

    // Resolve redirects
    await waitForRedirectToResolve(page, productUrl);
    await handleAmazonConsent(page);

    const title = await page.title();
    if (title.includes('Robot') || title.includes('CAPTCHA') || title.includes('Attention Required')) {
      console.warn('[Amazon] Bot wall detected!');
      return { reviews: [], sources: ['amazon:bot'] };
    }

    console.log('[Amazon] Extracting inline reviews...');
    const inlineReviews = await collectAmazonPageReviews(page, 15);

    const seeAll = page.locator('a[data-hook="see-all-reviews-link-foot"], a[href*="/product-reviews/"], a:has-text("Tüm yorumları gör")');
    let reviewUrl = '';
    if (await seeAll.count()) {
      const href = await seeAll.first().getAttribute('href');
      reviewUrl = href ? new URL(href, 'https://www.amazon.com.tr').toString() : '';
    } else {
      try {
        const u = new URL(page.url());
        const parts = u.pathname.split('/').filter(Boolean);
        const idx = parts.indexOf('dp');
        const asin = idx !== -1 ? parts[idx + 1] : '';
        if (asin) {
          reviewUrl = `https://www.amazon.com.tr/product-reviews/${asin}?reviewerType=all_reviews`;
        }
      } catch { }
    }

    if (reviewUrl) {
      console.log(`[Amazon] Review URL discovered: ${reviewUrl}`);
      const fullReviews = [];
      const maxPages = Math.ceil(maxItems / 10);

      for (let p = 1; p <= Math.min(maxPages, 20); p++) {
        const pageUrl = `${reviewUrl}${reviewUrl.includes('?') ? '&' : '?'}pageNumber=${p}`;
        console.log(`[Amazon] Loading reviews page ${p}: ${pageUrl}`);

        try {
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await delay(800);
          await handleAmazonConsent(page);

          if (page.url().includes('signin') || page.url().includes('login')) {
            console.warn('[Amazon] Sign-in wall detected. Stopping paginated crawling.');
            break;
          }

          const pageReviews = await collectAmazonPageReviews(page, maxItems - fullReviews.length);
          if (pageReviews.length === 0) break;

          fullReviews.push(...pageReviews);
          if (fullReviews.length >= maxItems) break;
        } catch (err) {
          console.warn(`[Amazon] Page ${p} crawl error:`, err.message);
          break;
        }
      }

      if (fullReviews.length > 0) {
        console.log(`[Amazon] Successfully crawled ${fullReviews.length} reviews.`);
        return { reviews: fullReviews, sources: ['amazon'] };
      }
    }

    if (inlineReviews.length > 0) {
      console.log(`[Amazon] Falling back to ${inlineReviews.length} inline reviews.`);
      return { reviews: inlineReviews, sources: ['amazon:inline'] };
    }
    return { reviews: [], sources: ['amazon:empty'] };
  }, 'amazon');
}

// ---------------------------------------------------------------------------
//  Trendyol Review Extraction
// ---------------------------------------------------------------------------
export async function scrapeTrendyol(query, maxItems) {
  return withPage(async (page) => {
    console.log(`[Trendyol] Aranıyor: ${query}`);
    await page.goto(`https://www.trendyol.com/sr?q=${encodeURIComponent(query)}`, { waitUntil: 'load', timeout: 60000 });

    await delay(3500);
    await page.waitForSelector('.p-card-wrppr, [data-testid="product-card"], a[href*="-p-"]', { timeout: 10000 }).catch(() => { });

    const title = await page.title();
    if (title.includes('Attention Required') || title.includes('Robot') || title.includes('CAPTCHA')) {
      console.warn('[Trendyol] Bot wall detected in search page!');
      return { reviews: [], sources: ['trendyol:bot'] };
    }

    const first = page.locator('.p-card-wrppr a, .p-card-chldrn-cntnr a, [data-testid="product-card"] a, .card-item a, .product-card a, a[href*="-p-"]').first();
    if (await first.count() === 0) {
      console.warn('[Trendyol] Product not found in search.');
      return { reviews: [], sources: ['trendyol:none'] };
    }
    const href = await first.getAttribute('href');
    const productUrl = href ? new URL(href, 'https://www.trendyol.com').toString() : null;
    return scrapeTrendyolUrl(productUrl, maxItems);
  }, 'trendyol');
}

export async function scrapeTrendyolUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['trendyol:none'] };

    console.log(`[Trendyol] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'load', timeout: 60000 });
    await delay(3000);

    // Resolve redirects
    await waitForRedirectToResolve(page, productUrl);

    const currentUrl = page.url().trim().replace(/[\u21B5\s]/g, '');
    const urlObj = new URL(currentUrl);
    if (!urlObj.pathname.endsWith('/yorumlar')) {
      const path = urlObj.pathname.replace(/\/$/, '');
      urlObj.pathname = path + '/yorumlar';
    }
    const reviewsUrl = urlObj.toString();

    if (page.url() !== reviewsUrl) {
      await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
    }

    await delay(1500);

    const collected = new Set();
    let prevSize = 0;
    let noGrowthStreak = 0;

    for (let i = 0; i < 40 && collected.size < maxItems; i++) {
      await page.mouse.wheel(0, 1500);
      await delay(700);

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

      if (collected.size === prevSize) {
        noGrowthStreak++;
        if (noGrowthStreak >= 5) {
          const nextBtn = page.locator('.pagination a.next, a.next-page, [data-testid="pagination-next"], a:has-text("Sonraki"), a:has-text("›"), .pr-pg-nx');
          if (await nextBtn.count() && await nextBtn.first().isVisible().catch(() => false)) {
            console.log(`[Trendyol] Next page found. Clicking...`);
            await nextBtn.first().click().catch(() => { });
            await delay(1500);
            noGrowthStreak = 0;
            continue;
          }
          break;
        }
      } else {
        noGrowthStreak = 0;
      }
      prevSize = collected.size;
    }

    const finalReviews = Array.from(collected).slice(0, maxItems).map(t => ({ text: t, platform: 'trendyol' }));
    return { reviews: finalReviews, sources: ['trendyol'] };
  }, 'trendyol');
}

// ---------------------------------------------------------------------------
//  Hepsiburada Review Extraction
// ---------------------------------------------------------------------------
export async function scrapeHepsiburada(query, maxItems) {
  return withPage(async (page) => {
    await page.goto(`https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
    const first = page.locator('a[href*="-p-"]').first();
    if (await first.count() === 0) return { reviews: [], sources: ['hepsiburada:none'] };
    const href = await first.getAttribute('href');
    const productUrl = href ? new URL(href, 'https://www.hepsiburada.com').toString() : null;
    if (!productUrl) return { reviews: [], sources: ['hepsiburada:none'] };
    return scrapeHepsiburadaUrl(productUrl, maxItems);
  }, 'hepsiburada');
}

export async function scrapeHepsiburadaUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    console.log(`[Hepsiburada] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });

    // Resolve redirects
    await waitForRedirectToResolve(page, productUrl);

    const currentUrl = page.url();
    const cleanUrl = currentUrl.split('?')[0].split('#')[0];
    const reviewsUrl = cleanUrl.endsWith('-yorumlari') ? cleanUrl : `${cleanUrl}-yorumlari`;

    const collected = [];
    const maxPages = Math.ceil(maxItems / 10);

    for (let p = 1; p <= Math.min(maxPages, 20); p++) {
      const pageUrl = `${reviewsUrl}?sayfa=${p}`;
      console.log(`[Hepsiburada] Sayfa ${p} yükleniyor: ${pageUrl}`);

      try {
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await delay(500);

        // 1. Direct Regex parsing on raw HTML (Decoded & Ultra reliable!)
        const html = await page.content();
        const regex = /"reviewBody"\s*:\s*"([^"]{5,2500})"/g;
        const pageRegexTexts = [];
        let m;
        while ((m = regex.exec(html)) && pageRegexTexts.length < 100) {
          let txt = m[1]
            .replace(/\\n/g, ' ')
            .replace(/\\u([\dA-F]{4})/gi, (_, p1) => String.fromCharCode(parseInt(p1, 16)))
            .trim();
          if (txt.length > 5 && !txt.includes('Hepsiburada') && !txt.includes('Yorum')) {
            pageRegexTexts.push(txt);
          }
        }

        // 2. Parse DOM
        const domTexts = await page.evaluate(() => {
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

        const pageCombined = [...pageRegexTexts, ...domTexts];
        if (pageCombined.length === 0) {
          console.log(`[Hepsiburada] Sayfa ${p} boş veya sonuna ulaşıldı.`);
          break;
        }

        collected.push(...pageCombined);
        console.log(`[Hepsiburada] Sayfa ${p} tarandı. Eklenen: ${pageCombined.length}. Toplam: ${collected.length}`);
        if (collected.length >= maxItems) break;
      } catch (err) {
        console.warn(`[Hepsiburada] Sayfa ${p} yükleme hatası:`, err.message);
        break;
      }
    }

    return { reviews: dedupe(collected, maxItems), sources: ['hepsiburada'] };
  }, 'hepsiburada');
}

// ---------------------------------------------------------------------------
//  N11 Review Extraction
// ---------------------------------------------------------------------------
async function scrapeN11Url(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['n11:none'] };
    console.log(`[N11] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });

    const reviewsTab = page.locator('#reviews-tab, a[href="#reviews"]');
    if (await reviewsTab.count()) {
      await reviewsTab.first().click().catch(() => { });
    }

    await delay(1500);
    const collected = [];
    for (let i = 0; i < 3 && collected.length < maxItems; i++) {
      const texts = await page.evaluate(() => {
        const found = [];
        document.querySelectorAll('.commentText, .review-text, .comment-content, .review-item, [class*="review"] p').forEach(el => {
          const t = el.innerText?.trim();
          if (t && t.length > 10) found.push(t);
        });

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
      await next.first().click().catch(() => { });
      await delay(1500);
    }
    return { reviews: dedupe(collected, maxItems), sources: ['n11'] };
  }, 'n11');
}

// ---------------------------------------------------------------------------
//  Pazarama Review Extraction
// ---------------------------------------------------------------------------
async function scrapePazaramaUrl(productUrl, maxItems) {
  return withPage(async (page) => {
    if (!productUrl) return { reviews: [], sources: ['pazarama:none'] };
    console.log(`[Pazarama] Linke gidiliyor: ${productUrl}`);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    await delay(2000);

    const tab = page.locator('button:has-text("Yorumlar"), [data-testid="reviews-tab"]');
    if (await tab.count()) {
      await tab.first().click().catch(() => { });
      await delay(1500);
    }

    const collected = [];
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 800);
      await delay(500);
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
    return { reviews: dedupe(collected, maxItems), sources: ['pazarama'] };
  }, 'pazarama');
}

// ---------------------------------------------------------------------------
//  Çiçeksepeti Review Extraction
// ---------------------------------------------------------------------------
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
    return { reviews: dedupe(collected, maxItems), sources: ['ciceksepeti'] };
  }, 'ciceksepeti');
}

// ---------------------------------------------------------------------------
//  scrapeAllSites - Parallel Orchestration
// ---------------------------------------------------------------------------
export async function scrapeAllSites({ query, maxItems = 200, links = {} }) {
  // Determine which platforms are active.
  // Amazon, Trendyol, Hepsiburada are always active because they have search fallback.
  // n11, pazarama, ciceksepeti are only active if a direct link is provided.
  const activePlatforms = ['amazon', 'trendyol', 'hepsiburada'];
  if (links.n11) activePlatforms.push('n11');
  if (links.pazarama) activePlatforms.push('pazarama');
  if (links.ciceksepeti) activePlatforms.push('ciceksepeti');

  const activeCount = activePlatforms.length;

  // Calculate balanced target limit per platform.
  // We use a 1.5x buffer (capped at maxItems) so that if some platforms yield fewer reviews,
  // other platforms can fill the gap, while still preventing a single platform from dominating the scrapers.
  // A minimum limit of 50 ensures we get a decent number of reviews even when active count is high.
  const targetPerPlatform = Math.min(
    maxItems,
    Math.max(
      Math.ceil((maxItems / activeCount) * 1.5),
      50
    )
  );

  console.log(`[Scraper Orchestration] Active platforms: ${activePlatforms.join(', ')}. Target per platform: ${targetPerPlatform} (total limit: ${maxItems})`);

  const platforms = [
    {
      id: 'amazon',
      fn: async (url) => {
        let res = url ? await scrapeAmazonUrl(url, targetPerPlatform) : { reviews: [] };
        if (!res.reviews || res.reviews.length === 0) {
          console.log(`[Amazon] Link başarısız veya boş, arama yapılıyor...`);
          res = await scrapeAmazon(query, targetPerPlatform);
        }
        return res;
      }
    },
    {
      id: 'trendyol',
      fn: async (url) => {
        let res = url ? await scrapeTrendyolUrl(url, targetPerPlatform) : { reviews: [] };
        if (!res.reviews || res.reviews.length === 0) {
          console.log(`[Trendyol] Link başarısız veya boş, arama yapılıyor...`);
          res = await scrapeTrendyol(query, targetPerPlatform);
        }
        return res;
      }
    },
    {
      id: 'hepsiburada',
      fn: (url) => url ? scrapeHepsiburadaUrl(url, targetPerPlatform) : scrapeHepsiburada(query, targetPerPlatform)
    },
    { id: 'n11', fn: (url) => url ? scrapeN11Url(url, targetPerPlatform) : Promise.resolve({ reviews: [], sources: [] }) },
    { id: 'pazarama', fn: (url) => url ? scrapePazaramaUrl(url, targetPerPlatform) : Promise.resolve({ reviews: [], sources: [] }) },
    { id: 'ciceksepeti', fn: (url) => url ? scrapeCiceksepetiUrl(url, targetPerPlatform) : Promise.resolve({ reviews: [], sources: [] }) }
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
    if (res.sources) allSources.push(...res.sources);
    perPlatform[platformId] = taggedReviews.length;
  });

  return { reviews: allReviews, sources: allSources, perPlatform };
}
