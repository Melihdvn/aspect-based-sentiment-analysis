import { ingestAmazon } from './amazon.js';
import { ingestTrendyol } from './trendyol.js';
import { ingestHepsiburada } from './hepsiburada.js';
import { scrapeAllSites, scrapeAmazonUrl } from './search_playwright.js';

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function dedupeAndCap(reviews, maxItems) {
  const seen = new Set();
  const out = [];
  for (const r of reviews) {
    if (!r || !r.text) continue;
    const t = normalizeText(r.text);
    if (!t || t.split(' ').length < 5) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: t });
    if (out.length >= maxItems) break;
  }
  return out;
}

function detectSource(query) {
  const q = String(query || '').toLowerCase();
  if (q.includes('amazon.')) return 'amazon';
  if (q.includes('trendyol.')) return 'trendyol';
  if (q.includes('hepsiburada.')) return 'hepsiburada';
  return 'unknown';
}

const looksLikeUrl = (q) => /^https?:\/\//i.test(String(q || ''));

export async function ingestFromQuery({ query, maxItems = 200 }) {
  if (process.env.ENABLE_LIVE !== '1') {
    return { reviews: [], sources: ['live-disabled'] };
  }

  if (looksLikeUrl(query)) {
    const source = detectSource(query);
    try {
      if (source === 'amazon') {
        const live = await scrapeAmazonUrl(query, maxItems);
        if (live?.reviews?.length) return live;
        const fallback = await ingestAmazon({ query, maxItems });
        if (fallback?.reviews?.length) return fallback;
        return live;
      }
      if (source === 'trendyol') return ingestTrendyol({ query, maxItems });
      if (source === 'hepsiburada') return ingestHepsiburada({ query, maxItems });
      return { reviews: [], sources: ['unknown-source'] };
    } catch (err) {
      return { reviews: [], sources: [`${source}:error`, String(err?.message || err)] };
    }
  }

  const res = await scrapeAllSites({ query, maxItems });
  const cleaned = dedupeAndCap(res.reviews || [], maxItems);
  return { reviews: cleaned, sources: res.sources || [] };
}