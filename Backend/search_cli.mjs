import * as dotenv from 'dotenv';
dotenv.config();
import { ingestFromQuery } from './src/ingestion/index.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function runSearch(query) {
  console.log(`\n🔍 "${query}" için arama ve veri toplama başlatılıyor...\n`);
  console.time('Süre');

  try {
    // LLM analizi yapılmadan sadece ingestion katmanını çağırıyoruz
    const result = await ingestFromQuery({ query, maxItems: 100 });
    
    console.timeEnd('Süre');
    console.log("\n=========================================");
    console.log(`📌 ÜRÜN: ${result.productTitle}`);
    console.log(`📊 İSTATİSTİK: ${JSON.stringify(result.perPlatform)}`);
    console.log(`🔗 KAYNAKLAR: ${result.sources.join(', ')}`);
    console.log("=========================================\n");

    if (result.reviews.length > 0) {
      result.reviews.forEach((r, i) => {
        const platform = (r.platform || 'unknown').toUpperCase();
        console.log(`${i + 1}. [${platform}] ${r.text}`);
        console.log('---');
      });
      console.log(`\n✅ Toplam ${result.reviews.length} yorum başarıyla toplandı.`);
    } else {
      console.warn("❌ Hiç yorum toplanamadı. Lütfen farklı bir arama terimi deneyin veya platformları kontrol edin.");
    }
  } catch (err) {
    console.error("\n💥 Kritik Hata:", err.message);
  }
  
  askQuery();
}

function askQuery() {
  rl.question('\n🔎 Aramak istediğiniz ürün (çıkış için "exit"): ', (query) => {
    if (query.toLowerCase() === 'exit') {
      rl.close();
      return;
    }
    if (!query.trim()) {
      console.log("Lütfen geçerli bir ürün adı girin.");
      return askQuery();
    }
    runSearch(query);
  });
}

console.log("🚀 Review Ingestion CLI Test Aracı Başlatıldı");
console.log("-------------------------------------------");
askQuery();
