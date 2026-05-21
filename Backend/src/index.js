import * as dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { analyzeQuery, analyzeProvidedReviews } from './services/analyzer.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from './services/db.js';

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }));
app.use(bodyParser.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', llm: !!process.env.GOOGLE_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-2.5-pro', maxReviews: Number(process.env.GEMINI_MAX_REVIEWS || 500) });
});

app.post('/analyze', async (req, res) => {
  try {
    const { query, max_items = 200 } = req.body || {};
    if (!query || String(query).trim().length < 2) {
      return res.status(400).json({ error: 'Geçerli bir ürün adı veya URL giriniz.' });
    }
    if (!process.env.GOOGLE_API_KEY) {
      return res.status(400).json({ error: 'LLM anahtarı eksik', detail: 'GOOGLE_API_KEY .env içine eklenmeli' });
    }
    const result = await analyzeQuery({ query, maxItems: max_items, useLLM: true });
    res.json(result);
  } catch (err) {
    console.error('[Analyze Error]', err);
    res.status(500).json({ error: 'Analiz sırasında hata oluştu.', detail: String(err?.message || err) });
  }
});

// Use local sample dataset and send to LLM directly (no scraping)
app.post('/analyze/sample', async (req, res) => {
  try {
    const { query = 'Örnek Ürün', max_items } = req.body || {};
    if (!process.env.GOOGLE_API_KEY) {
      return res.status(400).json({ error: 'LLM anahtarı eksik', detail: 'GOOGLE_API_KEY .env içine eklenmeli' });
    }
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const backendRoot = path.resolve(__dirname, '..');
    const large = path.join(backendRoot, 'data', 'sample_reviews_large.json');
    const small = path.join(backendRoot, 'data', 'sample_reviews.json');
    let dataPath = large;
    try { await fs.access(large); } catch { dataPath = small; }
    const raw = await fs.readFile(dataPath, 'utf-8');
    let reviews = JSON.parse(raw) || [];
    if (!Array.isArray(reviews)) reviews = [];
    const cap = Number(process.env.GEMINI_MAX_REVIEWS || 120);
    const limit = Math.min(cap, max_items || cap);
    const normalized = reviews.slice(0, limit).map(r => ({ text: typeof r === 'string' ? r : (r?.text ?? '') }));
    if (normalized.length === 0) {
      return res.status(400).json({ error: 'Sample veri bulunamadı', detail: dataPath });
    }
    const result = await analyzeProvidedReviews({ query, reviews: normalized, useLLM: true });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analiz sırasında hata oluştu.', detail: String(err?.message || err) });
  }
});

app.post('/analyze/raw', async (req, res) => {
  try {
    const { query = 'Örnek Ürün', reviews = [], use_llm = false } = req.body || {};
    if (!Array.isArray(reviews) || reviews.length === 0) {
      return res.status(400).json({ error: 'reviews boş olamaz' });
    }
    const normalized = reviews.map(r => ({ text: typeof r === 'string' ? r : (r?.text ?? '') }));
    const result = await analyzeProvidedReviews({ query, reviews: normalized, useLLM: !!use_llm });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analiz sırasında hata oluştu.', detail: String(err?.message || err) });
  }
});

app.get('/analyses/recent', async (req, res) => {
  try {
    const { limit = 6 } = req.query;
    const recent = await prisma.productAnalysis.findMany({
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        query: true,
        productTitle: true,
        totalReviews: true,
        analyzedReviews: true,
        createdAt: true,
        aspectStats: {
          select: { aspect: true }
        }
      }
    });
    
    const formatted = recent.map(r => ({
      id: r.id,
      query: r.query,
      productTitle: r.productTitle || r.query,
      analyzed_reviews: r.analyzedReviews,
      aspect_count: r.aspectStats.length,
      date: r.createdAt
    }));
    
    res.json(formatted);
  } catch (err) {
    console.error('[Recent Analyses Error]', err);
    res.status(500).json({ error: 'Geçmiş analizler alınamadı', detail: String(err?.message || err) });
  }
});

app.get('/analyses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.productAnalysis.findUnique({
      where: { id },
      include: { aspectStats: true, highlights: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Analiz bulunamadı.' });
    }

    const result = {
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

    res.json(result);
  } catch (err) {
    console.error('[Analysis Fetch Error]', err);
    res.status(500).json({ error: 'Analiz alınırken hata oluştu.', detail: String(err?.message || err) });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend listening on port ${PORT} (exposed to local network)`);
});
