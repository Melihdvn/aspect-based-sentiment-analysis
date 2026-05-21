import { GoogleGenerativeAI } from "@google/generative-ai";

function stripJson(text) {
  if (!text) return text;
  let t = text.trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    t = t.slice(start, end + 1);
  }
  return t;
}

export async function analyzeWithGemini({ query, reviews, apiKey, model = 'gemini-2.5-pro' }) {
  if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelRef = genAI.getGenerativeModel({ model });

  const maxReviews = Number(process.env.GEMINI_MAX_REVIEWS || 250);
  const maxChars = Number(process.env.GEMINI_MAX_CHARS || 300);
  const maxN = Math.min(maxReviews, reviews.length);

  // Format comments with platform tags
  const joined = reviews
    .slice(0, maxN)
    .map((r) => {
      const platformTag = r.platform ? `[${r.platform}] ` : '';
      return `- ${platformTag}${r.text?.toString().replace(/\s+/g, ' ').slice(0, maxChars)}`;
    })
    .join('\n');

  const platformsInData = [...new Set(reviews.slice(0, maxN).map(r => r.platform).filter(Boolean))];
  const platformInfo = platformsInData.length > 0
    ? `Each review is prefixed with a platform tag: ${platformsInData.join(', ')}.\n`
    : '';

  const jsonSchema = JSON.stringify({
    product_summary: "Clean, objective, evidence-based overall summary in Turkish.",
    summary_tr: "Ürün için Türkçe kısa, net, kanıta dayalı genel sonuç.",
    overall_sentiment: {
      positive: 0,
      negative: 0,
      neutral: 0,
      confidence: 0.0
    },
    aspects: [
      {
        name: "batarya",
        positive_count: 0,
        negative_count: 0,
        summary_tr: "Kullanıcılar bataryanın .... olduğunu belirtmiş...",
        positive_examples: ["Kullanıcı yorumundan gerçek bir Türkçe olumlu alıntı (örn: 'şarjı 2 gün gidiyor')"],
        negative_examples: ["Kullanıcı yorumundan gerçek bir Türkçe olumsuz alıntı (örn: 'şarjı çok yavaş doluyor')"]
      }
    ],
    aspect_analysis: [
      {
        aspect: "BATTERY",
        mentions: 0,
        positive: 0,
        negative: 0,
        net_sentiment_score: 0.0,
        confidence: 0.0,
        summary: "Concise summary in Turkish explaining consensus for this aspect."
      }
    ],
    highlights: {
      issues: [{ name: "Zayıf Yön Adı", reason: "Ürüne dair kısa Türkçe gerekçe." }],
      praises: [{ name: "Güçlü Yön Adı", reason: "Ürüne dair kısa Türkçe gerekçe." }]
    },
    key_insights: {
      strongest_points: [
        { name: "Güçlü Özellik", reason: "Grounding reason in Turkish." }
      ],
      weakest_points: [
        { name: "Zayıf Özellik", reason: "Grounding reason in Turkish." }
      ],
      surprises: [
        "Concise unexpected findings in Turkish."
      ]
    },
    data_quality: {
      total_reviews: 0,
      aspect_coverage_ratio: 0.0,
      noise_ratio: 0.0
    }
  }, null, 2);

  const prompt = [
    `You are a strict Product Review Intelligence Engine. Your job is not to summarize text casually, but to extract structured, verifiable, aspect-based product intelligence from user reviews.`,
    ``,
    `INPUT:`,
    platformInfo,
    ``,
    `HARD RULES (NON-NEGOTIABLE):`,
    `1. Only extract information related to the PRODUCT ITSELF:`,
    `   - Allowed aspects: hardware, build quality, performance, battery, screen, camera, software, usability, durability, price/performance perception.`,
    `   - Forbidden: shipping, seller behavior, delivery speed, packaging, customer service, logistics, platform complaints.`,
    `2. Do NOT invent aspects. Only use aspects explicitly supported by reviews.`,
    `3. Do NOT generalize across platforms unless statistically supported.`,
    `4. Every claim must be grounded in multiple reviews when possible. If sample size is small, mark confidence as LOW.`,
    `5. Handle negation correctly:`,
    `   - "iyi değil" = negative`,
    `   - "kötü değil" = neutral/positive leaning depending context`,
    `   - "pişman değilim" = positive sentiment`,
    `6. Merge semantic duplicates strictly into capital case aspect clusters:`,
    `   - "tuş", "tıklama", "click feel" → BUTTONS_AND_CLICK (mapped to "tuşlar_ve_tıklama" in Turkish name)`,
    `   - "pil", "batarya", "şarj" → BATTERY (mapped to "batarya" in Turkish name)`,
    `   - "performans", "hız", "lag" → PERFORMANCE (mapped to "performans" in Turkish name)`,
    `   - "ekran", "parlaklık", "çözünürlük" → SCREEN (mapped to "ekran" in Turkish name)`,
    `   - "ses", "hoparlör", "mikrofon" → SOUND (mapped to "ses" in Turkish name)`,
    `   - "yazılım", "güncelleme", "bug" → SOFTWARE (mapped to "yazılım" in Turkish name)`,
    `   - "tasarım", "malzeme", "kasa" → BUILD_QUALITY (mapped to "tasarım" in Turkish name)`,
    `   - "fiyat", "pahalı", "ucuz" → PRICE_PERCEPTION (mapped to "fiyat" in Turkish name)`,
    `   - "kamera", "fotoğraf", "video", "lens" → CAMERA (mapped to "kamera" in Turkish name)`,
    `   - "depolama", "hafıza", "alan", "disk" → STORAGE (mapped to "depolama" in Turkish name)`,
    `7. If uncertain → reduce confidence, do not guess.`,
    `8. STRICT TURKISH SPELLING & CASING RULE (CRITICAL):`,
    `   - All aspect names, product summaries, insights, highlights, and examples MUST be written in natural, correct, and grammatically proper Turkish.`,
    `   - Pay extreme attention to Turkish character casing: uppercase "İ" corresponds to lowercase "i" (e.g., use "İyi" / "İşlemci", NOT "Iyi" / "Işlemci"), and uppercase "I" corresponds to lowercase "ı" (e.g., use "Hızlı" / "Tasarım", NOT "Hizli" / "Tasarim").`,
    `   - Ensure proper use of dotted/dotless letters. For example, never use lowercase "i" in place of "ı" (e.g. use "şarjı", "özelliği", "tasarımı", "yazılımı" - NOT "şarji", "özelliği", "tasarimi", "yazilimi"), and never use lowercase "ı" in place of "i" (e.g. use "bilgi", "kullanıcı" - NOT "bılgi", "kullanıcı").`,
    ``,
    `DATA SIZE & COUNTING ACCURACY (CRITICAL FOR RESEARCH QUALITY):`,
    `- We are providing you with up to ${maxN} reviews. You MUST analyze all of them.`,
    `- DO NOT under-count. Count every single valid positive/negative aspect mention across all reviews.`,
    `- If 100 reviews mention performance positively, positive_count for PERFORMANCE must be close to 100, not a small single-digit count.`,
    `- The total of positive, negative, and neutral counts in "overall_sentiment" MUST sum up EXACTLY to the number of reviews analyzed (total_reviews).`,
    `- Your stats must realistically reflect the entire volume of comments provided, showing your rigorous statistical processing of large datasets.`,
    ``,
    `OUTPUT FORMAT (STRICT JSON ONLY):`,
    `Return ONLY a valid JSON string matching this exact schema:`,
    jsonSchema,
    ``,
    `QUALITY CONTROL STEP (INTERNAL BEFORE ANSWER):`,
    `- Verify aspect counts`,
    `- Verify sentiment totals align with mentions`,
    `- Ensure no non-product content exists`,
    `- Ensure JSON validity`,
    `- Ensure no hallucinated aspects`,
    ``,
    `Product to analyze: ${query}`,
    `Reviews list:`,
    joined
  ].join('\n');

  console.log("[LLM][Gemini] Sending strict blended Product Review Intelligence Engine prompt...");
  
  const maxRetries = Number(process.env.LLM_RETRIES || 5);
  const baseDelay = Number(process.env.LLM_BACKOFF_MS || 800);
  let text = '';
  let data;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++){
    try {
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
    } catch (err) {
      const msg = String(err?.message || err || '').toLowerCase();
      const retryable = msg.includes('503') || msg.includes('429') || msg.includes('overload') || msg.includes('unavailable');
      if (retryable && attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 200);
        const wait = baseDelay * Math.pow(2, attempt) + jitter;
        console.warn(`[LLM][Gemini] Retry ${attempt+1}/${maxRetries} after ${wait}ms due to error:`, err?.message || err);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }

  return data;
}
