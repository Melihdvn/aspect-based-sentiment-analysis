import fetch from 'node-fetch';

const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://localhost:8000/api/preprocess';

export async function preprocessReviews(reviews, targetLang = 'tr', similarityThreshold = 0.90) {
  if (!reviews || reviews.length === 0) return [];
  
  try {
    const payload = {
      reviews: reviews.map((r, i) => ({ text: r.text || r, id: String(i) })),
      target_lang: targetLang,
      similarity_threshold: similarityThreshold
    };

    const response = await fetch(NLP_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        console.warn(`NLP Service responded with ${response.status}`);
        return reviews; // Fallback to original
    }

    const data = await response.json();
    if (data && data.results) {
        // Map back to format expected by LLM (we use original_text so Gemini can extract capitalized quotes and summaries)
        // while preserving the original review attributes (such as platform)
        return data.results.map(r => {
          const index = parseInt(r.id, 10);
          const originalReview = reviews[index] || {};
          return {
            ...originalReview,
            text: r.original_text
          };
        });
    }
  } catch (error) {
    console.error('Error calling NLP Service:', error.message);
  }
  
  // Return original reviews if service is down or fails
  return reviews;
}
