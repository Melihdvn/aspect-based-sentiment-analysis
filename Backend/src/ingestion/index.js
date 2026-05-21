import {
  extractTitleFromAmazon,
  extractTitleFromTrendyol,
  extractTitleFromHepsiburada,
  normalizeTitle
} from './titleExtractor.js';
import { withPage, scrapeAllSites } from './search_playwright.js';
import { scrapeAkakceForLinks } from './akakce.js';
import { scrapeCimriForLinks } from './cimri.js';

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function balanceAndDedupeReviews(reviews, maxItems) {
  const normalized = [];
  const seen = new Set();

  // 1. Initial deduplication and cleaning
  for (const r of reviews) {
    if (!r || !r.text) continue;
    const t = normalizeText(r.text);
    if (!t || t.split(' ').length < 3) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ text: t, platform: r.platform || 'unknown' });
  }

  // 2. Group by platform
  const byPlatform = {};
  for (const r of normalized) {
    const p = r.platform || 'unknown';
    if (!byPlatform[p]) {
      byPlatform[p] = [];
    }
    byPlatform[p].push(r);
  }

  const platforms = Object.keys(byPlatform);
  if (platforms.length === 0) return [];

  // 3. Proportional extraction loop (Round-Robin)
  const out = [];
  const activePlatforms = new Set(platforms);
  
  while (out.length < maxItems && activePlatforms.size > 0) {
    for (const p of Array.from(activePlatforms)) {
      if (byPlatform[p].length > 0) {
        out.push(byPlatform[p].shift());
        if (out.length >= maxItems) break;
      } else {
        activePlatforms.delete(p);
      }
    }
  }

  return out;
}

function computePerPlatform(reviews) {
  const perPlatform = {};
  for (const r of reviews) {
    if (r.platform) {
      perPlatform[r.platform] = (perPlatform[r.platform] || 0) + 1;
    }
  }
  return perPlatform;
}

function detectSource(query) {
  const q = String(query || '').toLowerCase();
  if (q.includes('amazon.')) return 'amazon';
  if (q.includes('trendyol.')) return 'trendyol';
  if (q.includes('hepsiburada.')) return 'hepsiburada';
  if (q.includes('n11.')) return 'n11';
  if (q.includes('pazarama.')) return 'pazarama';
  if (q.includes('ciceksepeti.')) return 'ciceksepeti';
  return 'unknown';
}

const looksLikeUrl = (q) => /^https?:\/\//i.test(String(q || ''));

export async function ingestFromQuery({ query, maxItems = 200 }) {
  if (process.env.ENABLE_LIVE !== '1') {
    return { reviews: [], sources: ['live-disabled'], productTitle: '', perPlatform: {} };
  }

  // Clear carriage returns/line breaks
  const searchInput = String(query || '').trim().replace(/[\u21B5\r\n\t]/g, '');
  
  let links = {};
  let discoveredTitle = searchInput;

  // 1. Direct URL extraction
  if (looksLikeUrl(searchInput)) {
    const sourcePlatform = detectSource(searchInput);
    console.log(`[Ingestion] Direct URL detected: ${searchInput} (${sourcePlatform})`);
    
    const extraction = await withPage(async (page) => {
      await page.goto(searchInput, { waitUntil: 'domcontentloaded' });
      let title = '';
      if (sourcePlatform === 'amazon') title = await extractTitleFromAmazon(page, searchInput);
      else if (sourcePlatform === 'trendyol') title = await extractTitleFromTrendyol(page, searchInput);
      else if (sourcePlatform === 'hepsiburada') title = await extractTitleFromHepsiburada(page, searchInput);
      else title = await page.title();
      return { title };
    }, sourcePlatform).catch(() => ({ title: '' }));

    if (extraction.title) {
      discoveredTitle = normalizeTitle(extraction.title);
      if (sourcePlatform !== 'unknown') links[sourcePlatform] = searchInput;
    }
  }

  // 2. Cross-platform discovery (Akakçe + Cimri)
  try {
    const akakceRes = await scrapeAkakceForLinks(discoveredTitle).catch(() => ({ links: {} }));
    links = { ...akakceRes.links, ...links };
    if (akakceRes.title && (discoveredTitle === searchInput || discoveredTitle.length < 5)) {
      discoveredTitle = akakceRes.title;
    }

    const cimriRes = await scrapeCimriForLinks(discoveredTitle).catch(() => ({ links: {} }));
    for (const [merchant, url] of Object.entries(cimriRes.links || {})) {
      if (!links[merchant]) {
        links[merchant] = url;
      }
    }
    
    if (cimriRes.title && discoveredTitle === searchInput) {
      discoveredTitle = cimriRes.title;
    }
  } catch (err) {
    console.warn('[Discovery] Cross-platform search failed:', err.message);
  }

  // 3. Multi-platform parallel scraping
  const searchQuery = looksLikeUrl(searchInput) ? discoveredTitle : searchInput;
  console.log(`[Ingestion] Starting parallel scraping for query: "${searchQuery}" with links:`, links);
  
  const res = await scrapeAllSites({ query: searchQuery, maxItems, links });
  const cleaned = balanceAndDedupeReviews(res.reviews || [], maxItems);
  
  console.log(`[Ingestion] Completed. Scraped total of ${cleaned.length} reviews.`);
  
  return {
    reviews: cleaned,
    sources: res.sources || [],
    productTitle: discoveredTitle || searchInput,
    perPlatform: computePerPlatform(cleaned)
  };
}