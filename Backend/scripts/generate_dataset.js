import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function maybe(prob, t, f='') { return Math.random() < prob ? t : f; }

const openings = [
  'Genel olarak', 'Birkaç haftadır kullanıyorum ve', 'İlk izlenim olarak', 'Yoğun kullanımda',
  'Günlük kullanımda', 'Deneyimim şöyle:', 'Kısaca', 'Beklentilerime göre'
];

// Aspect sentence pools (positive/negative, short, human-like)
const bataryaPos = [
  'batarya bir günü rahat çıkarıyor',
  'şarjı gayet iyi, akşamı rahat görüyorum',
  'pil ömrü beklediğimden uzun',
  'şarjı geç bitiyor, memnunum',
  'pil performansı tatmin edici'
];
const bataryaNeg = [
  'batarya çabuk bitiyor',
  'şarjı hızlı tükeniyor',
  'pil ömrü kısa, gün ortası şarj istiyor',
  'şarj performansı hayal kırıklığı',
  'pil beklediğim kadar dayanmadı'
];

const ekranPos = [
  'ekran parlaklığı yeterli, güneşte de okunuyor',
  'renkler canlı ve doygun',
  'çözünürlük ve görüntü kalitesi çok iyi',
  'ekran gayet akıcı ve net'
];
const ekranNeg = [
  'ekranda hafif sararma fark ettim',
  'parlaklık düşük kalıyor gibi',
  'ghosting benzeri bir etki rahatsız etti',
  'renk doğruluğu beklentimin altında'
];

const kameraPos = [
  'kamera gece modu başarılı',
  'fotoğraf kalitesi net ve doğal',
  'video stabilizasyonu etkileyici',
  'odaklama hızlı ve tutarlı'
];
const kameraNeg = [
  'kamera düşük ışıkta zayıf kalıyor',
  'bazı çekimlerde gren var',
  'video rüzgarlı havada ses alıyor',
  'renkler bazen yapay görünüyor'
];

const performansPos = [
  'performans akıcı, uygulamalar hızlı açılıyor',
  'takılma yok denecek kadar az',
  'oyunlarda fps stabil, ısınma kontrol altında',
  'genel olarak seri ve sorunsuz'
];
const performansNeg = [
  'uzun oyunda biraz ısınıyor',
  'ara sıra takılma hissettim',
  'yoğun kullanımda performans düşebiliyor',
  'bazı uygulamalarda donma yaşadım'
];

const sesPos = [
  'hoparlör sesi yüksek ve temiz',
  'mikrofon kalitesi iyi',
  'kulaklıkla ses dengesi tatmin edici'
];
const sesNeg = [
  'yüksek seste hafif cızırtı var',
  'mikrofon uzak seste yetersiz kaldı'
];

const yazilimPos = [
  'güncelleme sonrası sistem daha stabil',
  'yazılım arayüzü akıcı ve anlaşılır',
  'uygulama geçişleri pürüzsüz'
];
const yazilimNeg = [
  'son güncellemede ufak hatalar gördüm',
  'ara sıra küçük buglar çıkıyor'
];

const depolamaPos = [
  '128GB bana yetiyor, iCloud ile destekliyorum',
  '256GB depolama rahat ettirdi',
  'depolama yönetimi pratik'
];
const depolamaNeg = [
  '64GB çok çabuk doluyor',
  'video çekince depolama anında doluyor'
];

const fiyatPos = [
  'fiyat yüksek ama parasını hak ediyor',
  'fiyat/performans dengesi yerinde',
  'indirime girerse çok mantıklı'
];
const fiyatNeg = [
  'fiyat pahalı, keşke daha uygun olsa',
  'etiket ciddi yüksek, değer mi tartışılır'
];

const dayaniklikPos = [
  'malzeme kalitesi iyi, elde sağlam hissettiriyor',
  'işçilik başarılı, premium his var'
];
const dayaniklikNeg = [
  'kılıfsız kullanımda kolay çizilebiliyor',
  'uzun kullanımda minik boya atması gördüm'
];

function sentenceFromPools() {
  const parts = [];
  const buckets = [
    [bataryaPos, bataryaNeg], [ekranPos, ekranNeg], [kameraPos, kameraNeg],
    [performansPos, performansNeg], [sesPos, sesNeg], [yazilimPos, yazilimNeg],
    [depolamaPos, depolamaNeg], [fiyatPos, fiyatNeg], [dayaniklikPos, dayaniklikNeg]
  ];
  // Pick 2–3 random distinct aspects
  const count = 2 + Math.floor(Math.random() * 2);
  const chosenIdx = new Set();
  while (chosenIdx.size < count) {
    chosenIdx.add(Math.floor(Math.random() * buckets.length));
  }
  for (const idx of chosenIdx) {
    const [pos, neg] = buckets[idx];
    // Slightly bias towards positive for realism
    const pickNeg = Math.random() < 0.35;
    parts.push(pickNeg ? pick(neg) : pick(pos));
  }
  // Join into 1–2 sentences
  const opening = maybe(0.4, pick(openings) + ' ');
  const body = parts.join(', ') + '.';
  // Sometimes add a second sentence reinforcing sentiment
  const tail = maybe(0.25, ' ' + pick([
    'Kısaca, beklentimi karşıladı.',
    'Özetle, günlük kullanım için yeterli.',
    'Genel tablo olumlu.',
    'Bazı eksileri olsa da iş görüyor.'
  ]));
  // Capitalize first char
  const text = (opening + body + tail).replace(/^([a-zğüşıöç])/u, (m) => m.toUpperCase());
  return text;
}

function injectNegationExamples(list) {
  // Add a few explicit negation-safe examples mentioned by user
  const examples = [
    'Depolama 128GB bana yetti, iCloud ile ilgili hiçbir sorunum yok.',
    'Batarya çabuk bitmiyor, bana bir gün rahatlıkla yetiyor.'
  ];
  for (const e of examples) list.push({ text: e });
}

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const outPath = path.join(__dirname, '..', 'data', 'sample_reviews_large.json');

  const N = 1000;
  const out = [];
  for (let i = 0; i < N - 2; i++) {
    out.push({ text: sentenceFromPools() });
  }
  injectNegationExamples(out);

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), { encoding: 'utf-8' });
  console.log(`Wrote ${out.length} reviews to ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
