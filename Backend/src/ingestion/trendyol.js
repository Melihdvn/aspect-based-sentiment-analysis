const DEFAULT_HEADERS = {
  'user-agent': process.env.SCRAPER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8'
};
const DEFAULT_TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS || 8000);

function looksLikeTrendyol(query) {
  const q = String(query || '').toLowerCase();
  return q.includes('trendyol.');
}

// Ürün sayfası URL'sinden yorum sayfası URL'si oluştur
function buildReviewsUrl(productUrl) {
  if (!productUrl || !looksLikeTrendyol(productUrl)) return null;
  try {
    const url = new URL(productUrl);
    // Zaten /yorumlar ile bitiyorsa değiştirme
    if (url.pathname.endsWith('/yorumlar')) return productUrl;
    // Query string ve hash'i temizle, /yorumlar ekle
    url.search = '';
    url.hash = '';
    // Sonunda / varsa kaldır
    if (url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    url.pathname = url.pathname + '/yorumlar';
    return url.toString();
  } catch {
    // URL parse edilemezse basit string ekleme yap
    const cleanUrl = productUrl.split('?')[0].split('#')[0];
    if (cleanUrl.endsWith('/yorumlar')) return cleanUrl;
    return cleanUrl.endsWith('/') ? cleanUrl + 'yorumlar' : cleanUrl + '/yorumlar';
  }
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
  // Ürün sayfası URL'sini yorum sayfası URL'sine dönüştür
  const url = buildReviewsUrl(query) || query;
  try {
    const html = await fetchHtml(url);
    const reviews = extractReviewsFromHtml(html, maxItems);
    console.log(reviews);
    return { reviews, sources: ['trendyol'] };
  } catch (err) {
    return { reviews: [], sources: ['trendyol:error', String(err?.message || err)] };
  }
}
