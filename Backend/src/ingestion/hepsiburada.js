const DEFAULT_HEADERS = {
  'user-agent': process.env.SCRAPER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8'
};
const DEFAULT_TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS || 8000);

function looksLikeHepsiburada(query) {
  const q = String(query || '').toLowerCase();
  return q.includes('hepsiburada.');
}

// Ürün sayfası URL'sinden yorum sayfası URL'si oluştur
function buildReviewsUrl(productUrl) {
  if (!productUrl || !looksLikeHepsiburada(productUrl)) return null;
  try {
    const url = new URL(productUrl);
    // Zaten -yorumlari ile bitiyorsa değiştirme
    if (url.pathname.endsWith('-yorumlari')) return productUrl;
    // Query string ve hash'i temizle
    url.search = '';
    url.hash = '';
    // Sonunda / varsa kaldır
    if (url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    url.pathname = url.pathname + '-yorumlari';
    return url.toString();
  } catch {
    // URL parse edilemezse basit string ekleme yap
    const cleanUrl = productUrl.split('?')[0].split('#')[0];
    if (cleanUrl.endsWith('-yorumlari')) return cleanUrl;
    return cleanUrl.endsWith('/') ? cleanUrl.slice(0, -1) + '-yorumlari' : cleanUrl + '-yorumlari';
  }
}

function extractReviewsFromHtml(html, maxItems) {
  const reviews = [];
  // JSON-LD reviewBody
  try {
    const scripts = html.split('<script').filter(s => s.includes('application/ld+json'));
    for (const block of scripts) {
      const jsonMatch = block.match(/>([\s\S]*?)<\/script>/);
      if (!jsonMatch) continue;
      const raw = jsonMatch[1].trim();
      if (!raw.includes('"@type":"Review"')) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
      const items = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      for (const it of items) {
        if (it && it.reviewBody) reviews.push({ text: it.reviewBody });
        if (Array.isArray(it?.review)) {
          for (const r of it.review) {
            if (r?.reviewBody) reviews.push({ text: r.reviewBody });
          }
        }
        if (reviews.length >= maxItems) return reviews;
      }
    }
  } catch {}

  // Fallback: itemprop reviewBody in HTML
  const bodyRegex = /<[^>]*(?:itemprop=["']reviewBody["']|class=["'][^"']*review-text[^"']*["'])[^>]*>([\s\S]*?)<\/[^>]+>/gi;
  let m;
  while ((m = bodyRegex.exec(html)) && reviews.length < maxItems) {
    const text = m[1]
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.split(' ').length >= 5) reviews.push({ text });
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

export async function ingestHepsiburada({ query, maxItems = 200 }) {
  if (!looksLikeHepsiburada(query)) {
    return { reviews: [], sources: ['hepsiburada:unresolved'] };
  }
  // Ürün sayfası URL'sini yorum sayfası URL'sine dönüştür
  const url = buildReviewsUrl(query) || query;
  try {
    const html = await fetchHtml(url);
    const reviews = extractReviewsFromHtml(html, maxItems);
    return { reviews, sources: ['hepsiburada'] };
  } catch (err) {
    return { reviews: [], sources: ['hepsiburada:error', String(err?.message || err)] };
  }
}
