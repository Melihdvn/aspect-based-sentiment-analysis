import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFromQuery } from '../ingestion/index.js';
import { analyzeWithGemini } from './llm.js';
import { preprocessReviews } from './nlpClient.js';
import { prisma } from './db.js';

// Aspect keywords (TR) — extendable
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

// Simple lexicons with negation handling support (… değil)
const positiveLex = [
  'iyi', 'harika', 'mükemmel', 'süper', 'beğendim', 'memnun', 'şahane', 'tatmin', 'başarılı', 'hızlı', 'uzun', 'dayanıklı', 'kaliteli',
  'güzel', 'kusursuz', 'ideal', 'olumlu', 'kullanışlı', 'öneririm', 'tavsiye', 'parasını hak ediyor'
];
const negativeLex = [
  'kötü', 'berbat', 'rezalet', 'pişman', 'pişmanlık', 'yetersiz', 'eksik', 'arıza', 'arızalı', 'bozuk', 'zayıf', 'ısınma', 'ısınıyor', 'çabuk',
  'bitiyor', 'düşük', 'yavaş', 'sorun', 'problem', 'şikayet', 'olumsuz', 'memnun değilim', 'beğenmedim', 'hayal kırıklığı'
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreSentiment(text) {
  const t = normalize(text);
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
  if (pos === 0 && neg === 0) return 0;
  return pos - neg; // >0: positive, <0: negative
}

function extractAspects(text) {
  const t = normalize(text);
  const hits = new Set();
  for (const [aspect, keys] of Object.entries(aspects)) {
    for (const k of keys) {
      if (t.includes(k)) { hits.add(aspect); break; }
    }
  }
  return Array.from(hits);
}

function makeAspectSummary(entry) {
  const parts = [];
  if (entry.examplesPos && entry.examplesPos[0]) parts.push(entry.examplesPos[0]);
  if (entry.examplesNeg && entry.examplesNeg[0]) parts.push(entry.examplesNeg[0]);
  let txt = parts.join(', ');
  txt = txt.trim();
  if (txt.length === 0) {
    if (entry.positive > entry.negative) txt = 'Genel tablo olumlu.';
    else if (entry.negative > entry.positive) txt = 'Genel tablo olumsuz.';
    else txt = 'Genel tablo dengeli.';
  }
  if (txt.length > 220) txt = txt.slice(0, 217) + '…';
  return txt;
}

async function readSample({ maxItems }) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const backendRoot = path.resolve(__dirname, '..', '..'); // Backend
  // Prefer large dataset if available
  const large = path.join(backendRoot, 'data', 'sample_reviews_large.json');
  const small = path.join(backendRoot, 'data', 'sample_reviews.json');
  let dataPath = small;
  try { await fs.access(large); dataPath = large; } catch {}
  const raw = await fs.readFile(dataPath, 'utf-8');
  const all = JSON.parse(raw);
  return all.slice(0, maxItems);
}

export async function analyzeQuery({ query, maxItems = 500, useLLM = true }) {
  // Check if analysis already exists in the database
  try {
    const existing = await prisma.productAnalysis.findUnique({
      where: { query },
      include: { aspectStats: true, highlights: true }
    });

    if (existing) {
      console.log(`[Cache Hit] Returning DB record for query: ${query}`);
      return {
        query: existing.query,
        productTitle: existing.productTitle || existing.query,
        perPlatform: {},
        sources: ['database'],
        total_reviews: existing.totalReviews,
        analyzed_reviews: existing.analyzedReviews,
        aspect_stats: existing.aspectStats.map(a => ({
          aspect: a.aspect,
          count: a.count,
          ratio: a.ratio,
          positive: a.positive,
          negative: a.negative,
          pos_ratio: a.posRatio,
          neg_ratio: a.negRatio,
          examplesPos: a.examplesPos,
          examplesNeg: a.examplesNeg,
          summary: a.summary
        })),
        highlights: {
          issues: existing.highlights.filter(h => h.type === 'issue').map(h => ({ name: h.name, reason: h.reason })),
          praises: existing.highlights.filter(h => h.type === 'praise').map(h => ({ name: h.name, reason: h.reason }))
        },
        per_platform_summary: {},
        summary: existing.summary
      };
    }
  } catch (err) {
    console.error('[DB Read Error] Continuing without cache.', err?.message || err);
  }

  let reviews = [];
  let sources = [];
  let productTitle = '';
  let perPlatform = {};

  // Offline demo kapalı: her zaman canlı ingest dene
  console.log(`[Analyzer] Ingesting reviews for query: "${query}"...`);
  const ingested = await ingestFromQuery({ query, maxItems });
  
  reviews = ingested.reviews || [];
  sources = ingested.sources || ['live'];
  productTitle = ingested.productTitle || query;
  perPlatform = ingested.perPlatform || {};

  console.log(`[Analyzer] Ingestion completed. Found ${reviews.length} reviews from sources: ${sources.join(', ')}`);
  
  if (reviews.length < 10) {
    const sourceErrors = sources.filter(s => s.includes(':error'));
    const errorDetail = sourceErrors.length > 0 ? ` (Hatalar: ${sourceErrors.join(', ')})` : '';
    throw new Error(`Yeterince yorum toplanamadı (Bulunan: ${reviews.length}, En az: 10). Sağlıklı bir yapay zeka analizi için daha fazla yorum içeren bir ürün deneyin.${errorDetail}`);
  }

  // Preprocess with Python NLP API
  try {
    const processed = await preprocessReviews(reviews);
    if (processed && processed.length > 0) {
      console.log(`Original: ${reviews.length}, Processed Unique: ${processed.length}`);
      reviews = processed;
    }
  } catch (err) {
    console.warn("Python NLP processing failed, continuing with raw reviews.", err.message);
  }

  // If LLM requested and key exists, try LLM pathway first
  const wantLLM = true; // LLM zorunlu
  const haveKey = !!process.env.GOOGLE_API_KEY;

  if (wantLLM && haveKey) {
    try {
      const llm = await analyzeWithGemini({
        query,
        reviews,
        apiKey: process.env.GOOGLE_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-pro'
      });

      // Parse aspects array to aspect_stats array (using frontend-compatible fields & examples!)
      const totalMentions = (llm.aspects || []).reduce((acc, x) => acc + ((x.positive_count || 0) + (x.negative_count || 0)), 0) || 1;
      const aspect_stats = (llm.aspects || []).map(a => {
        const positive = a.positive_count || 0;
        const negative = a.negative_count || 0;
        const count = positive + negative;
        
        return {
          aspect: a.name,
          count,
          ratio: +(100 * count / totalMentions).toFixed(2),
          positive,
          negative,
          pos_ratio: count ? +(100 * positive / count).toFixed(2) : 0,
          neg_ratio: count ? +(100 * negative / count).toFixed(2) : 0,
          examplesPos: a.positive_examples || [],
          examplesNeg: a.negative_examples || [],
          summary: a.summary_tr || ''
        };
      }).sort((a, b) => b.count - a.count);

      // Map key_insights to highlights model (praise / issue)
      const praises = (llm.highlights?.praises || []).map(p => ({
        name: p.name || 'Övgü',
        reason: p.reason || String(p)
      }));
      const issues = (llm.highlights?.issues || []).map(i => ({
        name: i.name || 'Sorun',
        reason: i.reason || String(i)
      }));

      const finalResult = {
        query,
        productTitle,
        perPlatform,
        sources,
        total_reviews: reviews.length,
        analyzed_reviews: reviews.length,
        aspect_stats,
        per_platform_summary: llm.per_platform_summary || {},
        highlights: { issues, praises },
        summary: llm.summary_tr || llm.product_summary || (`"${query}" için özet üretildi.`),
        
        // Expose new rich metrics for API clients
        overall_sentiment: llm.overall_sentiment || {},
        key_insights: llm.key_insights || {},
        data_quality: llm.data_quality || {}
      };

      try {
        await prisma.productAnalysis.create({
          data: {
            query,
            productTitle: finalResult.productTitle,
            totalReviews: finalResult.total_reviews,
            analyzedReviews: finalResult.analyzed_reviews,
            summary: finalResult.summary,
            aspectStats: {
              create: aspect_stats.map(a => ({
                aspect: a.aspect,
                count: a.count,
                ratio: a.ratio,
                positive: a.positive,
                negative: a.negative,
                posRatio: a.pos_ratio,
                negRatio: a.neg_ratio,
                summary: a.summary,
                examplesPos: a.examplesPos || [],
                examplesNeg: a.examplesNeg || []
              }))
            },
            highlights: {
              create: [
                ...finalResult.highlights.issues.map(i => ({ type: 'issue', name: i.name || 'Bilinmiyor', reason: i.reason || '' })),
                ...finalResult.highlights.praises.map(p => ({ type: 'praise', name: p.name || 'Bilinmiyor', reason: p.reason || '' }))
              ]
            }
          }
        });
        console.log(`[DB Insert] Saved analysis for query: ${query}`);
      } catch (dbErr) {
        console.error('[DB Insert Error] Could not save analysis to DB:', dbErr?.message || dbErr);
      }

      return finalResult;
    } catch (e) {
      throw new Error('LLM analizi başarısız: ' + (e?.message || e));
    }
  }

  // Buraya düşülmemeli: LLM anahtarı yoksa
  throw new Error('LLM gerekli: GOOGLE_API_KEY eksik veya devre dışı');

  const perAspect = {};
  for (const key of Object.keys(aspects)) {
    perAspect[key] = { aspect: key, count: 0, pos: 0, neg: 0, examplesPos: [], examplesNeg: [] };
  }

  let analyzed = 0;
  for (const r of reviews) {
    const text = r.text || '';
    const s = scoreSentiment(text);
    const tags = extractAspects(text);
    if (tags.length === 0) continue;
    analyzed += 1;
    for (const a of tags) {
      const entry = perAspect[a];
      entry.count += 1;
      if (s > 0) {
        entry.pos += 1;
        if (entry.examplesPos.length < 3) entry.examplesPos.push(text.slice(0, 200));
      } else if (s < 0) {
        entry.neg += 1;
        if (entry.examplesNeg.length < 3) entry.examplesNeg.push(text.slice(0, 200));
      }
    }
  }

  const totals = Object.values(perAspect).filter(a => a.count > 0);
  const totalMentions = totals.reduce((acc, x) => acc + x.count, 0) || 1;
  const aspect_stats = totals
    .map(x => ({
      aspect: x.aspect,
      count: x.count,
      ratio: +(100 * x.count / totalMentions).toFixed(2),
      positive: x.pos,
      negative: x.neg,
      pos_ratio: x.count ? +(100 * x.pos / x.count).toFixed(2) : 0,
      neg_ratio: x.count ? +(100 * x.neg / x.count).toFixed(2) : 0,
      examplesPos: x.examplesPos,
      examplesNeg: x.examplesNeg,
      summary: makeAspectSummary({
        aspect: x.aspect,
        positive: x.pos,
        negative: x.neg,
        examplesPos: x.examplesPos,
        examplesNeg: x.examplesNeg
      })
    }))
    .sort((a, b) => b.count - a.count);

  const issues = aspect_stats
    .filter(a => a.negative > a.positive)
    .slice(0, 5)
    .map(a => ({ aspect: a.aspect, ratio: a.ratio, example: a.examplesNeg[0] || null }));
  const praises = aspect_stats
    .filter(a => a.positive >= a.negative)
    .slice(0, 5)
    .map(a => ({ aspect: a.aspect, ratio: a.ratio, example: a.examplesPos[0] || null }));

  const summary = `"${query}" için ${analyzed} yorumda ${aspect_stats.length} boyut bulundu. Öne çıkanlar: ` +
    [...issues.map(i => `${i.aspect} (sorun)`), ...praises.map(p => `${p.aspect} (övgü)`)].slice(0, 6).join(', ') + '.';

  return {
    query,
    sources,
    total_reviews: reviews.length,
    analyzed_reviews: analyzed,
    aspect_stats,
    highlights: { issues, praises },
    summary
  };
}

export async function analyzeProvidedReviews({ query, reviews = [], useLLM = true }) {
  // Preprocess with Python NLP API
  try {
    const processed = await preprocessReviews(reviews);
    if (processed && processed.length > 0) {
      console.log(`Original API items: ${reviews.length}, Processed Unique: ${processed.length}`);
      reviews = processed;
    }
  } catch (err) {
    console.warn("Python NLP processing failed, continuing with raw reviews.", err.message);
  }

  const wantLLM = true; // LLM zorunlu
  const haveKey = !!process.env.GOOGLE_API_KEY;

  if (wantLLM && haveKey) {
    try {
      const llm = await analyzeWithGemini({
        query,
        reviews,
        apiKey: process.env.GOOGLE_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-pro'
      });

      const totalMentions = (llm.aspects || []).reduce((acc, x) => acc + ((x.positive_count || 0) + (x.negative_count || 0)), 0) || 1;
      const aspect_stats = (llm.aspects || []).map(a => {
        const positive = a.positive_count || 0;
        const negative = a.negative_count || 0;
        const count = positive + negative;
        
        return {
          aspect: a.name,
          count,
          ratio: +(100 * count / totalMentions).toFixed(2),
          positive,
          negative,
          pos_ratio: count ? +(100 * positive / count).toFixed(2) : 0,
          neg_ratio: count ? +(100 * negative / count).toFixed(2) : 0,
          examplesPos: a.positive_examples || [],
          examplesNeg: a.negative_examples || [],
          summary: a.summary_tr || ''
        };
      }).sort((a, b) => b.count - a.count);

      const praises = (llm.highlights?.praises || []).map(p => ({
        name: p.name || 'Övgü',
        reason: p.reason || String(p)
      }));
      const issues = (llm.highlights?.issues || []).map(i => ({
        name: i.name || 'Sorun',
        reason: i.reason || String(i)
      }));

      return {
        query,
        sources: ['provided'],
        total_reviews: reviews.length,
        analyzed_reviews: reviews.length,
        aspect_stats,
        per_platform_summary: llm.per_platform_summary || {},
        highlights: { issues, praises },
        summary: llm.summary_tr || llm.product_summary || (`"${query}" için özet üretildi.`),
        
        // Expose new rich metrics for API clients
        overall_sentiment: llm.overall_sentiment || {},
        key_insights: llm.key_insights || {},
        data_quality: llm.data_quality || {}
      };
    } catch (e) {
      throw new Error('LLM analizi başarısız: ' + (e?.message || e));
    }
  }
  throw new Error('LLM anahtarı eksik (GOOGLE_API_KEY)');

  const perAspect = {};
  for (const key of Object.keys(aspects)) {
    perAspect[key] = { aspect: key, count: 0, pos: 0, neg: 0, examplesPos: [], examplesNeg: [] };
  }

  let analyzed = 0;
  for (const r of reviews) {
    const text = r.text || '';
    const s = scoreSentiment(text);
    const tags = extractAspects(text);
    if (tags.length === 0) continue;
    analyzed += 1;
    for (const a of tags) {
      const entry = perAspect[a];
      entry.count += 1;
      if (s > 0) {
        entry.pos += 1;
        if (entry.examplesPos.length < 3) entry.examplesPos.push(text.slice(0, 200));
      } else if (s < 0) {
        entry.neg += 1;
        if (entry.examplesNeg.length < 3) entry.examplesNeg.push(text.slice(0, 200));
      }
    }
  }

  const totals = Object.values(perAspect).filter(a => a.count > 0);
  const totalMentions = totals.reduce((acc, x) => acc + x.count, 0) || 1;
  const aspect_stats = totals
    .map(x => ({
      aspect: x.aspect,
      count: x.count,
      ratio: +(100 * x.count / totalMentions).toFixed(2),
      positive: x.pos,
      negative: x.neg,
      pos_ratio: x.count ? +(100 * x.pos / x.count).toFixed(2) : 0,
      neg_ratio: x.count ? +(100 * x.neg / x.count).toFixed(2) : 0,
      examplesPos: x.examplesPos,
      examplesNeg: x.examplesNeg,
      summary: makeAspectSummary({
        aspect: x.aspect,
        positive: x.pos,
        negative: x.neg,
        examplesPos: x.examplesPos,
        examplesNeg: x.examplesNeg
      })
    }))
    .sort((a, b) => b.count - a.count);

  const issues = aspect_stats
    .filter(a => a.negative > a.positive)
    .slice(0, 5)
    .map(a => ({ aspect: a.aspect, ratio: a.ratio, example: a.examplesNeg[0] || null }));
  const praises = aspect_stats
    .filter(a => a.positive >= a.negative)
    .slice(0, 5)
    .map(a => ({ aspect: a.aspect, ratio: a.ratio, example: a.examplesPos[0] || null }));

  const summary = `"${query}" için ${analyzed} yorumda ${aspect_stats.length} boyut bulundu. Öne çıkanlar: ` +
    [...issues.map(i => `${i.aspect} (sorun)`), ...praises.map(p => `${p.aspect} (övgü)`)].slice(0, 6).join(', ') + '.';

  return {
    query,
    sources: ['provided'],
    total_reviews: reviews.length,
    analyzed_reviews: analyzed,
    aspect_stats,
    highlights: { issues, praises },
    summary
  };
}
