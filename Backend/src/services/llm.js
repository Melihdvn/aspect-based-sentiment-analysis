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

  // Her yorumu platform etiketiyle formatla
  const joined = reviews
    .slice(0, maxN)
    .map((r) => {
      const platformTag = r.platform ? `[${r.platform}] ` : '';
      return `- ${platformTag}${r.text?.toString().replace(/\s+/g, ' ').slice(0, maxChars)}`;
    })
    .join('\n');

  // Hangi platformlardan yorum geldiğini tespit et
  const platformsInData = [...new Set(reviews.slice(0, maxN).map(r => r.platform).filter(Boolean))];
  const platformInfo = platformsInData.length > 0
    ? `Bu yorumlar şu platformlardan toplandı: ${platformsInData.join(', ')}. Her yorumun başında platform etiketi ([amazon], [trendyol], [hepsiburada]) bulunmaktadır.\n`
    : '';

  // JSON şemasını ayrı bir string olarak oluştur (escape sorunlarını önlemek için)
  const jsonSchema = JSON.stringify({
    aspects: [
      {
        name: "batarya",
        positive_count: 0,
        negative_count: 0,
        summary_tr: "Kullanıcılar bataryanın .... olduğunu belirtmiş...",
        positive_examples: [],
        negative_examples: []
      }
    ],
    highlights: {
      issues: [{ name: "...", reason: "kısa gerekçe (ürüne dair)" }],
      praises: [{ name: "...", reason: "kısa gerekçe (ürüne dair)" }]
    },
    per_platform_summary: {
      amazon: "Amazon kullanıcıları özellikle X konusunda olumlu/olumsuz...",
      trendyol: "Trendyol kullanıcıları genel olarak...",
      hepsiburada: "Hepsiburada kullanıcıları..."
    },
    summary_tr: "Ürün için kısa ve net sonuç."
  }, null, 2);

  console.log("Prompt yollandı.");
  const prompt = [
    `Sen Türkçe ürün yorum analizi yapan bir yardımcı modelsin.`,
    `Görevin: verilen yorumlardan SADECE 'ÜRÜNE AİT' teknik ve kullanım boyutlarını (ör. performans, yazılım, batarya, tasarım, malzeme kalitesi, fiyat/performans ve ürün türüne göre ekran, ses, depolama gibi ilgili kategoriler) çıkarmak ve olumlu/olumsuz sinyalleri gruplamaktır.`,
    `SADECE nihai JSON çıktısını ver; açıklama/markdown/kod bloğu ekleme.`,
    ``,
    platformInfo,
    `KAPSAM DIŞI KONULAR (BUNLARI KESİNLİKLE JSON'A EKLEME):`,
    `- Kargo hızı, teslimat süresi, kurye/kargocu sorunları, paketleme kalitesi`,
    `- Ürün ile alakalı olmayan genel platform/site sorunları (Takas sistemi vb.)`,
    `- Satıcı güvenilirliği, satıcı/mağaza iletişimi`,
    `- Müşteri hizmetleri, garanti servisi, iade süreçleri, teknik servis`,
    `- "Kargo", "Satıcı", "Paketleme", "Servis" gibi aspect'ler (boyutlar) KESİNLİKLE OLUŞTURMA. Sadece ürünün kendi donanımı, yazılımı ve performansı ile ilgilen.`,
    ``,
    `Negasyon ve kutupluluk:`,
    `- "X değil", "yeterli değil", "sorun yok", "problem yok", "pişman değilim", "kötü değil" → olumsuzluğu tersine çevir.`,
    `- "X demek doğru değil" → X iddiasını reddeder (negatif değil, genelde olumlu/nötr).`,
    `- Örnekler (negatif DEĞİL):`,
    `  • "Depolama 128GB bana yetti, iCloud ile sorun yok." → depolama: pozitif`,
    `  • "Batarya çabuk bitiyor demek doğru değil, bana bir gün yetiyor." → batarya: pozitif`,
    ``,
    `Filtreleme: 5 kelimeden kısa ve içeriksiz yorumları at; tekrarları kullanma.`,
    ``,
    `Çıktı şeması (yalnızca geçerli JSON, eksik parantez veya virgül olmamasına ÇOK DİKKAT ET):`,
    jsonSchema,
    ``,
    `ÖNEMLİ KURALLAR:`,
    `- "summary_tr" alanını yazarken robotik bir dil değil, doğal ve kapsayıcı bir dil kullan.`,
    `- "per_platform_summary" alanında yalnızca veride mevcut platformları yaz; veri yoksa o platformu ekleme.`,
    `- **DİKKAT:** Bir özellikle (aspect) ilgili HİÇ yorum yoksa (positive_count=0 ve negative_count=0 ise), o özelliği JSON'a KESİNLİKLE EKLEME.`,
    `- Yalnızca kullanıcıların gerçekten bahsettiği konulardan bahset.`,
    ``,
    `Ürün: ${query}`,
    `Yorumlar:`,
    joined
  ].join('\n');

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
  const aspect_stats = aspects
    .map((a) => ({
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
    }))
    .filter(a => a.count > 0);

  return {
    aspect_stats,
    highlights: data.highlights || { issues: [], praises: [] },
    summary: data.summary_tr || '',
    per_platform_summary: data.per_platform_summary || {}
  };
}
