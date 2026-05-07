import { extractTitleFromAmazon, extractTitleFromTrendyol, extractTitleFromHepsiburada, normalizeTitle } from './titleExtractor.js';
import { withPage, scrapeAllSites } from './search_playwright.js';
import { scrapeAkakceForLinks } from './akakce.js';
import { scrapeCimriForLinks } from './cimri.js';

// TIMESTAMP: 2026-04-28-14-58
function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function dedupeAndCap(reviews, maxItems) {
  const seen = new Set();
  const out = [];
  for (const r of reviews) {
    if (!r || !r.text) continue;
    const t = normalizeText(r.text);
    if (!t || t.split(' ').length < 3) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: t, platform: r.platform || undefined });
    if (out.length >= maxItems) break;
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

  // URL'nin sonundaki enter veya görünmez karakterleri temizle
  const searchInput = String(query || '').trim().replace(/[\u21B5\r\n\t]/g, '');
  
  let links = {};
  let discoveredTitle = searchInput;

// [Ingestion] URL algılandı
  if (looksLikeUrl(searchInput)) {
    const sourcePlatform = detectSource(searchInput);
    
    const extraction = await withPage(async (page) => {
      await page.goto(searchInput, { waitUntil: 'domcontentloaded' });
      let title = '';
      if (sourcePlatform === 'amazon') title = await extractTitleFromAmazon(page, searchInput);
      else if (sourcePlatform === 'trendyol') title = await extractTitleFromTrendyol(page, searchInput);
      else if (sourcePlatform === 'hepsiburada') title = await extractTitleFromHepsiburada(page, searchInput);
      else title = await page.title();
      return { title };
    }).catch(() => ({ title: '' }));

    if (extraction.title) {
      discoveredTitle = normalizeTitle(extraction.title);
      if (sourcePlatform !== 'unknown') links[sourcePlatform] = searchInput;
    }
  }

  // 2. Link Keşfi (Akakçe/Cimri)
  try {
    const akakceRes = await scrapeAkakceForLinks(discoveredTitle).catch(() => ({ links: {} }));
    links = { ...akakceRes.links, ...links };
    if (akakceRes.title && (discoveredTitle === searchInput || discoveredTitle.length < 5)) {
      discoveredTitle = akakceRes.title;
    }

    // Her halükarda Cimri'ye de bakarak daha fazla satıcı bulmaya çalış (kullanıcının isteği üzerine daha detaylı tarama)
    const cimriRes = await scrapeCimriForLinks(discoveredTitle).catch(() => ({ links: {} }));
    // Akakce'de olanı ezmemek için Cimri'den gelenleri sadece eksikse ekle
    for (const [merchant, url] of Object.entries(cimriRes.links || {})) {
      if (!links[merchant]) {
        links[merchant] = url;
      }
    }
    
    if (cimriRes.title && discoveredTitle === searchInput) {
      discoveredTitle = cimriRes.title;
    }
  } catch (err) {
    // Sessiz hata yönetimi
  }

  // 3. Çoklu Platform Kazıma
  // Eğer kullanıcı link girmediyse (metin aratıyorsa), arama sorgusu olarak doğrudan kullanıcının girdiği 
  // kısa/öz metni kullan. Aksi halde aşırı uzun Akakçe başlıkları Amazon/Trendyol aramalarında sonuç vermiyor.
  const searchQuery = looksLikeUrl(searchInput) ? discoveredTitle : searchInput;
  const res = await scrapeAllSites({ query: searchQuery, maxItems, links });
  const cleaned = dedupeAndCap(res.reviews || [], maxItems);
  
  return {
    reviews: cleaned,
    sources: res.sources || [],
    productTitle: discoveredTitle || searchInput,
    perPlatform: computePerPlatform(cleaned)
  };
}