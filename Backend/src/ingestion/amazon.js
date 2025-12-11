const DEFAULT_HEADERS = {
  'user-agent': process.env.SCRAPER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8'
};
const DEFAULT_TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS || 8000);

// Quick-and-dirty HTML to text extraction for Amazon review bodies.
function extractReviewsFromHtml(html, maxItems) {
  const reviews = [];
  const bodyRegex = /<span[^>]*data-hook=["']review-body["'][^>]*>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = bodyRegex.exec(html)) && reviews.length < maxItems) {
    const text = match[1]
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.split(' ').length >= 5) {
      reviews.push({ text });
    }
  }
  return reviews;
}

async function fetchHtml(url, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: DEFAULT_HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function looksLikeAmazonUrl(query) {
  const q = String(query || '').toLowerCase();
  return q.includes('amazon.') || q.includes('amzn');
}

// Extract ASIN from a product URL if present.
function extractAsin(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('dp');
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  } catch { /* ignore */ }
  return null;
}

// Build a review page URL from a product URL or ASIN.
function buildReviewsUrl(query) {
  if (!looksLikeAmazonUrl(query)) return null;
  const asin = extractAsin(query);
  const base = asin ? `https://www.amazon.com.tr/product-reviews/${asin}` : null;
  if (base) return `${base}?reviewerType=all_reviews&language=tr_TR&filterByStar=all_stars&pageNumber=1`;
  if (query.includes('product-reviews')) return query;
  // If a full reviews URL was already provided, keep it.
  if (query.includes('product-reviews')) return query;
  return null;
}

export async function ingestAmazon({ query, maxItems = 200 }) {
  const url = buildReviewsUrl(query);
  if (!url) {
    return { reviews: [], sources: ['amazon:unresolved'] };
  }

  try {
    const html = await fetchHtml(url);
    const reviews = extractReviewsFromHtml(html, maxItems);
    return { reviews, sources: ['amazon'] };
  } catch (err) {
    return { reviews: [], sources: ['amazon:error', String(err?.message || err)] };
  }
}
