import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestFromQuery } from '../ingestion/index.js';
import { analyzeWithGemini } from './llm.js';

// Aspect keywords (TR) — extendable
const aspects = {
  batarya: ['batarya', 'pil', 'şarj', 'sarj', 'pil ömrü', 'battery'],
  ekran: ['ekran', 'görüntü', 'renk', 'parlaklık', 'sararma', 'ghosting', 'çözünürlük'],
  kamera: ['kamera', 'fotoğraf', 'video', 'lens', 'gece modu', 'ışık', 'odak'],
  performans: ['performans', 'hız', 'takılma', 'donma', 'ısınma', 'ısınıyor', 'lag'],
  ses: ['ses', 'hoparlör', 'mikrofon', 'kulaklık', 'ses seviyesi', 'bass'],
  yazilim: ['yazılım', 'ios', 'android', 'güncelleme', 'bug', 'hata'],
  depolama: ['depolama', 'hafıza', '128gb', '256gb', '512gb', 'tb'],
  fiyat: ['fiyat', 'pahalı', 'ucuz', 'indirim', 'f/p', 'paranın karşılığı'],
  kargo: ['kargo', 'teslimat', 'kargolama', 'paketleme'],
  servis: ['servis', 'garanti', 'iade', 'destek', 'müşteri hizmetleri']
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

export async function analyzeQuery({ query, maxItems = 200, useLLM = true }) {
  let reviews = [];
  let sources = [];

  // Offline demo kapalı: her zaman canlı ingest dene
  const ingested = await ingestFromQuery({ query, maxItems });
  reviews = ingested.reviews || [];
  sources = ingested.sources || ['live'];
  if (!reviews.length) {
    throw new Error('Hiç yorum getirilemedi. ENABLE_LIVE=1 ile başlatın veya /analyze/raw ile veri sağlayın.');
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
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
      });

      // Compute ratios post-hoc
      const totalMentions = llm.aspect_stats.reduce((acc, x) => acc + x.count, 0) || 1;
      const aspect_stats = llm.aspect_stats.map(x => ({
        ...x,
        ratio: +(100 * x.count / totalMentions).toFixed(2),
        pos_ratio: x.count ? +(100 * x.positive / x.count).toFixed(2) : 0,
        neg_ratio: x.count ? +(100 * x.negative / x.count).toFixed(2) : 0,
        summary: x.summary || makeAspectSummary(x)
      })).sort((a,b)=> b.count - a.count);

      const issues = aspect_stats.filter(a => a.negative > a.positive).slice(0,5)
        .map(a => ({ aspect: a.aspect, ratio: a.ratio, example: a.examplesNeg?.[0] || null }));
      const praises = aspect_stats.filter(a => a.positive >= a.negative).slice(0,5)
        .map(a => ({ aspect: a.aspect, ratio: a.ratio, example: a.examplesPos?.[0] || null }));

      return {
        query,
        sources,
        total_reviews: reviews.length,
        analyzed_reviews: reviews.length,
        aspect_stats,
        highlights: llm.highlights || { issues, praises },
        summary: llm.summary || (`"${query}" için ${reviews.length} yorumdan özet üretildi.`)
      };
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
  const wantLLM = true; // LLM zorunlu
  const haveKey = !!process.env.GOOGLE_API_KEY;

  if (wantLLM && haveKey) {
    try {
      const llm = await analyzeWithGemini({
        query,
        reviews,
        apiKey: process.env.GOOGLE_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
      });

      const totalMentions = llm.aspect_stats.reduce((acc, x) => acc + x.count, 0) || 1;
      const aspect_stats = llm.aspect_stats.map(x => ({
        ...x,
        ratio: +(100 * x.count / totalMentions).toFixed(2),
        pos_ratio: x.count ? +(100 * x.positive / x.count).toFixed(2) : 0,
        neg_ratio: x.count ? +(100 * x.negative / x.count).toFixed(2) : 0
      })).sort((a,b)=> b.count - a.count);

      const issues = aspect_stats.filter(a => a.negative > a.positive).slice(0,5)
        .map(a => ({ aspect: a.aspect, ratio: a.ratio, example: a.examplesNeg?.[0] || null }));
      const praises = aspect_stats.filter(a => a.positive >= a.negative).slice(0,5)
        .map(a => ({ aspect: a.aspect, ratio: a.ratio, example: a.examplesPos?.[0] || null }));

      return {
        query,
        sources: ['provided'],
        total_reviews: reviews.length,
        analyzed_reviews: reviews.length,
        aspect_stats,
        highlights: llm.highlights || { issues, praises },
        summary: llm.summary || (`"${query}" için ${reviews.length} yorumdan özet üretildi.`)
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
