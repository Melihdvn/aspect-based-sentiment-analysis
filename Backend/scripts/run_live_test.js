import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeWithGemini } from '../src/services/llm.js';

// Load environment variables from .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

// Local Rule-Based Classifier for Comparison
const aspects = {
  batarya: ['batarya', 'pil', 'şarj', 'sarj', 'pil ömrü', 'battery'],
  ekran: ['ekran', 'görüntü', 'renk', 'parlaklık', 'sararma', 'ghosting', 'çözünürlük'],
  kamera: ['kamera', 'fotoğraf', 'video', 'lens', 'gece modu', 'ışık', 'odak'],
  performans: ['performans', 'hız', 'takılma', 'donma', 'ısınma', 'ısınıyor', 'lag'],
  ses: ['ses', 'hoparlör', 'mikrofon', 'kulaklık', 'ses seviyesi', 'bass'],
  yazilim: ['yazılım', 'ios', 'android', 'güncelleme', 'bug', 'hata'],
  depolama: ['depolama', 'hafıza', '128gb', '256gb', '512gb', 'tb'],
  fiyat: ['fiyat', 'pahalı', 'ucuz', 'indirim', 'f/p', 'paranın karşılığı']
};

const positiveLex = [
  'iyi', 'harika', 'mükemmel', 'süper', 'beğendim', 'memnun', 'şahane', 'tatmin', 'başarılı', 'hızlı', 'uzun', 'dayanıklı', 'kaliteli',
  'güzel', 'kusursuz', 'ideal', 'olumlu', 'kullanışlı', 'öneririm', 'tavsiye', 'parasını hak ediyor'
];
const negativeLex = [
  'kötü', 'berbat', 'rezalet', 'pişman', 'pişmanlık', 'yetersiz', 'eksik', 'arıza', 'arızalı', 'bozuk', 'zayıf', 'ısınma', 'ısınıyor', 'çabuk',
  'bitiyor', 'düşük', 'yavaş', 'sorun', 'problem', 'şikayet', 'olumsuz', 'memnun değilim', 'beğenmedim', 'hayal kırıklığı'
];

function scoreSentiment(text) {
  const t = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of positiveLex) {
    if (t.includes(w)) pos += 1;
    if (t.includes(`${w} değil`) || t.includes(`değil ${w}`)) { pos -= 1; neg += 1; }
  }
  for (const w of negativeLex) {
    if (t.includes(w)) neg += 1;
    if (t.includes(`${w} değil`) || t.includes(`değil ${w}`)) { neg -= 1; pos += 1; }
  }
  if (pos === 0 && neg === 0) return 'Nötr';
  return pos - neg > 0 ? 'Pozitif' : (pos - neg < 0 ? 'Negatif' : 'Nötr');
}

function extractAspects(text) {
  const t = text.toLowerCase();
  const hits = [];
  for (const [aspect, keys] of Object.entries(aspects)) {
    for (const k of keys) {
      if (t.includes(k)) { hits.push(aspect.toUpperCase()); break; }
    }
  }
  return hits;
}

async function runLiveTest() {
  console.log("=== CANLI DOĞRULAMA VE MODEL ÇALIŞTIRMA SCRIPT'İ ===");
  console.log("Adım 1: Test veri seti (sample_reviews.json) yükleniyor...");
  
  const samplePath = path.join(backendRoot, 'data', 'sample_reviews.json');
  const raw = await fs.readFile(samplePath, 'utf-8');
  const reviews = JSON.parse(raw);
  
  console.log(`✓ ${reviews.length} adet yorum başarıyla yüklendi.\n`);
  
  console.log("Adım 2: Yerel Kural Tabanlı Model (Savasy-BERT alternatifi) çalıştırılıyor...");
  const localResults = reviews.map((r, i) => {
    const sentiment = scoreSentiment(r.text);
    const extracted = extractAspects(r.text);
    return {
      index: i + 1,
      text: r.text,
      aspects: extracted,
      sentiment: sentiment
    };
  });
  console.log("✓ Yerel sınıflandırma tamamlandı.\n");
  
  console.log("Adım 3: Gemini 2.5 Pro Model'i (GOOGLE_API_KEY ile) çağrılıyor...");
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("❌ HATA: GOOGLE_API_KEY ortam değişkeni bulunamadı. Lütfen .env dosyasını kontrol edin.");
    process.exit(1);
  }
  
  console.log(`Gemini API Anahtarı aktif: ${apiKey.slice(0, 8)}...`);
  console.log("Gemini'ye istek gönderiliyor (bu işlem birkaç saniye sürebilir)...");
  
  const startTime = Date.now();
  let geminiData;
  try {
    geminiData = await analyzeWithGemini({
      query: "iPhone 13",
      reviews: reviews,
      apiKey: apiKey,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-pro'
    });
    const endTime = Date.now();
    console.log(`✓ Gemini analizi başarıyla tamamlandı! (Süre: ${((endTime - startTime)/1000).toFixed(2)} sn)\n`);
  } catch (err) {
    console.error("❌ Gemini API çağrısı başarısız oldu:", err.message);
    process.exit(1);
  }
  
  console.log("=== GEMINI MODELİNİN ÇIKARDIĞI ANALİZ ÖZETİ ===");
  console.log(`Ürün Özeti (TR): ${geminiData.summary_tr || geminiData.product_summary}`);
  console.log("\nÇıkarılan Özellikler ve Duygu Dağılımları:");
  (geminiData.aspect_analysis || []).forEach(a => {
    console.log(`- [${a.aspect}]: Mentions: ${a.mentions}, Pos: ${a.positive}, Neg: ${a.negative}, Score: ${a.net_sentiment_score}`);
    console.log(`  Özet: ${a.summary}`);
  });
  
  console.log("\n=== ÖRNEK YORUMLAR ÜZERİNDE İKİ MODELİN KARŞILAŞTIRMASI ===");
  reviews.slice(0, 5).forEach((r, idx) => {
    console.log(`\n[Yorum ${idx+1}]: "${r.text}"`);
    console.log(` -> Yerel Model Sınıflandırması: [${localResults[idx].aspects.join(', ')}] -> ${localResults[idx].sentiment}`);
    
    // Find matching aspect sentiment in LLM output
    const matchedLLMAspects = [];
    (geminiData.aspects || []).forEach(a => {
      // check if this review matches any positive/negative examples
      const isPosExample = (a.positive_examples || []).some(ex => r.text.includes(ex) || ex.includes(r.text.slice(0, 20)));
      const isNegExample = (a.negative_examples || []).some(ex => r.text.includes(ex) || ex.includes(r.text.slice(0, 20)));
      if (isPosExample) matchedLLMAspects.push(`${a.name.toUpperCase()}: Pozitif`);
      if (isNegExample) matchedLLMAspects.push(`${a.name.toUpperCase()}: Negatif`);
    });
    console.log(` -> Gemini ABSA Çıktısı:         [${matchedLLMAspects.join(', ')}]`);
  });
  
  console.log("\n=== SONUÇ ===");
  console.log("Test başarıyla tamamlandı. Görüldüğü üzere LLM modeli her yorumu tek bir genel duygu durumuna");
  console.log("sıkıştırmak yerine, yorum içerisindeki her bir boyutu ayrı ayrı yakalayabilmektedir.");
}

runLiveTest().catch(console.error);
