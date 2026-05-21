class ProductMatcher {
  static extractIdentifiers(title) {
    if (!title) return { brand: '', modelCode: '', normalizedTokens: [] };
    
    const t = title.toLowerCase();
    
    // Core Brand identification
    const brands = ['razer', 'logitech', 'steelseries', 'corsair', 'asus', 'hyperx', 'msi', 'glorious', 'rapoo', 'hp', 'lenovo'];
    let brand = '';
    for (const b of brands) {
      if (t.includes(b)) {
        brand = b;
        break;
      }
    }
    
    // MPN / Model Code Extraction (e.g. RZ01-03730400-R3G1, RZ01-05120100, MX Master 3S)
    // Matches patterns like RZ01-03730400-R3G1 or similar
    const modelCodeRegex = /\b[a-z]{2}\d{2}-\d{8}-[a-z0-9]{4}\b/i;
    const modelCodeShortRegex = /\b[a-z]{2}\d{2}-\d{8}\b/i;
    const standardMpnRegex = /\b[a-z0-9]{4,6}-\d{4,8}\b/i;

    let modelCode = '';
    let match = t.match(modelCodeRegex) || t.match(modelCodeShortRegex) || t.match(standardMpnRegex);
    if (match) {
      modelCode = match[0].toUpperCase();
    }

    // Stem tokens for similarity scoring
    const ignore = ['ve', 'ile', 'mouse', 'oyuncu', 'kablosuz', 'gaming', 'optik', 'sarjli', 'kablolu', 'renk', 'fiyati', 'fiyatlari'];
    const tokens = t.split(/[^a-z0-9]/)
      .map(w => w.trim())
      .filter(w => w.length >= 2 && !ignore.includes(w) && w !== brand);

    return {
      brand,
      modelCode,
      tokens
    };
  }

  static detectEditionConflict(target, scraped) {
    const targetTitle = target.toLowerCase();
    const scrapedTitle = scraped.toLowerCase();

    // Key cosmetic/edition markers
    const editions = ['roblox', 'pokemon', 'genshin', 'pubg', 'mercury', 'quartz', 'hello kitty', 'cyberpunk', 'special edition'];
    
    let penalty = 0;
    for (const ed of editions) {
      const targetHas = targetTitle.includes(ed);
      const scrapedHas = scrapedTitle.includes(ed);
      
      // If one has the edition and the other does not, penalize heavily (cosmetic variant difference)
      if (targetHas !== scrapedHas) {
        penalty += 0.35; // NOT hard-reject, but high penalty
      }
    }

    return penalty;
  }

  static calculateProductSimilarity(target, scraped) {
    if (!target || !scraped) return 0;

    const targetInfo = this.extractIdentifiers(target);
    const scrapedInfo = this.extractIdentifiers(scraped);

    // 1. BRAND EXACT CHECK (Mandatory check - if brand differs completely, reject or heavy penalty)
    if (targetInfo.brand && scrapedInfo.brand && targetInfo.brand !== scrapedInfo.brand) {
      return 0.0; // Complete mismatch
    }

    // 2. MPN / SKU IDENTIFIER GRAPH EXACT MATCH (Strongest validation)
    if (targetInfo.modelCode && scrapedInfo.modelCode && targetInfo.modelCode === scrapedInfo.modelCode) {
      return 1.0; // Perfect matching via Product Identity Graph!
    }

    // 3. Hardware version detection (V2 vs V3, wired vs wireless, pro vs mini)
    const hardwareKeywords = ['v2', 'v3', 'pro', 'max', 'mini', 'wired', 'wireless', 'kablosuz', 'ultimate', 'essential', 'x', 'superlight'];
    let hardwareMismatch = false;

    const targetTitle = target.toLowerCase();
    const scrapedTitle = scraped.toLowerCase();

    for (const hw of hardwareKeywords) {
      const targetHas = targetTitle.includes(hw);
      const scrapedHas = scrapedTitle.includes(hw);
      
      // Hardware specifications MUST match exactly (hardware differences = separate products)
      if (hw === 'v2' || hw === 'v3' || hw === 'pro' || hw === 'superlight' || hw === 'mini' || hw === 'max') {
        if (targetHas !== scrapedHas) {
          hardwareMismatch = true;
        }
      }
    }

    if (hardwareMismatch) {
      return 0.1; // Major penalty, hardware differences constitute separate products!
    }

    // 4. Token Overlap Jaccard Similarity
    const targetTokens = new Set(targetInfo.tokens);
    const scrapedTokens = new Set(scrapedInfo.tokens);

    let intersectionCount = 0;
    targetTokens.forEach(tok => {
      if (scrapedTokens.has(tok)) intersectionCount++;
    });

    const unionCount = new Set([...targetTokens, ...scrapedTokens]).size;
    if (unionCount === 0) return 0.0;

    let score = intersectionCount / unionCount;

    // Apply cosmetic variant penalties
    const editionPenalty = this.detectEditionConflict(target, scraped);
    score = Math.max(0, score - editionPenalty);

    return score;
  }

  // Mandatory Single Source of Truth Product Identity Graph
  static match(targetTitle, scrapedTitle) {
    const similarity = this.calculateProductSimilarity(targetTitle, scrapedTitle);
    // Threshold is 0.55 after cosmetic penalties or exact SKU match
    return similarity >= 0.55;
  }
}

export { ProductMatcher };
