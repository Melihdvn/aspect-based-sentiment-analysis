const DEFAULT_HEADERS = {
  'user-agent': process.env.SCRAPER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8'
};
const DEFAULT_TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS || 8000);

function looksLikeTrendyol(query) {
  const q = String(query || '').toLowerCase();
  return q.includes('trendyol.');
}

function extractReviewsFromHtml(html, maxItems) {
  const reviews = [];
  const inlineComment = new RegExp('\\"comment\\"\s*:\s*\\"([^\\"]{3,300})\\"', 'g');
  let m;
  while ((m = inlineComment.exec(html)) && reviews.length < maxItems) {
    const text = m[1].replace(/\n/g,' ').replace(/\s+/g,' ').trim();
    if (text.split(' ').length >= 3) reviews.push({ text });
  }
  if (reviews.length < maxItems) {
    const commentRegex = new RegExp('<p[^>]*class=["\']comment["\'][^>]*>([\\s\\S]*?)<\\/p>', 'gi');
    const altRegex = new RegExp('<div[^>]*class=["\'][^"\']*comment[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/div>', 'gi');
    while ((m = commentRegex.exec(html)) && reviews.length < maxItems) {
      const t = m[1].replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      if (t.split(' ').length >= 3) reviews.push({ text: t });
    }
    while ((m = altRegex.exec(html)) && reviews.length < maxItems) {
      const t = m[1].replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      if (t.split(' ').length >= 3) reviews.push({ text: t });
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

export async function ingestTrendyol({ query, maxItems = 200 }) {
  if (!looksLikeTrendyol(query)) {
    return { reviews: [], sources: ['trendyol:unresolved'] };
  }
  const url = query;
  try {
    const html = await fetchHtml(url);
    const reviews = extractReviewsFromHtml(html, maxItems);
    console.log(reviews);
    return { reviews, sources: ['trendyol'] };
  } catch (err) {
    return { reviews: [], sources: ['trendyol:error', String(err?.message || err)] };
  }
}
