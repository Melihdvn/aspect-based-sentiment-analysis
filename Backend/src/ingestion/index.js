import { ingestAmazon } from './amazon.js';

function looksLikeAmazon(query) {
  const q = String(query || '').toLowerCase();
  return q.includes('amazon.') || q.includes('amazon.com') || q.includes('amazon.com.tr') || q.includes('amazon') || q.includes('amzn');
}

export async function ingestFromQuery({ query, maxItems = 200 }) {
  const sources = [];

  if (process.env.ENABLE_LIVE !== '1') {
    return { reviews: [], sources: ['live-disabled'] };
  }

  if (looksLikeAmazon(query)) {
    const res = await ingestAmazon({ query, maxItems }).catch(err => ({ reviews: [], sources: ['amazon:error', String(err.message || err)] }));
    return { reviews: res.reviews || [], sources: ['amazon'] };
  }

  return { reviews: [], sources: ['unknown-source'] };
}

