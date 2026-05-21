import crypto from 'crypto';

class DuplicateDetector {
  constructor(similarityThreshold = 0.82) {
    this.similarityThreshold = similarityThreshold;
    this.seenHashes = new Set();
    this.seenReviews = [];
  }

  static getCleanText(text) {
    if (!text) return '';
    return text.toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  static getShingles(text, k = 3) {
    const clean = this.getCleanText(text);
    const shingles = new Set();
    if (clean.length < k) {
      shingles.add(clean);
      return shingles;
    }
    for (let i = 0; i < clean.length - k + 1; i++) {
      shingles.add(clean.slice(i, i + k));
    }
    return shingles;
  }

  static calculateJaccard(setA, setB) {
    if (setA.size === 0 || setB.size === 0) return 0;
    
    let intersection = 0;
    setA.forEach(item => {
      if (setB.has(item)) intersection++;
    });
    
    const union = new Set([...setA, ...setB]).size;
    return intersection / union;
  }

  static generateReviewHash(text, username = '', rating = '') {
    const cleanText = this.getCleanText(text);
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanRating = String(rating || '').trim();
    
    // Multi-factor key creation
    const key = `${cleanText}:${cleanUser}:${cleanRating}`;
    return crypto.createHash('md5').update(key).digest('hex');
  }

  isDuplicate(reviewText, username = '', rating = '') {
    if (!reviewText) return true;

    // 1. EXACT MD5 HASH MATCH (Multi-factor check)
    const hash = DuplicateDetector.generateReviewHash(reviewText, username, rating);
    if (this.seenHashes.has(hash)) {
      return true;
    }

    // 2. FUZZY JACCARD SHINGLE MATCHING (Fuzzy match)
    const newShingles = DuplicateDetector.getShingles(reviewText, 3);
    
    for (const existing of this.seenReviews) {
      // Early exit optimization for highly disparate text sizes
      const sizeDiff = Math.abs(existing.shingles.size - newShingles.size);
      const maxSize = Math.max(existing.shingles.size, newShingles.size);
      if (sizeDiff / maxSize > (1 - this.similarityThreshold)) {
        continue;
      }

      // Check Jaccard overlap
      const sim = DuplicateDetector.calculateJaccard(existing.shingles, newShingles);
      if (sim >= this.similarityThreshold) {
        // Multi-factor tie breaker: check rating consistency if usernames/ratings are present
        if (rating && existing.rating && rating !== existing.rating) {
          continue; // Mismatching ratings means they are likely not identical cross-posted comments
        }
        return true;
      }
    }

    // Register review as seen
    this.seenHashes.add(hash);
    this.seenReviews.push({
      text: reviewText,
      username,
      rating,
      shingles: newShingles
    });

    return false;
  }
}

export { DuplicateDetector };
