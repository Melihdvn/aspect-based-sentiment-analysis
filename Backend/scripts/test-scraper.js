// Test script for scrapers
import 'dotenv/config';
import { scrapeAmazonUrl } from '../src/ingestion/search_playwright.js';
import { ingestTrendyol } from '../src/ingestion/trendyol.js';
import { ingestHepsiburada } from '../src/ingestion/hepsiburada.js';

// Test URL'leri - bunları kendi test linklerinizle değiştirin
const TEST_URLS = {
  amazon: 'https://www.amazon.com.tr/PlayStation-DualSense-%C5%9Earj-%C4%B0stasyonu-Stand%C4%B1/dp/B08H97WTBL/?_encoding=UTF8&pd_rd_w=FdUZf&content-id=amzn1.sym.c16cc3d4-5518-4b81-9157-bd82855a1828%3Aamzn1.symc.b1464ab7-6d6a-4fc8-be8f-f2e9bcc64228&pf_rd_p=c16cc3d4-5518-4b81-9157-bd82855a1828&pf_rd_r=SV1MDQEP3RXCPV2NB6DF&pd_rd_wg=tHUXH&pd_rd_r=49a84fd8-fd73-49bd-b707-c743439ad9bc&ref_=pd_hp_d_btf_ci_mcx_mr_ca_id_hp_d&th=1', // Örnek ürün
  trendyol: 'https://www.trendyol.com/apple/iphone-15-128-gb-mavi-p-762254881?boutiqueId=681310&merchantId=968', // Örnek ürün
  hepsiburada: 'https://www.hepsiburada.com/iphone-13-128-gb-siyah-p-HBCV00000ODHHF' // Örnek ürün
};

async function testScraper(name, fn, url) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${name} scraper...`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));
  
  const start = Date.now();
  try {
    const result = await fn(url, 100); // Max 100 yorum
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    
    console.log(`✅ ${name} - ${result.reviews?.length || 0} yorum bulundu (${elapsed}s)`);
    console.log(`Sources: ${result.sources?.join(', ')}`);
    
    if (result.reviews?.length > 0) {
      console.log('\n📝 İlk 3 yorum:');
      result.reviews.slice(0, 3).forEach((r, i) => {
        const text = r.text || r;
        console.log(`  ${i + 1}. "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
      });
    }
    return result;
  } catch (err) {
    console.log(`❌ ${name} - Hata: ${err.message}`);
    return null;
  }
}

// Tek bir scraper test et
const args = process.argv.slice(2);
const site = args[0]?.toLowerCase();
const customUrl = args[1];

console.log('\n🔍 Scraper Test Aracı');
console.log('Kullanım: node test-scraper.js [amazon|trendyol|hepsiburada] [url]');

(async () => {
  if (site === 'amazon') {
    await testScraper('Amazon', scrapeAmazonUrl, customUrl || TEST_URLS.amazon);
  } else if (site === 'trendyol') {
    await testScraper('Trendyol', (url, max) => ingestTrendyol({ query: url, maxItems: max }), customUrl || TEST_URLS.trendyol);
  } else if (site === 'hepsiburada') {
    await testScraper('Hepsiburada', (url, max) => ingestHepsiburada({ query: url, maxItems: max }), customUrl || TEST_URLS.hepsiburada);
  } else {
    // Hepsini test et
    console.log('\nTüm scraperları test ediyorum...');
    await testScraper('Amazon', scrapeAmazonUrl, TEST_URLS.amazon);
    await testScraper('Trendyol', (url, max) => ingestTrendyol({ query: url, maxItems: max }), TEST_URLS.trendyol);
    await testScraper('Hepsiburada', (url, max) => ingestHepsiburada({ query: url, maxItems: max }), TEST_URLS.hepsiburada);
  }
  
  console.log('\n✨ Test tamamlandı!\n');
  process.exit(0);
})();
