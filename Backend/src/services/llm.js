import { GoogleGenerativeAI } from "@google/generative-ai";

function stripJson(text) {
  if (!text) return text;
  let t = text.trim();
  // Remove code fences if present
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    t = t.slice(start, end + 1);
  }
  return t;
}

export async function analyzeWithGemini({ query, reviews, apiKey, model = 'gemini-1.5-flash' }) {
  if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelRef = genAI.getGenerativeModel({ model });

  const maxReviews = Number(process.env.GEMINI_MAX_REVIEWS || 120);
  const maxChars = Number(process.env.GEMINI_MAX_CHARS || 280);
  const maxN = Math.min(maxReviews, reviews.length);
  const joined = reviews
    .slice(0, maxN)
    .map((r) => `- ${r.text?.toString().replace(/\s+/g, ' ').slice(0, maxChars)}`)
    .join('\n');
  console.log("Prompt yollandı.");
  const prompt = (
    `Sen Türkçe ürün yorum analizi yapan bir yardımcı modelsin.\n` +
    `Görevin: verilen yorumlardan 'ÜRÜNE AİT' boyutları (ör. batarya, ekran, kamera, performans, yazılım, ses, depolama, fiyat, servis) ve her boyut için olumlu/olumsuz sinyalleri çıkarmak; kronik sorunlar ve övgüleri oranlayıp kısa bir özet üretmek.\n` +
    `SADECE nihai JSON çıktısını ver; açıklama/markdown/kod bloğu ekleme.\n\n` +
    `Kapsam ve hariç tutma (çok önemli):\n` +
    `- Yalnızca ürünle ilgili içerikleri değerlendir.\n` +
    `- Şu dış etkenleri tamamen YOK SAY: satıcı/mağaza, kargo/teslimat/paketleme, web sitesi/uygulama deneyimi, idari iade/servis süreçleri.\n` +
    `- Amaç ürün kararı; satın alınacak yeri değerlendirme.\n\n` +
    `Negasyon ve kutupluluk:\n` +
    `- “X değil”, “yeterli değil”, “sorun yok”, “problem yok”, “pişman değilim”, “kötü değil” → olumsuzluğu tersine çevir.\n` +
    `- “X demek doğru değil” → X iddiasını reddeder (negatif değil, genelde olumlu/nötr).\n` +
    `- Örnekler (negatif DEĞİL):\n` +
    `  • "Depolama 128GB bana yetti, iCloud ile sorun yok." → depolama: pozitif\n` +
    `  • "Batarya çabuk bitiyor demek doğru değil, bana bir gün yetiyor." → batarya: pozitif\n\n` +
    `Filtreleme: 5 kelimeden kısa ve içeriksiz yorumları at; tekrarları kullanma.\n\n` +
    `Çıktı şeması (yalnızca geçerli JSON, eksik parantez veya virgül olmamasına ÇOK DİKKAT ET):\n` +
    `{\n  "aspects": [\n    {\n      "name": "batarya",\n      "positive_count": 0,\n      "negative_count": 0,\n` +
    `      "summary_tr": "Kullanıcılar bataryanın .... olduğunu belirtmiş...",\n` +
    `      "positive_examples": [],\n      "negative_examples": []\n    }\n  ],\n  "highlights": {\n    "issues": [\n      {"name": "...", "reason": "kısa gerekçe (ürüne dair)"}\n    ],\n    "praises": [\n      {"name": "...", "reason": "kısa gerekçe (ürüne dair)"}\n    ]\n  },\n  "summary_tr": "Ürün için kısa ve net sonuç."\n}\n\n` +
    `\nÖNEMLİ KURALLAR:\n` +
    `- "summary_tr" alanını yazarken robotik bir dil değil, doğal ve kapsayıcı bir dil kullan ("... belirtilmiştir", "... vurgulanmıştır" yerine, "Ekranın çok net ve parlak olduğunu söylüyorlar" gibi sıcak ve analiz odaklı yaz).\n` +
    `- **DİKKAT:** Bir özellikle (aspect) ilgili HİÇ yorum yoksa (positive_count=0 ve negative_count=0 ise), o özelliği JSON'a KESİNLİKLE EKLEME (örn: 'depolama' hakkında yorum yoksa JSON'da 'depolama' objesi olmasın).\n` +
    `- Yalnızca kullanıcıların gerçekten bahsettiği konulardan bahset.\n\n` +
    `Ürün: ${query}\n` +
    `Yorumlar:\n${joined}\n`
  );

  const maxRetries = Number(process.env.LLM_RETRIES || 5);
  const baseDelay = Number(process.env.LLM_BACKOFF_MS || 800);
  let text = '';
  let data;
  for (let attempt = 0; attempt <= maxRetries; attempt++){
    try{
      const resp = await modelRef.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
      text = resp?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (process.env.LOG_LLM === '1') {
        console.log('[LLM][Gemini] Raw response text:\n', text);
      }
      const jsonText = stripJson(text);
      try {
        data = JSON.parse(jsonText);
      } catch (err) {
        console.error('[LLM][Gemini] JSON parse error:', err?.message || err);
        console.error('[LLM][Gemini] Received text (after strip):\n', jsonText);
        throw err;
      }
      break; // parsed ok
    } catch(err){
      const msg = String(err?.message || err || '').toLowerCase();
      const retryable = msg.includes('503') || msg.includes('429') || msg.includes('overload') || msg.includes('unavailable');
      if (retryable && attempt < maxRetries){
        const jitter = Math.floor(Math.random() * 200);
        const wait = baseDelay * Math.pow(2, attempt) + jitter;
        if (process.env.LOG_LLM === '1') {
          console.warn(`[LLM][Gemini] retry ${attempt+1}/${maxRetries} after ${wait}ms due to:`, err?.message || err);
        }
        await new Promise(r=>setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }

  const aspects = Array.isArray(data.aspects) ? data.aspects : [];
  const aspect_stats = aspects.map((a) => ({
    aspect: a.name,
    count: (a.positive_count || 0) + (a.negative_count || 0),
    ratio: 0,
    positive: a.positive_count || 0,
    negative: a.negative_count || 0,
    pos_ratio: 0,
    neg_ratio: 0,
    examplesPos: (a.positive_examples || []).slice(0, 3),
    examplesNeg: (a.negative_examples || []).slice(0, 3),
    summary: a.summary_tr || ''
  }));

  return {
    aspect_stats,
    highlights: data.highlights || { issues: [], praises: [] },
    summary: data.summary_tr || '',
  };
}
