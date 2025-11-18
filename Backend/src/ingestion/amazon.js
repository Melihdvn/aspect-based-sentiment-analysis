// Minimal Amazon adapter skeleton.
// NOTE: Live scraping is disabled unless ENABLE_LIVE=1 is set.
// This module is a placeholder to plug a compliant fetch/parse later.

export async function ingestAmazon({ query, maxItems = 200 }) {
  // In a full implementation, detect if query is a URL or product name.
  // If URL: fetch reviews pages, parse, paginate until maxItems.
  // If name: search on Amazon, get product page, then reviews.
  // Here we return an empty array to keep the pipeline functional.
  return { reviews: [], sources: ['amazon'] };
}

